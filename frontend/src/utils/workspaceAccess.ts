import type { BusinessPartnerData, UserPayload } from '../context/AuthContext';

export type WorkspaceModule = 'content' | 'sales';

const SALES_ROLES = new Set(['admin', 'assistenz', 'sales_manager', 'sales_user', 'demo']);

export const getTenantModules = (
  user: UserPayload | null,
  businessPartner: BusinessPartnerData | null
): WorkspaceModule[] => {
  const source = businessPartner?.enabled_modules || user?.tenant_modules || ['content'];
  const modules = Array.from(new Set(
    source.filter((moduleName): moduleName is WorkspaceModule => moduleName === 'content' || moduleName === 'sales')
  ));
  return modules.length ? modules : ['content'];
};

export const canUseContentWorkspace = (
  user: UserPayload | null,
  businessPartner: BusinessPartnerData | null
) => user?.role === 'admin' || (
  !['sales_manager', 'sales_user'].includes(String(user?.role || '').toLowerCase())
  && getTenantModules(user, businessPartner).includes('content')
);

export const canUseSalesWorkspace = (
  user: UserPayload | null,
  businessPartner: BusinessPartnerData | null
) => Boolean(user && SALES_ROLES.has(String(user.role || '').toLowerCase()))
  && (user?.role === 'admin' || getTenantModules(user, businessPartner).includes('sales'));

export const getPreferredWorkspace = (
  user: UserPayload | null,
  businessPartner: BusinessPartnerData | null
): WorkspaceModule | null => {
  const canContent = canUseContentWorkspace(user, businessPartner);
  const canSales = canUseSalesWorkspace(user, businessPartner);
  if (canContent && !canSales) return 'content';
  if (canSales && !canContent) return 'sales';
  if (!canContent && !canSales) return null;

  const requested = user?.preferred_workspace
    || businessPartner?.default_workspace
    || user?.tenant_default_workspace
    || 'content';
  return requested === 'sales' && canSales ? 'sales' : 'content';
};

export const getWorkspacePath = (workspace: WorkspaceModule | null) => (
  workspace === 'sales' ? '/radar' : workspace === 'content' ? '/dashboard' : '/profile'
);

export const getDefaultWorkspacePath = (
  user: UserPayload | null,
  businessPartner: BusinessPartnerData | null
) => getWorkspacePath(getPreferredWorkspace(user, businessPartner));
