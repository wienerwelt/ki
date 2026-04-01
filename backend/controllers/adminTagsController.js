// backend/controllers/adminTagsController.js
const db = require('../config/db');
const { v4: uuidv4 } = require('uuid');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const isValidUUID = (uuid) => uuid && /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(uuid);

// Hilfsfunktion: Macht aus "Alfa Romeo!" -> "alfa-romeo"
const slugify = (text) => {
    return text.toString().toLowerCase().trim()
        .replace(/[\s_]+/g, '-')       // Leerzeichen durch Bindestriche
        .replace(/[^\w\-]+/g, '')      // Sonderzeichen löschen
        .replace(/\-\-+/g, '-');       // Mehrfache Bindestriche verhindern
};

// Hilfsfunktion: Bildverarbeitung (angepasst für SVG & PNG)
const processAndSaveLogo = async (fileBuffer, mimetype, tagName) => {
    const slug = slugify(tagName);
    const uploadPath = path.join(__dirname, '..', 'public', 'logos');
    
    // Ordner erstellen, falls er nicht existiert
    if (!fs.existsSync(uploadPath)) {
        fs.mkdirSync(uploadPath, { recursive: true });
    }

    // FALL 1: Es ist ein SVG! Wir speichern die Vektorgrafik exakt so, wie sie ist.
    if (mimetype === 'image/svg+xml') {
        const fileName = `${slug}.svg`;
        const filePath = path.join(uploadPath, fileName);
        fs.writeFileSync(filePath, fileBuffer);
        return `/logos/${fileName}`;
    }

    // FALL 2: Es ist ein JPG, WebP, GIF etc. -> Wir machen ein normiertes PNG daraus!
    const fileName = `${slug}.png`;
    const filePath = path.join(uploadPath, fileName);

    await sharp(fileBuffer)
        .resize({ height: 50, withoutEnlargement: true }) // Symmetrisch auf max. 50px Höhe
        .png({ compressionLevel: 9, adaptiveFiltering: true }) // Transparenz erhalten
        .toFile(filePath);

    return `/logos/${fileName}`; 
};

exports.getAllTags = async (req, res) => {
    try {
        const query = `
            SELECT 
                t.id, 
                t.name, 
                t.description,
                t.category_id,
                t.logo_url,
                c.name AS category_name,
                (
                    COALESCE((SELECT COUNT(*) FROM scraped_content_tags sct WHERE sct.tag_id = t.id), 0) +
                    COALESCE((SELECT COUNT(*) FROM ai_generated_content_tags aict WHERE aict.tag_id = t.id), 0) +
                    COALESCE((SELECT COUNT(*) FROM traffic_incidents_tags tit WHERE tit.tag_id = t.id), 0)
                )::INTEGER AS usage_count
            FROM tags t
            LEFT JOIN categories c ON t.category_id = c.id
            GROUP BY t.id, t.name, t.description, t.category_id, t.logo_url, c.name
            ORDER BY t.name ASC;
        `;
        const result = await db.query(query);
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching tags with usage count:', err.message);
        res.status(500).send('Server error');
    }
};

exports.createTag = async (req, res) => {
    const { name, description, category_id } = req.body;
    if (!name) return res.status(400).json({ message: 'Name is required.' });
    
    let logoUrl = null;
    try {
        // Falls ein Bild mitgeschickt wurde, verarbeiten und URL generieren
        if (req.file) {
            logoUrl = await processAndSaveLogo(req.file.buffer, req.file.mimetype, name);
        }

        const newTag = await db.query(
            'INSERT INTO tags (id, name, description, category_id, logo_url) VALUES ($1, $2, $3, $4, $5) RETURNING *',
            [uuidv4(), name, description || null, category_id || null, logoUrl]
        );
        res.status(201).json(newTag.rows[0]);
    } catch (err) {
        console.error('Error creating tag:', err.message);
        if (err.code === '23505') return res.status(409).json({ message: 'Ein Tag mit diesem Namen existiert bereits.' });
        res.status(500).send('Server error');
    }
};

exports.updateTag = async (req, res) => {
    const { id } = req.params;
    if (!isValidUUID(id)) return res.status(400).json({ message: 'Invalid ID format.' });
    
    const { name, description, category_id } = req.body;
    if (!name) return res.status(400).json({ message: 'Name is required.' });
    
    try {
        let updateQuery = 'UPDATE tags SET name = $1, description = $2, category_id = $3, updated_at = CURRENT_TIMESTAMP';
        const values = [name, description || null, category_id || null];
        
        // 1. Fall: Ein neues Bild wurde hochgeladen
        if (req.file) {
            const logoUrl = await processAndSaveLogo(req.file.buffer, req.file.mimetype, name);
            updateQuery += ', logo_url = $4';
            values.push(logoUrl);
            values.push(id); // ID wandert an Stelle 5
            updateQuery += ' WHERE id = $5 RETURNING *';
        } 
        // 2. Fall: Das Bild soll gelöscht werden (Befehl vom Frontend)
        else if (req.body.delete_logo === 'true') {
            updateQuery += ', logo_url = NULL';
            values.push(id); // ID wandert an Stelle 4
            updateQuery += ' WHERE id = $4 RETURNING *';
        } 
        // 3. Fall: Keine Änderung am Logo
        else {
            values.push(id); // ID wandert an Stelle 4
            updateQuery += ' WHERE id = $4 RETURNING *';
        }

        const updatedTag = await db.query(updateQuery, values);
        if (updatedTag.rows.length === 0) return res.status(404).json({ message: 'Tag not found.' });
        res.json(updatedTag.rows[0]);
    } catch (err) {
        console.error('Error updating tag:', err.message);
        if (err.code === '23505') return res.status(409).json({ message: 'Ein Tag mit diesem Namen existiert bereits.' });
        res.status(500).send('Server error');
    }
};

exports.deleteTag = async (req, res) => {
    const { id } = req.params;
    if (!isValidUUID(id)) return res.status(400).json({ message: 'Invalid ID format.' });
    try {
        // Wir löschen nur den Datenbank-Eintrag. Das physische Logo lassen wir 
        // auf der Festplatte liegen, falls es versehentlich gelöscht wurde oder 
        // noch an anderer Stelle im System (z.B. alten Berichten) referenziert wird.
        const deletedTag = await db.query(
            'DELETE FROM tags WHERE id = $1 RETURNING *',
            [id]
        );
        if (deletedTag.rows.length === 0) return res.status(404).json({ message: 'Tag not found.' });
        res.json(deletedTag.rows[0]);
    } catch (err) {
        console.error('Error deleting tag:', err.message);
        res.status(500).send('Server error');
    }
};