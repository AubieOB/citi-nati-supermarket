/**
 * 🔄 POS Sync Button Component
 * 
 * Admin component to manually trigger POS product synchronization.
 * Shows sync status, last sync time, and error messages.
 * 
 * Usage:
 *   import POSSyncButton from './POSSyncButton.jsx';
 *   <POSSyncButton />
 */

import React, { useState, useEffect } from 'react';
import api from '../../../utils/api.js';
import toast from 'react-hot-toast';

export default function POSSyncButton() {
  const [loading, setLoading] = useState(false);
  const [lastSync, setLastSync] = useState(null);
  const [syncStats, setSyncStats] = useState(null);
  const [showDetails, setShowDetails] = useState(false);

  // Load last sync time from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('pos_last_sync');
    if (saved) {
      setLastSync(new Date(saved));
    }
  }, []);

  /**
   * Handle manual sync from POS
   */
  const handleSync = async () => {
    try {
      setLoading(true);
      console.log('[POS Sync Admin] Starting product sync from POS agent...');

      const response = await api.post('/products/sync/pos');

      if (response.data.success) {
        const stats = {
          synced: response.data.synced,
          skipped: response.data.skipped,
          total: response.data.total,
          errors: response.data.errors,
        };

        setSyncStats(stats);
        setLastSync(new Date());
        localStorage.setItem('pos_last_sync', new Date().toISOString());

        // Show success toast
        const message = `✅ Synced: ${stats.synced}, Skipped: ${stats.skipped}`;
        toast.success(message);

        // Log details
        console.log('[POS Sync Admin] Sync completed:', stats);

        if (stats.errors && stats.errors.length > 0) {
          console.warn('[POS Sync Admin] Errors during sync:', stats.errors);
          setShowDetails(true);
        }
      } else {
        throw new Error(response.data.error || 'Sync failed');
      }
    } catch (error) {
      console.error('[POS Sync Admin] Sync failed:', error);

      let errorMessage = 'Click to see details';

      if (error.response?.data?.error) {
        errorMessage = error.response.data.error;
      } else if (error.message.includes('offline')) {
        errorMessage = 'POS Agent offline - is it running on Windows?';
      } else if (error.message.includes('Unauthorized')) {
        errorMessage = 'Invalid POS authentication key';
      }

      toast.error(`❌ ${errorMessage}`);
      setSyncStats({
        error: errorMessage,
        details: error.message,
      });
      setShowDetails(true);
    } finally {
      setLoading(false);
    }
  };

  // Format time display
  const formatTime = (date) => {
    if (!date) return 'Never';
    const now = new Date();
    const diffMs = now - new Date(date);
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString();
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h3 style={styles.title}>🔄 POS Product Sync</h3>
        <p style={styles.subtitle}>Synchronize products from POS SQL Server database</p>
      </div>

      {/* Last Sync Info */}
      <div style={styles.syncInfo}>
        <div style={styles.infoItem}>
          <span style={styles.label}>Last Sync:</span>
          <span style={styles.value}>{formatTime(lastSync)}</span>
        </div>

        {syncStats && !syncStats.error && (
          <>
            <div style={styles.infoItem}>
              <span style={styles.label}>Synced:</span>
              <span style={{ ...styles.value, color: '#28a745' }}>
                {syncStats.synced} products
              </span>
            </div>
            {syncStats.skipped > 0 && (
              <div style={styles.infoItem}>
                <span style={styles.label}>Skipped:</span>
                <span style={{ ...styles.value, color: '#ffc107' }}>
                  {syncStats.skipped} products
                </span>
              </div>
            )}
          </>
        )}
      </div>

      {/* Sync Button */}
      <button
        onClick={handleSync}
        disabled={loading}
        style={{
          ...styles.syncButton,
          opacity: loading ? 0.6 : 1,
          cursor: loading ? 'not-allowed' : 'pointer',
        }}
      >
        {loading ? (
          <>
            <span style={styles.spinner}>⏳</span> Syncing... ({syncStats?.total || 0})
          </>
        ) : (
          <>
            <span>🔄</span> Sync Now
          </>
        )}
      </button>

      {/* Expand Details */}
      {(syncStats || lastSync) && (
        <button
          onClick={() => setShowDetails(!showDetails)}
          style={styles.detailsToggle}
        >
          {showDetails ? '▼ Hide Details' : '▶ Show Details'}
        </button>
      )}

      {/* Details Panel */}
      {showDetails && syncStats && (
        <div style={styles.detailsPanel}>
          <h4>Sync Details</h4>

          {syncStats.error ? (
            <>
              <div style={styles.errorBox}>
                <strong>Error:</strong>
                <p>{syncStats.error}</p>
                {syncStats.details && (
                  <p style={{ fontSize: '12px', color: '#666' }}>
                    {syncStats.details}
                  </p>
                )}
              </div>
            </>
          ) : (
            <>
              <div style={styles.statRow}>
                <span>Total Received:</span>
                <strong>{syncStats.total}</strong>
              </div>
              <div style={styles.statRow}>
                <span>Successfully Synced:</span>
                <strong style={{ color: '#28a745' }}>{syncStats.synced}</strong>
              </div>
              {syncStats.skipped > 0 && (
                <div style={styles.statRow}>
                  <span>Skipped/Errors:</span>
                  <strong style={{ color: '#dc3545' }}>{syncStats.skipped}</strong>
                </div>
              )}

              {syncStats.errors && syncStats.errors.length > 0 && (
                <div style={styles.errorsList}>
                  <h5>Errors:</h5>
                  <ul>
                    {syncStats.errors.slice(0, 5).map((err, idx) => (
                      <li key={idx} style={{ fontSize: '12px', marginBottom: '8px' }}>
                        <strong>{err.code}:</strong> {err.error}
                      </li>
                    ))}
                    {syncStats.errors.length > 5 && (
                      <li style={{ fontSize: '12px', color: '#666' }}>
                        ... and {syncStats.errors.length - 5} more
                      </li>
                    )}
                  </ul>
                </div>
              )}
            </>
          )}

          {lastSync && (
            <div style={styles.timestamp}>
              <small>Completed: {lastSync.toLocaleString()}</small>
            </div>
          )}
        </div>
      )}

      {/* Help Text */}
      <div style={styles.helpBox}>
        <strong>ℹ️ How it works:</strong>
        <ul>
          <li>Connects to local POS Sync Agent (port 3001)</li>
          <li>Fetches products from SQL Server POS database</li>
          <li>Syncs to application database</li>
          <li>Products updated with real prices & stock</li>
        </ul>

        <strong>Troubleshooting:</strong>
        <ul>
          <li>
            Is POS Agent running?{' '}
            <code style={styles.inlineCode}>
              npm start
            </code>{' '}
            from pos-sync-agent folder
          </li>
          <li>
            Check credentials in{' '}
            <code style={styles.inlineCode}>.env</code> file
          </li>
          <li>Verify SQL Server is accessible from your network</li>
        </ul>
      </div>
    </div>
  );
}

