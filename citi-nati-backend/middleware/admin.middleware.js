/**
 * Admin verification middleware
 * Ensures user is authenticated and has admin role
 * 
 * Usage in routes:
 *   router.get('/admin/dashboard', verifyToken, verifyAdmin, getDashboard);
 */

const verifyAdmin = (req, res, next) => {
  // Check if user object exists (should be set by verifyToken middleware)
  if (!req.user) {
    return res.status(401).json({ error: "Unauthorized. User not found." });
  }

  // Check if user has admin role (case-insensitive for safety)
  if (req.user.role.toLowerCase() !== "admin") {
    return res.status(403).json({ error: "Access denied. Admin privileges required." });
  }

  // User is admin, proceed to next middleware/controller
  next();
};

module.exports = { verifyAdmin };
