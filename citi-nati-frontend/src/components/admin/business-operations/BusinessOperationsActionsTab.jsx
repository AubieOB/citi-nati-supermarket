import React, { useCallback, useMemo, useState } from 'react';
import api from '../../../utils/api.js';
import { boAlert } from '../../../utils/boDialogBus.js';

const baseCardStyle = {
  backgroundColor: '#fff',
  border: '1px solid #e2e8f0',
  borderRadius: '18px',
  boxShadow: '0 10px 24px rgba(15, 23, 42, 0.05)',
};

const subTabStyle = (active) => ({
  border: 'none',
  backgroundColor: active ? '#0f172a' : '#e2e8f0',
  color: active ? '#fff' : '#334155',
  borderRadius: '999px',
  padding: '0.65rem 0.95rem',
  fontSize: '0.88rem',
  fontWeight: 700,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.45rem',
});

const BusinessOperationsActionsTab = () => {
  const isAdminDarkTheme = typeof document !== 'undefined' && document.body.classList.contains('admin-theme-dark');
  const [activeSubtab, setActiveSubtab] = useState('create');
  const [isWipeModalOpen, setIsWipeModalOpen] = useState(false);
  const [wipeSecurityKey, setWipeSecurityKey] = useState('');
  const [wipingData, setWipingData] = useState(false);

  const canConfirmWipe = useMemo(() => Boolean(String(wipeSecurityKey || '').trim()) && !wipingData, [wipeSecurityKey, wipingData]);

  const closeWipeModal = useCallback(() => {
    if (wipingData) return;
    setIsWipeModalOpen(false);
    setWipeSecurityKey('');
  }, [wipingData]);

  const handleWipeAllBoData = useCallback(async () => {
    const keyValue = String(wipeSecurityKey || '').trim();
    if (!keyValue) {
      await boAlert({
        title: 'Security Key Required',
        message: 'Enter admin security key before wiping data.',
        type: 'warning',
      });
      return;
    }

    setWipingData(true);
    try {
      const response = await api.post('/business-operations/admin/wipe-all-data', {
        securityKey: keyValue,
      });

      const deletedCounts = response?.data?.result?.deletedCounts || {};
      const deletedTotal = Object.values(deletedCounts).reduce((sum, value) => sum + Number(value || 0), 0);

      await boAlert({
        title: 'Wipe Completed',
        message: `Business Operations wipe completed. Deleted rows: ${deletedTotal}. Sales report sync data was preserved.`,
        type: 'success',
      });
      setIsWipeModalOpen(false);
      setWipeSecurityKey('');
    } catch (error) {
      const message = error?.response?.data?.message || error?.response?.data?.error || error?.message || 'Failed to wipe Business Operations data.';
      await boAlert({ title: 'Wipe Failed', message, type: 'error' });
    } finally {
      setWipingData(false);
    }
  }, [wipeSecurityKey]);

  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      <div style={{ display: 'flex', gap: '0.55rem', overflowX: 'auto' }}>
        <button type="button" onClick={() => setActiveSubtab('create')} style={subTabStyle(activeSubtab === 'create')}>
          <i className="fas fa-plus-circle"></i>
          Destructive Actions
        </button>
      </div>

      {activeSubtab === 'create' && (
        <div style={{ ...baseCardStyle, borderColor: isAdminDarkTheme ? '#5b2f36' : '#fecaca', backgroundColor: isAdminDarkTheme ? '#23171b' : '#fff7f7' }}>
          <div style={{ padding: '1rem 1.1rem', display: 'grid', gap: '0.75rem' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', color: isAdminDarkTheme ? '#ff8d99' : '#b91c1c', fontWeight: 900, textTransform: 'uppercase', fontSize: '0.78rem', letterSpacing: '0.05em' }}>
              <i className="fas fa-triangle-exclamation"></i>
              Danger Zone
            </div>
            <div style={{ color: isAdminDarkTheme ? '#f1b4bb' : '#7f1d1d', fontSize: '0.9rem', lineHeight: 1.5 }}>
              This permanently wipes Business Operations data: Suppliers, Expenses, Employees, Payroll, and related records.
            </div>
            <div style={{ color: isAdminDarkTheme ? '#ff9faa' : '#991b1b', fontSize: '0.84rem', lineHeight: 1.45, fontWeight: 700 }}>
              Sales Reports data synced from POS is NOT deleted.
            </div>
            <button
              type="button"
              onClick={() => setIsWipeModalOpen(true)}
              disabled={wipingData}
              style={{ justifySelf: 'start', border: '1px solid #dc2626', backgroundColor: '#dc2626', color: '#fff', borderRadius: '10px', padding: '0.62rem 0.95rem', fontWeight: 900, cursor: wipingData ? 'not-allowed' : 'pointer' }}
            >
              <i className={`fas ${wipingData ? 'fa-spinner fa-spin' : 'fa-trash-can'}`} style={{ marginRight: '0.42rem' }}></i>
              Wipe All BO Data
            </button>
          </div>
        </div>
      )}

      {isWipeModalOpen && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.55)', zIndex: 260, display: 'grid', placeItems: 'center', padding: '1rem' }}>
          <div style={{ ...baseCardStyle, width: 'min(540px, 96vw)', border: isAdminDarkTheme ? '1px solid #5b2f36' : '1px solid #fecaca', backgroundColor: isAdminDarkTheme ? '#1b1720' : '#fff' }}>
            <div style={{ padding: '1rem 1rem 0.85rem', borderBottom: isAdminDarkTheme ? '1px solid #5b2f36' : '1px solid #fee2e2', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{ color: isAdminDarkTheme ? '#ff9faa' : '#991b1b', fontWeight: 900, fontSize: '1.03rem' }}>
                <i className="fas fa-triangle-exclamation" style={{ marginRight: '0.45rem' }}></i>
                Confirm Destructive Wipe
              </div>
              <button type="button" onClick={closeWipeModal} style={{ border: isAdminDarkTheme ? '1px solid #5b2f36' : '1px solid #fecaca', backgroundColor: isAdminDarkTheme ? '#221820' : '#fff', color: isAdminDarkTheme ? '#ff9faa' : '#991b1b', borderRadius: '8px', cursor: wipingData ? 'not-allowed' : 'pointer', padding: '0.34rem 0.5rem' }}>
                <i className="fas fa-times"></i>
              </button>
            </div>
            <div style={{ padding: '1rem', display: 'grid', gap: '0.8rem' }}>
              <div style={{ color: isAdminDarkTheme ? '#f1b4bb' : '#7f1d1d', fontSize: '0.9rem', lineHeight: 1.45 }}>
                This action cannot be undone. To continue, manually type your Admin Security Key.
              </div>
              <label style={{ display: 'grid', gap: '0.4rem' }}>
                <span style={{ color: isAdminDarkTheme ? '#f1b4bb' : '#7f1d1d', fontSize: '0.84rem', fontWeight: 800 }}>Admin Security Key</span>
                <input
                  type="password"
                  value={wipeSecurityKey}
                  onChange={(event) => setWipeSecurityKey(event.target.value)}
                  placeholder="Enter admin security key"
                  autoFocus
                  style={{ border: isAdminDarkTheme ? '1px solid #5b2f36' : '1px solid #fca5a5', borderRadius: '10px', padding: '0.62rem 0.7rem', fontSize: '0.92rem', backgroundColor: isAdminDarkTheme ? '#221820' : '#fff', color: isAdminDarkTheme ? '#fce7ea' : '#0f172a' }}
                />
              </label>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.55rem' }}>
                <button
                  type="button"
                  onClick={closeWipeModal}
                  disabled={wipingData}
                  style={{ border: isAdminDarkTheme ? '1px solid #333333' : '1px solid #cbd5e1', backgroundColor: isAdminDarkTheme ? '#1e1e1e' : '#fff', color: isAdminDarkTheme ? '#b2c3d9' : '#334155', borderRadius: '9px', padding: '0.55rem 0.85rem', fontWeight: 700, cursor: wipingData ? 'not-allowed' : 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleWipeAllBoData}
                  disabled={!canConfirmWipe}
                  style={{ border: '1px solid #dc2626', backgroundColor: '#dc2626', color: '#fff', borderRadius: '9px', padding: '0.55rem 0.85rem', fontWeight: 900, cursor: canConfirmWipe ? 'pointer' : 'not-allowed' }}
                >
                  <i className={`fas ${wipingData ? 'fa-spinner fa-spin' : 'fa-trash-can'}`} style={{ marginRight: '0.42rem' }}></i>
                  Confirm Wipe
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BusinessOperationsActionsTab;
