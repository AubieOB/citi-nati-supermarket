/**
 * 🪝 usePOSProducts HOOK
 * 
 * Custom React hook for fetching and caching products from POS Sync Agent.
 * Provides loading, error, and refetch states.
 * 
 * Usage:
 *   const { products, loading, error, refetch } = usePOSProducts();
 *   
 *   if (loading) return <div>Loading products...</div>;
 *   if (error) return <div>Error: {error}</div>;
 *   
 *   return (
 *     <ul>
 *       {products.map(p => (
 *         <li key={p.ProductCode}>{p.ProductName} - ${p.SellingPrice}</li>
 *       ))}
 *     </ul>
 *   );
 */

import { useState, useEffect, useCallback } from 'react';
import { posSyncService } from '../utils/posSyncService.js';

/**
 * Custom hook to fetch products from POS Agent
 * 
 * @param {Object} options - Configuration options
 * @param {boolean} options.autoFetch - Automatically fetch on mount (default: true)
 * @param {number} options.refreshInterval - Auto-refresh interval in ms (0 = disabled)
 * 
 * @returns {Object} Hook state:
 *   - products: Array of product objects
 *   - loading: Boolean indicating if fetching
 *   - error: Error message string or null
 *   - refetch: Function to manually refetch products
 *   - lastFetch: Timestamp of last successful fetch
 */
export function usePOSProducts(options = {}) {
  const { autoFetch = true, refreshInterval = 0 } = options;

  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastFetch, setLastFetch] = useState(null);

  /**
   * Fetch products from POS agent
   */
  const fetchProducts = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const data = await posSyncService.getProducts();
      setProducts(data || []);
      setLastFetch(new Date());

      console.log(`[usePOSProducts] Loaded ${data.length} products`);
    } catch (err) {
      const errorMsg = err.message || 'Failed to fetch products';
      setError(errorMsg);
      console.error('[usePOSProducts] Error:', errorMsg);
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Auto-fetch on mount
   */
  useEffect(() => {
    if (autoFetch) {
      fetchProducts();
    }
  }, [autoFetch, fetchProducts]);

  /**
   * Auto-refresh at interval
   */
  useEffect(() => {
    if (refreshInterval <= 0) return;

    const interval = setInterval(() => {
      console.log('[usePOSProducts] Auto-refreshing products...');
      fetchProducts();
    }, refreshInterval);

    return () => clearInterval(interval);
  }, [refreshInterval, fetchProducts]);

  return {
    products,
    loading,
    error,
    refetch: fetchProducts,
    lastFetch,
  };
}

/**
 * Hook to fetch product categories
 * 
 * @returns {Object} Hook state (same as usePOSProducts)
 */
export function usePOSCategories(options = {}) {
  const { autoFetch = true, refreshInterval = 0 } = options;

  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastFetch, setLastFetch] = useState(null);

  const fetchCategories = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const data = await posSyncService.getCategories();
      setCategories(data || []);
      setLastFetch(new Date());

      console.log(`[usePOSCategories] Loaded ${data.length} categories`);
    } catch (err) {
      const errorMsg = err.message || 'Failed to fetch categories';
      setError(errorMsg);
      console.error('[usePOSCategories] Error:', errorMsg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (autoFetch) {
      fetchCategories();
    }
  }, [autoFetch, fetchCategories]);

  useEffect(() => {
    if (refreshInterval <= 0) return;

    const interval = setInterval(() => {
      console.log('[usePOSCategories] Auto-refreshing categories...');
      fetchCategories();
    }, refreshInterval);

    return () => clearInterval(interval);
  }, [refreshInterval, fetchCategories]);

  return {
    categories,
    loading,
    error,
    refetch: fetchCategories,
    lastFetch,
  };
}

/**
 * Hook to fetch stock by location
 * 
 * @returns {Object} Hook state (same as usePOSProducts)
 */
export function usePOSStock(options = {}) {
  const { autoFetch = true, refreshInterval = 0 } = options;

  const [stock, setStock] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastFetch, setLastFetch] = useState(null);

  const fetchStock = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const data = await posSyncService.getStockByLocation();
      setStock(data || []);
      setLastFetch(new Date());

      console.log(`[usePOSStock] Loaded stock for ${data.length} products`);
    } catch (err) {
      const errorMsg = err.message || 'Failed to fetch stock';
      setError(errorMsg);
      console.error('[usePOSStock] Error:', errorMsg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (autoFetch) {
      fetchStock();
    }
  }, [autoFetch, fetchStock]);

  useEffect(() => {
    if (refreshInterval <= 0) return;

    const interval = setInterval(() => {
      console.log('[usePOSStock] Auto-refreshing stock...');
      fetchStock();
    }, refreshInterval);

    return () => clearInterval(interval);
  }, [refreshInterval, fetchStock]);

  return {
    stock,
    loading,
    error,
    refetch: fetchStock,
    lastFetch,
  };
}

export default usePOSProducts;
