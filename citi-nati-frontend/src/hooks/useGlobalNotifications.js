import { useEffect, useCallback } from 'react';
import { getSocket } from '../utils/socket.js';
import { useAuth } from '../context/AuthContext.jsx';
import { notifySuccess, notifyInfo } from '../utils/notifications.js';

/**
 * Global socket listener hook
 * Sets up notifications that work on ANY page
 * Should be called once in App root
 */
export const useGlobalNotifications = () => {
  const { user } = useAuth();

  // Create stable handler functions using useCallback
  const handleNewOrder = useCallback((order) => {
    console.log('[GLOBAL_NOTIFICATIONS] Admin: New order received:', order.id);
    notifySuccess(`🎉 New order #${order.id} from customer`, 5000);
  }, []);

  const handleOrderAssigned = useCallback((order) => {
    console.log('[GLOBAL_NOTIFICATIONS] Driver: Order assigned:', order.id);
    notifySuccess(`📦 New order assigned: #${order.id}`, 5000);
  }, []);

  const handleOrderUpdate = useCallback((order) => {
    console.log('[GLOBAL_NOTIFICATIONS] Customer: Order update received:', order.id, order.status);

    if (order.status === 'ASSIGNED') {
      notifyInfo(`📍 Driver assigned to your order #${order.id}`, 5000);
    } else if (order.status === 'IN_TRANSIT') {
      notifyInfo(`🚚 Your order #${order.id} is on the way!`, 5000);
    } else if (order.status === 'DELIVERED') {
      notifySuccess(`✅ Your order #${order.id} has been delivered!`, 5000);
    }
  }, []);

  useEffect(() => {
    if (!user?.id) {
      console.log('[GLOBAL_NOTIFICATIONS] Waiting for user to load');
      return;
    }

    try {
      const socket = getSocket();
      if (!socket) {
        console.warn('[GLOBAL_NOTIFICATIONS] Socket not initialized');
        return;
      }

      console.log('[GLOBAL_NOTIFICATIONS] Setting up listeners for user:', user.id, 'role:', user.role);

      // Always remove old listeners first to prevent duplicates
      socket.off('newOrder');
      socket.off('orderAssigned');
      socket.off('orderUpdated');

      // Set up listeners based on role
      if (user.role === 'admin') {
        socket.on('newOrder', handleNewOrder);
        console.log('[GLOBAL_NOTIFICATIONS] Admin: newOrder listener registered');
      } else if (user.role === 'driver') {
        socket.on('orderAssigned', handleOrderAssigned);
        console.log('[GLOBAL_NOTIFICATIONS] Driver: orderAssigned listener registered');
      } else if (user.role === 'user') {
        socket.on('orderUpdated', handleOrderUpdate);
        console.log('[GLOBAL_NOTIFICATIONS] Customer: orderUpdated listener registered');
      }

      // Cleanup function
      return () => {
        console.log('[GLOBAL_NOTIFICATIONS] Cleaning up listeners');
        socket.off('newOrder', handleNewOrder);
        socket.off('orderAssigned', handleOrderAssigned);
        socket.off('orderUpdated', handleOrderUpdate);
      };
    } catch (err) {
      console.error('[GLOBAL_NOTIFICATIONS] Error:', err);
    }
  }, [user?.id, user?.role, handleNewOrder, handleOrderAssigned, handleOrderUpdate]);
};
