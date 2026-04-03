import html2pdf from 'html2pdf.js';
import logo from '../assets/citi-nati-logo.png.png';

const BRAND_PURPLE = '#5B4B8A';
const BRAND_GREEN = '#2D8659';

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function fmtCurrency(value) {
  return `MWK ${Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtCount(value) {
  return Number(value || 0).toLocaleString('en-US');
}

function titleCase(value) {
  return String(value || '')
    .replace(/([A-Z])/g, ' $1')
    .replace(/[_-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function toDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('en-GB');
}

function toTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleTimeString('en-GB');
}

function getPeriodText(filters = {}, resolvedDateRange = null) {
  if (resolvedDateRange?.startDate && resolvedDateRange?.endDate) {
    return `${resolvedDateRange.startDate} to ${resolvedDateRange.endDate}`;
  }

  if (filters.periodType === 'custom' && filters.startDate && filters.endDate) {
    return `${filters.startDate} to ${filters.endDate}`;
  }

  if (filters.periodType === 'day' && filters.date) return filters.date;
  if (filters.periodType === 'week' && filters.date) return `Week of ${filters.date}`;
  if (filters.periodType === 'quarter' && filters.quarter && filters.year) return `Q${filters.quarter} ${filters.year}`;
  if (filters.periodType === 'year' && filters.year) return String(filters.year);
  if (filters.month && filters.year) return `${String(filters.month).padStart(2, '0')}/${filters.year}`;

  return 'Current selection';
}

function buildBrandedHeader({ reportTitle, subText = '', metaText = '' }) {
  return `
    <div style="margin-bottom: 18px; border-bottom: 3px solid ${BRAND_GREEN}; padding-bottom: 12px;">
      <div style="display: flex; align-items: center; gap: 10px;">
        <img src="${logo}" alt="Citi-Nati logo" style="height: 46px; width: auto; object-fit: contain; flex: 0 0 auto;" />
        <div style="flex: 1;">
          <h1 style="margin: 0; font-size: 26px; font-weight: 700; line-height: 1.2;">
            <span style="color: ${BRAND_PURPLE};">Citi</span><span style="color: ${BRAND_GREEN};"> - Nati Supermarket</span>
          </h1>
          <p style="margin: 6px 0 0 0; color: #111827; font-size: 16px; font-weight: 700;">${escapeHtml(reportTitle)}</p>
          ${subText ? `<p style="margin: 3px 0 0 0; color: #475569; font-size: 12px;">${escapeHtml(subText)}</p>` : ''}
          ${metaText ? `<p style="margin: 2px 0 0 0; color: #64748b; font-size: 12px;">${escapeHtml(metaText)}</p>` : ''}
        </div>
      </div>
    </div>
  `;
}

function summarizeView(activeView, states) {
  const { summary, invoicesState, productsState, usersState, paymentsState } = states;

  if (activeView === 'summary') {
    return {
      count: Number(summary?.totalInvoices || 0),
      amount: Number(summary?.netSales || 0),
    };
  }

  if (activeView === 'invoices') {
    const rows = Array.isArray(invoicesState?.data) ? invoicesState.data : [];
    return {
      count: rows.length,
      amount: rows.reduce((sum, row) => sum + Number(row?.netSale || 0), 0),
    };
  }

  if (activeView === 'products') {
    const rows = Array.isArray(productsState?.data) ? productsState.data : [];
    return {
      count: rows.length,
      amount: rows.reduce((sum, row) => sum + Number(row?.totalSales || 0), 0),
    };
  }

  if (activeView === 'users') {
    const rows = Array.isArray(usersState?.data) ? usersState.data : [];
    return {
      count: rows.length,
      amount: rows.reduce((sum, row) => sum + Number(row?.totalSales || 0), 0),
    };
  }

  if (activeView === 'payments') {
    const rows = Array.isArray(paymentsState?.data) ? paymentsState.data : [];
    return {
      count: rows.length,
      amount: rows.reduce((sum, row) => sum + Number(row?.totalAmount || 0), 0),
    };
  }

  return { count: 0, amount: 0 };
}

function buildActiveFilterText(filters = {}, summaryMetaLine = []) {
  const ignored = new Set(['periodType', 'date', 'month', 'year', 'quarter', 'startDate', 'endDate']);
  const parts = Object.entries(filters)
    .filter(([key, value]) => !ignored.has(key) && value !== null && value !== undefined && value !== '')
    .map(([key, value]) => `${titleCase(key)}: ${value}`);

  if (Array.isArray(summaryMetaLine)) {
    summaryMetaLine.forEach((item) => {
      if (item) parts.push(String(item));
    });
  }

  return parts.length ? parts.join(' | ') : 'No additional filters';
}

function tableConfig(activeView, summary, invoicesState, productsState, usersState, paymentsState) {
  if (activeView === 'summary') {
    const rows = Number(summary?.totalInvoices || 0) > 0
      ? [
          ['Total Invoices', fmtCount(summary?.totalInvoices)],
          ['Total Items Sold', fmtCount(summary?.totalItemsSold)],
          ['Gross Sales', fmtCurrency(summary?.grossSales)],
          ['VAT Total', fmtCurrency(summary?.vatTotal)],
          ['Discount Total', fmtCurrency(summary?.discountTotal)],
          ['Net Sales', fmtCurrency(summary?.netSales)],
          ['Levy Total', fmtCurrency(summary?.levyTotal)],
          ['Average Invoice', fmtCurrency(summary?.averageInvoiceValue)],
        ]
      : [['No records were found for the selected criteria in Summary view.', '']];

    return {
      headers: ['Metric', 'Value'],
      rows,
      aligns: ['left', 'right'],
      colgroup: '<col style="width:68%;" /><col style="width:32%;" />',
    };
  }

  if (activeView === 'invoices') {
    const rows = (Array.isArray(invoicesState?.data) ? invoicesState.data : []).map((row) => [
      row?.sourceInvoiceNo || '-',
      toDate(row?.invoiceDate),
      toTime(row?.invoiceTime),
      row?.userName || '-',
      row?.locationCode || '-',
      row?.branchCode || '-',
      row?.payMethod1 || '-',
      fmtCurrency(row?.netSale),
    ]);

    return {
      headers: ['Invoice', 'Date', 'Time', 'User', 'Location', 'Branch', 'Payment', 'Net'],
      rows: rows.length ? rows : [['No invoice records were found for the selected criteria.', '', '', '', '', '', '', '']],
      aligns: ['left', 'left', 'left', 'left', 'left', 'left', 'left', 'right'],
      colgroup: '<col style="width:10%;" /><col style="width:10%;" /><col style="width:8%;" /><col style="width:14%;" /><col style="width:9%;" /><col style="width:12%;" /><col style="width:11%;" /><col style="width:26%;" />',
    };
  }

  if (activeView === 'products') {
    const rows = (Array.isArray(productsState?.data) ? productsState.data : []).map((row) => [
      row?.productCode || '-',
      row?.productName || '-',
      fmtCount(row?.totalQuantitySold),
      fmtCurrency(row?.totalSales),
      fmtCurrency(row?.totalTax),
      fmtCurrency(row?.totalDiscount),
    ]);

    return {
      headers: ['Code', 'Product', 'Quantity', 'Sales', 'Tax', 'Discount'],
      rows: rows.length ? rows : [['No product aggregates were found for the selected criteria.', '', '', '', '', '']],
      aligns: ['left', 'left', 'right', 'right', 'right', 'right'],
      colgroup: '<col style="width:12%;" /><col style="width:38%;" /><col style="width:10%;" /><col style="width:14%;" /><col style="width:13%;" /><col style="width:13%;" />',
    };
  }

  if (activeView === 'users') {
    const rows = (Array.isArray(usersState?.data) ? usersState.data : []).map((row) => [
      row?.userName || '-',
      fmtCount(row?.totalInvoices),
      fmtCurrency(row?.grossSales),
      fmtCurrency(row?.vatTotal),
      fmtCurrency(row?.totalSales),
      fmtCurrency(row?.averageInvoiceValue),
    ]);

    return {
      headers: ['User', 'Invoices', 'Gross', 'VAT', 'Net', 'Avg Invoice'],
      rows: rows.length ? rows : [['No user/cashier aggregates were found for the selected criteria.', '', '', '', '', '']],
      aligns: ['left', 'right', 'right', 'right', 'right', 'right'],
      colgroup: '<col style="width:30%;" /><col style="width:10%;" /><col style="width:15%;" /><col style="width:15%;" /><col style="width:15%;" /><col style="width:15%;" />',
    };
  }

  const paymentRows = Array.isArray(paymentsState?.data) ? paymentsState.data : [];
  const totals = paymentsState?.totals || {
    invoiceCount: paymentRows.reduce((sum, row) => sum + Number(row?.invoiceCount || 0), 0),
    totalAmount: paymentRows.reduce((sum, row) => sum + Number(row?.totalAmount || 0), 0),
  };

  const rows = paymentRows.map((row) => [
    row?.payMethod || '-',
    fmtCount(row?.invoiceCount),
    fmtCurrency(row?.totalAmount),
  ]);

  if (rows.length) {
    rows.push(['TOTAL', fmtCount(totals.invoiceCount), fmtCurrency(totals.totalAmount)]);
  }

  return {
    headers: ['Payment Method', 'Invoice Count', 'Amount'],
    rows: rows.length ? rows : [['No payment method rows were found for the selected criteria.', '', '']],
    aligns: ['left', 'right', 'right'],
    colgroup: '<col style="width:56%;" /><col style="width:14%;" /><col style="width:30%;" />',
  };
}

function renderTable(headers, rows, aligns, colgroup = '') {
  return `
    <table class="sales-pdf-table">
      ${colgroup ? `<colgroup>${colgroup}</colgroup>` : ''}
      <thead>
        <tr>
          ${headers.map((header, i) => `<th style="text-align:${aligns[i] || 'left'}">${escapeHtml(header)}</th>`).join('')}
        </tr>
      </thead>
      <tbody>
        ${rows.map((row, rowIndex) => `
          <tr style="background:${rowIndex % 2 === 0 ? '#fff' : '#f9fafb'};">
            ${row.map((cell, i) => `<td style="text-align:${aligns[i] || 'left'}">${escapeHtml(cell)}</td>`).join('')}
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

export function exportActiveSalesReportPdf({
  activeView,
  activeViewLabel,
  filters,
  resolvedDateRange,
  summaryMetaLine,
  summary,
  invoicesState,
  productsState,
  usersState,
  paymentsState,
}) {
  const today = new Date();
  const periodText = getPeriodText(filters, resolvedDateRange);
  const viewStats = summarizeView(activeView, {
    summary,
    invoicesState,
    productsState,
    usersState,
    paymentsState,
  });
  const filterText = buildActiveFilterText(filters, summaryMetaLine);
  const dataTable = tableConfig(activeView, summary, invoicesState, productsState, usersState, paymentsState);

  const html = `
    <div style="font-family: Arial, sans-serif; color: #1f2937; padding: 16px; width: 1120px; box-sizing: border-box;">
      <style>
        .sales-pdf-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 12px;
          table-layout: fixed;
          page-break-inside: auto;
        }

        .sales-pdf-table thead {
          display: table-header-group;
        }

        .sales-pdf-table tr {
          page-break-inside: avoid;
          break-inside: avoid;
        }

        .sales-pdf-table td,
        .sales-pdf-table th {
          border: 1px solid #d1d5db;
          padding: 8px;
          vertical-align: top;
          word-break: break-word;
        }

        .sales-pdf-table th {
          background: ${BRAND_GREEN};
          color: #fff;
          font-weight: 700;
        }
      </style>

      ${buildBrandedHeader({
        reportTitle: 'Sales Report Export',
        subText: `${activeViewLabel} View`,
        metaText: `Period: ${periodText} | Records: ${fmtCount(viewStats.count)} | Amount: ${fmtCurrency(viewStats.amount)}`,
      })}

      <div style="margin-bottom: 12px; padding: 10px 12px; border: 1px solid #e5e7eb; border-radius: 8px; background: #f8fafc; font-size: 12px; color: #475569;">
        <strong style="color:#334155;">Applied Filters:</strong> ${escapeHtml(filterText)}
      </div>

      <h3 style="margin: 0 0 8px 0; font-size: 16px; color: #334155;">Report Data</h3>
      ${renderTable(dataTable.headers, dataTable.rows, dataTable.aligns, dataTable.colgroup)}

      <div style="text-align:center; margin-top:12px; padding-top:8px; border-top:1px solid #e5e7eb; color:#94a3b8; font-size:11px;">
        Automated report generated by Citi-Nati Supermarket Sales System
      </div>
    </div>
  `;

  const element = document.createElement('div');
  element.innerHTML = html;

  const fileDate = today.toISOString().slice(0, 10);
  const fileName = `sales_${String(activeView || 'summary').toLowerCase()}_${fileDate}.pdf`;
  const options = {
    margin: 6,
    filename: fileName,
    image: { type: 'png', quality: 1.0 },
    html2canvas: {
      scale: 4,
      logging: false,
      useCORS: true,
      backgroundColor: '#ffffff',
      letterRendering: true,
      windowWidth: 1200,
      scrollX: 0,
      scrollY: 0,
    },
    jsPDF: { orientation: 'landscape', unit: 'mm', format: 'a4', compress: false },
    pagebreak: {
      mode: ['css', 'legacy'],
      avoid: ['tr', 'td', 'th', 'thead', 'tbody'],
    },
  };

  return html2pdf().set(options).from(element).save();
}
