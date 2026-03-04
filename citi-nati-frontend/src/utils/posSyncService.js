/**
 * 🔄 POS SYNC SERVICE
 * 
 * Manages communication with the local POS Sync Agent running on Windows desktop.
 * Provides methods to fetch products, stock, and categories from the POS database.
 * 
 * Configuration via environment variables:
 *   VITE_POS_AGENT_URL - Base URL of POS agent (default: http://localhost:3001)
 *   VITE_POS_SECRET - API secret key for authentication
 * 
 * Usage:
 *   import { posSyncService } from '../utils/posSyncService.js';
 *   const products = await posSyncService.getProducts();
 */

import axios from 'axios';

const POS_AGENT_URL = import.meta.env.VITE_POS_AGENT_URL || 'http://localhost:3001';
const POS_SECRET = import.meta.env.VITE_POS_SECRET || 'your-secret-key';

/**
 * Axios instance for POS Agent communication
 */
const posAgent = axios.create({
  baseURL: POS_AGENT_URL,
  headers: {
    'Content-Type': 'application/json',
    'x-pos-secret': POS_SECRET,
  },
  timeout: 10000,
});

/**
 * Error handler for POS Agent responses
 */
function handleError(error, endpoint) {
  if (error.response) {
    // Server responded with error status
    console.error(`[POS Agent ${endpoint}] Error:`, error.response.status, error.response.data);
    throw new Error(error.response.data?.error || `${endpoint} failed`);
  } else if (error.request) {
    // Request made but no response
    console.error(`[POS Agent ${endpoint}] No response - Agent may be offline`);
    throw new Error('POS Agent is offline or unreachable');
  } else {
    // Error in request setup
    console.error(`[POS Agent ${endpoint}] Error:`, error.message);
    throw error;
  }
}

/**
 * Fetch all active products with pricing and stock
 * 
 * @returns {Promise<Array>} Array of product objects with:
 *   - ProductCode
 *   - ProductName
 *   - Barcode
 *   - SellingPrice
 *   - QuantityAvailable
 */
export async function getProducts() {
  try {
    console.log('[POS Sync] Fetching products from POS agent...');
    const response = await posAgent.get('/pos-sync/products');
    
    if (!response.data.success) {
      throw new Error(response.data.error);
    }

    console.log(`[POS Sync] Successfully fetched ${response.data.count} products`);
    return response.data.data || [];
  } catch (error) {
    handleError(error, 'GET /pos-sync/products');
  }
}

/**
 * Fetch all product categories
 * 
 * @returns {Promise<Array>} Array of category objects with:
 *   - ProductTypeCode
 *   - CategoryName
 */
export async function getCategories() {
  try {
    console.log('[POS Sync] Fetching categories from POS agent...');
    const response = await posAgent.get('/pos-sync/categories');
    
    if (!response.data.success) {
      throw new Error(response.data.error);
    }

    console.log(`[POS Sync] Successfully fetched ${response.data.count} categories`);
    return response.data.data || [];
  } catch (error) {
    handleError(error, 'GET /pos-sync/categories');
  }
}

/**
 * Fetch stock quantities by location (SH location)
 * 
 * @returns {Promise<Array>} Array of stock objects with:
 *   - ProductCode
 *   - ProductName
 *   - LocationCode
 *   - AvailableStock
 */
export async function getStockByLocation() {
  try {
    console.log('[POS Sync] Fetching stock by location from POS agent...');
    const response = await posAgent.get('/pos-sync/stock-by-location');
    
    if (!response.data.success) {
      throw new Error(response.data.error);
    }

    console.log(`[POS Sync] Successfully fetched stock for ${response.data.count} products`);
    return response.data.data || [];
  } catch (error) {
    handleError(error, 'GET /pos-sync/stock-by-location');
  }
}

/**
 * Check if POS Agent is running and accessible
 * 
 * @returns {Promise<boolean>} True if agent is healthy, false otherwise
 */
export async function checkHealth() {
  try {
    const response = await axios.get(`${POS_AGENT_URL}/health`, {
      timeout: 5000,
    });
    return response.data.success === true;
  } catch (error) {
    console.warn('[POS Sync] Health check failed - Agent may be offline', error.message);
    return false;
  }
}

/**
 * Sync products with backend database
 * Call this to update your primary database with POS data
 * 
 * @returns {Promise<Object>} Sync result with count of updated products
 */
export async function syncProductsToBackend() {
  try {
    console.log('[POS Sync] Starting product sync to backend...');
    
    // Fetch products from POS agent
    const posProducts = await getProducts();
    
    if (!posProducts || posProducts.length === 0) {
      console.warn('[POS Sync] No products received from POS agent');
      return { success: false, error: 'No products to sync' };
    }

    // Map POS product structure to your backend format
    const productsToSync = posProducts.map(product => ({
      code: product.ProductCode,
      name: product.ProductName,
      barcode: product.Barcode,
      price: product.SellingPrice,
      stock: product.QuantityAvailable,
      source: 'POS',
      syncedAt: new Date().toISOString(),
    }));

    console.log(`[POS Sync] Syncing ${productsToSync.length} products to backend...`);
    
    // TODO: Replace with your actual backend sync endpoint
    // const response = await api.post('/products/sync', { products: productsToSync });
    // return response.data;

    return {
      success: true,
      count: productsToSync.length,
      products: productsToSync,
    };
  } catch (error) {
    console.error('[POS Sync] Sync failed:', error.message);
    throw error;
  }
}

/**
 * Get POS Agent configuration (for debugging)
 * 
 * @returns {Object} Current configuration
 */
export function getConfig() {
  return {
    url: POS_AGENT_URL,
    hasSecret: !!POS_SECRET,
    secretLength: POS_SECRET?.length || 0,
  };
}

/**
 * Export all methods as a service object
 */
export const posSyncService = {
  getProducts,
  getCategories,
  getStockByLocation,
  checkHealth,
  syncProductsToBackend,
  getConfig,
};

export default posSyncService;
