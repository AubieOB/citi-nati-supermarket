const { PrismaClient } = require('@prisma/client');
const logger = require('../utils/logger');
const prisma = new PrismaClient();

const MESSAGE_STATES = {
  ACTIVE: 'active',
  ACKNOWLEDGED: 'acknowledged',
  RESOLVED: 'resolved',
  RECURRING: 'recurring',
};

const DEFAULT_REOPEN_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_EMIT_COOLDOWN_MS = 5 * 60 * 1000;

const parsedReopenWindowMs = Number(process.env.ADMIN_MESSAGE_REOPEN_WINDOW_MS || DEFAULT_REOPEN_WINDOW_MS);
const ADMIN_MESSAGE_REOPEN_WINDOW_MS = Number.isFinite(parsedReopenWindowMs) && parsedReopenWindowMs >= 0
  ? parsedReopenWindowMs
  : DEFAULT_REOPEN_WINDOW_MS;

const parsedEmitCooldownMs = Number(process.env.ADMIN_MESSAGE_EMIT_COOLDOWN_MS || DEFAULT_EMIT_COOLDOWN_MS);
const ADMIN_MESSAGE_EMIT_COOLDOWN_MS = Number.isFinite(parsedEmitCooldownMs) && parsedEmitCooldownMs >= 0
  ? parsedEmitCooldownMs
  : DEFAULT_EMIT_COOLDOWN_MS;

const emitCooldownCache = new Map();

function normalizeBranchCode(value) {
  const normalized = String(value || '').trim().toUpperCase();
  return normalized || null;
}

function expandBranchScopeCodes(value) {
  const normalized = normalizeBranchCode(value);
  if (!normalized) return [];

  if (normalized === 'BT' || normalized === 'BLANTYRE') {
    return ['BLANTYRE', 'BT'];
  }

  if (['ZA', 'SH', 'BAR', 'WH', 'ZOMBA'].includes(normalized)) {
    return ['ZOMBA', 'ZA', 'SH', 'BAR', 'WH'];
  }

  return [normalized];
}

function buildBranchScopeWhere(value) {
  const scopedCodes = expandBranchScopeCodes(value);
  if (!scopedCodes.length) {
    return null;
  }

  return {
    in: scopedCodes,
  };
}

function shouldEmitUpdate(eventKey) {
  const now = Date.now();
  const lastEmittedAt = emitCooldownCache.get(eventKey);

  if (lastEmittedAt && (now - lastEmittedAt) < ADMIN_MESSAGE_EMIT_COOLDOWN_MS) {
    return false;
  }

  emitCooldownCache.set(eventKey, now);

  // Keep cache bounded in long-running processes.
  if (emitCooldownCache.size > 5000) {
    for (const [key, timestamp] of emitCooldownCache.entries()) {
      if ((now - timestamp) >= ADMIN_MESSAGE_EMIT_COOLDOWN_MS) {
        emitCooldownCache.delete(key);
      }
    }
  }

  return true;
}

function sanitizeKeyPart(value) {
  if (value == null) return '';
  return String(value).trim().toLowerCase();
}

function buildDedupeKey(type, options = {}) {
  const explicitKey = sanitizeKeyPart(options.dedupeKey);
  if (explicitKey) return explicitKey;

  return null;
}

function normalizeMessageOptions(referenceOrOptions, maybeOptions) {
  let options = {};

  if (referenceOrOptions && typeof referenceOrOptions === 'object' && !Array.isArray(referenceOrOptions)) {
    options = { ...referenceOrOptions };
  } else if (referenceOrOptions != null) {
    options = { referenceId: String(referenceOrOptions), entityId: String(referenceOrOptions) };
  }

  if (maybeOptions && typeof maybeOptions === 'object' && !Array.isArray(maybeOptions)) {
    options = { ...options, ...maybeOptions };
  }

  return options;
}

