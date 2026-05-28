const bcrypt = require('bcrypt');
const { PrismaClient } = require('@prisma/client');
const axios = require('axios');
const { notifyNewUserRegistration } = require('../utils/messageService');
const { sendVerificationEmail, sendPasswordResetEmail } = require('../utils/emailService');
const { generateVerificationCode } = require('../utils/verificationCode');
const { getEffectivePermissionsForUser } = require('../security/userPermissions.service');
const { validateStrongPassword } = require('../utils/passwordPolicy');
const logger = require('../utils/logger');
const { recordAuditLog } = require('../services/auditLog.service');
const {
  issueAuthSession,
  issueAccessTokenCookie,
  clearAuthCookies,
  revokeRefreshTokenFromRequest,
  revokeAllUserRefreshTokens,
  consumeRefreshToken,
} = require('../services/authSession.service');

const prisma = new PrismaClient();

const MAX_FAILED_LOGIN_ATTEMPTS = Math.max(3, parseInt(process.env.MAX_FAILED_LOGIN_ATTEMPTS || '5', 10) || 5);
const LOGIN_LOCKOUT_MINUTES = Math.max(1, parseInt(process.env.LOGIN_LOCKOUT_MINUTES || '5', 10) || 5);

const getEmailFailureResponse = (emailResult, defaultMessage) => {
  if (emailResult?.errorCode === 'EMAIL_PROVIDER_CREDITS_EXCEEDED') {
    return {
      status: 503,
      error: emailResult.userMessage || 'Email service quota exceeded. Please try again later.',
      code: emailResult.errorCode,
    };
  }

  if (emailResult?.errorCode === 'EMAIL_PROVIDER_UNAUTHORIZED') {
    return {
      status: 503,
      error: emailResult.userMessage || 'Email service is temporarily unavailable. Please try again later.',
      code: emailResult.errorCode,
    };
  }

  return {
    status: 500,
    error: emailResult?.userMessage || defaultMessage,
    code: emailResult?.errorCode || 'EMAIL_SEND_FAILED',
  };
};

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function isAccountLocked(user) {
  return Boolean(user?.lockedUntil && new Date(user.lockedUntil) > new Date());
}

async function registerFailedLoginAttempt(user, req, reason = 'INVALID_CREDENTIALS') {
  if (!user?.id) {
    return null;
  }

  const nextAttempts = (user.failedLoginAttempts || 0) + 1;
  const shouldLock = nextAttempts >= MAX_FAILED_LOGIN_ATTEMPTS;
  const lockedUntil = shouldLock
    ? new Date(Date.now() + LOGIN_LOCKOUT_MINUTES * 60 * 1000)
    : null;

  const updatedUser = await prisma.user.update({
    where: { id: user.id },
    data: {
      failedLoginAttempts: nextAttempts,
      lockedUntil,
    },
  });

  await recordAuditLog({
    req,
    actorUserId: user.id,
    action: shouldLock ? 'AUTH_LOGIN_LOCKED' : 'AUTH_LOGIN_FAILED',
    resourceType: 'USER',
    resourceId: user.id,
    status: 'FAILURE',
    metadata: {
      reason,
      failedLoginAttempts: nextAttempts,
      lockedUntil,
    },
  });

  return updatedUser;
}

async function clearFailedLoginState(userId) {
  if (!userId) return;

  await prisma.user.update({
    where: { id: userId },
    data: {
      failedLoginAttempts: 0,
      lockedUntil: null,
      lastLoginAt: new Date(),
    },
  });
}

const buildAuthUserPayload = async (user) => {
  const effectivePermissions = await getEffectivePermissionsForUser(user.id, user.role);

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    emailVerified: user.emailVerified,
    permissions: effectivePermissions,
  };
};

/**
 * LOGIN ENDPOINT
 * Allows users to login regardless of email verification status
 */
