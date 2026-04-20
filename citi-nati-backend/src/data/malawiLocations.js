// Curated static Malawi location master for delivery coverage.
// NOTE: This is intentionally curated and not an exhaustive geocoding source.
// Architecture is prepared so a future live provider can replace/augment this module.
const DISTRICT_AREA_BLUEPRINT = Object.freeze([
  { district: 'Balaka', center: { lat: -14.985, lon: 34.955 }, defaultRadiusKm: 5.5, areas: ['Balaka Boma', 'Ulongwe', 'Mpilisi', 'Nsamala', 'Liwonde Turnoff', 'Mbera', 'Matola', 'Kachenga'] },
  { district: 'Blantyre', center: { lat: -15.786, lon: 35.005 }, defaultRadiusKm: 4.5, areas: ['Namiwawa', 'Nyambadwe', 'Soche', 'Chirimba', 'Limbe', 'Chichiri', 'Kanjedza', 'Ndirande', 'Mpingwe', 'Maselema', 'Sunnyside', 'Mandala', 'Bangwe', 'Mbayani', 'Chilomoni', 'Mtonda'] },
  { district: 'Chikwawa', center: { lat: -16.026, lon: 34.801 }, defaultRadiusKm: 6, areas: ['Chikwawa Boma', 'Ngabu', 'Nchalo', 'Lulwe', 'Makhwira', 'Kasisi', 'Katunga', 'Mikalango'] },
  { district: 'Chiradzulu', center: { lat: -15.742, lon: 35.14 }, defaultRadiusKm: 5.5, areas: ['Chiradzulu Boma', 'Thumbwe', 'Namadzi', 'Likoswe', 'Mombezi', 'Namitambo', 'Mfera', 'Nansadi'] },
  { district: 'Chitipa', center: { lat: -9.702, lon: 33.27 }, defaultRadiusKm: 7, areas: ['Chitipa Boma', 'Misuku', 'Nthalire', 'Mbilima', 'Wenya', 'Kameme', 'Kapenda', 'Mwenewenya'] },
  { district: 'Dedza', center: { lat: -14.377, lon: 34.336 }, defaultRadiusKm: 6, areas: ['Dedza Boma', 'Lobi', 'Bembeke', 'Mua', 'Golomoti', 'Mtakataka', 'Kaphuka', 'Mphathi'] },
  { district: 'Dowa', center: { lat: -13.653, lon: 33.937 }, defaultRadiusKm: 5.5, areas: ['Dowa Boma', 'Mponela', 'Madisi', 'Bowe', 'Mkukula', 'Nalunga', 'Chakhaza', 'Dzaleka'] },
  { district: 'Karonga', center: { lat: -9.93, lon: 33.93 }, defaultRadiusKm: 6, areas: ['Karonga Boma', 'Chilumba', 'Songwe', 'Nyungwe', 'Wiliro', 'Kaporo', 'Iponga', 'Mwirangombe'] },
  { district: 'Kasungu', center: { lat: -13.033, lon: 33.483 }, defaultRadiusKm: 6, areas: ['Kasungu Boma', 'Linyangwa', 'Santhe', 'Chisemphere', 'Jenda', 'Chulu', 'Dwangwa Turnoff', 'Mphomwa'] },
  { district: 'Likoma', center: { lat: -12.059, lon: 34.737 }, defaultRadiusKm: 4, areas: ['Likoma', 'Mbamba', 'Mlowe', 'Mchuchuma', 'Ulisa', 'Nkhwazi', 'Chikaya', 'Kavuzi'] },
  { district: 'Lilongwe', center: { lat: -13.962, lon: 33.774 }, defaultRadiusKm: 4.5, areas: ['Area 3', 'Area 9', 'Area 18', 'Area 25', 'Area 47', 'Kawale', 'Kangemi', 'Biwi', 'Mtandire', 'Chilinde', 'Kanengo', 'Falls', 'Old Town', 'City Centre', 'Ngwenya', 'Chinsapo'] },
  { district: 'Machinga', center: { lat: -14.97, lon: 35.52 }, defaultRadiusKm: 6, areas: ['Machinga Boma', 'Liwonde', 'Ntaja', 'Nsanama', 'Mposa', 'Mikoko', 'Nachingwea', 'Mikundi'] },
  { district: 'Mangochi', center: { lat: -14.478, lon: 35.264 }, defaultRadiusKm: 6, areas: ['Mangochi Boma', 'Monkey Bay', 'Namwera', 'Lungwena', 'Makanjira', 'Nkope', 'Cape Maclear', 'Chiponde', 'Mpondasi', 'Maldeco'] },
  { district: 'Mchinji', center: { lat: -13.8, lon: 32.88 }, defaultRadiusKm: 6, areas: ['Mchinji Boma', 'Mkanda', 'Kapiri', 'Mduwa', 'Kamwendo', 'Biliwiri', 'Nkhwazi', 'Mikundi'] },
  { district: 'Mulanje', center: { lat: -16.031, lon: 35.5 }, defaultRadiusKm: 5.5, areas: ['Mulanje Boma', 'Chitakale', 'Likhubula', 'Muloza', 'Mimosa', 'Namikoko', 'Thuchila', 'Nansato'] },
  { district: 'Mwanza', center: { lat: -15.602, lon: 34.524 }, defaultRadiusKm: 5.5, areas: ['Mwanza Boma', 'Neno Turnoff', 'Kunenekude', 'Thambani', 'Tulonkhondo', 'Govati', 'Katchere', 'Mtonda'] },
  { district: 'Mzimba', center: { lat: -11.9, lon: 33.6 }, defaultRadiusKm: 6.5, areas: ['Mzuzu City', 'Mzimba Boma', 'Jenda', 'Euthini', 'Embangweni', 'Mpherembe', 'Edingeni', 'Eswazini', 'Luwerezi', 'Bwengu'] },
  { district: 'Neno', center: { lat: -15.4, lon: 34.65 }, defaultRadiusKm: 6, areas: ['Neno Boma', 'Lisungwi', 'Matope', 'Dambe', 'Magaleta', 'Luwani', 'Mzalangwe', 'Khonjeni'] },
  { district: 'Nkhata Bay', center: { lat: -11.6, lon: 34.3 }, defaultRadiusKm: 6, areas: ['Nkhata Bay Boma', 'Chintheche', 'Mpamba', 'Mzenga', 'Kavuzi', 'Dwangwa Bay', 'Chitimba', 'Bandawe'] },
  { district: 'Nkhotakota', center: { lat: -12.93, lon: 34.3 }, defaultRadiusKm: 6, areas: ['Nkhotakota Boma', 'Benga', 'Dwangwa', 'Mphonde', 'Nkhanga', 'Kasitu', 'Mwansambo', 'Linga'] },
  { district: 'Nsanje', center: { lat: -16.92, lon: 35.26 }, defaultRadiusKm: 6, areas: ['Nsanje Boma', 'Bangula', 'Tengani', 'Fatima', 'Nyachikadza', 'Makhanga', 'Marka', 'Muona'] },
  { district: 'Ntcheu', center: { lat: -14.82, lon: 34.63 }, defaultRadiusKm: 5.8, areas: ['Ntcheu Boma', 'Biriwiri', 'Tsangano', 'Lizulu', 'Doviko', 'Kasinje', 'Bilira', 'Mphate'] },
  { district: 'Ntchisi', center: { lat: -13.33, lon: 33.9 }, defaultRadiusKm: 5.8, areas: ['Ntchisi Boma', 'Malomo', 'Kambewere', 'Nsanama', 'Mpherembe', 'Kasakula', 'Nthondo', 'Nkhande'] },
  { district: 'Phalombe', center: { lat: -15.806, lon: 35.648 }, defaultRadiusKm: 5.8, areas: ['Phalombe Boma', 'Migowi', 'Nkhulambe', 'Nambazo', 'Nkhanda', 'Mkhwayi', 'Chitekesa', 'Nadzipulu'] },
  { district: 'Rumphi', center: { lat: -11.018, lon: 33.857 }, defaultRadiusKm: 6, areas: ['Rumphi Boma', 'Bolero', 'Hewe', 'Phoka', 'Nyika', 'Mlowe', 'Mzokoto', 'Katowo'] },
  { district: 'Salima', center: { lat: -13.78, lon: 34.45 }, defaultRadiusKm: 5.8, areas: ['Salima Boma', 'Senga Bay', 'Chipoka', 'Lifuwu', 'Kambwiri', 'Makanjira Turnoff', 'Khombedza', 'Kalonga'] },
  { district: 'Thyolo', center: { lat: -16.067, lon: 35.15 }, defaultRadiusKm: 5.5, areas: ['Thyolo Boma', 'Bvumbwe', 'Luchenza', 'Makwasa', 'Nchiramwera', 'Chimaliro', 'Nansadi', 'Kapichi'] },
  { district: 'Zomba', center: { lat: -15.385, lon: 35.318 }, defaultRadiusKm: 5.5, areas: ['Zomba City', 'Domasi', 'Likangala', 'Chingale', 'Mpemba', 'Matawale', 'Mpondabwino', 'Naisi', 'Sadzi', 'Songani'] },
]);

