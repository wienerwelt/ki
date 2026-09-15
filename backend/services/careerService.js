const db = require('../config/db');
const { callOpenAI } = require('./aiService');
const c = require('../utils/careerContent');
const { createNotificationInternal } = require('../controllers/notificationController');
const RESERVE = 6000; // UTF-8 prompt bytes + output + message framing; conservative upper bound.

async function notifyReview(partnerId, id, client = db) {
 const { rows } = await client.query("SELECT id FROM users WHERE is_active=true AND (role='admin' OR (business_partner_id=$1 AND role='assistenz'))",[partnerId]);
 for (const u of rows) await createNotificationInternal(u.id,'career_review','Karriere-Update prüfen','Unter Community → Menschen & Karriere wartet eine Personalie auf Freigabe.',id,client);
}
async function distribute(extraction, article, onlyTenant = null) {
 const tenants = await db.query(`SELECT cs.business_partner_id FROM career_tenant_settings cs
 JOIN business_partners bp ON bp.id=cs.business_partner_id
 WHERE cs.enabled AND bp.is_active AND 'content'=ANY(bp.enabled_modules)
 AND $1::uuid=ANY(cs.category_ids) AND ($2::uuid IS NULL OR cs.business_partner_id=$2)
 AND (NOT EXISTS(SELECT 1 FROM business_partner_regions WHERE business_partner_id=bp.id)
 OR EXISTS(SELECT 1 FROM business_partner_regions br JOIN regions r ON r.id=br.region_id
 WHERE br.business_partner_id=bp.id AND (r.code=$3 OR $3 IN ('EU','GLOBAL','WORLD'))))`,[article.category_id,onlyTenant,article.region]);
 for (const tenant of tenants.rows) {
  for (const [index,item] of extraction.items.entries()) {
   const result = await db.query(`INSERT INTO career_entries(business_partner_id,extraction_id,item_index,person_name,organization,role_title,
   kind,effective_date,published_date,summary,source_url,fingerprint,review_note,requested_public)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,true) ON CONFLICT DO NOTHING RETURNING id`,
   [tenant.business_partner_id,extraction.id,index,item.person_name,item.organization,item.role_title,item.kind,item.effective_date,
    article.published_date,item.summary,c.safeUrl(article.original_url),c.fingerprint(item),`KI-Vorschlag: Namen, Funktion und Startdatum am Original prüfen. Beleg: ${item.evidence}`]);
   if (result.rows[0]) await notifyReview(tenant.business_partner_id,result.rows[0].id);
  }
 }
}
async function reserve(id) {
 const client = await db.connect();
 try {
  await client.query('BEGIN');
  const s = (await client.query('SELECT * FROM career_ai_settings FOR UPDATE')).rows[0];
  if (!s?.enabled) { await client.query('ROLLBACK'); return false; }
  const budget = (await client.query(`SELECT COUNT(*) FILTER(WHERE attempted_at>=CURRENT_DATE)::int AS calls,
  COALESCE(SUM(CASE WHEN e.status='completed' AND u.status='completed' THEN u.total_tokens ELSE e.reserved_tokens END),0)::bigint AS tokens
  FROM career_extractions e LEFT JOIN ai_call_usage u ON u.id=e.usage_id
  WHERE attempted_at >= date_trunc('month',now())`,[])).rows[0];
  if (budget.calls>=s.daily_calls || Number(budget.tokens)+RESERVE>s.monthly_tokens) { await client.query('ROLLBACK'); return false; }
  const claimed = await client.query("UPDATE career_extractions SET status='running',reserved_tokens=$2,attempted_at=now() WHERE id=$1 AND status='waiting' RETURNING id",[id,RESERVE]);
  await client.query('COMMIT'); return claimed.rowCount===1;
 } catch(e) {await client.query('ROLLBACK');throw e;} finally {client.release();}
}
async function processArticle(article, onlyTenant = null) {
 const text = c.articleText(article); const contentHash = c.hash(text);
 const candidate = c.SIGNAL.test(text);
 let extraction = (await db.query(`INSERT INTO career_extractions(content_hash,prompt_version,article_id,status)
 VALUES($1,$2,$3,$4) ON CONFLICT(content_hash,prompt_version) DO UPDATE SET content_hash=EXCLUDED.content_hash RETURNING *`,
 [contentHash,c.VERSION,article.id,candidate ? 'waiting' : 'excluded'])).rows[0];
 await db.query(`INSERT INTO career_article_checks(article_id,content_hash) VALUES($1,$2)
 ON CONFLICT(article_id) DO UPDATE SET content_hash=EXCLUDED.content_hash,checked_at=now()`,[article.id,contentHash]);
 if (extraction.status==='completed') {await distribute(extraction,article,onlyTenant);return 'cached';}
 if (!candidate || extraction.status!=='waiting' || !process.env.OPENAI_API_KEY || !(await reserve(extraction.id))) return extraction.status;
 try {
  const result = await callOpenAI(c.promptFor(text),'gpt-4o-mini',{
   responseFormat:{type:'json_object'}, maxOutputTokens:400,temperature:0,noRetries:true,
   usageContext:{feature:'people_career',sourceId:article.id,scope:'shared'},
  });
  // Store usage before parsing so invalid JSON still counts as paid consumption.
  await db.query('UPDATE career_extractions SET usage_id=$2 WHERE id=$1',[extraction.id,result.usage.usageEventId]);
  const items = c.parseExtraction(result.content,text);
  extraction = (await db.query("UPDATE career_extractions SET status='completed',items=$2::jsonb WHERE id=$1 RETURNING *",[extraction.id,JSON.stringify(items)])).rows[0];
  await distribute(extraction,article,onlyTenant);return 'completed';
 } catch(e) {
  await db.query("UPDATE career_extractions SET status='failed',error_code='REVIEW_REQUIRED_NO_AUTO_RETRY' WHERE id=$1 AND status='running'",[extraction.id]);
  console.warn('[Career] Analyse/Verteilung fehlgeschlagen:',extraction.id,e.message);return 'failed';
 }
}
async function scan(options = {}) {
 const settings = (await db.query('SELECT * FROM career_ai_settings')).rows[0];
 if (!settings?.enabled) return {disabled:true};
 // Newly enabled tenants receive existing analyses without a new provider call.
 const cached = await db.query(`SELECT e.*,row_to_json(sc) AS article FROM career_extractions e JOIN scraped_content sc ON sc.id=e.article_id
 WHERE e.status='completed' AND jsonb_array_length(e.items)>0 AND EXISTS(
 SELECT 1 FROM career_tenant_settings cs JOIN business_partners bp ON bp.id=cs.business_partner_id
 WHERE cs.enabled AND bp.is_active AND 'content'=ANY(bp.enabled_modules) AND sc.category_id=ANY(cs.category_ids)
 AND ($1::uuid IS NULL OR cs.business_partner_id=$1)
 AND (NOT EXISTS(SELECT 1 FROM business_partner_regions WHERE business_partner_id=bp.id)
 OR EXISTS(SELECT 1 FROM business_partner_regions br JOIN regions r ON r.id=br.region_id
 WHERE br.business_partner_id=bp.id AND (r.code=sc.region OR sc.region IN ('EU','GLOBAL','WORLD'))))
 AND NOT EXISTS(SELECT 1 FROM career_entries ce WHERE ce.extraction_id=e.id AND ce.business_partner_id=cs.business_partner_id)) LIMIT 100`,[options.tenantId||null]);
 for(const extraction of cached.rows)await distribute(extraction,extraction.article,options.tenantId);
 const limit = Math.min(Math.max(Number(options.limit)||50,1),100);
 const articles = await db.query(`SELECT sc.* FROM scraped_content sc
 WHERE sc.event_date IS NULL AND EXISTS(SELECT 1 FROM career_tenant_settings cs JOIN business_partners bp ON bp.id=cs.business_partner_id
 WHERE cs.enabled AND bp.is_active AND 'content'=ANY(bp.enabled_modules) AND sc.category_id=ANY(cs.category_ids)
 AND ($3::uuid IS NULL OR cs.business_partner_id=$3)
 AND (NOT EXISTS(SELECT 1 FROM business_partner_regions WHERE business_partner_id=bp.id)
 OR EXISTS(SELECT 1 FROM business_partner_regions br JOIN regions r ON r.id=br.region_id
 WHERE br.business_partner_id=bp.id AND (r.code=sc.region OR sc.region IN ('EU','GLOBAL','WORLD')))))
 AND ($1::boolean OR sc.scraped_at >= $2)
 AND ($4::date IS NULL OR sc.published_date >= $4)
 AND NOT EXISTS(SELECT 1 FROM career_article_checks cc WHERE cc.article_id=sc.id AND cc.checked_at>=COALESCE(sc.updated_at,sc.scraped_at))
 ORDER BY sc.scraped_at DESC LIMIT $5`,[Boolean(options.archive),settings.auto_since,options.tenantId||null,options.since||null,limit]);
 const counts={checked:articles.rowCount,completed:0,cached:0,excluded:0,waiting:0,failed:0};
 for (const article of articles.rows) {const status=await processArticle(article,options.tenantId);counts[status]=(counts[status]||0)+1;}
 // Budget-deferred work remains queued in DB; never pay again for running/failed work.
 if (!options.archive) {
  const waiting = await db.query(`SELECT sc.* FROM career_extractions e JOIN scraped_content sc ON sc.id=e.article_id
  WHERE e.status='waiting' AND sc.event_date IS NULL AND EXISTS(
  SELECT 1 FROM career_tenant_settings cs JOIN business_partners bp ON bp.id=cs.business_partner_id
  WHERE cs.enabled AND bp.is_active AND 'content'=ANY(bp.enabled_modules) AND sc.category_id=ANY(cs.category_ids)
  AND (NOT EXISTS(SELECT 1 FROM business_partner_regions WHERE business_partner_id=bp.id)
  OR EXISTS(SELECT 1 FROM business_partner_regions br JOIN regions r ON r.id=br.region_id
  WHERE br.business_partner_id=bp.id AND (r.code=sc.region OR sc.region IN ('EU','GLOBAL','WORLD')))))
  ORDER BY e.created_at LIMIT 10`);
  for (const article of waiting.rows) await processArticle(article);
 }
 return counts;
}
module.exports={scan,processArticle,reserve,distribute,notifyReview,RESERVE};