function toSocketPayload(message) {
  return {
    id: message.id,
    type: message.type,
    title: message.title,
    message: message.message,
    read: message.read,
    branchCode: message.branchCode,
    sourceModule: message.sourceModule,
    entityType: message.entityType,
    errorCode: message.errorCode,
    dedupeKey: message.dedupeKey,
    lifecycleState: message.lifecycleState,
    occurrenceCount: message.occurrenceCount,
    firstSeenAt: message.firstSeenAt,
    lastSeenAt: message.lastSeenAt,
    createdAt: message.createdAt,
    updatedAt: message.updatedAt,
  };
}

function emitAdminMessage(event, payload) {
  if (!global.io) return;
  global.io.to('admin_room').emit(event, payload);
}

/**
 * Get all admin messages with optional filtering
 */
const getMessages = async (req, res) => {
  try {
    const { type, limit, offset = 0, branchCode, locationCode, includeStockAlerts } = req.query;

    let where = {};
    if (type) {
      where.type = type;
    }

    if (String(includeStockAlerts || '').toLowerCase() !== 'true') {
      where.AND = [
        {
          OR: [
            { entityType: null },
            { entityType: { not: 'product' } },
            { errorCode: null },
            { errorCode: { notIn: ['low_stock', 'out_of_stock'] } },
          ],
        },
      ];
    }

    const scopedBranchWhere = buildBranchScopeWhere(branchCode || locationCode);
    if (scopedBranchWhere) {
      where.branchCode = scopedBranchWhere;
    }

    const parsedLimit = limit != null && String(limit).trim() !== ''
      ? parseInt(limit, 10)
      : null;
    const parsedOffset = parseInt(offset, 10);

    const queryOptions = {
      where,
      orderBy: [
        { lastSeenAt: 'desc' },
        { createdAt: 'desc' },
      ],
      skip: Number.isInteger(parsedOffset) && parsedOffset > 0 ? parsedOffset : 0,
    };

    if (Number.isInteger(parsedLimit) && parsedLimit > 0) {
      queryOptions.take = parsedLimit;
    }

    const messages = await prisma.adminMessage.findMany({
      ...queryOptions,
    });

    const total = await prisma.adminMessage.count({ where });

    return res.json({
      messages,
      total,
      limit: Number.isInteger(parsedLimit) && parsedLimit > 0 ? parsedLimit : null,
      offset: Number.isInteger(parsedOffset) && parsedOffset > 0 ? parsedOffset : 0,
    });
  } catch (error) {
    logger.errorLog('[ERROR] Get admin messages:', error);
  }
};

/**
 * Mark a message as read
 */
const markAsRead = async (req, res) => {
  try {
    const { id } = req.params;

    const message = await prisma.adminMessage.update({
      where: { id: parseInt(id) },
      data: {
        read: true,
        acknowledgedAt: new Date(),
        lifecycleState: MESSAGE_STATES.ACKNOWLEDGED,
      },
    });

    emitAdminMessage('adminMessageUpdated', toSocketPayload(message));

    return res.json(message);
  } catch (error) {
    logger.errorLog('[ERROR] Mark message as read:', error);
    return res.status(500).json({ error: 'Failed to update message' });
  }
};

/**
 * Mark a message as unread
 */
const markAsUnread = async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await prisma.adminMessage.findUnique({
      where: { id: parseInt(id) },
      select: { lifecycleState: true },
    });

    const nextState = existing?.lifecycleState === MESSAGE_STATES.ACKNOWLEDGED
      ? MESSAGE_STATES.ACTIVE
      : existing?.lifecycleState;

    const message = await prisma.adminMessage.update({
      where: { id: parseInt(id) },
      data: {
        read: false,
        lifecycleState: nextState || MESSAGE_STATES.ACTIVE,
      },
    });

    emitAdminMessage('adminMessageUpdated', toSocketPayload(message));

    return res.json(message);
  } catch (error) {
    logger.errorLog('[ERROR] Mark message as unread:', error);
    return res.status(500).json({ error: 'Failed to update message' });
  }
};

/**
 * Delete a single message
 */
const deleteMessage = async (req, res) => {
  try {
    const { id } = req.params;

    await prisma.adminMessage.delete({
      where: { id: parseInt(id) },
    });

    return res.json({ success: true });
  } catch (error) {
    logger.errorLog('[ERROR] Delete message:', error);
    return res.status(500).json({ error: 'Failed to delete message' });
  }
};

