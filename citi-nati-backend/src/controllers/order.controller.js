const { PrismaClient } = require('@prisma/client');
const axios = require('axios');
const PDFDocument = require('pdfkit');
const { emitNewOrder, emitOrderAssigned, emitOrderStatusUpdated, emitOrderUpdated, emitOrderUpdatedToAdminAndCustomer } = require('../utils/socket');
const { notifyDriverAssigned, notifyOrderCompleted } = require('../utils/messageService');
const { sendDriverAssignedEmail, sendDeliveryStatusEmail, sendRefundNotificationEmail } = require('../utils/emailService');
const { isPaymentConfirmedInCache } = require('../utils/webhookCache');

const prisma = new PrismaClient();

const createOrder = async (req, res) => {
  try {
    // Get authenticated user id
    const userId = req.user.userId;

    // Accept from request body
    const { deliveryAddress, houseNumber, phone, latitude, longitude } = req.body;

    // Validate required fields
    if (!deliveryAddress || !houseNumber || !phone) {
      return res.status(400).json({
        error: 'Validation failed: deliveryAddress, houseNumber, and phone are required',
      });
    }

    // CHECK: Verify sales day is open
    const openSalesDay = await prisma.salesDay.findFirst({
      where: { status: 'OPEN' }
    });

    if (!openSalesDay) {
      return res.status(400).json({
        message: 'Sales day is closed. Orders cannot be created at this time.'
      });
    }

    // Use Prisma transaction for atomic operations
    const result = await prisma.$transaction(async (tx) => {
      // Find user's cart with items
      const cart = await tx.cart.findUnique({
        where: { userId },
        include: {
          items: {
            include: {
              product: true,
            },
          },
        },
      });

      // Check if cart exists and has items
      if (!cart || cart.items.length === 0) {
        throw new Error('Cart is empty');
      }

      // Validate stock and collect items data
      const itemsData = [];
      let total = 0;

      for (const cartItem of cart.items) {
        const product = await tx.product.findUnique({
          where: { id: cartItem.productId },
        });

        // Check if product exists
        if (!product) {
          throw new Error(`Product with id ${cartItem.productId} not found`);
        }

        // Check if sufficient stock (use effectiveStock: override if active, else posStock)
        const effectiveStock = (product.overrideActive && product.overrideStock != null)
          ? product.overrideStock
          : product.stock;
        if (effectiveStock < cartItem.quantity) {
          throw new Error(
            `Insufficient stock for ${product.name}. Available: ${effectiveStock}, Requested: ${cartItem.quantity}`
          );
        }

        itemsData.push({
          cartItem,
          product,
        });

        total += cartItem.quantity * cartItem.price;
      }

      // Create Order with salesDayId
      const order = await tx.order.create({
        data: {
          userId,
          total,
          deliveryAddress,
          houseNumber,
          phone,
          latitude: latitude ? parseFloat(latitude) : null,
          longitude: longitude ? parseFloat(longitude) : null,
          status: 'PENDING_PAYMENT',
          paymentStatus: 'PENDING',
          salesDayId: openSalesDay.id
        },
      });

      // Create OrderItems (do NOT decrement stock yet - wait for payment confirmation)
      for (const item of itemsData) {
        // Create OrderItem
        await tx.orderItem.create({
          data: {
            orderId: order.id,
            productId: item.cartItem.productId,
            quantity: item.cartItem.quantity,
            price: item.cartItem.price,
          },
        });
        // NOTE: Stock will be decremented AFTER payment is confirmed
      }

      // Delete all cart items
      await tx.cartItem.deleteMany({
        where: { cartId: cart.id },
      });

      return order;
    });

    // NOTE: Do NOT emit newOrder here - wait for payment confirmation
    // The webhook will emit newOrder after payment is verified

    return res.status(201).json({
      message: 'Order created successfully',
      order: {
        id: result.id,
        userId: result.userId,
        total: result.total,
        status: result.status,
        paymentStatus: result.paymentStatus,
        deliveryAddress: result.deliveryAddress,
        houseNumber: result.houseNumber,
        latitude: result.latitude,
        longitude: result.longitude,
        createdAt: result.createdAt,
      },
    });
  } catch (err) {
    // Handle validation errors
    if (err.message === 'Cart is empty') {
      return res.status(400).json({
        error: 'Cart is empty',
      });
    }

    if (
      err.message.includes('Insufficient stock') ||
      err.message.includes('not found')
    ) {
      return res.status(400).json({
        error: err.message,
      });
    }

    console.error('Error creating order:', err);
    return res.status(500).json({
      error: 'Server error while creating order',
    });
  }
};

const updateOrderStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const userId = req.user.userId;
    const userRole = req.user.role;

    // Validate order ID
    if (!id || isNaN(parseInt(id))) {
      return res.status(400).json({ error: 'Valid order ID is required' });
    }

    // Validate status is provided
    if (!status) {
      return res.status(400).json({ error: 'Status is required' });
    }

    // Find the order
    const order = await prisma.order.findUnique({
      where: { id: parseInt(id) },
    });

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // Authorization check: Admin can update any order, Driver can only update their assigned orders
    if (userRole === 'driver') {
      // Driver must be assigned to this order
      if (!order.driverId) {
        return res.status(403).json({ error: 'Order is not assigned to any driver' });
      }

      // Get the driver profile for the current user
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { email: true },
      });

      if (!user) {
        return res.status(401).json({ error: 'User not found' });
      }

      const driver = await prisma.driver.findUnique({
        where: { email: user.email },
      });

      if (!driver || driver.id !== order.driverId) {
        return res.status(403).json({ error: 'This order is not assigned to you' });
      }
    } else if (userRole !== 'admin') {
      // Only admin and driver can update order status
      return res.status(403).json({ error: 'Access denied' });
    }

    // Update order status
    const updatedOrder = await prisma.order.update({
      where: { id: parseInt(id) },
      data: { status },
      include: {
        user: {
          select: { id: true, name: true, email: true }
        },
        items: true
      }
    });

    // Send delivery status emails for significant status changes
    if (['IN_TRANSIT', 'DELIVERED', 'FAILED'].includes(status)) {
      try {
        const orderDetails = {
          id: updatedOrder.id,
          totalPrice: updatedOrder.total,
          deliveryAddress: updatedOrder.deliveryAddress,
          items: updatedOrder.items?.length || 0,
        };

        await sendDeliveryStatusEmail(
          updatedOrder.user.email,
          updatedOrder.user.name,
          orderDetails,
          status
        );

        console.log(`[Email] ✅ Delivery status email sent for order ${updatedOrder.id} (${status})`);
      } catch (emailErr) {
        console.error(`[Email] ❌ Failed to send delivery status email:`, emailErr.message);
        // Don't fail the status update if email fails
      }
    }

    // Create notification if order is completed
    if (status === 'COMPLETED' || status === 'DELIVERED') {
      await notifyOrderCompleted(updatedOrder);
    }

    // Emit order status updated event to admins (non-blocking)
    emitOrderStatusUpdated(updatedOrder);
    
    // Emit order updated event to all clients for real-time dashboard
    emitOrderUpdated(updatedOrder);

    return res.status(200).json({
      message: 'Order status updated successfully',
      order: updatedOrder,
    });
  } catch (err) {
    if (err.code === 'P2025') {
      return res.status(404).json({ error: 'Order not found' });
    }
    console.error('Error updating order status:', err);
    return res.status(500).json({ error: 'Server error while updating order status' });
  }
};

const assignDriverToOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const { driverId } = req.body;

    // Validate order ID
    if (!id || isNaN(parseInt(id))) {
      return res.status(400).json({ error: 'Valid order ID is required' });
    }

    // Validate driver ID
    if (!driverId) {
      return res.status(400).json({ error: 'Driver ID is required' });
    }

    // Check if driver exists
    const driver = await prisma.driver.findUnique({
      where: { id: driverId },
    });

    if (!driver) {
      return res.status(404).json({ error: 'Driver not found' });
    }

    // Update order with driver and set status to ASSIGNED
    const updatedOrder = await prisma.order.update({
      where: { id: parseInt(id) },
      data: { driverId, status: 'ASSIGNED' },
      include: {
        user: true,
        driver: true,
        items: {
          include: {
            product: true,
          },
        },
      },
    });

    // Emit order assigned event to driver (non-blocking)
    emitOrderAssigned(driverId, updatedOrder);
    
    // Emit order updated event to admin and customer (not driver - they get orderAssigned instead)
    emitOrderUpdatedToAdminAndCustomer(updatedOrder);

    // Create admin notification
    await notifyDriverAssigned(updatedOrder, driver);

    // Send driver assigned email to customer
    try {
      const driverInfo = {
        name: driver.name,
        phone: driver.phoneNumber,
        vehicle: driver.vehicleInfo,
      };

      const orderDetails = {
        id: updatedOrder.id,
        totalPrice: updatedOrder.total,
        deliveryAddress: updatedOrder.deliveryAddress,
        items: updatedOrder.items?.length || 0,
      };

      await sendDriverAssignedEmail(
        updatedOrder.user.email,
        updatedOrder.user.name,
        driverInfo,
        orderDetails
      );

      console.log(`[Email] ✅ Driver assigned email sent to ${updatedOrder.user.email}`);
    } catch (emailErr) {
      console.error(`[Email] ❌ Failed to send driver assigned email:`, emailErr.message);
      // Don't fail the assignment if email fails
    }

    return res.status(200).json({
      message: 'Driver assigned to order successfully',
      order: updatedOrder,
    });
  } catch (err) {
    if (err.code === 'P2025') {
      return res.status(404).json({ error: 'Order not found' });
    }
    console.error('Error assigning driver to order:', err);
    return res.status(500).json({ error: 'Server error while assigning driver to order' });
  }
};

