/**
 * Admin verification middleware
 * Ensures user has dashboard access and route-level permission.
 */

const { PERMISSIONS } = require('../security/permissions');
const { getEffectivePermissionsForUser } = require('../security/userPermissions.service');
const logger = require('../utils/logger');

const isWriteMethod = (method) => ['POST', 'PUT', 'PATCH', 'DELETE'].includes(String(method || '').toUpperCase());

/**
 * Lightweight admin verification for security key endpoints
 * Only checks authentication and admin role, bypasses permission checks
 * This allows admins to verify their key even if permissions are denied
 */
const verifyAdminRole = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ message: "Unauthorized. User not found." });
  }

  const userRole = String(req.user.role || '').toLowerCase();

  if (!['admin', 'super_admin'].includes(userRole)) {
    return res.status(403).json({ message: 'Forbidden. Admin role required.' });
  }

  return next();
};

const resolveRequiredPermission = (req) => {
  const method = String(req.method || '').toUpperCase();
  const rawUrl = String(req.originalUrl || '').toLowerCase().split('?')[0];

  if (rawUrl.startsWith('/api/admin/messages')) {
    return PERMISSIONS.ADMIN_INBOX_VIEW;
  }

  if (rawUrl.startsWith('/api/admin/users')) {
    if (rawUrl.includes('/permissions')) return PERMISSIONS.ADMIN_USERS_MANAGE_PERMISSIONS;
    if (rawUrl.endsWith('/role')) return PERMISSIONS.ADMIN_USERS_MANAGE_ROLES;
    if (method === 'DELETE') return PERMISSIONS.ADMIN_USERS_DELETE;
    return PERMISSIONS.ADMIN_USERS_MANAGEMENT_ACCESS;
  }

  if (rawUrl.startsWith('/api/admin/orders')) {
    return isWriteMethod(method) ? PERMISSIONS.ADMIN_ORDERS_MANAGE : PERMISSIONS.ADMIN_ORDERS_VIEW;
  }

  if (rawUrl.startsWith('/api/admin/refunds')) {
    return PERMISSIONS.ADMIN_REFUNDS_MANAGE;
  }

  if (rawUrl.startsWith('/api/admin/promotions')) {
    return isWriteMethod(method) ? PERMISSIONS.ADMIN_PROMOTIONS_MANAGE : PERMISSIONS.ADMIN_PROMOTIONS_ACCESS;
  }

  if (rawUrl.startsWith('/api/admin/security-key') || rawUrl.startsWith('/api/admin/security/')) {
    return PERMISSIONS.ADMIN_SECURITY_MANAGE;
  }

  if (rawUrl.startsWith('/api/admin/system')) {
    return PERMISSIONS.ADMIN_SYSTEM_MANAGE;
  }

  if (rawUrl.startsWith('/api/admin/drivers')) {
    return PERMISSIONS.ADMIN_DRIVERS_MANAGE;
  }

  if (rawUrl.startsWith('/api/admin/cashiers')) {
    return PERMISSIONS.ADMIN_CASHIERS_MANAGE;
  }

  if (rawUrl.startsWith('/api/admin/emergency-sales')) {
    return PERMISSIONS.ADMIN_EMERGENCY_SALES_ACCESS;
  }

  if (rawUrl.startsWith('/api/admin/quotations')) {
    return PERMISSIONS.ADMIN_QUOTATIONS_MANAGE;
  }

  if (rawUrl.startsWith('/api/admin/pos-sync')) {
    return PERMISSIONS.ADMIN_POS_SYNC_MANAGE;
  }

  if (rawUrl.startsWith('/api/admin/pos-products')) {
    return PERMISSIONS.ADMIN_POS_MANAGEMENT;
  }

  if (rawUrl.startsWith('/api/business-operations')) {
    if (rawUrl.includes('/admin/wipe-all-data')) return PERMISSIONS.BO_ACTIONS_WIPE_DATA;

    if (rawUrl.includes('/reports/sales/')) {
      if (rawUrl.includes('/summary')) return PERMISSIONS.BO_SALES_REPORTS_SUMMARY_VIEW;
      return PERMISSIONS.BO_SALES_REPORTS_VIEW;
    }

    if (rawUrl.includes('/goods-intake')) {
      if (method === 'POST') return PERMISSIONS.BO_GOODS_INTAKE_CREATE;
      if (method === 'PUT' || method === 'PATCH') return PERMISSIONS.BO_GOODS_INTAKE_EDIT;
      if (method === 'DELETE') return PERMISSIONS.BO_GOODS_INTAKE_DELETE;
      return PERMISSIONS.BO_GOODS_INTAKE_HISTORY_VIEW;
    }

    if (rawUrl.includes('/suppliers')) {
      if (isWriteMethod(method)) return PERMISSIONS.ADMIN_IMPORT_EXPORT_MANAGE;
      return PERMISSIONS.BO_SUPPLIERS_VIEW;
    }

    if (rawUrl.includes('/expenses')) {
      if (isWriteMethod(method)) return PERMISSIONS.ADMIN_EXPENSES_MANAGE;
      return PERMISSIONS.BO_EXPENSES_VIEW;
    }

    if (rawUrl.includes('/employees')) {
      if (isWriteMethod(method)) return PERMISSIONS.ADMIN_EMPLOYEES_MANAGE;
      return PERMISSIONS.BO_EMPLOYEES_VIEW;
    }

    if (rawUrl.includes('/payroll')) {
      if (isWriteMethod(method)) return PERMISSIONS.ADMIN_PAYROLL_MANAGE;
      return PERMISSIONS.BO_PAYROLL_VIEW;
    }

    if (rawUrl.includes('/sales-balancing')) {
      return method === 'GET' ? PERMISSIONS.BO_SALES_BALANCING_VIEW : PERMISSIONS.ADMIN_IMPORT_EXPORT_MANAGE;
    }

    if (rawUrl.includes('/export/full-workbook')) {
      return PERMISSIONS.BO_SALES_REPORTS_FULL_WORKBOOK_EXPORT;
    }

    if (rawUrl.includes('/export')) {
      return PERMISSIONS.BO_SALES_REPORTS_EXPORT;
    }

    if (rawUrl.includes('/imports') || rawUrl.includes('/import')) {
      return PERMISSIONS.BO_SALES_REPORTS_FULL_WORKBOOK_IMPORT;
    }

    if (rawUrl.includes('/locations')) return PERMISSIONS.ADMIN_BUSINESS_OPERATIONS_ACCESS;

    return PERMISSIONS.ADMIN_BUSINESS_OPERATIONS_ACCESS;
  }

  if (rawUrl.startsWith('/api/products')) {
    return isWriteMethod(method) ? PERMISSIONS.ADMIN_PRODUCTS_MANAGE : PERMISSIONS.ADMIN_PRODUCTS_ACCESS;
  }

  return PERMISSIONS.ADMIN_DASHBOARD_ACCESS;
};

