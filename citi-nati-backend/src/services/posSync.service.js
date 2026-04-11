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
const { notifyLowStock } = require('../utils/messageService');
const { enrichProductStock } = require('../utils/stockResolver');
const { emitProductUpdate } = require('../utils/socket');
const productImageMappingService = require('./productImageMapping.service');

const prisma = new PrismaClient();

function resolvePosAgentUrl() {
  const candidates = [
    { key: 'POS_AGENT_URL', value: process.env.POS_AGENT_URL },
    { key: 'VITE_POS_AGENT_URL', value: process.env.VITE_POS_AGENT_URL },
    { key: 'POS_SYNC_AGENT_URL', value: process.env.POS_SYNC_AGENT_URL },
  ];

  const found = candidates.find((candidate) => String(candidate.value || '').trim());
  if (!found) {
    return { value: 'http://localhost:3001', source: 'default' };
  }

  return {
    value: String(found.value).trim(),
    source: found.key,
  };
}

function resolvePosSecret() {
  const candidates = [
    { key: 'POS_SECRET', value: process.env.POS_SECRET },
    { key: 'POS_AGENT_SECRET', value: process.env.POS_AGENT_SECRET },
    { key: 'POS_SYNC_SECRET', value: process.env.POS_SYNC_SECRET },
    { key: 'VITE_POS_SECRET', value: process.env.VITE_POS_SECRET },
  ];

  const found = candidates.find((candidate) => String(candidate.value || '').trim());
  if (!found) {
    return { value: '', source: 'none' };
  }

  return {
    value: String(found.value).trim(),
    source: found.key,
  };
}

const { value: POS_AGENT_URL, source: POS_AGENT_URL_SOURCE } = resolvePosAgentUrl();
const { value: POS_SECRET, source: POS_SECRET_SOURCE } = resolvePosSecret();
const ENABLE_POS_SYNC = process.env.ENABLE_POS_SYNC !== 'false'; // Enabled by default
const POS_SYNC_ENABLED_KEY = 'pos_sync_enabled';
const ENABLE_DIRECT_POS_WRITEBACK_DEBUG = process.env.ENABLE_DIRECT_POS_WRITEBACK_DEBUG === 'true';
const parsedPosAgentTimeoutMs = parseInt(process.env.POS_AGENT_TIMEOUT_MS || '15000', 10);
const POS_AGENT_TIMEOUT_MS = Number.isFinite(parsedPosAgentTimeoutMs) && parsedPosAgentTimeoutMs > 0
  ? parsedPosAgentTimeoutMs
  : 15000;
const POS_SYNC_SETTINGS_CACHE_MS = 10000;
let cachedPosSyncEnabled = ENABLE_POS_SYNC;
let posSyncSettingsLoadedAt = 0;

/**
 * Axios instance for POS Agent communication
 */
const posAgent = axios.create({
  baseURL: POS_AGENT_URL,
  headers: {
    'Content-Type': 'application/json',
    'x-pos-secret': POS_SECRET,
  },
  timeout: POS_AGENT_TIMEOUT_MS,
});

function formatPosAgentError(error, endpoint, timeoutMs = POS_AGENT_TIMEOUT_MS) {
  const target = `${POS_AGENT_URL}${endpoint}`;

  if (error.code === 'ECONNABORTED') {
    return `Request to POS agent timed out after ${timeoutMs}ms (${target}). Verify the POS Sync Agent is running and the endpoint is responsive.`;
  }

  if (error.code === 'ECONNREFUSED') {
    return `Could not connect to POS agent at ${target}. Verify the POS Sync Agent is running and POS_AGENT_URL is correct.`;
  }

  if (error.response) {
    return error.response.data?.error || `POS agent request failed with status ${error.response.status} (${target})`;
  }

  return error.message;
}

async function recordMonitorEvent(payload) {
  try {
    const { recordPosSyncEvent } = require('./posSyncMonitor.service');
    await recordPosSyncEvent(payload);
  } catch (error) {
    console.error('[POS Sync] Failed to record monitor event:', error.message);
  }
}

async function getPosSyncEnabled(forceRefresh = false) {
  if (!forceRefresh && Date.now() - posSyncSettingsLoadedAt < POS_SYNC_SETTINGS_CACHE_MS) {
    return cachedPosSyncEnabled;
  }

  try {
    const setting = await prisma.siteSetting.findUnique({
      where: { key: POS_SYNC_ENABLED_KEY },
    });
    cachedPosSyncEnabled = setting ? setting.value === 'true' : ENABLE_POS_SYNC;
    posSyncSettingsLoadedAt = Date.now();
  } catch (error) {
    console.warn('[POS Sync] Failed to load persisted POS sync setting:', error.message);
  }

  return cachedPosSyncEnabled;
}

async function setPosSyncEnabled(enabled) {
  const nextValue = Boolean(enabled);
  await prisma.siteSetting.upsert({
    where: { key: POS_SYNC_ENABLED_KEY },
    update: { value: nextValue ? 'true' : 'false' },
    create: { key: POS_SYNC_ENABLED_KEY, value: nextValue ? 'true' : 'false' },
  });

  cachedPosSyncEnabled = nextValue;
  posSyncSettingsLoadedAt = Date.now();
  return cachedPosSyncEnabled;
}

