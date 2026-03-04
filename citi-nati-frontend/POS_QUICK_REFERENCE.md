# POS Integration - Quick Reference

## File Structure

```
citi-nati-frontend/
├── src/
│   ├── utils/
│   │   └── posSyncService.js          ← Main service
│   ├── hooks/
│   │   └── usePOSProducts.js          ← React hooks
│   ├── components/
│   │   └── examples/
│   │       └── POSProductsExample.jsx ← Full working example
│   ├── .env.example                   ← Add POS env vars
│   └── App.jsx
└── POS_INTEGRATION_GUIDE.md           ← Full documentation
```

## Setup (2 Steps)

```bash
# 1. Update .env
VITE_POS_AGENT_URL=http://localhost:3001
VITE_POS_SECRET=your-secret-from-pos-agent

# 2. Start POS Agent & Frontend
# Terminal 1:
cd pos-sync-agent && npm start

# Terminal 2:
cd citi-nati-frontend && npm run dev
```

## Use in Components (3 Lines)

```javascript
import { usePOSProducts } from '../hooks/usePOSProducts.js';

export function MyComponent() {
  const { products, loading, error } = usePOSProducts();
  // Use products...
}
```

## Available Hooks

| Hook | Returns | Note |
|------|---------|------|
| `usePOSProducts()` | `{ products, loading, error, refetch, lastFetch }` | All active products |
| `usePOSCategories()` | Same structure | Product categories |
| `usePOSStock()` | Same structure | Location stock levels |

## Service Methods (Advanced)

```javascript
import { posSyncService } from '../utils/posSyncService.js';

// Fetch data
await posSyncService.getProducts();
await posSyncService.getCategories();
await posSyncService.getStockByLocation();

// Check status
await posSyncService.checkHealth();

// Get config (debug)
posSyncService.getConfig();
```

## Product Object Shape

```javascript
{
  ProductCode: "P001",         // POS product code
  ProductName: "Oil 5L",       // Product name
  Barcode: "1234567890abc",    // EAN/UPC barcode
  SellingPrice: 29.99,         // Current price
  QuantityAvailable: 50        // Stock quantity
}
```

## Common Patterns

### ✅ Auto-Refresh Every 5 Minutes
```javascript
const { products } = usePOSProducts({ refreshInterval: 5 * 60 * 1000 });
```

### ✅ Show Loading State
```javascript
if (loading) return <Spinner />;
if (error) return <Error message={error} />;
```

### ✅ Manual Refetch
```javascript
const { products, refetch } = usePOSProducts({ autoFetch: true });
<button onClick={refetch}>Refresh</button>
```

### ✅ Real-Time Stock Checking
```javascript
const { stock } = usePOSStock({ refreshInterval: 30 * 1000 });
const available = stock.find(s => s.ProductCode === code)?.AvailableStock;
```

## Troubleshooting

| Error | Fix |
|-------|-----|
| "offline" | Start POS agent: `npm start` in pos-sync-agent dir |
| "Invalid API key" | Check `VITE_POS_SECRET` matches agent |
| Empty array | Check POS database has active products |
| 401 Unauthorized | Verify `x-pos-secret` header in service |

## Example Component

Use `POSProductsExample.jsx` as a complete working reference:
```javascript
import POSProductsExample from './components/examples/POSProductsExample.jsx';
```

Shows:
- Product grid display
- Add to cart
- Cart management
- Stock checking
- Error handling
- Loading states

## Environment Variables

```env
# Required
VITE_POS_AGENT_URL=http://localhost:3001    # Where agent runs
VITE_POS_SECRET=your-secret-key             # From POS agent .env

# Existing (keep these)
VITE_API_BASE_URL=http://localhost:5000/api
VITE_BACKEND_URL=http://localhost:5000
```

## Integration Checklist

- [ ] Copy `.env.example` to `.env`
- [ ] Add `VITE_POS_AGENT_URL` and `VITE_POS_SECRET`
- [ ] Start POS agent on port 3001
- [ ] Import `usePOSProducts` in component
- [ ] Test fetching products
- [ ] Handle loading and error states
- [ ] Set refresh interval
- [ ] Deploy frontend

## Console Debugging

Open DevTools (F12) and look for:

```javascript
// Successful fetch
[POS Sync] Loaded 150 products

// Error
[POS Sync] Error: POS Agent is offline

// Hook logs
[usePOSProducts] Loaded 150 products
[usePOSStock] Auto-refreshing stock...
```

## Performance Tips

1. **Cache data** - Use `refreshInterval: 5 * 60 * 1000` (5 min)
2. **Lazy load** - Only fetch when needed
3. **Batch requests** - Don't call multiple times
4. **Memoize filtered data** - Use `useMemo()` for filtered products

```javascript
// Good - Cache for 5 minutes
const { products } = usePOSProducts({ refreshInterval: 5 * 60 * 1000 });

// Bad - Requests every 1 second!
const { products } = usePOSProducts({ refreshInterval: 1000 });
```

## Next Integration Points

After basic setup, integrate POS data with:

1. **Products Page** - Replace hardcoded products with POS data
2. **Cart** - Check stock before checkout
3. **Admin Dashboard** - Show POS inventory
4. **Backend Sync** - Add endpoint to sync products
5. **Real-Time Updates** - Use WebSocket for live stock

See [POS_INTEGRATION_GUIDE.md](./POS_INTEGRATION_GUIDE.md) for full examples.
