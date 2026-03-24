# Citi-Nati Supermarket — Full Deployment Guide

> **Stack:** React 18 (Vite) Frontend · Node.js/Express Backend · PostgreSQL (Prisma) · Socket.IO · Cloudinary · SendGrid · PayChangu · Google OAuth

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Domain Purchase and Configuration](#2-domain-purchase-and-configuration)
3. [Choosing a Hosting Provider](#3-choosing-a-hosting-provider)
4. [Option A — Deploy on Render (Recommended)](#4-option-a--deploy-on-render-recommended)
5. [Option B — Deploy on Railway](#5-option-b--deploy-on-railway)
6. [Option C — Deploy on a VPS (DigitalOcean / Hetzner / Linode)](#6-option-c--deploy-on-a-vps-digitalocean--hetzner--linode)
7. [Database Setup (PostgreSQL)](#7-database-setup-postgresql)
8. [Environment Variables Reference](#8-environment-variables-reference)
9. [Third-Party Service Configuration](#9-third-party-service-configuration)
10. [Connecting Your Custom Domain](#10-connecting-your-custom-domain)
11. [SSL / HTTPS](#11-ssl--https)
12. [Post-Deployment Steps](#12-post-deployment-steps)
13. [Monitoring and Maintenance](#13-monitoring-and-maintenance)
14. [Troubleshooting](#14-troubleshooting)

---

## 1. Architecture Overview

```
                         ┌─────────────────────────┐
                         │   Custom Domain (DNS)   │
                         │  citinati.com            │
                         └────────┬────────────────┘
                                  │
               ┌──────────────────┴───────────────────┐
               │                                       │
       ┌───────▼────────┐                    ┌─────────▼───────┐
       │  FRONTEND       │                    │  BACKEND API    │
       │  React/Vite     │  ──── HTTPS ────▶  │  Node/Express   │
       │  (Static Host)  │                    │  Port 10000     │
       └─────────────────┘                    └─────────┬───────┘
                                                        │
                              ┌─────────────────────────┼────────────────────┐
                              │                         │                    │
                    ┌─────────▼──────┐     ┌────────────▼──────┐  ┌─────────▼──────┐
                    │  PostgreSQL DB  │     │  Cloudinary CDN   │  │  SendGrid Email │
                    │  (Hosted DB)    │     │  (Images/Media)   │  │  (Transactional)│
                    └────────────────┘     └───────────────────┘  └────────────────┘

Windows POS Machine (Local Network) ──── POS Sync Agent ──▶ Backend API
```

**Two deployables:**
| App | Technology | Purpose |
|-----|-----------|---------|
| `citi-nati-frontend` | React 18 + Vite → static files | Customer storefront, Admin dashboard, Cashier POS |
| `citi-nati-backend` | Node.js 18 + Express + Prisma | REST API, WebSocket (Socket.IO), Auth, Payments |

---

## 2. Domain Purchase and Configuration

### 2.1 Buying a Domain

Choose a domain registrar. Recommended options:

| Registrar | Price (typical .com) | Notes |
|-----------|---------------------|-------|
| **Namecheap** | ~$10–13/yr | Free WhoisGuard privacy, easy DNS management |
| **Cloudflare Registrar** | ~$9–10/yr | At-cost pricing, built-in proxy & DDoS protection |
| **GoDaddy** | ~$12–20/yr | Widely known, upsell-heavy |
| **Google Domains / Squarespace** | ~$12/yr | Clean interface |

**Suggested domain examples:**
- `citinati.com`
- `citi-nati.com`
- `citinati.co.mw` (Malawi ccTLD)

**Steps on Namecheap (example):**
1. Go to [namecheap.com](https://www.namecheap.com) → search your domain name.
2. Add to cart → check out (create account if needed).
3. Enable **Auto-Renew** to avoid accidental expiry.
4. Enable **WhoisGuard** (free) to protect your personal info.

### 2.2 DNS Basics You Will Use

| Record Type | Purpose |
|-------------|---------|
| `A` | Points domain to an IP address (VPS hosting) |
| `CNAME` | Points subdomain to another hostname (Render, Railway, etc.) |
| `TXT` | Domain ownership verification (SSL, Google, SendGrid) |
| `MX` | Email routing (if using custom email) |

---

## 3. Choosing a Hosting Provider

| Provider | Best For | Free Tier | Notes |
|----------|----------|-----------|-------|
| **Render** | Easy PaaS, background workers | Yes (spins down after inactivity) | Best for this project — one-click deploys from GitHub |
| **Railway** | Fast deploys from GitHub | $5 credit/month | Very developer-friendly |
| **DigitalOcean App Platform** | Managed PaaS | No free tier | Reliable, ~$5–12/mo |
| **DigitalOcean Droplet** | Full Linux VPS | No free tier | Full control, more setup required |
| **Hetzner VPS** | Cheapest VPS | No free tier | €3.79/mo base, excellent value |
| **Vercel** | Frontend only | Yes | Cannot host Node.js long-running servers |
| **Netlify** | Frontend only | Yes | Same limitation as Vercel |

**Recommended for this project:**
- **Frontend:** Render (static site) or Vercel/Netlify
- **Backend:** Render (web service) or Railway
- **Database:** Render PostgreSQL or Supabase or Railway PostgreSQL

---

## 4. Option A — Deploy on Render (Recommended)

This is the current production target (backend already configured with `onrender.com` URLs).

### 4.1 Create a Render Account

1. Go to [render.com](https://render.com) → Sign Up with GitHub.
2. Connect your GitHub account when prompted.
3. Authorize Render to access the `AubieOB/citi-nati-supermarket` repository.

### 4.2 Deploy the PostgreSQL Database

1. In the Render dashboard → click **New +** → **PostgreSQL**.
2. Fill in:
   - **Name:** `citi-nati-db`
   - **Database:** `citi_nati`
   - **User:** leave default or set `citi_nati_user`
   - **Region:** Choose the closest to your users (e.g. `Frankfurt EU`, `Ohio US`)
   - **Plan:** Free (for testing) or Starter ($7/mo for production)
3. Click **Create Database**.
4. Copy the **Internal Database URL** (used by the backend on Render) and the **External Database URL** (used for migrations from your machine).

> ⚠️ **Free PostgreSQL on Render expires after 90 days.** Use a paid plan or Supabase for permanent hosting.

### 4.3 Deploy the Backend (Web Service)

1. In Render → **New +** → **Web Service**.
2. Connect your GitHub repo → select `citi-nati-supermarket`.
3. Configure:
   - **Name:** `citi-nati-backend`
   - **Root Directory:** `citi-nati-backend`
   - **Environment:** `Node`
   - **Build Command:** `npm install && npx prisma generate`
   - **Start Command:** `npm start`
     *(This runs `prisma migrate deploy && node src/server.js`)*
   - **Plan:** Free or Starter
4. Under **Environment Variables**, add all variables from [Section 8](#8-environment-variables-reference).
5. Click **Create Web Service**.
6. Wait for first deploy — watch logs for `Server running on port 10000`.

### 4.4 Deploy the Frontend (Static Site)

1. In Render → **New +** → **Static Site**.
2. Connect the same repo.
3. Configure:
   - **Name:** `citi-nati-frontend`
   - **Root Directory:** `citi-nati-frontend`
   - **Build Command:** `npm install && npm run build`
   - **Publish Directory:** `dist`
4. Under **Environment Variables**, add:
   ```
   VITE_API_BASE_URL=https://citi-nati-backend.onrender.com/api
   VITE_BACKEND_URL=https://citi-nati-backend.onrender.com
   VITE_GOOGLE_CLIENT_ID=<your google client id>
   VITE_APP_NAME=Citi-Nati Supermarket
   VITE_APP_VERSION=1.0.0
   ```
5. Click **Create Static Site**.
6. Render will build and serve your frontend at `https://citi-nati-frontend.onrender.com`.

### 4.5 Add a Redirect Rule for React Router

Since the frontend is a Single Page Application (SPA), all routes must redirect to `index.html`.

In Render static site settings → **Redirects/Rewrites**:
- **Source:** `/*`
- **Destination:** `/index.html`
- **Type:** `Rewrite`

---

## 5. Option B — Deploy on Railway

### 5.1 Create a Railway Account

1. Go to [railway.app](https://railway.app) → Sign Up with GitHub.

### 5.2 Create a New Project

1. Dashboard → **New Project** → **Deploy from GitHub repo**.
2. Select `AubieOB/citi-nati-supermarket`.

### 5.3 Add PostgreSQL Service

1. In the project → **New Service** → **Database** → **PostgreSQL**.
2. Railway auto-provisions the database.
3. Click the database service → **Connect** → copy `DATABASE_URL`.

### 5.4 Configure Backend Service

1. Click your repo service → **Settings**:
   - **Root Directory:** `citi-nati-backend`
   - **Build Command:** `npm install && npx prisma generate`
   - **Start Command:** `npm start`
2. Under **Variables**, add all backend env vars.
3. Railway auto-assigns a domain like `citi-nati-backend.up.railway.app`.

### 5.5 Add Frontend Service

1. **New Service** in same project → **GitHub Repo** → same repo.
2. Settings:
   - **Root Directory:** `citi-nati-frontend`
   - **Build Command:** `npm install && npm run build`
   - **Start Command:** `npm run start`
     *(runs `serve -s dist` from package.json)*
3. Set VITE_ env vars pointing to Railway backend URL.

---

## 6. Option C — Deploy on a VPS (DigitalOcean / Hetzner / Linode)

Best option if you want full control, fixed pricing, and no cold-start delays.

### 6.1 Create a Server

**DigitalOcean Droplet:**
1. [digitalocean.com](https://www.digitalocean.com) → **Droplets** → **Create Droplet**.
2. Choose **Ubuntu 22.04 LTS**.
3. Plan: **Basic** → **Regular** → **$6/mo** (1 vCPU, 1 GB RAM, 25 GB SSD).
4. Choose a datacenter region close to your customers.
5. Add your SSH key (or use a password).
6. Click **Create Droplet**.

**Hetzner (cheaper):**
1. [hetzner.com](https://www.hetzner.com) → **Cloud** → **New Server**.
2. Choose **Ubuntu 22.04**, **CX11** (€3.85/mo, 1 vCPU, 2 GB RAM).

### 6.2 Initial Server Setup

SSH into your server:
```bash
ssh root@YOUR_SERVER_IP
```

Update and install dependencies:
```bash
apt update && apt upgrade -y
apt install -y git curl ufw nginx certbot python3-certbot-nginx
```

Install Node.js 20:
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
node -v   # should print v20.x.x
```

Install PM2 (process manager):
```bash
npm install -g pm2
```

Install PostgreSQL:
```bash
apt install -y postgresql postgresql-contrib
systemctl enable postgresql
systemctl start postgresql
```

### 6.3 Create the Database

```bash
sudo -u postgres psql
```
Inside psql:
```sql
CREATE USER citi_nati_user WITH PASSWORD 'your-strong-password-here';
CREATE DATABASE citi_nati OWNER citi_nati_user;
GRANT ALL PRIVILEGES ON DATABASE citi_nati TO citi_nati_user;
\q
```

Your `DATABASE_URL` will be:
```
postgresql://citi_nati_user:your-strong-password-here@localhost:5432/citi_nati
```

### 6.4 Clone and Build the Project

```bash
cd /var/www
git clone https://github.com/AubieOB/citi-nati-supermarket.git
cd citi-nati-supermarket
```

**Build the backend:**
```bash
cd citi-nati-backend
cp .env.production.example .env
nano .env   # fill in all values
npm install
npx prisma generate
npx prisma migrate deploy
```

Seed the admin account:
```bash
node scripts/seedAdmin.js
```

**Build the frontend:**
```bash
cd ../citi-nati-frontend
nano .env   # set VITE_API_BASE_URL=https://api.citinati.com/api
npm install
npm run build
# output is in ./dist/
```

### 6.5 Run Backend with PM2

```bash
cd /var/www/citi-nati-supermarket/citi-nati-backend
pm2 start src/server.js --name citi-nati-backend
pm2 save
pm2 startup   # follow the command it prints to make it auto-start on reboot
```

Check it's running:
```bash
pm2 status
pm2 logs citi-nati-backend
```

### 6.6 Configure Nginx

Create the Nginx config:
```bash
nano /etc/nginx/sites-available/citinati
```

Paste this (replace `citinati.com` with your actual domain):
```nginx
# Frontend
server {
    listen 80;
    server_name citinati.com www.citinati.com;

    root /var/www/citi-nati-supermarket/citi-nati-frontend/dist;
    index index.html;

    # React Router SPA fallback
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Cache static assets
    location ~* \.(?:ico|css|js|gif|jpe?g|png|woff2?)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}

# Backend API
server {
    listen 80;
    server_name api.citinati.com;

    location / {
        proxy_pass http://localhost:10000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        # WebSocket / Socket.IO support
        proxy_read_timeout 86400;
    }
}
```

Enable the config:
```bash
ln -s /etc/nginx/sites-available/citinati /etc/nginx/sites-enabled/
nginx -t   # test config — should print "syntax is ok"
systemctl reload nginx
```

### 6.7 Configure Firewall

```bash
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw enable
ufw status
```

---

## 7. Database Setup (PostgreSQL)

### 7.1 Run Prisma Migrations

Whether hosted on Render, Railway, or VPS, run this once after setting `DATABASE_URL`:
```bash
cd citi-nati-backend
npx prisma migrate deploy
```

### 7.2 Seed the Admin Account

After migrations, seed the first admin:
```bash
node scripts/seedAdmin.js
```
Or use Render's shell / Railway's connected terminal.

### 7.3 Prisma Studio (Optional — Remote Inspection)

You can connect Prisma Studio to the remote database from your local machine:
```bash
DATABASE_URL="your-external-db-url" npx prisma studio
```

### 7.4 Backups

**Render PostgreSQL** — set up automatic daily backups in Render dashboard → Database → Backups.

**VPS/self-hosted** — schedule a cron backup:
```bash
crontab -e
```
Add:
```cron
0 2 * * * pg_dump -U citi_nati_user citi_nati | gzip > /backups/citi_nati_$(date +\%Y\%m\%d).sql.gz
```

---

## 8. Environment Variables Reference

### Backend `.env` (full list)

```env
# ─── Core ──────────────────────────────────────────────────
DATABASE_URL="postgresql://user:password@host:5432/citi_nati"
PORT=10000
NODE_ENV=production
JWT_SECRET="generate-a-long-random-string-64-chars"

# ─── CORS / Origins ────────────────────────────────────────
FRONTEND_URL="https://citinati.com"
BACKEND_URL="https://api.citinati.com"

# ─── Payment (PayChangu) ────────────────────────────────────
PAYCHANGU_WEBHOOK_SECRET=citi_nati_webhook_secret_2026
PAYCHANGU_PUBLIC_KEY=pub-live-tSsi1pnanfaIdNSVNmJyJskSx9Miztqj
PAYCHANGU_SECRET_KEY=sec-live-FBgdaTih3IrNVAtx8fOyxPleujBglVdP
PAYCHANGU_ACCOUNT_ID=5407509
PAYCHANGU_ACCOUNT_NAME=Aubrey Mkhulana

# ─── Google OAuth ───────────────────────────────────────────
GOOGLE_CLIENT_ID=361426729141-lpmfihah46q614eiph1cr9eeklorhtvd.apps.googleusercontent.com

# ─── Email (SendGrid) ───────────────────────────────────────
SENDGRID_API_KEY=SG.your-api-key-here
FROM_EMAIL=noreply@citinati.com
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_SECURE=true
SMTP_USER=apikey

# ─── Cloudinary (Image CDN) ─────────────────────────────────
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret

# ─── POS Sync ───────────────────────────────────────────────
ENABLE_POS_SYNC=true
POS_AGENT_URL=http://192.168.1.100:3001
POS_SECRET=your-pos-agent-secret-key

# ─── Optional ───────────────────────────────────────────────
LOG_LEVEL=info
```

> **JWT_SECRET:** Generate with:
> ```bash
> node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
> ```

### Frontend `.env` (production)

```env
VITE_API_BASE_URL=https://api.citinati.com/api
VITE_BACKEND_URL=https://api.citinati.com
VITE_GOOGLE_CLIENT_ID=361426729141-lpmfihah46q614eiph1cr9eeklorhtvd.apps.googleusercontent.com
VITE_APP_NAME=Citi-Nati Supermarket
VITE_APP_VERSION=1.0.0
VITE_ENABLE_DARK_MODE=false
# POS not proxied from browser in production
VITE_POS_AGENT_URL=
VITE_POS_SECRET=
```

> ⚠️ **Important:** Frontend env vars starting with `VITE_` are baked into the static build at build time. You must rebuild (`npm run build`) after changing them.

---

## 9. Third-Party Service Configuration

### 9.1 Cloudinary (Image Uploads)

1. Go to [cloudinary.com](https://cloudinary.com) → Sign Up (free tier available).
2. Dashboard → copy **Cloud Name**, **API Key**, **API Secret**.
3. Add to backend `.env`:
   ```env
   CLOUDINARY_CLOUD_NAME=your-cloud-name
   CLOUDINARY_API_KEY=123456789
   CLOUDINARY_API_SECRET=abc-def-ghi
   ```

### 9.2 SendGrid (Transactional Email)

1. Go to [sendgrid.com](https://sendgrid.com) → Sign Up (100 emails/day free).
2. **Settings** → **API Keys** → **Create API Key** → Full Access.
3. Copy the key (shown only once) → add to `.env`:
   ```env
   SENDGRID_API_KEY=SG.xxxxxxxxxxxxxxxxxxxx
   FROM_EMAIL=noreply@citinati.com
   ```
4. **Verify your sender domain:**
   - Settings → Sender Authentication → Authenticate Your Domain.
   - Add the DNS records SendGrid gives you to your domain registrar.
   - This prevents emails from landing in spam.

### 9.3 Google OAuth

1. Go to [console.cloud.google.com](https://console.cloud.google.com).
2. Create a project (or use existing) → **APIs & Services** → **Credentials**.
3. **Create Credentials** → **OAuth 2.0 Client ID**.
4. Application type: **Web Application**.
5. Add **Authorized JavaScript Origins:**
   ```
   https://citinati.com
   https://www.citinati.com
   ```
6. Add **Authorized Redirect URIs:**
   ```
   https://citinati.com
   https://citinati.com/auth/google/callback
   ```
7. Copy the **Client ID** → update both backend and frontend `.env`.

### 9.4 PayChangu (Payments)

1. Log in to your PayChangu merchant account.
2. Your keys are already set in the project. For a new deployment just confirm:
   - `PAYCHANGU_PUBLIC_KEY` — public key for frontend payment initiation
   - `PAYCHANGU_SECRET_KEY` — secret key for backend verification
   - `PAYCHANGU_WEBHOOK_SECRET` — for verifying webhook payloads
3. In PayChangu dashboard → set your **Webhook URL** to:
   ```
   https://api.citinati.com/api/payment/webhook
   ```

---

## 10. Connecting Your Custom Domain

### 10.1 On Render

**Frontend (Static Site):**
1. Render Dashboard → your static site → **Settings** → **Custom Domains**.
2. Click **Add Custom Domain** → enter `citinati.com`.
3. Render gives you a CNAME target like `citi-nati-frontend.onrender.com`.
4. Go to your domain registrar → DNS settings:
   - Add `CNAME` record: `www` → `citi-nati-frontend.onrender.com`
   - Add `CNAME` record: `@` (or use ALIAS/ANAME if supported) → `citi-nati-frontend.onrender.com`
5. Wait for DNS propagation (up to 48 hours, usually under 1 hour).

**Backend (Web Service):**
1. Render → backend service → **Settings** → **Custom Domains**.
2. Add `api.citinati.com`.
3. Render gives you a CNAME target.
4. DNS: Add `CNAME` record: `api` → that target.

### 10.2 On a VPS

Your server has a static IP. Go to your domain registrar → DNS:

| Record Type | Host | Value | TTL |
|-------------|------|-------|-----|
| `A` | `@` | `YOUR.SERVER.IP` | 3600 |
| `A` | `www` | `YOUR.SERVER.IP` | 3600 |
| `A` | `api` | `YOUR.SERVER.IP` | 3600 |

`@` refers to the root domain (`citinati.com`). The `api` record points to the backend subdomain.

### 10.3 Verify DNS Propagation

Check with:
```bash
nslookup citinati.com
# or online: https://www.whatsmydns.net
```

---

## 11. SSL / HTTPS

### 11.1 Render / Railway / Vercel / Netlify

SSL is **automatic and free** — handled by the platform using Let's Encrypt. No action required once your custom domain is connected.

### 11.2 VPS with Certbot (Let's Encrypt)

After Nginx is configured and DNS is pointing to your server:
```bash
certbot --nginx -d citinati.com -d www.citinati.com
```
For the API subdomain:
```bash
certbot --nginx -d api.citinati.com
```

Certbot automatically:
- Obtains and installs the SSL certificate
- Updates your Nginx config to redirect HTTP → HTTPS
- Schedules auto-renewal (every 90 days)

Verify auto-renewal:
```bash
certbot renew --dry-run
```

### 11.3 Force HTTPS in the Backend

In `citi-nati-backend/src/server.js`, ensure CORS only allows HTTPS origins in production:
```js
// Already handled by FRONTEND_URL env var
origin: process.env.FRONTEND_URL
```

---

## 12. Post-Deployment Steps

After everything is live, run through this checklist in order:

### Step 1 — Run Database Migration
```bash
# On hosting platform shell, or from your machine with external DB URL:
cd citi-nati-backend
npx prisma migrate deploy
```

### Step 2 — Create the First Admin User
```bash
node scripts/seedAdmin.js
# or
node src/scripts/seedAdmin.js
```
Log in with the credentials from that script, then change the password in the Admin panel immediately.

### Step 3 — Bootstrap Admin Security Key
1. Navigate to `https://citinati.com/admin-login` → log in.
2. Go to **Admin Dashboard** → **Security** tab.
3. Set the **Admin Security Key** under the Admin panel.

### Step 4 — Verify Email System
1. Register a test account → confirm you receive a verification email.
2. Check the email is not in spam (if so, complete SendGrid domain authentication).

### Step 5 — Verify Payment System
1. Place a test order.
2. Complete the payment with a test card.
3. Confirm PayChangu webhook fires and order status updates.

### Step 6 — Verify Google OAuth
1. Try logging in via "Continue with Google".
2. If it fails, check that your production domain is in the Google OAuth console's authorized origins.

### Step 7 — Test the Cashier POS
1. Create a cashier account in the Admin → Cashiers panel.
2. Set their security PIN in Admin → Security → Cashier Security.
3. Log in as cashier at `https://citinati.com/cashier`.
4. Verify their PIN gate appears and POS loads.

### Step 8 — Test the Driver Portal
1. Create/assign a driver account.
2. Log in at `https://citinati.com/driver`.
3. Test order assignment and delivery status updates.

### Step 9 — Test POS Sync (if applicable)
1. Ensure the Windows POS Sync Agent is running with the matching `POS_SECRET`.
2. Admin → POS Management → check sync status.

---

## 13. Monitoring and Maintenance

### 13.1 Application Monitoring

- **Render:** Built-in metrics (CPU, memory, request logs) in the dashboard.
- **PM2 (VPS):** `pm2 monit` for real-time CPU/memory, `pm2 logs` for log tailing.

### 13.2 Uptime Monitoring (Free)

Use [UptimeRobot](https://uptimerobot.com) (free tier):
1. Create monitor → HTTP(s) → `https://citinati.com`
2. Create monitor → HTTP(s) → `https://api.citinati.com/api/health`
3. Set email/SMS alerts on downtime.

### 13.3 Keeping Dependencies Updated

```bash
# Check for outdated packages
cd citi-nati-backend && npm outdated
cd ../citi-nati-frontend && npm outdated

# Update packages
npm update
```

Test locally after any update before deploying.

### 13.4 Deploying Updates

**Render / Railway (automatic):**
- Any push to `main` branch triggers a new deploy automatically if auto-deploy is enabled.

**VPS (manual):**
```bash
cd /var/www/citi-nati-supermarket
git pull origin main

# Rebuild backend
cd citi-nati-backend
npm install
npx prisma generate
npx prisma migrate deploy
pm2 restart citi-nati-backend

# Rebuild frontend
cd ../citi-nati-frontend
npm install
npm run build
# Nginx is already serving ./dist/ — no restart needed
```

### 13.5 Rollback

```bash
# Find the previous commit
git log --oneline

# Revert to it
git checkout <commit-hash>
pm2 restart citi-nati-backend

# Or revert a specific bad commit
git revert <commit-hash>
git push origin main
```

---

## 14. Troubleshooting

### Backend won't start

```bash
# Check logs on Render / Railway
# On VPS:
pm2 logs citi-nati-backend

# Common causes:
# 1. DATABASE_URL is wrong or database not reachable
# 2. JWT_SECRET is missing
# 3. Prisma migrations haven't been run
```

Fix migration errors:
```bash
npx prisma migrate deploy
# If schema drift:
npx prisma db push --force-reset   # ⚠️ destroys all data — dev only!
```

### Frontend shows blank page / 404 on refresh

Cause: React Router routes not rewritten to `index.html`.

- **Render static site:** Add rewrite rule `/* → /index.html`.
- **Nginx:** Ensure `try_files $uri $uri/ /index.html;` is in the config.
- **Netlify:** Add `_redirects` file to `public/` folder:
  ```
  /*    /index.html    200
  ```

### CORS errors in browser console

```
Access to XMLHttpRequest at 'https://api.citinati.com/api/...' has been blocked...
```

Fix: In backend `.env`, set `FRONTEND_URL` to exactly match the origin your frontend is served from (including `https://`, no trailing slash):
```env
FRONTEND_URL=https://citinati.com
```

### Socket.IO not connecting

Ensure your reverse proxy (Nginx) supports WebSocket upgrades:
```nginx
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection 'upgrade';
proxy_read_timeout 86400;
```

### Images not uploading (Cloudinary)

- Verify `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` are set.
- Check the Cloudinary dashboard usage limits on free tier (25 GB storage, 25 GB bandwidth/month).

### Emails going to spam

- Complete **SendGrid Sender Domain Authentication**.
- Add `SPF` and `DKIM` DNS records as provided by SendGrid.
- Ensure `FROM_EMAIL` uses your verified domain (e.g., `noreply@citinati.com`), not a Gmail address.

### PayChangu webhook failing

- Confirm webhook URL is set in PayChangu dashboard: `https://api.citinati.com/api/payment/webhook`
- Confirm `PAYCHANGU_WEBHOOK_SECRET` matches exactly.
- In Render, check that the backend is not sleeping (use a paid plan to avoid cold starts on the API).

---

## Quick Reference Card

| Service | URL Pattern |
|---------|-------------|
| Customer Store | `https://citinati.com` |
| Admin Dashboard | `https://citinati.com/admin` |
| Admin Login | `https://citinati.com/admin-login` |
| Cashier POS | `https://citinati.com/cashier` |
| Driver Portal | `https://citinati.com/driver` |
| Backend API | `https://api.citinati.com/api` |
| Backend Health | `https://api.citinati.com/api/health` |

| Tool | Link |
|------|------|
| Render Dashboard | https://dashboard.render.com |
| Cloudinary | https://cloudinary.com/console |
| SendGrid | https://app.sendgrid.com |
| Google Cloud Console | https://console.cloud.google.com |
| PayChangu | https://app.paychangu.com |
| UptimeRobot | https://uptimerobot.com |

---

*Last updated: March 2026 — Citi-Nati Supermarket v1.0.0*
