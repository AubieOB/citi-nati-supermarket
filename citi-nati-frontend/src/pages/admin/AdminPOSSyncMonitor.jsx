import React, { useCallback, useEffect, useRef, useState } from 'react';
import api from '../../utils/api.js';
import { getSocket } from '../../utils/socket.js';
import { notifyError, notifyInfo, notifySuccess } from '../../utils/notifications.js';

const panelStyles = {
  page: {
    padding: '1.5rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '1.25rem',
  },
  hero: {
    background: 'linear-gradient(135deg, #0d3b66 0%, #1b4965 52%, #5fa8d3 100%)',
    color: '#fff',
    borderRadius: '18px',
    padding: '1.5rem',
    boxShadow: '0 18px 40px rgba(13, 59, 102, 0.22)',
    display: 'flex',
    flexWrap: 'wrap',
    gap: '1rem',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  heroTitle: {
    margin: 0,
    fontSize: '1.9rem',
    fontWeight: 800,
    letterSpacing: '-0.03em',
  },
  heroText: {
    margin: '0.5rem 0 0',
    maxWidth: '760px',
    color: 'rgba(255,255,255,0.88)',
    lineHeight: 1.5,
  },
  actionRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.75rem',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  actionButton: {
    border: 'none',
    borderRadius: '999px',
    padding: '0.85rem 1.15rem',
    fontWeight: 700,
    cursor: 'pointer',
    transition: 'transform 0.15s ease, opacity 0.2s ease',
  },
  statGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
    gap: '1rem',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: '18px',
    border: '1px solid #dde7f0',
    boxShadow: '0 10px 28px rgba(15, 23, 42, 0.06)',
    padding: '1.15rem',
  },
  sectionGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
    gap: '1rem',
  },
  subGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
    gap: '1rem',
  },
  chartShell: {
    display: 'flex',
    gap: '0.55rem',
    alignItems: 'flex-end',
    minHeight: '180px',
    paddingTop: '1rem',
    overflowX: 'auto',
  },
  barStack: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0.45rem',
  },
  barColumn: {
    width: '100%',
    maxWidth: '26px',
    minHeight: '12px',
    height: '130px',
    display: 'flex',
    flexDirection: 'column-reverse',
    borderRadius: '999px',
    overflow: 'hidden',
    backgroundColor: '#edf2f7',
  },
  barLabel: {
    fontSize: '0.72rem',
    color: '#64748b',
  },
  issueList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
  },
  issue: {
    borderRadius: '14px',
    padding: '0.9rem 1rem',
    border: '1px solid #e2e8f0',
    backgroundColor: '#f8fafc',
  },
  eventFeed: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.8rem',
    maxHeight: '760px',
    overflowY: 'auto',
    paddingRight: '0.2rem',
  },
  eventRow: {
    border: '1px solid #e2e8f0',
    borderRadius: '16px',
    padding: '0.95rem 1rem',
    backgroundColor: '#fff',
  },
  tableLike: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: '0.75rem',
  },
};

function formatTime(value) {
  if (!value) return 'Never';
  return new Date(value).toLocaleString();
}

function formatRelativeTime(value) {
  if (!value) return 'Never';
  const now = Date.now();
  const ts = new Date(value).getTime();
  const diffMinutes = Math.round((now - ts) / 60000);

  if (diffMinutes < 1) return 'just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.round(diffHours / 24);
  return `${diffDays}d ago`;
}

function getHealthTone(label) {
  if (label === 'healthy') return { bg: '#dcfce7', fg: '#166534' };
  if (label === 'degraded') return { bg: '#fef3c7', fg: '#92400e' };
  return { bg: '#fee2e2', fg: '#991b1b' };
}

function getStatusTone(status) {
  if (status === 'success') return { bg: '#dcfce7', fg: '#166534' };
  if (status === 'warning') return { bg: '#fef3c7', fg: '#92400e' };
  if (status === 'failed') return { bg: '#fee2e2', fg: '#991b1b' };
  return { bg: '#dbeafe', fg: '#1d4ed8' };
}

function MetricCard({ label, value, hint, accent }) {
  return (
    <div style={{ ...panelStyles.card, borderTop: `4px solid ${accent}` }}>
      <div style={{ fontSize: '0.82rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#64748b' }}>{label}</div>
      <div style={{ marginTop: '0.35rem', fontSize: '1.9rem', fontWeight: 800, color: '#0f172a' }}>{value}</div>
      <div style={{ marginTop: '0.35rem', color: '#64748b', lineHeight: 1.45 }}>{hint}</div>
    </div>
  );
}

