import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import api from '../../utils/api.js';
import { notifyError, notifySuccess } from '../../utils/notifications.js';

const TAB_DEFS = [
  { id: 'overview', label: 'Overview', icon: 'fa-chart-pie' },
  { id: 'sales', label: 'Sales Log', icon: 'fa-receipt' },
  { id: 'products', label: 'By Product', icon: 'fa-box-open' },
  { id: 'cashiers', label: 'By Cashier', icon: 'fa-user-tie' },
];

const STATUS_LABELS = {
  pending_pos_sync: 'Pending POS Sync',
  synced_to_pos: 'Synced to POS',
  sync_failed: 'Sync Failed',
};

function toMoney(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Number(parsed.toFixed(2));
}

function formatMoney(value) {
  return toMoney(value).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatDateTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString();
}

function formatDateInput(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function toCsv(rows) {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          const text = String(cell ?? '');
          if (text.includes(',') || text.includes('"') || text.includes('\n')) {
            return `"${text.replace(/"/g, '""')}"`;
          }
          return text;
        })
        .join(',')
    )
    .join('\n');
}

function downloadCsv(filename, rows) {
  const csvBody = toCsv(rows);
  const blob = new Blob([`\uFEFF${csvBody}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function statusColor(status) {
  if (status === 'synced_to_pos') return '#2e7d32';
  if (status === 'sync_failed') return '#c62828';
  return '#b06c00';
}

const AdminEmergencySalesReports = ({ selectedLocationCode = 'BT' }) => {
  const [activeTab, setActiveTab] = useState('overview');
  const [loading, setLoading] = useState(false);
  const [retryingSaleId, setRetryingSaleId] = useState(null);
  const [sales, setSales] = useState([]);
  const [summary, setSummary] = useState({
    pending_pos_sync: 0,
    synced_to_pos: 0,
    sync_failed: 0,
  });

  const [filters, setFilters] = useState({
    startDate: '',
    endDate: '',
    product: '',
    cashier: '',
    status: 'all',
  });

  const [pendingFilters, setPendingFilters] = useState(filters);

  const [filterBarLayout, setFilterBarLayout] = useState({ left: 0, width: 0, top: 0 });
  const [filterBarHeight, setFilterBarHeight] = useState(0);
  const filterBarRef = useRef(null);
  const isAdminDarkTheme = typeof document !== 'undefined' && document.body.classList.contains('admin-theme-dark');
  const textPrimary = isAdminDarkTheme ? '#f8fafc' : '#0f172a';
  const textSecondary = isAdminDarkTheme ? '#cbd5e1' : '#475569';
  const textMuted = isAdminDarkTheme ? '#94a3b8' : '#64748b';

  const fetchReportSales = useCallback(async (nextFilters) => {
    setLoading(true);
    try {
      const response = await api.get('/admin/emergency-sales', {
        params: {
          reportMode: 'all',
          status: nextFilters.status || 'all',
          startDate: nextFilters.startDate || undefined,
          endDate: nextFilters.endDate || undefined,
          product: nextFilters.product || undefined,
          cashier: nextFilters.cashier || undefined,
          ...(selectedLocationCode && { locationCode: selectedLocationCode }),
        },
      });

      setSales(Array.isArray(response.data?.sales) ? response.data.sales : []);
      setSummary(
        response.data?.summary || {
          pending_pos_sync: 0,
          synced_to_pos: 0,
          sync_failed: 0,
        }
      );
    } catch (error) {
      notifyError(`Failed to load emergency sales reports: ${error.response?.data?.error || error.message}`, 3000);
    } finally {
      setLoading(false);
    }
  }, [selectedLocationCode]);

  useEffect(() => {
    fetchReportSales(filters);
  }, [fetchReportSales, filters]);

  useEffect(() => {
    let resizeObserver;

    const updateFilterBarLayout = () => {
      const contentArea = document.querySelector('.admin-content-area');
      if (!contentArea) return;

      const rect = contentArea.getBoundingClientRect();
      const mobileTopOffset = 56;

      setFilterBarLayout({
        left: rect.left,
        width: rect.width,
        top: window.innerWidth <= 768 ? mobileTopOffset : 0,
      });

      if (filterBarRef.current) {
        setFilterBarHeight(filterBarRef.current.offsetHeight);
      }
    };

    updateFilterBarLayout();
    window.addEventListener('resize', updateFilterBarLayout);

    const contentArea = document.querySelector('.admin-content-area');
    if (contentArea && typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(updateFilterBarLayout);
      resizeObserver.observe(contentArea);
    }

    return () => {
      window.removeEventListener('resize', updateFilterBarLayout);
      if (resizeObserver) resizeObserver.disconnect();
    };
  }, []);

  useEffect(() => {
    if (filterBarRef.current) {
      setFilterBarHeight(filterBarRef.current.offsetHeight);
    }
  });

  const appliedFiltersText = useMemo(() => {
    const parts = [];
    if (filters.startDate || filters.endDate) {
      parts.push(`Date: ${filters.startDate || 'Any'} to ${filters.endDate || 'Any'}`);
    }
    if (filters.product) parts.push(`Product: ${filters.product}`);
    if (filters.cashier) parts.push(`Cashier: ${filters.cashier}`);
    if (filters.status && filters.status !== 'all') parts.push(`Status: ${STATUS_LABELS[filters.status] || filters.status}`);
    return parts.length > 0 ? parts.join(' | ') : 'No filter applied';
  }, [filters]);

  const totals = useMemo(() => {
    const grossTotal = sales.reduce((sum, sale) => sum + toMoney(sale.total), 0);
    const itemCount = sales.reduce((sum, sale) => {
      const items = Array.isArray(sale.items) ? sale.items : [];
      return sum + items.reduce((itemSum, item) => itemSum + Number(item.qty || 0), 0);
    }, 0);

    return {
      salesCount: sales.length,
      grossTotal,
      avgSale: sales.length > 0 ? toMoney(grossTotal / sales.length) : 0,
      itemCount,
    };
  }, [sales]);

  const productStats = useMemo(() => {
    const map = new Map();

    for (const sale of sales) {
      const saleItems = Array.isArray(sale.items) ? sale.items : [];
      for (const item of saleItems) {
        const name = String(item.productName || item.product_name || 'Unknown Product').trim() || 'Unknown Product';
        const code = String(item.productCode || item.product_code || '-').trim() || '-';
        const key = `${code}::${name}`;

        if (!map.has(key)) {
          map.set(key, {
            productCode: code,
            productName: name,
            qty: 0,
            revenue: 0,
            salesCount: 0,
          });
        }

        const row = map.get(key);
        row.qty += Number(item.qty || 0);
        row.revenue += toMoney(item.lineTotal ?? item.line_total ?? 0);
        row.salesCount += 1;
      }
    }

    return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue);
  }, [sales]);

  const cashierStats = useMemo(() => {
    const map = new Map();

    for (const sale of sales) {
      const key = String(sale.cashier_name || sale.cashierName || 'Unknown').trim() || 'Unknown';

      if (!map.has(key)) {
        map.set(key, {
          cashier: key,
          salesCount: 0,
          total: 0,
          pending: 0,
          synced: 0,
          failed: 0,
        });
      }

      const row = map.get(key);
      row.salesCount += 1;
      row.total += toMoney(sale.total);
      if (sale.sync_status === 'pending_pos_sync') row.pending += 1;
      if (sale.sync_status === 'synced_to_pos') row.synced += 1;
      if (sale.sync_status === 'sync_failed') row.failed += 1;
    }

    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [sales]);

  const reportFilterSpacerHeight = Math.max(Math.min(filterBarHeight, 150) - 8, 0);

  const salesTotalsRow = useMemo(() => {
    return {
      items: sales.reduce((sum, sale) => sum + (Array.isArray(sale.items) ? sale.items.length : 0), 0),
      total: toMoney(sales.reduce((sum, sale) => sum + toMoney(sale.total), 0)),
    };
  }, [sales]);

  const productTotalsRow = useMemo(() => {
    return {
      qty: productStats.reduce((sum, row) => sum + Number(row.qty || 0), 0),
      revenue: toMoney(productStats.reduce((sum, row) => sum + toMoney(row.revenue), 0)),
      saleLines: productStats.reduce((sum, row) => sum + Number(row.salesCount || 0), 0),
    };
  }, [productStats]);

  const cashierTotalsRow = useMemo(() => {
    return {
      salesCount: cashierStats.reduce((sum, row) => sum + Number(row.salesCount || 0), 0),
      total: toMoney(cashierStats.reduce((sum, row) => sum + toMoney(row.total), 0)),
      pending: cashierStats.reduce((sum, row) => sum + Number(row.pending || 0), 0),
      synced: cashierStats.reduce((sum, row) => sum + Number(row.synced || 0), 0),
      failed: cashierStats.reduce((sum, row) => sum + Number(row.failed || 0), 0),
    };
  }, [cashierStats]);

  const handleApplyFilters = () => {
    setFilters(pendingFilters);
  };

  const handleResetFilters = () => {
    const reset = {
      startDate: '',
      endDate: '',
      product: '',
      cashier: '',
      status: 'all',
    };
    setPendingFilters(reset);
    setFilters(reset);
  };

  const applyPreset = (preset) => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    let next = {
      ...pendingFilters,
      startDate: '',
      endDate: '',
    };

    if (preset === 'today') {
      const date = formatDateInput(today);
      next = { ...next, startDate: date, endDate: date };
    }

    if (preset === 'last7') {
      const start = new Date(today);
      start.setDate(start.getDate() - 6);
      next = { ...next, startDate: formatDateInput(start), endDate: formatDateInput(today) };
    }

    if (preset === 'last30') {
      const start = new Date(today);
      start.setDate(start.getDate() - 29);
      next = { ...next, startDate: formatDateInput(start), endDate: formatDateInput(today) };
    }

    if (preset === 'thisMonth') {
      const start = new Date(today.getFullYear(), today.getMonth(), 1);
      next = { ...next, startDate: formatDateInput(start), endDate: formatDateInput(today) };
    }

    if (preset === 'lastMonth') {
      const start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const end = new Date(today.getFullYear(), today.getMonth(), 0);
      next = { ...next, startDate: formatDateInput(start), endDate: formatDateInput(end) };
    }

    setPendingFilters(next);
    setFilters(next);
  };

  const handleDownloadSalesCsv = () => {
    const rows = [
      ['Sale Ref', 'Date', 'Cashier', 'Items', 'Subtotal', 'Discount', 'Total', 'Payment', 'Sync Status'],
      ...sales.map((sale) => [
        sale.sale_ref || sale.saleRef || '-',
        formatDateTime(sale.created_at || sale.createdAt),
        sale.cashier_name || sale.cashierName || '-',
        Array.isArray(sale.items) ? sale.items.length : 0,
        toMoney(sale.subtotal),
        toMoney(sale.discount),
        toMoney(sale.total),
        sale.payment_method || sale.paymentMethod || '-',
        STATUS_LABELS[sale.sync_status] || sale.sync_status || '-',
      ]),
      ['TOTAL', '', '', salesTotalsRow.items, '', '', salesTotalsRow.total, '', ''],
    ];

    downloadCsv(`emergency-sales-log-${Date.now()}.csv`, rows);
    notifySuccess('Sales log CSV downloaded', 2000);
  };

  const handleDownloadProductCsv = () => {
    const rows = [
      ['Product Code', 'Product Name', 'Qty Sold', 'Revenue', 'Sale Lines'],
      ...productStats.map((item) => [item.productCode, item.productName, item.qty, toMoney(item.revenue), item.salesCount]),
      ['TOTAL', '', productTotalsRow.qty, productTotalsRow.revenue, productTotalsRow.saleLines],
    ];

    downloadCsv(`emergency-sales-by-product-${Date.now()}.csv`, rows);
    notifySuccess('Product report CSV downloaded', 2000);
  };

  const handleDownloadCashierCsv = () => {
    const rows = [
      ['Cashier', 'Sales Count', 'Total Value', 'Pending', 'Synced', 'Failed'],
      ...cashierStats.map((cashier) => [
        cashier.cashier,
        cashier.salesCount,
        toMoney(cashier.total),
        cashier.pending,
        cashier.synced,
        cashier.failed,
      ]),
      ['TOTAL', cashierTotalsRow.salesCount, cashierTotalsRow.total, cashierTotalsRow.pending, cashierTotalsRow.synced, cashierTotalsRow.failed],
    ];

    downloadCsv(`emergency-sales-by-cashier-${Date.now()}.csv`, rows);
    notifySuccess('Cashier report CSV downloaded', 2000);
  };

  const addPdfHeader = (doc, title) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.text('Citi-Nati Supermarket', 14, 14);
    doc.setFontSize(12);
    doc.text(title, 14, 21);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 27);
    doc.text(appliedFiltersText, 14, 33);
  };

  const handleDownloadSalesPdf = () => {
    const doc = new jsPDF({ orientation: 'landscape' });
    addPdfHeader(doc, 'Emergency Sales Log Report');

    autoTable(doc, {
      startY: 38,
      head: [['Sale Ref', 'Date', 'Cashier', 'Items', 'Subtotal', 'Discount', 'Total', 'Payment', 'Sync Status']],
      body: sales.map((sale) => [
        sale.sale_ref || sale.saleRef || '-',
        formatDateTime(sale.created_at || sale.createdAt),
        sale.cashier_name || sale.cashierName || '-',
        Array.isArray(sale.items) ? sale.items.length : 0,
        formatMoney(sale.subtotal),
        formatMoney(sale.discount),
        formatMoney(sale.total),
        sale.payment_method || sale.paymentMethod || '-',
        STATUS_LABELS[sale.sync_status] || sale.sync_status || '-',
      ]),
      foot: [['TOTAL', '', '', salesTotalsRow.items, '', '', formatMoney(salesTotalsRow.total), '', '']],
      showFoot: 'lastPage',
      theme: 'grid',
      styles: { fontSize: 8 },
      headStyles: { fillColor: [29, 78, 216] },
      footStyles: { fillColor: [219, 234, 254], textColor: [15, 23, 42], fontStyle: 'bold' },
    });

    doc.save(`emergency-sales-log-${Date.now()}.pdf`);
    notifySuccess('Sales log PDF downloaded', 2000);
  };

  const handleDownloadProductPdf = () => {
    const doc = new jsPDF({ orientation: 'landscape' });
    addPdfHeader(doc, 'Emergency Sales by Product Report');

    autoTable(doc, {
      startY: 38,
      head: [['Product Code', 'Product Name', 'Qty Sold', 'Revenue', 'Sale Lines']],
      body: productStats.map((item) => [
        item.productCode,
        item.productName,
        item.qty,
        formatMoney(item.revenue),
        item.salesCount,
      ]),
      foot: [['TOTAL', '', productTotalsRow.qty, formatMoney(productTotalsRow.revenue), productTotalsRow.saleLines]],
      showFoot: 'lastPage',
      theme: 'grid',
      styles: { fontSize: 8 },
      headStyles: { fillColor: [15, 118, 110] },
      footStyles: { fillColor: [204, 251, 241], textColor: [15, 23, 42], fontStyle: 'bold' },
    });

    doc.save(`emergency-sales-by-product-${Date.now()}.pdf`);
    notifySuccess('Product report PDF downloaded', 2000);
  };

  const handleDownloadCashierPdf = () => {
    const doc = new jsPDF({ orientation: 'landscape' });
    addPdfHeader(doc, 'Emergency Sales by Cashier Report');

    autoTable(doc, {
      startY: 38,
      head: [['Cashier', 'Sales Count', 'Total Value', 'Pending', 'Synced', 'Failed']],
      body: cashierStats.map((cashier) => [
        cashier.cashier,
        cashier.salesCount,
        formatMoney(cashier.total),
        cashier.pending,
        cashier.synced,
        cashier.failed,
      ]),
      foot: [['TOTAL', cashierTotalsRow.salesCount, formatMoney(cashierTotalsRow.total), cashierTotalsRow.pending, cashierTotalsRow.synced, cashierTotalsRow.failed]],
      showFoot: 'lastPage',
      theme: 'grid',
      styles: { fontSize: 8 },
      headStyles: { fillColor: [124, 58, 237] },
      footStyles: { fillColor: [233, 213, 255], textColor: [15, 23, 42], fontStyle: 'bold' },
    });

    doc.save(`emergency-sales-by-cashier-${Date.now()}.pdf`);
    notifySuccess('Cashier report PDF downloaded', 2000);
  };

  const handleRetrySync = async (sale) => {
    const saleRef = sale?.sale_ref || sale?.saleRef || '#unknown';
    if (!sale?.id) return;

    try {
      setRetryingSaleId(sale.id);
      await api.post(`/admin/emergency-sales/${sale.id}/retry-sync`);
      notifySuccess(`Retry queued for ${saleRef}`, 2500);
      await fetchReportSales(filters);
    } catch (error) {
      notifyError(`Retry failed: ${error.response?.data?.error || error.message}`, 3000);
    } finally {
      setRetryingSaleId(null);
    }
  };

  return (
    <div style={{ position: 'relative' }}>
      <div
        ref={filterBarRef}
        className="admin-filter-bar-fixed"
        style={{
          position: 'fixed',
          top: `${filterBarLayout.top}px`,
          left: `${filterBarLayout.left}px`,
          width: `${filterBarLayout.width}px`,
          zIndex: 82,
          backgroundColor: '#ffffff',
          border: '1px solid #e5e7eb',
          borderRadius: '8px',
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)',
          boxSizing: 'border-box',
          overflow: 'hidden',
        }}
      >
        <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid #f1f5f9', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {TAB_DEFS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`admin-tab-button${activeTab === tab.id ? ' active' : ''}`}
              style={{
                backgroundColor: activeTab === tab.id ? '#1f3a8a' : '#fff',
                color: activeTab === tab.id ? '#fff' : textSecondary,
              }}
            >
              <i className={`fas ${tab.icon} admin-tab-icon`}></i>
              {tab.label}
            </button>
          ))}
        </div>

        <div style={{ padding: '0.75rem 1rem', display: 'flex', gap: '0.65rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            onClick={() => applyPreset('today')}
            style={{ padding: '0.45rem 0.65rem', border: '1px solid #cbd5e1', borderRadius: '999px', backgroundColor: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: '0.78rem', color: textPrimary }}
          >Today</button>
          <button
            onClick={() => applyPreset('last7')}
            style={{ padding: '0.45rem 0.65rem', border: '1px solid #cbd5e1', borderRadius: '999px', backgroundColor: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: '0.78rem', color: textPrimary }}
          >Last 7 Days</button>
          <button
            onClick={() => applyPreset('last30')}
            style={{ padding: '0.45rem 0.65rem', border: '1px solid #cbd5e1', borderRadius: '999px', backgroundColor: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: '0.78rem', color: textPrimary }}
          >Last 30 Days</button>
          <button
            onClick={() => applyPreset('thisMonth')}
            style={{ padding: '0.45rem 0.65rem', border: '1px solid #cbd5e1', borderRadius: '999px', backgroundColor: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: '0.78rem', color: textPrimary }}
          >This Month</button>
          <button
            onClick={() => applyPreset('lastMonth')}
            style={{ padding: '0.45rem 0.65rem', border: '1px solid #cbd5e1', borderRadius: '999px', backgroundColor: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: '0.78rem', color: textPrimary }}
          >Last Month</button>

          <input
            type="date"
            value={pendingFilters.startDate}
            onChange={(event) => setPendingFilters((prev) => ({ ...prev, startDate: event.target.value }))}
            style={{ padding: '0.6rem 0.7rem', border: '1px solid #d1d5db', borderRadius: '6px' }}
            title="Start date"
          />

          <input
            type="date"
            value={pendingFilters.endDate}
            onChange={(event) => setPendingFilters((prev) => ({ ...prev, endDate: event.target.value }))}
            style={{ padding: '0.6rem 0.7rem', border: '1px solid #d1d5db', borderRadius: '6px' }}
            title="End date"
          />

          <input
            type="text"
            value={pendingFilters.product}
            onChange={(event) => setPendingFilters((prev) => ({ ...prev, product: event.target.value }))}
            placeholder="Filter by product"
            style={{ padding: '0.6rem 0.7rem', border: '1px solid #d1d5db', borderRadius: '6px', minWidth: '200px' }}
          />

          <input
            type="text"
            value={pendingFilters.cashier}
            onChange={(event) => setPendingFilters((prev) => ({ ...prev, cashier: event.target.value }))}
            placeholder="Filter by cashier/user"
            style={{ padding: '0.6rem 0.7rem', border: '1px solid #d1d5db', borderRadius: '6px', minWidth: '200px' }}
          />

          <select
            value={pendingFilters.status}
            onChange={(event) => setPendingFilters((prev) => ({ ...prev, status: event.target.value }))}
            style={{ padding: '0.6rem 0.7rem', border: '1px solid #d1d5db', borderRadius: '6px' }}
          >
            <option value="all">All Statuses</option>
            <option value="pending_pos_sync">Pending POS Sync</option>
            <option value="synced_to_pos">Synced to POS</option>
            <option value="sync_failed">Sync Failed</option>
          </select>

          <button
            onClick={handleApplyFilters}
            style={{
              padding: '0.6rem 0.9rem',
              border: 'none',
              borderRadius: '6px',
              backgroundColor: '#0f766e',
              color: '#fff',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Apply Filters
          </button>

          <button
            onClick={handleResetFilters}
            style={{
              padding: '0.6rem 0.9rem',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              backgroundColor: '#fff',
              color: textSecondary,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Reset
          </button>
        </div>
      </div>

      <div style={{ height: `${reportFilterSpacerHeight}px` }}></div>

      <div style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '1rem' }}>
        <div style={{ marginBottom: '0.8rem', fontSize: '0.85rem', color: textSecondary, fontWeight: 600 }}>
          {appliedFiltersText}
        </div>

        {loading ? (
          <div style={{ padding: '2rem 0', textAlign: 'center', color: textMuted }}>Loading emergency sales reports...</div>
        ) : (
          <>
            {activeTab === 'overview' && (
              <div style={{ color: textPrimary }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '0.75rem', marginBottom: '1rem' }}>
                  <div style={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.85rem' }}>
                    <div style={{ color: textMuted, fontSize: '0.82rem' }}>Emergency Sales</div>
                    <div style={{ color: textPrimary, fontSize: '1.35rem', fontWeight: 800 }}>{totals.salesCount}</div>
                  </div>

                  <div style={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.85rem' }}>
                    <div style={{ color: textMuted, fontSize: '0.82rem' }}>Gross Total</div>
                    <div style={{ color: textPrimary, fontSize: '1.35rem', fontWeight: 800 }}>{formatMoney(totals.grossTotal)}</div>
                  </div>

                  <div style={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.85rem' }}>
                    <div style={{ color: textMuted, fontSize: '0.82rem' }}>Average Sale</div>
                    <div style={{ color: textPrimary, fontSize: '1.35rem', fontWeight: 800 }}>{formatMoney(totals.avgSale)}</div>
                  </div>

                  <div style={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.85rem' }}>
                    <div style={{ color: textMuted, fontSize: '0.82rem' }}>Items Sold</div>
                    <div style={{ color: textPrimary, fontSize: '1.35rem', fontWeight: 800 }}>{totals.itemCount}</div>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '0.75rem' }}>
                  {Object.entries(summary).map(([status, count]) => (
                    <div key={status} style={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.85rem' }}>
                      <div style={{ color: textMuted, fontSize: '0.82rem' }}>{STATUS_LABELS[status] || status}</div>
                      <div style={{ color: statusColor(status), fontSize: '1.25rem', fontWeight: 800 }}>{count}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeTab === 'sales' && (
              <div style={{ color: textPrimary }}>
                <div style={{ marginBottom: '0.7rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <button
                    onClick={handleDownloadSalesCsv}
                    style={{
                      padding: '0.55rem 0.9rem',
                      border: 'none',
                      borderRadius: '6px',
                      backgroundColor: '#1d4ed8',
                      color: '#fff',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    <i className="fas fa-download" style={{ marginRight: '0.45rem' }}></i>
                    Download Sales CSV
                  </button>

                  <button
                    onClick={handleDownloadSalesPdf}
                    style={{
                      padding: '0.55rem 0.9rem',
                      border: 'none',
                      borderRadius: '6px',
                      backgroundColor: '#0f172a',
                      color: '#fff',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    <i className="fas fa-file-pdf" style={{ marginRight: '0.45rem' }}></i>
                    Download Sales PDF
                  </button>
                </div>

                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
                    <thead>
                      <tr style={{ backgroundColor: '#eef2ff' }}>
                        <th style={{ textAlign: 'left', padding: '0.6rem', borderBottom: '1px solid #dbeafe' }}>Sale Ref</th>
                        <th style={{ textAlign: 'left', padding: '0.6rem', borderBottom: '1px solid #dbeafe' }}>Date</th>
                        <th style={{ textAlign: 'left', padding: '0.6rem', borderBottom: '1px solid #dbeafe' }}>Cashier</th>
                        <th style={{ textAlign: 'right', padding: '0.6rem', borderBottom: '1px solid #dbeafe' }}>Items</th>
                        <th style={{ textAlign: 'right', padding: '0.6rem', borderBottom: '1px solid #dbeafe' }}>Total</th>
                        <th style={{ textAlign: 'left', padding: '0.6rem', borderBottom: '1px solid #dbeafe' }}>Sync Status</th>
                        <th style={{ textAlign: 'center', padding: '0.6rem', borderBottom: '1px solid #dbeafe' }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sales.length === 0 && (
                        <tr>
                          <td colSpan={7} style={{ textAlign: 'center', padding: '1rem', color: textMuted }}>
                            No emergency sales found for these filters.
                          </td>
                        </tr>
                      )}

                      {sales.map((sale) => (
                        <tr key={sale.id}>
                          <td style={{ padding: '0.6rem', borderBottom: '1px solid #e2e8f0', fontWeight: 700 }}>
                            {sale.sale_ref || sale.saleRef || '-'}
                          </td>
                          <td style={{ padding: '0.6rem', borderBottom: '1px solid #e2e8f0' }}>{formatDateTime(sale.created_at || sale.createdAt)}</td>
                          <td style={{ padding: '0.6rem', borderBottom: '1px solid #e2e8f0' }}>{sale.cashier_name || sale.cashierName || '-'}</td>
                          <td style={{ padding: '0.6rem', borderBottom: '1px solid #e2e8f0', textAlign: 'right' }}>
                            {Array.isArray(sale.items) ? sale.items.length : 0}
                          </td>
                          <td style={{ padding: '0.6rem', borderBottom: '1px solid #e2e8f0', textAlign: 'right', fontWeight: 700 }}>
                            {formatMoney(sale.total)}
                          </td>
                          <td style={{ padding: '0.6rem', borderBottom: '1px solid #e2e8f0', color: statusColor(sale.sync_status), fontWeight: 700 }}>
                            {STATUS_LABELS[sale.sync_status] || sale.sync_status || '-'}
                          </td>
                          <td style={{ padding: '0.6rem', borderBottom: '1px solid #e2e8f0', textAlign: 'center' }}>
                            {sale.sync_status === 'sync_failed' ? (
                              <button
                                onClick={() => handleRetrySync(sale)}
                                disabled={retryingSaleId === sale.id}
                                style={{
                                  padding: '0.35rem 0.55rem',
                                  border: 'none',
                                  borderRadius: '6px',
                                  backgroundColor: '#dc2626',
                                  color: '#fff',
                                  fontWeight: 700,
                                  cursor: retryingSaleId === sale.id ? 'wait' : 'pointer',
                                  opacity: retryingSaleId === sale.id ? 0.7 : 1,
                                }}
                              >
                                {retryingSaleId === sale.id ? 'Retrying...' : 'Retry Sync'}
                              </button>
                            ) : (
                              <span style={{ color: textMuted, fontSize: '0.82rem' }}>-</span>
                            )}
                          </td>
                        </tr>
                      ))}

                      {sales.length > 0 && (
                        <tr style={{ backgroundColor: '#eff6ff' }}>
                          <td style={{ padding: '0.6rem', borderBottom: '1px solid #bfdbfe', fontWeight: 800 }}>TOTAL</td>
                          <td style={{ padding: '0.6rem', borderBottom: '1px solid #bfdbfe' }}></td>
                          <td style={{ padding: '0.6rem', borderBottom: '1px solid #bfdbfe' }}></td>
                          <td style={{ padding: '0.6rem', borderBottom: '1px solid #bfdbfe', textAlign: 'right', fontWeight: 800 }}>{salesTotalsRow.items}</td>
                          <td style={{ padding: '0.6rem', borderBottom: '1px solid #bfdbfe', textAlign: 'right', fontWeight: 800 }}>{formatMoney(salesTotalsRow.total)}</td>
                          <td style={{ padding: '0.6rem', borderBottom: '1px solid #bfdbfe' }}></td>
                          <td style={{ padding: '0.6rem', borderBottom: '1px solid #bfdbfe' }}></td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {activeTab === 'products' && (
              <div style={{ color: textPrimary }}>
                <div style={{ marginBottom: '0.7rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <button
                    onClick={handleDownloadProductCsv}
                    style={{
                      padding: '0.55rem 0.9rem',
                      border: 'none',
                      borderRadius: '6px',
                      backgroundColor: '#0f766e',
                      color: '#fff',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    <i className="fas fa-download" style={{ marginRight: '0.45rem' }}></i>
                    Download Product CSV
                  </button>

                  <button
                    onClick={handleDownloadProductPdf}
                    style={{
                      padding: '0.55rem 0.9rem',
                      border: 'none',
                      borderRadius: '6px',
                      backgroundColor: '#0f172a',
                      color: '#fff',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    <i className="fas fa-file-pdf" style={{ marginRight: '0.45rem' }}></i>
                    Download Product PDF
                  </button>
                </div>

                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
                    <thead>
                      <tr style={{ backgroundColor: '#ecfeff' }}>
                        <th style={{ textAlign: 'left', padding: '0.6rem', borderBottom: '1px solid #ccfbf1' }}>Product Code</th>
                        <th style={{ textAlign: 'left', padding: '0.6rem', borderBottom: '1px solid #ccfbf1' }}>Product Name</th>
                        <th style={{ textAlign: 'right', padding: '0.6rem', borderBottom: '1px solid #ccfbf1' }}>Qty</th>
                        <th style={{ textAlign: 'right', padding: '0.6rem', borderBottom: '1px solid #ccfbf1' }}>Revenue</th>
                      </tr>
                    </thead>
                    <tbody>
                      {productStats.length === 0 && (
                        <tr>
                          <td colSpan={4} style={{ textAlign: 'center', padding: '1rem', color: textMuted }}>
                            No product data for these filters.
                          </td>
                        </tr>
                      )}

                      {productStats.map((item) => (
                        <tr key={`${item.productCode}-${item.productName}`}>
                          <td style={{ padding: '0.6rem', borderBottom: '1px solid #e2e8f0' }}>{item.productCode}</td>
                          <td style={{ padding: '0.6rem', borderBottom: '1px solid #e2e8f0' }}>{item.productName}</td>
                          <td style={{ padding: '0.6rem', borderBottom: '1px solid #e2e8f0', textAlign: 'right' }}>{item.qty}</td>
                          <td style={{ padding: '0.6rem', borderBottom: '1px solid #e2e8f0', textAlign: 'right', fontWeight: 700 }}>
                            {formatMoney(item.revenue)}
                          </td>
                        </tr>
                      ))}

                      {productStats.length > 0 && (
                        <tr style={{ backgroundColor: '#ecfeff' }}>
                          <td style={{ padding: '0.6rem', borderBottom: '1px solid #99f6e4', fontWeight: 800 }}>TOTAL</td>
                          <td style={{ padding: '0.6rem', borderBottom: '1px solid #99f6e4' }}></td>
                          <td style={{ padding: '0.6rem', borderBottom: '1px solid #99f6e4', textAlign: 'right', fontWeight: 800 }}>{productTotalsRow.qty}</td>
                          <td style={{ padding: '0.6rem', borderBottom: '1px solid #99f6e4', textAlign: 'right', fontWeight: 800 }}>{formatMoney(productTotalsRow.revenue)}</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {activeTab === 'cashiers' && (
              <div style={{ color: textPrimary }}>
                <div style={{ marginBottom: '0.7rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <button
                    onClick={handleDownloadCashierCsv}
                    style={{
                      padding: '0.55rem 0.9rem',
                      border: 'none',
                      borderRadius: '6px',
                      backgroundColor: '#7c3aed',
                      color: '#fff',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    <i className="fas fa-download" style={{ marginRight: '0.45rem' }}></i>
                    Download Cashier CSV
                  </button>

                  <button
                    onClick={handleDownloadCashierPdf}
                    style={{
                      padding: '0.55rem 0.9rem',
                      border: 'none',
                      borderRadius: '6px',
                      backgroundColor: '#0f172a',
                      color: '#fff',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    <i className="fas fa-file-pdf" style={{ marginRight: '0.45rem' }}></i>
                    Download Cashier PDF
                  </button>
                </div>

                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
                    <thead>
                      <tr style={{ backgroundColor: '#f5f3ff' }}>
                        <th style={{ textAlign: 'left', padding: '0.6rem', borderBottom: '1px solid #e9d5ff' }}>Cashier</th>
                        <th style={{ textAlign: 'right', padding: '0.6rem', borderBottom: '1px solid #e9d5ff' }}>Sales</th>
                        <th style={{ textAlign: 'right', padding: '0.6rem', borderBottom: '1px solid #e9d5ff' }}>Total</th>
                        <th style={{ textAlign: 'right', padding: '0.6rem', borderBottom: '1px solid #e9d5ff' }}>Pending</th>
                        <th style={{ textAlign: 'right', padding: '0.6rem', borderBottom: '1px solid #e9d5ff' }}>Synced</th>
                        <th style={{ textAlign: 'right', padding: '0.6rem', borderBottom: '1px solid #e9d5ff' }}>Failed</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cashierStats.length === 0 && (
                        <tr>
                          <td colSpan={6} style={{ textAlign: 'center', padding: '1rem', color: textMuted }}>
                            No cashier data for these filters.
                          </td>
                        </tr>
                      )}

                      {cashierStats.map((row) => (
                        <tr key={row.cashier}>
                          <td style={{ padding: '0.6rem', borderBottom: '1px solid #e2e8f0', fontWeight: 700 }}>{row.cashier}</td>
                          <td style={{ padding: '0.6rem', borderBottom: '1px solid #e2e8f0', textAlign: 'right' }}>{row.salesCount}</td>
                          <td style={{ padding: '0.6rem', borderBottom: '1px solid #e2e8f0', textAlign: 'right', fontWeight: 700 }}>
                            {formatMoney(row.total)}
                          </td>
                          <td style={{ padding: '0.6rem', borderBottom: '1px solid #e2e8f0', textAlign: 'right' }}>{row.pending}</td>
                          <td style={{ padding: '0.6rem', borderBottom: '1px solid #e2e8f0', textAlign: 'right' }}>{row.synced}</td>
                          <td style={{ padding: '0.6rem', borderBottom: '1px solid #e2e8f0', textAlign: 'right' }}>{row.failed}</td>
                        </tr>
                      ))}

                      {cashierStats.length > 0 && (
                        <tr style={{ backgroundColor: '#f5f3ff' }}>
                          <td style={{ padding: '0.6rem', borderBottom: '1px solid #ddd6fe', fontWeight: 800 }}>TOTAL</td>
                          <td style={{ padding: '0.6rem', borderBottom: '1px solid #ddd6fe', textAlign: 'right', fontWeight: 800 }}>{cashierTotalsRow.salesCount}</td>
                          <td style={{ padding: '0.6rem', borderBottom: '1px solid #ddd6fe', textAlign: 'right', fontWeight: 800 }}>{formatMoney(cashierTotalsRow.total)}</td>
                          <td style={{ padding: '0.6rem', borderBottom: '1px solid #ddd6fe', textAlign: 'right', fontWeight: 800 }}>{cashierTotalsRow.pending}</td>
                          <td style={{ padding: '0.6rem', borderBottom: '1px solid #ddd6fe', textAlign: 'right', fontWeight: 800 }}>{cashierTotalsRow.synced}</td>
                          <td style={{ padding: '0.6rem', borderBottom: '1px solid #ddd6fe', textAlign: 'right', fontWeight: 800 }}>{cashierTotalsRow.failed}</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default AdminEmergencySalesReports;
