// backend/controllers/adminBusinessPartnerController.js
const db = require('../config/db');
const isValidUUID = (uuid) => uuid && /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(uuid);

const { PutObjectCommand } = require("@aws-sdk/client-s3");
const s3Client = require("../config/s3Client.js");
const { v4: uuidv4 } = require('uuid');
const { normalizeTenantModules, normalizeWorkspace } = require('../services/tenantModuleService');
const {
    SALES_SUBSCRIPTION_STATUSES,
    getSalesPlanDefinition,
    normalizeSalesPlan,
    normalizeSalesSubscriptionStatus,
} = require('../services/salesPlanService');

const normalizeSalesTrialDate = (value) => {
    if (!value) return null;
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
    const direct = String(value).trim().match(/^(\d{4}-\d{2}-\d{2})/);
    if (direct) return direct[1];
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
};

const normalizeSalesPrice = (value) => {
    if (value === '' || value === null || value === undefined) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed * 100) / 100 : Number.NaN;
};

exports.getAllBusinessPartners = async (req, res) => {
    try {
        const result = await db.query(
            `SELECT
                bp.id, bp.name, bp.slug, bp.dashboard_title, bp.address, bp.logo_url, bp.email,
                bp.subscription_start_date, bp.subscription_end_date, bp.color_scheme_id,
                bp.is_active, bp.created_at, bp.updated_at, bp.url_businesspartner,
                bp.level_1_name, bp.level_2_name, bp.level_3_name,
                bp.storage_tier, bp.storage_usage_bytes, bp.storage_limit_bytes,
                bp.allow_automated_newsletter, bp.dashboard_focus,
                bp.enabled_modules, bp.default_workspace, bp.sales_plan,
                bp.sales_subscription_status, bp.sales_trial_ends_on,
                bp.sales_monthly_price_eur, bp.sales_billing_cycle,
                CASE WHEN bp.sales_subscription_status = 'trial'
                    THEN GREATEST(bp.sales_trial_ends_on - CURRENT_DATE, 0)
                    ELSE NULL END AS sales_trial_days_remaining,
                CASE WHEN bp.sales_subscription_status = 'active'
                    OR (bp.sales_subscription_status = 'trial' AND bp.sales_trial_ends_on >= CURRENT_DATE)
                    THEN TRUE ELSE FALSE END AS sales_access_active,
                bp.briefing_frequency, bp.newsletter_frequency,
                bp.newsletter_delivery_mode, bp.newsletter_export_email,
                bp.newsletter_external_signup_url, bp.newsletter_recipient_limit,
                cs.name AS color_scheme_name,
                (SELECT COUNT(*)::int FROM users u WHERE u.business_partner_id = bp.id) AS user_count,
                (SELECT COUNT(*)::int FROM business_partner_widget_access wa WHERE wa.business_partner_id = bp.id) AS widget_count,
                (SELECT COUNT(*)::int FROM business_partner_files bpf WHERE bpf.business_partner_id = bp.id) AS file_count,
                (SELECT COUNT(*)::int FROM business_partner_accounts bpa WHERE bpa.business_partner_id = bp.id) as account_count,
                
                -- KORREKTUR: Gleiche Struktur für Regions wie in getMyBusinessPartner
                (
                    SELECT COALESCE(json_agg(
                        jsonb_build_object('id', r.id, 'name', r.name, 'code', r.code, 'is_default', bpr.is_default)
                        ORDER BY bpr.is_default DESC, r.name ASC
                    ), '[]'::json)
                    FROM business_partner_regions bpr
                    JOIN regions r ON bpr.region_id = r.id
                    WHERE bpr.business_partner_id = bp.id
                ) AS regions,
                
                (SELECT COALESCE(json_agg(
                    jsonb_build_object('id', c.id, 'name', c.name)
                    ORDER BY c.name ASC
                ), '[]'::json)
                 FROM business_partner_categories bpc
                 JOIN categories c ON bpc.category_id = c.id
                 WHERE bpc.business_partner_id = bp.id AND c.category_type = 'industry') AS industries
             FROM business_partners bp
             LEFT JOIN color_schemes cs ON bp.color_scheme_id = cs.id
             ORDER BY bp.name ASC`
        );
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching all business partners:', err.message);
        res.status(500).send('Server error');
    }
};

