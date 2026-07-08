// backend/controllers/adminSocialMediaController.js
const db = require('../config/db');
const fs = require('fs');
const path = require('path');
const { extractTop10Austria } = require('../services/statisticsParsingService');
const { executePrompt } = require('../services/aiService');

const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.svg', '.gif', '.webp'];

const monthNames = [
    'Jänner',
    'Februar',
    'März',
    'April',
    'Mai',
    'Juni',
    'Juli',
    'August',
    'September',
    'Oktober',
    'November',
    'Dezember',
];

const formatSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(2)} MB`;
};

const parseYearMonth = (year, month) => {
    const parsedYear = Number.parseInt(String(year), 10);
    const parsedMonth = Number.parseInt(String(month), 10);

    if (!Number.isInteger(parsedYear) || parsedYear < 2000 || parsedYear > 2100) {
        return { error: 'Ungültiges Jahr.' };
    }

    if (!Number.isInteger(parsedMonth) || parsedMonth < 1 || parsedMonth > 12) {
        return { error: 'Ungültiger Monat.' };
    }

    return { year: parsedYear, month: parsedMonth };
};

const getArchiveFileName = (archivePath) => {
    if (!archivePath) return '';
    return path.basename(String(archivePath));
};

const sanitizeFileName = (filename) => {
    const clean = String(filename || '').trim();
    if (!clean || clean.includes('..') || clean.includes('/') || clean.includes('\\')) return null;
    if (!/^[a-zA-Z0-9äöüÄÖÜß._ -]+\.png$/i.test(clean)) return null;
    return clean.replace(/\s+/g, '_');
};

const getPublicDir = (folder) => path.join(__dirname, '..', 'public', folder);

const getFilesData = (dir, defaultType, apiUrlPrefix) => {
    if (!fs.existsSync(dir)) return [];

    return fs.readdirSync(dir)
        .filter((file) => IMAGE_EXTENSIONS.includes(path.extname(file).toLowerCase()))
        .map((file) => {
            const filePath = path.join(dir, file);
            const stats = fs.statSync(filePath);
            const ext = path.extname(file).replace('.', '').toUpperCase();

            let type = defaultType;
            if (dir.includes('social-media')) {
                type = (file.startsWith('post-') || file.includes('_Statistik_') || file.includes('KBA_')) ? 'Post' : 'Hintergrund';
            }

            return {
                id: `${apiUrlPrefix}-${file}`,
                name: file,
                type,
                url: `/api/${apiUrlPrefix}/${encodeURIComponent(file)}?v=${Math.round(stats.mtimeMs)}`,
                rawUrl: `/api/${apiUrlPrefix}/${encodeURIComponent(file)}`,
                date: stats.mtime.toLocaleDateString('de-DE'),
                dateTime: stats.mtime.toLocaleString('de-DE', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                }),
                mtimeMs: stats.mtimeMs,
                size: formatSize(stats.size),
                format: ext,
            };
        })
        .sort((a, b) => b.mtimeMs - a.mtimeMs || a.name.localeCompare(b.name, 'de'));
};

exports.getArchiveFiles = async (_req, res) => {
    try {
        const { rows } = await db.query(`
            WITH archive_files AS (
                SELECT
                    country_code,
                    EXTRACT(YEAR FROM time_period)::int AS year,
                    EXTRACT(MONTH FROM time_period)::int AS month,
                    MAX(time_period)::date AS time_period,
                    archive_path,
                    MAX(source_name) AS source_name,
                    MAX(source_url) AS source_url,
                    MAX(last_updated) AS last_updated,
                    COUNT(*)::int AS row_count
                FROM economic_statistics
                WHERE archive_path IS NOT NULL
                  AND statistic_type = 'fleet_statistics'
                GROUP BY
                    country_code,
                    EXTRACT(YEAR FROM time_period)::int,
                    EXTRACT(MONTH FROM time_period)::int,
                    archive_path
            )
            SELECT *
            FROM archive_files
            ORDER BY time_period DESC, country_code ASC, last_updated DESC
        `);

        const items = rows.map((row) => ({
            country_code: row.country_code,
            country: row.country_code,
            year: Number(row.year),
            month: Number(row.month),
            month_label: monthNames[Number(row.month) - 1] || String(row.month),
            time_period: row.time_period,
            archive_path: row.archive_path,
            fileName: getArchiveFileName(row.archive_path),
            source_name: row.source_name,
            source_url: row.source_url,
            sourceDownloadUrl: row.source_url,
            last_updated: row.last_updated,
            row_count: Number(row.row_count || 0),
            parser_status: row.country_code === 'DE' ? 'pending' : 'ready',
            parser_note: row.country_code === 'DE' ? 'KBA-DE-Parsing ist im Generator noch nicht implementiert.' : null,
        }));

        res.json({ items });
    } catch (error) {
        console.error('Fehler beim Laden der Social-Media-Archivdateien:', error);
        res.status(500).json({ message: 'Fehler beim Laden der Archivdateien.' });
    }
};

exports.generateSocialMediaPost = async (req, res) => {
    const { country, year, month, aiModel = 'OpenAI GPT-4o' } = req.body;
    const parsed = parseYearMonth(year, month);

    if (!country || parsed.error) {
        return res.status(400).json({ message: parsed.error || 'Land, Jahr und Monat sind erforderlich.' });
    }

    try {
        const fileQuery = await db.query(
            `SELECT archive_path, source_url, source_name, time_period, last_updated
             FROM economic_statistics
             WHERE country_code = $1
               AND statistic_type = 'fleet_statistics'
               AND time_period >= make_date($2::int, $3::int, 1)
               AND time_period < make_date($2::int, $3::int, 1) + interval '1 month'
               AND archive_path IS NOT NULL
             ORDER BY last_updated DESC
             LIMIT 1`,
            [country, parsed.year, parsed.month]
        );

        if (fileQuery.rows.length === 0) {
            return res.status(404).json({ message: `Keine Rohdaten für ${country} im Zeitraum ${parsed.year}-${String(parsed.month).padStart(2, '0')} gefunden.` });
        }

        const archiveFile = fileQuery.rows[0];
        const s3Key = archiveFile.archive_path;

        let topData = {};

        if (country === 'AT') {
            topData = await extractTop10Austria(s3Key, monthNames[parsed.month - 1]);
        } else if (country === 'DE') {
            return res.status(501).json({ message: 'DE KBA Parsing ist noch nicht implementiert.' });
        } else {
            return res.status(400).json({ message: `Land ${country} wird aktuell nicht unterstützt.` });
        }

        const promptQuery = await db.query(`SELECT prompt_template FROM ai_prompt_rules WHERE name = 'LinkedIn KFZ Statistik' LIMIT 1`);
        const promptTemplate = promptQuery.rows.length > 0
            ? promptQuery.rows[0].prompt_template
            : `Erstelle einen motivierenden, professionellen LinkedIn-Post (ca. 150 Wörter) über die aktuellen KFZ-Neuzulassungen im Markt {{COUNTRY}} (Zeitraum: {{MONTH}} {{YEAR}}).