const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const normalizedEmail = normalizeEmail(email);

    if (!normalizedEmail || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });

    if (!user) {
      await recordAuditLog({
        req,
        action: 'AUTH_LOGIN_FAILED',
        resourceType: 'USER',
        resourceId: normalizedEmail,
        status: 'FAILURE',
        metadata: { reason: 'UNKNOWN_EMAIL' },
      });
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    if (!user.isActive) {
      await recordAuditLog({
        req,
        actorUserId: user.id,
        action: 'AUTH_LOGIN_BLOCKED',
        resourceType: 'USER',
        resourceId: user.id,
        status: 'FAILURE',
        metadata: { reason: 'INACTIVE_ACCOUNT' },
      });
      return res.status(403).json({ error: 'Account is disabled' });
    }

    if (isAccountLocked(user)) {
      const lockedUntilTime = new Date(user.lockedUntil).getTime();
      const remainingSeconds = Math.max(1, Math.ceil((lockedUntilTime - Date.now()) / 1000));
      const remainingMinutes = Math.max(1, Math.ceil(remainingSeconds / 60));
      const errorMessage = `Too many failed login attempts. Account locked. Please try again after ${remainingMinutes} minute${remainingMinutes === 1 ? '' : 's'}.`;
      
      await recordAuditLog({
        req,
        actorUserId: user.id,
        action: 'AUTH_LOGIN_BLOCKED',
        resourceType: 'USER',
        resourceId: user.id,
        status: 'FAILURE',
        metadata: { reason: 'ACCOUNT_LOCKED', lockedUntil: user.lockedUntil },
      });
      
      res.set('Retry-After', String(remainingSeconds));
      return res.status(429).json({ 
        error: errorMessage,
        retryAfterSeconds: remainingSeconds,
        retryAfterMinutes: remainingMinutes,
      });
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);

    if (!isPasswordValid) {
      const updatedUser = await registerFailedLoginAttempt(user, req);
      if (updatedUser?.lockedUntil && new Date(updatedUser.lockedUntil) > new Date()) {
        const lockedUntilTime = new Date(updatedUser.lockedUntil).getTime();
        const remainingSeconds = Math.max(1, Math.ceil((lockedUntilTime - Date.now()) / 1000));
        const remainingMinutes = Math.max(1, Math.ceil(remainingSeconds / 60));
        const errorMessage = `Too many failed login attempts. Account locked. Please try again after ${remainingMinutes} minute${remainingMinutes === 1 ? '' : 's'}.`;
        
        res.set('Retry-After', String(remainingSeconds));
        return res.status(429).json({ 
          error: errorMessage,
          retryAfterSeconds: remainingSeconds,
          retryAfterMinutes: remainingMinutes,
        });
      }
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    await clearFailedLoginState(user.id);

    const { accessToken } = await issueAuthSession(res, user, req);

    const authUser = await buildAuthUserPayload(user);

    await recordAuditLog({
      req,
      actorUserId: user.id,
      action: 'AUTH_LOGIN_SUCCESS',
      resourceType: 'USER',
      resourceId: user.id,
      status: 'SUCCESS',
      metadata: { role: user.role },
    });

    return res.json({
      token: accessToken,
      user: authUser,
    });
  } catch (err) {
    logger.errorLog('[AUTH] Login error', err);
    return res.status(500).json({ error: 'Something went wrong' });
  }
};

/**
 * REGISTRATION ENDPOINT
 * Only stores user in pending_users until email is verified
 * Does NOT create user in users table yet
 */
