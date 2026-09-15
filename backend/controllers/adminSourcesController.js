// backend/controllers/adminSourcesController.js
const db = require('../config/db');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const isValidUUID = (uuid) => uuid && /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(uuid);

const normalizeSourceUrl = (value) => {
    const raw = String(value || '').trim();
    if (!raw) return null;

    try {
        const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
        const parsed = new URL(candidate);
        if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname) return null;
        return candidate;
    } catch {
        return null;
    }
};

const normalizeHostname = (value) => {
    const normalizedUrl = normalizeSourceUrl(value);
    if (!normalizedUrl) return '';

    return new URL(normalizedUrl).hostname
        .toLowerCase()
        .replace(/^www\d*\./, '')
        .replace(/\.$/, '');
};

const domainsMatch = (left, right) => {
    if (!left || !right) return false;
    return left === right || left.endsWith(`.${right}`) || right.endsWith(`.${left}`);
};

const SHARED_PLATFORM_DOMAINS = new Set([
    'facebook.com',
    'instagram.com',
    'linkedin.com',
    'tiktok.com',
    'twitter.com',
    'x.com',
    'youtube.com',
]);

const getSharedPlatformDomain = (hostname) => Array.from(SHARED_PLATFORM_DOMAINS)
    .find((domain) => hostname === domain || hostname.endsWith(`.${domain}`));

const domainCandidateMatches = (sourceUrl, candidateUrl) => {
    const sourceHostname = normalizeHostname(sourceUrl);
    const candidateHostname = normalizeHostname(candidateUrl);
    if (!domainsMatch(sourceHostname, candidateHostname)) return false;

    const sharedDomain = getSharedPlatformDomain(sourceHostname);
    if (!sharedDomain || sharedDomain !== getSharedPlatformDomain(candidateHostname)) return true;

    try {
        const sourcePath = new URL(normalizeSourceUrl(sourceUrl)).pathname.replace(/\/+$/, '').toLowerCase();
        const candidatePath = new URL(normalizeSourceUrl(candidateUrl)).pathname.replace(/\/+$/, '').toLowerCase();
        return sourcePath.length > 1 && sourcePath === candidatePath;
    } catch {
        return false;
    }
};

const domainSearchTokens = (hostname) => hostname
    .split('.')
    .slice(0, -1)
    .flatMap((part) => part.split(/[-_]+/))
    .map((part) => part.toLowerCase().replace(/[^a-z0-9]/g, ''))
    .filter((part) => part.length >= 3 && !['www', 'group', 'gmbh', 'austria', 'deutschland'].includes(part));

