import React, { useCallback, useEffect, useRef, useState } from 'react';
import api from '../../utils/api.js';
import { getSocket } from '../../utils/socket.js';
import { notifyError, notifyInfo, notifySuccess } from '../../utils/notifications.js';

const TABS = [
  { id: 'overview', label: 'Overview', icon: 'fa-tachometer-alt' },
  { id: 'activity', label: 'Activity', icon: 'fa-chart-bar' },
  { id: 'health', label: 'Health & Issues', icon: 'fa-heartbeat' },
  { id: 'queue', label: 'Command Queue', icon: 'fa-tasks' },
  { id: 'events', label: 'Live Events', icon: 'fa-stream' },
];

const S = {
  card: {
    backgroundColor: '#fff',
    borderRadius: '12px',
    border: '1px solid #e0e0e0',
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
    padding: '1.25rem',
  },
  statGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '1rem',
  },
  twoCol: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
    gap: '1.25rem',
  },
  tileGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(175px, 1fr))',
    gap: '0.75rem',
  },
  chartShell: {
    display: 'flex',
    gap: '0.5rem',
    alignItems: 'flex-end',
    minHeight: '160px',
    paddingTop: '1rem',
    overflowX: 'auto',
  },
  barStack: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0.4rem',
  },
  barColumn: {
    width: '100%',
    maxWidth: '24px',
    height: '120px',
    display: 'flex',
    flexDirection: 'column-reverse',
    borderRadius: '6px',
    overflow: 'hidden',
    backgroundColor: '#f1f5f9',
  },
  barLabel: { fontSize: '0.7rem', color: '#94a3b8' },
  sectionTitle: { margin: '0 0 0.25rem', fontSize: '1rem', fontWeight: 700, color: '#1e293b' },
  sectionSub: { margin: '0 0 1rem', fontSize: '0.85rem', color: '#64748b' },
  issueRow: (severity) => ({
    borderRadius: '10px',
    padding: '0.85rem 1rem',
    border: `1px solid ${severity === 'critical' ? '#fecaca' : '#fde68a'}`,
    backgroundColor: severity === 'critical' ? '#fff1f2' : '#fffbeb',
  }),
  eventRow: {
    border: '1px solid #e2e8f0',
    borderRadius: '12px',
    padding: '0.9rem 1rem',
    backgroundColor: '#fff',
  },
  tab: (active) => ({
    padding: '0.55rem 1.2rem',
    border: 'none',
    background: 'none',
    cursor: 'pointer',
    fontSize: '0.9rem',
    fontWeight: active ? 700 : 500,
    color: active ? '#5B4B8A' : '#666',
    borderBottom: active ? '2px solid #5B4B8A' : '2px solid transparent',
    marginBottom: '-2px',
    transition: 'color 0.15s',
    whiteSpace: 'nowrap',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.4rem',
  }),
  actionBtn: (variant) => ({
    padding: '0.5rem 1.1rem',
    border: 'none',
    borderRadius: '6px',
    fontWeight: 600,
    fontSize: '0.88rem',
    cursor: 'pointer',
    transition: 'opacity 0.15s',
    ...(variant === 'disable'
      ? { backgroundColor: '#fee2e2', color: '#991b1b' }
      : variant === 'enable'
      ? { backgroundColor: '#dcfce7', color: '#166534' }
      : { backgroundColor: '#f1f5f9', color: '#334155' }),
  }),
  badge: (bg, fg) => ({
    backgroundColor: bg,
    color: fg,
    borderRadius: '999px',
    padding: '0.25rem 0.65rem',
    fontSize: '0.78rem',
    fontWeight: 600,
    whiteSpace: 'nowrap',
  }),
};

function fmt(value) {
  if (!value) return 'Never';
  return new Date(value).toLocaleString();
}

