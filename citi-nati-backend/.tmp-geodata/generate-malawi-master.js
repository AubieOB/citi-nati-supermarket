const fs = require('fs');
const path = require('path');

const base = path.join(process.cwd(), '.tmp-geodata');
const mwPath = path.join(base, 'MW', 'MW.txt');
const admin2Path = path.join(base, 'admin2Codes.txt');

const mwLines = fs.readFileSync(mwPath, 'utf8').split(/\r?\n/).filter(Boolean);
const admin2Lines = fs.readFileSync(admin2Path, 'utf8').split(/\r?\n/).filter(Boolean);

const districtByCode = new Map();
for (const line of admin2Lines) {
  const parts = line.split('\t');
  const code = parts[0];
  const name = parts[1];
  if (!code || !name || !code.startsWith('MW.')) continue;
  const cp = code.split('.');
  if (cp.length < 3) continue;
  districtByCode.set(`${cp[1]}.${cp[2]}`, name.trim());
}

const byDistrict = new Map();
function addArea(district, areaObj) {
  if (!byDistrict.has(district)) byDistrict.set(district, new Map());
  byDistrict.get(district).set(areaObj.name.toLowerCase(), areaObj);
}

for (const line of mwLines) {
  const p = line.split('\t');
  if (p.length < 19) continue;
  const name = String(p[1] || '').trim();
  const lat = Number(p[4]);
  const lon = Number(p[5]);
  const featureClass = p[6];
  const featureCode = p[7];
  const country = p[8];
  const admin1 = p[10];
  const admin2 = p[11];

  if (country !== 'MW') continue;
  if (featureClass !== 'P') continue;
  if (!name || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
  if (!(featureCode.startsWith('PPL') || featureCode === 'STLMT')) continue;

  const district = districtByCode.get(`${admin1}.${admin2}`);
  if (!district) continue;

  addArea(district, {
    name,
    defaultLatitude: Number(lat.toFixed(6)),
    defaultLongitude: Number(lon.toFixed(6)),
    defaultRadiusKm: 4.5,
  });
}

const districts = Array.from(byDistrict.entries())
  .map(([district, areaMap]) => ({
    district,
    areas: Array.from(areaMap.values()).sort((a, b) => a.name.localeCompare(b.name)),
  }))
  .sort((a, b) => a.district.localeCompare(b.district));

const output = {
  source: 'GeoNames Malawi dump (MW.zip + admin2Codes)',
  generatedAt: new Date().toISOString(),
  districtCount: districts.length,
  areaCount: districts.reduce((sum, d) => sum + d.areas.length, 0),
  districts,
};

const outPath = path.join(process.cwd(), 'src', 'data', 'malawiLocations.generated.json');
fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
console.log('districts:', output.districtCount, 'areas:', output.areaCount);
