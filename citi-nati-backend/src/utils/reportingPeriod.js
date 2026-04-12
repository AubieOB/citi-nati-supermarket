'use strict';

const {
  formatBusinessDateKey,
  parseDateKey,
  addDaysToDateKey,
  getIsoWeekStartDateKey,
  startOfBusinessDayFromDateKey,
  endOfBusinessDayFromDateKey,
  startOfBusinessMonth,
  endOfBusinessMonth,
  startOfBusinessQuarter,
  endOfBusinessQuarter,
  startOfBusinessYear,
  endOfBusinessYear,
} = require('./businessTime');

const VALID_PERIOD_TYPES = ['day', 'week', 'month', 'quarter', 'year', 'custom'];

function parseDateString(str) {
  return parseDateKey(str) ? str : null;
}

/**
 * Resolve a period type + supporting params into a concrete business-time date range.
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

  const currentYear = Number((formatBusinessDateKey(new Date()) || '').slice(0, 4)) || new Date().getFullYear();

  switch (periodType) {
    case 'day': {
      if (!date) {
        return { error: 'date (YYYY-MM-DD) is required for periodType=day' };
      }
      const d = parseDateString(date);
      if (!d) return { error: `Invalid date '${date}'. Use YYYY-MM-DD format` };
      return {
        startDate: startOfBusinessDayFromDateKey(d),
        endDate: endOfBusinessDayFromDateKey(d),
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
      const weekStart = getIsoWeekStartDateKey(d);
      const weekEnd = addDaysToDateKey(weekStart, 6);
      return {
        startDate: startOfBusinessDayFromDateKey(weekStart),
        endDate: endOfBusinessDayFromDateKey(weekEnd),
        label: `Week of ${weekStart}`,
      };
    }

    case 'month': {
      const m = parseInt(month, 10);
      const y = parseInt(year, 10) || currentYear;
      if (!month || isNaN(m) || m < 1 || m > 12) {
        return { error: 'month (1–12) is required for periodType=month' };
      }
      return {
        startDate: startOfBusinessMonth(y, m),
        endDate: endOfBusinessMonth(y, m),
        label: `${y}-${String(m).padStart(2, '0')}`,
      };
    }

    case 'quarter': {
      const q = parseInt(quarter, 10);
      const y = parseInt(year, 10) || currentYear;
      if (!quarter || isNaN(q) || q < 1 || q > 4) {
        return { error: 'quarter (1–4) is required for periodType=quarter' };
      }
      return {
        startDate: startOfBusinessQuarter(y, q),
        endDate: endOfBusinessQuarter(y, q),
        label: `Q${q} ${y}`,
      };
    }

    case 'year': {
      const y = parseInt(year, 10);
      if (!year || isNaN(y) || y < 2000 || y > 2100) {
        return { error: 'year (YYYY) is required for periodType=year' };
      }
      return {
        startDate: startOfBusinessYear(y),
        endDate: endOfBusinessYear(y),
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
      const start = startOfBusinessDayFromDateKey(s);
      const end = endOfBusinessDayFromDateKey(e);
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
    startDate: formatBusinessDateKey(startDate),
    endDate: formatBusinessDateKey(endDate),
  };
}

module.exports = { resolvePeriod, formatDateRange, VALID_PERIOD_TYPES };
