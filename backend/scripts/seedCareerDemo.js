// Explicit DEV-only demo data. Never called by migrations, deployment or cron.
const { createHash } = require('node:crypto');
const db = require('../config/db');
const { fingerprint } = require('../utils/careerContent');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function demoId(partnerId, index) {
    const hex = createHash('sha256').update(`mobiliti:career-demo:v1:${partnerId}:${index}`).digest('hex').slice(0, 32);
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20)}`;
}

async function run() {
    const environments = ['NODE_ENV', 'APP_ENV', 'DEPLOY_ENV', 'REPORT_ENV'].map(key => String(process.env[key] || '').trim().toLowerCase());
    if (environments.some(value => ['production', 'prod', 'live'].includes(value))) {
        throw new Error('Demo-Personalien dürfen ausschließlich in DEV angelegt werden.');
    }
    const args = process.argv.slice(2);
    if (args.length && (args.length !== 2 || args[0] !== '--partner-id' || !UUID.test(args[1]))) {
        throw new Error('Aufruf: node scripts/seedCareerDemo.js [--partner-id UUID]');
    }
    const client = await db.connect();
    try {
        const database = (await client.query('SELECT current_database() AS name')).rows[0].name;
        if (!/(?:dev|local|lokal|test)/i.test(database)) {
            throw new Error('STOPP: Datenbankname kennzeichnet keine DEV-/Test-Datenbank.');
        }
        await client.query('BEGIN');
        const partner = (await client.query(`SELECT id,name FROM business_partners
            WHERE is_active=true AND 'content'=ANY(enabled_modules)
            AND (CASE WHEN $1::uuid IS NULL THEN slug='fva' ELSE id=$1 END)`, [args[1] || null])).rows[0];
        if (!partner) throw new Error('Aktiver Content-Mandant nicht gefunden. Ohne Parameter wird Fuhrparkverband Austria (fva) verwendet.');
        // Serializes repeated seed runs; existing or withdrawn demos are never overwritten.
        await client.query('SELECT id FROM business_partners WHERE id=$1 FOR UPDATE', [partner.id]);
        const admin = (await client.query(`SELECT id FROM users WHERE business_partner_id=$1
            AND role='admin' AND is_active=true ORDER BY id LIMIT 1`, [partner.id])).rows[0];
        if (!admin) throw new Error('Für diesen Mandanten ist kein aktiver Admin vorhanden.');

        const samples = [
            { person_name: 'Anna Muster (DEMO)', organization: 'Muster Mobilität GmbH (DEMO)', role_title: 'Geschäftsführerin', kind: 'appointment', days: 14, status: 'approved', summary: 'Anna Muster übernimmt die Geschäftsführung und baut nachhaltige Mobilitätsangebote aus.' },
            { person_name: 'Lukas Beispiel (DEMO)', organization: 'Beispiel Fleet Solutions (DEMO)', role_title: 'Leiter Flottenmanagement', kind: 'change', days: -7, status: 'approved', summary: 'Lukas Beispiel wechselt ins Flottenmanagement und verantwortet die Elektrifizierung der Firmenflotte.' },
            { person_name: 'Maria Demo (DEMO)', organization: 'Demo Ladeinfrastruktur GmbH (DEMO)', role_title: 'Bereichsleiterin Kundenservice', kind: 'promotion', days: null, status: 'approved', summary: 'Maria Demo wird zur Bereichsleiterin befördert. Das Startdatum ist noch nicht bekannt.' },
            { person_name: 'Jonas Test (DEMO)', organization: 'Test Mobilitätsverband (DEMO)', role_title: 'Geschäftsführer', kind: 'departure', days: 30, status: 'pending', summary: 'Jonas Test verabschiedet sich aus seiner bisherigen Funktion. Diese Meldung wartet auf redaktionelle Prüfung.' },
            { person_name: 'Emma Fiktiv (DEMO)', organization: 'Fiktiv Telematik GmbH (DEMO)', role_title: 'Leiterin Vertrieb', kind: 'appointment', days: 21, status: 'pending', summary: 'Emma Fiktiv übernimmt die Vertriebsleitung. Name, Funktion und Startdatum sind im Freigabe-Workflow zu prüfen.' },
        ];
        let inserted = 0;
        const ids = [];
        for (const [index, sample] of samples.entries()) {
            const id = demoId(partner.id, index);
            ids.push(id);
            const effectiveDate = sample.days === null ? null : (await client.query("SELECT (CURRENT_DATE+$1::int)::text AS value", [sample.days])).rows[0].value;
            const entry = { ...sample, effective_date: effectiveDate };
            const result = await client.query(`INSERT INTO career_entries(
                id,business_partner_id,author_id,person_name,organization,role_title,kind,effective_date,
                published_date,summary,status,requested_public,public_approved,fingerprint,reviewed_by,review_note)
                VALUES($1,$2,$3,$4,$5,$6,$7,$8,CURRENT_DATE,$9,$10,false,false,$11,$12,$13)
                ON CONFLICT(id) DO NOTHING RETURNING id`, [
                id, partner.id, admin.id, sample.person_name, sample.organization, sample.role_title, sample.kind,
                effectiveDate, `FIKTIVE DEV-DEMO – keine echte Personalmeldung. ${sample.summary}`, sample.status,
                fingerprint(entry), sample.status === 'approved' ? admin.id : null,
                'Fiktive DEV-Demodaten für Menschen & Karriere. Nur intern; keine Quelle, kein Personenfoto und keine KI-Auswertung. Über „Eintrag zurückziehen“ ausblenden.',
            ]);
            inserted += result.rowCount;
        }
        const rows = (await client.query(`SELECT person_name,status,requested_public,public_approved
            FROM career_entries WHERE business_partner_id=$1 AND id=ANY($2::uuid[]) ORDER BY person_name`, [partner.id, ids])).rows;
        if (rows.length !== 5) throw new Error('Demo-Datensatz konnte nicht vollständig angelegt werden.');
        await client.query('COMMIT');
        console.log(JSON.stringify({ database, partner: partner.name, partnerId: partner.id, newlyInserted: inserted, entries: rows, aiCalls: 0 }, null, 2));
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

run().catch(error => { console.error('[seed:career-demo]', error.message); process.exitCode = 1; }).finally(() => db.end());
