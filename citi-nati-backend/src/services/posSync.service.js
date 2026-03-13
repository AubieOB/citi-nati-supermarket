/**
 * 🔄 POS SYNC SERVICE - Backend
 * 
 * Handles communication with the local POS Sync Agent.
 * Syncs POS data into the Prisma database for use throughout the application.
 * 
 * Configuration via environment variables:
 *   POS_AGENT_URL - Base URL of POS agent (e.g., http://localhost:3001)
 *   POS_SECRET - API secret key for authentication
 *   ENABLE_POS_SYNC - Enable/disable POS sync (true/false)
 */

const axios = require('axios');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const POS_AGENT_URL = process.env.POS_AGENT_URL || 'http://localhost:3001';
const POS_SECRET = process.env.POS_SECRET || '';
const ENABLE_POS_SYNC = process.env.ENABLE_POS_SYNC !== 'false'; // Enabled by default

/**
 * Axios instance for POS Agent communication
 */
const posAgent = axios.create({
  baseURL: POS_AGENT_URL,
  headers: {
    'Content-Type': 'application/json',
    'x-pos-secret': POS_SECRET,
  },
  timeout: 15000,
});

/**
 * Check if POS Agent is reachable
 * 
 * @returns {Promise<boolean>} True if agent is healthy
 */
async function checkPOSHealth() {
  if (!ENABLE_POS_SYNC) {
    console.log('[POS Sync] POS Sync is disabled');
    return false;
  }

  try {
    const response = await posAgent.get('/health');
    console.log('[POS Sync] ✅ POS Agent is healthy');
    return response.data.success === true;
  } catch (error) {
    console.warn('[POS Sync] ⚠️ POS Agent health check failed:', error.message);
    return false;
  }
}

/**
 * Fetch products from POS Agent and sync to database
 * 
 * This function:
 * 1. Fetches products from POS Agent
 * 2. Maps POS format to database format
 * 3. Creates or updates products in database
 * 4. Returns sync statistics
 * 
 * @returns {Promise<Object>} Sync result with count and status
 */
