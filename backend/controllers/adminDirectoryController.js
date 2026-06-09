const db = require('../config/db');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const isValidUUID = (uuid) => uuid && /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(uuid);

// Hilfsfunktion: Domain/Namen für den Dateinamen säubern
const extractName = (nameStr) => {
    try {
        return nameStr.toLowerCase().replace(/[^a-z0-9]/g, '-').substring(0, 30);
    } catch (e) {
        return 'provider';
    }
};

// Hilfsfunktion: WebP Bildverarbeitung für Dienstleister-Logos
// Hilfsfunktion: Bildverarbeitung (angepasst für SVG & Rastergrafiken)
const processAndSaveProviderLogo = async (fileBuffer, mimetype, providerName) => {
    const slug = extractName(providerName) + '-' + Date.now().toString().slice(-4);
    const uploadPath = path.join(__dirname, '..', 'public', 'directory_logos');
    
    if (!fs.existsSync(uploadPath)) {
        fs.mkdirSync(uploadPath, { recursive: true });
    }

    // FALL 1: Es ist ein SVG (Wichtig, da Firmenlogos oft Vektoren sind!)
    if (String(mimetype || '').toLowerCase().includes('svg')) {
        const fileName = `${slug}.svg`;
        const filePath = path.join(uploadPath, fileName);
        fs.writeFileSync(filePath, fileBuffer);
        return `/directory_logos/${fileName}`;
    }

    // FALL 2: Rastergrafik -> Wir normieren auf WebP (sehr effizient) mit max 100px Höhe
    const fileName = `${slug}.webp`;
    const filePath = path.join(uploadPath, fileName);

    await sharp(fileBuffer)
        .resize({ height: 100, withoutEnlargement: true }) 
        .webp({ quality: 80, alphaQuality: 100 }) // alphaQuality: 100 erhält Transparenzen gut
        .toFile(filePath);

    return `/directory_logos/${fileName}`; 
};

// NEUE HILFSFUNKTION: Physisches Löschen von alten Logos von der Festplatte/Volume
const deletePhysicalLogo = (logoUrl) => {
    if (!logoUrl) return;
    try {
        // logoUrl sieht z.B. so aus: "/directory_logos/firma-1234.webp"
        const fullPath = path.join(__dirname, '..', 'public', logoUrl);
        if (fs.existsSync(fullPath)) {
            fs.unlinkSync(fullPath);
            console.log(`[Logo-Cleanup] Alte Logo-Datei restlos gelöscht: ${logoUrl}`);
        }
    } catch (err) {
        console.error(`[Logo-Cleanup] Konnte alte Datei nicht löschen:`, err.message);
    }
};

// @desc    Alle Dienstleister abrufen (Listenansicht)
exports.getAllProvidersAdmin = async (req, res) => {
    try {
        const query = `
            SELECT 
                dp.id,
                dp.name,
                dp.logo_url,
                dp.is_public,
                dp.subscription_tier,
                dp.created_at,
                dp.updated_at,
                -- Mandanten aggregieren
                COALESCE(
                    json_agg(DISTINCT jsonb_build_object(
                        'business_partner_id', dpm.business_partner_id,
                        'status', dpm.status,
                        'is_recommended', dpm.is_recommended
                    )) FILTER (WHERE dpm.business_partner_id IS NOT NULL), '[]'
                ) as mandant_settings,
                -- Kategorien aggregieren (NEU HINZUGEFÜGT)
                COALESCE(
                    json_agg(DISTINCT jsonb_build_object(
                        'category_id', dpc.category_id,
                        'is_primary', dpc.is_primary
                    )) FILTER (WHERE dpc.category_id IS NOT NULL), '[]'
                ) as categories
            FROM directory_providers dp
            LEFT JOIN directory_provider_mandant_settings dpm ON dp.id = dpm.provider_id
            LEFT JOIN directory_provider_categories dpc ON dp.id = dpc.provider_id
            GROUP BY dp.id
            ORDER BY dp.created_at DESC
        `;
        const result = await db.query(query);
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching providers for admin:', err.message);
        res.status(500).json({ message: 'Datenbankfehler beim Laden der Liste: ' + err.message });
    }
};

