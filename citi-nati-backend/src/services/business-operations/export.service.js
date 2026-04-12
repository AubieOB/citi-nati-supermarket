'use strict';

const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');

const { resolvePeriod, formatDateRange } = require('../../utils/reportingPeriod');
const { extractFilters, buildInvoiceWhere, buildItemWhere } = require('../../utils/reportingFilters');
const { formatBusinessDateKey, formatBusinessDateTimeLabel } = require('../../utils/businessTime');
const {
  querySalesSummary,
  queryInvoiceList,
  queryProductReport,
  queryUserReport,
  queryPaymentReport,
} = require('../salesReporting.service');
const expensesService = require('./expenses.service');
const suppliersService = require('./suppliers.service');
const payrollService = require('./payroll.service');
const employeesService = require('./employees.service');

const COMPANY_NAME = 'Citi-Nati Supermarket';
const COMPANY_CONTACT = process.env.EXPORT_COMPANY_CONTACT || 'Blantyre, Malawi';
const MWK_FORMAT = '"MWK" #,##0.00';
const EXCEL_BRAND_PURPLE = 'FF5B4B8A';
const EXCEL_BRAND_GREEN = 'FF2D8659';
const EXCEL_TEXT_DARK = 'FF0F172A';
const EXCEL_TEXT_MUTED = 'FF64748B';
const EXCEL_BG_LIGHT = 'FFF8FAFC';
const EXCEL_BG_ALT = 'FFF6F8FC';
const EXCEL_BORDER = 'FFE2E8F0';
const PDF_BRAND_PURPLE = '#5B4B8A';
const PDF_BRAND_GREEN = '#2D8659';
const PDF_BRAND_ORANGE = '#B45309';
const PDF_SLATE = '#111827';
const PDF_MUTED = '#6B7280';

function money(value) {
  return Number(value || 0);
}

function toDateString(value) {
  if (!value) return '';
  return formatBusinessDateKey(value) || '';
}

function titleCase(value) {
  return String(value || '')
    .replace(/[_-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function sanitizeFilePart(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'report';
}

function logoPathCandidates() {
  return [
    process.env.EXPORT_LOGO_PATH,
    path.resolve(__dirname, '../../../../citi-nati-frontend/src/assets/citi-nati-logo.png.png'),
    path.resolve(__dirname, '../../../../citi-nati-frontend/src/assets/citi-nati-logo.png'),
    path.resolve(process.cwd(), 'citi-nati-frontend/src/assets/citi-nati-logo.png.png'),
    path.resolve(process.cwd(), 'citi-nati-frontend/src/assets/citi-nati-logo.png'),
  ].filter(Boolean);
}

function resolveLogoPath() {
  return logoPathCandidates().find((candidate) => fs.existsSync(candidate)) || null;
}

function chunkRows(rows, maxRowsPerPage = 32) {
  const chunks = [];
  for (let i = 0; i < rows.length; i += maxRowsPerPage) {
    chunks.push(rows.slice(i, i + maxRowsPerPage));
  }
  return chunks.length ? chunks : [[]];
}

function ensurePeriodFilters(filters = {}) {
  const now = new Date();
  return {
    periodType: filters.periodType || 'month',
    date: filters.date,
    month: filters.month || String(now.getMonth() + 1),
    year: filters.year || String(now.getFullYear()),
    quarter: filters.quarter,
    startDate: filters.startDate,
    endDate: filters.endDate,
    branchCode: filters.branchCode,
    syncSourceCode: filters.syncSourceCode,
    locationCode: filters.locationCode,
    locationId: filters.locationId,
    userName: filters.userName,
    productCode: filters.productCode,
    productName: filters.productName,
    payMethod: filters.payMethod,
    invoiceType: filters.invoiceType,
  };
}

function resolveMonthlyRange(filters = {}) {
  const now = new Date();
  const periodType = filters.periodType === 'custom' ? 'custom' : 'month';

  if (periodType === 'custom') {
    const startDate = filters.startDate;
    const endDate = filters.endDate;
    if (!startDate || !endDate) {
      throw new Error('startDate and endDate are required for monthly-summary custom range export');
    }
    return {
      periodType: 'custom',
      startDate,
      endDate,
      label: `${startDate} to ${endDate}`,
    };
  }

  const year = Number(filters.year || now.getFullYear());
  const month = Number(filters.month || now.getMonth() + 1);
  const startDate = toDateString(new Date(year, month - 1, 1));
  const endDate = toDateString(new Date(year, month, 0));
  return {
    periodType: 'month',
    month,
    year,
    startDate,
    endDate,
    label: `${String(month).padStart(2, '0')}/${year}`,
  };
}

async function collectPaged(fetchPage, pageSize = 500) {
  const rows = [];
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages) {
    const pagination = { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
    const result = await fetchPage(pagination);
    // Handle polymorphic data structures: result.data, result.invoices, result.products, etc.
    let data = [];
    if (Array.isArray(result.data)) {
      data = result.data;
    } else {
      // Look for first array property (invoices, products, users, payments, expenses, etc.)
      const arrayKey = Object.keys(result).find(
        key => Array.isArray(result[key]) && key !== 'total' && key !== 'pagination'
      );
      data = arrayKey ? result[arrayKey] : [];
    }
    
    const total = Number(result.total || result.pagination?.total || result.pagination?.count || 0);

    rows.push(...data);
    totalPages = Math.max(1, Math.ceil(total / pageSize));
    page += 1;
  }

  return rows;
}

function setWorksheetColumns(sheet, columns) {
  sheet.columns = columns.map((column) => ({
    header: column.header,
    key: column.key,
    width: column.width || 18,
  }));

  const headerRow = sheet.getRow(1);
  headerRow.height = 24;
  for (let colIndex = 1; colIndex <= columns.length; colIndex += 1) {
    const cell = headerRow.getCell(colIndex);
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: EXCEL_BRAND_PURPLE } };
    cell.alignment = { vertical: 'middle', horizontal: 'left' };
    cell.border = {
      top: { style: 'thin', color: { argb: EXCEL_BORDER } },
      left: { style: 'thin', color: { argb: EXCEL_BORDER } },
      bottom: { style: 'thin', color: { argb: EXCEL_BORDER } },
      right: { style: 'thin', color: { argb: EXCEL_BORDER } },
    };
  }
}

function appendRows(sheet, columns, rows) {
  rows.forEach((row) => {
    const excelRow = sheet.addRow(row);
    columns.forEach((column, index) => {
      const cell = excelRow.getCell(index + 1);
      if (column.type === 'currency') {
        cell.numFmt = MWK_FORMAT;
      }
      if (column.type === 'number') {
        cell.numFmt = '#,##0.00';
      }
      if (column.type === 'integer') {
        cell.numFmt = '#,##0';
      }
      if (column.type === 'date') {
        cell.numFmt = 'yyyy-mm-dd';
      }
      cell.border = {
        top: { style: 'thin', color: { argb: EXCEL_BORDER } },
        left: { style: 'thin', color: { argb: EXCEL_BORDER } },
        bottom: { style: 'thin', color: { argb: EXCEL_BORDER } },
        right: { style: 'thin', color: { argb: EXCEL_BORDER } },
      };
      cell.alignment = { vertical: 'top', horizontal: column.align || 'left' };
    });
  });
}

function addTotalsRow(sheet, columns, totals = {}) {
  if (!totals || !Object.keys(totals).length) return;
  const row = sheet.addRow(totals);
  row.font = { bold: true };
  columns.forEach((column, index) => {
    const cell = row.getCell(index + 1);
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8EEF9' } };
    cell.border = {
      top: { style: 'thin', color: { argb: EXCEL_BORDER } },
      left: { style: 'thin', color: { argb: EXCEL_BORDER } },
      bottom: { style: 'thin', color: { argb: EXCEL_BORDER } },
      right: { style: 'thin', color: { argb: EXCEL_BORDER } },
    };
    if (column.type === 'currency') cell.numFmt = MWK_FORMAT;
    if (column.type === 'number') cell.numFmt = '#,##0.00';
    if (column.type === 'integer') cell.numFmt = '#,##0';
  });
}

function styleExcelDataRows(sheet, headerRowIndex) {
  const totalRows = sheet.rowCount;
  const columnCount = Math.max(1, sheet.columnCount);
  let stripe = false;

  for (let rowIndex = headerRowIndex + 1; rowIndex <= totalRows; rowIndex += 1) {
    const row = sheet.getRow(rowIndex);
    const first = String(row.getCell(1).value || '').toUpperCase();
    const isTotals = first === 'TOTAL';

    for (let colIndex = 1; colIndex <= columnCount; colIndex += 1) {
      const cell = row.getCell(colIndex);
      if (!isTotals) {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: stripe ? EXCEL_BG_ALT : 'FFFFFFFF' },
        };
      }

      if (!cell.border) {
        cell.border = {
          top: { style: 'thin', color: { argb: EXCEL_BORDER } },
          left: { style: 'thin', color: { argb: EXCEL_BORDER } },
          bottom: { style: 'thin', color: { argb: EXCEL_BORDER } },
          right: { style: 'thin', color: { argb: EXCEL_BORDER } },
        };
      }
    }

    if (!isTotals) stripe = !stripe;
  }
}

