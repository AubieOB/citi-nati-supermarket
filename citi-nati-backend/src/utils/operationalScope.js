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

const CORE_ZOMBA_LOCATION_CODES = ['SH', 'BAR', 'ST999'];

function normalizeScopeCode(value) {
  const normalized = String(value || '').trim().toUpperCase();
  if (!normalized) return null;
  return LOCATION_ALIASES[normalized] || normalized;
}

/**
 * Resolves operational scope from request parameters.
 * Requires BOTH branchCode and locationCode to be provided.
 * Throws an error if either is missing.
 */
function resolveOperationalScope(req) {
  const branchCode = String(
    req.query.branchCode
    || req.body?.branchCode
    || req.headers?.['x-branch-code']
    || ''
  ).trim();

  const locationCode = String(
    req.query.locationCode
    || req.body?.locationCode
    || req.headers?.['x-location-code']
    || ''
  ).trim();

  if (!branchCode) {
    throw new Error('branchCode is required for scoped queries');
  }

  if (!locationCode) {
    throw new Error('locationCode is required for scoped queries');
  }

  const normalizedBranchCode = branchCode.toUpperCase();
  const normalizedLocationCode = normalizeScopeCode(locationCode);

  if (!normalizedLocationCode) {
    throw new Error('Invalid locationCode provided');
  }

  console.log('[SCOPE]', { branchCode: normalizedBranchCode, locationCode: normalizedLocationCode });

  return {
    branchCode: normalizedBranchCode,
    locationCode: normalizedLocationCode
  };
}

module.exports = {
  normalizeScopeCode,
  resolveOperationalScope,
  CORE_ZOMBA_LOCATION_CODES,
};
