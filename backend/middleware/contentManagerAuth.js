const tenantManagerAuth = require('./tenantManagerAuth');
const { requireTenantModule } = require('../services/tenantModuleService');

const requireContentModule = requireTenantModule('content');

module.exports = (req, res, next) => tenantManagerAuth(req, res, () => requireContentModule(req, res, next));
