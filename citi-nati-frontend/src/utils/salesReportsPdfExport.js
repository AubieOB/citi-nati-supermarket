import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import logo from '../assets/citi-nati-logo.png.png';

const BRAND_PURPLE = '#5B4B8A';
const BRAND_GREEN = '#2D8659';
const COLOR_TEXT = [15, 23, 42];
const COLOR_MUTED = [100, 116, 139];
const COLOR_BORDER = [226, 232, 240];
const COLOR_CARD_BG = [248, 250, 252];
const COLOR_ALT_ROW = [249, 250, 251];
const PAGE_MARGIN = 12;
const CONTENT_MAX_WIDTH = 256;

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

function toRgb(hex) {
  const normalized = String(hex || '').replace('#', '');
  const value = normalized.length === 3
    ? normalized.split('').map((ch) => `${ch}${ch}`).join('')
    : normalized;
  const intVal = parseInt(value, 16);
  return [(intVal >> 16) & 255, (intVal >> 8) & 255, intVal & 255];
}

function formatGeneratedTimestamp() {
  const now = new Date();
  return `${now.toLocaleDateString('en-GB')} ${now.toLocaleTimeString('en-GB')}`;
}

function getContentBounds(doc) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const width = Math.min(CONTENT_MAX_WIDTH, pageWidth - (PAGE_MARGIN * 2));
  const left = (pageWidth - width) / 2;
  return {
    left,
    right: left + width,
    width,
  };
}

function buildMetadataRows(filters = {}, resolvedDateRange = null, summaryMetaLine = []) {
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
      columnStyles: {
        0: { cellWidth: 176, halign: 'left' },
        1: { cellWidth: 80, halign: 'right' },
      },
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
      columnStyles: {
        0: { cellWidth: 21 },
        1: { cellWidth: 24 },
        2: { cellWidth: 20 },
        3: { cellWidth: 36 },
        4: { cellWidth: 24 },
        5: { cellWidth: 30 },
        6: { cellWidth: 29 },
        7: { cellWidth: 72, halign: 'right' },
      },
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
      columnStyles: {
        0: { cellWidth: 32 },
        1: { cellWidth: 100 },
        2: { cellWidth: 26, halign: 'right' },
        3: { cellWidth: 34, halign: 'right' },
        4: { cellWidth: 32, halign: 'right' },
        5: { cellWidth: 32, halign: 'right' },
      },
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
      columnStyles: {
        0: { cellWidth: 78 },
        1: { cellWidth: 24, halign: 'right' },
        2: { cellWidth: 38, halign: 'right' },
        3: { cellWidth: 38, halign: 'right' },
        4: { cellWidth: 38, halign: 'right' },
        5: { cellWidth: 40, halign: 'right' },
      },
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
    columnStyles: {
      0: { cellWidth: 158 },
      1: { cellWidth: 30, halign: 'right' },
      2: { cellWidth: 68, halign: 'right' },
    },
  };
}

function drawHeader(doc, { reportTitle, viewLabel, periodText, generatedText, showCompact = false }) {
  const { left, right } = getContentBounds(doc);

  if (!showCompact) {
    const logoWidth = 20;
    const logoHeight = 14;
    try {
      doc.addImage(logo, 'PNG', left, 8.5, logoWidth, logoHeight);
    } catch {
      // Ignore logo rendering issues.
    }

    const titleX = left + logoWidth + 4;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(...toRgb(BRAND_PURPLE));
    doc.text('Citi', titleX, 14);
    const citiWidth = doc.getTextWidth('Citi');
    doc.setTextColor(...toRgb(BRAND_GREEN));
    doc.text('- Nati Supermarket', titleX + citiWidth + 1, 14);

    doc.setTextColor(...COLOR_TEXT);
    doc.setFontSize(12);
    doc.text(reportTitle, titleX, 19.5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...COLOR_MUTED);
    doc.text(`${viewLabel} View`, titleX, 24.5);

    doc.text(`Generated: ${generatedText}`, right, 14, { align: 'right' });
    doc.text(`Period: ${periodText}`, right, 19.5, { align: 'right' });

    doc.setDrawColor(...toRgb(BRAND_GREEN));
    doc.setLineWidth(0.45);
    doc.line(left, 28, right, 28);
  } else {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...COLOR_MUTED);
    doc.text(`${reportTitle} - ${viewLabel} (cont.)`, left, 10.5);
    doc.setDrawColor(...COLOR_BORDER);
    doc.setLineWidth(0.3);
    doc.line(left, 12.5, right, 12.5);
  }
}

function drawSectionTitle(doc, text, y) {
  const { left } = getContentBounds(doc);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...COLOR_TEXT);
  doc.text(text, left, y);
}

