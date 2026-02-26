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
    return res.status(403).json({ message: "Access denied. Admin only." });
  }

  // User is admin, proceed to next middleware/controller
  next();
};

module.exports = { verifyAdmin };
