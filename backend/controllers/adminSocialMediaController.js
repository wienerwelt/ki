// backend/controllers/adminSocialMediaController.js
const db = require('../config/db');
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const sharp = require('sharp');
const { extractAustriaBrandPeriods } = require('../services/statisticsParsingService');
const { buildSocialMetrics, getPreviousPeriod } = require('../services/socialMediaMetricsService');
const { executePrompt } = require('../services/aiService');

const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.svg', '.gif', '.webp', '.avif'];
const GALLERY_DELIVERY_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif'];

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

const formatRegistrationCount = (value) => Number(value || 0).toLocaleString('de-DE');

const formatPercentValue = (value) => {
    if (!Number.isFinite(value)) return 'n. v.';
    return `${value > 0 ? '+' : ''}${value.toFixed(1).replace('.', ',')} %`;
};

const sanitizeAiIntroduction = (content, topData) => {
    const brandNames = [
        ...(Array.isArray(topData?.topMarken) ? topData.topMarken : []),
        ...(Array.isArray(topData?.topElektro) ? topData.topElektro : []),
    ]
        .map((entry) => String(entry?.name || '').trim().toLocaleLowerCase('de-DE'))
        .filter(Boolean);

    const sentences = String(content || '')
        .replace(/\r/g, ' ')
        .split(/(?<=[.!?])\s+|\n+/)
        .map((sentence) => sentence.trim())
        .filter(Boolean)
        .filter((sentence) => {
            const normalized = sentence.toLocaleLowerCase('de-DE');
            return !/[\d%#]/.test(sentence)
                && !brandNames.some((brandName) => normalized.includes(brandName));
        })
        .slice(0, 2)
        .join(' ')
        .slice(0, 360)
        .trim();

    return sentences || 'Der Automarkt bleibt in Bewegung und zeigt eine klare Verschiebung zwischen etablierten Antrieben und Elektromobilität.';
};

const buildGroundedSocialPost = ({ aiIntroduction, countryName, year, month, metrics }) => {
    const lines = [];

    const comparisonText = (metric) => `${formatPercentValue(metric.changePercent)} ${metric.comparisonLabel}`;
    const yearOverYearText = (metric) => metric.comparisonBasis === 'previous_month' && Number.isFinite(metric.yearOverYearPercent)
        ? `; Vorjahresmonat: ${formatPercentValue(metric.yearOverYearPercent)}`
        : '';

    if (metrics.marketLeader) {
        lines.push(`🏆 Marktführer: ${metrics.marketLeader.name} mit ${formatRegistrationCount(metrics.marketLeader.zulassungen)} Neuzulassungen (${comparisonText(metrics.marketLeader)}${yearOverYearText(metrics.marketLeader)})`);
    }
    if (metrics.topElectricBrand) {
        lines.push(`⚡ Top E-Auto-Marke (nur Elektroantrieb): ${metrics.topElectricBrand.name} mit ${formatRegistrationCount(metrics.topElectricBrand.zulassungen)} Neuzulassungen (${comparisonText(metrics.topElectricBrand)}${yearOverYearText(metrics.topElectricBrand)})`);
    }
    if (metrics.strongestGrowth) {
        lines.push(`📈 Stärkstes Wachstum im Gesamtmarkt*: ${metrics.strongestGrowth.name} mit ${comparisonText(metrics.strongestGrowth)}${yearOverYearText(metrics.strongestGrowth)}`);
    }
    if (metrics.strongestDecline) {
        lines.push(`📉 Stärkster Rückgang im Gesamtmarkt*: ${metrics.strongestDecline.name} mit ${comparisonText(metrics.strongestDecline)}${yearOverYearText(metrics.strongestDecline)}`);
    }

    const comparisonNote = metrics.comparisonBasis === 'previous_month'
        ? 'Die primären Prozentwerte vergleichen mit dem Vormonat; der Vorjahresmonat bleibt als Zusatzvergleich erhalten.'
        : 'Mangels belastbarer Vormonatsdaten vergleichen die Prozentwerte mit dem Vorjahresmonat.';

    return `${aiIntroduction}\n\nDie Kennzahlen für ${countryName}, ${monthNames[month - 1]} ${year}:\n${lines.join('\n')}\n\n${comparisonNote}\n*Auswertung über alle in der Quelle einzeln ausgewiesenen Marken; für Wachstum und Rückgang werden in beiden Monaten jeweils mehr als 100 Neuzulassungen vorausgesetzt. Sammelpositionen und Modellreihen werden ausgeschlossen.\n\n#Automotive #Mobility #Elektromobilität`;
};

const getArchiveFileName = (archivePath) => {
    if (!archivePath) return '';
    return path.basename(String(archivePath));
};

const getArchiveForPeriod = async (country, year, month) => {
    const result = await db.query(
        `SELECT archive_path, source_url, source_name, time_period, last_updated
         FROM economic_statistics
         WHERE country_code = $1
           AND statistic_type = 'fleet_statistics'
           AND time_period >= make_date($2::int, $3::int, 1)
           AND time_period < make_date($2::int, $3::int, 1) + interval '1 month'
           AND archive_path IS NOT NULL
         ORDER BY last_updated DESC
         LIMIT 1`,
        [country, year, month]
    );
    return result.rows[0] || null;
};

const sanitizeFileName = (filename) => {
    const clean = String(filename || '').trim();
    if (!clean || clean.includes('..') || clean.includes('/') || clean.includes('\\')) return null;
    if (!/^[a-zA-Z0-9äöüÄÖÜß._ -]+\.png$/i.test(clean)) return null;
    return clean.replace(/\s+/g, '_');
};

const sanitizeGraphicBaseName = (filename) => {
    const parsedName = path.parse(String(filename || '')).name;
    return parsedName
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9_-]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 80) || 'hintergrund';
};

