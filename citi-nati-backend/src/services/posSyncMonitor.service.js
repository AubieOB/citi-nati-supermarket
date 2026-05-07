const { PrismaClient } = require('@prisma/client');
const { emitPosSyncEvent } = require('../utils/socket');
const posCommandQueueService = require('./posCommandQueue.service');

const prisma = new PrismaClient();
// Agent reachability is intentionally strict: only a successful scoped agent event within 1 minute
// keeps the monitor status as reachable.
const AGENT_SUCCESS_LIVENESS_WINDOW_MS = Number.parseInt(process.env.POS_SYNC_AGENT_LIVENESS_WINDOW_MS || '60000', 10);

function clampScore(value) {
  return Math.max(0, Math.min(100, value));
}

function normalizeText(value, maxLength = 1000) {
  if (value == null) return null;
  return String(value).trim().slice(0, maxLength) || null;
}

function toClientEvent(event) {
  return {
    id: event.id,
    eventType: event.eventType,
    source: event.source,
    status: event.status,
    level: event.level,
    title: event.title,
    message: event.message,
    reason: event.reason,
    suggestion: event.suggestion,
    entityType: event.entityType,
    entityId: event.entityId,
    agentId: event.agentId,
    durationMs: event.durationMs,
    metadata: event.metadata || null,
    createdAt: event.createdAt,
  };
}

function normalizeScopeCode(value) {
  const normalized = String(value || '').trim().toUpperCase();
  return normalized || null;
}

const ZOMBA_LOCATION_CODES = ['ZA', 'BAR', 'WH', 'ST999'];

function expandLocationScopeCodes(locationCode) {
  const normalized = normalizeScopeCode(locationCode);
  if (!normalized) return [];

  if (normalized === 'BT') return ['BT'];
  if (ZOMBA_LOCATION_CODES.includes(normalized)) return [...ZOMBA_LOCATION_CODES];
  return [normalized];
}

function toScopeFromLocationCode(locationCode) {
  const normalized = normalizeScopeCode(locationCode);
  if (normalized === 'BT') return 'BLANTYRE';
  if (normalized && ZOMBA_LOCATION_CODES.includes(normalized)) return 'ZOMBA';
  return null;
}

function normalizeBranchCode(value) {
  const normalized = normalizeScopeCode(value);
  if (normalized === 'BT') return 'BLANTYRE';
  if (normalized && ZOMBA_LOCATION_CODES.includes(normalized)) return 'ZOMBA';
  return normalized;
}

function inferBranchCodeFromAgentId(agentId) {
  const normalized = String(agentId || '').trim().toUpperCase();
  if (!normalized) return null;
  if (normalized.includes('BLANTYRE') || normalized.includes('BT')) return 'BLANTYRE';
  if (normalized.includes('ZOMBA') || normalized.includes('ZA') || normalized.includes('SH')) return 'ZOMBA';
  return null;
}

function getEventBranchCode(event) {
  const metadata = event?.metadata && typeof event.metadata === 'object' ? event.metadata : {};
  return normalizeBranchCode(
    metadata.branchCode
    || event?.branchCode
    || metadata.locationCode
    || event?.locationCode
    || inferBranchCodeFromAgentId(event?.agentId)
    || null
  );
}

function getEventLocationCode(event) {
  const metadata = event?.metadata && typeof event.metadata === 'object' ? event.metadata : {};
  return normalizeScopeCode(metadata.locationCode || event?.locationCode || null);
}

function commandMatchesScope(command, scopedBranchCode, scopedLocationCode) {
  if (!scopedBranchCode && !scopedLocationCode) return true;

  const payload = command?.payload && typeof command.payload === 'object' ? command.payload : {};
  const scopedLocationCodes = expandLocationScopeCodes(scopedLocationCode);

  const payloadBranchCode = normalizeBranchCode(payload.branchCode);
  const payloadLocationCode = normalizeScopeCode(payload.locationCode);
  const payloadRequestedLocationCode = normalizeScopeCode(payload.requestedLocationCode);
  const commandAgentBranchCode = normalizeBranchCode(inferBranchCodeFromAgentId(command?.agentId));

  const effectiveBranchCode = payloadBranchCode || commandAgentBranchCode;
  const effectiveLocationCode = payloadRequestedLocationCode || payloadLocationCode;

  if (scopedBranchCode && effectiveBranchCode !== scopedBranchCode) {
    return false;
  }

  if (
    scopedLocationCodes.length > 0 &&
    effectiveLocationCode &&
    !scopedLocationCodes.includes(effectiveLocationCode)
  ) {
    return false;
  }

  return true;
}

