const { PrismaClient } = require('@prisma/client');
const logger = require('../utils/logger');
const { getClientIp, getUserAgent } = require('../utils/requestContext');

const prisma = new PrismaClient();

async function recordAuditLog({
  req = null,
  actorUserId = null,
  action,
  resourceType,
  resourceId = null,
  status = 'SUCCESS',
  metadata = null,
}) {
  if (!action || !resourceType) {
    return;
  }

  try {
    await prisma.securityAuditLog.create({
      data: {
        actorUserId,
        action,
        resourceType,
        resourceId: resourceId === null || resourceId === undefined ? null : String(resourceId),
        status,
        ipAddress: req ? getClientIp(req) : null,
        userAgent: req ? getUserAgent(req) : null,
        metadata: metadata || undefined,
      },
    });
  } catch (error) {
    logger.error('[AUDIT] Failed to persist audit log', error);
  }
}

module.exports = {
  recordAuditLog,
};