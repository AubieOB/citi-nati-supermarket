const express = require('express');
const { login, register, googleAuth, verifyEmail, resendVerificationCode, forgotPassword, resetPassword, logout, getSession } = require('../controllers/auth.controller');
const { verifyTokenMiddleware } = require('../middleware/auth.middleware');

const router = express.Router();

// Email/Password Authentication
router.post('/login', login);
router.post('/logout', logout);
router.get('/session', verifyTokenMiddleware, getSession);
router.post('/register', register);

// Email Verification
router.post('/verify-email', verifyEmail);
router.post('/resend-verification-code', resendVerificationCode);

// Password Reset
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);

// Google OAuth
router.post('/google', googleAuth);

module.exports = router;
