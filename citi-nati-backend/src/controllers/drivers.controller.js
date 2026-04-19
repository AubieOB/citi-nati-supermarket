const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const { emitOrderStatusUpdated, emitOrderUpdated } = require('../utils/socket');
const { validateStrongPassword } = require('../utils/passwordPolicy');

const prisma = new PrismaClient();

/**
 * Create a new driver WITH user account (can login)
 * This creates both User and Driver records
 */
const createDriverWithAccount = async (req, res) => {
  try {
    const { name, phone, email, password } = req.body;

    // Validate required fields
    if (!name || !email || !password) {
      return res.status(400).json({
        error: 'Name, email, and password are required',
      });
    }

    const passwordValidation = validateStrongPassword(password);
    if (!passwordValidation.valid) {
      return res.status(400).json({ error: passwordValidation.errors[0] });
    }

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return res.status(400).json({
        error: 'Email already registered',
      });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // Create both User and Driver in transaction for consistency
    const result = await prisma.$transaction(async (tx) => {
      // Create user account with driver role
      const user = await tx.user.create({
        data: {
          name,
          email,
          passwordHash,
          role: 'driver',
        },
      });

      // Create driver record
      const driver = await tx.driver.create({
        data: {
          name,
          phone: phone || null, // Phone is optional
          email,
        },
      });

      return { user, driver };
    });

    console.log('[DEBUG DRIVER CREATE] Created driver user account:', email);

    return res.status(201).json({
      message: 'Driver account created successfully',
      user: {
        id: result.user.id,
        name: result.user.name,
        email: result.user.email,
        role: result.user.role,
      },
      driver: result.driver,
    });
  } catch (err) {
    console.error('Error creating driver account:', err);
    
    // Handle duplicate email
    if (err.code === 'P2002') {
      return res.status(400).json({
        error: 'Email already exists',
      });
    }

    return res.status(500).json({
      error: 'Server error while creating driver account',
    });
  }
};

/**
 * Create driver without user account (legacy, not used in new flow)
 */
const createDriver = async (req, res) => {
  try {
    const { name, phone, email } = req.body;

    // Validate required fields
    if (!name || !phone) {
      return res.status(400).json({
        error: 'Name and phone are required',
      });
    }

    // Create driver
    const driver = await prisma.driver.create({
      data: {
        name,
        phone,
        email: email || null,
      },
    });

    return res.status(201).json({
      message: 'Driver created successfully',
      driver,
    });
  } catch (err) {
    // Handle duplicate phone or email
    if (err.code === 'P2002') {
      const field = err.meta?.target?.[0] || 'field';
      return res.status(400).json({
        error: `A driver with this ${field} already exists`,
      });
    }

    console.error('Error creating driver:', err);
    return res.status(500).json({
      error: 'Server error while creating driver',
    });
  }
};

const getDrivers = async (req, res) => {
  try {
    const drivers = await prisma.driver.findMany({
      include: {
        assignedOrders: true,
      },
    });

    return res.status(200).json({
      message: 'Drivers retrieved successfully',
      drivers,
    });
  } catch (err) {
    console.error('Error fetching drivers:', err);
    return res.status(500).json({
      error: 'Server error while fetching drivers',
    });
  }
};

const updateDriver = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, phone, email } = req.body;

    // Validate driver ID
    if (!id) {
      return res.status(400).json({
        error: 'Driver ID is required',
      });
    }

    // Build update data (only include fields that are provided)
    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (phone !== undefined) updateData.phone = phone;
    if (email !== undefined) updateData.email = email;

    // Check if at least one field is being updated
    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        error: 'At least one field must be provided for update',
      });
    }

    // Update driver
    const updatedDriver = await prisma.driver.update({
      where: { id },
      data: updateData,
      include: {
        assignedOrders: true,
      },
    });

    return res.status(200).json({
      message: 'Driver updated successfully',
      driver: updatedDriver,
    });
  } catch (err) {
    // Handle driver not found
    if (err.code === 'P2025') {
      return res.status(404).json({
        error: 'Driver not found',
      });
    }

    // Handle duplicate phone or email
    if (err.code === 'P2002') {
      const field = err.meta?.target?.[0] || 'field';
      return res.status(400).json({
        error: `A driver with this ${field} already exists`,
      });
    }

    console.error('Error updating driver:', err);
    return res.status(500).json({
      error: 'Server error while updating driver',
    });
  }
};

