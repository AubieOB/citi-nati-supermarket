import React from 'react';

const monthOptions = [
  { value: 1, label: 'January' },
  { value: 2, label: 'February' },
  { value: 3, label: 'March' },
  { value: 4, label: 'April' },
  { value: 5, label: 'May' },
  { value: 6, label: 'June' },
  { value: 7, label: 'July' },
  { value: 8, label: 'August' },
  { value: 9, label: 'September' },
  { value: 10, label: 'October' },
  { value: 11, label: 'November' },
  { value: 12, label: 'December' },
];

const fieldStyle = {
  padding: '0.72rem 0.86rem',
  borderRadius: '10px',
  border: '1px solid #cbd5e1',
  fontSize: '0.9rem',
  backgroundColor: '#fff',
};

const SummaryFiltersBar = ({
  filters,
  rangeLabel,
  loading,
  validationError,
  onChange,
  onRefresh,
  onClear,
}) => (
  <div style={{ border: '1px solid #e2e8f0', borderRadius: '14px', padding: '0.95rem 1rem', backgroundColor: '#fff' }}>
    <div style={{ display: 'flex', gap: '0.7rem', flexWrap: 'wrap', alignItems: 'center' }}>
      <select value={filters.periodType} onChange={(event) => onChange('periodType', event.target.value)} style={{ ...fieldStyle, minWidth: '120px' }}>
        <option value="month">Month</option>
        <option value="custom">Custom Range</option>
      </select>

      {filters.periodType === 'month' ? (
        <>
          <select value={filters.month} onChange={(event) => onChange('month', Number(event.target.value))} style={{ ...fieldStyle, minWidth: '145px' }}>
            {monthOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          <input type="number" min="2020" max="2100" value={filters.year} onChange={(event) => onChange('year', Number(event.target.value || new Date().getFullYear()))} style={{ ...fieldStyle, width: '118px' }} />
        </>
      ) : (
        <>
          <input type="date" value={filters.startDate} onChange={(event) => onChange('startDate', event.target.value)} style={fieldStyle} />
          <input type="date" value={filters.endDate} onChange={(event) => onChange('endDate', event.target.value)} style={fieldStyle} />
        </>
      )}

      <input
        type="text"
        value={filters.locationCode}
        onChange={(event) => onChange('locationCode', event.target.value)}
        placeholder="Location code (e.g. BT, ZM)"
        style={{ ...fieldStyle, minWidth: '170px' }}
      />

      <button
        type="button"
        onClick={onRefresh}
        disabled={loading || Boolean(validationError)}
        style={{ border: '1px solid #cbd5e1', backgroundColor: '#fff', color: '#0f172a', borderRadius: '10px', padding: '0.7rem 0.92rem', fontWeight: 700, cursor: loading || validationError ? 'not-allowed' : 'pointer' }}
      >
        <i className={`fas ${loading ? 'fa-spinner fa-spin' : 'fa-rotate-right'}`} style={{ marginRight: '0.38rem' }}></i>
        Refresh
      </button>

      <button
        type="button"
        onClick={onClear}
        style={{ border: '1px solid #e2e8f0', backgroundColor: '#fff', color: '#475569', borderRadius: '10px', padding: '0.7rem 0.92rem', fontWeight: 700, cursor: 'pointer' }}
      >
        Clear
      </button>
    </div>

    <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', borderRadius: '999px', backgroundColor: '#f1f5f9', color: '#334155', padding: '0.42rem 0.72rem', fontSize: '0.83rem', fontWeight: 700 }}>
        <i className="fas fa-calendar-days"></i>
        {rangeLabel}
      </span>
      {filters.locationCode ? (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', borderRadius: '999px', backgroundColor: '#eef2ff', color: '#3730a3', padding: '0.42rem 0.72rem', fontSize: '0.83rem', fontWeight: 700 }}>
          <i className="fas fa-location-dot"></i>
          Location: {filters.locationCode.trim().toUpperCase()}
        </span>
      ) : null}
    </div>

    {validationError ? (
      <div style={{ marginTop: '0.75rem', padding: '0.7rem 0.82rem', borderRadius: '10px', backgroundColor: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', fontSize: '0.86rem' }}>
        {validationError}
      </div>
    ) : null}
  </div>
);

export default SummaryFiltersBar;
