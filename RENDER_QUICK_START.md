# 🚀 Render Deployment - Quick Start Guide

**Status:** Ready to Deploy  
**Date:** February 26, 2026

---

## 📋 What's Ready

✅ Backend configured for production CORS  
✅ PostgreSQL database template set  
✅ Environment variable templates created  
✅ Deployment guides written  

---

## 🎯 Next Steps (5-10 minutes)

### 1️⃣ Push to GitHub (2 min)

```powershell
cd "c:\Users\aubre\Desktop\Citi-Nati Supermarket website"
git init
git add .
git commit -m "Ready for Render deployment"
git remote add origin https://github.com/YOUR_USERNAME/citi-nati-supermarket.git
git branch -M main
git push -u origin main
```

**Note:** Create the GitHub repo first at https://github.com/new

### 2️⃣ Create Render Account (1 min)

Visit https://render.com and sign up (free)

### 3️⃣ Create PostgreSQL Database (2 min)

1. Dashboard → New + → Database → PostgreSQL
2. Name it: `citi-nati-db`
3. Copy the **External Database URL**

### 4️⃣ Deploy Backend (3 min)

1. Dashboard → New + → Web Service
2. Connect GitHub repo
3. Configure:
   - **Name:** `citi-nati-backend`
   - **Build Command:**
     ```
     cd citi-nati-backend && npm install && npx prisma migrate deploy
     ```
   - **Start Command:**
     ```
     cd citi-nati-backend && node src/server.js
     ```
   - **Plan:** Free

4. Add Environment Variables:
   ```
   DATABASE_URL=postgresql://user:pass@host:5432/citi_nati
   PORT=10000
   JWT_SECRET=change-this-to-secure-random-string
   NODE_ENV=production
   FRONTEND_URL=https://citi-nati-frontend.onrender.com
   BACKEND_URL=https://citi-nati-backend.onrender.com
   PAYCHANGU_WEBHOOK_SECRET=citi_nati_webhook_secret_2026
   PAYCHANGU_PUBLIC_KEY=pub-live-tSsi1pnanfaIdNSVNmJyJskSx9Miztqj
   PAYCHANGU_SECRET_KEY=sec-live-FBgdaTih3IrNVAtx8fOyxPleujBglVdP
   SENDGRID_API_KEY=SG.your-key
   FROM_EMAIL=renewableenergyh@gmail.com
   SMTP_HOST=smtp.sendgrid.net
   SMTP_PORT=587
   SMTP_SECURE=true
   SMTP_USER=apikey
   GOOGLE_CLIENT_ID=361426729141-lpmfihah46q614eiph1cr9eeklorhtvd.apps.googleusercontent.com
   ```

5. **Deploy** and wait (5-10 min)
6. Note the backend URL: `https://citi-nati-backend.onrender.com`

### 5️⃣ Deploy Frontend (2 min)

1. Dashboard → New + → Static Site
2. Connect same GitHub repo
3. Configure:
   - **Name:** `citi-nati-frontend`
   - **Build Command:**
     ```
     cd citi-nati-frontend && npm install && npm run build
     ```
   - **Publish Directory:** `citi-nati-frontend/dist`

4. **Deploy** and wait (2-5 min)
5. Note the frontend URL: `https://citi-nati-frontend.onrender.com`

### 6️⃣ Update Backend URLs

1. Go back to backend service
2. Update environment variables:
   ```
   FRONTEND_URL=https://citi-nati-frontend.onrender.com
   BACKEND_URL=https://citi-nati-backend.onrender.com
   ```
3. **Save** → Service auto-redeploys

### 7️⃣ Test It! 🎉

- **Frontend:** https://citi-nati-frontend.onrender.com
- **Backend Health:** https://citi-nati-backend.onrender.com/api/health
- **Test Registration:** Create account and verify email

---

## 📚 Full Documentation

- **[RENDER_DEPLOYMENT_GUIDE.md](RENDER_DEPLOYMENT_GUIDE.md)** - Detailed step-by-step guide
- **[RENDER_DEPLOYMENT_CHECKLIST.md](RENDER_DEPLOYMENT_CHECKLIST.md)** - Complete checklist
- **[citi-nati-backend/.env.production.example](citi-nati-backend/.env.production.example)** - Backend env vars
- **[citi-nati-frontend/.env.production](citi-nati-frontend/.env.production)** - Frontend env vars

---

## ⚡ Free Tier Notes

- Services **spin down after 15 minutes** of inactivity
- **First request takes 50-100 seconds** (cold start)
- Database connections are **free but limited**
- Good for development/testing, considers paid tier for production

---

## 🆘 Common Issues

| Issue | Solution |
|-------|----------|
| Build fails | Check logs in Render dashboard → Logs tab |
| Can't connect to DB | Verify DATABASE_URL uses External URL format |
| CORS errors | Update FRONTEND_URL in backend env vars |
| Emails not sending | Check SendGrid API key and account |
| Frontend doesn't load | Verify publish directory is `citi-nati-frontend/dist` |

---

## 📞 Getting Help

- **Render Docs:** https://render.com/docs
- **Prisma Docs:** https://www.prisma.io/docs/
- **Check Logs:** Render Dashboard → Select Service → Logs

---

## 🔐 Security Checklist

- [ ] Change JWT_SECRET in production
- [ ] Remove all sensitive keys from GitHub (use env vars only)
- [ ] Enable GitHub secret scanning
- [ ] Rotate API keys regularly
- [ ] Use strong database passwords
- [ ] Enable HTTPS (Render does this automatically)

---

**You're ready to deploy! 🚀**

Once you've followed these steps, the system will be live and automatically deploy any future GitHub pushes.

