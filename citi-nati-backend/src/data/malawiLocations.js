const MALAWI_LOCATION_MASTER = Object.freeze([
  { district: 'Balaka', areas: ['Balaka Boma', 'Ulongwe', 'Mpilisi', 'Nsamala', 'Liwonde Turnoff'] },
  { district: 'Blantyre', areas: ['Namiwawa', 'Nyambadwe', 'Soche', 'Chirimba', 'Limbe', 'Chichiri', 'Kanjedza', 'Ndirande', 'Mpingwe', 'Maselema'] },
  { district: 'Chikwawa', areas: ['Chikwawa Boma', 'Ngabu', 'Nchalo', 'Lulwe', 'Makhwira'] },
  { district: 'Chiradzulu', areas: ['Chiradzulu Boma', 'Thumbwe', 'Namadzi', 'Likoswe', 'Mombezi'] },
  { district: 'Chitipa', areas: ['Chitipa Boma', 'Misuku', 'Nthalire', 'Mbilima', 'Wenya'] },
  { district: 'Dedza', areas: ['Dedza Boma', 'Lobi', 'Bembeke', 'Mua', 'Golomoti'] },
  { district: 'Dowa', areas: ['Dowa Boma', 'Mponela', 'Madisi', 'Bowe', 'Mkukula'] },
  { district: 'Karonga', areas: ['Karonga Boma', 'Chilumba', 'Songwe', 'Nyungwe', 'Wiliro'] },
  { district: 'Kasungu', areas: ['Kasungu Boma', 'Linyangwa', 'Santhe', 'Chisemphere', 'Jenda'] },
  { district: 'Likoma', areas: ['Likoma', 'Mbamba', 'Mlowe', 'Mchuchuma', 'Ulisa'] },
  { district: 'Lilongwe', areas: ['Area 3', 'Area 18', 'Area 25', 'Kawale', 'Kangemi', 'Biwi', 'Mtandire', 'Chilinde'] },
  { district: 'Machinga', areas: ['Machinga Boma', 'Liwonde', 'Ntaja', 'Nsanama', 'Mposa'] },
  { district: 'Mangochi', areas: ['Mangochi Boma', 'Monkey Bay', 'Namwera', 'Lungwena', 'Makanjira'] },
  { district: 'Mchinji', areas: ['Mchinji Boma', 'Mkanda', 'Kapiri', 'Mduwa', 'Kamwendo'] },
  { district: 'Mulanje', areas: ['Mulanje Boma', 'Chitakale', 'Likhubula', 'Muloza', 'Mimosa'] },
  { district: 'Mwanza', areas: ['Mwanza Boma', 'Neno Turnoff', 'Kunenekude', 'Thambani', 'Tulonkhondo'] },
  { district: 'Mzimba', areas: ['Mzuzu City', 'Mzimba Boma', 'Jenda', 'Euthini', 'Embangweni'] },
  { district: 'Neno', areas: ['Neno Boma', 'Lisungwi', 'Matope', 'Dambe', 'Magaleta'] },
  { district: 'Nkhata Bay', areas: ['Nkhata Bay Boma', 'Chintheche', 'Mpamba', 'Mzenga', 'Kavuzi'] },
  { district: 'Nkhotakota', areas: ['Nkhotakota Boma', 'Benga', 'Dwangwa', 'Mphonde', 'Nkhanga'] },
  { district: 'Nsanje', areas: ['Nsanje Boma', 'Bangula', 'Tengani', 'Fatima', 'Nyachikadza'] },
  { district: 'Ntcheu', areas: ['Ntcheu Boma', 'Biriwiri', 'Tsangano', 'Lizulu', 'Doviko'] },
  { district: 'Ntchisi', areas: ['Ntchisi Boma', 'Malomo', 'Kambewere', 'Nsanama', 'Mpherembe'] },
  { district: 'Phalombe', areas: ['Phalombe Boma', 'Migowi', 'Nkhulambe', 'Nambazo', 'Nkhanda'] },
  { district: 'Rumphi', areas: ['Rumphi Boma', 'Bolero', 'Hewe', 'Phoka', 'Nyika'] },
  { district: 'Salima', areas: ['Salima Boma', 'Senga Bay', 'Chipoka', 'Lifuwu', 'Kambwiri'] },
  { district: 'Thyolo', areas: ['Thyolo Boma', 'Bvumbwe', 'Luchenza', 'Makwasa', 'Nchiramwera'] },
  { district: 'Zomba', areas: ['Zomba City', 'Domasi', 'Likangala', 'Chingale', 'Mpemba'] },
]);

function normalizeLocationName(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
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
  const matched = districtEntry.areas.find((item) => normalizeLocationName(item) === normalizedArea);
  return matched || null;
}

function buildAllDistrictAreaPairs() {
  return MALAWI_LOCATION_MASTER.flatMap((entry) =>
    entry.areas.map((area) => ({ district: entry.district, area }))
  );
}

module.exports = {
  MALAWI_LOCATION_MASTER,
  normalizeLocationName,
  getAllMalawiDistricts,
  getAreasForDistrict,
  resolveCanonicalDistrictName,
  resolveCanonicalAreaName,
  buildAllDistrictAreaPairs,
};
