/**
 * BOOTSTRAP ADMIN ENDPOINTS
 * 
 * 1. GET /api/admin/setup - TEMPORARY hardcoded admin (DELETE AFTER USE)
 * 2. POST /api/admin/bootstrap - Secure secret-based admin creation
 */

const express = require('express');
const bcrypt = require('bcrypt');
const { PrismaClient } = require('@prisma/client');
const { validateStrongPassword } = require('../utils/passwordPolicy');
const logger = require('../utils/logger');

const router = express.Router();
const prisma = new PrismaClient();

/**
 * GET /api/admin/setup
 * TEMPORARY: Hardcoded admin setup for initial access
 * DELETE THIS ENDPOINT AFTER FIRST LOGIN
 * Usage: Visit https://your-backend/api/admin/setup in browser
 */
router.get('/setup', async (req, res) => {
  try {
    if (process.env.NODE_ENV === 'production' || process.env.ENABLE_INSECURE_ADMIN_SETUP !== 'true') {
      return res.status(404).json({ error: 'Not found' });
    }

    // Check if admin already exists
    const adminExists = await prisma.user.findFirst({
      where: { role: 'admin' }
    });

    if (adminExists) {
      logger.warnLog('[SETUP] Admin already exists');
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

    logger.warnLog('[SETUP] Hardcoded admin created', { email: admin.email });

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
    logger.errorLog('[SETUP] Error', err);
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
      logger.warnLog('[BOOTSTRAP] Endpoint disabled: ADMIN_BOOTSTRAP_SECRET not set');
      return res.status(404).json({ error: 'Not found' });
    }

    // Get secret from Authorization header (Bearer token)
    const authHeader = req.headers.authorization;
    const providedSecret = authHeader?.replace('Bearer ', '');

    if (!providedSecret || providedSecret !== bootstrapSecret) {
      logger.warnLog('[BOOTSTRAP] Unauthorized attempt - invalid or missing secret');
      return res.status(401).json({ error: 'Unauthorized - invalid secret' });
    }

    // Check if admin already exists
    const adminExists = await prisma.user.findFirst({
      where: { role: 'admin' }
    });

    if (adminExists) {
      logger.warnLog('[BOOTSTRAP] Attempt denied - admin already exists', { email: adminExists.email });
      return res.status(409).json({ 
        error: 'Admin already exists',
        message: 'Bootstrap can only be used once',
        existingAdmin: adminExists.email
      });
    }

    // Validate input
    const { email, password, name } = req.body;

    if (!email || !password) {
      logger.warnLog('[BOOTSTRAP] Missing required fields');
      return res.status(400).json({ error: 'Missing email or password' });
    }

    const passwordValidation = validateStrongPassword(password);
    if (!passwordValidation.valid) {
      logger.warnLog('[BOOTSTRAP] Weak password rejected');
      return res.status(400).json({ error: passwordValidation.errors[0] });
    }

    // Check if email already exists
    const emailExists = await prisma.user.findUnique({
      where: { email }
    });

    if (emailExists) {
      logger.warnLog('[BOOTSTRAP] Email already in use', { email });
      return res.status(400).json({ error: 'Email already exists in system' });
    }

    // Hash password with bcrypt
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create admin user
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

    logger.infoLog('[BOOTSTRAP] Admin account created', { email: adminUser.email });

    return res.status(201).json({
      success: true,
      message: 'Admin account created successfully',
      admin: adminUser,
      note: 'You can now login with the provided credentials'
    });

  } catch (err) {
    logger.errorLog('[BOOTSTRAP] Error', err);
    
    if (err.code === 'P2002') {
      return res.status(400).json({ 
        error: 'Unique constraint violation - record may already exist' 
      });
    }

    res.status(500).json({ 
      error: 'Failed to create admin account',
      message: 'Something went wrong' 
    });
  }
});

module.exports = router;