const getPublicDir = (folder) => path.join(__dirname, '..', 'public', folder);

const resolveGalleryFile = (folder, filename) => {
    const allowedFolders = new Set(['social-media']);
    const normalizedFolder = String(folder || '').trim();
    const normalizedFilename = String(filename || '').trim();

    if (!allowedFolders.has(normalizedFolder)) return { error: 'Ungültiger Ordner.' };
    if (
        !normalizedFilename
        || normalizedFilename !== path.basename(normalizedFilename)
        || normalizedFilename.includes('..')
        || normalizedFilename.includes('/')
        || normalizedFilename.includes('\\')
        || !GALLERY_DELIVERY_EXTENSIONS.includes(path.extname(normalizedFilename).toLowerCase())
    ) {
        return { error: 'Ungültiger Dateiname.' };
    }

    const directory = path.resolve(getPublicDir(normalizedFolder));
    const filePath = path.resolve(directory, normalizedFilename);
    if (path.dirname(filePath) !== directory) return { error: 'Ungültiger Dateipfad.' };

    return { filePath, filename: normalizedFilename };
};

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
        const archiveFile = await getArchiveForPeriod(country, parsed.year, parsed.month);
        if (!archiveFile) {
            return res.status(404).json({ message: `Keine Rohdaten für ${country} im Zeitraum ${parsed.year}-${String(parsed.month).padStart(2, '0')} gefunden.` });
        }

        let fullCurrentData = {};
        let previousData = null;

        if (country === 'AT') {
            const previousPeriod = getPreviousPeriod(parsed.year, parsed.month);
            const previousArchive = await getArchiveForPeriod(country, previousPeriod.year, previousPeriod.month);
            const previousArchivePath = previousArchive?.archive_path
                || (previousPeriod.year === parsed.year ? archiveFile.archive_path : null);
            const periods = [{
                key: 'current',
                s3Key: archiveFile.archive_path,
                monthName: monthNames[parsed.month - 1],
            }];

            if (previousArchivePath) {
                periods.push({
                    key: 'previous',
                    s3Key: previousArchivePath,
                    monthName: monthNames[previousPeriod.month - 1],
                    optional: true,
                });
            }

            const parsedPeriods = await extractAustriaBrandPeriods(periods);
            fullCurrentData = parsedPeriods.current;
            previousData = parsedPeriods.previous || null;
        } else if (country === 'DE') {
            return res.status(501).json({ message: 'DE KBA Parsing ist noch nicht implementiert.' });
        } else {
            return res.status(400).json({ message: `Land ${country} wird aktuell nicht unterstützt.` });
        }

        const topData = {
            topMarken: fullCurrentData.topMarken.slice(0, 10),
            topElektro: fullCurrentData.topElektro.slice(0, 10),
        };

        const promptQuery = await db.query(`SELECT prompt_template FROM ai_prompt_rules WHERE name = 'LinkedIn KFZ Statistik' LIMIT 1`);
        const promptTemplate = promptQuery.rows.length > 0
            ? promptQuery.rows[0].prompt_template
            : `Erstelle einen motivierenden, professionellen LinkedIn-Post (ca. 150 Wörter) über die aktuellen KFZ-Neuzulassungen im Markt {{COUNTRY}} (Zeitraum: {{MONTH}} {{YEAR}}).

Hier sind die Daten der Top-Marken:
{{TOP_DATA}}

Hebe den Gewinner hervor, erwähne den stärksten Aufsteiger in Prozent und baue ein paar passende Emojis sowie Hashtags (#Automotive #Mobility) ein.`;

        const socialMetrics = buildSocialMetrics({
            currentData: fullCurrentData,
            previousData,
            year: parsed.year,
            month: parsed.month,
            monthNames,
        });
        const countryName = country === 'AT' ? 'Österreich' : 'Deutschland';
        const dataString = JSON.stringify({ ...topData, metrics: socialMetrics }, null, 2);
        const finalPrompt = promptTemplate
            .replace(/{{COUNTRY}}/g, countryName)
            .replace(/{{MONTH}}/g, monthNames[parsed.month - 1])
            .replace(/{{YEAR}}/g, parsed.year)
            .replace(/{{TOP_DATA}}/g, dataString)
            .concat(`\n\nVERBINDLICHE AUSGABEREGEL: Schreibe ausschließlich einen kurzen, professionellen Einstieg mit höchstens zwei Sätzen. Verwende darin keine Zahlen, Prozentwerte, Markennamen, Rangfolgen oder Hashtags. Die geprüften Kennzahlen werden anschließend technisch ergänzt.`);

        console.log(`[SocialMedia] Generiere KI-Text mit Modell: ${aiModel} für ${country} ${parsed.year}-${String(parsed.month).padStart(2, '0')}...`);
        const aiResponse = await executePrompt(aiModel, finalPrompt);
        const aiIntroduction = sanitizeAiIntroduction(aiResponse.content, topData);
        const groundedText = buildGroundedSocialPost({
            aiIntroduction,
            countryName,
            year: parsed.year,
            month: parsed.month,
            metrics: socialMetrics,
        });

        res.status(200).json({
            text: groundedText,
            parsedData: { ...topData, metrics: socialMetrics },
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

exports.viewGalleryFile = async (req, res) => {
    const resolved = resolveGalleryFile(req.params.folder, req.params.filename);
    if (resolved.error) return res.status(400).json({ message: resolved.error });

    try {
        const stats = await fs.promises.stat(resolved.filePath);
        if (!stats.isFile()) return res.status(404).json({ message: 'Datei nicht gefunden.' });

        res.setHeader('Cache-Control', 'private, max-age=300');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Content-Disposition', 'inline');
        return res.type(path.extname(resolved.filename)).sendFile(resolved.filePath);
    } catch (error) {
        if (error.code === 'ENOENT') return res.status(404).json({ message: 'Datei nicht gefunden.' });
        console.error('Fehler beim Anzeigen der Galerie-Datei:', error);
        return res.status(500).json({ message: 'Datei konnte nicht angezeigt werden.' });
    }
};

exports.downloadGalleryFile = async (req, res) => {
    const resolved = resolveGalleryFile(req.params.folder, req.params.filename);
    if (resolved.error) return res.status(400).json({ message: resolved.error });

    try {
        const stats = await fs.promises.stat(resolved.filePath);
        if (!stats.isFile()) return res.status(404).json({ message: 'Datei nicht gefunden.' });

        res.setHeader('Cache-Control', 'private, no-store');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        return res.download(resolved.filePath, resolved.filename, (error) => {
            if (!error || res.headersSent) return;
            console.error('Fehler beim Download der Galerie-Datei:', error);
            res.status(error.code === 'ENOENT' ? 404 : 500).json({
                message: error.code === 'ENOENT' ? 'Datei nicht gefunden.' : 'Datei konnte nicht heruntergeladen werden.',
            });
        });
    } catch (error) {
        if (error.code === 'ENOENT') return res.status(404).json({ message: 'Datei nicht gefunden.' });
        console.error('Fehler beim Download der Galerie-Datei:', error);
        return res.status(500).json({ message: 'Datei konnte nicht heruntergeladen werden.' });
    }
};

exports.uploadGalleryGraphic = async (req, res) => {
    if (!req.file?.buffer) {
        return res.status(400).json({ message: 'Bitte wählen Sie eine Bilddatei aus.' });
    }

    try {
        const grafikenPath = getPublicDir('grafiken');
        fs.mkdirSync(grafikenPath, { recursive: true });

        const baseName = sanitizeGraphicBaseName(req.file.originalname);
        const filename = `${baseName}-${randomUUID().slice(0, 8)}.webp`;
        const filePath = path.join(grafikenPath, filename);
        const { data, info } = await sharp(req.file.buffer, { limitInputPixels: 40_000_000 })
            .rotate()
            .resize(2000, 2000, { fit: 'inside', withoutEnlargement: true })
            .webp({ quality: 82, alphaQuality: 88, effort: 5 })
            .toBuffer({ resolveWithObject: true });

        await fs.promises.writeFile(filePath, data, { flag: 'wx' });

        return res.status(201).json({
            message: 'Hintergrundgrafik wurde optimiert und hochgeladen.',
            file: {
                name: filename,
                width: info.width,
                height: info.height,
                size: data.length,
                url: `/api/grafiken/${encodeURIComponent(filename)}?v=${Date.now()}`,
                rawUrl: `/api/grafiken/${encodeURIComponent(filename)}`,
            },
        });
    } catch (error) {
        console.error('Fehler beim Upload der Hintergrundgrafik:', error);
        const isInvalidImage = /unsupported image|Input buffer|corrupt|invalid/i.test(String(error.message || ''));
        return res.status(isInvalidImage ? 400 : 500).json({
            message: isInvalidImage
                ? 'Die Datei ist kein gültiges oder unterstütztes Bild.'
                : 'Hintergrundgrafik konnte nicht gespeichert werden.',
        });
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
