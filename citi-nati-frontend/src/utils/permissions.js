export const PERMISSION_KEYS = Object.freeze({
  ADMIN_DASHBOARD_ACCESS: 'admin.dashboard.access',
  ADMIN_INBOX_VIEW: 'admin.inbox.view',
  ADMIN_ORDERS_VIEW: 'admin.orders.view',
  ADMIN_ORDERS_MANAGE: 'admin.orders.manage',
  ADMIN_REFUNDS_MANAGE: 'admin.refunds.manage',
  ADMIN_SUPPORT_MANAGE: 'admin.support.manage',
  ADMIN_USERS_VIEW: 'admin.users.view',
  ADMIN_USERS_MANAGE_ROLES: 'admin.users.manage_roles',
  ADMIN_USERS_DELETE: 'admin.users.delete',
  ADMIN_DRIVERS_MANAGE: 'admin.drivers.manage',
  ADMIN_PRODUCTS_VIEW: 'admin.products.view',
  ADMIN_PRODUCTS_MANAGE: 'admin.products.manage',
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

  PRODUCTS_ACCESS: 'admin.products.access',
  STOCKS_ACCESS: 'admin.stocks.access',
  PROMOTIONS_ACCESS: 'admin.promotions.access',
  EMERGENCY_SALES_ACCESS: 'admin.emergency_sales.access',
  USERS_MANAGEMENT_ACCESS: 'admin.users_management.access',
  BUSINESS_OPERATIONS_ACCESS: 'admin.business_operations.access',

  BO_SALES_REPORTS_VIEW: 'admin.business_operations.sales_reports.view',
  BO_SUPPLIERS_VIEW: 'admin.business_operations.suppliers.view',
  BO_GOODS_INTAKE_VIEW: 'admin.business_operations.goods_intake.view',
  BO_PURCHASE_ORDERS_VIEW: 'admin.business_operations.purchase_orders.view',
  BO_PURCHASE_ORDERS_CREATE: 'admin.business_operations.purchase_orders.create',
  BO_PURCHASE_ORDERS_EDIT: 'admin.business_operations.purchase_orders.edit',
  BO_PURCHASE_ORDERS_DELETE: 'admin.business_operations.purchase_orders.delete',
  BO_PURCHASE_ORDERS_EXPORT: 'admin.business_operations.purchase_orders.export',
  BO_EXPENSES_VIEW: 'admin.business_operations.expenses.view',
  BO_MONTHLY_SUMMARY_VIEW: 'admin.business_operations.monthly_summary.view',
  BO_EMPLOYEES_VIEW: 'admin.business_operations.employees.view',
  BO_PAYROLL_VIEW: 'admin.business_operations.payroll.view',
  BO_REPORT_HISTORY_VIEW: 'admin.business_operations.report_history.view',
  BO_SALES_BALANCING_VIEW: 'admin.business_operations.sales_balancing.view',
  BO_ANALYTICS_VIEW: 'admin.business_operations.analytics.view',
  BO_ACTIONS_VIEW: 'admin.business_operations.actions.view',

  BO_MONTHLY_SUMMARY_OVERVIEW_CARDS_VIEW: 'admin.business_operations.monthly_summary.overview_cards.view',
  BO_MONTHLY_SUMMARY_SALES_OVERVIEW_VIEW: 'admin.business_operations.monthly_summary.sales_overview.view',
  BO_MONTHLY_SUMMARY_EXPENSES_OVERVIEW_VIEW: 'admin.business_operations.monthly_summary.expenses_overview.view',
  BO_MONTHLY_SUMMARY_PAYROLL_OVERVIEW_VIEW: 'admin.business_operations.monthly_summary.payroll_overview.view',
  BO_MONTHLY_SUMMARY_SUPPLIERS_OVERVIEW_VIEW: 'admin.business_operations.monthly_summary.suppliers_overview.view',
  BO_MONTHLY_SUMMARY_NET_OVERVIEW_VIEW: 'admin.business_operations.monthly_summary.net_overview.view',
  BO_GOODS_INTAKE_FORM_VIEW: 'admin.business_operations.goods_intake.form.view',
  BO_GOODS_INTAKE_HISTORY_VIEW: 'admin.business_operations.goods_intake.history.view',
  BO_SALES_REPORTS_SUMMARY_VIEW: 'admin.business_operations.sales_reports.summary.view',
  BO_SALES_REPORTS_SALES_BY_VIEW: 'admin.business_operations.sales_reports.sales_by.view',

  BO_GOODS_INTAKE_CREATE: 'admin.business_operations.goods_intake.create',
  BO_GOODS_INTAKE_EDIT: 'admin.business_operations.goods_intake.edit',
  BO_GOODS_INTAKE_DELETE: 'admin.business_operations.goods_intake.delete',
  BO_GOODS_INTAKE_EXPORT: 'admin.business_operations.goods_intake.export',
  BO_SALES_REPORTS_EXPORT: 'admin.business_operations.sales_reports.export',
  BO_SALES_REPORTS_IMPORT: 'admin.business_operations.sales_reports.import',
  BO_SALES_REPORTS_FULL_WORKBOOK_EXPORT: 'admin.business_operations.sales_reports.full_workbook.export',
  BO_SALES_REPORTS_FULL_WORKBOOK_IMPORT: 'admin.business_operations.sales_reports.full_workbook.import',
  BO_ACTIONS_WIPE_DATA: 'admin.business_operations.actions.wipe_data',
});

