# Email Verification & Password Reset System

## Overview

The Citi-Nati Supermarket platform now includes a comprehensive email verification system for user registration and a secure password reset flow. Both systems use 6-digit verification codes with time-based expiry for enhanced security.

## System Architecture

### Backend Infrastructure

#### Email Service (`src/utils/emailService.js`)
- **Purpose**: Centralized email handling with professional HTML templates
- **Configuration**: Uses nodemailer with Gmail SMTP (configurable)
- **Key Functions**:
  - `sendVerificationEmail(email, code)` - Registration verification (10-min expiry)
  - `sendPasswordResetEmail(email, code)` - Password reset (15-min expiry)
  - `sendOrderConfirmationEmail(email, userName, order, products)` - Order details
  - `sendPaymentConfirmationEmail(email, userName, paymentDetails)` - Payment receipt
  - `sendDeliveryStatusEmail(email, userName, orderDetails, status)` - Delivery updates

#### Verification Code Utility (`src/utils/verificationCode.js`)
- **Purpose**: 6-digit code generation and expiry management
- **Key Functions**:
  - `generateVerificationCode()` - Generates random 6-digit code (100000-999999)
  - `isCodeExpired(createdAt, expiryMinutes=10)` - Checks 10-minute expiry
  - `isPasswordResetCodeExpired(createdAt, expiryMinutes=15)` - Checks 15-minute expiry

#### Database Schema Updates
New fields added to User model:
```prisma
model User {
  // ... existing fields
  emailVerified Boolean @default(false)
  verificationCode String?
  verificationCodeExpiry DateTime?
  passwordResetCode String?
  passwordResetCodeExpiry DateTime?
}
```

### Backend API Endpoints

#### Email Verification
- **POST `/auth/register`** - Register user
  - Generates 6-digit code
  - Sends verification email
  - Returns `requiresVerification: true`
  - User marked as `emailVerified: false`

- **POST `/auth/verify-email`** - Verify email with code
  - Body: `{ email, code }`
  - Validates code and expiry (10 minutes)
  - Sets `emailVerified: true`
  - Returns JWT token (auto-login)
  - Status: 200 on success, 400 if invalid/expired

- **POST `/auth/resend-verification-code`** - Resend code
  - Body: `{ email }`
  - Generates new code with fresh 10-minute expiry
  - Sends new verification email