// GET a single business partner by ID
exports.getBusinessPartnerById = async (req, res) => {
    const { id } = req.params;
    if (!isValidUUID(id)) return res.status(400).json({ message: 'Invalid Business Partner ID format.' });

    try {
        const result = await db.query(
            `SELECT
                bp.id, bp.name, bp.slug, bp.dashboard_title, bp.address, bp.logo_url, bp.email,
                bp.subscription_start_date, bp.subscription_end_date, bp.color_scheme_id,
                bp.is_active, bp.created_at, bp.updated_at, bp.url_businesspartner,
                bp.level_1_name, bp.level_2_name, bp.level_3_name,
                bp.briefing_frequency,
                bp.newsletter_frequency, bp.allow_automated_newsletter, bp.dashboard_focus,
                bp.enabled_modules, bp.default_workspace, bp.sales_plan,
                bp.sales_subscription_status, bp.sales_trial_ends_on,
                bp.sales_monthly_price_eur, bp.sales_billing_cycle,
                CASE WHEN bp.sales_subscription_status = 'trial'
                    THEN GREATEST(bp.sales_trial_ends_on - CURRENT_DATE, 0)
                    ELSE NULL END AS sales_trial_days_remaining,
                CASE WHEN bp.sales_subscription_status = 'active'
                    OR (bp.sales_subscription_status = 'trial' AND bp.sales_trial_ends_on >= CURRENT_DATE)
                    THEN TRUE ELSE FALSE END AS sales_access_active,
                bp.newsletter_delivery_mode, bp.newsletter_export_email,
                bp.newsletter_external_signup_url, bp.newsletter_recipient_limit,
                cs.name AS color_scheme_name, cs.primary_color, cs.secondary_color,
                
                -- KORREKTUR: Gleiche Struktur für Regions wie in getMyBusinessPartner
                (
                    SELECT COALESCE(json_agg(
                        jsonb_build_object('id', r.id, 'name', r.name, 'code', r.code, 'is_default', bpr.is_default)
                        ORDER BY bpr.is_default DESC, r.name ASC
                    ), '[]'::json)
                    FROM business_partner_regions bpr
                    JOIN regions r ON bpr.region_id = r.id
                    WHERE bpr.business_partner_id = bp.id
                ) as regions
             FROM business_partners bp
             LEFT JOIN color_schemes cs ON bp.color_scheme_id = cs.id
             WHERE bp.id = $1`,
            [id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Business Partner not found.' });
        }
        res.json(result.rows[0]);
    } catch (err) {
        console.error('Error fetching business partner by ID:', err.message);
        res.status(500).send('Server error');
    }
};

exports.createBusinessPartner = async (req, res) => {
    const {
        name, slug, address, logo_url, subscription_start_date, subscription_end_date,
        color_scheme_id, is_active, url_businesspartner, region_ids = [],
        dashboard_title, level_1_name, level_2_name, level_3_name,
        default_region_id, email, briefing_frequency, allow_automated_newsletter,
        category_ids = [], dashboard_focus, enabled_modules, default_workspace, sales_plan,
        sales_subscription_status, sales_trial_ends_on, sales_monthly_price_eur, sales_billing_cycle,
        newsletter_delivery_mode = 'mobiliti',
        newsletter_export_email, newsletter_external_signup_url, newsletter_recipient_limit = 250,
        color_mode, custom_colors 
    } = req.body;

    if (!name) return res.status(400).json({ message: 'Name is required.' });
    if (sales_subscription_status !== undefined && !SALES_SUBSCRIPTION_STATUSES.includes(String(sales_subscription_status).trim().toLowerCase())) {
        return res.status(400).json({ message: 'Ungültiger Sales-Status.' });
    }
    if (sales_billing_cycle !== undefined && !['monthly', 'annual'].includes(String(sales_billing_cycle).trim().toLowerCase())) {
        return res.status(400).json({ message: 'Ungültiger Sales-Abrechnungszyklus.' });
    }

    const tenantModules = normalizeTenantModules(enabled_modules);
    const tenantDefaultWorkspace = normalizeWorkspace(default_workspace, tenantModules);
    const tenantSalesPlan = normalizeSalesPlan(sales_plan);
    const tenantSalesSubscriptionStatus = normalizeSalesSubscriptionStatus(sales_subscription_status);
    const tenantSalesTrialEndsOn = tenantSalesSubscriptionStatus === 'trial'
        ? normalizeSalesTrialDate(sales_trial_ends_on)
        : null;
    const tenantSalesMonthlyPrice = normalizeSalesPrice(sales_monthly_price_eur);
    const tenantSalesBillingCycle = sales_billing_cycle === 'annual' ? 'annual' : 'monthly';

    if (tenantSalesSubscriptionStatus === 'trial' && !tenantSalesTrialEndsOn) {
        return res.status(400).json({ message: 'Für eine Testphase ist ein gültiges Enddatum erforderlich.' });
    }
    if (Number.isNaN(tenantSalesMonthlyPrice)) {
        return res.status(400).json({ message: 'Der vereinbarte Sales-Preis muss eine gültige Zahl ab 0 sein.' });
    }

    const newsletterError = validateNewsletterDelivery({
        newsletter_delivery_mode, newsletter_export_email, newsletter_external_signup_url, newsletter_recipient_limit, email
    });
    if (newsletterError) return res.status(400).json({ message: newsletterError });

    const client = await db.connect();
    try {
        await client.query('BEGIN');

        let finalColorSchemeId = color_scheme_id;

        // Custom Color Scheme anlegen, wenn Modus auf 'custom' steht
        if (color_mode === 'custom' && custom_colors) {
            const customName = `Custom - BP ${Date.now()}`;
            
            const insertSchemeQuery = `
                INSERT INTO color_schemes (
                    name, primary_color, secondary_color, 
                    text_color_light, background_color_light, paper_color_light, primary_text_color
                ) VALUES ($1, $2, $3, $4, $5, $6, $7)
                RETURNING id
            `;
            
            const result = await client.query(insertSchemeQuery, [
                customName, 
                custom_colors.primary_color, 
                custom_colors.secondary_color, 
                custom_colors.text_color_light, 
                custom_colors.background_color_light, 
                custom_colors.paper_color_light,
                custom_colors.primary_text_color
            ]);
            
            finalColorSchemeId = result.rows[0].id;
        }

        const bpResult = await client.query(
            `INSERT INTO business_partners (
                name, slug, address, logo_url, subscription_start_date, subscription_end_date,
                color_scheme_id, is_active, url_businesspartner, dashboard_title,
                level_1_name, level_2_name, level_3_name, email, allow_automated_newsletter, briefing_frequency,
                dashboard_focus, newsletter_delivery_mode, newsletter_export_email,
                newsletter_external_signup_url, newsletter_recipient_limit,
                enabled_modules, default_workspace, sales_plan,
                sales_subscription_status, sales_trial_ends_on,
                sales_monthly_price_eur, sales_billing_cycle
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28) RETURNING *`,
            [
                name, slug || null, address || null, logo_url || null, subscription_start_date || null,
                subscription_end_date || null, finalColorSchemeId || null, is_active,
                url_businesspartner || null, dashboard_title || null, level_1_name || null,
                level_2_name || null, level_3_name || null, email || null,
                !!allow_automated_newsletter, briefing_frequency || 'never', dashboard_focus || 'information',
                newsletter_delivery_mode, newsletter_export_email || null,
                newsletter_external_signup_url || null, Number(newsletter_recipient_limit) || 250,
                tenantModules, tenantDefaultWorkspace, tenantSalesPlan,
                tenantSalesSubscriptionStatus, tenantSalesTrialEndsOn,
                tenantSalesMonthlyPrice, tenantSalesBillingCycle
            ]
        );
        const newBp = bpResult.rows[0];

        if (region_ids && region_ids.length > 0) {
            for (const region_id of region_ids) {
                const isDefault = region_id === default_region_id;
                await client.query(
                    'INSERT INTO business_partner_regions (business_partner_id, region_id, is_default) VALUES ($1, $2, $3)',
                    [newBp.id, region_id, isDefault]
                );
            }
        }

        if (category_ids && category_ids.length > 0) {
            for (const category_id of category_ids) {
                await client.query(
                    'INSERT INTO business_partner_categories (business_partner_id, category_id) VALUES ($1, $2)',
                    [newBp.id, category_id]
                );
            }
        }

        await client.query('COMMIT');
        res.status(201).json(newBp);
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error creating business partner:', err.message);
        
        if (err.constraint === 'business_partners_email_key') {
            return res.status(409).json({ message: 'Ein Business Partner mit dieser E-Mail-Adresse existiert bereits.' });
        }
        if (err.constraint === 'business_partners_slug_key') {
            return res.status(409).json({ message: 'Dieses Kürzel (Slug) wird bereits verwendet. Bitte wählen Sie ein anderes.' });
        }
        res.status(500).send('Server error');
    } finally {
        client.release();
    }
};

exports.updateBusinessPartner = async (req, res) => {
    const { id } = req.params;
    if (!isValidUUID(id)) return res.status(400).json({ message: 'Invalid ID format.' });

    const {
        name, slug, address, logo_url, subscription_start_date, subscription_end_date,
        color_scheme_id, is_active, url_businesspartner, region_ids,
        dashboard_title, level_1_name, level_2_name, level_3_name,
        default_region_id, email, storage_tier, 
        allow_automated_newsletter, briefing_frequency, 
        category_ids, dashboard_focus, enabled_modules, default_workspace, sales_plan,
        sales_subscription_status, sales_trial_ends_on, sales_monthly_price_eur, sales_billing_cycle,
        newsletter_delivery_mode = 'mobiliti',
        newsletter_export_email, newsletter_external_signup_url, newsletter_recipient_limit = 250,
        color_mode, custom_colors 
    } = req.body;

    // Storage Tier Logik
    const validTiers = {
        'free': 0,
        'standard': 104857600,   // 100 MB
        'premium': 1048576000    // 1 GB
    };

    if (storage_tier && !validTiers.hasOwnProperty(storage_tier)) {
        return res.status(400).json({ message: 'Ungültiger Tier-Name.' });
    }
    if (sales_subscription_status !== undefined && !SALES_SUBSCRIPTION_STATUSES.includes(String(sales_subscription_status).trim().toLowerCase())) {
        return res.status(400).json({ message: 'Ungültiger Sales-Status.' });
    }
    if (sales_billing_cycle !== undefined && !['monthly', 'annual'].includes(String(sales_billing_cycle).trim().toLowerCase())) {
        return res.status(400).json({ message: 'Ungültiger Sales-Abrechnungszyklus.' });
    }
    const newsletterError = validateNewsletterDelivery({
        newsletter_delivery_mode, newsletter_export_email, newsletter_external_signup_url, newsletter_recipient_limit, email
    });
    if (newsletterError) return res.status(400).json({ message: newsletterError });
    let tenantModules = null;
    let tenantDefaultWorkspace = null;
    const tenantSalesPlan = sales_plan === undefined ? null : normalizeSalesPlan(sales_plan);
    let tenantSalesSubscriptionStatus = null;
    let tenantSalesTrialEndsOn = null;
    let tenantSalesMonthlyPrice = null;
    let tenantSalesBillingCycle = null;
    const salesLifecycleWasProvided = sales_subscription_status !== undefined || sales_trial_ends_on !== undefined;
    const salesMonthlyPriceWasProvided = sales_monthly_price_eur !== undefined;
    const newLimit = storage_tier ? validTiers[storage_tier] : undefined;

    const client = await db.connect();
    try {
        await client.query('BEGIN');

        if (
            enabled_modules !== undefined || default_workspace !== undefined
            || sales_subscription_status !== undefined || sales_trial_ends_on !== undefined
            || sales_monthly_price_eur !== undefined || sales_billing_cycle !== undefined
        ) {
            const currentProductSettings = await client.query(
                `SELECT enabled_modules, default_workspace, sales_subscription_status,
                        sales_trial_ends_on, sales_monthly_price_eur, sales_billing_cycle
                 FROM business_partners WHERE id = $1 FOR UPDATE`,
                [id]
            );
            if (!currentProductSettings.rows.length) throw new Error('Business Partner not found.');
            tenantModules = normalizeTenantModules(
                enabled_modules === undefined ? currentProductSettings.rows[0].enabled_modules : enabled_modules
            );
            tenantDefaultWorkspace = normalizeWorkspace(
                default_workspace === undefined ? currentProductSettings.rows[0].default_workspace : default_workspace,
                tenantModules
            );
            tenantSalesSubscriptionStatus = normalizeSalesSubscriptionStatus(
                sales_subscription_status === undefined
                    ? currentProductSettings.rows[0].sales_subscription_status
                    : sales_subscription_status
            );
            tenantSalesTrialEndsOn = tenantSalesSubscriptionStatus === 'trial'
                ? normalizeSalesTrialDate(
                    sales_trial_ends_on === undefined
                        ? currentProductSettings.rows[0].sales_trial_ends_on
                        : sales_trial_ends_on
                )
                : null;
            tenantSalesMonthlyPrice = normalizeSalesPrice(
                sales_monthly_price_eur === undefined
                    ? currentProductSettings.rows[0].sales_monthly_price_eur
                    : sales_monthly_price_eur
            );
            tenantSalesBillingCycle = (sales_billing_cycle === undefined
                ? currentProductSettings.rows[0].sales_billing_cycle
                : sales_billing_cycle) === 'annual' ? 'annual' : 'monthly';

            if (tenantSalesSubscriptionStatus === 'trial' && !tenantSalesTrialEndsOn) {
                await client.query('ROLLBACK');
                return res.status(400).json({ message: 'Für eine Testphase ist ein gültiges Enddatum erforderlich.' });
            }
            if (Number.isNaN(tenantSalesMonthlyPrice)) {
                await client.query('ROLLBACK');
            return res.status(400).json({ message: 'Der vereinbarte Sales-Preis muss eine gültige Zahl ab 0 sein.' });
            }
        }

        if (tenantSalesPlan === 'basic') {
            const accountUsage = await client.query(
                'SELECT COUNT(*)::int AS count FROM business_partner_accounts WHERE business_partner_id = $1',
                [id]
            );
            const accountLimit = getSalesPlanDefinition('basic').limits.accounts;
            if (Number(accountUsage.rows[0]?.count || 0) > accountLimit) {
                await client.query('ROLLBACK');
                return res.status(409).json({
                    message: `Der Mandant besitzt mehr als ${accountLimit} Accounts. Vor dem Wechsel zu Sales Basic muss der Bestand reduziert werden.`,
                    code: 'SALES_ACCOUNT_LIMIT_REACHED',
                });
            }
        }

        let finalColorSchemeId = color_scheme_id;

        // Custom Color Scheme Logik beim Update
        if (color_mode === 'custom' && custom_colors) {
            const customName = `Custom - BP ${Date.now()}`;
            
            const insertSchemeQuery = `
                INSERT INTO color_schemes (
                    name, primary_color, secondary_color, 
                    text_color_light, background_color_light, paper_color_light, primary_text_color
                ) VALUES ($1, $2, $3, $4, $5, $6, $7)
                RETURNING id
            `;
            
            const result = await client.query(insertSchemeQuery, [
                customName, 
                custom_colors.primary_color, 
                custom_colors.secondary_color, 
                custom_colors.text_color_light, 
                custom_colors.background_color_light, 
                custom_colors.paper_color_light,
                custom_colors.primary_text_color
            ]);
            
            finalColorSchemeId = result.rows[0].id;
        }

        const updatedBpResult = await client.query(
            `UPDATE business_partners SET
                name = $1, 
                address = $2, 
                logo_url = $3, 
                subscription_start_date = $4,
                subscription_end_date = $5, 
                color_scheme_id = $6, 
                is_active = $7,
                url_businesspartner = $8, 
                dashboard_title = $9, 
                level_1_name = $10,
                level_2_name = $11, 
                level_3_name = $12, 
                email = $13, 
                storage_tier = COALESCE($14, storage_tier), 
                storage_limit_bytes = COALESCE($15, storage_limit_bytes), 
                allow_automated_newsletter = $16,
                briefing_frequency = COALESCE($17, briefing_frequency),
                dashboard_focus = $18, 
                slug = $19,
                newsletter_delivery_mode = $20,
                newsletter_export_email = $21,
                newsletter_external_signup_url = $22,
                newsletter_recipient_limit = $23,
                enabled_modules = COALESCE($24, enabled_modules),
                default_workspace = COALESCE($25, default_workspace),
                sales_plan = COALESCE($26, sales_plan),
                sales_subscription_status = CASE WHEN $27::boolean THEN $28 ELSE sales_subscription_status END,
                sales_trial_ends_on = CASE
                    WHEN NOT $27::boolean THEN sales_trial_ends_on
                    WHEN COALESCE($28, sales_subscription_status) = 'trial' THEN $29
                    ELSE NULL
                END,
                sales_monthly_price_eur = CASE WHEN $30::boolean THEN $31 ELSE sales_monthly_price_eur END,
                sales_billing_cycle = COALESCE($32, sales_billing_cycle),
                updated_at = CURRENT_TIMESTAMP
             WHERE id = $33 RETURNING *`,
            [
                name, 
                address || null, 
                logo_url || null, 
                subscription_start_date || null, 
                subscription_end_date || null,
                finalColorSchemeId || null, 
                is_active, 
                url_businesspartner || null, 
                dashboard_title || null,
                level_1_name || null, 
                level_2_name || null, 
                level_3_name || null, 
                email || null,
                storage_tier || null, 
                newLimit || null, 
                !!allow_automated_newsletter,
                briefing_frequency || null,
                dashboard_focus || 'information',
                slug || null,
                newsletter_delivery_mode,
                newsletter_export_email || null,
                newsletter_external_signup_url || null,
                Number(newsletter_recipient_limit) || 250,
                tenantModules,
                tenantDefaultWorkspace,
                tenantSalesPlan,
                salesLifecycleWasProvided,
                tenantSalesSubscriptionStatus,
                tenantSalesTrialEndsOn,
                salesMonthlyPriceWasProvided,
                tenantSalesMonthlyPrice,
                tenantSalesBillingCycle,
                id 
            ]
        );

        if (updatedBpResult.rows.length === 0) {
            throw new Error('Business Partner not found.');
        }

        if (tenantSalesPlan === 'basic') {
            await client.query(
                `UPDATE account_radar_settings
                 SET digest_frequency = 'weekly', updated_at = CURRENT_TIMESTAMP
                 WHERE business_partner_id = $1
                   AND digest_frequency IN ('daily', 'weekdays')`,
                [id]
            );
            await client.query(
                `DELETE FROM account_radar_digest_recipients recipient
                 WHERE recipient.business_partner_id = $1
                   AND recipient.user_id NOT IN (
                     SELECT kept.user_id
                     FROM account_radar_digest_recipients kept
                     WHERE kept.business_partner_id = $1
                     ORDER BY kept.created_at, kept.user_id
                     LIMIT 3
                   )`,
                [id]
            );
        }

        // 1. Regions-Logik
        if (region_ids !== undefined) {
            await client.query('DELETE FROM business_partner_regions WHERE business_partner_id = $1', [id]);
            if (Array.isArray(region_ids) && region_ids.length > 0) {
                for (const region_id of region_ids) {
                    const isDefault = region_id === default_region_id;
                    await client.query(
                        'INSERT INTO business_partner_regions (business_partner_id, region_id, is_default) VALUES ($1, $2, $3)', 
                        [id, region_id, isDefault]
                    );
                }
            }
        }
        
        // 2. Branchen/Kategorien-Logik
        if (category_ids !== undefined) {
            await client.query('DELETE FROM business_partner_categories WHERE business_partner_id = $1', [id]);
            if (Array.isArray(category_ids) && category_ids.length > 0) {
                for (const category_id of category_ids) {
                    await client.query(
                        'INSERT INTO business_partner_categories (business_partner_id, category_id) VALUES ($1, $2)', 
                        [id, category_id]
                    );
                }
            }
        }

        await client.query('COMMIT');
        res.json(updatedBpResult.rows[0]);

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error updating business partner:', err.message);
        
        if (err.constraint === 'business_partners_slug_key') {
            return res.status(409).json({ message: 'Dieses Kürzel (Slug) wird bereits verwendet. Bitte wählen Sie ein anderes.' });
        }
        res.status(500).json({ message: 'Fehler beim Aktualisieren des Partners.', error: err.message });
    } finally {
        client.release();
    }
};

exports.deleteBusinessPartner = async (req, res) => {
    const { id } = req.params;
    if (!isValidUUID(id)) return res.status(400).json({ message: 'Invalid Business Partner ID format.' });

    try {
        const result = await db.query('DELETE FROM business_partners WHERE id = $1 RETURNING id', [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Business Partner not found.' });
        }
        res.json({ message: 'Business Partner deleted successfully' });
    } catch (err) {
        console.error('Error deleting business partner:', err.message);
        res.status(500).send('Server error');
    }
};

exports.getAllColorSchemes = async (req, res) => {
    try {
        // Hinweis: Wir ziehen auch die Custom-Themes, 
        // im Frontend filtern wir "Custom -" für die Dropdowns aber heraus.
        const result = await db.query(`
            SELECT id, name, primary_color, secondary_color, 
                   text_color_light, background_color_light, paper_color_light, primary_text_color 
            FROM color_schemes 
            ORDER BY name ASC
        `);
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching all color schemes:', err.message);
        res.status(500).send('Server error');
    }
};

exports.getAllRegions = async (req, res) => {
    try {
        const result = await db.query('SELECT id, name, code FROM regions ORDER BY name ASC');
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching all regions:', err.message);
        res.status(500).send('Server error');
    }
};

exports.getBusinessPartnerUserStats = async (req, res) => {
    const { id } = req.params;
    if (!isValidUUID(id)) return res.status(400).json({ message: 'Invalid ID format.' });
    try {
        const statsQuery = `
            SELECT
                is_active,
                COUNT(*) as count
            FROM users
            WHERE business_partner_id = $1
            GROUP BY is_active;
        `;
        const result = await db.query(statsQuery, [id]);

        const stats = {
            active: 0,
            inactive: 0
        };

        result.rows.forEach(row => {
            if (row.is_active) {
                stats.active = parseInt(row.count, 10);
            } else {
                stats.inactive = parseInt(row.count, 10);
            }
        });

        res.json(stats);
    } catch (err) {
        console.error('Error fetching user stats for business partner:', err.message);
        res.status(500).send('Server error');
    }
};

exports.getMembershipLevels = async (req, res) => {
    const { id } = req.params;
    try {
        const result = await db.query(
            'SELECT level_1_name, level_2_name, level_3_name FROM business_partners WHERE id = $1',
            [id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Business Partner not found.' });
        }
        res.json(result.rows[0]);
    } catch (err) {
        console.error('Error fetching membership levels:', err.message);
        res.status(500).send('Server error');
    }
};

exports.updateBusinessPartnerTier = async (req, res) => {
    const { id } = req.params;
    const { tier } = req.body;

    const validTiers = {
        'free': 0,
        'standard': 104857600,    // 100 MB
        'premium': 1048576000     // 1 GB
    };

    if (!validTiers.hasOwnProperty(tier)) {
        return res.status(400).json({ message: 'Ungültiger Tier-Name.' });
    }

    const newLimit = validTiers[tier];

    try {
        const result = await db.query(
            `UPDATE business_partners 
             SET storage_tier = $1, storage_limit_bytes = $2 
             WHERE id = $3 
             RETURNING id, name, storage_tier, storage_limit_bytes`,
            [tier, newLimit, id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Business Partner nicht gefunden.' });
        }

        res.status(200).json({ 
            message: `Tier für ${result.rows[0].name} erfolgreich auf '${tier}' aktualisiert.`,
            businessPartner: result.rows[0]
        });

    } catch (err) {
        console.error('Fehler beim Aktualisieren des Business Partner Tiers:', err.message);
        res.status(500).send('Serverfehler');
    }
};

exports.uploadBusinessPartnerLogo = async (req, res) => {
    const file = req.file;
    if (!file) {
        return res.status(400).json({ message: "Keine Datei hochgeladen." });
    }

    const fileExtension = file.originalname.split('.').pop();
    const uniqueFileName = `${uuidv4()}.${fileExtension}`;
    const storagePath = `logos/${uniqueFileName}`; // Zielordner in S3

    try {
        const params = {
            Bucket: process.env.AWS_S3_BUCKET_NAME,
            Key: storagePath,
            Body: file.buffer,
            ContentType: file.mimetype
        };

        await s3Client.send(new PutObjectCommand(params));

        const publicUrl = `https://${process.env.AWS_S3_BUCKET_NAME}.s3.${process.env.AWS_S3_REGION}.amazonaws.com/${storagePath}`;

        return res.status(200).json({
            message: "Logo erfolgreich hochgeladen.",
            url: publicUrl
        });

    } catch (error) {
        console.error("Fehler beim Logo-Upload:", error);
        return res.status(500).json({ message: "Fehler beim Server während des Logo-Uploads." });
    }
};

function validateNewsletterDelivery({ newsletter_delivery_mode, newsletter_export_email, newsletter_external_signup_url, newsletter_recipient_limit, email }) {
    if (!['mobiliti', 'export', 'external'].includes(newsletter_delivery_mode)) {
        return 'Ungültiger Newsletter-Versandmodus.';
    }
    const limit = Number(newsletter_recipient_limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100000) {
        return 'Das Empfängerlimit muss zwischen 1 und 100.000 liegen.';
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (newsletter_export_email && !emailRegex.test(String(newsletter_export_email).trim())) {
        return 'Die zentrale Newsletter-E-Mail-Adresse ist ungültig.';
    }
    if (newsletter_delivery_mode === 'export' && !newsletter_export_email && !email) {
        return 'Für den Exportmodus ist eine zentrale Mandantenadresse erforderlich.';
    }
    if (newsletter_external_signup_url) {
        try {
            const url = new URL(newsletter_external_signup_url);
            if (!['http:', 'https:'].includes(url.protocol)) throw new Error('protocol');
        } catch (_) {
            return 'Die externe Newsletter-Anmelde-URL ist ungültig.';
        }
    }
    if (newsletter_delivery_mode === 'external' && !newsletter_external_signup_url) {
        return 'Für externen Versand ist die Newsletter-Anmelde-URL erforderlich.';
    }
    return null;
}
