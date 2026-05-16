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
  ZA: 'ZOMBA',
  ZOMBA: 'ZOMBA',
  ZOMBA_SH: 'ZOMBA',
  ZOMBA_BAR: 'ZOMBA',
  ZOMBA_RES: 'ZOMBA',
};

const CORE_BLANTYRE_LOCATION_CODES = ['BT', 'SH', 'WH'];
const CORE_ZOMBA_LOCATION_CODES = ['SH', 'BAR', 'ST999'];

// Location codes that exist in multiple branches and require explicit branchCode
const AMBIGUOUS_LOCATION_CODES = new Set(['SH']);

function isAmbiguousLocationCode(locationCode) {
  return !!locationCode && AMBIGUOUS_LOCATION_CODES.has(String(locationCode || '').toUpperCase());
}


function normalizeScopeCode(value) {
  const normalized = String(value || '').trim().toUpperCase();
  if (!normalized) return null;
  return LOCATION_ALIASES[normalized] || normalized;
}

function normalizeBranchCode(value) {
  const normalized = String(value || '').trim().toUpperCase();
  if (!normalized) return null;
  return BRANCH_ALIASES[normalized] || normalized;
}

function expandOperationalLocationScopeCodes(locationCode) {
  const normalized = normalizeScopeCode(locationCode);
  if (!normalized) return [];

  // If the branch-level alias was provided, expand to that branch's locations.
  if (normalized === 'BT') {
    return CORE_BLANTYRE_LOCATION_CODES;
  }
  if (normalized === 'ZA') {
    return CORE_ZOMBA_LOCATION_CODES;
  }

  // If the code is present in both branch location lists (ambiguous, e.g. 'SH'),
  // do not expand it to the full branch sets — return the single code so that
  // callers can apply explicit branch scoping when required. Expanding an
  // ambiguous code into a branch's entire location set caused cross-branch
  // mixing (Blantyre SH -> expanded to Zomba locations), which produced
  // incorrect aggregations.
  const inBlantyre = CORE_BLANTYRE_LOCATION_CODES.includes(normalized);
  const inZomba = CORE_ZOMBA_LOCATION_CODES.includes(normalized);
  if (inBlantyre && inZomba) {
    return [normalized];
  }

  // If the code belongs to one branch's core set, return that full set.
  if (inBlantyre) return CORE_BLANTYRE_LOCATION_CODES;
  if (inZomba) return CORE_ZOMBA_LOCATION_CODES;

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

  // Defensive warning: ambiguous location codes (like 'SH') should be
  // accompanied by an explicit branchCode to avoid accidental cross-branch
  // aggregation. Log a warning to assist in debugging if a client omits
  // branchCode for an ambiguous location.
  if (!branchCode && isAmbiguousLocationCode(locationCode)) {
    console.warn('[SCOPE] Ambiguous locationCode without branchCode', { locationCode });
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
  normalizeBranchCode,
  expandOperationalLocationScopeCodes,
  resolveOperationalScope,
  isAmbiguousLocationCode,
  CORE_BLANTYRE_LOCATION_CODES,
  CORE_ZOMBA_LOCATION_CODES,
};