function rel(value) {
  if (!value) return 'Never';
  const diff = Math.round((Date.now() - new Date(value).getTime()) / 60000);
  if (diff < 1) return 'just now';
  if (diff < 60) return `${diff}m ago`;
  const h = Math.round(diff / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

function healthTone(label) {
  if (label === 'healthy') return { bg: '#dcfce7', fg: '#166534' };
  if (label === 'degraded') return { bg: '#fef9c3', fg: '#854d0e' };
  return { bg: '#fee2e2', fg: '#991b1b' };
}

function statusTone(status) {
  if (status === 'success') return { bg: '#dcfce7', fg: '#166534' };
  if (status === 'warning') return { bg: '#fef9c3', fg: '#854d0e' };
  if (status === 'failed') return { bg: '#fee2e2', fg: '#991b1b' };
  return { bg: '#dbeafe', fg: '#1d4ed8' };
}

function normalizeScopeCode(value) {
  const normalized = String(value || '').trim().toUpperCase();
  return normalized || null;
}

function deriveBranchCodeFromLocationCode(locationCode) {
  const normalized = normalizeScopeCode(locationCode);
  if (normalized === 'BT') return 'BLANTYRE';
  if (['ZA', 'SH', 'BAR', 'WH'].includes(normalized)) return 'ZOMBA';
  return null;
}

function expandScopeLocationCodes(locationCode) {
  const normalized = normalizeScopeCode(locationCode);
  if (!normalized) return [];
  if (normalized === 'BT') return ['BT'];
  if (['ZA', 'SH', 'BAR', 'WH'].includes(normalized)) return ['ZA', 'SH', 'BAR', 'WH'];
  return [normalized];
}

function eventMatchesSelectedScope(event, selectedLocationCode) {
  const scopeBranchCode = deriveBranchCodeFromLocationCode(selectedLocationCode);
  const scopeLocationCodes = expandScopeLocationCodes(selectedLocationCode);
  if (!scopeBranchCode && scopeLocationCodes.length === 0) return true;

  const metadata = event?.metadata && typeof event.metadata === 'object' ? event.metadata : {};
  const eventBranchCode = normalizeScopeCode(metadata.branchCode || null);
  const eventLocationCode = normalizeScopeCode(metadata.locationCode || null);

  if (scopeBranchCode && eventBranchCode === scopeBranchCode) return true;
  if (eventLocationCode && scopeLocationCodes.includes(eventLocationCode)) return true;
  return false;
}

/* ──────────────── sub-components ──────────────── */

function MetricCard({ label, value, hint, accent }) {
  return (
    <div style={{ ...S.card, borderTop: `4px solid ${accent}` }}>
      <div style={{ fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.07em', color: '#64748b' }}>{label}</div>
      <div style={{ marginTop: '0.3rem', fontSize: '1.75rem', fontWeight: 800, color: '#0f172a' }}>{value}</div>
      <div style={{ marginTop: '0.25rem', color: '#64748b', fontSize: '0.83rem', lineHeight: 1.4 }}>{hint}</div>
    </div>
  );
}

function ActivityBarChart({ timeline = [] }) {
  const maxVal = Math.max(1, ...timeline.map((b) => b.total || 0));
  return (
    <div style={S.chartShell}>
      {timeline.map((b) => {
        const h = (v) => `${Math.max(3, (v / maxVal) * 120)}px`;
        return (
          <div key={b.key} style={S.barStack} title={`${b.label} | ${b.total} total`}>
            <div style={S.barColumn}>
              <div style={{ height: b.success > 0 ? h(b.success) : '0px', backgroundColor: '#22c55e' }} />
              <div style={{ height: b.warning > 0 ? h(b.warning) : '0px', backgroundColor: '#f59e0b' }} />
              <div style={{ height: b.failed > 0 ? h(b.failed) : '0px', backgroundColor: '#ef4444' }} />
            </div>
            <div style={S.barLabel}>{b.label}</div>
          </div>
        );
      })}
    </div>
  );
}

function FailureBar({ items = [] }) {
  const maxCount = Math.max(1, ...items.map((i) => i.count || 0));
  if (items.length === 0) return <div style={{ color: '#94a3b8', fontSize: '0.88rem' }}>No failure reasons recorded.</div>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {items.map((item) => (
        <div key={item.label}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', marginBottom: '0.3rem' }}>
            <span style={{ color: '#1e293b', fontWeight: 600, fontSize: '0.88rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.label}</span>
            <span style={{ color: '#64748b', fontSize: '0.88rem', flexShrink: 0 }}>{item.count}</span>
          </div>
          <div style={{ backgroundColor: '#f1f5f9', borderRadius: '4px', height: '8px', overflow: 'hidden' }}>
            <div style={{ width: `${(item.count / maxCount) * 100}%`, height: '100%', backgroundColor: '#ef4444', borderRadius: '4px' }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function AdminPOSSyncMonitor({ selectedLocationCode = 'BT' }) {
  const isAdminDarkTheme = typeof document !== 'undefined' && document.body.classList.contains('admin-theme-dark');
  const [activeTab, setActiveTab] = useState('overview');
  const [monitor, setMonitor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [manualSyncing, setManualSyncing] = useState(false);
  const [toggleSaving, setToggleSaving] = useState(false);
  const refreshTimeoutRef = useRef(null);
  const lastToastEventRef = useRef(null);
  const previousLocationCodeRef = useRef(selectedLocationCode);

  // ── Sticky header layout (matches AdminQuotations / AdminPromotions pattern) ──
  const headerRef = useRef(null);
  const [headerLayout, setHeaderLayout] = useState({ left: 0, width: 0, top: 0 });
  const [headerHeight, setHeaderHeight] = useState(0);

  useEffect(() => {
    let resizeObserver;
    const update = () => {
      const contentArea = document.querySelector('.admin-content-area');
      if (!contentArea) return;
      const rect = contentArea.getBoundingClientRect();
      setHeaderLayout({
        left: rect.left,
        width: rect.width,
        top: window.innerWidth <= 768 ? 56 : 0,
      });
      if (headerRef.current) setHeaderHeight(headerRef.current.offsetHeight);
    };
    update();
    window.addEventListener('resize', update);
    const contentArea = document.querySelector('.admin-content-area');
    if (contentArea && typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(update);
      resizeObserver.observe(contentArea);
    }
    return () => {
      window.removeEventListener('resize', update);
      if (resizeObserver) resizeObserver.disconnect();
    };
  }, [selectedLocationCode]);

  // Re-measure header height after every render (content can wrap on narrow screens)
  useEffect(() => {
    if (headerRef.current) setHeaderHeight(headerRef.current.offsetHeight);
  });

  // ── Data fetching ──────────────────────────────────────────────
  const fetchMonitorData = useCallback(async (showSpinner = false) => {
    try {
      if (showSpinner) setLoading(true);
      else setRefreshing(true);
      const response = await api.get('/admin/pos-sync/monitor', {
        params: {
          hours: 24,
          limit: 40,
          ...(selectedLocationCode && { locationCode: selectedLocationCode }),
        },
      });
      setMonitor(response.data?.data || null);
    } catch (error) {
      notifyError(`Failed to load POS sync monitor: ${error.response?.data?.error || error.message}`, 4000);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedLocationCode]);

  const scheduleRefresh = useCallback(() => {
    if (refreshTimeoutRef.current) clearTimeout(refreshTimeoutRef.current);
    refreshTimeoutRef.current = setTimeout(() => fetchMonitorData(false), 350);
  }, [fetchMonitorData, selectedLocationCode]);

  useEffect(() => {
    if (previousLocationCodeRef.current === selectedLocationCode) {
      return;
    }

    previousLocationCodeRef.current = selectedLocationCode;
    setMonitor(null);
    setLoading(true);
    setRefreshing(false);
    lastToastEventRef.current = null;

    if (refreshTimeoutRef.current) {
      clearTimeout(refreshTimeoutRef.current);
      refreshTimeoutRef.current = null;
    }
  }, [selectedLocationCode]);

  useEffect(() => {
    fetchMonitorData(true);
    const interval = setInterval(() => fetchMonitorData(false), 30000);
    return () => {
      clearInterval(interval);
      if (refreshTimeoutRef.current) clearTimeout(refreshTimeoutRef.current);
    };
  }, [fetchMonitorData]);

  // ── Socket ─────────────────────────────────────────────────────
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return undefined;

    const handlePosSyncEvent = (event) => {
      if (!eventMatchesSelectedScope(event, selectedLocationCode)) {
        return;
      }

      setMonitor((prev) => {
        if (!prev) return prev;
        const nextEvents = [event, ...(prev.recentEvents || []).filter((e) => e.id !== event.id)].slice(0, 40);
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
        const msg = `${event.title}${event.reason ? `: ${event.reason}` : ''}`;
        if (event.status === 'failed' || event.level === 'error') notifyError(msg, 5000);
        else if (event.status === 'warning' || event.level === 'warning') notifyInfo(msg, 4000);
      }

      scheduleRefresh();
    };

    socket.on('posSyncEvent', handlePosSyncEvent);
    return () => socket.off('posSyncEvent', handlePosSyncEvent);
  }, [scheduleRefresh, selectedLocationCode]);

  // ── Actions ────────────────────────────────────────────────────
  const handleManualSync = async () => {
    try {
      setManualSyncing(true);
      const response = await api.post('/admin/pos-sync/manual-sync', {
        locationCode: selectedLocationCode,
      });
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
      await api.post('/admin/pos-sync/toggle', {
        enabled: nextEnabled,
        locationCode: selectedLocationCode,
      });
      notifySuccess(`POS sync ${nextEnabled ? 'enabled' : 'disabled'}`, 3000);
      await fetchMonitorData(false);
    } catch (error) {
      notifyError(`Failed to update POS sync toggle: ${error.response?.data?.error || error.message}`, 4000);
    } finally {
      setToggleSaving(false);
    }
  };

  // ── Derived data ───────────────────────────────────────────────
  const summary = monitor?.summary || {};
  const stats = monitor?.stats || {};
  const queue = stats.queue || {};
  const emergencySales = stats.emergencySales || {};
  const tone = healthTone(summary.healthLabel);
  const enabled = monitor?.config?.enabled;

  const fixedHeaderStyle = {
    position: 'fixed',
    top: `${headerLayout.top}px`,
    left: `${headerLayout.left}px`,
    width: `${headerLayout.width}px`,
    zIndex: 80,
    backgroundColor: '#fff',
    borderBottom: '1px solid #e0e0e0',
    boxShadow: '0 2px 8px rgba(0,0,0,0.07)',
    boxSizing: 'border-box',
    padding: '1rem 1.5rem 0',
  };

  if (loading && !monitor) {
    return <div style={{ padding: '2rem', color: '#64748b' }}>Loading POS sync monitor...</div>;
  }

  return (
    <div className="admin-pos-sync-monitor">
      {/* ── Sticky Header ── */}
      <div ref={headerRef} style={fixedHeaderStyle}>
        {/* Title row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '0.75rem' }}>
          <div>
            <h2 style={{ margin: 0, color: '#5B4B8A', fontSize: '1.4rem', fontWeight: 700 }}>
              <i className="fas fa-chart-line" style={{ marginRight: '0.5rem', opacity: 0.8 }} />
              POS Sync Monitor
            </h2>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginTop: '0.5rem' }}>
              <span style={S.badge(tone.bg, tone.fg)}>
                {summary.healthLabel || 'unknown'} {summary.healthScore != null ? `${summary.healthScore}/100` : ''}
              </span>
              <span style={S.badge('#f1f5f9', '#475569')}>
                Agent: {summary.agentHealthy ? 'reachable' : 'unreachable'}
              </span>
              <span style={S.badge('#f1f5f9', '#475569')}>
                Scope: {selectedLocationCode === 'ZA' ? 'Zomba' : 'Blantyre'} ({selectedLocationCode})
              </span>
              <span style={S.badge('#f1f5f9', '#475569')}>
                Last event: {rel(summary.lastEventAt)}
              </span>
              {refreshing && (
                <span style={S.badge('#dbeafe', '#1d4ed8')}>Refreshing…</span>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
            <button
              onClick={handleToggle}
              disabled={toggleSaving}
              style={{ ...S.actionBtn(enabled ? 'disable' : 'enable'), opacity: toggleSaving ? 0.6 : 1 }}
            >
              <i className={`fas ${enabled ? 'fa-pause-circle' : 'fa-play-circle'}`} style={{ marginRight: '0.35rem' }} />
              {toggleSaving ? 'Saving…' : enabled ? 'Disable POS Sync' : 'Enable POS Sync'}
            </button>
            <button
              onClick={handleManualSync}
              disabled={manualSyncing || !enabled}
              style={{ ...S.actionBtn('secondary'), opacity: manualSyncing || !enabled ? 0.5 : 1 }}
            >
              <i className="fas fa-sync-alt" style={{ marginRight: '0.35rem' }} />
              {manualSyncing ? 'Syncing…' : 'Run Manual Sync'}
            </button>
          </div>
        </div>

        {/* Tab bar */}
        <div style={{ display: 'flex', gap: '0.1rem', borderBottom: '2px solid #e0e0e0', overflowX: 'auto' }}>
          {TABS.map((tab) => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={S.tab(activeTab === tab.id)}>
              <i className={`fas ${tab.icon}`} />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Spacer to prevent content hiding under fixed header */}
      <div style={{ height: `${headerHeight}px` }} />

      {/* ── Tab Content ── */}
      <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

        {/* OVERVIEW ─────────────────────────────────────────────── */}
        {activeTab === 'overview' && (
          <>
            <div style={S.statGrid}>
              <MetricCard
                label="Health Score"
                value={summary.healthScore ?? '--'}
                hint={`Agent ${summary.agentHealthy ? 'reachable' : 'unreachable'} • failure rate ${summary.failureRate ?? 0}%`}
                accent="#0d9488"
              />
              <MetricCard
                label="Queue Backlog"
                value={queue.PENDING || 0}
                hint={`${queue.PROCESSING || 0} processing • ${queue.FAILED || 0} failed`}
                accent="#f59e0b"
              />
              <MetricCard
                label="Events (24h)"
                value={stats.eventsInWindow || 0}
                hint={`${stats.successCount || 0} success • ${stats.failedCount || 0} failed`}
                accent="#2563eb"
              />
              <MetricCard
                label="Emergency Sale Risk"
                value={emergencySales.failed || 0}
                hint={`${emergencySales.pending || 0} pending • ${emergencySales.synced || 0} synced`}
                accent="#dc2626"
              />
            </div>

            <div style={S.card}>
              <h3 style={S.sectionTitle}>Agent Configuration</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem', marginTop: '0.75rem' }}>
                <div style={{ backgroundColor: '#f8fafc', borderRadius: '8px', padding: '0.85rem 1rem' }}>
                  <div style={{ color: '#64748b', fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Agent URL</div>
                  <div style={{ marginTop: '0.3rem', color: '#0f172a', fontWeight: 600, wordBreak: 'break-all', fontSize: '0.9rem' }}>
                    {monitor?.config?.agentUrl || 'Not configured'}
                  </div>
                </div>
                <div style={{ backgroundColor: '#f8fafc', borderRadius: '8px', padding: '0.85rem 1rem' }}>
                  <div style={{ color: '#64748b', fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Timeout</div>
                  <div style={{ marginTop: '0.3rem', color: '#0f172a', fontWeight: 600, fontSize: '0.9rem' }}>
                    {monitor?.config?.timeoutMs || 0} ms
                  </div>
                </div>
                <div style={{ backgroundColor: '#f8fafc', borderRadius: '8px', padding: '0.85rem 1rem' }}>
                  <div style={{ color: '#64748b', fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Sync Status</div>
                  <div style={{ marginTop: '0.3rem', fontWeight: 600, fontSize: '0.9rem', color: enabled ? '#166534' : '#991b1b' }}>
                    {enabled ? 'Enabled' : 'Disabled'}
                  </div>
                </div>
                <div style={{ backgroundColor: '#f8fafc', borderRadius: '8px', padding: '0.85rem 1rem' }}>
                  <div style={{ color: '#64748b', fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Last Success</div>
                  <div style={{ marginTop: '0.3rem', color: '#0f172a', fontWeight: 600, fontSize: '0.9rem' }}>
                    {rel(summary.lastSuccessfulEventAt)}
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {/* ACTIVITY ─────────────────────────────────────────────── */}
        {activeTab === 'activity' && (
          <>
            <div style={S.card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '0.25rem' }}>
                <div>
                  <h3 style={S.sectionTitle}>Hourly Activity (last 24 h)</h3>
                  <p style={S.sectionSub}>Each bar is one hour. Green = success, amber = warning, red = failure.</p>
                </div>
                <div style={{ display: 'flex', gap: '1rem', fontSize: '0.8rem', color: '#64748b' }}>
                  <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, backgroundColor: '#22c55e', marginRight: 4 }} />Success</span>
                  <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, backgroundColor: '#f59e0b', marginRight: 4 }} />Warning</span>
                  <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, backgroundColor: '#ef4444', marginRight: 4 }} />Failure</span>
                </div>
              </div>
              <ActivityBarChart timeline={monitor?.graphs?.activityTimeline || []} />
            </div>

            <div style={S.card}>
              <h3 style={S.sectionTitle}>Top Failure Reasons</h3>
              <p style={S.sectionSub}>Repeated failures grouped by reason so the loudest problems are obvious first.</p>
              <FailureBar items={monitor?.graphs?.topFailureReasons || []} />
            </div>
          </>
        )}

        {/* HEALTH ───────────────────────────────────────────────── */}
        {activeTab === 'health' && (
          <div style={S.twoCol}>
            <div style={S.card}>
              <h3 style={S.sectionTitle}>Detected Flaws</h3>
              <p style={S.sectionSub}>Live health rules translated into specific actionable issues.</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {(summary.issues || []).length === 0 ? (
                  <div
                    style={{
                      backgroundColor: isAdminDarkTheme ? '#1b2620' : '#f0fdf4',
                      border: isAdminDarkTheme ? '1px solid #2f4a3d' : '1px solid #bbf7d0',
                      borderRadius: '10px',
                      padding: '0.9rem 1rem',
                      color: isAdminDarkTheme ? '#9fe0be' : '#166534',
                      fontSize: '0.9rem',
                    }}
                  >
                    No active flaws detected from the current monitoring rules.
                  </div>
                ) : (
                  summary.issues.map((issue) => (
                    <div
                      key={`${issue.title}-${issue.detail}`}
                      style={{
                        ...S.issueRow(issue.severity),
                        border: isAdminDarkTheme
                          ? `1px solid ${issue.severity === 'critical' ? '#6b2b33' : '#6b5530'}`
                          : S.issueRow(issue.severity).border,
                        backgroundColor: isAdminDarkTheme
                          ? issue.severity === 'critical'
                            ? '#2a1b1f'
                            : '#2b2415'
                          : S.issueRow(issue.severity).backgroundColor,
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'center' }}>
                        <strong style={{ color: isAdminDarkTheme ? '#ecf2fd' : '#0f172a', fontSize: '0.9rem' }}>{issue.title}</strong>
                        <span
                          style={{
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            textTransform: 'uppercase',
                            color: isAdminDarkTheme
                              ? issue.severity === 'critical'
                                ? '#f4a7b3'
                                : '#f0c884'
                              : issue.severity === 'critical'
                                ? '#b91c1c'
                                : '#b45309',
                            flexShrink: 0,
                          }}
                        >
                          {issue.severity}
                        </span>
                      </div>
                      <div style={{ marginTop: '0.3rem', color: isAdminDarkTheme ? '#bdc8da' : '#475569', lineHeight: 1.45, fontSize: '0.85rem' }}>{issue.detail}</div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div style={S.card}>
              <h3 style={S.sectionTitle}>Improvements Required</h3>
              <p style={S.sectionSub}>Recommended next steps derived from live failures, backlog, and health scores.</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                {(summary.recommendations || []).length === 0 ? (
                  <div style={{ color: isAdminDarkTheme ? '#93a0b5' : '#64748b', fontSize: '0.88rem' }}>No active recommendations at the moment.</div>
                ) : (
                  summary.recommendations.map((item) => (
                    <div
                      key={item}
                      style={{
                        borderRadius: '10px',
                        padding: '0.8rem 1rem',
                        backgroundColor: isAdminDarkTheme ? '#1a202d' : '#eff6ff',
                        border: isAdminDarkTheme ? '1px solid #31415f' : '1px solid #bfdbfe',
                        color: isAdminDarkTheme ? '#b6c8f1' : '#1e3a8a',
                        fontSize: '0.88rem',
                        lineHeight: 1.5,
                      }}
                    >
                      <i className="fas fa-lightbulb" style={{ marginRight: '0.5rem', opacity: 0.8 }} />
                      {item}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* QUEUE ────────────────────────────────────────────────── */}
        {activeTab === 'queue' && (
          <>
            <div style={S.tileGrid}>
              {[
                { label: 'Pending', value: queue.PENDING || 0, color: '#f59e0b' },
                { label: 'Processing', value: queue.PROCESSING || 0, color: '#2563eb' },
                { label: 'Completed', value: queue.COMPLETED || 0, color: '#22c55e' },
                { label: 'Failed', value: queue.FAILED || 0, color: '#dc2626' },
                { label: 'Emergency Pending', value: emergencySales.pending || 0, color: '#f59e0b' },
                { label: 'Emergency Synced', value: emergencySales.synced || 0, color: '#22c55e' },
                { label: 'Emergency Failed', value: emergencySales.failed || 0, color: '#dc2626' },
              ].map(({ label, value, color }) => (
                <div key={label} style={{ ...S.card, borderLeft: `4px solid ${color}` }}>
                  <div style={{ fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: '#64748b' }}>{label}</div>
                  <div style={{ marginTop: '0.3rem', fontSize: '1.5rem', fontWeight: 800, color: '#0f172a' }}>{value}</div>
                </div>
              ))}
            </div>

            <div style={S.card}>
              <h3 style={S.sectionTitle}>Recent Queue Commands</h3>
              <p style={S.sectionSub}>The latest write-back commands and their outcomes.</p>
              {(monitor?.recentCommands || []).length === 0 ? (
                <div style={{ color: '#94a3b8', fontSize: '0.88rem' }}>No recent queue commands.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                  {(monitor?.recentCommands || []).slice(0, 15).map((command) => {
                    const t = statusTone((command.status || '').toLowerCase());
                    return (
                      <div key={command.id} style={{ border: '1px solid #e2e8f0', borderRadius: '10px', padding: '0.75rem 1rem', display: 'flex', flexWrap: 'wrap', gap: '0.6rem', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '0.9rem' }}>{command.commandType}</div>
                          <div style={{ color: '#64748b', marginTop: '0.15rem', fontSize: '0.82rem' }}>
                            {command.relatedEntityType || 'Command'}{command.relatedEntityId ? ` · ${command.relatedEntityId}` : ''}
                          </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <span style={{ backgroundColor: t.bg, color: t.fg, padding: '0.2rem 0.55rem', borderRadius: '999px', fontWeight: 700, fontSize: '0.78rem' }}>{command.status}</span>
                          <div style={{ color: '#94a3b8', marginTop: '0.25rem', fontSize: '0.78rem' }}>{rel(command.createdAt)}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}

        {/* LIVE EVENTS ─────────────────────────────────────────── */}
        {activeTab === 'events' && (
          <div style={S.card}>
            <h3 style={S.sectionTitle}>Live Event Feed</h3>
            <p style={S.sectionSub}>Successful and failed sync activity with root-cause hints and suggested fixes. Updates in real time via socket.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {(monitor?.recentEvents || []).length === 0 ? (
                <div style={{ color: '#94a3b8', fontSize: '0.88rem' }}>No events recorded yet.</div>
              ) : (
                (monitor?.recentEvents || []).map((event) => {
                  const t = statusTone(event.status);
                  return (
                    <div key={event.id} style={S.eventRow}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'flex-start' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', alignItems: 'center' }}>
                            <strong style={{ color: '#0f172a', fontSize: '0.9rem' }}>{event.title}</strong>
                            <span style={{ backgroundColor: t.bg, color: t.fg, padding: '0.18rem 0.5rem', borderRadius: '999px', fontWeight: 700, fontSize: '0.75rem' }}>{event.status}</span>
                          </div>
                          <div style={{ marginTop: '0.3rem', color: '#475569', lineHeight: 1.45, fontSize: '0.85rem' }}>{event.message}</div>
                        </div>
                        <div style={{ textAlign: 'right', color: '#94a3b8', fontSize: '0.78rem', flexShrink: 0 }}>
                          <div>{event.source}</div>
                          <div>{rel(event.createdAt)}</div>
                        </div>
                      </div>

                      {(event.reason || event.suggestion) && (
                        <div style={{ marginTop: '0.65rem', display: 'grid', gap: '0.5rem' }}>
                          {event.reason && (
                            <div style={{ backgroundColor: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '8px', padding: '0.6rem 0.8rem', color: '#9a3412', fontSize: '0.85rem' }}>
                              <strong>Cause:</strong> {event.reason}
                            </div>
                          )}
                          {event.suggestion && (
                            <div style={{ backgroundColor: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', padding: '0.6rem 0.8rem', color: '#1d4ed8', fontSize: '0.85rem' }}>
                              <strong>Suggested fix:</strong> {event.suggestion}
                            </div>
                          )}
                        </div>
                      )}

                      <div style={{ marginTop: '0.5rem', color: '#94a3b8', fontSize: '0.78rem' }}>
                        {fmt(event.createdAt)}{event.durationMs ? ` · ${event.durationMs} ms` : ''}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}