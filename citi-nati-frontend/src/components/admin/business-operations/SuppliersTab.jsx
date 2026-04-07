import React, { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../../../utils/api.js';
import { downloadBusinessReport } from '../../../utils/exportService.js';
import { exportSuppliersPdf } from '../../../utils/businessOperationsPdfExports.js';
import SuppliersList from './SuppliersList.jsx';
import SupplierDetailPanel from './SupplierDetailPanel.jsx';
import SupplierFormModal from './SupplierFormModal.jsx';
import SupplierTransactionFormModal from './SupplierTransactionFormModal.jsx';
import SupplierEmptyState from './SupplierEmptyState.jsx';

const cardStyle = {
  backgroundColor: '#fff',
  border: '1px solid #e2e8f0',
  borderRadius: '18px',
  boxShadow: '0 10px 24px rgba(15, 23, 42, 0.05)',
};

const money = (value) => `MWK ${Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const balanceMeta = (value, debtLabel, creditLabel) => {
  const amount = Number(value || 0);

  if (amount > 0) {
    return {
      label: debtLabel,
      amount: money(amount),
      color: '#b91c1c',
    };
  }

  if (amount < 0) {
    return {
      label: creditLabel,
      amount: money(Math.abs(amount)),
      color: '#166534',
    };
  }

  return {
    label: 'Balanced',
    amount: money(0),
    color: '#0f172a',
  };
};

const INITIAL_DETAIL_STATE = {
  supplier: null,
  summary: null,
  transactions: [],
  transactionPagination: null,
};

const SuppliersTab = ({ refreshKey = 0, selectedLocationId = null, locations = [] }) => {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [isSuppliersWorkspaceModalOpen, setIsSuppliersWorkspaceModalOpen] = useState(false);
  const [isSuppliersWorkspaceMaximized, setIsSuppliersWorkspaceMaximized] = useState(false);
  const [page, setPage] = useState(1);
  const [transactionPage, setTransactionPage] = useState(1);

  const [suppliers, setSuppliers] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState('');

  const [selectedSupplierId, setSelectedSupplierId] = useState(null);
  const [detailState, setDetailState] = useState(INITIAL_DETAIL_STATE);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [transactionsLoading, setTransactionsLoading] = useState(false);
  const [transactionsError, setTransactionsError] = useState('');

  const [supplierModalState, setSupplierModalState] = useState({ open: false, supplier: null });
  const [supplierFormSaving, setSupplierFormSaving] = useState(false);
  const [supplierFormError, setSupplierFormError] = useState('');

  const [transactionModalState, setTransactionModalState] = useState({ open: false, transaction: null });
  const [transactionFormSaving, setTransactionFormSaving] = useState(false);
  const [transactionFormError, setTransactionFormError] = useState('');
  const [exportingExcel, setExportingExcel] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);

  const [pendingSelectedSupplierId, setPendingSelectedSupplierId] = useState(null);

  const supplierOptions = useMemo(() => {
    const currentOptions = suppliers.map((supplier) => ({ id: supplier.id, name: supplier.name }));
    const selectedSupplier = detailState.supplier;
    if (selectedSupplier && !currentOptions.some((item) => item.id === selectedSupplier.id)) {
      return [{ id: selectedSupplier.id, name: selectedSupplier.name }, ...currentOptions];
    }
    return currentOptions;
  }, [detailState.supplier, suppliers]);

  const totals = useMemo(() => {
    const activeSuppliers = suppliers.filter((supplier) => String(supplier.status || '').toLowerCase() === 'active').length;
    const pageBalance = suppliers.reduce((sum, supplier) => sum + Number(supplier.currentBalance || 0), 0);

    return {
      totalSuppliers: pagination?.total || 0,
      activeSuppliers,
      pageBalance,
    };
  }, [pagination?.total, suppliers]);

  const fetchSuppliers = useCallback(async () => {
    setListLoading(true);
    setListError('');

    try {
      const response = await api.get('/business-operations/suppliers', {
        params: {
          page,
          pageSize: 20,
          sortBy: 'createdAt',
          sortOrder: 'desc',
          search: search || undefined,
          status: statusFilter || undefined,
          locationId: selectedLocationId || undefined,
        },
      });

      setSuppliers(response.data?.data || []);
      setPagination(response.data?.pagination || null);
    } catch (error) {
      setSuppliers([]);
      setPagination(null);
      setListError(error.response?.data?.error || 'Failed to load suppliers');
    } finally {
      setListLoading(false);
    }
  }, [page, search, selectedLocationId, statusFilter]);

  const fetchSupplierDetail = useCallback(async (supplierId, nextTransactionPage = 1) => {
    if (!supplierId) {
      setDetailState(INITIAL_DETAIL_STATE);
      setDetailError('');
      setTransactionsError('');
      return;
    }

    setDetailLoading(true);
    setTransactionsLoading(true);
    setDetailError('');
    setTransactionsError('');

    try {
      const [supplierResponse, balanceResponse, transactionsResponse] = await Promise.all([
        api.get(`/business-operations/suppliers/${supplierId}`),
        api.get(`/business-operations/suppliers/${supplierId}/balance`),
        api.get('/business-operations/suppliers/transactions/list', {
          params: {
            supplierId,
            page: nextTransactionPage,
            pageSize: 12,
            sortBy: 'transactionDate',
            sortOrder: 'desc',
            locationId: selectedLocationId || undefined,
          },
        }),
      ]);

      setDetailState({
        supplier: supplierResponse.data?.data || balanceResponse.data?.data?.supplier || null,
        summary: balanceResponse.data?.data?.summary || null,
        transactions: transactionsResponse.data?.data || [],
        transactionPagination: transactionsResponse.data?.pagination || null,
      });
    } catch (error) {
      setDetailState(INITIAL_DETAIL_STATE);
      const message = error.response?.data?.error || 'Failed to load supplier details';
      setDetailError(message);
      setTransactionsError(message);
    } finally {
      setDetailLoading(false);
      setTransactionsLoading(false);
    }
  }, [selectedLocationId]);

  const refreshData = useCallback(async ({ selectedId = selectedSupplierId, nextTransactionPage = transactionPage } = {}) => {
    await fetchSuppliers();
    if (selectedId) {
      await fetchSupplierDetail(selectedId, nextTransactionPage);
    }
  }, [fetchSupplierDetail, fetchSuppliers, selectedSupplierId, transactionPage]);

  useEffect(() => {
    fetchSuppliers();
  }, [fetchSuppliers, refreshKey]);

  useEffect(() => {
    setPage(1);
  }, [search, selectedLocationId, statusFilter]);

  useEffect(() => {
    setTransactionPage(1);
  }, [selectedSupplierId]);

  useEffect(() => {
    if (!suppliers.length) {
      setSelectedSupplierId(null);
      return;
    }

    if (pendingSelectedSupplierId && suppliers.some((supplier) => supplier.id === pendingSelectedSupplierId)) {
      setSelectedSupplierId(pendingSelectedSupplierId);
      setPendingSelectedSupplierId(null);
      return;
    }

    const isStillVisible = suppliers.some((supplier) => supplier.id === selectedSupplierId);
    if (!selectedSupplierId || !isStillVisible) {
      setSelectedSupplierId(suppliers[0].id);
    }
  }, [pendingSelectedSupplierId, selectedSupplierId, suppliers]);

  useEffect(() => {
    if (!selectedSupplierId) {
      setDetailState(INITIAL_DETAIL_STATE);
      return;
    }

    fetchSupplierDetail(selectedSupplierId, transactionPage);
  }, [fetchSupplierDetail, refreshKey, selectedSupplierId, transactionPage]);

  const handleSupplierSubmit = async (payload) => {
    setSupplierFormSaving(true);
    setSupplierFormError('');

    try {
      const response = supplierModalState.supplier
        ? await api.put(`/business-operations/suppliers/${supplierModalState.supplier.id}`, { ...payload, locationId: payload.locationId ?? selectedLocationId ?? undefined })
        : await api.post('/business-operations/suppliers', { ...payload, locationId: payload.locationId ?? selectedLocationId ?? undefined });

      const savedSupplier = response.data?.data || null;
      setSupplierModalState({ open: false, supplier: null });

      if (savedSupplier?.id) {
        setPendingSelectedSupplierId(savedSupplier.id);
        setSelectedSupplierId(savedSupplier.id);
      }

      await refreshData({ selectedId: savedSupplier?.id || selectedSupplierId, nextTransactionPage: 1 });
    } catch (error) {
      setSupplierFormError(error.response?.data?.error || 'Failed to save supplier');
    } finally {
      setSupplierFormSaving(false);
    }
  };

  const handleTransactionSubmit = async (payload) => {
    setTransactionFormSaving(true);
    setTransactionFormError('');

    try {
      await (transactionModalState.transaction
        ? api.put(`/business-operations/suppliers/transactions/${transactionModalState.transaction.id}`, { ...payload, locationId: payload.locationId ?? selectedLocationId ?? undefined })
        : api.post('/business-operations/suppliers/transactions', { ...payload, locationId: payload.locationId ?? selectedLocationId ?? undefined }));

      setTransactionModalState({ open: false, transaction: null });
      setTransactionPage(1);
      await refreshData({ selectedId: payload.supplierId || selectedSupplierId, nextTransactionPage: 1 });
    } catch (error) {
      setTransactionFormError(error.response?.data?.error || 'Failed to save supplier transaction');
    } finally {
      setTransactionFormSaving(false);
    }
  };

  const openCreateSupplier = () => {
    setSupplierFormError('');
    setSupplierModalState({ open: true, supplier: null });
  };

  const openEditSupplier = (supplier) => {
    setSupplierFormError('');
    setSupplierModalState({ open: true, supplier });
  };

  const openCreateTransaction = () => {
    setTransactionFormError('');
    setTransactionModalState({ open: true, transaction: null });
  };

  const openEditTransaction = (transaction) => {
    setTransactionFormError('');
    setTransactionModalState({ open: true, transaction });
  };

  const handleDeleteSupplier = async (supplier) => {
    try {
      await api.delete(`/business-operations/suppliers/${supplier.id}`);
      if (selectedSupplierId === supplier.id) setSelectedSupplierId(null);
      await refreshData({ selectedId: null, nextTransactionPage: 1 });
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to delete supplier');
    }
  };

  const handleDeleteTransaction = async (transaction) => {
    try {
      await api.delete(`/business-operations/suppliers/transactions/${transaction.id}`);
      await refreshData({ selectedId: selectedSupplierId, nextTransactionPage: 1 });
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to delete transaction');
    }
  };

  const selectedSupplier = detailState.supplier;
  const selectedSummary = detailState.summary;
  const pageBalanceMeta = balanceMeta(totals.pageBalance, 'Page Exposure (Debt)', 'Page Credit');
  const selectedBalanceMeta = balanceMeta(selectedSummary?.outstandingBalance, 'Selected Outstanding', 'Selected Credit');

  const handleExport = async (format) => {
    if (format === 'excel') setExportingExcel(true);
    if (format === 'pdf') setExportingPdf(true);

    try {
      if (format === 'pdf') {
        exportSuppliersPdf({
          suppliers,
          pagination,
          selectedSupplier,
          selectedSummary,
          search,
          statusFilter,
          selectedLocationId,
        });
        return;
      }

      await downloadBusinessReport({
        format,
        module: 'suppliers',
        type: 'all',
        filters: {
          search,
          status: statusFilter,
          supplierId: selectedSupplierId,
          locationId: selectedLocationId,
        },
      });
    } catch (error) {
      const message = error?.response?.data?.error || `Failed to export ${format.toUpperCase()} report.`;
      window.alert(message);
    } finally {
      if (format === 'excel') setExportingExcel(false);
      if (format === 'pdf') setExportingPdf(false);
    }
  };

  useEffect(() => {
    if (!isSuppliersWorkspaceModalOpen || supplierModalState.open || transactionModalState.open) return;
    const handler = (event) => { if (event.key === 'Escape') { setIsSuppliersWorkspaceModalOpen(false); setIsSuppliersWorkspaceMaximized(false); } };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isSuppliersWorkspaceModalOpen, supplierModalState.open, transactionModalState.open]);

  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      <div style={{ ...cardStyle, padding: '1.05rem 1.1rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '0.9rem' }}>
          <div style={{ ...cardStyle, padding: '1rem 1.1rem' }}>
            <div style={{ color: '#64748b', fontSize: '0.76rem', textTransform: 'uppercase', fontWeight: 800, letterSpacing: '0.05em' }}>Total Suppliers</div>
            <div style={{ marginTop: '0.35rem', fontSize: '1.46rem', lineHeight: 1.1, fontWeight: 800, color: '#0f172a', whiteSpace: 'nowrap' }}>{totals.totalSuppliers.toLocaleString('en-US')}</div>
          </div>
          <div style={{ ...cardStyle, padding: '1rem 1.1rem' }}>
            <div style={{ color: '#64748b', fontSize: '0.76rem', textTransform: 'uppercase', fontWeight: 800, letterSpacing: '0.05em' }}>Active On Page</div>
            <div style={{ marginTop: '0.35rem', fontSize: '1.46rem', lineHeight: 1.1, fontWeight: 800, color: '#0f172a', whiteSpace: 'nowrap' }}>{totals.activeSuppliers.toLocaleString('en-US')}</div>
          </div>
          <div style={{ ...cardStyle, padding: '1rem 1.1rem' }}>
            <div style={{ color: '#64748b', fontSize: '0.76rem', textTransform: 'uppercase', fontWeight: 800, letterSpacing: '0.05em' }}>{pageBalanceMeta.label}</div>
            <div style={{ marginTop: '0.35rem', fontSize: '1.32rem', lineHeight: 1.1, fontWeight: 800, color: pageBalanceMeta.color, whiteSpace: 'nowrap' }}>{pageBalanceMeta.amount}</div>
          </div>
          <div style={{ ...cardStyle, padding: '1rem 1.1rem' }}>
            <div style={{ color: '#64748b', fontSize: '0.76rem', textTransform: 'uppercase', fontWeight: 800, letterSpacing: '0.05em' }}>{selectedBalanceMeta.label}</div>
            <div style={{ marginTop: '0.35rem', fontSize: '1.32rem', lineHeight: 1.1, fontWeight: 800, color: selectedBalanceMeta.color, whiteSpace: 'nowrap' }}>{selectedBalanceMeta.amount}</div>
          </div>
        </div>
      </div>

      <div style={{ ...cardStyle, padding: '1rem 1.1rem' }}>
        <div style={{ display: 'grid', gap: '0.78rem' }}>
          <div>
            <strong style={{ color: '#0f172a' }}>Supplier Workspaces</strong>
            <p style={{ margin: '0.3rem 0 0', color: '#64748b', fontSize: '0.88rem' }}>
              Open supplier register and balance operations from the launcher card.
            </p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '0.75rem' }}>
            <button
              type="button"
              title="Click to open"
              onClick={() => { setIsSuppliersWorkspaceMaximized(false); setIsSuppliersWorkspaceModalOpen(true); }}
              onMouseEnter={(event) => {
                event.currentTarget.style.transform = 'translateY(-2px)';
                event.currentTarget.style.boxShadow = '0 12px 24px rgba(15, 23, 42, 0.12)';
                event.currentTarget.style.borderColor = '#cbd5e1';
                event.currentTarget.style.backgroundColor = '#f8fafc';
              }}
              onMouseLeave={(event) => {
                event.currentTarget.style.transform = 'translateY(0)';
                event.currentTarget.style.boxShadow = '0 6px 18px rgba(15, 23, 42, 0.04)';
                event.currentTarget.style.borderColor = '#e2e8f0';
                event.currentTarget.style.backgroundColor = '#fff';
              }}
              style={{ border: '1px solid #e2e8f0', backgroundColor: '#fff', borderRadius: '14px', padding: '0.95rem 1rem', cursor: 'pointer', textAlign: 'left', display: 'grid', gap: '0.42rem', boxShadow: '0 6px 18px rgba(15, 23, 42, 0.04)', transition: 'transform 0.16s ease, box-shadow 0.16s ease, border-color 0.16s ease, background-color 0.16s ease' }}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '34px', height: '34px', borderRadius: '10px', backgroundColor: '#fee2e2', color: '#b91c1c' }}>
                <i className="fas fa-truck-field" />
              </span>
              <span style={{ color: '#0f172a', fontWeight: 800, fontSize: '0.95rem' }}>Supplier Register Workspace</span>
              <span style={{ color: '#64748b', fontSize: '0.84rem', lineHeight: 1.45 }}>Manage suppliers, balances, and transaction history records.</span>
            </button>
          </div>
        </div>
      </div>

      {isSuppliersWorkspaceModalOpen && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.45)', zIndex: 170, display: 'grid', placeItems: 'center', padding: isSuppliersWorkspaceMaximized ? '0.35rem' : '1rem' }}>
          <div style={{ ...cardStyle, width: isSuppliersWorkspaceMaximized ? 'calc(100vw - 0.7rem)' : 'min(1400px, 97vw)', height: isSuppliersWorkspaceMaximized ? 'calc(100vh - 0.7rem)' : '92vh', maxHeight: 'none', overflow: 'hidden', borderRadius: isSuppliersWorkspaceMaximized ? '10px' : '18px', display: 'flex', flexDirection: 'column' }}>
            <div style={{ flexShrink: 0, padding: '1rem 1.1rem', borderBottom: '1px solid #e2e8f0', boxShadow: '0 4px 12px rgba(15,23,42,0.04)' }}>
              <div style={{ display: 'grid', gap: '0.85rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem', flexWrap: 'wrap' }}>
                  <div>
                    <h2 style={{ margin: 0, color: '#0f172a', fontSize: '1.15rem', fontWeight: 800 }}>Suppliers Workspace</h2>
                    <p style={{ margin: '0.28rem 0 0', color: '#64748b', fontSize: '0.86rem' }}>Manage supplier records, balance position, and transaction activity from one view.</p>
                  </div>
                  <div style={{ display: 'flex', gap: '0.55rem', flexWrap: 'wrap', alignItems: 'center' }}>
                  <button
                    type="button"
                    onClick={openCreateSupplier}
                    style={{ border: 'none', backgroundColor: '#5B4B8A', color: '#fff', borderRadius: '10px', padding: '0.55rem 0.85rem', fontWeight: 700, fontSize: '0.86rem', cursor: 'pointer' }}
                  >
                    <i className="fas fa-plus" style={{ marginRight: '0.42rem' }}></i>
                    Add New Supplier
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowFilters((prev) => !prev)}
                    style={{ border: '1px solid #cbd5e1', backgroundColor: '#fff', color: '#0f172a', borderRadius: '10px', padding: '0.55rem 0.85rem', fontWeight: 700, fontSize: '0.86rem', cursor: 'pointer' }}
                  >
                    <i className="fas fa-sliders" style={{ marginRight: '0.42rem' }}></i>
                    {showFilters ? 'Hide Filters' : 'Show Filters'}
                  </button>
                  <button
                    type="button"
                    onClick={() => refreshData({ selectedId: selectedSupplierId, nextTransactionPage: transactionPage })}
                    disabled={listLoading || detailLoading || transactionsLoading}
                    style={{ border: '1px solid #cbd5e1', backgroundColor: '#fff', color: '#0f172a', borderRadius: '10px', padding: '0.55rem 0.85rem', fontWeight: 700, fontSize: '0.86rem', cursor: 'pointer' }}
                  >
                    <i className={`fas ${(listLoading || detailLoading || transactionsLoading) ? 'fa-spinner fa-spin' : 'fa-rotate-right'}`} style={{ marginRight: '0.42rem' }}></i>
                    Refresh
                  </button>
                  <button
                    type="button"
                    onClick={() => handleExport('pdf')}
                    disabled={exportingExcel || exportingPdf}
                    style={{ border: '1px solid #cbd5e1', backgroundColor: '#fff', color: '#0f172a', borderRadius: '10px', padding: '0.58rem 0.86rem', fontWeight: 700, cursor: exportingExcel || exportingPdf ? 'not-allowed' : 'pointer' }}
                  >
                    <i className={`fas ${exportingPdf ? 'fa-spinner fa-spin' : 'fa-file-pdf'}`} style={{ marginRight: '0.42rem' }}></i>
                    Export PDF
                  </button>
                  <button
                    type="button"
                    onClick={() => handleExport('excel')}
                    disabled={exportingExcel || exportingPdf}
                    style={{ border: '1px solid #cbd5e1', backgroundColor: '#fff', color: '#0f172a', borderRadius: '10px', padding: '0.58rem 0.86rem', fontWeight: 700, cursor: exportingExcel || exportingPdf ? 'not-allowed' : 'pointer' }}
                  >
                    <i className={`fas ${exportingExcel ? 'fa-spinner fa-spin' : 'fa-file-excel'}`} style={{ marginRight: '0.42rem' }}></i>
                    Export Excel
                  </button>
                  <button
                    type="button"
                    title={isSuppliersWorkspaceMaximized ? 'Restore' : 'Maximize'}
                    aria-label={isSuppliersWorkspaceMaximized ? 'Restore workspace' : 'Maximize workspace'}
                    onClick={() => setIsSuppliersWorkspaceMaximized((prev) => !prev)}
                    style={{ border: '1px solid #cbd5e1', backgroundColor: '#fff', color: '#334155', borderRadius: '9px', padding: '0.45rem 0.62rem', cursor: 'pointer', fontWeight: 700 }}
                  >
                    <i className={`fas ${isSuppliersWorkspaceMaximized ? 'fa-window-restore' : 'fa-window-maximize'}`} />
                  </button>
                  <button
                    type="button"
                    title="Close"
                    aria-label="Close workspace"
                    onClick={() => { setIsSuppliersWorkspaceModalOpen(false); setIsSuppliersWorkspaceMaximized(false); }}
                    style={{ border: '1px solid #cbd5e1', backgroundColor: '#fff', color: '#334155', borderRadius: '9px', padding: '0.45rem 0.62rem', cursor: 'pointer', fontWeight: 700 }}
                  >
                    <i className="fas fa-times" />
                  </button>
                </div>
              </div>

              {showFilters && (
                <div style={{ marginTop: '0.2rem', display: 'flex', gap: '0.65rem', flexWrap: 'wrap', alignItems: 'center' }}>
                  <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                    <div style={{ flex: '1 1 280px', position: 'relative' }}>
                      <i className="fas fa-search" style={{ position: 'absolute', top: '50%', left: '0.95rem', transform: 'translateY(-50%)', color: '#94a3b8' }}></i>
                      <input
                        type="text"
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder="Search by supplier name, code, contact, phone, or email"
                        style={{ width: '100%', boxSizing: 'border-box', padding: '0.78rem 0.9rem 0.78rem 2.5rem', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '0.9rem', backgroundColor: '#f8fafc' }}
                      />
                    </div>
                    <select
                      value={statusFilter}
                      onChange={(event) => setStatusFilter(event.target.value)}
                      style={{ minWidth: '140px', padding: '0.78rem 0.9rem', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '0.9rem', backgroundColor: '#f8fafc' }}
                    >
                      <option value="">All statuses</option>
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </div>
                </div>
              )}
              </div>
            </div>

            <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'minmax(360px, 420px) 1fr', minHeight: 0 }}>
              <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, borderRight: '1px solid #e2e8f0' }}>
                <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
                  <div style={{ position: 'sticky', top: 0, zIndex: 2, backgroundColor: '#ffffff', borderBottom: '1px solid #e2e8f0', padding: '0.52rem 0.85rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.76rem', color: '#64748b', fontWeight: 600 }}>
                    <span>Visible: {suppliers.length} {suppliers.length === 1 ? 'supplier' : 'suppliers'}</span>
                    <span style={{ color: '#334155', maxWidth: '170px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      Selected: {selectedSupplier ? selectedSupplier.name : 'None'}
                    </span>
                  </div>
                  <div style={{ padding: '0.85rem' }}>
                    <div style={{ ...cardStyle, overflow: 'hidden' }}>
                      <div style={{ padding: '1rem 1.05rem', borderBottom: '1px solid #e2e8f0', backgroundColor: '#f8fafc' }}>
                        <strong style={{ color: '#0f172a' }}>Supplier Register</strong>
                        <p style={{ margin: '0.35rem 0 0', color: '#64748b', fontSize: '0.88rem' }}>Select a supplier to inspect balance history, edit details, or record transactions.</p>
                      </div>
                      <SuppliersList
                        suppliers={suppliers}
                        loading={listLoading}
                        error={listError}
                        pagination={pagination}
                        page={page}
                        onPageChange={setPage}
                        selectedSupplierId={selectedSupplierId}
                        onSelectSupplier={(supplier) => setSelectedSupplierId(supplier.id)}
                        onEditSupplier={openEditSupplier}
                        onDeleteSupplier={handleDeleteSupplier}
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
                  <div style={{ position: 'sticky', top: 0, zIndex: 2, backgroundColor: '#ffffff', borderBottom: '1px solid #e2e8f0', padding: '0.52rem 0.85rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.76rem', color: '#64748b', fontWeight: 600 }}>
                    <span style={{ maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {selectedSupplier ? `${selectedSupplier.name}${selectedSupplier.supplierCode ? ` · ${selectedSupplier.supplierCode}` : ''}` : 'No supplier selected'}
                    </span>
                    <span style={{ color: String(selectedSupplier?.status || '').toLowerCase() === 'active' ? '#166534' : '#334155', fontWeight: 700, textTransform: 'capitalize' }}>
                      {selectedSupplier ? `Status: ${selectedSupplier.status || 'unknown'}` : '—'}
                    </span>
                  </div>
                  <div style={{ padding: '0.85rem' }}>
                    {selectedSupplierId || detailLoading ? (
                      <SupplierDetailPanel
                        supplier={selectedSupplier}
                        balanceSummary={selectedSummary}
                        detailLoading={detailLoading}
                        detailError={detailError}
                        transactions={detailState.transactions}
                        transactionsLoading={transactionsLoading}
                        transactionsError={transactionsError}
                        transactionPagination={detailState.transactionPagination}
                        transactionPage={transactionPage}
                        onTransactionPageChange={setTransactionPage}
                        onEditSupplier={() => openEditSupplier(selectedSupplier)}
                        onAddTransaction={openCreateTransaction}
                        onEditTransaction={openEditTransaction}
                        onDeleteTransaction={handleDeleteTransaction}
                      />
                    ) : (
                      <div style={{ ...cardStyle, padding: '1rem' }}>
                        <SupplierEmptyState
                          title="No supplier selected"
                          message="Add your first supplier or choose one from the register to begin supplier operations."
                          actionLabel="Add New Supplier"
                          onAction={openCreateSupplier}
                          icon="fa-truck-field"
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <SupplierFormModal
        isOpen={supplierModalState.open}
        supplier={supplierModalState.supplier}
        selectedLocationId={selectedLocationId}
        locations={locations}
        saving={supplierFormSaving}
        error={supplierFormError}
        onClose={() => setSupplierModalState({ open: false, supplier: null })}
        onSubmit={handleSupplierSubmit}
      />

      <SupplierTransactionFormModal
        isOpen={transactionModalState.open}
        transaction={transactionModalState.transaction}
        supplier={selectedSupplier}
        supplierOptions={supplierOptions}
        selectedLocationId={selectedLocationId}
        locations={locations}
        saving={transactionFormSaving}
        error={transactionFormError}
        onClose={() => setTransactionModalState({ open: false, transaction: null })}
        onSubmit={handleTransactionSubmit}
      />
    </div>
  );
};

export default SuppliersTab;
