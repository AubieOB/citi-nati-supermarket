/**
 * Socket.io event emission utilities
 * Handles all real-time notifications without blocking request flow
 * 
 * Rooms:
 * - admin_room: All admin users
 * - driver_${userId}: Specific driver
 * - user_${userId}: Specific customer
 */

/**
 * Emit new order event to all admin clients
 */
const emitNewOrder = (order) => {
  try {
    if (global.io) {
      global.io.to('admin_room').emit('newOrder', {
        id: order.id,
        userId: order.userId,
        total: order.total,
        status: order.status,
        paymentStatus: order.paymentStatus,
        deliveryAddress: order.deliveryAddress,
        houseNumber: order.houseNumber,
        phone: order.phone,
        createdAt: order.createdAt,
      });
      console.log(`[Socket.io] New order ${order.id} emitted to admin_room`);
    }
  } catch (err) {
    console.error('Error emitting newOrder event:', err.message);
  }
};

/**
 * Emit order assignment notification to specific driver
 */
const emitOrderAssigned = (driverId, order) => {
  try {
    if (global.io) {
      global.io.to(`driver_${driverId}`).emit('orderAssigned', {
        id: order.id,
        userId: order.userId,
        driverId: order.driverId,
        total: order.total,
        status: order.status,
        paymentStatus: order.paymentStatus,
        deliveryAddress: order.deliveryAddress,
        houseNumber: order.houseNumber,
        latitude: order.latitude,
        longitude: order.longitude,
        phone: order.phone,
        createdAt: order.createdAt,
      });
      console.log(`[Socket.io] Order ${order.id} assigned to driver_${driverId}`);
    }
  } catch (err) {
    console.error('Error emitting orderAssigned event:', err.message);
  }
};

/**
 * Emit order updated event to admin and customer only (not driver)
 * Used when driver is assigned to avoid duplicate notifications
 */
const emitOrderUpdatedToAdminAndCustomer = (order) => {
  try {
    if (global.io) {
      const eventData = {
        id: order.id,
        userId: order.userId,
        driverId: order.driverId,
        total: order.total,
        status: order.status,
        paymentStatus: order.paymentStatus,
        deliveryAddress: order.deliveryAddress,
        houseNumber: order.houseNumber,
        latitude: order.latitude,
        longitude: order.longitude,
        phone: order.phone,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
      };

      // Emit to admin room
      global.io.to('admin_room').emit('orderUpdated', eventData);
      console.log(`[Socket.io] Order ${order.id} emitted to admin_room (assignment)`);

      // Emit to customer only
      if (order.userId) {
        global.io.to(`user_${order.userId}`).emit('orderUpdated', eventData);
        console.log(`[Socket.io] Order ${order.id} emitted to user_${order.userId} (assignment)`);
      }

      console.log(`[Socket.io] Order ${order.id} assigned (no driver update)`);
    }
  } catch (err) {
    console.error('Error emitting orderUpdatedToAdminAndCustomer event:', err.message);
  }
};

/**
 * Emit order updated event to all relevant parties
 * Sends to: admin_room, assigned driver, and customer
 */
const emitOrderUpdated = (order) => {
  try {
    if (global.io) {
      const eventData = {
        id: order.id,
        userId: order.userId,
        driverId: order.driverId,
        total: order.total,
        status: order.status,
        paymentStatus: order.paymentStatus,
        deliveryAddress: order.deliveryAddress,
        houseNumber: order.houseNumber,
        latitude: order.latitude,
        longitude: order.longitude,
        phone: order.phone,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
      };

      // Emit to admin room (all admins get all order updates)
      global.io.to('admin_room').emit('orderUpdated', eventData);
      console.log(`[Socket.io] Order ${order.id} emitted to admin_room`);

      // Emit to assigned driver (if order has a driver assigned)
      if (order.driverId) {
        global.io.to(`driver_${order.driverId}`).emit('orderUpdated', eventData);
        console.log(`[Socket.io] Order ${order.id} emitted to driver_${order.driverId}`);
      }

      // Emit to customer (user who placed the order)
      if (order.userId) {
        console.log(`[Socket.io] Emitting orderUpdated to user_${order.userId}:`, {
          orderId: order.id,
          userId: order.userId,
          status: order.status,
        });
        global.io.to(`user_${order.userId}`).emit('orderUpdated', eventData);
        console.log(`[Socket.io] Order ${order.id} emitted to user_${order.userId}`);
      } else {
        console.warn(`[Socket.io] Order ${order.id} has no userId - cannot notify customer`);
      }

      console.log(`[Socket.io] Order ${order.id} status: ${order.status}`);
    }
  } catch (err) {
    console.error('Error emitting orderUpdated event:', err.message);
  }
};

/**
 * Deprecated: kept for backward compatibility
 * Use emitOrderUpdated instead
 */
const emitOrderStatusUpdated = (order) => {
  emitOrderUpdated(order);
};

module.exports = {
  emitNewOrder,
  emitOrderAssigned,
  emitOrderStatusUpdated,
  emitOrderUpdated,
  emitOrderUpdatedToAdminAndCustomer,
};
