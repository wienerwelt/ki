const authMiddleware = require('./authMiddleware');
const {
  ACCOUNT_RADAR_MANAGER_ROLES,
  requireTenantModule,
} = require('../services/tenantModuleService');
const { requireActiveSalesSubscription } = require('../services/salesPlanService');

const requireSalesModule = requireTenantModule('sales', {
  allowedRoles: ACCOUNT_RADAR_MANAGER_ROLES,
});

module.exports = (req, res, next) => authMiddleware(req, res, () => (
  requireSalesModule(req, res, () => requireActiveSalesSubscription(req, res, next))
));
