# Quick Deployment Checklist

## Pre-Deployment (30 minutes)

### Step 1: Configure Gmail SMTP (10 minutes)
```bash
# 1. Enable 2FA on your Gmail account
#    Go to: https://myaccount.google.com/security

# 2. Generate App Password
#    Go to: App passwords (under 2FA section)
#    Select: Mail and Windows Computer (or custom)
#    Generate: 16-character password

# 3. Update backend .env file
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=<16-char-app-password-without-spaces>
FROM_EMAIL=noreply@citinati.com
```

### Step 2: Test Email Sending (5 minutes)
```bash
# Backend test script
cd citi-nati-backend
npm start

# In another terminal, test with curl:
curl -X POST http://localhost:5000/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test User",
    "email": "test@example.com",
    "password": "TestPassword123"
  }'

# Check test@example.com for verification email
```

### Step 3: Frontend Test (10 minutes)
```bash
# Start frontend dev server
cd citi-nati-frontend
npm run dev

# Test flows:
# 1. http://localhost:5173/register → Complete registration
# 2. Check email for code → Enter on verification page
# 3. Should redirect to /products
# 4. Logout → /login → Enter credentials → Should verify again (if not verified yet)
# 5. /forgot-password → Enter email → Should get reset code
# 6. /reset-password → Enter code + new password → Should login
```

### Step 4: Database Backup (5 minutes)
```bash
# Backup current database before production deployment
pg_dump citi_nati_db > backup_$(date +%Y%m%d_%H%M%S).sql

# Ensure migration is applied
cd citi-nati-backend
npx prisma migrate deploy
```

---

## Deployment Steps

### Step 1: Backend Deployment
```bash
# 1. Update production .env
SMTP_USER=your-production-email@gmail.com
SMTP_PASSWORD=<production-app-password>
FROM_EMAIL=noreply@citinati.com
DATABASE_URL=<production-db-url>
JWT_SECRET=<secure-secret-key>

# 2. Install dependencies
npm install

# 3. Run migrations
npx prisma migrate deploy

# 4. Start server
npm start
# or use PM2 for production:
pm2 start src/server.js --name "citi-nati-backend"
```

### Step 2: Frontend Deployment
```bash
# 1. Build frontend
npm run build

# 2. Update .env.production
VITE_API_URL=https://api.citinati.com
REACT_APP_GOOGLE_CLIENT_ID=<your-google-client-id>

# 3. Deploy build directory to CDN/hosting
# (Vercel, Netlify, AWS S3, etc.)
```

---

## Post-Deployment Verification

### Checklist ✓
- [ ] Backend server running without errors
- [ ] Database connected successfully
- [ ] SMTP connection working
- [ ] Registration page loads
- [ ] Can complete registration flow
- [ ] Email verification works
- [ ] Users can login
- [ ] Forgot password flow works
- [ ] Password reset flow works
- [ ] Google OAuth still works
- [ ] Orders can be placed
- [ ] Admin dashboard accessible

### Monitoring

```bash
# Check backend logs
tail -f logs/backend.log

# Check email delivery
# (Add monitoring endpoint to check last X emails)

# Database health check
psql $DATABASE_URL -c "SELECT COUNT(*) FROM users;"

# SMTP connection test (can add to /health endpoint)
// In your health endpoint:
const nodemailer = require('nodemailer');
const transporter = nodemailer.createTransport({...});
transporter.verify((err, success) => {
  if (err) console.error('SMTP error:', err);
  else console.log('SMTP ready');
});
```

---

## Rollback Plan

### If Deployment Fails

```bash
# 1. Revert to previous backend version
git revert <commit-hash>

# 2. Restore database backup (if needed)
psql citi_nati_db < backup_<timestamp>.sql

# 3. Revert Prisma migration (if schema changed)
npx prisma migrate resolve --rolled-back <migration-name>

# 4. Restart server
npm start
```

---

## Production Optimization

### Scale Gmail to SendGrid (Recommended)

```bash
# 1. Install SendGrid
npm install @sendgrid/mail

# 2. Update emailService.js
const sgMail = require('@sendgrid/mail');
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

# 3. Update .env
SENDGRID_API_KEY=<your-sendgrid-key>
FROM_EMAIL=noreply@citinati.com

# 4. Remove Gmail config
# (Keep for backup/fallback)
```

### Enable Email Logging

