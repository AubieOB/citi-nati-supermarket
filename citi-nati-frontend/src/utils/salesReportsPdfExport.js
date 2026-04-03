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

function buildBrandedHeader({ reportTitle, subText = '', periodText = '', generatedText = '', accentColor = BRAND_PURPLE }) {
  return `
    <div style="margin-bottom: 24px; border-bottom: 3px solid ${accentColor}; padding-bottom: 14px;">
      <div style="display: flex; align-items: center; gap: 10px;">
        <img src="${logo}" alt="Citi-Nati logo" style="height: 56px; width: auto; object-fit: contain; flex: 0 0 auto;" />
        <div style="flex: 1; text-align: center;">
          <h1 style="margin: 0; font-size: 27px; font-weight: 700; line-height: 1.2;">
            <span style="color: ${BRAND_PURPLE};">Citi</span><span style="color: ${BRAND_GREEN};">- Nati Supermarket</span>
          </h1>
          <p style="margin: 6px 0 0 0; color: #111; font-size: 16px; font-weight: 600;">${escapeHtml(reportTitle)}</p>
          ${subText ? `<p style="margin: 4px 0 0 0; color: #555; font-size: 12px;">${escapeHtml(subText)}</p>` : ''}
          ${periodText ? `<p style="margin: 4px 0 0 0; color: #666; font-size: 12px;">${escapeHtml(periodText)}</p>` : ''}
          ${generatedText ? `<p style="margin: 4px 0 0 0; color: #777; font-size: 12px;">${escapeHtml(generatedText)}</p>` : ''}
        </div>
        <div style="width: 56px; flex: 0 0 56px;"></div>
      </div>
    </div>
  `;
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

function buildFilterChips(filters = {}, resolvedDateRange = null, summaryMetaLine = []) {
  const chips = [
    { label: 'Period Type', value: titleCase(filters.periodType || 'month') },
    { label: 'Reporting Period', value: getPeriodText(filters, resolvedDateRange) },
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
      chips.push({ label: titleCase(key), value: String(value) });
    }
  });

  if (Array.isArray(summaryMetaLine)) {
    summaryMetaLine.forEach((line, index) => {
      if (!line) return;
      chips.push({ label: `Context ${index + 1}`, value: String(line) });
    });
  }

  return chips;
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

function renderEmptyState(message) {
  return `
    <div style="padding: 18px; border: 1px dashed #cbd5e1; border-radius: 10px; background: #f8fafc; color: #475569; text-align: center; font-size: 13px;">
      ${escapeHtml(message)}
    </div>
  `;
}

