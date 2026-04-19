const PERMISSIONS = {
  ADMIN_DASHBOARD_ACCESS: 'admin.dashboard.access',

  ADMIN_INBOX_VIEW: 'admin.inbox.view',
  ADMIN_ORDERS_VIEW: 'admin.orders.view',
  ADMIN_ORDERS_MANAGE: 'admin.orders.manage',
  ADMIN_REFUNDS_MANAGE: 'admin.refunds.manage',
  ADMIN_SUPPORT_MANAGE: 'admin.support.manage',

  ADMIN_USERS_VIEW: 'admin.users.view',
  ADMIN_USERS_MANAGE_ROLES: 'admin.users.manage_roles',
  ADMIN_USERS_MANAGE_PERMISSIONS: 'admin.users.manage_permissions',
  ADMIN_USERS_DELETE: 'admin.users.delete',

  ADMIN_DRIVERS_MANAGE: 'admin.drivers.manage',
  ADMIN_CASHIERS_MANAGE: 'admin.cashiers.manage',

  ADMIN_PRODUCTS_VIEW: 'admin.products.view',
  ADMIN_PRODUCTS_MANAGE: 'admin.products.manage',
  ADMIN_STOCKS_MANAGE: 'admin.stocks.manage',
  ADMIN_PROMOTIONS_MANAGE: 'admin.promotions.manage',

  ADMIN_SALES_VIEW: 'admin.sales.view',
  ADMIN_REPORTS_VIEW: 'admin.reports.view',

  ADMIN_EMERGENCY_SALES_MANAGE: 'admin.emergency_sales.manage',
  ADMIN_EMERGENCY_REPORTS_VIEW: 'admin.emergency_reports.view',
  ADMIN_POS_MANAGEMENT: 'admin.pos.management',
  ADMIN_POS_SYNC_MANAGE: 'admin.pos_sync.manage',

  ADMIN_QUOTATIONS_MANAGE: 'admin.quotations.manage',

  ADMIN_BUSINESS_OPERATIONS_VIEW: 'admin.business_operations.view',
  ADMIN_GOODS_INTAKE_MANAGE: 'admin.goods_intake.manage',
  ADMIN_EMPLOYEES_MANAGE: 'admin.employees.manage',
  ADMIN_PAYROLL_MANAGE: 'admin.payroll.manage',
  ADMIN_EXPENSES_MANAGE: 'admin.expenses.manage',
  ADMIN_IMPORT_EXPORT_MANAGE: 'admin.import_export.manage',

  ADMIN_SYSTEM_MANAGE: 'admin.system.manage',
  ADMIN_SECURITY_MANAGE: 'admin.security.manage',
};

const ALL_PERMISSION_KEYS = Object.freeze(Object.values(PERMISSIONS));

const ROLE_DEFAULT_PERMISSIONS = Object.freeze({
  super_admin: ALL_PERMISSION_KEYS,
  admin: ALL_PERMISSION_KEYS,
  driver: [],
  cashier: [],
  user: [],
});

const PERMISSION_GROUPS = Object.freeze([
  {
    id: 'core',
    label: 'Core Access',
    permissions: [
      { key: PERMISSIONS.ADMIN_DASHBOARD_ACCESS, label: 'Admin dashboard access' },
    ],
  },
  {
    id: 'online',
    label: 'Online Store Operations',
    permissions: [
      { key: PERMISSIONS.ADMIN_INBOX_VIEW, label: 'Inbox' },
      { key: PERMISSIONS.ADMIN_ORDERS_VIEW, label: 'Orders' },
      { key: PERMISSIONS.ADMIN_ORDERS_MANAGE, label: 'Manage orders' },
      { key: PERMISSIONS.ADMIN_REFUNDS_MANAGE, label: 'Manage refunds' },
      { key: PERMISSIONS.ADMIN_SUPPORT_MANAGE, label: 'Support tickets' },
      { key: PERMISSIONS.ADMIN_USERS_VIEW, label: 'View users' },
      { key: PERMISSIONS.ADMIN_USERS_MANAGE_ROLES, label: 'Manage user roles' },
      { key: PERMISSIONS.ADMIN_USERS_MANAGE_PERMISSIONS, label: 'Manage user permissions' },
      { key: PERMISSIONS.ADMIN_USERS_DELETE, label: 'Delete users' },
      { key: PERMISSIONS.ADMIN_DRIVERS_MANAGE, label: 'Manage drivers' },
      { key: PERMISSIONS.ADMIN_SALES_VIEW, label: 'Sales analytics' },
    ],
  },
  {
    id: 'catalog',
    label: 'Shared Catalog',
    permissions: [
      { key: PERMISSIONS.ADMIN_PRODUCTS_VIEW, label: 'View products' },
      { key: PERMISSIONS.ADMIN_PRODUCTS_MANAGE, label: 'Manage products' },
      { key: PERMISSIONS.ADMIN_STOCKS_MANAGE, label: 'Manage stock overrides' },
      { key: PERMISSIONS.ADMIN_PROMOTIONS_MANAGE, label: 'Manage promotions' },
      { key: PERMISSIONS.ADMIN_REPORTS_VIEW, label: 'View reports' },
    ],
  },
  {
    id: 'pos',
    label: 'POS and Emergency',
    permissions: [
      { key: PERMISSIONS.ADMIN_EMERGENCY_SALES_MANAGE, label: 'Emergency sales' },
      { key: PERMISSIONS.ADMIN_EMERGENCY_REPORTS_VIEW, label: 'Emergency reports' },
      { key: PERMISSIONS.ADMIN_POS_MANAGEMENT, label: 'POS product management' },
      { key: PERMISSIONS.ADMIN_POS_SYNC_MANAGE, label: 'POS sync monitor and controls' },
      { key: PERMISSIONS.ADMIN_CASHIERS_MANAGE, label: 'Manage emergency cashiers' },
    ],
  },
  {
    id: 'business',
    label: 'Business Operations',
    permissions: [
      { key: PERMISSIONS.ADMIN_QUOTATIONS_MANAGE, label: 'Quotations' },
      { key: PERMISSIONS.ADMIN_BUSINESS_OPERATIONS_VIEW, label: 'Business operations dashboard' },
      { key: PERMISSIONS.ADMIN_GOODS_INTAKE_MANAGE, label: 'Goods intake' },
      { key: PERMISSIONS.ADMIN_EMPLOYEES_MANAGE, label: 'Employees' },
      { key: PERMISSIONS.ADMIN_PAYROLL_MANAGE, label: 'Payroll' },
      { key: PERMISSIONS.ADMIN_EXPENSES_MANAGE, label: 'Expenses' },
      { key: PERMISSIONS.ADMIN_IMPORT_EXPORT_MANAGE, label: 'Import and export' },
    ],
  },
  {
    id: 'administration',
    label: 'Administration',
    permissions: [
      { key: PERMISSIONS.ADMIN_SYSTEM_MANAGE, label: 'System settings' },
      { key: PERMISSIONS.ADMIN_SECURITY_MANAGE, label: 'Security settings' },
    ],
  },
]);

const isValidPermissionKey = (key) => ALL_PERMISSION_KEYS.includes(key);

module.exports = {
  PERMISSIONS,
  ALL_PERMISSION_KEYS,
  ROLE_DEFAULT_PERMISSIONS,
  PERMISSION_GROUPS,
  isValidPermissionKey,
};
