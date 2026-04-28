import React, { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../../../utils/api.js';

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

// Debounce hook for text inputs
function useDebounce(value, delay) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

const InventoryActivityLedger = ({ selectedLocationId, selectedLocationCode }) => {
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  // Filter states
  const [periodType, setPeriodType] = useState('day');
  const [date, setDate] = useState(today.toISOString().slice(0, 10));
  const [month, setMonth] = useState(currentMonth);
  const [year, setYear] = useState(currentYear);
  const [startDate, setStartDate] = useState(today.toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(today.toISOString().slice(0, 10));

  const [productCode, setProductCode] = useState('');
  const [productName, setProductName] = useState('');
  const [movementType, setMovementType] = useState('');

  // Debounce product inputs
  const debouncedProductCode = useDebounce(productCode, 400);
  const debouncedProductName = useDebounce(productName, 400);

  // Modal states
  const [isSummaryModalOpen, setIsSummaryModalOpen] = useState(false);
  const [isSummaryModalMaximized, setIsSummaryModalMaximized] = useState(false);
  const [isLedgerModalOpen, setIsLedgerModalOpen] = useState(false);
  const [isLedgerModalMaximized, setIsLedgerModalMaximized] = useState(false);
  const [isVarianceModalOpen, setIsVarianceModalOpen] = useState(false);
  const [isVarianceModalMaximized, setIsVarianceModalMaximized] = useState(false);

  const isAllLocations = !selectedLocationId && !selectedLocationCode;

  const params = useMemo(() => {
    const next = {
      periodType,
      locationId: selectedLocationId || undefined,
      locationCode: selectedLocationCode || undefined,
      productCode: debouncedProductCode.trim() || undefined,
      productName: debouncedProductName.trim() || undefined,
      movementType: movementType || undefined,
    };

    if (periodType === 'day') next.date = date;
    if (periodType === 'month') {
      next.month = month;
      next.year = year;
    }
    if (periodType === 'year') next.year = year;
    if (periodType === 'custom') {
      next.startDate = startDate;
      next.endDate = endDate;
    }

    return next;
  }, [periodType, date, month, year, startDate, endDate, selectedLocationId, selectedLocationCode, debouncedProductCode, debouncedProductName, movementType]);

  const fetchData = useCallback(async (showRefreshing = false) => {
    try {
      if (showRefreshing) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError('');

      const res = await api.get('/business-operations/inventory-activity/ledger', { params });
      setData(res.data.data);
    } catch (err) {
      console.error(err);
      setError(err?.response?.data?.error || 'Failed to load inventory activity.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [params]);

  // Auto-fetch on filter changes
  useEffect(() => {
    fetchData(true);
  }, [params.periodType, params.date, params.month, params.year, params.startDate, params.endDate, params.locationId, params.locationCode, params.movementType]);

  // Fetch on debounced product changes
  useEffect(() => {
    fetchData(true);
  }, [debouncedProductCode, debouncedProductName]);

  // Initial fetch
  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLocationId, selectedLocationCode]);

  const clearFilters = () => {
    setProductCode('');
    setProductName('');
    setMovementType('');
    setPeriodType('day');
    setDate(today.toISOString().slice(0, 10));
    setMonth(currentMonth);
    setYear(currentYear);
    setStartDate(today.toISOString().slice(0, 10));
    setEndDate(today.toISOString().slice(0, 10));
  };

  const viewLedger = (row) => {
    if (row.productCode) {
      setProductCode(row.productCode);
    } else {
      setProductName(row.productName);
    }
    setIsSummaryModalOpen(false);
    setIsLedgerModalOpen(true);
  };

  const openSummaryModal = () => {
    setIsSummaryModalMaximized(false);
    setIsSummaryModalOpen(true);
  };

  const openLedgerModal = () => {
    setIsLedgerModalMaximized(false);
    setIsLedgerModalOpen(true);
  };

  const openVarianceModal = () => {
    setIsVarianceModalMaximized(false);
    setIsVarianceModalOpen(true);
  };

  const exportCSV = () => {
    if (!data) return;

    const isLedgerMode = data?.mode === 'ledger';
    const rows = isLedgerMode ? data?.movements || [] : data?.products || [];
    
    if (rows.length === 0) return;

    let csvContent = '';
    
    if (isLedgerMode) {
      csvContent = 'Time,Type,Reference,Cashier/Entered By,Product,Qty In,Qty Out,Running Balance,Amount,Location\n';
      rows.forEach(m => {
        csvContent += `"${formatDateTime(m.movementDate)}","${m.movementType}","${m.referenceNo || ''}","${m.cashierName || ''}","${m.productName || m.productCode || ''}",${m.qtyIn},${m.qtyOut},${m.runningBalance},${m.lineAmount},"${m.locationCode || ''}"\n`;
      });
    } else {
      csvContent = 'Product Code,Product Name,Qty In,Qty Out,Net Movement,Sales Amount,Movements\n';
      rows.forEach(row => {
        csvContent += `"${row.productCode || ''}","${row.productName || ''}",${row.totalQtyIn},${row.totalQtyOut},${row.netMovement},${row.totalSalesAmount || 0},${row.movementCount}\n`;
      });
    }

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const fileName = `inventory-activity-${isLedgerMode ? 'ledger' : 'summary'}-${periodType}-${productCode || 'all-products'}-${selectedLocationCode || 'all-locations'}.csv`;
    link.href = URL.createObjectURL(blob);
    link.download = fileName;
    link.click();
  };

  // Keyboard handler for Escape
  useEffect(() => {
    if (!isSummaryModalOpen && !isLedgerModalOpen && !isVarianceModalOpen) return;
    const handler = (event) => {
      if (event.key === 'Escape') {
        setIsSummaryModalOpen(false);
        setIsLedgerModalOpen(false);
        setIsVarianceModalOpen(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isSummaryModalOpen, isLedgerModalOpen, isVarianceModalOpen]);

  const summary = data?.summary || {};
  const movements = data?.movements || [];
  const groupedProducts = data?.products || [];
  const isLedgerMode = data?.mode === 'ledger';
  const dataQuality = data?.dataQuality || {};
  const hasProductFilter = productCode.trim() || productName.trim();

  const showLocationWarning = isAllLocations && hasProductFilter && isLedgerMode;

  // KPI cards data
  const kpiData = useMemo(() => [
    { label: 'Opening Stock', value: summary.openingBalance ?? '-', color: '#0f172a' },
    { label: 'Qty In', value: summary.totalQtyIn ?? 0, color: '#166534' },
    { label: 'Qty Out', value: summary.totalQtyOut ?? 0, color: '#b91c1c' },
    { label: 'Closing Stock', value: summary.calculatedClosingBalance ?? '-', color: '#0f172a' },
    { label: 'Current POS Stock', value: summary.currentProductStock ?? '-', color: '#0f172a' },
    { label: 'Variance', value: summary.variance ?? '-', color: summary.variance !== null && Number(summary.variance) !== 0 ? '#b91c1c' : '#0f172a' },
  ], [summary]);

  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      {/* Compact Header */}
      <div style={{ ...cardStyle, padding: '1.05rem 1.1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <div>
            <h2 style={{ margin: 0, color: '#0f172a', fontSize: '1.15rem', fontWeight: 800 }}>Inventory Activity Workspace</h2>
            <p style={{ margin: '0.35rem 0 0', color: '#64748b', fontSize: '0.85rem' }}>
              Track stock movement, sales deductions, stock intakes, and running balances.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            {isAllLocations && (
              <span style={{ fontSize: '0.75rem', color: '#92400e', backgroundColor: '#fffbeb', padding: '0.35rem 0.65rem', borderRadius: '8px', fontWeight: 700 }}>
                <i className="fas fa-exclamation-triangle" style={{ marginRight: '0.35rem' }} />
                All Locations
              </span>
            )}
            <button
              type="button"
              onClick={() => fetchData()}
              disabled={loading}
              style={{
                border: '1px solid #cbd5e1',
                backgroundColor: '#fff',
                color: '#334155',
                borderRadius: '10px',
                padding: '0.55rem 0.8rem',
                fontWeight: 700,
                fontSize: '0.86rem',
                cursor: loading ? 'not-allowed' : 'pointer',
              }}
            >
              <i className={`fas ${loading ? 'fa-spinner fa-spin' : 'fa-rotate-right'}`} style={{ marginRight: '0.42rem' }} />
              {refreshing ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>
        </div>
      </div>

      {/* Filter Card */}
      <div style={{ ...cardStyle, padding: '1rem 1.1rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.75rem' }}>
          <div>
            <label style={labelStyle}>Period</label>
            <select value={periodType} onChange={(e) => setPeriodType(e.target.value)} style={inputStyle}>
              <option value="day">Day</option>
              <option value="month">Month</option>
              <option value="year">Year</option>
              <option value="custom">Custom Range</option>
            </select>
          </div>

          {periodType === 'day' && (
            <div>
              <label style={labelStyle}>Date</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={inputStyle} />
            </div>
          )}

          {periodType === 'month' && (
            <>
              <div>
                <label style={labelStyle}>Month</label>
                <input type="number" min="1" max="12" value={month} onChange={(e) => setMonth(e.target.value)} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Year</label>
                <input type="number" value={year} onChange={(e) => setYear(e.target.value)} style={inputStyle} />
              </div>
            </>
          )}

          {periodType === 'year' && (
            <div>
              <label style={labelStyle}>Year</label>
              <input type="number" value={year} onChange={(e) => setYear(e.target.value)} style={inputStyle} />
            </div>
          )}

          {periodType === 'custom' && (
            <>
              <div>
                <label style={labelStyle}>Start Date</label>
                <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>End Date</label>
                <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} style={inputStyle} />
              </div>
            </>
          )}

          <div>
            <label style={labelStyle}>Product Code</label>
            <div style={{ position: 'relative' }}>
              <input 
                value={productCode} 
                onChange={(e) => setProductCode(e.target.value)} 
                placeholder="Barcode/Code" 
                style={{ ...inputStyle, paddingRight: '2rem' }} 
              />
              {productCode && (
                <button
                  type="button"
                  onClick={() => setProductCode('')}
                  style={{
                    position: 'absolute',
                    right: '0.6rem',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    border: 'none',
                    background: 'none',
                    color: '#94a3b8',
                    cursor: 'pointer',
                    padding: '0.25rem',
                  }}
                >
                  <i className="fas fa-times-circle" />
                </button>
              )}
            </div>
          </div>

          <div>
            <label style={labelStyle}>Product Name</label>
            <div style={{ position: 'relative' }}>
              <input 
                value={productName} 
                onChange={(e) => setProductName(e.target.value)} 
                placeholder="Search name" 
                style={{ ...inputStyle, paddingRight: '2rem' }} 
              />
              {productName && (
                <button
                  type="button"
                  onClick={() => setProductName('')}
                  style={{
                    position: 'absolute',
                    right: '0.6rem',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    border: 'none',
                    background: 'none',
                    color: '#94a3b8',
                    cursor: 'pointer',
                    padding: '0.25rem',
                  }}
                >
                  <i className="fas fa-times-circle" />
                </button>
              )}
            </div>
          </div>

          <div>
            <label style={labelStyle}>Movement Type</label>
            <select value={movementType} onChange={(e) => setMovementType(e.target.value)} style={inputStyle}>
              <option value="">All Movements</option>
              <option value="SALE">Sales Only</option>
              <option value="STOCK_INTAKE">Stock Intake Only</option>
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <button
              type="button"
              onClick={clearFilters}
              style={{
                border: '1px solid #cbd5e1',
                backgroundColor: '#fff',
                color: '#475569',
                borderRadius: '10px',
                padding: '0.65rem 0.8rem',
                fontWeight: 700,
                fontSize: '0.86rem',
                cursor: 'pointer',
                width: '100%',
              }}
            >
              <i className="fas fa-times" style={{ marginRight: '0.42rem' }} />
              Clear
            </button>
          </div>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div style={{ ...cardStyle, padding: '0.9rem 1rem', color: '#b91c1c', backgroundColor: '#fff1f2', borderColor: '#fecaca' }}>
          {error}
        </div>
      )}

      {/* Data Quality Warning */}
      {dataQuality.warning && (
        <div style={{ 
          ...cardStyle, 
          padding: '0.85rem 1rem', 
          color: dataQuality.level === 'danger' ? '#b91c1c' : '#92400e', 
          backgroundColor: dataQuality.level === 'danger' ? '#fef2f2' : '#fffbeb', 
          borderColor: dataQuality.level === 'danger' ? '#fecaca' : '#fde68a' 
        }}>
          <i className="fas fa-exclamation-triangle" style={{ marginRight: '0.42rem' }} />
          {dataQuality.warning}
        </div>
      )}

      {/* Location Warning */}
      {showLocationWarning && (
        <div style={{ ...cardStyle, padding: '0.85rem 1rem', color: '#92400e', backgroundColor: '#fffbeb', borderColor: '#fde68a' }}>
          <i className="fas fa-exclamation-triangle" style={{ marginRight: '0.42rem' }} />
          Select a specific location for accurate running balance. Stock is location-specific and cannot be combined.
        </div>
      )}

      {/* Launcher Cards */}
      <div style={{ ...cardStyle, padding: '1rem 1.1rem' }}>
        <div style={{ display: 'grid', gap: '0.78rem' }}>
          <div>
            <strong style={{ color: '#0f172a' }}>Inventory Activity Workspaces</strong>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '0.75rem' }}>
            {/* Product Movement Summary */}
            <button
              type="button"
              onClick={openSummaryModal}
              onMouseEnter={(event) => {
                event.currentTarget.style.transform = 'translateY(-2px)';
                event.currentTarget.style.boxShadow = '0 12px 24px rgba(15, 23, 42, 0.12)';
                event.currentTarget.style.borderColor = '#cbd5e1';
                event.currentTarget.style.backgroundColor = '#f8fafc';
              }}
              onMouseLeave={(event) => {
                event.currentTarget.style.transform = 'translateY(0)';
                event.currentTarget.style.boxShadow = '0 6px 18px rgba(15, 23, 42, 0.04)';
                event.currentTarget.style.borderColor = '#e2e8f0';
                event.currentTarget.style.backgroundColor = '#fff';
              }}
              style={{ border: '1px solid #e2e8f0', backgroundColor: '#fff', borderRadius: '14px', padding: '0.95rem 1rem', cursor: 'pointer', textAlign: 'left', display: 'grid', gap: '0.42rem', boxShadow: '0 6px 18px rgba(15, 23, 42, 0.04)', transition: 'transform 0.16s ease, box-shadow 0.16s ease, border-color 0.16s ease, background-color 0.16s ease' }}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '34px', height: '34px', borderRadius: '10px', backgroundColor: '#e0e7ff', color: '#4338ca' }}>
                <i className="fas fa-boxes-stacked" />
              </span>
              <span style={{ color: '#0f172a', fontWeight: 800, fontSize: '0.95rem' }}>Product Movement Summary</span>
              <span style={{ color: '#64748b', fontSize: '0.82rem', lineHeight: 1.45 }}>View aggregated stock movement by product across the selected period.</span>
            </button>

            {/* Stock Movement Ledger */}
            <button
              type="button"
              onClick={openLedgerModal}
              onMouseEnter={(event) => {
                event.currentTarget.style.transform = 'translateY(-2px)';
                event.currentTarget.style.boxShadow = '0 12px 24px rgba(15, 23, 42, 0.12)';
                event.currentTarget.style.borderColor = '#cbd5e1';
                event.currentTarget.style.backgroundColor = '#f8fafc';
              }}
              onMouseLeave={(event) => {
                event.currentTarget.style.transform = 'translateY(0)';
                event.currentTarget.style.boxShadow = '0 6px 18px rgba(15, 23, 42, 0.04)';
                event.currentTarget.style.borderColor = '#e2e8f0';
                event.currentTarget.style.backgroundColor = '#fff';
              }}
              style={{ border: '1px solid #e2e8f0', backgroundColor: '#fff', borderRadius: '14px', padding: '0.95rem 1rem', cursor: 'pointer', textAlign: 'left', display: 'grid', gap: '0.42rem', boxShadow: '0 6px 18px rgba(15, 23, 42, 0.04)', transition: 'transform 0.16s ease, box-shadow 0.16s ease, border-color 0.16s ease, background-color 0.16s ease' }}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '34px', height: '34px', borderRadius: '10px', backgroundColor: '#dcfce7', color: '#166534' }}>
                <i className="fas fa-list-ol" />
              </span>
              <span style={{ color: '#0f172a', fontWeight: 800, fontSize: '0.95rem' }}>Stock Movement Ledger</span>
              <span style={{ color: '#64748b', fontSize: '0.82rem', lineHeight: 1.45 }}>Detailed invoice-by-invoice and intake-by-intake stock activity with running balance.</span>
            </button>

            {/* Variance / Balance Review */}
            <button
              type="button"
              onClick={openVarianceModal}
              onMouseEnter={(event) => {
                event.currentTarget.style.transform = 'translateY(-2px)';
                event.currentTarget.style.boxShadow = '0 12px 24px rgba(15, 23, 42, 0.12)';
                event.currentTarget.style.borderColor = '#cbd5e1';
                event.currentTarget.style.backgroundColor = '#f8fafc';
              }}
              onMouseLeave={(event) => {
                event.currentTarget.style.transform = 'translateY(0)';
                event.currentTarget.style.boxShadow = '0 6px 18px rgba(15, 23, 42, 0.04)';
                event.currentTarget.style.borderColor = '#e2e8f0';
                event.currentTarget.style.backgroundColor = '#fff';
              }}
              style={{ border: '1px solid #e2e8f0', backgroundColor: '#fff', borderRadius: '14px', padding: '0.95rem 1rem', cursor: 'pointer', textAlign: 'left', display: 'grid', gap: '0.42rem', boxShadow: '0 6px 18px rgba(15, 23, 42, 0.04)', transition: 'transform 0.16s ease, box-shadow 0.16s ease, border-color 0.16s ease, background-color 0.16s ease' }}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '34px', height: '34px', borderRadius: '10px', backgroundColor: '#fef3c7', color: '#d97706' }}>
                <i className="fas fa-scale-balanced" />
              </span>
              <span style={{ color: '#0f172a', fontWeight: 800, fontSize: '0.95rem' }}>Variance / Balance Review</span>
              <span style={{ color: '#64748b', fontSize: '0.82rem', lineHeight: 1.45 }}>Review data quality, opening balance method, and POS stock vs calculated closing.</span>
            </button>

            {/* Export Activity Report */}
            <button
              type="button"
              onClick={exportCSV}
              disabled={loading || (isLedgerMode ? movements.length === 0 : groupedProducts.length === 0)}
              onMouseEnter={(event) => {
                if (loading || (isLedgerMode ? movements.length === 0 : groupedProducts.length === 0)) return;
                event.currentTarget.style.transform = 'translateY(-2px)';
                event.currentTarget.style.boxShadow = '0 12px 24px rgba(15, 23, 42, 0.12)';
                event.currentTarget.style.borderColor = '#cbd5e1';
                event.currentTarget.style.backgroundColor = '#f8fafc';
              }}
              onMouseLeave={(event) => {
                event.currentTarget.style.transform = 'translateY(0)';
                event.currentTarget.style.boxShadow = '0 6px 18px rgba(15, 23, 42, 0.04)';
                event.currentTarget.style.borderColor = '#e2e8f0';
                event.currentTarget.style.backgroundColor = '#fff';
              }}
              style={{ border: '1px solid #e2e8f0', backgroundColor: '#fff', borderRadius: '14px', padding: '0.95rem 1rem', cursor: (loading || (isLedgerMode ? movements.length === 0 : groupedProducts.length === 0)) ? 'not-allowed' : 'pointer', textAlign: 'left', display: 'grid', gap: '0.42rem', boxShadow: '0 6px 18px rgba(15, 23, 42, 0.04)', transition: 'transform 0.16s ease, box-shadow 0.16s ease, border-color 0.16s ease, background-color 0.16s ease', opacity: (loading || (isLedgerMode ? movements.length === 0 : groupedProducts.length === 0)) ? 0.6 : 1 }}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '34px', height: '34px', borderRadius: '10px', backgroundColor: '#f3e8ff', color: '#7c3aed' }}>
                <i className="fas fa-download" />
              </span>
              <span style={{ color: '#0f172a', fontWeight: 800, fontSize: '0.95rem' }}>Export Activity Report</span>
              <span style={{ color: '#64748b', fontSize: '0.82rem', lineHeight: 1.45 }}>Download current data as CSV file with period, location, and product details.</span>
            </button>
          </div>
        </div>
      </div>

      {/* Summary Modal */}
      {isSummaryModalOpen && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.45)', zIndex: 170, display: 'grid', placeItems: 'center', padding: isSummaryModalMaximized ? '0.35rem' : '1rem' }}>
          <div style={{ ...cardStyle, width: isSummaryModalMaximized ? 'calc(100vw - 0.7rem)' : 'min(1400px, 97vw)', height: isSummaryModalMaximized ? 'calc(100vh - 0.7rem)' : '92vh', maxHeight: 'none', overflow: 'hidden', borderRadius: isSummaryModalMaximized ? '10px' : '18px', display: 'flex', flexDirection: 'column' }}>
            <div style={{ flexShrink: 0, padding: '1rem 1.1rem', borderBottom: '1px solid #e2e8f0', boxShadow: '0 4px 12px rgba(15,23,42,0.04)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                <div>
                  <h2 style={{ margin: 0, color: '#0f172a', fontSize: '1.15rem', fontWeight: 800 }}>Product Movement Summary</h2>
                  <p style={{ margin: '0.35rem 0 0', color: '#64748b', fontSize: '0.85rem' }}>
                    Aggregated stock movement by product across the selected period.
                  </p>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <button
                    type="button"
                    onClick={exportCSV}
                    disabled={loading || groupedProducts.length === 0}
                    style={{ border: '1px solid #cbd5e1', backgroundColor: '#fff', color: '#334155', borderRadius: '10px', padding: '0.55rem 0.8rem', fontWeight: 700, fontSize: '0.86rem', cursor: 'pointer' }}
                  >
                    <i className="fas fa-download" style={{ marginRight: '0.42rem' }} />
                    Export CSV
                  </button>
                  <button
                    type="button"
                    title={isSummaryModalMaximized ? 'Restore' : 'Maximize'}
                    onClick={() => setIsSummaryModalMaximized((prev) => !prev)}
                    style={{ border: '1px solid #cbd5e1', backgroundColor: '#fff', color: '#334155', borderRadius: '9px', padding: '0.45rem 0.62rem', cursor: 'pointer', fontWeight: 700 }}
                  >
                    <i className={`fas ${isSummaryModalMaximized ? 'fa-window-restore' : 'fa-window-maximize'}`} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsSummaryModalOpen(false)}
                    style={{ border: '1px solid #cbd5e1', backgroundColor: '#fff', color: '#334155', borderRadius: '9px', padding: '0.45rem 0.62rem', cursor: 'pointer', fontWeight: 700 }}
                  >
                    <i className="fas fa-times" />
                  </button>
                </div>
              </div>
            </div>
            <div style={{ flex: 1, overflow: 'auto', padding: '1rem' }}>
              {loading ? (
                <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>
                  <i className="fas fa-spinner fa-spin" style={{ marginRight: '0.5rem' }} />
                  Loading...
                </div>
              ) : groupedProducts.length === 0 ? (
                <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>
                  <i className="fas fa-box-open" style={{ fontSize: '2rem', marginBottom: '0.5rem', display: 'block' }} />
                  No inventory activity found.
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
                  <thead>
                    <tr>
                      <Th>Product Code</Th>
                      <Th>Product Name</Th>
                      <Th align="right">Qty In</Th>
                      <Th align="right">Qty Out</Th>
                      <Th align="right">Net Movement</Th>
                      <Th align="right">Sales Amount</Th>
                      <Th align="right">Movements</Th>
                      <Th>Action</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {groupedProducts.map((row, index) => (
                      <tr key={`${row.productCode || row.productName}-${index}`}>
                        <Td>{row.productCode || '-'}</Td>
                        <Td>{row.productName || '-'}</Td>
                        <Td align="right">{row.totalQtyIn}</Td>
                        <Td align="right">{row.totalQtyOut}</Td>
                        <Td align="right" style={{ color: row.netMovement > 0 ? '#166534' : row.netMovement < 0 ? '#b91c1c' : '#0f172a' }}>
                          {row.netMovement > 0 ? '+' : ''}{row.netMovement}
                        </Td>
                        <Td align="right">{money(row.totalSalesAmount)}</Td>
                        <Td align="right">{row.movementCount}</Td>
                        <Td>
                          <button
                            type="button"
                            onClick={() => viewLedger(row)}
                            style={{
                              border: 'none',
                              backgroundColor: '#5B4B8A',
                              color: '#fff',
                              borderRadius: '6px',
                              padding: '0.35rem 0.65rem',
                              fontSize: '0.75rem',
                              fontWeight: 800,
                              cursor: 'pointer',
                            }}
                          >
                            View Ledger
                          </button>
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Ledger Modal */}
      {isLedgerModalOpen && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.45)', zIndex: 170, display: 'grid', placeItems: 'center', padding: isLedgerModalMaximized ? '0.35rem' : '1rem' }}>
          <div style={{ ...cardStyle, width: isLedgerModalMaximized ? 'calc(100vw - 0.7rem)' : 'min(1400px, 97vw)', height: isLedgerModalMaximized ? 'calc(100vh - 0.7rem)' : '92vh', maxHeight: 'none', overflow: 'hidden', borderRadius: isLedgerModalMaximized ? '10px' : '18px', display: 'flex', flexDirection: 'column' }}>
            <div style={{ flexShrink: 0, padding: '1rem 1.1rem', borderBottom: '1px solid #e2e8f0', boxShadow: '0 4px 12px rgba(15,23,42,0.04)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                <div>
                  <h2 style={{ margin: 0, color: '#0f172a', fontSize: '1.15rem', fontWeight: 800 }}>Stock Movement Ledger</h2>
                  <p style={{ margin: '0.35rem 0 0', color: '#64748b', fontSize: '0.85rem' }}>
                    Invoice-by-invoice and intake-by-intake stock activity with running balance.
                  </p>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <button
                    type="button"
                    onClick={exportCSV}
                    disabled={loading || movements.length === 0}
                    style={{ border: '1px solid #cbd5e1', backgroundColor: '#fff', color: '#334155', borderRadius: '10px', padding: '0.55rem 0.8rem', fontWeight: 700, fontSize: '0.86rem', cursor: 'pointer' }}
                  >
                    <i className="fas fa-download" style={{ marginRight: '0.42rem' }} />
                    Export CSV
                  </button>
                  <button
                    type="button"
                    title={isLedgerModalMaximized ? 'Restore' : 'Maximize'}
                    onClick={() => setIsLedgerModalMaximized((prev) => !prev)}
                    style={{ border: '1px solid #cbd5e1', backgroundColor: '#fff', color: '#334155', borderRadius: '9px', padding: '0.45rem 0.62rem', cursor: 'pointer', fontWeight: 700 }}
                  >
                    <i className={`fas ${isLedgerModalMaximized ? 'fa-window-restore' : 'fa-window-maximize'}`} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsLedgerModalOpen(false)}
                    style={{ border: '1px solid #cbd5e1', backgroundColor: '#fff', color: '#334155', borderRadius: '9px', padding: '0.45rem 0.62rem', cursor: 'pointer', fontWeight: 700 }}
                  >
                    <i className="fas fa-times" />
                  </button>
                </div>
              </div>
            </div>
            <div style={{ flex: 1, overflow: 'auto', padding: '1rem', display: 'grid', gap: '1rem' }}>
              {/* KPI Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.75rem' }}>
                {kpiData.map((kpi, idx) => (
                  <div key={idx} style={{ ...cardStyle, padding: '0.9rem 1rem' }}>
                    <div style={{ color: '#64748b', fontSize: '0.76rem', textTransform: 'uppercase', fontWeight: 800, letterSpacing: '0.05em' }}>{kpi.label}</div>
                    <div style={{ marginTop: '0.35rem', fontSize: '1.25rem', fontWeight: 800, color: kpi.color }}>{kpi.value}</div>
                  </div>
                ))}
              </div>

              {/* Movement Table */}
              {loading ? (
                <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>
                  <i className="fas fa-spinner fa-spin" style={{ marginRight: '0.5rem' }} />
                  Loading...
                </div>
              ) : movements.length === 0 ? (
                <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>
                  <i className="fas fa-box-open" style={{ fontSize: '2rem', marginBottom: '0.5rem', display: 'block' }} />
                  No stock movement found.
                </div>
              ) : (
                <div style={{ ...cardStyle, overflow: 'hidden' }}>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
                      <thead>
                        <tr>
                          <Th>Time</Th>
                          <Th>Type</Th>
                          <Th>Reference</Th>
                          <Th>Cashier / Entered By</Th>
                          <Th>Product</Th>
                          <Th align="right">Qty In</Th>
                          <Th align="right">Qty Out</Th>
                          <Th align="right">Balance</Th>
                          <Th align="right">Amount</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {movements.map((m, index) => (
                          <tr key={`${m.referenceNo || 'movement'}-${index}`}>
                            <Td>{formatDateTime(m.movementDate)}</Td>
                            <Td><MovementBadge type={m.movementType} /></Td>
                            <Td>{m.referenceNo || '-'}</Td>
                            <Td>{m.cashierName || '-'}</Td>
                            <Td>{m.productName || m.productCode || '-'}</Td>
                            <Td align="right">{m.qtyIn}</Td>
                            <Td align="right">{m.qtyOut}</Td>
                            <Td align="right"><strong>{m.runningBalance}</strong></Td>
                            <Td align="right">{money(m.lineAmount)}</Td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Variance Modal */}
      {isVarianceModalOpen && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.45)', zIndex: 170, display: 'grid', placeItems: 'center', padding: isVarianceModalMaximized ? '0.35rem' : '1rem' }}>
          <div style={{ ...cardStyle, width: isVarianceModalMaximized ? 'calc(100vw - 0.7rem)' : 'min(900px, 97vw)', height: isVarianceModalMaximized ? 'calc(100vh - 0.7rem)' : 'auto', maxHeight: '90vh', overflow: 'hidden', borderRadius: isVarianceModalMaximized ? '10px' : '18px', display: 'flex', flexDirection: 'column' }}>
            <div style={{ flexShrink: 0, padding: '1rem 1.1rem', borderBottom: '1px solid #e2e8f0', boxShadow: '0 4px 12px rgba(15,23,42,0.04)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                <div>
                  <h2 style={{ margin: 0, color: '#0f172a', fontSize: '1.15rem', fontWeight: 800 }}>Variance / Balance Review</h2>
                  <p style={{ margin: '0.35rem 0 0', color: '#64748b', fontSize: '0.85rem' }}>
                    Data quality, opening balance method, and POS stock vs calculated closing.
                  </p>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <button
                    type="button"
                    title={isVarianceModalMaximized ? 'Restore' : 'Maximize'}
                    onClick={() => setIsVarianceModalMaximized((prev) => !prev)}
                    style={{ border: '1px solid #cbd5e1', backgroundColor: '#fff', color: '#334155', borderRadius: '9px', padding: '0.45rem 0.62rem', cursor: 'pointer', fontWeight: 700 }}
                  >
                    <i className={`fas ${isVarianceModalMaximized ? 'fa-window-restore' : 'fa-window-maximize'}`} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsVarianceModalOpen(false)}
                    style={{ border: '1px solid #cbd5e1', backgroundColor: '#fff', color: '#334155', borderRadius: '9px', padding: '0.45rem 0.62rem', cursor: 'pointer', fontWeight: 700 }}
                  >
                    <i className="fas fa-times" />
                  </button>
                </div>
              </div>
            </div>
            <div style={{ flex: 1, overflow: 'auto', padding: '1.5rem', display: 'grid', gap: '1.25rem' }}>
              {/* Data Quality Info */}
              <div style={{ ...cardStyle, padding: '1.1rem' }}>
                <h3 style={{ margin: '0 0 0.75rem', color: '#0f172a', fontSize: '1rem', fontWeight: 800 }}>Data Quality Assessment</h3>
                <div style={{ display: 'grid', gap: '0.65rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: '1px solid #f1f5f9' }}>
                    <span style={{ color: '#64748b' }}>Quality Level</span>
                    <span style={{ 
                      color: dataQuality.level === 'ok' ? '#166534' : dataQuality.level === 'warning' ? '#d97706' : '#b91c1c',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      fontSize: '0.85rem',
                    }}>
                      {dataQuality.level || 'unknown'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: '1px solid #f1f5f9' }}>
                    <span style={{ color: '#64748b' }}>Opening Balance Method</span>
                    <span style={{ color: '#0f172a', fontWeight: 600 }}>{dataQuality.openingBalanceMethod || '-'}</span>
                  </div>
                </div>
                {dataQuality.warning && (
                  <div style={{ marginTop: '1rem', padding: '0.85rem', backgroundColor: '#fffbeb', borderRadius: '8px', color: '#92400e', fontSize: '0.88rem' }}>
                    <i className="fas fa-info-circle" style={{ marginRight: '0.42rem' }} />
                    {dataQuality.warning}
                  </div>
                )}
              </div>

              {/* Stock Comparison */}
              <div style={{ ...cardStyle, padding: '1.1rem' }}>
                <h3 style={{ margin: '0 0 0.75rem', color: '#0f172a', fontSize: '1rem', fontWeight: 800 }}>Stock Comparison</h3>
                <div style={{ display: 'grid', gap: '0.65rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: '1px solid #f1f5f9' }}>
                    <span style={{ color: '#64748b' }}>Current POS Stock</span>
                    <span style={{ color: '#0f172a', fontWeight: 700 }}>{summary.currentProductStock ?? 'Not Found'}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: '1px solid #f1f5f9' }}>
                    <span style={{ color: '#64748b' }}>Calculated Closing Stock</span>
                    <span style={{ color: '#0f172a', fontWeight: 700 }}>{summary.calculatedClosingBalance ?? '-'}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: '1px solid #f1f5f9' }}>
                    <span style={{ color: '#64748b' }}>Variance</span>
                    <span style={{ 
                      color: summary.variance !== null && Number(summary.variance) !== 0 ? '#b91c1c' : '#166534',
                      fontWeight: 700,
                    }}>
                      {summary.variance ?? '-'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Movement Summary */}
              <div style={{ ...cardStyle, padding: '1.1rem' }}>
                <h3 style={{ margin: '0 0 0.75rem', color: '#0f172a', fontSize: '1rem', fontWeight: 800 }}>Movement Summary</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem' }}>
                  <div style={{ padding: '0.85rem', backgroundColor: '#f8fafc', borderRadius: '10px', textAlign: 'center' }}>
                    <div style={{ color: '#64748b', fontSize: '0.76rem', textTransform: 'uppercase', fontWeight: 800 }}>Opening</div>
                    <div style={{ marginTop: '0.35rem', fontSize: '1.15rem', fontWeight: 800, color: '#0f172a' }}>{summary.openingBalance ?? '-'}</div>
                  </div>
                  <div style={{ padding: '0.85rem', backgroundColor: '#f0fdf4', borderRadius: '10px', textAlign: 'center' }}>
                    <div style={{ color: '#64748b', fontSize: '0.76rem', textTransform: 'uppercase', fontWeight: 800 }}>Qty In</div>
                    <div style={{ marginTop: '0.35rem', fontSize: '1.15rem', fontWeight: 800, color: '#166534' }}>{summary.totalQtyIn ?? 0}</div>
                  </div>
                  <div style={{ padding: '0.85rem', backgroundColor: '#fef2f2', borderRadius: '10px', textAlign: 'center' }}>
                    <div style={{ color: '#64748b', fontSize: '0.76rem', textTransform: 'uppercase', fontWeight: 800 }}>Qty Out</div>
                    <div style={{ marginTop: '0.35rem', fontSize: '1.15rem', fontWeight: 800, color: '#b91c1c' }}>{summary.totalQtyOut ?? 0}</div>
                  </div>
                  <div style={{ padding: '0.85rem', backgroundColor: '#f8fafc', borderRadius: '10px', textAlign: 'center' }}>
                    <div style={{ color: '#64748b', fontSize: '0.76rem', textTransform: 'uppercase', fontWeight: 800 }}>Movements</div>
                    <div style={{ marginTop: '0.35rem', fontSize: '1.15rem', fontWeight: 800, color: '#0f172a' }}>{summary.movementCount ?? 0}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const labelStyle = {
  display: 'block',
  fontSize: '0.76rem',
  color: '#475569',
  fontWeight: 800,
  marginBottom: '0.35rem',
  textTransform: 'uppercase',
};

const Th = ({ children, align = 'left' }) => (
  <th style={{ textAlign: align, padding: '0.75rem 0.85rem', borderBottom: '1px solid #e2e8f0', color: '#334155', background: '#f8fafc', fontWeight: 800, fontSize: '0.82rem' }}>
    {children}
  </th>
);

const Td = ({ children, align = 'left' }) => (
  <td style={{ textAlign: align, padding: '0.72rem 0.85rem', borderBottom: '1px solid #f1f5f9', color: '#0f172a' }}>
    {children}
  </td>
);

const MovementBadge = ({ type }) => {
  const isSale = type === 'SALE';
  return (
    <span style={{
      display: 'inline-flex',
      padding: '0.22rem 0.55rem',
      borderRadius: '999px',
      fontSize: '0.72rem',
      fontWeight: 900,
      color: isSale ? '#b91c1c' : '#166534',
      background: isSale ? '#fee2e2' : '#dcfce7',
    }}>
      {isSale ? 'SALE' : 'STOCK IN'}
    </span>
  );
};

function formatDateTime(value) {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString('en-GB', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function money(value) {
  return `MWK ${Number(value || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export default InventoryActivityLedger;
