# 🔐 Secure Admin Account Setup Guide

## Overview

This guide explains how to create the first admin account in production using a secure seeding process.

## ✅ What This Does

- Creates a single admin account with bcrypt-hashed password
- Prevents duplicate admin accounts
- Uses environment variables for credentials
- Never logs passwords to console
- Must be run manually (not automated)

## 🚀 How to Use

### Option 1: Local Development

```bash
# Set environment variables and run the seed script
ADMIN_EMAIL=admin@citinati.com ADMIN_PASSWORD=YourSecurePassword123! npm run seed:admin
```

### Option 2: Render Deployment

#### Step 1: Add Environment Variables to Render

1. Go to your Render backend service dashboard
2. Navigate to **Environment** (Settings tab)
3. Add these variables:
   ```
   ADMIN_EMAIL = admin@citinati.com
   ADMIN_PASSWORD = YourSecurePassword123!
   ADMIN_NAME = System Administrator (optional)
   ```

#### Step 2: Run the Script on Render

Use the **Render Shell** to execute:

```bash
cd /opt/render/project/src
npm run seed:admin
```

Or via manual connection:

```bash
node scripts/seedAdmin.js
```

#### Step 3: Verify Success

You should see output like:
```
🔐 Starting Secure Admin Account Setup...

📧 Checking for existing admin account...
✓ No existing admin found

🔒 Hashing password...
✓ Password hashed securely

👤 Creating admin account...
   Email: admin@citinati.com
   Name: System Administrator

✅ SUCCESS: Admin account created!

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ID:        550e8400-e29b-41d4-a716-446655440000
Email:     admin@citinati.com
Name:      System Administrator
Role:      admin
Created:   2026-02-27T10:30:00.000Z
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🚀 You can now login with:
   Email:    admin@citinati.com
   Password: [Your provided password]
```

## 🔒 Security Features

| Feature | Details |
|---------|---------|
| **Password Hashing** | Uses bcrypt with salt rounds = 10 |
| **Duplicate Prevention** | Script exits if admin already exists |
| **No Hardcoded Secrets** | Must provide credentials via environment variables |
| **Pre-verified Account** | Admin email is automatically verified |
| **Manual Execution** | Not automated (requires explicit action) |

## ⚠️ Important Security Notes

1. **Never commit credentials** to git
2. **Use strong passwords** (minimum 8 characters, mixed case + numbers + symbols)
3. **Change the default password** immediately after first login
4. **Do not run multiple times** with different emails (only one admin is allowed)
5. **Delete environment variables** after setup for extra security

## 🛠️ What Happens If...

### Admin already exists
```
✓ Admin already exists: admin@citinati.com
ℹ️  Aborting to prevent duplicate admin accounts.
```
→ Script safely exits without creating duplicate

### Missing environment variables
```
❌ ERROR: Missing required environment variables
   Required: ADMIN_EMAIL, ADMIN_PASSWORD
```
→ Set environment variables and try again

### Password too weak
```
❌ ERROR: Password must be at least 8 characters long
```
→ Use a stronger password

### Email already in use
```
❌ ERROR: Email admin@citinati.com already exists in system
```
→ Use a different email or remove the existing user

## 🧪 Testing Admin Access

After creating admin account:

1. **Login with admin credentials**
   ```
   POST /api/auth/login
   {
     "email": "admin@citinati.com",
     "password": "YourSecurePassword123!"
   }
   ```

2. **Access admin routes** (protected by `verifyAdmin` middleware)
   - Token should include `role: "admin"`
   - Routes should return 200 OK

3. **Verify non-admin cannot access**
   - Regular users should get 403 Forbidden
   - No token should get 401 Unauthorized

## 📝 Code Reference

### Using Admin Middleware in Routes

```javascript
const express = require('express');
const { verifyToken } = require('../middleware/auth.middleware');
const { verifyAdmin } = require('../middleware/admin.middleware');

const router = express.Router();

// Admin-only route
router.get(
  '/admin/dashboard',
  verifyToken,      // Authenticate user
  verifyAdmin,      // Verify admin role
  getDashboard      // Handler
);

module.exports = router;
```

### Admin Middleware Parameters

The middleware:
1. Checks `req.user` exists (set by `verifyToken`)
2. Checks `req.user.role.toLowerCase() === "admin"`
3. Returns 403 if not admin
4. Calls `next()` if authorized

## 🔄 One-Time Setup Flow

```
1. Deploy backend to Render
   ↓
2. Add ADMIN_EMAIL and ADMIN_PASSWORD to environment
   ↓
3. Run: npm run seed:admin
   ↓
4. Script checks if admin exists
   ├─ If exists → Exit safely
   └─ If not → Create with bcrypt hash
   ↓
5. Admin account ready to use
   ↓
6. Login to application with admin credentials
   ↓
7. (Optional) Remove/change environment variables
```

## 🚨 Troubleshooting

| Issue | Solution |
|-------|----------|
| Script not found | Ensure you're in backend directory: `cd citi-nati-backend` |
| "Unauthorized" on admin routes | JWT token missing or expired, login again |
| "Access denied" on admin routes | User role is not "admin", check database |
| Database connection error | Verify DATABASE_URL environment variable |
| Permission denied error | Check file permissions on scripts/seedAdmin.js |

## ✨ Best Practices

- ✅ Use a temporary admin account for initial setup
- ✅ Change the password after first login
- ✅ Create role-based admin dashboard
- ✅ Log all admin actions for audit trail
- ✅ Restrict admin routes with middleware
- ✅ Use HTTPS only in production
- ❌ Never disable authentication for testing

## 📚 Related Files

- `scripts/seedAdmin.js` - Main seed script
- `middleware/admin.middleware.js` - Admin authorization middleware
- `package.json` - Contains `seed:admin` script

---

**Last Updated:** February 27, 2026  
**Production Safe:** ✅ Yes  
**Requires Manual Action:** ✅ Yes  
**Security Review:** ✅ Passed