const verifyAdmin = async (req, res, next) => {
  // Check if user object exists (should be set by verifyTokenMiddleware)
  if (!req.user) {
    return res.status(401).json({ message: "Unauthorized. User not found." });
  }

  const userRole = String(req.user.role || '').toLowerCase();
  const userId = req.user.userId;

  if (!userId) {
    return res.status(401).json({ message: 'Unauthorized. Invalid token payload.' });
  }

  if (userRole === 'super_admin') {
    return next();
  }

  try {
    const effectivePermissions = await getEffectivePermissionsForUser(userId, userRole);
    const permissionSet = new Set(effectivePermissions);

    if (!permissionSet.has(PERMISSIONS.ADMIN_DASHBOARD_ACCESS)) {
      logger.warnLog('[ADMIN_AUTH] Access denied - missing dashboard access permission', {
        userId,
        email: req.user.email,
        role: userRole,
      });
      return res.status(403).json({ message: 'Access denied. Admin dashboard access is required.' });
    }

    const requiredPermission = resolveRequiredPermission(req);
    if (requiredPermission && !permissionSet.has(requiredPermission)) {
      logger.warnLog('[ADMIN_AUTH] Access denied - missing required permission', {
        userId,
        email: req.user.email,
        role: userRole,
        requiredPermission,
      });
      return res.status(403).json({
        message: 'Access denied. Missing required permission.',
        requiredPermission,
      });
    }

    req.userPermissions = effectivePermissions;
    req.requiredPermission = requiredPermission;

    logger.debugLog('[ADMIN_AUTH] Access granted:', {
      userId,
      email: req.user.email,
      role: userRole,
      requiredPermission,
    });
    return next();
  } catch (error) {
    logger.errorLog('[ADMIN_AUTH] Permission evaluation failed:', { message: error && error.message ? error.message : String(error) });
    return res.status(500).json({ message: 'Failed to evaluate permissions' });
  }
};

module.exports = { verifyAdmin, verifyAdminRole };
