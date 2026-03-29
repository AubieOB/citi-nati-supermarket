import React, { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../../../utils/api.js';

const cardStyle = {
  backgroundColor: '#fff',
  border: '1px solid #e2e8f0',
  borderRadius: '18px',
  boxShadow: '0 10px 24px rgba(15, 23, 42, 0.05)',
};

const tableStyle = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: '0.9rem',
};

const thStyle = {
  textAlign: 'left',
  padding: '0.85rem 0.9rem',
  color: '#475569',
  fontSize: '0.78rem',
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

const EmptyState = ({ message }) => (
  <div style={{ padding: '2rem', color: '#64748b', textAlign: 'center' }}>{message}</div>
);

const ErrorState = ({ message }) => (
  <div style={{ padding: '1rem 1.25rem', borderRadius: '14px', backgroundColor: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca' }}>
    {message}
  </div>
);

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

const SuppliersTab = ({ refreshKey = 0 }) => {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [suppliers, setSuppliers] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedSupplierId, setSelectedSupplierId] = useState(null);
  const [detailState, setDetailState] = useState({ loading: false, error: '', balance: null, transactions: [] });

  const fetchSuppliers = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await api.get('/business-operations/suppliers', {
        params: {
          page,
          pageSize: 25,
          sortBy: 'createdAt',
          sortOrder: 'desc',
          search: search || undefined,
          status: statusFilter || undefined,
        },
      });

      setSuppliers(response.data?.data || []);
      setPagination(response.data?.pagination || null);
    } catch (requestError) {
      setSuppliers([]);
      setPagination(null);
      setError(requestError.response?.data?.error || 'Failed to load suppliers');
    } finally {
      setLoading(false);
    }
  }, [page, search, statusFilter]);

  const fetchSupplierDetail = useCallback(async (supplierId) => {
    if (!supplierId) {
      setDetailState({ loading: false, error: '', balance: null, transactions: [] });
      return;
    }

    setDetailState((current) => ({ ...current, loading: true, error: '' }));
    try {
      const [balanceResponse, transactionsResponse] = await Promise.all([
        api.get(`/business-operations/suppliers/${supplierId}/balance`),
        api.get('/business-operations/suppliers/transactions/list', {
          params: { supplierId, page: 1, pageSize: 12, sortBy: 'transactionDate', sortOrder: 'desc' },
        }),
      ]);

      setDetailState({
        loading: false,
        error: '',
        balance: balanceResponse.data?.data || null,
        transactions: transactionsResponse.data?.data || [],
      });
    } catch (requestError) {
      setDetailState({
        loading: false,
        error: requestError.response?.data?.error || 'Failed to load supplier balance and transactions',
        balance: null,
        transactions: [],
      });
    }
  }, []);

  useEffect(() => {
    fetchSuppliers();
  }, [fetchSuppliers, refreshKey]);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter]);

  useEffect(() => {
    if (!suppliers.length) {
      setSelectedSupplierId(null);
      setDetailState({ loading: false, error: '', balance: null, transactions: [] });
      return;
    }

    const stillVisible = suppliers.some((supplier) => supplier.id === selectedSupplierId);
    if (!selectedSupplierId || !stillVisible) {
      setSelectedSupplierId(suppliers[0].id);
    }
  }, [selectedSupplierId, suppliers]);

  useEffect(() => {
    fetchSupplierDetail(selectedSupplierId);
  }, [fetchSupplierDetail, refreshKey, selectedSupplierId]);

  const totalSuppliers = pagination?.total || 0;
  const activeSuppliers = useMemo(
    () => suppliers.filter((supplier) => String(supplier.status || '').toLowerCase() === 'active').length,
    [suppliers]
  );

  const selectedSupplier = detailState.balance?.supplier || null;
  const balanceSummary = detailState.balance?.summary || null;

  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      <div style={{ ...cardStyle, padding: '1.2rem 1.3rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div>
            <h3 style={{ margin: 0, color: '#0f172a', fontSize: '1.15rem' }}>Suppliers</h3>
            <p style={{ margin: '0.45rem 0 0', color: '#64748b', lineHeight: 1.6, maxWidth: '780px' }}>
              Supplier imports now land in a live register with balance visibility and recent transaction history.
            </p>
          </div>
          <button
            type="button"
            onClick={fetchSuppliers}
            disabled={loading}
            style={{ border: '1px solid #cbd5e1', backgroundColor: '#fff', color: '#0f172a', borderRadius: '10px', padding: '0.7rem 1rem', fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer' }}
          >
            <i className={`fas ${loading ? 'fa-spinner fa-spin' : 'fa-rotate-right'}`} style={{ marginRight: '0.45rem' }}></i>
            Refresh
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.9rem', marginTop: '1rem' }}>
          <div style={{ ...cardStyle, padding: '1rem 1.1rem' }}>
            <div style={{ color: '#64748b', fontSize: '0.78rem', textTransform: 'uppercase', fontWeight: 800, letterSpacing: '0.05em' }}>Total Suppliers</div>
            <div style={{ marginTop: '0.35rem', fontSize: '1.65rem', fontWeight: 800, color: '#0f172a' }}>{totalSuppliers.toLocaleString('en-US')}</div>
          </div>
          <div style={{ ...cardStyle, padding: '1rem 1.1rem' }}>
            <div style={{ color: '#64748b', fontSize: '0.78rem', textTransform: 'uppercase', fontWeight: 800, letterSpacing: '0.05em' }}>Active On Page</div>
            <div style={{ marginTop: '0.35rem', fontSize: '1.65rem', fontWeight: 800, color: '#0f172a' }}>{activeSuppliers.toLocaleString('en-US')}</div>
          </div>
          <div style={{ ...cardStyle, padding: '1rem 1.1rem' }}>
            <div style={{ color: '#64748b', fontSize: '0.78rem', textTransform: 'uppercase', fontWeight: 800, letterSpacing: '0.05em' }}>Outstanding Balance</div>
            <div style={{ marginTop: '0.35rem', fontSize: '1.65rem', fontWeight: 800, color: '#0f172a' }}>{money(balanceSummary?.outstandingBalance)}</div>
          </div>
          <div style={{ ...cardStyle, padding: '1rem 1.1rem' }}>
            <div style={{ color: '#64748b', fontSize: '0.78rem', textTransform: 'uppercase', fontWeight: 800, letterSpacing: '0.05em' }}>Selected Supplier Paid</div>
            <div style={{ marginTop: '0.35rem', fontSize: '1.65rem', fontWeight: 800, color: '#0f172a' }}>{money(balanceSummary?.totalPaid)}</div>
          </div>
        </div>
      </div>

      <div style={{ ...cardStyle, padding: '1rem' }}>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 320px', position: 'relative' }}>
            <i className="fas fa-search" style={{ position: 'absolute', top: '50%', left: '0.95rem', transform: 'translateY(-50%)', color: '#94a3b8' }}></i>
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by supplier name, code, contact, phone, or email"
              style={{ width: '100%', boxSizing: 'border-box', padding: '0.85rem 1rem 0.85rem 2.7rem', borderRadius: '12px', border: '1px solid #cbd5e1', fontSize: '0.92rem' }}
            />
          </div>
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            style={{ minWidth: '180px', padding: '0.85rem 1rem', borderRadius: '12px', border: '1px solid #cbd5e1', fontSize: '0.92rem', backgroundColor: '#fff' }}
          >
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
      </div>

      <div style={{ ...cardStyle, overflow: 'hidden' }}>
        {error ? (
          <div style={{ padding: '1rem' }}><ErrorState message={error} /></div>
        ) : loading ? (
          <EmptyState message="Loading suppliers..." />
        ) : !suppliers.length ? (
          <EmptyState message="No suppliers matched the current search and status filters." />
        ) : (
          <>
            <div style={{ overflowX: 'auto', maxHeight: '500px' }}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={thStyle}>Supplier</th>
                    <th style={thStyle}>Contact</th>
                    <th style={thStyle}>Status</th>
                    <th style={thStyle}>Opening Balance</th>
                    <th style={thStyle}>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {suppliers.map((supplier) => {
                    const selected = supplier.id === selectedSupplierId;
                    return (
                      <tr key={supplier.id} onClick={() => setSelectedSupplierId(supplier.id)} style={{ backgroundColor: selected ? '#f8fafc' : '#fff', cursor: 'pointer' }}>
                        <td style={tdStyle}>
                          <div style={{ display: 'grid', gap: '0.25rem' }}>
                            <strong style={{ color: '#0f172a' }}>{supplier.name}</strong>
                            <span style={{ color: '#64748b', fontSize: '0.84rem' }}>{supplier.supplierCode || 'No supplier code'}</span>
                          </div>
                        </td>
                        <td style={tdStyle}>
                          <div style={{ display: 'grid', gap: '0.25rem' }}>
                            <span>{supplier.contactPerson || 'No contact person'}</span>
                            <span style={{ color: '#64748b', fontSize: '0.84rem' }}>{supplier.phone || supplier.email || 'No phone or email'}</span>
                          </div>
                        </td>
                        <td style={tdStyle}><span style={statusBadgeStyle(String(supplier.status || '').toLowerCase())}>{supplier.status || 'Unknown'}</span></td>
                        <td style={tdStyle}>{money(supplier.openingBalance)}</td>
                        <td style={tdStyle}>{supplier.notes || 'No notes'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', padding: '1rem', borderTop: '1px solid #e2e8f0', flexWrap: 'wrap' }}>
              <span style={{ color: '#64748b', fontSize: '0.88rem' }}>Page {pagination?.page || 1} of {pagination?.totalPages || 1} with {(pagination?.total || 0).toLocaleString('en-US')} suppliers.</span>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={(pagination?.page || 1) <= 1} style={{ border: '1px solid #cbd5e1', backgroundColor: '#fff', color: '#0f172a', borderRadius: '10px', padding: '0.55rem 0.9rem', fontWeight: 700, cursor: 'pointer' }}>Previous</button>
                <button type="button" onClick={() => setPage((current) => current + 1)} disabled={(pagination?.page || 1) >= (pagination?.totalPages || 1)} style={{ border: '1px solid #cbd5e1', backgroundColor: '#fff', color: '#0f172a', borderRadius: '10px', padding: '0.55rem 0.9rem', fontWeight: 700, cursor: 'pointer' }}>Next</button>
              </div>
            </div>
          </>
        )}
      </div>

      <div style={{ ...cardStyle, padding: '1.2rem 1.3rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div>
            <h4 style={{ margin: 0, color: '#0f172a', fontSize: '1rem' }}>Selected Supplier Ledger</h4>
            <p style={{ margin: '0.35rem 0 0', color: '#64748b', fontSize: '0.9rem' }}>
              Balance summary and latest supplier transactions for the selected record.
            </p>
          </div>
          {selectedSupplier && <div style={statusBadgeStyle(String(selectedSupplier.status || '').toLowerCase())}>{selectedSupplier.status || 'Unknown'}</div>}
        </div>

        {detailState.error ? (
          <div style={{ marginTop: '1rem' }}><ErrorState message={detailState.error} /></div>
        ) : detailState.loading ? (
          <EmptyState message="Loading supplier ledger..." />
        ) : !selectedSupplier ? (
          <EmptyState message="Select a supplier above to inspect balance and transactions." />
        ) : (
          <div style={{ display: 'grid', gap: '1rem', marginTop: '1rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.9rem' }}>
              <div style={{ backgroundColor: '#f8fafc', borderRadius: '14px', padding: '1rem' }}>
                <div style={{ color: '#64748b', fontSize: '0.78rem', textTransform: 'uppercase', fontWeight: 800, letterSpacing: '0.05em' }}>Opening Balance</div>
                <div style={{ marginTop: '0.45rem', fontWeight: 800, color: '#0f172a' }}>{money(balanceSummary?.openingBalance)}</div>
              </div>
              <div style={{ backgroundColor: '#f8fafc', borderRadius: '14px', padding: '1rem' }}>
                <div style={{ color: '#64748b', fontSize: '0.78rem', textTransform: 'uppercase', fontWeight: 800, letterSpacing: '0.05em' }}>Total Debt</div>
                <div style={{ marginTop: '0.45rem', fontWeight: 800, color: '#0f172a' }}>{money(balanceSummary?.totalDebt)}</div>
              </div>
              <div style={{ backgroundColor: '#f8fafc', borderRadius: '14px', padding: '1rem' }}>
                <div style={{ color: '#64748b', fontSize: '0.78rem', textTransform: 'uppercase', fontWeight: 800, letterSpacing: '0.05em' }}>Total Paid</div>
                <div style={{ marginTop: '0.45rem', fontWeight: 800, color: '#0f172a' }}>{money(balanceSummary?.totalPaid)}</div>
              </div>
              <div style={{ backgroundColor: '#f8fafc', borderRadius: '14px', padding: '1rem' }}>
                <div style={{ color: '#64748b', fontSize: '0.78rem', textTransform: 'uppercase', fontWeight: 800, letterSpacing: '0.05em' }}>Outstanding</div>
                <div style={{ marginTop: '0.45rem', fontWeight: 800, color: '#0f172a' }}>{money(balanceSummary?.outstandingBalance)}</div>
              </div>
            </div>

            <div style={{ border: '1px solid #e2e8f0', borderRadius: '16px', overflow: 'hidden' }}>
              <div style={{ padding: '1rem 1.1rem', borderBottom: '1px solid #e2e8f0', backgroundColor: '#f8fafc' }}>
                <strong style={{ color: '#0f172a' }}>Recent Transactions</strong>
              </div>
              {!detailState.transactions.length ? (
                <EmptyState message="No supplier transactions are attached to this supplier yet." />
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={tableStyle}>
                    <thead>
                      <tr>
                        <th style={thStyle}>Date</th>
                        <th style={thStyle}>Type</th>
                        <th style={thStyle}>Payment Method</th>
                        <th style={thStyle}>Reference</th>
                        <th style={thStyle}>Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detailState.transactions.map((transaction) => (
                        <tr key={transaction.id}>
                          <td style={tdStyle}>{formatDate(transaction.transactionDate)}</td>
                          <td style={tdStyle}>{transaction.transactionType || 'Unknown'}</td>
                          <td style={tdStyle}>{transaction.paymentMethod || 'Not set'}</td>
                          <td style={tdStyle}>{transaction.referenceNo || 'Not set'}</td>
                          <td style={tdStyle}>{money(transaction.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SuppliersTab;