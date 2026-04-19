const crypto = require('crypto');
const { getClientIp } = require('../utils/requestContext');

function getConfiguredAgentSecret() {
  const candidates = [
    process.env.BACKEND_API_TOKEN,
    process.env.POS_SYNC_AGENT_API_KEY,
    process.env.POS_AGENT_SECRET,
    process.env.POS_SYNC_SECRET,
    process.env.POS_SECRET,
  ];

  const found = candidates.find((value) => String(value || '').trim());
  return found ? String(found).trim() : '';
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left || ''));
  const rightBuffer = Buffer.from(String(right || ''));

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function getProvidedSecret(req) {
  const bearer = req.headers.authorization?.startsWith('Bearer ')
    ? req.headers.authorization.slice('Bearer '.length).trim()
    : null;

  return bearer || req.headers['x-pos-secret'] || req.headers['x-api-key'] || null;
}

function isAllowedIp(req) {
  const allowedIps = String(process.env.POS_SYNC_ALLOWED_IPS || process.env.ALLOWED_AGENT_IPS || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

  if (allowedIps.length === 0) {
    return true;
  }

  const clientIp = getClientIp(req);
  return Boolean(clientIp && allowedIps.includes(clientIp));
}

function requireTrustedAgent(req, res, next) {
  const expectedSecret = getConfiguredAgentSecret();
  if (!expectedSecret) {
    return res.status(503).json({ success: false, error: 'POS agent access is not configured' });
  }

  if (!isAllowedIp(req)) {
    return res.status(403).json({ success: false, error: 'Source IP not allowed' });
  }

  const providedSecret = getProvidedSecret(req);
  if (!providedSecret || !safeEqual(providedSecret, expectedSecret)) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  return next();
}

module.exports = {
  requireTrustedAgent,
  getConfiguredAgentSecret,
};