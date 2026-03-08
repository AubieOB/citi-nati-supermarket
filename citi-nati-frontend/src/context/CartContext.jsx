import React, { createContext, useState, useContext, useCallback } from 'react';
import api from '../utils/api.js';

const CartContext = createContext();

export const useCart = () => {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
};

export const CartProvider = ({ children }) => {
  const [cartCount, setCartCount] = useState(0);
  const [loading, setLoading] = useState(false);

  /**
   * Fetch cart count from backend
   */
  const fetchCartCount = useCallback(async () => {
    try {
      setLoading(true);
      const response = await api.get('/cart');
      const itemCount = response.data.items
        ? response.data.items.reduce((sum, item) => sum + item.quantity, 0)
        : 0;
      setCartCount(itemCount);
    } catch (err) {
      // Silent fail - cart might not exist yet
      setCartCount(0);
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Update cart count after adding/removing items
   */
  const updateCartCount = useCallback(async () => {
    await fetchCartCount();
  }, [fetchCartCount]);

  /**
   * Increment count (for optimistic UI)
   */
  const incrementCart = useCallback((quantity = 1) => {
    setCartCount(prev => prev + quantity);
  }, []);

  /**
   * Decrement count (for optimistic UI)
   */
  const decrementCart = useCallback((quantity = 1) => {
    setCartCount(prev => Math.max(0, prev - quantity));
  }, []);

  /**
   * Reset cart count (called on logout)
   */
  const resetCart = useCallback(() => {
    setCartCount(0);
  }, []);

  return (
    <CartContext.Provider
      value={{
        cartCount,
        loading,
        fetchCartCount,
        updateCartCount,
        incrementCart,
        decrementCart,
        resetCart
      }}
    >
      {children}
    </CartContext.Provider>
  );
};
