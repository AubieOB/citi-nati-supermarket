# 🔐 Admin Setup Quick Reference

## TL;DR - Create Admin in 5 Minutes

### On Render Dashboard:

1. **Go to Backend Service** → Settings → Environment
2. **Add these variables:**
   ```
   ADMIN_EMAIL = admin@citinati.com
   ADMIN_PASSWORD = YourSecurePass123!
   ```
3. **Save** (waits ~2 min for rebuild)
4. **Click Shell tab** and run:
   ```bash
   npm run seed:admin
   ```
5. **Login with credentials** you just created

---

## Local Development

```bash
cd citi-nati-backend

# Set environment and run
ADMIN_EMAIL=admin@citinati.com ADMIN_PASSWORD=YourSecurePass123! npm run seed:admin
```

---

## Login Test

```bash
# Get JWT token
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@citinati.com","password":"YourSecurePass123!"}'

# Use token on admin route
curl -H "Authorization: Bearer JWT_TOKEN" \
  http://localhost:5000/api/admin/test
```

---

## Files Created

| File | Purpose |
|------|---------|
| `scripts/seedAdmin.js` | Main admin creation script |
| `ADMIN_SETUP_GUIDE.md` | Detailed instructions |
| `ADMIN_DEPLOYMENT_GUIDE.md` | Render deployment steps |
| `middleware/admin.middleware.js` | Admin role verification |
| **package.json** | Added `seed:admin` script |

---

## What It Does

✅ Creates ONE admin account  
✅ Uses bcrypt (10 rounds)  
✅ Prevents duplicates  
✅ Never logs password  
✅ Environment variable based (no hardcoding)  
✅ Marks email as verified  
✅ Sets role = "admin"  

---

## Security

| Feature | Details |
|---------|---------|
| Hash | bcrypt 10 rounds |
| Duplicate Prevention | Exits if admin exists |
| No Hardcoding | Environment variables only |
| Manual Only | Requires explicit command |
| Production Safe | No automation, no public routes |

---

## If Admin Exists

Script safely exits:
```
✓ Admin already exists: admin@citinati.com
ℹ️  Aborting to prevent duplicate admin accounts.
```

---

## Errors & Fixes

| Error | Fix |
|-------|-----|
| Missing env vars | Add ADMIN_EMAIL and ADMIN_PASSWORD to Render |
| Password too weak | Use 8+ chars with uppercase, numbers, symbols |
| Email exists | Script will show which email is already admin |
| Login fails | Check password is exact (case-sensitive) |
| 403 on admin routes | Ensure DB has `role: "admin"` in user |

---

## Admin Routes Protected With:

```javascript
router.get('/admin/endpoint', 
  verifyToken,    // Must be logged in
  verifyAdmin,    // Must have role = "admin"
  handler
);
```

---

## Password Requirements

- Minimum 8 characters
- Must include uppercase letters (A-Z)
- Must include lowercase letters (a-z)
- Must include numbers (0-9)
- Should include symbols (!@#$%^&*)
- Example: `SecureAdmin@2026!`

---

## Deployment Flow

```
Push Code → GitHub  
  ↓
Render Auto-Rebuild  
  ↓
Add Env Vars to Render  
  ↓
Run: npm run seed:admin  
  ↓
See "✅ SUCCESS" message  
  ↓
Login with admin credentials  
  ↓
Admin ready! 🎉
```

---

## Complete Documentation

For full details, see:
- `ADMIN_SETUP_GUIDE.md` - Setup reference
- `ADMIN_DEPLOYMENT_GUIDE.md` - Render deployment
- `scripts/seedAdmin.js` - Source code
- `middleware/admin.middleware.js` - Authorization

---

**Version:** 1.0  
**Status:** Production Ready ✅  
**Last Updated:** February 27, 2026
