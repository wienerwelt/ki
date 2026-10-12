const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const db = require('../config/db');
const careerController = require('../controllers/careerController');
const companyController = require('../controllers/publicCompanyController');

const ids = {
    partner: randomUUID(),
    provider: randomUUID(),
    category: randomUUID(),
    article: randomUUID(),
    user: randomUUID(),
    career: randomUUID(),
};
const brand = `Testmobil ${ids.provider.slice(0, 8)}`;

function responseRecorder() {
    return {
        statusCode: 200,
        body: null,
        headers: {},
        status(code) { this.statusCode = code; return this; },
        set(name, value) { this.headers[name] = value; return this; },
        json(payload) { this.body = payload; return this; },
    };
}

async function invoke(handler, request) {
    const response = responseRecorder();
    await handler(request, response);
    return response;
}

async function cleanup() {
    await db.query('DELETE FROM career_entries WHERE id = $1', [ids.career]);
    await db.query('DELETE FROM users WHERE id = $1', [ids.user]);
    await db.query('DELETE FROM business_partners WHERE id = $1', [ids.partner]);
    await db.query('DELETE FROM directory_providers WHERE id = $1', [ids.provider]);
    await db.query('DELETE FROM scraped_content WHERE id = $1', [ids.article]);
    await db.query('DELETE FROM categories WHERE id = $1', [ids.category]);
}