function applyExcelSheetBranding(workbook, sheet, report) {
  const headerRowIndex = 7;
  const generatedText = new Date().toLocaleString('en-GB');
  const periodText = getReportPeriodText(report);
  const filtersText = buildAppliedFilterText(report.filters || {});

  sheet.spliceRows(1, 0, [], [], [], [], [], []);

  const maxCol = Math.max(2, sheet.columnCount || 2);
  sheet.mergeCells(1, 1, 1, maxCol);
  sheet.mergeCells(2, 1, 2, maxCol);
  sheet.mergeCells(3, 1, 3, maxCol);
  sheet.mergeCells(4, 1, 4, maxCol);
  sheet.mergeCells(5, 1, 5, maxCol);
  sheet.mergeCells(6, 1, 6, maxCol);

  sheet.getCell('A1').value = {
    richText: [
      { text: 'Citi-', font: { name: 'Calibri', size: 18, bold: true, color: { argb: EXCEL_BRAND_PURPLE } } },
      { text: 'Nati Supermarket', font: { name: 'Calibri', size: 18, bold: true, color: { argb: EXCEL_BRAND_GREEN } } },
    ],
  };
  sheet.getCell('A1').alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };

  sheet.getCell('A2').value = `${report.title} - ${sheet.name}`;
  sheet.getCell('A2').font = { bold: true, size: 12, color: { argb: EXCEL_TEXT_DARK } };

  sheet.getCell('A3').value = `Reporting Period: ${periodText}`;
  sheet.getCell('A3').font = { size: 10, color: { argb: EXCEL_TEXT_MUTED } };

  sheet.getCell('A4').value = `Generated: ${generatedText}`;
  sheet.getCell('A4').font = { size: 10, color: { argb: EXCEL_TEXT_MUTED } };

  sheet.getCell('A5').value = `Applied Filters: ${filtersText}`;
  sheet.getCell('A5').font = { size: 10, color: { argb: EXCEL_TEXT_MUTED } };
  sheet.getCell('A5').alignment = { vertical: 'top', horizontal: 'left', wrapText: true };

  sheet.getCell('A6').value = COMPANY_CONTACT;
  sheet.getCell('A6').font = { size: 9, color: { argb: EXCEL_TEXT_MUTED }, italic: true };

  [1, 2, 3, 4, 5, 6].forEach((rowNo) => {
    const row = sheet.getRow(rowNo);
    row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: EXCEL_BG_LIGHT } };
  });

  sheet.getRow(1).height = 24;
  sheet.getRow(2).height = 20;
  sheet.getRow(3).height = 16;
  sheet.getRow(4).height = 16;
  sheet.getRow(5).height = 28;
  sheet.getRow(6).height = 14;

  const headerRow = sheet.getRow(headerRowIndex);
  headerRow.height = 24;
  const columnCount = Math.max(1, sheet.columnCount);
  for (let colIndex = 1; colIndex <= columnCount; colIndex += 1) {
    const cell = headerRow.getCell(colIndex);
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: EXCEL_BRAND_PURPLE } };
    cell.alignment = { vertical: 'middle', horizontal: 'left' };
    cell.border = {
      top: { style: 'thin', color: { argb: EXCEL_BORDER } },
      left: { style: 'thin', color: { argb: EXCEL_BORDER } },
      bottom: { style: 'thin', color: { argb: EXCEL_BORDER } },
      right: { style: 'thin', color: { argb: EXCEL_BORDER } },
    };
  }

  styleExcelDataRows(sheet, headerRowIndex);
}

function hexToRgb(hex) {
  const normalized = String(hex || '').replace('#', '');
  const full = normalized.length === 3
    ? normalized.split('').map((ch) => `${ch}${ch}`).join('')
    : normalized;

  const value = parseInt(full, 16);
  return [
    (value >> 16) & 255,
    (value >> 8) & 255,
    value & 255,
  ];
}

