const express = require('express');
const { login, register, googleAuth, verifyEmail, resendVerificationCode, forgotPassword, resetPassword, logout, refreshSession, getSession } = require('../controllers/auth.controller');
const { verifyTokenMiddleware } = require('../middleware/auth.middleware');
const { authRateLimiter } = require('../middleware/rateLimit.middleware');

const router = express.Router();

// Email/Password Authentication
router.post('/login', authRateLimiter, login);
router.post('/logout', logout);
router.post('/refresh', authRateLimiter, refreshSession);
router.get('/session', verifyTokenMiddleware, getSession);
router.post('/register', authRateLimiter, register);

// Email Verification
router.post('/verify-email', authRateLimiter, verifyEmail);
router.post('/resend-verification-code', authRateLimiter, resendVerificationCode);

// Password Reset
router.post('/forgot-password', authRateLimiter, forgotPassword);
router.post('/reset-password', authRateLimiter, resetPassword);

// Google OAuth
router.post('/google', authRateLimiter, googleAuth);

module.exports = router;
