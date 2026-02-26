const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function updateUserRoles() {
  try {
    const result = await prisma.user.updateMany({
      where: { role: 'STAFF' },
      data: { role: 'USER' },
    });

    console.log(`✓ Updated ${result.count} users from STAFF to USER`);
  } catch (err) {
    console.error('✗ Error updating user roles:', err);
    throw err;
  } finally {
    await prisma.$disconnect();
  }
}

updateUserRoles();
