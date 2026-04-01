import React from 'react';
import ExpensesEmptyState from './ExpensesEmptyState.jsx';

const money = (value) =>
  `MWK ${Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const formatDate = (value) => {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

const formatDateTime = (value) => {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const METHOD_LABELS = {
  cash: 'Cash',
  bank: 'Bank Transfer',
  mobile_money: 'Mobile Money',
  capital_injection: 'Capital Injection',
  cheque: 'Cheque',
  other: 'Other',
};

const formatLocation = (item) => {
  if (item?.locationName) return item.locationName;
  if (item?.locationCode) return item.locationCode;
  if (item?.locationId) return `Location #${item.locationId}`;
  return '—';
};

const detailRow = { display: 'grid', gap: '0.2rem' };

const ExpenseDetailPanel = ({ expense, loading, error, onEdit, onAddExpense }) => {
  if (loading && !expense) {
    return (
      <ExpensesEmptyState
        title="Loading expense"
        message="Fetching the expense record."
        icon="fa-spinner fa-spin"
      />
    );
  }

  if (error && !expense) {
    return <div style={{ padding: '1rem', color: '#b91c1c', fontSize: '0.9rem' }}>{error}</div>;
  }

  if (!expense) {
    return (
      <ExpensesEmptyState
        title="No expense selected"
        message="Add the first expense or select one from the register to view its full details here."
        icon="fa-receipt"
        actionLabel="Add New Expense"
        onAction={onAddExpense}
      />
    );
  }

  return (
    <div style={{ display: 'grid', gap: '1rem', padding: '1rem 1.05rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#5B4B8A', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.3rem' }}>
            Expense Details
          </div>
          <h3 style={{ margin: 0, color: '#0f172a', fontSize: '1.1rem' }}>
            {expense.expenseCategory?.name || 'Expense'}
          </h3>
          <div style={{ marginTop: '0.35rem', color: '#64748b', fontSize: '0.9rem' }}>
            {formatDate(expense.expenseDate)}
            {expense.expenseCategory?.code ? ` — ${expense.expenseCategory.code}` : ''}
          </div>
        </div>
        <button
          type="button"
          onClick={() => onEdit(expense)}
          style={{ border: '1px solid #cbd5e1', backgroundColor: '#fff', color: '#0f172a', borderRadius: '10px', padding: '0.65rem 0.95rem', fontWeight: 700, cursor: 'pointer' }}
        >
          <i className="fas fa-pen" style={{ marginRight: '0.45rem' }} />
          Edit
        </button>
      </div>

      <div style={{ padding: '1rem 1.05rem', backgroundColor: '#f8fafc', borderRadius: '14px', border: '1px solid #e2e8f0' }}>
        <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.4rem' }}>Amount</div>
        <div style={{ fontSize: '2rem', fontWeight: 900, color: '#0f172a' }}>{money(expense.amount)}</div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(148px, 1fr))', gap: '0.85rem' }}>
        <div style={detailRow}>
          <span style={{ color: '#64748b', fontSize: '0.8rem' }}>Category</span>
          <strong style={{ color: '#0f172a' }}>{expense.expenseCategory?.name || '—'}</strong>
        </div>
        <div style={detailRow}>
          <span style={{ color: '#64748b', fontSize: '0.8rem' }}>Location</span>
          <strong style={{ color: '#0f172a' }}>{formatLocation(expense)}</strong>
        </div>
        <div style={detailRow}>
          <span style={{ color: '#64748b', fontSize: '0.8rem' }}>Payment Method</span>
          <strong style={{ color: '#0f172a' }}>{METHOD_LABELS[expense.paymentMethod] || expense.paymentMethod || '—'}</strong>
        </div>
        <div style={detailRow}>
          <span style={{ color: '#64748b', fontSize: '0.8rem' }}>Reference No.</span>
          <strong style={{ color: '#0f172a' }}>{expense.referenceNo || '—'}</strong>
        </div>
        <div style={detailRow}>
          <span style={{ color: '#64748b', fontSize: '0.8rem' }}>Entered By</span>
          <strong style={{ color: '#0f172a' }}>{expense.enteredBy || '—'}</strong>
        </div>
        <div style={detailRow}>
          <span style={{ color: '#64748b', fontSize: '0.8rem' }}>Created</span>
          <strong style={{ color: '#0f172a', fontSize: '0.85rem' }}>{formatDateTime(expense.createdAt)}</strong>
        </div>
        <div style={detailRow}>
          <span style={{ color: '#64748b', fontSize: '0.8rem' }}>Last Updated</span>
          <strong style={{ color: '#0f172a', fontSize: '0.85rem' }}>{formatDateTime(expense.updatedAt)}</strong>
        </div>
      </div>

      {expense.description && (
        <div>
          <div style={{ color: '#64748b', fontSize: '0.8rem', marginBottom: '0.35rem' }}>Description</div>
          <div style={{ color: '#0f172a', lineHeight: 1.7, padding: '0.85rem', backgroundColor: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '0.92rem' }}>
            {expense.description}
          </div>
        </div>
      )}
    </div>
  );
};

export default ExpenseDetailPanel;