function emergencySaleMatchesScope(sale, scopedBranchCode, scopedLocationCode) {
  if (!scopedBranchCode && !scopedLocationCode) return true;

  const snapshot = sale?.cartSnapshot && typeof sale.cartSnapshot === 'object' ? sale.cartSnapshot : {};
  const scopedLocationCodes = expandLocationScopeCodes(scopedLocationCode);

  const saleBranchCode = normalizeBranchCode(snapshot.branchCode || snapshot.locationCode || snapshot.posLocationCode || null);
  const saleLocationCode = normalizeScopeCode(snapshot.posLocationCode || snapshot.locationCode || null);

  if (scopedBranchCode && saleBranchCode === scopedBranchCode) return true;
  if (scopedLocationCodes.length > 0 && saleLocationCode && scopedLocationCodes.includes(saleLocationCode)) return true;
  return false;
}

function summarizeQueueStatsFromCommands(commands = []) {
  const stats = {
    PENDING: 0,
    PROCESSING: 0,
    COMPLETED: 0,
    FAILED: 0,
  };

  for (const command of commands) {
    const key = String(command.status || '').toUpperCase();
    if (Object.prototype.hasOwnProperty.call(stats, key)) {
      stats[key] += 1;
    }
  }

  return stats;
}

function summarizeEmergencySales(sales = []) {
  const summary = {
    pending: 0,
    synced: 0,
    failed: 0,
  };

  for (const sale of sales) {
    if (sale.syncStatus === 'pending_pos_sync') summary.pending += 1;
    if (sale.syncStatus === 'synced_to_pos') summary.synced += 1;
    if (sale.syncStatus === 'sync_failed') summary.failed += 1;
  }

  return summary;
}

function eventMatchesScope(event, scopedBranchCode, scopedLocationCode) {
  if (!scopedBranchCode && !scopedLocationCode) return true;

  const eventBranchCode = getEventBranchCode(event);
  const eventLocationCode = getEventLocationCode(event);
  const scopedLocationCodes = expandLocationScopeCodes(scopedLocationCode);

  if (scopedBranchCode && eventBranchCode !== scopedBranchCode) {
    return false;
  }

  if (
    scopedLocationCodes.length > 0 &&
    eventLocationCode &&
    !scopedLocationCodes.includes(eventLocationCode)
  ) {
    return false;
  }

  return true;
}

function isAgentContactEvent(event) {
  if (!event || typeof event !== 'object') return false;

  const source = String(event.source || '').trim().toLowerCase();
  const eventType = String(event.eventType || '').trim().toLowerCase();
  const hasAgentId = Boolean(String(event.agentId || '').trim());

  if (source === 'pos-sync-agent') return true;

  if ((eventType === 'commands-claimed' || eventType === 'command-completed') && hasAgentId) {
    return true;
  }

  return false;
}

async function recordPosSyncEvent(payload = {}) {
  try {
    const event = await prisma.posSyncEvent.create({
      data: {
        eventType: normalizeText(payload.eventType, 100) || 'unknown',
        source: normalizeText(payload.source, 100) || 'backend',
        status: normalizeText(payload.status, 40) || 'info',
        level: normalizeText(payload.level, 40) || 'info',
        title: normalizeText(payload.title, 160) || 'POS sync event',
        message: normalizeText(payload.message, 1000) || 'POS sync activity recorded',
        reason: normalizeText(payload.reason, 1000),
        suggestion: normalizeText(payload.suggestion, 1000),
        entityType: normalizeText(payload.entityType, 100),
        entityId: normalizeText(payload.entityId, 100),
        agentId: normalizeText(payload.agentId, 100),
        durationMs: Number.isFinite(Number(payload.durationMs)) ? Number(payload.durationMs) : null,
        metadata: payload.metadata ?? null,
      },
    });

    emitPosSyncEvent(toClientEvent(event));
    return event;
  } catch (error) {
    console.error('[POS SYNC MONITOR] Failed to record event:', error.message);
    return null;
  }
}

