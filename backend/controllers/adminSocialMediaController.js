// backend/controllers/adminSocialMediaController.js
const db = require('../config/db');
const fs = require('fs');
const path = require('path');
const { extractTop10Austria } = require('../services/statisticsParsingService');
const { executePrompt } = require('../services/aiService');


exports.generateSocialMediaPost = async (req, res) => {
    const { country, year, month, aiModel = 'OpenAI GPT-4o' } = req.body;

    if (!country || !year || !month) {
        return res.status(400).json({ message: "Land, Jahr und Monat sind erforderlich." });
    }

    try {
        // 1. Suche die Archiv-Datei für diesen Monat in der Datenbank
        // Da wir nur 1 Pfad brauchen, reicht irgendein Eintrag dieses Monats
        const timePeriod = `${year}-${String(month).padStart(2, '0')}-01`; // Erster Tag des Monats (z.B. 2026-03-01)
        
        const fileQuery = await db.query(
            `SELECT archive_path FROM economic_statistics 
             WHERE country_code = $1 AND time_period >= $2 AND time_period < $2::date + interval '1 month'
             AND archive_path IS NOT NULL LIMIT 1`,
            [country, timePeriod]
        );

        if (fileQuery.rows.length === 0) {
            return res.status(404).json({ message: `Keine Rohdaten für ${country} im Zeitraum ${year}-${month} gefunden.` });
        }

        const s3Key = fileQuery.rows[0].archive_path;
        
        // 2. Extrahiere die Top 10 On-Demand aus dem S3-Speicher
        let topData = {};
        const monthNames = ["Jänner", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
        
        if (country === 'AT') {
            topData = await extractTop10Austria(s3Key, monthNames[month - 1]);
        } else if (country === 'DE') {
            // HIER KOMMT SPÄTER DIE KBA-LOGIK REIN
            return res.status(501).json({ message: "DE KBA Parsing ist noch nicht implementiert." });
        }

        // 3. Hole den Prompt aus den ai_prompt_rules
        const promptQuery = await db.query(`SELECT prompt_template FROM ai_prompt_rules WHERE name = 'LinkedIn KFZ Statistik' LIMIT 1`);
        let promptTemplate = "";

        if (promptQuery.rows.length > 0) {
            promptTemplate = promptQuery.rows[0].prompt_template;
        } else {
            // Fallback, falls die Regel in der DB noch fehlt
            promptTemplate = `Erstelle einen motivierenden, professionellen LinkedIn-Post (ca. 150 Wörter) über die aktuellen KFZ-Neuzulassungen im Markt {{COUNTRY}} (Zeitraum: {{MONTH}} {{YEAR}}). \n\nHier sind die Daten der Top-Marken: \n{{TOP_DATA}}\n\nHebe den Gewinner hervor, erwähne den stärksten Aufsteiger in Prozent und baue ein paar passende Emojis sowie Hashtags (#Automotive #Mobility) ein.`;
        }

        // 4. Platzhalter ersetzen
        const dataString = JSON.stringify(topData, null, 2);
        let finalPrompt = promptTemplate
            .replace(/{{COUNTRY}}/g, country === 'AT' ? 'Österreich' : 'Deutschland')
            .replace(/{{MONTH}}/g, monthNames[month - 1])
            .replace(/{{YEAR}}/g, year)
            .replace(/{{TOP_DATA}}/g, dataString);

        // 5. KI-Service aufrufen
        console.log(`[SocialMedia] Generiere KI-Text mit Modell: ${aiModel}...`);
        const aiResponse = await executePrompt(aiModel, finalPrompt);

        // 6. Alles ans Frontend senden
        res.status(200).json({
            text: aiResponse.content,
            parsedData: topData, // Das Frontend nutzt das für die React-Grafik!
            usage: aiResponse.usage
        });

    } catch (error) {
        console.error("Fehler bei der Social Media Generierung:", error);
        res.status(500).json({ message: "Fehler beim Erstellen des Posts." });
    }
};


// ---------------------------------------------------------
// GALERIE, SPEICHERN & LÖSCHEN
// ---------------------------------------------------------

// Hilfsfunktion für schöne Dateigrößen
const formatSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B';
    else if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    else return (bytes / 1048576).toFixed(2) + ' MB';
};

