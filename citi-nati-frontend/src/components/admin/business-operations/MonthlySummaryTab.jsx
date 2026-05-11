import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import api from '../../../utils/api.js';
import { downloadBusinessReport } from '../../../utils/exportService.js';
import { exportMonthlySummaryPdf } from '../../../utils/businessOperationsPdfExports.js';
import { boAlert } from '../../../utils/boDialogBus.js';
import SummaryFiltersBar from './monthly-summary/SummaryFiltersBar.jsx';
import SummaryCards from './monthly-summary/SummaryCards.jsx';
import SalesSummarySection from './monthly-summary/SalesSummarySection.jsx';
import ExpensesSummarySection from './monthly-summary/ExpensesSummarySection.jsx';
import PayrollSummarySection from './monthly-summary/PayrollSummarySection.jsx';
import SupplierSummarySection from './monthly-summary/SupplierSummarySection.jsx';
import NetSummaryCard from './monthly-summary/NetSummaryCard.jsx';

const cardStyle = {
  backgroundColor: '#fff',
  border: '1px solid #e2e8f0',
  borderRadius: '18px',
  boxShadow: '0 10px 24px rgba(15, 23, 42, 0.05)',
};

const normalizeCode = (value) => String(value || '').trim().toUpperCase();

const compactParams = (params = {}) =>
  Object.entries(params).reduce((acc, [key, value]) => {
    if (value !== '' && value !== null && value !== undefined) {
      acc[key] = value;
    }
    return acc;
  }, {});

const localDateKey = (dateValue) => {
  const date = dateValue instanceof Date ? dateValue : new Date(dateValue);
  if (Number.isNaN(date.getTime())) return '';
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
};

const money = (value) =>
  `MWK ${Number(value || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const monthRange = (year, month) => {
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0);
  return {
    startDate: localDateKey(start),
    endDate: localDateKey(end),
    label: `${start.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}`,
  };
};

const inDateRange = (value, startDate, endDate) => {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T23:59:59`);
  return date >= start && date <= end;
};

const fetchAllPages = async (path, params = {}, maxPages = 20) => {
  const rows = [];

  for (let page = 1; page <= maxPages; page += 1) {
    const response = await api.get(path, {
      params: {
        ...params,
        page,
        pageSize: params.pageSize || 100,
      },
    });

    const pageRows = Array.isArray(response?.data?.data) ? response.data.data : [];
    const pagination = response?.data?.pagination || null;

    rows.push(...pageRows);

    const totalPages = Number(pagination?.totalPages || 1);
    if (page >= totalPages || pageRows.length === 0) break;
  }

  return rows;
};

const parseError = (error, fallback) =>
  error?.response?.data?.error || error?.response?.data?.message || fallback;

const defaultSectionState = { loading: true, error: '' };

