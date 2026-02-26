# 🎯 RENDER DEPLOYMENT - STEPS 3-5 (READY WHEN GITHUB IS DONE)

**These steps come AFTER you successfully push to GitHub.**

---

# ⚡ STEP 3: CREATE RENDER ACCOUNT & SERVICES

### 3.1 Create Render Account (1 minute)

1. **Go to:** https://render.com
2. **Click:** "Sign up" (top right)
3. **Choose:** Sign up with GitHub (easiest)
4. **Authorize** GitHub access
5. **Dashboard:** You're now in Render dashboard

---

# 🐘 STEP 4: CREATE POSTGRESQL DATABASE (2 minutes)

### 4.1 Create Database

1. **In Render Dashboard**, click: **New +** (top right)
2. **Select:** **Database** → **PostgreSQL**
3. **Fill in:**
   - **Name:** `citi-nati-db`
   - **Database:** `citi_nati`
   - **User:** `postgres`
   - **Region:** Pick closest to you (or use default)
   - **Plan:** Free

4. **Click:** **Create Database**
5. **Wait:** 1-2 minutes for database to initialize (shows green when ready)

### 4.2 Copy Database URL

Once green (running), you'll see:
- **Internal Database URL** (ignore this)
- **External Database URL** (COPY THIS - you'll need it)

**Format:** `postgresql://username:password@host:5432/citi_nati`

**Save this somewhere** - you'll paste it in Step 5

---

# 🚀 STEP 5: DEPLOY BACKEND SERVICE (5 minutes)

### 5.1 Create Backend Service

1. **Click:** **New +** → **Web Service**
2. **Select GitHub Repo:** Choose `citi-nati-supermarket`
   - If not listed, click "Connect a repository" first
3. **Configure:**
   - **Name:** `citi-nati-backend`
   - **Runtime:** Node
   - **Build Command:** 
     ```
     cd citi-nati-backend && npm install && npx prisma migrate deploy
     ```
   - **Start Command:**
     ```
     cd citi-nati-backend && node src/server.js
     ```
   - **Plan:** Free

4. **Click:** **Create Web Service**

### 5.2 Add Environment Variables (BEFORE it deploys)

The service will start deploying. **QUICKLY**, before it finishes:

1. Click the **Environment** tab
2. **Add these variables** by clicking **Add Environment Variable**:

```
DATABASE_URL = postgresql://...paste-your-external-database-url...
PORT = 10000
JWT_SECRET = your-secure-jwt-secret
NODE_ENV = production
GOOGLE_CLIENT_ID = your-google-client-id
PAYCHANGU_WEBHOOK_SECRET = your-paychangu-webhook-secret
PAYCHANGU_PUBLIC_KEY = your-paychangu-public-key
PAYCHANGU_SECRET_KEY = your-paychangu-secret-key
PAYCHANGU_ACCOUNT_ID = your-account-id
PAYCHANGU_ACCOUNT_NAME = your-account-name
SENDGRID_API_KEY = your-sendgrid-api-key
FROM_EMAIL = your-email@domain.com
SMTP_HOST = smtp.sendgrid.net
SMTP_PORT = 587
SMTP_SECURE = true
SMTP_USER = apikey
FRONTEND_URL = https://placeholder-for-now.onrender.com
BACKEND_URL = https://placeholder-for-now.onrender.com
```

⚠️ **Important:** You'll update `FRONTEND_URL` and `BACKEND_URL` later with actual URLs

### 5.3 Wait for Deployment

- **Logs tab** shows build progress
- Should see: `[nodemon] starting node src/server.js`
- **When it says "Server listening on port 10000"** → ✅ Backend is running
- **Copy the Backend URL** - looks like `https://citi-nati-backend.onrender.com`

Save the URL!

---

# 🎨 STEP 6: DEPLOY FRONTEND SERVICE (2 minutes)

### 6.1 Create Frontend Service

1. **Click:** **New +** → **Static Site**
2. **Select GitHub Repo:** `citi-nati-supermarket`
3. **Configure:**
   - **Name:** `citi-nati-frontend`
   - **Build Command:**
     ```
     cd citi-nati-frontend && npm install && npm run build
     ```
   - **Publish Directory:** `citi-nati-frontend/dist`
   - **Plan:** Free

4. **Click:** **Create Static Site**

### 6.2 Wait for Deployment

- Should take 2-5 minutes
- When done, you get a **Frontend URL** like: `https://citi-nati-frontend.onrender.com`
- **Copy the Frontend URL**

---

# 🔗 STEP 7: UPDATE ENVIRONMENT VARIABLES (2 minutes)

Now that you have both URLs, update your backend:

1. **Go back to Backend Service** (Render dashboard)
2. **Click** Backend service name
3. **Click Environment** tab
4. **Update these variables:**
   ```
   FRONTEND_URL = https://citi-nati-frontend.onrender.com
   BACKEND_URL = https://citi-nati-backend.onrender.com
   ```
   
5. **Service auto-redeploys** with new URLs

---

# ✅ STEP 8: TEST YOUR DEPLOYMENT (2 minutes)

### 8.1 Test Frontend

1. **Visit:** `https://citi-nati-frontend.onrender.com`
2. Should see your Citi-Nati homepage
3. Try registering with test email

### 8.2 Test Backend

1. **Visit:** `https://citi-nati-backend.onrender.com/api/health`
2. Should see: `{"status":"OK"}`

### 8.3 Test Full Flow

1. **Register** → Get verification email
2. **Verify email** → Should redirect to login
3. **Login** → Should see products
4. **Check products** → Should load from database

---

## 🎉 IF EVERYTHING WORKS

Your website is **LIVE!** 🚀

- **Frontend:** https://citi-nati-frontend.onrender.com
- **Backend:** https://citi-nati-backend.onrender.com

Every push to GitHub now auto-deploys!

---

## ❌ IF SOMETHING FAILS

### Check Backend Logs
1. Render Dashboard → Select backend service
2. **Logs** tab
3. Look for error messages

### Common Issues

| Error | Fix |
|-------|-----|
| `DATABASE_URL not set` | Add DATABASE_URL in Environment |
| `Cannot find module` | Missing npm install in build command |
| `CORS error` | Ensure FRONTEND_URL is set in backend |
| `Cannot GET /` | Frontend publish directory wrong - should be `citi-nati-frontend/dist` |

---

## 📊 SUMMARY OF YOUR NEW URLS

| Service | URL |
|---------|-----|
| **Frontend** | https://citi-nati-frontend.onrender.com |
| **Backend API** | https://citi-nati-backend.onrender.com/api |
| **Backend Health** | https://citi-nati-backend.onrender.com/api/health |
| **Database** | PostgreSQL (on Render) |

---

## ⚡ Next Time You Update Code

Just commit and push to GitHub:
```powershell
git add .
git commit -m "Your changes"
git push
```

Render automatically redeploys!

---

**Ready?** Come back with your GitHub URL, and I'll send you the exact commands to run for each step.
