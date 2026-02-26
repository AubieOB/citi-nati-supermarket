const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function checkUserRoles() {
  try {
    const users = await prisma.user.findMany({
      select: { id: true, email: true, role: true },
    });

    console.log('All users and their roles:');
    users.forEach(user => {
      console.log(`  ${user.email}: ${user.role}`);
    });
  } catch (err) {
    console.error('✗ Error fetching users:', err);
    throw err;
  } finally {
    await prisma.$disconnect();
  }
}

checkUserRoles();
