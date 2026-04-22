const MS_PER_DAY = 24 * 60 * 60 * 1000;

function toPositiveInt(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.floor(parsed);
}

function daysAgo(days) {
  return new Date(Date.now() - (days * MS_PER_DAY));
}

function buildRetentionPolicyFromEnv() {
  return {
    posSyncEventDays: toPositiveInt(process.env.RETENTION_POS_SYNC_EVENT_DAYS, 14),
    securityAuditLogDays: toPositiveInt(process.env.RETENTION_SECURITY_AUDIT_DAYS, 30),
    permissionAuditLogDays: toPositiveInt(process.env.RETENTION_PERMISSION_AUDIT_DAYS, 45),
    adminMessageResolvedDays: toPositiveInt(process.env.RETENTION_ADMIN_MESSAGE_RESOLVED_DAYS, 30),
    adminMessageAllDays: toPositiveInt(process.env.RETENTION_ADMIN_MESSAGE_ALL_DAYS, 120),
    posWriteCommandDays: toPositiveInt(process.env.RETENTION_POS_WRITE_COMMAND_DAYS, 21),
    revokedRefreshTokenDays: toPositiveInt(process.env.RETENTION_REVOKED_REFRESH_TOKEN_DAYS, 14),
  };
}

async function runDataRetention(prisma, logger = console) {
  const policy = buildRetentionPolicyFromEnv();

  const now = new Date();
  const posSyncEventCutoff = daysAgo(policy.posSyncEventDays);
  const securityAuditCutoff = daysAgo(policy.securityAuditLogDays);
  const permissionAuditCutoff = daysAgo(policy.permissionAuditLogDays);
  const adminResolvedCutoff = daysAgo(policy.adminMessageResolvedDays);
  const adminAllCutoff = daysAgo(policy.adminMessageAllDays);
  const posWriteCommandCutoff = daysAgo(policy.posWriteCommandDays);
  const revokedRefreshCutoff = daysAgo(policy.revokedRefreshTokenDays);

  const summary = {};

  const execute = async (name, action) => {
    try {
      const result = await action();
      summary[name] = result?.count || 0;
    } catch (error) {
      summary[name] = `error: ${error.message}`;
      logger.warn('[DB RETENTION] step failed', { name, message: error.message });
    }
  };

  await execute('posSyncEvent', () => prisma.posSyncEvent.deleteMany({
    where: { createdAt: { lt: posSyncEventCutoff } },
  }));

  await execute('securityAuditLog', () => prisma.securityAuditLog.deleteMany({
    where: { createdAt: { lt: securityAuditCutoff } },
  }));

  await execute('permissionAuditLog', () => prisma.permissionAuditLog.deleteMany({
    where: { createdAt: { lt: permissionAuditCutoff } },
  }));

  await execute('adminMessage', () => prisma.adminMessage.deleteMany({
    where: {
      OR: [
        {
          lifecycleState: { in: ['resolved', 'archived'] },
          lastSeenAt: { lt: adminResolvedCutoff },
        },
        {
          createdAt: { lt: adminAllCutoff },
        },
      ],
    },
  }));

  await execute('refreshToken', () => prisma.refreshToken.deleteMany({
    where: {
      OR: [
        { expiresAt: { lt: now } },
        {
          revokedAt: { not: null, lt: revokedRefreshCutoff },
        },
      ],
    },
  }));

  await execute('pendingUser', () => prisma.pendingUser.deleteMany({
    where: { verificationCodeExpiry: { lt: now } },
  }));

  await execute('passwordReset', () => prisma.passwordReset.deleteMany({
    where: { expiresAt: { lt: now } },
  }));

  await execute('posWriteCommand', () => prisma.posWriteCommand.deleteMany({
    where: {
      status: { in: ['COMPLETED', 'FAILED'] },
      updatedAt: { lt: posWriteCommandCutoff },
    },
  }));

  logger.info('[DB RETENTION] completed', { summary, policy });
  return summary;
}

function startDataRetentionScheduler({ prisma, logger = console }) {
  const enabled = String(process.env.DB_RETENTION_ENABLED || 'true').toLowerCase() !== 'false';
  if (!enabled) {
    logger.info('[DB RETENTION] scheduler disabled via DB_RETENTION_ENABLED=false');
    return;
  }

  const intervalHours = toPositiveInt(process.env.DB_RETENTION_INTERVAL_HOURS, 6);
  const initialDelayMs = toPositiveInt(process.env.DB_RETENTION_INITIAL_DELAY_MS, 20000);
  const intervalMs = intervalHours * 60 * 60 * 1000;

  const run = () => runDataRetention(prisma, logger).catch((error) => {
    logger.warn('[DB RETENTION] run failed', { message: error.message });
  });

  const initialTimer = setTimeout(run, initialDelayMs);
  const recurringTimer = setInterval(run, intervalMs);

  if (typeof initialTimer.unref === 'function') {
    initialTimer.unref();
  }
  if (typeof recurringTimer.unref === 'function') {
    recurringTimer.unref();
  }

  logger.info('[DB RETENTION] scheduler started', {
    intervalHours,
    initialDelayMs,
  });
}

module.exports = {
  runDataRetention,
  startDataRetentionScheduler,
};
