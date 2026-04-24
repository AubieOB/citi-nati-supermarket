const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');

const prisma = new PrismaClient();

const POS_COMMAND_STATUS = {
  PENDING: 'PENDING',
  PROCESSING: 'PROCESSING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
};

const DEFAULT_RETRY_DELAY_MS = Number.parseInt(process.env.POS_COMMAND_RETRY_DELAY_MS || '30000', 10);

function getNextRetryAt(retryCount) {
  const baseDelay = Number.isFinite(DEFAULT_RETRY_DELAY_MS) && DEFAULT_RETRY_DELAY_MS > 0
    ? DEFAULT_RETRY_DELAY_MS
    : 30000;
  const backoffMultiplier = Math.min(8, Math.max(1, retryCount));
  const delayMs = baseDelay * backoffMultiplier;
  return new Date(Date.now() + delayMs);
}

async function recordMonitorEvent(payload) {
  try {
    const { recordPosSyncEvent } = require('./posSyncMonitor.service');
    await recordPosSyncEvent(payload);
  } catch (error) {
    console.error('[POS COMMAND QUEUE] Failed to record monitor event:', error.message);
  }
}

async function enqueueCommand(commandType, payload, meta = {}) {
  try {
    const payloadBranchCode = String(payload?.branchCode || '').trim().toUpperCase() || null;
    const payloadLocationCode = String(payload?.requestedLocationCode || payload?.locationCode || '').trim().toUpperCase() || null;
    const command = await prisma.posWriteCommand.create({
      data: {
        commandType,
        status: POS_COMMAND_STATUS.PENDING,
        payload,
        source: meta.source || 'backend',
        relatedEntityType: meta.relatedEntityType || null,
        relatedEntityId: meta.relatedEntityId ? String(meta.relatedEntityId) : null,
        createdBy: meta.createdBy || null,
        maxRetries: Number.isFinite(meta.maxRetries) ? meta.maxRetries : 5,
        nextRetryAt: null,
      },
    });

    console.log('[POS COMMAND QUEUE] enqueued command:', {
      id: command.id,
      commandType: command.commandType,
      source: command.source,
      relatedEntityId: command.relatedEntityId,
      payloadSummary: {
        productCode: payload?.productCode,
        oldName: payload?.oldName,
        newName: payload?.newName,
        locationCode: payload?.locationCode,
        priceTypeCode: payload?.priceTypeCode,
        promotionalPrice: payload?.promotionalPrice,
        restorePrice: payload?.restorePrice,
        orderId: payload?.orderId,
      },
    });

    await recordMonitorEvent({
      eventType: 'command-enqueued',
      source: 'pos-command-queue',
      status: 'success',
      level: 'info',
      title: `POS command queued: ${command.commandType}`,
      message: `A ${command.commandType} command was queued for the POS agent.`,
      suggestion: 'Monitor the queue feed to confirm the agent claims and processes this command.',
      entityType: 'PosWriteCommand',
      entityId: command.id,
      metadata: {
        commandType: command.commandType,
        source: command.source,
        relatedEntityId: command.relatedEntityId,
        branchCode: payloadBranchCode,
        locationCode: payloadLocationCode,
      },
    });

    return command;
  } catch (error) {
    console.error('[POS COMMAND QUEUE ERROR] failed to enqueue command:', error.message);
    throw error;
  }
}

