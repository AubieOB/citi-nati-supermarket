const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(async () => {
  try {
    const pending = await prisma.pendingUser.findUnique({ 
      where: { email: 'Aubreymkhulanabanda@gmail.com' }
    });
    if (pending) {
      console.log('Email:', pending.email);
      console.log('Code in DB:', pending.verificationCode);
      console.log('Expiry:', pending.verificationCodeExpiry);
      console.log('Now:', new Date());
      console.log('Is expired:', new Date() > pending.verificationCodeExpiry);
    } else {
      console.log('No pending user found for Aubreymkhulanabanda@gmail.com');
    }
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await prisma.$disconnect();
  }
})();