const getUserOrders = async (req, res) => {
  try {
    const userId = req.user.userId;

    // Fetch all orders for current user, ordered by most recent first
    const orders = await prisma.order.findMany({
      where: { userId },
      include: {
        items: {
          include: {
            product: true,
          },
        },
        driver: {
          select: {
            id: true,
            name: true,
            phone: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return res.status(200).json({
      message: 'User orders retrieved successfully',
      orders,
    });
  } catch (err) {
    console.error('Error fetching user orders:', err);
    return res.status(500).json({ error: 'Server error while fetching orders' });
  }
};

/**
 * getAllOrders - Get all orders (ADMIN only)
 * Returns all orders with user, driver, and items data
 */
const getAllOrders = async (req, res) => {
  try {
    // Fetch all orders ordered by most recent first
    const orders = await prisma.order.findMany({
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
        driver: {
          select: {
            id: true,
            name: true,
            phone: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return res.status(200).json({
      message: 'All orders retrieved successfully',
      orders,
    });
  } catch (err) {
    console.error('Error fetching all orders:', err);
    return res.status(500).json({ error: 'Server error while fetching orders' });
  }
};

/**
 * getOrderById - Get single order by ID (ADMIN only)
 * Returns full order details with user, driver, and items
 */
const getOrderById = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;
    const userRole = req.user.role;

    // Validate order ID
    if (!id) {
      return res.status(400).json({ error: 'Order ID is required' });
    }

    // Fetch order with all relationships
    const order = await prisma.order.findUnique({
      where: { id: parseInt(id) },
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
        driver: {
          select: {
            id: true,
            name: true,
            phone: true,
            email: true,
          },
        },
      },
    });

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // Authorization check
    if (userRole === 'admin') {
      // Admin can view any order
      return res.status(200).json({
        message: 'Order retrieved successfully',
        order,
      });
    } else if (userRole === 'driver') {
      // Driver can only view their assigned orders
      if (!order.driverId) {
        return res.status(403).json({ error: 'This order is not assigned to any driver' });
      }

      // Get the driver profile for the current user
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { email: true },
      });

      if (!user) {
        return res.status(401).json({ error: 'User not found' });
      }

      const driver = await prisma.driver.findUnique({
        where: { email: user.email },
      });

      if (!driver || driver.id !== order.driverId) {
        return res.status(403).json({ error: 'This order is not assigned to you' });
      }

      return res.status(200).json({
        message: 'Order retrieved successfully',
        order,
      });
    } else if (userRole === 'user') {
      // Customer can only view their own orders
      if (order.userId !== userId) {
        return res.status(403).json({ error: 'This order does not belong to you' });
      }

      return res.status(200).json({
        message: 'Order retrieved successfully',
        order,
      });
    } else {
      return res.status(403).json({ error: 'Access denied' });
    }
  } catch (err) {
    console.error('Error fetching order by ID:', err);
    return res.status(500).json({ error: 'Server error while fetching order' });
  }
};

/**
 * Get order by payment reference
 * Used by payment success page to check payment status
 */
const getOrderByReference = async (req, res) => {
  try {
    const { reference } = req.params;
    const userId = req.user.userId;

    if (!reference) {
      return res.status(400).json({
        error: 'Payment reference is required',
      });
    }

    // Find order by payment reference
    const order = await prisma.order.findFirst({
      where: { paymentReference: reference },
      include: {
        items: {
          include: {
            product: true,
          },
        },
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        driver: {
          select: {
            id: true,
            name: true,
            phone: true,
          },
        },
      },
    });

    if (!order) {
      return res.status(404).json({
        error: 'Order not found',
      });
    }

    // Verify the order belongs to the authenticated user
    if (order.userId !== userId) {
      return res.status(403).json({
        error: 'Access denied - order does not belong to you',
      });
    }

    return res.status(200).json({
      message: 'Order retrieved successfully',
      order,
    });
  } catch (err) {
    console.error('Error fetching order by reference:', err);
    return res.status(500).json({ error: 'Server error while fetching order' });
  }
};

/**
 * Quick payment status check for polling
 * Lightweight endpoint - verifies payment with Paychangu API if needed
 * Used during payment confirmation polling to reduce response time
 */
const checkPaymentStatus = async (req, res) => {
  try {
    const { reference } = req.params;
    const userId = req.user.userId;
    const startTime = Date.now();

    if (!reference) {
      return res.status(400).json({
        error: 'Payment reference is required',
      });
    }

    // Lightweight query - only get essential fields
    const order = await prisma.order.findFirst({
      where: { paymentReference: reference },
      select: {
        id: true,
        userId: true,
        paymentStatus: true,
        status: true,
        total: true,
        createdAt: true,
      },
    });

    const dbQueryTime = Date.now() - startTime;

    if (!order) {
      console.log(`[PAYMENT CHECK] Reference not found: ${reference}`);
      return res.status(404).json({
        error: 'Order not found',
      });
    }

    // Verify the order belongs to the authenticated user
    if (order.userId !== userId) {
      return res.status(403).json({
        error: 'Access denied',
      });
    }

    // 🔒 Payment confirmation and stock decrement now happens in webhook handler only
    // This endpoint just checks the current payment status
    // If status is PAID, webhook already decremented stock atomically
    
    const totalTime = Date.now() - startTime;
    console.log(`[PAYMENT CHECK] Reference: ${reference}, Status: ${order.paymentStatus}, Time: ${totalTime}ms`);

    return res.status(200).json({
      order: {
        id: order.id,
        paymentStatus: order.paymentStatus,
        status: order.status,
      },
      responseTime: totalTime,
    });
  } catch (err) {
    console.error('[PAYMENT CHECK ERROR]:', err);
    return res.status(500).json({ error: 'Failed to check payment status' });
  }
};

/**
 * Get receipt for an order
 * Used for receipt download after order delivery
 */
const getReceipt = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.userId;

    if (!id) {
      return res.status(400).json({
        error: 'Order ID is required',
      });
    }

    // Find order with all details
    const order = await prisma.order.findUnique({
      where: { id: parseInt(id) },
      include: {
        items: {
          include: {
            product: true,
          },
        },
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
          },
        },
        driver: {
          select: {
            id: true,
            name: true,
            phone: true,
            vehicle: true,
          },
        },
      },
    });

    if (!order) {
      return res.status(404).json({
        error: 'Order not found',
      });
    }

    // Verify the order belongs to the authenticated user
    if (order.userId !== userId) {
      return res.status(403).json({
        error: 'Access denied - order does not belong to you',
      });
    }

    // Generate PDF receipt
    const doc = new PDFDocument({ margin: 40 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="receipt-${order.id}.pdf"`);
    doc.pipe(res);

    // Header
    doc.fontSize(20).font('Helvetica-Bold').text('CITI-NATI SUPERMARKET', { align: 'center' });
    doc.moveDown(0.3);
    doc.fontSize(10).font('Helvetica').text('Order Receipt', { align: 'center' });
    doc.moveDown(0.5);

    // Horizontal line
    doc.strokeColor('#5B4B8A').lineWidth(1).moveTo(40, doc.y).lineTo(doc.page.width - 40, doc.y).stroke();
    doc.moveDown(0.5);

    // Order Info
    doc.fontSize(11).font('Helvetica-Bold').text('ORDER INFORMATION', { underline: false });
    doc.fontSize(10).font('Helvetica').fillColor('#333');
    doc.text(`Order #${order.id}`);
    doc.text(`Date: ${new Date(order.createdAt).toLocaleDateString()}`);
    doc.text(`Customer: ${order.user.name}`);
    doc.text(`Email: ${order.user.email}`);
    doc.text(`Phone: ${order.user.phone}`);
    doc.moveDown(0.3);

    // Delivery Info
    doc.fontSize(11).font('Helvetica-Bold').fillColor('#333').text('DELIVERY ADDRESS');
    doc.fontSize(10).font('Helvetica').fillColor('#333');
    doc.text(`${order.deliveryAddress}, House ${order.houseNumber}`);
    if (order.driver) {
      doc.text(`Driver: ${order.driver.name}`);
      doc.text(`Driver Phone: ${order.driver.phone}`);
    }
    doc.moveDown(0.5);

    // Items table header
    doc.fontSize(11).font('Helvetica-Bold').fillColor('white');
    const tableTop = doc.y;
    const col1X = 50, col2X = 300, col3X = 420, col4X = 520;
    
    // Header background
    doc.rect(40, tableTop, doc.page.width - 80, 20).fillAndStroke('#5B4B8A', '#5B4B8A');
    doc.text('Product', col1X, tableTop + 3);
    doc.text('Qty', col2X, tableTop + 3);
    doc.text('Unit Price', col3X, tableTop + 3);
    doc.text('Total', col4X, tableTop + 3);
    
    doc.moveDown(1.5);
    doc.fontSize(10).font('Helvetica').fillColor('#333');

    // Items
    order.items.forEach((item) => {
      const itemTotal = item.quantity * item.price;
      doc.text(item.product.name.substring(0, 30), col1X, doc.y);
      doc.text(item.quantity.toString(), col2X, doc.y - doc.currentLineHeight());
      doc.text(`MWK ${item.price.toLocaleString()}`, col3X, doc.y - doc.currentLineHeight());
      doc.text(`MWK ${itemTotal.toLocaleString()}`, col4X, doc.y - doc.currentLineHeight());
      doc.moveDown(0.8);
    });

    // Total line
    doc.moveTo(40, doc.y).lineTo(doc.page.width - 40, doc.y).stroke();
    doc.moveDown(0.3);
    doc.fontSize(12).font('Helvetica-Bold').fillColor('#5B4B8A').text(`TOTAL: MWK ${order.total.toLocaleString()}`, { align: 'right' });
    doc.moveDown(0.5);

    // Footer
    doc.fontSize(9).font('Helvetica').fillColor('#999').text('Thank you for shopping with Citi-Nati Supermarket!', { align: 'center' });
    doc.text('© 2026 Citi-Nati Supermarket. All rights reserved.', { align: 'center' });
    doc.moveDown(0.3);
    doc.fontSize(8).text(`Receipt Generated: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`, { align: 'center' });

    doc.end();

  } catch (err) {
    console.error('Error fetching receipt:', err);
    return res.status(500).json({ error: 'Server error while fetching receipt' });
  }
};

/**
 * Get all orders pending refund
 * Only accessible by admins
 */
const getRefundPendingOrders = async (req, res) => {
  try {
    // Verify admin role
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied - admin only' });
    }

    const orders = await prisma.order.findMany({
      where: { paymentStatus: 'REFUND_PENDING' },
      include: {
        user: {
          select: { id: true, name: true, email: true }
        },
        items: {
          include: { product: { select: { name: true, price: true } } }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    return res.status(200).json({
      count: orders.length,
      refunds: orders.map(order => {
        // Extract Paychangu transaction ID from notes if available
        const notesMatch = order.notes?.match(/Paychangu Ref: ([^\n]+)/);
        const transactionId = notesMatch ? notesMatch[1].trim() : 'unknown';
        
        return {
          id: order.id,
          userId: order.user.id,
          customerName: order.user.name,
          customerEmail: order.user.email,
          amount: order.total,
          items: order.items,
          status: order.paymentStatus,
          notes: order.notes,
          paymentReference: order.paymentReference,
          transactionId: transactionId,
          createdAt: order.createdAt,
          updatedAt: order.updatedAt
        }
      })
    });
  } catch (err) {
    console.error('Error fetching refund pending orders:', err);
    return res.status(500).json({ error: 'Server error while fetching refunds' });
  }
};

/**
 * Mark an order as refunded (after manual processing)
 * Only accessible by admins
 */
const markOrderAsRefunded = async (req, res) => {
  try {
    // Verify admin role
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied - admin only' });
    }

    const { orderId } = req.params;
    const { refundNote } = req.body;

    if (!orderId) {
      return res.status(400).json({ error: 'Order ID is required' });
    }

    // Check if order exists and is REFUND_PENDING
    const order = await prisma.order.findUnique({
      where: { id: parseInt(orderId) }
    });

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    if (order.paymentStatus !== 'REFUND_PENDING') {
      return res.status(400).json({
        error: `Order is not pending refund. Current status: ${order.paymentStatus}`
      });
    }

    // Update order to REFUNDED
    const updatedOrder = await prisma.order.update({
      where: { id: parseInt(orderId) },
      data: {
        paymentStatus: 'REFUNDED',
        status: 'CANCELLED',
        notes: `${order.notes}\n\nRefund processed by admin at ${new Date().toISOString()}${refundNote ? ': ' + refundNote : ''}`
      },
      include: {
        user: { select: { id: true, name: true, email: true } },
        items: { include: { product: { select: { name: true, price: true } } } }
      }
    });

    // Send refund notification email to customer
    try {
      await sendRefundNotificationEmail(
        updatedOrder.user.email,
        updatedOrder.user.name,
        {
          orderId: updatedOrder.id,
          amount: updatedOrder.total,
          reason: refundNote || 'Order cancelled - refund processed',
          timestamp: new Date().toISOString()
        }
      );
      console.log(`[ORDER] Refund notification email sent to ${updatedOrder.user.email}`);
    } catch (emailErr) {
      console.error('[ORDER] Error sending refund email:', emailErr.message);
      // Don't fail the refund if email fails
    }

    console.log(`[Admin] Order ${orderId} marked as REFUNDED by admin ${req.user.userId}`);

    return res.status(200).json({
      message: 'Order marked as refunded successfully',
      order: {
        id: updatedOrder.id,
        status: updatedOrder.paymentStatus,
        customerEmail: updatedOrder.user.email,
        amount: updatedOrder.total,
        notes: updatedOrder.notes
      }
    });
  } catch (err) {
    console.error('Error marking order as refunded:', err);
    return res.status(500).json({ error: 'Server error while marking order as refunded' });
  }
};

module.exports = { createOrder, updateOrderStatus, assignDriverToOrder, getUserOrders, getAllOrders, getOrderById, getOrderByReference, checkPaymentStatus, getReceipt, getRefundPendingOrders, markOrderAsRefunded };
