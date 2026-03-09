/**
 * BOOTSTRAP ADMIN ENDPOINTS
 * 
 * 1. GET /api/admin/setup - TEMPORARY hardcoded admin (DELETE AFTER USE)
 * 2. POST /api/admin/bootstrap - Secure secret-based admin creation
 */

const express = require('express');
const bcrypt = require('bcrypt');
const prisma = require('../prisma'); // Use shared Prisma instance

const router = express.Router();

/**
 * GET /api/admin/setup
 * TEMPORARY: Hardcoded admin setup for initial access
 * DELETE THIS ENDPOINT AFTER FIRST LOGIN
 * Usage: Visit https://your-backend/api/admin/setup in browser
 */
router.get('/setup', async (req, res) => {
  try {
    // Check if admin already exists
    const adminExists = await prisma.user.findFirst({
      where: { role: 'admin' }
    });

    if (adminExists) {
      console.log('[SETUP] Admin already exists');
      return res.status(409).json({ 
        error: 'Admin already exists',
        email: adminExists.email
      });
    }

    // Hardcoded credentials - TEMPORARY ONLY
    const hardcodedEmail = 'admin@citinati.com';
    const hardcodedPassword = 'Admin123!';

    // Hash password
    const hashedPassword = await bcrypt.hash(hardcodedPassword, 10);

    // Create admin
    const admin = await prisma.user.create({
      data: {
        name: 'System Administrator',
        email: hardcodedEmail,
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

    console.log('[SETUP] ✅ Hardcoded admin created:', admin.email);

    return res.status(201).json({
      success: true,
      message: 'Admin setup complete',
      credentials: {
        email: hardcodedEmail,
        password: hardcodedPassword,
      },
      warning: 'DELETE /api/admin/setup ENDPOINT AFTER FIRST LOGIN'
    });

  } catch (err) {
    console.error('[SETUP] Error:', err.message);
    res.status(500).json({ error: 'Setup failed' });
  }
});

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
