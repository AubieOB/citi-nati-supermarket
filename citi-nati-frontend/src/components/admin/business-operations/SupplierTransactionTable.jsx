import React from 'react';
import SupplierEmptyState from './SupplierEmptyState.jsx';
import { boConfirm } from '../../../utils/boDialogBus.js';

const money = (value) => `MWK ${Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const formatDate = (value) => {
  if (!value) return 'Not set';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not set';
  return date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

const thStyle = {
  textAlign: 'left',
  padding: '0.8rem 0.85rem',
  color: '#475569',
  fontSize: '0.75rem',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  borderBottom: '1px solid #e2e8f0',
  backgroundColor: '#f8fafc',
};

const tdStyle = {
  padding: '0.85rem',
  borderBottom: '1px solid #eef2f7',
  color: '#0f172a',
  verticalAlign: 'top',
};

const locationLabel = (item) => {
  if (item?.locationName) return item.locationName;
  if (item?.locationCode) return item.locationCode;
  if (item?.locationId) return `Location #${item.locationId}`;
  return null;
};

const SupplierTransactionTable = ({ transactions, loading, error, onEditTransaction, onDeleteTransaction }) => {
  if (error) {
    return <div style={{ padding: '1rem', color: '#b91c1c' }}>{error}</div>;
  }

  if (loading) {
    return <SupplierEmptyState title="Loading transactions" message="Fetching supplier transaction history." icon="fa-spinner fa-spin" />;
  }

  if (!transactions.length) {
    return <SupplierEmptyState title="No supplier transactions yet" message="Use Add Transaction to record debt, payment, or adjustment history for this supplier." icon="fa-receipt" />;
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
        <thead>
          <tr>
            <th style={thStyle}>Date</th>
            <th style={thStyle}>Type</th>
            <th style={thStyle}>Method</th>
            <th style={thStyle}>Amount</th>
            <th style={thStyle}>Reference</th>
            <th style={thStyle}>Description</th>
            <th style={thStyle}>Entered By</th>
            <th style={thStyle}>Action</th>
          </tr>
        </thead>
        <tbody>
          {transactions.map((transaction) => (
            <tr key={transaction.id}>
              <td style={tdStyle}>{formatDate(transaction.transactionDate)}</td>
              <td style={tdStyle}>{transaction.transactionType || 'Unknown'}</td>
              <td style={tdStyle}>{transaction.paymentMethod || 'Not set'}</td>
              <td style={tdStyle}>{money(transaction.amount)}</td>
              <td style={tdStyle}>{transaction.referenceNo || 'Not set'}</td>
              <td style={tdStyle}>
                {transaction.description || 'No description'}
                {locationLabel(transaction) ? <div style={{ color: '#94a3b8', fontSize: '0.79rem', marginTop: '0.2rem' }}>{locationLabel(transaction)}</div> : null}
              </td>
              <td style={tdStyle}>{transaction.enteredBy || 'System'}</td>
              <td style={tdStyle}>
                <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => onEditTransaction(transaction)}
                    style={{
                      border: '1px solid #cbd5e1',
                      backgroundColor: '#fff',
                      color: '#0f172a',
                      borderRadius: '10px',
                      padding: '0.45rem 0.8rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      const confirmed = await boConfirm({
                        title: 'Delete Supplier Transaction',
                        message: `Delete this ${transaction.transactionType || 'transaction'} of MWK ${Number(transaction.amount || 0).toLocaleString('en-US')}? This cannot be undone.`,
                        confirmText: 'Delete',
                        cancelText: 'Cancel',
                      });
                      if (confirmed) {
                        onDeleteTransaction(transaction);
                      }
                    }}
                    style={{
                      border: '1px solid #fca5a5',
                      backgroundColor: '#fff',
                      color: '#b91c1c',
                      borderRadius: '10px',
                      padding: '0.45rem 0.8rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
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
  );
};

export default SupplierTransactionTable;
