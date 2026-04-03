import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import logo from '../assets/citi-nati-logo.png.png';

const BRAND_PURPLE = '#5B4B8A';
const BRAND_GREEN = '#2D8659';
const BRAND_SLATE = '#334155';

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

function drawPageHeader(doc, reportTitle, activeViewLabel) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 10;

  try {
    doc.addImage(logo, 'PNG', margin, 8, 18, 18);
  } catch {
    // Logo rendering failure should not block export.
  }

  const textLeft = 32;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(91, 75, 138);
  doc.text('Citi', textLeft, 14);
  const citiWidth = doc.getTextWidth('Citi');
  doc.setTextColor(45, 134, 89);
  doc.text('- Nati Supermarket', textLeft + citiWidth + 1, 14);

  doc.setFontSize(11);
  doc.setTextColor(22, 28, 36);
  doc.text(reportTitle, textLeft, 20);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  doc.text(`${activeViewLabel} View`, textLeft, 25);

  doc.setDrawColor(45, 134, 89);
  doc.setLineWidth(0.45);
  doc.line(margin, 29, pageWidth - margin, 29);
}

function drawPageFooter(doc) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 10;
  const page = doc.internal.getCurrentPageInfo().pageNumber;
  const total = doc.internal.getNumberOfPages();

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(120, 120, 120);
  doc.setFontSize(8);
  doc.text('Automated report generated by Citi-Nati Supermarket Sales System', margin, pageHeight - 5);
  doc.text(`Page ${page} of ${total}`, pageWidth - margin, pageHeight - 5, { align: 'right' });
}

function drawNoData(doc, message, y) {
  autoTable(doc, {
    startY: y,
    margin: { left: 10, right: 10 },
    head: [['No Records']],
    body: [[message]],
    styles: {
      fontSize: 9,
      textColor: [71, 85, 105],
      cellPadding: 5,
      halign: 'center',
      valign: 'middle',
      lineColor: [203, 213, 225],
      lineWidth: 0.3,
    },
    headStyles: {
      fillColor: [241, 245, 249],
      textColor: [51, 65, 85],
      fontStyle: 'bold',
    },
  });
}

