/**
 * Admin verification middleware
 * Ensures user is authenticated and has admin role
 */

const verifyAdmin = (req, res, next) => {
  // Check if user object exists (should be set by verifyTokenMiddleware)
  if (!req.user) {
    return res.status(401).json({ message: "Unauthorized. User not found." });
  }

  // Check if user has admin role (case-insensitive check, but route expects lowercase)
  if (req.user.role !== "admin") {
    console.warn('[ADMIN_AUTH] Access denied - user role is:', req.user.role, 'email:', req.user.email);
    return res.status(403).json({ message: "Access denied. Admin only." });
  }

  console.log('[ADMIN_AUTH] Admin verified:', { id: req.user.userId, email: req.user.email });
  // User is admin, proceed to next middleware/controller
  next();
};

module.exports = { verifyAdmin };
