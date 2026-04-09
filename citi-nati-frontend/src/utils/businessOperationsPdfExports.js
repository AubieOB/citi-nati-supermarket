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

const fmtCurrency = (value) => `MWK ${Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtCount = (value) => Number(value || 0).toLocaleString('en-US');

const titleCase = (value) => String(value || '')
  .replace(/([A-Z])/g, ' $1')
  .replace(/[_-]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .replace(/\b\w/g, (letter) => letter.toUpperCase());

const toDate = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('en-GB');
};

const toRgb = (hex) => {
  const normalized = String(hex || '').replace('#', '');
  const value = normalized.length === 3
    ? normalized.split('').map((ch) => `${ch}${ch}`).join('')
    : normalized;
  const intVal = parseInt(value, 16);
  return [(intVal >> 16) & 255, (intVal >> 8) & 255, intVal & 255];
};

const getContentBounds = (doc) => {
  const pageWidth = doc.internal.pageSize.getWidth();
  const width = Math.min(CONTENT_MAX_WIDTH, pageWidth - (PAGE_MARGIN * 2));
  const left = (pageWidth - width) / 2;
  return { left, right: left + width, width };
};

const formatGeneratedTimestamp = () => {
  const now = new Date();
  return `${now.toLocaleDateString('en-GB')} ${now.toLocaleTimeString('en-GB')}`;
};

const drawHeader = (doc, { reportTitle, viewLabel, periodText, generatedText, showCompact = false }) => {
  const { left, right } = getContentBounds(doc);

  if (!showCompact) {
    const logoWidth = 20;
    const logoHeight = 14;
    try {
      doc.addImage(logo, 'PNG', left, 8.5, logoWidth, logoHeight);
    } catch {
      // Ignore logo rendering failures.
    }

    const titleX = left + logoWidth + 4;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(...toRgb(BRAND_PURPLE));
    doc.text('Citi-', titleX, 14);
    const citiWidth = doc.getTextWidth('Citi-');
    doc.setTextColor(...toRgb(BRAND_GREEN));
    doc.text('Nati Supermarket', titleX + citiWidth, 14);

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
  }
};

const drawSectionTitle = (doc, text, y) => {
  const { left } = getContentBounds(doc);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...COLOR_TEXT);
  doc.text(text, left, y);
};

const drawSummaryCards = (doc, cards, startY) => {
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
    doc.text(String(card.label || '').toUpperCase(), x + 2.5, startY + 4.8, { maxWidth: cardWidth - 5 });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(...toRgb(card.color || BRAND_GREEN));
    doc.text(String(card.value || '-'), x + 2.5, startY + 11.6, { maxWidth: cardWidth - 5 });
  });

  return startY + cardHeight + 6;
};

const drawMetadataTable = (doc, rows, startY) => {
  const { left, right, width } = getContentBounds(doc);
  autoTable(doc, {
    startY,
    margin: { left, right, top: 16, bottom: 12 },
    head: [['Report Metadata', 'Value']],
    body: rows.length ? rows : [['No additional metadata', '-']],
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
    alternateRowStyles: { fillColor: COLOR_ALT_ROW },
    columnStyles: {
      0: { cellWidth: 66, fontStyle: 'bold', textColor: COLOR_MUTED },
      1: { cellWidth: width - 66 },
    },
  });

  return (doc.lastAutoTable?.finalY || startY) + 6;
};

const drawMainDataTable = (doc, config, startY, headerContext) => {
  const { left, right } = getContentBounds(doc);
  autoTable(doc, {
    startY,
    margin: { left, right, top: 16, bottom: 12 },
    head: [config.headers],
    showHead: 'firstPage',
    body: config.rows.length ? config.rows : [['No rows available for current filters']],
    theme: 'grid',
    styles: {
      fontSize: 8,
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
    alternateRowStyles: { fillColor: COLOR_ALT_ROW },
    columnStyles: config.columnStyles,
    didDrawPage: (data) => {
      if (data.pageNumber > 1) {
        drawHeader(doc, { ...headerContext, showCompact: true });
      }
    },
  });
};

const drawFooter = (doc, pageNumber, totalPages) => {
  const pageHeight = doc.internal.pageSize.getHeight();
  const { left, right } = getContentBounds(doc);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...COLOR_MUTED);
  doc.setFontSize(8);
  doc.text('Citi-Nati Supermarket Business Operations Reports', left, pageHeight - 5);
  doc.text(`Page ${pageNumber} of ${totalPages}`, right, pageHeight - 5, { align: 'right' });
};

const exportWithLayout = ({ reportTitle, viewLabel, periodText, summaryCards, metadataRows, dataTable, fileName }) => {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const generatedText = formatGeneratedTimestamp();

  const headerContext = { reportTitle, viewLabel, periodText, generatedText };

  drawHeader(doc, headerContext);

  let y = 33;
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

  doc.save(fileName);
};

const kvRows = (filters = {}) => Object.entries(filters)
  .filter(([, value]) => value !== null && value !== undefined && String(value) !== '')
  .map(([key, value]) => [titleCase(key), String(value)]);

const periodFromRange = ({ startDate, endDate }) => {
  if (!startDate && !endDate) return 'Current selection';
  return `${startDate || '-'} to ${endDate || '-'}`;
};

export function exportExpensesPdf({
  activeTab,
  filters,
  selectedLocationId,
  expenses,
  categories,
  summary,
}) {
  const isCategories = activeTab === 'categories';

  const summaryCards = [
    { label: 'Active View', value: isCategories ? 'Categories' : 'Expenses', color: BRAND_PURPLE },
    { label: 'Visible Records', value: fmtCount(isCategories ? categories.length : expenses.length), color: BRAND_GREEN },
    {
      label: 'Visible Amount',
      value: fmtCurrency(isCategories ? 0 : Number(summary?.totals?.totalAmount || 0)),
      color: '#0f766e',
    },
  ];

  const metadataRows = [
    ['Tab', isCategories ? 'Expense Categories' : 'Expense List'],
    ['Period', periodFromRange(filters)],
    ['Location', selectedLocationId ? `Location #${selectedLocationId}` : 'All locations'],
    ...kvRows({ search: filters.search, expenseCategoryId: filters.expenseCategoryId }),
  ];

  const dataTable = isCategories
    ? {
      headers: ['Code', 'Name', 'Description', 'Status'],
      rows: categories.map((cat) => [
        cat.code || '-',
        cat.name || '-',
        cat.description || '-',
        cat.isActive ? 'Active' : 'Inactive',
      ]),
      columnStyles: {
        0: { cellWidth: 36 },
        1: { cellWidth: 72 },
        2: { cellWidth: 120 },
        3: { cellWidth: 28 },
      },
    }
    : {
      headers: ['Date', 'Category', 'Description', 'Method', 'Reference', 'Amount'],
      rows: expenses.map((expense) => [
        toDate(expense.expenseDate),
        expense.expenseCategory?.name || 'Uncategorized',
        expense.description || '-',
        expense.paymentMethod || '-',
        expense.referenceNo || '-',
        fmtCurrency(expense.amount),
      ]),
      columnStyles: {
        0: { cellWidth: 24 },
        1: { cellWidth: 44 },
        2: { cellWidth: 96 },
        3: { cellWidth: 28 },
        4: { cellWidth: 24 },
        5: { cellWidth: 40, halign: 'right' },
      },
    };

  const dateLabel = new Date().toISOString().slice(0, 10);
  exportWithLayout({
    reportTitle: 'Business Operations Export',
    viewLabel: `Expenses - ${isCategories ? 'Categories' : 'List'}`,
    periodText: periodFromRange(filters),
    summaryCards,
    metadataRows,
    dataTable,
    fileName: `expenses_${isCategories ? 'categories' : 'list'}_${dateLabel}.pdf`,
  });
}

