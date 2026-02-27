# Bootstrap Admin Setup Guide
## For Render Free Tier (No Shell Access)

When you don't have Shell access on Render free tier, use the HTTP API bootstrap endpoint to create your admin account instead of the npm script.

---

## Quick Start

### 1. Get Your Bootstrap Secret
The bootstrap secret is in your `.env` file on Render:
```
ADMIN_BOOTSTRAP_SECRET=citi_nati_bootstrap_secret_key_2026_secure_change_in_production
```

### 2. Create Admin Account via cURL

Run this command in your terminal (or Postman):

```bash
curl -X POST https://your-backend-url/api/admin/bootstrap \
  -H "Authorization: Bearer citi_nati_bootstrap_secret_key_2026_secure_change_in_production" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@citinati.com",
    "password": "YourSecureAdminPassword123!",
    "name": "System Administrator"
  }'
```

**Replace:**
- `https://your-backend-url` with your actual Render backend URL (e.g., `https://citi-nati-backend.onrender.com`)
- Admin email, password, and name as needed

### 3. Successful Response

If successful, you'll see:
```json
{
  "success": true,
  "message": "Admin account created successfully",
  "admin": {
    "id": 1,
    "email": "admin@citinati.com",
    "name": "System Administrator",
    "role": "admin",
    "createdAt": "2025-02-27T10:30:00.000Z"
  },
  "note": "You can now login with the provided credentials"
}
```

---

## Security Notes

✅ **What the Bootstrap Endpoint Does:**
- Requires a secret key in the Authorization header
- Only creates admin if no admin exists yet
- Hashes password with bcrypt (10 rounds)
- Sets `emailVerified: true` on creation
- Should only work once (will reject if admin already exists)

⚠️ **Important Security Steps:**

1. **For Production:** Change the `ADMIN_BOOTSTRAP_SECRET` in your `.env`:
   ```
   ADMIN_BOOTSTRAP_SECRET=your_very_long_random_secret_key_here_at_least_32_chars
   ```

2. **After Creating Admin:** You can disable bootstrap by removing the secret:
   ```
   # Remove or comment out this line after first use
   # ADMIN_BOOTSTRAP_SECRET=...
   ```

3. **Logs:** The backend logs all bootstrap attempts:
   ```
   [BOOTSTRAP] Creating admin account: admin@citinati.com
   [BOOTSTRAP] ✅ SUCCESS - Admin account created: admin@citinati.com
   ```

---

## Using Postman

If you prefer Postman instead of cURL:

1. **New Request → POST**
2. **URL:** `https://your-backend-url/api/admin/bootstrap`
3. **Headers Tab:**
   - Key: `Authorization`
   - Value: `Bearer citi_nati_bootstrap_secret_key_2026_secure_change_in_production`
   - Key: `Content-Type`
   - Value: `application/json`
4. **Body Tab → raw → JSON:**
   ```json
   {
     "email": "admin@citinati.com",
     "password": "YourSecureAdminPassword123!",
     "name": "System Administrator"
   }
   ```
5. **Send**

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `401 Unauthorized - invalid secret` | Check ADMIN_BOOTSTRAP_SECRET matches in .env |
| `404 Not found` | ADMIN_BOOTSTRAP_SECRET not set in .env (endpoint disabled) |
| `409 Admin already exists` | Admin account already created - you can't use bootstrap again |
| `400 Missing email or password` | Include both email and password in request body |
| `400 Password must be at least 8 characters` | Use a stronger password (8+ characters) |
| `400 Email already exists in system` | User with that email already exists |

---

## Two Methods to Create Admin

### Method 1: npm Script (Local Development)
```bash
cd citi-nati-backend
npm run seed:admin
```
✅ Works when you have Shell access to Render
✅ Works on local development machine

### Method 2: Bootstrap Endpoint (Render Free Tier)
```bash
curl -X POST https://your-backend-url/api/admin/bootstrap \
  -H "Authorization: Bearer your_secret" \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@citinati.com", "password": "YourPassword123!", "name": "Admin"}'
```
✅ Works on Render free tier (no Shell required)
✅ Works from anywhere (local machine, browser, API client)
✅ One-time use protection built-in

---

## Next Steps After Creating Admin

1. **Login:** Go to frontend login page
   - Email: `admin@citinati.com`
   - Password: `YourSecureAdminPassword123!`

2. **Access Admin Dashboard:** 
   - After login with admin role, look for "Admin Dashboard" link
   - Path: `/admin`

3. **Test Admin Features:**
   - View dashboard stats
   - Manage users
   - View orders
   - Access admin settings

---

## Related Files

- **Backend Implementation:** [src/routes/admin.bootstrap.js](src/routes/admin.bootstrap.js)
- **Backend Integration:** [src/server.js](src/server.js) (line 249)
- **Environment Config:** [.env](.env) (line 31)
- **Admin Routes:** [src/routes/admin.routes.js](src/routes/admin.routes.js)
- **Admin Middleware:** [src/middleware/admin.middleware.js](src/middleware/admin.middleware.js)

