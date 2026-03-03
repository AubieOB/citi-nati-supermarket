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
const { getRefundPendingOrders, markOrderAsRefunded } = require('../controllers/order.controller');
const { getCurrentPromotions, updatePromotion, previewPromotion, applyPromotion, removePromotion } = require('../controllers/promotion.controller');

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
 * Get all active users in the system
 * Protected: Admin only
 */
router.get('/users', verifyTokenMiddleware, verifyAdmin, async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      where: { isActive: true },
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

    // Return in expected format for frontend
    res.json({
      success: true,
      users: users,
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

    // Prevent changing own role
    if (userId === req.user.id) {
      return res.status(400).json({ error: 'Cannot change your own role' });
    }

    // Get the user first to access their details
    const userBefore = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!userBefore) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Update user role
    const user = await prisma.user.update({
      where: { id: userId },
      data: { role },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
      }
    });

    // If changing role TO driver, ensure Driver record exists
    if (role === 'driver' && userBefore.role !== 'driver') {
      const existingDriver = await prisma.driver.findUnique({
        where: { email: user.email }
      });

      if (!existingDriver) {
        await prisma.driver.create({
          data: {
            name: user.name,
            email: user.email,
            phone: null // Can be updated later
          }
        });
        console.log('[ADMIN] Created Driver record for user:', { userId, email: user.email });
      }
    }

    console.log('[ADMIN] User role updated:', { userId, newRole: role, admin: req.user.email });
    res.json({ 
      success: true, 
      user,
      message: `User role updated to ${role}`
    });
  } catch (err) {
    console.error('Update user role error:', err);
    if (err.code === 'P2025') {
      return res.status(404).json({ error: 'User not found' });
    }
    res.status(500).json({ error: 'Failed to update user role', details: err.message });
  }
});

/**
 * DELETE /api/admin/users/:userId
 * Soft delete user from system (marks as inactive)
 * Protected: Admin only
 */
router.delete('/users/:userId', verifyTokenMiddleware, verifyAdmin, async (req, res) => {
  try {
    const { userId } = req.params;

    // Prevent deleting self
    if (userId === req.user.id) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }

    // Soft delete - mark as inactive instead of hard delete
    const user = await prisma.user.update({
      where: { id: userId },
      data: { isActive: false },
      select: {
        id: true,
        name: true,
        email: true,
        isActive: true,
        role: true
      }
    });

    console.log('[ADMIN] User soft deleted:', { userId, email: user.email, admin: req.user.email });
    res.json({ 
      success: true, 
      message: 'User deactivated',
      user
    });
  } catch (err) {
    console.error('Delete user error:', err);
    if (err.code === 'P2025') {
      return res.status(404).json({ error: 'User not found' });
    }
    res.status(500).json({ error: 'Failed to delete user', details: err.message });
  }
});

/**
 * GET /api/admin/orders
 * Get all orders in the system (only payment-verified orders, exclude PENDING_PAYMENT)
 * Protected: Admin only
 */
router.get('/orders', verifyTokenMiddleware, verifyAdmin, async (req, res) => {
  try {
    const orders = await prisma.order.findMany({
      where: {
        status: { not: 'PENDING_PAYMENT' }  // Exclude orders waiting for payment (PENDING_PAYMENT status means payment not verified yet)
      },
      include: {
        user: { select: { id: true, name: true, email: true } },
        driver: { select: { id: true, name: true, phone: true } },
        items: { include: { product: true } }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json({
      success: true,
      orders: orders,
      total: orders.length
    });
  } catch (err) {
    console.error('Get orders error:', err);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

/**
 * GET /api/admin/orders/:orderId
 * Get single order details
 * Protected: Admin only
 */
router.get('/orders/:orderId', verifyTokenMiddleware, verifyAdmin, async (req, res) => {
  try {
    const { orderId } = req.params;
    
    const order = await prisma.order.findUnique({
      where: { id: parseInt(orderId) },
      include: {
        user: { select: { id: true, name: true, email: true } },
        driver: { select: { id: true, name: true, phone: true } },
        items: { include: { product: true } }
      }
    });

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    res.json({ success: true, order });
  } catch (err) {
    console.error('Get order error:', err);
    res.status(500).json({ error: 'Failed to fetch order' });
  }
});

/**
 * GET /api/admin/refunds/pending
 * Get all orders pending refund
 * Protected: Admin only
 */
router.get('/refunds/pending', verifyTokenMiddleware, verifyAdmin, getRefundPendingOrders);

/**
 * PUT /api/admin/refunds/:orderId/approve
 * Mark an order as refunded (after manual processing)
 * Protected: Admin only
 */
router.put('/refunds/:orderId/approve', verifyTokenMiddleware, verifyAdmin, markOrderAsRefunded);

/**
 * ============================================
 * 🎯 PROMOTIONS MANAGEMENT ROUTES
 * ============================================
 */

/**
 * GET /api/admin/promotions
 * Get current promotion settings
 * Protected: Admin only
 */
router.get('/promotions', verifyTokenMiddleware, verifyAdmin, getCurrentPromotions);

/**
 * POST /api/admin/promotions/apply
 * Apply active promotions to products
 * Protected: Admin only
 */
router.post('/promotions/apply', verifyTokenMiddleware, verifyAdmin, applyPromotion);

/**
 * POST /api/admin/promotions/remove
 * Remove all active promotions
 * Protected: Admin only
 */
router.post('/promotions/remove', verifyTokenMiddleware, verifyAdmin, removePromotion);

/**
 * POST /api/admin/promotions/:type/preview
 * Preview products matching promotion criteria
 * Protected: Admin only
 */
router.post('/promotions/:type/preview', verifyTokenMiddleware, verifyAdmin, previewPromotion);

/**
 * POST /api/admin/promotions/:type
 * Update/toggle a promotion (global, category, or selective)
 * Protected: Admin only
 */
router.post('/promotions/:type', verifyTokenMiddleware, verifyAdmin, updatePromotion);

module.exports = router;