async function claimPendingCommands(limit = 10, agentId = 'unknown-agent', targetLocationCodes = []) {
  const safeLimit = Math.max(1, Math.min(100, parseInt(limit, 10) || 10));
  const lockToken = crypto.randomUUID();
  
  // Normalize target location codes to uppercase array
  const normalizedLocations = (Array.isArray(targetLocationCodes) ? targetLocationCodes : [])
    .map(code => String(code || '').trim().toUpperCase())
    .filter(code => code.length > 0);

  try {
    return await prisma.$transaction(async (tx) => {
      // Build the WHERE clause - if specific locations provided, filter by them
      const whereClause = {
        status: POS_COMMAND_STATUS.PENDING,
        OR: [
          { nextRetryAt: null },
          { nextRetryAt: { lte: new Date() } },
        ],
      };
      
      const candidates = await tx.posWriteCommand.findMany({
        where: whereClause,
        orderBy: {
          createdAt: 'asc',
        },
        take: safeLimit * 2, // Fetch extra to account for filtering by location
      });

      // Filter candidates by target location if specified
      const filteredCandidates = normalizedLocations.length > 0
        ? candidates.filter(cmd => {
            const cmdLocationCode = String(cmd.payload?.locationCode || '').trim().toUpperCase();
            return normalizedLocations.includes(cmdLocationCode);
          })
        : candidates;
      
      const claimedIds = [];

      for (const candidate of filteredCandidates) {
        if (candidate.retryCount >= candidate.maxRetries) {
          continue;
        }

        const result = await tx.posWriteCommand.updateMany({
          where: {
            id: candidate.id,
            status: POS_COMMAND_STATUS.PENDING,
          },
          data: {
            status: POS_COMMAND_STATUS.PROCESSING,
            pickedAt: new Date(),
            agentId,
            lockToken,
            errorMessage: null,
            nextRetryAt: null,
          },
        });

        if (result.count === 1) {
          claimedIds.push(candidate.id);
        }
      }

      if (claimedIds.length === 0) {
        return [];
      }

      const claimed = await tx.posWriteCommand.findMany({
        where: {
          id: {
            in: claimedIds,
          },
        },
        orderBy: {
          createdAt: 'asc',
        },
      });

      console.log('[POS COMMAND QUEUE] claimed commands:', {
        agentId,
        count: claimed.length,
        ids: claimed.map((item) => item.id),
        locationFilter: normalizedLocations.length > 0 ? normalizedLocations.join(',') : 'none',
      });

      if (claimed.length > 0) {
        await recordMonitorEvent({
          eventType: 'commands-claimed',
          source: 'pos-command-queue',
          status: 'success',
          level: 'info',
          title: 'POS agent claimed queued commands',
          message: `The POS agent claimed ${claimed.length} queued command(s).`,
          suggestion: 'Watch for matching completion or retry events next.',
          agentId,
          metadata: {
            count: claimed.length,
            ids: claimed.map((item) => item.id),
          },
        });
      }

      return claimed;
    });
  } catch (error) {
    console.error('[POS COMMAND QUEUE ERROR] failed to claim commands:', error.message);
    throw error;
  }
}

async function markCommandCompleted(id, resultSummary = {}, agentId = null) {
  try {
    const updated = await prisma.posWriteCommand.updateMany({
      where: {
        id,
        status: POS_COMMAND_STATUS.PROCESSING,
      },
      data: {
        status: POS_COMMAND_STATUS.COMPLETED,
        processedAt: new Date(),
        resultSummary,
        errorMessage: null,
        lockToken: null,
        agentId: agentId || null,
        nextRetryAt: null,
      },
    });

    if (updated.count !== 1) {
      throw new Error(`Command ${id} is not in PROCESSING state`);
    }

    console.log('[POS COMMAND QUEUE] command completed:', { id, agentId });

    await recordMonitorEvent({
      eventType: 'command-completed',
      source: 'pos-command-queue',
      status: 'success',
      level: 'info',
      title: 'POS command completed',
      message: `Queued command ${id} completed successfully.`,
      suggestion: 'No action required unless the downstream POS state still looks stale.',
      entityType: 'PosWriteCommand',
      entityId: id,
      agentId,
      metadata: resultSummary,
    });
  } catch (error) {
    console.error('[POS COMMAND QUEUE ERROR] failed to complete command:', error.message);
    throw error;
  }
}