/**
 * Check if POS Agent is reachable
 * 
 * @returns {Promise<boolean>} True if agent is healthy
 */
async function checkPOSHealth() {
  if (!(await getPosSyncEnabled())) {
    console.log('[POS Sync] POS Sync is disabled');
    return false;
  }

  try {
    const response = await posAgent.get('/health');
    console.log('[POS Sync] ✅ POS Agent is healthy');
    return response.data.success === true;
  } catch (error) {
    console.warn('[POS Sync] ⚠️ POS Agent health check failed:', formatPosAgentError(error, '/health'));
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
  if (!(await getPosSyncEnabled())) {
    return { success: false, error: 'POS Sync is disabled' };
  }

  const startedAt = Date.now();

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
          const updatedProduct = await prisma.product.update({
            where: { id: existingProduct.id },
            data: {
              ...productData,
              // Keep existing image if POS doesn't provide one
              image: productData.image || existingProduct.image,
              // Keep existing category if it's been customized
              category: existingProduct.category === 'POS Import' ? productData.category : existingProduct.category,
            },
          });

          const currentStockStatus = enrichProductStock(updatedProduct).stock_status;
          const isAlertState = ['low_stock', 'out_of_stock'].includes(currentStockStatus);

          if (isAlertState) {
            await notifyLowStock(updatedProduct);
          }

          if (global.io) {
            emitProductUpdate(updatedProduct);
          }

          // Ensure mapping reattachment also runs on updates (covers legacy null-image rows).
          const reattached = await productImageMappingService.reattachImageByProductCode(posProduct.ProductCode);
          if (reattached) {
            console.log(`[POS Sync] Image restored for ${posProduct.ProductCode}: ${reattached}`);
          }

          console.log(`[POS Sync] Updated: ${productData.name} (${posProduct.ProductCode})`);
        } else {
          // Create new product
          const createdProduct = await prisma.product.create({
            data: productData,
          });

          const currentStockStatus = enrichProductStock(createdProduct).stock_status;
          if (['low_stock', 'out_of_stock'].includes(currentStockStatus)) {
            await notifyLowStock(createdProduct);
          }

          if (global.io) {
            emitProductUpdate(createdProduct);
          }

          console.log(`[POS Sync] Created: ${productData.name} (${posProduct.ProductCode})`);

          // Restore image from persistent mapping if one exists for this ProductCode
          const reattached = await productImageMappingService.reattachImageByProductCode(posProduct.ProductCode);
          if (reattached) {
            console.log(`[POS Sync] Image restored for ${posProduct.ProductCode}: ${reattached}`);
          }
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

    await recordMonitorEvent({
      eventType: 'manual-product-sync',
      source: 'backend-sync-service',
      status: skipped > 0 ? 'warning' : 'success',
      level: skipped > 0 ? 'warning' : 'info',
      title: skipped > 0 ? 'POS product sync completed with issues' : 'POS product sync completed',
      message: `Product sync finished with ${synced} synced and ${skipped} skipped item(s).`,
      reason: skipped > 0 ? `${skipped} product(s) failed individual sync processing.` : null,
      suggestion: skipped > 0 ? 'Review skipped items in the monitor feed to fix malformed product payloads or mapping mismatches.' : 'No corrective action is required.',
      durationMs: Date.now() - startedAt,
      metadata: {
        synced,
        skipped,
        total: posProducts.length,
        errors,
      },
    });

    return {
      success: true,
      synced,
      skipped,
      total: posProducts.length,
      errors: errors.length > 0 ? errors : undefined,
    };
  } catch (error) {
    console.error('[POS Sync] ❌ Sync failed:', formatPosAgentError(error, '/pos-sync/products'));
    await recordMonitorEvent({
      eventType: 'manual-product-sync',
      source: 'backend-sync-service',
      status: 'failed',
      level: 'error',
      title: 'POS product sync failed',
      message: 'Product sync from the POS agent failed before completion.',
      reason: formatPosAgentError(error, '/pos-sync/products'),
      suggestion: 'Check whether the agent is reachable, authentication is valid, and the POS agent endpoint is responding normally.',
      durationMs: Date.now() - startedAt,
      metadata: {
        endpoint: '/pos-sync/products',
      },
    });
    return {
      success: false,
      error: formatPosAgentError(error, '/pos-sync/products'),
    };
  }
}

/**
 * Fetch categories from POS Agent
 * 
 * @returns {Promise<Array>} Array of category objects
 */
async function getCategoriesFromPOS() {
  if (!(await getPosSyncEnabled())) {
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
    console.error('[POS Sync] Error fetching categories:', formatPosAgentError(error, '/pos-sync/categories'));
    return [];
  }
}

/**
 * Fetch stock from POS Agent
 * 
 * @returns {Promise<Array>} Array of stock objects with location info
 */