async function syncProductsFromPOS() {
  if (!ENABLE_POS_SYNC) {
    return { success: false, error: 'POS Sync is disabled' };
  }

  try {
    console.log('[POS Sync] Starting product sync from POS Agent...');

    // Fetch products from POS agent
    const response = await posAgent.get('/pos-sync/products');

    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to fetch from POS agent');
    }

    const posProducts = response.data.data || [];
    console.log(`[POS Sync] Received ${posProducts.length} products from POS Agent`);

    if (posProducts.length === 0) {
      console.warn('[POS Sync] No products received from POS Agent');
      return { success: true, synced: 0, skipped: 0, message: 'No products to sync' };
    }

    let synced = 0;
    let skipped = 0;
    const errors = [];

    // Process each product from POS
    for (const posProduct of posProducts) {
      try {
        // Map POS product structure to database format
        const productData = {
          name: posProduct.ProductName || 'Unknown Product',
          price: posProduct.SellingPrice || 0,
          stock: posProduct.QuantityAvailable || 0,
          category: 'POS Import', // Default category for synced products
          sourceCode: posProduct.ProductCode, // Store original POS code
          barcode: posProduct.Barcode || null,
          image: null, // POS doesn't provide images - but products will still trigger low stock alerts
          isOnSale: false,
          discountPrice: null,
          originalPrice: posProduct.SellingPrice || 0,
          expiryDate: null, // POS doesn't provide expiry
          syncedFromPOS: true,
          lastSyncedAt: new Date(),
        };

        // Find existing product by source code
        const existingProduct = await prisma.product.findFirst({
          where: { sourceCode: posProduct.ProductCode },
        });

        if (existingProduct) {
          // Update existing product
          await prisma.product.update({
            where: { id: existingProduct.id },
            data: {
              ...productData,
              // Keep existing image if POS doesn't provide one
              image: productData.image || existingProduct.image,
              // Keep existing category if it's been customized
              category: existingProduct.category === 'POS Import' ? productData.category : existingProduct.category,
            },
          });
          console.log(`[POS Sync] Updated: ${productData.name} (${posProduct.ProductCode})`);
        } else {
          // Create new product
          await prisma.product.create({
            data: productData,
          });
          console.log(`[POS Sync] Created: ${productData.name} (${posProduct.ProductCode})`);
        }

        synced++;
      } catch (itemError) {
        console.error(`[POS Sync] Error syncing product ${posProduct.ProductCode}:`, itemError.message);
        errors.push({
          code: posProduct.ProductCode,
          error: itemError.message,
        });
        skipped++;
      }
    }

    console.log(`[POS Sync] ✅ Sync complete: ${synced} synced, ${skipped} skipped`);

    return {
      success: true,
      synced,
      skipped,
      total: posProducts.length,
      errors: errors.length > 0 ? errors : undefined,
    };
  } catch (error) {
    console.error('[POS Sync] ❌ Sync failed:', error.message);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Fetch categories from POS Agent
 * 
 * @returns {Promise<Array>} Array of category objects
 */
async function getCategoriesFromPOS() {
  if (!ENABLE_POS_SYNC) {
    return [];
  }

  try {
    console.log('[POS Sync] Fetching categories from POS Agent...');
    const response = await posAgent.get('/pos-sync/categories');

    if (!response.data.success) {
      throw new Error(response.data.error);
    }

    console.log(`[POS Sync] Fetched ${response.data.count} categories`);
    return response.data.data || [];
  } catch (error) {
    console.error('[POS Sync] Error fetching categories:', error.message);
    return [];
  }
}

/**
 * Fetch stock from POS Agent
 * 
 * @returns {Promise<Array>} Array of stock objects with location info
 */
async function getStockFromPOS() {
  if (!ENABLE_POS_SYNC) {
    return [];
  }

  try {
    console.log('[POS Sync] Fetching stock from POS Agent...');
    const response = await posAgent.get('/pos-sync/stock-by-location');

    if (!response.data.success) {
      throw new Error(response.data.error);
    }

    console.log(`[POS Sync] Fetched stock for ${response.data.count} products`);
    return response.data.data || [];
  } catch (error) {
    console.error('[POS Sync] Error fetching stock:', error.message);
    return [];
  }
}

/**
 * Get single product price from POS Agent
 * Falls back to database price if POS is unavailable
 * 
 * @param {string} productCode - POS product code
 * @returns {Promise<number>} Current selling price
 */
async function getPriceFromPOS(productCode) {
  if (!ENABLE_POS_SYNC) {
    return null;
  }

  try {
    const response = await posAgent.get('/pos-sync/products');

    if (!response.data.success) {
      return null;
    }

    const product = response.data.data?.find(p => p.ProductCode === productCode);
    return product?.SellingPrice || null;
  } catch (error) {
    console.warn(`[POS Sync] Error fetching price for ${productCode}:`, error.message);
    return null;
  }
}

/**
 * Get stock level for a product from POS Agent
 * 
 * @param {string} productCode - POS product code
 * @returns {Promise<number|null>} Available stock or null if not found
 */
async function getStockFromPOSByCode(productCode) {
  if (!ENABLE_POS_SYNC) {
    return null;
  }

  try {
    const response = await posAgent.get('/pos-sync/stock-by-location');

    if (!response.data.success) {
      return null;
    }

    const stock = response.data.data?.find(s => s.ProductCode === productCode);
    return stock?.AvailableStock || null;
  } catch (error) {
    console.warn(`[POS Sync] Error fetching stock for ${productCode}:`, error.message);
    return null;
  }
}

/**
 * Send manual price updates to POS Sync Agent
 *
 * @param {Array<{productCode: string, newPrice: number}>} updates
 * @returns {Promise<{success: boolean, data?: any, error?: string}>}
 */
async function updatePrices(updates = []) {
  if (!ENABLE_POS_SYNC) {
    return { success: false, error: 'POS Sync is disabled' };
  }

  if (!Array.isArray(updates) || updates.length === 0) {
    return { success: false, error: 'No price updates provided' };
  }

  const locationCode = process.env.POS_LOCATION_CODE || 'SH';

  try {
    const payload = {
      updates: updates.map((item) => ({
        productCode: item.productCode,
        newPrice: Number(item.newPrice),
      })),
      locationCode,
    };

    const response = await posAgent.post('/pos-sync/update-prices', payload);

    return {
      success: true,
      data: response.data,
    };
  } catch (error) {
    return {
      success: false,
      error: error.response?.data?.error || error.message,
    };
  }
}

/**
 * Get POS service configuration (for debugging)
 */
function getConfig() {
  return {
    enabled: ENABLE_POS_SYNC,
    agentUrl: POS_AGENT_URL,
    hasSecret: !!POS_SECRET,
    secretLength: POS_SECRET?.length || 0,
  };
}

module.exports = {
  checkPOSHealth,
  syncProductsFromPOS,
  getCategoriesFromPOS,
  getStockFromPOS,
  getPriceFromPOS,
  getStockFromPOSByCode,
  updatePrices,
  getConfig,
};
