const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const DEFAULT_FILE = path.resolve(__dirname, '..', 'data', 'fleet-software-de-at-2026-08-28.json');
const ALLOWED_SCOPES = new Set(['country', 'europe', 'worldwide']);
const ALLOWED_APPROVAL = new Set(['pending', 'approved']);
const PRICING_MODEL_ALIASES = new Map([
    ['kostenlos', 'Kostenlos'],
    ['freemium', 'Freemium'],
    ['abonnement', 'Abonnement'],
    ['abo', 'Abonnement'],
    ['pro nutzer', 'Abonnement'],
    ['pro fahrzeug', 'Abonnement'],
    ['pro standort', 'Abonnement'],
    ['einmalkauf', 'Einmalkauf / Lizenz'],
    ['lizenz', 'Einmalkauf / Lizenz'],
    ['einmalkauf / lizenz', 'Einmalkauf / Lizenz'],
    ['nutzungsabhängig', 'Nutzungsabhängig'],
    ['transaktionsabhängig', 'Nutzungsabhängig'],
    ['modulabhängig', 'Nutzungsabhängig'],
    ['dienstabhängig', 'Nutzungsabhängig'],
    ['auf anfrage', 'Auf Anfrage'],
]);

function normalizePricingModel(value) {
    const raw = String(value || '').trim();
    if (!raw) return null;
    if (raw.includes('/')) {
        if (/transaktionsabhängig|modulabhängig|dienstabhängig/i.test(raw)) return 'Nutzungsabhängig';
        if (/lizenz|einmalkauf/i.test(raw)) return 'Einmalkauf / Lizenz';
        if (/abonnement|abo/i.test(raw)) return 'Abonnement';
    }
    return PRICING_MODEL_ALIASES.get(raw.toLocaleLowerCase('de-DE')) || 'Auf Anfrage';
}

function parseArguments(argv) {
    const args = {
        mode: 'validate-only',
        file: DEFAULT_FILE,
        partnerSlug: null,
        forcePending: false,
    };

    for (let index = 0; index < argv.length; index += 1) {
        const value = argv[index];
        if (value === '--validate-only') args.mode = 'validate-only';
        else if (value === '--dry-run') args.mode = 'dry-run';
        else if (value === '--apply') args.mode = 'apply';
        else if (value === '--force-pending') args.forcePending = true;
        else if (value === '--file') args.file = path.resolve(argv[++index] || '');
        else if (value === '--partner-slug') args.partnerSlug = String(argv[++index] || '').trim();
        else throw new Error(`Unbekanntes Argument: ${value}`);
    }

    return args;
}