function roundCoord(value) {
  return Number(value.toFixed(6));
}

function buildAreaRecord(areaInput, index, center, fallbackRadiusKm) {
  const latJitter = ((index % 5) - 2) * 0.011;
  const lonJitter = ((Math.floor(index / 5) % 5) - 2) * 0.011;

  if (typeof areaInput === 'string') {
    return Object.freeze({
      name: areaInput,
      defaultLatitude: roundCoord(center.lat + latJitter),
      defaultLongitude: roundCoord(center.lon + lonJitter),
      defaultRadiusKm: fallbackRadiusKm,
    });
  }

  const name = String(areaInput?.name || '').trim();
  return Object.freeze({
    name,
    defaultLatitude: Number.isFinite(areaInput?.defaultLatitude)
      ? roundCoord(areaInput.defaultLatitude)
      : roundCoord(center.lat + latJitter),
    defaultLongitude: Number.isFinite(areaInput?.defaultLongitude)
      ? roundCoord(areaInput.defaultLongitude)
      : roundCoord(center.lon + lonJitter),
    defaultRadiusKm: Number.isFinite(areaInput?.defaultRadiusKm) && areaInput.defaultRadiusKm > 0
      ? areaInput.defaultRadiusKm
      : fallbackRadiusKm,
  });
}

const MALAWI_LOCATION_MASTER = Object.freeze(
  DISTRICT_AREA_BLUEPRINT.map((entry) => Object.freeze({
    district: entry.district,
    areas: Object.freeze(entry.areas.map((area, index) => buildAreaRecord(area, index, entry.center, entry.defaultRadiusKm || 5))),
  }))
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

function getDistrictEntryByName(district) {
  const normalized = normalizeLocationName(district);
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
