const rateLimit = require('express-rate-limit');
const { RedisStore } = require('rate-limit-redis');
const { createClient } = require('redis');
const logger = require('../utils/logger');

let redisClient;
let sharedStore;
let storeInitialized = false;

function parseLimitValue(value, fallback) {
  const parsed = parseInt(value || String(fallback), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function getClientKey(req) {
  return String(req.ip || req.headers['x-forwarded-for'] || 'unknown').trim();
}

function getSharedStore() {
  if (storeInitialized) {
    return sharedStore;
  }

  storeInitialized = true;

  const redisUrl = String(process.env.REDIS_URL || '').trim();
  if (!redisUrl) {
    return null;
  }

  try {
    redisClient = createClient({ url: redisUrl });
    redisClient.on('error', (error) => {
      logger.error('[RATE_LIMIT] Redis client error', error);
    });

    redisClient.connect().catch((error) => {
      logger.error('[RATE_LIMIT] Failed to connect Redis rate limit store', error);
    });

    sharedStore = new RedisStore({
      sendCommand: (...args) => redisClient.sendCommand(args),
      prefix: 'rate-limit:',
    });

    logger.info('[RATE_LIMIT] Using Redis-backed store');
    return sharedStore;
  } catch (error) {
    logger.error('[RATE_LIMIT] Failed to initialize Redis-backed store', error);
    sharedStore = null;
    return null;
  }
}

function buildRateLimiter({
  name,
  windowMs,
  max,
  message,
  keyGenerator,
  standardHeaders = true,
  legacyHeaders = false,
}) {
  const store = getSharedStore();

  return rateLimit({
    windowMs,
    max,
    store: store || undefined,
    keyGenerator,
    standardHeaders,
    legacyHeaders,
    handler: (req, res) => {
      logger.warn('[RATE_LIMIT] Request blocked', {
        limiter: name || 'unknown',
        method: req.method,
        path: req.originalUrl,
        ip: getClientKey(req),
        email: normalizeEmail(req.body?.email) || undefined,
        userId: req.user?.id || undefined,
        limit: req.rateLimit?.limit,
        remaining: req.rateLimit?.remaining,
        resetTime: req.rateLimit?.resetTime,
      });

      return res.status(429).json({
        error: message,
      });
    },
  });
}

const loginIpRateLimiter = buildRateLimiter({
  name: 'auth_login_ip',
  windowMs: 15 * 60 * 1000,
  max: parseLimitValue(process.env.LOGIN_RATE_LIMIT_IP_MAX || process.env.AUTH_RATE_LIMIT_MAX, 10),
  message: 'Too many login attempts. Please try again later.',
});

const loginIdentityRateLimiter = buildRateLimiter({
  name: 'auth_login_identity',
  windowMs: 15 * 60 * 1000,
  max: parseLimitValue(process.env.LOGIN_RATE_LIMIT_IDENTITY_MAX, 5),
  keyGenerator: (req) => `${normalizeEmail(req.body?.email) || 'unknown'}:${getClientKey(req)}`,
  message: 'Too many login attempts for this account. Please try again later.',
});

const authRateLimiter = buildRateLimiter({
  name: 'auth_general',
  windowMs: 15 * 60 * 1000,
  max: parseLimitValue(process.env.AUTH_RATE_LIMIT_MAX, 10),
  message: 'Too many authentication attempts. Please try again later.',
});

const refreshRateLimiter = buildRateLimiter({
  name: 'auth_refresh',
  windowMs: 15 * 60 * 1000,
  max: parseLimitValue(process.env.REFRESH_RATE_LIMIT_MAX, 30),
  message: 'Too many session refresh attempts. Please try again later.',
});

const adminRateLimiter = buildRateLimiter({
  name: 'admin',
  windowMs: 10 * 60 * 1000,
  max: parseLimitValue(process.env.ADMIN_RATE_LIMIT_MAX, 300),
  message: 'Too many admin requests. Please slow down and try again shortly.',
});

const posAgentRateLimiter = buildRateLimiter({
  name: 'pos_agent',
  windowMs: 5 * 60 * 1000,
  max: parseLimitValue(process.env.POS_AGENT_RATE_LIMIT_MAX, 600),
  message: 'Too many POS agent requests. Please try again later.',
});

module.exports = {
  loginIpRateLimiter,
  loginIdentityRateLimiter,
  authRateLimiter,
  refreshRateLimiter,
  adminRateLimiter,
  posAgentRateLimiter,
  buildRateLimiter,
};