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

/** * Emit product update to all connected clients
 * Called when admin updates ANY product details (price, name, promotion, stock, etc)
 * 
 * Called when:
 * 1. Admin updates product details via AdminProducts
 * 2. Stock changes
 * 3. Price or promotional details change
 */
const emitProductUpdate = (product) => {
  try {
    if (global.io && product) {
      // Calculate finalPrice (same logic as formatProduct)
      let finalPrice = product.price;
      if (product.isOnSale && product.discountPrice) {
        finalPrice = product.discountPrice;
      }

      const productUpdateData = {
        id: product.id,
        name: product.name,
        price: product.price,
        originalPrice: product.originalPrice,
        discountPrice: product.discountPrice,
        finalPrice: finalPrice,
        isOnSale: product.isOnSale,
        stock: product.stock,
        category: product.category,
        image: product.image,
        expiryDate: product.expiryDate,
        expiryStatus: product.expiryStatus,
        updatedAt: product.updatedAt,
      };

      // Broadcast to all connected clients
      global.io.emit('product_updated', productUpdateData);
      console.log(`[Socket.io] Product update emitted for product ${product.id}:`, {
        name: product.name,
        price: product.price,
        finalPrice: finalPrice,
        stock: product.stock,
        isOnSale: product.isOnSale
      });
    }
  } catch (err) {
    console.error('Error emitting product_updated event:', err.message);
  }
};

/** * Emit stock update event to all connected clients
 * Called when:
 * 1. An order payment is confirmed (stock decremented)
 * 2. Admin updates product inventory
 */
const emitStockUpdate = (productId, newStock, newPrice = null) => {
  try {
    if (global.io) {
      const stockUpdateData = {
        productId,
        newStock,
      };

      // Include price if it was updated
      if (newPrice !== null) {
        stockUpdateData.newPrice = newPrice;
      }

      // Broadcast to all connected clients
      global.io.emit('stock_update', stockUpdateData);
      console.log(`[Socket.io] Stock update emitted:`, stockUpdateData);
    }
  } catch (err) {
    console.error('Error emitting stock_update event:', err.message);
  }
};

/**
 * Emit bulk stock updates for multiple products
 * Used when processing multi-product orders
 */
const emitMultipleStockUpdates = (products) => {
  try {
    if (global.io && Array.isArray(products)) {
      for (const product of products) {
        global.io.emit('stock_update', {
          productId: product.id,
          newStock: product.stock,
          newPrice: product.price || null,
        });
      }
      console.log(`[Socket.io] ${products.length} stock updates emitted`);
    }
  } catch (err) {
    console.error('Error emitting multiple stock_update events:', err.message);
  }
};

module.exports = {
  emitNewOrder,
  emitOrderAssigned,
  emitOrderStatusUpdated,
  emitOrderUpdated,
  emitOrderUpdatedToAdminAndCustomer,
  emitProductUpdate,
  emitStockUpdate,
  emitMultipleStockUpdates,
};
