import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import api from '../../../utils/api.js';

const AUTO_REFRESH_MS = 300000; // 5 minutes
const AUTO_REFRESH_DEBOUNCE_MS = 350;


const cardStyle = {
  backgroundColor: '#fff',
  border: '1px solid #e2e8f0',
  borderRadius: '18px',
  boxShadow: '0 10px 24px rgba(15, 23, 42, 0.05)',
};

const money = (value) => `MWK ${Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const intFmt = (value) => Number(value || 0).toLocaleString('en-US');

const ANALYSIS_FIELDS = {
  previousValue: { label: 'Previous Value', step: '0.01' },
  currentValue: { label: 'Current Value', step: '0.01' },
  revenue: { label: 'Revenue', step: '0.01' },
  expenses: { label: 'Expenses', step: '0.01' },
  payrollTotal: { label: 'Payroll Total', step: '0.01' },
  productCost: { label: 'Product / COGS Cost', step: '0.01' },
  targetValue: { label: 'Target Value', step: '0.01' },
  actualValue: { label: 'Actual Value', step: '0.01' },
  periodAValue: { label: 'Comparison A Value', step: '0.01' },
  periodBValue: { label: 'Comparison B Value', step: '0.01' },
  outputValue: { label: 'Output Value', step: '0.01' },
  inputValue: { label: 'Input / Cost Value', step: '0.01' },
  baseSales: { label: 'Base Sales', step: '0.01' },
  projectedGrowthPct: { label: 'Sales Growth % (Scenario)', step: '0.1' },
  basePayroll: { label: 'Base Payroll', step: '0.01' },
  payrollIncreaseAmount: { label: 'Payroll Increase Amount', step: '0.01' },
  baseExpenses: { label: 'Base Expenses', step: '0.01' },
  expenseDropPct: { label: 'Expense Reduction %', step: '0.1' },
  avgBasketValue: { label: 'Average Basket Value', step: '0.01' },
  basketImprovementPct: { label: 'Basket Improvement %', step: '0.1' },
};

const ANALYSIS_TOOLS = [
  { id: 'growth', title: 'Growth Calculator', description: 'Previous vs current growth percentage.', fields: ['previousValue', 'currentValue'] },
  { id: 'net-profit', title: 'Net Profit Calculator', description: 'Revenue minus expenses and payroll.', fields: ['revenue', 'expenses', 'payrollTotal'] },
  { id: 'gross-profit', title: 'Gross Profit Calculator', description: 'Revenue minus direct product/COGS cost.', fields: ['revenue', 'productCost'] },
  { id: 'profit-margin', title: 'Profit Margin Calculator', description: 'Net profit margin based on revenue and costs.', fields: ['revenue', 'productCost', 'expenses', 'payrollTotal'] },
  { id: 'expense-ratio', title: 'Expense vs Revenue Calculator', description: 'Expense ratio as a percentage of revenue.', fields: ['revenue', 'expenses'] },
  { id: 'payroll-ratio', title: 'Payroll vs Sales Ratio Calculator', description: 'Payroll burden relative to sales.', fields: ['revenue', 'payrollTotal'] },
  { id: 'yoy-growth', title: 'Year-on-Year Growth', description: 'Compare current year value against previous year value.', fields: ['previousValue', 'currentValue'] },
  { id: 'mom-growth', title: 'Month-on-Month Growth', description: 'Compare current month value against previous month value.', fields: ['previousValue', 'currentValue'] },
  { id: 'target-actual', title: 'Target vs Actual', description: 'Track attainment and variance versus target.', fields: ['targetValue', 'actualValue'] },
  { id: 'percent-change', title: 'Custom Percentage Change', description: 'Generic percent change calculator for any metric.', fields: ['periodAValue', 'periodBValue'] },
  { id: 'efficiency', title: 'Business Efficiency Calculator', description: 'Measures output value per unit of input/cost.', fields: ['outputValue', 'inputValue', 'targetValue'] },
  { id: 'projection', title: 'Projection / Forecast Calculator', description: 'What-if scenario using growth, payroll, and expense assumptions.', fields: ['baseSales', 'projectedGrowthPct', 'basePayroll', 'payrollIncreaseAmount', 'baseExpenses', 'expenseDropPct', 'avgBasketValue', 'basketImprovementPct'] },
];

function toNumberSafe(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function computePercentChange(current, previous) {
  const curr = toNumberSafe(current);
  const prev = toNumberSafe(previous);
  if (prev === 0) return curr === 0 ? 0 : 100;
  return ((curr - prev) / prev) * 100;
}

function statusFromDirection(value, inverse = false) {
  if (value === 0) return 'warning';
  if (!inverse) return value > 0 ? 'positive' : 'negative';
  return value < 0 ? 'positive' : 'negative';
}

function buildAnalysisResult(toolId, rawInputs) {
  const n = (key) => toNumberSafe(rawInputs[key]);

  if (toolId === 'growth' || toolId === 'yoy-growth' || toolId === 'mom-growth') {
    const previous = n('previousValue');
    const current = n('currentValue');
    const delta = current - previous;
    const pct = computePercentChange(current, previous);
    const title = toolId === 'yoy-growth' ? 'Year-on-Year Growth Result' : toolId === 'mom-growth' ? 'Month-on-Month Growth Result' : 'Growth Result';
    return {
      title,
      status: statusFromDirection(delta),
      mainLabel: 'Growth Percentage',
      mainValue: `${pct.toFixed(2)}%`,
      subValue: `${delta >= 0 ? '+' : ''}${money(delta)} change`,
      formula: '(Current - Previous) / Previous x 100',
      interpretation: delta >= 0 ? 'Performance improved compared to the baseline period.' : 'Performance declined compared to the baseline period.',
      usedValues: [
        { label: 'Previous', value: money(previous) },
        { label: 'Current', value: money(current) },
        { label: 'Difference', value: `${delta >= 0 ? '+' : ''}${money(delta)}` },
      ],
    };
  }

  if (toolId === 'net-profit') {
    const revenue = n('revenue');
    const expenses = n('expenses');
    const payroll = n('payrollTotal');
    const netProfit = revenue - expenses - payroll;
    const margin = revenue > 0 ? (netProfit / revenue) * 100 : 0;
    return {
      title: 'Net Profit Result',
      status: statusFromDirection(netProfit),
      mainLabel: 'Net Profit',
      mainValue: money(netProfit),
      subValue: `Margin: ${margin.toFixed(2)}%`,
      formula: 'Net Profit = Revenue - Expenses - Payroll',
      interpretation: netProfit >= 0 ? 'Net business position is positive after operating and payroll costs.' : 'Business is operating at a net loss for these inputs.',
      usedValues: [
        { label: 'Revenue', value: money(revenue) },
        { label: 'Expenses', value: money(expenses) },
        { label: 'Payroll', value: money(payroll) },
      ],
    };
  }

  if (toolId === 'gross-profit') {
    const revenue = n('revenue');
    const cost = n('productCost');
    const gross = revenue - cost;
    const margin = revenue > 0 ? (gross / revenue) * 100 : 0;
    return {
      title: 'Gross Profit Result',
      status: statusFromDirection(gross),
      mainLabel: 'Gross Profit',
      mainValue: money(gross),
      subValue: `Gross Margin: ${margin.toFixed(2)}%`,
      formula: 'Gross Profit = Revenue - Product/COGS Cost',
      interpretation: gross >= 0 ? 'Core product profitability is healthy before operating overhead.' : 'Direct costs are higher than revenue for this scenario.',
      usedValues: [
        { label: 'Revenue', value: money(revenue) },
        { label: 'Product / COGS Cost', value: money(cost) },
      ],
    };
  }

  if (toolId === 'profit-margin') {
    const revenue = n('revenue');
    const productCost = n('productCost');
    const expenses = n('expenses');
    const payroll = n('payrollTotal');
    const net = revenue - productCost - expenses - payroll;
    const margin = revenue > 0 ? (net / revenue) * 100 : 0;
    return {
      title: 'Profit Margin Result',
      status: statusFromDirection(margin),
      mainLabel: 'Profit Margin',
      mainValue: `${margin.toFixed(2)}%`,
      subValue: `Net Profit: ${money(net)}`,
      formula: 'Profit Margin % = (Revenue - Product Cost - Expenses - Payroll) / Revenue x 100',
      interpretation: margin >= 0 ? 'Margin is positive and indicates retained value after all major costs.' : 'Margin is negative; costs currently exceed revenue.',
      usedValues: [
        { label: 'Revenue', value: money(revenue) },
        { label: 'Total Costs', value: money(productCost + expenses + payroll) },
        { label: 'Net Profit', value: money(net) },
      ],
    };
  }

  if (toolId === 'expense-ratio') {
    const revenue = n('revenue');
    const expenses = n('expenses');
    const ratio = revenue > 0 ? (expenses / revenue) * 100 : 0;
    return {
      title: 'Expense Ratio Result',
      status: ratio <= 30 ? 'positive' : ratio <= 45 ? 'warning' : 'negative',
      mainLabel: 'Expense Ratio',
      mainValue: `${ratio.toFixed(2)}%`,
      subValue: `${money(expenses)} out of ${money(revenue)} revenue`,
      formula: 'Expense Ratio % = Expenses / Revenue x 100',
      interpretation: ratio <= 30 ? 'Expense load is efficient relative to revenue.' : ratio <= 45 ? 'Expense load is moderate and should be monitored.' : 'Expense load is high and may pressure profitability.',
      usedValues: [
        { label: 'Revenue', value: money(revenue) },
        { label: 'Expenses', value: money(expenses) },
      ],
    };
  }

  if (toolId === 'payroll-ratio') {
    const revenue = n('revenue');
    const payroll = n('payrollTotal');
    const ratio = revenue > 0 ? (payroll / revenue) * 100 : 0;
    return {
      title: 'Payroll-to-Sales Ratio Result',
      status: ratio <= 20 ? 'positive' : ratio <= 30 ? 'warning' : 'negative',
      mainLabel: 'Payroll Burden',
      mainValue: `${ratio.toFixed(2)}%`,
      subValue: `${money(payroll)} payroll against ${money(revenue)} sales`,
      formula: 'Payroll Ratio % = Payroll / Sales x 100',
      interpretation: ratio <= 20 ? 'Payroll burden is healthy versus sales.' : ratio <= 30 ? 'Payroll burden is acceptable but should be watched.' : 'Payroll burden is high compared with sales output.',
      usedValues: [
        { label: 'Sales', value: money(revenue) },
        { label: 'Payroll', value: money(payroll) },
      ],
    };
  }

  if (toolId === 'target-actual') {
    const target = n('targetValue');
    const actual = n('actualValue');
    const variance = actual - target;
    const attainment = target > 0 ? (actual / target) * 100 : 0;
    return {
      title: 'Target vs Actual Result',
      status: statusFromDirection(variance),
      mainLabel: 'Target Attainment',
      mainValue: `${attainment.toFixed(2)}%`,
      subValue: `Variance: ${variance >= 0 ? '+' : ''}${money(variance)}`,
      formula: 'Attainment % = Actual / Target x 100',
      interpretation: variance >= 0 ? 'Target achieved or exceeded.' : 'Actual performance is below target.',
      usedValues: [
        { label: 'Target', value: money(target) },
        { label: 'Actual', value: money(actual) },
      ],
    };
  }

  if (toolId === 'percent-change') {
    const a = n('periodAValue');
    const b = n('periodBValue');
    const delta = b - a;
    const pct = computePercentChange(b, a);
    return {
      title: 'Custom Percentage Change Result',
      status: statusFromDirection(delta),
      mainLabel: 'Percentage Change',
      mainValue: `${pct.toFixed(2)}%`,
      subValue: `Difference: ${delta >= 0 ? '+' : ''}${money(delta)}`,
      formula: '(Comparison B - Comparison A) / Comparison A x 100',
      interpretation: delta >= 0 ? 'Comparison B improved versus Comparison A.' : 'Comparison B declined versus Comparison A.',
      usedValues: [
        { label: 'Comparison A', value: money(a) },
        { label: 'Comparison B', value: money(b) },
      ],
    };
  }

  if (toolId === 'efficiency') {
    const output = n('outputValue');
    const input = n('inputValue');
    const target = n('targetValue');
    const efficiency = input > 0 ? output / input : 0;
    const attainment = target > 0 ? (output / target) * 100 : 0;
    return {
      title: 'Business Efficiency Result',
      status: efficiency >= 1 ? 'positive' : efficiency >= 0.8 ? 'warning' : 'negative',
      mainLabel: 'Efficiency Score',
      mainValue: `${efficiency.toFixed(2)}x`,
      subValue: `Target Attainment: ${attainment.toFixed(2)}%`,
      formula: 'Efficiency = Output / Input (cost or effort)',
      interpretation: efficiency >= 1 ? 'Output is meeting or exceeding input value.' : 'Output is trailing input value; efficiency improvements are needed.',
      usedValues: [
        { label: 'Output', value: money(output) },
        { label: 'Input', value: money(input) },
        { label: 'Target Output', value: money(target) },
      ],
    };
  }

  const baseSales = n('baseSales');
  const growthPct = n('projectedGrowthPct');
  const basePayroll = n('basePayroll');
  const payrollIncrease = n('payrollIncreaseAmount');
  const baseExpenses = n('baseExpenses');
  const expenseDropPct = n('expenseDropPct');
  const avgBasket = n('avgBasketValue');
  const basketImprovePct = n('basketImprovementPct');

  const projectedSales = baseSales * (1 + (growthPct / 100));
  const projectedPayroll = basePayroll + payrollIncrease;
  const projectedExpenses = baseExpenses * (1 - (expenseDropPct / 100));
  const projectedBasket = avgBasket * (1 + (basketImprovePct / 100));
  const projectedNet = projectedSales - projectedPayroll - projectedExpenses;
  const baselineNet = baseSales - basePayroll - baseExpenses;
  const projectedDelta = projectedNet - baselineNet;

  return {
    title: 'Projection / Forecast Result',
    status: statusFromDirection(projectedDelta),
    mainLabel: 'Projected Net Position',
    mainValue: money(projectedNet),
    subValue: `Projected change: ${projectedDelta >= 0 ? '+' : ''}${money(projectedDelta)}`,
    formula: 'Projected Net = (Base Sales x (1 + Growth%)) - (Base Payroll + Increase) - (Base Expenses x (1 - Expense Drop%))',
    interpretation: projectedDelta >= 0 ? 'Scenario indicates improved profitability versus baseline.' : 'Scenario indicates profitability decline versus baseline.',
    usedValues: [
      { label: 'Projected Sales', value: money(projectedSales) },
      { label: 'Projected Payroll', value: money(projectedPayroll) },
      { label: 'Projected Expenses', value: money(projectedExpenses) },
      { label: 'Projected Avg Basket', value: money(projectedBasket) },
    ],
  };
}

function startOfMonth(year, monthIndex) {
  return new Date(year, monthIndex, 1);
}

function endOfMonth(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0);
}

function formatDateInput(dateValue) {
  return dateValue.toISOString().slice(0, 10);
}

function toDateSafe(value) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function normalizeLocationCodeFromName(name = '') {
  const normalized = String(name || '').trim().toLowerCase();
  if (normalized === 'blantyre') return 'BT';
  if (normalized === 'zomba') return 'ZA';
  return null;
}

function parseInvoiceDate(invoice) {
  return toDateSafe(invoice?.invoiceDate || invoice?.invoiceTime || invoice?.createdAt);
}

function withinRange(dateValue, startDate, endDate) {
  const date = toDateSafe(dateValue);
  if (!date) return false;
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T23:59:59`);
  return date >= start && date <= end;
}

