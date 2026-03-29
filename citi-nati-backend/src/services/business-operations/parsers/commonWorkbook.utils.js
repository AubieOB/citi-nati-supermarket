'use strict';

const XLSX = require('xlsx');

const HEADER_ALIAS_MAP = new Map([
  ['employee no', 'employee_no'],
  ['employee number', 'employee_no'],
  ['emp no', 'employee_no'],
  ['emp number', 'employee_no'],
  ['employee id', 'employee_no'],
  ['id', 'employee_no'],
  ['first name', 'first_name'],
  ['firstname', 'first_name'],
  ['name', 'first_name'],
  ['surname', 'surname'],
  ['last name', 'surname'],
  ['salary', 'salary'],
  ['basic salary', 'salary'],
  ['basic pay', 'salary'],
  ['agreed salary', 'salary'],
  ['agreed salary per month', 'salary'],
  ['monthly salary', 'salary'],
  ['amount', 'amount'],
  ['loan amount', 'amount'],
  ['date', 'date'],
  ['expense date', 'date'],
  ['transaction date', 'date'],
  ['loan', 'loan'],
  ['loan reference', 'loan_reference'],
]);

const DEFAULT_HEADER_KEYWORDS = [
  'employee',
  'name',
  'salary',
  'id',
  'amount',
  'loan',
  'date',
];

function normalizeToken(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[_\.]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[^a-z0-9 ]/g, '');
}

function normalizeHeader(value) {
  const normalized = normalizeToken(value);
  if (!normalized) return '';

  if (HEADER_ALIAS_MAP.has(normalized)) {
    return HEADER_ALIAS_MAP.get(normalized);
  }

  for (const [alias, canonical] of HEADER_ALIAS_MAP.entries()) {
    if (normalized.includes(alias) || alias.includes(normalized)) {
      return canonical;
    }
  }

  return normalized.replace(/\s+/g, '_');
}

function readWorkbookFromBuffer(buffer) {
  try {
    return XLSX.read(buffer, {
      type: 'buffer',
      cellDates: true,
      cellNF: false,
      cellText: false,
    });
  } catch (err) {
    throw new Error(`Unable to parse workbook: ${err.message}`);
  }
}

function detectSheetByAliases(sheetNames, aliases) {
  const aliasSet = new Set(aliases.map(normalizeToken));
  const exact = sheetNames.find((name) => aliasSet.has(normalizeToken(name)));
  if (exact) return exact;

  return sheetNames.find((name) => {
    const normalized = normalizeToken(name);
    return [...aliasSet].some((alias) => normalized.includes(alias) || alias.includes(normalized));
  }) || null;
}

function getSheetRows(workbook, sheetName) {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return [];
  return XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    raw: false,
    defval: null,
    blankrows: false,
  });
}

function findHeaderRowIndex(rows, expectedHeaders, maxScanRows = 20) {
  const expected = expectedHeaders.map(normalizeHeader).filter(Boolean);
  const keywordTokens = [...new Set([...DEFAULT_HEADER_KEYWORDS, ...expectedHeaders.map(normalizeToken).filter(Boolean)])];
  const scanLimit = Math.min(maxScanRows, rows.length);

  let bestIndex = -1;
  let bestScore = 0;

  for (let i = 0; i < scanLimit; i += 1) {
    const row = rows[i] || [];
    const normalizedRow = row.map(normalizeHeader).filter(Boolean);

    let score = 0;
    expected.forEach((h) => {
      if (normalizedRow.some((cell) => cell === h || cell.includes(h) || h.includes(cell))) {
        score += 1;
      }
    });

    keywordTokens.forEach((keyword) => {
      if (normalizedRow.some((cell) => cell.includes(keyword.replace(/\s+/g, '_')) || cell.includes(keyword))) {
        score += 0.35;
      }
    });

    if (row.filter((cell) => cleanString(cell) !== null).length >= 3) {
      score += 0.25;
    }

    if (score > bestScore) {
      bestScore = score;
      bestIndex = i;
    }
  }

  return bestScore >= 1.5 ? bestIndex : -1;
}

function toHeaderMap(headerRow) {
  const map = new Map();
  (headerRow || []).forEach((header, index) => {
    const key = normalizeHeader(header);
    if (!key) return;
    if (!map.has(key)) {
      map.set(key, index);
    }
  });
  return map;
}

function findCellByAliases(row, headerMap, aliases) {
  for (const alias of aliases) {
    const target = normalizeHeader(alias);
    for (const [headerKey, idx] of headerMap.entries()) {
      if (headerKey === target || headerKey.includes(target) || target.includes(headerKey)) {
        return row[idx];
      }
    }
  }
  return null;
}

function parseNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;

  const parsed = Number(String(value).replace(/,/g, '').trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function parseDate(value) {
  if (!value) return null;
  if (value instanceof Date && !isNaN(value.getTime())) return value;

  if (typeof value === 'number') {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed) return null;
    return new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d));
  }

  const text = String(value).trim();
  if (!text) return null;

  const d = new Date(text);
  if (!isNaN(d.getTime())) return d;

  const slashParts = text.split('/');
  if (slashParts.length === 3) {
    const [p1, p2, p3] = slashParts.map((p) => parseInt(p, 10));
    if ([p1, p2, p3].every(Number.isInteger)) {
      const maybe = new Date(Date.UTC(p3, p2 - 1, p1));
      if (!isNaN(maybe.getTime())) return maybe;
    }
  }

  return null;
}

function cleanString(value) {
  if (value === null || value === undefined) return null;
  const cleaned = String(value).trim();
  return cleaned.length ? cleaned : null;
}

function isEmptyRow(row) {
  return !row || row.every((cell) => cleanString(cell) === null);
}

function buildRowObjects(rows, headerIndex) {
  const headerRow = rows[headerIndex] || [];
  const headerMap = toHeaderMap(headerRow);
  const dataRows = rows.slice(headerIndex + 1).filter((row) => !isEmptyRow(row));
  return { headerMap, dataRows, headerRow };
}

function buildRowObjectsFromSheet(workbook, sheetName, headerIndex) {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    return { headerMap: new Map(), dataRows: [], headerRow: [] };
  }

  // Use range to start at the detected header row so real-world title/meta rows are ignored.
  const rangedRows = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    raw: false,
    defval: null,
    blankrows: false,
    range: headerIndex,
  });

  const headerRow = rangedRows[0] || [];
  const headerMap = toHeaderMap(headerRow);
  const dataRows = rangedRows.slice(1).filter((row) => !isEmptyRow(row));

  console.info('[BO][IMPORTS][PARSER] sheet parsed', {
    sheetName,
    headerRowIndex: headerIndex,
    normalizedHeaders: [...headerMap.keys()],
    parsedRows: dataRows.length,
  });

  return { headerMap, dataRows, headerRow };
}

function summarizeParsedData(data) {
  const summary = {};
  Object.keys(data || {}).forEach((key) => {
    const value = data[key];
    summary[key] = Array.isArray(value) ? value.length : 0;
  });
  return summary;
}

module.exports = {
  normalizeToken,
  normalizeHeader,
  readWorkbookFromBuffer,
  detectSheetByAliases,
  getSheetRows,
  findHeaderRowIndex,
  toHeaderMap,
  findCellByAliases,
  parseNumber,
  parseDate,
  cleanString,
  isEmptyRow,
  buildRowObjects,
  buildRowObjectsFromSheet,
  summarizeParsedData,
};
