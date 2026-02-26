const bcrypt = require('bcrypt');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function verifyAdminPassword() {
  try {
    // Get admin user from database
    const adminUser = await prisma.user.findFirst({
      where: { role: 'ADMIN' },
    });

    if (!adminUser) {
      console.log('❌ No admin user found in database');
      process.exit(1);
    }

    console.log('✓ Admin user found:');
    console.log(`  Email: ${adminUser.email}`);
    console.log(`  Name: ${adminUser.name}`);
    console.log(`  Role: ${adminUser.role}`);
    console.log(`  Password Hash: ${adminUser.passwordHash.substring(0, 20)}...`);

    // Test password
    const testPassword = 'Admin@123';
    const isValid = await bcrypt.compare(testPassword, adminUser.passwordHash);

    console.log(`\n✓ Testing password: "${testPassword}"`);
    console.log(`  Result: ${isValid ? '✅ VALID' : '❌ INVALID'}`);

    if (!isValid) {
      console.log('\n⚠️  Password mismatch detected!');
      console.log('Attempting to rehash and update...\n');
      
      // Hash new password
      const newHash = await bcrypt.hash(testPassword, 10);
      
      // Update user
      await prisma.user.update({
        where: { id: adminUser.id },
        data: { passwordHash: newHash },
      });

      console.log('✓ Password updated successfully!');
      console.log(`  New hash: ${newHash.substring(0, 20)}...`);
      console.log('\nTry logging in again with:');
      console.log(`  Email: ${adminUser.email}`);
      console.log(`  Password: ${testPassword}`);
    }
  } catch (err) {
    console.error('❌ Error:', err.message);
  } finally {
    await prisma.$disconnect();
  }
}

verifyAdminPassword();
