/**
 * Admin verification middleware
 * Ensures user has dashboard access and route-level permission.
 */

const { PERMISSIONS } = require('../security/permissions');
const { getEffectivePermissionsForUser } = require('../security/userPermissions.service');

const isWriteMethod = (method) => ['POST', 'PUT', 'PATCH', 'DELETE'].includes(String(method || '').toUpperCase());

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
    return PERMISSIONS.ADMIN_USERS_VIEW;
  }

  if (rawUrl.startsWith('/api/admin/orders')) {
    return isWriteMethod(method) ? PERMISSIONS.ADMIN_ORDERS_MANAGE : PERMISSIONS.ADMIN_ORDERS_VIEW;
  }

  if (rawUrl.startsWith('/api/admin/refunds')) {
    return PERMISSIONS.ADMIN_REFUNDS_MANAGE;
  }

  if (rawUrl.startsWith('/api/admin/promotions')) {
    return PERMISSIONS.ADMIN_PROMOTIONS_MANAGE;
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
    return PERMISSIONS.ADMIN_EMERGENCY_SALES_MANAGE;
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
    if (rawUrl.includes('/goods-intake')) return PERMISSIONS.ADMIN_GOODS_INTAKE_MANAGE;
    if (rawUrl.includes('/payroll')) return PERMISSIONS.ADMIN_PAYROLL_MANAGE;
    if (rawUrl.includes('/employees')) return PERMISSIONS.ADMIN_EMPLOYEES_MANAGE;
    if (rawUrl.includes('/expenses')) return PERMISSIONS.ADMIN_EXPENSES_MANAGE;
    if (rawUrl.includes('/imports') || rawUrl.includes('/export')) return PERMISSIONS.ADMIN_IMPORT_EXPORT_MANAGE;
    return PERMISSIONS.ADMIN_BUSINESS_OPERATIONS_VIEW;
  }

  if (rawUrl.startsWith('/api/products')) {
    return isWriteMethod(method) ? PERMISSIONS.ADMIN_PRODUCTS_MANAGE : PERMISSIONS.ADMIN_PRODUCTS_VIEW;
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
      console.warn('[ADMIN_AUTH] Access denied - missing dashboard access permission', {
        userId,
        email: req.user.email,
        role: userRole,
      });
      return res.status(403).json({ message: 'Access denied. Admin dashboard access is required.' });
    }

    const requiredPermission = resolveRequiredPermission(req);
    if (requiredPermission && !permissionSet.has(requiredPermission)) {
      console.warn('[ADMIN_AUTH] Access denied - missing required permission', {
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

    console.log('[ADMIN_AUTH] Access granted:', {
      userId,
      email: req.user.email,
      role: userRole,
      requiredPermission,
    });
    return next();
  } catch (error) {
    console.error('[ADMIN_AUTH] Permission evaluation failed:', error);
    return res.status(500).json({ message: 'Failed to evaluate permissions' });
  }
};

module.exports = { verifyAdmin };
