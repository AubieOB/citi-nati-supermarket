const { PrismaClient } = require('@prisma/client');
const { emitNewOrder, emitOrderAssigned, emitOrderStatusUpdated, emitOrderUpdated, emitOrderUpdatedToAdminAndCustomer } = require('../utils/socket');
const { notifyDriverAssigned, notifyOrderCompleted } = require('../utils/messageService');
const { sendDriverAssignedEmail, sendDeliveryStatusEmail } = require('../utils/emailService');

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

        // Check if sufficient stock
        if (product.stock < cartItem.quantity) {
          throw new Error(
            `Insufficient stock for ${product.name}. Available: ${product.stock}, Requested: ${cartItem.quantity}`
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

      // Create OrderItems and update product stock
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

        // Decrement product stock
        await tx.product.update({
          where: { id: item.cartItem.productId },
          data: {
            stock: {
              decrement: item.cartItem.quantity,
            },
          },
        });
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
 * Get receipt for an order
 * Used for receipt download after order delivery
 */
const getReceipt = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

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

    // Format receipt as HTML
    const receiptHTML = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Receipt - Order #${order.id}</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            margin: 0;
            padding: 20px;
            background-color: #f5f5f5;
          }
          .receipt-container {
            background-color: white;
            max-width: 600px;
            margin: 0 auto;
            padding: 30px;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
          }
          .header {
            text-align: center;
            border-bottom: 2px solid #5B4B8A;
            padding-bottom: 20px;
            margin-bottom: 20px;
          }
          .header h1 {
            color: #5B4B8A;
            margin: 0;
          }
          .header p {
            color: #999;
            margin: 5px 0 0 0;
          }
          .order-info {
            display: flex;
            justify-content: space-between;
            margin-bottom: 20px;
            padding: 15px;
            background-color: #f9f9f9;
            border-radius: 4px;
          }
          .info-item {
            font-size: 13px;
          }
          .info-label {
            color: #999;
            font-weight: bold;
          }
          .info-value {
            color: #333;
            margin-top: 3px;
          }
          .items-section {
            margin: 25px 0;
          }
          .items-section h3 {
            color: #333;
            border-bottom: 1px solid #ddd;
            padding-bottom: 10px;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin: 15px 0;
          }
          th {
            text-align: left;
            padding: 10px;
            background-color: #f0f0f0;
            color: #333;
            font-weight: bold;
            font-size: 13px;
            border-bottom: 1px solid #ddd;
          }
          td {
            padding: 12px 10px;
            border-bottom: 1px solid #ddd;
            font-size: 13px;
          }
          .qty {
            text-align: center;
          }
          .price {
            text-align: right;
          }
          .totals {
            margin-top: 20px;
            padding-top: 15px;
            border-top: 2px solid #ddd;
          }
          .total-row {
            display: flex;
            justify-content: space-between;
            margin-bottom: 10px;
            padding: 8px 0;
          }
          .total-row.subtotal,
          .total-row.discount,
          .total-row.fee {
            font-size: 13px;
            color: #666;
          }
          .total-row.grand-total {
            font-size: 18px;
            font-weight: bold;
            color: #5B4B8A;
            background-color: #f9f9f9;
            padding: 12px 8px;
            border-radius: 4px;
          }
          .delivery-info {
            margin-top: 25px;
            padding: 15px;
            background-color: #f0f8ff;
            border-left: 4px solid #5B4B8A;
            border-radius: 4px;
          }
          .delivery-info h4 {
            color: #333;
            margin-top: 0;
          }
          .delivery-detail {
            font-size: 13px;
            color: #666;
            line-height: 1.6;
          }
          .driver-info {
            margin-top: 20px;
            padding: 15px;
            background-color: #f9f9f9;
            border-radius: 4px;
          }
          .driver-info h4 {
            color: #333;
            margin-top: 0;
          }
          .driver-detail {
            font-size: 13px;
            color: #666;
            line-height: 1.6;
          }
          .footer {
            margin-top: 30px;
            text-align: center;
            color: #999;
            font-size: 12px;
            border-top: 1px solid #ddd;
            padding-top: 15px;
          }
          .status-badge {
            display: inline-block;
            padding: 6px 12px;
            background-color: #4caf50;
            color: white;
            border-radius: 4px;
            font-size: 12px;
            font-weight: bold;
            margin-top: 10px;
          }
          @media print {
            body {
              background-color: white;
            }
            .receipt-container {
              box-shadow: none;
            }
          }
        </style>
      </head>
      <body>
        <div class="receipt-container">
          <div class="header">
            <h1>Citi-Nati Supermarket</h1>
            <p>Order Receipt</p>
          </div>

          <div class="order-info">
            <div class="info-item">
              <div class="info-label">ORDER ID</div>
              <div class="info-value">#${order.id}</div>
            </div>
            <div class="info-item">
              <div class="info-label">DATE</div>
              <div class="info-value">${new Date(order.createdAt).toLocaleDateString()} ${new Date(order.createdAt).toLocaleTimeString()}</div>
            </div>
            <div class="info-item">
              <div class="info-label">STATUS</div>
              <div class="info-value status-badge">${order.status}</div>
            </div>
          </div>

          <div class="items-section">
            <h3>Order Items</h3>
            <table>
              <thead>
                <tr>
                  <th>Item</th>
                  <th class="qty">Qty</th>
                  <th class="price">Unit Price</th>
                  <th class="price">Total</th>
                </tr>
              </thead>
              <tbody>
                ${order.items.map(item => `
                  <tr>
                    <td>${item.product.name}</td>
                    <td class="qty">${item.quantity}</td>
                    <td class="price">MWK ${item.product.price.toLocaleString()}</td>
                    <td class="price">MWK ${(item.product.price * item.quantity).toLocaleString()}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>

          <div class="totals">
            <div class="total-row subtotal">
              <span>Subtotal:</span>
              <span>MWK ${order.items.reduce((sum, item) => sum + (item.product.price * item.quantity), 0).toLocaleString()}</span>
            </div>
            ${order.deliveryFee ? `
              <div class="total-row fee">
                <span>Delivery Fee:</span>
                <span>MWK ${order.deliveryFee.toLocaleString()}</span>
              </div>
            ` : ''}
            <div class="total-row grand-total">
              <span>TOTAL AMOUNT:</span>
              <span>MWK ${order.totalPrice.toLocaleString()}</span>
            </div>
          </div>

          <div class="delivery-info">
            <h4>📍 Delivery Address</h4>
            <div class="delivery-detail">
              ${order.deliveryAddress}<br/>
              House/Apt: ${order.houseNumber}<br/>
              Contact: ${order.phone}
            </div>
          </div>

          ${order.driver ? `
            <div class="driver-info">
              <h4>🚗 Delivery Driver</h4>
              <div class="driver-detail">
                <strong>${order.driver.name}</strong><br/>
                Phone: ${order.driver.phone}<br/>
                Vehicle: ${order.driver.vehicle || 'N/A'}
              </div>
            </div>
          ` : ''}

          <div class="footer">
            <p>Thank you for shopping at Citi-Nati Supermarket!</p>
            <p>For inquiries, contact us via the app or visit our store.</p>
            <p style="margin-top: 20px; color: #ccc;">Receipt Generated: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}</p>
          </div>
        </div>
      </body>
      </html>
    `;

    // Send receipt as HTML
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="receipt-${order.id}.html"`);
    return res.status(200).send(receiptHTML);

  } catch (err) {
    console.error('Error fetching receipt:', err);
    return res.status(500).json({ error: 'Server error while fetching receipt' });
  }
};

module.exports = { createOrder, updateOrderStatus, assignDriverToOrder, getUserOrders, getAllOrders, getOrderById, getOrderByReference, getReceipt };
