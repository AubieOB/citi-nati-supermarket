# POS Sync Integration - Full Implementation Guide

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    Render Deployment                            │
├─────────────────────────────────────────────────────────────────┤
│  Frontend (React)                                               │
│    ├─ Products Page (uses backend API)                          │
│    └─ POS Integration (optional, local dev only)                │
│                                                                 │
│  Backend (Express + Prisma)                                    │
│    ├─ /api/products - Get products from DB                      │
│    ├─ /api/products/sync/pos - Manual POS sync (Admin)          │
│    └─ POS Service (connects to local Windows POS agent)         │
│                                                                 │
│  PostgreSQL Database                                            │
│    └─ Stores synced products & transactions                     │
└─────────────────────────────────────────────────────────────────┘

                              │
                              │ (Render network only)
                              │
                    ┌─────────┴─────────┐
                    │                   │
         ┌──────────▼──────────┐ ┌─────▼────────────┐
         │   Local Windows     │ │  POS Database    │
         │   POS Sync Agent    │ │  (SQL Server)    │
         │  (Port 3001)        │ └──────────────────┘
         └────────────────────┘
            (Runs on desktop)
```

## Implementation Summary

### 1. Backend Changes ✅

**New Service: `src/services/posSync.service.js`**
- `checkPOSHealth()` - Verify POS agent is running
- `syncProductsFromPOS()` - Fetch and sync products
- `getCategoriesFromPOS()` - Fetch categories
- `getStockFromPOS()` - Fetch stock levels
- `getPriceFromPOS()` - Get single product price
- `getStockFromPOSByCode()` - Get stock for product

**New Endpoint: `POST /api/products/sync/pos`**
- Admin-only endpoint
- Manually triggers sync from POS agent
- Returns sync statistics
- Requires admin authentication

**Updated: `src/routes/products.routes.js`**
- Added POST route for POS sync

### 2. Frontend Changes ✅

**New Service: `src/utils/posSyncService.js`**
- Provides methods to fetch POS data
- Works only in local development

**New Hooks: `src/hooks/usePOSProducts.js`**
- `usePOSProducts()` - Fetch products from POS
- `usePOSCategories()` - Fetch categories
- `usePOSStock()` - Fetch stock levels

**Component Example: `src/components/examples/POSProductsExample.jsx`**
- Complete shopping cart implementation
- Shows how to use POS data

## Deployment Strategy

### For Render (Production)

On Render, the POS Sync Agent is **NOT running**. Instead:

1. **Data Flow:**
   - Frontend → Backend API → PostgreSQL Database
   - Admin manually syncs POS data using `/api/products/sync/pos`

2. **Admin Workflow:**
   - Admin visits admin dashboard
   - Clicks "Sync from POS" button
   - Backend connects to local POS agent
   - Backend syncs products to database
   - Frontend fetches updated products from backend

3. **Configuration:**
   - Set `ENABLE_POS_SYNC=true` on backend
   - POS agent must be running locally on Windows
   - Backend reaches POS agent via `POS_AGENT_URL`

### For Local Development

With all services running locally, you have two options:

**Option A: Use Backend API (Recommended for testing)**
```
Frontend → Backend API → PostgreSQL
```

**Option B: Use POS Agent Directly (React development)**
```
Frontend → POS Agent → SQL Server
```

or combine both:

```
Frontend (tries POS first) → Backend API (fallback)
```

## Setup for Render Deployment

### Backend Environment Variables

Create `.env` on the Render server:

```env
# Database (PostgreSQL on Render)
DATABASE_URL=postgresql://user:password@host:port/database

# POS Integration
ENABLE_POS_SYNC=true
POS_AGENT_URL=http://your-windows-machine:3001
POS_SECRET=your-secret-key

# Other existing variables
NODE_ENV=production
JWT_SECRET=your-jwt-secret
SENDGRID_API_KEY=your-key
# ... etc
```

**Important:** `POS_AGENT_URL` must be accessible from the Render server.

### Frontend Environment Variables

Create `.env.production` on Render:

```env
# Backend API on Render
VITE_API_BASE_URL=https://your-app.onrender.com/api
VITE_BACKEND_URL=https://your-app.onrender.com

# POS Sync (optional, mainly for local dev)
VITE_POS_AGENT_URL=http://localhost:3001
VITE_POS_SECRET=your-secret-key

# Other existing variables
VITE_GOOGLE_CLIENT_ID=your-id
```

## Data Flow During POS Sync

### Step 1: Admin Triggers Sync
```
Admin Dashboard
    ↓
    POST /api/products/sync/pos (with auth token)
    ↓
Backend Controller (syncFromPOS)
```

### Step 2: Backend Connects to POS Agent
```
Backend → POS_AGENT_URL + x-pos-secret header
    ↓
GET /pos-sync/products
    ↓
POS Agent (running on Windows)
    ↓
SQL Server Database
```

### Step 3: Sync to PostgreSQL
```
POS Products (received)
    ↓