const register = async (req, res) => {
  try {
    const { name, email, password } = req.body;
    const normalizedEmail = normalizeEmail(email);

    // Validate fields
    if (!name || !normalizedEmail || !password) {
      return res.status(400).json({
        error: 'Name, email, and password are required',
      });
    }

    const passwordValidation = validateStrongPassword(password);
    if (!passwordValidation.valid) {
      return res.status(400).json({ error: passwordValidation.errors[0] });
    }

    // Check if email already exists in users table
    const existingUser = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existingUser) {
      return res.status(400).json({ error: 'Email is already registered' });
    }

    // Delete any old pending registration for this email (allow fresh registration)
    await prisma.pendingUser.deleteMany({ where: { email: normalizedEmail } });

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Generate verification code
    const verificationCode = generateVerificationCode();
    const verificationCodeExpiry = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    // FIRST: Send email via SendGrid
    const emailResult = await sendVerificationEmail(normalizedEmail, verificationCode);

    if (!emailResult.success) {
      logger.errorLog('[AUTH] Failed to send verification email', { email: normalizedEmail, code: emailResult?.errorCode });
      const emailFailure = getEmailFailureResponse(
        emailResult,
        'Failed to send verification email. Please try again.',
      );
      return res.status(emailFailure.status).json({
        error: emailFailure.error,
        code: emailFailure.code,
      });
    }

    // SECOND: Only store in pending_users AFTER successful email send
    const newPendingUser = await prisma.pendingUser.create({
      data: {
        name,
        email: normalizedEmail,
        passwordHash,
        verificationCode,
        verificationCodeExpiry,
      },
    });

    return res.status(201).json({
      message: 'Registration successful. Please check your email for the verification code.',
      user: {
        email: normalizedEmail,
      },
      requiresVerification: true,
    });
  } catch (err) {
    logger.errorLog('[AUTH] Registration error', err);
    return res.status(500).json({
      error: 'Something went wrong',
    });
  }
};

/**
 * VERIFY EMAIL ENDPOINT
 * Moves user from pending_users to users table
 */
const verifyEmail = async (req, res) => {
  try {
    const { email, code } = req.body;
    const normalizedEmail = normalizeEmail(email);

    if (!normalizedEmail || !code) {
      return res.status(400).json({
        error: 'Email and verification code are required',
      });
    }

    // Find in pending_users
    const pendingUser = await prisma.pendingUser.findUnique({ where: { email: normalizedEmail } });

    if (!pendingUser) {
      return res.status(404).json({
        error: 'No pending registration found for this email',
      });
    }

    // Verify code matches
    if (pendingUser.verificationCode !== code) {
      return res.status(400).json({ error: 'Invalid verification code' });
    }

    // Check if code is expired
    const now = new Date();
    if (now > pendingUser.verificationCodeExpiry) {
      return res.status(400).json({
        error: 'Verification code has expired. Please request a new one.',
      });
    }

    // Move user from pending_users to users table
    const newUser = await prisma.user.create({
      data: {
        name: pendingUser.name,
        email: pendingUser.email,
        passwordHash: pendingUser.passwordHash,
        emailVerified: true,
        role: 'user',
      },
    });

    // Delete from pending_users
    await prisma.pendingUser.delete({ where: { email: normalizedEmail } });

    // Notify admin
    await notifyNewUserRegistration(newUser);

    // Email verified successfully - user must log in manually
    return res.json({
      message: 'Email verified successfully! Please log in with your credentials.',
      email: newUser.email,
      requiresLogin: true,
    });
  } catch (err) {
    logger.errorLog('[AUTH] Email verification error', err);
    return res.status(500).json({ error: 'Something went wrong' });
  }
};

/**
 * RESEND VERIFICATION CODE
 * For pending users who need a new code
 */
const resendVerificationCode = async (req, res) => {
  try {
    const { email } = req.body;
    const normalizedEmail = normalizeEmail(email);

    if (!normalizedEmail) {
      return res.status(400).json({ error: 'Email is required' });
    }

    // Check in pending_users
    const pendingUser = await prisma.pendingUser.findUnique({ where: { email: normalizedEmail } });

    if (!pendingUser) {
      // Don't reveal if email exists
      return res.json({
        message: 'If that email has a pending registration, a new code will be sent.',
      });
    }

    // Generate new code
    const newCode = generateVerificationCode();
    const codeExpiry = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    // Send email
    const emailResult = await sendVerificationEmail(normalizedEmail, newCode);

    if (!emailResult.success) {
      logger.errorLog('[AUTH] Failed to resend verification email', { email: normalizedEmail, code: emailResult?.errorCode });
      const emailFailure = getEmailFailureResponse(
        emailResult,
        'Failed to send verification email. Please try again.',
      );
      return res.status(emailFailure.status).json({
        error: emailFailure.error,
        code: emailFailure.code,
      });
    }

    // Update pending user with new code
    await prisma.pendingUser.update({
      where: { email: normalizedEmail },
      data: {
        verificationCode: newCode,
        verificationCodeExpiry: codeExpiry,
      },
    });

    return res.json({
      message: 'A new verification code has been sent to your email',
    });
  } catch (err) {
    logger.errorLog('[AUTH] Resend verification code error', err);
    return res.status(500).json({ error: 'Something went wrong' });
  }
};