async function run() {
    if (process.env.NODE_ENV === 'production' || process.env.APP_ENV === 'production') throw new Error('Nur für lokale DEV-Tests.');
    try {
        await db.query("INSERT INTO business_partners(id,name,slug,is_active,enabled_modules) VALUES($1,$2,$3,true,ARRAY['content'])", [ids.partner, `${brand} Mandant`, `company-job-${ids.partner.slice(0, 8)}`]);
        await db.query("INSERT INTO users(id,username,email,role,business_partner_id,is_active) VALUES($1,$2,$3,'assistenz',$4,true)", [ids.user, `company-job-${ids.user}`, `${ids.user}@example.invalid`, ids.partner]);
        await db.query("INSERT INTO categories(id,name,category_type) VALUES($1,$2,'content')", [ids.category, `${brand} News`]);
        await db.query('INSERT INTO career_tenant_settings(business_partner_id,enabled,public_enabled,category_ids) VALUES($1,true,true,ARRAY[$2::uuid])', [ids.partner, ids.category]);
        await db.query('INSERT INTO directory_providers(id,name,description,website_url,is_public) VALUES($1,$2,$3,$4,true)', [ids.provider, brand, 'Temporäres Testunternehmen', `https://${ids.provider.slice(0, 8)}.example.invalid`]);
        await db.query("INSERT INTO directory_provider_mandant_settings(provider_id,business_partner_id,status) VALUES($1,$2,'active')", [ids.provider, ids.partner]);

        const aliases = await db.query('SELECT alias, source FROM directory_provider_aliases WHERE provider_id=$1 ORDER BY confidence DESC', [ids.provider]);
        assert(aliases.rowCount >= 2, 'Unternehmensname und Domain wurden nicht als Suchaliase angelegt.');

        await db.query(
            `INSERT INTO scraped_content(id,title,summary,full_text,original_url,category_id,region,published_date,scraped_at,source_identifier)
             VALUES($1,$2,$3,$4,$5,$6,'AT',CURRENT_DATE,now(),'company-job-smoke')`,
            [ids.article, `${brand} sucht Flottenmanager (m/w/d)`, `Offene Stelle bei ${brand}. Bewerben Sie sich jetzt.`, `Karriere bei ${brand}: Wir suchen Verstärkung für das Fuhrpark-Team.`, `https://example.invalid/jobs/${ids.article}`, ids.category]
        );
        const mention = (await db.query('SELECT * FROM directory_provider_mentions WHERE provider_id=$1 AND scraped_content_id=$2', [ids.provider, ids.article])).rows[0];
        assert(mention && mention.match_status === 'automatic', 'Artikel wurde nicht deterministisch mit dem Unternehmen verknüpft.');
        const job = (await db.query('SELECT * FROM career_jobs WHERE business_partner_id=$1 AND source_article_id=$2', [ids.partner, ids.article])).rows[0];
        assert(job && job.status === 'pending' && job.provider_id === ids.provider, 'Stellenhinweis wurde nicht als interner Prüfvorschlag angelegt.');
        assert.equal(job.detection_method, 'article_rule');
        assert.equal((await db.query('SELECT COUNT(*)::int AS count FROM career_extractions WHERE article_id=$1', [ids.article])).rows[0].count, 0, 'Regelerkennung darf keine KI-Extraktion anlegen.');

        await db.query(
            `INSERT INTO career_entries(id,business_partner_id,author_id,person_name,organization,role_title,kind,summary,source_url,requested_public,status,fingerprint)
             VALUES($1,$2,$3,'Ada Beispiel',$4,'Leitung Flotte','appointment','Temporärer Verknüpfungstest',$5,true,'pending',$6)`,
            [ids.career, ids.partner, ids.user, brand, `https://example.invalid/people/${ids.career}`, ids.career]
        );
        assert.equal((await db.query('SELECT organization_provider_id FROM career_entries WHERE id=$1', [ids.career])).rows[0].organization_provider_id, ids.provider, 'Personalie wurde nicht mit dem Unternehmen verknüpft.');

        const publicBefore = await invoke(careerController.publicJobs, { query: { partnerId: ids.partner }, params: {} });
        assert.equal(publicBefore.body.jobs.length, 0, 'Automatische Stellenhinweise dürfen nicht ungeprüft öffentlich erscheinen.');
        const approved = await invoke(careerController.reviewJob, {
            user: { id: ids.user, role: 'assistenz', business_partner_id: ids.partner },
            params: { id: job.id }, query: {},
            body: {
                ...job,
                published_date: job.published_date ? new Date(job.published_date).toISOString().slice(0, 10) : '',
                valid_until: job.valid_until ? new Date(job.valid_until).toISOString().slice(0, 10) : '',
                version: job.version,
                status: 'approved',
                public_approved: true,
                review_note: 'Smoke-Test',
            },
        });
        assert.equal(approved.statusCode, 200, 'Redaktionelle Jobfreigabe ist fehlgeschlagen.');
        const publicAfter = await invoke(careerController.publicJobs, { query: { partnerId: ids.partner }, params: {} });
        assert.equal(publicAfter.body.jobs.length, 1, 'Freigegebener Branchenjob fehlt öffentlich.');

        const companySearch = await invoke(companyController.search, { query: { partnerId: ids.partner, q: brand } });
        assert.equal(companySearch.statusCode, 200);
        assert.equal(companySearch.body.companies[0]?.id, ids.provider, 'Unternehmenssuche findet das verknüpfte Unternehmen nicht.');
        assert(companySearch.body.companies[0].article_count >= 1 && companySearch.body.companies[0].job_count >= 1, 'Unternehmenszähler sind unvollständig.');
        const fallbackSearch = await invoke(companyController.search, { query: { partnerId: ids.partner, q: 'Flottenmanager' } });
        assert.equal(fallbackSearch.body.companies.length, 0);
        assert.equal(fallbackSearch.body.fallback_reason, 'no_company_match');
        assert.equal(fallbackSearch.body.fallback_articles[0]?.id, ids.article, 'Artikelfallback greift nicht, wenn kein Unternehmen gefunden wird.');

        console.log('Unternehmenssuche & Branchenjobs: Aliase, Artikelverknüpfung, KI-freie Erkennung, Moderation, Public-Ausgabe und Fallback OK.');
    } finally {
        await cleanup();
    }
}

run()
    .catch((error) => { console.error('[smoke:company-career-jobs]', error); process.exitCode = 1; })
    .finally(() => db.end());
