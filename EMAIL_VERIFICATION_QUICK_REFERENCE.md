# Email Verification System - Quick Reference Guide

## API Endpoints

### Registration
```http
POST /auth/register
Content-Type: application/json

{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "SecurePass123"
}

Response (201):
{
  "message": "Registration successful. Please check your email for verification code.",
  "user": {
    "id": "uuid",
    "name": "John Doe",
    "email": "john@example.com",
    "role": "user",
    "emailVerified": false
  },
  "requiresVerification": true
}
```

### Verify Email
```http
POST /auth/verify-email
Content-Type: application/json

{
  "email": "john@example.com",
  "code": "123456"
}

Response (200):
{
  "message": "Email verified successfully",
  "token": "eyJhbGc...",
  "user": {
    "id": "uuid",
    "email": "john@example.com",
    "name": "John Doe",
    "role": "user",
    "emailVerified": true
  }
}
```

### Resend Verification Code
```http
POST /auth/resend-verification-code
Content-Type: application/json

{
  "email": "john@example.com"
}

Response (200):
{
  "message": "Verification code resent to email"
}
```

### Forgot Password
```http
POST /auth/forgot-password
Content-Type: application/json

{
  "email": "john@example.com"
}

Response (200):
{
  "message": "If email exists, a reset code has been sent"
}
```

### Reset Password
```http
POST /auth/reset-password
Content-Type: application/json

{
  "email": "john@example.com",
  "code": "654321",
  "newPassword": "NewSecurePass456"
}

Response (200):
{
  "message": "Password reset successful",
  "token": "eyJhbGc...",
  "user": {
    "id": "uuid",
    "email": "john@example.com",
    "name": "John Doe",
    "role": "user",
    "emailVerified": true
  }
}
```

## Frontend Component Props & States

### VerifyEmail Component
```jsx
// States
const [email, setEmail] = useState('');          // From URL param or session
const [code, setCode] = useState('');            // 6-digit code
const [error, setError] = useState('');          // Error messages
const [loading, setLoading] = useState(false);   // Loading state
const [resending, setResending] = useState(false); // Resend button loading
const [canResend, setCanResend] = useState(true); // Resend button enabled
const [countdown, setCountdown] = useState(0);   // 60-second countdown

// Key Props: None (uses URL params and session storage)

// Key Events
handleVerify()      // POST /auth/verify-email
handleResend()      // POST /auth/resend-verification-code
// Countdown auto-triggers after resend
```

### ForgotPassword Component
```jsx
// States
const [email, setEmail] = useState('');      // Email input
const [error, setError] = useState('');      // Error messages
const [success, setSuccess] = useState('');  // Success message
const [loading, setLoading] = useState(false); // Loading state

// Key Props: None

// Key Events
handleSubmit()  // POST /auth/forgot-password
// Auto-redirects to /reset-password after success
```

### ResetPassword Component
```jsx
// States
const [email, setEmail] = useState('');               // Email input
const [code, setCode] = useState('');                 // 6-digit code
const [newPassword, setNewPassword] = useState('');   // New password
const [confirmPassword, setConfirmPassword] = useState(''); // Confirm
const [showPassword, setShowPassword] = useState(false);   // Toggle visibility
const [showConfirm, setShowConfirm] = useState(false);     // Toggle visibility
const [error, setError] = useState('');               // Error messages
const [loading, setLoading] = useState(false);        // Loading state

// Key Props: None

// Key Events
handleResetPassword()  // POST /auth/reset-password
// Auto-logs user in and redirects to /products
```

## Database Fields (User Model)

```prisma
model User {
  // Existing fields...
  id              String    @id @default(cuid())
  email           String    @unique
  name            String
  passwordHash    String
  role            String    @default("user")
  
  // Email Verification Fields (NEW)
  emailVerified        Boolean   @default(false)
  verificationCode     String?
  verificationCodeExpiry DateTime?
  
  // Password Reset Fields (NEW)
  passwordResetCode     String?
  passwordResetCodeExpiry DateTime?
  
  // ... other fields
}
```

## Error Codes & Messages

| Code | Message | Cause | Solution |
|------|---------|-------|----------|
| 400 | Email and password are required | Missing fields | Check form submission |
| 400 | User already exists | Email duplicate | Use different email |
| 400 | Invalid verification code | Wrong code | Check email for correct code |
| 400 | Verification code has expired | >10 minutes | Click "Resend Code" button |
| 400 | Passwords do not match | Mismatch | Ensure passwords match |
| 401 | Invalid email or password | Login failed | Check credentials |
| 404 | User not found | Email doesn't exist | Check email spelling |
| 500 | Internal server error | Server error | Retry or contact support |

