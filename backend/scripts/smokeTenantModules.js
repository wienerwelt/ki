const db = require('../config/db');
const {
  hasTenantModule,
  normalizeTenantModules,
  normalizeWorkspace,
  requireTenantModule,
} = require('../services/tenantModuleService');

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const runMiddleware = (middleware, user) => new Promise((resolve) => {
  const result = { status: null, body: null, next: false };
  const req = { user };
  const res = {
    status(code) { result.status = code; return this; },
    json(body) { result.body = body; resolve(result); return this; },
  };
  middleware(req, res, () => {
    result.next = true;
    resolve(result);
  });
});

async function run() {
  assert(JSON.stringify(normalizeTenantModules(['sales', 'unknown', 'sales'])) === JSON.stringify(['sales']), 'Modulnormalisierung ist fehlerhaft.');
  assert(normalizeWorkspace('content', ['sales']) === 'sales', 'Standard-Arbeitsbereich wird nicht auf ein freigeschaltetes Modul begrenzt.');
  assert(hasTenantModule({ role: 'assistenz', tenant_modules: ['sales'] }, 'sales'), 'Sales-Modul wird nicht erkannt.');
  assert(!hasTenantModule({ role: 'assistenz', tenant_modules: ['content'] }, 'sales'), 'Nicht gebuchtes Sales-Modul wurde freigegeben.');
  assert(normalizeTenantModules(['content']).includes('content'), 'Content-Fallback fehlt.');

  const denied = await runMiddleware(
    requireTenantModule('sales', { allowedRoles: ['assistenz', 'sales_user'] }),
    { role: 'sales_user', tenant_modules: ['content'] }
  );
  assert(denied.status === 403 && denied.body?.code === 'TENANT_MODULE_NOT_ENABLED', 'Sales-API wird ohne Mandantenfreigabe nicht gesperrt.');

  const allowed = await runMiddleware(
    requireTenantModule('sales', { allowedRoles: ['assistenz', 'sales_user'] }),
    { role: 'sales_user', tenant_modules: ['sales'] }
  );
  assert(allowed.next === true, 'Berechtigter Sales-Nutzer wird fälschlich gesperrt.');

  const schema = await db.query(`
    SELECT
      EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'business_partners' AND column_name = 'enabled_modules'
      ) AS modules_column,
      EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'business_partners' AND column_name = 'default_workspace'
      ) AS default_workspace_column,
      EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'preferred_workspace'
      ) AS user_workspace_column
  `);
  const columns = schema.rows[0] || {};
  assert(columns.modules_column && columns.default_workspace_column && columns.user_workspace_column, 'Spalten für Mandantenmodule oder Nutzer-Arbeitsbereich fehlen.');

  const invalidPartners = await db.query(`
    SELECT COUNT(*)::int AS count
    FROM business_partners
    WHERE cardinality(enabled_modules) = 0
       OR NOT (default_workspace = ANY(enabled_modules))
  `);
  assert(invalidPartners.rows[0]?.count === 0, 'Mindestens ein Mandant hat ungültige Produktmodule.');

  const roles = await db.query(`SELECT name FROM roles WHERE name IN ('sales_manager', 'sales_user')`);
  assert(roles.rowCount === 2, 'Sales-Rollen fehlen.');

  console.log(JSON.stringify({
    ok: true,
    moduleBoundary: true,
    workspaceConstraints: true,
    salesRoles: roles.rows.map((row) => row.name).sort(),
  }, null, 2));
}

run()
  .catch((error) => {
    console.error('[smoke:tenant-modules]', error.message);
    process.exitCode = 1;
  })
  .finally(() => db.end());
