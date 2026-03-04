# POS Sync Agent - Render Deployment Guide

## Quick Summary

The POS Sync Agent has been fully integrated into Citi-Nati. Here's what's ready:

✅ Backend service for POS integration  
✅ Admin endpoint to sync products (`POST /api/products/sync/pos`)  
✅ Frontend hooks for POS data (React hooks)  
✅ Environment configuration for Render  
✅ Complete documentation

## Pre-Deployment Setup (Local)

### 1. Start POS Sync Agent Locally

On your Windows desktop:

```bash
cd pos-sync-agent
npm install
cp .env.example .env
# Edit .env with your SQL Server credentials
npm start
```

Expected output:
```
Database connection pool established
POS Sync Agent listening on port 3001
API Key validation: ENABLED
Database: localhost/POS
```

Test health check:
```bash
curl http://localhost:3001/health
```

### 2. Configure Backend

In `citi-nati-backend/.env`:

```env
# New POS variables
ENABLE_POS_SYNC=true
POS_AGENT_URL=http://localhost:3001
POS_SECRET=your-pos-secret-key
```

### 3. Test Backend Sync Endpoint (Local)

Get admin token, then test:

```bash
curl -X POST http://localhost:5000/api/products/sync/pos \
  -H "Authorization: Bearer <admin-token>" \
  -H "Content-Type: application/json"
```

Should return:
```json
{
  "success": true,
  "synced": 150,
  "skipped": 0,
  "total": 150
}
```

## Render Deployment Steps

### Step 1: Update Backend Environment Variables on Render

In your Render dashboard:

1. Go to Backend → Settings → Environment
2. Add these variables:

```env
ENABLE_POS_SYNC=true
POS_AGENT_URL=http://windows-machine-ip:3001
POS_SECRET=your-pos-secret-key
```

**Important:** Replace `windows-machine-ip` with:
- Your Windows machine's local IP (e.g., `192.168.1.5`)
- Only if Windows machine is on same network as Render
- Or use a public IP if running on cloud

### Step 2: Make Windows POS Agent Accessible

#### Option A: Same Local Network (Simplest)

1. Windows machine and Render must be on same network
2. Find Windows machine IP:
   ```powershell
   ipconfig
   # Look for "IPv4 Address: 192.168.x.x"
   ```
3. Configure Windows Firewall to allow port 3001:
   ```powershell
   New-NetFirewallRule -DisplayName "POS Sync Agent" `
       -Direction Inbound `
       -LocalPort 3001 `
       -Protocol TCP `
       -Action Allow
   ```

#### Option B: VPN/Tunnel (More Secure)

Use ngrok to expose local port to internet:

```bash
# Install ngrok from https://ngrok.com
ngrok http 3001
```

Set `POS_AGENT_URL` to ngrok URL in Render environment variables.

#### Option C: Cloud VM (Most Reliable)

Deploy POS agent to always-on Windows VM in Azure/AWS, set URL to VM's public IP.

### Step 3: Deploy Updated Backend

```bash
cd citi-nati-backend
git add .
git commit -m "Add POS sync integration"
git push
# Render auto-deploys
```

Monitor deployment in Render dashboard.

### Step 4: Deploy Updated Frontend

```bash
cd citi-nati-frontend
git add .
git commit -m "Add POS integration hooks and documentation"
git push
# Render auto-deploys
```

### Step 5: Test Deployment

#### Test Backend Endpoints

```bash
# Test GET products (should work)
curl https://your-backend.onrender.com/api/products

# Test POST sync (requires admin auth)
curl -X POST https://your-backend.onrender.com/api/products/sync/pos \
  -H "Authorization: Bearer <admin-token>"
```

#### Verify in Render Logs

Frontend:
```
[POS Sync] Deployed and ready
```

Backend:
```
[POS Sync Service] Configured with POS_AGENT_URL=...
```

### Step 6: Create Admin UI for Syncing

Add this button to your admin dashboard:

```javascript
// admin/Sync POS.jsx
import { useState } from 'react';
import api from '../../utils/api.js';
import toast from 'react-hot-toast';

export function POSSyncButton() {
  const [loading, setLoading] = useState(false);
  const [lastSync, setLastSync] = useState(null);

  const handleSync = async () => {
    try {
      setLoading(true);
      console.log('Starting POS sync...');
      
      const response = await api.post('/products/sync/pos');
      
      if (response.data.success) {
        setLastSync(new Date());
        toast.success(
          `✅ Synced ${response.data.synced} products, ${response.data.skipped} skipped`
        );
      } else {
        toast.error(`❌ ${response.data.error}`);
      }
    } catch (error) {
      console.error('Sync error:', error);
      toast.error(error.response?.data?.error || 'Sync failed - is POS agent running?');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: '20px', backgroundColor: '#f5f5f5', borderRadius: '8px' }}>
      <h3>POS Product Sync</h3>
      <p>Manually sync products from POS SQL Server database</p>
      
      {lastSync && (
        <p style={{ fontSize: '12px', color: '#666' }}>
          Last synced: {lastSync.toLocaleString()}
        </p>
      )}
      
      <button
        onClick={handleSync}
        disabled={loading}
        style={{
          padding: '10px 20px',
          backgroundColor: '#007bff',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: loading ? 'not-allowed' : 'pointer',
          opacity: loading ? 0.6 : 1,
        }}
      >
        {loading ? '⏳ Syncing...' : '🔄 Sync Now'}
      </button>
    </div>
  );
}
```

## Architecture on Render