export function exportEmployeesPdf({ employees, pagination, search, statusFilter, selectedLocationId }) {
  const activeCount = employees.filter((employee) => String(employee.status || '').toLowerCase() === 'active').length;

  const summaryCards = [
    { label: 'Active View', value: 'Employees', color: BRAND_PURPLE },
    { label: 'Visible Records', value: fmtCount(employees.length), color: BRAND_GREEN },
    { label: 'Active Employees', value: fmtCount(activeCount), color: '#0f766e' },
  ];

  const metadataRows = [
    ['Page Total', fmtCount(pagination?.total || employees.length)],
    ['Location', selectedLocationId ? `Location #${selectedLocationId}` : 'All locations'],
    ...kvRows({ search, status: statusFilter }),
  ];

  const dataTable = {
    headers: ['Employee', 'Emp #', 'Department', 'Position', 'Status', 'Contact', 'Salary'],
    rows: employees.map((employee) => {
      const salary = employee.salaryStructures?.[0] || null;
      return [
        [employee.firstName, employee.middleName, employee.surname].filter(Boolean).join(' ') || '-',
        employee.employeeNo || '-',
        employee.department || '-',
        employee.position || '-',
        employee.status || '-',
        employee.contactNumber || '-',
        salary ? `${salary.currency || 'MWK'} ${Number(salary.agreedSalaryPerMonth || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '-',
      ];
    }),
    columnStyles: {
      0: { cellWidth: 56 },
      1: { cellWidth: 24 },
      2: { cellWidth: 34 },
      3: { cellWidth: 42 },
      4: { cellWidth: 26 },
      5: { cellWidth: 34 },
      6: { cellWidth: 40, halign: 'right' },
    },
  };

  const dateLabel = new Date().toISOString().slice(0, 10);
  exportWithLayout({
    reportTitle: 'Business Operations Export',
    viewLabel: 'Employees',
    periodText: 'Current filters',
    summaryCards,
    metadataRows,
    dataTable,
    fileName: `employees_${dateLabel}.pdf`,
  });
}

export function exportPayrollPdf({
  selectedPeriod,
  periodFilters,
  selectedLocationId,
  periods,
  entries,
  summary,
}) {
  const exportingEntries = entries.length > 0;

  const summaryCards = [
    { label: 'Active View', value: exportingEntries ? 'Payroll Entries' : 'Payroll Periods', color: BRAND_PURPLE },
    { label: 'Visible Records', value: fmtCount(exportingEntries ? entries.length : periods.length), color: BRAND_GREEN },
    { label: 'Net Payroll', value: fmtCurrency(summary?.totalNetPay || 0), color: '#0f766e' },
  ];

  const metadataRows = [
    ['Selected Period', selectedPeriod?.description || 'None selected'],
    ['Payroll Mode', selectedPeriod?.payrollMode || '-'],
    ['Status', selectedPeriod?.status || '-'],
    ['Location', selectedLocationId ? `Location #${selectedLocationId}` : 'All locations'],
    ...kvRows(periodFilters),
  ];

  const dataTable = exportingEntries
    ? {
      headers: ['Employee', 'Basic', 'Increment', 'Gross', 'Deductions', 'Net', 'Overtime', 'Absent Days'],
      rows: entries.map((entry) => [
        [entry.employee?.firstName, entry.employee?.surname].filter(Boolean).join(' ') || '-',
        fmtCurrency(entry.basicSalary),
        fmtCurrency(entry.incrementAmount),
        fmtCurrency(entry.grossPay),
        fmtCurrency(entry.totalDeductions),
        fmtCurrency(entry.netPay),
        `${fmtCurrency(entry.overtimeAmount)} (${fmtCount(entry.overtimeHours)}h)`,
        fmtCount(entry.daysAbsent),
      ]),
      columnStyles: {
        0: { cellWidth: 46 },
        1: { cellWidth: 30, halign: 'right' },
        2: { cellWidth: 30, halign: 'right' },
        3: { cellWidth: 30, halign: 'right' },
        4: { cellWidth: 30, halign: 'right' },
        5: { cellWidth: 30, halign: 'right' },
        6: { cellWidth: 44 },
        7: { cellWidth: 16, halign: 'right' },
      },
    }
    : {
      headers: ['Period', 'Mode', 'Status', 'Entries', 'Net Total', 'Created'],
      rows: periods.map((period) => [
        period.description || `Period #${period.id}`,
        String(period.payrollMode || '-').replace('_', ' '),
        period.status || '-',
        fmtCount(period.entryCount),
        fmtCurrency(period.totalNetPay),
        toDate(period.createdAt),
      ]),
      columnStyles: {
        0: { cellWidth: 84 },
        1: { cellWidth: 34 },
        2: { cellWidth: 30 },
        3: { cellWidth: 24, halign: 'right' },
        4: { cellWidth: 44, halign: 'right' },
        5: { cellWidth: 40 },
      },
    };

  const dateLabel = new Date().toISOString().slice(0, 10);
  exportWithLayout({
    reportTitle: 'Business Operations Export',
    viewLabel: exportingEntries ? 'Payroll Entries' : 'Payroll Periods',
    periodText: 'Current filters',
    summaryCards,
    metadataRows,
    dataTable,
    fileName: `payroll_${exportingEntries ? 'entries' : 'periods'}_${dateLabel}.pdf`,
  });
}

export function exportSuppliersPdf({
  suppliers,
  pagination,
  selectedSupplier,
  selectedSummary,
  search,
  statusFilter,
  selectedLocationId,
}) {
  const activeSuppliers = suppliers.filter((supplier) => String(supplier.status || '').toLowerCase() === 'active').length;

  const summaryCards = [
    { label: 'Active View', value: 'Suppliers', color: BRAND_PURPLE },
    { label: 'Visible Records', value: fmtCount(suppliers.length), color: BRAND_GREEN },
    { label: 'Selected Balance', value: fmtCurrency(selectedSummary?.outstandingBalance || 0), color: '#0f766e' },
  ];

  const metadataRows = [
    ['Page Total', fmtCount(pagination?.total || suppliers.length)],
    ['Active on Page', fmtCount(activeSuppliers)],
    ['Selected Supplier', selectedSupplier?.name || 'None selected'],
    ['Location', selectedLocationId ? `Location #${selectedLocationId}` : 'All locations'],
    ...kvRows({ search, status: statusFilter }),
  ];

  const dataTable = {
    headers: ['Supplier', 'Code', 'Contact', 'Status', 'Opening', 'Current'],
    rows: suppliers.map((supplier) => [
      supplier.name || '-',
      supplier.supplierCode || '-',
      supplier.contactPerson || supplier.phone || supplier.email || '-',
      supplier.status || '-',
      fmtCurrency(supplier.openingBalance),
      fmtCurrency(supplier.currentBalance),
    ]),
    columnStyles: {
      0: { cellWidth: 70 },
      1: { cellWidth: 28 },
      2: { cellWidth: 62 },
      3: { cellWidth: 26 },
      4: { cellWidth: 35, halign: 'right' },
      5: { cellWidth: 35, halign: 'right' },
    },
  };

  const dateLabel = new Date().toISOString().slice(0, 10);
  exportWithLayout({
    reportTitle: 'Business Operations Export',
    viewLabel: 'Suppliers',
    periodText: 'Current filters',
    summaryCards,
    metadataRows,
    dataTable,
    fileName: `suppliers_${dateLabel}.pdf`,
  });
}

export function exportMonthlySummaryPdf({
  filters,
  activeRange,
  selectedLocationId,
  selectedLocationCode,
  salesState,
  expensesState,
  payrollState,
  supplierState,
}) {
  const salesTotal = Number(salesState.summary?.netSales || 0);
  const expensesTotal = Number(expensesState.summary?.totals?.totalAmount || 0);
  const payrollTotal = Number(payrollState.data?.totalNetPay || 0);
  const supplierPaymentsTotal = Number(supplierState.data?.totalPayments || 0);
  const netPosition = salesTotal - expensesTotal - payrollTotal - supplierPaymentsTotal;

  const summaryCards = [
    { label: 'Total Sales', value: fmtCurrency(salesTotal), color: BRAND_PURPLE },
    { label: 'Total Expenses', value: fmtCurrency(expensesTotal), color: '#b45309' },
    { label: 'Net Position', value: fmtCurrency(netPosition), color: netPosition >= 0 ? '#166534' : '#b91c1c' },
  ];

  const periodText = filters.periodType === 'month'
    ? `${String(filters.month).padStart(2, '0')}/${filters.year}`
    : periodFromRange(activeRange);

  const metadataRows = [
    ['Period Type', titleCase(filters.periodType)],
    ['Reporting Period', periodText],
    ['Location', selectedLocationId ? `Location #${selectedLocationId}` : (selectedLocationCode || 'All locations')],
  ];

  const dataTable = {
    headers: ['Section', 'Metric', 'Value'],
    rows: [
      ['Sales', 'Net Sales', fmtCurrency(salesTotal)],
      ['Sales', 'Invoices', fmtCount(salesState.summary?.totalInvoices)],
      ['Sales', 'Average Invoice', fmtCurrency(salesState.summary?.averageInvoiceValue)],
      ['Expenses', 'Total Expenses', fmtCurrency(expensesTotal)],
      ['Expenses', 'Records', fmtCount(expensesState.summary?.totals?.totalExpenses)],
      ['Payroll', 'Total Net Pay', fmtCurrency(payrollTotal)],
      ['Payroll', 'Employees Paid', fmtCount(payrollState.data?.employeeCount)],
      ['Suppliers', 'Total Payments', fmtCurrency(supplierPaymentsTotal)],
      ['Suppliers', 'Outstanding Debt', fmtCurrency(supplierState.data?.outstandingDebt)],
      ['Overall', 'Net Position', fmtCurrency(netPosition)],
    ],
    columnStyles: {
      0: { cellWidth: 52 },
      1: { cellWidth: 116 },
      2: { cellWidth: 88, halign: 'right' },
    },
  };

  const dateLabel = new Date().toISOString().slice(0, 10);
  exportWithLayout({
    reportTitle: 'Business Operations Export',
    viewLabel: 'Monthly Summary',
    periodText,
    summaryCards,
    metadataRows,
    dataTable,
    fileName: `monthly_summary_${dateLabel}.pdf`,
  });
}

export function exportGoodsIntakeRecordPdf({ record, companyName = 'Citi-Nati Supermarket' }) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const generatedText = formatGeneratedTimestamp();
  const purchaseDate = toDate(record?.purchaseDate);
  const supplierName = record?.supplier?.name || record?.manualSupplierName || '-';
  const locationName = record?.locationName || record?.locationCode || '-';
  const intakeRef = record?.intakeRef || `GI-${new Date().toISOString().slice(0, 10)}`;
  const receiptReference = record?.receiptReference || '-';
  const supplierStoreRef = record?.supplierStoreRef || '-';
  const status = String(record?.status || 'draft').toUpperCase();
  const notes = record?.overallNotes || '-';
  const totalItems = Number(record?.totalItems || record?._count?.items || (record?.items || []).length || 0);
  const totalQty = Number(record?.totalQuantity || 0);
  const totalCost = Number(record?.totalCost || 0);
  const totalProfit = Number(record?.totalEstimatedProfit || 0);

  const headerContext = {
    reportTitle: 'Goods Intake Record',
    viewLabel: 'Purchase Intake Register',
    periodText: purchaseDate,
    generatedText,
  };

  drawHeader(doc, headerContext);
  const summaryCards = [
    { label: 'Intake Ref', value: intakeRef, color: BRAND_PURPLE },
    { label: 'Status', value: status, color: status === 'FINALIZED' ? BRAND_GREEN : '#1d4ed8' },
    { label: 'Total Cost', value: fmtCurrency(totalCost), color: '#0f766e' },
    { label: 'Est. Profit', value: fmtCurrency(totalProfit), color: totalProfit >= 0 ? '#166534' : '#b91c1c' },
  ];

  let y = 33;
  y = drawSummaryCards(doc, summaryCards, y);
  drawSectionTitle(doc, 'Intake Header', y);
  y += 3.2;

  const metadataRows = [
    ['Company', companyName],
    ['Supplier', supplierName],
    ['Supplier/Store Ref', supplierStoreRef],
    ['Purchase Date', purchaseDate],
    ['Receipt Reference', receiptReference],
    ['Branch/Location', locationName],
    ['Entered By', record?.enteredBy || '-'],
    ['Receipt Total (Optional)', record?.receiptTotalAmount == null ? '-' : fmtCurrency(record.receiptTotalAmount)],
    ['Total Lines', fmtCount(totalItems)],
    ['Total Quantity', fmtCount(totalQty)],
    ['Overall Notes', notes],
  ];

  y = drawMetadataTable(doc, metadataRows, y);
  drawSectionTitle(doc, 'Purchased Items', y);
  y += 3.2;

  const rows = (record?.items || []).map((item, index) => [
    String(index + 1),
    item?.barcode || '-',
    item?.productName || '-',
    fmtCount(item?.quantity || 0),
    fmtCurrency(item?.unitCost || 0),
    fmtCurrency(item?.totalCost || 0),
    item?.sellingPrice == null ? '-' : fmtCurrency(item.sellingPrice),
    item?.marginPercent == null ? '-' : `${Number(item.marginPercent).toFixed(2)}%`,
    fmtCurrency(item?.estimatedProfit || 0),
    toDate(item?.expiryDate),
    item?.batchRef || '-',
    item?.lineNotes || '-',
  ]);

  drawMainDataTable(doc, {
    headers: ['#', 'Barcode', 'Product Name', 'Qty', 'Unit Cost', 'Total Cost', 'Sell Price', 'Margin', 'Est. Profit', 'Expiry', 'Batch', 'Notes'],
    rows,
    columnStyles: {
      0: { cellWidth: 9, halign: 'center' },
      1: { cellWidth: 24 },
      2: { cellWidth: 54 },
      3: { cellWidth: 16, halign: 'right' },
      4: { cellWidth: 20, halign: 'right' },
      5: { cellWidth: 22, halign: 'right' },
      6: { cellWidth: 22, halign: 'right' },
      7: { cellWidth: 16, halign: 'right' },
      8: { cellWidth: 24, halign: 'right' },
      9: { cellWidth: 22 },
      10: { cellWidth: 22 },
      11: { cellWidth: 36 },
    },
  }, y, headerContext);

  const finalY = doc.lastAutoTable?.finalY || y;
  const { left, right } = getContentBounds(doc);
  const signatureY = Math.min(finalY + 16, doc.internal.pageSize.getHeight() - 24);

  doc.setDrawColor(...COLOR_BORDER);
  doc.line(left, signatureY, left + 70, signatureY);
  doc.line(right - 70, signatureY, right, signatureY);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...COLOR_MUTED);
  doc.text('Prepared By', left, signatureY + 4);
  doc.text('Verified By', right - 70, signatureY + 4);

  const totalPages = doc.getNumberOfPages();
  for (let page = 1; page <= totalPages; page += 1) {
    doc.setPage(page);
    drawFooter(doc, page, totalPages);
  }

  const safeRef = String(intakeRef).replace(/[^A-Za-z0-9_-]/g, '_');
  doc.save(`goods_intake_${safeRef}.pdf`);
}
