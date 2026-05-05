const OPERATIONAL_SCOPE_MAP = {
  BLANTYRE_SH: {
    uiCode: 'BLANTYRE_SH',
    label: 'Blantyre SH',
    branchCode: 'BLANTYRE',
locationCode: 'SH',
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
  SH: 'ZOMBA_SH',
  ZA: 'ZOMBA_SH',
  ZOMBA: 'ZOMBA_SH',
  BAR: 'ZOMBA_BAR',
  RES: 'ZOMBA_RES',
  ST999: 'ZOMBA_RES',
};

function normalizeOperationalScopeCode(value) {
  const normalized = String(value || '').trim().toUpperCase();
  if (!normalized) return 'BLANTYRE_SH';
  if (OPERATIONAL_SCOPE_MAP[normalized]) return normalized;
  return LEGACY_SCOPE_ALIAS[normalized] || 'BLANTYRE_SH';
}

function resolveOperationalScope(value) {
  const normalized = normalizeOperationalScopeCode(value);
  return OPERATIONAL_SCOPE_MAP[normalized];
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
  return resolveOperationalScope(value).locationCode;
}

function filterProductsForOperationalLocation(products, value) {
  if (!Array.isArray(products) || products.length === 0) return [];

  const scope = resolveOperationalScope(value);
  if (!scope) {
    return products;
  }

  const expectedBranchCode = String(scope.branchCode || '').trim().toUpperCase();
  const expectedLocationCode = String(scope.locationCode || '').trim().toUpperCase();

  return products.filter((product) => {
    const productBranchCode = String(product?.branchCode || '').trim().toUpperCase();
    const productLocationCode = String(product?.locationCode || '').trim().toUpperCase();

    if (expectedBranchCode && productBranchCode && productBranchCode !== expectedBranchCode) {
      return false;
    }

    if (expectedLocationCode && productLocationCode && productLocationCode !== expectedLocationCode) {
      return false;
    }

    return true;
  });
}

export {
  normalizeOperationalScopeCode,
  resolveOperationalScope,
  getOperationalScopeOptions,
  toLegacyLocationCode,
  filterProductsForOperationalLocation,
};
