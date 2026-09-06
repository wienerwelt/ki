const { randomUUID } = require('crypto');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const { buildCalendarFeedUrl, buildCalendarIcs, parseCalendarToken } = require('../services/accountRadarCalendarService');
const { getRadarCampaignSummaries, createRadarManagementPdf } = require('../services/accountRadarDigestService');

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

async function main() {
  const managerResult = await db.query(`
    SELECT user_account.id, user_account.auth_version, user_account.business_partner_id
    FROM users user_account
    JOIN business_partners partner ON partner.id = user_account.business_partner_id
    WHERE user_account.is_active = TRUE
      AND LOWER(user_account.role) IN ('admin', 'assistenz', 'sales_manager')
      AND 'sales' = ANY(COALESCE(partner.enabled_modules, ARRAY['content']::text[]))
      AND partner.sales_subscription_status = 'active'
    ORDER BY CASE WHEN LOWER(user_account.role) = 'admin' THEN 0 ELSE 1 END, user_account.created_at
    LIMIT 1
  `);
  const manager = managerResult.rows[0];
  assert(manager, 'Kein aktiver Sales-Manager für den Kampagnen-Smoke-Test vorhanden.');

  const marker = `__campaign-smoke-${randomUUID()}`;
  let campaignId = null;
  try {
    const token = jwt.sign(
      { sub: manager.id, av: Number(manager.auth_version || 0) },
      process.env.JWT_SECRET,
      { expiresIn: '5m', algorithm: 'HS256' }
    );
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    const teamResponse = await fetch('http://127.0.0.1:5000/api/data/account-intelligence/team', { headers });
    const team = await teamResponse.json();
    assert(teamResponse.ok && Array.isArray(team), `Radar-Team konnte nicht geladen werden (${teamResponse.status}).`);
    assert(team.some((member) => member.id === manager.id), 'Der angemeldete Radar-Manager fehlt in der Teamliste.');
    assert(team.every((member) => Object.prototype.hasOwnProperty.call(member, 'email')
      && Object.prototype.hasOwnProperty.call(member, 'profile_image_url')), 'E-Mail oder Profilbild fehlt in den Radar-Teamdaten.');

    const createResponse = await fetch('http://127.0.0.1:5000/api/account-radar/campaigns', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        name: marker,
        objective: 'Mandantenspezifischer Smoke-Test',
        status: 'draft',
        target_accounts: 12,
        target_contacts: 8,
        target_meetings: 4,
        target_offers: 2,
        target_wins: 1,
        target_pipeline_eur: 25000,
      }),
    });
    const created = await createResponse.json();
    assert(createResponse.ok && created.id, `Kampagne konnte nicht angelegt werden (${createResponse.status}).`);
    campaignId = created.id;

    const listResponse = await fetch('http://127.0.0.1:5000/api/account-radar/campaigns', { headers });
    const campaigns = await listResponse.json();
    const listedCampaign = campaigns.find((campaign) => campaign.id === campaignId);
    assert(listResponse.ok && listedCampaign, 'Angelegte Kampagne fehlt in der mandantenspezifischen Liste.');
    assert(Number(listedCampaign.target_accounts) === 12 && Number(listedCampaign.target_pipeline_eur) === 25000,
      'Kampagnenziele fehlen in der mandantenspezifischen Liste.');
    assert(['contacted_count', 'meeting_count', 'offer_count', 'open_pipeline_value_eur'].every((field) => Object.prototype.hasOwnProperty.call(listedCampaign, field)),
      'Ist-Werte für das Kampagnen-Cockpit fehlen.');

    const invalidTargetResponse = await fetch(`http://127.0.0.1:5000/api/account-radar/campaigns/${campaignId}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ name: marker, objective: 'Ungültiges Ziel', status: 'draft', target_wins: -1 }),
    });
    assert(invalidTargetResponse.status === 400, 'Ein negatives Kampagnenziel wurde unerwartet akzeptiert.');

    const updateResponse = await fetch(`http://127.0.0.1:5000/api/account-radar/campaigns/${campaignId}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        name: marker, objective: 'Aktualisiert', status: 'active', target_accounts: 12,
        target_contacts: 8, target_meetings: 4, target_offers: 2, target_wins: 1,
        target_pipeline_eur: 30000,
      }),
    });
    const updated = await updateResponse.json();
    assert(updateResponse.ok && updated.status === 'active' && Number(updated.target_pipeline_eur) === 30000,
      `Kampagne konnte nicht aktualisiert werden (${updateResponse.status}).`);

    const assignmentResponse = await fetch(`http://127.0.0.1:5000/api/account-radar/campaigns/${campaignId}/assignments`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ account_ids: [], signal_ids: [] }),
    });
    assert(assignmentResponse.ok, `Leere Kampagnenzuordnung wurde abgelehnt (${assignmentResponse.status}).`);

    const detailResponse = await fetch(`http://127.0.0.1:5000/api/account-radar/campaigns/${campaignId}/detail?periodDays=90`, { headers });
    const campaignDetail = await detailResponse.json();
    assert(detailResponse.ok && campaignDetail.campaign?.id === campaignId && campaignDetail.periodDays === 90,
      `Kampagnen-Detailauswertung konnte nicht geladen werden (${detailResponse.status}).`);
    assert(Array.isArray(campaignDetail.timeline) && Array.isArray(campaignDetail.accounts)
      && Number.isFinite(campaignDetail.metrics?.openPipelineValueEur), 'Kampagnen-Detailauswertung ist unvollständig.');

    const campaignSummaries = await getRadarCampaignSummaries(manager.business_partner_id);
    const campaignSummary = campaignSummaries.find((campaign) => campaign.id === campaignId);
    assert(campaignSummary?.name === marker && campaignSummary.status === 'active', 'Die Kampagne fehlt in der mandantenspezifischen Report-Auswertung.');
    assert(Number.isFinite(campaignSummary.open_pipeline_value_eur), 'Die Kampagnen-Pipeline ist nicht numerisch auswertbar.');
    assert(campaignSummary.target_accounts === 12 && campaignSummary.target_pipeline_eur === 30000,
      'Die Kampagnenziele fehlen in der Report-Auswertung.');
    const digestPreviewResponse = await fetch('http://127.0.0.1:5000/api/account-radar/digest/preview?minRelevance=70', { headers });
    const digestPreview = await digestPreviewResponse.json();
    assert(digestPreviewResponse.ok && Number(digestPreview.campaignCount) >= 1
      && digestPreview.campaigns.some((campaign) => campaign.id === campaignId), 'Die Kampagne fehlt in der Daily-Radar-Vorschau.');
    const campaignPdf = await createRadarManagementPdf({
      partner: { id: manager.business_partner_id, name: 'Smoke Mandant', color_scheme: { primary_color: '#e31b23' } },
      signals: [],
      campaigns: campaignSummaries,
    });
    assert(Buffer.isBuffer(campaignPdf) && campaignPdf.length > 1500, 'Die Kampagnen-Kennzahlen fehlen in der Management-PDF.');

    const foreignAccountResult = await db.query(
      `SELECT id::text FROM business_partner_accounts
       WHERE business_partner_id <> $1
       LIMIT 1`,
      [manager.business_partner_id]
    );
    if (foreignAccountResult.rows[0]) {
      const foreignAssignmentResponse = await fetch(`http://127.0.0.1:5000/api/account-radar/campaigns/${campaignId}/assignments`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ account_ids: [foreignAccountResult.rows[0].id], signal_ids: [] }),
      });
      assert(foreignAssignmentResponse.status === 400, 'Ein mandantenfremder Account konnte einer Kampagne zugeordnet werden.');
    }

    const salesUserResult = await db.query(
      `SELECT id, auth_version FROM users
       WHERE business_partner_id = $1 AND is_active = TRUE AND LOWER(role) = 'sales_user'
       LIMIT 1`,
      [manager.business_partner_id]
    );
    if (salesUserResult.rows[0]) {
      const salesUserToken = jwt.sign(
        { sub: salesUserResult.rows[0].id, av: Number(salesUserResult.rows[0].auth_version || 0) },
        process.env.JWT_SECRET,
        { expiresIn: '5m', algorithm: 'HS256' }
      );
      const forbiddenCreateResponse = await fetch('http://127.0.0.1:5000/api/account-radar/campaigns', {
        method: 'POST',
        headers: { Authorization: `Bearer ${salesUserToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: `${marker}-forbidden`, status: 'draft' }),
      });
      assert(forbiddenCreateResponse.status === 403, 'Ein Sales-Nutzer konnte unerwartet eine Kampagne anlegen.');
    }

    const version = randomUUID();
    const feedUrl = buildCalendarFeedUrl(manager.business_partner_id, version);
    const encodedToken = feedUrl.match(/\/([^/]+)\.ics$/)?.[1];
    const parsed = parseCalendarToken(encodedToken);
    assert(parsed?.businessPartnerId === manager.business_partner_id && parsed?.version === version, 'Kalenderfeed-Signatur ist nicht reproduzierbar.');
    const ics = buildCalendarIcs({
      tenantName: 'Smoke Mandant',
      entries: [{
        id: randomUUID(),
        action_type: 'contact_planned',
        follow_up_at: new Date(Date.now() + 86_400_000).toISOString(),
        task_status: 'open',
        account_name: 'Test Account',
        contact_channel: 'email',
        assigned_user_name: 'Test User',
      }],
    });
    assert(ics.includes('BEGIN:VCALENDAR') && ics.includes('Test Account'), 'Kalenderfeed enthält kein gültiges Ereignis.');
    assert(!ics.includes('Mandantenspezifischer Smoke-Test'), 'Interne Kampagnendaten sind unerwartet im Kalenderfeed enthalten.');

    console.log('Account-Radar-Kampagnen und Kalenderfeed-Signatur: OK');
  } finally {
    if (campaignId) await db.query('DELETE FROM account_radar_campaigns WHERE id = $1', [campaignId]).catch(() => {});
    await db.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
