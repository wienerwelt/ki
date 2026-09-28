// backend/controllers/adminDirectoryController.js
const db = require('../config/db');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const isValidUUID = (uuid) => uuid && /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(uuid);

const normalizeOptionalText = (value) => {
    if (value === undefined || value === null) return null;
    const trimmed = String(value).trim();
    return trimmed.length > 0 ? trimmed : null;
};

const normalizeEmail = (email) => {
    const normalized = normalizeOptionalText(email);
    return normalized ? normalized.toLowerCase().replace(/\/+$/, '') : null;
};

const normalizeUrl = (url) => {
    const normalized = normalizeOptionalText(url);
    if (!normalized) return null;
    return /^https?:\/\//i.test(normalized) ? normalized : `https://${normalized}`;
};

const normalizeLogoReference = (value) => {
    const normalized = normalizeOptionalText(value);
    if (!normalized) return null;
    if (normalized.length > 2048) {
        const error = new Error('Die Logo-Referenz ist zu lang.');
        error.statusCode = 400;
        throw error;
    }
    if (normalized.startsWith('/') && !normalized.startsWith('//')) return normalized;
    try {
        const parsed = new URL(normalized);
        if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return parsed.toString();
    } catch {
        // Einheitliche Fehlermeldung unterhalb.
    }
    const error = new Error('Die ausgewählte Logo-Referenz ist ungültig.');
    error.statusCode = 400;
    throw error;
};

const normalizePhoneNumber = (phone) => {
    let cleaned = normalizeOptionalText(phone);
    if (!cleaned) return null;

    // +43 (0) 1 ... soll als +431... gespeichert werden, nicht als +4301...
    cleaned = cleaned.replace(/\(0\)/g, '');
    cleaned = cleaned.replace(/[^\d+]/g, '').replace(/(?!^)\+/g, '');

    if (cleaned.startsWith('00')) {
        cleaned = `+${cleaned.substring(2)}`;
    }

    return cleaned || null;
};

