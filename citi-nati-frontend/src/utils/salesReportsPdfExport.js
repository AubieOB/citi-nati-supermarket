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

function buildBrandedHeader({ reportTitle, subText = '', periodText = '', generatedText = '', accentColor = BRAND_PURPLE }) {
  return `
    <div style="margin-bottom: 20px; border-bottom: 3px solid ${accentColor}; padding-bottom: 12px;">
      <div style="display: flex; align-items: center; gap: 10px;">
        <img src="${logo}" alt="Citi-Nati logo" style="height: 44px; width: auto; object-fit: contain; flex: 0 0 auto;" />
        <div style="flex: 1; text-align: left;">
          <h1 style="margin: 0; font-size: 37px; font-weight: 700; line-height: 1;">
            <span style="color: ${BRAND_PURPLE};">Citi</span><span style="color: ${BRAND_GREEN};"> - Nati Supermarket</span>
          </h1>
          <p style="margin: 6px 0 0 0; color: #111; font-size: 18px; font-weight: 600;">${escapeHtml(reportTitle)}</p>
          ${subText ? `<p style="margin: 3px 0 0 0; color: #475569; font-size: 13px;">${escapeHtml(subText)}</p>` : ''}
          ${periodText ? `<p style="margin: 2px 0 0 0; color: #64748b; font-size: 12px;">${escapeHtml(periodText)}</p>` : ''}
          ${generatedText ? `<p style="margin: 2px 0 0 0; color: #64748b; font-size: 12px;">${escapeHtml(generatedText)}</p>` : ''}
        </div>
      </div>
    </div>
  `;
}

