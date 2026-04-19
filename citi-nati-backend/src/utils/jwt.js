const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;
const TOKEN_EXPIRY = process.env.JWT_ACCESS_TOKEN_EXPIRY || '1h';

const generateToken = (userId, role, email = null, options = {}) => {
  const payload = { userId, role, email };

  if (options.tokenType) {
    payload.tokenType = options.tokenType;
  }

  return jwt.sign(payload, JWT_SECRET, { expiresIn: options.expiresIn || TOKEN_EXPIRY });
};

const verifyToken = (token) => {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return null;
  }
};

const verifyTokenDetailed = (token) => {
  try {
    return {
      valid: true,
      payload: jwt.verify(token, JWT_SECRET),
      code: null,
    };
  } catch (err) {
    const code = err?.name === 'TokenExpiredError' ? 'TOKEN_EXPIRED' : 'INVALID_TOKEN';
    return {
      valid: false,
      payload: null,
      code,
    };
  }
};

module.exports = { generateToken, verifyToken, verifyTokenDetailed };
