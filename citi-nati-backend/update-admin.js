const bcrypt = require('bcrypt');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function updateAdmin() {
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

    console.log('Updating admin user...\n');
    console.log(`Before:`);
    console.log(`  Email: ${adminUser.email}`);
    console.log(`  Name: ${adminUser.name}`);

    // New credentials
    const newEmail = 'admin@citinati.com';
    const newName = 'System Admin';
    const newPassword = 'Admin@123';

    // Hash password
    const passwordHash = await bcrypt.hash(newPassword, 10);

    // Update admin user
    await prisma.user.update({
      where: { id: adminUser.id },
      data: {
        email: newEmail,
        name: newName,
        passwordHash: passwordHash,
      },
    });

    console.log(`\nAfter:`);
    console.log(`  Email: ${newEmail}`);
    console.log(`  Name: ${newName}`);
    console.log(`  Password: ${newPassword}`);
    console.log(`\n✅ Admin updated successfully!`);
    console.log(`\nYou can now login with:`);
    console.log(`  Email: ${newEmail}`);
    console.log(`  Password: ${newPassword}`);
  } catch (err) {
    console.error('❌ Error:', err.message);
  } finally {
    await prisma.$disconnect();
  }
}

updateAdmin();