async function markCommandFailed(id, errorMessage, retryable = true, agentId = null) {
  try {
    const command = await prisma.posWriteCommand.findFirst({
      where: {
        id,
        status: POS_COMMAND_STATUS.PROCESSING,
      },
    });

    if (!command) {
      throw new Error(`Command ${id} not found`);
    }

    const nextRetryCount = command.retryCount + 1;
    const canRetry = retryable && nextRetryCount < command.maxRetries;
    const nextRetryAt = canRetry ? getNextRetryAt(nextRetryCount) : null;

    const payloadBranchCode = String(command.payload?.branchCode || '').trim().toUpperCase() || null;
    const payloadLocationCode = String(command.payload?.requestedLocationCode || command.payload?.locationCode || '').trim().toUpperCase() || null;

    const data = canRetry
      ? {
          status: POS_COMMAND_STATUS.PENDING,
          retryCount: nextRetryCount,
          errorMessage,
          pickedAt: null,
          lockToken: null,
          agentId: null,
          nextRetryAt,
        }
      : {
          status: POS_COMMAND_STATUS.FAILED,
          retryCount: nextRetryCount,
          processedAt: new Date(),
          errorMessage,
          lockToken: null,
          agentId: agentId || command.agentId,
          nextRetryAt: null,
        };

    await prisma.posWriteCommand.update({
      where: { id },
      data,
    });

    console.log('[POS COMMAND QUEUE] command failed:', {
      id,
      retryable,
      canRetry,
      retryCount: nextRetryCount,
      maxRetries: command.maxRetries,
      nextRetryAt,
    });

    await recordMonitorEvent({
      eventType: canRetry ? 'command-retry-scheduled' : 'command-failed',
      source: 'pos-command-queue',
      status: canRetry ? 'warning' : 'failed',
      level: canRetry ? 'warning' : 'error',
      title: canRetry ? 'POS command failed and will retry' : 'POS command failed permanently',
      message: canRetry
        ? `Queued command ${id} failed and was returned to the queue for retry ${nextRetryCount}/${command.maxRetries}.`
        : `Queued command ${id} failed permanently after ${nextRetryCount} attempt(s).`,
      reason: errorMessage,
      suggestion: canRetry
        ? 'If the same command keeps retrying, inspect the payload and the agent-side write endpoint.'
        : 'Review the command payload and the agent/server logs before reissuing the command.',
      entityType: 'PosWriteCommand',
      entityId: id,
      agentId: agentId || command.agentId,
      metadata: {
        retryable,
        canRetry,
        retryCount: nextRetryCount,
        maxRetries: command.maxRetries,
        nextRetryAt,
        productCode: command.payload?.productCode || null,
        oldName: command.payload?.oldName || null,
        newName: command.payload?.newName || null,
        branchCode: payloadBranchCode,
        locationCode: payloadLocationCode,
      },
    });
  } catch (error) {
    console.error('[POS COMMAND QUEUE ERROR] failed to mark command failed:', error.message);
    throw error;
  }
}

async function getCommandById(id) {
  return prisma.posWriteCommand.findUnique({ where: { id } });
}

async function listCommands({ status, take = 50, skip = 0 } = {}) {
  return prisma.posWriteCommand.findMany({
    where: status ? { status } : undefined,
    orderBy: { createdAt: 'desc' },
    take: Math.min(200, Math.max(1, parseInt(take, 10) || 50)),
    skip: Math.max(0, parseInt(skip, 10) || 0),
  });
}

async function getStats() {
  const grouped = await prisma.posWriteCommand.groupBy({
    by: ['status'],
    _count: {
      _all: true,
    },
  });

  const stats = {
    PENDING: 0,
    PROCESSING: 0,
    COMPLETED: 0,
    FAILED: 0,
  };

  for (const row of grouped) {
    stats[row.status] = row._count._all;
  }

  return stats;
}

async function clearFailedCommands() {
  const result = await prisma.posWriteCommand.deleteMany({
    where: { status: POS_COMMAND_STATUS.FAILED },
  });
  return result.count;
}

module.exports = {
  enqueueCommand,
  claimPendingCommands,
  markCommandCompleted,
  markCommandFailed,
  getCommandById,
  listCommands,
  clearFailedCommands,
  getStats,
};