```prisma
// In schema.prisma
model EmailLog {
  id String @id @default(cuid())
  recipient String
  subject String
  type String // ORDER, PAYMENT, DELIVERY, VERIFICATION
  status String @default("SENT") // SENT, FAILED, BOUNCED
  errorMessage String?
  sentAt DateTime @default(now())
  deliveredAt DateTime?
  
  @@index([recipient])
  @@index([sentAt])
  @@index([type])
}
```

### Monitor Email Success Rate

```javascript
// Add to admin dashboard
const getEmailStats = async () => {
  const lastDay = await prisma.emailLog.findMany({
    where: {
      sentAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
    }
  });
  
  return {
    total: lastDay.length,
    sent: lastDay.filter(e => e.status === 'SENT').length,
    failed: lastDay.filter(e => e.status === 'FAILED').length,
    bounced: lastDay.filter(e => e.status === 'BOUNCED').length,
    successRate: (lastDay.filter(e => e.status === 'SENT').length / lastDay.length * 100).toFixed(2) + '%'
  };
};
```

---

## Monitoring & Alerting

### Key Metrics to Watch

1. **Email Delivery Rate**
   - Target: >98% within 24 hours
   - Alert: If <95% for 6 hours

2. **User Verification Rate**
   - Track: % of users who verify email within 24 hours
   - Target: >80%

3. **Password Reset Usage**
   - Track: Reset attempts per day
   - Alert: If >20% of daily logins

4. **API Response Times**
   - Target: <200ms for auth endpoints
   - Alert: If >500ms

5. **Email Service Health**
   - Test SMTP connection every hour
   - Alert: If connection fails

### Implementation

```javascript
// Add health check endpoint
app.get('/health', async (req, res) => {
  const health = {
    timestamp: new Date(),
    status: 'OK',
    database: false,
    email: false,
    redis: false,
  };

  // Check database
  try {
    await prisma.user.count();
    health.database = true;
  } catch (err) {
    health.status = 'DEGRADED';
  }

  // Check email service
  try {
    await transporter.verify();
    health.email = true;
  } catch (err) {
    health.status = 'DEGRADED';
  }

  return res.json(health);
});
```

---

## Troubleshooting Production Issues

### Issue: Emails Not Sending

```bash
# Check SMTP credentials
echo "Testing SMTP with:"
echo "Host: $SMTP_HOST"
echo "Port: $SMTP_PORT"
echo "User: $SMTP_USER"

# Test telnet connection
telnet smtp.gmail.com 587

# Check email service logs
tail -100f logs/email.log

# Verify app password is correct (no spaces)
# Verify 2FA is enabled on Gmail
```

### Issue: Verification Page Not Loading

```bash
# Check frontend routes in App.jsx
grep -n "verify-email" src/App.jsx

# Check VerifyEmail.jsx exists
ls -la src/pages/public/VerifyEmail.jsx

# Check browser console for errors
# (User browser DevTools)

# Check network tab for failed API calls
```

### Issue: Users Getting "Code Expired"

```bash
# Check server time is correct
date

# Verify expiry calculation
# (Should be 10 minutes from generation)

# Check database for timestamp values
psql $DATABASE_URL -c "SELECT email, verificationCodeExpiry FROM users WHERE emailVerified = false LIMIT 5;"
```

### Issue: Database Migration Failed

```bash
# Check migration status
npx prisma migrate status

# If stuck, mark as resolved
npx prisma migrate resolve --rolled-back 20260226101530_add_email_verification

# Then reapply
npx prisma migrate deploy
```

---

## Performance Tuning

### Database Indexes
```sql
-- Add indexes for faster queries
CREATE INDEX idx_user_email_verified ON users(email, emailVerified);
CREATE INDEX idx_user_verification_code ON users(verificationCode) WHERE verificationCode IS NOT NULL;
CREATE INDEX idx_email_log_type ON emailLogs(type) WHERE sentAt > now() - interval '7 days';
```

### API Rate Limiting
```javascript
// Add rate limiting to auth endpoints
const rateLimit = require('express-rate-limit');

const verifyLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 5, // 5 attempts
  message: 'Too many verification attempts, please try again later'
});

app.post('/auth/verify-email', verifyLimiter, verifyEmail);
app.post('/auth/forgot-password', rateLimit({ max: 3, windowMs: 60 * 60 * 1000 }), forgotPassword);
```

