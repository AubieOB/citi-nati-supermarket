const OPERATIONAL_SCOPE_MAP = {
  BLANTYRE_SH: {
    uiCode: 'BLANTYRE_SH',
    label: 'Blantyre BT',
    branchCode: 'BLANTYRE',
    locationCode: 'BT',
    salesMode: 'live',
  },
  ZOMBA_SH: {
    uiCode: 'ZOMBA_SH',
    label: 'Zomba SH',
    branchCode: 'ZOMBA',
    locationCode: 'SH',
    salesMode: 'live',
  },
  ZOMBA_BAR: {
    uiCode: 'ZOMBA_BAR',
    label: 'Zomba BAR',
    branchCode: 'ZOMBA',
    locationCode: 'BAR',
    salesMode: 'future',
  },
  ZOMBA_RES: {
    uiCode: 'ZOMBA_RES',
    label: 'Zomba RES',
    branchCode: 'ZOMBA',
    locationCode: 'ST999',
    salesMode: 'future',
  },
};

const LEGACY_SCOPE_ALIAS = {
  BT: 'BLANTYRE_SH',
  BLANTYRE: 'BLANTYRE_SH',
  BAR: 'ZOMBA_BAR',
  RES: 'ZOMBA_RES',
  ST999: 'ZOMBA_RES',
};

function normalizeOperationalScopeCode(value) {
  const normalized = String(value || '').trim().toUpperCase();
  if (!normalized) return 'BLANTYRE_SH';
  if (OPERATIONAL_SCOPE_MAP[normalized]) return normalized;

  if (normalized === 'BT' || normalized === 'BLANTYRE') return 'BLANTYRE_SH';
  if (normalized === 'BAR') return 'ZOMBA_BAR';
  if (normalized === 'RES' || normalized === 'ST999') return 'ZOMBA_RES';

  return null;
}

function resolveOperationalScope(value, branchCode = '') {
  const normalized = normalizeOperationalScopeCode(value);
  const normalizedLocationCode = String(value || '').trim().toUpperCase();
  const normalizedBranchCode = String(branchCode || '').trim().toUpperCase();

  if (normalized) {
    if (normalizedLocationCode === 'SH' || normalizedBranchCode) {
      console.info('[OperationalScope] resolveOperationalScope', {
        value,
        branchCode,
        normalized,
        scope: OPERATIONAL_SCOPE_MAP[normalized],
      });
    }
    return OPERATIONAL_SCOPE_MAP[normalized];
  }

  if (normalizedLocationCode === 'SH') {
    if (normalizedBranchCode === 'BLANTYRE') {
      console.info('[OperationalScope] resolveOperationalScope ambiguous SH -> BLANTYRE_SH', { value, branchCode });
      return OPERATIONAL_SCOPE_MAP.BLANTYRE_SH;
    }
    if (normalizedBranchCode === 'ZOMBA') {
      console.info('[OperationalScope] resolveOperationalScope ambiguous SH -> ZOMBA_SH', { value, branchCode });
      return OPERATIONAL_SCOPE_MAP.ZOMBA_SH;
    }

    console.warn('[OperationalScope] resolveOperationalScope ambiguous SH with no explicit branchCode', { value, branchCode });
  }

  return null;
}

function getOperationalScopeOptions() {
  return [
    OPERATIONAL_SCOPE_MAP.BLANTYRE_SH,
    OPERATIONAL_SCOPE_MAP.ZOMBA_SH,
    OPERATIONAL_SCOPE_MAP.ZOMBA_BAR,
    OPERATIONAL_SCOPE_MAP.ZOMBA_RES,
  ];
}

function toLegacyLocationCode(value) {
  const scope = resolveOperationalScope(value);
  return scope ? scope.locationCode : null;
}

function filterProductsForOperationalLocation(products, value, branchCode = '') {
  if (!Array.isArray(products) || products.length === 0) return [];

  const scope = resolveOperationalScope(value, branchCode);
  if (!scope) {
    console.warn('[OperationalScope] filterProductsForOperationalLocation no scope resolved', {
      value,
      branchCode,
      productsLength: products.length,
    });
    return [];
  }

  const expectedBranchCode = String(scope.branchCode || '').trim().toUpperCase();
  const expectedLocationCode = String(scope.locationCode || '').trim().toUpperCase();

  const filtered = products.filter((product) => {
    const productBranchCode = String(product?.branchCode || '').trim().toUpperCase();
    const productLocationCode = String(product?.locationCode || '').trim().toUpperCase();

    const branchMatches = expectedBranchCode
      ? productBranchCode === expectedBranchCode
      : true;
    const locationMatches = expectedLocationCode
      ? productLocationCode === expectedLocationCode
      : true;

    return branchMatches && locationMatches;
  });

  if (filtered.length === 0) {
    console.info('[OperationalScope] filterProductsForOperationalLocation filtered zero products', {
      value,
      branchCode,
      expectedBranchCode,
      expectedLocationCode,
      productsLength: products.length,
    });
  }

  return filtered;
}

export {
  normalizeOperationalScopeCode,
  resolveOperationalScope,
  getOperationalScopeOptions,
  toLegacyLocationCode,
  filterProductsForOperationalLocation,
};