Hier sind die Daten der Top-Marken:
{{TOP_DATA}}

Hebe den Gewinner hervor, erwähne den stärksten Aufsteiger in Prozent und baue ein paar passende Emojis sowie Hashtags (#Automotive #Mobility) ein.`;

        const dataString = JSON.stringify(topData, null, 2);
        const finalPrompt = promptTemplate
            .replace(/{{COUNTRY}}/g, country === 'AT' ? 'Österreich' : 'Deutschland')
            .replace(/{{MONTH}}/g, monthNames[parsed.month - 1])
            .replace(/{{YEAR}}/g, parsed.year)
            .replace(/{{TOP_DATA}}/g, dataString);

        console.log(`[SocialMedia] Generiere KI-Text mit Modell: ${aiModel} für ${country} ${parsed.year}-${String(parsed.month).padStart(2, '0')}...`);
        const aiResponse = await executePrompt(aiModel, finalPrompt);

        res.status(200).json({
            text: aiResponse.content,
            parsedData: topData,
            usage: aiResponse.usage,
            sourceDownloadUrl: archiveFile.source_url || null,
            sourceFileName: getArchiveFileName(archiveFile.archive_path),
            sourceArchivePath: archiveFile.archive_path,
            sourceName: archiveFile.source_name,
            timePeriod: archiveFile.time_period,
            lastUpdated: archiveFile.last_updated,
        });
    } catch (error) {
        console.error('Fehler bei der Social Media Generierung:', error);
        res.status(500).json({ message: 'Fehler beim Erstellen des Posts.' });
    }
};