Map to Database Format
    ↓
Upsert to PostgreSQL
    ↓
Return sync report
    ↓
Admin Dashboard shows: "200 products synced, 5 skipped"
```

### Step 4: Users See Updated Products
```
Frontend (next page load)
    ↓
GET /api/products
    ↓
Backend (Prisma query)
    ↓
PostgreSQL (synced products)
    ↓
Display in Products Page
```

## Field Mapping: POS → Database

| POS Field | Database Field | Notes |
|-----------|----------------|-------|
| ProductCode | sourceCode | Original POS identifier |
| ProductName | name | Product name |
| Barcode | barcode | EAN/UPC code |
| SellingPrice | price | Current price |
| QuantityAvailable | stock | Current stock |
| - | category | Set to "POS Import" |
| - | image | Empty (POS has no images) |
| - | syncedFromPOS | true |
| - | lastSyncedAt | Current timestamp |

## Database Schema Extension

The Product table now includes:

```prisma
model Product {
  // ... existing fields
  syncedFromPOS    Boolean?   @default(false)
  sourceCode       String?    @unique  // POS ProductCode
  barcode          String?
  lastSyncedAt     DateTime?
}
```

(Update your `prisma/schema.prisma` if these fields don't exist)

## API Endpoint Reference

### GET /api/products
Fetch products from database (works on Render)

**Response:**
```json
{
  "products": [
    {
      "id": 1,
      "name": "Product Name",
      "price": 2999,
      "stock": 50,
      "sourceCode": "P001",
      "syncedFromPOS": true,
      ...
    }
  ]
}
```

### POST /api/products/sync/pos
Manually sync from POS agent (Admin only)

**Headers:**
```
Authorization: Bearer <admin-token>
```

**Response:**
```json
{
  "success": true,
  "message": "Products synced successfully",
  "synced": 200,
  "skipped": 5,
  "total": 205,
  "errors": [
    {
      "code": "P999",
      "error": "Invalid product data"
    }
  ]
}
```

## Render Deployment Checklist

- [ ] Update backend `.env` with POS variables
- [ ] Update frontend `.env.production` with correct API URL
- [ ] Verify DATABASE_URL is set in Render
- [ ] Test `/api/products` endpoint works
- [ ] Test `/api/products/sync/pos` endpoint as admin
- [ ] Verify products appear on Products page
- [ ] Check that stock updates are reflected
- [ ] Monitor logs for POS sync errors

## Troubleshooting

### "Cannot reach POS Agent" Error
**Cause:** `POS_AGENT_URL` is wrong or agent not running
**Fix:** Verify POS agent URL and ensure Windows desktop is on and POS agent is running

### "Unauthorized: Invalid API key"
**Cause:** `POS_SECRET` doesn't match
**Fix:** Verify both backend env var and POS agent `.env` have same secret

### Synced products show empty stock
**Cause:** No stock data in POS database
**Fix:** Check POS database for `stockdetails` and `stocks` tables with location 'SH'

### Empty product list after sync
**Cause:** POS products mapped but not saved
**Fix:** Check backend logs for Prisma errors

## Example: Admin Sync Button

Create this button in your admin dashboard:

```jsx
import api from '../utils/api.js';
import toast from 'react-hot-toast';

export function SyncPOSButton() {
  const [loading, setLoading] = useState(false);

  const handleSync = async () => {
    try {
      setLoading(true);
      const response = await api.post('/products/sync/pos');
      
      toast.success(
        `Synced: ${response.data.synced}, Skipped: ${response.data.skipped}`
      );
    } catch (err) {
      toast.error(err.response?.data?.error || 'Sync failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <button onClick={handleSync} disabled={loading}>
      {loading ? 'Syncing...' : 'Sync Products from POS'}
    </button>
  );
}
```

## Production Recommendations

1. **Schedule Automatic Syncs**
   - Add cron job to sync POS daily at off-peak hours
   - Set up CloudScheduler or similar

2. **Monitor Sync Health**
   - Log all sync attempts
   - Alert if sync fails for 24+ hours
   - Dashboard widget showing last sync time

3. **Fallback Strategy**
   - If POS agent is down, continue serving database products
   - Don't break production on POS outages

4. **Data Validation**
   - Validate POS prices are not extreme
   - Validate stock quantities are reasonable
   - Log anomalies for manual review

5. **Backup Strategy**
   - Keep database backups before sync
   - Maintain 30-day product history
   - Allow admin to rollback to previous version

## Next Steps

1. ✅ Backend service created (`posSync.service.js`)
2. ✅ Sync endpoint created (`POST /api/products/sync/pos`)
3. ✅ Frontend hooks ready (`usePOSProducts.js`)
4. 📋 Add database fields (if using new schema)
5. 📋 Create admin sync button
6. 📋 Deploy to Render
7. 📋 Test full workflow
8. 📋 Monitor production

See the README files for complete documentation.