function buildFilterRows(filters = {}, resolvedDateRange = null, summaryMetaLine = []) {
  const rows = [
    ['Period Type', titleCase(filters.periodType || 'month')],
    ['Reporting Period', getPeriodText(filters, resolvedDateRange)],
  ];

  const optionalKeys = [
    'branchCode',
    'locationCode',
    'syncSourceCode',
    'locationId',
    'userName',
    'productCode',
    'productName',
    'payMethod',
    'invoiceType',
  ];

  optionalKeys.forEach((key) => {
    const value = filters[key];
    if (value !== '' && value !== null && value !== undefined) {
      rows.push([titleCase(key), String(value)]);
    }
  });

  if (Array.isArray(summaryMetaLine)) {
    summaryMetaLine.forEach((line, index) => {
      if (!line) return;
      rows.push([`Context ${index + 1}`, String(line)]);
    });
  }

  return rows;
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

function buildTableConfig(activeView, summary, invoicesState, productsState, usersState, paymentsState) {
  if (activeView === 'summary') {
    if (Number(summary?.totalInvoices || 0) <= 0) {
      return {
        headers: ['No Records'],
        rows: [['No records were found for the selected criteria in Summary view.']],
        aligns: ['center'],
      };
    }

    return {
      headers: ['Metric', 'Value'],
      rows: [
        ['Total Invoices', fmtCount(summary?.totalInvoices)],
        ['Total Items Sold', fmtCount(summary?.totalItemsSold)],
        ['Gross Sales', fmtCurrency(summary?.grossSales)],
        ['VAT Total', fmtCurrency(summary?.vatTotal)],
        ['Discount Total', fmtCurrency(summary?.discountTotal)],
        ['Net Sales', fmtCurrency(summary?.netSales)],
        ['Levy Total', fmtCurrency(summary?.levyTotal)],
        ['Average Invoice', fmtCurrency(summary?.averageInvoiceValue)],
      ],
      aligns: ['left', 'right'],
    };
  }

  if (activeView === 'invoices') {
    const rows = Array.isArray(invoicesState?.data) ? invoicesState.data : [];
    return {
      headers: ['Invoice', 'Date', 'Time', 'User', 'Location', 'Branch', 'Payment', 'Net'],
      rows: rows.map((row) => [
        row?.sourceInvoiceNo || '-',
        toDate(row?.invoiceDate),
        toTime(row?.invoiceTime),
        row?.userName || '-',
        row?.locationCode || '-',
        row?.branchCode || '-',
        row?.payMethod1 || '-',
        fmtCurrency(row?.netSale),
      ]),
      aligns: ['left', 'left', 'left', 'left', 'left', 'left', 'left', 'right'],
      emptyMessage: 'No invoice records were found for the selected criteria.',
    };
  }

  if (activeView === 'products') {
    const rows = Array.isArray(productsState?.data) ? productsState.data : [];
    return {
      headers: ['Code', 'Product', 'Quantity', 'Sales', 'Tax', 'Discount'],
      rows: rows.map((row) => [
        row?.productCode || '-',
        row?.productName || '-',
        fmtCount(row?.totalQuantitySold),
        fmtCurrency(row?.totalSales),
        fmtCurrency(row?.totalTax),
        fmtCurrency(row?.totalDiscount),
      ]),
      aligns: ['left', 'left', 'right', 'right', 'right', 'right'],
      emptyMessage: 'No product aggregates were found for the selected criteria.',
    };
  }

  if (activeView === 'users') {
    const rows = Array.isArray(usersState?.data) ? usersState.data : [];
    return {
      headers: ['User', 'Invoices', 'Gross', 'VAT', 'Net', 'Avg Invoice'],
      rows: rows.map((row) => [
        row?.userName || '-',
        fmtCount(row?.totalInvoices),
        fmtCurrency(row?.grossSales),
        fmtCurrency(row?.vatTotal),
        fmtCurrency(row?.totalSales),
        fmtCurrency(row?.averageInvoiceValue),
      ]),
      aligns: ['left', 'right', 'right', 'right', 'right', 'right'],
      emptyMessage: 'No user/cashier aggregates were found for the selected criteria.',
    };
  }

  if (activeView === 'payments') {
    const rows = Array.isArray(paymentsState?.data) ? paymentsState.data : [];
    const totals = paymentsState?.totals || {
      invoiceCount: rows.reduce((sum, row) => sum + Number(row?.invoiceCount || 0), 0),
      totalAmount: rows.reduce((sum, row) => sum + Number(row?.totalAmount || 0), 0),
    };

    const baseRows = rows.map((row) => [
      row?.payMethod || '-',
      fmtCount(row?.invoiceCount),
      fmtCurrency(row?.totalAmount),
    ]);

    if (baseRows.length) {
      baseRows.push(['TOTAL', fmtCount(totals.invoiceCount), fmtCurrency(totals.totalAmount)]);
    }

    return {
      headers: ['Payment Method', 'Invoice Count', 'Amount'],
      rows: baseRows,
      aligns: ['left', 'right', 'right'],
      emptyMessage: 'No payment method rows were found for the selected criteria.',
    };
  }

  return {
    headers: ['No Records'],
    rows: [['The selected report view is not available for export.']],
    aligns: ['center'],
  };
}

function renderTable(headers, rows, aligns, emptyMessage = 'No records found.') {
  const safeRows = rows && rows.length ? rows : [[emptyMessage]];
  const hasData = rows && rows.length;

  return `
    <table class="sales-pdf-table">
      <thead>
        <tr>
          ${headers.map((h, i) => `<th style="text-align:${aligns[i] || 'left'}">${escapeHtml(h)}</th>`).join('')}
        </tr>
      </thead>
      <tbody>
        ${safeRows.map((row, rowIndex) => `
          <tr style="background-color:${rowIndex % 2 === 0 ? '#fff' : '#f9f9f9'};">
            ${row.map((cell, cellIndex) => `<td style="text-align:${aligns[cellIndex] || 'left'}">${escapeHtml(cell)}</td>`).join('')}
          </tr>
        `).join('')}
      </tbody>
    </table>
    ${!hasData ? `<div style="margin-top: 10px; color: #64748b; font-size: 12px;">${escapeHtml(emptyMessage)}</div>` : ''}
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
  const generatedText = `${today.toLocaleDateString('en-GB')} ${today.toLocaleTimeString('en-GB')}`;
  const viewSummary = summarizeView(activeView, {
    summary,
    invoicesState,
    productsState,
    usersState,
    paymentsState,
  });

  const filterRows = buildFilterRows(filters, resolvedDateRange, summaryMetaLine);
  const tableConfig = buildTableConfig(activeView, summary, invoicesState, productsState, usersState, paymentsState);

  const html = `
    <div style="font-family: Arial, sans-serif; color: #222; padding: 16px; width: 1120px; box-sizing: border-box;">
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
          page-break-after: auto;
        }

        .sales-pdf-table td,
        .sales-pdf-table th {
          border: 1px solid #d4d4d4;
          padding: 7px 8px;
          vertical-align: top;
          word-break: break-word;
        }

        .sales-pdf-table th {
          background-color: #2D8659;
          color: #fff;
          font-weight: 700;
          font-size: 12px;
        }
      </style>

      ${buildBrandedHeader({
        reportTitle: 'Sales Report Export',
        subText: `${activeViewLabel} View`,
        periodText: `Reporting Period: ${getPeriodText(filters, resolvedDateRange)}`,
        generatedText: `Generated: ${generatedText}`,
        accentColor: BRAND_GREEN,
      })}

      ${renderTable(
        ['Context', 'Value'],
        filterRows,
        ['left', 'left'],
      )}

      <div style="margin-top: 12px;">
        ${renderTable(
          ['Active View', 'Visible Records', 'Visible Amount'],
          [[activeViewLabel, fmtCount(viewSummary.count), fmtCurrency(viewSummary.amount)]],
          ['left', 'left', 'left'],
        )}
      </div>

      <h3 style="margin: 14px 0 8px 0; font-size: 22px; color: #334155;">Report Data</h3>
      ${renderTable(tableConfig.headers, tableConfig.rows, tableConfig.aligns, tableConfig.emptyMessage)}

      <div style="text-align: center; margin-top: 14px; padding-top: 10px; border-top: 1px solid #ddd; color: #94a3b8; font-size: 11px;">
        <p style="margin: 0;">Automated report generated by Citi-Nati Supermarket Sales System</p>
      </div>
    </div>
  `;

  const element = document.createElement('div');
  element.innerHTML = html;

  const fileDate = today.toISOString().slice(0, 10);
  const fileName = `sales_${String(activeView || 'summary').toLowerCase()}_${fileDate}.pdf`;
  const opt = {
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
      mode: ['avoid-all', 'css', 'legacy'],
      avoid: ['tr', 'td', 'th', 'thead', 'tbody'],
    },
  };

  return html2pdf().set(opt).from(element).save();
}