```
┌─────────────────────────────────┐
│   Render.com (Cloud)            │
│                                 │
│  ┌─────────────────────────┐    │
│  │   React Frontend        │    │
│  │  (Hosted Static Site)   │    │
│  └────────────┬────────────┘    │
│               │                 │
│               ▼                 │
│  ┌─────────────────────────┐    │
│  │  Express Backend        │    │
│  │  + POS Integration      │    │
│  └─────────────┬───────────┘    │
│                │                │
│                ▼                │
│  ┌─────────────────────────┐    │
│  │  PostgreSQL Database    │    │
│  │  (Synced products)      │    │
│  └─────────────────────────┘    │
└────────────────┬────────────────┘
                 │
                 │ (Network request)
                 │ POS_AGENT_URL
                 ▼
    ┌────────────────────┐
    │  Windows Desktop   │
    │  POS Sync Agent    │
    │  (Port 3001)       │
    └────────────┬───────┘
                 │
                 ▼
    ┌────────────────────┐
    │  SQL Server        │
    │  POS Database      │
    └────────────────────┘
```

## Troubleshooting Render Deployment

### "Cannot connect to POS Agent"

**Symptoms:**
```
[POS Sync] Error: ECONNREFUSED at POS_AGENT_URL
```

**Solutions:**

1. Verify Windows machine IP:
   ```powershell
   ipconfig /all
   ```

2. Check POS agent is running:
   ```powershell
   netstat -ano | findstr :3001
   ```

3. Test from Render server (use Render's shell):
   ```bash
   curl http://your-windows-ip:3001/health
   ```

4. Check firewall:
   - Windows Firewall should allow port 3001
   - Router should allow port forwarding if on different network

### "Unauthorized: Invalid API key"

**Cause:** POS_SECRET mismatch

**Fix:**
1. Check `POS_SECRET` in Render env vars
2. Check `.env` on Windows POS agent
3. Make sure they match exactly (no spaces)

### "Products not syncing"

**Check:**
1. Log into POS database directly:
   ```sql
   SELECT COUNT(*) FROM POS.dbo.productsmaster WHERE Active = 1
   SELECT COUNT(*) FROM POS.dbo.productprices WHERE LocationCode = 'SH'
   SELECT COUNT(*) FROM POS.dbo.StocksReport WHERE LocationCode = 'SH'
   ```

2. Test POS agent directly:
   ```bash
   curl -H "x-pos-secret: your-secret" http://localhost:3001/pos-sync/products
   ```

3. Check Render backend logs for errors

### "Connection timeout"

**Cause:** Network connectivity issue

**Solutions:**
1. Verify network path from Render to Windows
2. Increase timeout if slow network:
   ```javascript
   // In posSync.service.js
   timeout: 30000  // Increase from 15000ms
   ```

## Monitoring & Maintenance

### Check Sync Status

```bash
# In Render bash terminal
curl https://your-backend/api/products
# Should show synced products with sourceCode field
```

### View Logs

**Render Dashboard:**
1. Backend → Logs
2. Search for "[POS Sync]"
3. Check for errors or sync history

### Set Up Alerts

In Render Dashboard:
1. Settings → Notification Rules
2. Alert if service unavailable
3. Alert if error logs contain "[POS Sync]"

### Backup Strategy

Before syncing, backup database:

```bash
# Render PostgreSQL backup
pg_dump DATABASE_URL > backup.sql
```

## Performance Tuning

### Adjust Sync Frequency

If syncing too frequently:

```javascript
// Schedule sync once per day at 2 AM server time
const cron = require('node-cron');
const { syncProductsFromPOS } = require('../services/posSync.service');

cron.schedule('0 2 * * *', async () => {
  console.log('[CRON] Starting daily POS sync...');
  const result = await syncProductsFromPOS();
  console.log('[CRON] Sync result:', result);
});
```

### Limit Sync Scope

Only sync specific categories:

```javascript
// In posSync.service.js
const allowedCategories = ['Beverages', 'Snacks', 'Groceries'];
// Add filter logic
```

## Production Checklist

- [ ] POS agent running on Windows desktop
- [ ] Backend environment variables set in Render
- [ ] Frontend deployment completed
- [ ] Test `/api/products` endpoint returns data
- [ ] Test `/api/products/sync/pos` as admin
- [ ] Verify products appear on Products page
- [ ] Check stock quantities are accurate
- [ ] Monitor initial sync logs
- [ ] Set up admin UI sync button
- [ ] Document Windows desktop maintenance procedure
- [ ] Train support team on manual sync process
- [ ] Create backup/rollback procedure

## Post-Deployment

### Daily Checks

1. Verify latest sync timestamp in database
2. Check for error logs in Render
3. Monitor product counts before/after sync

### Weekly Tasks

1. Review sync errors and address issues
2. Test manual sync functionality
3. Verify Windows POS agent is still running

### Monthly Tasks

1. Optimize database indexes
2. Review performance metrics
3. Plan maintenance windows

## Support Resources

- [POS Sync Agent Docs](pos-sync-agent/README.md)
- [Backend Integration Docs](POS_FULL_IMPLEMENTATION.md)
- [Frontend Integration Guide](citi-nati-frontend/POS_INTEGRATION_GUIDE.md)
- [Quick Reference](citi-nati-frontend/POS_QUICK_REFERENCE.md)

## Next Steps

1. ✅ Deploy backend to Render
2. ✅ Deploy frontend to Render
3. 📋 Configure POS_AGENT_URL in Render env vars
4. 📋 Test sync endpoint
5. 📋 Create admin sync button
6. 📋 Document maintenance procedure
7. 📋 Train team

---

**Questions?** See the documentation files or check deployment logs in Render dashboard.