function buildBuckets(hours) {
  const buckets = [];
  const now = new Date();

  for (let offset = hours - 1; offset >= 0; offset -= 1) {
    const bucket = new Date(now);
    bucket.setMinutes(0, 0, 0);
    bucket.setHours(bucket.getHours() - offset);
    buckets.push({
      key: bucket.toISOString(),
      label: `${String(bucket.getHours()).padStart(2, '0')}:00`,
      success: 0,
      failed: 0,
      warning: 0,
      info: 0,
      total: 0,
    });
  }

  return buckets;
}

function analyzeHealth({ enabled, agentHealthy, queueStats, emergencySummary, recentEvents }) {
  let score = 100;
  const issues = [];
  const recommendations = [];

  if (!enabled) {
    score -= 55;
    issues.push({
      severity: 'warning',
      title: 'POS sync is disabled',
      detail: 'The backend will reject POS sync operations until the toggle is re-enabled.',
    });
    recommendations.push('Enable POS sync again only after the agent and SQL connectivity are ready.');
  }

  if (enabled && !agentHealthy) {
    score -= 30;
    issues.push({
      severity: 'critical',
      title: 'POS agent health check failed',
      detail: 'The backend could not confirm the POS Sync Agent is reachable.',
    });
    recommendations.push('Verify the Windows POS Sync Agent process is running and the configured agent URL is correct.');
  }

  if ((queueStats?.FAILED || 0) > 0) {
    score -= Math.min(20, queueStats.FAILED * 3);
    issues.push({
      severity: 'critical',
      title: 'Queued POS commands are failing',
      detail: `${queueStats.FAILED} write-back command(s) are marked failed.`,
    });
    recommendations.push('Inspect the failed queue items first; repeated failures usually indicate a payload or agent-side write mismatch.');
  }

  if ((queueStats?.PENDING || 0) > 20) {
    score -= 15;
    issues.push({
      severity: 'warning',
      title: 'POS command backlog is growing',
      detail: `${queueStats.PENDING} command(s) are waiting for the agent.`,
    });
    recommendations.push('Check whether the agent is claiming queued commands at the expected polling interval.');
  }

  if ((emergencySummary?.failed || 0) > 0) {
    score -= 15;
    issues.push({
      severity: 'critical',
      title: 'Emergency sale sync failures detected',
      detail: `${emergencySummary.failed} emergency sale(s) failed to sync to POS.`,
    });
    recommendations.push('Review emergency sale failures and confirm invoice write-back succeeds for offline sales.');
  }

  const failureEvents = recentEvents.filter((event) => event.status === 'failed').length;
  const successEvents = recentEvents.filter((event) => event.status === 'success').length;
  const failureRate = failureEvents + successEvents > 0
    ? Math.round((failureEvents / (failureEvents + successEvents)) * 100)
    : 0;

  if (failureRate >= 30) {
    score -= 15;
    issues.push({
      severity: 'warning',
      title: 'Recent POS sync failure rate is elevated',
      detail: `${failureRate}% of recent tracked POS sync events ended in failure.`,
    });
    recommendations.push('Fix the top repeated failure reasons first to reduce the overall error rate quickly.');
  }

  const latestSuccess = recentEvents.find((event) => event.status === 'success');
  if (enabled && !latestSuccess) {
    score -= 10;
    issues.push({
      severity: 'warning',
      title: 'No recent successful POS sync activity',
      detail: 'The monitor has not observed a recent successful operation.',
    });
  }

  const healthScore = clampScore(score);
  let label = 'healthy';

  if (healthScore < 50) label = 'critical';
  else if (healthScore < 80) label = 'degraded';

  return {
    healthScore,
    label,
    issues,
    recommendations: [...new Set(recommendations)],
    failureRate,
  };
}