/**
 * FORGOT PASSWORD ENDPOINT
 * Creates password reset record with temporary code
 */
const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    const normalizedEmail = normalizeEmail(email);

    if (!normalizedEmail) {
      return res.status(400).json({ error: 'Email is required' });
    }

    // Check if user exists
    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });

    if (!user) {
      // Don't reveal if email exists (security best practice)
      return res.json({
        message: 'If that email exists, a password reset code has been sent',
      });
    }

    // Delete any existing reset records for this email
    await prisma.passwordReset.deleteMany({ where: { email: normalizedEmail } });

    // Generate reset code
    const resetCode = generateVerificationCode();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    // Create password reset record
    const resetRecord = await prisma.passwordReset.create({
      data: {
        email: normalizedEmail,
        resetCode,
        expiresAt,
      },
    });

    // Send email
    const emailResult = await sendPasswordResetEmail(normalizedEmail, resetCode);

    if (!emailResult.success) {
      // Delete the reset record if email fails
      await prisma.passwordReset.delete({ where: { id: resetRecord.id } });
      logger.errorLog('[AUTH] Failed to send password reset email', { email: normalizedEmail, code: emailResult?.errorCode });
      const emailFailure = getEmailFailureResponse(
        emailResult,
        'Failed to send reset email. Please try again.',
      );
      return res.status(emailFailure.status).json({
        error: emailFailure.error,
        code: emailFailure.code,
      });
    }

    return res.json({
      message: 'Password reset code sent to your email',
    });
  } catch (err) {
    logger.errorLog('[AUTH] Forgot password error', err);
    return res.status(500).json({ error: 'Something went wrong' });
  }
};

/**
 * RESET PASSWORD ENDPOINT
 * Validates code and updates password
 */
