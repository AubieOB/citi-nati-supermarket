import React from 'react';
import MonthlySummaryEmptyState from './MonthlySummaryEmptyState.jsx';

const money = (value) => `MWK ${Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const PayrollSummarySection = ({ loading, error, data, onOpen }) => (
  <div style={{ border: '1px solid #e2e8f0', borderRadius: '16px', backgroundColor: '#fff', padding: '1rem 1.05rem', display: 'grid', gap: '0.75rem' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
      <div>
        <strong style={{ color: '#0f172a' }}>Payroll Overview</strong>
      </div>
      {typeof onOpen === 'function' && <button type="button" onClick={onOpen} style={{ border: '1px solid #cbd5e1', backgroundColor: '#fff', color: '#334155', borderRadius: '8px', padding: '0.43rem 0.72rem', fontWeight: 700, cursor: 'pointer', fontSize: '0.8rem' }}>Open Payroll</button>}
    </div>

    {error ? <MonthlySummaryEmptyState title="Payroll data unavailable" message={error} icon="fa-triangle-exclamation" /> : null}
    {loading ? <MonthlySummaryEmptyState title="Loading payroll" message="Fetching payroll periods and entries for selected period." icon="fa-spinner fa-spin" /> : null}
    {!loading && !error ? (
      <div style={{ display: 'grid', gap: '0.3rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}><span style={{ color: '#475569' }}>Total Payroll Cost (Net)</span><strong style={{ color: '#0f172a' }}>{money(data?.totalNetPay)}</strong></div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}><span style={{ color: '#475569' }}>Employees Paid</span><strong style={{ color: '#0f172a' }}>{Number(data?.employeeCount || 0).toLocaleString('en-US')}</strong></div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}><span style={{ color: '#475569' }}>Average Net Salary</span><strong style={{ color: '#0f172a' }}>{money(data?.averageNetPay)}</strong></div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}><span style={{ color: '#475569' }}>Basic Pay</span><strong style={{ color: '#0f172a' }}>{money(data?.totalBasicSalary)}</strong></div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}><span style={{ color: '#475569' }}>Deductions</span><strong style={{ color: '#0f172a' }}>{money(data?.totalDeductions)}</strong></div>
      </div>
    ) : null}
  </div>
);

export default PayrollSummarySection;