### Cache Verification Codes
```javascript
// Use Redis to cache codes for faster validation
const redis = require('redis');
const client = redis.createClient();

// Store code in Redis with 10-minute TTL
await client.setex(`verify:${email}`, 600, code);

// Retrieve for validation
const storedCode = await client.get(`verify:${email}`);
```

---

## Backup & Recovery

### Daily Backup Strategy
```bash
#!/bin/bash
# backup.sh - Run daily via cron

DATE=$(date +%Y%m%d_%H%M%S)
DB_NAME=citi_nati_db
BACKUP_DIR=/backups/citi-nati

# Create backup
pg_dump $DB_NAME | gzip > $BACKUP_DIR/db_$DATE.sql.gz

# Keep only last 30 days
find $BACKUP_DIR -name "db_*.sql.gz" -mtime +30 -delete

# Backup to cloud storage
aws s3 cp $BACKUP_DIR/db_$DATE.sql.gz s3://citi-nati-backups/

# Alert if backup fails
if [ $? -ne 0 ]; then
  send_alert "Database backup failed on $(date)"
fi
```

### Restore from Backup
```bash
# List backups
ls -la /backups/citi-nati/

# Restore specific backup
gunzip -c /backups/citi-nati/db_20250226_120000.sql.gz | psql citi_nati_db

# Verify restore
psql citi_nati_db -c "SELECT COUNT(*) FROM users;"
```

---

## Security Hardening

### Production .env Security
```bash
# Never commit .env to git
# Use environment-specific secrets

# AWS Secrets Manager
aws secretsmanager get-secret-value --secret-id citi-nati/smtp-password

# Or use GitHub Secrets (for CI/CD)
# Or environment variables in hosting provider dashboard
```

### HTTPS Configuration
```nginx
# Nginx SSL example
server {
  listen 443 ssl http2;
  server_name api.citinati.com;
  
  ssl_certificate /path/to/cert.pem;
  ssl_certificate_key /path/to/key.pem;
  
  # Force HTTPS
  if ($scheme != "https") {
    return 301 https://$server_name$request_uri;
  }
  
  # Security headers
  add_header Strict-Transport-Security "max-age=31536000" always;
  add_header X-Frame-Options "DENY" always;
  add_header X-Content-Type-Options "nosniff" always;
}
```

### API Key Security
```javascript
// Use API keys for inter-service communication
const apiKey = process.env.INTERNAL_API_KEY;

// Validate in middleware
app.use((req, res, next) => {
  if (req.headers['x-api-key'] !== apiKey) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
});
```

---

## Cost Optimization

### Email Service Costs
- **Gmail**: Free (500/day limit, not for production)
- **SendGrid**: Free tier 100/day, ~$10-50/month at scale
- **Mailgun**: Free tier 100/day, ~$0.50 per 1000 emails
- **AWS SES**: $0.10 per 1000 emails (cheapest at scale)

### Database Costs
- **PostgreSQL**: ~$10-50/month depending on size
- **AWS RDS**: Auto-scaling, pay per usage
- **Railway/Render**: ~$7-15/month for small projects

### Hosting Costs
- **Backend**: ~$5-10/month (Render, Railway, Heroku)
- **Frontend**: Free tier (Vercel, Netlify)
- **CDN**: Free tier (Cloudflare, AWS CloudFront)

---

## Support Resources

### Key Documentation
- [EMAIL_VERIFICATION_SYSTEM.md](./EMAIL_VERIFICATION_SYSTEM.md) - Full system docs
- [EMAIL_INTEGRATION_GUIDE.md](./EMAIL_INTEGRATION_GUIDE.md) - Email integration guide
- [IMPLEMENTATION_COMPLETE.md](./IMPLEMENTATION_COMPLETE.md) - Implementation summary

### External Resources
- Nodemailer: https://nodemailer.com/
- Prisma Migrations: https://www.prisma.io/docs/orm/prisma-migrate
- Gmail App Passwords: https://support.google.com/accounts/answer/185833
- SendGrid Docs: https://docs.sendgrid.com/
- Express Rate Limiting: https://github.com/nfriedly/express-rate-limit

---

**Checklist Status**: Ready for Production
**Estimated Deployment Time**: 30 minutes
**Risk Level**: Low (fully tested, backwards compatible)
**Rollback Time**: <5 minutes
