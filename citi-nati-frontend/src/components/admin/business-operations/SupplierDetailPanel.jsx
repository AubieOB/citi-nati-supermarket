import React from 'react';
import SupplierBalanceCards from './SupplierBalanceCards.jsx';
import SupplierTransactionTable from './SupplierTransactionTable.jsx';
import SupplierEmptyState from './SupplierEmptyState.jsx';

const formatDateTime = (value) => {
  if (!value) return 'Not available';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not available';
  return date.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const statusBadgeStyle = (status) => ({
  display: 'inline-flex',
  alignItems: 'center',
  borderRadius: '999px',
  padding: '0.32rem 0.7rem',
  fontSize: '0.77rem',
  fontWeight: 800,
  textTransform: 'capitalize',
  backgroundColor: status === 'active' ? '#dcfce7' : '#f1f5f9',
  color: status === 'active' ? '#166534' : '#475569',
});

const detailRowStyle = {
  display: 'grid',
  gap: '0.2rem',
};

const formatLocation = (item) => {
  if (item?.locationName) return item.locationName;
  if (item?.locationCode) return item.locationCode;
  if (item?.locationId) return `Location #${item.locationId}`;
  return '—';
};

const SupplierDetailPanel = ({
  supplier,
  balanceSummary,
  detailLoading,
  detailError,
  transactions,
  transactionsLoading,
  transactionsError,
  transactionPagination,
  transactionPage,
  onTransactionPageChange,
  onEditSupplier,
  onAddTransaction,
  onEditTransaction,
  onDeleteTransaction,
}) => {
  if (!supplier && !detailLoading) {
    return (
      <SupplierEmptyState
        title="Choose a supplier"
        message="Select a supplier from the register to inspect master data, balances, and transaction history."
        icon="fa-circle-info"
      />
    );
  }

  if (detailLoading && !supplier) {
    return <SupplierEmptyState title="Loading supplier details" message="Fetching balance summary and supplier profile." icon="fa-spinner fa-spin" />;
  }

  if (detailError && !supplier) {
    return <div style={{ padding: '1rem', color: '#b91c1c' }}>{detailError}</div>;
  }

  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      <div style={{ border: '1px solid #e2e8f0', borderRadius: '18px', padding: '1rem 1.05rem', backgroundColor: '#fff' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.8rem', flexWrap: 'wrap' }}>
          <div style={{ display: 'grid', gap: '0.35rem' }}>
            <div style={{ color: '#5B4B8A', fontSize: '0.75rem', fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Supplier Details</div>
            <h3 style={{ margin: 0, color: '#0f172a' }}>{supplier?.name || 'Supplier'}</h3>
            <div style={{ display: 'flex', gap: '0.55rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ color: '#64748b' }}>{supplier?.supplierCode || 'No supplier code'}</span>
              <span style={statusBadgeStyle(String(supplier?.status || '').toLowerCase())}>{supplier?.status || 'unknown'}</span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={onEditSupplier}
              style={{ border: '1px solid #cbd5e1', backgroundColor: '#fff', color: '#0f172a', borderRadius: '10px', padding: '0.65rem 0.9rem', fontWeight: 700, cursor: 'pointer' }}
            >
              Edit Supplier
            </button>
            <button
              type="button"
              onClick={onAddTransaction}
              style={{ border: 'none', backgroundColor: '#0f766e', color: '#fff', borderRadius: '10px', padding: '0.65rem 0.9rem', fontWeight: 700, cursor: 'pointer' }}
            >
              Add Transaction
            </button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '0.85rem', marginTop: '1rem' }}>
          <div style={detailRowStyle}>
            <span style={{ color: '#64748b', fontSize: '0.8rem' }}>Contact Person</span>
            <strong style={{ color: '#0f172a' }}>{supplier?.contactPerson || 'Not set'}</strong>
          </div>
          <div style={detailRowStyle}>
            <span style={{ color: '#64748b', fontSize: '0.8rem' }}>Location</span>
            <strong style={{ color: '#0f172a' }}>{formatLocation(supplier)}</strong>
          </div>
          <div style={detailRowStyle}>
            <span style={{ color: '#64748b', fontSize: '0.8rem' }}>Phone</span>
            <strong style={{ color: '#0f172a' }}>{supplier?.phone || 'Not set'}</strong>
          </div>
          <div style={detailRowStyle}>
            <span style={{ color: '#64748b', fontSize: '0.8rem' }}>Email</span>
            <strong style={{ color: '#0f172a' }}>{supplier?.email || 'Not set'}</strong>
          </div>
          <div style={detailRowStyle}>
            <span style={{ color: '#64748b', fontSize: '0.8rem' }}>Created</span>
            <strong style={{ color: '#0f172a' }}>{formatDateTime(supplier?.createdAt)}</strong>
          </div>
          <div style={detailRowStyle}>
            <span style={{ color: '#64748b', fontSize: '0.8rem' }}>Updated</span>
            <strong style={{ color: '#0f172a' }}>{formatDateTime(supplier?.updatedAt)}</strong>
          </div>
        </div>

        <div style={{ marginTop: '1rem', display: 'grid', gap: '0.35rem' }}>
          <span style={{ color: '#64748b', fontSize: '0.8rem' }}>Address</span>
          <div style={{ color: '#0f172a', lineHeight: 1.6 }}>{supplier?.address || 'No address recorded.'}</div>
        </div>

        <div style={{ marginTop: '0.9rem', display: 'grid', gap: '0.35rem' }}>
          <span style={{ color: '#64748b', fontSize: '0.8rem' }}>Notes</span>
          <div style={{ color: '#0f172a', lineHeight: 1.6 }}>{supplier?.notes || 'No notes recorded.'}</div>
        </div>
      </div>

      <SupplierBalanceCards summary={balanceSummary} />

      <div style={{ border: '1px solid #e2e8f0', borderRadius: '18px', overflow: 'hidden', backgroundColor: '#fff' }}>
        <div style={{ padding: '1rem 1.05rem', borderBottom: '1px solid #e2e8f0', backgroundColor: '#f8fafc' }}>
          <strong style={{ color: '#0f172a' }}>Supplier Transactions</strong>
          <p style={{ margin: '0.35rem 0 0', color: '#64748b', fontSize: '0.88rem' }}>Track debt, payments, adjustments, and audit context for the selected supplier.</p>
        </div>
        <SupplierTransactionTable
          transactions={transactions}
          loading={transactionsLoading}
          error={transactionsError || detailError}
          onEditTransaction={onEditTransaction}
          onDeleteTransaction={onDeleteTransaction}
        />
        {transactionPagination && (transactionPagination.totalPages || 0) > 1 ? (
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', padding: '0.95rem 1rem', borderTop: '1px solid #e2e8f0', flexWrap: 'wrap' }}>
            <span style={{ color: '#64748b', fontSize: '0.86rem' }}>
              Page {transactionPagination.page || transactionPage} of {transactionPagination.totalPages || 1} with {(transactionPagination.total || 0).toLocaleString('en-US')} transactions.
            </span>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                type="button"
                onClick={() => onTransactionPageChange(Math.max(1, transactionPage - 1))}
                disabled={(transactionPagination.page || transactionPage) <= 1}
                style={{ border: '1px solid #cbd5e1', backgroundColor: '#fff', color: '#0f172a', borderRadius: '10px', padding: '0.5rem 0.85rem', fontWeight: 700, cursor: 'pointer' }}
              >
                Previous
              </button>
              <button
                type="button"
                onClick={() => onTransactionPageChange(transactionPage + 1)}
                disabled={(transactionPagination.page || transactionPage) >= (transactionPagination.totalPages || 1)}
                style={{ border: '1px solid #cbd5e1', backgroundColor: '#fff', color: '#0f172a', borderRadius: '10px', padding: '0.5rem 0.85rem', fontWeight: 700, cursor: 'pointer' }}
              >
                Next
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default SupplierDetailPanel;
