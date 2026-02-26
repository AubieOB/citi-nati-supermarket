# Render Deployment Checklist

## Pre-Deployment Setup (Do Before Creating Services)

- [ ] Create GitHub account
- [ ] Push code to GitHub (see RENDER_DEPLOYMENT_GUIDE.md Step 1)
- [ ] Create Render account at render.com
- [ ] Gather all environment variables (API keys, secrets, etc.)

---

## Database Setup

- [ ] Create PostgreSQL database on Render
- [ ] Copy External Database URL
- [ ] Verify database is running (green status)

---

## Backend Service Setup

- [ ] Create Web Service connected to GitHub
- [ ] Set service name: `citi-nati-backend`
- [ ] Set build command: `cd citi-nati-backend && npm install && npx prisma migrate deploy`
- [ ] Set start command: `cd citi-nati-backend && node src/server.js`
- [ ] Add environment variables (see RENDER_DEPLOYMENT_GUIDE.md Step 3.2)
- [ ] Deploy and wait for build to complete
- [ ] Note the backend URL (e.g., https://citi-nati-backend.onrender.com)
- [ ] Test backend health: `curl https://your-backend-url/health`

---

## Frontend Service Setup

- [ ] Create Static Site service connected to GitHub
- [ ] Set service name: `citi-nati-frontend`
- [ ] Set build command: `cd citi-nati-frontend && npm install && npm run build`
- [ ] Set publish directory: `citi-nati-frontend/dist`
- [ ] Deploy and wait for build to complete
- [ ] Note the frontend URL (e.g., https://citi-nati-frontend.onrender.com)

---

## Post-Deployment Configuration

- [ ] Update backend `FRONTEND_URL` environment variable with actual URL
- [ ] Update backend `BACKEND_URL` environment variable with actual URL
- [ ] Redeploy backend service to apply changes
- [ ] Test frontend loads successfully
- [ ] Test registration flow end-to-end
- [ ] Verify emails are sending (check SendGrid logs if needed)

---

## Database Verification

- [ ] Check Prisma migrations ran (visible in backend deployment logs)
- [ ] Optionally seed database with initial data
- [ ] Verify database connection works from backend logs

---

## Testing & Monitoring

- [ ] Check backend logs for errors
- [ ] Check frontend loads and displays correctly
- [ ] Test user registration flow:
  - [ ] Register with new email
  - [ ] Receive verification email
  - [ ] Verify email address
  - [ ] Login with credentials
- [ ] Test forgot password flow
- [ ] Monitor service logs for any errors
- [ ] Test file uploads (if applicable)

---

## Free Tier Optimization (Optional)

- [ ] Consider adding a health check endpoint to prevent sleep
- [ ] Set up monitoring for service status
- [ ] Document slow cold start times to users
- [ ] Consider upgrade plan if performance insufficient

---

## Troubleshooting Notes

**If build fails:**
- Check the build logs in Render dashboard
- Verify all dependencies are listed in package.json
- Check for syntax errors or missing files

**If frontend doesn't load:**
- Verify build directory is correct (dist folder)
- Check for missing environment variables
- Clear browser cache and try again

**If backend can't connect to database:**
- Verify DATABASE_URL is using External URL format
- Check PostgreSQL database is running
- Ensure credentials are correct

**If emails don't send:**
- Verify SENDGRID_API_KEY is correct
- Check SendGrid account settings
- Verify FROM_EMAIL is authorized

---

## Useful Render Dashboard Features

- **Logs**: Real-time service logs
- **Environment**: View/edit environment variables
- **Settings**: Configure deploy behavior, regions, etc.
- **Metrics**: View CPU, memory, and request metrics
- **Deploys**: View deployment history and rollback

---

**Deployment Status:** Ready to proceed ✅
**Last Updated:** February 26, 2026
