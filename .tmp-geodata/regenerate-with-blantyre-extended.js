const fs = require('fs');
const path = require('path');

// Read GeoNames data
console.log('Reading GeoNames Malawi data...');
const mwData = fs.readFileSync('MW.txt', 'utf-8').split('\n').filter(line => line.trim());

// Parse admin2 codes to get district mappings
console.log('Building district/area mappings...');
const admin2File = fs.readFileSync('admin2Codes.txt', 'utf-8').split('\n');
const admin2Map = {};

admin2File.forEach(line => {
  if (!line.trim()) return;
  const parts = line.split('\t');
  if (parts[0] && parts[0].startsWith('MW.')) {
    const code = parts[0]; // e.g., "MW.04.01"
    const districtName = parts[1];
    admin2Map[code] = districtName;
  }
});

console.log(`Loaded ${Object.keys(admin2Map).length} admin2 codes`);

// Manually added areas for Blantyre (not in GeoNames but reported as critical)
const blantyreMissingAreas = [
  { name: 'Chitawira', defaultLatitude: -15.78, defaultLongitude: 35.02, defaultRadiusKm: 4.5 },
  { name: 'New Naperi', defaultLatitude: -15.79, defaultLongitude: 35.01, defaultRadiusKm: 4.5 },
  { name: 'Old Naperi', defaultLatitude: -15.81, defaultLongitude: 35.00, defaultRadiusKm: 4.5 },
  { name: 'Chinyonga', defaultLatitude: -15.77, defaultLongitude: 34.99, defaultRadiusKm: 4.5 }
];

// Parse GeoNames data
const districtAreas = {};

mwData.forEach(line => {
  if (!line.trim()) return;
  const parts = line.split('\t');
  
  const geonameid = parts[0];
  const name = parts[1];
  const latitude = parseFloat(parts[4]);
  const longitude = parseFloat(parts[5]);
  const featureClass = parts[6];
  const featureCode = parts[7];
  const countryCode = parts[8];
  const cc2 = parts[9];
  const admin1Code = parts[10];
  const admin2Code = parts[11];
  
  if (!name || isNaN(latitude) || isNaN(longitude)) return;
  
  // Build admin2 full code (e.g., "MW.04.01" for Blantyre areas)
  const fullAdmin2Code = admin2Code ? `MW.${admin1Code}.${admin2Code}` : null;
  const districtName = fullAdmin2Code ? admin2Map[fullAdmin2Code] : null;
  
  if (!districtName) {
    // Try alternate: if we have admin1Code but no admin2, group by admin1
    const admin1DistrictCode = `MW.${admin1Code}`;
    // We'll handle district-level grouping separately if needed
    return;
  }
  
  // Include ALL entries for this district (not filtered by feature code)
  if (!districtAreas[districtName]) {
    districtAreas[districtName] = new Map(); // Use Map to deduplicate by name
  }
  
  const normalizedName = name.toLowerCase().trim();
  if (!districtAreas[districtName].has(normalizedName)) {
    districtAreas[districtName].set(normalizedName, {
      name: name,
      defaultLatitude: Math.round(latitude * 1000000) / 1000000,
      defaultLongitude: Math.round(longitude * 1000000) / 1000000,
      defaultRadiusKm: 4.5
    });
  }
});

// Convert Maps to arrays
Object.keys(districtAreas).forEach(district => {
  districtAreas[district] = Array.from(districtAreas[district].values());
});

// Add Blantyre missing areas
if (districtAreas['Blantyre District']) {
  const blantyreNames = new Set(districtAreas['Blantyre District'].map(a => a.name.toLowerCase()));
  
  blantyreMissingAreas.forEach(area => {
    if (!blantyreNames.has(area.name.toLowerCase())) {
      districtAreas['Blantyre District'].push(area);
      console.log(`Added missing Blantyre area: ${area.name}`);
    }
  });
}

// Sort areas within each district
Object.keys(districtAreas).forEach(district => {
  districtAreas[district].sort((a, b) => a.name.localeCompare(b.name));
});

// Build output structure
const districts = Object.keys(districtAreas)
  .sort()
  .map(districtName => ({
    district: districtName,
    areas: districtAreas[districtName]
  }));

const output = {
  source: 'GeoNames Malawi dump (MW.zip + admin2Codes) with manual Blantyre extensions',
  generatedAt: new Date().toISOString(),
  districtCount: districts.length,
  areaCount: districts.reduce((sum, d) => sum + d.areas.length, 0),
  districts: districts
};

const outputPath = path.join(__dirname, '..', 'citi-nati-backend', 'src', 'data', 'malawiLocations.generated.json');
fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));

console.log(`
Generated: ${outputPath}
Districts: ${output.districtCount}
Total areas: ${output.areaCount}
Blantyre District areas: ${districtAreas['Blantyre District']?.length || 0}
`);
