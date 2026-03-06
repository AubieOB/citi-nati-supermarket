# Manual Render Deployment Fix

## Problem
Backend service on Render is showing 500 errors because it hasn't rebuilt after the git push.

## Solution: Manually Trigger Rebuild

### Option 1: Via Render Dashboard (Recommended)
1. **Go to**: https://dashboard.render.com
2. **Select Backend Service**: `citi-nati-backend`
3. **Click "Manual Deploy"** button (top right)
4. Select the latest commit: "feat: implement server-side pagination..."
5. Click "Deploy"
6. Wait 2-5 minutes for build to complete
7. Check logs for success

### Option 2: Via Render API (If Connected)
```bash
# Trigger backend rebuild
curl -X POST https://api.render.com/v1/services/<SERVICE_ID>/deploys \
  -H "Authorization: Bearer YOUR_RENDER_API_KEY" \
  -H "Content-Type: application/json"

# Trigger frontend rebuild  
curl -X POST https://api.render.com/v1/services/<SERVICE_ID>/deploys \
  -H "Authorization: Bearer YOUR_RENDER_API_KEY" \
  -H "Content-Type: application/json"
```

### Option 3: Via GitHub (Webhook Reset)
1. Go to: https://github.com/AubieOB/citi-nati-supermarket/settings/hooks
2. Find Render webhook
3. Click "Redeliver" on latest payload
4. Render should rebuild automatically

---

## Why This Happens
- GitHub webhooks sometimes fail silently
- Render requires explicit rebuild trigger if webhook wasn't delivered
- Service must be explicitly redeployed to pick up code changes

---

## Verify Deployment Success

### Check Backend Logs
1. Go to Render dashboard
2. Select `citi-nati-backend`
3. Click "Logs" tab
4. Look for:
   - ✅ `npm install` - completed
   - ✅ `prisma migrate deploy` - completed
   - ✅ `Server running on PORT 10000` - service started

### Test API Endpoint
```bash
curl https://citi-nati-backend.onrender.com/api/products?page=1&pageSize=20
```

Should return:
```json
{
  "products": [...],
  "pagination": {
    "currentPage": 1,
    "pageSize": 20,
    "total": 1496,
    "totalPages": 75,
    "hasNextPage": true,
    "hasPrevPage": false
  }
}
```

---

## If Manual Deploy Still Fails

### Check These Issues

**1. Missing Dependencies**
```bash
# In citi-nati-backend/
npm install
npm list
```

**2. Prisma Client Issue**
```bash
cd citi-nati-backend
npx prisma generate
```

**3. Environment Variables**
- Verify `DATABASE_URL` is set in Render
- Verify `PORT=10000`
- Verify all API keys are correct

**4. Database Connection**
- Check PostgreSQL service is running
- Verify connection string is correct
- Test database access from terminal

---

## Auto-Deploy Setup (For Future Deployments)

### Enable GitHub Webhook
1. Go to Render dashboard → Settings
2. Find "Repository" section
3. Click "Connect Repository"
4. Select: `AubieOB/citi-nati-supermarket`
5. Enable "Auto-deploy"
6. Render will automatically rebuild on every push to `main`

### Verify Webhook in GitHub
1. Go to: https://github.com/AubieOB/citi-nati-supermarket/settings/hooks
2. Should see Render webhook listed
3. Click it → "Redeliver" to test
4. Check Render logs to confirm it worked

---

## Current Status

**Push Status**: ✅ Code committed and pushed  
**Commit**: `38a15ed` on branch `main`  
**Files Changed**: 35 files, 8024 insertions  
**Pending**: Render rebuild (manual trigger required)

---

## Next Steps

1. **Go to Render Dashboard**: https://dashboard.render.com
2. **Click Manual Deploy** on backend service
3. **Wait 2-5 minutes** for rebuild
4. **Test API**: https://citi-nati-backend.onrender.com/api/products?page=1&pageSize=20
5. **Frontend will auto-update** with pagination working

---

## Support Info

**Backend Service**: https://citi-nati-backend.onrender.com  
**Frontend Service**: https://citi-nati-frontend.onrender.com  
**GitHub Repo**: https://github.com/AubieOB/citi-nati-supermarket  
**Latest Commit**: 38a15ed (Pagination Implementation)

Once rebuild completes, pagination should work instantly! 🚀