const deleteDriver = async (req, res) => {
  try {
    const { id } = req.params;

    // Validate driver ID
    if (!id) {
      return res.status(400).json({
        error: 'Driver ID is required',
      });
    }

    // Get driver first to find their email
    const driver = await prisma.driver.findUnique({
      where: { id },
    });

    if (!driver) {
      return res.status(404).json({
        error: 'Driver not found',
      });
    }

    // Check if there's a corresponding User with role='driver'
    if (driver.email) {
      const driverUser = await prisma.user.findUnique({
        where: { email: driver.email },
      });

      // If User exists with driver role, change role to 'user' instead of deleting
      if (driverUser && driverUser.role === 'driver') {
        await prisma.user.update({
          where: { id: driverUser.id },
          data: { role: 'user' },
        });
        console.log('[DEBUG DELETE DRIVER] Changed user role to user for email:', driver.email);
      }
    }

    // Delete driver record
    await prisma.driver.delete({
      where: { id },
    });

    console.log('[DEBUG DELETE DRIVER] Deleted driver:', driver.email);

    return res.status(200).json({
      message: 'Driver deleted successfully',
    });
  } catch (err) {
    // Handle driver not found
    if (err.code === 'P2025') {
      return res.status(404).json({
        error: 'Driver not found',
      });
    }

    console.error('Error deleting driver:', err);
    return res.status(500).json({
      error: 'Server error while deleting driver',
    });
  }
};

const getDriverOrders = async (req, res) => {
  try {
    const userId = req.user.userId;

    // Get the user to get their email
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });

    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    // Find the driver record by email
    const driver = await prisma.driver.findUnique({
      where: { email: user.email },
    });

    if (!driver) {
      return res.status(403).json({ error: 'Driver profile not found' });
    }

    // Find all orders assigned to this driver
    const orders = await prisma.order.findMany({
      where: { driverId: driver.id },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        items: {
          include: {
            product: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return res.status(200).json({
      message: 'Driver orders retrieved successfully',
      orders,
    });
  } catch (err) {
    console.error('Error fetching driver orders:', err);
    return res.status(500).json({
      error: 'Server error while fetching driver orders',
    });
  }
};

const updateDriverOrderStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const userId = req.user.userId;

    // Validate order ID
    if (!id || isNaN(parseInt(id))) {
      return res.status(400).json({ error: 'Valid order ID is required' });
    }

    // Validate status
    if (!status) {
      return res.status(400).json({ error: 'Status is required' });
    }

    // Get the user to get their email
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });

    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    // Find the driver record by email
    const driver = await prisma.driver.findUnique({
      where: { email: user.email },
    });

    if (!driver) {
      return res.status(403).json({ error: 'Driver profile not found' });
    }

    // Find order and verify it belongs to this driver
    const order = await prisma.order.findUnique({
      where: { id: parseInt(id) },
    });

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    if (order.driverId !== driver.id) {
      return res.status(403).json({
        error: 'This order is not assigned to you',
      });
    }

    // Update order status
    const updatedOrder = await prisma.order.update({
      where: { id: parseInt(id) },
      data: { status },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        items: {
          include: {
            product: true,
          },
        },
      },
    });

    // Emit order status updated event to admins (non-blocking)
    emitOrderStatusUpdated(updatedOrder);
    
    // Emit order updated event to all clients for real-time dashboard
    emitOrderUpdated(updatedOrder);

    return res.status(200).json({
      message: 'Order status updated successfully',
      order: updatedOrder,
    });
  } catch (err) {
    console.error('Error updating driver order status:', err);
    return res.status(500).json({
      error: 'Server error while updating order status',
    });
  }
};

/**
 * Get driver performance metrics
 * GET /admin/drivers/performance
 */