function formatCurrencyDisplay(value) {
  return `MWK ${Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatCountDisplay(value) {
  return Number(value || 0).toLocaleString('en-US');
}

function getReportPeriodText(report) {
  if (report?.dateRange?.startDate && report?.dateRange?.endDate) {
    return `${report.dateRange.startDate} to ${report.dateRange.endDate}`;
  }

  if (report?.range?.startDate && report?.range?.endDate) {
    return `${report.range.startDate} to ${report.range.endDate}`;
  }

  if (report?.filters?.startDate && report?.filters?.endDate) {
    return `${report.filters.startDate} to ${report.filters.endDate}`;
  }

  if (report?.filters?.month && report?.filters?.year) {
    return `${String(report.filters.month).padStart(2, '0')}/${report.filters.year}`;
  }

  return 'Current selection';
}

function buildAppliedFilterText(filters = {}) {
  const ignored = new Set(['periodType', 'date', 'month', 'year', 'quarter', 'startDate', 'endDate']);
  const entries = Object.entries(filters)
    .filter(([key, value]) => !ignored.has(key) && value !== null && value !== undefined && value !== '')
    .map(([key, value]) => `${titleCase(key)}: ${value}`);

  return entries.length ? entries.join(', ') : 'None (selected period only)';
}

function createPdfContext(report) {
  return {
    title: report.title,
    subtitle: `${titleCase(report.module)} • ${titleCase(report.type || 'summary')}`,
    periodText: getReportPeriodText(report),
    generatedText: formatBusinessDateTimeLabel(new Date()),
  };
}

function drawPdfHeader(doc, context) {
  const margin = doc.page.margins.left;
  const pageWidth = doc.page.width;
  const logoPath = resolveLogoPath();

  doc.y = 34;

  if (logoPath) {
    doc.image(logoPath, margin, 28, { fit: [42, 42], align: 'left' });
  }

  doc.font('Helvetica-Bold').fontSize(20);
  const brandLeft = 'Citi';
  const brandRight = '- Nati Supermarket';
  const leftWidth = doc.widthOfString(brandLeft);
  const rightWidth = doc.widthOfString(brandRight);
  const totalWidth = leftWidth + rightWidth + 3;
  const brandX = (pageWidth / 2) - (totalWidth / 2);

  doc.fillColor(PDF_BRAND_PURPLE).text(brandLeft, brandX, 34, { lineBreak: false });
  doc.fillColor(PDF_BRAND_GREEN).text(brandRight, brandX + leftWidth + 3, 34, { lineBreak: false });

  doc
    .fillColor(PDF_SLATE)
    .font('Helvetica-Bold')
    .fontSize(13)
    .text(context.title, margin, 58, { width: pageWidth - (margin * 2), align: 'center' })
    .font('Helvetica')
    .fontSize(9.5)
    .fillColor(PDF_MUTED)
    .text(context.subtitle, margin, 74, { width: pageWidth - (margin * 2), align: 'center' })
    .text(`Period: ${context.periodText}`, margin, 88, { width: 220, align: 'left' })
    .text(`Generated: ${context.generatedText}`, pageWidth - margin - 220, 88, { width: 220, align: 'right' })
    .text(COMPANY_CONTACT, margin, 102, { width: pageWidth - (margin * 2), align: 'center' });

  doc
    .moveTo(margin, 118)
    .lineTo(pageWidth - margin, 118)
    .lineWidth(1.5)
    .strokeColor(PDF_BRAND_GREEN)
    .stroke();

  doc.y = 130;
}

function addPdfPage(doc, context) {
  doc.addPage();
  drawPdfHeader(doc, context);
}

function ensurePdfSpace(doc, neededHeight, context) {
  if (doc.y + neededHeight > doc.page.height - 48) {
    addPdfPage(doc, context);
  }
}

function drawPdfSummaryCards(doc, cards, context) {
  if (!cards.length) return;

  const margin = doc.page.margins.left;
  const pageWidth = doc.page.width - (margin * 2);
  const columns = Math.min(3, cards.length);
  const gap = 10;
  const cardWidth = (pageWidth - (gap * (columns - 1))) / columns;
  const cardHeight = 40;

  for (let index = 0; index < cards.length; index += columns) {
    const rowCards = cards.slice(index, index + columns);
    ensurePdfSpace(doc, cardHeight + 8, context);
    const y = doc.y;

    rowCards.forEach((card, rowIndex) => {
      const x = margin + (rowIndex * (cardWidth + gap));
      const fill = hexToRgb(card.fill || '#F8FAFC');
      const accent = hexToRgb(card.accent || PDF_BRAND_PURPLE);

      doc.roundedRect(x, y, cardWidth, cardHeight, 4, 4).fillAndStroke(fill, '#E2E8F0');
      doc
        .fillColor('#6B7280')
        .font('Helvetica-Bold')
        .fontSize(7.5)
        .text(String(card.label || '').toUpperCase(), x + 8, y + 8, { width: cardWidth - 16, ellipsis: true })
        .fillColor(accent)
        .font('Helvetica-Bold')
        .fontSize(12)
        .text(card.value, x + 8, y + 20, { width: cardWidth - 16, ellipsis: true });
    });

    doc.y = y + cardHeight + 8;
  }
}

function drawPdfInfoBand(doc, items, context) {
  if (!items.length) return;
  ensurePdfSpace(doc, 28 + (items.length * 10), context);

  const margin = doc.page.margins.left;
  const width = doc.page.width - (margin * 2);
  const height = 16 + (items.length * 10);
  const y = doc.y;

  doc.roundedRect(margin, y, width, height, 4, 4).fillAndStroke('#F5F5F5', '#E5E7EB');

  let cursorY = y + 8;
  items.forEach((item) => {
    doc
      .fillColor(PDF_MUTED)
      .font('Helvetica')
      .fontSize(9)
      .text(`${item.label}:`, margin + 10, cursorY, { continued: true })
      .fillColor(PDF_SLATE)
      .font('Helvetica-Bold')
      .text(` ${item.value}`);
    cursorY += 10;
  });

  doc.y = y + height + 10;
}

function drawPdfNoDataMessage(doc, message, context) {
  ensurePdfSpace(doc, 52, context);

  const margin = doc.page.margins.left;
  const width = doc.page.width - (margin * 2);
  const y = doc.y;

  doc.roundedRect(margin, y, width, 42, 6).fillAndStroke('#F8FAFC', '#CBD5E1');
  doc
    .fillColor(PDF_MUTED)
    .font('Helvetica-Oblique')
    .fontSize(9)
    .text(message, margin + 10, y + 14, { width: width - 20, align: 'center' });

  doc.y = y + 52;
}

function drawPdfSectionTitle(doc, title, context) {
  ensurePdfSpace(doc, 24, context);

  const margin = doc.page.margins.left;
  const width = doc.page.width - (margin * 2);
  const y = doc.y;

  doc.roundedRect(margin, y, width, 18, 3, 3).fillAndStroke('#F8FAFC', '#E2E8F0');
  doc
    .fillColor(PDF_SLATE)
    .font('Helvetica-Bold')
    .fontSize(11)
    .text(title, margin + 8, y + 5, { width: width - 16 });
  doc.y = y + 24;
}

function drawPdfTable(doc, columns, rows, context) {
  if (!rows.length) {
    ensurePdfSpace(doc, 20, context);
    doc.font('Helvetica').fontSize(9.5).fillColor(PDF_MUTED).text('No rows available for this section.');
    doc.moveDown(0.8);
    return;
  }

  const margin = doc.page.margins.left;
  const availableWidth = doc.page.width - (margin * 2);
  const totalWeight = columns.reduce((sum, column) => sum + (column.weight || 1), 0);
  const widths = columns.map((column) => (availableWidth * (column.weight || 1)) / totalWeight);
  const headerHeight = 18;
  const rowHeight = 18;

  const drawTableHeader = () => {
    let x = margin;
    const y = doc.y;

    columns.forEach((column, index) => {
      doc.rect(x, y, widths[index], headerHeight).fillAndStroke(PDF_BRAND_GREEN, '#D1D5DB');
      doc
        .fillColor('#FFFFFF')
        .font('Helvetica-Bold')
        .fontSize(8.2)
        .text(column.header, x + 4, y + 5, { width: widths[index] - 8, ellipsis: true });
      x += widths[index];
    });

    doc.y = y + headerHeight;
  };

  ensurePdfSpace(doc, headerHeight + rowHeight, context);
  drawTableHeader();

  rows.forEach((row, rowIndex) => {
    if (doc.y + rowHeight > doc.page.height - 48) {
      addPdfPage(doc, context);
      drawTableHeader();
    }

    let x = margin;
    const y = doc.y;
    const fillColor = rowIndex % 2 === 0 ? '#FFFFFF' : '#FAFAFA';

    columns.forEach((column, index) => {
      const value = row[column.key] === null || row[column.key] === undefined ? '' : String(row[column.key]);
      doc.rect(x, y, widths[index], rowHeight).fillAndStroke(fillColor, '#E5E7EB');
      doc
        .fillColor(PDF_SLATE)
        .font('Helvetica')
        .fontSize(8)
        .text(value, x + 4, y + 5, {
          width: widths[index] - 8,
          align: column.align || 'left',
          ellipsis: true,
        });
      x += widths[index];
    });

    doc.y = y + rowHeight;
  });

  doc.moveDown(0.6);
}

async function buildSalesReport(type, filters) {
  const query = ensurePeriodFilters(filters);
  const period = resolvePeriod(query);
  if (period.error) {
    throw new Error(period.error);
  }

  const reportFilters = extractFilters(query);
  const invoiceWhere = buildInvoiceWhere(period, reportFilters);
  const itemWhere = buildItemWhere(period, reportFilters);
  const dateRange = formatDateRange(period.startDate, period.endDate);

  const includeSummary = type === 'summary' || type === 'all';
  const includeInvoices = type === 'invoices' || type === 'all';
  const includeProducts = type === 'products' || type === 'all';
  const includeUsers = type === 'users' || type === 'all';
  const includePayments = type === 'payments' || type === 'all';

  const data = { summary: null, invoices: [], products: [], users: [], payments: [] };

  if (includeSummary) {
    data.summary = await querySalesSummary(invoiceWhere);
  }

  if (includeInvoices) {
    data.invoices = await collectPaged((pagination) => queryInvoiceList(invoiceWhere, pagination, { sortBy: 'invoiceDate', sortOrder: 'desc' }));
  }

  if (includeProducts) {
    data.products = await collectPaged((pagination) => queryProductReport(itemWhere, pagination, { sortBy: 'totalQuantitySold', sortOrder: 'desc' }));
  }

  if (includeUsers) {
    data.users = await collectPaged((pagination) => queryUserReport(invoiceWhere, pagination, { sortBy: 'totalInvoices', sortOrder: 'desc' }));
  }

  if (includePayments) {
    data.payments = await queryPaymentReport(invoiceWhere);
  }

  return {
    module: 'sales',
    title: 'Sales Report',
    type,
    dateRange,
    filters: query,
    data,
  };
}

async function buildExpensesReport(type, filters = {}) {
  const listFilters = {
    search: filters.search ? String(filters.search).trim() : null,
    expenseCategoryId: Number(filters.expenseCategoryId) || null,
    locationId: Number(filters.locationId) || null,
    reportingPeriodId: Number(filters.reportingPeriodId) || null,
    startDate: filters.startDate ? new Date(`${filters.startDate}T00:00:00`) : null,
    endDate: filters.endDate ? new Date(`${filters.endDate}T23:59:59`) : null,
  };

  const includeList = type === 'list' || type === 'all';
  const includeSummary = type === 'summary' || type === 'all';
  const includeCategories = type === 'category-summary' || type === 'all';

  const data = { expenses: [], summary: null, categories: [] };

  if (includeList) {
    data.expenses = await collectPaged((pagination) => expensesService.listExpenses({
      ...listFilters,
      skip: pagination.skip,
      take: pagination.take,
      sortBy: 'expenseDate',
      sortOrder: 'desc',
    }));
  }

  if (includeSummary || includeCategories) {
    data.summary = await expensesService.getExpenseSummary(listFilters);
  }

  if (includeCategories) {
    data.categories = await collectPaged((pagination) => expensesService.listExpenseCategories({
      search: null,
      isActive: null,
      skip: pagination.skip,
      take: pagination.take,
      sortBy: 'name',
      sortOrder: 'asc',
    }));
  }

  return {
    module: 'expenses',
    title: 'Expense Report',
    type,
    filters,
    data,
  };
}

async function buildSuppliersReport(type, filters = {}) {
  const supplierFilters = {
    search: filters.search ? String(filters.search).trim() : null,
    status: filters.status ? String(filters.status).trim().toLowerCase() : null,
  };

  const includeList = type === 'list' || type === 'all';
  const includeTransactions = type === 'transactions' || type === 'all';
  const includeBalances = type === 'balances' || type === 'all';

  const data = {
    suppliers: [],
    transactions: [],
    balances: {
      totalSuppliers: 0,
      activeSuppliers: 0,
      totalDebt: 0,
      totalCredit: 0,
    },
  };

  if (includeList || includeBalances) {
    data.suppliers = await collectPaged((pagination) => suppliersService.listSuppliers({
      ...supplierFilters,
      skip: pagination.skip,
      take: pagination.take,
      sortBy: 'createdAt',
      sortOrder: 'desc',
    }));

    data.balances.totalSuppliers = data.suppliers.length;
    data.balances.activeSuppliers = data.suppliers.filter((supplier) => String(supplier.status || '').toLowerCase() === 'active').length;
    data.balances.totalDebt = data.suppliers.reduce((sum, supplier) => {
      const balance = Number(supplier.currentBalance || 0);
      return sum + (balance > 0 ? balance : 0);
    }, 0);
    data.balances.totalCredit = Math.abs(data.suppliers.reduce((sum, supplier) => {
      const balance = Number(supplier.currentBalance || 0);
      return sum + (balance < 0 ? balance : 0);
    }, 0));
  }

  if (includeTransactions) {
    const txFilters = {
      supplierId: Number(filters.supplierId) || null,
      reportingPeriodId: Number(filters.reportingPeriodId) || null,
      transactionType: filters.transactionType ? String(filters.transactionType).toLowerCase() : null,
      paymentMethod: filters.paymentMethod ? String(filters.paymentMethod).toLowerCase() : null,
      startDate: filters.startDate ? new Date(`${filters.startDate}T00:00:00`) : null,
      endDate: filters.endDate ? new Date(`${filters.endDate}T23:59:59`) : null,
      search: filters.search ? String(filters.search).trim() : null,
    };

    data.transactions = await collectPaged((pagination) => suppliersService.listSupplierTransactions({
      ...txFilters,
      skip: pagination.skip,
      take: pagination.take,
      sortBy: 'transactionDate',
      sortOrder: 'desc',
    }));
  }

  return {
    module: 'suppliers',
    title: 'Supplier Report',
    type,
    filters,
    data,
  };
}

async function buildPayrollReport(type, filters = {}) {
  const periodFilters = {
    search: filters.search ? String(filters.search).trim() : null,
    status: filters.status ? String(filters.status).trim() : null,
    payrollMode: filters.payrollMode ? String(filters.payrollMode).trim() : null,
    reportingPeriodId: Number(filters.reportingPeriodId) || null,
  };

  const includePeriods = type === 'periods' || type === 'all' || type === 'period';
  const includeEntries = type === 'entries' || type === 'all' || type === 'period';

  const data = {
    periods: [],
    selectedPeriod: null,
    entries: [],
    totals: {
      grossPay: 0,
      deductions: 0,
      netPay: 0,
      employeeCount: 0,
    },
  };

  if (includePeriods) {
    data.periods = await collectPaged((pagination) => payrollService.listPayrollPeriods({
      ...periodFilters,
      skip: pagination.skip,
      take: pagination.take,
      sortBy: 'createdAt',
      sortOrder: 'desc',
    }));
  }

  const selectedPeriodId = Number(filters.payrollPeriodId) || Number(data.periods?.[0]?.id) || null;
  if (selectedPeriodId) {
    data.selectedPeriod = data.periods.find((period) => Number(period.id) === selectedPeriodId) || null;
  }

  if (includeEntries && selectedPeriodId) {
    data.entries = await collectPaged((pagination) => payrollService.listPayrollEntries({
      payrollPeriodId: selectedPeriodId,
      employeeId: null,
      skip: pagination.skip,
      take: pagination.take,
      sortBy: 'createdAt',
      sortOrder: 'desc',
    }));

    const employeeIds = new Set();
    data.entries.forEach((entry) => {
      employeeIds.add(entry.employeeId);
      data.totals.grossPay += Number(entry.grossPay || 0);
      data.totals.deductions += Number(entry.totalDeductions || 0);
      data.totals.netPay += Number(entry.netPay || 0);
    });
    data.totals.employeeCount = employeeIds.size;
  }

  return {
    module: 'payroll',
    title: 'Payroll Report',
    type,
    filters,
    data,
  };
}

async function buildEmployeesReport(type, filters = {}) {
  const listFilters = {
    search: filters.search ? String(filters.search).trim() : null,
    status: filters.status ? String(filters.status).trim() : null,
    department: filters.department ? String(filters.department).trim() : null,
    locationId: Number(filters.locationId) || null,
  };

  const includeList = type === 'list' || type === 'all';
  const data = { employees: [] };

  if (includeList) {
    data.employees = await collectPaged((pagination) => employeesService.listEmployees({
      ...listFilters,
      skip: pagination.skip,
      take: pagination.take,
      sortBy: 'createdAt',
      sortOrder: 'desc',
    }));
  }

  return {
    module: 'employees',
    title: 'Employees Report',
    type,
    filters,
    data,
  };
}

function inRange(dateValue, start, end) {
  if (!dateValue) return false;
  const value = new Date(dateValue);
  if (Number.isNaN(value.getTime())) return false;
  const startDate = new Date(`${start}T00:00:00`);
  const endDate = new Date(`${end}T23:59:59`);
  return value >= startDate && value <= endDate;
}

async function buildMonthlySummaryReport(filters = {}) {
  const monthlyRange = resolveMonthlyRange(filters);

  const salesPeriodParams = monthlyRange.periodType === 'month'
    ? {
        periodType: 'month',
        month: String(monthlyRange.month),
        year: String(monthlyRange.year),
      }
    : {
        periodType: 'custom',
        startDate: monthlyRange.startDate,
        endDate: monthlyRange.endDate,
      };

  const salesFilters = extractFilters({
    locationCode: filters.locationCode || null,
  });
  const salesPeriod = resolvePeriod(salesPeriodParams);
  if (salesPeriod.error) {
    throw new Error(salesPeriod.error);
  }

  const salesWhere = buildInvoiceWhere(salesPeriod, salesFilters);
  const salesSummary = await querySalesSummary(salesWhere);
  const paymentRows = await queryPaymentReport(salesWhere);

  const locationId = Number(filters.locationCode);
  const expensesSummary = await expensesService.getExpenseSummary({
    search: null,
    expenseCategoryId: null,
    locationId: Number.isInteger(locationId) && locationId > 0 ? locationId : null,
    reportingPeriodId: null,
    startDate: new Date(`${monthlyRange.startDate}T00:00:00`),
    endDate: new Date(`${monthlyRange.endDate}T23:59:59`),
  });

  const payrollPeriods = await collectPaged((pagination) => payrollService.listPayrollPeriods({
    search: null,
    status: null,
    payrollMode: null,
    reportingPeriodId: null,
    skip: pagination.skip,
    take: pagination.take,
    sortBy: 'createdAt',
    sortOrder: 'desc',
  }));

  const relevantPeriods = payrollPeriods.filter((period) => inRange(period.createdAt, monthlyRange.startDate, monthlyRange.endDate));
  const payrollEntries = [];
  for (const period of relevantPeriods) {
    const rows = await collectPaged((pagination) => payrollService.listPayrollEntries({
      payrollPeriodId: period.id,
      employeeId: null,
      skip: pagination.skip,
      take: pagination.take,
      sortBy: 'createdAt',
      sortOrder: 'desc',
    }));
    payrollEntries.push(...rows);
  }

  const payrollTotals = payrollEntries.reduce((acc, entry) => {
    acc.totalBasicSalary += Number(entry.basicSalary || 0);
    acc.totalDeductions += Number(entry.totalDeductions || 0);
    acc.totalNetPay += Number(entry.netPay || 0);
    return acc;
  }, {
    totalBasicSalary: 0,
    totalDeductions: 0,
    totalNetPay: 0,
  });

  const suppliers = await collectPaged((pagination) => suppliersService.listSuppliers({
    search: null,
    status: null,
    skip: pagination.skip,
    take: pagination.take,
    sortBy: 'createdAt',
    sortOrder: 'desc',
  }));

  const supplierPayments = await collectPaged((pagination) => suppliersService.listSupplierTransactions({
    supplierId: null,
    reportingPeriodId: null,
    transactionType: 'payment',
    paymentMethod: null,
    startDate: new Date(`${monthlyRange.startDate}T00:00:00`),
    endDate: new Date(`${monthlyRange.endDate}T23:59:59`),
    search: null,
    skip: pagination.skip,
    take: pagination.take,
    sortBy: 'transactionDate',
    sortOrder: 'desc',
  }));

  const salesTotal = Number(salesSummary.netSales || 0);
  const expensesTotal = Number(expensesSummary?.totals?.totalAmount || 0);
  const payrollTotal = Number(payrollTotals.totalNetPay || 0);
  const supplierPaymentTotal = supplierPayments.reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
  const supplierDebtTotal = suppliers.reduce((sum, supplier) => {
    const balance = Number(supplier.currentBalance || 0);
    return sum + (balance > 0 ? balance : 0);
  }, 0);

  const netPosition = salesTotal - expensesTotal - payrollTotal - supplierPaymentTotal;

  return {
    module: 'monthly-summary',
    title: 'Monthly Business Summary',
    type: 'summary',
    filters,
    range: monthlyRange,
    data: {
      salesTotal,
      expensesTotal,
      payrollTotal,
      supplierPaymentTotal,
      supplierDebtTotal,
      netPosition,
      salesSummary,
      expensesSummary,
      payrollTotals,
      supplierPayments,
      paymentRows,
      payrollPeriodsCount: relevantPeriods.length,
    },
  };
}

async function getReportData(moduleName, type, filters) {
  if (moduleName === 'sales') return buildSalesReport(type || 'summary', filters);
  if (moduleName === 'expenses') return buildExpensesReport(type || 'list', filters);
  if (moduleName === 'suppliers') return buildSuppliersReport(type || 'list', filters);
  if (moduleName === 'payroll') return buildPayrollReport(type || 'period', filters);
  if (moduleName === 'employees') return buildEmployeesReport(type || 'list', filters);
  if (moduleName === 'monthly-summary') return buildMonthlySummaryReport(filters);
  throw new Error(`Unsupported export module: ${moduleName}`);
}

async function buildExcelBuffer(report) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = COMPANY_NAME;
  workbook.created = new Date();
  workbook.modified = new Date();

  if (report.module === 'sales') {
    if (report.data.summary) {
      const sheet = workbook.addWorksheet('Summary');
      const columns = [
        { header: 'Metric', key: 'metric', width: 34 },
        { header: 'Value', key: 'value', width: 24, align: 'right' },
      ];
      setWorksheetColumns(sheet, columns);
      appendRows(sheet, columns, [
        { metric: 'Total Invoices', value: formatCountDisplay(report.data.summary.totalInvoices) },
        { metric: 'Total Items Sold', value: formatCountDisplay(report.data.summary.totalItemsSold) },
        { metric: 'Gross Sales', value: formatCurrencyDisplay(report.data.summary.grossSales) },
        { metric: 'VAT Total', value: formatCurrencyDisplay(report.data.summary.vatTotal) },
        { metric: 'Discount Total', value: formatCurrencyDisplay(report.data.summary.discountTotal) },
        { metric: 'Net Sales', value: formatCurrencyDisplay(report.data.summary.netSales) },
        { metric: 'Levy Total', value: formatCurrencyDisplay(report.data.summary.levyTotal) },
        { metric: 'Average Invoice Value', value: formatCurrencyDisplay(report.data.summary.averageInvoiceValue) },
      ]);
    }

    if (report.data.invoices.length) {
      const sheet = workbook.addWorksheet('Invoices');
      const columns = [
        { header: 'Invoice Date', key: 'invoiceDate', width: 15 },
        { header: 'Invoice No', key: 'invoiceNo', width: 20 },
        { header: 'Branch', key: 'branchCode', width: 12 },
        { header: 'Location', key: 'locationCode', width: 12 },
        { header: 'Cashier', key: 'userName', width: 20 },
        { header: 'Payment 1', key: 'payMethod1', width: 14 },
        { header: 'Payment 2', key: 'payMethod2', width: 14 },
        { header: 'Net Sale', key: 'netSale', width: 16, type: 'currency', align: 'right' },
      ];
      setWorksheetColumns(sheet, columns);
      appendRows(sheet, columns, report.data.invoices.map((row) => ({
        invoiceDate: toDateString(row.invoiceDate),
        invoiceNo: row.sourceInvoiceNo || row.refNo || row.id,
        branchCode: row.branchCode || '',
        locationCode: row.locationCode || '',
        userName: row.userName || '',
        payMethod1: row.payMethod1 || '',
        payMethod2: row.payMethod2 || '',
        netSale: money(row.netSale),
      })));
      addTotalsRow(sheet, columns, {
        invoiceDate: 'TOTAL',
        netSale: report.data.invoices.reduce((sum, row) => sum + money(row.netSale), 0),
      });
    }

    if (report.data.products.length) {
      const sheet = workbook.addWorksheet('Products');
      const columns = [
        { header: 'Product Code', key: 'productCode', width: 18 },
        { header: 'Product Name', key: 'productName', width: 30 },
        { header: 'Qty Sold', key: 'totalQuantitySold', width: 14, type: 'number', align: 'right' },
        { header: 'Total Sales', key: 'totalSales', width: 16, type: 'currency', align: 'right' },
        { header: 'Tax', key: 'totalTax', width: 14, type: 'currency', align: 'right' },
      ];
      setWorksheetColumns(sheet, columns);
      appendRows(sheet, columns, report.data.products);
      addTotalsRow(sheet, columns, {
        productCode: 'TOTAL',
        totalQuantitySold: report.data.products.reduce((sum, row) => sum + money(row.totalQuantitySold), 0),
        totalSales: report.data.products.reduce((sum, row) => sum + money(row.totalSales), 0),
        totalTax: report.data.products.reduce((sum, row) => sum + money(row.totalTax), 0),
      });
    }

    if (report.data.users.length) {
      const sheet = workbook.addWorksheet('Users');
      const columns = [
        { header: 'User', key: 'userName', width: 28 },
        { header: 'Invoices', key: 'totalInvoices', width: 12, type: 'integer', align: 'right' },
        { header: 'Gross Sales', key: 'grossSales', width: 16, type: 'currency', align: 'right' },
        { header: 'Net Sales', key: 'totalSales', width: 16, type: 'currency', align: 'right' },
        { header: 'Avg Invoice', key: 'averageInvoiceValue', width: 16, type: 'currency', align: 'right' },
      ];
      setWorksheetColumns(sheet, columns);
      appendRows(sheet, columns, report.data.users);
    }

    if (report.data.payments.length) {
      const sheet = workbook.addWorksheet('Payments');
      const columns = [
        { header: 'Payment Method', key: 'payMethod', width: 22 },
        { header: 'Invoice Count', key: 'invoiceCount', width: 14, type: 'integer', align: 'right' },
        { header: 'Amount', key: 'totalAmount', width: 16, type: 'currency', align: 'right' },
      ];
      setWorksheetColumns(sheet, columns);
      appendRows(sheet, columns, report.data.payments);
      addTotalsRow(sheet, columns, {
        payMethod: 'TOTAL',
        invoiceCount: report.data.payments.reduce((sum, row) => sum + Number(row.invoiceCount || 0), 0),
        totalAmount: report.data.payments.reduce((sum, row) => sum + money(row.totalAmount), 0),
      });
    }
  }

  if (report.module === 'expenses') {
    if (report.data.expenses.length) {
      const sheet = workbook.addWorksheet('Expenses');
      const columns = [
        { header: 'Date', key: 'expenseDate', width: 14 },
        { header: 'Category', key: 'category', width: 24 },
        { header: 'Description', key: 'description', width: 38 },
        { header: 'Payment Method', key: 'paymentMethod', width: 16 },
        { header: 'Reference', key: 'referenceNo', width: 18 },
        { header: 'Amount', key: 'amount', width: 16, type: 'currency', align: 'right' },
      ];
      setWorksheetColumns(sheet, columns);
      appendRows(sheet, columns, report.data.expenses.map((row) => ({
        expenseDate: toDateString(row.expenseDate),
        category: row.expenseCategory?.name || '',
        description: row.description || '',
        paymentMethod: row.paymentMethod || '',
        referenceNo: row.referenceNo || '',
        amount: money(row.amount),
      })));
      addTotalsRow(sheet, columns, {
        expenseDate: 'TOTAL',
        amount: report.data.expenses.reduce((sum, row) => sum + money(row.amount), 0),
      });
    }

    if (report.data.summary) {
      const sheet = workbook.addWorksheet('Summary');
      const columns = [
        { header: 'Metric', key: 'metric', width: 28 },
        { header: 'Value', key: 'value', width: 24, align: 'right' },
      ];
      setWorksheetColumns(sheet, columns);
      appendRows(sheet, columns, [
        { metric: 'Total Expenses', value: formatCountDisplay(report.data.summary?.totals?.totalExpenses || 0) },
        { metric: 'Total Amount', value: formatCurrencyDisplay(report.data.summary?.totals?.totalAmount || 0) },
        { metric: 'Average Amount', value: formatCurrencyDisplay(report.data.summary?.totals?.averageAmount || 0) },
      ]);
    }

    if (report.data.summary?.topCategories?.length) {
      const sheet = workbook.addWorksheet('Top Categories');
      const columns = [
        { header: 'Category', key: 'categoryName', width: 28 },
        { header: 'Expense Count', key: 'expenseCount', width: 16, type: 'integer', align: 'right' },
        { header: 'Total Amount', key: 'totalAmount', width: 16, type: 'currency', align: 'right' },
      ];
      setWorksheetColumns(sheet, columns);
      appendRows(sheet, columns, report.data.summary.topCategories.map((row) => ({
        categoryName: row.category?.name || 'Uncategorized',
        expenseCount: row.expenseCount,
        totalAmount: money(row.totalAmount),
      })));
    }
  }

  if (report.module === 'suppliers') {
    if (report.data.suppliers.length) {
      const sheet = workbook.addWorksheet('Suppliers');
      const columns = [
        { header: 'Supplier Code', key: 'supplierCode', width: 18 },
        { header: 'Supplier Name', key: 'name', width: 30 },
        { header: 'Status', key: 'status', width: 12 },
        { header: 'Phone', key: 'phone', width: 18 },
        { header: 'Current Balance', key: 'currentBalance', width: 18, type: 'currency', align: 'right' },
      ];
      setWorksheetColumns(sheet, columns);
      appendRows(sheet, columns, report.data.suppliers.map((row) => ({
        supplierCode: row.supplierCode || '',
        name: row.name || '',
        status: row.status || '',
        phone: row.phone || '',
        currentBalance: money(row.currentBalance),
      })));
    }

    if (report.data.transactions.length) {
      const sheet = workbook.addWorksheet('Transactions');
      const columns = [
        { header: 'Date', key: 'transactionDate', width: 14 },
        { header: 'Supplier', key: 'supplierName', width: 30 },
        { header: 'Type', key: 'transactionType', width: 14 },
        { header: 'Method', key: 'paymentMethod', width: 14 },
        { header: 'Reference', key: 'referenceNo', width: 18 },
        { header: 'Amount', key: 'amount', width: 16, type: 'currency', align: 'right' },
      ];
      setWorksheetColumns(sheet, columns);
      appendRows(sheet, columns, report.data.transactions.map((row) => ({
        transactionDate: toDateString(row.transactionDate),
        supplierName: row.supplier?.name || '',
        transactionType: titleCase(row.transactionType),
        paymentMethod: titleCase(row.paymentMethod),
        referenceNo: row.referenceNo || '',
        amount: money(row.amount),
      })));
      addTotalsRow(sheet, columns, {
        transactionDate: 'TOTAL',
        amount: report.data.transactions.reduce((sum, row) => sum + money(row.amount), 0),
      });
    }

    const summarySheet = workbook.addWorksheet('Balances');
    const summaryColumns = [
      { header: 'Metric', key: 'metric', width: 30 },
      { header: 'Value', key: 'value', width: 24, align: 'right' },
    ];
    setWorksheetColumns(summarySheet, summaryColumns);
    appendRows(summarySheet, summaryColumns, [
      { metric: 'Total Suppliers', value: formatCountDisplay(report.data.balances.totalSuppliers) },
      { metric: 'Active Suppliers', value: formatCountDisplay(report.data.balances.activeSuppliers) },
      { metric: 'Outstanding Debt', value: formatCurrencyDisplay(report.data.balances.totalDebt) },
      { metric: 'Supplier Credit', value: formatCurrencyDisplay(report.data.balances.totalCredit) },
    ]);
  }

  if (report.module === 'payroll') {
    if (report.data.periods.length) {
      const sheet = workbook.addWorksheet('Periods');
      const columns = [
        { header: 'ID', key: 'id', width: 10, type: 'integer', align: 'right' },
        { header: 'Mode', key: 'payrollMode', width: 14 },
        { header: 'Status', key: 'status', width: 14 },
        { header: 'Description', key: 'description', width: 28 },
        { header: 'Entries', key: 'entryCount', width: 12, type: 'integer', align: 'right' },
        { header: 'Gross', key: 'totalGrossPay', width: 16, type: 'currency', align: 'right' },
        { header: 'Deductions', key: 'totalDeductions', width: 16, type: 'currency', align: 'right' },
        { header: 'Net', key: 'totalNetPay', width: 16, type: 'currency', align: 'right' },
      ];
      setWorksheetColumns(sheet, columns);
      appendRows(sheet, columns, report.data.periods);
    }

    if (report.data.entries.length) {
      const sheet = workbook.addWorksheet('Entries');
      const columns = [
        { header: 'Employee No', key: 'employeeNo', width: 14 },
        { header: 'Employee Name', key: 'employeeName', width: 30 },
        { header: 'Basic Salary', key: 'basicSalary', width: 16, type: 'currency', align: 'right' },
        { header: 'Gross Pay', key: 'grossPay', width: 16, type: 'currency', align: 'right' },
        { header: 'Deductions', key: 'totalDeductions', width: 16, type: 'currency', align: 'right' },
        { header: 'Net Pay', key: 'netPay', width: 16, type: 'currency', align: 'right' },
      ];
      setWorksheetColumns(sheet, columns);
      appendRows(sheet, columns, report.data.entries.map((row) => ({
        employeeNo: row.employee?.employeeNo || '',
        employeeName: `${row.employee?.firstName || ''} ${row.employee?.surname || ''}`.trim(),
        basicSalary: money(row.basicSalary),
        grossPay: money(row.grossPay),
        totalDeductions: money(row.totalDeductions),
        netPay: money(row.netPay),
      })));
      addTotalsRow(sheet, columns, {
        employeeNo: 'TOTAL',
        grossPay: money(report.data.totals.grossPay),
        totalDeductions: money(report.data.totals.deductions),
        netPay: money(report.data.totals.netPay),
      });
    }
  }

  if (report.module === 'monthly-summary') {
    const summarySheet = workbook.addWorksheet('Summary');
    const columns = [
      { header: 'Metric', key: 'metric', width: 34 },
      { header: 'Amount', key: 'value', width: 22, type: 'currency', align: 'right' },
    ];
    setWorksheetColumns(summarySheet, columns);
    appendRows(summarySheet, columns, [
      { metric: 'Sales', value: money(report.data.salesTotal) },
      { metric: 'Expenses', value: money(report.data.expensesTotal) },
      { metric: 'Payroll', value: money(report.data.payrollTotal) },
      { metric: 'Supplier Payments', value: money(report.data.supplierPaymentTotal) },
      { metric: 'Supplier Debt', value: money(report.data.supplierDebtTotal) },
      { metric: 'Net Position', value: money(report.data.netPosition) },
    ]);

    if (report.data.paymentRows?.length) {
      const paymentSheet = workbook.addWorksheet('Sales Payments');
      const paymentColumns = [
        { header: 'Method', key: 'payMethod', width: 22 },
        { header: 'Invoice Count', key: 'invoiceCount', width: 14, type: 'integer', align: 'right' },
        { header: 'Amount', key: 'totalAmount', width: 18, type: 'currency', align: 'right' },
      ];
      setWorksheetColumns(paymentSheet, paymentColumns);
      appendRows(paymentSheet, paymentColumns, report.data.paymentRows);
    }
  }

  if (report.module === 'employees') {
    const sheet = workbook.addWorksheet('Employees');
    const columns = [
      { header: 'Employee No', key: 'employeeNo', width: 16 },
      { header: 'Name', key: 'name', width: 28 },
      { header: 'Status', key: 'status', width: 14 },
      { header: 'Department', key: 'department', width: 18 },
      { header: 'Position', key: 'position', width: 20 },
      { header: 'Contact', key: 'contactNumber', width: 18 },
      { header: 'Current Salary', key: 'currentSalary', width: 16, type: 'currency', align: 'right' },
    ];
    setWorksheetColumns(sheet, columns);
    appendRows(sheet, columns, report.data.employees.map((row) => ({
      employeeNo: row.employeeNo || '',
      name: `${row.firstName || ''} ${row.surname || ''}`.trim(),
      status: row.status || '',
      department: row.department || '',
      position: row.position || '',
      contactNumber: row.contactNumber || '',
      currentSalary: money(row.salaryStructures?.[0]?.agreedSalaryPerMonth || 0),
    })));
  }

  workbook.worksheets.forEach((sheet) => {
    applyExcelSheetBranding(workbook, sheet, report);
  });

  return workbook.xlsx.writeBuffer();
}

async function buildPdfBuffer(report) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const chunks = [];
    const context = createPdfContext(report);

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    drawPdfHeader(doc, context);

    const summaryCards = [];
    const infoItems = [
      { label: 'Applied Filters', value: buildAppliedFilterText(report.filters || {}) },
    ];

    if (report.module === 'sales') {
      const hasSalesRows = (
        (report.data.invoices?.length || 0)
        + (report.data.products?.length || 0)
        + (report.data.users?.length || 0)
        + (report.data.payments?.length || 0)
      ) > 0;
      const hasSummaryData = Number(report.data.summary?.totalInvoices || 0) > 0;

      if (report.data.summary) {
        summaryCards.push(
          { label: 'Total Invoices', value: formatCountDisplay(report.data.summary.totalInvoices), fill: '#F0F9F6', accent: PDF_BRAND_GREEN },
          { label: 'Net Sales', value: formatCurrencyDisplay(report.data.summary.netSales), fill: '#F4F0F7', accent: PDF_BRAND_PURPLE },
          { label: 'Gross Sales', value: formatCurrencyDisplay(report.data.summary.grossSales), fill: '#FFF4DB', accent: PDF_BRAND_ORANGE },
        );
      }

      drawPdfSummaryCards(doc, summaryCards, context);
      drawPdfInfoBand(doc, infoItems, context);

      if (report.data.invoices.length) {
        drawPdfSectionTitle(doc, 'Invoices', context);
        drawPdfTable(doc, [
          { header: 'Date', key: 'invoiceDate', weight: 1 },
          { header: 'Invoice No', key: 'invoiceNo', weight: 1.7 },
          { header: 'Branch', key: 'branchCode', weight: 0.9 },
          { header: 'Cashier', key: 'userName', weight: 1.3 },
          { header: 'Net Sale', key: 'netSale', weight: 1.1, align: 'right' },
        ], report.data.invoices.map((row) => ({
          invoiceDate: toDateString(row.invoiceDate),
          invoiceNo: row.sourceInvoiceNo || row.refNo || String(row.id),
          branchCode: row.branchCode || '-',
          userName: row.userName || '-',
          netSale: formatCurrencyDisplay(row.netSale),
        })), context);
      }

      if (report.data.products.length) {
        drawPdfSectionTitle(doc, 'Product Sales', context);
        drawPdfTable(doc, [
          { header: 'Code', key: 'productCode', weight: 1.1 },
          { header: 'Product', key: 'productName', weight: 1.8 },
          { header: 'Qty', key: 'totalQuantitySold', weight: 0.8, align: 'right' },
          { header: 'Sales', key: 'totalSales', weight: 1, align: 'right' },
          { header: 'Tax', key: 'totalTax', weight: 0.9, align: 'right' },
        ], report.data.products.map((row) => ({
          productCode: row.productCode || '-',
          productName: row.productName || '-',
          totalQuantitySold: Number(row.totalQuantitySold || 0).toLocaleString('en-US', { maximumFractionDigits: 2 }),
          totalSales: formatCurrencyDisplay(row.totalSales),
          totalTax: formatCurrencyDisplay(row.totalTax),
        })), context);
      }

      if (report.data.users.length) {
        drawPdfSectionTitle(doc, 'Cashier Performance', context);
        drawPdfTable(doc, [
          { header: 'Cashier', key: 'userName', weight: 1.6 },
          { header: 'Invoices', key: 'totalInvoices', weight: 0.8, align: 'right' },
          { header: 'Gross Sales', key: 'grossSales', weight: 1.1, align: 'right' },
          { header: 'Net Sales', key: 'totalSales', weight: 1.1, align: 'right' },
          { header: 'Avg Invoice', key: 'averageInvoiceValue', weight: 1.1, align: 'right' },
        ], report.data.users.map((row) => ({
          userName: row.userName || '-',
          totalInvoices: formatCountDisplay(row.totalInvoices),
          grossSales: formatCurrencyDisplay(row.grossSales),
          totalSales: formatCurrencyDisplay(row.totalSales),
          averageInvoiceValue: formatCurrencyDisplay(row.averageInvoiceValue),
        })), context);
      }

      if (report.data.payments.length) {
        drawPdfSectionTitle(doc, 'Payment Methods', context);
        drawPdfTable(doc, [
          { header: 'Method', key: 'payMethod', weight: 1.6 },
          { header: 'Invoice Count', key: 'invoiceCount', weight: 0.9, align: 'right' },
          { header: 'Amount', key: 'totalAmount', weight: 1.1, align: 'right' },
        ], report.data.payments.map((row) => ({
          payMethod: row.payMethod || '-',
          invoiceCount: formatCountDisplay(row.invoiceCount),
          totalAmount: formatCurrencyDisplay(row.totalAmount),
        })), context);
      }

      if (!hasSalesRows && !hasSummaryData) {
        drawPdfNoDataMessage(doc, 'No rows matched this period/filter selection.', context);
      }
    }

    if (report.module === 'expenses') {
      summaryCards.push(
        { label: 'Expense Count', value: formatCountDisplay(report.data.summary?.totals?.totalExpenses || 0), fill: '#F0F9F6', accent: PDF_BRAND_GREEN },
        { label: 'Total Amount', value: formatCurrencyDisplay(report.data.summary?.totals?.totalAmount || 0), fill: '#F4F0F7', accent: PDF_BRAND_PURPLE },
        { label: 'Average Amount', value: formatCurrencyDisplay(report.data.summary?.totals?.averageAmount || 0), fill: '#FFF4DB', accent: PDF_BRAND_ORANGE },
      );

      drawPdfSummaryCards(doc, summaryCards, context);
      drawPdfInfoBand(doc, infoItems, context);

      if (report.data.summary?.topCategories?.length) {
        drawPdfSectionTitle(doc, 'Top Expense Categories', context);
        drawPdfTable(doc, [
          { header: 'Category', key: 'categoryName', weight: 1.8 },
          { header: 'Entries', key: 'expenseCount', weight: 0.8, align: 'right' },
          { header: 'Amount', key: 'totalAmount', weight: 1, align: 'right' },
        ], report.data.summary.topCategories.map((row) => ({
          categoryName: row.category?.name || 'Uncategorized',
          expenseCount: formatCountDisplay(row.expenseCount),
          totalAmount: formatCurrencyDisplay(row.totalAmount),
        })), context);
      }

      if (report.data.expenses.length) {
        drawPdfSectionTitle(doc, 'Expense Register', context);
        drawPdfTable(doc, [
          { header: 'Date', key: 'expenseDate', weight: 0.9 },
          { header: 'Category', key: 'category', weight: 1.3 },
          { header: 'Description', key: 'description', weight: 2.1 },
          { header: 'Amount', key: 'amount', weight: 1, align: 'right' },
        ], report.data.expenses.map((row) => ({
          expenseDate: toDateString(row.expenseDate),
          category: row.expenseCategory?.name || '-',
          description: row.description || '-',
          amount: formatCurrencyDisplay(row.amount),
        })), context);
      }
    }

    if (report.module === 'suppliers') {
      summaryCards.push(
        { label: 'Total Suppliers', value: formatCountDisplay(report.data.balances.totalSuppliers), fill: '#F0F9F6', accent: PDF_BRAND_GREEN },
        { label: 'Outstanding Debt', value: formatCurrencyDisplay(report.data.balances.totalDebt), fill: '#FFF1F2', accent: '#BE123C' },
        { label: 'Supplier Credit', value: formatCurrencyDisplay(report.data.balances.totalCredit), fill: '#F4F0F7', accent: PDF_BRAND_PURPLE },
      );

      drawPdfSummaryCards(doc, summaryCards, context);
      drawPdfInfoBand(doc, infoItems, context);

      if (report.data.suppliers.length) {
        drawPdfSectionTitle(doc, 'Supplier Register', context);
        drawPdfTable(doc, [
          { header: 'Code', key: 'supplierCode', weight: 1 },
          { header: 'Supplier', key: 'name', weight: 1.9 },
          { header: 'Status', key: 'status', weight: 0.8 },
          { header: 'Phone', key: 'phone', weight: 1 },
          { header: 'Balance', key: 'currentBalance', weight: 1.1, align: 'right' },
        ], report.data.suppliers.map((row) => ({
          supplierCode: row.supplierCode || '-',
          name: row.name || '-',
          status: titleCase(row.status),
          phone: row.phone || '-',
          currentBalance: formatCurrencyDisplay(row.currentBalance),
        })), context);
      }

      if (report.data.transactions.length) {
        drawPdfSectionTitle(doc, 'Supplier Transactions', context);
        drawPdfTable(doc, [
          { header: 'Date', key: 'transactionDate', weight: 0.9 },
          { header: 'Supplier', key: 'supplierName', weight: 1.7 },
          { header: 'Type', key: 'transactionType', weight: 0.8 },
          { header: 'Method', key: 'paymentMethod', weight: 0.9 },
          { header: 'Amount', key: 'amount', weight: 1, align: 'right' },
        ], report.data.transactions.map((row) => ({
          transactionDate: toDateString(row.transactionDate),
          supplierName: row.supplier?.name || '-',
          transactionType: titleCase(row.transactionType),
          paymentMethod: titleCase(row.paymentMethod),
          amount: formatCurrencyDisplay(row.amount),
        })), context);
      }
    }

    if (report.module === 'payroll') {
      summaryCards.push(
        { label: 'Employees', value: formatCountDisplay(report.data.totals.employeeCount), fill: '#F0F9F6', accent: PDF_BRAND_GREEN },
        { label: 'Gross Pay', value: formatCurrencyDisplay(report.data.totals.grossPay), fill: '#F4F0F7', accent: PDF_BRAND_PURPLE },
        { label: 'Net Pay', value: formatCurrencyDisplay(report.data.totals.netPay), fill: '#FFF4DB', accent: PDF_BRAND_ORANGE },
      );

      if (report.data.selectedPeriod) {
        infoItems.push({ label: 'Selected Period', value: `${report.data.selectedPeriod.description || 'Payroll Period'} (${titleCase(report.data.selectedPeriod.payrollMode)})` });
      }

      drawPdfSummaryCards(doc, summaryCards, context);
      drawPdfInfoBand(doc, infoItems, context);

      if (report.data.periods.length) {
        drawPdfSectionTitle(doc, 'Payroll Periods', context);
        drawPdfTable(doc, [
          { header: 'ID', key: 'id', weight: 0.5, align: 'right' },
          { header: 'Mode', key: 'payrollMode', weight: 0.9 },
          { header: 'Status', key: 'status', weight: 0.9 },
          { header: 'Description', key: 'description', weight: 1.8 },
          { header: 'Net Pay', key: 'totalNetPay', weight: 1.1, align: 'right' },
        ], report.data.periods.map((row) => ({
          id: String(row.id),
          payrollMode: titleCase(row.payrollMode),
          status: titleCase(row.status),
          description: row.description || '-',
          totalNetPay: formatCurrencyDisplay(row.totalNetPay),
        })), context);
      }

      if (report.data.entries.length) {
        drawPdfSectionTitle(doc, 'Payroll Entries', context);
        drawPdfTable(doc, [
          { header: 'Employee No', key: 'employeeNo', weight: 0.9 },
          { header: 'Employee', key: 'employeeName', weight: 1.7 },
          { header: 'Gross', key: 'grossPay', weight: 1, align: 'right' },
          { header: 'Deductions', key: 'deductions', weight: 1, align: 'right' },
          { header: 'Net', key: 'netPay', weight: 1, align: 'right' },
        ], report.data.entries.map((row) => ({
          employeeNo: row.employee?.employeeNo || '-',
          employeeName: `${row.employee?.firstName || ''} ${row.employee?.surname || ''}`.trim() || '-',
          grossPay: formatCurrencyDisplay(row.grossPay),
          deductions: formatCurrencyDisplay(row.totalDeductions),
          netPay: formatCurrencyDisplay(row.netPay),
        })), context);
      }
    }

    if (report.module === 'monthly-summary') {
      summaryCards.push(
        { label: 'Sales', value: formatCurrencyDisplay(report.data.salesTotal), fill: '#F0F9F6', accent: PDF_BRAND_GREEN },
        { label: 'Expenses', value: formatCurrencyDisplay(report.data.expensesTotal), fill: '#FFF4DB', accent: PDF_BRAND_ORANGE },
        { label: 'Payroll', value: formatCurrencyDisplay(report.data.payrollTotal), fill: '#F4F0F7', accent: PDF_BRAND_PURPLE },
        { label: 'Supplier Payments', value: formatCurrencyDisplay(report.data.supplierPaymentTotal), fill: '#ECFDF5', accent: PDF_BRAND_GREEN },
        { label: 'Supplier Debt', value: formatCurrencyDisplay(report.data.supplierDebtTotal), fill: '#FFF1F2', accent: '#BE123C' },
        { label: 'Net Position', value: formatCurrencyDisplay(report.data.netPosition), fill: report.data.netPosition >= 0 ? '#F0F9F6' : '#FFF1F2', accent: report.data.netPosition >= 0 ? PDF_BRAND_GREEN : '#BE123C' },
      );

      drawPdfSummaryCards(doc, summaryCards, context);
      drawPdfInfoBand(doc, infoItems, context);

      if (report.data.paymentRows?.length) {
        drawPdfSectionTitle(doc, 'Sales Payment Methods', context);
        drawPdfTable(doc, [
          { header: 'Method', key: 'payMethod', weight: 1.5 },
          { header: 'Invoices', key: 'invoiceCount', weight: 0.8, align: 'right' },
          { header: 'Amount', key: 'totalAmount', weight: 1, align: 'right' },
        ], report.data.paymentRows.map((row) => ({
          payMethod: row.payMethod || '-',
          invoiceCount: formatCountDisplay(row.invoiceCount),
          totalAmount: formatCurrencyDisplay(row.totalAmount),
        })), context);
      }

      if (report.data.expensesSummary?.topCategories?.length) {
        drawPdfSectionTitle(doc, 'Top Expense Categories', context);
        drawPdfTable(doc, [
          { header: 'Category', key: 'categoryName', weight: 1.7 },
          { header: 'Entries', key: 'expenseCount', weight: 0.8, align: 'right' },
          { header: 'Amount', key: 'totalAmount', weight: 1, align: 'right' },
        ], report.data.expensesSummary.topCategories.map((row) => ({
          categoryName: row.category?.name || 'Uncategorized',
          expenseCount: formatCountDisplay(row.expenseCount),
          totalAmount: formatCurrencyDisplay(row.totalAmount),
        })), context);
      }
    }

    if (report.module === 'employees') {
      const activeEmployees = report.data.employees.filter((row) => String(row.status || '').toLowerCase() === 'active').length;
      const departments = new Set(report.data.employees.map((row) => row.department).filter(Boolean)).size;

      summaryCards.push(
        { label: 'Total Employees', value: formatCountDisplay(report.data.employees.length), fill: '#F0F9F6', accent: PDF_BRAND_GREEN },
        { label: 'Active Employees', value: formatCountDisplay(activeEmployees), fill: '#F4F0F7', accent: PDF_BRAND_PURPLE },
        { label: 'Departments', value: formatCountDisplay(departments), fill: '#FFF4DB', accent: PDF_BRAND_ORANGE },
      );

      drawPdfSummaryCards(doc, summaryCards, context);
      drawPdfInfoBand(doc, infoItems, context);

      if (report.data.employees.length) {
        drawPdfSectionTitle(doc, 'Employee Register', context);
        drawPdfTable(doc, [
          { header: 'Employee No', key: 'employeeNo', weight: 1 },
          { header: 'Name', key: 'name', weight: 1.8 },
          { header: 'Status', key: 'status', weight: 0.8 },
          { header: 'Department', key: 'department', weight: 1 },
          { header: 'Current Salary', key: 'currentSalary', weight: 1, align: 'right' },
        ], report.data.employees.map((row) => ({
          employeeNo: row.employeeNo || '-',
          name: `${row.firstName || ''} ${row.surname || ''}`.trim() || '-',
          status: titleCase(row.status),
          department: row.department || '-',
          currentSalary: formatCurrencyDisplay(row.salaryStructures?.[0]?.agreedSalaryPerMonth || 0),
        })), context);
      }
    }

    doc
      .fontSize(8)
      .fillColor(PDF_MUTED)
      .text('Automated report generated by Citi-Nati Supermarket Business Operations', doc.page.margins.left, doc.page.height - 32, {
        width: doc.page.width - (doc.page.margins.left * 2),
        align: 'center',
      });

    doc.end();
  });
}

function createFileName(moduleName, type, format, filters = {}) {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');

  if (filters.month && filters.year) {
    return `${sanitizeFilePart(moduleName)}_${sanitizeFilePart(type || 'report')}_${filters.year}_${String(filters.month).padStart(2, '0')}.${format}`;
  }

  return `${sanitizeFilePart(moduleName)}_${sanitizeFilePart(type || 'report')}_${y}_${m}.${format}`;
}

async function generateReportExport({ module: moduleName, type, filters = {}, format }) {
  const safeModule = sanitizeFilePart(moduleName);
  const safeType = sanitizeFilePart(type || 'summary');

  const report = await getReportData(moduleName, type || 'summary', filters);
  const fileName = createFileName(safeModule, safeType, format, filters);

  if (format === 'excel') {
    const buffer = await buildExcelBuffer(report);
    return {
      fileName,
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer,
    };
  }

  if (format === 'pdf') {
    const buffer = await buildPdfBuffer(report);
    return {
      fileName,
      mimeType: 'application/pdf',
      buffer,
    };
  }

  throw new Error(`Unsupported export format: ${format}`);
}

module.exports = {
  generateReportExport,
};
