'use strict';

const LOCATION_ALIASES = {
  BLANTYRE_SH: 'SH',
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

const BRANCH_ALIASES = {
  BT: 'BLANTYRE',
  BLANTYRE: 'BLANTYRE',
  BLANTYRE_SH: 'BLANTYRE',
  ZOMBA_SH: 'ZOMBA',
  ZOMBA_BAR: 'ZOMBA',
  ZOMBA_RES: 'ZOMBA',
  ZA: 'ZOMBA',
  ZOMBA: 'ZOMBA',
};

const CORE_ZOMBA_LOCATION_CODES = ['SH', 'BAR', 'ST999'];

function normalizeScopeCode(value) {
  const normalized = String(value || '').trim().toUpperCase();
  if (!normalized) return null;
  return LOCATION_ALIASES[normalized] || normalized;
}

function expandOperationalLocationScopeCodes(locationCode) {
  const normalized = normalizeScopeCode(locationCode);
  if (!normalized) return [];

  if (normalized === 'ZA') {
    return [...CORE_ZOMBA_LOCATION_CODES];
  }

  return [normalized];
}

/**
 * Resolves operational scope from request parameters.
 * Supports branch-only, location-only, and branch+location scopes.
 * Infers branch from non-ambiguous location codes when branch is missing.
 */
function inferBranchFromLocationCode(locationCode) {
  const normalizedLocation = normalizeScopeCode(locationCode);
  if (!normalizedLocation) return null;
  if (normalizedLocation === 'BT' || normalizedLocation === 'WH') return 'BLANTYRE';
  if (['ZA', 'BAR', 'ST999'].includes(normalizedLocation)) return 'ZOMBA';
  return null;
}

function resolveOperationalScope(req) {
  const branchCodeRaw = String(
    req.query.branchCode
    || req.body?.branchCode
    || req.headers?.['x-branch-code']
    || ''
  ).trim();

  const locationCodeRaw = String(
    req.query.locationCode
    || req.body?.locationCode
    || req.headers?.['x-location-code']
    || ''
  ).trim();

  let branchCode = branchCodeRaw.toUpperCase();
  if (branchCode && BRANCH_ALIASES[branchCode]) {
    branchCode = BRANCH_ALIASES[branchCode];
  }

  const locationCode = normalizeScopeCode(locationCodeRaw);
  if (!branchCode && locationCode) {
    branchCode = inferBranchFromLocationCode(locationCode);
  }

  if (!branchCode && !locationCode) {
    throw new Error('branchCode or locationCode is required for scoped queries');
  }

  if (locationCodeRaw && !locationCode) {
    throw new Error('Invalid locationCode provided');
  }

  console.log('[SCOPE]', { branchCode: branchCode || null, locationCode: locationCode || null });

  return {
    branchCode: branchCode || null,
    locationCode: locationCode || null,
  };
}

module.exports = {
  normalizeScopeCode,
  expandOperationalLocationScopeCodes,
  resolveOperationalScope,
  CORE_ZOMBA_LOCATION_CODES,
};