// @desc    Details eines Dienstleisters inkl. aller Relationen abrufen
exports.getProviderDetailsAdmin = async (req, res) => {
    const { id } = req.params;
    
    // Sicherheits-Check: Wenn das Frontend aus Versehen "undefined" schickt
    if (!isValidUUID(id)) {
        console.warn(`[Directory] Warnung: Aufruf mit ungültiger UUID: ${id}`);
        return res.status(400).json({ message: `Die angefragte ID ist ungültig: ${id}` });
    }

    try {
        const providerRes = await db.query('SELECT * FROM directory_providers WHERE id = $1', [id]);
        if (providerRes.rows.length === 0) return res.status(404).json({ message: 'Dienstleister nicht gefunden.' });
        
        const provider = providerRes.rows[0];

        // Relationen abrufen
        const [locationsRes, categoriesRes, tagsRes, mandantRes] = await Promise.all([
            db.query('SELECT * FROM directory_provider_locations WHERE provider_id = $1', [id]),
            db.query('SELECT category_id, is_primary FROM directory_provider_categories WHERE provider_id = $1', [id]),
            db.query('SELECT tag_id FROM directory_provider_tags WHERE provider_id = $1', [id]),
            db.query('SELECT business_partner_id, status, is_recommended FROM directory_provider_mandant_settings WHERE provider_id = $1', [id])
        ]);

        provider.locations = locationsRes.rows;
        provider.categories = categoriesRes.rows;
        provider.tags = tagsRes.rows.map(t => t.tag_id);
        provider.mandant_settings = mandantRes.rows;

        res.json(provider);
    } catch (err) {
        console.error('Error fetching provider details:', err.message);
        // WICHTIG: Echte Fehlermeldung ans Frontend leiten, damit du siehst, ob Tabellen fehlen!
        res.status(500).json({ message: 'DB-Fehler beim Laden der Details: ' + err.message });
    }
};

