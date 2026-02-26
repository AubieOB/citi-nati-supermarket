const express = require('express');
const { verifyTokenMiddleware, authorizeRoles } = require('../middleware/auth.middleware');
const { getAllOrders, getOrderById } = require('../controllers/order.controller');
const { getAllUsers, updateUserRole, deleteUser } = require('../controllers/users.controller');

const router = express.Router();

// Protected test route - requires authentication and ADMIN role
router.get('/test', verifyTokenMiddleware, authorizeRoles('admin'), (req, res) => {
  return res.json({ message: 'Admin access granted' });
});

// GET /api/admin/orders - Get all orders (ADMIN only)
router.get('/orders', verifyTokenMiddleware, authorizeRoles('admin'), getAllOrders);

// GET /api/admin/orders/:id - Get single order by ID (ADMIN only)
router.get('/orders/:id', verifyTokenMiddleware, authorizeRoles('admin'), getOrderById);

// GET /api/admin/users - Get all users (ADMIN only)
router.get('/users', verifyTokenMiddleware, authorizeRoles('admin'), getAllUsers);

// PUT /api/admin/users/:id/role - Update user role (ADMIN only)
router.put('/users/:id/role', verifyTokenMiddleware, authorizeRoles('admin'), updateUserRole);

// DELETE /api/admin/users/:id - Delete user (ADMIN only)
router.delete('/users/:id', verifyTokenMiddleware, authorizeRoles('admin'), deleteUser);

module.exports = router;
