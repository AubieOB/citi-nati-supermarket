function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim();
  }

  return req.ip || req.socket?.remoteAddress || null;
}

function getUserAgent(req) {
  return String(req.headers['user-agent'] || '').slice(0, 512) || null;
}

module.exports = {
  getClientIp,
  getUserAgent,
};