// @desc    Neuen Dienstleister anlegen (inkl. Relationen)
exports.createProviderAdmin = async (req, res) => {
    if (req.user.role === 'demo') return res.status(403).json({ message: 'Demo-Benutzer dürfen keine Einträge erstellen.' });

    const client = await db.connect();
    try {
        await client.query('BEGIN');

        const { name, description, website_url, contact_email, contact_phone, is_public, subscription_tier } = req.body;
        
        const locations = req.body.locations ? JSON.parse(req.body.locations) : [];
        const categories = req.body.categories ? JSON.parse(req.body.categories) : [];
        const tags = req.body.tags ? JSON.parse(req.body.tags) : [];
        const mandantSettings = req.body.mandant_settings ? JSON.parse(req.body.mandant_settings) : [];

        let logoUrl = null;
if (req.file) {
    logoUrl = await processAndSaveProviderLogo(
        req.file.buffer,
        req.file.mimetype,
        name || 'provider'
    );
}

        const providerQuery = `
            INSERT INTO directory_providers 
            (name, description, logo_url, website_url, contact_email, contact_phone, is_public, subscription_tier) 
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id
        `;
        const providerRes = await client.query(providerQuery, [
            name, description || null, logoUrl, website_url || null, contact_email || null, contact_phone || null, 
            is_public === 'true' || is_public === true, 
            subscription_tier || 'free'
        ]);
        const providerId = providerRes.rows[0].id;

        for (const loc of locations) {
            await client.query(
                `INSERT INTO directory_provider_locations (provider_id, address, zip_code, city, country, google_place_id, latitude, longitude, is_headquarter)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
                [providerId, loc.address || null, loc.zip_code || null, loc.city || null, loc.country || null, loc.google_place_id || null, loc.latitude || null, loc.longitude || null, loc.is_headquarter || false]
            );
        }

        for (const cat of categories) {
            await client.query(
                `INSERT INTO directory_provider_categories (provider_id, category_id, is_primary) VALUES ($1, $2, $3)`,
                [providerId, cat.category_id, cat.is_primary || false]
            );
        }

        for (const tagId of tags) {
            await client.query(`INSERT INTO directory_provider_tags (provider_id, tag_id) VALUES ($1, $2)`, [providerId, tagId]);
        }

        for (const ms of mandantSettings) {
            await client.query(
                `INSERT INTO directory_provider_mandant_settings (provider_id, business_partner_id, status, is_recommended) VALUES ($1, $2, $3, $4)`,
                [providerId, ms.business_partner_id, ms.status || 'active', ms.is_recommended || false]
            );
        }

        await client.query('COMMIT');
        res.status(201).json({ message: 'Provider created successfully', id: providerId });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error creating provider:', err.message);
        if (err.code === '23505') return res.status(409).json({ message: 'Ein Dienstleister mit diesem Namen existiert bereits.' });
        res.status(500).json({ message: 'Fehler beim Anlegen: ' + err.message });
    } finally {
        client.release();
    }
};

// @desc    Dienstleister aktualisieren (inkl. Relationen) und altes Logo entfernen
exports.updateProviderAdmin = async (req, res) => {
    if (req.user.role === 'demo') return res.status(403).json({ message: 'Demo-Benutzer dürfen keine Einträge bearbeiten.' });

    const { id } = req.params;
    if (!isValidUUID(id)) return res.status(400).json({ message: 'Invalid ID format.' });

    const client = await db.connect();
    let oldLogoUrl = null;

    try {
        await client.query('BEGIN');

        const { name, description, website_url, contact_email, contact_phone, is_public, subscription_tier, delete_logo } = req.body;
        
        // Wir merken uns das alte Logo VOR dem Update, um es später physisch zu löschen
        if (req.file || delete_logo === 'true') {
            const oldProviderRes = await client.query('SELECT logo_url FROM directory_providers WHERE id = $1', [id]);
            if (oldProviderRes.rows.length > 0) {
                oldLogoUrl = oldProviderRes.rows[0].logo_url;
            }
        }

        const locations = req.body.locations ? JSON.parse(req.body.locations) : [];
        const categories = req.body.categories ? JSON.parse(req.body.categories) : [];
        const tags = req.body.tags ? JSON.parse(req.body.tags) : [];
        const mandantSettings = req.body.mandant_settings ? JSON.parse(req.body.mandant_settings) : [];

        let updateQuery = `
            UPDATE directory_providers 
            SET name = $1, description = $2, website_url = $3, contact_email = $4, contact_phone = $5, is_public = $6, subscription_tier = $7, updated_at = CURRENT_TIMESTAMP
        `;
        let values = [
            name, description || null, website_url || null, contact_email || null, contact_phone || null, 
            is_public === 'true' || is_public === true, subscription_tier || 'free'
        ];
        let paramIndex = 8;
        let newLogoUrl = oldLogoUrl;

if (req.file) {
    newLogoUrl = await processAndSaveProviderLogo(
        req.file.buffer,
        req.file.mimetype,
        name || 'provider'
    );

    updateQuery += `, logo_url = $${paramIndex}`;
    values.push(newLogoUrl);
    paramIndex++;
} else if (delete_logo === 'true') {
            newLogoUrl = null;
            updateQuery += `, logo_url = NULL`;
        }

        values.push(id);
        updateQuery += ` WHERE id = $${paramIndex} RETURNING id`;

        const updateRes = await client.query(updateQuery, values);
        if (updateRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ message: 'Provider not found.' });
        }

        // Relationen überschreiben
        await client.query('DELETE FROM directory_provider_locations WHERE provider_id = $1', [id]);
        for (const loc of locations) {
            await client.query(
                `INSERT INTO directory_provider_locations (provider_id, address, zip_code, city, country, google_place_id, latitude, longitude, is_headquarter)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
                [id, loc.address || null, loc.zip_code || null, loc.city || null, loc.country || null, loc.google_place_id || null, loc.latitude || null, loc.longitude || null, loc.is_headquarter || false]
            );
        }

        await client.query('DELETE FROM directory_provider_categories WHERE provider_id = $1', [id]);
        for (const cat of categories) {
            await client.query(
                `INSERT INTO directory_provider_categories (provider_id, category_id, is_primary) VALUES ($1, $2, $3)`,
                [id, cat.category_id, cat.is_primary || false]
            );
        }

        await client.query('DELETE FROM directory_provider_tags WHERE provider_id = $1', [id]);
        for (const tagId of tags) {
            await client.query(`INSERT INTO directory_provider_tags (provider_id, tag_id) VALUES ($1, $2)`, [id, tagId]);
        }

        await client.query('DELETE FROM directory_provider_mandant_settings WHERE provider_id = $1', [id]);
        for (const ms of mandantSettings) {
            await client.query(
                `INSERT INTO directory_provider_mandant_settings (provider_id, business_partner_id, status, is_recommended) VALUES ($1, $2, $3, $4)`,
                [id, ms.business_partner_id, ms.status || 'active', ms.is_recommended || false]
            );
        }

        await client.query('COMMIT');

        // WENN ALLES GEKLAPPT HAT: Altes Logo physisch von der Platte putzen!
        if (oldLogoUrl && oldLogoUrl !== newLogoUrl) {
            deletePhysicalLogo(oldLogoUrl);
        }

        res.json({ message: 'Provider updated successfully' });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error updating provider:', err.message);
        res.status(500).json({ message: 'DB-Fehler beim Speichern: ' + err.message });
    } finally {
        client.release();
    }
};

