import React, { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../../../utils/api.js';
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

function getCurrentMonthRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  };
}

const TAB_EXPENSES = 'expenses';
const TAB_CATEGORIES = 'categories';

const ExpensesTab = ({ refreshKey = 0, drilldownRequest = null }) => {
  const initialRange = getCurrentMonthRange();

  // Sub-tab
  const [activeTab, setActiveTab] = useState(TAB_EXPENSES);

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
  }), [expensePage, filters.endDate, filters.expenseCategoryId, filters.search, filters.startDate]);

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
        ? await api.put(`/business-operations/expenses/${expenseModal.expense.id}`, payload)
        : await api.post('/business-operations/expenses', payload);

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

  const openAddExpense = () => { setExpenseError(''); setExpenseModal({ open: true, expense: null }); };
  const openEditExpense = (expense) => { setExpenseError(''); setExpenseModal({ open: true, expense }); };
  const openAddCategory = () => { setCategoryError(''); setCategoryModal({ open: true, category: null }); };
  const openEditCategory = (cat) => { setCategoryError(''); setCategoryModal({ open: true, category: cat }); };

  const activeCategories = useMemo(() => categories.filter((c) => c.isActive), [categories]);
  const isLoading = listLoading || categoriesLoading;

  const tabBtnStyle = (active) => ({
    border: 'none',
    borderBottom: `2px solid ${active ? '#5B4B8A' : 'transparent'}`,
    backgroundColor: 'transparent',
    color: active ? '#5B4B8A' : '#64748b',
    fontWeight: active ? 800 : 600,
    fontSize: '0.92rem',
    padding: '0.65rem 1rem',
    cursor: 'pointer',
    transition: 'color 0.15s, border-color 0.15s',
  });

  return (
    <div style={{ display: 'grid', gap: '1rem' }}>

      {/* ── Header ── */}
      <div style={{ ...cardStyle, padding: '1.2rem 1.3rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', color: '#5B4B8A', fontWeight: 800, textTransform: 'uppercase', fontSize: '0.76rem', letterSpacing: '0.05em' }}>
              <i className="fas fa-receipt" />
              Expenses Workspace
            </div>
            <h3 style={{ margin: '0.4rem 0 0', color: '#0f172a', fontSize: '1.2rem' }}>Expense Management</h3>
            <p style={{ margin: '0.45rem 0 0', color: '#64748b', lineHeight: 1.6, maxWidth: '900px' }}>
              Enter and manage business expenses manually with full category control, date filtering, and clean records — no workbook import required.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.7rem', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={openAddExpense}
              style={{ border: 'none', backgroundColor: '#5B4B8A', color: '#fff', borderRadius: '10px', padding: '0.72rem 1rem', fontWeight: 700, cursor: 'pointer' }}
            >
              <i className="fas fa-plus" style={{ marginRight: '0.45rem' }} />
              Add Expense
            </button>
            <button
              type="button"
              onClick={openAddCategory}
              style={{ border: '1px solid #5B4B8A', backgroundColor: '#fff', color: '#5B4B8A', borderRadius: '10px', padding: '0.72rem 1rem', fontWeight: 700, cursor: 'pointer' }}
            >
              <i className="fas fa-tags" style={{ marginRight: '0.45rem' }} />
              Add Category
            </button>
            <button
              type="button"
              onClick={refreshAll}
              disabled={isLoading}
              style={{ border: '1px solid #cbd5e1', backgroundColor: '#fff', color: '#0f172a', borderRadius: '10px', padding: '0.72rem 1rem', fontWeight: 700, cursor: isLoading ? 'not-allowed' : 'pointer' }}
            >
              <i className={`fas ${isLoading ? 'fa-spinner fa-spin' : 'fa-rotate-right'}`} style={{ marginRight: '0.45rem' }} />
              Refresh
            </button>
            <button
              type="button"
              disabled
              title="Export coming soon"
              style={{ border: '1px dashed #cbd5e1', backgroundColor: '#fff', color: '#94a3b8', borderRadius: '10px', padding: '0.72rem 1rem', fontWeight: 700, cursor: 'not-allowed' }}
            >
              <i className="fas fa-file-export" style={{ marginRight: '0.45rem' }} />
              Export
            </button>
          </div>
        </div>

        {/* Summary cards */}
        <div style={{ marginTop: '1.1rem' }}>
          <ExpenseSummaryCards summary={summary} categoryCount={activeCategories.length} />
        </div>
      </div>

      {/* ── Sub-tabs ── */}
      <div style={{ ...cardStyle, padding: '0 1.1rem', display: 'flex', gap: 0, borderBottom: 'none', overflow: 'hidden' }}>
        <button type="button" style={tabBtnStyle(activeTab === TAB_EXPENSES)} onClick={() => setActiveTab(TAB_EXPENSES)}>
          <i className="fas fa-list-ul" style={{ marginRight: '0.45rem' }} />
          Expenses
        </button>
        <button type="button" style={tabBtnStyle(activeTab === TAB_CATEGORIES)} onClick={() => setActiveTab(TAB_CATEGORIES)}>
          <i className="fas fa-tags" style={{ marginRight: '0.45rem' }} />
          Categories
          {categories.length > 0 && (
            <span style={{ marginLeft: '0.5rem', backgroundColor: '#e0e7ff', color: '#4338ca', borderRadius: '999px', padding: '0.15rem 0.55rem', fontSize: '0.75rem', fontWeight: 800 }}>
              {categories.length}
            </span>
          )}
        </button>
      </div>

      {/* ── Expenses tab ── */}
      {activeTab === TAB_EXPENSES && (
        <>
          {/* Filter bar */}
          <div style={{ ...cardStyle, padding: '1rem' }}>
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 280px', position: 'relative' }}>
                <i className="fas fa-search" style={{ position: 'absolute', top: '50%', left: '0.95rem', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                <input
                  type="text"
                  value={filters.search}
                  onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))}
                  placeholder="Search by description, reference, payment method, or category"
                  style={{ width: '100%', boxSizing: 'border-box', padding: '0.85rem 1rem 0.85rem 2.7rem', borderRadius: '12px', border: '1px solid #cbd5e1', fontSize: '0.92rem' }}
                />
              </div>
              <select
                value={filters.expenseCategoryId}
                onChange={(e) => setFilters((prev) => ({ ...prev, expenseCategoryId: e.target.value }))}
                style={{ minWidth: '150px', padding: '0.85rem 1rem', borderRadius: '12px', border: '1px solid #cbd5e1', fontSize: '0.92rem', backgroundColor: '#fff' }}
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
                  style={{ padding: '0.85rem 0.9rem', borderRadius: '12px', border: '1px solid #cbd5e1', fontSize: '0.92rem' }}
                />
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <span style={{ color: '#64748b', fontSize: '0.87rem', whiteSpace: 'nowrap' }}>To</span>
                <input
                  type="date"
                  value={filters.endDate}
                  onChange={(e) => setFilters((prev) => ({ ...prev, endDate: e.target.value }))}
                  style={{ padding: '0.85rem 0.9rem', borderRadius: '12px', border: '1px solid #cbd5e1', fontSize: '0.92rem' }}
                />
              </div>
              {(filters.search || filters.expenseCategoryId || filters.startDate !== initialRange.startDate || filters.endDate !== initialRange.endDate) && (
                <button
                  type="button"
                  onClick={() => setFilters({ search: '', expenseCategoryId: '', startDate: initialRange.startDate, endDate: initialRange.endDate })}
                  style={{ border: '1px solid #fecaca', backgroundColor: '#fef2f2', color: '#b91c1c', borderRadius: '10px', padding: '0.72rem 0.9rem', fontWeight: 700, cursor: 'pointer', fontSize: '0.87rem' }}
                >
                  <i className="fas fa-xmark" style={{ marginRight: '0.4rem' }} />
                  Clear filters
                </button>
              )}
            </div>
          </div>

          {/* Two-panel layout */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1rem', alignItems: 'start' }}>

            {/* Left — expense register */}
            <div style={{ ...cardStyle, overflow: 'hidden' }}>
              <div style={{ padding: '1rem 1.05rem', borderBottom: '1px solid #e2e8f0', backgroundColor: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                <div>
                  <strong style={{ color: '#0f172a' }}>Expense Register</strong>
                  <p style={{ margin: '0.3rem 0 0', color: '#64748b', fontSize: '0.88rem' }}>
                    Select a row to view full details or click Edit inline.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={openAddExpense}
                  style={{ border: 'none', backgroundColor: '#5B4B8A', color: '#fff', borderRadius: '10px', padding: '0.6rem 0.95rem', fontWeight: 700, cursor: 'pointer', fontSize: '0.88rem' }}
                >
                  <i className="fas fa-plus" style={{ marginRight: '0.4rem' }} />
                  Add Expense
                </button>
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
                />
              )}
            </div>

            {/* Right — detail panel */}
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
        </>
      )}

      {/* ── Categories tab ── */}
      {activeTab === TAB_CATEGORIES && (
        <div style={{ ...cardStyle, overflow: 'hidden' }}>
          <ExpenseCategoriesPanel
            categories={categories}
            loading={categoriesLoading}
            error={categoriesError}
            onAddCategory={openAddCategory}
            onEditCategory={openEditCategory}
          />
        </div>
      )}

      {/* ── Modals ── */}
      <ExpenseFormModal
        isOpen={expenseModal.open}
        expense={expenseModal.expense}
        categories={activeCategories}
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