const PERMISSION_EQUIVALENTS = Object.freeze({
  [PERMISSION_KEYS.BUSINESS_OPERATIONS_ACCESS]: [PERMISSION_KEYS.ADMIN_BUSINESS_OPERATIONS_VIEW],
  [PERMISSION_KEYS.ADMIN_BUSINESS_OPERATIONS_VIEW]: [PERMISSION_KEYS.BUSINESS_OPERATIONS_ACCESS],
  [PERMISSION_KEYS.PRODUCTS_ACCESS]: [PERMISSION_KEYS.ADMIN_PRODUCTS_VIEW],
  [PERMISSION_KEYS.ADMIN_PRODUCTS_VIEW]: [PERMISSION_KEYS.PRODUCTS_ACCESS],
  [PERMISSION_KEYS.ADMIN_PRODUCTS_MANAGE]: [PERMISSION_KEYS.ADMIN_PRODUCTS_VIEW],
  [PERMISSION_KEYS.STOCKS_ACCESS]: [PERMISSION_KEYS.ADMIN_STOCKS_MANAGE],
  [PERMISSION_KEYS.ADMIN_STOCKS_MANAGE]: [PERMISSION_KEYS.STOCKS_ACCESS],
  [PERMISSION_KEYS.ADMIN_ORDERS_MANAGE]: [PERMISSION_KEYS.ADMIN_ORDERS_VIEW],
  [PERMISSION_KEYS.PROMOTIONS_ACCESS]: [PERMISSION_KEYS.ADMIN_PROMOTIONS_MANAGE],
  [PERMISSION_KEYS.ADMIN_PROMOTIONS_MANAGE]: [PERMISSION_KEYS.PROMOTIONS_ACCESS],
  [PERMISSION_KEYS.EMERGENCY_SALES_ACCESS]: [PERMISSION_KEYS.ADMIN_EMERGENCY_SALES_MANAGE],
  [PERMISSION_KEYS.ADMIN_EMERGENCY_SALES_MANAGE]: [PERMISSION_KEYS.EMERGENCY_SALES_ACCESS],
  [PERMISSION_KEYS.USERS_MANAGEMENT_ACCESS]: [PERMISSION_KEYS.ADMIN_USERS_VIEW],
  [PERMISSION_KEYS.ADMIN_USERS_VIEW]: [PERMISSION_KEYS.USERS_MANAGEMENT_ACCESS],
});

const hasRawPermission = (permissions, key) => permissions.includes(key);

export const hasPermission = (user, permissionKey) => {
  if (!user || !permissionKey) return false;

  const role = String(user.role || '').toLowerCase();
  // Allow full access for super admins and system/admin roles so the UI shows
  // privileged tabs (e.g., Business Operations) to system administrators.
  if (['super_admin', 'admin', 'administrator', 'system_administrator'].includes(role)) return true;

  const permissions = Array.isArray(user.permissions) ? user.permissions : [];
  if (hasRawPermission(permissions, permissionKey)) return true;

  const equivalents = PERMISSION_EQUIVALENTS[permissionKey] || [];
  return equivalents.some((equivalentKey) => hasRawPermission(permissions, equivalentKey));
};

export const hasAnyPermission = (user, permissionKeys = []) => {
  if (!Array.isArray(permissionKeys) || permissionKeys.length === 0) return false;
  return permissionKeys.some((permissionKey) => hasPermission(user, permissionKey));
};

export const hasAllPermissions = (user, permissionKeys = []) => {
  if (!Array.isArray(permissionKeys) || permissionKeys.length === 0) return true;
  return permissionKeys.every((permissionKey) => hasPermission(user, permissionKey));
};

export const filterVisibleTabs = (tabs = [], user, parentPermissionKey = null) => {
  if (!Array.isArray(tabs)) return [];
  return tabs.filter((tab) => {
    if (parentPermissionKey && !hasPermission(user, parentPermissionKey)) return false;
    if (!tab?.permission) return true;
    return hasPermission(user, tab.permission);
  });
};