// @desc    Dienstleister komplett löschen (inklusive Logo)
exports.deleteProviderAdmin = async (req, res) => {
    if (req.user.role === 'demo') return res.status(403).json({ message: 'Demo-Benutzer dürfen nicht löschen.' });
    
    const { id } = req.params;
    if (!isValidUUID(id)) return res.status(400).json({ message: 'Invalid ID format.' });

    try {
        // RETURNING logo_url holt uns den Pfad, damit wir das Bild löschen können
        const result = await db.query('DELETE FROM directory_providers WHERE id = $1 RETURNING id, logo_url', [id]);
        if (result.rows.length === 0) return res.status(404).json({ message: 'Provider not found.' });
        
        // Physisches Bild löschen!
        const deletedLogoUrl = result.rows[0].logo_url;
        if (deletedLogoUrl) {
            deletePhysicalLogo(deletedLogoUrl);
        }
        
        res.json({ message: 'Provider deleted successfully' });
    } catch (err) {
        console.error('Error deleting provider:', err.message);
        res.status(500).json({ message: 'Fehler beim Löschen: ' + err.message });
    }
};


const axios = require('axios');

// @desc    Google Maps Autocomplete Suche (Proxy)
exports.searchAddress = async (req, res) => {
    const { query } = req.query;
    if (!query) return res.status(400).json({ message: 'Suchbegriff fehlt.' });

    // Nimmt deinen bestehenden Key aus der .env
    const apiKey = process.env.GOOGLE_API_KEY || process.env.GOOGLE_MAPS_API_KEY; 

    try {
        const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(query)}&key=${apiKey}&language=de`;
        const response = await axios.get(url);

        if (response.data.status !== 'OK' && response.data.status !== 'ZERO_RESULTS') {
            return res.status(400).json({ message: `Google API Fehler: ${response.data.status}` });
        }

        const results = (response.data.predictions || []).map(p => ({
            place_id: p.place_id,
            description: p.description
        }));
        res.json(results);
    } catch (err) {
        res.status(500).json({ message: 'Server Fehler bei Adresssuche.' });
    }
};

// @desc    Google Maps Place Details (Holt PLZ, Stadt, Lat/Long)
exports.getAddressDetails = async (req, res) => {
    const { placeId } = req.query;
    if (!placeId) return res.status(400).json({ message: 'Place ID fehlt.' });

    const apiKey = process.env.GOOGLE_API_KEY || process.env.GOOGLE_MAPS_API_KEY;

    try {
        const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=address_component,geometry&key=${apiKey}&language=de`;
        const response = await axios.get(url);

        if (response.data.status !== 'OK') {
            return res.status(400).json({ message: `Google API Fehler: ${response.data.status}` });
        }

        const components = response.data.result.address_components || [];
        const geometry = response.data.result.geometry?.location || {};

        let route = '', street_number = '', zip = '', city = '', country = '';

        components.forEach(c => {
            if (c.types.includes('route')) route = c.long_name;
            if (c.types.includes('street_number')) street_number = c.long_name;
            if (c.types.includes('postal_code')) zip = c.long_name;
            if (c.types.includes('locality') || c.types.includes('postal_town')) city = c.long_name;
            if (c.types.includes('country')) country = c.short_name;
        });

        res.json({
            address: `${route} ${street_number}`.trim(),
            zip,
            city,
            country,
            lat: geometry.lat || null,
            lng: geometry.lng || null
        });

    } catch (err) {
        res.status(500).json({ message: 'Server Fehler bei Details.' });
    }
};

// backend/controllers/adminDirectoryController.js (Am Ende einfügen)

// @desc    Geocoding für manuell eingegebene Adressen
exports.geocodeAddress = async (req, res) => {
    const { query } = req.query;
    if (!query) return res.status(400).json({ message: 'Suchbegriff fehlt.' });

    const apiKey = process.env.GOOGLE_API_KEY || process.env.GOOGLE_MAPS_API_KEY;

    try {
        const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(query)}&key=${apiKey}`;
        const axios = require('axios');
        const response = await axios.get(url);

        if (response.data.status !== 'OK' || response.data.results.length === 0) {
            return res.status(404).json({ message: 'Keine Koordinaten gefunden.' });
        }

        const location = response.data.results[0].geometry.location;
        res.json({ lat: location.lat, lng: location.lng });
    } catch (err) {
        console.error("Geocoding API Fehler:", err.message);
        res.status(500).json({ message: 'Server Fehler bei Geocoding.' });
    }
};