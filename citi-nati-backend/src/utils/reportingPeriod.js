'use strict';

const VALID_PERIOD_TYPES = ['day', 'week', 'month', 'quarter', 'year', 'custom'];

/**
 * Parse a YYYY-MM-DD string as midnight in server local time.
 * Returns null if the string is absent or invalid.
 */
function parseDateString(str) {
  if (!str || typeof str !== 'string') return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) return null;
  const d = new Date(`${str}T00:00:00`);
  if (isNaN(d.getTime())) return null;
  return d;
}

function formatLocalDate(dateValue) {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return null;
  const local = new Date(date.getTime() - (date.getTimezoneOffset() * 60000));
  return local.toISOString().slice(0, 10);
}

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

/** Returns the Monday of the ISO week containing the given date (local time). */
function getISOWeekStart(date) {
  const d = new Date(date);
  const dayOfWeek = d.getDay(); // 0=Sun, 1=Mon, …
  const daysToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  d.setDate(d.getDate() + daysToMonday);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getISOWeekEnd(weekStart) {
  const d = new Date(weekStart);
  d.setDate(d.getDate() + 6);
  d.setHours(23, 59, 59, 999);
  return d;
}

/**
 * Resolve a period type + supporting params into a concrete local date range.
 *
 * Returns { startDate: Date, endDate: Date, label: string } on success.
 * Returns { error: string } when params are incomplete or invalid.
 *
 * Supported periodTypes:
 *   day     – requires date=YYYY-MM-DD
 *   week    – requires date=YYYY-MM-DD (any day within the desired week)
 *   month   – requires month=1-12, year=YYYY (year defaults to current year)
 *   quarter – requires quarter=1-4, year=YYYY (year defaults to current year)
 *   year    – requires year=YYYY
 *   custom  – requires startDate=YYYY-MM-DD and endDate=YYYY-MM-DD
 */
function resolvePeriod(params) {
  const {
    periodType,
    date,
    month,
    year,
    quarter,
    startDate: customStart,
    endDate: customEnd,
  } = params || {};

  if (!periodType) {
    return {
      error: `periodType is required. Allowed values: ${VALID_PERIOD_TYPES.join(', ')}`,
    };
  }

  if (!VALID_PERIOD_TYPES.includes(periodType)) {
    return {
      error: `Invalid periodType '${periodType}'. Allowed values: ${VALID_PERIOD_TYPES.join(', ')}`,
    };
  }

  const currentYear = new Date().getFullYear();

  switch (periodType) {
    case 'day': {
      if (!date) {
        return { error: 'date (YYYY-MM-DD) is required for periodType=day' };
      }
      const d = parseDateString(date);
      if (!d) return { error: `Invalid date '${date}'. Use YYYY-MM-DD format` };
      return {
        startDate: startOfDay(d),
        endDate: endOfDay(d),
        label: date,
      };
    }

    case 'week': {
      if (!date) {
        return {
          error: 'date (YYYY-MM-DD, any day within the target week) is required for periodType=week',
        };
      }
      const d = parseDateString(date);
      if (!d) return { error: `Invalid date '${date}'. Use YYYY-MM-DD format` };
      const weekStart = getISOWeekStart(d);
      return {
        startDate: weekStart,
        endDate: getISOWeekEnd(weekStart),
        label: `Week of ${formatLocalDate(weekStart)}`,
      };
    }

    case 'month': {
      const m = parseInt(month, 10);
      const y = parseInt(year, 10) || currentYear;
      if (!month || isNaN(m) || m < 1 || m > 12) {
        return { error: 'month (1–12) is required for periodType=month' };
      }
      return {
        startDate: new Date(y, m - 1, 1, 0, 0, 0, 0),
        endDate: new Date(y, m, 0, 23, 59, 59, 999),
        label: `${y}-${String(m).padStart(2, '0')}`,
      };
    }

    case 'quarter': {
      const q = parseInt(quarter, 10);
      const y = parseInt(year, 10) || currentYear;
      if (!quarter || isNaN(q) || q < 1 || q > 4) {
        return { error: 'quarter (1–4) is required for periodType=quarter' };
      }
      const startMonth = (q - 1) * 3; // 0-based month index
      return {
        startDate: new Date(y, startMonth, 1, 0, 0, 0, 0),
        endDate: new Date(y, startMonth + 3, 0, 23, 59, 59, 999),
        label: `Q${q} ${y}`,
      };
    }

    case 'year': {
      const y = parseInt(year, 10);
      if (!year || isNaN(y) || y < 2000 || y > 2100) {
        return { error: 'year (YYYY) is required for periodType=year' };
      }
      return {
        startDate: new Date(y, 0, 1, 0, 0, 0, 0),
        endDate: new Date(y, 11, 31, 23, 59, 59, 999),
        label: String(y),
      };
    }

    case 'custom': {
      if (!customStart || !customEnd) {
        return {
          error: 'startDate and endDate (YYYY-MM-DD) are both required for periodType=custom',
        };
      }
      const s = parseDateString(customStart);
      const e = parseDateString(customEnd);
      if (!s) return { error: `Invalid startDate '${customStart}'. Use YYYY-MM-DD format` };
      if (!e) return { error: `Invalid endDate '${customEnd}'. Use YYYY-MM-DD format` };
      const start = startOfDay(s);
      const end = endOfDay(e);
      if (start > end) return { error: 'startDate must be on or before endDate' };
      return {
        startDate: start,
        endDate: end,
        label: `${customStart} to ${customEnd}`,
      };
    }

    default:
      return { error: `Unhandled periodType: ${periodType}` };
  }
}

/**
 * Format a resolved date range into a plain object for API responses.
 */
function formatDateRange(startDate, endDate) {
  return {
    startDate: formatLocalDate(startDate),
    endDate: formatLocalDate(endDate),
  };
}

module.exports = { resolvePeriod, formatDateRange, VALID_PERIOD_TYPES };
