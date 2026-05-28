/**
 * Webhook Event Cache
 * Stores recent payment confirmations to enable fast polling
 * When polling endpoint checks payment status, it checks this cache first
 * before relying on database updates
 */

const logger = require('./logger');

// In-memory cache of recent webhook events
const webhookCache = new Map();
const CACHE_TTL = 120000; // Keep events for 2 minutes

/**
 * Store a webhook event in cache
 * Called when webhook is received to mark payment as confirmed
 */
const cacheWebhookEvent = (reference, status, data = {}) => {
  webhookCache.set(reference, {
    status,
    timestamp: Date.now(),
    data
  });
  
  logger.debugLog(`[WEBHOOK_CACHE] Cached event: ${reference} = ${status}`);
  
  // Auto-cleanup after TTL
  setTimeout(() => {
    webhookCache.delete(reference);
    logger.debugLog(`[WEBHOOK_CACHE] Cleared cached event: ${reference}`);
  }, CACHE_TTL);
};

/**
 * Check if webhook was recently received for this reference
 * Returns the payment status if webhook was cached
 */
const isPaymentConfirmedInCache = (reference) => {
  if (!webhookCache.has(reference)) {
    return null;
  }
  
  const cached = webhookCache.get(reference);
  logger.debugLog(`[WEBHOOK_CACHE] Cache hit: ${reference} = ${cached.status}`);
  return cached.status;
};

/**
 * Clear a specific cache entry
 */
const clearCacheEntry = (reference) => {
  webhookCache.delete(reference);
  logger.debugLog(`[WEBHOOK_CACHE] Manually cleared: ${reference}`);
};

module.exports = {
  cacheWebhookEvent,
  isPaymentConfirmedInCache,
  clearCacheEntry
};
