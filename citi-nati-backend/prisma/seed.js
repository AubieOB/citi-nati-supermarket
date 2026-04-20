const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
const {
  buildAllDistrictAreaPairs,
  resolveCanonicalDistrictName,
  resolveCanonicalAreaName,
  normalizeLocationName,
} = require('../src/data/malawiLocations');

const prisma = new PrismaClient();

async function main() {
  try {
    // Check if admin user already exists
    const adminExists = await prisma.user.findFirst({
      where: { role: 'admin' },
    });

    if (!adminExists) {
      const hashedPassword = await bcrypt.hash('Admin@123', 10);

      const adminUser = await prisma.user.create({
        data: {
          name: 'System Admin',
          email: 'admin@citinati.com',
          passwordHash: hashedPassword,
          role: 'admin',
          isActive: true,
        },
      });

      console.log('✓ Admin user created successfully:', adminUser.email);
    } else {
      console.log('✓ Admin user already exists. Skipping admin creation.');
    }

    const masterPairs = buildAllDistrictAreaPairs();
    let createdCount = 0;
    let skippedCount = 0;

    for (const pair of masterPairs) {
      const district = resolveCanonicalDistrictName(pair.district) || pair.district;
      const area = resolveCanonicalAreaName(district, pair.area) || pair.area;

      const existing = await prisma.deliveryZone.findFirst({
        where: {
          district: { equals: district, mode: 'insensitive' },
          area: { equals: area, mode: 'insensitive' },
        },
      });

      if (existing) {
        skippedCount += 1;
        continue;
      }

      await prisma.deliveryZone.create({
        data: {
          district,
          area,
          isActive: false,
        },
      });
      createdCount += 1;
    }

    console.log(`✓ Delivery zones preload complete. Created: ${createdCount}, Existing skipped: ${skippedCount}, Master pairs: ${masterPairs.length}`);

    // Best-effort cleanup: normalize casing/spaces on existing zones to reduce duplicates caused by variants.
    const existingZones = await prisma.deliveryZone.findMany();
    const seen = new Set();
    for (const zone of existingZones) {
      const canonicalDistrict = resolveCanonicalDistrictName(zone.district) || String(zone.district || '').trim().replace(/\s+/g, ' ');
      const canonicalArea = resolveCanonicalAreaName(canonicalDistrict, zone.area) || String(zone.area || '').trim().replace(/\s+/g, ' ');
      const key = `${normalizeLocationName(canonicalDistrict)}::${normalizeLocationName(canonicalArea)}`;

      if (seen.has(key)) {
        continue;
      }

      seen.add(key);

      if (zone.district !== canonicalDistrict || zone.area !== canonicalArea) {
        await prisma.deliveryZone.update({
          where: { id: zone.id },
          data: {
            district: canonicalDistrict,
            area: canonicalArea,
          },
        });
      }
    }
  } catch (err) {
    console.error('✗ Seed error:', err);
    throw err;
  } finally {
    await prisma.$disconnect();
  }
}

main();
