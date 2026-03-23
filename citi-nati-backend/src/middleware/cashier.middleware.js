/**
 * 🏪 CASHIER MIDDLEWARE
 *
 * Verifies that the authenticated user has the 'cashier' role.
 * Must be used after verifyTokenMiddleware.
 */
const verifyCashier = (req, res, next) => {
  if (!req.user || req.user.role !== 'cashier') {
    return res.status(403).json({ error: 'Forbidden: cashier access required' });
  }
  next();
};

module.exports = { verifyCashier };
