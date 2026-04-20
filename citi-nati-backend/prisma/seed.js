const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

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

    const initialDeliveryZones = [
      { district: 'Blantyre', area: 'Namiwawa' },
      { district: 'Blantyre', area: 'Nyambadwe' },
      { district: 'Blantyre', area: 'Soche' },
      { district: 'Blantyre', area: 'Chirimba' },
      { district: 'Blantyre', area: 'Limbe' },
      { district: 'Blantyre', area: 'Chichiri' },
      { district: 'Blantyre', area: 'Kanjedza' },
      { district: 'Blantyre', area: 'Ndirande' },
      { district: 'Blantyre', area: 'Mpingwe' },
      { district: 'Blantyre', area: 'Maselema' },
    ];

    for (const zone of initialDeliveryZones) {
      await prisma.deliveryZone.upsert({
        where: {
          district_area: {
            district: zone.district,
            area: zone.area,
          },
        },
        update: {
          isActive: true,
        },
        create: {
          district: zone.district,
          area: zone.area,
          isActive: true,
        },
      });
    }

    console.log(`✓ Seeded ${initialDeliveryZones.length} delivery zones.`);
  } catch (err) {
    console.error('✗ Seed error:', err);
    throw err;
  } finally {
    await prisma.$disconnect();
  }
}

main();
