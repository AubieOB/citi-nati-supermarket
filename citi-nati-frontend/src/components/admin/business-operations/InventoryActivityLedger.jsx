import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import api from '../../../utils/api.js';
import { exportStockMovementLedgerPdf } from '../../../utils/businessOperationsPdfExports.js';

const today = new Date();
const currentYear = today.getFullYear();
const currentMonth = today.getMonth() + 1;

const cardStyle = {
  backgroundColor: '#fff',
  border: '1px solid #e2e8f0',
  borderRadius: '18px',
  boxShadow: '0 10px 24px rgba(15, 23, 42, 0.05)',
};

const inputStyle = {
  width: '100%',
  padding: '0.65rem 0.8rem',
  border: '1px solid #cbd5e1',
  borderRadius: '10px',
  fontSize: '0.88rem',
  boxSizing: 'border-box',
};

const labelStyle = {
  display: 'block',
  fontSize: '0.76rem',
  color: '#475569',
  fontWeight: 800,
  marginBottom: '0.35rem',
  textTransform: 'uppercase',
};

const thStyle = {
  padding: '0.75rem 0.85rem',
  borderBottom: '1px solid #e2e8f0',
  color: '#334155',
  background: '#f8fafc',
  fontWeight: 800,
  fontSize: '0.82rem',
  textAlign: 'left',
};

const tdStyle = {
  padding: '0.72rem 0.85rem',
  borderBottom: '1px solid #f1f5f9',
  color: '#0f172a',
};

const normalizeCode = (value) => String(value || '').trim().toUpperCase();

const compactParams = (params = {}) =>
  Object.entries(params).reduce((acc, [key, value]) => {
    if (value !== '' && value !== null && value !== undefined) {
      acc[key] = value;
    }
    return acc;
  }, {});