async function getStockFromPOS() {
  if (!(await getPosSyncEnabled())) {
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
    console.error('[POS Sync] Error fetching stock:', formatPosAgentError(error, '/pos-sync/stock-by-location'));
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
  if (!(await getPosSyncEnabled())) {
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
    console.warn(`[POS Sync] Error fetching price for ${productCode}:`, formatPosAgentError(error, '/pos-sync/products'));
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
  if (!(await getPosSyncEnabled())) {
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
    console.warn(`[POS Sync] Error fetching stock for ${productCode}:`, formatPosAgentError(error, '/pos-sync/stock-by-location'));
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
  if (!ENABLE_DIRECT_POS_WRITEBACK_DEBUG) {
    return {
      success: false,
      error: 'Direct backend-to-agent write-back is disabled in production. Use POS command queue polling flow.',
    };
  }

  if (!(await getPosSyncEnabled())) {
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
      error: formatPosAgentError(error, '/pos-sync/update-prices'),
    };
  }
}

async function getExpiryProductsFromPOS({ days = 14, locationCode = 'SH', includeExpired = false, source = 'view', productCodes = [], requestTimeoutMs } = {}) {
  if (!(await getPosSyncEnabled())) {
    return { success: false, error: 'POS Sync is disabled' };
  }

  const endpoint = '/pos-sync/expiry-products';
  const targetUrl = `${POS_AGENT_URL}${endpoint}`;
  const effectiveTimeoutMs = Number.isFinite(Number(requestTimeoutMs)) && Number(requestTimeoutMs) > 0
    ? Number(requestTimeoutMs)
    : POS_AGENT_TIMEOUT_MS;
  const normalizedProductCodes = Array.isArray(productCodes)
    ? productCodes.map((value) => String(value || '').trim()).filter(Boolean)
    : [];
  const productCodesCsv = normalizedProductCodes.length > 0
    ? normalizedProductCodes.join(',')
    : undefined;

  try {
    if (!POS_SECRET) {
      console.warn('[BACKEND -> AGENT][EXPIRY] POS_SECRET is empty. Agent will likely return 401 before route-level [EXPIRY] logs.');
    }

    console.log('[BACKEND -> AGENT][EXPIRY] requesting expiry candidates', {
      endpoint,
      targetUrl,
      agentUrlSource: POS_AGENT_URL_SOURCE,
      hasSecret: Boolean(POS_SECRET),
      secretSource: POS_SECRET_SOURCE,
      days,
      locationCode,
      includeExpired,
      source,
      productCodesCount: normalizedProductCodes.length,
    });

    const response = await posAgent.get(endpoint, {
      params: {
        days,
        locationCode,
        includeExpired,
        source,
        productCodesCsv,
      },
      timeout: effectiveTimeoutMs,
    });

    console.log('[BACKEND -> AGENT][EXPIRY] success', {
      endpoint,
      targetUrl,
      status: response.status,
      count: response.data?.count || 0,
      source: response.data?.source || source,
    });

    return {
      success: true,
      data: response.data,
      meta: {
        endpoint,
        targetUrl,
        status: response.status,
      },
    };
  } catch (error) {
    const status = error.response?.status || null;
    const rawBody = error.response?.data ?? null;
    const formattedError = formatPosAgentError(error, endpoint, effectiveTimeoutMs);

    console.error('[BACKEND -> AGENT][EXPIRY] failed', {
      endpoint,
      targetUrl,
      status,
      error: formattedError,
      rawBody,
    });

    return {
      success: false,
      error: formattedError,
      meta: {
        endpoint,
        targetUrl,
        status,
        rawBody,
      },
    };
  }
}

async function previewPromotionPriceFromPOS(productCode, { locationCode = 'SH', priceTypeCode = 'RT' } = {}) {
  if (!(await getPosSyncEnabled())) {
    return { success: false, error: 'POS Sync is disabled' };
  }

  if (!productCode) {
    return { success: false, error: 'productCode is required' };
  }

  try {
    const response = await posAgent.get(`/pos-sync/promotion-preview/${encodeURIComponent(productCode)}`, {
      params: {
        locationCode,
        priceTypeCode,
      },
    });

    return {
      success: true,
      data: response.data,
    };
  } catch (error) {
    return {
      success: false,
      error: formatPosAgentError(error, `/pos-sync/promotion-preview/${encodeURIComponent(productCode)}`),
    };
  }
}

/**
 * Get POS service configuration (for debugging)
 */
function getConfig() {
  return {
    enabled: cachedPosSyncEnabled,
    agentUrl: POS_AGENT_URL,
    agentUrlSource: POS_AGENT_URL_SOURCE,
    timeoutMs: POS_AGENT_TIMEOUT_MS,
    hasSecret: !!POS_SECRET,
    secretSource: POS_SECRET_SOURCE,
    secretLength: POS_SECRET?.length || 0,
  };
}

async function getRuntimeConfig() {
  return {
    ...getConfig(),
    enabled: await getPosSyncEnabled(),
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
  getExpiryProductsFromPOS,
  previewPromotionPriceFromPOS,
  getConfig,
  getRuntimeConfig,
  getPosSyncEnabled,
  setPosSyncEnabled,
};
