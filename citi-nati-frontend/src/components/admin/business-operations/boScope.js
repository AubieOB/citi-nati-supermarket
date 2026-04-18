/**
 * Business Operations Operational Scope Definitions
 *
 * Mirrors the 4-location operational model used in AdminDashboard.jsx.
 * Each scope maps to a specific (branchCode, locationCode) pair.
 * Use resolveBoScope() to obtain the DB locationId for API calls.
 */

export const BO_OPERATIONAL_SCOPES = [
  {
    scopeId: 'BLANTYRE_SH',
    label: 'Blantyre — SH',
    branchCode: 'BLANTYRE',
    locationCode: 'SH',
    branchName: 'Blantyre',
  },
  {
    scopeId: 'ZOMBA_SH',
    label: 'Zomba — SH',
    branchCode: 'ZOMBA',
    locationCode: 'SH',
    branchName: 'Zomba',
  },
  {
    scopeId: 'ZOMBA_BAR',
    label: 'Zomba — BAR',
    branchCode: 'ZOMBA',
    locationCode: 'BAR',
    branchName: 'Zomba',
  },
  {
    scopeId: 'ZOMBA_RES',
    label: 'Zomba — RES',
    branchCode: 'ZOMBA',
    locationCode: 'RES',
    branchName: 'Zomba',
  },
];

/**
 * Resolve a full scope tuple for the given scopeId.
 *
 * @param {string} scopeId - One of the BO_OPERATIONAL_SCOPES scopeId values.
 * @param {Array}  boLocations - The array fetched from /business-operations/locations,
 *   e.g. [{ id: 1, name: 'Blantyre' }, { id: 2, name: 'Zomba' }].
 * @returns {{ locationId: number|null, locationCode: string, branchCode: string }}
 */
export function resolveBoScope(scopeId, boLocations = []) {
  const scope = BO_OPERATIONAL_SCOPES.find((s) => s.scopeId === scopeId);
  if (!scope) return { locationId: null, locationCode: '', branchCode: '' };

  // Match by branchName (case-insensitive) against the DB locations list.
  const locationRow = boLocations.find(
    (row) => String(row.name || '').trim().toLowerCase() === scope.branchName.toLowerCase(),
  );

  return {
    locationId: locationRow ? Number(locationRow.id) : null,
    locationCode: scope.locationCode,
    branchCode: scope.branchCode,
  };
}
