export const PERMISSION_KEYS = Object.freeze({
  ADMIN_DASHBOARD_ACCESS: 'admin.dashboard.access',
  ADMIN_INBOX_VIEW: 'admin.inbox.view',
  ADMIN_ORDERS_VIEW: 'admin.orders.view',
  ADMIN_REFUNDS_MANAGE: 'admin.refunds.manage',
  ADMIN_SUPPORT_MANAGE: 'admin.support.manage',
  ADMIN_USERS_VIEW: 'admin.users.view',
  ADMIN_DRIVERS_MANAGE: 'admin.drivers.manage',
  ADMIN_PRODUCTS_VIEW: 'admin.products.view',
  ADMIN_STOCKS_MANAGE: 'admin.stocks.manage',
  ADMIN_PROMOTIONS_MANAGE: 'admin.promotions.manage',
  ADMIN_EMERGENCY_SALES_MANAGE: 'admin.emergency_sales.manage',
  ADMIN_EMERGENCY_REPORTS_VIEW: 'admin.emergency_reports.view',
  ADMIN_POS_MANAGEMENT: 'admin.pos.management',
  ADMIN_POS_SYNC_MANAGE: 'admin.pos_sync.manage',
  ADMIN_CASHIERS_MANAGE: 'admin.cashiers.manage',
  ADMIN_QUOTATIONS_MANAGE: 'admin.quotations.manage',
  ADMIN_SALES_VIEW: 'admin.sales.view',
  ADMIN_BUSINESS_OPERATIONS_VIEW: 'admin.business_operations.view',
  ADMIN_SYSTEM_MANAGE: 'admin.system.manage',
  ADMIN_SECURITY_MANAGE: 'admin.security.manage',
  ADMIN_USERS_MANAGE_PERMISSIONS: 'admin.users.manage_permissions',
});

export const hasPermission = (user, permissionKey) => {
  if (!user || !permissionKey) return false;

  const role = String(user.role || '').toLowerCase();
  if (role === 'super_admin') return true;

  const permissions = Array.isArray(user.permissions) ? user.permissions : [];
  return permissions.includes(permissionKey);
};

export const getDashboardPathForUser = (user) => {
  if (!user) return null;

  if (hasPermission(user, PERMISSION_KEYS.ADMIN_DASHBOARD_ACCESS)) {
    return '/admin';
  }

  if (user.role === 'driver') return '/driver';
  if (user.role === 'cashier') return '/cashier';

  return null;
};
