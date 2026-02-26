const bcrypt = require('bcrypt');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function updateAdminPassword() {
  try {
    // Get admin user from database
    const adminUser = await prisma.user.findFirst({
      where: { role: 'ADMIN' },
    });

    if (!adminUser) {
      // If no lowercase admin found, try uppercase for backward compatibility
      adminUser = await prisma.user.findFirst({
        where: { role: 'ADMIN' },
      });
    }

    if (!adminUser) {
      console.log('❌ No admin user found in database');
      process.exit(1);
    }

    console.log('Updating admin password...\n');
    console.log(`Admin Email: ${adminUser.email}`);

    // New password
    const newPassword = '@citinati2026';

    // Hash password
    const passwordHash = await bcrypt.hash(newPassword, 10);

    // Update admin user password
    await prisma.user.update({
      where: { id: adminUser.id },
      data: {
        passwordHash: passwordHash,
      },
    });

    console.log(`\n✅ Password updated successfully!`);
    console.log(`\nYou can now login with:`);
    console.log(`  Email: ${adminUser.email}`);
    console.log(`  Password: ${newPassword}`);
  } catch (err) {
    console.error('❌ Error:', err.message);
  } finally {
    await prisma.$disconnect();
  }
}

updateAdminPassword();