exports.getGalleryFiles = async (req, res) => {
    try {
        const logosPath = path.join(__dirname, '..', 'public', 'logos');
        const socialMediaPath = path.join(__dirname, '..', 'public', 'social-media');
        const grafikenPath = path.join(__dirname, '..', 'public', 'grafiken');

        if (!fs.existsSync(logosPath)) fs.mkdirSync(logosPath, { recursive: true });
        if (!fs.existsSync(socialMediaPath)) fs.mkdirSync(socialMediaPath, { recursive: true });
        if (!fs.existsSync(grafikenPath)) fs.mkdirSync(grafikenPath, { recursive: true });

        // Zentrale Auslese-Logik inkl. Dateigröße und Format
        const getFilesData = (dir, defaultType, apiUrlPrefix) => {
            if (!fs.existsSync(dir)) return [];
            return fs.readdirSync(dir).filter(file => {
                const ext = path.extname(file).toLowerCase();
                return ['.png', '.jpg', '.jpeg', '.svg', '.gif', '.webp'].includes(ext);
            }).map(file => {
                const stats = fs.statSync(path.join(dir, file));
                const ext = path.extname(file).replace('.', '').toUpperCase();
                
                let type = defaultType;
                // Spezielle Erkennung für den Social-Media Ordner
                if (dir.includes('social-media')) {
                    type = (file.startsWith('post-') || file.includes('_Statistik_') || file.includes('KBA_')) ? 'Post' : 'Hintergrund';
                }

                return {
                    id: `${apiUrlPrefix}-${file}`,
                    name: file,
                    type: type,
                    url: `/api/${apiUrlPrefix}/${file}`,
                    date: stats.mtime.toLocaleDateString('de-DE'),
                    size: formatSize(stats.size), // NEU: Dateigröße
                    format: ext                   // NEU: Dateiformat
                };
            });
        };

        const logos = getFilesData(logosPath, 'Logo', 'logos');
        const grafiken = getFilesData(grafikenPath, 'Hintergrund', 'grafiken');
        const socialMedia = getFilesData(socialMediaPath, 'Post', 'social-media');

        res.json({ logos, socialMedia, grafiken });
    } catch (error) {
        console.error('Fehler beim Auslesen der Galerie:', error);
        res.status(500).json({ message: 'Fehler beim Laden der Galerie-Dateien.' });
    }
};

exports.saveGeneratedImage = async (req, res) => {
    try {
        const { imageBase64, filename } = req.body;
        if (!imageBase64 || !filename) {
            return res.status(400).json({ message: "Bilddaten oder Dateiname fehlen." });
        }

        const socialMediaPath = path.join(__dirname, '..', 'public', 'social-media');
        if (!fs.existsSync(socialMediaPath)) fs.mkdirSync(socialMediaPath, { recursive: true });

        const base64Data = imageBase64.replace(/^data:image\/png;base64,/, "");
        const buffer = Buffer.from(base64Data, 'base64');
        const filePath = path.join(socialMediaPath, filename);

        fs.writeFileSync(filePath, buffer);

        res.status(200).json({ message: "Bild erfolgreich gespeichert", url: `/api/social-media/${filename}` });
    } catch (error) {
        console.error('Fehler beim Speichern des Bildes:', error);
        res.status(500).json({ message: 'Fehler beim Speichern der Bilddatei.' });
    }
};

exports.deleteGalleryFile = async (req, res) => {
    try {
        const { folder, filename } = req.query;
        const allowedFolders = ['logos', 'social-media', 'grafiken'];

        if (!allowedFolders.includes(folder)) return res.status(400).json({ message: "Ungültiger Ordner." });
        if (!filename || filename.includes('..') || filename.includes('/')) return res.status(400).json({ message: "Ungültiger Dateiname." });

        const filePath = path.join(__dirname, '..', 'public', folder, filename);

        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            res.status(200).json({ message: "Datei erfolgreich gelöscht." });
        } else {
            res.status(404).json({ message: "Datei nicht gefunden." });
        }
    } catch (error) {
        console.error('Fehler beim Löschen:', error);
        res.status(500).json({ message: "Interner Fehler beim Löschen." });
    }
};