export const filterVisibleSections = (sections = [], user, parentPermissionKeys = []) => {
  if (!Array.isArray(sections)) return [];
  const parentsAllowed = hasAllPermissions(user, parentPermissionKeys);
  if (!parentsAllowed) return [];
  return sections.filter((section) => !section?.permission || hasPermission(user, section.permission));
};

export const BUSINESS_OPERATIONS_PERMISSION_TREE = Object.freeze({
  panelAccess: PERMISSION_KEYS.BUSINESS_OPERATIONS_ACCESS,
  tabs: Object.freeze([
    { id: 'sales-reports', permission: PERMISSION_KEYS.BO_SALES_REPORTS_VIEW },
    { id: 'suppliers', permission: PERMISSION_KEYS.BO_SUPPLIERS_VIEW },
    { id: 'goods-intake', permission: PERMISSION_KEYS.BO_GOODS_INTAKE_VIEW },
    { id: 'purchase-orders', permission: PERMISSION_KEYS.BO_PURCHASE_ORDERS_VIEW },
    { id: 'expenses', permission: PERMISSION_KEYS.BO_EXPENSES_VIEW },
    { id: 'monthly-summary', permission: PERMISSION_KEYS.BO_MONTHLY_SUMMARY_VIEW },
    { id: 'employees', permission: PERMISSION_KEYS.BO_EMPLOYEES_VIEW },
    { id: 'payroll', permission: PERMISSION_KEYS.BO_PAYROLL_VIEW },
    { id: 'report-history', permission: PERMISSION_KEYS.BO_REPORT_HISTORY_VIEW },
    { id: 'sales-balancing', permission: PERMISSION_KEYS.BO_SALES_BALANCING_VIEW },
    { id: 'analytics-performance', permission: PERMISSION_KEYS.BO_ANALYTICS_VIEW },
    { id: 'actions', permission: PERMISSION_KEYS.BO_ACTIONS_VIEW },
  ]),
  sections: Object.freeze({
    'monthly-summary': [
      { id: 'overview-cards', permission: PERMISSION_KEYS.BO_MONTHLY_SUMMARY_OVERVIEW_CARDS_VIEW },
      { id: 'sales-overview', permission: PERMISSION_KEYS.BO_MONTHLY_SUMMARY_SALES_OVERVIEW_VIEW },
      { id: 'expenses-overview', permission: PERMISSION_KEYS.BO_MONTHLY_SUMMARY_EXPENSES_OVERVIEW_VIEW },
      { id: 'payroll-overview', permission: PERMISSION_KEYS.BO_MONTHLY_SUMMARY_PAYROLL_OVERVIEW_VIEW },
      { id: 'suppliers-overview', permission: PERMISSION_KEYS.BO_MONTHLY_SUMMARY_SUPPLIERS_OVERVIEW_VIEW },
      { id: 'net-overview', permission: PERMISSION_KEYS.BO_MONTHLY_SUMMARY_NET_OVERVIEW_VIEW },
    ],
    'goods-intake': [
      { id: 'form', permission: PERMISSION_KEYS.BO_GOODS_INTAKE_FORM_VIEW },
      { id: 'history', permission: PERMISSION_KEYS.BO_GOODS_INTAKE_HISTORY_VIEW },
    ],
    'sales-reports': [
      { id: 'summary', permission: PERMISSION_KEYS.BO_SALES_REPORTS_SUMMARY_VIEW },
      { id: 'sales-by', permission: PERMISSION_KEYS.BO_SALES_REPORTS_SALES_BY_VIEW },
    ],
  }),
  actions: Object.freeze({
    'goods-intake': [
      PERMISSION_KEYS.BO_GOODS_INTAKE_CREATE,
      PERMISSION_KEYS.BO_GOODS_INTAKE_EDIT,
      PERMISSION_KEYS.BO_GOODS_INTAKE_DELETE,
      PERMISSION_KEYS.BO_GOODS_INTAKE_EXPORT,
    ],
    'sales-reports': [
      PERMISSION_KEYS.BO_SALES_REPORTS_EXPORT,
      PERMISSION_KEYS.BO_SALES_REPORTS_IMPORT,
      PERMISSION_KEYS.BO_SALES_REPORTS_FULL_WORKBOOK_EXPORT,
      PERMISSION_KEYS.BO_SALES_REPORTS_FULL_WORKBOOK_IMPORT,
    ],
    actions: [PERMISSION_KEYS.BO_ACTIONS_WIPE_DATA],
  }),
});

export const getDashboardPathForUser = (user) => {
  if (!user) return null;

  if (hasPermission(user, PERMISSION_KEYS.ADMIN_DASHBOARD_ACCESS)) {
    return '/admin';
  }

  if (user.role === 'driver') return '/driver';
  if (user.role === 'cashier') return '/cashier';

  return null;
};
