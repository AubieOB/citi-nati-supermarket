const bcrypt = require('bcrypt');
const { PrismaClient } = require('@prisma/client');
const axios = require('axios');
const { generateToken } = require('../utils/jwt');
const { notifyNewUserRegistration } = require('../utils/messageService');
const { sendVerificationEmail, sendPasswordResetEmail } = require('../utils/emailService');
const { generateVerificationCode } = require('../utils/verificationCode');

const prisma = new PrismaClient();

/**
 * LOGIN ENDPOINT
 * Allows users to login regardless of email verification status
 */
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    console.log(`[AUTH] Login attempt for: ${email}`);

    // Find user in users table only (not pending)
    const user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);

    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    console.log(`[AUTH] ✅ Login successful for: ${email}`);

    // Generate JWT token
    const token = generateToken(user.id, user.role, user.email);

    return res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        emailVerified: user.emailVerified,
      },
    });
  } catch (err) {
    console.error('[AUTH] Login error:', err);
    return res.status(500).json({ error: 'Internal server error' });
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

    // Validate fields
    if (!name || !email || !password) {
      return res.status(400).json({
        error: 'Name, email, and password are required',
      });
    }

    console.log(`[AUTH] Registration attempt for: ${email}`);

    // Check if email already exists in users table
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ error: 'Email is already registered' });
    }

    // Delete any old pending registration for this email (allow fresh registration)
    await prisma.pendingUser.deleteMany({ where: { email } });

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Generate verification code
    const verificationCode = generateVerificationCode();
    const verificationCodeExpiry = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    console.log(`[AUTH] Generated verification code for: ${email}`);

    // FIRST: Send email via SendGrid
    const emailResult = await sendVerificationEmail(email, verificationCode);

    if (!emailResult.success) {
      console.error(`[AUTH] ❌ Failed to send verification email to ${email}`);
      return res.status(500).json({
        error: 'Failed to send verification email. Please try again.',
      });
    }

    console.log(`[AUTH] ✅ Verification email sent to: ${email}`);

    // SECOND: Only store in pending_users AFTER successful email send
    const newPendingUser = await prisma.pendingUser.create({
      data: {
        name,
        email,
        passwordHash,
        verificationCode,
        verificationCodeExpiry,
      },
    });

    console.log(`[AUTH] ✅ User stored in pending_users: ${email}`);

    return res.status(201).json({
      message: 'Registration successful. Please check your email for the verification code.',
      user: {
        email: email,
      },
      requiresVerification: true,
    });
  } catch (err) {
    console.error('[AUTH] Registration error:', err);
    return res.status(500).json({
      error: 'Internal server error during registration',
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

    if (!email || !code) {
      return res.status(400).json({
        error: 'Email and verification code are required',
      });
    }

    console.log(`[AUTH] Email verification attempt for: ${email}`);

    // Find in pending_users
    const pendingUser = await prisma.pendingUser.findUnique({ where: { email } });

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

    console.log(`[AUTH] ✓ Verification code valid for: ${email}`);

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

    console.log(`[AUTH] ✅ User moved to users table: ${email}`);

    // Delete from pending_users
    await prisma.pendingUser.delete({ where: { email } });

    console.log(`[AUTH] ✅ Removed from pending_users: ${email}`);

    // Notify admin
    await notifyNewUserRegistration(newUser);

    // Email verified successfully - user must log in manually
    return res.json({
      message: 'Email verified successfully! Please log in with your credentials.',
      email: newUser.email,
      requiresLogin: true,
    });
  } catch (err) {
    console.error('[AUTH] Email verification error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * RESEND VERIFICATION CODE
 * For pending users who need a new code
 */
const resendVerificationCode = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    console.log(`[AUTH] Resend verification code request for: ${email}`);

    // Check in pending_users
    const pendingUser = await prisma.pendingUser.findUnique({ where: { email } });

    if (!pendingUser) {
      // Don't reveal if email exists
      return res.json({
        message: 'If that email has a pending registration, a new code will be sent.',
      });
    }

    // Generate new code
    const newCode = generateVerificationCode();
    const codeExpiry = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    console.log(`[AUTH] Generated new verification code for: ${email}`);

    // Send email
    const emailResult = await sendVerificationEmail(email, newCode);

    if (!emailResult.success) {
      console.error(`[AUTH] ❌ Failed to resend verification email to ${email}`);
      return res.status(500).json({
        error: 'Failed to send verification email. Please try again.',
      });
    }

    console.log(`[AUTH] ✅ New verification email sent to: ${email}`);

    // Update pending user with new code
    await prisma.pendingUser.update({
      where: { email },
      data: {
        verificationCode: newCode,
        verificationCodeExpiry: codeExpiry,
      },
    });

    return res.json({
      message: 'A new verification code has been sent to your email',
    });
  } catch (err) {
    console.error('[AUTH] Resend verification code error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * FORGOT PASSWORD ENDPOINT
 * Creates password reset record with temporary code
 */
const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    console.log(`[AUTH] Forgot password request for: ${email}`);

    // Check if user exists
    const user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      // Don't reveal if email exists (security best practice)
      return res.json({
        message: 'If that email exists, a password reset code has been sent',
      });
    }

    // Delete any existing reset records for this email
    await prisma.passwordReset.deleteMany({ where: { email } });

    // Generate reset code
    const resetCode = generateVerificationCode();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    console.log(`[AUTH] Generated password reset code for: ${email}`);

    // Create password reset record
    const resetRecord = await prisma.passwordReset.create({
      data: {
        email,
        resetCode,
        expiresAt,
      },
    });

    console.log(`[AUTH] Password reset record created for: ${email}`);

    // Send email
    const emailResult = await sendPasswordResetEmail(email, resetCode);

    if (!emailResult.success) {
      // Delete the reset record if email fails
      await prisma.passwordReset.delete({ where: { id: resetRecord.id } });
      console.error(`[AUTH] ❌ Failed to send password reset email to ${email}`);
      return res.status(500).json({
        error: 'Failed to send reset email. Please try again.',
      });
    }

    console.log(`[AUTH] ✅ Password reset email sent to: ${email}`);

    return res.json({
      message: 'Password reset code sent to your email',
    });
  } catch (err) {
    console.error('[AUTH] Forgot password error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * RESET PASSWORD ENDPOINT
 * Validates code and updates password
 */
const resetPassword = async (req, res) => {
  try {
    const { email, code, newPassword } = req.body;

    if (!email || !code || !newPassword) {
      return res.status(400).json({
        error: 'Email, reset code, and new password are required',
      });
    }

    console.log(`[AUTH] Password reset attempt for: ${email}`);

    // Find password reset record
    const resetRecord = await prisma.passwordReset.findUnique({ where: { email } });

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

    console.log(`[AUTH] ✓ Reset code valid for: ${email}`);

    // Find user
    const user = await prisma.user.findUnique({ where: { email } });
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
      where: { email },
      data: { passwordHash },
    });

    console.log(`[AUTH] ✅ Password reset successful for: ${email}`);

    // Delete reset record
    await prisma.passwordReset.delete({ where: { id: resetRecord.id } });

    // Generate JWT token for automatic login
    const token = generateToken(updatedUser.id, updatedUser.role, updatedUser.email);

    return res.json({
      message: 'Password reset successful. You are now logged in.',
      token,
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        name: updatedUser.name,
        role: updatedUser.role,
        emailVerified: updatedUser.emailVerified,
      },
    });
  } catch (err) {
    console.error('[AUTH] Reset password error:', err);
    return res.status(500).json({ error: 'Internal server error' });
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

    console.log('[AUTH] Google OAuth authentication attempt');

    // Fetch user info from Google
    const response = await axios.get('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const { email, name } = response.data;

    console.log(`[AUTH] Google info retrieved for: ${email}`);

    // Check if user already exists in users table
    let user = await prisma.user.findUnique({ where: { email } });

    if (user) {
      // User exists - log them in
      console.log(`[AUTH] ✅ Google user found, logging in: ${email}`);

      const jwtToken = generateToken(user.id, user.role, user.email);

      return res.json({
        token: jwtToken,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          emailVerified: user.emailVerified,
        },
        isNewUser: false,
      });
    }

    // User doesn't exist - create new account
    console.log(`[AUTH] Google user not found, creating new account: ${email}`);

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
      },
    });

    console.log(`[AUTH] ✅ New Google user created: ${email}`);

    // Notify admin
    await notifyNewUserRegistration(newUser);

    const jwtToken = generateToken(newUser.id, newUser.role, newUser.email);

    return res.status(201).json({
      message: 'User registered and logged in successfully',
      token: jwtToken,
      user: {
        id: newUser.id,
        name: newUser.name,
        email: newUser.email,
        role: newUser.role,
        emailVerified: newUser.emailVerified,
      },
      isNewUser: true,
    });
  } catch (err) {
    console.error('[AUTH] Google auth error:', err.response?.data || err.message);
    return res.status(401).json({
      error: 'Invalid token or authentication failed',
    });
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
};