const resetPassword = async (req, res) => {
  try {
    const { email, code, newPassword } = req.body;
    const normalizedEmail = normalizeEmail(email);

    if (!normalizedEmail || !code || !newPassword) {
      return res.status(400).json({
        error: 'Email, reset code, and new password are required',
      });
    }

    const passwordValidation = validateStrongPassword(newPassword);
    if (!passwordValidation.valid) {
      return res.status(400).json({ error: passwordValidation.errors[0] });
    }

    // Find password reset record
    const resetRecord = await prisma.passwordReset.findUnique({ where: { email: normalizedEmail } });

    if (!resetRecord) {
      return res.status(404).json({
        error: 'No password reset request found for this email',
      });
    }

    // Verify code matches
    if (resetRecord.resetCode !== code) {
      return res.status(400).json({ error: 'Invalid reset code' });
    }

    // Check if code is expired
    const now = new Date();
    if (now > resetRecord.expiresAt) {
      // Delete expired record
      await prisma.passwordReset.delete({ where: { id: resetRecord.id } });
      return res.status(400).json({
        error: 'Reset code has expired. Please request a new one.',
      });
    }

    // Find user
    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if new password is the same as old password
    const isSameAsOld = await bcrypt.compare(newPassword, user.passwordHash);
    if (isSameAsOld) {
      return res.status(400).json({
        error: 'New password must be different from your current password',
      });
    }

    // Hash new password
    const passwordHash = await bcrypt.hash(newPassword, 10);

    // Update password
    const updatedUser = await prisma.user.update({
      where: { email: normalizedEmail },
      data: {
        passwordHash,
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
    });

    // Delete reset record
    await prisma.passwordReset.delete({ where: { id: resetRecord.id } });

    const { accessToken } = await issueAuthSession(res, updatedUser, req);

    const authUser = await buildAuthUserPayload(updatedUser);

    await recordAuditLog({
      req,
      actorUserId: updatedUser.id,
      action: 'AUTH_PASSWORD_RESET',
      resourceType: 'USER',
      resourceId: updatedUser.id,
      status: 'SUCCESS',
    });

    return res.json({
      message: 'Password reset successful. You are now logged in.',
      token: accessToken,
      user: authUser,
    });
  } catch (err) {
    logger.errorLog('[AUTH] Reset password error', err);
    return res.status(500).json({ error: 'Something went wrong' });
  }
};

/**
 * GOOGLE AUTH ENDPOINT
 * OAuth login with Google
 */
const googleAuth = async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ error: 'Token is required' });
    }

    // Fetch user info from Google
    const response = await axios.get('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const { email, name } = response.data;

    // Check if user already exists in users table
    let user = await prisma.user.findUnique({ where: { email } });

    if (user) {
      await clearFailedLoginState(user.id);
      const { accessToken } = await issueAuthSession(res, user, req);

      const authUser = await buildAuthUserPayload(user);

      await recordAuditLog({
        req,
        actorUserId: user.id,
        action: 'AUTH_GOOGLE_LOGIN_SUCCESS',
        resourceType: 'USER',
        resourceId: user.id,
        status: 'SUCCESS',
      });

      return res.json({
        token: accessToken,
        user: authUser,
        isNewUser: false,
      });
    }

    // Create a random password for Google users (they won't use it)
    const randomPassword = Math.random().toString(36).slice(-16);
    const passwordHash = await bcrypt.hash(randomPassword, 10);

    // Create new user directly (Google email is already verified)
    const newUser = await prisma.user.create({
      data: {
        name: name || email.split('@')[0],
        email,
        passwordHash,
        role: 'user',
        emailVerified: true, // Google emails are pre-verified
        isActive: true, // ✅ Ensure Google users are active and visible in admin dashboard
      },
    });

    // Notify admin
    await notifyNewUserRegistration(newUser);

    const { accessToken } = await issueAuthSession(res, newUser, req);

    const authUser = await buildAuthUserPayload(newUser);

    await recordAuditLog({
      req,
      actorUserId: newUser.id,
      action: 'AUTH_GOOGLE_REGISTER',
      resourceType: 'USER',
      resourceId: newUser.id,
      status: 'SUCCESS',
    });

    return res.status(201).json({
      message: 'User registered and logged in successfully',
      token: accessToken,
      user: authUser,
      isNewUser: true,
    });
  } catch (err) {
    logger.errorLog('[AUTH] Google auth error', err.response?.data || err.message);
    return res.status(401).json({
      error: 'Invalid token or authentication failed',
    });
  }
};

/**
 * LOGOUT ENDPOINT
 * Clears cookie-based auth session
 */
const logout = async (req, res) => {
  try {
    await revokeRefreshTokenFromRequest(req);
    clearAuthCookies(res);
    return res.json({ success: true, message: 'Logged out successfully' });
  } catch (err) {
    logger.errorLog('[AUTH] Logout error', err);
    return res.status(500).json({ error: 'Something went wrong' });
  }
};

const refreshSession = async (req, res) => {
  try {
    const user = await consumeRefreshToken(req);

    if (!user) {
      clearAuthCookies(res);
      return res.status(401).json({ error: 'Session expired', code: 'SESSION_EXPIRED' });
    }

    const { accessToken } = await issueAuthSession(res, user, req);
    const authUser = await buildAuthUserPayload(user);

    await recordAuditLog({
      req,
      actorUserId: user.id,
      action: 'AUTH_REFRESH_SUCCESS',
      resourceType: 'USER',
      resourceId: user.id,
      status: 'SUCCESS',
    });

    return res.json({ token: accessToken, user: authUser });
  } catch (err) {
    logger.errorLog('[AUTH] Refresh session error', err);
    clearAuthCookies(res);
    return res.status(500).json({ error: 'Something went wrong' });
  }
};

const getSession = async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        emailVerified: true,
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const authUser = await buildAuthUserPayload(user);
    const accessToken = issueAccessTokenCookie(res, user);
    return res.json({ user: authUser, token: accessToken });
  } catch (err) {
    logger.errorLog('[AUTH] Session fetch error', err);
    return res.status(500).json({ error: 'Something went wrong' });
  }
};

module.exports = {
  login,
  register,
  googleAuth,
  verifyEmail,
  resendVerificationCode,
  forgotPassword,
  resetPassword,
  logout,
  refreshSession,
  getSession,
};
