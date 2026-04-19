const rateLimit = require('express-rate-limit');

function buildRateLimiter({
  windowMs,
  max,
  message,
  standardHeaders = true,
  legacyHeaders = false,
}) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders,
    legacyHeaders,
    handler: (req, res) => {
      return res.status(429).json({
        error: message,
      });
    },
  });
}

const authRateLimiter = buildRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.AUTH_RATE_LIMIT_MAX || '10', 10) || 10,
  message: 'Too many authentication attempts. Please try again later.',
});

const adminRateLimiter = buildRateLimiter({
  windowMs: 10 * 60 * 1000,
  max: parseInt(process.env.ADMIN_RATE_LIMIT_MAX || '300', 10) || 300,
  message: 'Too many admin requests. Please slow down and try again shortly.',
});

const posAgentRateLimiter = buildRateLimiter({
  windowMs: 5 * 60 * 1000,
  max: parseInt(process.env.POS_AGENT_RATE_LIMIT_MAX || '600', 10) || 600,
  message: 'Too many POS agent requests. Please try again later.',
});

module.exports = {
  authRateLimiter,
  adminRateLimiter,
  posAgentRateLimiter,
  buildRateLimiter,
};