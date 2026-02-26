# Render Deployment Guide - Citi-Nati Supermarket Website

## Overview
This guide covers deploying the Citi-Nati Supermarket website on Render using free tier services.

**Services:**
- Backend: Node.js/Express API (Free tier)
- Frontend: React/Vite static site (Free tier)
- Database: PostgreSQL (Free tier)

---

## Prerequisites

1. **Render Account** - Sign up at https://render.com (free)
2. **GitHub Repository** - Push your code to GitHub (Render deploys from GitHub)
3. **Environment Variables** - Have your `.env` values ready

---

## Step 1: Prepare GitHub Repository

### 1.1 Initialize Git (if not already done)
```bash
cd "c:\Users\aubre\Desktop\Citi-Nati Supermarket website"
git init
git add .
git commit -m "Initial commit - ready for Render deployment"
```

### 1.2 Create GitHub Repository
1. Go to https://github.com/new
2. Create a new repository (e.g., `citi-nati-supermarket`)
3. Push your local code:
```bash
git remote add origin https://github.com/YOUR_USERNAME/citi-nati-supermarket.git
git branch -M main
git push -u origin main
```

---

## Step 2: Create PostgreSQL Database on Render

1. **Sign in to Render** at https://dashboard.render.com
2. **Click "New +"** → **Database** → **PostgreSQL**
3. **Configure Database:**
   - **Name:** `citi-nati-db`
   - **Database:** `citi_nati`
   - **User:** `postgres`
   - **Region:** Select closest to you
   - **Version:** Latest PostgreSQL
4. **Create Database**
5. **Copy Connection String** - You'll get an `Internal Database URL` and `External Database URL`
   - Use the **External Database URL** for migrations initially
   - Format: `postgresql://user:password@host:5432/database`

---

## Step 3: Deploy Backend Service

### 3.1 Create Backend Service on Render

1. **Click "New +"** → **Web Service**
2. **Connect GitHub Repository:**
   - Click "Connect a repository"
   - Authorize GitHub
   - Select your `citi-nati-supermarket` repository
3. **Configure Service:**
   - **Name:** `citi-nati-backend`
   - **Runtime:** Node
   - **Build Command:** `cd citi-nati-backend && npm install && npx prisma migrate deploy`
   - **Start Command:** `cd citi-nati-backend && node src/server.js`
   - **Plan:** Free

### 3.2 Add Environment Variables
Click **Environment** and add these variables:

```
DATABASE_URL=postgresql://user:password@your-db-host:5432/citi_nati
PORT=10000
JWT_SECRET=your-secure-random-string-here
NODE_ENV=production

PAYCHANGU_WEBHOOK_SECRET=your-paychangu-webhook-secret
PAYCHANGU_PUBLIC_KEY=your-paychangu-public-key
PAYCHANGU_SECRET_KEY=your-paychangu-secret-key
PAYCHANGU_ACCOUNT_ID=your-account-id
PAYCHANGU_ACCOUNT_NAME=your-account-name

GOOGLE_CLIENT_ID=your-google-client-id

SENDGRID_API_KEY=your-sendgrid-api-key
FROM_EMAIL=your-email@domain.com
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_SECURE=true
SMTP_USER=apikey

FRONTEND_URL=https://your-frontend-url.onrender.com
BACKEND_URL=https://your-backend-url.onrender.com
```

⚠️ **Important:** After creating the frontend service, update `FRONTEND_URL` and `BACKEND_URL` with actual Render URLs

### 3.3 Deploy
- Click **Deploy**
- Wait for build to complete (5-10 minutes)
- You'll get a backend URL like: `https://citi-nati-backend.onrender.com`

---

## Step 4: Deploy Frontend Service

### 4.1 Create Frontend Service on Render

1. **Click "New +"** → **Static Site**
2. **Connect GitHub Repository:**
   - Select your repository (same as backend)
3. **Configure Service:**
   - **Name:** `citi-nati-frontend`
   - **Build Command:** `cd citi-nati-frontend && npm install && npm run build`
   - **Publish Directory:** `citi-nati-frontend/dist`
4. **Deploy**
   - You'll get a frontend URL like: `https://citi-nati-frontend.onrender.com`

