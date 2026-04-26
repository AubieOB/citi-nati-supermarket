import React from 'react';
import SupplierEmptyState from './SupplierEmptyState.jsx';
import { boConfirm } from '../../../utils/boDialogBus.js';

const money = (value) => `MWK ${Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

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
  padding: '0.9rem',
  borderBottom: '1px solid #eef2f7',
  color: '#0f172a',
  verticalAlign: 'top',
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

const locationLabel = (item) => {
  if (item?.locationName) return item.locationName;
  if (item?.locationCode) return item.locationCode;
  if (item?.locationId) return `Location #${item.locationId}`;
  return null;
};

const SuppliersList = ({
  suppliers,
  loading,
  error,
  pagination,
  page,
  onPageChange,
  selectedSupplierId,
  onSelectSupplier,
  onEditSupplier,
  onDeleteSupplier,
}) => {
  if (error) {
    return (
      <div style={{ padding: '1rem', color: '#b91c1c' }}>
        {error}
      </div>
    );
  }

  if (loading) {
    return <SupplierEmptyState title="Loading suppliers" message="Fetching the supplier register and current balances." icon="fa-spinner fa-spin" />;
  }

  if (!suppliers.length) {
    return <SupplierEmptyState title="No suppliers found" message="Change the search or status filter, or add the first supplier to begin manual setup." icon="fa-truck-field" />;
  }

  return (
    <>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
          <thead>
            <tr>
              <th style={thStyle}>Supplier</th>
              <th style={thStyle}>Contact</th>
              <th style={thStyle}>Status</th>
              <th style={thStyle}>Opening</th>
              <th style={thStyle}>Current</th>
              <th style={thStyle}>Action</th>
            </tr>
          </thead>
          <tbody>
            {suppliers.map((supplier, index) => {
              const selected = supplier.id === selectedSupplierId;
              const normalizedStatus = String(supplier.status || '').toLowerCase();
              const zebraBase = index % 2 === 0 ? '#fff' : '#fcfdff';

              return (
                <tr
                  key={supplier.id}
                  onClick={() => onSelectSupplier(supplier)}
                  onMouseEnter={(event) => { if (!selected) event.currentTarget.style.backgroundColor = '#f8fafc'; }}
                  onMouseLeave={(event) => { if (!selected) event.currentTarget.style.backgroundColor = zebraBase; }}
                  style={{
                    backgroundColor: selected ? '#f8fafc' : zebraBase,
                    cursor: 'pointer',
                    transition: 'background-color 0.12s ease',
                  }}
                >
                  <td style={tdStyle}>
                    <div style={{ display: 'grid', gap: '0.25rem' }}>
                      <strong>{supplier.name}</strong>
                      <span style={{ color: '#64748b', fontSize: '0.84rem' }}>{supplier.supplierCode || 'No supplier code'}</span>
                      <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                        {(supplier.posLinks || []).map((link) => (
                          <span
                            key={`${supplier.id}-${link.branchCode}-${link.posSupplierCode || 'pending'}`}
                            style={{
                              borderRadius: '999px',
                              padding: '0.16rem 0.52rem',
                              fontSize: '0.72rem',
                              fontWeight: 700,
                              border: '1px solid #bfdbfe',
                              backgroundColor: '#eff6ff',
                              color: '#1d4ed8',
                            }}
                          >
                            {link.branchCode}{link.posSupplierCode ? ` #${link.posSupplierCode}` : ' pending'}
                          </span>
                        ))}
                      </div>
                      {locationLabel(supplier) && <span style={{ color: '#94a3b8', fontSize: '0.79rem' }}>{locationLabel(supplier)}</span>}
                    </div>
                  </td>
                  <td style={tdStyle}>
                    <div style={{ display: 'grid', gap: '0.2rem' }}>
                      <span>{supplier.contactPerson || 'No contact person'}</span>
                      <span style={{ color: '#64748b', fontSize: '0.84rem' }}>{supplier.phone || supplier.email || 'No phone or email'}</span>
                    </div>
                  </td>
                  <td style={tdStyle}>
                    <span style={statusBadgeStyle(normalizedStatus)}>{normalizedStatus || 'unknown'}</span>
                  </td>
                  <td style={tdStyle}>{money(supplier.openingBalance)}</td>
                  <td style={tdStyle}>{money(supplier.currentBalance)}</td>
                  <td style={tdStyle}>
                    <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          onEditSupplier(supplier);
                        }}
                        style={{
                          border: '1px solid #cbd5e1',
                          backgroundColor: '#fff',
                          color: '#0f172a',
                          borderRadius: '10px',
                          padding: '0.5rem 0.8rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={async (event) => {
                          event.stopPropagation();
                          const confirmed = await boConfirm({
                            title: 'Delete Supplier',
                            message: `Delete supplier "${supplier.name}"? This cannot be undone.`,
                            confirmText: 'Delete',
                            cancelText: 'Cancel',
                          });
                          if (confirmed) {
                            onDeleteSupplier(supplier);
                          }
                        }}
                        style={{
                          border: '1px solid #fca5a5',
                          backgroundColor: '#fff',
                          color: '#b91c1c',
                          borderRadius: '10px',
                          padding: '0.5rem 0.8rem',
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

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', padding: '1rem', borderTop: '1px solid #e2e8f0', flexWrap: 'wrap' }}>
        <span style={{ color: '#64748b', fontSize: '0.88rem' }}>
          Page {pagination?.page || page} of {pagination?.totalPages || 1} with {(pagination?.total || 0).toLocaleString('en-US')} suppliers.
        </span>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            type="button"
            onClick={() => onPageChange(Math.max(1, page - 1))}
            disabled={(pagination?.page || page) <= 1}
            style={{ border: '1px solid #cbd5e1', backgroundColor: '#fff', color: '#0f172a', borderRadius: '10px', padding: '0.55rem 0.9rem', fontWeight: 700, cursor: 'pointer' }}
          >
            Previous
          </button>
          <button
            type="button"
            onClick={() => onPageChange(page + 1)}
            disabled={(pagination?.page || page) >= (pagination?.totalPages || 1)}
            style={{ border: '1px solid #cbd5e1', backgroundColor: '#fff', color: '#0f172a', borderRadius: '10px', padding: '0.55rem 0.9rem', fontWeight: 700, cursor: 'pointer' }}
          >
            Next
          </button>
        </div>
      </div>
    </>
  );
};

export default SuppliersList;