function computeGrowth(currentValue, previousValue) {
  const current = Number(currentValue || 0);
  const previous = Number(previousValue || 0);
  const absolute = current - previous;

  if (previous === 0) {
    return {
      current,
      previous,
      absolute,
      percent: current === 0 ? 0 : 100,
      direction: absolute > 0 ? 'up' : absolute < 0 ? 'down' : 'flat',
    };
  }

  const percent = (absolute / previous) * 100;
  return {
    current,
    previous,
    absolute,
    percent,
    direction: absolute > 0 ? 'up' : absolute < 0 ? 'down' : 'flat',
  };
}

function growthTone(delta) {
  if (delta.direction === 'up') return { color: '#166534', bg: '#dcfce7', icon: 'fa-arrow-trend-up' };
  if (delta.direction === 'down') return { color: '#b91c1c', bg: '#fee2e2', icon: 'fa-arrow-trend-down' };
  return { color: '#475569', bg: '#e2e8f0', icon: 'fa-minus' };
}

function buildParamsForPeriod(period) {
  const base = {};
  if (period.periodType === 'month') {
    base.periodType = 'month';
    base.month = String(period.month);
    base.year = String(period.year);
  } else if (period.periodType === 'quarter') {
    base.periodType = 'quarter';
    base.quarter = String(period.quarter);
    base.year = String(period.year);
  } else if (period.periodType === 'year') {
    base.periodType = 'year';
    base.year = String(period.year);
  } else {
    base.periodType = 'custom';
    base.startDate = period.startDate;
    base.endDate = period.endDate;
  }
  return base;
}

function withScope(params, scope, locations) {
  const scoped = { ...params };
  if (scope === 'all') return scoped;

  if (String(scope).startsWith('code:')) {
    scoped.locationCode = String(scope).slice(5).trim().toUpperCase();
    return scoped;
  }

  const location = locations.find((row) => String(row.id) === String(scope));
  if (location?.id) scoped.locationId = Number(location.id);
  if (!location?.id) {
    const locationCode = location?.code || normalizeLocationCodeFromName(location?.name || '');
    if (locationCode) scoped.locationCode = locationCode;
  }
  return scoped;
}

function getCurrentMonthPeriod() {
  const now = new Date();
  return {
    periodType: 'month',
    month: now.getMonth() + 1,
    year: now.getFullYear(),
  };
}

function getCurrentYearPeriod() {
  const now = new Date();
  return {
    periodType: 'year',
    year: now.getFullYear(),
  };
}

function previousPeriod(period) {
  if (period.periodType === 'month') {
    const previousMonthIndex = Number(period.month) - 2;
    const previousDate = new Date(Number(period.year), previousMonthIndex, 1);
    return {
      periodType: 'month',
      month: previousDate.getMonth() + 1,
      year: previousDate.getFullYear(),
    };
  }

  if (period.periodType === 'quarter') {
    const quarter = Number(period.quarter || 1);
    const year = Number(period.year);
    if (quarter > 1) {
      return { periodType: 'quarter', quarter: quarter - 1, year };
    }
    return { periodType: 'quarter', quarter: 4, year: year - 1 };
  }

  if (period.periodType === 'year') {
    return { periodType: 'year', year: Number(period.year) - 1 };
  }

  const start = new Date(`${period.startDate}T00:00:00`);
  const end = new Date(`${period.endDate}T23:59:59`);
  const spanMs = end.getTime() - start.getTime();
  const previousEnd = new Date(start.getTime() - 24 * 60 * 60 * 1000);
  const previousStart = new Date(previousEnd.getTime() - spanMs);
  return {
    periodType: 'custom',
    startDate: formatDateInput(previousStart),
    endDate: formatDateInput(previousEnd),
  };
}

function dateRangeFromPeriod(period) {
  if (period.periodType === 'month') {
    const start = startOfMonth(Number(period.year), Number(period.month) - 1);
    const end = endOfMonth(Number(period.year), Number(period.month) - 1);
    return {
      startDate: formatDateInput(start),
      endDate: formatDateInput(end),
      label: start.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }),
    };
  }

  if (period.periodType === 'quarter') {
    const year = Number(period.year);
    const quarter = Number(period.quarter);
    const startMonth = (quarter - 1) * 3;
    const start = startOfMonth(year, startMonth);
    const end = endOfMonth(year, startMonth + 2);
    return {
      startDate: formatDateInput(start),
      endDate: formatDateInput(end),
      label: `Q${quarter} ${year}`,
    };
  }

  if (period.periodType === 'year') {
    const year = Number(period.year);
    return {
      startDate: `${year}-01-01`,
      endDate: `${year}-12-31`,
      label: String(year),
    };
  }

  return {
    startDate: period.startDate,
    endDate: period.endDate,
    label: `${period.startDate} to ${period.endDate}`,
  };
}

