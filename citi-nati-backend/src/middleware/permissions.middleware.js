const { hasPermission } = require('../security/userPermissions.service');

const requirePermission = (permissionKey) => {
  return async (req, res, next) => {
    if (!req.user || !req.user.userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const permissions = Array.isArray(req.userPermissions) ? req.userPermissions : null;
    if (permissions && permissions.includes(permissionKey)) {
      return next();
    }

    const allowed = await hasPermission(req.user.userId, req.user.role, permissionKey);
    if (!allowed) {
      return res.status(403).json({ error: 'Access denied', requiredPermission: permissionKey });
    }

    return next();
  };
};

module.exports = {
  requirePermission,
};