const labelMatchesDomain = (label, hostname) => {
    if (getSharedPlatformDomain(hostname)) return false;
    const comparableLabel = String(label || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    return domainSearchTokens(hostname).some((token) => comparableLabel.includes(token));
};

const getSourceLogoSuggestionsInternal = async (sourceUrl, sourceId = null) => {
    const sourceHostname = normalizeHostname(sourceUrl);
    if (!sourceHostname) return [];

    const result = await db.query(`
        SELECT logo_url AS url, label, source_type, candidate_url
        FROM (
            SELECT s.logo_url,
                   COALESCE(NULLIF(s.description, ''), s.url) AS label,
                   'Andere Quelle'::text AS source_type,
                   s.url AS candidate_url
            FROM sources s
            WHERE s.logo_url IS NOT NULL
              AND ($1::uuid IS NULL OR s.id <> $1)

            UNION ALL

            SELECT provider.logo_url,
                   provider.name AS label,
                   'Branchenverzeichnis'::text AS source_type,
                   provider.website_url AS candidate_url
            FROM directory_providers provider
            WHERE provider.logo_url IS NOT NULL

            UNION ALL

            SELECT software.logo_url,
                   software.name AS label,
                   'Software-Katalog'::text AS source_type,
                   software.product_url AS candidate_url
            FROM software_tools software
            WHERE software.logo_url IS NOT NULL

            UNION ALL

            SELECT partner.logo_url,
                   partner.name AS label,
                   'Mandantenlogo'::text AS source_type,
                   partner.url_businesspartner AS candidate_url
            FROM business_partners partner
            WHERE partner.logo_url IS NOT NULL

            UNION ALL

            SELECT account.logo_url,
                   account.name AS label,
                   'Account-Radar'::text AS source_type,
                   account.website_url AS candidate_url
            FROM business_partner_accounts account
            WHERE account.logo_url IS NOT NULL

            UNION ALL

            SELECT tag.logo_url,
                   tag.name AS label,
                   'Logo-Bibliothek'::text AS source_type,
                   NULL::text AS candidate_url
            FROM tags tag
            WHERE tag.logo_url IS NOT NULL
        ) candidates
        WHERE NULLIF(TRIM(logo_url), '') IS NOT NULL
    `, [isValidUUID(sourceId) ? sourceId : null]);

    const priorities = {
        'Andere Quelle': 10,
        'Branchenverzeichnis': 20,
        'Software-Katalog': 30,
        'Mandantenlogo': 40,
        'Account-Radar': 50,
        'Logo-Bibliothek': 60,
        'Branchenverzeichnis-Logoarchiv': 70,
    };
    const candidates = result.rows.flatMap((row) => {
        const domainMatch = domainCandidateMatches(sourceUrl, row.candidate_url);
        const nameMatch = !domainMatch
            && !getSharedPlatformDomain(sourceHostname)
            && labelMatchesDomain(row.label, sourceHostname);
        if (!domainMatch && !nameMatch) return [];

        return [{
            url: row.url,
            label: row.label || 'Bestehendes Logo',
            source: row.source_type,
            match: domainMatch ? 'domain' : 'name',
            matchLabel: domainMatch ? 'Domain stimmt überein' : 'Name passt zur Domain',
            priority: (domainMatch ? 0 : 100) + (priorities[row.source_type] || 90),
        }];
    });

    const directoryLogoPath = path.join(__dirname, '..', 'public', 'directory_logos');
    try {
        const files = await fs.promises.readdir(directoryLogoPath, { withFileTypes: true });
        files
            .filter((entry) => entry.isFile() && /^[a-zA-Z0-9._-]+\.(?:avif|gif|jpe?g|png|svg|webp)$/i.test(entry.name))
            .forEach((entry) => {
                const label = entry.name
                    .replace(/\.[^.]+$/, '')
                    .replace(/-\d{4}$/, '')
                    .replace(/[-_]+/g, ' ')
                    .trim();
                if (!labelMatchesDomain(label, sourceHostname)) return;
                candidates.push({
                    url: `/directory_logos/${encodeURIComponent(entry.name)}`,
                    label: label || 'Branchenverzeichnis-Logo',
                    source: 'Branchenverzeichnis-Logoarchiv',
                    match: 'name',
                    matchLabel: 'Dateiname passt zur Domain',
                    priority: priorities['Branchenverzeichnis-Logoarchiv'],
                });
            });
    } catch (error) {
        if (error.code !== 'ENOENT') {
            console.warn('[Sources] Logoarchiv konnte nicht durchsucht werden:', error.message);
        }
    }

    const uniqueByUrl = new Map();
    candidates
        .sort((left, right) => left.priority - right.priority || left.label.localeCompare(right.label, 'de'))
        .forEach((candidate) => {
            if (!uniqueByUrl.has(candidate.url)) uniqueByUrl.set(candidate.url, candidate);
        });

    return Array.from(uniqueByUrl.values())
        .slice(0, 12)
        .map(({ priority, ...candidate }) => candidate);
};

const validateSuggestedLogo = async (sourceUrl, sourceId, logoUrl) => {
    const requestedLogoUrl = String(logoUrl || '').trim();
    if (!requestedLogoUrl) return null;

    const suggestions = await getSourceLogoSuggestionsInternal(sourceUrl, sourceId);
    const match = suggestions.find((candidate) => candidate.url === requestedLogoUrl);
    if (!match) {
        const error = new Error('Das ausgewählte Logo passt nicht zur Domain oder ist nicht mehr verfügbar.');
        error.statusCode = 400;
        throw error;
    }
    return match.url;
};

// Hilfsfunktion: Domain aus URL extrahieren für den Dateinamen
const extractDomain = (urlStr) => {
    try {
        const urlObj = new URL(urlStr);
        return urlObj.hostname.replace(/[^a-zA-Z0-9]/g, '-');
    } catch (e) {
        return 'source';
    }
};

// Hilfsfunktion: WebP Bildverarbeitung
const processAndSaveSourceLogo = async (fileBuffer, sourceUrl) => {
    // Wir hängen noch 4 zufällige Zeichen an, falls es mehrere Quellen derselben Domain gibt
    const slug = extractDomain(sourceUrl) + '-' + Date.now().toString().slice(-4);
    const fileName = `${slug}.webp`;
    const uploadPath = path.join(__dirname, '..', 'public', 'logos');
    
    if (!fs.existsSync(uploadPath)) {
        fs.mkdirSync(uploadPath, { recursive: true });
    }

    const filePath = path.join(uploadPath, fileName);

    await sharp(fileBuffer)
        .resize({ height: 50, withoutEnlargement: true }) 
        .webp({ quality: 80 }) 
        .toFile(filePath);

    return `/logos/${fileName}`; 
};


// @desc    Alle Quellen für Admins abrufen
// @route   GET /api/admin/sources
// @access  Admin
exports.getAllSourcesAdmin = async (req, res) => {
    try {
        const query = `
            SELECT s.*, u.username as suggested_by, c.name as category_name
            FROM sources s
            LEFT JOIN users u ON s.suggested_by_user_id = u.id
            LEFT JOIN categories c ON s.category_id = c.id
            ORDER BY s.created_at DESC
        `;
        const result = await db.query(query);
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching all sources for admin:', err.message);
        res.status(500).send('Server error');
    }
};

// @desc    Bestehende Logos passend zur Domain einer Quelle vorschlagen
// @route   GET /api/admin/sources/logo-suggestions?url=...
// @access  Admin
exports.getSourceLogoSuggestions = async (req, res) => {
    const sourceUrl = normalizeSourceUrl(req.query.url);
    if (!sourceUrl) {
        return res.status(400).json({ message: 'Bitte eine gültige HTTP- oder HTTPS-URL eingeben.' });
    }

    try {
        const suggestions = await getSourceLogoSuggestionsInternal(sourceUrl, req.query.sourceId);
        return res.json({ domain: normalizeHostname(sourceUrl), suggestions });
    } catch (err) {
        console.error('Error fetching source logo suggestions:', err.message);
        return res.status(500).json({ message: 'Logo-Vorschläge konnten nicht geladen werden.' });
    }
};

// @desc    Details einer einzelnen Quelle abrufen
// @route   GET /api/admin/sources/:id
// @access  Admin
exports.getSourceDetailsAdmin = async (req, res) => {
    const { id } = req.params;
    if (!isValidUUID(id)) return res.status(400).json({ message: 'Invalid ID format.' });

    try {
        const result = await db.query('SELECT * FROM sources WHERE id = $1', [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Source not found.' });
        }
        res.json(result.rows[0]);
    } catch (err) {
        console.error('Error fetching source by ID for admin:', err.message);
        res.status(500).send('Server error');
    }
};

// @desc    Status einer Quelle aktualisieren
// @route   PUT /api/admin/sources/:id/status
// @access  Admin
exports.updateSourceStatus = async (req, res) => {
if (req.user.role === 'demo') {
        return res.status(403).json({ message: 'Demo-Benutzer dürfen den Status nicht ändern.' });
    }    
    const { id } = req.params;
    if (!isValidUUID(id)) return res.status(400).json({ message: 'Invalid ID format.' });

    const { status } = req.body;
    if (!['approved', 'rejected', 'pending_review'].includes(status)) {
        return res.status(400).json({ message: 'Invalid status provided.' });
    }

    const client = await db.connect();
    try {
        await client.query('BEGIN');

        // 1. Status der Quelle aktualisieren und die ID des Vorschlagenden zurückgeben
        const updateResult = await client.query(
            'UPDATE sources SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING suggested_by_user_id',
            [status, id]
        );

        if (updateResult.rows.length === 0) {
            return res.status(404).json({ message: 'Source not found.' });
        }
        
        const { suggested_by_user_id } = updateResult.rows[0];

        // 2. Wenn Status 'approved' ist und ein Nutzer die Quelle vorgeschlagen hat, Punkte vergeben
        if (status === 'approved' && suggested_by_user_id) {
            await client.query(
                'UPDATE users SET contribution_score = contribution_score + 5 WHERE id = $1',
                [suggested_by_user_id]
            );
        }

        await client.query('COMMIT');
        res.json({ message: `Source status updated to ${status}` });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error updating source status:', err.message);
        res.status(500).send('Server error');
    } finally {
        client.release();
    }
};

// @desc    Eine Quelle löschen
// @route   DELETE /api/admin/sources/:id
// @access  Admin
exports.deleteSource = async (req, res) => {
if (req.user.role === 'demo') {
        return res.status(403).json({ message: 'Demo-Benutzer dürfen nicht löschen.' });
    }    
    const { id } = req.params;
    if (!isValidUUID(id)) return res.status(400).json({ message: 'Invalid ID format.' });

    try {
        // Die ON DELETE CASCADE Regel in der DB löscht zugehörige votes und reports automatisch.
        const result = await db.query('DELETE FROM sources WHERE id = $1 RETURNING id', [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Source not found.' });
        }
        res.status(200).json({ message: 'Source deleted successfully' });
    } catch (err) {
        console.error('Error deleting source:', err.message);
        res.status(500).send('Server error');
    }
};

// @desc    Alle Meldungen zu Quellen abrufen
// @route   GET /api/admin/sources/reports
// @access  Admin
exports.getSourceReports = async (req, res) => {
    try {
        const query = `
            SELECT r.*, s.url as source_url, u.username as reported_by
            FROM source_reports r
            JOIN sources s ON r.source_id = s.id
            JOIN users u ON r.reported_by_user_id = u.id
            ORDER BY r.created_at DESC
        `;
        const result = await db.query(query);
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching source reports:', err.message);
        res.status(500).send('Server error');
    }
};

// @desc    Quelle bearbeiten (URL, Beschreibung, Kategorie, Logo)
// @route   PUT /api/admin/sources/:id
// @access  Admin
exports.updateSource = async (req, res) => {
    if (req.user.role === 'demo') {
        return res.status(403).json({ message: 'Demo-Benutzer dürfen keine Quellen bearbeiten.' });
    }    
    
    const { id } = req.params;
    if (!isValidUUID(id)) return res.status(400).json({ message: 'Invalid ID format.' });

    const { description, category_id } = req.body;
    const url = normalizeSourceUrl(req.body.url);

    if (!url) {
        return res.status(400).json({ message: 'Bitte eine gültige HTTP- oder HTTPS-URL eingeben.' });
    }

    try {
        // HIER GEFIXT: URL wird jetzt mit aktualisiert ($1)
        let updateQuery = 'UPDATE sources SET url = $1, description = $2, category_id = $3, updated_at = CURRENT_TIMESTAMP';
        const values = [url, description || null, category_id || null];
        let paramIndex = 4;
        
        // 1. Neues Logo hochgeladen
        if (req.file) {
            const logoUrl = await processAndSaveSourceLogo(req.file.buffer, url);
            updateQuery += `, logo_url = $${paramIndex}`;
            values.push(logoUrl);
            paramIndex++;
        }
        // 2. Bereits bekanntes, zur Domain passendes Logo bewusst übernehmen
        else if (req.body.logo_reference_url) {
            const logoUrl = await validateSuggestedLogo(url, id, req.body.logo_reference_url);
            updateQuery += `, logo_url = $${paramIndex}`;
            values.push(logoUrl);
            paramIndex++;
        }
        // 3. Logo soll gelöscht werden
        else if (req.body.delete_logo === 'true') {
            updateQuery += `, logo_url = NULL`;
        }

        values.push(id);
        updateQuery += ` WHERE id = $${paramIndex} RETURNING *`;

        const updatedSource = await db.query(updateQuery, values);
        if (updatedSource.rows.length === 0) return res.status(404).json({ message: 'Source not found.' });

        res.json(updatedSource.rows[0]);
    } catch (err) {
        console.error('Error updating source:', err.message);
        if (err.statusCode) {
            return res.status(err.statusCode).json({ message: err.message });
        }
        if (err.code === '23505') {
            return res.status(409).json({ message: 'Diese URL existiert bereits in der Datenbank.' });
        }
        res.status(500).send('Server error');
    }
};

// @desc    Neue Quelle erstellen
// @route   POST /api/admin/sources
// @access  Admin
exports.adminCreateSource = async (req, res) => {
    const { description, category_id, status } = req.body;
    const url = normalizeSourceUrl(req.body.url);
    let logoUrl = null;

    if (!url) return res.status(400).json({ message: 'Bitte eine gültige HTTP- oder HTTPS-URL eingeben.' });

    try {
        // HIER GEFIXT: Nutzt jetzt auch die WebP-Komprimierung aus dem Hilfs-Skript
        if (req.file) {
            logoUrl = await processAndSaveSourceLogo(req.file.buffer, url);
        } else if (req.body.logo_reference_url) {
            logoUrl = await validateSuggestedLogo(url, null, req.body.logo_reference_url);
        }

        const result = await db.query(
            `INSERT INTO sources (url, description, category_id, status, logo_url) 
             VALUES ($1, $2, $3, $4, $5) RETURNING *`,
            [url, description || null, category_id || null, status || 'approved', logoUrl]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error('Error creating source:', err.message);
        if (err.statusCode) {
            return res.status(err.statusCode).json({ message: err.message });
        }
        if (err.code === '23505') {
            return res.status(409).json({ message: 'Diese URL existiert bereits in der Datenbank.' });
        }
        res.status(500).json({ message: 'Fehler beim Erstellen der Quelle' });
    }
};
