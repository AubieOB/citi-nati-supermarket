import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

const BRAND_GREEN = [45, 134, 89];
const BRAND_PURPLE = [91, 75, 138];
const TEXT_DARK = [17, 24, 39];
const TEXT_MUTED = [107, 114, 128];

function fmtCurrency(value) {
  return `MWK ${Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtCount(value) {
  return Number(value || 0).toLocaleString('en-US');
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

function titleCase(value) {
  return String(value || '')
    .replace(/([A-Z])/g, ' $1')
    .replace(/[_-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (s) => s.toUpperCase());
}

function getPeriodText(filters = {}, resolvedDateRange = null) {
  if (resolvedDateRange?.startDate && resolvedDateRange?.endDate) {
    return `${resolvedDateRange.startDate} to ${resolvedDateRange.endDate}`;
  }

  if (filters.periodType === 'custom' && filters.startDate && filters.endDate) {
    return `${filters.startDate} to ${filters.endDate}`;
  }

  if (filters.periodType === 'day' && filters.date) {
    return filters.date;
  }

  if (filters.periodType === 'week' && filters.date) {
    return `Week of ${filters.date}`;
  }

  if (filters.periodType === 'quarter' && filters.quarter && filters.year) {
    return `Q${filters.quarter} ${filters.year}`;
  }

  if (filters.periodType === 'year' && filters.year) {
    return String(filters.year);
  }

  if (filters.month && filters.year) {
    return `${String(filters.month).padStart(2, '0')}/${filters.year}`;
  }

  return 'Current selection';
}

function buildFilterRows(filters = {}, resolvedDateRange = null) {
  const rows = [];
  rows.push(['Period Type', titleCase(filters.periodType || 'month')]);
  rows.push(['Reporting Period', getPeriodText(filters, resolvedDateRange)]);

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

  return rows;
}

function summarizeView(activeView, states) {
  const { summary, invoicesState, productsState, usersState, paymentsState } = states;

  if (activeView === 'summary') {
    return {
      count: Number(summary?.totalInvoices || 0),
      amount: Number(summary?.netSales || 0),
      empty: Number(summary?.totalInvoices || 0) <= 0,
    };
  }

  if (activeView === 'invoices') {
    const rows = Array.isArray(invoicesState?.data) ? invoicesState.data : [];
    return {
      count: rows.length,
      amount: rows.reduce((sum, row) => sum + Number(row?.netSale || 0), 0),
      empty: rows.length === 0,
    };
  }

  if (activeView === 'products') {
    const rows = Array.isArray(productsState?.data) ? productsState.data : [];
    return {
      count: rows.length,
      amount: rows.reduce((sum, row) => sum + Number(row?.totalSales || 0), 0),
      empty: rows.length === 0,
    };
  }

  if (activeView === 'users') {
    const rows = Array.isArray(usersState?.data) ? usersState.data : [];
    return {
      count: rows.length,
      amount: rows.reduce((sum, row) => sum + Number(row?.totalSales || 0), 0),
      empty: rows.length === 0,
    };
  }

  if (activeView === 'payments') {
    const rows = Array.isArray(paymentsState?.data) ? paymentsState.data : [];
    return {
      count: rows.length,
      amount: rows.reduce((sum, row) => sum + Number(row?.totalAmount || 0), 0),
      empty: rows.length === 0,
    };
  }

  return { count: 0, amount: 0, empty: true };
}

function drawHeader(doc, title, subtitle) {
  const width = doc.internal.pageSize.getWidth();
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...BRAND_PURPLE);
  doc.setFontSize(20);
  doc.text('Citi', width / 2 - 12, 16, { align: 'right' });
  doc.setTextColor(...BRAND_GREEN);
  doc.text('- Nati Supermarket', width / 2 - 10, 16, { align: 'left' });

  doc.setFontSize(13);
  doc.setTextColor(...TEXT_DARK);
  doc.text(title, width / 2, 24, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(...TEXT_MUTED);
  doc.text(subtitle, width / 2, 30, { align: 'center' });
}

function addNoDataBlock(doc, reason) {
  autoTable(doc, {
    startY: (doc.lastAutoTable?.finalY || 34) + 8,
    head: [['No Records']],
    body: [[reason]],
    styles: {
      fontSize: 10,
      textColor: [75, 85, 99],
      halign: 'center',
      valign: 'middle',
      cellPadding: 6,
    },
    headStyles: {
      fillColor: [241, 245, 249],
      textColor: [51, 65, 85],
    },
    bodyStyles: {
      fillColor: [248, 250, 252],
    },
  });
}

function buildSummarySection(doc, summary) {
  const rows = [
    ['Total Invoices', fmtCount(summary?.totalInvoices)],
    ['Total Items Sold', fmtCount(summary?.totalItemsSold)],
    ['Gross Sales', fmtCurrency(summary?.grossSales)],
    ['VAT', fmtCurrency(summary?.vatTotal)],
    ['Discount', fmtCurrency(summary?.discountTotal)],
    ['Net Sales', fmtCurrency(summary?.netSales)],
    ['Levy', fmtCurrency(summary?.levyTotal)],
    ['Average Invoice', fmtCurrency(summary?.averageInvoiceValue)],
  ];

  autoTable(doc, {
    startY: (doc.lastAutoTable?.finalY || 34) + 8,
    head: [['Metric', 'Value']],
    body: rows,
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: { fillColor: BRAND_GREEN, textColor: [255, 255, 255] },
    columnStyles: { 1: { halign: 'right' } },
  });
}

function buildInvoicesSection(doc, rows) {
  const body = rows.map((row) => [
    row?.sourceInvoiceNo || '-',
    toDate(row?.invoiceDate),
    toTime(row?.invoiceTime),
    row?.userName || '-',
    row?.locationCode || '-',
    row?.branchCode || '-',
    row?.payMethod1 || '-',
    fmtCurrency(row?.netSale),
  ]);

  autoTable(doc, {
    startY: (doc.lastAutoTable?.finalY || 34) + 8,
    head: [['Invoice', 'Date', 'Time', 'User', 'Location', 'Branch', 'Payment', 'Net']],
    body,
    styles: { fontSize: 8, cellPadding: 2.5 },
    headStyles: { fillColor: BRAND_GREEN, textColor: [255, 255, 255] },
    columnStyles: {
      7: { halign: 'right' },
    },
  });
}

function buildProductsSection(doc, rows) {
  const body = rows.map((row) => [
    row?.productCode || '-',
    row?.productName || '-',
    fmtCount(row?.totalQuantitySold),
    fmtCurrency(row?.totalSales),
    fmtCurrency(row?.totalTax),
    fmtCurrency(row?.totalDiscount),
  ]);

  autoTable(doc, {
    startY: (doc.lastAutoTable?.finalY || 34) + 8,
    head: [['Code', 'Product', 'Quantity', 'Sales', 'Tax', 'Discount']],
    body,
    styles: { fontSize: 8, cellPadding: 2.5 },
    headStyles: { fillColor: BRAND_GREEN, textColor: [255, 255, 255] },
    columnStyles: {
      2: { halign: 'right' },
      3: { halign: 'right' },
      4: { halign: 'right' },
      5: { halign: 'right' },
    },
  });
}

function buildUsersSection(doc, rows) {
  const body = rows.map((row) => [
    row?.userName || '-',
    fmtCount(row?.totalInvoices),
    fmtCurrency(row?.grossSales),
    fmtCurrency(row?.vatTotal),
    fmtCurrency(row?.totalSales),
    fmtCurrency(row?.averageInvoiceValue),
  ]);

  autoTable(doc, {
    startY: (doc.lastAutoTable?.finalY || 34) + 8,
    head: [['User', 'Invoices', 'Gross', 'VAT', 'Net', 'Avg Invoice']],
    body,
    styles: { fontSize: 8, cellPadding: 2.5 },
    headStyles: { fillColor: BRAND_GREEN, textColor: [255, 255, 255] },
    columnStyles: {
      1: { halign: 'right' },
      2: { halign: 'right' },
      3: { halign: 'right' },
      4: { halign: 'right' },
      5: { halign: 'right' },
    },
  });
}

function buildPaymentsSection(doc, rows, totals) {
  const body = rows.map((row) => [
    row?.payMethod || '-',
    fmtCount(row?.invoiceCount),
    fmtCurrency(row?.totalAmount),
  ]);

  const footer = [[
    'TOTAL',
    fmtCount(totals?.invoiceCount),
    fmtCurrency(totals?.totalAmount),
  ]];

  autoTable(doc, {
    startY: (doc.lastAutoTable?.finalY || 34) + 8,
    head: [['Payment Method', 'Invoice Count', 'Amount']],
    body,
    foot: footer,
    styles: { fontSize: 8.5, cellPadding: 2.8 },
    headStyles: { fillColor: BRAND_GREEN, textColor: [255, 255, 255] },
    footStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: 'bold' },
    columnStyles: {
      1: { halign: 'right' },
      2: { halign: 'right' },
    },
  });
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
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true });
  const subtitle = `${activeViewLabel} view - generated ${new Date().toLocaleString('en-GB')}`;
  drawHeader(doc, 'Sales Report', subtitle);

  autoTable(doc, {
    startY: 34,
    head: [['Context', 'Selection']],
    body: buildFilterRows(filters, resolvedDateRange),
    styles: { fontSize: 8.5, cellPadding: 2.8 },
    headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255] },
    columnStyles: {
      0: { cellWidth: 45, fontStyle: 'bold', textColor: [51, 65, 85] },
      1: { cellWidth: 220 },
    },
  });

  if (Array.isArray(summaryMetaLine) && summaryMetaLine.length > 0) {
    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 4,
      head: [['Applied Context Chips']],
      body: summaryMetaLine.map((item) => [String(item)]),
      styles: { fontSize: 8, cellPadding: 2.3 },
      headStyles: { fillColor: [241, 245, 249], textColor: [30, 41, 59] },
    });
  }

  const viewSummary = summarizeView(activeView, {
    summary,
    invoicesState,
    productsState,
    usersState,
    paymentsState,
  });

  autoTable(doc, {
    startY: doc.lastAutoTable.finalY + 4,
    head: [['Active View', 'Visible Records', 'Visible Amount']],
    body: [[activeViewLabel, fmtCount(viewSummary.count), fmtCurrency(viewSummary.amount)]],
    styles: { fontSize: 9, cellPadding: 2.6 },
    headStyles: { fillColor: BRAND_PURPLE, textColor: [255, 255, 255] },
    columnStyles: {
      1: { halign: 'right' },
      2: { halign: 'right' },
    },
  });

  if (activeView === 'summary') {
    if (Number(summary?.totalInvoices || 0) <= 0) {
      addNoDataBlock(doc, 'No records were found for the selected criteria in Summary view.');
    } else {
      buildSummarySection(doc, summary);
    }
  }

  if (activeView === 'invoices') {
    const rows = Array.isArray(invoicesState?.data) ? invoicesState.data : [];
    if (!rows.length) {
      addNoDataBlock(doc, 'No invoice records were found for the selected criteria.');
    } else {
      buildInvoicesSection(doc, rows);
    }
  }

  if (activeView === 'products') {
    const rows = Array.isArray(productsState?.data) ? productsState.data : [];
    if (!rows.length) {
      addNoDataBlock(doc, 'No product aggregates were found for the selected criteria.');
    } else {
      buildProductsSection(doc, rows);
    }
  }

  if (activeView === 'users') {
    const rows = Array.isArray(usersState?.data) ? usersState.data : [];
    if (!rows.length) {
      addNoDataBlock(doc, 'No user/cashier aggregates were found for the selected criteria.');
    } else {
      buildUsersSection(doc, rows);
    }
  }

  if (activeView === 'payments') {
    const rows = Array.isArray(paymentsState?.data) ? paymentsState.data : [];
    const totals = paymentsState?.totals || {
      invoiceCount: rows.reduce((sum, row) => sum + Number(row?.invoiceCount || 0), 0),
      totalAmount: rows.reduce((sum, row) => sum + Number(row?.totalAmount || 0), 0),
    };

    if (!rows.length) {
      addNoDataBlock(doc, 'No payment method rows were found for the selected criteria.');
    } else {
      buildPaymentsSection(doc, rows, totals);
    }
  }

  const fileDate = new Date().toISOString().slice(0, 10);
  const fileName = `sales_${String(activeView || 'summary').toLowerCase()}_${fileDate}.pdf`;
  doc.save(fileName);
}
