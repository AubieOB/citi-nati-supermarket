import React from 'react';

const money = (value) =>
  `MWK ${Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const cardStyle = {
  backgroundColor: '#fff',
  border: '1px solid #e2e8f0',
  borderRadius: '14px',
  padding: '0.9rem 1rem',
  display: 'grid',
  gap: '0.34rem',
  boxShadow: '0 6px 16px rgba(15,23,42,0.05)',
  overflow: 'hidden',
  position: 'relative',
};

const PayrollSummaryCards = ({ summary }) => {
  const cards = [
    { label: 'Employees in Payroll', value: Number(summary.entryCount || 0).toLocaleString('en-US'), icon: 'fa-users', tone: '#1d4ed8' },
    { label: 'Total Gross Pay', value: money(summary.totalGrossPay), icon: 'fa-sack-dollar', tone: '#0369a1' },
    { label: 'Total Deductions', value: money(summary.totalDeductions), icon: 'fa-file-invoice-dollar', tone: '#b45309' },
    { label: 'Total Net Pay', value: money(summary.totalNetPay), icon: 'fa-wallet', tone: '#15803d' },
    { label: 'Total Overtime', value: money(summary.totalOvertimeAmount), icon: 'fa-business-time', tone: '#7c3aed' },
    { label: 'Loan Deductions', value: money(summary.totalLoanDeductionAmount), icon: 'fa-hand-holding-dollar', tone: '#be185d' },
  ];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '0.75rem' }}>
      {cards.map((card) => (
        <div key={card.label} style={cardStyle}>
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', backgroundColor: card.tone, borderRadius: '14px 14px 0 0' }} />
          <span style={{ color: '#64748b', fontSize: '0.74rem', fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
            {card.label}
          </span>
          <strong style={{ color: '#0f172a', fontSize: '1.18rem' }}>{card.value}</strong>
          <span style={{ color: card.tone, fontSize: '0.84rem', fontWeight: 700 }}>
            <i className={`fas ${card.icon}`} style={{ marginRight: '0.35rem' }}></i>
            Live period total
          </span>
        </div>
      ))}
    </div>
  );
};

export default PayrollSummaryCards;