const getDriverPerformance = async (req, res) => {
  try {
    // Get all drivers with their PAID delivered orders
    const drivers = await prisma.driver.findMany({
      include: {
        assignedOrders: {
          where: { status: 'DELIVERED', paymentStatus: 'PAID' },
          include: { items: true }
        }
      }
    });

    // Calculate performance metrics
    const performance = drivers.map(driver => {
      const deliveredOrders = driver.assignedOrders;
      const totalEarnings = deliveredOrders.reduce(
        (sum, order) => sum + (order.total || 0),
        0
      );

      return {
        id: driver.id,
        name: driver.name,
        email: driver.email,
        phone: driver.phone,
        totalDeliveries: deliveredOrders.length,
        totalEarnings: parseFloat(totalEarnings.toFixed(2))
      };
    });

    res.json({
      drivers: performance,
      summary: {
        totalDrivers: performance.length,
        totalDeliveries: performance.reduce((sum, d) => sum + d.totalDeliveries, 0),
        totalEarnings: parseFloat(
          performance.reduce((sum, d) => sum + d.totalEarnings, 0).toFixed(2)
        )
      }
    });
  } catch (err) {
    console.error('[DRIVER_PERF] Error fetching driver performance:', err);
    res.status(500).json({ message: 'Failed to fetch driver performance' });
  }
};

/**
 * Get driver performance for a specific sales day
 * GET /admin/drivers/performance/:salesDayId
 */
const getDriverPerformanceByDay = async (req, res) => {
  try {
    const { salesDayId } = req.params;

    const drivers = await prisma.driver.findMany({
      include: {
        assignedOrders: {
          where: {
            salesDayId: parseInt(salesDayId),
            status: 'DELIVERED',
            paymentStatus: 'PAID'
          },
          include: { items: true }
        }
      }
    });

    const performance = drivers
      .map(driver => {
        const deliveredOrders = driver.assignedOrders;
        const totalEarnings = deliveredOrders.reduce(
          (sum, order) => sum + (order.total || 0),
          0
        );

        return {
          id: driver.id,
          name: driver.name,
          email: driver.email,
          phone: driver.phone,
          totalDeliveries: deliveredOrders.length,
          totalEarnings: parseFloat(totalEarnings.toFixed(2))
        };
      })
      .filter(d => d.totalDeliveries > 0); // Only show drivers with deliveries

    res.json({
      salesDayId: parseInt(salesDayId),
      drivers: performance,
      summary: {
        totalDriversActive: performance.length,
        totalDeliveries: performance.reduce((sum, d) => sum + d.totalDeliveries, 0),
        totalEarnings: parseFloat(
          performance.reduce((sum, d) => sum + d.totalEarnings, 0).toFixed(2)
        )
      }
    });
  } catch (err) {
    console.error('[DRIVER_PERF] Error fetching driver performance by day:', err);
    res.status(500).json({ message: 'Failed to fetch driver performance' });
  }
};

/**
 * Clear driver performance data (unassign drivers from open sales day orders)
 * DELETE /admin/drivers/performance
 */
const clearDriverPerformance = async (req, res) => {
  try {
    // Get the current open sales day
    const openSalesDay = await prisma.salesDay.findFirst({
      where: { status: 'OPEN' }
    });

    if (!openSalesDay) {
      return res.status(400).json({ message: 'No open sales day found' });
    }

    // Unassign all drivers from orders in the current open sales day
    const result = await prisma.order.updateMany({
      where: {
        salesDayId: openSalesDay.id,
        driverId: { not: null }
      },
      data: {
        driverId: null
      }
    });

    console.log('[DRIVER_PERF] Driver performance cleared:', { updated: result.count, salesDayId: openSalesDay.id });
    res.json({
      message: 'Driver performance cleared successfully',
      updatedCount: result.count
    });
  } catch (err) {
    console.error('[DRIVER_PERF] Error clearing driver performance:', err);
    res.status(500).json({ message: 'Failed to clear driver performance' });
  }
};

module.exports = { createDriver, createDriverWithAccount, getDrivers, updateDriver, deleteDriver, getDriverOrders, updateDriverOrderStatus, getDriverPerformance, getDriverPerformanceByDay, clearDriverPerformance };