/**
 * Delete all messages
 */
const deleteAllMessages = async (req, res) => {
  try {
    const scopedBranchWhere = buildBranchScopeWhere(req.query.branchCode || req.query.locationCode || req.body?.branchCode || req.body?.locationCode);
    const where = scopedBranchWhere ? { branchCode: scopedBranchWhere } : undefined;
    const result = await prisma.adminMessage.deleteMany({ where });

    return res.json({ success: true, deleted: result.count });
  } catch (error) {
    logger.errorLog('[ERROR] Delete all messages:', error);
    return res.status(500).json({ error: 'Failed to delete messages' });
  }
};

/**
 * Mark all messages as read
 */
const markAllAsRead = async (req, res) => {
  try {
    const scopedBranchWhere = buildBranchScopeWhere(req.query.branchCode || req.query.locationCode || req.body?.branchCode || req.body?.locationCode);
    const whereUnread = {
      read: false,
      ...(scopedBranchWhere ? { branchCode: scopedBranchWhere } : {}),
    };
    const whereLifecycle = {
      read: true,
      lifecycleState: {
        in: [MESSAGE_STATES.ACTIVE, MESSAGE_STATES.RECURRING],
      },
      ...(scopedBranchWhere ? { branchCode: scopedBranchWhere } : {}),
    };

    const result = await prisma.adminMessage.updateMany({
      where: whereUnread,
      data: {
        read: true,
        acknowledgedAt: new Date(),
      },
    });

    await prisma.adminMessage.updateMany({
      where: whereLifecycle,
      data: {
        lifecycleState: MESSAGE_STATES.ACKNOWLEDGED,
      },
    });

    logger.infoLog(`[ADMIN_MSG] Marked ${result.count} messages as read`);
    return res.json({ success: true, updated: result.count });
  } catch (error) {
    logger.errorLog('[ERROR] Mark all messages as read:', error);
    return res.status(500).json({ error: 'Failed to mark all messages as read' });
  }
};

/**
 * Resolve a message lifecycle (without deleting history)
 */
const resolveMessage = async (req, res) => {
  try {
    const { id } = req.params;

    const message = await prisma.adminMessage.update({
      where: { id: parseInt(id) },
      data: {
        read: true,
        lifecycleState: MESSAGE_STATES.RESOLVED,
        resolvedAt: new Date(),
      },
    });

    emitAdminMessage('adminMessageUpdated', toSocketPayload(message));
    return res.json(message);
  } catch (error) {
    logger.errorLog('[ERROR] Resolve message:', error);
  }
};

/**
 * Create a new admin message (used internally)
 */
