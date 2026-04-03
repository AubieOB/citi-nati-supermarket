import React from 'react';

const FIELD_STYLE = {
  width: '100%',
  padding: '0.7rem 0.8rem',
  border: '1px solid #cbd5e1',
  borderRadius: '10px',
  fontSize: '0.92rem',
  backgroundColor: '#fff',
  color: '#0f172a',
  boxSizing: 'border-box',
};

const labelStyle = {
  display: 'block',
  marginBottom: '0.35rem',
  fontSize: '0.8rem',
  fontWeight: 700,
  color: '#475569',
  textTransform: 'uppercase',
  letterSpacing: '0.03em',
};

const PERIOD_OPTIONS = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'quarter', label: 'Quarter' },
  { value: 'year', label: 'Year' },
  { value: 'custom', label: 'Custom' },
];

const quarterOptions = [1, 2, 3, 4];
const monthOptions = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const Field = ({ label, children }) => (
  <label style={{ minWidth: 0 }}>
    <span style={labelStyle}>{label}</span>
    {children}
  </label>
);

const SalesReportFilters = ({
  filters,
  onChange,
  onReset,
  resolvedRange,
  loading,
}) => {
  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: 8 }, (_, index) => currentYear - 3 + index);

  const renderPeriodFields = () => {
    if (filters.periodType === 'day' || filters.periodType === 'week') {
      return (
        <Field label={filters.periodType === 'week' ? 'Week Basis Date' : 'Date'}>
          <input type="date" value={filters.date} onChange={(e) => onChange('date', e.target.value)} style={FIELD_STYLE} />
        </Field>
      );
    }

    if (filters.periodType === 'month') {
      return (
        <>
          <Field label="Month">
            <select value={filters.month} onChange={(e) => onChange('month', e.target.value)} style={FIELD_STYLE}>
              {monthOptions.map((label, index) => (
                <option key={label} value={index + 1}>{label}</option>
              ))}
            </select>
          </Field>
          <Field label="Year">
            <select value={filters.year} onChange={(e) => onChange('year', e.target.value)} style={FIELD_STYLE}>
              {yearOptions.map((year) => <option key={year} value={year}>{year}</option>)}
            </select>
          </Field>
        </>
      );
    }

    if (filters.periodType === 'quarter') {
      return (
        <>
          <Field label="Quarter">
            <select value={filters.quarter} onChange={(e) => onChange('quarter', e.target.value)} style={FIELD_STYLE}>
              {quarterOptions.map((quarter) => <option key={quarter} value={quarter}>Q{quarter}</option>)}
            </select>
          </Field>
          <Field label="Year">
            <select value={filters.year} onChange={(e) => onChange('year', e.target.value)} style={FIELD_STYLE}>
              {yearOptions.map((year) => <option key={year} value={year}>{year}</option>)}
            </select>
          </Field>
        </>
      );
    }

    if (filters.periodType === 'year') {
      return (
        <Field label="Year">
          <select value={filters.year} onChange={(e) => onChange('year', e.target.value)} style={FIELD_STYLE}>
            {yearOptions.map((year) => <option key={year} value={year}>{year}</option>)}
          </select>
        </Field>
      );
    }

    return (
      <>
        <Field label="Start Date">
          <input type="date" value={filters.startDate} onChange={(e) => onChange('startDate', e.target.value)} style={FIELD_STYLE} />
        </Field>
        <Field label="End Date">
          <input type="date" value={filters.endDate} onChange={(e) => onChange('endDate', e.target.value)} style={FIELD_STYLE} />
        </Field>
      </>
    );
  };

  return (
    <div
      style={{
        backgroundColor: '#fff',
        border: '1px solid #e2e8f0',
        borderRadius: '18px',
        padding: '1.1rem',
        boxShadow: '0 10px 24px rgba(15, 23, 42, 0.05)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        <div>
          <h3 style={{ margin: 0, color: '#0f172a', fontSize: '1.05rem' }}>Sales Report Filters</h3>
          <p style={{ margin: '0.35rem 0 0', color: '#64748b', fontSize: '0.92rem' }}>
            Change the reporting period and branch filters. Summary cards and report views stay in sync.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
          <button
            type="button"
            onClick={onReset}
            style={{ border: 'none', background: '#e2e8f0', color: '#0f172a', borderRadius: '10px', padding: '0.7rem 1rem', fontWeight: 700, cursor: 'pointer' }}
          >
            Reset
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '0.85rem' }}>
        <Field label="Period Type">
          <select value={filters.periodType} onChange={(e) => onChange('periodType', e.target.value)} style={FIELD_STYLE}>
            {PERIOD_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </Field>

        {renderPeriodFields()}

        <Field label="Branch Code">
          <input value={filters.branchCode} onChange={(e) => onChange('branchCode', e.target.value)} placeholder="All branches" style={FIELD_STYLE} />
        </Field>
        <Field label="Sync Source">
          <input value={filters.syncSourceCode} onChange={(e) => onChange('syncSourceCode', e.target.value)} placeholder="All sources" style={FIELD_STYLE} />
        </Field>
        <Field label="Location Code">
          <input value={filters.locationCode} onChange={(e) => onChange('locationCode', e.target.value)} placeholder="Any location code" style={FIELD_STYLE} />
        </Field>
        <Field label="Location ID">
          <input value={filters.locationId} onChange={(e) => onChange('locationId', e.target.value)} placeholder="Any location id" style={FIELD_STYLE} />
        </Field>
        <Field label="User Name">
          <input value={filters.userName} onChange={(e) => onChange('userName', e.target.value)} placeholder="Cashier or user" style={FIELD_STYLE} />
        </Field>
        <Field label="Product Code">
          <input value={filters.productCode} onChange={(e) => onChange('productCode', e.target.value)} placeholder="Optional product code" style={FIELD_STYLE} />
        </Field>
        <Field label="Product Name">
          <input value={filters.productName} onChange={(e) => onChange('productName', e.target.value)} placeholder="Optional product name" style={FIELD_STYLE} />
        </Field>
        <Field label="Payment Method">
          <input value={filters.payMethod} onChange={(e) => onChange('payMethod', e.target.value)} placeholder="Cash, bank, card..." style={FIELD_STYLE} />
        </Field>
        <Field label="Invoice Type">
          <input value={filters.invoiceType} onChange={(e) => onChange('invoiceType', e.target.value)} placeholder="Invoice type" style={FIELD_STYLE} />
        </Field>
      </div>

      <div style={{ marginTop: '1rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: '0.84rem', color: '#475569', fontWeight: 700 }}>Resolved date range:</span>
        <span style={{ backgroundColor: '#eef2ff', color: '#4338ca', borderRadius: '999px', padding: '0.35rem 0.75rem', fontSize: '0.84rem', fontWeight: 700 }}>
          {resolvedRange?.startDate && resolvedRange?.endDate ? `${resolvedRange.startDate} to ${resolvedRange.endDate}` : 'Waiting for report data'}
        </span>
        {loading && <span style={{ color: '#64748b', fontSize: '0.84rem' }}>Refreshing report...</span>}
      </div>
    </div>
  );
};

export default SalesReportFilters;
