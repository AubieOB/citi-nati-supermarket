'use strict';

const MAX_PAGE_SIZE = 200;
const DEFAULT_PAGE_SIZE = 25;

function toInt(value, fallback = null) {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = parseInt(value, 10);
  return Number.isInteger(parsed) ? parsed : fallback;
}

function toNumber(value, fallback = null) {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toBool(value, fallback = null) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  const normalized = String(value).toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  return fallback;
}

function toDate(value) {
  if (!value) return null;
  const d = new Date(value);
  if (isNaN(d.getTime())) return null;
  return d;
}

function requiredString(value, fieldName) {
  if (!value || typeof value !== 'string' || value.trim() === '') {
    return `${fieldName} is required`;
  }
  return null;
}

function parsePagination(query) {
  const page = Math.max(1, toInt(query.page, 1));
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, toInt(query.pageSize, DEFAULT_PAGE_SIZE)));
  return {
    page,
    pageSize,
    skip: (page - 1) * pageSize,
    take: pageSize,
  };
}

function parseSort(query, allowedSortFields, defaultSortBy, defaultSortOrder = 'desc') {
  const sortBy = (query.sortBy || defaultSortBy).trim();
  const sortOrder = (query.sortOrder || defaultSortOrder).toLowerCase();

  if (!allowedSortFields.has(sortBy)) {
    return { error: `Invalid sortBy '${sortBy}'. Allowed: ${[...allowedSortFields].join(', ')}` };
  }

  if (sortOrder !== 'asc' && sortOrder !== 'desc') {
    return { error: "sortOrder must be 'asc' or 'desc'" };
  }

  return { sortBy, sortOrder };
}

function listResponse({ data, total, page, pageSize, filters = {} }) {
  return {
    success: true,
    filters,
    data,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  };
}

module.exports = {
  toInt,
  toNumber,
  toBool,
  toDate,
  requiredString,
  parsePagination,
  parseSort,
  listResponse,
};
