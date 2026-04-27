import React, { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../../../utils/api.js';
import { downloadBusinessReport } from '../../../utils/exportService.js';
import { exportExpensesPdf } from '../../../utils/businessOperationsPdfExports.js';
import { boAlert } from '../../../utils/boDialogBus.js';
import ExpensesList from './ExpensesList.jsx';
import ExpenseDetailPanel from './ExpenseDetailPanel.jsx';
import ExpenseFormModal from './ExpenseFormModal.jsx';
import ExpenseCategoriesPanel from './ExpenseCategoriesPanel.jsx';
import ExpenseCategoryFormModal from './ExpenseCategoryFormModal.jsx';
import ExpenseSummaryCards from './ExpenseSummaryCards.jsx';

const cardStyle = {
  backgroundColor: '#fff',
  border: '1px solid #e2e8f0',
  borderRadius: '18px',
  boxShadow: '0 10px 24px rgba(15, 23, 42, 0.05)',
};

function localDateKey(dateValue) {
  const date = dateValue instanceof Date ? dateValue : new Date(dateValue);
  if (Number.isNaN(date.getTime())) return '';
  const local = new Date(date.getTime() - (date.getTimezoneOffset() * 60000));
  return local.toISOString().slice(0, 10);
}

function getCurrentMonthRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return {
    startDate: localDateKey(start),
    endDate: localDateKey(end),
  };
}

const TAB_EXPENSES = 'expenses';
const TAB_CATEGORIES = 'categories';

