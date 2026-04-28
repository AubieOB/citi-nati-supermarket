import React, { useEffect, useMemo, useState } from 'react';
import api from '../../../utils/api.js';

const today = new Date();
const currentYear = today.getFullYear();
const currentMonth = today.getMonth() + 1;

const cardStyle = {
  backgroundColor: '#fff',
  border: '1px solid #e2e8f0',
  borderRadius: '16px',
  boxShadow: '0 10px 24px rgba(15, 23, 42, 0.05)',
};

const inputStyle = {
  width: '100%',
  padding: '0.72rem 0.85rem',
  border: '1px solid #cbd5e1',
  borderRadius: '10px',
  fontSize: '0.9rem',
  boxSizing: 'border-box',
};

const InventoryActivityLedger = ({ selectedLocationId, selectedLocationCode }) => {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  const [periodType, setPeriodType] = useState('day');
  const [date, setDate] = useState(today.toISOString().slice(0, 10));
  const [month, setMonth] = useState(currentMonth);
  const [year, setYear] = useState(currentYear);
  const [startDate, setStartDate] = useState(today.toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(today.toISOString().slice(0, 10));

  const [productCode, setProductCode] = useState('');
  const [productName, setProductName] = useState('');
  const [movementType, setMovementType] = useState('');

  const params = useMemo(() => {
    const next = {
      periodType,
      locationId: selectedLocationId || undefined,
      locationCode: selectedLocationCode || undefined,
      productCode: productCode.trim() || undefined,
      productName: productName.trim() || undefined,
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
  }, [periodType, date, month, year, startDate, endDate, selectedLocationId, selectedLocationCode, productCode, productName, movementType]);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError('');

      const res = await api.get('/business-operations/inventory-activity/ledger', { params });
      setData(res.data.data);
    } catch (err) {
      console.error(err);
      setError(err?.response?.data?.error || 'Failed to load inventory activity.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLocationId, selectedLocationCode]);

  const summary = data?.summary || {};
  const movements = data?.movements || [];
  const groupedProducts = data?.products || [];
  const isLedgerMode = data?.mode === 'ledger';

  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      <div style={{ ...cardStyle, padding: '1.1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#5B4B8A', textTransform: 'uppercase' }}>
              Business Operations
            </div>
            <h2 style={{ margin: '0.25rem 0', color: '#0f172a' }}>Inventory Activity</h2>
            <p style={{ margin: 0, color: '#64748b', fontSize: '0.88rem' }}>
              Track stock movement by period, product, cashier, invoice, and running balance.
            </p>
          </div>

          <button
            type="button"
            onClick={fetchData}
            disabled={loading}
            style={{
              border: 'none',
              backgroundColor: '#5B4B8A',
              color: '#fff',
              borderRadius: '10px',
              padding: '0.75rem 1rem',
              fontWeight: 800,
              cursor: loading ? 'not-allowed' : 'pointer',
              alignSelf: 'start',
            }}
          >
            <i className={`fas ${loading ? 'fa-spinner fa-spin' : 'fa-rotate-right'}`} style={{ marginRight: '0.45rem' }} />
            {loading ? 'Loading...' : 'Refresh'}
          </button>
        </div>
      </div>

      <div style={{ ...cardStyle, padding: '1rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.85rem' }}>
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
          <input value={productCode} onChange={(e) => setProductCode(e.target.value)} placeholder="e.g. 705632476345" style={inputStyle} />
        </div>

        <div>
          <label style={labelStyle}>Product Name</label>
          <input value={productName} onChange={(e) => setProductName(e.target.value)} placeholder="Search product name" style={inputStyle} />
        </div>

        <div>
          <label style={labelStyle}>Movement Type</label>
          <select value={movementType} onChange={(e) => setMovementType(e.target.value)} style={inputStyle}>
            <option value="">All Movements</option>
            <option value="SALE">Sales Only</option>
            <option value="STOCK_INTAKE">Stock Intake Only</option>
          </select>
        </div>
      </div>

      {error && (
        <div style={{ ...cardStyle, padding: '0.9rem 1rem', color: '#b91c1c', backgroundColor: '#fff1f2', borderColor: '#fecaca' }}>
          {error}
        </div>
      )}

      {summary && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.75rem' }}>
          <Kpi label="Opening Stock" value={summary.openingBalance ?? '-'} />
          <Kpi label="Qty In" value={summary.totalQtyIn ?? 0} />
          <Kpi label="Qty Out" value={summary.totalQtyOut ?? 0} />
          <Kpi label="Closing Stock" value={summary.calculatedClosingBalance ?? '-'} />
          <Kpi label="Current POS Stock" value={summary.currentProductStock ?? '-'} />
          <Kpi label="Variance" value={summary.variance ?? '-'} danger={Number(summary.variance || 0) !== 0} />
        </div>
      )}

      <div style={{ ...cardStyle, overflow: 'hidden' }}>
        <div style={{ padding: '0.9rem 1rem', borderBottom: '1px solid #e2e8f0' }}>
          <strong style={{ color: '#0f172a' }}>
            {isLedgerMode ? 'Stock Movement Ledger' : 'Product Movement Summary'}
          </strong>
          <p style={{ margin: '0.25rem 0 0', color: '#64748b', fontSize: '0.82rem' }}>
            {isLedgerMode ? 'Invoice-by-invoice and intake-by-intake stock activity.' : 'Select a product code or name to view full running balance ledger.'}
          </p>
        </div>

        <div style={{ overflowX: 'auto' }}>
          {isLedgerMode ? (
            <table style={tableStyle}>
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
                {movements.length === 0 ? (
                  <tr><Td colSpan={9}>No stock movement found for this selection.</Td></tr>
                ) : movements.map((m, index) => (
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
          ) : (
            <table style={tableStyle}>
              <thead>
                <tr>
                  <Th>Product Code</Th>
                  <Th>Product Name</Th>
                  <Th align="right">Qty In</Th>
                  <Th align="right">Qty Out</Th>
                  <Th align="right">Net Movement</Th>
                  <Th align="right">Movements</Th>
                </tr>
              </thead>
              <tbody>
                {groupedProducts.length === 0 ? (
                  <tr><Td colSpan={6}>No inventory activity found for this period.</Td></tr>
                ) : groupedProducts.map((row, index) => (
                  <tr key={`${row.productCode || row.productName}-${index}`}>
                    <Td>{row.productCode || '-'}</Td>
                    <Td>{row.productName || '-'}</Td>
                    <Td align="right">{row.totalQtyIn}</Td>
                    <Td align="right">{row.totalQtyOut}</Td>
                    <Td align="right">{row.netMovement}</Td>
                    <Td align="right">{row.movementCount}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
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

const tableStyle = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: '0.88rem',
};

const Kpi = ({ label, value, danger }) => (
  <div style={{ ...cardStyle, padding: '0.9rem 1rem' }}>
    <div style={{ color: '#64748b', fontSize: '0.76rem', fontWeight: 800 }}>{label}</div>
    <div style={{ marginTop: '0.35rem', fontSize: '1.25rem', fontWeight: 900, color: danger ? '#b91c1c' : '#0f172a' }}>
      {value}
    </div>
  </div>
);

const Th = ({ children, align = 'left' }) => (
  <th style={{ textAlign: align, padding: '0.75rem 0.85rem', borderBottom: '1px solid #e2e8f0', color: '#334155', background: '#f8fafc' }}>
    {children}
  </th>
);

const Td = ({ children, align = 'left', colSpan }) => (
  <td colSpan={colSpan} style={{ textAlign: align, padding: '0.72rem 0.85rem', borderBottom: '1px solid #f1f5f9', color: '#0f172a' }}>
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