import { useEffect } from 'react';
import { getSocket } from '../utils/socket.js';
import { toast } from 'react-hot-toast';

/**
 * Hook to listen for real-time order updates and trigger callbacks
 * Automatically refetches data when orders change
 * 
 * @param {Function} onOrderUpdate - Callback when an order is updated
 * @param {Object} options - Configuration options
 * @param {boolean} [options.listenAll=false] - Listen to all order updates (admin mode)
 * @param {string} [options.userId] - Current user ID (for customer/driver filtering)
 * @param {string} [options.role] - Current user's role ('admin', 'driver', 'user')
 * @param {string} [options.driverId] - Driver ID (for driver mode)
 */
export const useOrderUpdates = (onOrderUpdate, options = {}) => {
  const { listenAll = false, userId = null, role = 'user', driverId = null } = options;

  useEffect(() => {
    try {
      const socket = getSocket();
      if (!socket) {
        console.warn('[HOOK] Socket not initialized');
        return;
      }

      console.log('[HOOK] Setting up orderUpdated listener', { listenAll, role, userId, driverId });

      const handleOrderUpdated = (updatedOrder) => {
        console.log('[HOOK] Order updated event received:', updatedOrder, 'for role:', role);

        if (!updatedOrder?.id) {
          console.log('[HOOK] Skipping - no order ID');
          return;
        }

        // ADMIN MODE: Listen to all order updates
        if (listenAll || role === 'admin') {
          console.log('[HOOK] Processing as ADMIN - all orders');
          onOrderUpdate(updatedOrder);
          return;
        }

        // DRIVER MODE: Only process orders assigned to this driver
        if (role === 'driver' && (driverId || userId)) {
          const targetDriverId = driverId || userId;
          if (updatedOrder.driverId === targetDriverId) {
            console.log(`[HOOK] Processing as DRIVER - order assigned to me`);
            onOrderUpdate(updatedOrder);
          } else {
            console.log(`[HOOK] Skipping DRIVER - order for driver ${updatedOrder.driverId}, I am ${targetDriverId}`);
          }
          return;
        }

        // CUSTOMER MODE: Only process own orders
        if (role === 'user' && userId) {
          if (updatedOrder.userId === userId) {
            console.log(`[HOOK] Processing as CUSTOMER - my order updated`);
            onOrderUpdate(updatedOrder);
          } else {
            console.log(`[HOOK] Skipping CUSTOMER - order for user ${updatedOrder.userId}, I am ${userId}`);
          }
          return;
        }

        console.log('[HOOK] Could not determine how to process event');
      };

      socket.on('orderUpdated', handleOrderUpdated);
      console.log('[HOOK] orderUpdated listener registered');

      return () => {
        socket.off('orderUpdated', handleOrderUpdated);
        console.log('[HOOK] orderUpdated listener removed');
      };
    } catch (err) {
      console.error('[HOOK] useOrderUpdates error:', err);
    }
  }, [onOrderUpdate, listenAll, userId, role, driverId]);
};