function requireText(value, label, maxLength = null) {
    if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} fehlt.`);
    if (maxLength && value.trim().length > maxLength) {
        throw new Error(`${label} ist länger als ${maxLength} Zeichen.`);
    }
    return value.trim();
}

function requireHttpsUrl(value, label) {
    const normalized = requireText(value, label, 2048);
    const parsed = new URL(normalized);
    if (parsed.protocol !== 'https:') throw new Error(`${label} muss HTTPS verwenden.`);
    return normalized;
}

function validateDataset(dataset) {
    if (!dataset || typeof dataset !== 'object') throw new Error('Datensatz ist kein JSON-Objekt.');
    if (dataset.schema_version !== 1) throw new Error('Unbekannte schema_version.');
    requireText(dataset.dataset_id, 'dataset_id', 120);
    requireText(dataset.target_partner_slug, 'target_partner_slug', 120);
    if (!ALLOWED_APPROVAL.has(dataset.approval_status)) throw new Error('approval_status muss pending oder approved sein.');
    if (!Array.isArray(dataset.providers) || !Array.isArray(dataset.products)) {
        throw new Error('providers und products müssen Arrays sein.');
    }
    if (dataset.products.length !== 50) throw new Error(`Es werden exakt 50 Produkte erwartet, gefunden: ${dataset.products.length}.`);

    const providerKeys = new Set();
    const providerNames = new Set();
    for (const provider of dataset.providers) {
        const key = requireText(provider.key, 'Provider-Key', 120);
        const name = requireText(provider.name, `Provider ${key}: Name`, 255);
        requireText(provider.description, `Provider ${key}: Beschreibung`);
        requireHttpsUrl(provider.website_url, `Provider ${key}: Website`);
        requireHttpsUrl(provider.source_url, `Provider ${key}: Quelle`);
        if (providerKeys.has(key)) throw new Error(`Doppelter Provider-Key: ${key}`);
        if (providerNames.has(name.toLocaleLowerCase('de-DE'))) throw new Error(`Doppelter Provider-Name: ${name}`);
        providerKeys.add(key);
        providerNames.add(name.toLocaleLowerCase('de-DE'));
    }

    const productNumbers = new Set();
    const productKeys = new Set();
    const categorySlugs = new Set();
    for (const product of dataset.products) {
        if (!Number.isInteger(product.no) || product.no < 1) throw new Error('Jedes Produkt benötigt eine positive Ganzzahl als no.');
        if (productNumbers.has(product.no)) throw new Error(`Doppelte Produktnummer: ${product.no}`);
        productNumbers.add(product.no);
        if (!providerKeys.has(product.provider_key)) throw new Error(`Unbekannter Provider-Key: ${product.provider_key}`);
        const name = requireText(product.name, `Produkt ${product.no}: Name`, 255);
        requireText(product.short_description, `Produkt ${product.no}: Kurzbeschreibung`, 500);
        requireText(product.description, `Produkt ${product.no}: Beschreibung`);
        requireHttpsUrl(product.product_url, `Produkt ${product.no}: Produkt-URL`);
        requireHttpsUrl(product.source_url, `Produkt ${product.no}: Quelle`);
        if (!ALLOWED_SCOPES.has(product.coverage_scope)) throw new Error(`Produkt ${product.no}: ungültige Abdeckung.`);
        const countryCodes = product.country_codes || dataset.defaults?.country_codes;
        if (!Array.isArray(countryCodes) || countryCodes.length === 0 || countryCodes.some((code) => !/^[A-Z]{2}$/.test(code))) {
            throw new Error(`Produkt ${product.no}: ungültige ISO-Ländercodes.`);
        }
        if (!Array.isArray(product.category_slugs) || product.category_slugs.length === 0) {
            throw new Error(`Produkt ${product.no}: mindestens eine Kategorie ist erforderlich.`);
        }
        product.category_slugs.forEach((slug) => categorySlugs.add(requireText(slug, `Produkt ${product.no}: Kategorie`, 100)));
        const identity = `${product.provider_key}|${name.toLocaleLowerCase('de-DE')}`;
        if (productKeys.has(identity)) throw new Error(`Doppeltes Produkt: ${product.provider_key} / ${name}`);
        productKeys.add(identity);
    }

    const expectedNumbers = Array.from({ length: 50 }, (_, index) => index + 1);
    if (expectedNumbers.some((number) => !productNumbers.has(number))) throw new Error('Produktnummern müssen lückenlos 1 bis 50 sein.');

    return {
        providers: dataset.providers.length,
        products: dataset.products.length,
        categories: categorySlugs.size,
        categorySlugs: [...categorySlugs].sort(),
    };
}

function createPool() {
    if (process.env.NODE_ENV !== 'production') {
        require('dotenv').config({ path: path.resolve(__dirname, '..', '..', '.env') });
    }
    const poolConfig = process.env.DATABASE_URL
        ? { connectionString: process.env.DATABASE_URL }
        : {
            user: process.env.DB_USER,
            host: process.env.DB_HOST,
            database: process.env.DB_DATABASE,
            password: process.env.DB_PASSWORD,
            port: Number(process.env.DB_PORT),
        };
    return new Pool(poolConfig);
}

async function findOrCreateProvider(client, provider, counters) {
    const existing = await client.query(
        'SELECT id FROM directory_providers WHERE LOWER(BTRIM(name)) = LOWER(BTRIM($1)) ORDER BY created_at ASC LIMIT 2',
        [provider.name],
    );
    if (existing.rows.length > 1) throw new Error(`Provider-Name ist mehrfach vorhanden: ${provider.name}`);
    if (existing.rows[0]) {
        counters.providersExisting += 1;
        return existing.rows[0].id;
    }

    const inserted = await client.query(
        `INSERT INTO directory_providers
            (name, description, logo_url, website_url, contact_email, contact_phone, is_public, subscription_tier)
         VALUES ($1, $2, NULL, $3, NULL, NULL, FALSE, 'free')
         RETURNING id`,
        [provider.name, provider.description, provider.website_url],
    );
    counters.providersCreated += 1;
    return inserted.rows[0].id;
}

async function ensureTenantRelation(client, providerId, businessPartnerId, counters) {
    const relation = await client.query(
        `SELECT 1 FROM directory_provider_mandant_settings
         WHERE provider_id = $1 AND business_partner_id = $2`,
        [providerId, businessPartnerId],
    );
    if (relation.rows[0]) {
        counters.tenantRelationsExisting += 1;
        return;
    }
    await client.query(
        `INSERT INTO directory_provider_mandant_settings
            (provider_id, business_partner_id, status, is_recommended, is_tenant_entry)
         VALUES ($1, $2, 'active', FALSE, FALSE)`,
        [providerId, businessPartnerId],
    );
    counters.tenantRelationsCreated += 1;
}

async function importDataset(client, dataset, partnerSlug) {
    const partnerResult = await client.query(
        'SELECT id, name, slug FROM business_partners WHERE LOWER(slug) = LOWER($1) LIMIT 2',
        [partnerSlug],
    );
    if (partnerResult.rows.length !== 1) {
        throw new Error(`Mandant-Slug ${partnerSlug} wurde nicht eindeutig gefunden.`);
    }
    const partner = partnerResult.rows[0];

    const categoryResult = await client.query(
        'SELECT id, slug FROM software_categories WHERE slug = ANY($1::text[])',
        [[...new Set(dataset.products.flatMap((product) => product.category_slugs))]],
    );
    const categoriesBySlug = new Map(categoryResult.rows.map((row) => [row.slug, row.id]));
    const missingCategories = [...new Set(dataset.products.flatMap((product) => product.category_slugs))]
        .filter((slug) => !categoriesBySlug.has(slug));
    if (missingCategories.length) throw new Error(`DB-Kategorien fehlen: ${missingCategories.join(', ')}`);

    const counters = {
        providersCreated: 0,
        providersExisting: 0,
        tenantRelationsCreated: 0,
        tenantRelationsExisting: 0,
        productsCreated: 0,
        productsExisting: 0,
        categoryRelationsCreated: 0,
    };
    const providerIds = new Map();
    for (const provider of dataset.providers) {
        const providerId = await findOrCreateProvider(client, provider, counters);
        providerIds.set(provider.key, providerId);
        await ensureTenantRelation(client, providerId, partner.id, counters);
    }

    for (const product of dataset.products) {
        const providerId = providerIds.get(product.provider_key);
        const existing = await client.query(
            `SELECT id FROM software_tools
             WHERE business_partner_id = $1 AND provider_id = $2
               AND LOWER(BTRIM(name)) = LOWER(BTRIM($3))
             LIMIT 2`,
            [partner.id, providerId, product.name],
        );
        if (existing.rows.length > 1) throw new Error(`Software ist mehrfach vorhanden: ${product.name}`);
        if (existing.rows[0]) {
            counters.productsExisting += 1;
            continue;
        }

        const inserted = await client.query(
            `INSERT INTO software_tools (
                business_partner_id, provider_id, name, short_description, description,
                product_url, logo_url, coverage_scope, country_codes, deployment_model,
                pricing_model, target_group, status, is_active, is_public, is_featured
             ) VALUES (
                $1, $2, $3, $4, $5,
                $6, NULL, $7, $8::text[], $9,
                $10, $11, 'draft', TRUE, FALSE, FALSE
             ) RETURNING id`,
            [
                partner.id,
                providerId,
                product.name,
                product.short_description,
                product.description,
                product.product_url,
                product.coverage_scope,
                product.country_codes || dataset.defaults?.country_codes || ['AT', 'DE'],
                product.deployment_model || null,
                normalizePricingModel(product.pricing_model),
                product.target_group || null,
            ],
        );
        const softwareId = inserted.rows[0].id;
        counters.productsCreated += 1;

        for (const slug of product.category_slugs) {
            await client.query(
                `INSERT INTO software_tool_categories (software_tool_id, category_id)
                 VALUES ($1, $2)`,
                [softwareId, categoriesBySlug.get(slug)],
            );
            counters.categoryRelationsCreated += 1;
        }
    }

    return { datasetId: dataset.dataset_id, partner, ...counters };
}

async function main() {
    const args = parseArguments(process.argv.slice(2));
    if (!fs.existsSync(args.file)) throw new Error(`Datei nicht gefunden: ${args.file}`);
    const dataset = JSON.parse(fs.readFileSync(args.file, 'utf8'));
    const validation = validateDataset(dataset);
    const partnerSlug = args.partnerSlug || dataset.target_partner_slug;

    console.log(JSON.stringify({
        mode: args.mode,
        file: args.file,
        datasetId: dataset.dataset_id,
        approvalStatus: dataset.approval_status,
        targetPartnerSlug: partnerSlug,
        validation,
    }, null, 2));

    if (args.mode === 'validate-only') return;
    if (args.mode === 'apply' && dataset.approval_status !== 'approved' && !args.forcePending) {
        throw new Error('Import gesperrt: Excel-Prüfung noch nicht freigegeben. approval_status auf approved setzen oder bewusst --force-pending verwenden.');
    }

    const pool = createPool();
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const result = await importDataset(client, dataset, partnerSlug);
        if (args.mode === 'apply') await client.query('COMMIT');
        else await client.query('ROLLBACK');
        console.log(JSON.stringify({ ...result, committed: args.mode === 'apply' }, null, 2));
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
    } finally {
        client.release();
        await pool.end();
    }
}

main().catch((error) => {
    console.error(`[catalog:import:fleet] fehlgeschlagen: ${error.message}`);
    process.exitCode = 1;
});
