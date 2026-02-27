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
const { verifyToken } = require('../middleware/auth.middleware');
const { verifyAdmin } = require('../middleware/admin.middleware');
const { getAllOrders, getOrderById } = require('../controllers/order.controller');
const { getAllUsers, updateUserRole, deleteUser } = require('../controllers/users.controller');

const router = express.Router();

/**
 * GET /api/admin/test
 * Simple test endpoint to verify admin access
 * Returns success if user is authenticated admin
 */
router.get('/test', verifyToken, verifyAdmin, (req, res) => {
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
 * GET /api/admin/orders
 * Get all orders in the system
 * Protected: Admin only
 */
router.get('/orders', verifyToken, verifyAdmin, getAllOrders);

/**
 * GET /api/admin/orders/:id
 * Get specific order by ID
 * Protected: Admin only
 */
router.get('/orders/:id', verifyToken, verifyAdmin, getOrderById);

/**
 * GET /api/admin/users
 * Get all users in the system
 * Protected: Admin only
 */
router.get('/users', verifyToken, verifyAdmin, getAllUsers);

/**
 * PUT /api/admin/users/:id/role
 * Update user role
 * Protected: Admin only
 * Body: { role: "user" | "admin" }
 */
router.put('/users/:id/role', verifyToken, verifyAdmin, updateUserRole);

/**
 * DELETE /api/admin/users/:id
 * Delete user account
 * Protected: Admin only
 */
router.delete('/users/:id', verifyToken, verifyAdmin, deleteUser);

module.exports = router;
