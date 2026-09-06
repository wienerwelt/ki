const VALID_TENANT_MODULES = Object.freeze(['content', 'sales']);
const ACCOUNT_RADAR_ROLES = Object.freeze(['admin', 'assistenz', 'sales_manager', 'sales_user', 'demo']);
const ACCOUNT_RADAR_MANAGER_ROLES = Object.freeze(['admin', 'assistenz', 'sales_manager']);

function normalizeTenantModules(value, fallback = ['content']) {
  const source = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(',')
      : [];
  const normalized = Array.from(new Set(
    source
      .map((moduleName) => String(moduleName || '').trim().toLowerCase())
      .filter((moduleName) => VALID_TENANT_MODULES.includes(moduleName))
  ));
  return normalized.length ? normalized : [...fallback];
}

function normalizeWorkspace(value, modules = ['content']) {
  const normalizedModules = normalizeTenantModules(modules);
  const requested = String(value || '').trim().toLowerCase();
  if (normalizedModules.includes(requested)) return requested;
  return normalizedModules.includes('content') ? 'content' : normalizedModules[0];
}

function hasTenantModule(user, moduleName) {
  if (String(user?.role || '').toLowerCase() === 'admin') return true;
  const modules = normalizeTenantModules(user?.tenant_modules || user?.enabled_modules);
  return modules.includes(moduleName);
}

function requireTenantModule(moduleName, options = {}) {
  const allowedRoles = Array.isArray(options.allowedRoles)
    ? new Set(options.allowedRoles.map((role) => String(role).toLowerCase()))
    : null;

  return (req, res, next) => {
    const role = String(req.user?.role || '').toLowerCase();
    if (allowedRoles && !allowedRoles.has(role)) {
      return res.status(403).json({ message: 'Für diese Funktion fehlt die erforderliche Benutzerberechtigung.' });
    }
    if (!hasTenantModule(req.user, moduleName)) {
      return res.status(403).json({
        message: moduleName === 'sales'
          ? 'Der Account-Radar ist für diesen Mandanten nicht freigeschaltet.'
          : 'Der Content-Arbeitsbereich ist für diesen Mandanten nicht freigeschaltet.',
        code: 'TENANT_MODULE_NOT_ENABLED',
        module: moduleName,
      });
    }
    return next();
  };
}

module.exports = {
  ACCOUNT_RADAR_MANAGER_ROLES,
  ACCOUNT_RADAR_ROLES,
  VALID_TENANT_MODULES,
  hasTenantModule,
  normalizeTenantModules,
  normalizeWorkspace,
  requireTenantModule,
};
