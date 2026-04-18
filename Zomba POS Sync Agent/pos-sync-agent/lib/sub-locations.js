/**
 * Zomba branch sub-location mapping
 * Zomba is not a flat single location but contains multiple POS operational sub-locations
 */

const ZOMBA_SUB_LOCATIONS = {
  SH: {
    code: 'SH',
    name: 'Supermarket',
    description: 'Main supermarket/shop',
    category: 'retail',
  },
  BAR: {
    code: 'BAR',
    name: 'Bar',
    description: 'Bar/restaurant operations',
    category: 'hospitality',
  },
  ST999: {
    code: 'ST999',
    name: 'Restaurant',
    description: 'Restaurant operations (mapped from RES alias)',
    category: 'hospitality',
  },
  WH: {
    code: 'WH',
    name: 'Warehouse',
    description: 'Internal warehouse/storage',
    category: 'internal',
  },
};

/**
 * Get sub-location metadata by code
 * @param {string} locationCode - The location code from POS (e.g., 'SH', 'BAR', 'WH')
 * @returns {object} Sub-location metadata or null if not found
 */
function getSubLocationByCode(locationCode) {
  if (!locationCode) return null;
  const key = String(locationCode).toUpperCase().trim() === 'RES'
    ? 'ST999'
    : String(locationCode).toUpperCase().trim();
  return ZOMBA_SUB_LOCATIONS[key] || null;
}

/**
 * Get all sub-locations for Zomba
 * @returns {object} Map of all sub-locations
 */
function getAllSubLocations() {
  return ZOMBA_SUB_LOCATIONS;
}

/**
 * Enrich invoice/detail row with sub-location metadata
 * @param {object} row - Invoice or detail row from POS
 * @param {string} branchCode - Branch code (e.g., 'ZOMBA')
 * @returns {object} Row with added sub-location fields
 */
function enrichRowWithSubLocation(row, branchCode = 'ZOMBA') {
  if (!row) return row;

  const locationCode = row.LocationCode ? String(row.LocationCode).toUpperCase().trim() : null;
  const subLocation = getSubLocationByCode(locationCode);

  return {
    ...row,
    locationCode,
    subLocationName: subLocation ? subLocation.name : locationCode || null,
    subLocationCategory: subLocation ? subLocation.category : null,
    branchCode,
  };
}

module.exports = {
  ZOMBA_SUB_LOCATIONS,
  getSubLocationByCode,
  getAllSubLocations,
  enrichRowWithSubLocation,
};