function renderSummaryMetrics(summary) {
  const rows = [
    ['Total Invoices', fmtCount(summary?.totalInvoices)],
    ['Total Items Sold', fmtCount(summary?.totalItemsSold)],
    ['Gross Sales', fmtCurrency(summary?.grossSales)],
    ['VAT Total', fmtCurrency(summary?.vatTotal)],
    ['Discount Total', fmtCurrency(summary?.discountTotal)],
    ['Net Sales', fmtCurrency(summary?.netSales)],
    ['Levy Total', fmtCurrency(summary?.levyTotal)],
    ['Average Invoice', fmtCurrency(summary?.averageInvoiceValue)],
  ];

  return `
    <table class="sales-pdf-table">
      <thead>
        <tr>
          <th style="width: 65%;">Metric</th>
          <th style="width: 35%; text-align: right;">Value</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map((row, index) => `
          <tr style="background: ${index % 2 === 0 ? '#fff' : '#f9f9f9'};">
            <td>${escapeHtml(row[0])}</td>
            <td style="text-align: right;">${escapeHtml(row[1])}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function renderGenericTable(headers, rows, aligns = []) {
  if (!rows.length) {
    return renderEmptyState('No records were found for the selected criteria.');
  }

  return `
    <table class="sales-pdf-table">
      <thead>
        <tr>
          ${headers.map((header, i) => `<th style="text-align: ${aligns[i] || 'left'};">${escapeHtml(header)}</th>`).join('')}
        </tr>
      </thead>
      <tbody>
        ${rows.map((row, rowIndex) => `
          <tr style="background: ${rowIndex % 2 === 0 ? '#fff' : '#f9f9f9'};">
            ${row.map((cell, cellIndex) => `<td style="text-align: ${aligns[cellIndex] || 'left'};">${escapeHtml(cell)}</td>`).join('')}
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function buildReportSection(activeView, summary, invoicesState, productsState, usersState, paymentsState) {
  if (activeView === 'summary') {
    if (Number(summary?.totalInvoices || 0) <= 0) {
      return renderEmptyState('No records were found for the selected criteria in Summary view.');
    }
    return renderSummaryMetrics(summary);
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
    return renderGenericTable(
      ['Invoice', 'Date', 'Time', 'User', 'Location', 'Branch', 'Payment', 'Net'],
      rows,
      ['left', 'left', 'left', 'left', 'left', 'left', 'left', 'right'],
    );
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
    return renderGenericTable(
      ['Code', 'Product', 'Quantity', 'Sales', 'Tax', 'Discount'],
      rows,
      ['left', 'left', 'right', 'right', 'right', 'right'],
    );
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
    return renderGenericTable(
      ['User', 'Invoices', 'Gross', 'VAT', 'Net', 'Avg Invoice'],
      rows,
      ['left', 'right', 'right', 'right', 'right', 'right'],
    );
  }

  if (activeView === 'payments') {
    const dataRows = Array.isArray(paymentsState?.data) ? paymentsState.data : [];
    const totals = paymentsState?.totals || {
      invoiceCount: dataRows.reduce((sum, row) => sum + Number(row?.invoiceCount || 0), 0),
      totalAmount: dataRows.reduce((sum, row) => sum + Number(row?.totalAmount || 0), 0),
    };

    const rows = dataRows.map((row) => [
      row?.payMethod || '-',
      fmtCount(row?.invoiceCount),
      fmtCurrency(row?.totalAmount),
    ]);

    if (!rows.length) {
      return renderEmptyState('No payment method rows were found for the selected criteria.');
    }

    const table = renderGenericTable(
      ['Payment Method', 'Invoice Count', 'Amount'],
      rows,
      ['left', 'right', 'right'],
    );

    return `
      ${table}
      <div style="margin-top: 10px; border: 1px solid #dbe7df; border-radius: 8px; background: #f0f9f6; padding: 10px 12px; display: flex; justify-content: space-between; gap: 14px;">
        <div><strong>Total Invoices:</strong> ${escapeHtml(fmtCount(totals.invoiceCount))}</div>
        <div><strong>Total Amount:</strong> ${escapeHtml(fmtCurrency(totals.totalAmount))}</div>
      </div>
    `;
  }

  return renderEmptyState('The selected report view is not available for export.');
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
  const dateText = today.toLocaleDateString('en-GB');
  const timeText = today.toLocaleTimeString('en-GB');
  const viewSummary = summarizeView(activeView, {
    summary,
    invoicesState,
    productsState,
    usersState,
    paymentsState,
  });

  const chips = buildFilterChips(filters, resolvedDateRange, summaryMetaLine);

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
          page-break-inside: avoid;
          break-inside: avoid;
          border: 1px solid #ddd;
          padding: 9px 10px;
          vertical-align: top;
          word-break: break-word;
        }

        .sales-pdf-table th {
          background: #2D8659;
          color: #fff;
          font-weight: bold;
        }
      </style>

      ${buildBrandedHeader({
        reportTitle: 'Sales Report Export',
        subText: `${activeViewLabel} View`,
        periodText: `Reporting Period: ${getPeriodText(filters, resolvedDateRange)}`,
        generatedText: `Generated: ${dateText} ${timeText}`,
        accentColor: BRAND_GREEN,
      })}

      <div style="display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; margin-bottom: 14px;">
        <div style="border: 1px solid #dfe7f1; border-radius: 10px; background: #f4f0f7; padding: 10px;">
          <div style="font-size: 11px; color: #6b7280; font-weight: 700;">ACTIVE VIEW</div>
          <div style="margin-top: 5px; color: #334155; font-weight: 700;">${escapeHtml(activeViewLabel)}</div>
        </div>
        <div style="border: 1px solid #dfe7f1; border-radius: 10px; background: #f0f9f6; padding: 10px;">
          <div style="font-size: 11px; color: #6b7280; font-weight: 700;">VISIBLE RECORDS</div>
          <div style="margin-top: 5px; color: #0f172a; font-weight: 700;">${escapeHtml(fmtCount(viewSummary.count))}</div>
        </div>
        <div style="border: 1px solid #dfe7f1; border-radius: 10px; background: #fff4db; padding: 10px;">
          <div style="font-size: 11px; color: #6b7280; font-weight: 700;">VISIBLE AMOUNT</div>
          <div style="margin-top: 5px; color: #0f172a; font-weight: 700;">${escapeHtml(fmtCurrency(viewSummary.amount))}</div>
        </div>
      </div>

      <div style="margin-bottom: 14px; border: 1px solid #e5e7eb; border-radius: 10px; background: #fff; padding: 12px;">
        <div style="font-weight: 700; color: #334155; margin-bottom: 8px;">Applied Filters</div>
        <div style="display: flex; flex-wrap: wrap; gap: 8px;">
          ${chips.map((chip) => `
            <div style="border: 1px solid #e2e8f0; background: #f8fafc; border-radius: 999px; padding: 5px 10px; font-size: 11px; color: #334155;">
              <strong>${escapeHtml(chip.label)}:</strong> ${escapeHtml(chip.value)}
            </div>
          `).join('')}
        </div>
      </div>

      <div style="margin-bottom: 8px; border: 1px solid #e5e7eb; border-radius: 10px; background: #fff; padding: 12px;">
        <div style="font-weight: 700; color: #334155; margin-bottom: 8px;">Report Data</div>
        ${buildReportSection(activeView, summary, invoicesState, productsState, usersState, paymentsState)}
      </div>

      <div style="text-align: center; margin-top: 16px; padding-top: 12px; border-top: 1px solid #ddd; color: #8893a5; font-size: 11px;">
        <p style="margin: 0;">This is an automated report generated by Citi-Nati Supermarket Sales System</p>
        <p style="margin: 5px 0 0 0;">The Brand of Choice That Offers Convenient Shopping Experience</p>
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
    },
    jsPDF: { orientation: 'landscape', unit: 'mm', format: 'a4', compress: false },
    pagebreak: {
      mode: ['avoid-all', 'css', 'legacy'],
      avoid: ['tr', 'td', 'th', 'thead', 'tbody'],
    },
  };

  return html2pdf().set(opt).from(element).save();
}
