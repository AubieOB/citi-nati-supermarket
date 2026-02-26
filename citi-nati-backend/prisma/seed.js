const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

async function main() {
  try {
    // Check if admin user already exists
    const adminExists = await prisma.user.findFirst({
      where: { role: 'admin' },
    });

    if (adminExists) {
      console.log('✓ Admin user already exists. Skipping seed.');
      return;
    }

    // Hash password
    const hashedPassword = await bcrypt.hash('Admin@123', 10);

    // Create admin user
    const adminUser = await prisma.user.create({
      data: {
        name: 'System Admin',
        email: 'admin@citinati.com',
        passwordHash: hashedPassword,
        role: 'admin',
        isActive: true,
      },
    });

    console.log('✓ Admin user created successfully:', adminUser);
  } catch (err) {
    console.error('✗ Seed error:', err);
    throw err;
  } finally {
    await prisma.$disconnect();
  }
}

main();
