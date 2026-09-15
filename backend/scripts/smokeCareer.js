const assert=require('node:assert/strict');
const {randomUUID}=require('crypto');
const c=require('../utils/careerContent');
const db=require('../config/db');
const {startUsage,finishUsage}=require('../services/aiUsageService');
const jwt=require('jsonwebtoken');
const {PassThrough,Readable}=require('node:stream');
const sharp=require('sharp');
const s3=require('../config/s3Client');

async function run(){
 if(process.env.NODE_ENV==='production'||process.env.APP_ENV==='production')throw Error('Nur für lokale DEV-Tests.');
 assert(c.SIGNAL.test('Anna Beispiel übernimmt die Geschäftsführung.'));
 assert(!c.SIGNAL.test('Tipps für eine erfolgreiche Bewerbung'));
 assert.throws(()=>c.validateEntry({person_name:'Test',organization:'Test',kind:'change',summary:'Hallo',effective_date:'2026-02-30'}));
 assert.throws(()=>c.safeUrl('javascript:alert(1)'));
 assert.throws(()=>c.parseExtraction('{"items":[{"person_name":"Erfunden","organization":"Firma","kind":"change","summary":"Test","evidence":"erfunden"}]}','Artikel ohne Beleg'));
 const text='Anna Beispiel übernimmt die Geschäftsführung bei Beispiel GmbH.';
 const item={person_name:'Anna Beispiel',organization:'Beispiel GmbH',role_title:'Geschäftsführung',kind:'appointment',effective_date:null,summary:text,evidence:text};
 assert.equal(c.parseExtraction(JSON.stringify({items:[item]}),text)[0].effective_date,null);
 assert(Buffer.byteLength(c.promptFor('x'.repeat(50000)+text),'utf8')<5000);
 const partners=[randomUUID(),randomUUID()];const users=[randomUUID(),randomUUID(),randomUUID(),randomUUID()];const category=randomUUID();const article=randomUUID();const requestIds=[];let aiCalls=0;let savedSettings;let createdEntry;
 const ai=require('../services/aiService');const original=ai.callOpenAI;
 ai.callOpenAI=async()=>{aiCalls++;const usageId=await startUsage('OpenAI','gpt-4o-mini',{feature:'people_career',sourceId:article,scope:'shared'});requestIds.push(usageId);const usage={promptTokens:200,completionTokens:60,totalTokens:260,usageEventId:usageId};await finishUsage(usageId,usage,'test-only-no-provider-call');return{content:JSON.stringify({items:[item]}),usage,model:'gpt-4o-mini'};};
 const service=require('../services/careerService');const controller=require('../controllers/careerController');
 const originalS3=s3.send;const originalBucket=process.env.AWS_S3_BUCKET_NAME;let storedPhoto;
 // Mock only this test process: upload/stream checks never touch the real bucket.
 process.env.AWS_S3_BUCKET_NAME='career-test-only';
 s3.send=async command=>{if(command.constructor.name==='PutObjectCommand'){storedPhoto=command.input;return{};}if(command.constructor.name==='GetObjectCommand'){assert.equal(command.input.Key,storedPhoto.Key);return{Body:Readable.from(storedPhoto.Body)};}throw Error('Unexpected test S3 command');};
 const invoke=async(fn,user,body={},query={},params={},file)=>{let result={status:200};await fn({user,body,query,params,file,method:'GET'}, {status(n){result.status=n;return this;},json(data){result.data=data;return this;},set(){return this;}});return result;};
 try{
  savedSettings=(await db.query('SELECT * FROM career_ai_settings')).rows[0];
  for(const id of partners)await db.query("INSERT INTO business_partners(id,name,enabled_modules) VALUES($1,$2,ARRAY['content'])",[id,`Career smoke ${id}`]);
  for(const [i,id]of users.entries())await db.query('INSERT INTO users(id,username,email,role,business_partner_id,is_active) VALUES($1,$2,$3,$4,$5,true)',[id,`career-smoke-${id}`,`career-${id}@example.invalid`,['user','assistenz','admin','demo'][i],partners[0]]);
  await db.query("INSERT INTO categories(id,name,category_type) VALUES($1,'Career smoke category','content')",[category]);
  await db.query("INSERT INTO scraped_content(id,title,summary,original_url,category_id,region,published_date,scraped_at,source_identifier) VALUES($1,$2,$5,$3,$4,'AT','2026-09-14',now(),'career-smoke')",[article,text,`https://example.invalid/career-smoke-${article}`,category,text]);
  for(const id of partners)await db.query('INSERT INTO career_tenant_settings(business_partner_id,enabled,public_enabled,category_ids) VALUES($1,true,true,ARRAY[$2::uuid])',[id,category]);
  await db.query("UPDATE career_ai_settings SET enabled=true,auto_since=now()+interval '2 days',daily_calls=100,monthly_tokens=1000000");
  const a=(await db.query('SELECT * FROM scraped_content WHERE id=$1',[article])).rows[0];
  await Promise.all([service.processArticle(a),service.processArticle(a)]);assert.equal(aiCalls,1,'One analysis even with concurrent claims');
  await service.processArticle(a);assert.equal(aiCalls,1,'Cache must not pay again');
  const scanned=await service.scan({limit:1,tenantId:partners[0]});assert.equal(scanned.checked,0);assert.equal(aiCalls,1,'Scheduled queries do not re-analyse checked/cached articles');
  const automatic=(await db.query('SELECT * FROM career_entries WHERE extraction_id IN (SELECT id FROM career_extractions WHERE article_id=$1)',[article])).rows;assert.equal(automatic.length,2,'Reuse across tenants');assert(automatic.every(e=>e.status==='pending'&&!e.public_approved&&!e.portrait_key));
  const normal={id:users[0],role:'user',business_partner_id:partners[0]};const assistant={id:users[1],role:'assistenz',business_partner_id:partners[0]};const admin={id:users[2],role:'admin',business_partner_id:partners[0]};
  const notifications=require('../controllers/notificationController');
  const ownAutomatic=automatic.find(e=>e.business_partner_id===partners[0]);
  const otherAutomatic=automatic.find(e=>e.business_partner_id===partners[1]);
  // Even an incorrectly addressed legacy hint must not disclose another tenant's link.
  await notifications.createNotificationInternal(assistant.id,'career_review','Test only','Test only',otherAutomatic.id);
  await notifications.createNotificationInternal(normal.id,'career_review','Test only','Test only',ownAutomatic.id);
  const staleReference=randomUUID();await notifications.createNotificationInternal(admin.id,'career_review','Test only','Test only',staleReference);
  const expectedTarget=e=>`/career?partnerId=${e.business_partner_id}&entry=${e.id}&mode=pending`;
  const adminHints=(await invoke(notifications.getNotifications,admin)).data.items;
  assert.equal(adminHints.find(n=>n.reference_id===otherAutomatic.id).target_url,expectedTarget(otherAutomatic),'Admin hint opens the correct other tenant');
  assert.equal(adminHints.find(n=>n.reference_id===staleReference).target_url,null,'Deleted/missing references have no deep link');
  const assistantHints=(await invoke(notifications.getNotifications,assistant)).data.items;
  assert.equal(assistantHints.find(n=>n.reference_id===ownAutomatic.id).target_url,expectedTarget(ownAutomatic));
  assert.equal(assistantHints.find(n=>n.reference_id===otherAutomatic.id).target_url,null,'Assistant hints cannot link to another tenant');
  assert.equal((await invoke(notifications.getNotifications,normal)).data.items.find(n=>n.reference_id===ownAutomatic.id).target_url,null,'Members receive no moderation deep links');
  assert.equal((await invoke(controller.list,assistant,{}, {partnerId:partners[1]})).status,403);
  assert.equal((await invoke(controller.list,normal,{}, {mode:'pending'})).status,403);
  assert.equal((await invoke(controller.settings,normal)).status,403);
  assert.equal((await invoke(controller.list,admin,{}, {partnerId:partners[1]})).status,200);
  const assistantList=await invoke(controller.list,assistant);
  assert.deepEqual(assistantList.data.automation,{global_enabled:true,tenant_enabled:true,category_count:1,public_enabled:true},'Managers can see scoped automation status');
  const memberList=await invoke(controller.list,normal);
  assert(!('automation' in memberList.data),'Members do not receive administrative settings');
  const tenantCounts=await invoke(controller.tenants,admin,{}, {search:'no-match',mode:'approved',limit:1});
  for(const id of partners){const counts=tenantCounts.data.find(p=>p.id===id);assert.equal(counts.total,1);assert.equal(counts.pending,1);assert.equal(counts.approved,0);}
  const ownCounts=await invoke(controller.tenants,assistant);assert.equal(ownCounts.data.length,1);assert.equal(ownCounts.data[0].id,partners[0]);
  assert.equal((await invoke(controller.tenants,assistant,{}, {partnerId:partners[1]})).status,403);
  assert.equal((await invoke(controller.tenants,normal)).status,403);
  const assistantSettings=await invoke(controller.settings,assistant);assert.deepEqual(assistantSettings.data.global,{enabled:true},'Assistants cannot read platform-wide budgets');
  assert.equal((await invoke(controller.saveSettings,assistant,{enabled:true,category_ids:[category],global:{enabled:false,daily_calls:20,monthly_tokens:120000}})).status,403,'Assistants cannot change global settings');
  const form={...item,is_self:'true',confirm_rights:'true',requested_public:'true'};
  const created=await invoke(controller.create,normal,form);assert.equal(created.status,201);createdEntry=created.data.id;
  assert.equal((await invoke(controller.tenants,assistant)).data[0].total,2,'New submissions count, not just approved entries');
  assert.equal((await invoke(controller.publicList,null,{}, {partnerId:partners[0],id:createdEntry})).data.entries.length,0);
  assert.equal((await invoke(controller.review,normal,{...item,status:'approved',version:1}, {}, {id:createdEntry})).status,403);
  const approved=await invoke(controller.review,assistant,{...item,status:'approved',version:1,public_approved:true,review_note:'private internal review'}, {}, {id:createdEntry});assert.equal(approved.status,200);
  const publicEntry=(await invoke(controller.publicList,null,{}, {partnerId:partners[0],id:createdEntry})).data.entries[0];assert(publicEntry);assert(!('review_note'in publicEntry));assert(!('author_id'in publicEntry));assert(!('extraction_id'in publicEntry));assert(!('comment_count'in publicEntry));
  assert.equal((await invoke(controller.review,assistant,{...item,status:'approved',version:1}, {}, {id:createdEntry})).status,409,'Stale reviews must not overwrite');
  await controller.comments({user:normal,body:{content:'Gratulation!'},query:{},params:{id:createdEntry},method:'POST'},{status(){return this;},json(data){assert.equal(data.length,1);}});
  assert.equal(aiCalls,1,'Manual entries, approvals and comments have no AI cost');
  await invoke(controller.withdraw,normal,{}, {}, {id:createdEntry});assert.equal((await invoke(controller.publicList,null,{}, {partnerId:partners[0],id:createdEntry})).data.entries.length,0);
  assert.equal((await invoke(notifications.getNotifications,admin)).data.items.find(n=>n.reference_id===createdEntry).target_url,null,'Withdrawal removes the deep link');
  assert.equal((await invoke(controller.tenants,assistant)).data[0].total,1,'Withdrawn entries are not counted');
  const photoBuffer=await sharp({create:{width:20,height:20,channels:3,background:'#777777'}}).png().toBuffer();
  const uploaded=await invoke(controller.create,normal,form,{}, {},{buffer:photoBuffer,mimetype:'image/png'});assert.equal(uploaded.status,201);
  const photoId=uploaded.data.id;assert(storedPhoto.Key.startsWith(`career/${partners[0]}/`));assert.equal(storedPhoto.ContentType,'image/webp');
  const privatePhoto=(await invoke(controller.detail,normal,{}, {},{id:photoId})).data.photo_url;assert(privatePhoto.startsWith('/api/career/'),'Photos must use the same-host authenticated API');
  assert.equal((await invoke(controller.photo,null,{}, {},{partnerId:partners[0],id:photoId})).status,404,'Pending portraits are not public');
  assert.equal((await invoke(controller.review,assistant,{...item,status:'approved',version:1,public_approved:true}, {},{id:photoId})).status,200);
  const stream=new PassThrough();const chunks=[];stream.on('data',chunk=>chunks.push(chunk));stream.set=()=>stream;
  const finished=new Promise((resolve,reject)=>{stream.on('end',resolve);stream.on('error',reject);});
  await controller.photo({query:{},params:{partnerId:partners[0],id:photoId}},stream);await finished;assert(Buffer.concat(chunks).equals(storedPhoto.Body),'Approved portrait streams correctly');
  await invoke(controller.withdraw,normal,{}, {},{id:photoId});assert.equal((await invoke(controller.photo,null,{}, {},{partnerId:partners[0],id:photoId})).status,404,'Withdrawal immediately blocks the public photo');
  const malformed=await invoke(controller.create,normal,form,{}, {},{buffer:Buffer.from('<svg/>'),mimetype:'image/png'});assert.equal(malformed.status,400,'Malformed image is rejected before storage');
  // Canonical usage can also be verified without a real provider call.
  assert.equal(Number((await db.query('SELECT SUM(total_tokens) AS tokens FROM ai_usage_events WHERE id=ANY($1::text[])',[requestIds])).rows[0].tokens),260);
  const deferred=(await db.query("INSERT INTO career_extractions(article_id,content_hash,prompt_version,status) VALUES($1,$2,'test-limit','waiting') RETURNING id",[article,randomUUID()])).rows[0].id;
  await db.query('UPDATE career_ai_settings SET daily_calls=1');assert.equal(await service.reserve(deferred),false,'Daily budget enforced before provider call');
  await db.query("INSERT INTO career_extractions(article_id,content_hash,prompt_version,status,reserved_tokens,attempted_at) VALUES($1,$2,'test-limit','failed',6000,now())",[article,randomUUID()]);
  await db.query('UPDATE career_ai_settings SET daily_calls=100,monthly_tokens=10000');assert.equal(await service.reserve(deferred),false,'Unknown/failed calls remain reserved in monthly budget');
  assert.equal(aiCalls,1);
  const client=await db.connect();
  try{
   await client.query('BEGIN');const job=randomUUID();
   await client.query("INSERT INTO ai_jobs(id,status,is_automated) VALUES($1,'completed',false)",[job]);
   await client.query("INSERT INTO ai_usage_logs(user_id,business_partner_id,job_id,ai_provider,model,prompt_tokens,completion_tokens,total_tokens) VALUES($1,$2,$3,'OpenAI','test-legacy',10,5,15)",[users[0],partners[0],job]);
   await client.query("INSERT INTO activity_log(user_id,username,action_type,status,details) VALUES($1,'Career smoke','AI_ANALYSIS_SUCCESS','success',$2::jsonb)",[users[0],JSON.stringify({jobId:job,model:'test-legacy',tokenUsage:{promptTokens:10,completionTokens:5,totalTokens:15}})]);
   assert.equal(Number((await client.query('SELECT SUM(total_tokens) AS tokens FROM ai_usage_events WHERE job_id=$1',[job])).rows[0].tokens),15,'Legacy activity/usage duplicates counted once');
  }finally{await client.query('ROLLBACK');client.release();}
  // Routes/auth are tested with short-lived tokens, never printed or persisted.
  const base=process.env.SMOKE_API_URL||'http://127.0.0.1:5000';
  for(const [i,expected]of [[0,403],[1,403],[2,200]]){
   const token=jwt.sign({id:users[i]},process.env.JWT_SECRET,{expiresIn:'2m'});
   const response=await fetch(`${base}/api/career?partnerId=${partners[1]}`,{headers:{Authorization:`Bearer ${token}`}});assert.equal(response.status,expected,'HTTP tenant scoping');
  }
  const demoToken=jwt.sign({id:users[3]},process.env.JWT_SECRET,{expiresIn:'2m'});
  assert.equal((await fetch(`${base}/api/career`,{method:'POST',headers:{Authorization:`Bearer ${demoToken}`,'Content-Type':'application/json'},body:JSON.stringify(form)})).status,403);
  for(const [index,length] of [[0,null],[1,1],[2,null]]){
   const token=jwt.sign({id:users[index]},process.env.JWT_SECRET,{expiresIn:'2m'});
   const response=await fetch(`${base}/api/career/tenants`,{headers:{Authorization:`Bearer ${token}`}});assert.equal(response.status,index===0?403:200,'Tenant counts route precedes UUID detail route');
   if(length)assert.equal((await response.json()).length,length);
  }
  const statsToken=jwt.sign({id:users[2]},process.env.JWT_SECRET,{expiresIn:'2m'});
  for(const [index,entry] of [[1,ownAutomatic],[2,otherAutomatic]]){
   const token=jwt.sign({id:users[index]},process.env.JWT_SECRET,{expiresIn:'2m'});const headers={Authorization:`Bearer ${token}`};
   const hints=await fetch(`${base}/api/notifications`,{headers});assert.equal(hints.status,200);
   const hint=(await hints.json()).items.find(n=>n.reference_id===entry.id);assert.equal(hint.target_url,expectedTarget(entry),'Authenticated notification response includes tenant-correct links');
   const detail=await fetch(`${base}/api/career/${entry.id}?partnerId=${entry.business_partner_id}`,{headers});assert.equal(detail.status,200,'The notification destination can actually be opened');
   await fetch(`${base}/api/notifications/read`,{method:'PUT',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({notificationId:hint.id})});
   assert.equal((await db.query('SELECT is_read FROM user_notifications WHERE id=$1',[hint.id])).rows[0].is_read,true);
  }
  const stats=await fetch(`${base}/api/admin/stats/usage?timespan=month`,{headers:{Authorization:`Bearer ${statsToken}`}});
  assert.equal(stats.status,200,'Canonical admin statistics endpoint remains valid');
  console.log('Menschen & Karriere: parsing, concurrent cache, tenant scope, public privacy, photo upload/stream, moderation, comments, withdrawal, demo and usage passed. No paid AI or real S3 calls.');
 }finally{
  ai.callOpenAI=original;
  s3.send=originalS3;if(originalBucket===undefined)delete process.env.AWS_S3_BUCKET_NAME;else process.env.AWS_S3_BUCKET_NAME=originalBucket;
  if(savedSettings)await db.query('UPDATE career_ai_settings SET enabled=$1,auto_since=$2,daily_calls=$3,monthly_tokens=$4',[savedSettings.enabled,savedSettings.auto_since,savedSettings.daily_calls,savedSettings.monthly_tokens]);
  await db.query(`DELETE FROM user_notifications WHERE user_id=ANY($1::uuid[])
  OR (type='career_review' AND reference_id::text IN (SELECT id::text FROM career_entries WHERE business_partner_id=ANY($2::uuid[])))`,[users,partners]);
  await db.query('DELETE FROM career_entries WHERE business_partner_id=ANY($1::uuid[])',[partners]);
  await db.query('DELETE FROM career_extractions WHERE article_id=$1',[article]);
  await db.query('DELETE FROM ai_call_usage WHERE id=ANY($1::uuid[])',[requestIds]);
  await db.query('DELETE FROM scraped_content WHERE id=$1',[article]);
  await db.query('DELETE FROM users WHERE id=ANY($1::uuid[])',[users]);
  await db.query('DELETE FROM business_partners WHERE id=ANY($1::uuid[])',[partners]);
  await db.query('DELETE FROM categories WHERE id=$1',[category]);
 }
}
run().catch(e=>{console.error('[smoke:career]',e);process.exitCode=1;}).finally(()=>db.end());
