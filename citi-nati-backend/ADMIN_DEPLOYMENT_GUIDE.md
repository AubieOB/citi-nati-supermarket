# 🚀 Admin Account Deployment Guide

## Production Deployment Steps

### Environment: Render Free Tier

---

## Phase 1: Backend Deployment Setup ✅

The secure admin setup is now included in your backend repository:

**Deployed Files:**
- `scripts/seedAdmin.js` - Secure seed script
- `ADMIN_SETUP_GUIDE.md` - Complete setup documentation
- `package.json` - Added `npm run seed:admin` command
- `middleware/admin.middleware.js` - Admin authorization middleware (updated)
- `src/routes/admin.routes.js` - Admin routes (documented)

---

## Phase 2: Add Environment Variables to Render

### Step 1: Access Render Dashboard

1. Go to [render.com](https://render.com)
2. Select your **citi-nati-backend** Web Service
3. Click **Settings** → **Environment**

### Step 2: Add Admin Credentials

In the **Environment Variables** section, add:

```
ADMIN_EMAIL=admin@citinati.com
ADMIN_PASSWORD=YourSecurePassword123!
ADMIN_NAME=System Administrator
```

**Password Requirements:**
- Minimum 8 characters
- Mix of uppercase, lowercase, numbers, symbols
- Cannot be blank
- Example: `SecureAdmin@2026!`

⚠️ **IMPORTANT:** Replace with your own secure password!

### Step 3: Save Environment Variables

Click **Save** and wait for automatic rebuild (usually 2-3 minutes)

---

## Phase 3: Run Admin Seed Script

### Option A: Using Render Shell (Recommended)

1. In Render dashboard, click **Shell** tab for your backend service
2. Run:
   ```bash
   npm run seed:admin
   ```

**Expected Output:**
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

⚠️  IMPORTANT: Do not run this script again with the same email.
```

### Option B: Local Testing (Before Production)

```bash
cd citi-nati-backend

# Set environment variables
export ADMIN_EMAIL=admin@citinati.com
export ADMIN_PASSWORD=YourSecurePassword123!
export ADMIN_NAME="System Administrator"

# Run seed script
npm run seed:admin
```

---

## Phase 4: Verify Admin Account

### Test 1: Login Endpoint

```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@citinati.com",
    "password": "YourSecurePassword123!"
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "email": "admin@citinati.com",
    "name": "System Administrator",
    "role": "admin"
  }
}
```

### Test 2: Admin Middleware

With the JWT token from login:

```bash
curl -X GET http://localhost:5000/api/admin/test \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Admin access granted",
  "user": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "email": "admin@citinati.com",
    "role": "admin"
  }
}
```

### Test 3: Non-Admin Gets Denied

Try with a regular user's token:

```bash
curl -X GET http://localhost:5000/api/admin/test \
  -H "Authorization: Bearer REGULAR_USER_TOKEN"
```

**Expected Response (403):**
```json
{
  "error": "Access denied. Admin privileges required."
}
```

---

## Phase 5: Post-Setup Security

### After Successful Admin Creation:

1. ✅ **Verify the admin can login**
2. ✅ **Change admin password immediately**
3. ✅ **Create additional admin accounts if needed** (use admin dashboard)
4. ⚠️  **Option: Remove environment variables** from Render
   - This prevents accidental re-creation
   - Keep database backup before removing

### Optional: Clean Up Environment

After confirming admin works:

1. Go to Render → Settings → Environment
2. Delete `ADMIN_PASSWORD` variable
3. Save changes
4. ✓ Script cannot be re-run without password

---

## 🧪 Testing All Admin Features

### Test Admin Dashboard

```bash
curl -X GET http://localhost:5000/api/admin/users \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Test Admin Order Access

```bash
curl -X GET http://localhost:5000/api/admin/orders \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Verify Non-Admins Get 403

Regular users accessing admin routes should get:
```json
{
  "error": "Access denied. Admin privileges required."
}
```

---

## ⚠️ Troubleshooting

| Problem | Solution |
|---------|----------|
| "Admin already exists" | Admin is already created, use login |
| "Missing ADMIN_EMAIL" | Set environment variables in Render |
| "Password too weak" | Use minimum 8 chars with mixed case + numbers |
| "Email already exists" | Use different email or delete existing user |
| Login fails after creation | Check password matches exactly (case-sensitive) |
| 403 on admin routes | Ensure JWT includes `role: "admin"` |
| Shell not available | Trigger deploy → use SSH during build |

---

## 📋 Deployment Checklist

- [ ] Backend pushed to GitHub with admin setup code
- [ ] Environment variables added to Render (ADMIN_EMAIL, ADMIN_PASSWORD)
- [ ] Render backend rebuilt successfully
- [ ] Admin seed script executed: `npm run seed:admin`
- [ ] Script output shows "✅ SUCCESS"
- [ ] Admin login works with credentials
- [ ] Admin can access `/api/admin/test` endpoint
- [ ] Non-admin users get 403 error
- [ ] Admin can view users/orders/products
- [ ] (Optional) Environment password variable removed

---

## 🔄 If Re-Running Script Needed

The script safely refuses to create duplicate admins:

```
✓ Admin already exists: admin@citinati.com
ℹ️  Aborting to prevent duplicate admin accounts.
```

To create a **second admin**:

1. Use the admin dashboard UI
2. Or manually database insert with bcrypt-hashed password
3. Or modify script to use different email

---

## 📚 Additional Resources

- [ADMIN_SETUP_GUIDE.md](./ADMIN_SETUP_GUIDE.md) - Detailed setup guide
- [scripts/seedAdmin.js](./scripts/seedAdmin.js) - Seed script source code
- [middleware/admin.middleware.js](./middleware/admin.middleware.js) - Auth middleware
- [src/routes/admin.routes.js](./src/routes/admin.routes.js) - Admin routes

---

## 🎯 Next Steps After Admin Setup

1. ✅ Create admin dashboard UI (frontend)
2. ✅ Implement admin user management
3. ✅ Add product management interface
4. ✅ Add order analytics dashboard
5. ✅ Add audit logging
6. ✅ Set up admin notifications

---

## ✨ Security Summary

✅ **Secure:** Password never logged, bcrypt hashed (10 rounds)  
✅ **Protected:** Admin middleware prevents unauthorized access  
✅ **Controlled:** Manual script execution, not automated  
✅ **Verified:** Checks prevent duplicate admin accounts  
✅ **Production-Safe:** No hardcoded credentials, environment-based  

---

**Created:** February 27, 2026  
**Deployment Target:** Render Free Tier  
**Status:** Ready for Production  
**Last Verified:** ✅ Functional
