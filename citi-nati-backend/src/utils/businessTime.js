'use strict';

const DEFAULT_BUSINESS_TZ_OFFSET_MINUTES = 120;

function pad2(value) {
  return String(value).padStart(2, '0');
}

function getBusinessOffsetMinutes() {
  const raw = Number(process.env.BUSINESS_TZ_OFFSET_MINUTES);
  return Number.isFinite(raw) ? raw : DEFAULT_BUSINESS_TZ_OFFSET_MINUTES;
}

function formatUtcOffsetLabel(offsetMinutes = 0) {
  const total = Number(offsetMinutes || 0);
  const sign = total >= 0 ? '+' : '-';
  const abs = Math.abs(total);
  const hh = Math.floor(abs / 60);
  const mm = abs % 60;
  return `UTC${sign}${pad2(hh)}:${pad2(mm)}`;
}

function getBusinessTimezoneName() {
  const configured = String(process.env.BUSINESS_TIMEZONE_NAME || '').trim();
  if (configured) return configured;
  return formatUtcOffsetLabel(getBusinessOffsetMinutes());
}

function toBusinessShiftedDate(dateValue) {
  const date = dateValue instanceof Date ? dateValue : new Date(dateValue);
  if (Number.isNaN(date.getTime())) return null;
  return new Date(date.getTime() + (getBusinessOffsetMinutes() * 60000));
}

function formatBusinessDateKey(dateValue) {
  const shifted = toBusinessShiftedDate(dateValue);
  if (!shifted) return null;
  const year = shifted.getUTCFullYear();
  const month = shifted.getUTCMonth() + 1;
  const day = shifted.getUTCDate();
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

function formatBusinessTimeKey(dateValue) {
  const shifted = toBusinessShiftedDate(dateValue);
  if (!shifted) return '';
  const hh = shifted.getUTCHours();
  const mm = shifted.getUTCMinutes();
  const ss = shifted.getUTCSeconds();
  return `${pad2(hh)}:${pad2(mm)}:${pad2(ss)}`;
}

function parseDateKey(dateKey) {
  const str = String(dateKey || '');
  const m = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year, month, day };
}

function toDateKeyFromParts(year, month, day) {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

function addDaysToDateKey(dateKey, days) {
  const parsed = parseDateKey(dateKey);
  if (!parsed) return null;
  const utc = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day));
  utc.setUTCDate(utc.getUTCDate() + Number(days || 0));
  return toDateKeyFromParts(utc.getUTCFullYear(), utc.getUTCMonth() + 1, utc.getUTCDate());
}

function getIsoWeekStartDateKey(dateKey) {
  const parsed = parseDateKey(dateKey);
  if (!parsed) return null;
  const utc = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day));
  const dayOfWeek = utc.getUTCDay(); // 0=Sun, 1=Mon
  const daysToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  utc.setUTCDate(utc.getUTCDate() + daysToMonday);
  return toDateKeyFromParts(utc.getUTCFullYear(), utc.getUTCMonth() + 1, utc.getUTCDate());
}

function startOfBusinessDayFromDateKey(dateKey) {
  const parsed = parseDateKey(dateKey);
  if (!parsed) return null;
  const utcMillis = Date.UTC(parsed.year, parsed.month - 1, parsed.day, 0, 0, 0, 0)
    - (getBusinessOffsetMinutes() * 60000);
  return new Date(utcMillis);
}

function endOfBusinessDayFromDateKey(dateKey) {
  const parsed = parseDateKey(dateKey);
  if (!parsed) return null;
  const utcMillis = Date.UTC(parsed.year, parsed.month - 1, parsed.day, 23, 59, 59, 999)
    - (getBusinessOffsetMinutes() * 60000);
  return new Date(utcMillis);
}

function startOfBusinessMonth(year, month) {
  return startOfBusinessDayFromDateKey(`${year}-${pad2(month)}-01`);
}

function endOfBusinessMonth(year, month) {
  const d = new Date(Date.UTC(Number(year), Number(month), 0));
  return endOfBusinessDayFromDateKey(toDateKeyFromParts(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()));
}

function startOfBusinessQuarter(year, quarter) {
  const startMonth = (Number(quarter) - 1) * 3 + 1;
  return startOfBusinessMonth(Number(year), startMonth);
}

function endOfBusinessQuarter(year, quarter) {
  const endMonth = (Number(quarter) - 1) * 3 + 3;
  return endOfBusinessMonth(Number(year), endMonth);
}

function startOfBusinessYear(year) {
  return startOfBusinessDayFromDateKey(`${year}-01-01`);
}

function endOfBusinessYear(year) {
  return endOfBusinessDayFromDateKey(`${year}-12-31`);
}

function formatBusinessDateTimeLabel(dateValue = new Date()) {
  const dateKey = formatBusinessDateKey(dateValue) || '';
  const timeKey = formatBusinessTimeKey(dateValue) || '';
  return `${dateKey} ${timeKey}`.trim();
}

module.exports = {
  getBusinessOffsetMinutes,
  formatUtcOffsetLabel,
  getBusinessTimezoneName,
  formatBusinessDateKey,
  formatBusinessTimeKey,
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
  formatBusinessDateTimeLabel,
};
