const { verifyTokenDetailed } = require('../utils/jwt');
const logger = require('../utils/logger');

const extractTokenFromCookies = (cookieHeader) => {
  if (!cookieHeader || typeof cookieHeader !== 'string') {
    return null;
  }

  const cookies = cookieHeader.split(';').map((part) => part.trim());
  const authCookie = cookies.find((part) => part.startsWith('auth_token='));

  if (!authCookie) {
    return null;
  }

  return decodeURIComponent(authCookie.slice('auth_token='.length));
};

const verifyTokenMiddleware = (req, res, next) => {
  const bearerToken = req.headers.authorization?.split(' ')[1];
  const cookieToken = req.cookies?.auth_token || extractTokenFromCookies(req.headers.cookie);
  const token = bearerToken || cookieToken;

  if (!token) {
    return res.status(401).json({ error: 'Authentication required', code: 'NO_TOKEN' });
  }

  const verification = verifyTokenDetailed(token);

  if (!verification.valid) {
    return res.status(401).json({
      error: verification.code === 'TOKEN_EXPIRED' ? 'Session expired' : 'Invalid token',
      code: verification.code,
    });
  }

  req.user = verification.payload;
  logger.debug('[AUTH] Token verified', { userId: req.user.userId, role: req.user.role });
  next();
};

const authorizeRoles = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    next();
  };
};

module.exports = { verifyTokenMiddleware, authorizeRoles };