const createMessage = async (type, title, message, referenceOrOptions = null, maybeOptions = null) => {
  try {
    const options = normalizeMessageOptions(referenceOrOptions, maybeOptions);
    const now = new Date();
    const dedupeKey = buildDedupeKey(type, options);
    const lifecycleState = options.lifecycleState || MESSAGE_STATES.ACTIVE;
    const parsedRecurrenceWindowMs = Number(options.recurrenceWindowMs);
    const recurrenceWindowMs = Number.isFinite(parsedRecurrenceWindowMs) && parsedRecurrenceWindowMs > 0
      ? parsedRecurrenceWindowMs
      : 0;

    const baseData = {
      type,
      title,
      message,
      read: false,
      dedupeKey,
      sourceModule: options.sourceModule || options.source || null,
      branchCode: options.branchCode || options.locationCode || null,
      entityType: options.entityType || null,
      entityId: options.entityId || options.relatedEntityId || options.referenceId || null,
      errorCode: options.errorCode || options.stateCode || null,
      statusMetadata: options.statusMetadata || null,
    };

    if (!dedupeKey) {
      const newMessage = await prisma.adminMessage.create({
        data: {
          ...baseData,
          lifecycleState,
          firstSeenAt: now,
          lastSeenAt: now,
          occurrenceCount: 1,
          acknowledgedAt: null,
          resolvedAt: lifecycleState === MESSAGE_STATES.RESOLVED ? now : null,
        },
      });

      emitAdminMessage('newAdminMessage', toSocketPayload(newMessage));
      return newMessage;
    }

    const existing = await prisma.adminMessage.findFirst({
      where: { dedupeKey },
      orderBy: { lastSeenAt: 'desc' },
    });

    if (!existing) {
      const created = await prisma.adminMessage.create({
        data: {
          ...baseData,
          lifecycleState,
          firstSeenAt: now,
          lastSeenAt: now,
          occurrenceCount: 1,
          acknowledgedAt: null,
          resolvedAt: lifecycleState === MESSAGE_STATES.RESOLVED ? now : null,
        },
      });

      emitAdminMessage('newAdminMessage', toSocketPayload(created));
      logger.infoLog('[ADMIN_MSG] Created new deduped message:', created.id, dedupeKey);
      return created;
    }

    const unresolvedStates = [MESSAGE_STATES.ACTIVE, MESSAGE_STATES.ACKNOWLEDGED, MESSAGE_STATES.RECURRING];
    const isUnresolved = unresolvedStates.includes(existing.lifecycleState);

    if (isUnresolved) {
      if (recurrenceWindowMs > 0) {
        const lastSeenBase = existing.lastSeenAt || existing.updatedAt || existing.createdAt;
        const msSinceLastSeen = now.getTime() - new Date(lastSeenBase).getTime();

        if (msSinceLastSeen < recurrenceWindowMs) {
          return existing;
        }
      }

      const nextState = existing.lifecycleState === MESSAGE_STATES.ACKNOWLEDGED
        ? MESSAGE_STATES.ACKNOWLEDGED
        : MESSAGE_STATES.RECURRING;

      const updated = await prisma.adminMessage.update({
        where: { id: existing.id },
        data: {
          ...baseData,
          lifecycleState: nextState,
          lastSeenAt: now,
          occurrenceCount: { increment: 1 },
          resolvedAt: null,
          ...(nextState !== MESSAGE_STATES.ACKNOWLEDGED ? { read: false } : {}),
        },
      });

      const emitKey = `${dedupeKey}:update`;
      if (shouldEmitUpdate(emitKey)) {
        emitAdminMessage('adminMessageUpdated', toSocketPayload(updated));
      }

      logger.infoLog('[ADMIN_MSG] Updated recurring message:', updated.id, dedupeKey, 'occurrence', updated.occurrenceCount);
      return updated;
    }

    const resolvedAt = existing.resolvedAt || existing.updatedAt || existing.lastSeenAt || existing.createdAt;
    const msSinceResolved = now.getTime() - new Date(resolvedAt).getTime();

    if (msSinceResolved <= ADMIN_MESSAGE_REOPEN_WINDOW_MS) {
      const reopened = await prisma.adminMessage.update({
        where: { id: existing.id },
        data: {
          ...baseData,
          lifecycleState: MESSAGE_STATES.RECURRING,
          read: false,
          acknowledgedAt: null,
          resolvedAt: null,
          lastSeenAt: now,
          occurrenceCount: { increment: 1 },
        },
      });

      emitAdminMessage('adminMessageUpdated', toSocketPayload(reopened));
      logger.infoLog('[ADMIN_MSG] Reopened resolved message:', reopened.id, dedupeKey);
      return reopened;
    }

    const created = await prisma.adminMessage.create({
      data: {
        ...baseData,
        lifecycleState: MESSAGE_STATES.ACTIVE,
        firstSeenAt: now,
        lastSeenAt: now,
        occurrenceCount: 1,
        acknowledgedAt: null,
        resolvedAt: null,
      },
    });

    emitAdminMessage('newAdminMessage', toSocketPayload(created));
    logger.infoLog('[ADMIN_MSG] Created new message after resolved cooldown:', created.id, dedupeKey);
    return created;
  } catch (error) {
    logger.errorLog('[ERROR] Create admin message:', error);
    return null;
  }
};

module.exports = {
  getMessages,
  markAsRead,
  markAsUnread,
  markAllAsRead,
  resolveMessage,
  deleteMessage,
  deleteAllMessages,
  createMessage,
};
