/**
 * Driver verification middleware
 * Ensures user is authenticated and has driver role
 */

const verifyDriver = (req, res, next) => {
  // Check if user object exists (should be set by verifyTokenMiddleware)
  if (!req.user) {
    return res.status(401).json({ message: "Unauthorized. User not found." });
  }

  // Check if user has driver role (case-insensitive check, but route expects lowercase)
  if (req.user.role !== "driver") {
    return res.status(403).json({ message: "Access denied. Driver only." });
  }

  // User is driver, proceed to next middleware/controller
  next();
};

module.exports = { verifyDriver };
