const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(async () => {
  try {
    const pending = await prisma.pendingUser.findUnique({ 
      where: { email: 'finaltest@example.com' }
    });
    console.log('Pending User:', JSON.stringify(pending, null, 2));
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await prisma.$disconnect();
  }
})();
