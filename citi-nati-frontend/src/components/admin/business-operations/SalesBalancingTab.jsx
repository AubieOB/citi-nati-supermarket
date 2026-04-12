import React, { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../../../utils/api.js';
import { boAlert, boConfirm } from '../../../utils/boDialogBus.js';
import { exportSalesBalancingReportPdf } from '../../../utils/salesBalancingPdfExport.js';

const cardStyle = {
  backgroundColor: '#fff',
  border: '1px solid #e2e8f0',
  borderRadius: '18px',
  boxShadow: '0 10px 24px rgba(15, 23, 42, 0.05)',
};

const MONEY = (value) => `MWK ${Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const PAYMENT_FIELDS = [
  { key: 'cashAmount', label: 'Cash' },
  { key: 'airtelMoneyAmount', label: 'Airtel Money' },
  { key: 'tnmMpambaAmount', label: 'TNM Mpamba' },
  { key: 'posCardAmount', label: 'POS / Card Machine' },
  { key: 'bankTransferAmount', label: 'M0626 / National Bank / Bank Transfer' },
  { key: 'otherAmount', label: 'Other' },
];

const defaultForm = () => ({
  id: null,
  balancingDate: new Date().toISOString().slice(0, 10),
  referenceTitle: '',
  cashierReference: '',
  shiftReference: '',
  preparedBy: '',
  notes: '',
  expectedSystemSales: 0,
  cashAmount: 0,
  airtelMoneyAmount: 0,
  tnmMpambaAmount: 0,
  posCardAmount: 0,
  bankTransferAmount: 0,
  otherAmount: 0,
  status: 'draft',
});

const statusBadgeStyle = (resultStatus) => {
  if (resultStatus === 'shortage') {
    return { backgroundColor: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca' };
  }
  if (resultStatus === 'overage') {
    return { backgroundColor: '#fff7ed', color: '#c2410c', border: '1px solid #fed7aa' };
  }
  return { backgroundColor: '#dcfce7', color: '#166534', border: '1px solid #bbf7d0' };
};

function normalizeAmount(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Number(parsed.toFixed(2));
}

const SalesBalancingTab = ({ selectedLocationId = null, selectedLocationCode = '', selectedLocationName = '' }) => {
  const [form, setForm] = useState(defaultForm);
  const [loadingExpected, setLoadingExpected] = useState(false);
  const [saving, setSaving] = useState(false);
  const [historyState, setHistoryState] = useState({ data: [], pagination: null, loading: false, error: '' });
  const [historyFilter, setHistoryFilter] = useState({ status: 'all', page: 1 });

  const hasLocationScope = Boolean(selectedLocationId);

  const totalActualAmount = useMemo(() => PAYMENT_FIELDS.reduce((sum, field) => sum + normalizeAmount(form[field.key]), 0), [form]);
  const differenceAmount = useMemo(() => Number((totalActualAmount - normalizeAmount(form.expectedSystemSales)).toFixed(2)), [form.expectedSystemSales, totalActualAmount]);
  const resultStatus = useMemo(() => {
    if (Math.abs(differenceAmount) < 0.005) return 'balanced';
    if (differenceAmount < 0) return 'shortage';
    return 'overage';
  }, [differenceAmount]);

  const loadExpectedSales = useCallback(async () => {
    if (!hasLocationScope) return;

    setLoadingExpected(true);
    try {
      const response = await api.get('/business-operations/sales-balancing/expected', {
        params: {
          locationId: selectedLocationId,
          balancingDate: form.balancingDate,
        },
      });
      const expected = Number(response?.data?.data?.expectedSystemSales || 0);
      setForm((prev) => ({ ...prev, expectedSystemSales: expected }));
    } catch (error) {
      await boAlert({
        title: 'Expected Sales Error',
        message: error?.response?.data?.error || 'Failed to load expected system sales for this date and branch.',
        type: 'warning',
      });
    } finally {
      setLoadingExpected(false);
    }
  }, [form.balancingDate, hasLocationScope, selectedLocationId]);

  const loadHistory = useCallback(async () => {
    if (!hasLocationScope) {
      setHistoryState({ data: [], pagination: null, loading: false, error: '' });
      return;
    }

    setHistoryState((prev) => ({ ...prev, loading: true, error: '' }));
    try {
      const response = await api.get('/business-operations/sales-balancing', {
        params: {
          locationId: selectedLocationId,
          status: historyFilter.status !== 'all' ? historyFilter.status : undefined,
          page: historyFilter.page,
          pageSize: 12,
          sortBy: 'balancingDate',
          sortOrder: 'desc',
        },
      });

      setHistoryState({
        data: Array.isArray(response?.data?.data) ? response.data.data : [],
        pagination: response?.data?.pagination || null,
        loading: false,
        error: '',
      });
    } catch (error) {
      setHistoryState({
        data: [],
        pagination: null,
        loading: false,
        error: error?.response?.data?.error || 'Failed to load balancing history.',
      });
    }
  }, [hasLocationScope, historyFilter.page, historyFilter.status, selectedLocationId]);

  useEffect(() => {
    if (!hasLocationScope) return;
    loadExpectedSales();
  }, [hasLocationScope, loadExpectedSales]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const setAmount = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value === '' ? '' : normalizeAmount(value) }));
  };

  const resetForm = () => {
    setForm(defaultForm());
    setTimeout(() => {
      loadExpectedSales();
    }, 0);
  };

  const saveRecord = async ({ finalize = false } = {}) => {
    if (!hasLocationScope) {
      await boAlert({ title: 'Location Required', message: 'Select one branch/location before saving balancing.', type: 'warning' });
      return;
    }

    if (!form.balancingDate) {
      await boAlert({ title: 'Date Required', message: 'Balancing date is required.', type: 'warning' });
      return;
    }

    if (finalize) {
      const confirmed = await boConfirm({
        title: 'Finalize Balancing',
        message: 'Finalize this balancing record? This should only be done after verification.',
        confirmText: 'Finalize',
      });
      if (!confirmed) return;
    }

    const payload = {
      balancingDate: form.balancingDate,
      locationId: selectedLocationId,
      locationCode: selectedLocationCode || null,
      locationName: selectedLocationName || null,
      referenceTitle: form.referenceTitle,
      cashierReference: form.cashierReference,
      shiftReference: form.shiftReference,
      preparedBy: form.preparedBy,
      notes: form.notes,
      expectedSystemSales: normalizeAmount(form.expectedSystemSales),
      cashAmount: normalizeAmount(form.cashAmount),
      airtelMoneyAmount: normalizeAmount(form.airtelMoneyAmount),
      tnmMpambaAmount: normalizeAmount(form.tnmMpambaAmount),
      posCardAmount: normalizeAmount(form.posCardAmount),
      bankTransferAmount: normalizeAmount(form.bankTransferAmount),
      otherAmount: normalizeAmount(form.otherAmount),
      status: finalize ? 'finalized' : 'draft',
    };

    setSaving(true);
    try {
      const response = form.id
        ? await api.put(`/business-operations/sales-balancing/${form.id}`, payload)
        : await api.post('/business-operations/sales-balancing', payload);

      const saved = response?.data?.data;
      if (saved) {
        setForm({
          id: saved.id,
          balancingDate: saved.balancingDate ? new Date(saved.balancingDate).toISOString().slice(0, 10) : form.balancingDate,
          referenceTitle: saved.referenceTitle || '',
          cashierReference: saved.cashierReference || '',
          shiftReference: saved.shiftReference || '',
          preparedBy: saved.preparedBy || '',
          notes: saved.notes || '',
          expectedSystemSales: normalizeAmount(saved.expectedSystemSales),
          cashAmount: normalizeAmount(saved.cashAmount),
          airtelMoneyAmount: normalizeAmount(saved.airtelMoneyAmount),
          tnmMpambaAmount: normalizeAmount(saved.tnmMpambaAmount),
          posCardAmount: normalizeAmount(saved.posCardAmount),
          bankTransferAmount: normalizeAmount(saved.bankTransferAmount),
          otherAmount: normalizeAmount(saved.otherAmount),
          status: saved.status || (finalize ? 'finalized' : 'draft'),
        });
      }

      await boAlert({
        title: finalize ? 'Balancing Finalized' : 'Draft Saved',
        message: finalize ? 'Sales balancing has been finalized successfully.' : 'Sales balancing draft saved successfully.',
        type: 'success',
      });

      loadHistory();
    } catch (error) {
      await boAlert({
        title: 'Save Failed',
        message: error?.response?.data?.error || 'Failed to save sales balancing record.',
        type: 'warning',
      });
    } finally {
      setSaving(false);
    }
  };

  const loadRecordToForm = (record) => {
    if (!record) return;
    setForm({
      id: record.id,
      balancingDate: record.balancingDate ? new Date(record.balancingDate).toISOString().slice(0, 10) : defaultForm().balancingDate,
      referenceTitle: record.referenceTitle || '',
      cashierReference: record.cashierReference || '',
      shiftReference: record.shiftReference || '',
      preparedBy: record.preparedBy || '',
      notes: record.notes || '',
      expectedSystemSales: normalizeAmount(record.expectedSystemSales),
      cashAmount: normalizeAmount(record.cashAmount),
      airtelMoneyAmount: normalizeAmount(record.airtelMoneyAmount),
      tnmMpambaAmount: normalizeAmount(record.tnmMpambaAmount),
      posCardAmount: normalizeAmount(record.posCardAmount),
      bankTransferAmount: normalizeAmount(record.bankTransferAmount),
      otherAmount: normalizeAmount(record.otherAmount),
      status: record.status || 'draft',
    });
  };

  const finalizeFromHistory = async (record) => {
    const confirmed = await boConfirm({
      title: 'Finalize Balancing',
      message: `Finalize balancing record for ${new Date(record.balancingDate).toLocaleDateString('en-GB')}?`,
      confirmText: 'Finalize',
    });
    if (!confirmed) return;

    try {
      await api.post(`/business-operations/sales-balancing/${record.id}/finalize`, {});
      await boAlert({ title: 'Finalized', message: 'Balancing record finalized.', type: 'success' });
      loadHistory();
      if (form.id === record.id) {
        setForm((prev) => ({ ...prev, status: 'finalized' }));
      }
    } catch (error) {
      await boAlert({ title: 'Finalize Failed', message: error?.response?.data?.error || 'Failed to finalize record.', type: 'warning' });
    }
  };

  const currentExportRecord = {
    ...form,
    locationCode: selectedLocationCode,
    locationName: selectedLocationName,
    totalActualAmount,
    differenceAmount,
    resultStatus,
  };

  if (!hasLocationScope) {
    return (
      <div style={{ ...cardStyle, padding: '1.2rem 1.3rem' }}>
        <h3 style={{ margin: 0, color: '#0f172a', fontSize: '1.15rem' }}>Sales Balancing</h3>
        <p style={{ margin: '0.55rem 0 0', color: '#64748b', lineHeight: 1.65 }}>
          Sales balancing is strictly branch-based. Select one specific location from Location Scope (not All Locations) to continue.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      <div style={{ ...cardStyle, padding: '1rem 1.1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.9rem', flexWrap: 'wrap' }}>
          <div>
            <h3 style={{ margin: 0, color: '#0f172a', fontSize: '1.15rem' }}>Sales Balancing</h3>
            <p style={{ margin: '0.35rem 0 0', color: '#64748b', fontSize: '0.9rem' }}>
              Daily end-of-day branch reconciliation for actual payment takings vs expected system sales.
            </p>
            <p style={{ margin: '0.25rem 0 0', color: '#334155', fontSize: '0.82rem', fontWeight: 700 }}>
              Active Branch: {selectedLocationName || selectedLocationCode || `ID ${selectedLocationId}`}
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <button
              type="button"
              onClick={loadExpectedSales}
              disabled={loadingExpected || saving}
              style={{ border: '1px solid #cbd5e1', backgroundColor: '#fff', color: '#0f172a', borderRadius: '10px', padding: '0.56rem 0.86rem', fontWeight: 700, cursor: loadingExpected || saving ? 'not-allowed' : 'pointer' }}
            >
              <i className={`fas ${loadingExpected ? 'fa-spinner fa-spin' : 'fa-rotate-right'}`} style={{ marginRight: '0.4rem' }}></i>
              Load Expected Sales
            </button>
            <button
              type="button"
              onClick={() => exportSalesBalancingReportPdf({ record: currentExportRecord })}
              style={{ border: '1px solid #cbd5e1', backgroundColor: '#fff', color: '#0f172a', borderRadius: '10px', padding: '0.56rem 0.86rem', fontWeight: 700, cursor: 'pointer' }}
            >
              <i className="fas fa-file-pdf" style={{ marginRight: '0.4rem' }}></i>
              Export PDF
            </button>
          </div>
        </div>
      </div>

      <div style={{ ...cardStyle, padding: '1rem 1.1rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem' }}>
          <label style={{ display: 'grid', gap: '0.3rem' }}>
            <span style={{ color: '#334155', fontWeight: 700, fontSize: '0.82rem' }}>Balancing Date</span>
            <input type="date" value={form.balancingDate} onChange={(event) => setForm((prev) => ({ ...prev, balancingDate: event.target.value }))} style={{ border: '1px solid #cbd5e1', borderRadius: '10px', padding: '0.62rem 0.72rem' }} />
          </label>
          <label style={{ display: 'grid', gap: '0.3rem' }}>
            <span style={{ color: '#334155', fontWeight: 700, fontSize: '0.82rem' }}>Reference / Title</span>
            <input value={form.referenceTitle} onChange={(event) => setForm((prev) => ({ ...prev, referenceTitle: event.target.value }))} placeholder="EOD Reconciliation" style={{ border: '1px solid #cbd5e1', borderRadius: '10px', padding: '0.62rem 0.72rem' }} />
          </label>
          <label style={{ display: 'grid', gap: '0.3rem' }}>
            <span style={{ color: '#334155', fontWeight: 700, fontSize: '0.82rem' }}>Prepared By</span>
            <input value={form.preparedBy} onChange={(event) => setForm((prev) => ({ ...prev, preparedBy: event.target.value }))} placeholder="Operator name" style={{ border: '1px solid #cbd5e1', borderRadius: '10px', padding: '0.62rem 0.72rem' }} />
          </label>
          <label style={{ display: 'grid', gap: '0.3rem' }}>
            <span style={{ color: '#334155', fontWeight: 700, fontSize: '0.82rem' }}>Cashier / Session Ref</span>
            <input value={form.cashierReference} onChange={(event) => setForm((prev) => ({ ...prev, cashierReference: event.target.value }))} placeholder="Cashier, shift, till" style={{ border: '1px solid #cbd5e1', borderRadius: '10px', padding: '0.62rem 0.72rem' }} />
          </label>
        </div>
      </div>

      <div style={{ ...cardStyle, padding: '1rem 1.1rem' }}>
        <strong style={{ color: '#0f172a' }}>Payment Method Totals</strong>
        <div style={{ marginTop: '0.75rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem' }}>
          {PAYMENT_FIELDS.map((field) => (
            <label key={field.key} style={{ display: 'grid', gap: '0.3rem' }}>
              <span style={{ color: '#334155', fontWeight: 700, fontSize: '0.82rem' }}>{field.label}</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form[field.key]}
                onChange={(event) => setAmount(field.key, event.target.value)}
                style={{ border: '1px solid #cbd5e1', borderRadius: '10px', padding: '0.62rem 0.72rem' }}
              />
            </label>
          ))}
        </div>
      </div>

      <div style={{ ...cardStyle, padding: '1rem 1.1rem' }}>
        <strong style={{ color: '#0f172a' }}>Auto Summary</strong>
        <div style={{ marginTop: '0.75rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem' }}>
          <div style={{ border: '1px solid #e2e8f0', borderRadius: '12px', padding: '0.8rem' }}>
            <div style={{ color: '#64748b', fontSize: '0.78rem', textTransform: 'uppercase', fontWeight: 800 }}>Expected System Sales</div>
            <div style={{ marginTop: '0.36rem', fontWeight: 800, color: '#0f172a', fontSize: '1.04rem' }}>{MONEY(form.expectedSystemSales)}</div>
          </div>
          <div style={{ border: '1px solid #e2e8f0', borderRadius: '12px', padding: '0.8rem' }}>
            <div style={{ color: '#64748b', fontSize: '0.78rem', textTransform: 'uppercase', fontWeight: 800 }}>Total Actual Entered</div>
            <div style={{ marginTop: '0.36rem', fontWeight: 800, color: '#0f172a', fontSize: '1.04rem' }}>{MONEY(totalActualAmount)}</div>
          </div>
          <div style={{ border: '1px solid #e2e8f0', borderRadius: '12px', padding: '0.8rem' }}>
            <div style={{ color: '#64748b', fontSize: '0.78rem', textTransform: 'uppercase', fontWeight: 800 }}>Difference</div>
            <div style={{ marginTop: '0.36rem', fontWeight: 800, color: resultStatus === 'balanced' ? '#166534' : resultStatus === 'shortage' ? '#b91c1c' : '#c2410c', fontSize: '1.04rem' }}>{MONEY(differenceAmount)}</div>
          </div>
          <div style={{ border: '1px solid #e2e8f0', borderRadius: '12px', padding: '0.8rem' }}>
            <div style={{ color: '#64748b', fontSize: '0.78rem', textTransform: 'uppercase', fontWeight: 800 }}>Result</div>
            <span style={{ marginTop: '0.45rem', display: 'inline-flex', borderRadius: '999px', padding: '0.3rem 0.7rem', fontWeight: 800, fontSize: '0.82rem', ...statusBadgeStyle(resultStatus) }}>
              {resultStatus === 'balanced' ? 'Balanced' : resultStatus === 'shortage' ? 'Shortage' : 'Overage'}
            </span>
          </div>
        </div>
      </div>

      <div style={{ ...cardStyle, padding: '1rem 1.1rem' }}>
        <label style={{ display: 'grid', gap: '0.38rem' }}>
          <span style={{ color: '#334155', fontWeight: 700, fontSize: '0.84rem' }}>Notes / Comments</span>
          <textarea
            value={form.notes}
            onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))}
            rows={4}
            placeholder="Cash rechecked, delayed mobile money confirmation, missing slip, float adjustment..."
            style={{ border: '1px solid #cbd5e1', borderRadius: '12px', padding: '0.7rem 0.75rem', resize: 'vertical' }}
          />
        </label>

        <div style={{ marginTop: '0.85rem', display: 'flex', gap: '0.52rem', flexWrap: 'wrap' }}>
          <button type="button" onClick={() => saveRecord({ finalize: false })} disabled={saving || form.status === 'finalized'} style={{ border: '1px solid #cbd5e1', backgroundColor: '#fff', color: '#0f172a', borderRadius: '10px', padding: '0.58rem 0.9rem', fontWeight: 700, cursor: saving || form.status === 'finalized' ? 'not-allowed' : 'pointer' }}>
            <i className={`fas ${saving ? 'fa-spinner fa-spin' : 'fa-floppy-disk'}`} style={{ marginRight: '0.4rem' }}></i>
            Save Draft
          </button>
          <button type="button" onClick={() => saveRecord({ finalize: true })} disabled={saving || form.status === 'finalized'} style={{ border: '1px solid #86efac', backgroundColor: '#f0fdf4', color: '#166534', borderRadius: '10px', padding: '0.58rem 0.9rem', fontWeight: 800, cursor: saving || form.status === 'finalized' ? 'not-allowed' : 'pointer' }}>
            <i className="fas fa-check-circle" style={{ marginRight: '0.4rem' }}></i>
            Finalize / Save Balancing
          </button>
          <button type="button" onClick={resetForm} style={{ border: '1px solid #cbd5e1', backgroundColor: '#fff', color: '#475569', borderRadius: '10px', padding: '0.58rem 0.9rem', fontWeight: 700, cursor: 'pointer' }}>
            <i className="fas fa-eraser" style={{ marginRight: '0.4rem' }}></i>
            New Record
          </button>
        </div>
      </div>

      <div style={{ ...cardStyle, padding: '1rem 1.1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <strong style={{ color: '#0f172a' }}>Balancing History</strong>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <select
              value={historyFilter.status}
              onChange={(event) => setHistoryFilter((prev) => ({ ...prev, status: event.target.value, page: 1 }))}
              style={{ border: '1px solid #cbd5e1', borderRadius: '10px', padding: '0.45rem 0.55rem' }}
            >
              <option value="all">All statuses</option>
              <option value="draft">Draft</option>
              <option value="finalized">Finalized</option>
            </select>
            <button type="button" onClick={loadHistory} style={{ border: '1px solid #cbd5e1', backgroundColor: '#fff', color: '#0f172a', borderRadius: '10px', padding: '0.45rem 0.72rem', fontWeight: 700, cursor: 'pointer' }}>
              <i className="fas fa-rotate-right" style={{ marginRight: '0.35rem' }}></i>
              Refresh
            </button>
          </div>
        </div>

        {historyState.error && (
          <div style={{ marginTop: '0.7rem', border: '1px solid #fecaca', backgroundColor: '#fef2f2', color: '#b91c1c', borderRadius: '10px', padding: '0.7rem 0.8rem' }}>
            {historyState.error}
          </div>
        )}

        <div style={{ marginTop: '0.8rem', overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
            <thead>
              <tr>
                {['Date', 'Branch', 'Expected', 'Actual', 'Difference', 'Result', 'Prepared By', 'Status', 'Actions'].map((header) => (
                  <th key={header} style={{ textAlign: 'left', padding: '0.7rem', borderBottom: '1px solid #e2e8f0', color: '#475569', fontSize: '0.76rem', textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>{header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {historyState.loading ? (
                <tr><td colSpan={9} style={{ padding: '1rem', color: '#64748b' }}>Loading history...</td></tr>
              ) : !historyState.data.length ? (
                <tr><td colSpan={9} style={{ padding: '1rem', color: '#64748b' }}>No balancing records found for this branch yet.</td></tr>
              ) : historyState.data.map((row) => (
                <tr key={row.id}>
                  <td style={{ padding: '0.7rem', borderBottom: '1px solid #eef2f7', whiteSpace: 'nowrap' }}>{row.balancingDate ? new Date(row.balancingDate).toLocaleDateString('en-GB') : '-'}</td>
                  <td style={{ padding: '0.7rem', borderBottom: '1px solid #eef2f7' }}>{row.locationName || row.locationCode || '-'}</td>
                  <td style={{ padding: '0.7rem', borderBottom: '1px solid #eef2f7', whiteSpace: 'nowrap' }}>{MONEY(row.expectedSystemSales)}</td>
                  <td style={{ padding: '0.7rem', borderBottom: '1px solid #eef2f7', whiteSpace: 'nowrap' }}>{MONEY(row.totalActualAmount)}</td>
                  <td style={{ padding: '0.7rem', borderBottom: '1px solid #eef2f7', whiteSpace: 'nowrap' }}>{MONEY(row.differenceAmount)}</td>
                  <td style={{ padding: '0.7rem', borderBottom: '1px solid #eef2f7' }}>
                    <span style={{ display: 'inline-flex', borderRadius: '999px', padding: '0.2rem 0.55rem', fontWeight: 700, fontSize: '0.75rem', ...statusBadgeStyle(row.resultStatus) }}>
                      {row.resultStatus === 'balanced' ? 'Balanced' : row.resultStatus === 'shortage' ? 'Shortage' : 'Overage'}
                    </span>
                  </td>
                  <td style={{ padding: '0.7rem', borderBottom: '1px solid #eef2f7' }}>{row.preparedBy || '-'}</td>
                  <td style={{ padding: '0.7rem', borderBottom: '1px solid #eef2f7', textTransform: 'capitalize' }}>{row.status || 'draft'}</td>
                  <td style={{ padding: '0.7rem', borderBottom: '1px solid #eef2f7' }}>
                    <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                      <button type="button" onClick={() => loadRecordToForm(row)} style={{ border: '1px solid #cbd5e1', backgroundColor: '#fff', color: '#334155', borderRadius: '8px', padding: '0.24rem 0.5rem', fontWeight: 700, cursor: 'pointer' }}>View/Edit</button>
                      <button type="button" onClick={() => exportSalesBalancingReportPdf({ record: row })} style={{ border: '1px solid #bfdbfe', backgroundColor: '#eff6ff', color: '#1d4ed8', borderRadius: '8px', padding: '0.24rem 0.5rem', fontWeight: 700, cursor: 'pointer' }}>PDF</button>
                      {row.status !== 'finalized' && (
                        <button type="button" onClick={() => finalizeFromHistory(row)} style={{ border: '1px solid #86efac', backgroundColor: '#f0fdf4', color: '#166534', borderRadius: '8px', padding: '0.24rem 0.5rem', fontWeight: 700, cursor: 'pointer' }}>Finalize</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {historyState.pagination && (
          <div style={{ marginTop: '0.7rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <span style={{ color: '#64748b', fontSize: '0.85rem' }}>
              Page {historyState.pagination.page} of {historyState.pagination.totalPages} • {historyState.pagination.total} records
            </span>
            <div style={{ display: 'flex', gap: '0.45rem' }}>
              <button
                type="button"
                onClick={() => setHistoryFilter((prev) => ({ ...prev, page: Math.max(1, prev.page - 1) }))}
                disabled={historyState.pagination.page <= 1}
                style={{ border: '1px solid #cbd5e1', backgroundColor: '#fff', borderRadius: '8px', padding: '0.3rem 0.65rem', fontWeight: 700, cursor: historyState.pagination.page <= 1 ? 'not-allowed' : 'pointer' }}
              >
                Previous
              </button>
              <button
                type="button"
                onClick={() => setHistoryFilter((prev) => ({ ...prev, page: prev.page + 1 }))}
                disabled={historyState.pagination.page >= historyState.pagination.totalPages}
                style={{ border: '1px solid #cbd5e1', backgroundColor: '#fff', borderRadius: '8px', padding: '0.3rem 0.65rem', fontWeight: 700, cursor: historyState.pagination.page >= historyState.pagination.totalPages ? 'not-allowed' : 'pointer' }}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SalesBalancingTab;