exports.getGalleryFiles = async (_req, res) => {
    try {
        const logosPath = getPublicDir('logos');
        const socialMediaPath = getPublicDir('social-media');
        const grafikenPath = getPublicDir('grafiken');

        fs.mkdirSync(logosPath, { recursive: true });
        fs.mkdirSync(socialMediaPath, { recursive: true });
        fs.mkdirSync(grafikenPath, { recursive: true });

        res.json({
            logos: getFilesData(logosPath, 'Logo', 'logos'),
            socialMedia: getFilesData(socialMediaPath, 'Post', 'social-media'),
            grafiken: getFilesData(grafikenPath, 'Hintergrund', 'grafiken'),
        });
    } catch (error) {
        console.error('Fehler beim Auslesen der Galerie:', error);
        res.status(500).json({ message: 'Fehler beim Laden der Galerie-Dateien.' });
    }
};

exports.saveGeneratedImage = async (req, res) => {
    try {
        const { imageBase64, filename } = req.body;
        const safeFilename = sanitizeFileName(filename);

        if (!imageBase64 || !safeFilename) {
            return res.status(400).json({ message: 'Bilddaten oder gültiger PNG-Dateiname fehlen.' });
        }

        const socialMediaPath = getPublicDir('social-media');
        fs.mkdirSync(socialMediaPath, { recursive: true });

        const base64Data = String(imageBase64).replace(/^data:image\/png;base64,/, '');
        const buffer = Buffer.from(base64Data, 'base64');
        const filePath = path.join(socialMediaPath, safeFilename);

        fs.writeFileSync(filePath, buffer);

        res.status(200).json({
            message: 'Bild erfolgreich gespeichert',
            url: `/api/social-media/${encodeURIComponent(safeFilename)}?v=${Date.now()}`,
            rawUrl: `/api/social-media/${encodeURIComponent(safeFilename)}`,
        });
    } catch (error) {
        console.error('Fehler beim Speichern des Bildes:', error);
        res.status(500).json({ message: 'Fehler beim Speichern der Bilddatei.' });
    }
};

exports.deleteGalleryFile = async (req, res) => {
    try {
        const { folder, filename } = req.query;
        const allowedFolders = ['logos', 'social-media', 'grafiken'];

        if (!allowedFolders.includes(folder)) return res.status(400).json({ message: 'Ungültiger Ordner.' });
        if (!filename || String(filename).includes('..') || String(filename).includes('/') || String(filename).includes('\\')) {
            return res.status(400).json({ message: 'Ungültiger Dateiname.' });
        }

        const filePath = path.join(getPublicDir(folder), String(filename));

        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            res.status(200).json({ message: 'Datei erfolgreich gelöscht.' });
        } else {
            res.status(404).json({ message: 'Datei nicht gefunden.' });
        }
    } catch (error) {
        console.error('Fehler beim Löschen:', error);
        res.status(500).json({ message: 'Interner Fehler beim Löschen.' });
    }
};