## Code Generation

```javascript
// Frontend: 6-digit code input
const handleCodeChange = (e) => {
  // Only accepts numbers, max 6 digits
  setCode(e.target.value.replace(/\D/g, '').slice(0, 6));
};
```

```javascript
// Backend: Generate random 6-digit code
const generateVerificationCode = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
  // Returns: "123456", "654321", etc.
};
```

## Time Validation

```javascript
// Backend: Check if code is expired
const isCodeExpired = (expiryTime, expiryMinutes = 10) => {
  const now = new Date();
  const minutesPassed = (now - expiryTime) / (1000 * 60);
  return minutesPassed > expiryMinutes;
};

// Code expires after:
// - 10 minutes: Verification code
// - 15 minutes: Password reset code

// Frontend: Resend cooldown
// - 60 seconds between resend attempts
```

## Session Storage Usage

```javascript
// Store email after registration
sessionStorage.setItem('registrationEmail', response.data.user.email);

// Retrieve on verify page
const email = new URLSearchParams(window.location.search).get('email') || 
             sessionStorage.getItem('registrationEmail');

// Clear after verification
sessionStorage.removeItem('registrationEmail');
```

## Email Template Variables

### Verification Email
```
To: {email}
Subject: Verify Your Email Address

Body includes:
- User name (from profile)
- Verification code: {code}
- Expiry: 10 minutes
- Verify button link
- Citi-Nati branding
```

### Password Reset Email
```
To: {email}
Subject: Reset Your Password

Body includes:
- Password reset code: {code}
- Expiry: 15 minutes
- Reset password link
- Security note
- Citi-Nati branding
```

## Frontend Integration Checklist

- [x] Import routes in App.jsx
- [x] Create VerifyEmail.jsx page
- [x] Create ForgotPassword.jsx page
- [x] Create ResetPassword.jsx page
- [x] Update Login.jsx with forgot password link
- [x] Update Login.jsx with emailVerified check
- [x] Update Register.jsx to redirect to verify page
- [x] Update Register.jsx Google OAuth handler
- [x] Add session storage for email persistence
- [x] Add error message styling with icons
- [x] Add success message styling with icons
- [x] Add password show/hide toggles
- [x] Add countdown timer for resend button

## Backend Integration Checklist

- [x] Create emailService.js with 5 email templates
- [x] Create verificationCode.js utility
- [x] Update auth.controller.js with 4 new endpoints
- [x] Update auth.controller.js responses with emailVerified
- [x] Update auth.routes.js with 4 new routes
- [x] Run Prisma migration for schema updates
- [x] Add SMTP configuration to .env
- [x] Test all endpoints with Postman/API client

## Testing Steps

### Register Flow
1. Go to `/register`
2. Fill form: name, email, password
3. Click "Create Account"
4. Should redirect to `/verify-email?email=...`
5. Check email for verification code
6. Enter code and click "Verify Email"
7. Should auto-login and redirect to `/products`

### Password Reset Flow
1. Go to `/login`
2. Click "Forgot password?" link
3. Should navigate to `/forgot-password`
4. Enter email and click "Send Reset Code"
5. Should show success and redirect to `/reset-password`
6. Check email for reset code
7. Enter email, code, new password
8. Click "Reset Password"
9. Should auto-login and redirect to `/products`

### Login with Unverified Email
1. Register new account (verify page shows)
2. Don't verify, open new browser tab
3. Go to `/login`
4. Enter credentials from registration
5. Should redirect back to `/verify-email`
6. Verify email
7. Go to `/login` again
8. Should login normally and redirect to `/products`

---

## Important Security Notes

1. **Never** log verification codes to console in production
2. **Always** validate code format on backend (must be 6 digits)
3. **Always** check code expiry before accepting
4. **Never** accept codes that are expired
5. **Always** hash passwords with bcrypt (minimum 10 salt rounds)
6. **Always** validate email format before sending
7. **Never** reveal user existence in error messages (generic errors)
8. **Always** rate-limit password reset and resend endpoints (not yet implemented - add if needed)

---

**Last Updated**: February 26, 2026
**Status**: ✅ Production Ready (pending SMTP configuration)
