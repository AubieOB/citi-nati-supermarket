import React, { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../../../utils/api.js';
import { downloadBusinessReport } from '../../../utils/exportService.js';
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
  const [isHeaderActionsModalOpen, setIsHeaderActionsModalOpen] = useState(false);
  const [isRegisterFiltersModalOpen, setIsRegisterFiltersModalOpen] = useState(false);
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

  const selectedSupplier = detailState.supplier;
  const selectedSummary = detailState.summary;
  const pageBalanceMeta = balanceMeta(totals.pageBalance, 'Page Exposure (Debt)', 'Page Credit');
  const selectedBalanceMeta = balanceMeta(selectedSummary?.outstandingBalance, 'Selected Outstanding', 'Selected Credit');
  const hasActiveFilters = Boolean(search || statusFilter);

  const handleExport = async (format) => {
    if (format === 'excel') setExportingExcel(true);
    if (format === 'pdf') setExportingPdf(true);

    try {
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

  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      <div style={{ ...cardStyle, padding: '0.7rem 0.95rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: '0.55rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => setIsHeaderActionsModalOpen(true)}
            style={{ border: '1px solid #cbd5e1', backgroundColor: '#fff', color: '#0f172a', borderRadius: '10px', padding: '0.55rem 0.85rem', fontWeight: 700, fontSize: '0.86rem', cursor: 'pointer' }}
          >
            <i className="fas fa-layer-group" style={{ marginRight: '0.42rem' }}></i>
            Open Header Actions
          </button>
          <button
            type="button"
            onClick={() => setIsRegisterFiltersModalOpen(true)}
            style={{ border: '1px solid #cbd5e1', backgroundColor: '#fff', color: '#0f172a', borderRadius: '10px', padding: '0.55rem 0.85rem', fontWeight: 700, fontSize: '0.86rem', cursor: 'pointer' }}
          >
            <i className="fas fa-sliders" style={{ marginRight: '0.42rem' }}></i>
            Open Register Filters
          </button>
        </div>
        <div style={{ color: '#64748b', fontSize: '0.84rem', fontWeight: 700 }}>
          {`Sections open in modals${hasActiveFilters ? ' • active filters applied' : ''}.`}
        </div>
      </div>

      {isHeaderActionsModalOpen && (
      <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.45)', zIndex: 160, display: 'grid', placeItems: 'center', padding: '1rem' }}>
      <div style={{ ...cardStyle, width: 'min(1000px, 96vw)', maxHeight: '88vh', overflow: 'auto', padding: '1.2rem 1.3rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
          <strong style={{ color: '#0f172a' }}>Supplier Management Actions</strong>
          <button type="button" onClick={() => setIsHeaderActionsModalOpen(false)} style={{ border: '1px solid #cbd5e1', backgroundColor: '#fff', color: '#334155', borderRadius: '9px', padding: '0.45rem 0.7rem', cursor: 'pointer', fontWeight: 700 }}>Close</button>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', color: '#5B4B8A', fontWeight: 800, textTransform: 'uppercase', fontSize: '0.76rem', letterSpacing: '0.05em' }}>
              <i className="fas fa-truck-field"></i>
              Suppliers Workspace
            </div>
            <h3 style={{ margin: '0.4rem 0 0', color: '#0f172a', fontSize: '1.2rem' }}>Supplier Management</h3>
            <p style={{ margin: '0.45rem 0 0', color: '#64748b', lineHeight: 1.6, maxWidth: '920px' }}>
              Set up suppliers manually, maintain clean verified records, record debts and payments, and monitor balances without depending on workbook imports.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.7rem', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={openCreateSupplier}
              style={{ border: 'none', backgroundColor: '#5B4B8A', color: '#fff', borderRadius: '10px', padding: '0.72rem 1rem', fontWeight: 700, cursor: 'pointer' }}
            >
              <i className="fas fa-plus" style={{ marginRight: '0.45rem' }}></i>
              Add New Supplier
            </button>
            <button
              type="button"
              onClick={() => refreshData({ selectedId: selectedSupplierId, nextTransactionPage: transactionPage })}
              disabled={listLoading || detailLoading || transactionsLoading}
              style={{ border: '1px solid #cbd5e1', backgroundColor: '#fff', color: '#0f172a', borderRadius: '10px', padding: '0.72rem 1rem', fontWeight: 700, cursor: 'pointer' }}
            >
              <i className={`fas ${(listLoading || detailLoading || transactionsLoading) ? 'fa-spinner fa-spin' : 'fa-rotate-right'}`} style={{ marginRight: '0.45rem' }}></i>
              Refresh
            </button>
            <button
              type="button"
              onClick={() => handleExport('pdf')}
              disabled={exportingExcel || exportingPdf}
              style={{ border: '1px solid #cbd5e1', backgroundColor: '#fff', color: '#0f172a', borderRadius: '10px', padding: '0.72rem 1rem', fontWeight: 700, cursor: exportingExcel || exportingPdf ? 'not-allowed' : 'pointer' }}
            >
              <i className={`fas ${exportingPdf ? 'fa-spinner fa-spin' : 'fa-file-pdf'}`} style={{ marginRight: '0.45rem' }}></i>
              Export PDF
            </button>
            <button
              type="button"
              onClick={() => handleExport('excel')}
              disabled={exportingExcel || exportingPdf}
              style={{ border: '1px solid #cbd5e1', backgroundColor: '#fff', color: '#0f172a', borderRadius: '10px', padding: '0.72rem 1rem', fontWeight: 700, cursor: exportingExcel || exportingPdf ? 'not-allowed' : 'pointer' }}
            >
              <i className={`fas ${exportingExcel ? 'fa-spinner fa-spin' : 'fa-file-excel'}`} style={{ marginRight: '0.45rem' }}></i>
              Export Excel
            </button>
          </div>
        </div>

      </div>
      </div>
      )}

      <div style={{ ...cardStyle, padding: '1.05rem 1.1rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '0.9rem' }}>
          <div style={{ ...cardStyle, padding: '1rem 1.1rem' }}>
            <div style={{ color: '#64748b', fontSize: '0.76rem', textTransform: 'uppercase', fontWeight: 800, letterSpacing: '0.05em' }}>Total Suppliers</div>
            <div style={{ marginTop: '0.35rem', fontSize: '1.6rem', fontWeight: 800, color: '#0f172a' }}>{totals.totalSuppliers.toLocaleString('en-US')}</div>
          </div>
          <div style={{ ...cardStyle, padding: '1rem 1.1rem' }}>
            <div style={{ color: '#64748b', fontSize: '0.76rem', textTransform: 'uppercase', fontWeight: 800, letterSpacing: '0.05em' }}>Active On Page</div>
            <div style={{ marginTop: '0.35rem', fontSize: '1.6rem', fontWeight: 800, color: '#0f172a' }}>{totals.activeSuppliers.toLocaleString('en-US')}</div>
          </div>
          <div style={{ ...cardStyle, padding: '1rem 1.1rem' }}>
            <div style={{ color: '#64748b', fontSize: '0.76rem', textTransform: 'uppercase', fontWeight: 800, letterSpacing: '0.05em' }}>{pageBalanceMeta.label}</div>
            <div style={{ marginTop: '0.35rem', fontSize: '1.6rem', fontWeight: 800, color: pageBalanceMeta.color }}>{pageBalanceMeta.amount}</div>
          </div>
          <div style={{ ...cardStyle, padding: '1rem 1.1rem' }}>
            <div style={{ color: '#64748b', fontSize: '0.76rem', textTransform: 'uppercase', fontWeight: 800, letterSpacing: '0.05em' }}>{selectedBalanceMeta.label}</div>
            <div style={{ marginTop: '0.35rem', fontSize: '1.6rem', fontWeight: 800, color: selectedBalanceMeta.color }}>{selectedBalanceMeta.amount}</div>
          </div>
        </div>
      </div>

      {isRegisterFiltersModalOpen && (
      <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.45)', zIndex: 160, display: 'grid', placeItems: 'center', padding: '1rem' }}>
      <div style={{ ...cardStyle, width: 'min(900px, 96vw)', maxHeight: '88vh', overflow: 'auto', padding: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.65rem' }}>
          <strong style={{ color: '#0f172a' }}>Supplier Register Filters</strong>
          <button type="button" onClick={() => setIsRegisterFiltersModalOpen(false)} style={{ border: '1px solid #cbd5e1', backgroundColor: '#fff', color: '#334155', borderRadius: '9px', padding: '0.45rem 0.7rem', cursor: 'pointer', fontWeight: 700 }}>Close</button>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 280px', position: 'relative' }}>
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
            style={{ minWidth: '140px', padding: '0.85rem 1rem', borderRadius: '12px', border: '1px solid #cbd5e1', fontSize: '0.92rem', backgroundColor: '#fff' }}
          >
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
      </div>
      </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1rem', alignItems: 'start' }}>
        <div style={{ ...cardStyle, overflow: 'hidden' }}>
          <div style={{ padding: '1rem 1.05rem', borderBottom: '1px solid #e2e8f0', backgroundColor: '#f8fafc' }}>
            <strong style={{ color: '#0f172a' }}>Supplier Register</strong>
            <p style={{ margin: '0.35rem 0 0', color: '#64748b', fontSize: '0.88rem' }}>Select a supplier to inspect balance history, edit details, or record new transactions.</p>
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
          />
        </div>

        <div style={{ ...cardStyle, padding: '1rem' }}>
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
            />
          ) : (
            <SupplierEmptyState
              title="No supplier selected"
              message="Add your first supplier or choose one from the list to begin manual supplier management."
              actionLabel="Add New Supplier"
              onAction={openCreateSupplier}
              icon="fa-truck-field"
            />
          )}
        </div>
      </div>

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
