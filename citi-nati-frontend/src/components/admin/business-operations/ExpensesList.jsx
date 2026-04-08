import React from 'react';
import ExpensesEmptyState from './ExpensesEmptyState.jsx';
import { boConfirm } from '../../../utils/boDialogBus.js';

const money = (value) =>
  `MWK ${Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const formatDate = (value) => {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

const thStyle = {
  textAlign: 'left',
  padding: '0.85rem 0.9rem',
  color: '#475569',
  fontSize: '0.76rem',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  borderBottom: '1px solid #e2e8f0',
  backgroundColor: '#f8fafc',
  position: 'sticky',
  top: 0,
  zIndex: 1,
};

const tdStyle = {
  padding: '0.88rem 0.9rem',
  borderBottom: '1px solid #eef2f7',
  color: '#0f172a',
  verticalAlign: 'top',
};

const METHOD_LABELS = {
  cash: 'Cash',
  bank: 'Bank',
  mobile_money: 'Mobile Money',
  capital_injection: 'Capital',
  cheque: 'Cheque',
  other: 'Other',
};

const locationLabel = (item) => {
  if (item?.locationName) return item.locationName;
  if (item?.locationCode) return item.locationCode;
  if (item?.locationId) return `Location #${item.locationId}`;
  return null;
};

const ExpensesList = ({
  expenses,
  loading,
  error,
  pagination,
  page,
  onPageChange,
  selectedExpenseId,
  onSelectExpense,
  onEditExpense,
  onDeleteExpense,
}) => {
  if (error) {
    return <div style={{ padding: '1rem', color: '#b91c1c', fontSize: '0.9rem' }}>{error}</div>;
  }

  if (loading) {
    return (
      <ExpensesEmptyState
        title="Loading expenses"
        message="Fetching expense records for the active filters."
        icon="fa-spinner fa-spin"
      />
    );
  }

  if (!expenses.length) {
    return (
      <ExpensesEmptyState
        title="No expenses found"
        message="Adjust your search or date range, or add the first expense to begin manual entry."
        icon="fa-receipt"
      />
    );
  }

  return (
    <>
      <div style={{ overflowX: 'auto', maxHeight: '580px', overflowY: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
          <thead>
            <tr>
              <th style={thStyle}>Date</th>
              <th style={thStyle}>Category</th>
              <th style={thStyle}>Description</th>
              <th style={thStyle}>Method</th>
              <th style={thStyle}>Amount</th>
              <th style={thStyle}>Action</th>
            </tr>
          </thead>
          <tbody>
            {expenses.map((expense) => {
              const selected = expense.id === selectedExpenseId;
              return (
                <tr
                  key={expense.id}
                  onClick={() => onSelectExpense(expense)}
                  style={{ backgroundColor: selected ? '#f5f3ff' : '#fff', cursor: 'pointer' }}
                >
                  <td style={tdStyle}>{formatDate(expense.expenseDate)}</td>
                  <td style={tdStyle}>
                    <div style={{ display: 'grid', gap: '0.15rem' }}>
                      <span>{expense.expenseCategory?.name || 'Uncategorized'}</span>
                      {expense.expenseCategory?.code && (
                        <span style={{ color: '#94a3b8', fontSize: '0.79rem' }}>{expense.expenseCategory.code}</span>
                      )}
                    </div>
                  </td>
                  <td style={{ ...tdStyle, maxWidth: '200px' }}>
                    <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {expense.description || '—'}
                    </span>
                    {locationLabel(expense) && (
                      <span style={{ color: '#94a3b8', fontSize: '0.79rem', marginRight: '0.35rem' }}>{locationLabel(expense)}</span>
                    )}
                    {expense.referenceNo && (
                      <span style={{ color: '#94a3b8', fontSize: '0.79rem' }}>Ref: {expense.referenceNo}</span>
                    )}
                  </td>
                  <td style={tdStyle}>{METHOD_LABELS[expense.paymentMethod] || expense.paymentMethod || '—'}</td>
                  <td style={{ ...tdStyle, fontWeight: 700, whiteSpace: 'nowrap' }}>{money(expense.amount)}</td>
                  <td style={tdStyle}>
                    <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onEditExpense(expense); }}
                        style={{
                          border: '1px solid #cbd5e1',
                          backgroundColor: '#fff',
                          color: '#475569',
                          borderRadius: '8px',
                          padding: '0.38rem 0.7rem',
                          fontSize: '0.8rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={async (e) => {
                          e.stopPropagation();
                          const confirmed = await boConfirm({
                            title: 'Delete Expense',
                            message: `Delete this expense of ${money(expense.amount)}? This cannot be undone.`,
                            confirmText: 'Delete',
                            cancelText: 'Cancel',
                          });
                          if (confirmed) {
                            onDeleteExpense(expense);
                          }
                        }}
                        style={{
                          border: '1px solid #fca5a5',
                          backgroundColor: '#fff',
                          color: '#b91c1c',
                          borderRadius: '8px',
                          padding: '0.38rem 0.7rem',
                          fontSize: '0.8rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {pagination && (pagination.totalPages || 0) > 1 && (
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: '0.75rem',
          padding: '0.95rem 1rem',
          borderTop: '1px solid #e2e8f0',
          flexWrap: 'wrap',
        }}>
          <span style={{ color: '#64748b', fontSize: '0.86rem' }}>
            Page {pagination.page || page} of {pagination.totalPages || 1} — {(pagination.total || 0).toLocaleString('en-US')} expenses
          </span>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              type="button"
              onClick={() => onPageChange(Math.max(1, page - 1))}
              disabled={(pagination.page || page) <= 1}
              style={{ border: '1px solid #cbd5e1', backgroundColor: '#fff', color: '#475569', borderRadius: '8px', padding: '0.45rem 0.85rem', fontWeight: 700, cursor: 'pointer', fontSize: '0.85rem' }}
            >
              Previous
            </button>
            <button
              type="button"
              onClick={() => onPageChange(page + 1)}
              disabled={(pagination.page || page) >= (pagination.totalPages || 1)}
              style={{ border: '1px solid #cbd5e1', backgroundColor: '#fff', color: '#475569', borderRadius: '8px', padding: '0.45rem 0.85rem', fontWeight: 700, cursor: 'pointer', fontSize: '0.85rem' }}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export default ExpensesList;