function formatDateTimeLabel(value) {
  if (!value) return 'N/A';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'N/A';
  return parsed.toLocaleString('en-GB', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function moneyOrDash(value) {
  return value == null ? 'N/A' : money(value);
}

function joinLabels(values = []) {
  const rows = Array.isArray(values) ? values.filter(Boolean) : [];
  return rows.length > 0 ? rows.join(', ') : 'N/A';
}

const LatestCostProfitSubview = ({ active, selectedPeriod, effectiveScope, locations, scopeLabel, periodLabel, refreshTick }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [profitData, setProfitData] = useState(null);
  const [isDailyOpen, setIsDailyOpen] = useState(false);
  const [isCategoryOpen, setIsCategoryOpen] = useState(false);
  const [isMissingOpen, setIsMissingOpen] = useState(false);
  const [isProductOpen, setIsProductOpen] = useState(false);

  const fetchProfitAnalytics = useCallback(async () => {
    if (!active) return;

    setLoading(true);
    setError('');
    try {
      const params = withScope(buildParamsForPeriod(selectedPeriod), effectiveScope, locations);
      const response = await api.get('/business-operations/reports/sales/profit-latest-cost', { params });
      setProfitData(response?.data?.data || null);
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || 'Failed to load latest-cost profit analytics.');
    } finally {
      setLoading(false);
    }
  }, [active, effectiveScope, locations, selectedPeriod]);

  useEffect(() => {
    fetchProfitAnalytics();
  }, [fetchProfitAnalytics, refreshTick]);

  if (!active) return null;

  const summary = profitData?.summary || null;
  const profitabilitySummary = profitData?.profitabilitySummary || null;
  const categoryTotals = Array.isArray(profitData?.categoryTotals) ? profitData.categoryTotals : [];
  const dailyTotals = Array.isArray(profitData?.dailyTotals) ? profitData.dailyTotals : [];
  const products = Array.isArray(profitData?.products) ? profitData.products : [];
  const incompleteProducts = products.filter((row) => row.isIncomplete);
  const completeProducts = products.filter((row) => !row.isIncomplete);

  return (
    <div style={{ display: 'grid', gap: '0.85rem' }}>
      <div style={{ ...cardStyle, padding: '1rem 1.05rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div>
            <strong style={{ color: '#0f172a' }}>Latest-Cost Profit Analytics</strong>
            <p style={{ margin: '0.3rem 0 0', color: '#64748b', fontSize: '0.84rem', lineHeight: 1.5 }}>
              Profit is calculated from sold revenue minus COGS using each product&apos;s latest unit cost from the most recent GRN in POS SQL for that branch / sync source.
            </p>
          </div>
          <button
            type="button"
            onClick={fetchProfitAnalytics}
            style={{ border: '1px solid #cbd5e1', backgroundColor: '#fff', color: '#0f172a', borderRadius: '9px', padding: '0.55rem 0.78rem', fontWeight: 700, cursor: 'pointer' }}
          >
            <i className={`fas ${loading ? 'fa-spinner fa-spin' : 'fa-rotate-right'}`} style={{ marginRight: '0.4rem' }}></i>
            Refresh Profit Analytics
          </button>
        </div>

        <div style={{ marginTop: '0.7rem', display: 'flex', gap: '0.55rem', flexWrap: 'wrap' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', padding: '0.28rem 0.6rem', borderRadius: '999px', backgroundColor: '#eff6ff', color: '#1d4ed8', fontSize: '0.76rem', fontWeight: 800 }}>
            Period: {periodLabel}
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', padding: '0.28rem 0.6rem', borderRadius: '999px', backgroundColor: '#f8fafc', color: '#334155', fontSize: '0.76rem', fontWeight: 800 }}>
            Scope: {scopeLabel}
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', padding: '0.28rem 0.6rem', borderRadius: '999px', backgroundColor: '#ecfeff', color: '#155e75', fontSize: '0.76rem', fontWeight: 800 }}>
            Basis: Latest POS GRN unit cost
          </span>
        </div>
      </div>

      {error && (
        <div style={{ ...cardStyle, padding: '0.9rem 1rem', borderColor: '#fecaca', backgroundColor: '#fff1f2', color: '#b91c1c' }}>
          {error}
        </div>
      )}

      {loading && !profitData && (
        <div style={{ ...cardStyle, padding: '1rem 1.1rem', color: '#64748b' }}>
          <i className="fas fa-spinner fa-spin" style={{ marginRight: '0.45rem' }}></i>
          Loading latest-cost profit analytics...
        </div>
      )}

      {!loading && summary && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem' }}>
            {[
              { label: 'Total Revenue', value: money(summary.totalRevenue), note: 'All sold revenue in the selected period.' },
              { label: 'Revenue With Cost Basis', value: money(summary.completeRevenue), note: `Coverage ${Number(summary.coveragePct || 0).toFixed(1)}%` },
              { label: 'COGS From Latest Cost', value: money(summary.totalCostOfGoodsSold), note: 'Latest unit cost multiplied by sold quantity.' },
              { label: 'Gross Profit', value: money(summary.totalGrossProfit), note: summary.grossMarginPct == null ? 'Margin unavailable' : `Margin ${Number(summary.grossMarginPct).toFixed(1)}%` },
              { label: 'Excluded Revenue', value: money(summary.excludedRevenue), note: `${intFmt(summary.incompleteProducts)} incomplete product(s)` },
              { label: 'Daily / Period Ready', value: intFmt(summary.completeProducts), note: `${intFmt(summary.uniqueProducts || 0)} unique products • ${intFmt(summary.totalProducts)} branch rows` },
            ].map((kpi) => (
              <div key={kpi.label} style={{ ...cardStyle, padding: '0.9rem 1rem' }}>
                <div style={{ color: '#64748b', fontSize: '0.78rem', fontWeight: 700 }}>{kpi.label}</div>
                <div style={{ marginTop: '0.32rem', color: '#0f172a', fontWeight: 900, fontSize: '1.15rem' }}>{kpi.value}</div>
                <div style={{ marginTop: '0.26rem', color: '#64748b', fontSize: '0.8rem' }}>{kpi.note}</div>
              </div>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '0.75rem' }}>
            <div style={{ ...cardStyle, padding: '0.9rem 1rem' }}>
              <strong style={{ color: '#0f172a' }}>Cost Basis Rule</strong>
              <p style={{ margin: '0.3rem 0 0', color: '#64748b', fontSize: '0.82rem', lineHeight: 1.5 }}>
                {summary.costBasisLabel}. Products without a valid latest unit cost are flagged and excluded from gross profit totals.
              </p>
            </div>
            <div style={{ ...cardStyle, padding: '0.9rem 1rem' }}>
              <strong style={{ color: '#0f172a' }}>Profitability Mix</strong>
              <p style={{ margin: '0.3rem 0 0', color: '#64748b', fontSize: '0.82rem', lineHeight: 1.5 }}>
                Profitable: {intFmt(profitabilitySummary?.profitableProducts || 0)} | Loss-making: {intFmt(profitabilitySummary?.lossMakingProducts || 0)} | Break-even: {intFmt(profitabilitySummary?.breakEvenProducts || 0)}
              </p>
            </div>
          </div>

          {summary.incompleteProducts > 0 && (
            <div style={{ ...cardStyle, padding: '0.95rem 1rem', borderColor: '#fcd34d', backgroundColor: '#fffbeb' }}>
              <strong style={{ color: '#92400e' }}>Incomplete Profit Coverage</strong>
              <p style={{ margin: '0.28rem 0 0', color: '#92400e', fontSize: '0.82rem', lineHeight: 1.5 }}>
                {intFmt(summary.incompleteProducts)} product row(s) do not have a valid latest POS GRN cost in the current scope. Their revenue is shown, but it is excluded from gross profit so the system does not invent profit numbers.
              </p>
            </div>
          )}

          <div style={{ display: 'grid', gap: '0.9rem', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
            {[
              {
                key: 'daily',
                label: 'Daily Breakdown',
                title: `${dailyTotals.length} day${dailyTotals.length !== 1 ? 's' : ''}`,
                description: 'Day-by-day revenue, COGS, excluded revenue, and gross profit for the selected period.',
                icon: 'fa-chart-line',
                iconBg: '#0f766e',
                borderColor: '#99f6e4',
                bg: 'linear-gradient(135deg, #f0fdfa 0%, #ffffff 60%)',
                accent: '#0f766e',
                onClick: () => setIsDailyOpen(true),
              },
              {
                key: 'category',
                label: 'Category Totals',
                title: `${categoryTotals.length} categor${categoryTotals.length !== 1 ? 'ies' : 'y'}`,
                description: 'Revenue, COGS, and gross profit grouped by product category.',
                icon: 'fa-tags',
                iconBg: '#1d4ed8',
                borderColor: '#bfdbfe',
                bg: 'linear-gradient(135deg, #eff6ff 0%, #ffffff 60%)',
                accent: '#1d4ed8',
                onClick: () => setIsCategoryOpen(true),
              },
              {
                key: 'missing',
                label: 'Missing Cost',
                title: `${incompleteProducts.length} product${incompleteProducts.length !== 1 ? 's' : ''}`,
                description: 'Products excluded from profit totals pending a valid POS GRN cost snapshot.',
                icon: 'fa-triangle-exclamation',
                iconBg: '#b45309',
                borderColor: '#fcd34d',
                bg: 'linear-gradient(135deg, #fffbeb 0%, #ffffff 60%)',
                accent: '#b45309',
                onClick: () => setIsMissingOpen(true),
              },
              {
                key: 'products',
                label: 'Per-Product Profit',
                title: `${completeProducts.length} product${completeProducts.length !== 1 ? 's' : ''}`,
                description: 'Unit cost, COGS, gross profit, and margin for each product with a valid GRN cost.',
                icon: 'fa-box-open',
                iconBg: '#6d28d9',
                borderColor: '#d8b4fe',
                bg: 'linear-gradient(135deg, #f8f5ff 0%, #ffffff 60%)',
                accent: '#6d28d9',
                onClick: () => setIsProductOpen(true),
              },
            ].map((card) => (
              <button
                key={card.key}
                type="button"
                onClick={card.onClick}
                style={{
                  textAlign: 'left',
                  border: `1px solid ${card.borderColor}`,
                  background: card.bg,
                  borderRadius: '20px',
                  padding: '1.1rem',
                  cursor: 'pointer',
                  boxShadow: '0 10px 24px rgba(15, 23, 42, 0.05)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'start' }}>
                  <div>
                    <div style={{ fontSize: '0.75rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: card.accent, fontWeight: 800 }}>{card.label}</div>
                    <div style={{ marginTop: '0.4rem', fontSize: '1.15rem', fontWeight: 800, color: '#0f172a', lineHeight: 1.25 }}>{card.title}</div>
                    <div style={{ marginTop: '0.4rem', fontSize: '0.84rem', color: '#64748b', lineHeight: 1.45 }}>{card.description}</div>
                  </div>
                  <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: card.iconBg, color: '#fff', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                    <i className={`fas ${card.icon}`} />
                  </div>
                </div>
              </button>
            ))}
          </div>
        </>
      )}

      {/* Daily Profit Modal */}
      {isDailyOpen && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.45)', zIndex: 220, display: 'grid', placeItems: 'center', padding: '1rem' }}>
          <div style={{ ...cardStyle, width: 'min(680px, 98vw)', maxHeight: '88vh', display: 'flex', flexDirection: 'column', borderRadius: '18px', overflow: 'hidden' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.1rem', borderBottom: '1px solid #e2e8f0' }}>
              <div>
                <div style={{ fontSize: '0.75rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: '#0f766e', fontWeight: 800 }}>Daily Breakdown</div>
                <div style={{ marginTop: '0.2rem', fontWeight: 800, fontSize: '1.05rem', color: '#0f172a' }}>Daily Profit Totals</div>
              </div>
              <button type="button" onClick={() => setIsDailyOpen(false)} style={{ width: '36px', height: '36px', borderRadius: '10px', border: '1px solid #fecaca', background: '#fff5f5', color: '#b91c1c', cursor: 'pointer', display: 'grid', placeItems: 'center' }}>
                <i className="fas fa-times" />
              </button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '1rem 1.1rem', display: 'grid', gap: '0.42rem' }}>
              {dailyTotals.length === 0 ? (
                <div style={{ color: '#94a3b8', fontSize: '0.84rem' }}>No daily profit data for this period.</div>
              ) : dailyTotals.map((row) => (
                <div key={row.day} style={{ border: '1px solid #e2e8f0', borderRadius: '12px', padding: '0.6rem 0.7rem', backgroundColor: '#f8fafc' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    <strong style={{ color: '#0f172a', fontSize: '0.84rem' }}>{row.day}</strong>
                    <span style={{ color: '#1d4ed8', fontWeight: 800, fontSize: '0.8rem' }}>{money(row.grossProfit)}</span>
                  </div>
                  <div style={{ marginTop: '0.28rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '0.32rem' }}>
                    <div style={{ color: '#64748b', fontSize: '0.76rem' }}>Revenue: <span style={{ color: '#0f172a', fontWeight: 700 }}>{money(row.revenue)}</span></div>
                    <div style={{ color: '#64748b', fontSize: '0.76rem' }}>COGS: <span style={{ color: '#0f172a', fontWeight: 700 }}>{money(row.costOfGoodsSold)}</span></div>
                    <div style={{ color: '#64748b', fontSize: '0.76rem' }}>Excluded: <span style={{ color: '#b45309', fontWeight: 700 }}>{money(row.excludedRevenue)}</span></div>
                    <div style={{ color: '#64748b', fontSize: '0.76rem' }}>Margin: <span style={{ color: '#0f172a', fontWeight: 700 }}>{row.grossMarginPct == null ? 'N/A' : `${Number(row.grossMarginPct).toFixed(1)}%`}</span></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Category Profit Modal */}
      {isCategoryOpen && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.45)', zIndex: 220, display: 'grid', placeItems: 'center', padding: '1rem' }}>
          <div style={{ ...cardStyle, width: 'min(680px, 98vw)', maxHeight: '88vh', display: 'flex', flexDirection: 'column', borderRadius: '18px', overflow: 'hidden' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.1rem', borderBottom: '1px solid #e2e8f0' }}>
              <div>
                <div style={{ fontSize: '0.75rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: '#1d4ed8', fontWeight: 800 }}>Category Totals</div>
                <div style={{ marginTop: '0.2rem', fontWeight: 800, fontSize: '1.05rem', color: '#0f172a' }}>Category Profit Totals</div>
              </div>
              <button type="button" onClick={() => setIsCategoryOpen(false)} style={{ width: '36px', height: '36px', borderRadius: '10px', border: '1px solid #fecaca', background: '#fff5f5', color: '#b91c1c', cursor: 'pointer', display: 'grid', placeItems: 'center' }}>
                <i className="fas fa-times" />
              </button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '1rem 1.1rem', display: 'grid', gap: '0.42rem' }}>
              {categoryTotals.length === 0 ? (
                <div style={{ color: '#94a3b8', fontSize: '0.84rem' }}>No category profit totals available.</div>
              ) : categoryTotals.map((row) => (
                <div key={row.category} style={{ border: '1px solid #e2e8f0', borderRadius: '12px', padding: '0.6rem 0.7rem', backgroundColor: '#f8fafc' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    <strong style={{ color: '#0f172a', fontSize: '0.84rem' }}>{row.category}</strong>
                    <span style={{ color: '#1d4ed8', fontWeight: 800, fontSize: '0.8rem' }}>{money(row.totalGrossProfit)}</span>
                  </div>
                  <div style={{ marginTop: '0.28rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '0.32rem' }}>
                    <div style={{ color: '#64748b', fontSize: '0.76rem' }}>Revenue: <span style={{ color: '#0f172a', fontWeight: 700 }}>{money(row.totalRevenue)}</span></div>
                    <div style={{ color: '#64748b', fontSize: '0.76rem' }}>COGS: <span style={{ color: '#0f172a', fontWeight: 700 }}>{money(row.totalCostOfGoodsSold)}</span></div>
                    <div style={{ color: '#64748b', fontSize: '0.76rem' }}>Margin: <span style={{ color: '#0f172a', fontWeight: 700 }}>{row.grossMarginPct == null ? 'N/A' : `${Number(row.grossMarginPct).toFixed(1)}%`}</span></div>
                    <div style={{ color: '#64748b', fontSize: '0.76rem' }}>Incomplete: <span style={{ color: '#b45309', fontWeight: 700 }}>{intFmt(row.incompleteProducts)}</span></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Missing Cost Modal */}
      {isMissingOpen && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.45)', zIndex: 220, display: 'grid', placeItems: 'center', padding: '1rem' }}>
          <div style={{ ...cardStyle, width: 'min(680px, 98vw)', maxHeight: '88vh', display: 'flex', flexDirection: 'column', borderRadius: '18px', overflow: 'hidden' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.1rem', borderBottom: '1px solid #fcd34d', backgroundColor: '#fffbeb' }}>
              <div>
                <div style={{ fontSize: '0.75rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: '#b45309', fontWeight: 800 }}>Missing Cost</div>
                <div style={{ marginTop: '0.2rem', fontWeight: 800, fontSize: '1.05rem', color: '#92400e' }}>Products Missing Latest Cost</div>
              </div>
              <button type="button" onClick={() => setIsMissingOpen(false)} style={{ width: '36px', height: '36px', borderRadius: '10px', border: '1px solid #fecaca', background: '#fff5f5', color: '#b91c1c', cursor: 'pointer', display: 'grid', placeItems: 'center' }}>
                <i className="fas fa-times" />
              </button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '1rem 1.1rem', display: 'grid', gap: '0.42rem', alignContent: 'start' }}>
              {incompleteProducts.length === 0 ? (
                <div style={{ color: '#166534', fontSize: '0.84rem', fontWeight: 700 }}>All tracked products have a valid latest cost basis.</div>
              ) : incompleteProducts.map((row) => (
                <div key={`${row.productCode || row.productName}-missing`} style={{ border: '1px solid #fed7aa', borderRadius: '12px', padding: '0.6rem 0.7rem', backgroundColor: '#fff7ed' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    <strong style={{ color: '#9a3412', fontSize: '0.84rem' }}>{row.productName}</strong>
                    <span style={{ color: '#9a3412', fontWeight: 800, fontSize: '0.76rem' }}>{row.productCode || 'No product code'}</span>
                  </div>
                  <div style={{ marginTop: '0.28rem', color: '#7c2d12', fontSize: '0.78rem', lineHeight: 1.45 }}>{row.incompleteReason}</div>
                  <div style={{ marginTop: '0.28rem', color: '#9a3412', fontSize: '0.76rem' }}>Revenue: <strong>{money(row.revenue)}</strong> | Qty: <strong>{intFmt(row.quantitySold)}</strong> | Scope: <strong>{joinLabels(row.branchCodes || row.syncSourceCodes || [])}</strong></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Per-Product Profit Modal */}
      {isProductOpen && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.45)', zIndex: 220, display: 'grid', placeItems: 'center', padding: '1rem' }}>
          <div style={{ ...cardStyle, width: 'min(820px, 98vw)', maxHeight: '90vh', display: 'flex', flexDirection: 'column', borderRadius: '18px', overflow: 'hidden' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.1rem', borderBottom: '1px solid #e2e8f0' }}>
              <div>
                <div style={{ fontSize: '0.75rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: '#6d28d9', fontWeight: 800 }}>Per-Product Profit</div>
                <div style={{ marginTop: '0.2rem', fontWeight: 800, fontSize: '1.05rem', color: '#0f172a' }}>{completeProducts.length} Product{completeProducts.length !== 1 ? 's' : ''} with Cost Basis</div>
              </div>
              <button type="button" onClick={() => setIsProductOpen(false)} style={{ width: '36px', height: '36px', borderRadius: '10px', border: '1px solid #fecaca', background: '#fff5f5', color: '#b91c1c', cursor: 'pointer', display: 'grid', placeItems: 'center' }}>
                <i className="fas fa-times" />
              </button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '1rem 1.1rem', display: 'grid', gap: '0.42rem', alignContent: 'start' }}>
              {completeProducts.length === 0 ? (
                <div style={{ color: '#94a3b8', fontSize: '0.84rem' }}>No complete product profit rows available.</div>
              ) : completeProducts.map((row) => (
                <div key={`${row.productCode || row.productName}-profit`} style={{ border: '1px solid #e2e8f0', borderRadius: '12px', padding: '0.6rem 0.7rem', backgroundColor: '#fff' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.6rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                    <div>
                      <strong style={{ color: '#0f172a', fontSize: '0.84rem' }}>{row.productName}</strong>
                      <div style={{ marginTop: '0.16rem', color: '#64748b', fontSize: '0.76rem' }}>{row.productCode || 'No product code'}{row.category ? ` • ${row.category}` : ''}</div>
                      <div style={{ marginTop: '0.12rem', color: '#94a3b8', fontSize: '0.73rem' }}>Branches: {joinLabels(row.branchCodes)} | Sources: {joinLabels(row.syncSourceCodes)}</div>
                    </div>
                    <div style={{ color: '#1d4ed8', fontWeight: 900, fontSize: '0.86rem' }}>{money(row.grossProfit)}</div>
                  </div>
                  <div style={{ marginTop: '0.34rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '0.32rem' }}>
                    <div style={{ color: '#64748b', fontSize: '0.76rem' }}>Revenue: <span style={{ color: '#0f172a', fontWeight: 700 }}>{money(row.revenue)}</span></div>
                    <div style={{ color: '#64748b', fontSize: '0.76rem' }}>Qty: <span style={{ color: '#0f172a', fontWeight: 700 }}>{intFmt(row.quantitySold)}</span></div>
                    <div style={{ color: '#64748b', fontSize: '0.76rem' }}>Unit Cost: <span style={{ color: '#0f172a', fontWeight: 700 }}>{row.latestCostBasis?.length === 1 ? moneyOrDash(row.latestCostBasis[0]?.latestUnitCost) : `${row.latestCostBasis?.length || 0} branch records`}</span></div>
                    <div style={{ color: '#64748b', fontSize: '0.76rem' }}>COGS: <span style={{ color: '#0f172a', fontWeight: 700 }}>{moneyOrDash(row.costOfGoodsSold)}</span></div>
                    <div style={{ color: '#64748b', fontSize: '0.76rem' }}>Margin: <span style={{ color: '#0f172a', fontWeight: 700 }}>{row.grossMarginPct == null ? 'N/A' : `${Number(row.grossMarginPct).toFixed(1)}%`}</span></div>
                  </div>
                  {Array.isArray(row.latestCostBasis) && row.latestCostBasis.length > 0 && (
                    <div style={{ marginTop: '0.34rem', display: 'grid', gap: '0.28rem' }}>
                      {row.latestCostBasis.map((basis, index) => (
                        <div key={`${row.productCode || row.productName}-basis-${basis.syncSourceCode || index}`} style={{ padding: '0.42rem 0.5rem', borderRadius: '10px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0' }}>
                          <div style={{ color: '#475569', fontSize: '0.74rem', fontWeight: 800 }}>Cost Basis{basis.branchCode ? ` • ${basis.branchCode}` : ''}</div>
                          <div style={{ marginTop: '0.16rem', color: '#334155', fontSize: '0.76rem', lineHeight: 1.45 }}>
                            Source: <strong>{basis.syncSourceCode || 'N/A'}</strong> &nbsp;|&nbsp;
                            GRN: <strong>{basis.latestGrnReference || basis.latestGrnNo || 'N/A'}</strong> &nbsp;|&nbsp;
                            Date: <strong>{formatDateTimeLabel(basis.latestStockAdditionDate)}</strong> &nbsp;|&nbsp;
                            Cost: <strong>{moneyOrDash(basis.latestUnitCost)}</strong>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const BusinessAnalyticsTab = ({
  selectedLocationId = null,
  selectedLocationCode = '',
  locations = [],
}) => {
  const isAdminDarkTheme = typeof document !== 'undefined' && document.body.classList.contains('admin-theme-dark');
  const now = new Date();
  const [scope, setScope] = useState('inherit');
  const [filters, setFilters] = useState({
    periodType: 'month',
    month: now.getMonth() + 1,
    year: now.getFullYear(),
    quarter: Math.floor(now.getMonth() / 3) + 1,
    startDate: formatDateInput(startOfMonth(now.getFullYear(), now.getMonth())),
    endDate: formatDateInput(endOfMonth(now.getFullYear(), now.getMonth())),
  });

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [profitRefreshTick, setProfitRefreshTick] = useState(0);
  const [error, setError] = useState('');
  const [analytics, setAnalytics] = useState(null);
  const [activeView, setActiveView] = useState('overview');
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [activeTool, setActiveTool] = useState('growth');
  const [isToolModalOpen, setIsToolModalOpen] = useState(false);
  const [analysisResult, setAnalysisResult] = useState(null);
  const [analysisInputs, setAnalysisInputs] = useState({
    previousValue: 0,
    currentValue: 0,
    revenue: 0,
    expenses: 0,
    payrollTotal: 0,
    productCost: 0,
    targetValue: 0,
    actualValue: 0,
    periodAValue: 0,
    periodBValue: 0,
    outputValue: 0,
    inputValue: 0,
    baseSales: 0,
    projectedGrowthPct: 10,
    basePayroll: 0,
    payrollIncreaseAmount: 0,
    baseExpenses: 0,
    expenseDropPct: 0,
    avgBasketValue: 0,
    basketImprovementPct: 0,
  });

  const refreshIntervalRef = useRef(null);
  const refreshTimeoutRef = useRef(null);
  const refreshInFlightRef = useRef(false);
  const hasLoadedOnceRef = useRef(false);

  const effectiveScope = useMemo(() => {
    if (scope === 'inherit') {
      return selectedLocationId ? String(selectedLocationId) : 'all';
    }
    return scope;
  }, [scope, selectedLocationId]);

  const scopeLabel = useMemo(() => {
    if (scope === 'inherit') {
      if (!selectedLocationId) return 'All Locations (inherits BO scope)';
      const inherited = locations.find((row) => Number(row.id) === Number(selectedLocationId));
      if (inherited) return `${inherited.name} (inherits BO scope)`;
      return selectedLocationCode ? `${selectedLocationCode} (inherits BO scope)` : 'Selected BO scope';
    }

    if (scope === 'all') return 'All Locations';
    const selected = locations.find((row) => String(row.id) === String(scope));
    return selected ? selected.name : 'Selected location';
  }, [locations, scope, selectedLocationId]);

  const selectedPeriod = useMemo(() => {
    const period = {
      periodType: filters.periodType,
      month: Number(filters.month),
      year: Number(filters.year),
      quarter: Number(filters.quarter),
      startDate: filters.startDate,
      endDate: filters.endDate,
    };
    return period;
  }, [filters]);

  const selectedDateRange = useMemo(() => dateRangeFromPeriod(selectedPeriod), [selectedPeriod]);

  const computeAnalytics = useCallback(async () => {
    if (refreshInFlightRef.current) return;
    refreshInFlightRef.current = true;

    setError('');
    setRefreshing(true);

    const shouldShowLoading = !hasLoadedOnceRef.current;
    if (shouldShowLoading) setLoading(true);

    try {
      const now = new Date();
      const thisYear = now.getFullYear();

      const periodParams = withScope(buildParamsForPeriod(selectedPeriod), effectiveScope, locations);
      const prevPeriodParams = withScope(buildParamsForPeriod(previousPeriod(selectedPeriod)), effectiveScope, locations);
      const monthParams = withScope(buildParamsForPeriod(getCurrentMonthPeriod()), effectiveScope, locations);
      const prevMonthParams = withScope(buildParamsForPeriod(previousPeriod(getCurrentMonthPeriod())), effectiveScope, locations);
      const yearParams = withScope(buildParamsForPeriod(getCurrentYearPeriod()), effectiveScope, locations);
      const prevYearParams = withScope(buildParamsForPeriod(previousPeriod(getCurrentYearPeriod())), effectiveScope, locations);

      // Last 12 months for monthly trend
      const last12Months = Array.from({ length: 12 }, (_, i) => {
        const d = new Date(thisYear, now.getMonth() - (11 - i), 1);
        return { periodType: 'month', month: d.getMonth() + 1, year: d.getFullYear() };
      });

      // Last 5 years for yearly trend
      const last5Years = Array.from({ length: 5 }, (_, i) => ({ periodType: 'year', year: thisYear - (4 - i) }));

      // Q1-Q4 for quarterly trend
      const quarters = [1, 2, 3, 4].map((q) => ({ periodType: 'quarter', quarter: q, year: thisYear }));

      // Daily trend: only for spans ≤ 62 days (month/short custom)
      const selRange = dateRangeFromPeriod(selectedPeriod);
      const spanDays = Math.round((new Date(selRange.endDate) - new Date(selRange.startDate)) / 86400000) + 1;
      const dailyPeriods = spanDays <= 62
        ? Array.from({ length: spanDays }, (_, i) => {
            const d = new Date(`${selRange.startDate}T00:00:00`);
            d.setDate(d.getDate() + i);
            const ds = formatDateInput(d);
            return { periodType: 'custom', startDate: ds, endDate: ds };
          })
        : [];

      // Branch summaries (BT + ZA)
      const branchCodes = ['BT', 'ZA'];

      // Slot indices in the flat allResponses array
      const FIXED = 8; // 6 summaries + products + users
      const MONTHLY_SLICE = [FIXED, FIXED + 12];
      const YEARLY_SLICE = [FIXED + 12, FIXED + 17];
      const QUARTERLY_SLICE = [FIXED + 17, FIXED + 21];
      const DAILY_SLICE = [FIXED + 21, FIXED + 21 + dailyPeriods.length];
      const BRANCH_SLICE = [FIXED + 21 + dailyPeriods.length, FIXED + 21 + dailyPeriods.length + branchCodes.length];

      const allResponses = await Promise.all([
        // 0-5: fixed period summaries
        api.get('/business-operations/reports/sales/summary', { params: periodParams }),
        api.get('/business-operations/reports/sales/summary', { params: prevPeriodParams }),
        api.get('/business-operations/reports/sales/summary', { params: monthParams }),
        api.get('/business-operations/reports/sales/summary', { params: prevMonthParams }),
        api.get('/business-operations/reports/sales/summary', { params: yearParams }),
        api.get('/business-operations/reports/sales/summary', { params: prevYearParams }),
        // 6: products
        api.get('/business-operations/reports/sales/products', { params: { ...periodParams, page: 1, pageSize: 12, sortBy: 'totalSales', sortOrder: 'desc' } }),
        // 7: users
        api.get('/business-operations/reports/sales/users', { params: { ...periodParams, page: 1, pageSize: 10, sortBy: 'totalSales', sortOrder: 'desc' } }),
        // 8..19: monthly trend (12 summary calls)
        ...last12Months.map((p) => api.get('/business-operations/reports/sales/summary', { params: withScope(buildParamsForPeriod(p), effectiveScope, locations) })),
        // 20..24: yearly trend (5 summary calls)
        ...last5Years.map((p) => api.get('/business-operations/reports/sales/summary', { params: withScope(buildParamsForPeriod(p), effectiveScope, locations) })),
        // 25..28: quarterly trend (4 summary calls)
        ...quarters.map((p) => api.get('/business-operations/reports/sales/summary', { params: withScope(buildParamsForPeriod(p), effectiveScope, locations) })),
        // 29..29+N: daily trend (0-62 summary calls, only for short periods)
        ...dailyPeriods.map((p) => api.get('/business-operations/reports/sales/summary', { params: withScope(buildParamsForPeriod(p), effectiveScope, locations) })),
        // last 2: branch summaries (BT, ZA)
        ...branchCodes.map((code) => api.get('/business-operations/reports/sales/summary', { params: withScope({ ...periodParams }, `code:${code}`, locations) })),
      ]);

      const currentSummary = allResponses[0]?.data?.data || {};
      const previousSummary = allResponses[1]?.data?.data || {};
      const currentMonthSummary = allResponses[2]?.data?.data || {};
      const previousMonthSummary = allResponses[3]?.data?.data || {};
      const currentYearSummary = allResponses[4]?.data?.data || {};
      const previousYearSummary = allResponses[5]?.data?.data || {};
      const productRows = Array.isArray(allResponses[6]?.data?.data) ? allResponses[6].data.data : [];
      const userRows = Array.isArray(allResponses[7]?.data?.data) ? allResponses[7].data.data : [];

      const totalSales = Number(currentSummary.netSales || 0);
      const invoiceCount = Number(currentSummary.totalInvoices || 0);
      const averageBasketValue = invoiceCount > 0 ? totalSales / invoiceCount : 0;
      const prevSales = Number(previousSummary.netSales || 0);
      const prevInvoices = Number(previousSummary.totalInvoices || 0);
      const prevAvgBasket = prevInvoices > 0 ? prevSales / prevInvoices : 0;

      const selectedPeriodGrowth = {
        sales: computeGrowth(totalSales, prevSales),
        invoices: computeGrowth(invoiceCount, prevInvoices),
        basket: computeGrowth(averageBasketValue, prevAvgBasket),
      };
      const monthGrowth = computeGrowth(Number(currentMonthSummary.netSales || 0), Number(previousMonthSummary.netSales || 0));
      const yearGrowth = computeGrowth(Number(currentYearSummary.netSales || 0), Number(previousYearSummary.netSales || 0));

      // Monthly trend from summary slices
      const monthlyTrend = last12Months.map((p, i) => {
        const s = allResponses[MONTHLY_SLICE[0] + i]?.data?.data || {};
        const d = new Date(p.year, p.month - 1, 1);
        return {
          key: `${p.year}-${String(p.month).padStart(2, '0')}`,
          label: d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }),
          sales: Number(s.netSales || 0),
          invoices: Number(s.totalInvoices || 0),
          rolling3MonthSales: 0,
        };
      });
      for (let idx = 0; idx < monthlyTrend.length; idx += 1) {
        const from = Math.max(0, idx - 2);
        const chunk = monthlyTrend.slice(from, idx + 1);
        monthlyTrend[idx].rolling3MonthSales = chunk.reduce((sum, r) => sum + r.sales, 0) / chunk.length;
      }

      // Yearly trend
      const yearlyComparison = last5Years.map((p, i) => {
        const s = allResponses[YEARLY_SLICE[0] + i]?.data?.data || {};
        return { year: String(p.year), sales: Number(s.netSales || 0), invoices: Number(s.totalInvoices || 0) };
      });

      // Quarterly trend
      const quarterlySummary = quarters.map((p, i) => {
        const s = allResponses[QUARTERLY_SLICE[0] + i]?.data?.data || {};
        return { quarter: `Q${p.quarter}`, sales: Number(s.netSales || 0), invoices: Number(s.totalInvoices || 0) };
      });

      // Daily trend (only populated for short spans)
      const dailyTrend = dailyPeriods.map((p, i) => {
        const s = allResponses[DAILY_SLICE[0] + i]?.data?.data || {};
        return { day: p.startDate, sales: Number(s.netSales || 0), invoices: Number(s.totalInvoices || 0) };
      });

      // Branch performance from location-scoped summaries
      const branchPerformance = branchCodes
        .map((code, i) => {
          const s = allResponses[BRANCH_SLICE[0] + i]?.data?.data || {};
          const bSales = Number(s.netSales || 0);
          const bInvoices = Number(s.totalInvoices || 0);
          return {
            code,
            sales: bSales,
            invoices: bInvoices,
            averageBasket: bInvoices > 0 ? bSales / bInvoices : 0,
            contributionShare: totalSales > 0 ? (bSales / totalSales) * 100 : 0,
          };
        })
        .filter((b) => b.sales > 0);

      // Rankings from product/user API responses
      const categoryMap = productRows.reduce((acc, row) => {
        const key = String(row.category || row.categoryName || row.productCategory || 'Uncategorized').trim() || 'Uncategorized';
        const entry = acc.get(key) || { category: key, sales: 0, quantity: 0 };
        entry.sales += Number(row.totalSales || 0);
        entry.quantity += Number(row.totalQuantitySold || 0);
        acc.set(key, entry);
        return acc;
      }, new Map());

      const topCategories = Array.from(categoryMap.values())
        .map((row) => ({ ...row, contributionShare: totalSales > 0 ? (row.sales / totalSales) * 100 : 0 }))
        .sort((a, b) => b.sales - a.sales)
        .slice(0, 8);

      const topProducts = productRows
        .map((row) => ({
          productCode: row.productCode || 'N/A',
          productName: row.productName || 'Unnamed product',
          totalSales: Number(row.totalSales || 0),
          totalQuantity: Number(row.totalQuantitySold || 0),
          contributionShare: totalSales > 0 ? (Number(row.totalSales || 0) / totalSales) * 100 : 0,
        }))
        .sort((a, b) => b.totalSales - a.totalSales)
        .slice(0, 10);

      const topUsers = userRows
        .map((row) => ({
          userName: row.userName || 'Unknown',
          totalSales: Number(row.totalSales || 0),
          totalInvoices: Number(row.totalInvoices || 0),
          averageInvoiceValue: Number(row.averageInvoiceValue || 0),
        }))
        .sort((a, b) => b.totalSales - a.totalSales)
        .slice(0, 10);

      setAnalytics({
        periodLabel: selectedDateRange.label,
        scopeLabel,
        kpis: { totalSales, invoiceCount, averageBasketValue, topProductsCount: topProducts.length },
        growth: { selected: selectedPeriodGrowth, monthVsPrevious: monthGrowth, yearVsPrevious: yearGrowth },
        trends: { daily: dailyTrend, monthly: monthlyTrend, yearly: yearlyComparison, quarterly: quarterlySummary },
        rankings: { topProducts, topCategories, topUsers, branchPerformance },
      });
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || 'Failed to load analytics.');
    } finally {
      setRefreshing(false);
      setLoading(false);
      hasLoadedOnceRef.current = true;
      refreshInFlightRef.current = false;
    }
  }, [effectiveScope, locations, scopeLabel, selectedDateRange.label, selectedPeriod]);

  useEffect(() => {
    computeAnalytics();
  }, [computeAnalytics]);

  useEffect(() => {
    refreshIntervalRef.current = setInterval(() => {
      computeAnalytics();
      setProfitRefreshTick((prev) => prev + 1);
    }, AUTO_REFRESH_MS);

    const scheduleRefresh = () => {
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
      }
      refreshTimeoutRef.current = setTimeout(() => {
        computeAnalytics();
        setProfitRefreshTick((prev) => prev + 1);
      }, AUTO_REFRESH_DEBOUNCE_MS);
    };

    const onVisibilityChange = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        scheduleRefresh();
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('focus', scheduleRefresh);
    }
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibilityChange);
    }

    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
      }
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
      }
      if (typeof window !== 'undefined') {
        window.removeEventListener('focus', scheduleRefresh);
      }
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibilityChange);
      }
    };
  }, [computeAnalytics]);

  const locationOptions = useMemo(() => {
    const rows = (locations || []).map((row) => ({ id: String(row.id), label: row.name }));
    if (!rows.find((row) => row.label.toLowerCase() === 'blantyre')) {
      rows.push({ id: 'code:BT', label: 'Blantyre' });
    }
    if (!rows.find((row) => row.label.toLowerCase() === 'zomba')) {
      rows.push({ id: 'code:ZA', label: 'Zomba' });
    }
    return rows;
  }, [locations]);

  const activeToolConfig = useMemo(
    () => ANALYSIS_TOOLS.find((tool) => tool.id === activeTool) || ANALYSIS_TOOLS[0],
    [activeTool],
  );

  const updateAnalysisInput = (fieldKey, rawValue) => {
    setAnalysisInputs((prev) => ({
      ...prev,
      [fieldKey]: rawValue === '' ? '' : Number(rawValue),
    }));
  };

  const runAnalysis = () => {
    setAnalysisResult(buildAnalysisResult(activeTool, analysisInputs));
  };

  const applyAnalysisPreset = (preset) => {
    if (!analytics) return;

    setAnalysisInputs((prev) => {
      const next = { ...prev };

      if (preset === 'selected-vs-previous') {
        next.previousValue = analytics.growth.selected.sales.previous;
        next.currentValue = analytics.growth.selected.sales.current;
        next.periodAValue = analytics.growth.selected.sales.previous;
        next.periodBValue = analytics.growth.selected.sales.current;
        next.revenue = analytics.kpis.totalSales;
      }

      if (preset === 'month-vs-previous') {
        next.previousValue = analytics.growth.monthVsPrevious.previous;
        next.currentValue = analytics.growth.monthVsPrevious.current;
        next.periodAValue = analytics.growth.monthVsPrevious.previous;
        next.periodBValue = analytics.growth.monthVsPrevious.current;
      }

      if (preset === 'year-vs-previous') {
        next.previousValue = analytics.growth.yearVsPrevious.previous;
        next.currentValue = analytics.growth.yearVsPrevious.current;
      }

      if (preset === 'kpi-base') {
        next.revenue = analytics.kpis.totalSales;
        next.baseSales = analytics.kpis.totalSales;
        next.avgBasketValue = analytics.kpis.averageBasketValue;
        next.targetValue = analytics.kpis.totalSales * 1.1;
        next.actualValue = analytics.kpis.totalSales;
      }

      if (preset === 'branch-compare') {
        const bt = analytics.rankings.branchPerformance.find((row) => row.code === 'BT');
        const za = analytics.rankings.branchPerformance.find((row) => row.code === 'ZA');
        next.periodAValue = bt?.sales || 0;
        next.periodBValue = za?.sales || 0;
      }

      return next;
    });

    setAnalysisResult(null);
  };

  const analysisStatusStyle = (status) => {
    if (status === 'positive') return { bg: '#dcfce7', color: '#166534', label: 'Positive' };
    if (status === 'negative') return { bg: '#fee2e2', color: '#b91c1c', label: 'Negative' };
    return { bg: '#fef3c7', color: '#92400e', label: 'Warning' };
  };

  const openToolModal = (toolId) => {
    setActiveTool(toolId);
    setAnalysisResult(null);
    setIsToolModalOpen(true);
  };

  useEffect(() => {
    if (!isToolModalOpen || typeof window === 'undefined') return undefined;

    const onEsc = (event) => {
      if (event.key === 'Escape') {
        setIsToolModalOpen(false);
      }
    };

    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [isToolModalOpen]);

  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      <div style={{ ...cardStyle, padding: '1rem 1.1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.9rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div>
            <h3 style={{ margin: 0, color: '#0f172a', fontSize: '1.12rem' }}>Business Analytics & Performance</h3>
            <p style={{ margin: '0.38rem 0 0', color: '#64748b', fontSize: '0.9rem', lineHeight: 1.5 }}>
              Growth tracking, performance trends, and contribution insights by period, branch, category, and team.
            </p>
          </div>
          <div style={{ color: refreshing ? '#2563eb' : '#64748b', fontSize: '0.84rem', fontWeight: 700 }}>
            {refreshing ? 'Auto-refreshing...' : 'Auto-refresh every 5 min'}
          </div>
        </div>

        <div style={{ marginTop: '0.85rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.7rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => setFiltersExpanded((prev) => !prev)}
            style={{ border: '1px solid #cbd5e1', backgroundColor: '#fff', color: '#334155', borderRadius: '999px', padding: '0.42rem 0.72rem', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer' }}
          >
            <i className={`fas ${filtersExpanded ? 'fa-chevron-up' : 'fa-sliders'}`} style={{ marginRight: '0.38rem' }}></i>
            {filtersExpanded ? 'Hide Filters' : 'Show Filters'}
          </button>

          <button
            type="button"
            onClick={() => {
              computeAnalytics();
              setProfitRefreshTick((prev) => prev + 1);
            }}
            style={{ border: '1px solid #cbd5e1', backgroundColor: '#fff', color: '#0f172a', borderRadius: '9px', padding: '0.55rem 0.78rem', fontWeight: 700, cursor: 'pointer' }}
          >
            <i className={`fas ${refreshing ? 'fa-spinner fa-spin' : 'fa-rotate-right'}`} style={{ marginRight: '0.4rem' }}></i>
            Refresh Analytics
          </button>
        </div>

        {filtersExpanded && (
          <div style={{ marginTop: '0.75rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.7rem' }}>
            <label style={{ display: 'grid', gap: '0.35rem' }}>
              <span style={{ color: '#64748b', fontSize: '0.8rem', fontWeight: 700 }}>Period Type</span>
              <select value={filters.periodType} onChange={(event) => setFilters((prev) => ({ ...prev, periodType: event.target.value }))} style={{ border: '1px solid #cbd5e1', borderRadius: '9px', padding: '0.5rem 0.6rem', backgroundColor: '#fff', color: '#0f172a' }}>
                <option value="month">Month</option>
                <option value="quarter">Quarter</option>
                <option value="year">Year</option>
                <option value="custom">Custom Range</option>
              </select>
            </label>

            {(filters.periodType === 'month' || filters.periodType === 'quarter' || filters.periodType === 'year') && (
              <label style={{ display: 'grid', gap: '0.35rem' }}>
                <span style={{ color: '#64748b', fontSize: '0.8rem', fontWeight: 700 }}>Year</span>
                <input type="number" value={filters.year} onChange={(event) => setFilters((prev) => ({ ...prev, year: Number(event.target.value || new Date().getFullYear()) }))} style={{ border: '1px solid #cbd5e1', borderRadius: '9px', padding: '0.5rem 0.6rem' }} />
              </label>
            )}

            {filters.periodType === 'month' && (
              <label style={{ display: 'grid', gap: '0.35rem' }}>
                <span style={{ color: '#64748b', fontSize: '0.8rem', fontWeight: 700 }}>Month</span>
                <select value={filters.month} onChange={(event) => setFilters((prev) => ({ ...prev, month: Number(event.target.value) }))} style={{ border: '1px solid #cbd5e1', borderRadius: '9px', padding: '0.5rem 0.6rem' }}>
                  {Array.from({ length: 12 }, (_, index) => index + 1).map((month) => (
                    <option key={month} value={month}>{new Date(2026, month - 1, 1).toLocaleDateString('en-GB', { month: 'long' })}</option>
                  ))}
                </select>
              </label>
            )}

            {filters.periodType === 'quarter' && (
              <label style={{ display: 'grid', gap: '0.35rem' }}>
                <span style={{ color: '#64748b', fontSize: '0.8rem', fontWeight: 700 }}>Quarter</span>
                <select value={filters.quarter} onChange={(event) => setFilters((prev) => ({ ...prev, quarter: Number(event.target.value) }))} style={{ border: '1px solid #cbd5e1', borderRadius: '9px', padding: '0.5rem 0.6rem' }}>
                  <option value={1}>Q1</option>
                  <option value={2}>Q2</option>
                  <option value={3}>Q3</option>
                  <option value={4}>Q4</option>
                </select>
              </label>
            )}

            {filters.periodType === 'custom' && (
              <>
                <label style={{ display: 'grid', gap: '0.35rem' }}>
                  <span style={{ color: '#64748b', fontSize: '0.8rem', fontWeight: 700 }}>Start Date</span>
                  <input type="date" value={filters.startDate} onChange={(event) => setFilters((prev) => ({ ...prev, startDate: event.target.value }))} style={{ border: '1px solid #cbd5e1', borderRadius: '9px', padding: '0.5rem 0.6rem' }} />
                </label>
                <label style={{ display: 'grid', gap: '0.35rem' }}>
                  <span style={{ color: '#64748b', fontSize: '0.8rem', fontWeight: 700 }}>End Date</span>
                  <input type="date" value={filters.endDate} onChange={(event) => setFilters((prev) => ({ ...prev, endDate: event.target.value }))} style={{ border: '1px solid #cbd5e1', borderRadius: '9px', padding: '0.5rem 0.6rem' }} />
                </label>
              </>
            )}

            <label style={{ display: 'grid', gap: '0.35rem' }}>
              <span style={{ color: '#64748b', fontSize: '0.8rem', fontWeight: 700 }}>Branch Scope</span>
              <select value={scope} onChange={(event) => setScope(event.target.value)} style={{ border: '1px solid #cbd5e1', borderRadius: '9px', padding: '0.5rem 0.6rem' }}>
                <option value="inherit">Inherit BO Scope</option>
                <option value="all">All Branches</option>
                {locationOptions.map((row) => (
                  <option key={row.id} value={row.id}>{row.label}</option>
                ))}
              </select>
            </label>
          </div>
        )}
      </div>

      {error && (
        <div style={{ ...cardStyle, padding: '0.95rem 1.05rem', borderColor: '#fecaca', backgroundColor: '#fff1f2', color: '#b91c1c' }}>
          {error}
        </div>
      )}

      {!loading && analytics && (
        <>
          <div style={{ ...cardStyle, padding: '0.7rem 0.8rem' }}>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              {[
                { id: 'overview', label: 'Overview' },
                { id: 'trends', label: 'Trends' },
                { id: 'rankings', label: 'Rankings' },
                { id: 'latest-profit', label: 'Latest Cost Profit' },
                { id: 'analysis', label: 'Action Center' },
              ].map((view) => {
                const isActive = activeView === view.id;
                return (
                  <button
                    key={view.id}
                    type="button"
                    onClick={() => setActiveView(view.id)}
                    style={{
                      border: isActive ? '1px solid #1d4ed8' : '1px solid #cbd5e1',
                      backgroundColor: isActive ? '#dbeafe' : '#fff',
                      color: isActive ? '#1d4ed8' : '#334155',
                      borderRadius: '999px',
                      padding: '0.34rem 0.7rem',
                      fontWeight: 800,
                      fontSize: '0.78rem',
                      cursor: 'pointer',
                    }}
                  >
                    {view.label}
                  </button>
                );
              })}
            </div>
          </div>

          {activeView === 'latest-profit' && (
            <LatestCostProfitSubview
              active={activeView === 'latest-profit'}
              selectedPeriod={selectedPeriod}
              effectiveScope={effectiveScope}
              locations={locations}
              scopeLabel={scopeLabel}
              periodLabel={selectedDateRange.label}
              refreshTick={profitRefreshTick}
            />
          )}

          {activeView === 'overview' && (
            <>
              <div style={{ ...cardStyle, padding: '1rem 1.1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.8rem', flexWrap: 'wrap' }}>
                  <strong style={{ color: '#0f172a' }}>Growth Overview</strong>
                  <span style={{ color: '#64748b', fontSize: '0.84rem' }}>{analytics.periodLabel} • {analytics.scopeLabel}</span>
                </div>

                <div style={{ marginTop: '0.85rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem' }}>
                  {[
                    { label: 'Period Sales Growth', value: analytics.growth.selected.sales, format: money },
                    { label: 'Period Invoice Growth', value: analytics.growth.selected.invoices, format: intFmt },
                    { label: 'Period Basket Growth', value: analytics.growth.selected.basket, format: money },
                    { label: 'Month vs Previous', value: analytics.growth.monthVsPrevious, format: money },
                    { label: 'Year vs Previous', value: analytics.growth.yearVsPrevious, format: money },
                  ].map((item) => {
                    const tone = growthTone(item.value);
                    return (
                      <div key={item.label} style={{ border: '1px solid #e2e8f0', borderRadius: '12px', padding: '0.8rem 0.9rem', backgroundColor: '#fff' }}>
                        <div style={{ color: '#64748b', fontSize: '0.8rem', fontWeight: 700 }}>{item.label}</div>
                        <div style={{ marginTop: '0.35rem', color: '#0f172a', fontWeight: 800, fontSize: '1rem' }}>
                          {item.format(item.value.current)}
                        </div>
                        <div style={{ marginTop: '0.25rem', color: '#64748b', fontSize: '0.82rem' }}>
                          Previous: {item.format(item.value.previous)}
                        </div>
                        <span style={{ marginTop: '0.45rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0.25rem 0.5rem', borderRadius: '999px', backgroundColor: tone.bg, color: tone.color, fontSize: '0.78rem', fontWeight: 800 }}>
                          <i className={`fas ${tone.icon}`}></i>
                          {item.value.percent.toFixed(1)}% • {item.value.absolute >= 0 ? '+' : ''}{item.format(item.value.absolute)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem' }}>
                {[
                  { label: 'Total Sales', value: money(analytics.kpis.totalSales), note: 'Net sales in selected scope.' },
                  { label: 'Invoice Count', value: intFmt(analytics.kpis.invoiceCount), note: 'Invoices in selected period.' },
                  { label: 'Avg Basket Value', value: money(analytics.kpis.averageBasketValue), note: 'Average order/invoice value.' },
                  { label: 'Tracked Top Products', value: intFmt(analytics.kpis.topProductsCount), note: 'Products ranked by sales.' },
                ].map((kpi) => (
                  <div key={kpi.label} style={{ ...cardStyle, padding: '0.9rem 1rem' }}>
                    <div style={{ color: '#64748b', fontSize: '0.78rem', fontWeight: 700 }}>{kpi.label}</div>
                    <div style={{ marginTop: '0.32rem', color: '#0f172a', fontWeight: 900, fontSize: '1.2rem' }}>{kpi.value}</div>
                    <div style={{ marginTop: '0.26rem', color: '#64748b', fontSize: '0.8rem' }}>{kpi.note}</div>
                  </div>
                ))}
              </div>

              <div style={{ ...cardStyle, padding: '0.95rem 1rem' }}>
                <strong style={{ color: '#0f172a' }}>Quick Health Summary</strong>
                <p style={{ margin: '0.32rem 0 0.7rem', color: '#64748b', fontSize: '0.84rem' }}>
                  Compact snapshot of growth and current period performance.
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.6rem' }}>
                  <div style={{ border: '1px solid #e2e8f0', borderRadius: '10px', padding: '0.55rem 0.65rem' }}>
                    <div style={{ color: '#64748b', fontSize: '0.75rem', fontWeight: 700 }}>Period Sales Change</div>
                    <div style={{ color: '#0f172a', fontSize: '0.92rem', fontWeight: 800, marginTop: '0.15rem' }}>
                      {analytics.growth.selected.sales.percent.toFixed(1)}% ({money(analytics.growth.selected.sales.absolute)})
                    </div>
                  </div>
                  <div style={{ border: '1px solid #e2e8f0', borderRadius: '10px', padding: '0.55rem 0.65rem' }}>
                    <div style={{ color: '#64748b', fontSize: '0.75rem', fontWeight: 700 }}>Period Invoice Change</div>
                    <div style={{ color: '#0f172a', fontSize: '0.92rem', fontWeight: 800, marginTop: '0.15rem' }}>
                      {analytics.growth.selected.invoices.percent.toFixed(1)}% ({intFmt(analytics.growth.selected.invoices.absolute)})
                    </div>
                  </div>
                  <div style={{ border: '1px solid #e2e8f0', borderRadius: '10px', padding: '0.55rem 0.65rem' }}>
                    <div style={{ color: '#64748b', fontSize: '0.75rem', fontWeight: 700 }}>Month vs Previous</div>
                    <div style={{ color: '#0f172a', fontSize: '0.92rem', fontWeight: 800, marginTop: '0.15rem' }}>
                      {analytics.growth.monthVsPrevious.percent.toFixed(1)}% ({money(analytics.growth.monthVsPrevious.absolute)})
                    </div>
                  </div>
                  <div style={{ border: '1px solid #e2e8f0', borderRadius: '10px', padding: '0.55rem 0.65rem' }}>
                    <div style={{ color: '#64748b', fontSize: '0.75rem', fontWeight: 700 }}>Year vs Previous</div>
                    <div style={{ color: '#0f172a', fontSize: '0.92rem', fontWeight: 800, marginTop: '0.15rem' }}>
                      {analytics.growth.yearVsPrevious.percent.toFixed(1)}% ({money(analytics.growth.yearVsPrevious.absolute)})
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}

          {activeView === 'trends' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '0.8rem' }}>
              <div style={{ ...cardStyle, padding: '0.95rem 1rem' }}>
                <strong style={{ color: '#0f172a' }}>Daily Trend</strong>
                <p style={{ margin: '0.32rem 0 0.6rem', color: '#64748b', fontSize: '0.84rem' }}>Sales and invoice cadence over the selected period.</p>
                <div style={{ maxHeight: '260px', overflowY: 'auto', display: 'grid', gap: '0.4rem' }}>
                  {analytics.trends.daily.length === 0 ? (
                    <div style={{ color: '#94a3b8', fontSize: '0.86rem' }}>No daily trend data in this range.</div>
                  ) : analytics.trends.daily.map((row) => (
                    <div key={row.day} style={{ display: 'grid', gridTemplateColumns: '120px 1fr auto auto', alignItems: 'center', gap: '0.6rem', border: '1px solid #edf2f7', borderRadius: '10px', padding: '0.45rem 0.55rem' }}>
                      <div style={{ color: '#334155', fontWeight: 700, fontSize: '0.82rem' }}>{row.day}</div>
                      <div style={{ height: '8px', backgroundColor: '#e2e8f0', borderRadius: '99px', overflow: 'hidden' }}>
                        <div style={{ width: `${Math.min(100, analytics.kpis.totalSales > 0 ? (row.sales / analytics.kpis.totalSales) * 100 : 0)}%`, height: '100%', backgroundColor: '#2563eb' }}></div>
                      </div>
                      <div style={{ color: '#0f172a', fontSize: '0.8rem', fontWeight: 700 }}>{money(row.sales)}</div>
                      <div style={{ color: '#64748b', fontSize: '0.78rem' }}>{intFmt(row.invoices)} inv</div>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ ...cardStyle, padding: '0.95rem 1rem' }}>
                <strong style={{ color: '#0f172a' }}>Monthly + Rolling Trend (12M)</strong>
                <p style={{ margin: '0.32rem 0 0.6rem', color: '#64748b', fontSize: '0.84rem' }}>Month-on-month sales with rolling 3-month smoothing.</p>
                <div style={{ maxHeight: '260px', overflowY: 'auto', display: 'grid', gap: '0.4rem' }}>
                  {analytics.trends.monthly.length === 0 ? (
                    <div style={{ color: '#94a3b8', fontSize: '0.86rem' }}>No monthly trend data available.</div>
                  ) : analytics.trends.monthly.map((row) => (
                    <div key={row.key} style={{ display: 'grid', gridTemplateColumns: '120px auto auto auto', gap: '0.6rem', alignItems: 'center', border: '1px solid #edf2f7', borderRadius: '10px', padding: '0.45rem 0.55rem' }}>
                      <div style={{ color: '#334155', fontWeight: 700, fontSize: '0.82rem' }}>{row.label}</div>
                      <div style={{ color: '#0f172a', fontSize: '0.8rem', fontWeight: 700 }}>{money(row.sales)}</div>
                      <div style={{ color: '#64748b', fontSize: '0.78rem' }}>{intFmt(row.invoices)} inv</div>
                      <div style={{ color: '#1d4ed8', fontSize: '0.78rem', fontWeight: 700 }}>Rolling: {money(row.rolling3MonthSales)}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeView === 'trends' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '0.8rem' }}>
              <div style={{ ...cardStyle, padding: '0.95rem 1rem' }}>
                <strong style={{ color: '#0f172a' }}>Yearly Comparison</strong>
                <div style={{ marginTop: '0.6rem', display: 'grid', gap: '0.42rem' }}>
                  {analytics.trends.yearly.map((row) => (
                    <div key={row.year} style={{ display: 'grid', gridTemplateColumns: '72px 1fr auto auto', gap: '0.5rem', alignItems: 'center', border: '1px solid #edf2f7', borderRadius: '10px', padding: '0.42rem 0.52rem' }}>
                      <div style={{ color: '#334155', fontWeight: 700, fontSize: '0.82rem' }}>{row.year}</div>
                      <div style={{ height: '8px', backgroundColor: '#e2e8f0', borderRadius: '99px', overflow: 'hidden' }}>
                        <div style={{ width: `${Math.min(100, analytics.kpis.totalSales > 0 ? (row.sales / analytics.kpis.totalSales) * 100 : 0)}%`, height: '100%', backgroundColor: '#0ea5e9' }}></div>
                      </div>
                      <div style={{ color: '#0f172a', fontSize: '0.8rem', fontWeight: 700 }}>{money(row.sales)}</div>
                      <div style={{ color: '#64748b', fontSize: '0.78rem' }}>{intFmt(row.invoices)} inv</div>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ ...cardStyle, padding: '0.95rem 1rem' }}>
                <strong style={{ color: '#0f172a' }}>Quarterly Summary ({new Date().getFullYear()})</strong>
                <div style={{ marginTop: '0.6rem', display: 'grid', gap: '0.42rem' }}>
                  {analytics.trends.quarterly.map((row) => (
                    <div key={row.quarter} style={{ display: 'grid', gridTemplateColumns: '52px auto auto', gap: '0.6rem', alignItems: 'center', border: '1px solid #edf2f7', borderRadius: '10px', padding: '0.45rem 0.55rem' }}>
                      <div style={{ color: '#334155', fontWeight: 700, fontSize: '0.82rem' }}>{row.quarter}</div>
                      <div style={{ color: '#0f172a', fontSize: '0.8rem', fontWeight: 700 }}>{money(row.sales)}</div>
                      <div style={{ color: '#64748b', fontSize: '0.78rem' }}>{intFmt(row.invoices)} inv</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeView === 'rankings' && (() => {
            const thStyle = { textAlign: 'left', padding: '0.42rem 0.6rem', borderBottom: '2px solid #e2e8f0', color: '#64748b', fontSize: '0.74rem', fontWeight: 700, whiteSpace: 'nowrap' };
            const tdStyle = { padding: '0.38rem 0.6rem', borderBottom: '1px solid #f1f5f9', fontSize: '0.8rem', color: '#334155', whiteSpace: 'nowrap' };
            const tdBold = { ...tdStyle, color: '#0f172a', fontWeight: 700 };
            const tableStyle = { width: '100%', borderCollapse: 'collapse', tableLayout: 'auto' };
            const sectionHead = { color: '#0f172a', fontSize: '0.82rem', fontWeight: 800, marginBottom: '0.4rem' };
            const emptyStyle = { color: '#94a3b8', fontSize: '0.82rem', padding: '0.4rem 0' };

            return (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '0.8rem' }}>
                {/* Top Products */}
                <div style={{ ...cardStyle, padding: '0.85rem 0.95rem' }}>
                  <div style={sectionHead}>Top Products</div>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={tableStyle}>
                      <thead>
                        <tr>
                          <th style={thStyle}>#</th>
                          <th style={{ ...thStyle, width: '100%' }}>Product</th>
                          <th style={thStyle}>Qty</th>
                          <th style={thStyle}>Sales</th>
                          <th style={thStyle}>Share</th>
                        </tr>
                      </thead>
                      <tbody>
                        {analytics.rankings.topProducts.length === 0 ? (
                          <tr><td colSpan={5} style={emptyStyle}>No data.</td></tr>
                        ) : analytics.rankings.topProducts.map((row, i) => (
                          <tr key={`${row.productCode}-${i}`}>
                            <td style={{ ...tdStyle, color: '#94a3b8' }}>{i + 1}</td>
                            <td style={tdBold}>
                              {row.productName}
                              <span style={{ display: 'block', color: '#94a3b8', fontSize: '0.72rem', fontWeight: 400 }}>{row.productCode}</span>
                            </td>
                            <td style={tdStyle}>{intFmt(row.totalQuantity)}</td>
                            <td style={tdBold}>{money(row.totalSales)}</td>
                            <td style={{ ...tdStyle, color: '#2563eb', fontWeight: 700 }}>{row.contributionShare.toFixed(1)}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Top Categories */}
                <div style={{ ...cardStyle, padding: '0.85rem 0.95rem' }}>
                  <div style={sectionHead}>Top Categories</div>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={tableStyle}>
                      <thead>
                        <tr>
                          <th style={thStyle}>#</th>
                          <th style={{ ...thStyle, width: '100%' }}>Category</th>
                          <th style={thStyle}>Qty</th>
                          <th style={thStyle}>Sales</th>
                          <th style={thStyle}>Share</th>
                        </tr>
                      </thead>
                      <tbody>
                        {analytics.rankings.topCategories.length === 0 ? (
                          <tr><td colSpan={5} style={emptyStyle}>No data.</td></tr>
                        ) : analytics.rankings.topCategories.map((row, i) => (
                          <tr key={`${row.category}-${i}`}>
                            <td style={{ ...tdStyle, color: '#94a3b8' }}>{i + 1}</td>
                            <td style={tdBold}>{row.category}</td>
                            <td style={tdStyle}>{intFmt(row.quantity)}</td>
                            <td style={tdBold}>{money(row.sales)}</td>
                            <td style={{ ...tdStyle, color: '#2563eb', fontWeight: 700 }}>{row.contributionShare.toFixed(1)}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Cashiers */}
                <div style={{ ...cardStyle, padding: '0.85rem 0.95rem' }}>
                  <div style={sectionHead}>Cashier Performance</div>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={tableStyle}>
                      <thead>
                        <tr>
                          <th style={{ ...thStyle, width: '100%' }}>User</th>
                          <th style={thStyle}>Inv</th>
                          <th style={thStyle}>Sales</th>
                          <th style={thStyle}>Avg</th>
                        </tr>
                      </thead>
                      <tbody>
                        {analytics.rankings.topUsers.length === 0 ? (
                          <tr><td colSpan={4} style={emptyStyle}>No data.</td></tr>
                        ) : analytics.rankings.topUsers.map((row, i) => (
                          <tr key={`${row.userName}-${i}`}>
                            <td style={tdBold}>{row.userName}</td>
                            <td style={tdStyle}>{intFmt(row.totalInvoices)}</td>
                            <td style={tdBold}>{money(row.totalSales)}</td>
                            <td style={tdStyle}>{money(row.averageInvoiceValue)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Branch Performance */}
                <div style={{ ...cardStyle, padding: '0.85rem 0.95rem' }}>
                  <div style={sectionHead}>Branch Performance</div>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={tableStyle}>
                      <thead>
                        <tr>
                          <th style={thStyle}>Branch</th>
                          <th style={thStyle}>Inv</th>
                          <th style={thStyle}>Sales</th>
                          <th style={thStyle}>Avg Basket</th>
                          <th style={thStyle}>Share</th>
                        </tr>
                      </thead>
                      <tbody>
                        {analytics.rankings.branchPerformance.length === 0 ? (
                          <tr><td colSpan={5} style={emptyStyle}>No branch data in this period.</td></tr>
                        ) : analytics.rankings.branchPerformance.map((row, i) => (
                          <tr key={`${row.code}-${i}`}>
                            <td style={tdBold}>{row.code}</td>
                            <td style={tdStyle}>{intFmt(row.invoices)}</td>
                            <td style={tdBold}>{money(row.sales)}</td>
                            <td style={tdStyle}>{money(row.averageBasket)}</td>
                            <td style={{ ...tdStyle, color: '#2563eb', fontWeight: 700 }}>{row.contributionShare.toFixed(1)}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            );
          })()}

          {activeView === 'analysis' && (() => {
            const status = analysisResult ? analysisStatusStyle(analysisResult.status) : null;

            return (
              <div style={{ display: 'grid', gap: '0.85rem' }}>
                <div style={{ ...cardStyle, padding: '0.95rem 1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.7rem', flexWrap: 'wrap' }}>
                    <div>
                      <strong style={{ color: '#0f172a' }}>Analytics Action Center</strong>
                      <p style={{ margin: '0.28rem 0 0', color: '#64748b', fontSize: '0.84rem' }}>
                        Run practical business calculators, comparison analysis, and scenario forecasting using manual or live system values.
                      </p>
                    </div>
                    <div style={{ color: '#64748b', fontSize: '0.8rem', fontWeight: 700 }}>
                      Scope: {analytics.scopeLabel}
                    </div>
                  </div>

                  <div style={{ marginTop: '0.75rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '0.55rem' }}>
                    {ANALYSIS_TOOLS.map((tool) => {
                      const isActive = activeTool === tool.id;
                      return (
                        <button
                          key={tool.id}
                          type="button"
                          onClick={() => openToolModal(tool.id)}
                          style={{
                            textAlign: 'left',
                            border: isActive ? '1px solid #1d4ed8' : '1px solid #cbd5e1',
                            backgroundColor: isActive ? '#dbeafe' : '#fff',
                            borderRadius: '12px',
                            padding: '0.62rem 0.7rem',
                            cursor: 'pointer',
                          }}
                        >
                          <div style={{ color: isActive ? '#1d4ed8' : '#0f172a', fontWeight: 800, fontSize: '0.82rem' }}>{tool.title}</div>
                          <div style={{ marginTop: '0.2rem', color: '#64748b', fontSize: '0.76rem', lineHeight: 1.35 }}>{tool.description}</div>
                          <div style={{ marginTop: '0.32rem', color: '#2563eb', fontSize: '0.74rem', fontWeight: 800 }}>Open calculator</div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div style={{ ...cardStyle, padding: '0.8rem 0.95rem', borderStyle: 'dashed' }}>
                  <div style={{ color: '#334155', fontSize: '0.82rem', fontWeight: 700 }}>Click any calculator card to open a dedicated modal workspace.</div>
                  <div style={{ color: '#64748b', fontSize: '0.78rem', marginTop: '0.2rem' }}>
                    The modal includes calculator inputs and results side by side for focused analysis.
                  </div>
                </div>

                {isToolModalOpen && (
                  <div
                    role="dialog"
                    aria-modal="true"
                    onClick={() => setIsToolModalOpen(false)}
                    style={{
                      position: 'fixed',
                      inset: 0,
                      backgroundColor: 'rgba(15, 23, 42, 0.58)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '1rem',
                      zIndex: 1400,
                    }}
                  >
                    <div
                      onClick={(event) => event.stopPropagation()}
                      style={{
                        width: 'min(1240px, 98vw)',
                        maxHeight: '92vh',
                        overflowY: 'auto',
                        background: 'linear-gradient(145deg, #f8fafc 0%, #eef4ff 52%, #f8fafc 100%)',
                        border: '1px solid #bfdbfe',
                        borderRadius: '20px',
                        boxShadow: '0 30px 60px rgba(15, 23, 42, 0.35)',
                        padding: '1rem',
                        display: 'grid',
                        gap: '0.78rem',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.7rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                        <div>
                          <strong style={{ color: '#0f172a' }}>{activeToolConfig.title}</strong>
                          <p style={{ margin: '0.26rem 0 0', color: '#64748b', fontSize: '0.82rem' }}>{activeToolConfig.description}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setIsToolModalOpen(false)}
                          style={{ border: '1px solid #cbd5e1', backgroundColor: '#fff', borderRadius: '9px', color: '#334155', padding: '0.42rem 0.7rem', fontWeight: 800, cursor: 'pointer' }}
                        >
                          <i className="fas fa-xmark" style={{ marginRight: '0.35rem' }}></i>
                          Close
                        </button>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '0.8rem' }}>
                        <div style={{ ...cardStyle, padding: '0.95rem 1rem', background: 'linear-gradient(180deg, #ffffff 0%, #f8fbff 100%)', borderColor: '#bfdbfe' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                            <strong style={{ color: '#0f172a' }}>Calculator Panel</strong>
                            <span style={{ color: '#64748b', fontSize: '0.78rem', fontWeight: 700 }}>Manual + System Assisted</span>
                          </div>

                          <div style={{ marginTop: '0.62rem', display: 'flex', flexWrap: 'wrap', gap: '0.42rem', marginBottom: '0.75rem' }}>
                            <button type="button" onClick={() => applyAnalysisPreset('selected-vs-previous')} style={{ border: '1px solid #bfdbfe', backgroundColor: '#eff6ff', borderRadius: '999px', padding: '0.34rem 0.6rem', fontSize: '0.74rem', fontWeight: 800, color: '#1e3a8a', cursor: 'pointer' }}>Use Selected vs Previous</button>
                            <button type="button" onClick={() => applyAnalysisPreset('month-vs-previous')} style={{ border: '1px solid #bfdbfe', backgroundColor: '#eff6ff', borderRadius: '999px', padding: '0.34rem 0.6rem', fontSize: '0.74rem', fontWeight: 800, color: '#1e3a8a', cursor: 'pointer' }}>Use Month vs Previous</button>
                            <button type="button" onClick={() => applyAnalysisPreset('year-vs-previous')} style={{ border: '1px solid #bfdbfe', backgroundColor: '#eff6ff', borderRadius: '999px', padding: '0.34rem 0.6rem', fontSize: '0.74rem', fontWeight: 800, color: '#1e3a8a', cursor: 'pointer' }}>Use Year vs Previous</button>
                            <button type="button" onClick={() => applyAnalysisPreset('kpi-base')} style={{ border: '1px solid #bfdbfe', backgroundColor: '#eff6ff', borderRadius: '999px', padding: '0.34rem 0.6rem', fontSize: '0.74rem', fontWeight: 800, color: '#1e3a8a', cursor: 'pointer' }}>Use KPI Snapshot</button>
                            <button type="button" onClick={() => applyAnalysisPreset('branch-compare')} style={{ border: '1px solid #bfdbfe', backgroundColor: '#eff6ff', borderRadius: '999px', padding: '0.34rem 0.6rem', fontSize: '0.74rem', fontWeight: 800, color: '#1e3a8a', cursor: 'pointer' }}>Use BT vs ZA Sales</button>
                          </div>

                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.6rem' }}>
                            {activeToolConfig.fields.map((fieldKey) => {
                              const fieldDef = ANALYSIS_FIELDS[fieldKey] || { label: fieldKey, step: '0.01' };
                              return (
                                <label key={fieldKey} style={{ display: 'grid', gap: '0.28rem', border: '1px solid #dbeafe', borderRadius: '12px', padding: '0.45rem 0.5rem', backgroundColor: '#f8fbff', minWidth: 0, overflow: 'hidden' }}>
                                  <span style={{ color: '#475569', fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.03em' }}>{fieldDef.label}</span>
                                  <input
                                    type="number"
                                    step={fieldDef.step}
                                    value={analysisInputs[fieldKey]}
                                    onChange={(event) => updateAnalysisInput(fieldKey, event.target.value)}
                                    style={{ width: '100%', maxWidth: '100%', minWidth: 0, boxSizing: 'border-box', border: '1px solid #93c5fd', borderRadius: '10px', padding: '0.58rem 0.62rem', color: '#0f172a', backgroundColor: '#fff', fontFamily: 'Consolas, Menlo, Monaco, monospace', fontWeight: 800, fontSize: '0.95rem', boxShadow: 'inset 0 1px 3px rgba(15, 23, 42, 0.08)' }}
                                  />
                                </label>
                              );
                            })}
                          </div>

                          <div style={{ marginTop: '0.72rem', display: 'flex', gap: '0.52rem', flexWrap: 'wrap' }}>
                            <button type="button" onClick={runAnalysis} style={{ border: '1px solid #1d4ed8', background: 'linear-gradient(180deg, #2563eb 0%, #1d4ed8 100%)', color: '#fff', borderRadius: '10px', padding: '0.54rem 0.86rem', fontWeight: 900, letterSpacing: '0.02em', cursor: 'pointer', boxShadow: '0 10px 20px rgba(37, 99, 235, 0.28)' }}>
                              <i className="fas fa-play" style={{ marginRight: '0.34rem', fontSize: '0.72rem' }}></i>
                              Run Calculation
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const resetValues = { ...analysisInputs };
                                Object.keys(resetValues).forEach((key) => {
                                  resetValues[key] = key === 'projectedGrowthPct' ? 10 : 0;
                                });
                                setAnalysisInputs(resetValues);
                                setAnalysisResult(null);
                              }}
                              style={{ border: '1px solid #cbd5e1', backgroundColor: '#fff', color: '#334155', borderRadius: '10px', padding: '0.5rem 0.8rem', fontWeight: 800, cursor: 'pointer' }}
                            >
                              <i className="fas fa-rotate-left" style={{ marginRight: '0.34rem', fontSize: '0.72rem' }}></i>
                              Reset Inputs
                            </button>
                          </div>
                        </div>

                        <div style={{ ...cardStyle, padding: '0.95rem 1rem', background: 'linear-gradient(180deg, #ffffff 0%, #f0f9ff 100%)', borderColor: '#bae6fd' }}>
                          <strong style={{ color: '#0f172a' }}>Results Panel</strong>
                          {!analysisResult ? (
                            <p style={{ margin: '0.35rem 0 0', color: '#64748b', fontSize: '0.82rem' }}>
                              Run a calculator to view final result, formula basis, interpretation, and performance signal.
                            </p>
                          ) : (
                            <>
                              <div style={{ marginTop: '0.62rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.55rem', flexWrap: 'wrap' }}>
                                <span style={{ color: '#334155', fontSize: '0.8rem', fontWeight: 700 }}>{analysisResult.title}</span>
                                <span style={{ display: 'inline-flex', alignItems: 'center', borderRadius: '999px', padding: '0.24rem 0.54rem', backgroundColor: status.bg, color: status.color, fontSize: '0.74rem', fontWeight: 800 }}>
                                  {status.label}
                                </span>
                              </div>

                              <div style={{ marginTop: '0.62rem', border: '1px solid #93c5fd', borderRadius: '14px', padding: '0.82rem 0.84rem', background: 'linear-gradient(145deg, #eff6ff 0%, #dbeafe 100%)' }}>
                                <div style={{ color: '#1e3a8a', fontSize: '0.74rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{analysisResult.mainLabel}</div>
                                <div style={{ marginTop: '0.24rem', color: '#0f172a', fontWeight: 900, fontSize: '1.48rem', fontFamily: 'Consolas, Menlo, Monaco, monospace' }}>{analysisResult.mainValue}</div>
                                <div style={{ marginTop: '0.24rem', color: '#1e40af', fontSize: '0.82rem', fontWeight: 800 }}>{analysisResult.subValue}</div>
                              </div>

                              <div style={{ marginTop: '0.62rem', border: '1px solid #dbeafe', borderRadius: '10px', padding: '0.62rem 0.68rem', backgroundColor: '#ffffff' }}>
                                <div style={{ color: '#475569', fontSize: '0.74rem', fontWeight: 800 }}>Formula Used</div>
                                <div style={{ marginTop: '0.2rem', color: '#0f172a', fontSize: '0.8rem', fontWeight: 700, fontFamily: 'Consolas, Menlo, Monaco, monospace' }}>{analysisResult.formula}</div>
                                <div style={{ marginTop: '0.34rem', color: '#334155', fontSize: '0.8rem', lineHeight: 1.5 }}>{analysisResult.interpretation}</div>
                              </div>

                              <div style={{ marginTop: '0.62rem' }}>
                                <div style={{ color: '#64748b', fontSize: '0.74rem', fontWeight: 800, marginBottom: '0.28rem' }}>Values Used</div>
                                <div style={{ display: 'grid', gap: '0.3rem' }}>
                                  {analysisResult.usedValues.map((row) => (
                                    <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', gap: '0.52rem', border: '1px solid #e2e8f0', borderRadius: '9px', padding: '0.36rem 0.5rem', backgroundColor: '#fff' }}>
                                      <span style={{ color: '#64748b', fontSize: '0.76rem', fontWeight: 700 }}>{row.label}</span>
                                      <span style={{ color: '#0f172a', fontSize: '0.8rem', fontWeight: 900, fontFamily: 'Consolas, Menlo, Monaco, monospace' }}>{row.value}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
        </>
      )}

      {loading && (
        <div style={{ ...cardStyle, padding: '1rem 1.1rem', color: isAdminDarkTheme ? '#b2c3d9' : '#64748b' }}>
          <i className="fas fa-spinner fa-spin" style={{ marginRight: '0.45rem' }}></i>
          Loading business analytics...
        </div>
      )}
    </div>
  );
};

export default BusinessAnalyticsTab;