const ExpensesTab = ({ refreshKey = 0, drilldownRequest = null, selectedLocationId = null, locations = [] }) => {
  const initialRange = getCurrentMonthRange();

  // Sub-tab
  const [activeTab, setActiveTab] = useState(TAB_EXPENSES);
  const [showFilters, setShowFilters] = useState(false);
  const [isExpensesWorkspaceModalOpen, setIsExpensesWorkspaceModalOpen] = useState(false);
  const [isCategoriesWorkspaceModalOpen, setIsCategoriesWorkspaceModalOpen] = useState(false);
  const [isExpensesWorkspaceMaximized, setIsExpensesWorkspaceMaximized] = useState(false);
  const [isCategoriesWorkspaceMaximized, setIsCategoriesWorkspaceMaximized] = useState(false);
  const [isExpenseDetailModalOpen, setIsExpenseDetailModalOpen] = useState(false);
  const [isExpenseDetailModalMaximized, setIsExpenseDetailModalMaximized] = useState(false);

  // Expense list state
  const [filters, setFilters] = useState({
    search: '',
    expenseCategoryId: '',
    startDate: initialRange.startDate,
    endDate: initialRange.endDate,
  });
  const [expensePage, setExpensePage] = useState(1);
  const [expenses, setExpenses] = useState([]);
  const [expensePagination, setExpensePagination] = useState(null);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState('');

  // Summary
  const [summary, setSummary] = useState(null);

  // Categories
  const [categories, setCategories] = useState([]);
  const [categoriesLoading, setCategoriesLoading] = useState(false);
  const [categoriesError, setCategoriesError] = useState('');

  // Selected expense detail
  const [selectedExpense, setSelectedExpense] = useState(null);
  const [pendingSelectId, setPendingSelectId] = useState(null);

  // Expense modal
  const [expenseModal, setExpenseModal] = useState({ open: false, expense: null });
  const [expenseSaving, setExpenseSaving] = useState(false);
  const [expenseError, setExpenseError] = useState('');

  // Category modal
  const [categoryModal, setCategoryModal] = useState({ open: false, category: null });
  const [categorySaving, setCategorySaving] = useState(false);
  const [categoryError, setCategoryError] = useState('');
  const [exportingExcel, setExportingExcel] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);

  // ---- fetch helpers ----

  const expenseQueryParams = useMemo(() => ({
    page: expensePage,
    pageSize: 20,
    sortBy: 'expenseDate',
    sortOrder: 'desc',
    search: filters.search || undefined,
    expenseCategoryId: filters.expenseCategoryId || undefined,
    startDate: filters.startDate || undefined,
    endDate: filters.endDate || undefined,
    locationId: selectedLocationId || undefined,
  }), [expensePage, filters.endDate, filters.expenseCategoryId, filters.search, filters.startDate, selectedLocationId]);

  const fetchCategories = useCallback(async () => {
    setCategoriesLoading(true);
    setCategoriesError('');
    try {
      const res = await api.get('/business-operations/expenses/categories', {
        params: { page: 1, pageSize: 500, sortBy: 'name', sortOrder: 'asc' },
      });
      setCategories(res.data?.data || []);
    } catch (err) {
      setCategoriesError(err.response?.data?.error || 'Failed to load categories');
    } finally {
      setCategoriesLoading(false);
    }
  }, []);

  const fetchExpenses = useCallback(async () => {
    setListLoading(true);
    setListError('');
    try {
      const [summaryRes, listRes] = await Promise.all([
        api.get('/business-operations/expenses/summary/overview', { params: expenseQueryParams }),
        api.get('/business-operations/expenses', { params: expenseQueryParams }),
      ]);
      setSummary(summaryRes.data?.data || null);
      setExpenses(listRes.data?.data || []);
      setExpensePagination(listRes.data?.pagination || null);
    } catch (err) {
      setListError(err.response?.data?.error || 'Failed to load expenses');
      setExpenses([]);
      setExpensePagination(null);
      setSummary(null);
    } finally {
      setListLoading(false);
    }
  }, [expenseQueryParams]);

  const refreshAll = useCallback(async () => {
    await Promise.all([fetchExpenses(), fetchCategories()]);
  }, [fetchCategories, fetchExpenses]);

  // Initial + refresh-key triggered load
  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  useEffect(() => {
    fetchExpenses();
  }, [fetchExpenses, refreshKey]);

  useEffect(() => {
    if (!drilldownRequest?.token) return;

    setActiveTab(TAB_EXPENSES);
    setFilters((prev) => ({
      ...prev,
      search: '',
      expenseCategoryId: '',
      startDate: drilldownRequest.startDate || prev.startDate,
      endDate: drilldownRequest.endDate || prev.endDate,
    }));
    setExpensePage(1);
  }, [drilldownRequest]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setExpensePage(1);
  }, [filters.expenseCategoryId, filters.search, filters.startDate, filters.endDate]);

  // Auto-select first expense or pending new one
  useEffect(() => {
    if (!expenses.length) {
      setSelectedExpense(null);
      return;
    }
    if (pendingSelectId) {
      const found = expenses.find((e) => e.id === pendingSelectId);
      if (found) {
        setSelectedExpense(found);
        setPendingSelectId(null);
        return;
      }
    }
    if (!selectedExpense || !expenses.some((e) => e.id === selectedExpense.id)) {
      setSelectedExpense(expenses[0]);
    }
  }, [expenses, pendingSelectId, selectedExpense]);

  // ---- handlers ----

  const handleExpenseSubmit = async (payload) => {
    setExpenseSaving(true);
    setExpenseError('');
    try {
      const res = expenseModal.expense
        ? await api.put(`/business-operations/expenses/${expenseModal.expense.id}`, { ...payload, locationId: payload.locationId ?? selectedLocationId ?? undefined })
        : await api.post('/business-operations/expenses', { ...payload, locationId: payload.locationId ?? selectedLocationId ?? undefined });

      const saved = res.data?.data || null;
      setExpenseModal({ open: false, expense: null });
      if (saved?.id) setPendingSelectId(saved.id);
      await refreshAll();
    } catch (err) {
      setExpenseError(err.response?.data?.error || 'Failed to save expense');
    } finally {
      setExpenseSaving(false);
    }
  };

  const handleCategorySubmit = async (payload) => {
    setCategorySaving(true);
    setCategoryError('');
    try {
      await (categoryModal.category
        ? api.put(`/business-operations/expenses/categories/${categoryModal.category.id}`, payload)
        : api.post('/business-operations/expenses/categories', payload));
      setCategoryModal({ open: false, category: null });
      await fetchCategories();
    } catch (err) {
      setCategoryError(err.response?.data?.error || 'Failed to save category');
    } finally {
      setCategorySaving(false);
    }
  };

  const openExpenseDetailModal = () => {
  if (!selectedExpense) return;
  setIsExpenseDetailModalMaximized(false);
  setIsExpenseDetailModalOpen(true);
};
  const openAddExpense = () => { setExpenseError(''); setExpenseModal({ open: true, expense: null }); };
  const openEditExpense = (expense) => { setExpenseError(''); setExpenseModal({ open: true, expense }); };
  const openAddCategory = () => { setCategoryError(''); setCategoryModal({ open: true, category: null }); };
  const openEditCategory = (cat) => { setCategoryError(''); setCategoryModal({ open: true, category: cat }); };

  const handleDeleteExpense = async (expense) => {
    try {
      await api.delete(`/business-operations/expenses/${expense.id}`);
      if (selectedExpense?.id === expense.id) setSelectedExpense(null);
      await refreshAll();
    } catch (err) {
      await boAlert({ title: 'Delete Failed', message: err.response?.data?.error || 'Failed to delete expense', type: 'error' });
    }
  };

  const handleDeleteCategory = async (cat) => {
    try {
      await api.delete(`/business-operations/expenses/categories/${cat.id}`);
      await fetchCategories();
    } catch (err) {
      await boAlert({ title: 'Delete Failed', message: err.response?.data?.error || 'Failed to delete category', type: 'error' });
    }
  };

  const activeCategories = useMemo(() => categories.filter((c) => c.isActive), [categories]);
  const isLoading = listLoading || categoriesLoading;

  const handleExport = useCallback(async (format) => {
    if (format === 'excel') setExportingExcel(true);
    if (format === 'pdf') setExportingPdf(true);

    try {
      if (format === 'pdf') {
        exportExpensesPdf({
          activeTab,
          filters,
          selectedLocationId,
          expenses,
          categories,
          summary,
        });
        return;
      }

      await downloadBusinessReport({
        format,
        module: 'expenses',
        type: activeTab === TAB_CATEGORIES ? 'category-summary' : 'list',
        filters: {
          search: filters.search,
          expenseCategoryId: filters.expenseCategoryId,
          startDate: filters.startDate,
          endDate: filters.endDate,
          locationId: selectedLocationId,
        },
      });
    } catch (error) {
      const message = error?.response?.data?.error || `Failed to export ${format.toUpperCase()} report.`;
      await boAlert({ title: 'Export Failed', message, type: 'warning' });
    } finally {
      if (format === 'excel') setExportingExcel(false);
      if (format === 'pdf') setExportingPdf(false);
    }
  }, [activeTab, categories, expenses, filters, selectedLocationId, summary]);

  useEffect(() => {
    const anySubModal = expenseModal.open || categoryModal.open || isExpenseDetailModalOpen;
    if (anySubModal) return;
    if (!isExpensesWorkspaceModalOpen && !isCategoriesWorkspaceModalOpen) return;
    const handler = (event) => {
      if (event.key !== 'Escape') return;
      if (isExpensesWorkspaceModalOpen) {
        setIsExpensesWorkspaceModalOpen(false);
        setIsExpensesWorkspaceMaximized(false);
      } else if (isCategoriesWorkspaceModalOpen) {
        setIsCategoriesWorkspaceModalOpen(false);
        setIsCategoriesWorkspaceMaximized(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isExpensesWorkspaceModalOpen, isCategoriesWorkspaceModalOpen, expenseModal.open, categoryModal.open, isExpenseDetailModalOpen]);

  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      <div style={{ ...cardStyle, padding: '1.1rem' }}>
        <ExpenseSummaryCards summary={summary} categoryCount={activeCategories.length} />
      </div>

      <div style={{ ...cardStyle, padding: '1rem 1.1rem' }}>
        <div style={{ display: 'grid', gap: '0.78rem' }}>
          <div>
            <strong style={{ color: '#0f172a' }}>Expense Workspaces</strong>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '0.75rem' }}>
            <button
              type="button"
              title="Click to open"
              onClick={() => {
                setActiveTab(TAB_EXPENSES);
                setIsCategoriesWorkspaceModalOpen(false);
                setIsCategoriesWorkspaceMaximized(false);
                setIsExpensesWorkspaceMaximized(false);
                setIsExpensesWorkspaceModalOpen(true);
              }}
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
              <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '34px', height: '34px', borderRadius: '10px', backgroundColor: '#dbeafe', color: '#1d4ed8' }}>
                <i className="fas fa-list-ul" />
              </span>
              <span style={{ color: '#0f172a', fontWeight: 800, fontSize: '0.95rem' }}>Expense Register</span>
              <span style={{ color: '#64748b', fontSize: '0.82rem', lineHeight: 1.45 }}>Capture expenses, attach details, and track spending entries.</span>
            </button>

            <button
              type="button"
              title="Click to open"
              onClick={() => {
                setActiveTab(TAB_CATEGORIES);
                setIsExpensesWorkspaceModalOpen(false);
                setIsExpensesWorkspaceMaximized(false);
                setIsCategoriesWorkspaceMaximized(false);
                setIsCategoriesWorkspaceModalOpen(true);
              }}
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
              <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '34px', height: '34px', borderRadius: '10px', backgroundColor: '#ede9fe', color: '#6d28d9' }}>
                <i className="fas fa-tags" />
              </span>
              <span style={{ color: '#0f172a', fontWeight: 800, fontSize: '0.95rem' }}>
                Expense Categories {categories.length > 0 ? `(${categories.length})` : ''}
              </span>
              <span style={{ color: '#64748b', fontSize: '0.82rem', lineHeight: 1.45 }}>Create categories to keep expense reporting clean and searchable.</span>
            </button>
          </div>
        </div>
      </div>

      {isExpensesWorkspaceModalOpen && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.45)', zIndex: 170, display: 'grid', placeItems: 'center', padding: isExpensesWorkspaceMaximized ? '0.35rem' : '1rem' }}>
          <div style={{ ...cardStyle, width: isExpensesWorkspaceMaximized ? 'calc(100vw - 0.7rem)' : 'min(1400px, 97vw)', height: isExpensesWorkspaceMaximized ? 'calc(100vh - 0.7rem)' : '92vh', maxHeight: 'none', overflow: 'hidden', borderRadius: isExpensesWorkspaceMaximized ? '10px' : '18px', display: 'flex', flexDirection: 'column' }}>
            <div style={{ flexShrink: 0, padding: '1rem 1.1rem', borderBottom: '1px solid #e2e8f0', boxShadow: '0 4px 12px rgba(15,23,42,0.04)' }}>
              <div style={{ display: 'grid', gap: '0.85rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem', flexWrap: 'wrap' }}>
                  <div>
                    <h2 style={{ margin: 0, color: '#0f172a', fontSize: '1.15rem', fontWeight: 800 }}>Expense Register Workspace</h2>
                  </div>
                  <div style={{ display: 'flex', gap: '0.55rem', flexWrap: 'wrap', alignItems: 'center' }}>
                  <button
                    type="button"
                    onClick={openAddExpense}
                    style={{ border: 'none', backgroundColor: '#5B4B8A', color: '#fff', borderRadius: '10px', padding: '0.55rem 0.85rem', fontWeight: 700, fontSize: '0.86rem', cursor: 'pointer' }}
                  >
                    <i className="fas fa-plus" style={{ marginRight: '0.42rem' }} />
                    Add Expense
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowFilters((prev) => !prev)}
                    style={{ border: '1px solid #cbd5e1', backgroundColor: '#fff', color: '#0f172a', borderRadius: '10px', padding: '0.55rem 0.85rem', fontWeight: 700, fontSize: '0.86rem', cursor: 'pointer' }}
                  >
                    <i className="fas fa-sliders" style={{ marginRight: '0.42rem' }} />
                    {showFilters ? 'Hide Filters' : 'Show Filters'}
                  </button>
                  <button
                    type="button"
                    onClick={refreshAll}
                    disabled={isLoading}
                    style={{ border: '1px solid #cbd5e1', backgroundColor: '#fff', color: '#0f172a', borderRadius: '10px', padding: '0.55rem 0.85rem', fontWeight: 700, fontSize: '0.86rem', cursor: isLoading ? 'not-allowed' : 'pointer' }}
                  >
                    <i className={`fas ${isLoading ? 'fa-spinner fa-spin' : 'fa-rotate-right'}`} style={{ marginRight: '0.42rem' }} />
                    Refresh
                  </button>
                  <button
                    type="button"
                    onClick={() => handleExport('pdf')}
                    disabled={exportingExcel || exportingPdf}
                    style={{ border: '1px solid #cbd5e1', backgroundColor: '#fff', color: '#0f172a', borderRadius: '10px', padding: '0.58rem 0.86rem', fontWeight: 700, cursor: exportingExcel || exportingPdf ? 'not-allowed' : 'pointer' }}
                  >
                    <i className={`fas ${exportingPdf ? 'fa-spinner fa-spin' : 'fa-file-pdf'}`} style={{ marginRight: '0.42rem' }} />
                    Export PDF
                  </button>
                  <button
                    type="button"
                    onClick={() => handleExport('excel')}
                    disabled={exportingExcel || exportingPdf}
                    style={{ border: '1px solid #cbd5e1', backgroundColor: '#fff', color: '#0f172a', borderRadius: '10px', padding: '0.58rem 0.86rem', fontWeight: 700, cursor: exportingExcel || exportingPdf ? 'not-allowed' : 'pointer' }}
                  >
                    <i className={`fas ${exportingExcel ? 'fa-spinner fa-spin' : 'fa-file-excel'}`} style={{ marginRight: '0.42rem' }} />
                    Export Excel
                  </button>
                  <button
                    type="button"
                    title={isExpensesWorkspaceMaximized ? 'Restore' : 'Maximize'}
                    aria-label={isExpensesWorkspaceMaximized ? 'Restore workspace' : 'Maximize workspace'}
                    onClick={() => setIsExpensesWorkspaceMaximized((prev) => !prev)}
                    style={{ border: '1px solid #cbd5e1', backgroundColor: '#fff', color: '#334155', borderRadius: '9px', padding: '0.45rem 0.62rem', cursor: 'pointer', fontWeight: 700 }}
                  >
                    <i className={`fas ${isExpensesWorkspaceMaximized ? 'fa-window-restore' : 'fa-window-maximize'}`} />
                  </button>
                  <button
                    type="button"
                    title="Close"
                    aria-label="Close workspace"
                    onClick={() => { setIsExpensesWorkspaceModalOpen(false); setIsExpensesWorkspaceMaximized(false); }}
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
                      <i className="fas fa-search" style={{ position: 'absolute', top: '50%', left: '0.95rem', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                      <input
                        type="text"
                        value={filters.search}
                        onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))}
                        placeholder="Search by description, reference, payment method, or category"
                        style={{ width: '100%', boxSizing: 'border-box', padding: '0.78rem 0.9rem 0.78rem 2.5rem', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '0.9rem', backgroundColor: '#f8fafc' }}
                      />
                    </div>
                    <select
                      value={filters.expenseCategoryId}
                      onChange={(e) => setFilters((prev) => ({ ...prev, expenseCategoryId: e.target.value }))}
                      style={{ minWidth: '150px', padding: '0.78rem 0.9rem', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '0.9rem', backgroundColor: '#f8fafc' }}
                    >
                      <option value="">All categories</option>
                      {categories.map((cat) => (
                        <option key={cat.id} value={cat.id}>{cat.name}</option>
                      ))}
                    </select>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      <span style={{ color: '#64748b', fontSize: '0.87rem', whiteSpace: 'nowrap' }}>From</span>
                      <input
                        type="date"
                        value={filters.startDate}
                        onChange={(e) => setFilters((prev) => ({ ...prev, startDate: e.target.value }))}
                        style={{ padding: '0.78rem 0.85rem', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '0.9rem', backgroundColor: '#f8fafc' }}
                      />
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      <span style={{ color: '#64748b', fontSize: '0.87rem', whiteSpace: 'nowrap' }}>To</span>
                      <input
                        type="date"
                        value={filters.endDate}
                        onChange={(e) => setFilters((prev) => ({ ...prev, endDate: e.target.value }))}
                        style={{ padding: '0.78rem 0.85rem', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '0.9rem', backgroundColor: '#f8fafc' }}
                      />
                    </div>
                    {(filters.search || filters.expenseCategoryId || filters.startDate !== initialRange.startDate || filters.endDate !== initialRange.endDate) && (
                      <button
                        type="button"
                        onClick={() => setFilters({ search: '', expenseCategoryId: '', startDate: initialRange.startDate, endDate: initialRange.endDate })}
                        style={{ border: '1px solid #fecaca', backgroundColor: '#fef2f2', color: '#b91c1c', borderRadius: '10px', padding: '0.68rem 0.88rem', fontWeight: 700, cursor: 'pointer', fontSize: '0.85rem' }}
                      >
                        <i className="fas fa-xmark" style={{ marginRight: '0.4rem' }} />
                        Clear filters
                      </button>
                    )}
                  </div>
                </div>
              )}
              </div>
            </div>

                      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '0.85rem' }}>
            <div style={{ ...cardStyle, overflow: 'hidden' }}>
              <div style={{ padding: '0.75rem 1.05rem', borderBottom: '1px solid #e2e8f0', backgroundColor: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                <div style={{ display: 'grid', gap: '0.2rem' }}>
                  <strong style={{ color: '#0f172a' }}>Expense Register</strong>
                  <span style={{ color: '#64748b', fontSize: '0.8rem' }}>
                    Selected: {selectedExpense?.referenceNo || selectedExpense?.description || 'None'}
                  </span>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={openExpenseDetailModal}
                    disabled={!selectedExpense}
                    style={{ border: '1px solid #cbd5e1', backgroundColor: '#fff', color: '#0f172a', borderRadius: '10px', padding: '0.5rem 0.8rem', fontWeight: 700, cursor: selectedExpense ? 'pointer' : 'not-allowed', opacity: selectedExpense ? 1 : 0.65 }}
                  >
                    Open Expense Details
                  </button>

                  <button
                    type="button"
                    onClick={openAddExpense}
                    style={{ border: 'none', backgroundColor: '#5B4B8A', color: '#fff', borderRadius: '10px', padding: '0.5rem 0.8rem', fontWeight: 700, cursor: 'pointer' }}
                  >
                    <i className="fas fa-plus" style={{ marginRight: '0.38rem' }} />
                    Add Expense
                  </button>
                </div>
              </div>

              <div style={{ borderBottom: '1px solid #e2e8f0', padding: '0.52rem 0.85rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                <span style={{ color: '#64748b', fontSize: '0.78rem', fontWeight: 700 }}>
                  Visible: {Number(expenses.length || 0).toLocaleString('en-US')} {expenses.length === 1 ? 'expense' : 'expenses'}
                </span>
                <span style={{ color: '#334155', fontSize: '0.78rem', fontWeight: 700 }}>
                  Total: {Number(expensePagination?.total || expenses.length || 0).toLocaleString('en-US')}
                </span>
              </div>

              {listError ? (
                <div style={{ padding: '1rem', color: '#b91c1c', fontSize: '0.9rem' }}>{listError}</div>
              ) : (
                <ExpensesList
                  expenses={expenses}
                  loading={listLoading}
                  error={listError}
                  pagination={expensePagination}
                  page={expensePage}
                  onPageChange={setExpensePage}
                  selectedExpenseId={selectedExpense?.id ?? null}
                  onSelectExpense={(expense) => setSelectedExpense(expense)}
                  onEditExpense={openEditExpense}
                  onDeleteExpense={handleDeleteExpense}
                />
              )}
            </div>
          </div>
          </div>
        </div>
      )}

      {isExpenseDetailModalOpen && (
  <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.5)', zIndex: 180, display: 'grid', placeItems: 'center', padding: isExpenseDetailModalMaximized ? '0.35rem' : '1rem' }}>
    <div style={{ ...cardStyle, width: isExpenseDetailModalMaximized ? 'calc(100vw - 0.7rem)' : 'min(1000px, 96vw)', height: isExpenseDetailModalMaximized ? 'calc(100vh - 0.7rem)' : '88vh', maxHeight: 'none', overflow: 'hidden', borderRadius: isExpenseDetailModalMaximized ? '10px' : '18px', display: 'flex', flexDirection: 'column' }}>
      <div style={{ flexShrink: 0, padding: '0.8rem 1rem', borderBottom: '1px solid #e2e8f0', backgroundColor: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
        <div>
          <h3 style={{ margin: 0, color: '#0f172a' }}>Expense Details</h3>
          <div style={{ color: '#64748b', fontSize: '0.84rem' }}>
            {selectedExpense?.referenceNo || selectedExpense?.description || 'No expense selected'}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => selectedExpense && openEditExpense(selectedExpense)}
            disabled={!selectedExpense}
            style={{ border: '1px solid #cbd5e1', backgroundColor: '#fff', color: '#0f172a', borderRadius: '10px', padding: '0.55rem 0.82rem', fontWeight: 700, cursor: selectedExpense ? 'pointer' : 'not-allowed', opacity: selectedExpense ? 1 : 0.65 }}
          >
            Edit Expense
          </button>

          <button
            type="button"
            onClick={openAddExpense}
            style={{ border: 'none', backgroundColor: '#5B4B8A', color: '#fff', borderRadius: '10px', padding: '0.55rem 0.82rem', fontWeight: 700, cursor: 'pointer' }}
          >
            Add Expense
          </button>

          <button
            type="button"
            title={isExpenseDetailModalMaximized ? 'Restore' : 'Maximize'}
            aria-label={isExpenseDetailModalMaximized ? 'Restore expense detail modal' : 'Maximize expense detail modal'}
            onClick={() => setIsExpenseDetailModalMaximized((prev) => !prev)}
            style={{ border: '1px solid #cbd5e1', backgroundColor: '#fff', color: '#334155', borderRadius: '9px', padding: '0.45rem 0.62rem', cursor: 'pointer', fontWeight: 700 }}
          >
            <i className={`fas ${isExpenseDetailModalMaximized ? 'fa-window-restore' : 'fa-window-maximize'}`} />
          </button>

          <button
            type="button"
            title="Close"
            aria-label="Close expense detail modal"
            onClick={() => { setIsExpenseDetailModalOpen(false); setIsExpenseDetailModalMaximized(false); }}
            style={{ border: '1px solid #cbd5e1', backgroundColor: '#fff', color: '#334155', borderRadius: '9px', padding: '0.45rem 0.62rem', cursor: 'pointer', fontWeight: 700 }}
          >
            <i className="fas fa-times" />
          </button>
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '0.9rem' }}>
        <div style={{ ...cardStyle, overflow: 'hidden' }}>
          <ExpenseDetailPanel
            expense={selectedExpense}
            loading={listLoading}
            error={listError}
            onEdit={openEditExpense}
            onAddExpense={openAddExpense}
          />
        </div>
      </div>
    </div>
  </div>
)}

      {isCategoriesWorkspaceModalOpen && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.45)', zIndex: 170, display: 'grid', placeItems: 'center', padding: isCategoriesWorkspaceMaximized ? '0.35rem' : '1rem' }}>
          <div style={{ ...cardStyle, width: isCategoriesWorkspaceMaximized ? 'calc(100vw - 0.7rem)' : 'min(1100px, 97vw)', height: isCategoriesWorkspaceMaximized ? 'calc(100vh - 0.7rem)' : '90vh', maxHeight: 'none', overflow: 'auto', borderRadius: isCategoriesWorkspaceMaximized ? '10px' : '18px', padding: '0.95rem' }}>
            <div style={{ position: 'sticky', top: '-0.95rem', zIndex: 5, backgroundColor: '#fff', margin: '-0.95rem -0.95rem 0.75rem', padding: '0.95rem', borderBottom: '1px solid #e2e8f0', boxShadow: '0 10px 24px rgba(15, 23, 42, 0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
              <strong style={{ color: '#0f172a' }}>Categories Workspace</strong>
              <div style={{ display: 'flex', gap: '0.55rem', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={openAddCategory}
                  style={{ border: '1px solid #5B4B8A', backgroundColor: '#fff', color: '#5B4B8A', borderRadius: '10px', padding: '0.55rem 0.85rem', fontWeight: 700, fontSize: '0.86rem', cursor: 'pointer' }}
                >
                  <i className="fas fa-tags" style={{ marginRight: '0.42rem' }} />
                  Add Category
                </button>
                <button
                  type="button"
                  title={isCategoriesWorkspaceMaximized ? 'Restore' : 'Maximize'}
                  aria-label={isCategoriesWorkspaceMaximized ? 'Restore workspace' : 'Maximize workspace'}
                  onClick={() => setIsCategoriesWorkspaceMaximized((prev) => !prev)}
                  style={{ border: '1px solid #cbd5e1', backgroundColor: '#fff', color: '#334155', borderRadius: '9px', padding: '0.45rem 0.62rem', cursor: 'pointer', fontWeight: 700 }}
                >
                  <i className={`fas ${isCategoriesWorkspaceMaximized ? 'fa-window-restore' : 'fa-window-maximize'}`} />
                </button>
                <button
                  type="button"
                  title="Close"
                  aria-label="Close workspace"
                  onClick={() => { setIsCategoriesWorkspaceModalOpen(false); setIsCategoriesWorkspaceMaximized(false); }}
                  style={{ border: '1px solid #cbd5e1', backgroundColor: '#fff', color: '#334155', borderRadius: '9px', padding: '0.45rem 0.62rem', cursor: 'pointer', fontWeight: 700 }}
                >
                  <i className="fas fa-times" />
                </button>
              </div>
            </div>
            <div style={{ ...cardStyle, overflow: 'hidden' }}>
              <ExpenseCategoriesPanel
                categories={categories}
                loading={categoriesLoading}
                error={categoriesError}
                onAddCategory={openAddCategory}
                onEditCategory={openEditCategory}
                onDeleteCategory={handleDeleteCategory}
              />
            </div>
          </div>
        </div>
      )}

      {/* ── Modals ── */}
      <ExpenseFormModal
        isOpen={expenseModal.open}
        expense={expenseModal.expense}
        categories={activeCategories}
        selectedLocationId={selectedLocationId}
        locations={locations}
        saving={expenseSaving}
        error={expenseError}
        onClose={() => setExpenseModal({ open: false, expense: null })}
        onSubmit={handleExpenseSubmit}
      />

      <ExpenseCategoryFormModal
        isOpen={categoryModal.open}
        category={categoryModal.category}
        saving={categorySaving}
        error={categoryError}
        onClose={() => setCategoryModal({ open: false, category: null })}
        onSubmit={handleCategorySubmit}
      />
    </div>
  );
};

export default ExpensesTab;