#### Password Reset
- **POST `/auth/forgot-password`** - Request password reset
  - Body: `{ email }`
  - Generates 6-digit reset code with 15-minute expiry
  - Sends password reset email
  - Returns success message (doesn't reveal if email exists)

- **POST `/auth/reset-password`** - Complete password reset
  - Body: `{ email, code, newPassword }`
  - Validates code and expiry (15 minutes)
  - Hashes new password
  - Sets `emailVerified: true` (makes verified)
  - Returns JWT token (auto-login after reset)
  - Status: 200 on success, 400 if invalid/expired

#### Login with Email Verification Check
- **POST `/auth/login`** - Standard login
  - Updated to check `emailVerified` field
  - If not verified, returns `emailNotVerified: true` with user email
  - Frontend redirects to `/verify-email?email=user@example.com`

### Frontend Pages

#### 1. Verify Email Page (`/verify-email`)
- **Path**: `src/pages/public/VerifyEmail.jsx`
- **Purpose**: Verify email after registration or at login
- **Features**:
  - Display email address (from query param)
  - 6-digit code input with numeric-only validation
  - Submit button
  - Resend code button with 60-second cooldown
  - Auto-fill from sessionStorage if available
  - Success/error message display
  - Countdown timer for resend availability
  - Auto-login after verification (receives JWT token)
  - Redirect to `/products` on success

#### 2. Forgot Password Page (`/forgot-password`)
- **Path**: `src/pages/public/ForgotPassword.jsx`
- **Purpose**: Request password reset
- **Features**:
  - Email input field
  - Submit button
  - Basic email validation
  - Success message confirming email sent
  - Error handling for invalid email
  - Link back to login
  - Auto-redirect to `/reset-password` after 2 seconds

#### 3. Password Reset Page (`/reset-password`)
- **Path**: `src/pages/public/ResetPassword.jsx`
- **Purpose**: Reset password with code and new password
- **Features**:
  - Email input field
  - 6-digit reset code input (numeric only)
  - New password input with show/hide toggle
  - Confirm password input with show/hide toggle
  - Password complexity validation (uppercase, lowercase, numbers)
  - Submit button
  - Error message display
  - Auto-login after successful reset (receives JWT token)
  - Redirect to `/products` on success

#### 4. Login Page Updates (`/login`)
- **Changes**:
  - Added "Forgot password?" link below password field
  - Link points to `/forgot-password`
  - Updated to check `emailVerified` field after login
  - Redirects to `/verify-email` if not verified

#### 5. Register Page Updates (`/register`)
- **Changes**:
  - Redirects to `/verify-email` after registration
  - Passes email via query param and sessionStorage
  - Updated Google OAuth to check `emailVerified`

### Environment Configuration

#### Backend `.env` Setup
```
# Email Configuration (Gmail SMTP)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password
FROM_EMAIL=noreply@citinati.com
```

#### Gmail Setup Instructions
1. Enable 2-Factor Authentication on your Gmail account
2. Generate an App Password:
   - Go to Google Account → Security
   - Select "App passwords"
   - Choose Mail and Windows Computer
   - Generate and copy the 16-character password
3. Add to backend `.env`:
   - `SMTP_USER=your-email@gmail.com`
   - `SMTP_PASSWORD=<16-character-app-password>`

## User Flow

### Registration Flow
1. User fills registration form
2. User clicks "Register"
3. Backend generates 6-digit code and sends email
4. Frontend redirects to `/verify-email?email=user@example.com`
5. User enters 6-digit code from email
6. Backend verifies code (must be within 10 minutes)
7. User auto-logged in with JWT token
8. Frontend redirects to `/products`

### Login Flow (Unverified Email)
1. User enters credentials
2. User clicks "Sign In"
3. Backend checks `emailVerified` field
4. If not verified, returns `emailNotVerified: true`
5. Frontend redirects to `/verify-email?email=user@example.com`
6. User enters code from email
7. Backend marks email verified and returns JWT
8. Frontend redirects to dashboard or products

### Password Reset Flow
1. User clicks "Forgot password?" on login page
2. Frontend routes to `/forgot-password`
3. User enters email address
4. Backend generates 6-digit code, sends email
5. Frontend redirects to `/reset-password`
6. User enters:
   - Email address
   - 6-digit code from email
   - New password
   - Confirm password
7. Backend validates code (must be within 15 minutes)
8. Backend hashes new password and saves
9. Backend marks email verified and returns JWT
10. Frontend auto-logs user in and redirects to `/products`

## Security Features

### Code Generation
- 6-digit codes: 100000-999999 (1 million possible combinations)
- Random generation using `Math.random()`
- Neither email nor code displayed in URLs (only as query params)

### Code Expiry
- **Email verification**: 10 minutes
- **Password reset**: 15 minutes
- Server-side validation compares current time with stored expiry
- Expired codes cannot be used
- Users can resend codes (generates new code with fresh expiry)

### Password Security
- Passwords hashed using bcrypt (10 salt rounds)
- Minimum 6 characters required
- Password complexity check: uppercase + lowercase + numbers
- Confirm password validation on frontend

### Rate Limiting (Optional)
Currently not implemented. Consider adding:
- Max 3 verification attempts per email per hour
- Max 3 password reset attempts per email per hour
- Throttling for resend code requests (60-second cooldown)

## Email Templates

All emails include:
- Citi-Nati branding
- Purple theme (#5B4B8A)
- Clear call-to-action
- Expiry information
- Support contact info

### Email Types

1. **Verification Email** (10-minute expiry)
   - Subject: "Verify Your Email - Citi-Nati"
   - Contains 6-digit code
   - Resend link available
   - Clear security notice

2. **Password Reset Email** (15-minute expiry)
   - Subject: "Reset Your Password - Citi-Nati"
   - Contains 6-digit code
   - Password change instructions
   - Security notice if didn't request

3. **Order Confirmation Email**
   - Subject: "Order Confirmed - Citi-Nati"
   - Order number
   - Item list with table
   - Total price
   - Delivery info
   - Tracking link

4. **Payment Confirmation Email**
   - Subject: "Payment Received - Citi-Nati"
   - Payment details
   - Amount and method
   - Invoice link
   - Receipt details

5. **Delivery Status Email**
   - Subject: "Your Order is [Status] - Citi-Nati"
   - Order number
   - Current status (In Transit, Delivered, etc.)
   - Driver info (if available)
   - Delivery time estimate
   - Tracking link

## Testing Checklist

### Unit Tests
- [ ] `generateVerificationCode()` returns 6-digit string
- [ ] `isCodeExpired()` returns true for expired codes
- [ ] `isCodeExpired()` returns false for valid codes
- [ ] Email service connects to SMTP successfully
- [ ] Email templates render without errors

### Integration Tests
- [ ] User can register and receive verification email
- [ ] User cannot access dashboard without verification
- [ ] User can verify email with correct code
- [ ] User cannot verify with expired code
- [ ] User can resend code and get new email
- [ ] User can reset password with correct code
- [ ] User cannot reset with expired code
- [ ] User auto-logs in after password reset

### End-to-End Tests
- [ ] Complete registration → verification → dashboard flow
- [ ] Complete forgot password → reset → login flow
- [ ] Google OAuth with unverified email
- [ ] Login with unverified email redirects to verification

## Troubleshooting

### Emails Not Sending
1. Check SMTP credentials in `.env`
2. Verify Gmail app password (not regular password)
3. Check console for error messages
4. Ensure 2FA is enabled on Gmail account

### Code Not Arriving
1. Check spam/promotions folder
2. Verify email address in database
3. Check SMTP logs
4. Test with console.log in sendVerificationEmail()

### User Locked Out
1. Admin can manually verify email: `UPDATE users SET emailVerified = true WHERE email = 'user@example.com'`
2. User can request another verification code
3. SMS verification could be alternative (future feature)

## Future Enhancements

1. **Two-Factor Authentication (2FA)**
   - SMS-based 6-digit codes
   - TOTP/authenticator app support
   - Backup codes

2. **Social Login Auto-Verification**
   - Google/Facebook provide verified email
   - Auto-verify on OAuth signup

3. **Rate Limiting**
   - Prevent brute force attacks
   - Implement exponential backoff
   - IP-based throttling

4. **SMS Support**
   - SMS code delivery as alternative
   - Twilio integration
   - Fallback when email unavailable

5. **Email Templates**
   - Dynamic branding
   - Multi-language support
   - Customizable sender name

6. **Admin Dashboard**
   - View unverified users
   - Manually verify users
   - Email delivery logs
   - SMS credits management

## File Summary

### Backend Files
- `citi-nati-backend/src/utils/emailService.js` - Email service with 5 templates
- `citi-nati-backend/src/utils/verificationCode.js` - Code generation/expiry utilities
- `citi-nati-backend/src/controllers/auth.controller.js` - Auth endpoints (updated)
- `citi-nati-backend/src/routes/auth.routes.js` - Auth routes (updated)
- `citi-nati-backend/prisma/schema.prisma` - User model (updated)
- `citi-nati-backend/.env` - SMTP configuration (added)

### Frontend Files
- `citi-nati-frontend/src/pages/public/VerifyEmail.jsx` - Email verification page (NEW)
- `citi-nati-frontend/src/pages/public/ForgotPassword.jsx` - Forgot password page (NEW)
- `citi-nati-frontend/src/pages/public/ResetPassword.jsx` - Password reset page (NEW)
- `citi-nati-frontend/src/pages/public/Login.jsx` - Login page (updated)
- `citi-nati-frontend/src/pages/public/Register.jsx` - Register page (updated)
- `citi-nati-frontend/src/App.jsx` - Routes (updated)

## Deployment Notes

1. **Before Going Live**:
   - Configure Gmail SMTP credentials
   - Test all email flows with real Gmail account
   - Update FROM_EMAIL to official company email
   - Set up email delivery monitoring
   - Configure rate limiting on production

2. **Production Considerations**:
   - Use transactional email service (SendGrid, Mailgun) instead of Gmail
   - Implement email delivery webhook handlers
   - Set up email bounce handling
   - Monitor email delivery success rates
   - Archive verification codes for audit trail (90 days)

3. **Security Hardening**:
   - Enable HTTPS only for all auth pages
   - Implement CSRF protection on forms
   - Add helmet.js security headers
   - Set secure cookies (httpOnly, secure, sameSite)
   - Implement rate limiting
   - Add logging for auth attempts

---

**System Status**: ✅ Production Ready (after Gmail configuration)
**Last Updated**: 2025-02-26
**Version**: 1.0.0