async function getPosSyncMonitorSnapshot({ hours = 24, limit = 40, locationCode, branchCode } = {}) {
  const { getRuntimeConfig } = require('./posSync.service');
  const safeHours = Math.max(1, Math.min(168, Number.parseInt(hours, 10) || 24));
  const safeLimit = Math.max(10, Math.min(100, Number.parseInt(limit, 10) || 40));
  const scopedLocationCode = normalizeScopeCode(locationCode);
  const scopedBranchCode = normalizeBranchCode(branchCode);
  const backendConfiguredBranchCode = normalizeBranchCode(process.env.POS_BRANCH_CODE || process.env.BRANCH_CODE || null);
  const since = new Date(Date.now() - safeHours * 60 * 60 * 1000);

  const [config, recentEvents, recentCommandsRaw, emergencySalesRaw, recentWindowEvents] = await Promise.all([
    getRuntimeConfig(),
    prisma.posSyncEvent.findMany({ orderBy: { createdAt: 'desc' }, take: safeLimit * 10 }),
    posCommandQueueService.listCommands({ take: safeLimit * 10 }),
    prisma.emergencySale.findMany({
      select: {
        id: true,
        saleRef: true,
        retryCount: true,
        syncError: true,
        updatedAt: true,
        syncStatus: true,
        cartSnapshot: true,
      },
    }),
    prisma.posSyncEvent.findMany({ where: { createdAt: { gte: since } }, orderBy: { createdAt: 'asc' } }),
  ]);

  const scopedRecentEvents = recentEvents
    .filter((event) => eventMatchesScope(event, scopedBranchCode, scopedLocationCode))
    .slice(0, safeLimit);

  const scopedRecentWindowEvents = recentWindowEvents.filter((event) => eventMatchesScope(event, scopedBranchCode, scopedLocationCode));

  const scopedCommands = recentCommandsRaw
    .filter((command) => commandMatchesScope(command, scopedBranchCode, scopedLocationCode));
  const queueStats = summarizeQueueStatsFromCommands(scopedCommands);
  const recentCommands = scopedCommands.slice(0, 20);

  const scopedEmergencySales = emergencySalesRaw
    .filter((sale) => emergencySaleMatchesScope(sale, scopedBranchCode, scopedLocationCode));
  const emergencySummary = summarizeEmergencySales(scopedEmergencySales);
  const recentEmergencyFailures = scopedEmergencySales
    .filter((sale) => sale.syncStatus === 'sync_failed')
    .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime())
    .slice(0, 10)
    .map((sale) => ({
      id: sale.id,
      saleRef: sale.saleRef,
      retryCount: sale.retryCount,
      syncError: sale.syncError,
      updatedAt: sale.updatedAt,
    }));

  // Only expose config directly when backend branch identity is explicit and scope-matched.
  // If backend branch identity is unknown, hide agentUrl unless scoped events prove active reachability.
  const hasExplicitBackendBranchScope = Boolean(backendConfiguredBranchCode);
  const shouldExposeConfigDirectly = !scopedBranchCode
    ? hasExplicitBackendBranchScope
    : (hasExplicitBackendBranchScope && scopedBranchCode === backendConfiguredBranchCode);

  // Reachability is based on fresh, scope-correct successful events only.
  const nowTs = Date.now();
  const livenessWindowMs = Number.isFinite(AGENT_SUCCESS_LIVENESS_WINDOW_MS) && AGENT_SUCCESS_LIVENESS_WINDOW_MS > 0
    ? AGENT_SUCCESS_LIVENESS_WINDOW_MS
    : 60000;

  // Use scopedRecentWindowEvents (full 24h scoped query, not limited by total-event cap) for liveness.
  // scopedRecentEvents is capped at the 400 most recent total events, which may exclude older Zomba
  // events when high-frequency branches push many events ahead of them in the sorted results.
  const allScopedForLiveness = scopedRecentWindowEvents.length > 0 ? scopedRecentWindowEvents : scopedRecentEvents;
  const recentSuccessfulAgentContactViaEvents = allScopedForLiveness.find(
    (event) => event.status === 'success'
      && isAgentContactEvent(event)
      && (nowTs - new Date(event.createdAt).getTime()) <= livenessWindowMs,
  ) || null;

  const agentHealthy = Boolean(recentSuccessfulAgentContactViaEvents);

  // When the agent is confirmed healthy via recent events (it IS pushing to this backend),
  // show the configured agent URL. Hiding it as null only makes sense when we genuinely
  // don't know which branch the backend URL belongs to — but if recent events prove the
  // scoped agent is active, the configured URL is the correct one to display.
  const scopedConfig = (shouldExposeConfigDirectly || agentHealthy)
    ? config
    : {
        ...config,
        agentUrl: null,
      };

  const buckets = buildBuckets(safeHours);
  const bucketMap = new Map(buckets.map((bucket) => [bucket.key, bucket]));
  const sourceBreakdown = {};
  const failureReasons = {};

  for (const event of scopedRecentWindowEvents) {
    const createdAt = new Date(event.createdAt);
    createdAt.setMinutes(0, 0, 0);

    const bucket = bucketMap.get(createdAt.toISOString());
    if (bucket) {
      bucket.total += 1;
      if (event.status === 'success') bucket.success += 1;
      else if (event.status === 'failed') bucket.failed += 1;
      else if (event.status === 'warning') bucket.warning += 1;
      else bucket.info += 1;
    }

    sourceBreakdown[event.source] = (sourceBreakdown[event.source] || 0) + 1;

    if (event.status === 'failed') {
      const reason = event.reason || event.title || 'Unknown failure';
      failureReasons[reason] = (failureReasons[reason] || 0) + 1;
    }
  }

  const health = analyzeHealth({
    enabled: config.enabled,
    agentHealthy,
    queueStats,
    emergencySummary,
    recentEvents: scopedRecentWindowEvents.slice().reverse(),
  });

  const recentFailure = scopedRecentEvents.find((event) => event.status === 'failed') || null;
  const recentSuccess = scopedRecentEvents.find((event) => event.status === 'success') || null;
  const lastSuccessfulSyncEvent = scopedRecentEvents.find(
    (event) => event.status === 'success' && String(event.eventType || '').trim().toLowerCase() === 'agent-push-products'
  ) || null;
  const lastSuccessfulSyncAt = lastSuccessfulSyncEvent?.createdAt || recentSuccess?.createdAt || null;

  return {
    config: scopedConfig,
    summary: {
      enabled: config.enabled,
      agentHealthy,
      healthScore: health.healthScore,
      healthLabel: health.label,
      failureRate: health.failureRate,
      lastEventAt: scopedRecentEvents[0]?.createdAt || null,
      lastSuccessfulSyncAt,
      lastSuccessfulEventAt: recentSuccess?.createdAt || null,
      lastFailedEventAt: recentFailure?.createdAt || null,
      issues: health.issues,
      recommendations: health.recommendations,
    },
    stats: {
      eventsInWindow: scopedRecentWindowEvents.length,
      successCount: scopedRecentWindowEvents.filter((event) => event.status === 'success').length,
      failedCount: scopedRecentWindowEvents.filter((event) => event.status === 'failed').length,
      queue: queueStats,
      emergencySales: emergencySummary,
      sourceBreakdown,
    },
    graphs: {
      activityTimeline: buckets,
      topFailureReasons: Object.entries(failureReasons)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([label, count]) => ({ label, count })),
    },
    recentEvents: scopedRecentEvents.map(toClientEvent),
    recentCommands,
    recentEmergencyFailures,
    scope: {
      branchCode: scopedBranchCode,
      locationCode: scopedLocationCode,
      backendConfiguredBranchCode,
    },
  };
}