const safeParseJsonArray = (value) => {
    if (!value) return [];
    try {
        const parsed = typeof value === 'string' ? JSON.parse(value) : value;
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
};

const normalizeProviderMandantSettings = (rawSettings) => {
    const settingsByPartner = new Map();

    for (const rawSetting of rawSettings) {
        const businessPartnerId = normalizeOptionalText(rawSetting?.business_partner_id);
        // Eine neu angelegte, aber noch nicht ausgewählte Formularzeile wird ignoriert.
        if (!businessPartnerId) continue;
        if (!isValidUUID(businessPartnerId)) {
            const error = new Error('Eine Mandanten-Zuordnung enthält eine ungültige ID.');
            error.statusCode = 400;
            throw error;
        }

        const status = rawSetting?.status === 'blacklisted' ? 'blacklisted' : 'active';
        settingsByPartner.set(businessPartnerId, {
            business_partner_id: businessPartnerId,
            status,
            is_recommended: status !== 'blacklisted' && rawSetting?.is_recommended === true,
            is_tenant_entry: status !== 'blacklisted' && rawSetting?.is_tenant_entry === true,
        });
    }

    return Array.from(settingsByPartner.values());
};

const syncProviderMandantSettings = async (client, providerId, rawSettings) => {
    const mandantSettings = normalizeProviderMandantSettings(rawSettings);

    // Bestehende Relationen bleiben erhalten und werden aktualisiert. Ein vorheriges
    // DELETE aller Zeilen würde an Software-/Action-Fremdschlüsseln scheitern.
    for (const setting of mandantSettings) {
        if (setting.is_tenant_entry) {
            await client.query(
                `UPDATE directory_provider_mandant_settings
                 SET is_tenant_entry = FALSE
                 WHERE business_partner_id = $1
                   AND provider_id <> $2`,
                [setting.business_partner_id, providerId]
            );
        }

        await client.query(
            `INSERT INTO directory_provider_mandant_settings (
                provider_id, business_partner_id, status, is_recommended, is_tenant_entry
             ) VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (provider_id, business_partner_id) DO UPDATE
             SET status = EXCLUDED.status,
                 is_recommended = EXCLUDED.is_recommended,
                 is_tenant_entry = EXCLUDED.is_tenant_entry`,
            [
                providerId,
                setting.business_partner_id,
                setting.status,
                setting.is_recommended,
                setting.is_tenant_entry,
            ]
        );
    }

    const retainedPartnerIds = mandantSettings.map((setting) => setting.business_partner_id);
    const removedRelations = await client.query(
        `SELECT
            dpm.business_partner_id,
            COALESCE(bp.name, dpm.business_partner_id::text) AS business_partner_name,
            (
                SELECT COUNT(*)::int
                FROM software_tools st
                WHERE st.provider_id = dpm.provider_id
                  AND st.business_partner_id = dpm.business_partner_id
            ) AS software_count,
            (
                SELECT COUNT(*)::int
                FROM business_partner_actions bpa
                WHERE bpa.directory_provider_id = dpm.provider_id
                  AND bpa.business_partner_id = dpm.business_partner_id
            ) AS action_count
         FROM directory_provider_mandant_settings dpm
         LEFT JOIN business_partners bp ON bp.id = dpm.business_partner_id
         WHERE dpm.provider_id = $1
           AND NOT (dpm.business_partner_id = ANY($2::uuid[]))`,
        [providerId, retainedPartnerIds]
    );

    const usedRelations = removedRelations.rows.filter(
        (relation) => Number(relation.software_count || 0) > 0 || Number(relation.action_count || 0) > 0
    );
    if (usedRelations.length > 0) {
        const affected = usedRelations.map((relation) => {
            const usages = [];
            if (Number(relation.software_count || 0) > 0) usages.push(`${relation.software_count} Software-Eintrag/Einträge`);
            if (Number(relation.action_count || 0) > 0) usages.push(`${relation.action_count} Action(s)`);
            return `${relation.business_partner_name} (${usages.join(', ')})`;
        }).join('; ');
        const error = new Error(
            `Die Mandanten-Zuordnung kann nicht entfernt werden, weil sie noch verwendet wird: ${affected}. `
            + 'Bitte die verknüpften Inhalte zuerst einem anderen Anbieter zuordnen oder löschen.'
        );
        error.code = 'DIRECTORY_RELATION_IN_USE';
        throw error;
    }

    await client.query(
        `DELETE FROM directory_provider_mandant_settings
         WHERE provider_id = $1
           AND NOT (business_partner_id = ANY($2::uuid[]))`,
        [providerId, retainedPartnerIds]
    );

    return mandantSettings;
};

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

const deletePhysicalLogoIfUnused = async (logoUrl) => {
    if (!logoUrl || !String(logoUrl).startsWith('/directory_logos/')) return;
    const usage = await db.query(`
        SELECT (
            (SELECT COUNT(*) FROM directory_providers WHERE logo_url = $1)
          + (SELECT COUNT(*) FROM software_tools WHERE logo_url = $1)
          + (SELECT COUNT(*) FROM business_partners WHERE logo_url = $1)
          + (SELECT COUNT(*) FROM sources WHERE logo_url = $1)
          + (SELECT COUNT(*) FROM tags WHERE logo_url = $1)
          + (SELECT COUNT(*) FROM business_partner_accounts WHERE logo_url = $1)
        )::int AS usage_count
    `, [logoUrl]);
    if (Number(usage.rows[0]?.usage_count || 0) === 0) deletePhysicalLogo(logoUrl);
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
                        'business_partner_name', bp.name,
                        'status', dpm.status,
                        'is_recommended', dpm.is_recommended,
                        'is_tenant_entry', dpm.is_tenant_entry,
                        'primary_color', cs.primary_color,
                        'secondary_color', cs.secondary_color
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
            LEFT JOIN business_partners bp ON bp.id = dpm.business_partner_id
            LEFT JOIN color_schemes cs ON cs.id = bp.color_scheme_id
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
            db.query(`
                SELECT
                    dpm.business_partner_id,
                    bp.name AS business_partner_name,
                    dpm.status,
                    dpm.is_recommended,
                    dpm.is_tenant_entry,
                    cs.primary_color,
                    cs.secondary_color
                FROM directory_provider_mandant_settings dpm
                LEFT JOIN business_partners bp ON bp.id = dpm.business_partner_id
                LEFT JOIN color_schemes cs ON cs.id = bp.color_scheme_id
                WHERE dpm.provider_id = $1
            `, [id])
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

        const { name, description, website_url, contact_email, contact_phone, is_public, subscription_tier, logo_url } = req.body;
        const normalizedName = normalizeOptionalText(name);
        const normalizedDescription = normalizeOptionalText(description);
        const normalizedWebsiteUrl = normalizeUrl(website_url);
        const normalizedEmail = normalizeEmail(contact_email);
        const normalizedPhone = normalizePhoneNumber(contact_phone);

        if (!normalizedName) {
            await client.query('ROLLBACK');
            return res.status(400).json({ message: 'Firmenname ist erforderlich.' });
        }
        
        const locations = safeParseJsonArray(req.body.locations);
        const categories = safeParseJsonArray(req.body.categories);
        const tags = safeParseJsonArray(req.body.tags);
        const mandantSettings = safeParseJsonArray(req.body.mandant_settings);

        let logoUrl = normalizeLogoReference(logo_url);
        if (req.file) {
            logoUrl = await processAndSaveProviderLogo(
                req.file.buffer,
                req.file.mimetype,
                normalizedName || 'provider'
            );
        }

        const providerQuery = `
            INSERT INTO directory_providers 
            (name, description, logo_url, website_url, contact_email, contact_phone, is_public, subscription_tier) 
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id
        `;
        const providerRes = await client.query(providerQuery, [
            normalizedName, normalizedDescription, logoUrl, normalizedWebsiteUrl, normalizedEmail, normalizedPhone, 
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
            const isTenantEntry = ms.status !== 'blacklisted' && ms.is_tenant_entry === true;
            if (isTenantEntry) {
                await client.query(
                    'UPDATE directory_provider_mandant_settings SET is_tenant_entry = FALSE WHERE business_partner_id = $1',
                    [ms.business_partner_id]
                );
            }
            await client.query(
                `INSERT INTO directory_provider_mandant_settings (provider_id, business_partner_id, status, is_recommended, is_tenant_entry) VALUES ($1, $2, $3, $4, $5)`,
                [providerId, ms.business_partner_id, ms.status || 'active', ms.is_recommended || false, isTenantEntry]
            );
        }

        await client.query('COMMIT');
        res.status(201).json({ message: 'Provider created successfully', id: providerId });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error creating provider:', err.message);
        if (err.statusCode === 400) return res.status(400).json({ message: err.message });
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

        const { name, description, website_url, contact_email, contact_phone, is_public, subscription_tier, delete_logo, logo_url } = req.body;
        const normalizedName = normalizeOptionalText(name);
        const normalizedDescription = normalizeOptionalText(description);
        const normalizedWebsiteUrl = normalizeUrl(website_url);
        const normalizedEmail = normalizeEmail(contact_email);
        const normalizedPhone = normalizePhoneNumber(contact_phone);

        if (!normalizedName) {
            await client.query('ROLLBACK');
            return res.status(400).json({ message: 'Firmenname ist erforderlich.' });
        }
        
        const logoReferenceProvided = Object.prototype.hasOwnProperty.call(req.body, 'logo_url');
        const selectedLogoUrl = logoReferenceProvided ? normalizeLogoReference(logo_url) : undefined;

        // Wir merken uns das alte Logo VOR dem Update, um eine nicht mehr verwendete lokale Datei aufzuräumen.
        if (req.file || delete_logo === 'true' || logoReferenceProvided) {
            const oldProviderRes = await client.query('SELECT logo_url FROM directory_providers WHERE id = $1', [id]);
            if (oldProviderRes.rows.length > 0) {
                oldLogoUrl = oldProviderRes.rows[0].logo_url;
            }
        }

        const locations = safeParseJsonArray(req.body.locations);
        const categories = safeParseJsonArray(req.body.categories);
        const tags = safeParseJsonArray(req.body.tags);
        const mandantSettings = safeParseJsonArray(req.body.mandant_settings);

        let updateQuery = `
            UPDATE directory_providers 
            SET name = $1, description = $2, website_url = $3, contact_email = $4, contact_phone = $5, is_public = $6, subscription_tier = $7, updated_at = CURRENT_TIMESTAMP
        `;
        let values = [
            normalizedName, normalizedDescription, normalizedWebsiteUrl, normalizedEmail, normalizedPhone, 
            is_public === 'true' || is_public === true, subscription_tier || 'free'
        ];
        let paramIndex = 8;
        let newLogoUrl = oldLogoUrl;

        if (req.file) {
            newLogoUrl = await processAndSaveProviderLogo(
                req.file.buffer,
                req.file.mimetype,
                normalizedName || 'provider'
            );

            updateQuery += `, logo_url = $${paramIndex}`;
            values.push(newLogoUrl);
            paramIndex++;
        } else if (delete_logo === 'true') {
            newLogoUrl = null;
            updateQuery += `, logo_url = NULL`;
        } else if (logoReferenceProvided) {
            newLogoUrl = selectedLogoUrl;
            updateQuery += `, logo_url = $${paramIndex}`;
            values.push(selectedLogoUrl);
            paramIndex++;
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

        await syncProviderMandantSettings(client, id, mandantSettings);

        await client.query('COMMIT');

        // WENN ALLES GEKLAPPT HAT: Altes Logo physisch von der Platte putzen!
        if (oldLogoUrl && oldLogoUrl !== newLogoUrl) {
            await deletePhysicalLogoIfUnused(oldLogoUrl);
        }

        res.json({ message: 'Provider updated successfully' });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error updating provider:', err.message);
        if (err.statusCode === 400) return res.status(400).json({ message: err.message });
        if (err.code === 'DIRECTORY_RELATION_IN_USE' || err.code === '23503') {
            return res.status(409).json({
                message: err.code === 'DIRECTORY_RELATION_IN_USE'
                    ? err.message
                    : 'Eine Mandanten-Zuordnung wird noch von Software oder Actions verwendet und kann nicht entfernt werden.'
            });
        }
        if (err.code === '23505') {
            return res.status(409).json({ message: 'Ein Dienstleister mit diesem Namen oder dieser Mandanten-Zuordnung existiert bereits.' });
        }
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
            await deletePhysicalLogoIfUnused(deletedLogoUrl);
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

// @desc    Geocoding für manuell eingegebene Adressen
exports.geocodeAddress = async (req, res) => {
    const { query } = req.query;
    if (!query) return res.status(400).json({ message: 'Suchbegriff fehlt.' });

    const apiKey = process.env.GOOGLE_API_KEY || process.env.GOOGLE_MAPS_API_KEY;
    const axios = require('axios');

    try {
        // VERSUCH 1: Google Maps Geocoding
        const googleUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(query)}&key=${apiKey}`;
        const googleResponse = await axios.get(googleUrl);

        if (googleResponse.data.status === 'OK' && googleResponse.data.results.length > 0) {
            const location = googleResponse.data.results[0].geometry.location;
            return res.json({ lat: location.lat, lng: location.lng, source: 'google' });
        }

        console.log(`[Geocoding] Google fand nichts für "${query}". Versuche Fallback über Nominatim (OSM)...`);

        // VERSUCH 2: Fallback über Nominatim (OpenStreetMap)
        const osmUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`;
        const osmResponse = await axios.get(osmUrl, {
            headers: { 'User-Agent': 'MobilitiDashboard/1.0' } // Nominatim verlangt einen User-Agent
        });

        if (osmResponse.data && osmResponse.data.length > 0) {
            const location = osmResponse.data[0];
            return res.json({ 
                lat: parseFloat(location.lat), 
                lng: parseFloat(location.lon), 
                source: 'osm' 
            });
        }

        // Wenn beide versagen
        return res.status(404).json({ message: 'Für diese Adresse konnten in keinem System Koordinaten gefunden werden.' });

    } catch (err) {
        console.error("Geocoding API Fehler:", err.message);
        res.status(500).json({ message: 'Server Fehler bei Geocoding.' });
    }
};
