const db = require('../config/db');
const { randomUUID } = require('crypto');
const sharp = require('sharp');
const { PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const s3 = require('../config/s3Client');
const c = require('../utils/careerContent');
const { notifyReview } = require('../services/careerService');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fail = (message,status=400)=>Object.assign(new Error(message),{status});
const manager = user => ['admin','assistenz'].includes(user?.role);
function tenant(req) {
 const requested = req.query.partnerId || req.body?.business_partner_id;
 if (requested && req.user.role!=='admin' && requested!==req.user.business_partner_id) throw fail('Nur der eigene Mandant ist erlaubt.',403);
 const id = req.user.role==='admin' ? requested || req.user.business_partner_id : req.user.business_partner_id;
 if (!UUID.test(id || '')) throw fail('Bitte einen Mandanten auswählen.');return id;
}
const wrap = fn => async(req,res)=>{try{await fn(req,res);}catch(e){console.error('[Career]',e.message);res.status(e.status || 500).json({message:e.status?e.message:'Karriere-Daten konnten nicht verarbeitet werden.'});}};
async function entry(req,client=db) {
 if (!UUID.test(req.params.id || '')) throw fail('Ungültiger Eintrag.');
 const row = (await client.query('SELECT * FROM career_entries WHERE id=$1 AND business_partner_id=$2',[req.params.id,tenant(req)])).rows[0];
 if (!row || (!manager(req.user) && row.status!=='approved' && row.author_id!==req.user.id)) throw fail('Eintrag nicht verfügbar.',404);return row;
}
const fields = `e.id,e.person_name,e.organization,e.role_title,e.kind,e.effective_date,e.published_date,e.summary,e.source_url,
 e.status,e.author_id,e.extraction_id,e.requested_public,e.public_approved,e.photo_consent,e.version,e.created_at,
 (SELECT p.logo_url FROM directory_providers p JOIN directory_provider_mandant_settings ms ON ms.provider_id=p.id
 WHERE ms.business_partner_id=e.business_partner_id AND ms.status='active' AND lower(p.name)=lower(e.organization) LIMIT 1) AS organization_logo,
 EXISTS(SELECT 1 FROM career_entries d WHERE d.business_partner_id=e.business_partner_id AND d.id<>e.id AND d.status<>'withdrawn'
 AND (d.fingerprint=e.fingerprint OR (lower(d.person_name)=lower(e.person_name) AND lower(d.organization)=lower(e.organization)
 AND d.kind=e.kind AND abs(d.created_at::date-e.created_at::date)<90))) AS possible_duplicate,
 (SELECT COUNT(*)::int FROM career_comments cc WHERE cc.entry_id=e.id) AS comment_count`;
exports.tenants=wrap(async(req,res)=>{
 if(!manager(req.user))throw fail('Mandantenübersicht nur für Assistenz und Admin.',403);
 const isAdmin=req.user.role==='admin';const id=isAdmin?null:tenant(req);
 const result=await db.query(`SELECT bp.id,bp.name,bp.slug,COUNT(e.id)::int AS total,
 COUNT(e.id) FILTER(WHERE e.status='approved')::int AS approved,
 COUNT(e.id) FILTER(WHERE e.status='pending')::int AS pending,
 COUNT(e.id) FILTER(WHERE e.status='rejected')::int AS rejected
 FROM business_partners bp LEFT JOIN career_entries e ON e.business_partner_id=bp.id AND e.status<>'withdrawn'
 WHERE ($1::boolean OR bp.id=$2::uuid) GROUP BY bp.id,bp.name,bp.slug ORDER BY bp.name`,[isAdmin,id]);
 res.json(result.rows);
});
exports.list=wrap(async(req,res)=>{
 const partnerId=tenant(req); const isManager=manager(req.user);
 const mode=['approved','mine','pending','rejected'].includes(req.query.mode)?req.query.mode:'approved';
 if (['pending','rejected'].includes(mode) && !isManager) throw fail('Freigabe nur für Assistenz und Admin.',403);
 const offset=Math.min(Math.max(Number(req.query.offset)||0,0),10000);const limit=Math.min(Math.max(Number(req.query.limit)||24,1),50);
 const params=[partnerId,req.user.id,mode,String(req.query.search || '').slice(0,120),req.query.kind||'',limit,offset];
 const where=`e.business_partner_id=$1 AND (CASE WHEN $3='mine' THEN e.author_id=$2 ELSE e.status=$3 END)
 AND ($4='' OR concat_ws(' ',e.person_name,e.organization,e.role_title,e.summary) ILIKE '%' || $4 || '%') AND ($5='' OR e.kind=$5)`;
 const rows=await db.query(`SELECT ${fields},${isManager ? 'e.review_note' : "''::text AS review_note"},
 CASE WHEN e.portrait_key IS NOT NULL THEN '/api/career/' || e.id::text || '/photo?partnerId=' || e.business_partner_id::text END AS photo_url
 FROM career_entries e WHERE ${where} ORDER BY e.created_at DESC LIMIT $6 OFFSET $7`,params);
 const count=(await db.query(`SELECT COUNT(*)::int FROM career_entries e WHERE ${where}`,params.slice(0,5))).rows[0].count;
 const counts=(await db.query(`SELECT COUNT(*) FILTER(WHERE status='approved')::int AS approved,
 COUNT(*) FILTER(WHERE author_id=$2)::int AS mine,COUNT(*) FILTER(WHERE status='pending')::int AS pending
 FROM career_entries WHERE business_partner_id=$1`,[partnerId,req.user.id])).rows[0];
 // Read-only status, scoped to the selected tenant; ordinary members do not see settings.
 const automation=isManager?(await db.query(`SELECT
 COALESCE((SELECT enabled FROM career_ai_settings WHERE singleton=true),false) AS global_enabled,
 COALESCE(cs.enabled,false) AS tenant_enabled,
 COALESCE(cardinality(cs.category_ids),0) AS category_count,
 COALESCE(cs.public_enabled,false) AS public_enabled
 FROM (SELECT $1::uuid AS id) selected LEFT JOIN career_tenant_settings cs ON cs.business_partner_id=selected.id`,[partnerId])).rows[0]:undefined;
 res.json({entries:rows.rows,total:count,counts:{...counts,pending:isManager?counts.pending:0},...(automation?{automation}:{})});
});
exports.detail=wrap(async(req,res)=>{
 const row=await entry(req);
 const result=(await db.query(`SELECT ${fields},CASE WHEN e.portrait_key IS NOT NULL THEN '/api/career/'||e.id::text||'/photo?partnerId='||e.business_partner_id::text END AS photo_url
 FROM career_entries e WHERE e.id=$1`,[row.id])).rows[0];
 result.review_note=manager(req.user)?row.review_note:'';res.json(result);
});
exports.create=wrap(async(req,res)=>{
 const partnerId=tenant(req);const data=c.validateEntry(req.body);
 const consent=req.body.confirm_rights==='true';
 if (!consent) throw fail('Bitte Angaben, Einwilligung bzw. öffentliche Quelle und Bildrechte bestätigen.');
 const requestedPublic=req.body.requested_public==='true';
 if (!req.body.is_self || !['true','false'].includes(req.body.is_self)) throw fail('Bitte angeben, ob Sie selbst vorgestellt werden.');
 if (req.body.is_self==='false' && !data.source_url) throw fail('Für eine andere Person bitte die öffentliche Originalquelle angeben.');
 let key=null;let stored=false;
 try {
  if(req.file) {
   if(!process.env.AWS_S3_BUCKET_NAME) throw fail('Bildspeicher nicht eingerichtet.',503);
   let buffer;
   try {
    const image=sharp(req.file.buffer,{limitInputPixels:25000000,animated:false});
    const meta=await image.metadata();if(!['jpeg','png','webp','heif','avif'].includes(meta.format))throw fail('Bitte ein Foto als JPG, PNG oder WebP hochladen.');
    buffer=await image.rotate().resize(600,600,{fit:'inside',withoutEnlargement:true}).webp({quality:82}).toBuffer();
   }catch(error){throw error.status?error:fail('Foto konnte nicht gelesen werden. Bitte ein gültiges JPG, PNG oder WebP verwenden (max. 25 Megapixel).');}
   key=`career/${partnerId}/${randomUUID()}.webp`;
   await s3.send(new PutObjectCommand({Bucket:process.env.AWS_S3_BUCKET_NAME,Key:key,Body:buffer,ContentType:'image/webp'}));stored=true;
  }
  const result=await db.query(`INSERT INTO career_entries(business_partner_id,author_id,person_name,organization,role_title,kind,effective_date,summary,
  source_url,portrait_key,photo_consent,requested_public,fingerprint) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
  [partnerId,req.user.id,data.person_name,data.organization,data.role_title,data.kind,data.effective_date,data.summary,data.source_url,key,Boolean(key&&consent),requestedPublic,c.fingerprint(data)]);
  stored=false;await notifyReview(partnerId,result.rows[0].id);res.status(201).json({id:result.rows[0].id,message:'Eingereicht. Die Assistenz prüft das Update vor der Veröffentlichung.'});
 }finally{if(stored&&key)await s3.send(new DeleteObjectCommand({Bucket:process.env.AWS_S3_BUCKET_NAME,Key:key})).catch(()=>{});}
});
exports.review=wrap(async(req,res)=>{
 if(!manager(req.user))throw fail('Freigabe nur für Assistenz und Admin.',403);
 const row=await entry(req);if(row.status==='withdrawn')throw fail('Der Eintrag wurde zurückgezogen.',409);
 const status=req.body.status;if(!['approved','rejected'].includes(status))throw fail('Bitte Freigabe oder Ablehnung wählen.');
 const data=c.validateEntry(req.body);const publicApproved=req.body.public_approved===true;
 if(publicApproved && !row.requested_public)throw fail('Öffentliche Freigabe wurde nicht beantragt.');
 if(publicApproved && !data.source_url && !row.author_id)throw fail('Öffentliche KI-Treffer benötigen einen Originalbeleg.');
 const result=await db.query(`UPDATE career_entries SET person_name=$4,organization=$5,role_title=$6,kind=$7,effective_date=$8,summary=$9,source_url=$10,
 status=$3,public_approved=$11,reviewed_by=$12,review_note=$13,fingerprint=$14,version=version+1,updated_at=now()
 WHERE id=$1 AND version=$2 AND status<>'withdrawn' RETURNING id`,[row.id,Number(req.body.version),status,data.person_name,data.organization,data.role_title,data.kind,
 data.effective_date,data.summary,data.source_url,status==='approved'&&publicApproved,req.user.id,c.plain(req.body.review_note).slice(0,1000),c.fingerprint(data)]);
 if(!result.rowCount)throw fail('Der Eintrag wurde zwischenzeitlich geändert. Bitte neu laden.',409);
 res.json({message:'Freigabe gespeichert.'});
});
exports.withdraw=wrap(async(req,res)=>{
 const row=await entry(req);if(!manager(req.user)&&row.author_id!==req.user.id)throw fail('Nur eigene Einträge können zurückgezogen werden.',403);
 await db.query("UPDATE career_entries SET status='withdrawn',public_approved=false,version=version+1,updated_at=now() WHERE id=$1",[row.id]);res.json({message:'Zurückgezogen. Auch die öffentliche Darstellung ist deaktiviert.'});
});
exports.comments=wrap(async(req,res)=>{
 const row=await entry(req);if(row.status!=='approved')throw fail('Kommentare erst nach Freigabe möglich.',409);
 if(req.method==='POST') {
  const content=c.plain(req.body.content);if(!content||content.length>1000)throw fail('Kommentar: 1 bis 1000 Zeichen.');
  await db.query('INSERT INTO career_comments(entry_id,user_id,content) VALUES($1,$2,$3)',[row.id,req.user.id,content]);
 }
 const comments=await db.query(`SELECT cc.id,cc.content,cc.created_at,u.first_name,u.last_name,u.username,u.organization_name
 FROM career_comments cc JOIN users u ON u.id=cc.user_id WHERE cc.entry_id=$1 ORDER BY cc.created_at LIMIT 100`,[row.id]);res.json(comments.rows);
});
async function publicTenant(req) {
 if(!UUID.test(req.query.partnerId||req.params.partnerId||''))throw fail('Mandant nicht verfügbar.',404);
 const id=req.query.partnerId||req.params.partnerId;
 const result=await db.query(`SELECT bp.id FROM business_partners bp JOIN career_tenant_settings cs ON cs.business_partner_id=bp.id
 WHERE bp.id=$1 AND bp.is_active AND 'content'=ANY(bp.enabled_modules) AND cs.public_enabled`,[id]);
 if(!result.rowCount)throw fail('Keine öffentliche Rubrik verfügbar.',404);return id;
}
exports.publicList=wrap(async(req,res)=>{
 const id=await publicTenant(req);if(req.query.id&&!UUID.test(req.query.id))throw fail('Ungültiger Eintrag.');
 const rows=await db.query(`SELECT e.id,e.person_name,e.organization,e.role_title,e.kind,e.effective_date,e.published_date,
 left(e.summary,280) AS summary,e.source_url,(e.extraction_id IS NOT NULL) AS ai_assisted,
 CASE WHEN e.portrait_key IS NOT NULL AND e.photo_consent THEN '/api/public/career/' || e.business_partner_id::text || '/' || e.id::text || '/photo' END AS photo_url
 FROM career_entries e WHERE e.business_partner_id=$1 AND e.status='approved' AND e.public_approved
 AND ($2::uuid IS NULL OR e.id=$2) ORDER BY e.created_at DESC LIMIT 3`,[id,req.query.id||null]);
 res.set('Cache-Control','no-store').json({entries:rows.rows});
});
exports.photo=wrap(async(req,res)=>{
 if(!UUID.test(req.params.id || ''))throw fail('Foto nicht verfügbar.',404);
 let row;
 if(req.user)row=await entry(req);
 else{const id=await publicTenant(req);row=(await db.query("SELECT * FROM career_entries WHERE id=$1 AND business_partner_id=$2 AND status='approved' AND public_approved",[req.params.id,id])).rows[0];}
 if(!row?.portrait_key||!row.photo_consent)throw fail('Foto nicht verfügbar.',404);
 const object=await s3.send(new GetObjectCommand({Bucket:process.env.AWS_S3_BUCKET_NAME,Key:row.portrait_key}));
 res.set({'Content-Type':'image/webp','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'});object.Body.on('error',()=>res.destroy());object.Body.pipe(res);
});
exports.settings=wrap(async(req,res)=>{
 if(!manager(req.user))throw fail('Einstellungen nur für Assistenz und Admin.',403);
 const id=tenant(req);
 await db.query('INSERT INTO career_tenant_settings(business_partner_id) VALUES($1) ON CONFLICT DO NOTHING',[id]);
 const settings=(await db.query('SELECT * FROM career_tenant_settings WHERE business_partner_id=$1',[id])).rows[0];
 const categories=(await db.query("SELECT id,name FROM categories WHERE category_type IN ('content','scraped','news') OR id IN (SELECT DISTINCT category_id FROM scraped_content WHERE event_date IS NULL) ORDER BY name")).rows;
 const global=(await db.query('SELECT * FROM career_ai_settings')).rows[0];
 let usage=null;
 if(req.user.role==='admin')usage=(await db.query(`SELECT COUNT(*)::int AS calls,COALESCE(SUM(prompt_tokens),0)::bigint AS input_tokens,
 COALESCE(SUM(completion_tokens),0)::bigint AS output_tokens,COALESCE(SUM(total_tokens),0)::bigint AS total_tokens,
 COUNT(*) FILTER(WHERE status<>'completed')::int AS unknown_calls FROM ai_call_usage WHERE feature='people_career' AND created_at>=date_trunc('month',now())`)).rows[0];
 res.json({settings,categories,global:req.user.role==='admin'?global:{enabled:global.enabled},usage});
});
exports.saveSettings=wrap(async(req,res)=>{
 if(!manager(req.user))throw fail('Einstellungen nur für Assistenz und Admin.',403);
 const id=tenant(req);const categories=req.body.category_ids;
 if(!(await db.query('SELECT id FROM business_partners WHERE id=$1',[id])).rowCount)throw fail('Mandant nicht verfügbar.',404);
 if(!Array.isArray(categories)||categories.length>30||categories.some(x=>!UUID.test(x)))throw fail('Bitte gültige Artikelkategorien auswählen.');
 if(req.body.enabled&&!categories.length)throw fail('Für KI-Treffer mindestens eine relevante Artikelkategorie wählen.');
 const count=(await db.query('SELECT COUNT(*)::int FROM categories WHERE id=ANY($1::uuid[])',[categories])).rows[0].count;
 if(count!==new Set(categories).size)throw fail('Kategorie nicht verfügbar.');
 if(req.body.global && req.user.role!=='admin')throw fail('Globale KI-Limits nur für Admin.',403);
 if(req.body.global) {
  const g=req.body.global;
  if(!Number.isInteger(g.daily_calls)||g.daily_calls<1||g.daily_calls>100||!Number.isInteger(g.monthly_tokens)||g.monthly_tokens<10000||g.monthly_tokens>1000000)throw fail('Globale Limits: 1–100 Analysen/Tag und 10.000–1.000.000 Tokens/Monat.');
  await db.query('UPDATE career_ai_settings SET enabled=$1,daily_calls=$2,monthly_tokens=$3',[g.enabled===true,g.daily_calls,g.monthly_tokens]);
 }
 await db.query(`INSERT INTO career_tenant_settings(business_partner_id,enabled,public_enabled,category_ids) VALUES($1,$2,$3,$4)
 ON CONFLICT(business_partner_id) DO UPDATE SET enabled=EXCLUDED.enabled,public_enabled=EXCLUDED.public_enabled,category_ids=EXCLUDED.category_ids`,[id,req.body.enabled===true,req.body.public_enabled===true,categories]);res.json({message:'Einstellungen gespeichert.'});
});
exports.archive=wrap(async(req,res)=>{
 if(req.user.role!=='admin')throw fail('Archiv-Analyse nur für Admin.',403);
 const id=tenant(req);const since=c.date(req.body.since);const limit=Number(req.body.limit);
 if(!since||!Number.isInteger(limit)||limit<1||limit>100)throw fail('Bitte Startdatum und 1–100 Artikel angeben.');
 const count=(await db.query(`SELECT COUNT(*)::int FROM scraped_content sc JOIN career_tenant_settings cs ON cs.business_partner_id=$1
 WHERE cs.enabled AND sc.category_id=ANY(cs.category_ids) AND sc.event_date IS NULL AND sc.published_date >= $2`,[id,since])).rows[0].count;
 if(req.body.confirm!==true)return res.json({available:count,max_articles:limit,max_calls:limit,max_reserved_tokens:limit*6000,message:'Keyword-Filter und globale Tages-/Monatslimits gelten auch im Archiv. Geprüfte Artikel werden nicht erneut analysiert.'});
 const {aiContentQueue}=require('../services/queueService');
 await aiContentQueue.add('career-scan',{archive:true,tenantId:id,since,limit},{jobId:`career-archive-${id}-${Date.now()}`,attempts:1,removeOnComplete:20,removeOnFail:20});res.status(202).json({message:'Begrenzte Archiv-Prüfung gestartet. Treffer erscheinen nach der Analyse unter Freigaben.'});
});
exports.scopeTenant=tenant;exports.isManager=manager;
