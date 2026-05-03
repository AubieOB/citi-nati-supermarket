'use strict';

const LOCATION_ALIASES = {
  BLANTYRE_SH: 'BT',
  BT: 'BT',
  BLANTYRE: 'BT',
  ZOMBA_SH: 'SH',
  ZOMBA_BAR: 'BAR',
  ZOMBA_RES: 'ST999',
  ZA: 'ZA',
  ZOMBA: 'ZA',
  SH: 'SH',
  BAR: 'BAR',
  RES: 'ST999',
  ST999: 'ST999',
  WH: 'WH',
};

const AMBIGUOUS_LOCATION_CODES = new Set(['SH']);
const ZOMBA_LOCATION_CODES = ['SH', 'BAR', 'ST999', 'WH'];
const ZOMBA_OPERATIONAL_LOCATION_CODES = ['SH', 'BAR', 'ST999'];

function normalizeScopeCode(value) {
  const normalized = String(value || '').trim().toUpperCase();
  if (!normalized) return null;
  return LOCATION_ALIASES[normalized] || normalized;
}

function isZombaLocationCode(value) {
  const normalized = normalizeScopeCode(value);
  return !!normalized && (normalized === 'ZA' || ZOMBA_LOCATION_CODES.includes(normalized));
}

function deriveBranchCodeFromLocationCode(value) {
  const normalized = normalizeScopeCode(value);
  if (!normalized) return null;
  if (AMBIGUOUS_LOCATION_CODES.has(normalized)) return null;
  if (normalized === 'BT') return 'BLANTYRE';
  if (normalized === 'ZA' || ZOMBA_LOCATION_CODES.includes(normalized)) return 'ZOMBA';
  return null;
}

function expandLocationScopeCodes(value) {
  const normalized = normalizeScopeCode(value);
  if (!normalized) return [];
  if (normalized === 'BT') return ['BT'];
  if (normalized === 'ZA') return ZOMBA_OPERATIONAL_LOCATION_CODES.slice();
  if (normalized === 'SH' || normalized === 'BAR' || normalized === 'ST999' || normalized === 'WH') {
    return [normalized];
  }
  return [normalized];
}

module.exports = {
  normalizeScopeCode,
  deriveBranchCodeFromLocationCode,
  expandLocationScopeCodes,
  isZombaLocationCode,
  ZOMBA_LOCATION_CODES,
  ZOMBA_OPERATIONAL_LOCATION_CODES,
};