function money(value) {
  return `MWK ${Number(value || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function useDebounce(value, delay) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);

  return debouncedValue;
}

const InventoryActivityLedger = ({
  selectedLocationId = null,
  selectedBranchCode = '',
  selectedLocationCode = '',
  selectedLocationName = '',
}) => {
  const effectiveBranchCode = normalizeCode(selectedBranchCode);
  const effectiveLocationCode = normalizeCode(selectedLocationCode);

  const isAllLocations =
    (!effectiveBranchCode && !effectiveLocationCode && !selectedLocationId) ||
    String(selectedLocationId || '').toLowerCase() === 'all';

  const scopeLabel =
    selectedLocationName ||
    (effectiveBranchCode && effectiveLocationCode
      ? `${effectiveBranchCode} / ${effectiveLocationCode}`
      : effectiveLocationCode || 'All Locations');

  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  const [activeModal, setActiveModal] = useState(null);
  const [modalMaximized, setModalMaximized] = useState(false);

  const [modalPeriodType, setModalPeriodType] = useState('day');
  const [modalDate, setModalDate] = useState(today.toISOString().slice(0, 10));
  const [modalMonth, setModalMonth] = useState(currentMonth);
  const [modalYear, setModalYear] = useState(currentYear);
  const [modalStartDate, setModalStartDate] = useState(today.toISOString().slice(0, 10));
  const [modalEndDate, setModalEndDate] = useState(today.toISOString().slice(0, 10));
  const [modalProductCode, setModalProductCode] = useState('');
  const [modalProductName, setModalProductName] = useState('');
  const [modalMovementType, setModalMovementType] = useState('');

  const debouncedProductCode = useDebounce(modalProductCode, 400);
  const debouncedProductName = useDebounce(modalProductName, 400);

  const modalFilters = useMemo(
    () =>
      compactParams({
        periodType: modalPeriodType,
        date: modalDate,
        month: modalMonth,
        year: modalYear,
        startDate: modalStartDate,
        endDate: modalEndDate,

        // Canonical production scope
        branchCode: isAllLocations ? undefined : effectiveBranchCode || undefined,
        locationCode: isAllLocations ? undefined : effectiveLocationCode || undefined,

        // Legacy fallback only
        locationId: isAllLocations ? undefined : selectedLocationId || undefined,

        productCode: debouncedProductCode.trim() || undefined,
        productName: debouncedProductName.trim() || undefined,
        movementType: modalMovementType || undefined,
      }),
    [
      debouncedProductCode,
      debouncedProductName,
      effectiveBranchCode,
      effectiveLocationCode,
      isAllLocations,
      modalDate,
      modalEndDate,
      modalMonth,
      modalMovementType,
      modalPeriodType,
      modalStartDate,
      modalYear,
      selectedLocationId,
    ]
  );

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError('');

      const requestParams = { ...modalFilters };
      if (import.meta.env.DEV) {
        console.debug('[INVENTORY ACTIVITY] Fetching ledger with params:', requestParams);
      }

      const res = await api.get('/business-operations/inventory-activity/ledger', {
        params: requestParams,
      });

      if (res.data.success) {
        setData(res.data.data);
      } else {
        setError(res.data.error || 'Failed to load data');
      }
    } catch (err) {
      console.error(err);
      setError(err?.response?.data?.error || 'Failed to load inventory activity.');
    } finally {
      setLoading(false);
    }
  }, [modalFilters]);

  useEffect(() => {
    if (activeModal) {
      fetchData();
    }
  }, [activeModal, fetchData]);

  const closeModal = () => {
    setActiveModal(null);
    setModalMaximized(false);
    setData(null);
    setError('');
  };

  const clearModalFilters = () => {
    setModalProductCode('');
    setModalProductName('');
    setModalMovementType('');
    setModalPeriodType('day');
    setModalDate(today.toISOString().slice(0, 10));
    setModalMonth(currentMonth);
    setModalYear(currentYear);
    setModalStartDate(today.toISOString().slice(0, 10));
    setModalEndDate(today.toISOString().slice(0, 10));
  };

  const exportPDF = () => {
    if (!data || !data.ledger) return;
    const rows = data.ledger;
    if (rows.length === 0) return;

    exportStockMovementLedgerPdf({
      scopeLabel,
      filters: {
        periodType: modalPeriodType,
        date: modalDate,
        month: modalMonth,
        year: modalYear,
        startDate: modalStartDate,
        endDate: modalEndDate,
        movementType: modalMovementType,
        productCode: modalProductCode,
        productName: modalProductName,
      },
      ledger: rows,
      summary: data.summary || {},
    });
  };

  useEffect(() => {
    if (!activeModal) return;

    const handler = (e) => {
      if (e.key === 'Escape') closeModal();
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [activeModal]);

  const summary = data?.summary || {};
  const ledger = data?.ledger || [];
  const dataQuality = data?.dataQuality || {};
  const ledgerScrollRef = useRef(null);

  const scrollToTop = () => {
    if (ledgerScrollRef.current) {
      ledgerScrollRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const scrollToBottom = () => {
    if (ledgerScrollRef.current) {
      ledgerScrollRef.current.scrollTo({ top: ledgerScrollRef.current.scrollHeight, behavior: 'smooth' });
    }
  };

  const renderModalFilters = () => (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem', padding: '1rem', backgroundColor: '#f8fafc', borderRadius: '12px', marginBottom: '1rem' }}>
      <div>
        <label style={labelStyle}>Scope</label>
        <input value={scopeLabel} disabled readOnly style={{ ...inputStyle, backgroundColor: '#fff', color: '#64748b', fontWeight: 700 }} />
      </div>

      <div>
        <label style={labelStyle}>Period</label>
        <select value={modalPeriodType} onChange={(e) => setModalPeriodType(e.target.value)} style={inputStyle}>
          <option value="day">Day</option>
          <option value="month">Month</option>
          <option value="year">Year</option>
          <option value="custom">Custom Range</option>
        </select>
      </div>

      {modalPeriodType === 'day' && (
        <div>
          <label style={labelStyle}>Date</label>
          <input type="date" value={modalDate} onChange={(e) => setModalDate(e.target.value)} style={inputStyle} />
        </div>
      )}

      {modalPeriodType === 'month' && (
        <>
          <div>
            <label style={labelStyle}>Month</label>
            <input type="number" min="1" max="12" value={modalMonth} onChange={(e) => setModalMonth(e.target.value)} style={inputStyle} />
          </div>

          <div>
            <label style={labelStyle}>Year</label>
            <input type="number" value={modalYear} onChange={(e) => setModalYear(e.target.value)} style={inputStyle} />
          </div>
        </>
      )}

      {modalPeriodType === 'year' && (
        <div>
          <label style={labelStyle}>Year</label>
          <input type="number" value={modalYear} onChange={(e) => setModalYear(e.target.value)} style={inputStyle} />
        </div>
      )}

      {modalPeriodType === 'custom' && (
        <>
          <div>
            <label style={labelStyle}>Start Date</label>
            <input type="date" value={modalStartDate} onChange={(e) => setModalStartDate(e.target.value)} style={inputStyle} />
          </div>

          <div>
            <label style={labelStyle}>End Date</label>
            <input type="date" value={modalEndDate} onChange={(e) => setModalEndDate(e.target.value)} style={inputStyle} />
          </div>
        </>
      )}

      <div>
        <label style={labelStyle}>Product Code</label>
        <input value={modalProductCode} onChange={(e) => setModalProductCode(e.target.value)} placeholder="Filter by code" style={inputStyle} />
      </div>

      <div>
        <label style={labelStyle}>Product Name</label>
        <input value={modalProductName} onChange={(e) => setModalProductName(e.target.value)} placeholder="Filter by name" style={inputStyle} />
      </div>

      <div>
        <label style={labelStyle}>Movement Type</label>
        <select value={modalMovementType} onChange={(e) => setModalMovementType(e.target.value)} style={inputStyle}>
          <option value="">All</option>
          <option value="SALE">Sales Only</option>
          <option value="STOCK_IN">Stock Intake Only</option>
        </select>
      </div>


    </div>
  );

  const renderLedgerContent = () => (
    <div style={{ display: 'grid', gap: '1rem' }}>
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <button type="button" onClick={() => setShowFilters(!showFilters)} style={{ padding: '0.45rem 0.75rem', cursor: 'pointer', backgroundColor: showFilters ? '#5B4B8A' : '#f1f5f9', color: showFilters ? '#fff' : '#334155', fontWeight: 700, border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '0.85rem', transition: 'all 0.2s' }}>
            <i className={`fas fa-${showFilters ? 'filter' : 'sliders-h'}`} style={{ marginRight: '0.42rem' }} />
            Filters
          </button>
          <button type="button" onClick={fetchData} disabled={loading} title="Refresh" style={{ padding: '0.45rem 0.75rem', cursor: 'pointer', backgroundColor: '#fff', color: '#334155', fontWeight: 700, border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '0.85rem' }}>
            <i className={`fas fa-sync-alt ${loading ? 'fa-spin' : ''}`} />
          </button>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <button type="button" onClick={exportPDF} disabled={!ledger.length} title="Export PDF" style={{ padding: '0.45rem 0.75rem', cursor: ledger.length ? 'pointer' : 'not-allowed', backgroundColor: '#7c3aed', color: '#fff', fontWeight: 700, border: '1px solid #7c3aed', borderRadius: '8px', fontSize: '0.85rem' }}>
            <i className="fas fa-file-pdf" style={{ marginRight: '0.42rem' }} />
            PDF
          </button>
        </div>
      </div>

      {showFilters && renderModalFilters()}

      {error && (
        <div style={{ padding: '1rem', color: '#b91c1c', backgroundColor: '#fff1f2', borderRadius: '10px', border: '1px solid #fecaca' }}>
          {error}
        </div>
      )}

      {data?.ledger && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem' }}>
          {summary.openingBalance !== undefined && (
            <div style={{ ...cardStyle, padding: '0.9rem 1rem' }}>
              <div style={{ color: '#64748b', fontSize: '0.76rem', textTransform: 'uppercase', fontWeight: 800 }}>Opening Balance</div>
              <div style={{ marginTop: '0.35rem', fontSize: '1.25rem', fontWeight: 800, color: '#4338ca' }}>{summary.openingBalance ?? 0}</div>
            </div>
          )}

          <div style={{ ...cardStyle, padding: '0.9rem 1rem' }}>
            <div style={{ color: '#64748b', fontSize: '0.76rem', textTransform: 'uppercase', fontWeight: 800 }}>Total Qty In</div>
            <div style={{ marginTop: '0.35rem', fontSize: '1.25rem', fontWeight: 800, color: '#166534' }}>{summary.totalQtyIn ?? 0}</div>
          </div>

          <div style={{ ...cardStyle, padding: '0.9rem 1rem' }}>
            <div style={{ color: '#64748b', fontSize: '0.76rem', textTransform: 'uppercase', fontWeight: 800 }}>Total Qty Out</div>
            <div style={{ marginTop: '0.35rem', fontSize: '1.25rem', fontWeight: 800, color: '#b91c1c' }}>{summary.totalQtyOut ?? 0}</div>
          </div>

          <div style={{ ...cardStyle, padding: '0.9rem 1rem' }}>
            <div style={{ color: '#64748b', fontSize: '0.76rem', textTransform: 'uppercase', fontWeight: 800 }}>Sales Amount</div>
            <div style={{ marginTop: '0.35rem', fontSize: '1.25rem', fontWeight: 800, color: '#0f172a' }}>{money(summary.totalSalesAmount)}</div>
          </div>

          <div style={{ ...cardStyle, padding: '0.9rem 1rem' }}>
            <div style={{ color: '#64748b', fontSize: '0.76rem', textTransform: 'uppercase', fontWeight: 800 }}>Total Intake Value</div>
            <div style={{ marginTop: '0.35rem', fontSize: '1.25rem', fontWeight: 800, color: '#166534' }}>{money(summary.totalIntakeValue)}</div>
          </div>

          {summary.closingBalance !== null && summary.closingBalance !== undefined && (
            <div style={{ ...cardStyle, padding: '0.9rem 1rem' }}>
              <div style={{ color: '#64748b', fontSize: '0.76rem', textTransform: 'uppercase', fontWeight: 800 }}>Closing Balance</div>
              <div style={{ marginTop: '0.35rem', fontSize: '1.25rem', fontWeight: 800, color: '#7c3aed' }}>{summary.closingBalance ?? 0}</div>
            </div>
          )}

          {(summary.closingBalance === null || summary.closingBalance === undefined) && summary.isPeriodOngoing && (
            <div style={{ ...cardStyle, padding: '0.9rem 1rem', border: '1px dashed #cbd5e1' }}>
              <div style={{ color: '#64748b', fontSize: '0.76rem', textTransform: 'uppercase', fontWeight: 800 }}>Closing Balance</div>
              <div style={{ marginTop: '0.35rem', fontSize: '0.9rem', color: '#94a3b8' }}>
                <i className="fas fa-clock" style={{ marginRight: '0.35rem' }} />
                Not available until end of period
              </div>
            </div>
          )}
        </div>
      )}

      {loading ? (
        <div style={{ padding: '3rem', textAlign: 'center', color: '#64748b' }}>
          <i className="fas fa-spinner fa-spin" style={{ fontSize: '2rem' }} />
          <p style={{ marginTop: '1rem' }}>Loading inventory ledger...</p>
        </div>
      ) : ledger.length === 0 ? (
        <div style={{ padding: '3rem', textAlign: 'center', color: '#64748b' }}>
          <i className="fas fa-list-ol" style={{ fontSize: '3rem', color: '#cbd5e1' }} />
          <p style={{ marginTop: '1rem', fontSize: '1.1rem' }}>No inventory transactions found.</p>
          <p style={{ fontSize: '0.9rem', color: '#94a3b8' }}>Try adjusting the filters or date range.</p>
        </div>
      ) : (
        <div style={{ ...cardStyle, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
              <thead>
                <tr style={{ backgroundColor: '#f8fafc' }}>
                  <th style={{ ...thStyle }}>Time</th>
                  <th style={{ ...thStyle }}>Type</th>
                  <th style={{ ...thStyle }}>Reference</th>
                  <th style={{ ...thStyle }}>User</th>
                  <th style={{ ...thStyle }}>Product</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Opening Balance</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Qty In</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Qty Out</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Balance After Transaction</th>
                  {!summary.isPeriodToday && !summary.isPeriodOngoing && <th style={{ ...thStyle, textAlign: 'right' }}>Closing Balance</th>}
                  <th style={{ ...thStyle, textAlign: 'right' }}>Amount</th>
                </tr>
              </thead>

              <tbody>
                {ledger.map((row, idx) => (
                  <tr key={`${row.transactionId || idx}-ledger`} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ ...tdStyle }}>{formatDateTime(row.timestamp, row.isDateOnly)}</td>
                    <td style={{ ...tdStyle }}><MovementBadge type={row.movementType} /></td>
                    <td style={{ ...tdStyle }}>{row.referenceNo || '-'}</td>
                    <td style={{ ...tdStyle }}>{row.user || '-'}</td>
                    <td style={{ ...tdStyle }}>{row.productName || row.productCode || '-'}</td>
                    <td style={{ ...tdStyle, textAlign: 'right', color: '#0f172a' }}>{row.openingBalance}</td>
                    <td style={{ ...tdStyle, textAlign: 'right', color: '#166534' }}>{row.qtyIn}</td>
                    <td style={{ ...tdStyle, textAlign: 'right', color: '#b91c1c' }}>{row.qtyOut}</td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700 }}>{row.balanceAfterTransaction}</td>
                    {!summary.isPeriodToday && !summary.isPeriodOngoing && (
                      <td style={{ ...tdStyle, textAlign: 'right', color: '#7c3aed' }}>{row.closingBalance !== null && row.closingBalance !== undefined ? row.closingBalance : '-'}</td>
                    )}
                    <td style={{ ...tdStyle, textAlign: 'right' }}>{money(row.lineAmount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

    </div>
  );

  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      <div style={{ ...cardStyle, padding: '1.1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <div>
            <h2 style={{ margin: 0, color: '#0f172a', fontSize: '1.15rem', fontWeight: 800 }}>Inventory Activity</h2>
            <p style={{ margin: '0.35rem 0 0', color: '#64748b', fontSize: '0.85rem' }}>
              Track stock movements, sales deductions, and stock intakes from POS.
            </p>
            <p style={{ margin: '0.25rem 0 0', color: '#64748b', fontSize: '0.82rem', fontWeight: 700 }}>
              Scope: {scopeLabel}
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            {isAllLocations && (
              <span style={{ fontSize: '0.75rem', color: '#92400e', backgroundColor: '#fffbeb', padding: '0.35rem 0.65rem', borderRadius: '8px', fontWeight: 700 }}>
                <i className="fas fa-exclamation-triangle" style={{ marginRight: '0.35rem' }} />
                All Locations
              </span>
            )}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
        <button type="button" onClick={() => setActiveModal('ledger')} style={{ ...cardStyle, padding: '1.1rem', cursor: 'pointer', border: '1px solid #e2e8f0', backgroundColor: '#fff', borderRadius: '14px', textAlign: 'left', transition: 'all 0.2s' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '40px', height: '40px', borderRadius: '10px', backgroundColor: '#dcfce7', color: '#166534' }}>
              <i className="fas fa-list-ol" style={{ fontSize: '1.1rem' }} />
            </span>

            <div>
              <div style={{ color: '#0f172a', fontWeight: 800, fontSize: '0.95rem' }}>Stock Movement Ledger</div>
              <div style={{ color: '#64748b', fontSize: '0.82rem' }}>Detailed movement with running balance</div>
            </div>
          </div>

          <div style={{ color: '#5B4B8A', fontSize: '0.85rem', fontWeight: 700 }}>
            <i className="fas fa-arrow-right" style={{ marginRight: '0.42rem' }} />
            Open Ledger
          </div>
        </button>
      </div>

      {activeModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.45)', zIndex: 170, display: 'grid', placeItems: 'center', padding: modalMaximized ? '0.35rem' : '1rem' }}>
          <div style={{ ...cardStyle, width: modalMaximized ? 'calc(100vw - 0.7rem)' : 'min(1400px, 97vw)', height: modalMaximized ? 'calc(100vh - 0.7rem)' : '92vh', maxHeight: 'none', overflow: 'hidden', borderRadius: modalMaximized ? '10px' : '18px', display: 'flex', flexDirection: 'column', position: 'relative' }}>
            <div style={{ flexShrink: 0, padding: '1rem 1.1rem', borderBottom: '1px solid #e2e8f0', boxShadow: '0 4px 12px rgba(15,23,42,0.04)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                <div>
                  <h2 style={{ margin: 0, color: '#0f172a', fontSize: '1.15rem', fontWeight: 800 }}>
                    Stock Movement Ledger
                  </h2>
                  <p style={{ margin: '0.35rem 0 0', color: '#64748b', fontSize: '0.85rem' }}>
                    Chronological inventory activity with running balances
                  </p>
                  <p style={{ margin: '0.25rem 0 0', color: '#64748b', fontSize: '0.8rem', fontWeight: 700 }}>
                    Scope: {scopeLabel}
                  </p>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <button type="button" title={modalMaximized ? 'Restore' : 'Maximize'} onClick={() => setModalMaximized(!modalMaximized)} style={{ border: '1px solid #cbd5e1', backgroundColor: '#fff', color: '#334155', borderRadius: '9px', padding: '0.45rem 0.62rem', cursor: 'pointer', fontWeight: 700 }}>
                    <i className={`fas ${modalMaximized ? 'fa-window-restore' : 'fa-window-maximize'}`} />
                  </button>

                  <button type="button" onClick={closeModal} style={{ border: '1px solid #cbd5e1', backgroundColor: '#fff', color: '#334155', borderRadius: '9px', padding: '0.45rem 0.62rem', cursor: 'pointer', fontWeight: 700 }}>
                    <i className="fas fa-times" />
                  </button>
                </div>
              </div>
            </div>

            <div ref={ledgerScrollRef} style={{ flex: 1, overflow: 'auto', padding: '1rem' }}>
              {renderLedgerContent()}
            </div>

            {/* Floating scroll buttons - truly floating on modal */}
            {ledger.length > 0 && (
              <div style={{ position: 'absolute', bottom: '1.5rem', right: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', zIndex: 20 }}>
                <button
                  type="button"
                  onClick={scrollToTop}
                  title="Scroll to top"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '36px',
                    height: '36px',
                    borderRadius: '50%',
                    backgroundColor: '#5B4B8A',
                    color: '#fff',
                    border: 'none',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    fontSize: '0.9rem',
                    boxShadow: '0 2px 8px rgba(91, 75, 138, 0.25)',
                  }}
                  onMouseEnter={(e) => {
                    e.target.style.backgroundColor = '#4a3a75';
                    e.target.style.boxShadow = '0 4px 12px rgba(91, 75, 138, 0.4)';
                  }}
                  onMouseLeave={(e) => {
                    e.target.style.backgroundColor = '#5B4B8A';
                    e.target.style.boxShadow = '0 2px 8px rgba(91, 75, 138, 0.25)';
                  }}
                >
                  <i className="fas fa-arrow-up" />
                </button>
                <button
                  type="button"
                  onClick={scrollToBottom}
                  title="Scroll to bottom"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '36px',
                    height: '36px',
                    borderRadius: '50%',
                    backgroundColor: '#5B4B8A',
                    color: '#fff',
                    border: 'none',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    fontSize: '0.9rem',
                    boxShadow: '0 2px 8px rgba(91, 75, 138, 0.25)',
                  }}
                  onMouseEnter={(e) => {
                    e.target.style.backgroundColor = '#4a3a75';
                    e.target.style.boxShadow = '0 4px 12px rgba(91, 75, 138, 0.4)';
                  }}
                  onMouseLeave={(e) => {
                    e.target.style.backgroundColor = '#5B4B8A';
                    e.target.style.boxShadow = '0 2px 8px rgba(91, 75, 138, 0.25)';
                  }}
                >
                  <i className="fas fa-arrow-down" />
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const MovementBadge = ({ type }) => {
  let color, bgColor, label;

  switch (type) {
    case 'SALE':
      color = '#b91c1c';
      bgColor = '#fee2e2';
      label = 'SALE';
      break;
    case 'STOCK_IN':
      color = '#166534';
      bgColor = '#dcfce7';
      label = 'INTAKE';
      break;
    case 'EMERGENCY_SALE':
      color = '#b45309';
      bgColor = '#fef3c7';
      label = 'EMERGENCY SALE';
      break;
    case 'OPENING_BALANCE':
      color = '#4338ca';
      bgColor = '#e0e7ff';
      label = 'OPENING BALANCE';
      break;
    case 'CLOSING_BALANCE':
      color = '#7c3aed';
      bgColor = '#f3e8ff';
      label = 'CLOSING BALANCE';
      break;
    default:
      color = '#64748b';
      bgColor = '#f1f5f9';
      label = type || 'MOVEMENT';
  }

  return (
    <span style={{
      display: 'inline-flex',
      padding: '0.22rem 0.55rem',
      borderRadius: '999px',
      fontSize: '0.72rem',
      fontWeight: 900,
      color,
      background: bgColor,
    }}>
      {label}
    </span>
  );
};

function formatDateTime(value, isDateOnly = false) {
  if (!value) return '-';

  // For historical date-only entries, show only the date without "(Date only)" text
  if (isDateOnly) {
    if (typeof value === 'string') {
      const isoMatch = value.match(/^([0-9]{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?)?(?:Z|[+-]\d{2}:?\d{2})?$/);
      if (isoMatch) {
        const [, year, month, day] = isoMatch;
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const monthName = monthNames[Number(month) - 1] || month;
        return `${day} ${monthName} ${year}`;
      }
    }

    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleString('en-GB', {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
      });
    }

    return String(value);
  }

  if (typeof value === 'string') {
    const text = value.trim();

    const timeOnlyMatch = text.match(/^(\d{2}):(\d{2})(?::\d{2})?$/);
    if (timeOnlyMatch) {
      return `${timeOnlyMatch[1]}:${timeOnlyMatch[2]}`;
    }

    const isoMatch = text.match(/^([0-9]{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?)?(?:Z|[+-]\d{2}:?\d{2})?$/);
    if (isoMatch) {
      const [, year, month, day, hour = '00', minute = '00'] = isoMatch;
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const monthName = monthNames[Number(month) - 1] || month;
      return `${day} ${monthName} ${year} ${hour}:${minute}`;
    }
  }

  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);

  return d.toLocaleString('en-GB', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default InventoryActivityLedger;