function drawSummaryCards(doc, cards, startY) {
  const { left, width } = getContentBounds(doc);
  const gap = 4;
  const count = cards.length;
  const cardWidth = (width - gap * (count - 1)) / count;
  const cardHeight = 16;

  cards.forEach((card, index) => {
    const x = left + index * (cardWidth + gap);
    doc.setFillColor(...COLOR_CARD_BG);
    doc.setDrawColor(...COLOR_BORDER);
    doc.roundedRect(x, startY, cardWidth, cardHeight, 2, 2, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.2);
    doc.setTextColor(...COLOR_MUTED);
    doc.text(card.label.toUpperCase(), x + 2.5, startY + 4.8, { maxWidth: cardWidth - 5 });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(...toRgb(card.color || BRAND_GREEN));
    doc.text(card.value, x + 2.5, startY + 11.6, {
      maxWidth: cardWidth - 5,
    });
  });

  return startY + cardHeight + 6;
}

function drawMetadataTable(doc, rows, startY) {
  const { left, right, width } = getContentBounds(doc);
  autoTable(doc, {
    startY,
    margin: { left, right, top: 16, bottom: 12 },
    head: [['Report Metadata', 'Value']],
    body: rows,
    theme: 'grid',
    styles: {
      fontSize: 8.2,
      cellPadding: 2.6,
      textColor: COLOR_TEXT,
      lineColor: COLOR_BORDER,
      lineWidth: 0.22,
      valign: 'middle',
    },
    headStyles: {
      fillColor: toRgb(BRAND_PURPLE),
      textColor: [255, 255, 255],
      fontStyle: 'bold',
    },
    alternateRowStyles: {
      fillColor: COLOR_ALT_ROW,
    },
    columnStyles: {
      0: { cellWidth: 66, fontStyle: 'bold', textColor: COLOR_MUTED },
      1: { cellWidth: width - 66 },
    },
  });

  return (doc.lastAutoTable?.finalY || startY) + 6;
}

function drawMainDataTable(doc, config, startY, headerContext) {
  const { left, right } = getContentBounds(doc);
  autoTable(doc, {
    startY,
    margin: { left, right, top: 16, bottom: 12 },
    head: [config.headers],
    body: config.rows,
    theme: 'grid',
    styles: {
      fontSize: 8.0,
      cellPadding: 2.2,
      textColor: [30, 41, 59],
      lineColor: [218, 222, 228],
      lineWidth: 0.2,
      overflow: 'linebreak',
      valign: 'middle',
    },
    headStyles: {
      fillColor: toRgb(BRAND_GREEN),
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      minCellHeight: 7.5,
    },
    alternateRowStyles: {
      fillColor: COLOR_ALT_ROW,
    },
    columnStyles: config.columnStyles,
    didDrawPage: (data) => {
      if (data.pageNumber > 1) {
        drawHeader(doc, { ...headerContext, showCompact: true });
        drawSectionTitle(doc, 'Report Data', 17.2);
      }
    },
  });
}

function drawFooter(doc, pageNumber, totalPages) {
  const pageHeight = doc.internal.pageSize.getHeight();
  const { left, right } = getContentBounds(doc);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...COLOR_MUTED);
  doc.setFontSize(8);
  doc.text('Citi-Nati Supermarket Sales Reports', left, pageHeight - 5);
  doc.text(`Page ${pageNumber} of ${totalPages}`, right, pageHeight - 5, { align: 'right' });
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
  const generatedText = formatGeneratedTimestamp();
  const reportTitle = 'Sales Report Export';
  const viewStats = summarizeView(activeView, {
    summary,
    invoicesState,
    productsState,
    usersState,
    paymentsState,
  });
  const metadataRows = buildMetadataRows(filters, resolvedDateRange, summaryMetaLine);
  const dataTable = tableConfig(activeView, summary, invoicesState, productsState, usersState, paymentsState);

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

  const headerContext = {
    reportTitle,
    viewLabel: activeViewLabel,
    periodText,
    generatedText,
  };

  drawHeader(doc, headerContext);

  let y = 33;
  const summaryCards = [
    { label: 'Active View', value: activeViewLabel, color: BRAND_PURPLE },
    { label: 'Visible Records', value: fmtCount(viewStats.count), color: BRAND_GREEN },
    { label: 'Visible Amount', value: fmtCurrency(viewStats.amount), color: '#0f766e' },
  ];
  y = drawSummaryCards(doc, summaryCards, y);

  drawSectionTitle(doc, 'Report Metadata', y);
  y += 3.2;
  y = drawMetadataTable(doc, metadataRows, y);

  drawSectionTitle(doc, 'Report Data', y);
  y += 3.2;
  drawMainDataTable(doc, dataTable, y, headerContext);

  const totalPages = doc.getNumberOfPages();
  for (let page = 1; page <= totalPages; page += 1) {
    doc.setPage(page);
    drawFooter(doc, page, totalPages);
  }

  const fileDate = today.toISOString().slice(0, 10);
  doc.save(`sales_${String(activeView || 'summary').toLowerCase()}_${fileDate}.pdf`);
}
