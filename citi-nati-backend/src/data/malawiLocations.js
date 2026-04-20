const generated = require('./malawiLocations.generated.json');

const DISTRICT_ALIAS_MAP = Object.freeze({
  Blantyre: 'Blantyre District',
  Lilongwe: 'Lilongwe District',
  Zomba: 'Zomba District',
  Mzimba: 'Mzimba District',
  Balaka: 'Balaka District',
  Chikwawa: 'Chikwawa District',
  Chiradzulu: 'Chiradzulu District',
  Chitipa: 'Chitipa District',
  Dedza: 'Dedza District',
  Dowa: 'Dowa District',
  Karonga: 'Karonga District',
  Kasungu: 'Kasungu District',
  Likoma: 'Likoma District',
  Machinga: 'Machinga District',
  Mangochi: 'Mangochi District',
  Mchinji: 'Mchinji District',
  Mulanje: 'Mulanje District',
  Mwanza: 'Mwanza District',
  Neno: 'Neno District',
  'Nkhata Bay': 'Nkhata Bay District',
  Nkhotakota: 'Nkhotakota District',
  Nsanje: 'Nsanje District',
  Ntcheu: 'Ntcheu District',
  Ntchisi: 'Ntchisi District',
  Phalombe: 'Phalombe District',
  Rumphi: 'Rumphi District',
  Salima: 'Salima District',
  Thyolo: 'Thyolo District',
});

const MALAWI_LOCATION_MASTER = Object.freeze(
  (generated?.districts || []).map((entry) =>
    Object.freeze({
      district: String(entry?.district || '').trim(),
      areas: Object.freeze(
        (entry?.areas || []).map((area) =>
          Object.freeze({
            name: String(area?.name || '').trim(),
            defaultLatitude: Number.isFinite(area?.defaultLatitude) ? Number(area.defaultLatitude) : null,
            defaultLongitude: Number.isFinite(area?.defaultLongitude) ? Number(area.defaultLongitude) : null,
            defaultRadiusKm: Number.isFinite(area?.defaultRadiusKm) ? Number(area.defaultRadiusKm) : 4.5,
          })
        )
      ),
    })
  )
);

function normalizeLocationName(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function extractAreaName(area) {
  if (typeof area === 'string') return area;
  return String(area?.name || '').trim();
}

function resolveDistrictAlias(value) {
  const input = String(value || '').trim();
  if (!input) return input;

  if (DISTRICT_ALIAS_MAP[input]) {
    return DISTRICT_ALIAS_MAP[input];
  }

  if (input.toLowerCase().endsWith(' district')) {
    return input;
  }

  const direct = `${input} District`;
  if (MALAWI_LOCATION_MASTER.some((entry) => entry.district === direct)) {
    return direct;
  }

  return input;
}

function getDistrictEntryByName(district) {
  const aliasedInput = resolveDistrictAlias(district);
  const normalized = normalizeLocationName(aliasedInput);
  return MALAWI_LOCATION_MASTER.find((entry) => normalizeLocationName(entry.district) === normalized) || null;
}

function getAllMalawiDistricts() {
  return MALAWI_LOCATION_MASTER.map((entry) => entry.district);
}

function getAreasForDistrict(district) {
  const entry = getDistrictEntryByName(district);
  return entry ? entry.areas.map((area) => extractAreaName(area)) : [];
}

function getAreaRecordsForDistrict(district) {
  const entry = getDistrictEntryByName(district);
  return entry ? [...entry.areas] : [];
}

function resolveCanonicalDistrictName(district) {
  const entry = getDistrictEntryByName(district);
  return entry ? entry.district : null;
}

function resolveCanonicalAreaName(district, area) {
  const districtEntry = getDistrictEntryByName(district);
  if (!districtEntry) return null;

  const normalizedArea = normalizeLocationName(area);
  const matched = districtEntry.areas.find((item) => normalizeLocationName(extractAreaName(item)) === normalizedArea);
  return matched ? extractAreaName(matched) : null;
}

function getAreaMetadata(district, area) {
  const districtEntry = getDistrictEntryByName(district);
  if (!districtEntry) return null;

  const normalizedArea = normalizeLocationName(area);
  const matched = districtEntry.areas.find((item) => normalizeLocationName(extractAreaName(item)) === normalizedArea);
  return matched || null;
}

function buildAllDistrictAreaPairs() {
  return MALAWI_LOCATION_MASTER.flatMap((entry) =>
    entry.areas.map((area) => ({
      district: entry.district,
      area: extractAreaName(area),
      defaultLatitude: Number.isFinite(area?.defaultLatitude) ? area.defaultLatitude : null,
      defaultLongitude: Number.isFinite(area?.defaultLongitude) ? area.defaultLongitude : null,
      defaultRadiusKm: Number.isFinite(area?.defaultRadiusKm) ? area.defaultRadiusKm : null,
    }))
  );
}

module.exports = {
  MALAWI_LOCATION_MASTER,
  normalizeLocationName,
  getAreaRecordsForDistrict,
  getAllMalawiDistricts,
  getAreasForDistrict,
  resolveCanonicalDistrictName,
  resolveCanonicalAreaName,
  getAreaMetadata,
  buildAllDistrictAreaPairs,
};