const styles = {
  container: {
    backgroundColor: '#ffffff',
    border: '1px solid #e0e0e0',
    borderRadius: '8px',
    padding: '20px',
    marginBottom: '20px',
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
  },
  header: {
    marginBottom: '16px',
  },
  title: {
    margin: '0 0 8px 0',
    fontSize: '18px',
    fontWeight: 'bold',
    color: '#333',
  },
  subtitle: {
    margin: 0,
    fontSize: '14px',
    color: '#666',
  },
  syncInfo: {
    backgroundColor: '#f9f9f9',
    border: '1px solid #e9e9e9',
    borderRadius: '6px',
    padding: '12px',
    marginBottom: '16px',
  },
  infoItem: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '6px 0',
    fontSize: '14px',
  },
  label: {
    color: '#666',
    fontWeight: '500',
  },
  value: {
    color: '#333',
    fontWeight: 'bold',
  },
  syncButton: {
    width: '100%',
    padding: '12px',
    backgroundColor: '#007bff',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    fontSize: '16px',
    fontWeight: 'bold',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    transition: 'background-color 0.2s',
  },
  spinner: {
    display: 'inline-block',
    animation: 'spin 1s linear infinite',
  },
  detailsToggle: {
    width: '100%',
    padding: '8px',
    marginTop: '8px',
    backgroundColor: '#f5f5f5',
    color: '#333',
    border: '1px solid #ddd',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: '500',
  },
  detailsPanel: {
    backgroundColor: '#f9f9f9',
    border: '1px solid #e9e9e9',
    borderRadius: '6px',
    padding: '12px',
    marginTop: '12px',
    fontSize: '14px',
  },
  statRow: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '6px 0',
    borderBottom: '1px solid #e0e0e0',
  },
  errorBox: {
    backgroundColor: '#fff5f5',
    border: '1px solid #ffdddd',
    borderRadius: '4px',
    padding: '12px',
    marginBottom: '12px',
    color: '#cc0000',
  },
  errorsList: {
    backgroundColor: '#ffe6e6',
    borderRadius: '4px',
    padding: '10px',
    marginTop: '10px',
  },
  timestamp: {
    marginTop: '10px',
    paddingTop: '10px',
    borderTop: '1px solid #e0e0e0',
    color: '#999',
    fontSize: '12px',
  },
  helpBox: {
    backgroundColor: '#e7f3ff',
    border: '1px solid #b3d9ff',
    borderRadius: '6px',
    padding: '12px',
    marginTop: '16px',
    fontSize: '13px',
    color: '#004085',
  },
  inlineCode: {
    backgroundColor: '#f4f4f4',
    padding: '2px 4px',
    borderRadius: '3px',
    fontFamily: 'monospace',
    fontSize: '12px',
  },
};
