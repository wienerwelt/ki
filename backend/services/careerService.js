const db = require('../config/db');
const { callOpenAI } = require('./aiService');
const c = require('../utils/careerContent');
const { createNotificationInternal } = require('../controllers/notificationController');
const RESERVE = 6000; // UTF-8 prompt bytes + output + message framing; conservative upper bound.
const regionScopeSql = (partnerIdSql, articleRegionSql) => `(
 NOT EXISTS(SELECT 1 FROM business_partner_regions WHERE business_partner_id=${partnerIdSql})
 OR NULLIF(BTRIM(COALESCE((${articleRegionSql})::text,'')),'') IS NULL
 OR EXISTS(SELECT 1 FROM business_partner_regions br JOIN regions r ON r.id=br.region_id
  WHERE br.business_partner_id=${partnerIdSql} AND (
   UPPER(r.code)=UPPER((${articleRegionSql})::text)
   OR UPPER((${articleRegionSql})::text) IN ('EU','GLOBAL','WORLD')
   OR (UPPER((${articleRegionSql})::text)='DACH' AND UPPER(r.code) IN ('AT','DE','CH','DACH'))
   OR (UPPER(r.code)='DACH' AND UPPER((${articleRegionSql})::text) IN ('AT','DE','CH'))
  ))
)`;

