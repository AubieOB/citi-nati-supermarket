/**
 * Admin Routes
 * 
 * All routes protected by:
 * 1. verifyToken - Ensures user is authenticated
 * 2. verifyAdmin - Ensures user has admin role
 * 
 * Usage in server.js:
 *   app.use('/api/admin', adminRoutes);
 */

const express = require('express');
const { verifyTokenMiddleware } = require('../middleware/auth.middleware');
const { verifyAdmin } = require('../middleware/admin.middleware');
const { PrismaClient } = require('@prisma/client');

const router = express.Router();
const prisma = new PrismaClient();

/**
 * GET /api/admin/test
 * Simple test endpoint to verify admin access
 * Returns success if user is authenticated admin
 */
router.get('/test', verifyTokenMiddleware, verifyAdmin, (req, res) => {
  return res.json({ 
    success: true,
    message: 'Admin access granted',
    user: { 
      id: req.user.id, 
      email: req.user.email,
      role: req.user.role 
    }
  });
});

/**
 * GET /api/admin/dashboard
 * Admin dashboard statistics
 * Protected: Admin only
 */
router.get('/dashboard', verifyTokenMiddleware, verifyAdmin, async (req, res) => {
  try {
    const totalUsers = await prisma.user.count();
    const totalOrders = await prisma.order.count();
    
    res.json({
      success: true,
      data: {
        totalUsers,
        totalOrders,
      }
    });
  } catch (err) {
    console.error('Dashboard error:', err);
    res.status(500).json({ error: 'Failed to fetch dashboard data' });
  }
});

/**
 * GET /api/admin/users
 * Get all users in the system
 * Protected: Admin only
 */
router.get('/users', verifyTokenMiddleware, verifyAdmin, async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        emailVerified: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json({
      success: true,
      users: users,
      data: users,
      total: users.length
    });
  } catch (err) {
    console.error('Get users error:', err);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

/**
 * PUT /api/admin/users/:userId/role
 * Update user role (user, admin, driver)
 * Protected: Admin only
 */
router.put('/users/:userId/role', verifyTokenMiddleware, verifyAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const { role } = req.body;

    if (!['user', 'admin', 'driver'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    const user = await prisma.user.update({
      where: { id: parseInt(userId) },
      data: { role },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
      }
    });

    res.json({ success: true, user });
  } catch (err) {
    console.error('Update user role error:', err);
    res.status(500).json({ error: 'Failed to update user role' });
  }
});

/**
 * DELETE /api/admin/users/:userId
 * Delete user from system
 * Protected: Admin only
 */
router.delete('/users/:userId', verifyTokenMiddleware, verifyAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const userIdInt = parseInt(userId);

    // Prevent deleting self
    if (userIdInt === req.user.id) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }

    await prisma.user.delete({
      where: { id: userIdInt }
    });

    res.json({ success: true, message: 'User deleted' });
  } catch (err) {
    console.error('Delete user error:', err);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

/**
 * GET /api/admin/orders
 * Get all orders in the system
 * Protected: Admin only
 */
router.get('/orders', verifyTokenMiddleware, verifyAdmin, async (req, res) => {
  try {
    const orders = await prisma.order.findMany({
      include: {
        user: { select: { id: true, name: true, email: true } }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json({
      success: true,
      data: orders,
      total: orders.length
    });
  } catch (err) {
    console.error('Get orders error:', err);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

module.exports = router;
