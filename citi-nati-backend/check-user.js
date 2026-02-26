const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(async () => {
  try {
    // Check in users table
    const user = await prisma.user.findUnique({ 
      where: { email: 'Aubreymkhulanabanda@gmail.com' }
    });
    if (user) {
      console.log('User in users table:');
      console.log('Email:', user.email);
      console.log('Name:', user.name);
      console.log('Email Verified:', user.emailVerified);
    } else {
      console.log('Not in users table');
    }
    
    // Check in pending users
    const pending = await prisma.pendingUser.findUnique({ 
      where: { email: 'Aubreymkhulanabanda@gmail.com' }
    });
    if (pending) {
      console.log('\nPending user found:');
      console.log('Code:', pending.verificationCode);
    } else {
      console.log('Not in pending_users table');
    }
  } finally {
    await prisma.$disconnect();
  }
})();
