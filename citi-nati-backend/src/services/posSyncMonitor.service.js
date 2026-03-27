const { PrismaClient } = require('@prisma/client');
const { emitPosSyncEvent } = require('../utils/socket');
const posCommandQueueService = require('./posCommandQueue.service');

const prisma = new PrismaClient();

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

async function getPosSyncMonitorSnapshot({ hours = 24, limit = 40 } = {}) {
  const { checkPOSHealth, getRuntimeConfig } = require('./posSync.service');
  const safeHours = Math.max(1, Math.min(168, Number.parseInt(hours, 10) || 24));
  const safeLimit = Math.max(10, Math.min(100, Number.parseInt(limit, 10) || 40));
  const since = new Date(Date.now() - safeHours * 60 * 60 * 1000);

  const [config, agentHealthy, recentEvents, queueStats, recentCommands, emergencyGrouped, recentEmergencyFailures, recentWindowEvents] = await Promise.all([
    getRuntimeConfig(),
    checkPOSHealth(),
    prisma.posSyncEvent.findMany({ orderBy: { createdAt: 'desc' }, take: safeLimit }),
    posCommandQueueService.getStats(),
    posCommandQueueService.listCommands({ take: 20 }),
    prisma.emergencySale.groupBy({ by: ['syncStatus'], _count: { _all: true } }),
    prisma.emergencySale.findMany({
      where: { syncStatus: 'sync_failed' },
      orderBy: { updatedAt: 'desc' },
      take: 10,
      select: { id: true, saleRef: true, retryCount: true, syncError: true, updatedAt: true },
    }),
    prisma.posSyncEvent.findMany({ where: { createdAt: { gte: since } }, orderBy: { createdAt: 'asc' } }),
  ]);

  const buckets = buildBuckets(safeHours);
  const bucketMap = new Map(buckets.map((bucket) => [bucket.key, bucket]));
  const sourceBreakdown = {};
  const failureReasons = {};

  for (const event of recentWindowEvents) {
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

  const emergencySummary = {
    pending: 0,
    synced: 0,
    failed: 0,
  };

  for (const row of emergencyGrouped) {
    if (row.syncStatus === 'pending_pos_sync') emergencySummary.pending = row._count._all;
    if (row.syncStatus === 'synced_to_pos') emergencySummary.synced = row._count._all;
    if (row.syncStatus === 'sync_failed') emergencySummary.failed = row._count._all;
  }

  const health = analyzeHealth({
    enabled: config.enabled,
    agentHealthy,
    queueStats,
    emergencySummary,
    recentEvents: recentWindowEvents.slice().reverse(),
  });

  const recentFailure = recentEvents.find((event) => event.status === 'failed') || null;
  const recentSuccess = recentEvents.find((event) => event.status === 'success') || null;

  return {
    config,
    summary: {
      enabled: config.enabled,
      agentHealthy,
      healthScore: health.healthScore,
      healthLabel: health.label,
      failureRate: health.failureRate,
      lastEventAt: recentEvents[0]?.createdAt || null,
      lastSuccessfulEventAt: recentSuccess?.createdAt || null,
      lastFailedEventAt: recentFailure?.createdAt || null,
      issues: health.issues,
      recommendations: health.recommendations,
    },
    stats: {
      eventsInWindow: recentWindowEvents.length,
      successCount: recentWindowEvents.filter((event) => event.status === 'success').length,
      failedCount: recentWindowEvents.filter((event) => event.status === 'failed').length,
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
    recentEvents: recentEvents.map(toClientEvent),
    recentCommands,
    recentEmergencyFailures,
  };
}

async function listPosSyncEvents({ limit = 50 } = {}) {
  const safeLimit = Math.max(10, Math.min(200, Number.parseInt(limit, 10) || 50));
  const events = await prisma.posSyncEvent.findMany({ orderBy: { createdAt: 'desc' }, take: safeLimit });
  return events.map(toClientEvent);
}

module.exports = {
  recordPosSyncEvent,
  getPosSyncMonitorSnapshot,
  listPosSyncEvents,
};