import React, { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../../../utils/api.js';
import { downloadBusinessReport } from '../../../utils/exportService.js';
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

const money = (value) => `MWK ${Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const monthRange = (year, month) => {
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0);
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
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
    const response = await api.get(path, { params: { ...params, page, pageSize: params.pageSize || 100 } });
    const pageRows = Array.isArray(response?.data?.data) ? response.data.data : [];
    const pagination = response?.data?.pagination || null;
    rows.push(...pageRows);

    const totalPages = Number(pagination?.totalPages || 1);
    if (page >= totalPages || pageRows.length === 0) break;
  }

  return rows;
};

const parseError = (error, fallback) => error?.response?.data?.error || error?.response?.data?.message || fallback;

const defaultSectionState = { loading: true, error: '' };

const MonthlySummaryTab = ({
  refreshKey = 0,
  onNavigateTab,
  selectedLocationId = null,
  selectedLocationCode = '',
  selectedLocationName = '',
}) => {
  const [showControls, setShowControls] = useState(false);
  const [isInsightsModalOpen, setIsInsightsModalOpen] = useState(false);
  const now = new Date();
  const initialMonthRange = monthRange(now.getFullYear(), now.getMonth() + 1);

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
    return { startDate: filters.startDate, endDate: filters.endDate, label };
  }, [filters.endDate, filters.month, filters.periodType, filters.startDate, filters.year]);

  const validationError = useMemo(() => {
    if (filters.periodType !== 'custom') return '';
    if (!filters.startDate || !filters.endDate) return 'Start and end dates are required for custom range.';
    if (new Date(filters.startDate) > new Date(filters.endDate)) return 'Custom range start date cannot be after end date.';
    return '';
  }, [filters.endDate, filters.periodType, filters.startDate]);

  const handleFilterChange = useCallback((key, value) => {
    setFilters((prev) => {
      const next = { ...prev, [key]: value };
      if (key === 'periodType' && value === 'month') {
        const nextMonth = monthRange(prev.year, prev.month);
        next.startDate = nextMonth.startDate;
        next.endDate = nextMonth.endDate;
      }
      if ((key === 'month' || key === 'year') && next.periodType === 'month') {
        const nextMonth = monthRange(key === 'year' ? value : next.year, key === 'month' ? value : next.month);
        next.startDate = nextMonth.startDate;
        next.endDate = nextMonth.endDate;
      }
      return next;
    });
  }, []);

  const resetFilters = useCallback(() => {
    const resetRange = monthRange(now.getFullYear(), now.getMonth() + 1);
    setFilters({
      periodType: 'month',
      month: now.getMonth() + 1,
      year: now.getFullYear(),
      startDate: resetRange.startDate,
      endDate: resetRange.endDate,
    });
  }, [now]);

  const fetchSales = useCallback(async () => {
    setSalesState((prev) => ({ ...prev, loading: true, error: '' }));

    const params = filters.periodType === 'month'
      ? { periodType: 'month', month: String(filters.month), year: String(filters.year) }
      : { periodType: 'custom', startDate: activeRange.startDate, endDate: activeRange.endDate };

    if (selectedLocationId) {
      params.locationId = selectedLocationId;
    } else if (selectedLocationCode.trim()) {
      params.locationCode = selectedLocationCode.trim().toUpperCase();
    }

    try {
      const [summaryResponse, paymentsResponse] = await Promise.all([
        api.get('/business-operations/reports/sales/summary', { params }),
        api.get('/business-operations/reports/sales/payments', { params }),
      ]);

      setSalesState({
        loading: false,
        error: '',
        summary: summaryResponse?.data?.data || null,
        payments: Array.isArray(paymentsResponse?.data?.data) ? paymentsResponse.data.data : [],
      });
    } catch (error) {
      setSalesState({ loading: false, error: parseError(error, 'Failed to load sales summary.'), summary: null, payments: [] });
    }
  }, [activeRange.endDate, activeRange.startDate, filters.month, filters.periodType, filters.year, selectedLocationCode, selectedLocationId]);

  const fetchExpenses = useCallback(async () => {
    setExpensesState((prev) => ({ ...prev, loading: true, error: '' }));

    const params = {
      startDate: activeRange.startDate,
      endDate: activeRange.endDate,
    };

    if (selectedLocationId) params.locationId = selectedLocationId;

    try {
      const response = await api.get('/business-operations/expenses/summary/overview', { params });
      setExpensesState({ loading: false, error: '', summary: response?.data?.data || null });
    } catch (error) {
      setExpensesState({ loading: false, error: parseError(error, 'Failed to load expense summary.'), summary: null });
    }
  }, [activeRange.endDate, activeRange.startDate, selectedLocationId]);

  const fetchPayroll = useCallback(async () => {
    setPayrollState((prev) => ({ ...prev, loading: true, error: '' }));

    try {
      const periods = await fetchAllPages('/business-operations/payroll/periods', {
        sortBy: 'createdAt',
        sortOrder: 'desc',
        pageSize: 100,
        locationId: selectedLocationId || undefined,
      });

      const relevantPeriods = periods.filter((period) => inDateRange(period.createdAt, activeRange.startDate, activeRange.endDate));

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
        relevantPeriods.map((period) => fetchAllPages('/business-operations/payroll/entries', {
          payrollPeriodId: period.id,
          sortBy: 'createdAt',
          sortOrder: 'desc',
          pageSize: 150,
          locationId: selectedLocationId || undefined,
        })),
      );

      const allEntries = entryGroups.flat();
      const employeeIds = new Set(allEntries.map((entry) => entry.employeeId).filter(Boolean));
      const totals = allEntries.reduce((acc, entry) => {
        acc.totalBasicSalary += Number(entry.basicSalary || 0);
        acc.totalDeductions += Number(entry.totalDeductions || 0);
        acc.totalNetPay += Number(entry.netPay || 0);
        return acc;
      }, { totalBasicSalary: 0, totalDeductions: 0, totalNetPay: 0 });

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
      setPayrollState({ loading: false, error: parseError(error, 'Failed to load payroll summary.'), data: null });
    }
  }, [activeRange.endDate, activeRange.startDate, selectedLocationId]);

  const fetchSuppliers = useCallback(async () => {
    setSupplierState((prev) => ({ ...prev, loading: true, error: '' }));

    try {
      const [suppliers, payments] = await Promise.all([
        fetchAllPages('/business-operations/suppliers', {
          sortBy: 'createdAt',
          sortOrder: 'desc',
          pageSize: 100,
          locationId: selectedLocationId || undefined,
        }),
        fetchAllPages('/business-operations/suppliers/transactions/list', {
          sortBy: 'transactionDate',
          sortOrder: 'desc',
          transactionType: 'payment',
          startDate: activeRange.startDate,
          endDate: activeRange.endDate,
          pageSize: 100,
          locationId: selectedLocationId || undefined,
        }),
      ]);

      const activeSuppliers = suppliers.filter((supplier) => String(supplier.status || '').toLowerCase() === 'active').length;
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
      setSupplierState({ loading: false, error: parseError(error, 'Failed to load supplier summary.'), data: null });
    }
  }, [activeRange.endDate, activeRange.startDate, selectedLocationId]);

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

  const summaryCards = useMemo(() => ([
    { label: 'Total Sales', value: money(salesTotal), note: 'Net sales for selected period.', tone: '#0369a1' },
    { label: 'Total Expenses', value: money(expensesTotal), note: 'Expense outflow in selected period.', tone: '#b45309' },
    { label: 'Total Payroll', value: money(payrollTotal), note: 'Net payroll paid in selected period.', tone: '#7c3aed' },
    { label: 'Supplier Payments', value: money(supplierPaymentsTotal), note: 'Supplier payment outflow in selected period.', tone: '#15803d' },
    { label: 'Supplier Debt', value: money(supplierDebtTotal), note: 'Current outstanding supplier balances.', tone: '#be123c' },
    { label: 'Net Position', value: money(netPosition), note: netPosition >= 0 ? 'Profit (approx.)' : 'Loss (approx.)', tone: netPosition >= 0 ? '#166534' : '#b91c1c' },
  ]), [expensesTotal, netPosition, payrollTotal, salesTotal, supplierDebtTotal, supplierPaymentsTotal]);

  const drilldownPayload = useMemo(() => ({
    periodType: filters.periodType,
    month: filters.month,
    year: filters.year,
    startDate: activeRange.startDate,
    endDate: activeRange.endDate,
    locationCode: selectedLocationCode?.trim() || '',
    locationId: selectedLocationId || '',
  }), [activeRange.endDate, activeRange.startDate, filters.month, filters.periodType, filters.year, selectedLocationCode, selectedLocationId]);

  const handleExport = async (format) => {
    if (format === 'excel') setExportingExcel(true);
    if (format === 'pdf') setExportingPdf(true);

    try {
      await downloadBusinessReport({
        format,
        module: 'monthly-summary',
        type: 'summary',
        filters: {
          periodType: filters.periodType,
          month: filters.month,
          year: filters.year,
          startDate: activeRange.startDate,
          endDate: activeRange.endDate,
          locationId: selectedLocationId,
          locationCode: selectedLocationCode,
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
      <div style={{ ...cardStyle, padding: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
        <div>
          <strong style={{ color: '#0f172a' }}>Monthly Insights Workspace</strong>
          <p style={{ margin: '0.32rem 0 0', color: '#64748b', fontSize: '0.88rem' }}>
            {showControls ? 'Controls are available inside this workspace.' : 'Open detailed summary sections only when needed.'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setIsInsightsModalOpen(true)}
          style={{ border: 'none', backgroundColor: '#0f172a', color: '#fff', borderRadius: '10px', padding: '0.62rem 0.95rem', fontWeight: 700, cursor: 'pointer', fontSize: '0.88rem' }}
        >
          Open Insights Workspace
        </button>
      </div>

      {isInsightsModalOpen && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.45)', zIndex: 170, display: 'grid', placeItems: 'center', padding: '1rem' }}>
          <div style={{ ...cardStyle, width: 'min(1240px, 97vw)', maxHeight: '90vh', overflow: 'auto', padding: '0.95rem' }}>
            <div style={{ display: 'grid', gap: '0.9rem', marginBottom: '0.75rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                <strong style={{ color: '#0f172a' }}>Monthly Insights Workspace</strong>
                <div style={{ display: 'flex', gap: '0.55rem', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => setShowControls((prev) => !prev)}
                    style={{ border: '1px solid #cbd5e1', backgroundColor: '#fff', color: '#0f172a', borderRadius: '10px', padding: '0.55rem 0.85rem', fontWeight: 700, fontSize: '0.86rem', cursor: 'pointer' }}
                  >
                    <i className="fas fa-sliders" style={{ marginRight: '0.42rem' }}></i>
                    {showControls ? 'Hide Controls' : 'Show Controls'}
                  </button>
                  <button type="button" onClick={() => setIsInsightsModalOpen(false)} style={{ border: '1px solid #cbd5e1', backgroundColor: '#fff', color: '#334155', borderRadius: '9px', padding: '0.45rem 0.7rem', cursor: 'pointer', fontWeight: 700 }}>Close</button>
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
                      <h3 style={{ margin: '0.38rem 0 0', color: '#0f172a', fontSize: '1.16rem' }}>Monthly Summary</h3>
                      <p style={{ margin: '0.4rem 0 0', color: '#64748b', lineHeight: 1.55, fontSize: '0.9rem' }}>
                        Executive overview combining Sales, Expenses, Payroll, and Suppliers to estimate business performance at a glance.
                      </p>
                    </div>

                    <SummaryFiltersBar
                      filters={filters}
                      rangeLabel={activeRange.label}
                      locationLabel={selectedLocationName || selectedLocationCode || ''}
                      locationCode={selectedLocationCode || ''}
                      loading={anyLoading}
                      validationError={validationError}
                      onChange={handleFilterChange}
                      onRefresh={() => setRefreshTick((current) => current + 1)}
                      onClear={resetFilters}
                      exportingExcel={exportingExcel}
                      exportingPdf={exportingPdf}
                      onExportExcel={() => handleExport('excel')}
                      onExportPdf={() => handleExport('pdf')}
                    />
                  </div>
                </div>
              )}

              <SummaryCards cards={summaryCards} />
            </div>

            <div style={{ display: 'grid', gap: '0.9rem' }}>
              <SalesSummarySection
                loading={salesState.loading}
                error={salesState.error}
                summary={salesState.summary}
                payments={salesState.payments}
                onOpen={() => onNavigateTab?.('sales-reports', drilldownPayload)}
              />

              <ExpensesSummarySection
                loading={expensesState.loading}
                error={expensesState.error}
                summary={expensesState.summary}
                onOpen={() => onNavigateTab?.('expenses', drilldownPayload)}
              />

              <PayrollSummarySection
                loading={payrollState.loading}
                error={payrollState.error}
                data={payrollState.data}
                onOpen={() => onNavigateTab?.('payroll', drilldownPayload)}
              />

              <SupplierSummarySection
                loading={supplierState.loading}
                error={supplierState.error}
                data={supplierState.data}
                onOpen={() => onNavigateTab?.('suppliers', drilldownPayload)}
              />
            </div>

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
          </div>
        </div>
      )}
    </div>
  );
};

export default MonthlySummaryTab;