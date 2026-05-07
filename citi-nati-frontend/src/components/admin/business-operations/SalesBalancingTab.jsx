import React, { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../../../utils/api.js';
import { boAlert, boConfirm } from '../../../utils/boDialogBus.js';
import { exportSalesBalancingReportPdf } from '../../../utils/salesBalancingPdfExport.js';
import { exportSalesBalancingReportImage } from '../../../utils/salesBalancingImageExport.js';
import SalesBalancingFormModal from './SalesBalancingFormModal.jsx';

const cardStyle = {
  backgroundColor: '#fff',
  border: '1px solid #e2e8f0',
  borderRadius: '18px',
  boxShadow: '0 10px 24px rgba(15, 23, 42, 0.05)',
};

const workspaceCardStyle = {
  border: '1px solid #e2e8f0',
  backgroundColor: '#fff',
  borderRadius: '14px',
  padding: '0.95rem 1rem',
  cursor: 'pointer',
  textAlign: 'left',
  display: 'grid',
  gap: '0.42rem',
  boxShadow: '0 6px 18px rgba(15, 23, 42, 0.04)',
  transition: 'transform 0.16s ease, box-shadow 0.16s ease, border-color 0.16s ease, background-color 0.16s ease',
};

const MONEY = (value) =>
  `MWK ${Number(value || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const normalizeCode = (value) => String(value || '').trim().toUpperCase();

const statusBadgeStyle = (resultStatus) => {
  if (resultStatus === 'shortage') {
    return { backgroundColor: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca' };
  }

  if (resultStatus === 'overage') {
    return { backgroundColor: '#fff7ed', color: '#c2410c', border: '1px solid #fed7aa' };
  }

  return { backgroundColor: '#dcfce7', color: '#166534', border: '1px solid #bbf7d0' };
};

const hoverOn = (event) => {
  event.currentTarget.style.transform = 'translateY(-2px)';
  event.currentTarget.style.boxShadow = '0 12px 24px rgba(15, 23, 42, 0.12)';
  event.currentTarget.style.borderColor = '#cbd5e1';
  event.currentTarget.style.backgroundColor = '#f8fafc';
};

const hoverOff = (event) => {
  event.currentTarget.style.transform = 'translateY(0)';
  event.currentTarget.style.boxShadow = '0 6px 18px rgba(15, 23, 42, 0.04)';
  event.currentTarget.style.borderColor = '#e2e8f0';
  event.currentTarget.style.backgroundColor = '#fff';
};

const buildScopedParams = ({
  selectedLocationId,
  selectedBranchCode,
  selectedLocationCode,
  extra = {},
}) => {
  const branchCode = normalizeCode(selectedBranchCode);
  const locationCode = normalizeCode(selectedLocationCode);

  return {
    ...extra,
    branchCode: branchCode || undefined,
    locationCode: locationCode || undefined,

    // Legacy compatibility only. Backend should prefer branchCode + locationCode.
    locationId: selectedLocationId || undefined,
  };
};

const SalesBalancingTab = ({
  selectedLocationId = null,
  selectedBranchCode = '',
  selectedLocationCode = '',
  selectedLocationName = '',
}) => {
  const effectiveBranchCode = normalizeCode(selectedBranchCode);
  const effectiveLocationCode = normalizeCode(selectedLocationCode);

  const hasLocationScope = Boolean(effectiveBranchCode && effectiveLocationCode);

  const scopeLabel = useMemo(() => {
    if (selectedLocationName) return selectedLocationName;
    if (effectiveBranchCode && effectiveLocationCode) return `${effectiveBranchCode} / ${effectiveLocationCode}`;
    if (effectiveLocationCode) return effectiveLocationCode;
    return 'No location selected';
  }, [effectiveBranchCode, effectiveLocationCode, selectedLocationName]);

  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [isHistoryModalMaximized, setIsHistoryModalMaximized] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [formSaving, setFormSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [historyState, setHistoryState] = useState({
    data: [],
    pagination: null,
    loading: false,
    error: '',
  });
  const [historyFilter, setHistoryFilter] = useState({ status: 'all', page: 1 });

  const loadHistory = useCallback(async () => {
    if (!hasLocationScope) {
      setHistoryState({ data: [], pagination: null, loading: false, error: '' });
      return;
    }

    setHistoryState((prev) => ({ ...prev, loading: true, error: '' }));

    try {
      const response = await api.get('/business-operations/sales-balancing', {
        params: buildScopedParams({
          selectedLocationId,
          selectedBranchCode: effectiveBranchCode,
          selectedLocationCode: effectiveLocationCode,
          extra: {
            status: historyFilter.status !== 'all' ? historyFilter.status : undefined,
            page: historyFilter.page,
            pageSize: 12,
            sortBy: 'balancingDate',
            sortOrder: 'desc',
          },
        }),
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
  }, [
    effectiveBranchCode,
    effectiveLocationCode,
    hasLocationScope,
    historyFilter.page,
    historyFilter.status,
    selectedLocationId,
  ]);

  useEffect(() => {
    setHistoryFilter((prev) => ({ ...prev, page: 1 }));
  }, [effectiveBranchCode, effectiveLocationCode]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const openCreateForm = () => {
    setFormError('');
    setSelectedRecord(null);
    setIsFormModalOpen(true);
  };

  const openEditForm = (record) => {
    setFormError('');
    setSelectedRecord(record);
    setIsFormModalOpen(true);
  };

  const handleFormSubmit = async (payload) => {
    setFormSaving(true);
    setFormError('');

    try {
      const isCreate = !selectedRecord;

      const submitPayload = {
        ...payload,
        branchCode: effectiveBranchCode || null,
        locationCode: effectiveLocationCode || null,
        locationName: selectedLocationName || scopeLabel || null,

        // Legacy compatibility only. Backend should prefer branchCode + locationCode.
        locationId: selectedLocationId || null,
      };

      if (isCreate) {
        await api.post('/business-operations/sales-balancing', submitPayload);
      } else {
        await api.put(`/business-operations/sales-balancing/${selectedRecord.id}`, submitPayload);
      }

      setIsFormModalOpen(false);
      setSelectedRecord(null);

      await boAlert({
        title: isCreate ? 'Record Created' : 'Record Updated',
        message: isCreate
          ? 'Balancing record has been created successfully.'
          : 'Balancing record has been updated successfully.',
        type: 'success',
      });

      loadHistory();
    } catch (error) {
      setFormError(error?.response?.data?.error || 'Failed to save balancing record.');
    } finally {
      setFormSaving(false);
    }
  };

  const handleDelete = async (record) => {
    const confirmed = await boConfirm({
      title: 'Delete Balancing Record',
      message: `Permanently delete the balancing record for ${
        record.balancingDate ? new Date(record.balancingDate).toLocaleDateString('en-GB') : 'this date'
      }? This action cannot be undone.`,
      confirmText: 'Yes, Delete',
    });

    if (!confirmed) return;

    try {
      await api.delete(`/business-operations/sales-balancing/${record.id}`);

      await boAlert({
        title: 'Deleted',
        message: 'Balancing record has been deleted.',
        type: 'success',
      });

      loadHistory();
    } catch (error) {
      await boAlert({
        title: 'Delete Failed',
        message: error?.response?.data?.error || 'Failed to delete record.',
        type: 'error',
      });
    }
  };

  const handleFinalize = async (record) => {
    const confirmed = await boConfirm({
      title: 'Finalize Balancing',
      message: `Finalize balancing record for ${
        record.balancingDate ? new Date(record.balancingDate).toLocaleDateString('en-GB') : 'this date'
      }? This action cannot be undone.`,
      confirmText: 'Yes, Finalize',
    });

    if (!confirmed) return;

    try {
      await api.post(`/business-operations/sales-balancing/${record.id}/finalize`, {});

      await boAlert({
        title: 'Finalized',
        message: 'Balancing record has been finalized successfully.',
        type: 'success',
      });

      loadHistory();
    } catch (error) {
      await boAlert({
        title: 'Finalize Failed',
        message: error?.response?.data?.error || 'Failed to finalize record.',
        type: 'error',
      });
    }
  };

  const handleExportPdf = (record) => {
    exportSalesBalancingReportPdf({
      record,
      companyName: 'Citi-Nati Supermarket',
      title: 'Sales Balancing Report',
    });
  };

  const handleExportImage = async (record, format = 'png') => {
    try {
      await exportSalesBalancingReportImage({
        record,
        companyName: 'Citi-Nati Supermarket',
        title: 'Sales Balancing Report',
        format,
      });
    } catch (error) {
      console.error('Image export error:', error);
      boAlert({
        title: 'Image Export Failed',
        message: 'Failed to generate image. Please try again.',
        type: 'error',
      });
    }
  };

  if (!hasLocationScope) {
    return (
      <div style={{ ...cardStyle, padding: '1.2rem 1.3rem' }}>
        <h3 style={{ margin: 0, color: '#0f172a', fontSize: '1.15rem' }}>
          <i className="fas fa-scale-balanced" style={{ marginRight: '0.5rem', color: '#5B4B8A' }}></i>
          Sales Balancing
        </h3>
        <p style={{ margin: '0.55rem 0 0', color: '#64748b', lineHeight: 1.65 }}>
          Sales balancing requires a specific branch and location scope. Please select a branch/location from the Location Scope selector.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      <div style={{ ...cardStyle, padding: '1rem 1.1rem' }}>
        <div style={{ display: 'grid', gap: '0.5rem' }}>
          <div>
            <h3 style={{ margin: 0, color: '#0f172a', fontSize: '1.15rem' }}>
              <i className="fas fa-scale-balanced" style={{ marginRight: '0.5rem', color: '#5B4B8A' }}></i>
              Sales Balancing
            </h3>
            <p style={{ margin: '0.3rem 0 0', color: '#64748b', fontSize: '0.9rem' }}>
              Daily end-of-day branch reconciliation for actual payment takings vs expected system sales.
            </p>
          </div>

          <div style={{ paddingTop: '0.3rem' }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
                backgroundColor: '#f0f4ff',
                color: '#5B4B8A',
                padding: '0.35rem 0.75rem',
                borderRadius: '999px',
                fontSize: '0.85rem',
                fontWeight: 700,
              }}
            >
              <i className="fas fa-location-dot"></i>
              {scopeLabel}
            </span>
          </div>
        </div>
      </div>

      <div style={{ ...cardStyle, padding: '1rem 1.1rem' }}>
        <div style={{ display: 'grid', gap: '0.78rem' }}>
          <div>
            <strong style={{ color: '#0f172a' }}>Balancing Workspaces</strong>
            <p style={{ margin: '0.3rem 0 0', color: '#64748b', fontSize: '0.88rem' }}>
              Choose a workspace to enter daily reconciliation or view balancing history.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '0.75rem' }}>
            <button
              type="button"
              onClick={openCreateForm}
              onMouseEnter={hoverOn}
              onMouseLeave={hoverOff}
              style={workspaceCardStyle}
            >
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '34px',
                  height: '34px',
                  borderRadius: '10px',
                  backgroundColor: '#dbeafe',
                  color: '#1d4ed8',
                }}
              >
                <i className="fas fa-plus" />
              </span>
              <span style={{ color: '#0f172a', fontWeight: 800, fontSize: '0.95rem' }}>New Balancing Record</span>
              <span style={{ color: '#64748b', fontSize: '0.84rem', lineHeight: 1.45 }}>
                Enter today's actual payment totals and generate balancing summary.
              </span>
            </button>

            <button
              type="button"
              title="Click to open"
              onClick={() => {
                setIsHistoryModalMaximized(false);
                setIsHistoryModalOpen(true);
              }}
              onMouseEnter={hoverOn}
              onMouseLeave={hoverOff}
              style={workspaceCardStyle}
            >
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '34px',
                  height: '34px',
                  borderRadius: '10px',
                  backgroundColor: '#fce7f3',
                  color: '#db2777',
                }}
              >
                <i className="fas fa-history" />
              </span>
              <span style={{ color: '#0f172a', fontWeight: 800, fontSize: '0.95rem' }}>Balancing History</span>
              <span style={{ color: '#64748b', fontSize: '0.84rem', lineHeight: 1.45 }}>
                View, edit, or finalize past balancing records for this branch/location.
              </span>
            </button>
          </div>
        </div>
      </div>

      {isHistoryModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.45)',
            zIndex: 170,
            display: 'grid',
            placeItems: 'center',
            padding: isHistoryModalMaximized ? '0.35rem' : '1rem',
          }}
        >
          <div
            style={{
              ...cardStyle,
              width: isHistoryModalMaximized ? 'calc(100vw - 0.7rem)' : 'min(1200px, 97vw)',
              height: isHistoryModalMaximized ? 'calc(100vh - 0.7rem)' : '90vh',
              maxHeight: 'none',
              overflow: 'hidden',
              borderRadius: isHistoryModalMaximized ? '10px' : '18px',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div style={{ flexShrink: 0, padding: '1rem 1.1rem', borderBottom: '1px solid #e2e8f0', boxShadow: '0 4px 12px rgba(15,23,42,0.04)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                <div>
                  <h2 style={{ margin: 0, color: '#0f172a', fontSize: '1.15rem', fontWeight: 800 }}>Balancing History</h2>
                  <p style={{ margin: '0.28rem 0 0', color: '#64748b', fontSize: '0.86rem' }}>
                    View, edit, finalize, and export past balancing records.
                  </p>
                </div>

                <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                  <button
                    type="button"
                    onClick={() => setIsHistoryModalMaximized(!isHistoryModalMaximized)}
                    style={{ border: '1px solid #e2e8f0', backgroundColor: '#fff', color: '#475569', borderRadius: '10px', padding: '0.5rem 0.65rem', cursor: 'pointer', fontWeight: 700 }}
                  >
                    <i className={`fas ${isHistoryModalMaximized ? 'fa-compress' : 'fa-expand'}`} />
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsHistoryModalOpen(false)}
                    style={{ border: '1px solid #e2e8f0', backgroundColor: '#fff', color: '#475569', borderRadius: '10px', padding: '0.5rem 0.65rem', cursor: 'pointer', fontWeight: 700 }}
                  >
                    <i className="fas fa-times" />
                  </button>
                </div>
              </div>
            </div>

            <div style={{ flex: 1, overflow: 'auto', padding: '1rem 1.1rem' }}>
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <select
                  value={historyFilter.status}
                  onChange={(e) => setHistoryFilter({ ...historyFilter, status: e.target.value, page: 1 })}
                  style={{ border: '1px solid #cbd5e1', borderRadius: '10px', padding: '0.5rem 0.65rem', fontWeight: 600, fontSize: '0.9rem' }}
                >
                  <option value="all">All Statuses</option>
                  <option value="draft">Draft Only</option>
                  <option value="finalized">Finalized Only</option>
                </select>

                <button
                  type="button"
                  onClick={loadHistory}
                  style={{ border: '1px solid #cbd5e1', backgroundColor: '#fff', color: '#0f172a', borderRadius: '10px', padding: '0.5rem 0.75rem', fontWeight: 700, cursor: 'pointer' }}
                >
                  <i className="fas fa-rotate-right" style={{ marginRight: '0.35rem' }}></i>
                  Refresh
                </button>
              </div>

              {historyState.error && (
                <div style={{ padding: '0.9rem 1rem', backgroundColor: '#fef2f2', color: '#b91c1c', borderRadius: '12px', border: '1px solid #fecaca', marginBottom: '1rem' }}>
                  {historyState.error}
                </div>
              )}

              {historyState.loading ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>
                  <i className="fas fa-spinner fa-spin" style={{ marginRight: '0.5rem' }}></i>
                  Loading history...
                </div>
              ) : !historyState.data.length ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>
                  No balancing records found for this branch/location yet.
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
                    <thead>
                      <tr style={{ backgroundColor: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                        {['Date', 'Expected', 'Actual', 'Difference', 'Result', 'Prepared By', 'Status', 'Actions'].map((header) => (
                          <th
                            key={header}
                            style={{
                              textAlign: 'left',
                              padding: '0.8rem 0.7rem',
                              color: '#475569',
                              fontSize: '0.76rem',
                              textTransform: 'uppercase',
                              letterSpacing: '0.04em',
                              whiteSpace: 'nowrap',
                              fontWeight: 800,
                            }}
                          >
                            {header}
                          </th>
                        ))}
                      </tr>
                    </thead>

                    <tbody>
                      {historyState.data.map((row) => (
                        <tr key={row.id} style={{ borderBottom: '1px solid #eef2f7', transition: 'background-color 0.2s' }}>
                          <td style={{ padding: '0.8rem 0.7rem', whiteSpace: 'nowrap' }}>
                            {row.balancingDate ? new Date(row.balancingDate).toLocaleDateString('en-GB') : '-'}
                          </td>
                          <td style={{ padding: '0.8rem 0.7rem', whiteSpace: 'nowrap' }}>{MONEY(row.expectedSystemSales)}</td>
                          <td style={{ padding: '0.8rem 0.7rem', whiteSpace: 'nowrap', fontWeight: 700, color: '#0f172a' }}>{MONEY(row.totalActualAmount || 0)}</td>
                          <td style={{ padding: '0.8rem 0.7rem', whiteSpace: 'nowrap', fontWeight: 700 }}>
                            <span style={{ color: (row.differenceAmount || 0) < 0 ? '#b91c1c' : (row.differenceAmount || 0) > 0 ? '#c2410c' : '#166534' }}>
                              {MONEY(row.differenceAmount)}
                            </span>
                          </td>
                          <td style={{ padding: '0.8rem 0.7rem' }}>
                            <span
                              style={{
                                display: 'inline-flex',
                                borderRadius: '999px',
                                padding: '0.25rem 0.6rem',
                                fontWeight: 700,
                                fontSize: '0.75rem',
                                ...statusBadgeStyle(row.resultStatus),
                              }}
                            >
                              {row.resultStatus === 'balanced'
                                ? '✓ Balanced'
                                : row.resultStatus === 'shortage'
                                  ? '⚠ Shortage'
                                  : '◆ Overage'}
                            </span>
                          </td>
                          <td style={{ padding: '0.8rem 0.7rem' }}>{row.preparedBy || '-'}</td>
                          <td style={{ padding: '0.8rem 0.7rem', textTransform: 'capitalize' }}>
                            <span
                              style={{
                                display: 'inline-flex',
                                borderRadius: '6px',
                                padding: '0.2rem 0.5rem',
                                fontSize: '0.75rem',
                                fontWeight: 700,
                                backgroundColor: row.status === 'finalized' ? '#dcfce7' : '#fef2f2',
                                color: row.status === 'finalized' ? '#166534' : '#b91c1c',
                              }}
                            >
                              {row.status}
                            </span>
                          </td>
                          <td style={{ padding: '0.8rem 0.7rem' }}>
                            <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
                              <button
                                type="button"
                                onClick={() => {
                                  openEditForm(row);
                                  setIsHistoryModalOpen(false);
                                }}
                                style={{ border: '1px solid #cbd5e1', backgroundColor: '#fff', color: '#334155', borderRadius: '6px', padding: '0.2rem 0.5rem', fontWeight: 700, cursor: 'pointer', fontSize: '0.75rem' }}
                              >
                                Edit
                              </button>

                              <button
                                type="button"
                                onClick={() => handleExportPdf(row)}
                                style={{ border: '1px solid #bfdbfe', backgroundColor: '#eff6ff', color: '#1d4ed8', borderRadius: '6px', padding: '0.2rem 0.5rem', fontWeight: 700, cursor: 'pointer', fontSize: '0.75rem' }}
                              >
                                PDF
                              </button>

                              <button
                                type="button"
                                onClick={() => handleExportImage(row, 'png')}
                                style={{ border: '1px solid #d4d4d8', backgroundColor: '#f4f4f5', color: '#3f3f46', borderRadius: '6px', padding: '0.2rem 0.5rem', fontWeight: 700, cursor: 'pointer', fontSize: '0.75rem' }}
                                title="Export as PNG image"
                              >
                                PNG
                              </button>

                              <button
                                type="button"
                                onClick={() => handleExportImage(row, 'jpg')}
                                style={{ border: '1px solid #d4d4d8', backgroundColor: '#f4f4f5', color: '#3f3f46', borderRadius: '6px', padding: '0.2rem 0.5rem', fontWeight: 700, cursor: 'pointer', fontSize: '0.75rem' }}
                                title="Export as JPG image"
                              >
                                JPG
                              </button>

                              {row.status !== 'finalized' && (
                                <button
                                  type="button"
                                  onClick={() => handleFinalize(row)}
                                  style={{ border: '1px solid #86efac', backgroundColor: '#f0fdf4', color: '#166534', borderRadius: '6px', padding: '0.2rem 0.5rem', fontWeight: 700, cursor: 'pointer', fontSize: '0.75rem' }}
                                >
                                  Finalize
                                </button>
                              )}

                              <button
                                type="button"
                                onClick={() => handleDelete(row)}
                                style={{ border: '1px solid #fecaca', backgroundColor: '#fef2f2', color: '#b91c1c', borderRadius: '6px', padding: '0.2rem 0.5rem', fontWeight: 700, cursor: 'pointer', fontSize: '0.75rem' }}
                              >
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {historyState.pagination && (
                <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', padding: '1rem', backgroundColor: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                  <span style={{ color: '#64748b', fontSize: '0.85rem', fontWeight: 600 }}>
                    Page {historyState.pagination.page} of {historyState.pagination.totalPages} • {historyState.pagination.total} total records
                  </span>

                  <div style={{ display: 'flex', gap: '0.4rem' }}>
                    <button
                      type="button"
                      onClick={() => setHistoryFilter({ ...historyFilter, page: Math.max(1, historyFilter.page - 1) })}
                      disabled={historyState.pagination.page <= 1}
                      style={{ border: '1px solid #cbd5e1', backgroundColor: '#fff', borderRadius: '8px', padding: '0.4rem 0.7rem', fontWeight: 700, cursor: historyState.pagination.page <= 1 ? 'not-allowed' : 'pointer', opacity: historyState.pagination.page <= 1 ? 0.5 : 1 }}
                    >
                      ← Previous
                    </button>

                    <button
                      type="button"
                      onClick={() => setHistoryFilter({ ...historyFilter, page: historyFilter.page + 1 })}
                      disabled={historyState.pagination.page >= historyState.pagination.totalPages}
                      style={{ border: '1px solid #cbd5e1', backgroundColor: '#fff', borderRadius: '8px', padding: '0.4rem 0.7rem', fontWeight: 700, cursor: historyState.pagination.page >= historyState.pagination.totalPages ? 'not-allowed' : 'pointer', opacity: historyState.pagination.page >= historyState.pagination.totalPages ? 0.5 : 1 }}
                    >
                      Next →
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <SalesBalancingFormModal
        isOpen={isFormModalOpen}
        record={selectedRecord}
        selectedLocationId={selectedLocationId}
        selectedBranchCode={effectiveBranchCode}
        selectedLocationCode={effectiveLocationCode}
        selectedLocationName={scopeLabel}
        saving={formSaving}
        error={formError}
        onClose={() => {
          setIsFormModalOpen(false);
          setSelectedRecord(null);
          setFormError('');
        }}
        onSubmit={handleFormSubmit}
      />
    </div>
  );
};

export default SalesBalancingTab;