function getViewTableConfig(activeView, states) {
  const { summary, invoicesState, productsState, usersState, paymentsState } = states;

  if (activeView === 'summary') {
    if (Number(summary?.totalInvoices || 0) <= 0) {
      return {
        empty: true,
        emptyMessage: 'No records were found for the selected criteria in Summary view.',
      };
    }

    return {
      head: [['Metric', 'Value']],
      body: [
        ['Total Invoices', fmtCount(summary?.totalInvoices)],
        ['Total Items Sold', fmtCount(summary?.totalItemsSold)],
        ['Gross Sales', fmtCurrency(summary?.grossSales)],
        ['VAT Total', fmtCurrency(summary?.vatTotal)],
        ['Discount Total', fmtCurrency(summary?.discountTotal)],
        ['Net Sales', fmtCurrency(summary?.netSales)],
        ['Levy Total', fmtCurrency(summary?.levyTotal)],
        ['Average Invoice', fmtCurrency(summary?.averageInvoiceValue)],
      ],
      columnStyles: {
        0: { cellWidth: 182, halign: 'left' },
        1: { cellWidth: 85, halign: 'right' },
      },
    };
  }

  if (activeView === 'invoices') {
    const rows = Array.isArray(invoicesState?.data) ? invoicesState.data : [];
    if (!rows.length) {
      return {
        empty: true,
        emptyMessage: 'No invoice records were found for the selected criteria.',
      };
    }

    return {
      head: [['Invoice', 'Date', 'Time', 'User', 'Location', 'Branch', 'Payment', 'Net']],
      body: rows.map((row) => [
        row?.sourceInvoiceNo || '-',
        toDate(row?.invoiceDate),
        toTime(row?.invoiceTime),
        row?.userName || '-',
        row?.locationCode || '-',
        row?.branchCode || '-',
        row?.payMethod1 || '-',
        fmtCurrency(row?.netSale),
      ]),
      columnStyles: {
        0: { cellWidth: 28 },
        1: { cellWidth: 26 },
        2: { cellWidth: 22 },
        3: { cellWidth: 28 },
        4: { cellWidth: 22 },
        5: { cellWidth: 22 },
        6: { cellWidth: 24 },
        7: { cellWidth: 30, halign: 'right' },
      },
    };
  }

  if (activeView === 'products') {
    const rows = Array.isArray(productsState?.data) ? productsState.data : [];
    if (!rows.length) {
      return {
        empty: true,
        emptyMessage: 'No product aggregates were found for the selected criteria.',
      };
    }

    return {
      head: [['Code', 'Product', 'Quantity', 'Sales', 'Tax', 'Discount']],
      body: rows.map((row) => [
        row?.productCode || '-',
        row?.productName || '-',
        fmtCount(row?.totalQuantitySold),
        fmtCurrency(row?.totalSales),
        fmtCurrency(row?.totalTax),
        fmtCurrency(row?.totalDiscount),
      ]),
      columnStyles: {
        0: { cellWidth: 30 },
        1: { cellWidth: 95 },
        2: { cellWidth: 28, halign: 'right' },
        3: { cellWidth: 38, halign: 'right' },
        4: { cellWidth: 38, halign: 'right' },
        5: { cellWidth: 38, halign: 'right' },
      },
    };
  }

  if (activeView === 'users') {
    const rows = Array.isArray(usersState?.data) ? usersState.data : [];
    if (!rows.length) {
      return {
        empty: true,
        emptyMessage: 'No user/cashier aggregates were found for the selected criteria.',
      };
    }

    return {
      head: [['User', 'Invoices', 'Gross', 'VAT', 'Net', 'Avg Invoice']],
      body: rows.map((row) => [
        row?.userName || '-',
        fmtCount(row?.totalInvoices),
        fmtCurrency(row?.grossSales),
        fmtCurrency(row?.vatTotal),
        fmtCurrency(row?.totalSales),
        fmtCurrency(row?.averageInvoiceValue),
      ]),
      columnStyles: {
        0: { cellWidth: 73 },
        1: { cellWidth: 32, halign: 'right' },
        2: { cellWidth: 40, halign: 'right' },
        3: { cellWidth: 40, halign: 'right' },
        4: { cellWidth: 40, halign: 'right' },
        5: { cellWidth: 40, halign: 'right' },
      },
    };
  }

  if (activeView === 'payments') {
    const rows = Array.isArray(paymentsState?.data) ? paymentsState.data : [];
    if (!rows.length) {
      return {
        empty: true,
        emptyMessage: 'No payment method rows were found for the selected criteria.',
      };
    }

    const totals = paymentsState?.totals || {
      invoiceCount: rows.reduce((sum, row) => sum + Number(row?.invoiceCount || 0), 0),
      totalAmount: rows.reduce((sum, row) => sum + Number(row?.totalAmount || 0), 0),
    };

    return {
      head: [['Payment Method', 'Invoice Count', 'Amount']],
      body: rows.map((row) => [
        row?.payMethod || '-',
        fmtCount(row?.invoiceCount),
        fmtCurrency(row?.totalAmount),
      ]),
      foot: [['TOTAL', fmtCount(totals.invoiceCount), fmtCurrency(totals.totalAmount)]],
      columnStyles: {
        0: { cellWidth: 150 },
        1: { cellWidth: 55, halign: 'right' },
        2: { cellWidth: 62, halign: 'right' },
      },
    };
  }

  return {
    empty: true,
    emptyMessage: 'The selected report view is not available for export.',
  };
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
  const reportTitle = 'Sales Report Export';
  const today = new Date();
  const viewSummary = summarizeView(activeView, {
    summary,
    invoicesState,
    productsState,
    usersState,
    paymentsState,
  });
  const chips = buildFilterChips(filters, resolvedDateRange, summaryMetaLine);
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

  drawPageHeader(doc, reportTitle, activeViewLabel);

  autoTable(doc, {
    startY: 34,
    margin: { left: 10, right: 10 },
    head: [['Context', 'Value']],
    body: chips.map((chip) => [chip.label, chip.value]),
    styles: {
      fontSize: 8.5,
      cellPadding: 2.2,
      textColor: [30, 41, 59],
      lineColor: [226, 232, 240],
      lineWidth: 0.25,
    },
    headStyles: {
      fillColor: [91, 75, 138],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    columnStyles: {
      0: { cellWidth: 58, fontStyle: 'bold', textColor: [71, 85, 105] },
      1: { cellWidth: 209 },
    },
  });

  const summaryStartY = (doc.lastAutoTable?.finalY || 34) + 4;
  autoTable(doc, {
    startY: summaryStartY,
    margin: { left: 10, right: 10 },
    head: [['Active View', 'Visible Records', 'Visible Amount']],
    body: [[activeViewLabel, fmtCount(viewSummary.count), fmtCurrency(viewSummary.amount)]],
    styles: {
      fontSize: 9,
      cellPadding: 3,
      textColor: [17, 24, 39],
      lineColor: [219, 234, 254],
      lineWidth: 0.3,
    },
    headStyles: {
      fillColor: [45, 134, 89],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
    },
    bodyStyles: {
      fillColor: [240, 249, 246],
    },
    columnStyles: {
      0: { cellWidth: 127 },
      1: { cellWidth: 70, halign: 'right' },
      2: { cellWidth: 70, halign: 'right' },
    },
  });

  const reportHeadingY = (doc.lastAutoTable?.finalY || summaryStartY) + 6;
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(10, reportHeadingY - 4, 277, 9, 2, 2, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(51, 65, 85);
  doc.setFontSize(10);
  doc.text('Report Data', 13, reportHeadingY + 1.7);

  const tableY = reportHeadingY + 7;
  const tableConfig = getViewTableConfig(activeView, {
    summary,
    invoicesState,
    productsState,
    usersState,
    paymentsState,
  });

  if (tableConfig.empty) {
    drawNoData(doc, tableConfig.emptyMessage, tableY);
  } else {
    autoTable(doc, {
      startY: tableY,
      margin: { left: 10, right: 10 },
      head: tableConfig.head,
      body: tableConfig.body,
      foot: tableConfig.foot || undefined,
      theme: 'grid',
      styles: {
        fontSize: 8,
        textColor: [34, 34, 34],
        cellPadding: 2,
        lineColor: [225, 225, 225],
        lineWidth: 0.2,
      },
      headStyles: {
        fillColor: [45, 134, 89],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
      },
      footStyles: {
        fillColor: [240, 249, 246],
        textColor: [17, 24, 39],
        fontStyle: 'bold',
      },
      alternateRowStyles: {
        fillColor: [249, 250, 251],
      },
      columnStyles: tableConfig.columnStyles,
      didDrawPage: () => {
        drawPageHeader(doc, reportTitle, activeViewLabel);
      },
    });
  }

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i += 1) {
    doc.setPage(i);
    drawPageFooter(doc);
  }

  const fileDate = today.toISOString().slice(0, 10);
  const fileName = `sales_${String(activeView || 'summary').toLowerCase()}_${fileDate}.pdf`;
  doc.save(fileName);
}
