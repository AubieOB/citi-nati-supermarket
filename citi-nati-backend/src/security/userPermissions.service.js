const { PrismaClient } = require('@prisma/client');
const { ROLE_DEFAULT_PERMISSIONS, ALL_PERMISSION_KEYS, isValidPermissionKey } = require('./permissions');

const prisma = new PrismaClient();

const normalizeRole = (role) => String(role || 'user').toLowerCase();

const getRoleDefaultPermissions = (role) => {
  const normalizedRole = normalizeRole(role);
  return ROLE_DEFAULT_PERMISSIONS[normalizedRole] || [];
};

const getUserPermissionOverrides = async (userId) => {
  if (!userId) return [];
  return prisma.userPermission.findMany({
    where: { userId },
    select: { permissionKey: true, allowed: true },
  });
};

const buildEffectivePermissionSet = (role, overrides = []) => {
  const effective = new Set(getRoleDefaultPermissions(role));

  for (const override of overrides) {
    if (!isValidPermissionKey(override.permissionKey)) {
      continue;
    }

    if (override.allowed) {
      effective.add(override.permissionKey);
    } else {
      effective.delete(override.permissionKey);
    }
  }

  return effective;
};

const getEffectivePermissionSetForUser = async (userId, role) => {
  const overrides = await getUserPermissionOverrides(userId);
  return buildEffectivePermissionSet(role, overrides);
};

const getEffectivePermissionsForUser = async (userId, role) => {
  const set = await getEffectivePermissionSetForUser(userId, role);
  return Array.from(set.values());
};

const hasPermission = async (userId, role, permissionKey) => {
  if (!permissionKey) return false;
  if (!isValidPermissionKey(permissionKey)) return false;

  const permissionSet = await getEffectivePermissionSetForUser(userId, role);
  return permissionSet.has(permissionKey);
};

const getPermissionSnapshotForUser = async (userId, role) => {
  const overrides = await getUserPermissionOverrides(userId);
  const explicitPermissions = overrides.reduce((acc, item) => {
    if (isValidPermissionKey(item.permissionKey)) {
      acc[item.permissionKey] = item.allowed;
    }
    return acc;
  }, {});

  const effectiveSet = buildEffectivePermissionSet(role, overrides);
  const effectivePermissions = ALL_PERMISSION_KEYS.reduce((acc, key) => {
    acc[key] = effectiveSet.has(key);
    return acc;
  }, {});

  return {
    explicitPermissions,
    effectivePermissions,
  };
};

module.exports = {
  normalizeRole,
  getRoleDefaultPermissions,
  getUserPermissionOverrides,
  buildEffectivePermissionSet,
  getEffectivePermissionsForUser,
  hasPermission,
  getPermissionSnapshotForUser,
};