async function notifyReview(partnerId, id, client = db) {
 const { rows } = await client.query("SELECT id FROM users WHERE is_active=true AND (role='admin' OR (business_partner_id=$1 AND role='assistenz'))",[partnerId]);
 for (const u of rows) await createNotificationInternal(u.id,'career_review','Karriere-Update prüfen','Unter Community → Menschen & Karriere wartet eine Personalie auf Freigabe.',id,client);
}
async function distribute(extraction, article, onlyTenant = null) {
 const tenants = await db.query(`SELECT cs.business_partner_id FROM career_tenant_settings cs
 JOIN business_partners bp ON bp.id=cs.business_partner_id
 WHERE cs.enabled AND bp.is_active AND 'content'=ANY(bp.enabled_modules)
 AND $1::uuid=ANY(cs.category_ids) AND ($2::uuid IS NULL OR cs.business_partner_id=$2)
 AND ${regionScopeSql('bp.id','$3')}`,[article.category_id,onlyTenant,article.region]);
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
async function processArticle(article, onlyTenant = null, options = {}) {
 const text = c.articleText(article); const contentHash = c.hash(text);
 const candidate = options.force === true || c.SIGNAL.test(text);
 let extraction = (await db.query(`INSERT INTO career_extractions(content_hash,prompt_version,article_id,status)
 VALUES($1,$2,$3,$4) ON CONFLICT(content_hash,prompt_version) DO UPDATE SET content_hash=EXCLUDED.content_hash RETURNING *`,
 [contentHash,c.VERSION,article.id,candidate ? 'waiting' : 'excluded'])).rows[0];
 await db.query(`INSERT INTO career_article_checks(article_id,content_hash,prompt_version) VALUES($1,$2,$3)
 ON CONFLICT(article_id) DO UPDATE SET content_hash=EXCLUDED.content_hash,prompt_version=EXCLUDED.prompt_version,checked_at=now()`,[article.id,contentHash,c.VERSION]);
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

async function getArchiveConfiguration(tenantId) {
 const configuration = (await db.query(`SELECT
  COALESCE((SELECT enabled FROM career_ai_settings WHERE singleton=true),false) AS global_enabled,
  COALESCE(cs.enabled,false) AS tenant_enabled,
  COALESCE(cardinality(cs.category_ids),0)::int AS category_count,
  COALESCE(bp.is_active,false) AS partner_active,
  COALESCE('content'=ANY(bp.enabled_modules),false) AS content_enabled
  FROM (SELECT $1::uuid AS id) selected
  LEFT JOIN business_partners bp ON bp.id=selected.id
  LEFT JOIN career_tenant_settings cs ON cs.business_partner_id=selected.id`,[tenantId])).rows[0];
 const configurationError = !configuration?.global_enabled
  ? 'Die zentrale KI-Verarbeitung ist noch deaktiviert.'
  : !configuration.partner_active || !configuration.content_enabled
   ? 'Das Content-Modul dieses Mandanten ist nicht aktiv.'
   : !configuration.tenant_enabled
    ? 'Die Menschen-&-Karriere-Automatik dieses Mandanten ist noch deaktiviert.'
    : Number(configuration.category_count) < 1
     ? 'Bitte zuerst mindestens eine Artikelkategorie für diesen Mandanten auswählen.'
     : null;
 if (configurationError) {
  const error = new Error(configurationError);
  error.status = 409;
  throw error;
 }

 return configuration;
}

async function getArchiveDiagnostics(tenantId, since, previewLimit = 100) {
 await getArchiveConfiguration(tenantId);

 const result = await db.query(`WITH period_articles AS (
   SELECT sc.*
   FROM scraped_content sc
   WHERE sc.event_date IS NULL
     AND COALESCE(sc.published_date::date,sc.scraped_at::date,sc.created_at::date) >= $2::date
  ), category_articles AS (
   SELECT sc.*
   FROM period_articles sc
   JOIN career_tenant_settings cs ON cs.business_partner_id=$1
   WHERE sc.category_id=ANY(cs.category_ids)
  ), eligible_articles AS (
   SELECT sc.*
   FROM category_articles sc
   WHERE ${regionScopeSql('$1','sc.region')}
  ), annotated AS (
   SELECT sc.id,cc.article_id AS checked_article_id,e.status,
          CASE WHEN e.status='completed' THEN jsonb_array_length(COALESCE(e.items,'[]'::jsonb)) ELSE 0 END AS item_count
   FROM eligible_articles sc
   LEFT JOIN career_article_checks cc ON cc.article_id=sc.id AND cc.prompt_version=$3
    AND cc.checked_at>=COALESCE(sc.updated_at,sc.scraped_at,sc.created_at)
   LEFT JOIN career_extractions e ON e.content_hash=cc.content_hash AND e.prompt_version=cc.prompt_version
  )
  SELECT
   (SELECT COUNT(*)::int FROM period_articles) AS period_total,
   (SELECT COUNT(*)::int FROM category_articles) AS category_match,
   (SELECT COUNT(*)::int FROM eligible_articles) AS region_match,
   COUNT(*) FILTER(WHERE checked_article_id IS NOT NULL)::int AS already_checked,
   COUNT(*) FILTER(WHERE checked_article_id IS NULL)::int AS unchecked,
   COUNT(*) FILTER(WHERE status='excluded')::int AS excluded,
   COUNT(*) FILTER(WHERE status='failed')::int AS failed,
   COUNT(*) FILTER(WHERE status='waiting')::int AS waiting,
   COUNT(*) FILTER(WHERE status='completed' AND item_count=0)::int AS completed_empty,
   COUNT(*) FILTER(WHERE status='completed' AND item_count>0)::int AS completed_with_items,
   COUNT(*) FILTER(WHERE checked_article_id IS NOT NULL AND (status IN ('excluded','failed') OR (status='completed' AND item_count=0)))::int AS recheckable
  FROM annotated`,[tenantId,since,c.VERSION]);

 const diagnostics = result.rows[0] || {};
 const boundedPreviewLimit = Math.min(Math.max(Number(previewLimit) || 1,1),100);
 const keywordRows = await db.query(`SELECT sc.title,sc.summary,sc.full_text,sc.published_date,sc.scraped_at,sc.region,
  cat.name AS category_name
  FROM scraped_content sc
  JOIN career_tenant_settings cs ON cs.business_partner_id=$1
  JOIN business_partners bp ON bp.id=cs.business_partner_id
  LEFT JOIN categories cat ON cat.id=sc.category_id
  WHERE sc.event_date IS NULL
   AND COALESCE(sc.published_date::date,sc.scraped_at::date,sc.created_at::date) >= $2::date
   AND cs.enabled AND bp.is_active AND 'content'=ANY(bp.enabled_modules)
   AND sc.category_id=ANY(cs.category_ids)
   AND ${regionScopeSql('bp.id','sc.region')}
   AND NOT EXISTS(SELECT 1 FROM career_article_checks cc WHERE cc.article_id=sc.id AND cc.prompt_version=$3
    AND cc.checked_at>=COALESCE(sc.updated_at,sc.scraped_at,sc.created_at))
  ORDER BY sc.scraped_at DESC LIMIT $4`,[tenantId,since,c.VERSION,boundedPreviewLimit]);

 const numericDiagnostics=Object.fromEntries(Object.entries(diagnostics).map(([key,value])=>[key,Number(value || 0)]));
 const candidateSamples=keywordRows.rows.map(article=>{
  const match=c.articleText(article).match(c.SIGNAL);
  if(!match)return null;
  return {
   title:c.plain(article.title).slice(0,180)||'Artikel ohne Titel',
   signal:c.plain(match[0]).slice(0,80),
   published_date:article.published_date||article.scraped_at||null,
   category_name:c.plain(article.category_name).slice(0,120)||'Ohne Kategorie',
   region:c.plain(article.region).slice(0,30)||'—',
  };
 }).filter(Boolean);
 const historicallyReviewed=numericDiagnostics.completed_empty+numericDiagnostics.completed_with_items;
 const historicalHitRate=historicallyReviewed>0
  ? Math.round((numericDiagnostics.completed_with_items/historicallyReviewed)*100)
  : null;
 const estimatedNewHits=historicalHitRate===null
  ? null
  : Math.round((candidateSamples.length*historicalHitRate)/100);

 return {
  ...numericDiagnostics,
  keyword_candidates:candidateSamples.length,
  keyword_preview_count:keywordRows.rowCount,
  keyword_preview_limited:Number(diagnostics.unchecked || 0)>keywordRows.rowCount,
  potential:{
   new_signal_candidates:candidateSamples.length,
   recheckable_articles:numericDiagnostics.recheckable,
   historical_ai_reviews:historicallyReviewed,
   historical_hit_rate:historicalHitRate,
   estimated_new_hit_articles:estimatedNewHits,
   candidate_samples:candidateSamples.slice(0,5),
  },
  detection_version:c.VERSION,
 };
}

async function getArchiveCandidateCount(tenantId, since) {
 const diagnostics = await getArchiveDiagnostics(tenantId,since,1);
 return diagnostics.unchecked;
}

async function prepareArchiveRecheck(tenantId, since, limit) {
 await getArchiveConfiguration(tenantId);
 const boundedLimit=Math.min(Math.max(Number(limit)||1,1),25);
 const candidates=await db.query(`SELECT sc.id,cc.content_hash,e.id AS extraction_id
  FROM scraped_content sc
  JOIN career_tenant_settings cs ON cs.business_partner_id=$1
  JOIN business_partners bp ON bp.id=cs.business_partner_id
  JOIN career_article_checks cc ON cc.article_id=sc.id AND cc.prompt_version=$3
   AND cc.checked_at>=COALESCE(sc.updated_at,sc.scraped_at,sc.created_at)
  JOIN career_extractions e ON e.content_hash=cc.content_hash AND e.prompt_version=cc.prompt_version
  WHERE sc.event_date IS NULL
   AND COALESCE(sc.published_date::date,sc.scraped_at::date,sc.created_at::date) >= $2::date
   AND cs.enabled AND bp.is_active AND 'content'=ANY(bp.enabled_modules)
   AND sc.category_id=ANY(cs.category_ids)
   AND ${regionScopeSql('bp.id','sc.region')}
   AND (e.status IN ('excluded','failed') OR (e.status='completed' AND jsonb_array_length(COALESCE(e.items,'[]'::jsonb))=0))
  ORDER BY cc.checked_at DESC LIMIT $4`,[tenantId,since,c.VERSION,boundedLimit]);
 if(!candidates.rowCount)return [];
 const articleIds=candidates.rows.map(row=>row.id);
 const extractionIds=[...new Set(candidates.rows.map(row=>row.extraction_id))];
 const client=await db.connect();
 try{
  await client.query('BEGIN');
  await client.query(`UPDATE career_extractions SET status='waiting',items='[]'::jsonb,error_code=NULL,
   usage_id=NULL,reserved_tokens=0,attempted_at=NULL WHERE id=ANY($1::uuid[])`,[extractionIds]);
  await client.query('DELETE FROM career_article_checks WHERE article_id=ANY($1::uuid[])',[articleIds]);
  await client.query('COMMIT');
  return articleIds;
 }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
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
 AND ${regionScopeSql('bp.id','sc.region')}
 AND NOT EXISTS(SELECT 1 FROM career_entries ce WHERE ce.extraction_id=e.id AND ce.business_partner_id=cs.business_partner_id)) LIMIT 100`,[options.tenantId||null]);
 for(const extraction of cached.rows)await distribute(extraction,extraction.article,options.tenantId);
 const limit = Math.min(Math.max(Number(options.limit)||50,1),100);
 let articles;
 if(Array.isArray(options.articleIds)&&options.articleIds.length){
  articles=await db.query(`SELECT sc.* FROM scraped_content sc WHERE sc.id=ANY($1::uuid[]) AND sc.event_date IS NULL
   ORDER BY sc.scraped_at DESC LIMIT $2`,[options.articleIds,limit]);
 }else articles = await db.query(`SELECT sc.* FROM scraped_content sc
 WHERE sc.event_date IS NULL AND EXISTS(SELECT 1 FROM career_tenant_settings cs JOIN business_partners bp ON bp.id=cs.business_partner_id
 WHERE cs.enabled AND bp.is_active AND 'content'=ANY(bp.enabled_modules) AND sc.category_id=ANY(cs.category_ids)
 AND ($3::uuid IS NULL OR cs.business_partner_id=$3)
 AND ${regionScopeSql('bp.id','sc.region')})
 AND ($1::boolean OR sc.scraped_at >= $2)
 AND ($4::date IS NULL OR COALESCE(sc.published_date::date,sc.scraped_at::date,sc.created_at::date) >= $4)
 AND NOT EXISTS(SELECT 1 FROM career_article_checks cc WHERE cc.article_id=sc.id AND cc.prompt_version=$6
 AND cc.checked_at>=COALESCE(sc.updated_at,sc.scraped_at,sc.created_at))
 ORDER BY sc.scraped_at DESC LIMIT $5`,[Boolean(options.archive),settings.auto_since,options.tenantId||null,options.since||null,limit,c.VERSION]);
 const counts={checked:articles.rowCount,completed:0,cached:0,excluded:0,waiting:0,failed:0};
 for (const article of articles.rows) {const status=await processArticle(article,options.tenantId,{force:options.force===true});counts[status]=(counts[status]||0)+1;}
 // Budget-deferred work remains queued in DB; never pay again for running/failed work.
 if (!options.archive) {
  const waiting = await db.query(`SELECT sc.* FROM career_extractions e JOIN scraped_content sc ON sc.id=e.article_id
  WHERE e.status='waiting' AND sc.event_date IS NULL AND EXISTS(
  SELECT 1 FROM career_tenant_settings cs JOIN business_partners bp ON bp.id=cs.business_partner_id
  WHERE cs.enabled AND bp.is_active AND 'content'=ANY(bp.enabled_modules) AND sc.category_id=ANY(cs.category_ids)
  AND ${regionScopeSql('bp.id','sc.region')})
  ORDER BY e.created_at LIMIT 10`);
  for (const article of waiting.rows) await processArticle(article);
 }
 return counts;
}
module.exports={scan,processArticle,reserve,distribute,notifyReview,getArchiveCandidateCount,getArchiveDiagnostics,prepareArchiveRecheck,RESERVE};
