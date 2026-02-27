/**
 * BOOTSTRAP ADMIN ENDPOINT
 * 
 * One-time endpoint to create the first admin account when shell access is not available
 * 
 * Usage:
 * POST /api/admin/bootstrap
 * Headers: 
 *   Authorization: Bearer {ADMIN_BOOTSTRAP_SECRET}
 *   Content-Type: application/json
 * Body: {
 *   email: "admin@citinati.com",
 *   password: "YourSecurePass123!",
 *   name: "System Administrator"
 * }
 * 
 * Security:
 * - Requires secret key from environment variable
 * - Only works if no admin exists
 * - Logs all attempts
 * - Can only be used once
 */

const express = require('express');
const bcrypt = require('bcrypt');
const { PrismaClient } = require('@prisma/client');

const router = express.Router();
const prisma = new PrismaClient();

/**
 * POST /api/admin/bootstrap
 * Create first admin account (one-time use)
 */
router.post('/bootstrap', async (req, res) => {
  try {
    // Check if bootstrap is enabled
    const bootstrapSecret = process.env.ADMIN_BOOTSTRAP_SECRET;
    if (!bootstrapSecret) {
      console.log('[BOOTSTRAP] Endpoint disabled: ADMIN_BOOTSTRAP_SECRET not set');
      return res.status(404).json({ error: 'Not found' });
    }

    // Get secret from Authorization header (Bearer token)
    const authHeader = req.headers.authorization;
    const providedSecret = authHeader?.replace('Bearer ', '');

    if (!providedSecret || providedSecret !== bootstrapSecret) {
      console.warn('[BOOTSTRAP] Unauthorized attempt - invalid or missing secret');
      return res.status(401).json({ error: 'Unauthorized - invalid secret' });
    }

    // Check if admin already exists
    const adminExists = await prisma.user.findFirst({
      where: { role: 'admin' }
    });

    if (adminExists) {
      console.log('[BOOTSTRAP] Attempt denied - admin already exists:', adminExists.email);
      return res.status(409).json({ 
        error: 'Admin already exists',
        message: 'Bootstrap can only be used once',
        existingAdmin: adminExists.email
      });
    }

    // Validate input
    const { email, password, name } = req.body;

    if (!email || !password) {
      console.warn('[BOOTSTRAP] Missing required fields');
      return res.status(400).json({ error: 'Missing email or password' });
    }

    // Validate password strength
    if (password.length < 8) {
      console.warn('[BOOTSTRAP] Password too weak (length < 8)');
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    // Check if email already exists
    const emailExists = await prisma.user.findUnique({
      where: { email }
    });

    if (emailExists) {
      console.warn('[BOOTSTRAP] Email already in use:', email);
      return res.status(400).json({ error: 'Email already exists in system' });
    }

    // Hash password with bcrypt
    console.log('[BOOTSTRAP] Hashing password...');
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create admin user
    console.log('[BOOTSTRAP] Creating admin account:', email);
    const adminUser = await prisma.user.create({
      data: {
        name: name || 'System Administrator',
        email,
        passwordHash: hashedPassword,
        role: 'admin',
        isActive: true,
        emailVerified: true,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
      }
    });

    console.log('[BOOTSTRAP] ✅ SUCCESS - Admin account created:', adminUser.email);

    return res.status(201).json({
      success: true,
      message: 'Admin account created successfully',
      admin: adminUser,
      note: 'You can now login with the provided credentials'
    });

  } catch (err) {
    console.error('[BOOTSTRAP] Error:', err.message);
    
    if (err.code === 'P2002') {
      return res.status(400).json({ 
        error: 'Unique constraint violation - record may already exist' 
      });
    }

    res.status(500).json({ 
      error: 'Failed to create admin account',
      message: err.message 
    });
  }
});

module.exports = router;
