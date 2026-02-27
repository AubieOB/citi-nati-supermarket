#!/usr/bin/env node

/**
 * SECURE ADMIN ACCOUNT SETUP
 * 
 * One-time script to create the first admin account
 * Run manually via terminal: node scripts/seedAdmin.js
 * 
 * Required Environment Variables:
 * - ADMIN_EMAIL (admin email address)
 * - ADMIN_PASSWORD (admin password - must be strong)
 * - ADMIN_NAME (admin display name, optional)
 * 
 * Security Features:
 * - Checks if admin already exists (prevents duplicates)
 * - Hashes password with bcrypt before storing
 * - Never logs password to console
 * - Must be run manually (not automated)
 * - Sets emailVerified to true for admin account
 */

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
require('dotenv').config();

const prisma = new PrismaClient();

async function seedAdmin() {
  try {
    console.log('🔐 Starting Secure Admin Account Setup...\n');

    // Validate environment variables
    const adminEmail = process.env.ADMIN_EMAIL;
    const adminPassword = process.env.ADMIN_PASSWORD;
    const adminName = process.env.ADMIN_NAME || 'System Administrator';

    if (!adminEmail || !adminPassword) {
      console.error('❌ ERROR: Missing required environment variables');
      console.error('   Required: ADMIN_EMAIL, ADMIN_PASSWORD');
      console.error('\n📝 Example:');
      console.error('   ADMIN_EMAIL=admin@citinati.com ADMIN_PASSWORD=YourSecurePassword123! node scripts/seedAdmin.js');
      process.exit(1);
    }

    // Validate password strength
    if (adminPassword.length < 8) {
      console.error('❌ ERROR: Password must be at least 8 characters long');
      process.exit(1);
    }

    console.log(`📧 Checking for existing admin account...`);

    // Check if admin already exists
    const adminExists = await prisma.user.findFirst({
      where: { role: 'admin' },
      select: { id: true, email: true, name: true }
    });

    if (adminExists) {
      console.log(`✓ Admin already exists: ${adminExists.email}`);
      console.log(`ℹ️  Aborting to prevent duplicate admin accounts.\n`);
      process.exit(0);
    }

    // Check if email already exists (for admin)
    const emailExists = await prisma.user.findUnique({
      where: { email: adminEmail }
    });

    if (emailExists) {
      console.error(`❌ ERROR: Email ${adminEmail} already exists in system`);
      console.error(`   Use a different email or delete the existing user first.`);
      process.exit(1);
    }

    console.log(`✓ No existing admin found\n`);
    console.log(`🔒 Hashing password...`);

    // Hash password with bcrypt
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(adminPassword, saltRounds);

    console.log(`✓ Password hashed securely\n`);
    console.log(`👤 Creating admin account...`);
    console.log(`   Email: ${adminEmail}`);
    console.log(`   Name: ${adminName}\n`);

    // Create admin user
    const adminUser = await prisma.user.create({
      data: {
        name: adminName,
        email: adminEmail,
        passwordHash: hashedPassword,
        role: 'admin',
        isActive: true,
        emailVerified: true, // Admin is pre-verified
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true
      }
    });

    console.log('✅ SUCCESS: Admin account created!\n');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`ID:        ${adminUser.id}`);
    console.log(`Email:     ${adminUser.email}`);
    console.log(`Name:      ${adminUser.name}`);
    console.log(`Role:      ${adminUser.role}`);
    console.log(`Created:   ${adminUser.createdAt.toISOString()}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('🚀 You can now login with:');
    console.log(`   Email:    ${adminEmail}`);
    console.log(`   Password: [Your provided password]\n`);
    console.log('⚠️  IMPORTANT: Do not run this script again with the same email.\n');

  } catch (err) {
    console.error('❌ ERROR during admin creation:', err.message);
    if (err.code === 'P2002') {
      console.error('   Unique constraint violation - this record may already exist');
    }
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the seed function
seedAdmin();