### 4.2 Update Environment Variables in Backend
Go back to backend service and update:
```
FRONTEND_URL=https://citi-nati-frontend.onrender.com
BACKEND_URL=https://citi-nati-backend.onrender.com
```

---

## Step 5: Configure CORS for Frontend-Backend Communication

### Update Backend CORS Settings
Edit [citi-nati-backend/src/server.js](citi-nati-backend/src/server.js) and ensure CORS includes your frontend URL:

```javascript
const corsOptions = {
  origin: [
    'http://localhost:3000',
    'http://localhost:5173',
    process.env.FRONTEND_URL || 'http://localhost:3000'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization']
};

app.use(cors(corsOptions));
```

---

## Step 6: Database Initialization

### 6.1 Run Migrations
The migrations run automatically in the `Build Command`. To verify:

1. **Go to Backend Service** on Render
2. **Logs** tab
3. Look for "Prisma migration deployed"

### 6.2 Seed Database (Optional)
If you want to load initial data:

1. **Connect to Database:**
   ```bash
   psql "your-external-database-url"
   ```

2. **Run seed script:**
   ```bash
   cd citi-nati-backend
   npx prisma db seed
   ```

---

## Step 7: Testing Deployment

### 7.1 Test Backend
```bash
curl https://your-backend-url.onrender.com/health
```

### 7.2 Test Frontend
Visit: `https://citi-nati-frontend.onrender.com`

### 7.3 Test Registration Flow
1. Go to frontend URL
2. Click Register
3. Enter test email
4. Check email for verification code
5. Complete registration

---

## Step 8: Troubleshooting

### Build Failed
- Check **Logs** tab in Render dashboard
- Look for missing dependencies or syntax errors

### Database Connection Error
- Verify `DATABASE_URL` is correct (use External URL)
- Check if Prisma migrations ran (visible in logs)
- Ensure database is running (green status on Render)

### CORS Errors
- Update `FRONTEND_URL` in backend environment variables
- Ensure backend CORS settings include frontend domain
- Redeploy backend after changes

### Email Not Sending
- Verify `SENDGRID_API_KEY` is correct
- Check SendGrid account has sufficient credits
- Verify `FROM_EMAIL` is allowed by SendGrid

### Static Site Not Loading
- Ensure build directory is `citi-nati-frontend/dist`
- Verify `npm run build` produces a `dist` folder
- Check build logs for errors

---

## Step 9: Continuous Deployment

After setup is complete, every push to your GitHub repository will:
1. **Trigger builds** for both frontend and backend
2. **Auto-deploy** if build succeeds
3. **Update** services on Render

To deploy changes:
```bash
git add .
git commit -m "Your changes"
git push origin main
```

---

## Step 10: Monitor Services

### View Logs
1. Go to Render Dashboard
2. Select each service
3. Click **Logs** to see real-time activity

### Check Service Status
- **Green**: Running normally
- **Yellow**: Deploying or restarting
- **Red**: Error or stopped

---

## Important Notes

⚠️ **Free Tier Limitations:**
- Services spin down after 15 minutes of inactivity
- First request after sleep takes 50-100 seconds
- Database cannot be accessed locally (use External URL)
- Limited compute resources

💡 **Performance Tips:**
1. Add a "Ping Service" to keep backend awake
2. Use caching where possible
3. Optimize images in frontend
4. Consider paid tier for production

---

## Quick Reference - Environment Variables

**Backend .env (Production):**
```
DATABASE_URL=postgresql://...
PORT=10000
JWT_SECRET=secure-random-key
NODE_ENV=production
FRONTEND_URL=https://citi-nati-frontend.onrender.com
BACKEND_URL=https://citi-nati-backend.onrender.com
PAYCHANGU_PUBLIC_KEY=...
PAYCHANGU_SECRET_KEY=...
SENDGRID_API_KEY=...
FROM_EMAIL=...
```

---

## Support & Help

- **Render Docs:** https://render.com/docs
- **Prisma Docs:** https://www.prisma.io/docs
- **GitHub Pages:** https://github.com/help

---

**Last Updated:** February 26, 2026
**Status:** Ready for Free Tier Deployment
