const db = require('../config/db');
const { randomUUID } = require('crypto');

async function startUsage(provider, model, context = {}) {
 const id = randomUUID();
 let partnerId = context.businessPartnerId || null;
 if (!partnerId && context.userId) {
  partnerId = (await db.query('SELECT business_partner_id FROM users WHERE id=$1',[context.userId])).rows[0]?.business_partner_id || null;
 }
 await db.query(`INSERT INTO ai_call_usage(id,provider,model,feature,source_id,job_id,user_id,business_partner_id,scope)
 VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,[id,provider,model,context.feature || 'ai_general',context.sourceId || null,
 context.jobId || null,context.userId || null,partnerId,partnerId ? 'tenant' : context.scope === 'shared' ? 'shared' : 'system']);
 return id;
}
async function finishUsage(id, usage, providerId) {
 await db.query(`UPDATE ai_call_usage SET status='completed',prompt_tokens=$2,completion_tokens=$3,total_tokens=$4,
 provider_request_id=$5,completed_at=now() WHERE id=$1`,[id,Number(usage.promptTokens || 0),Number(usage.completionTokens || 0),Number(usage.totalTokens || 0),providerId || null]);
}
async function unknownUsage(id) {
 if (id) await db.query("UPDATE ai_call_usage SET status='unknown',completed_at=now() WHERE id=$1",[id]);
}
module.exports = { startUsage, finishUsage, unknownUsage };