const MonthlySummaryTab = ({
  refreshKey = 0,
  onNavigateTab,
  selectedLocationId = null,
  selectedBranchCode = '',
  selectedLocationCode = '',
  selectedLocationName = '',
  permissions = {},
  isAggregateMode = false,
  onToggleAggregateMode = () => {},
}) => {
  const canViewOverviewCards = permissions.canViewOverviewCards !== false;
  const canViewSalesOverview = permissions.canViewSalesOverview !== false;
  const canViewExpensesOverview = permissions.canViewExpensesOverview !== false;
  const canViewPayrollOverview = permissions.canViewPayrollOverview !== false;
  const canViewSuppliersOverview = permissions.canViewSuppliersOverview !== false;
  const canViewNetOverview = permissions.canViewNetOverview !== false;
  const canOpenSalesReports = permissions.canOpenSalesReports !== false;
  const canOpenExpenses = permissions.canOpenExpenses !== false;
  const canOpenPayroll = permissions.canOpenPayroll !== false;
  const canOpenSuppliers = permissions.canOpenSuppliers !== false;
  const canExport = permissions.canExport !== false;

  const canViewAnySummarySection =
    canViewOverviewCards ||
    canViewSalesOverview ||
    canViewExpensesOverview ||
    canViewPayrollOverview ||
    canViewSuppliersOverview ||
    canViewNetOverview;

  const now = new Date();
  const initialMonthRange = monthRange(now.getFullYear(), now.getMonth() + 1);

  const effectiveBranchCode = normalizeCode(selectedBranchCode);
  const effectiveLocationCode = normalizeCode(selectedLocationCode);

  const scopeLabel = isAggregateMode
    ? 'All Locations (Aggregated)'
    : selectedLocationName ||
      (effectiveBranchCode && effectiveLocationCode
        ? `${effectiveBranchCode} / ${effectiveLocationCode}`
        : effectiveLocationCode || 'All Locations');

  const scopeParams = useMemo(
    () => {
      const params = {};

      if (!isAggregateMode) {
        params.branchCode = effectiveBranchCode || undefined;
        params.locationCode = effectiveLocationCode || undefined;
        params.locationId = selectedLocationId || undefined;
      }

      if (isAggregateMode) {
        params.aggregate = true;
      }

      return compactParams(params);
    },
    [effectiveBranchCode, effectiveLocationCode, selectedLocationId, isAggregateMode]
  );

  const renderAggregateToggle = () => {
    if (typeof onToggleAggregateMode !== 'function') return null;
    const isAggregate = Boolean(isAggregateMode);
    return (
      <button
        type="button"
        onClick={onToggleAggregateMode}
        aria-pressed={isAggregate}
        style={{
          minWidth: '170px',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '0.45rem',
          border: '1px solid #cbd5e1',
          borderRadius: '999px',
          padding: '0.4rem 0.75rem',
          backgroundColor: isAggregate ? '#ecfdf5' : '#f8fafc',
          color: '#0f172a',
          cursor: 'pointer',
          fontSize: '0.82rem',
          fontWeight: 700,
        }}
      >
        <span>All Locations Mode</span>
        <span
          style={{
            width: '30px',
            height: '16px',
            borderRadius: '999px',
            backgroundColor: isAggregateMode ? '#10b981' : '#d1d5db',
            position: 'relative',
            display: 'inline-flex',
            alignItems: 'center',
            padding: '2px',
          }}
        >
          <span
            style={{
              width: '12px',
              height: '12px',
              borderRadius: '50%',
              backgroundColor: '#fff',
              transform: isAggregateMode ? 'translateX(14px)' : 'translateX(0)',
              transition: 'transform 0.2s ease',
            }}
          />
        </span>
      </button>
    );
  };

  const [showControls, setShowControls] = useState(false);
  const [isInsightsModalOpen, setIsInsightsModalOpen] = useState(false);
  const [isInsightsModalMaximized, setIsInsightsModalMaximized] = useState(false);

  const [filters, setFilters] = useState({
    periodType: 'month',
    month: now.getMonth() + 1,
    year: now.getFullYear(),
    startDate: initialMonthRange.startDate,
    endDate: initialMonthRange.endDate,
  });

  const [refreshTick, setRefreshTick] = useState(0);
  const [salesState, setSalesState] = useState({ ...defaultSectionState, summary: null, payments: [] });
  const [expensesState, setExpensesState] = useState({ ...defaultSectionState, summary: null });
  const [payrollState, setPayrollState] = useState({ ...defaultSectionState, data: null });
  const [supplierState, setSupplierState] = useState({ ...defaultSectionState, data: null });

  const [exportingExcel, setExportingExcel] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);

  const activeRange = useMemo(() => {
    if (filters.periodType === 'month') return monthRange(filters.year, filters.month);

    const label = `${filters.startDate || 'No start'} to ${filters.endDate || 'No end'}`;
    return {
      startDate: filters.startDate,
      endDate: filters.endDate,
      label,
    };
  }, [filters.endDate, filters.month, filters.periodType, filters.startDate, filters.year]);

  const validationError = useMemo(() => {
    if (filters.periodType !== 'custom') return '';
    if (!filters.startDate || !filters.endDate) return 'Start and end dates are required for custom range.';
    if (new Date(filters.startDate) > new Date(filters.endDate)) return 'Custom range start date cannot be after end date.';
    return '';
  }, [filters.endDate, filters.periodType, filters.startDate]);

  const periodParams = useMemo(() => {
    const base =
      filters.periodType === 'month'
        ? {
            periodType: 'month',
            month: String(filters.month),
            year: String(filters.year),
          }
        : {
            periodType: 'custom',
            startDate: activeRange.startDate,
            endDate: activeRange.endDate,
          };

    return compactParams({
      ...base,
      ...scopeParams,
    });
  }, [activeRange.endDate, activeRange.startDate, filters.month, filters.periodType, filters.year, scopeParams]);

  const dateRangeParams = useMemo(
    () =>
      compactParams({
        startDate: activeRange.startDate,
        endDate: activeRange.endDate,
        ...scopeParams,
      }),
    [activeRange.endDate, activeRange.startDate, scopeParams]
  );

  const handleFilterChange = useCallback((key, value) => {
    setFilters((prev) => {
      const next = { ...prev, [key]: value };

      if (key === 'periodType' && value === 'month') {
        const nextMonth = monthRange(prev.year, prev.month);
        next.startDate = nextMonth.startDate;
        next.endDate = nextMonth.endDate;
      }

      if ((key === 'month' || key === 'year') && next.periodType === 'month') {
        const nextMonth = monthRange(
          Number(key === 'year' ? value : next.year),
          Number(key === 'month' ? value : next.month)
        );

        next.startDate = nextMonth.startDate;
        next.endDate = nextMonth.endDate;
      }

      return next;
    });
  }, []);

  const resetFilters = useCallback(() => {
    const resetNow = new Date();
    const resetRange = monthRange(resetNow.getFullYear(), resetNow.getMonth() + 1);

    setFilters({
      periodType: 'month',
      month: resetNow.getMonth() + 1,
      year: resetNow.getFullYear(),
      startDate: resetRange.startDate,
      endDate: resetRange.endDate,
    });
  }, []);

  const fetchSales = useCallback(
    async ({ background = false } = {}) => {
      setSalesState((prev) => ({
        ...prev,
        loading: !background || (!prev.summary && prev.payments.length === 0),
        error: background ? prev.error : '',
      }));

      try {
        const [summaryResponse, paymentsResponse] = await Promise.all([
          api.get('/business-operations/reports/sales/summary', { params: periodParams }),
          api.get('/business-operations/reports/sales/payments', { params: periodParams }),
        ]);

        setSalesState({
          loading: false,
          error: '',
          summary: summaryResponse?.data?.data || null,
          payments: Array.isArray(paymentsResponse?.data?.data) ? paymentsResponse.data.data : [],
        });
      } catch (error) {
        const nextError = parseError(error, 'Failed to load sales summary.');

        setSalesState((prev) => {
          if (background && (prev.summary || prev.payments.length > 0)) {
            return { ...prev, loading: false };
          }

          return {
            loading: false,
            error: nextError,
            summary: null,
            payments: [],
          };
        });
      }
    },
    [periodParams]
  );

  const fetchExpenses = useCallback(
    async ({ background = false } = {}) => {
      setExpensesState((prev) => ({
        ...prev,
        loading: !background || !prev.summary,
        error: background ? prev.error : '',
      }));

      try {
        const response = await api.get('/business-operations/expenses/summary/overview', {
          params: dateRangeParams,
        });

        setExpensesState({
          loading: false,
          error: '',
          summary: response?.data?.data || null,
        });
      } catch (error) {
        const nextError = parseError(error, 'Failed to load expense summary.');

        setExpensesState((prev) => {
          if (background && prev.summary) {
            return { ...prev, loading: false };
          }

          return {
            loading: false,
            error: nextError,
            summary: null,
          };
        });
      }
    },
    [dateRangeParams]
  );

  const fetchPayroll = useCallback(
    async ({ background = false } = {}) => {
      setPayrollState((prev) => ({
        ...prev,
        loading: !background || !prev.data,
        error: background ? prev.error : '',
      }));

      try {
        const periods = await fetchAllPages('/business-operations/payroll/periods', {
          sortBy: 'createdAt',
          sortOrder: 'desc',
          pageSize: 100,
          ...scopeParams,
        });

        const relevantPeriods = periods.filter((period) =>
          inDateRange(period.createdAt || period.runStartedAt || period.finalizedAt, activeRange.startDate, activeRange.endDate)
        );

        if (!relevantPeriods.length) {
          setPayrollState({
            loading: false,
            error: '',
            data: {
              totalBasicSalary: 0,
              totalDeductions: 0,
              totalNetPay: 0,
              employeeCount: 0,
              averageNetPay: 0,
              periodCount: 0,
            },
          });
          return;
        }

        const entryGroups = await Promise.all(
          relevantPeriods.map((period) =>
            fetchAllPages('/business-operations/payroll/entries', {
              payrollPeriodId: period.id,
              sortBy: 'createdAt',
              sortOrder: 'desc',
              pageSize: 150,
              ...scopeParams,
            })
          )
        );

        const allEntries = entryGroups.flat();
        const employeeIds = new Set(allEntries.map((entry) => entry.employeeId).filter(Boolean));

        const totals = allEntries.reduce(
          (acc, entry) => {
            acc.totalBasicSalary += Number(entry.basicSalary || 0);
            acc.totalDeductions += Number(entry.totalDeductions || 0);
            acc.totalNetPay += Number(entry.netPay || 0);
            return acc;
          },
          {
            totalBasicSalary: 0,
            totalDeductions: 0,
            totalNetPay: 0,
          }
        );

        setPayrollState({
          loading: false,
          error: '',
          data: {
            ...totals,
            employeeCount: employeeIds.size,
            averageNetPay: employeeIds.size ? totals.totalNetPay / employeeIds.size : 0,
            periodCount: relevantPeriods.length,
          },
        });
      } catch (error) {
        const nextError = parseError(error, 'Failed to load payroll summary.');

        setPayrollState((prev) => {
          if (background && prev.data) {
            return { ...prev, loading: false };
          }

          return {
            loading: false,
            error: nextError,
            data: null,
          };
        });
      }
    },
    [activeRange.endDate, activeRange.startDate, scopeParams]
  );

  const fetchSuppliers = useCallback(
    async ({ background = false } = {}) => {
      setSupplierState((prev) => ({
        ...prev,
        loading: !background || !prev.data,
        error: background ? prev.error : '',
      }));

      try {
        const [suppliers, payments] = await Promise.all([
          fetchAllPages('/business-operations/suppliers', {
            sortBy: 'createdAt',
            sortOrder: 'desc',
            pageSize: 100,
            ...scopeParams,
          }),
          fetchAllPages('/business-operations/suppliers/transactions/list', {
            sortBy: 'transactionDate',
            sortOrder: 'desc',
            transactionType: 'payment',
            startDate: activeRange.startDate,
            endDate: activeRange.endDate,
            pageSize: 100,
            ...scopeParams,
          }),
        ]);

        const activeSuppliers = suppliers.filter(
          (supplier) => String(supplier.status || '').toLowerCase() === 'active'
        ).length;

        const outstandingDebt = suppliers.reduce((sum, supplier) => {
          const balance = Number(supplier.currentBalance || 0);
          return sum + (balance > 0 ? balance : 0);
        }, 0);

        const paymentMethodsMap = payments.reduce((acc, payment) => {
          const method = String(payment.paymentMethod || 'other').toLowerCase();
          const current = acc.get(method) || 0;
          acc.set(method, current + Number(payment.amount || 0));
          return acc;
        }, new Map());

        const paymentMethods = Array.from(paymentMethodsMap.entries())
          .map(([method, amount]) => ({ method, amount }))
          .sort((a, b) => b.amount - a.amount);

        const totalPayments = payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);

        setSupplierState({
          loading: false,
          error: '',
          data: {
            activeSuppliers,
            outstandingDebt,
            totalPayments,
            paymentMethods,
          },
        });
      } catch (error) {
        const nextError = parseError(error, 'Failed to load supplier summary.');

        setSupplierState((prev) => {
          if (background && prev.data) {
            return { ...prev, loading: false };
          }

          return {
            loading: false,
            error: nextError,
            data: null,
          };
        });
      }
    },
    [activeRange.endDate, activeRange.startDate, scopeParams]
  );

  useEffect(() => {
    if (validationError) return;

    fetchSales();
    fetchExpenses();
    fetchPayroll();
    fetchSuppliers();
  }, [fetchExpenses, fetchPayroll, fetchSales, fetchSuppliers, refreshKey, refreshTick, validationError]);


  const salesTotal = Number(salesState.summary?.netSales || 0);
  const expensesTotal = Number(expensesState.summary?.totals?.totalAmount || 0);
  const payrollTotal = Number(payrollState.data?.totalNetPay || 0);
  const supplierPaymentsTotal = Number(supplierState.data?.totalPayments || 0);
  const supplierDebtTotal = Number(supplierState.data?.outstandingDebt || 0);
  const netPosition = salesTotal - expensesTotal - payrollTotal - supplierPaymentsTotal;

  const sectionComplete = !salesState.error && !expensesState.error && !payrollState.error && !supplierState.error;
  const anyLoading = salesState.loading || expensesState.loading || payrollState.loading || supplierState.loading;

  const summaryCards = useMemo(
    () => [
      { label: 'Total Sales', value: money(salesTotal), tone: '#0369a1' },
      { label: 'Total Expenses', value: money(expensesTotal), tone: '#b45309' },
      { label: 'Total Payroll', value: money(payrollTotal), tone: '#7c3aed' },
      { label: 'Supplier Payments', value: money(supplierPaymentsTotal), tone: '#15803d' },
      { label: 'Supplier Debt', value: money(supplierDebtTotal), tone: '#be123c' },
      { label: 'Net Position', value: money(netPosition), tone: netPosition >= 0 ? '#166534' : '#b91c1c' },
    ],
    [expensesTotal, netPosition, payrollTotal, salesTotal, supplierDebtTotal, supplierPaymentsTotal]
  );

  const drilldownPayload = useMemo(
    () => ({
      periodType: filters.periodType,
      month: filters.month,
      year: filters.year,
      startDate: activeRange.startDate,
      endDate: activeRange.endDate,
      branchCode: effectiveBranchCode || '',
      locationCode: effectiveLocationCode || '',
      locationId: selectedLocationId || null,
    }),
    [
      activeRange.endDate,
      activeRange.startDate,
      effectiveBranchCode,
      effectiveLocationCode,
      filters.month,
      filters.periodType,
      filters.year,
      selectedLocationId,
    ]
  );

  const handleExport = async (format) => {
    if (format === 'excel') setExportingExcel(true);
    if (format === 'pdf') setExportingPdf(true);

    try {
      const exportFilters = compactParams({
        periodType: filters.periodType,
        month: filters.month,
        year: filters.year,
        startDate: activeRange.startDate,
        endDate: activeRange.endDate,
        ...scopeParams,
      });

      if (format === 'pdf') {
        exportMonthlySummaryPdf({
          filters,
          activeRange,
          selectedLocationId,
          selectedBranchCode: effectiveBranchCode,
          selectedLocationCode: effectiveLocationCode,
          selectedLocationName: scopeLabel,
          salesState,
          expensesState,
          payrollState,
          supplierState,
        });
        return;
      }

      await downloadBusinessReport({
        format,
        module: 'monthly-summary',
        type: 'summary',
        filters: exportFilters,
      });
    } catch (error) {
      const message = error?.response?.data?.error || `Failed to export ${format.toUpperCase()} report.`;
      await boAlert({ title: 'Export Failed', message, type: 'warning' });
    } finally {
      if (format === 'excel') setExportingExcel(false);
      if (format === 'pdf') setExportingPdf(false);
    }
  };

  useEffect(() => {
    if (!isInsightsModalOpen) return;

    const handler = (event) => {
      if (event.key === 'Escape') {
        setIsInsightsModalOpen(false);
        setIsInsightsModalMaximized(false);
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isInsightsModalOpen]);

  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      <div style={{ ...cardStyle, padding: '1rem 1.1rem' }}>
        <div style={{ display: 'grid', gap: '0.78rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.8rem', flexWrap: 'wrap' }}>
            <div>
              <strong style={{ color: '#0f172a' }}>Insights Workspaces</strong>
              <p style={{ margin: '0.3rem 0 0', color: '#64748b', fontSize: '0.84rem', fontWeight: 700 }}>
                Scope: {scopeLabel}
              </p>
            </div>
            <div>{renderAggregateToggle()}</div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '0.75rem' }}>
            {canViewAnySummarySection ? (
              <button
                type="button"
                title="Click to open"
                onClick={() => {
                  setIsInsightsModalMaximized(false);
                  setIsInsightsModalOpen(true);
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
                style={{
                  border: '1px solid #e2e8f0',
                  backgroundColor: '#fff',
                  borderRadius: '14px',
                  padding: '0.95rem 1rem',
                  cursor: 'pointer',
                  textAlign: 'left',
                  display: 'grid',
                  gap: '0.42rem',
                  boxShadow: '0 6px 18px rgba(15, 23, 42, 0.04)',
                  transition: 'transform 0.16s ease, box-shadow 0.16s ease, border-color 0.16s ease, background-color 0.16s ease',
                }}
              >
                <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '34px', height: '34px', borderRadius: '10px', backgroundColor: '#dcfce7', color: '#166534' }}>
                  <i className="fas fa-chart-line" />
                </span>

                <span style={{ color: '#0f172a', fontWeight: 800, fontSize: '0.95rem' }}>Monthly Insights Workspace</span>

                <span style={{ color: '#64748b', fontSize: '0.82rem', lineHeight: 1.45 }}>
                  Review monthly sales, expenses, payroll, and supplier trends.
                </span>
              </button>
            ) : (
              <div style={{ border: '1px solid #e2e8f0', borderRadius: '14px', padding: '0.95rem 1rem', backgroundColor: '#fff' }}>
                <strong style={{ color: '#0f172a' }}>No Permitted Sections</strong>
                <p style={{ margin: '0.45rem 0 0', color: '#64748b', fontSize: '0.84rem' }}>
                  Monthly Summary sections are not assigned to your account.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {isInsightsModalOpen && canViewAnySummarySection && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.45)', zIndex: 170, display: 'grid', placeItems: 'center', padding: isInsightsModalMaximized ? '0.35rem' : '1rem' }}>
          <div style={{ ...cardStyle, width: isInsightsModalMaximized ? 'calc(100vw - 0.7rem)' : 'min(1240px, 97vw)', height: isInsightsModalMaximized ? 'calc(100vh - 0.7rem)' : '90vh', maxHeight: 'none', overflow: 'auto', borderRadius: isInsightsModalMaximized ? '10px' : '18px', padding: '0.95rem' }}>
            <div style={{ position: 'sticky', top: '-0.95rem', zIndex: 5, backgroundColor: '#fff', margin: '-0.95rem -0.95rem 0.75rem', padding: '0.95rem', borderBottom: '1px solid #e2e8f0', boxShadow: '0 10px 24px rgba(15, 23, 42, 0.05)' }}>
              <div style={{ display: 'grid', gap: '0.9rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                  <div>
                    <strong style={{ color: '#0f172a' }}>Monthly Insights Workspace</strong>
                    <div style={{ color: '#64748b', fontSize: '0.82rem', fontWeight: 700, marginTop: '0.25rem' }}>
                      Scope: {scopeLabel}
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '0.55rem', flexWrap: 'wrap' }}>
                    {renderAggregateToggle()}
                    {canExport && (
                      <button
                        type="button"
                        onClick={() => handleExport('pdf')}
                        disabled={anyLoading || exportingExcel || exportingPdf || Boolean(validationError)}
                        style={{
                          border: '1px solid #cbd5e1',
                          backgroundColor: '#fff',
                          color: '#0f172a',
                          borderRadius: '10px',
                          padding: '0.58rem 0.86rem',
                          fontWeight: 700,
                          cursor: anyLoading || exportingExcel || exportingPdf || validationError ? 'not-allowed' : 'pointer',
                        }}
                      >
                        <i className={`fas ${exportingPdf ? 'fa-spinner fa-spin' : 'fa-file-pdf'}`} style={{ marginRight: '0.42rem' }}></i>
                        Export PDF
                      </button>
                    )}

                    {canExport && (
                      <button
                        type="button"
                        onClick={() => handleExport('excel')}
                        disabled={anyLoading || exportingExcel || exportingPdf || Boolean(validationError)}
                        style={{
                          border: '1px solid #cbd5e1',
                          backgroundColor: '#fff',
                          color: '#0f172a',
                          borderRadius: '10px',
                          padding: '0.58rem 0.86rem',
                          fontWeight: 700,
                          cursor: anyLoading || exportingExcel || exportingPdf || validationError ? 'not-allowed' : 'pointer',
                        }}
                      >
                        <i className={`fas ${exportingExcel ? 'fa-spinner fa-spin' : 'fa-file-excel'}`} style={{ marginRight: '0.42rem' }}></i>
                        Export Excel
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => setShowControls((prev) => !prev)}
                      style={{ border: '1px solid #cbd5e1', backgroundColor: '#fff', color: '#0f172a', borderRadius: '10px', padding: '0.55rem 0.85rem', fontWeight: 700, fontSize: '0.86rem', cursor: 'pointer' }}
                    >
                      <i className="fas fa-sliders" style={{ marginRight: '0.42rem' }}></i>
                      {showControls ? 'Hide Controls' : 'Show Controls'}
                    </button>

                    <button
                      type="button"
                      title={isInsightsModalMaximized ? 'Restore' : 'Maximize'}
                      aria-label={isInsightsModalMaximized ? 'Restore workspace' : 'Maximize workspace'}
                      onClick={() => setIsInsightsModalMaximized((prev) => !prev)}
                      style={{ border: '1px solid #cbd5e1', backgroundColor: '#fff', color: '#334155', borderRadius: '9px', padding: '0.45rem 0.62rem', cursor: 'pointer', fontWeight: 700 }}
                    >
                      <i className={`fas ${isInsightsModalMaximized ? 'fa-window-restore' : 'fa-window-maximize'}`} />
                    </button>

                    <button
                      type="button"
                      title="Close"
                      aria-label="Close workspace"
                      onClick={() => {
                        setIsInsightsModalOpen(false);
                        setIsInsightsModalMaximized(false);
                      }}
                      style={{ border: '1px solid #cbd5e1', backgroundColor: '#fff', color: '#334155', borderRadius: '9px', padding: '0.45rem 0.62rem', cursor: 'pointer', fontWeight: 700 }}
                    >
                      <i className="fas fa-times" />
                    </button>
                  </div>
                </div>

                {showControls && (
                  <div style={{ ...cardStyle, padding: '1.08rem 1.15rem' }}>
                    <div style={{ display: 'grid', gap: '0.9rem' }}>
                      <div>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.42rem', color: '#5B4B8A', fontWeight: 800, textTransform: 'uppercase', fontSize: '0.74rem', letterSpacing: '0.05em' }}>
                          <i className="fas fa-chart-line"></i>
                          Management Dashboard
                        </div>

                        <h3 style={{ margin: '0.38rem 0 0', color: '#0f172a', fontSize: '1.16rem' }}>
                          Monthly Summary
                        </h3>
                      </div>

                      <SummaryFiltersBar
                        filters={filters}
                        rangeLabel={activeRange.label}
                        locationLabel={scopeLabel}
                        locationCode={effectiveLocationCode || ''}
                        loading={anyLoading}
                        validationError={validationError}
                        onChange={handleFilterChange}
                        onRefresh={() => setRefreshTick((current) => current + 1)}
                        onClear={resetFilters}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {canViewOverviewCards && <SummaryCards cards={summaryCards} />}

            <div style={{ display: 'grid', gap: '0.9rem' }}>
              {canViewSalesOverview && (
                <SalesSummarySection
                  loading={salesState.loading}
                  error={salesState.error}
                  summary={salesState.summary}
                  payments={salesState.payments}
                  onOpen={canOpenSalesReports ? () => onNavigateTab?.('sales-reports', drilldownPayload) : null}
                />
              )}

              {canViewExpensesOverview && (
                <ExpensesSummarySection
                  loading={expensesState.loading}
                  error={expensesState.error}
                  summary={expensesState.summary}
                  onOpen={canOpenExpenses ? () => onNavigateTab?.('expenses', drilldownPayload) : null}
                />
              )}

              {canViewPayrollOverview && (
                <PayrollSummarySection
                  loading={payrollState.loading}
                  error={payrollState.error}
                  data={payrollState.data}
                  onOpen={canOpenPayroll ? () => onNavigateTab?.('payroll', drilldownPayload) : null}
                />
              )}

              {canViewSuppliersOverview && (
                <SupplierSummarySection
                  loading={supplierState.loading}
                  error={supplierState.error}
                  data={supplierState.data}
                  onOpen={canOpenSuppliers ? () => onNavigateTab?.('suppliers', drilldownPayload) : null}
                />
              )}
            </div>

            {canViewNetOverview && (
              <div style={{ marginTop: '0.9rem' }}>
                <NetSummaryCard
                  sales={money(salesTotal)}
                  expenses={money(expensesTotal)}
                  payroll={money(payrollTotal)}
                  supplierPayments={money(supplierPaymentsTotal)}
                  netValue={money(netPosition)}
                  rawNetValue={netPosition}
                  isComplete={sectionComplete}
                />
              </div>
            )}

            {!canViewAnySummarySection && (
              <div style={{ border: '1px solid #e2e8f0', borderRadius: '14px', padding: '1rem', backgroundColor: '#fff' }}>
                <strong style={{ color: '#0f172a' }}>No permitted sections</strong>
                <p style={{ margin: '0.45rem 0 0', color: '#64748b' }}>
                  You do not have access to any Monthly Summary sections.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default MonthlySummaryTab;