const { verifyToken } = require('../utils/jwt');

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
    return res.status(401).json({ error: 'No token provided' });
  }

  const decoded = verifyToken(token);

  if (!decoded) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  // Backward compatibility: some routes read req.user.id while newer code uses req.user.userId.
  req.user = {
    ...decoded,
    userId: decoded.userId || decoded.id,
    id: decoded.id || decoded.userId,
  };

  console.log('[AUTH] Token verified for user:', {
    userId: req.user.userId,
    id: req.user.id,
    role: req.user.role,
    email: req.user.email,
  });
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
