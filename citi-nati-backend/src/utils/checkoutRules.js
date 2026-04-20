'use strict';

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const MINIMUM_ORDER_VALUE_KEY = 'minimum_order_value_mwk';
const DEFAULT_MINIMUM_ORDER_VALUE = 10000;
const CHECKOUT_RULES_CACHE_MS = 10000;

let cachedMinimumOrderValue = null;
let minimumOrderLoadedAt = 0;

function normalizeMinimumOrderValue(value, fallback = DEFAULT_MINIMUM_ORDER_VALUE) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Number(parsed.toFixed(2));
}

function clearCheckoutRulesCache() {
  cachedMinimumOrderValue = null;
  minimumOrderLoadedAt = 0;
}

async function getMinimumOrderValue(prismaClient = prisma, forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && cachedMinimumOrderValue != null && (now - minimumOrderLoadedAt) < CHECKOUT_RULES_CACHE_MS) {
    return cachedMinimumOrderValue;
  }

  let minimumOrderValue = DEFAULT_MINIMUM_ORDER_VALUE;

  try {
    const setting = await prismaClient.siteSetting.findUnique({ where: { key: MINIMUM_ORDER_VALUE_KEY } });
    if (setting) {
      minimumOrderValue = normalizeMinimumOrderValue(setting.value, DEFAULT_MINIMUM_ORDER_VALUE);
    }
  } catch (error) {
    console.warn('[CheckoutRules] Failed to load minimum order setting:', error.message);
    if (!forceRefresh && cachedMinimumOrderValue != null) {
      return cachedMinimumOrderValue;
    }
  }

  cachedMinimumOrderValue = minimumOrderValue;
  minimumOrderLoadedAt = now;
  return minimumOrderValue;
}

module.exports = {
  MINIMUM_ORDER_VALUE_KEY,
  DEFAULT_MINIMUM_ORDER_VALUE,
  normalizeMinimumOrderValue,
  clearCheckoutRulesCache,
  getMinimumOrderValue,
};
