/**
 * TEMPORARY ADMIN SETUP ENDPOINT
 * 
 * ⚠️  WARNING: TEMPORARY - DELETE AFTER FIRST LOGIN
 * 
 * Creates hardcoded admin account for initial setup.
 * This endpoint should be removed and this file deleted after you've logged in
 * and set up your admin account properly.
 * 
 * Usage:
 * GET /api/setup/create-admin
 */

const express = require('express');
const bcrypt = require('bcrypt');
const { PrismaClient } = require('@prisma/client');
const { validateStrongPassword } = require('../utils/passwordPolicy');
const logger = require('../utils/logger');

const router = express.Router();
const prisma = new PrismaClient();

/**
 * GET /api/setup/create-admin
 * 
 * Creates temporary hardcoded admin account
 * Email: admin@citinati.com
 * Password: AdminPassword123!
 * 
 * ⚠️  DELETE THIS ENDPOINT AFTER USE
 */
router.get('/create-admin', async (req, res) => {
  try {
    if (process.env.NODE_ENV === 'production' || process.env.ENABLE_INSECURE_ADMIN_SETUP !== 'true') {
      return res.status(404).json({ error: 'Not found' });
    }

    // Check if admin already exists
    const adminExists = await prisma.user.findFirst({
      where: { role: 'admin' }
    });

    if (adminExists) {
      return res.status(409).json({
        error: 'Admin already exists',
        email: adminExists.email,
        message: 'You can login with the existing admin account'
      });
    }

    // Hardcoded credentials (TEMPORARY - DELETE AFTER USE)
    const email = 'admin@citinati.com';
    const password = 'AdminPassword123!';
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create admin user
    const adminUser = await prisma.user.create({
      data: {
        name: 'System Administrator',
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

    logger.warnLog('[SETUP] Hardcoded admin account created', { email: adminUser.email });

    return res.status(201).json({
      success: true,
      message: '✅ Admin account created! Login with the credentials below.',
      credentials: {
        email: 'admin@citinati.com',
        password: 'AdminPassword123!'
      },
      admin: adminUser,
      warning: '⚠️  DELETE THIS ENDPOINT AFTER LOGGING IN - IT IS TEMPORARY'
    });

  } catch (err) {
    logger.errorLog('[SETUP] Error', err);
    
    if (err.code === 'P2002') {
      return res.status(400).json({
        error: 'Email already exists'
      });
    }

    res.status(500).json({
      error: 'Failed to create admin account',
      message: 'Something went wrong'
    });
  }
});

module.exports = router;
