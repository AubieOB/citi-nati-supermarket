/**
 * Verification Code Utility
 * Generates 6-digit codes and manages their lifecycle
 */

const generateVerificationCode = () => {
  // Generate random 6-digit code
  return Math.floor(100000 + Math.random() * 900000).toString();
};

const isCodeExpired = (createdAt, expiryMinutes = 10) => {
  const now = new Date();
  const created = new Date(createdAt);
  const diffMinutes = (now - created) / (1000 * 60);
  return diffMinutes > expiryMinutes;
};

const isPasswordResetCodeExpired = (createdAt, expiryMinutes = 15) => {
  const now = new Date();
  const created = new Date(createdAt);
  const diffMinutes = (now - created) / (1000 * 60);
  return diffMinutes > expiryMinutes;
};

module.exports = {
  generateVerificationCode,
  isCodeExpired,
  isPasswordResetCodeExpired,
};