function ActivityChart({ timeline = [] }) {
  const maxValue = Math.max(1, ...timeline.map((bucket) => bucket.total || 0));

  return (
    <div style={panelStyles.card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'center' }}>
        <div>
          <h3 style={{ margin: 0, color: '#0f172a' }}>Live Activity Graph</h3>
          <p style={{ margin: '0.35rem 0 0', color: '#64748b' }}>Hourly activity over the last 24 hours. Green is success, amber is warning, red is failure.</p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', fontSize: '0.8rem', color: '#64748b' }}>
          <span>Success</span>
          <span>Warning</span>
          <span>Failure</span>
        </div>
      </div>

      <div style={panelStyles.chartShell}>
        {timeline.map((bucket) => {
          const successHeight = `${Math.max(3, (bucket.success / maxValue) * 130)}px`;
          const warningHeight = bucket.warning > 0 ? `${Math.max(3, (bucket.warning / maxValue) * 130)}px` : '0px';
          const failedHeight = bucket.failed > 0 ? `${Math.max(3, (bucket.failed / maxValue) * 130)}px` : '0px';

          return (
            <div key={bucket.key} style={panelStyles.barStack} title={`${bucket.label} | total ${bucket.total}`}>
              <div style={panelStyles.barColumn}>
                <div style={{ height: successHeight, backgroundColor: '#22c55e' }} />
                <div style={{ height: warningHeight, backgroundColor: '#f59e0b' }} />
                <div style={{ height: failedHeight, backgroundColor: '#ef4444' }} />
              </div>
              <div style={panelStyles.barLabel}>{bucket.label}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FailureReasonsChart({ items = [] }) {
  const maxCount = Math.max(1, ...items.map((item) => item.count || 0));

  return (
    <div style={panelStyles.card}>
      <h3 style={{ margin: 0, color: '#0f172a' }}>Top Failure Reasons</h3>
      <p style={{ margin: '0.35rem 0 1rem', color: '#64748b' }}>The monitor groups repeated failures so the loudest issues are obvious.</p>
      {items.length === 0 ? (
        <div style={{ color: '#64748b' }}>No recent failure reasons recorded.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
          {items.map((item) => (
            <div key={item.label}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', marginBottom: '0.35rem' }}>
                <div style={{ color: '#1e293b', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.label}</div>
                <div style={{ color: '#64748b' }}>{item.count}</div>
              </div>
              <div style={{ backgroundColor: '#e2e8f0', borderRadius: '999px', height: '10px', overflow: 'hidden' }}>
                <div style={{ width: `${(item.count / maxCount) * 100}%`, height: '100%', backgroundColor: '#ef4444' }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AdminPOSSyncMonitor() {
  const [monitor, setMonitor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [manualSyncing, setManualSyncing] = useState(false);
  const [toggleSaving, setToggleSaving] = useState(false);
  const refreshTimeoutRef = useRef(null);
  const lastToastEventRef = useRef(null);

  const fetchMonitorData = useCallback(async (showSpinner = false) => {
    try {
      if (showSpinner) setLoading(true);
      else setRefreshing(true);

      const response = await api.get('/admin/pos-sync/monitor?hours=24&limit=40');
      setMonitor(response.data?.data || null);
    } catch (error) {
      notifyError(`Failed to load POS sync monitor: ${error.response?.data?.error || error.message}`, 4000);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const scheduleRefresh = useCallback(() => {
    if (refreshTimeoutRef.current) {
      clearTimeout(refreshTimeoutRef.current);
    }

    refreshTimeoutRef.current = setTimeout(() => {
      fetchMonitorData(false);
    }, 350);
  }, [fetchMonitorData]);

  useEffect(() => {
    fetchMonitorData(true);

    const interval = setInterval(() => {
      fetchMonitorData(false);
    }, 30000);

    return () => {
      clearInterval(interval);
      if (refreshTimeoutRef.current) clearTimeout(refreshTimeoutRef.current);
    };
  }, [fetchMonitorData]);

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return undefined;

    const handlePosSyncEvent = (event) => {
      setMonitor((prev) => {
        if (!prev) return prev;

        const nextEvents = [event, ...(prev.recentEvents || []).filter((item) => item.id !== event.id)].slice(0, 40);
        return {
          ...prev,
          recentEvents: nextEvents,
          summary: {
            ...prev.summary,
            lastEventAt: event.createdAt,
            lastFailedEventAt: event.status === 'failed' ? event.createdAt : prev.summary?.lastFailedEventAt,
            lastSuccessfulEventAt: event.status === 'success' ? event.createdAt : prev.summary?.lastSuccessfulEventAt,
          },
        };
      });

      if (lastToastEventRef.current !== event.id) {
        lastToastEventRef.current = event.id;
        const notificationMessage = `${event.title}${event.reason ? `: ${event.reason}` : ''}`;

        if (event.status === 'failed' || event.level === 'error') {
          notifyError(notificationMessage, 5000);
        } else if (event.status === 'warning' || event.level === 'warning') {
          notifyInfo(notificationMessage, 4000);
        }
      }

      scheduleRefresh();
    };

    socket.on('posSyncEvent', handlePosSyncEvent);
    return () => {
      socket.off('posSyncEvent', handlePosSyncEvent);
    };
  }, [scheduleRefresh]);

  const handleManualSync = async () => {
    try {
      setManualSyncing(true);
      const response = await api.post('/admin/pos-sync/manual-sync');
      const result = response.data?.result || {};
      notifySuccess(`Manual POS sync complete: ${result.synced || 0} synced, ${result.skipped || 0} skipped`, 3500);
      await fetchMonitorData(false);
    } catch (error) {
      notifyError(`Manual POS sync failed: ${error.response?.data?.error || error.message}`, 4500);
    } finally {
      setManualSyncing(false);
    }
  };

  const handleToggle = async () => {
    if (!monitor?.config) return;

    try {
      setToggleSaving(true);
      const nextEnabled = !monitor.config.enabled;
      await api.post('/admin/pos-sync/toggle', { enabled: nextEnabled });
      notifySuccess(`POS sync ${nextEnabled ? 'enabled' : 'disabled'}`, 3000);
      await fetchMonitorData(false);
    } catch (error) {
      notifyError(`Failed to update POS sync toggle: ${error.response?.data?.error || error.message}`, 4000);
    } finally {
      setToggleSaving(false);
    }
  };

  if (loading && !monitor) {
    return <div style={{ padding: '2rem', color: '#64748b' }}>Loading POS sync monitor...</div>;
  }

  const summary = monitor?.summary || {};
  const stats = monitor?.stats || {};
  const queue = stats.queue || {};
  const emergencySales = stats.emergencySales || {};
  const tone = getHealthTone(summary.healthLabel);

  return (
    <div style={panelStyles.page}>
      <div style={panelStyles.hero}>
        <div>
          <h1 style={panelStyles.heroTitle}>POS Sync Monitor</h1>
          <p style={panelStyles.heroText}>
            Standalone live monitoring for the POS Sync Agent, command queue, emergency-sale invoice write-backs, and backend-to-agent health. This panel surfaces failures, root-cause hints, and operational recommendations in real time.
          </p>
          <div style={{ marginTop: '1rem', display: 'flex', flexWrap: 'wrap', gap: '0.65rem' }}>
            <span style={{ backgroundColor: tone.bg, color: tone.fg, borderRadius: '999px', padding: '0.45rem 0.8rem', fontWeight: 700 }}>
              Health: {summary.healthLabel || 'unknown'} ({summary.healthScore ?? '--'}/100)
            </span>
            <span style={{ backgroundColor: 'rgba(255,255,255,0.16)', borderRadius: '999px', padding: '0.45rem 0.8rem' }}>
              Agent: {summary.agentHealthy ? 'reachable' : 'unreachable'}
            </span>
            <span style={{ backgroundColor: 'rgba(255,255,255,0.16)', borderRadius: '999px', padding: '0.45rem 0.8rem' }}>
              Last event: {formatRelativeTime(summary.lastEventAt)}
            </span>
            <span style={{ backgroundColor: 'rgba(255,255,255,0.16)', borderRadius: '999px', padding: '0.45rem 0.8rem' }}>
              {refreshing ? 'Refreshing live data...' : 'Live refresh active'}
            </span>
          </div>
        </div>

        <div style={panelStyles.actionRow}>
          <button
            onClick={handleToggle}
            disabled={toggleSaving}
            style={{
              ...panelStyles.actionButton,
              backgroundColor: monitor?.config?.enabled ? '#fee2e2' : '#dcfce7',
              color: monitor?.config?.enabled ? '#991b1b' : '#166534',
            }}
          >
            {toggleSaving ? 'Saving...' : monitor?.config?.enabled ? 'Disable POS Sync' : 'Enable POS Sync'}
          </button>

          <button
            onClick={handleManualSync}
            disabled={manualSyncing || !monitor?.config?.enabled}
            style={{
              ...panelStyles.actionButton,
              backgroundColor: '#f8fafc',
              color: '#0f172a',
              opacity: manualSyncing || !monitor?.config?.enabled ? 0.6 : 1,
            }}
          >
            {manualSyncing ? 'Running Manual Sync...' : 'Run Manual Sync'}
          </button>
        </div>
      </div>

      <div style={panelStyles.statGrid}>
        <MetricCard label="Health Score" value={summary.healthScore ?? '--'} hint={`Agent ${summary.agentHealthy ? 'reachable' : 'unreachable'} • failure rate ${summary.failureRate ?? 0}%`} accent="#0d9488" />
        <MetricCard label="Queue Backlog" value={`${queue.PENDING || 0}`} hint={`${queue.PROCESSING || 0} processing • ${queue.FAILED || 0} failed`} accent="#f59e0b" />
        <MetricCard label="Tracked Events (24h)" value={`${stats.eventsInWindow || 0}`} hint={`${stats.successCount || 0} success • ${stats.failedCount || 0} failed`} accent="#2563eb" />
        <MetricCard label="Emergency Sale Risk" value={`${emergencySales.failed || 0}`} hint={`${emergencySales.pending || 0} pending • ${emergencySales.synced || 0} synced`} accent="#dc2626" />
      </div>

      <div style={panelStyles.sectionGrid}>
        <ActivityChart timeline={monitor?.graphs?.activityTimeline || []} />
        <FailureReasonsChart items={monitor?.graphs?.topFailureReasons || []} />
      </div>

      <div style={panelStyles.subGrid}>
        <div style={panelStyles.card}>
          <h3 style={{ margin: 0, color: '#0f172a' }}>Detected Flaws</h3>
          <p style={{ margin: '0.35rem 0 1rem', color: '#64748b' }}>Health checks and recent activity are translated into concrete issues and next actions.</p>
          <div style={panelStyles.issueList}>
            {(summary.issues || []).length === 0 ? (
              <div style={{ color: '#166534', backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '14px', padding: '0.9rem 1rem' }}>
                No active flaws detected from the current monitoring rules.
              </div>
            ) : (
              summary.issues.map((issue) => (
                <div key={`${issue.title}-${issue.detail}`} style={{ ...panelStyles.issue, borderColor: issue.severity === 'critical' ? '#fecaca' : '#fde68a', backgroundColor: issue.severity === 'critical' ? '#fff1f2' : '#fffaf0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'center' }}>
                    <strong style={{ color: '#0f172a' }}>{issue.title}</strong>
                    <span style={{ fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', color: issue.severity === 'critical' ? '#b91c1c' : '#b45309' }}>{issue.severity}</span>
                  </div>
                  <div style={{ marginTop: '0.35rem', color: '#475569', lineHeight: 1.45 }}>{issue.detail}</div>
                </div>
              ))
            )}
          </div>
        </div>

        <div style={panelStyles.card}>
          <h3 style={{ margin: 0, color: '#0f172a' }}>Improvements Required</h3>
          <p style={{ margin: '0.35rem 0 1rem', color: '#64748b' }}>Recommended next steps based on live failures, backlog, and health status.</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {(summary.recommendations || []).length === 0 ? (
              <div style={{ color: '#64748b' }}>No active recommendations at the moment.</div>
            ) : (
              summary.recommendations.map((item) => (
                <div key={item} style={{ borderRadius: '14px', padding: '0.85rem 1rem', backgroundColor: '#eff6ff', border: '1px solid #bfdbfe', color: '#1e3a8a' }}>
                  {item}
                </div>
              ))
            )}
          </div>

          <div style={{ marginTop: '1rem', ...panelStyles.tableLike }}>
            <div style={{ backgroundColor: '#f8fafc', borderRadius: '14px', padding: '0.85rem 1rem' }}>
              <div style={{ color: '#64748b', fontSize: '0.8rem', textTransform: 'uppercase' }}>Agent URL</div>
              <div style={{ marginTop: '0.3rem', color: '#0f172a', fontWeight: 700 }}>{monitor?.config?.agentUrl || 'Not configured'}</div>
            </div>
            <div style={{ backgroundColor: '#f8fafc', borderRadius: '14px', padding: '0.85rem 1rem' }}>
              <div style={{ color: '#64748b', fontSize: '0.8rem', textTransform: 'uppercase' }}>Timeout</div>
              <div style={{ marginTop: '0.3rem', color: '#0f172a', fontWeight: 700 }}>{monitor?.config?.timeoutMs || 0}ms</div>
            </div>
          </div>
        </div>
      </div>

      <div style={panelStyles.sectionGrid}>
        <div style={panelStyles.card}>
          <h3 style={{ margin: 0, color: '#0f172a' }}>Recent Queue and Sync Stats</h3>
          <p style={{ margin: '0.35rem 0 1rem', color: '#64748b' }}>Operational counts pulled from the command queue, emergency sale sync tracker, and event ledger.</p>

          <div style={panelStyles.tableLike}>
            <div style={{ backgroundColor: '#f8fafc', borderRadius: '14px', padding: '0.85rem 1rem' }}>
              <div style={{ color: '#64748b' }}>Completed queue commands</div>
              <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#0f172a', marginTop: '0.3rem' }}>{queue.COMPLETED || 0}</div>
            </div>
            <div style={{ backgroundColor: '#f8fafc', borderRadius: '14px', padding: '0.85rem 1rem' }}>
              <div style={{ color: '#64748b' }}>Processing queue commands</div>
              <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#0f172a', marginTop: '0.3rem' }}>{queue.PROCESSING || 0}</div>
            </div>
            <div style={{ backgroundColor: '#f8fafc', borderRadius: '14px', padding: '0.85rem 1rem' }}>
              <div style={{ color: '#64748b' }}>Pending emergency sales</div>
              <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#0f172a', marginTop: '0.3rem' }}>{emergencySales.pending || 0}</div>
            </div>
            <div style={{ backgroundColor: '#f8fafc', borderRadius: '14px', padding: '0.85rem 1rem' }}>
              <div style={{ color: '#64748b' }}>Failed emergency sales</div>
              <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#991b1b', marginTop: '0.3rem' }}>{emergencySales.failed || 0}</div>
            </div>
          </div>

          <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {(monitor?.recentCommands || []).slice(0, 8).map((command) => {
              const toneForStatus = getStatusTone((command.status || '').toLowerCase());
              return (
                <div key={command.id} style={{ border: '1px solid #e2e8f0', borderRadius: '14px', padding: '0.8rem 0.95rem', display: 'flex', flexWrap: 'wrap', gap: '0.7rem', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontWeight: 700, color: '#0f172a' }}>{command.commandType}</div>
                    <div style={{ color: '#64748b', marginTop: '0.2rem' }}>{command.relatedEntityType || 'Command'} {command.relatedEntityId ? `• ${command.relatedEntityId}` : ''}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span style={{ backgroundColor: toneForStatus.bg, color: toneForStatus.fg, padding: '0.28rem 0.6rem', borderRadius: '999px', fontWeight: 700, fontSize: '0.8rem' }}>{command.status}</span>
                    <div style={{ color: '#64748b', marginTop: '0.35rem', fontSize: '0.82rem' }}>{formatRelativeTime(command.createdAt)}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div style={panelStyles.card}>
          <h3 style={{ margin: 0, color: '#0f172a' }}>Live Event Feed</h3>
          <p style={{ margin: '0.35rem 0 1rem', color: '#64748b' }}>Successful and failed sync activity with reasons, causes, and suggested fixes.</p>

          <div style={panelStyles.eventFeed}>
            {(monitor?.recentEvents || []).map((event) => {
              const eventTone = getStatusTone(event.status);
              return (
                <div key={event.id} style={panelStyles.eventRow}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
                        <strong style={{ color: '#0f172a' }}>{event.title}</strong>
                        <span style={{ backgroundColor: eventTone.bg, color: eventTone.fg, padding: '0.28rem 0.6rem', borderRadius: '999px', fontWeight: 700, fontSize: '0.8rem' }}>{event.status}</span>
                      </div>
                      <div style={{ marginTop: '0.35rem', color: '#475569', lineHeight: 1.45 }}>{event.message}</div>
                    </div>
                    <div style={{ textAlign: 'right', color: '#64748b', fontSize: '0.82rem' }}>
                      <div>{event.source}</div>
                      <div>{formatRelativeTime(event.createdAt)}</div>
                    </div>
                  </div>

                  {(event.reason || event.suggestion) && (
                    <div style={{ marginTop: '0.75rem', display: 'grid', gap: '0.6rem' }}>
                      {event.reason && (
                        <div style={{ backgroundColor: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '12px', padding: '0.7rem 0.8rem', color: '#9a3412' }}>
                          <strong>Cause:</strong> {event.reason}
                        </div>
                      )}
                      {event.suggestion && (
                        <div style={{ backgroundColor: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '12px', padding: '0.7rem 0.8rem', color: '#1d4ed8' }}>
                          <strong>Suggested fix:</strong> {event.suggestion}
                        </div>
                      )}
                    </div>
                  )}

                  <div style={{ marginTop: '0.75rem', color: '#64748b', fontSize: '0.8rem' }}>
                    {formatTime(event.createdAt)}{event.durationMs ? ` • ${event.durationMs}ms` : ''}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}