async function listPosSyncEvents({ limit = 50, locationCode, branchCode } = {}) {
  const safeLimit = Math.max(10, Math.min(200, Number.parseInt(limit, 10) || 50));
  const scopedLocationCode = normalizeScopeCode(locationCode);
  const scopedBranchCode = normalizeScopeCode(branchCode) || toScopeFromLocationCode(scopedLocationCode);
  const events = await prisma.posSyncEvent.findMany({ orderBy: { createdAt: 'desc' }, take: safeLimit * 10 });
  return events
    .filter((event) => eventMatchesScope(event, scopedBranchCode, scopedLocationCode))
    .slice(0, safeLimit)
    .map(toClientEvent);
}

async function clearFailedPosSyncEvents({ locationCode, branchCode } = {}) {
  const scopedLocationCode = normalizeScopeCode(locationCode);
  const scopedBranchCode = normalizeBranchCode(branchCode);

  const failedEvents = await prisma.posSyncEvent.findMany({
    where: { status: 'failed' },
    select: {
      id: true,
      source: true,
      eventType: true,
      status: true,
      agentId: true,
      metadata: true,
      createdAt: true,
    },
  });

  const scopedFailedEventIds = failedEvents
    .filter((event) => eventMatchesScope(event, scopedBranchCode, scopedLocationCode))
    .map((event) => event.id);

  if (scopedFailedEventIds.length === 0) {
    return 0;
  }

  const deleted = await prisma.posSyncEvent.deleteMany({
    where: {
      id: { in: scopedFailedEventIds },
    },
  });

  return deleted.count;
}

module.exports = {
  recordPosSyncEvent,
  getPosSyncMonitorSnapshot,
  listPosSyncEvents,
  clearFailedPosSyncEvents,
};

