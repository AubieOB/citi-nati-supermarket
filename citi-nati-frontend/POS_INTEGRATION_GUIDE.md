# POS Sync Agent Integration Guide

## Overview

The **POS Sync Agent** is now integrated into your Citi-Nati Frontend. This guide shows you how to use it in your React components.

## Quick Setup

### 1. Update `.env`

Copy your `.env.example` to `.env` and add POS Agent configuration:

```env
# POS Sync Agent (runs on local Windows desktop)
VITE_POS_AGENT_URL=http://localhost:3001
VITE_POS_SECRET=your-secret-key-from-pos-agent
```

### 2. Start Both Services

**Terminal 1 - Start POS Sync Agent:**
```bash
cd pos-sync-agent
npm start
```

**Terminal 2 - Start Frontend:**
```bash
cd citi-nati-frontend
npm run dev
```

## Using in Components

### Method 1: Using the Custom Hook (Recommended)

The easiest way is using the `usePOSProducts` hook:

```javascript
import { usePOSProducts } from '../hooks/usePOSProducts.js';

export function ProductList() {
  const { products, loading, error, refetch } = usePOSProducts();

  if (loading) return <div>Loading products...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <div>
      <button onClick={refetch}>Refresh Products</button>
      <ul>
        {products.map(product => (
          <li key={product.ProductCode}>
            <strong>{product.ProductName}</strong>
            <br />
            Code: {product.ProductCode}
            <br />
            Price: ${product.SellingPrice}
            <br />
            Stock: {product.QuantityAvailable}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

### Method 2: Using the Service Directly

For more control, use the service directly:

```javascript
import { useEffect, useState } from 'react';
import { posSyncService } from '../utils/posSyncService.js';

export function ProductDetail() {
  const [products, setProducts] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    posSyncService
      .getProducts()
      .then(data => setProducts(data))
      .catch(err => setError(err.message));
  }, []);

  if (error) return <div>Error: {error}</div>;

  return (
    <div>
      {products.map(p => (
        <div key={p.ProductCode}>
          {p.ProductName} - ${p.SellingPrice}
        </div>
      ))}
    </div>
  );
}
```

## Available Hooks

### 1. `usePOSProducts` - Get Products

```javascript
const { products, loading, error, refetch, lastFetch } = usePOSProducts({
  autoFetch: true,        // Fetch on mount
  refreshInterval: 0,     // 0 = no auto-refresh, or set milliseconds
});
```

**Product Object:**
```javascript
{
  ProductCode: "P001",
  ProductName: "Product Name",
  Barcode: "1234567890",
  SellingPrice: 29.99,
  QuantityAvailable: 50
}
```

### 2. `usePOSCategories` - Get Categories

```javascript
const { categories, loading, error, refetch } = usePOSCategories();
```

**Category Object:**
```javascript
{
  ProductTypeCode: "CAT001",
  CategoryName: "Beverages"
}
```

### 3. `usePOSStock` - Get Stock by Location

```javascript
const { stock, loading, error, refetch } = usePOSStock();
```

**Stock Object:**
```javascript
{
  ProductCode: "P001",
  ProductName: "Product Name",
  LocationCode: "SH",
  AvailableStock: 50
}
```

## Service API Reference

### Direct Service Methods

```javascript
import { posSyncService } from '../utils/posSyncService.js';

// Get all products
const products = await posSyncService.getProducts();

// Get categories
const categories = await posSyncService.getCategories();

// Get stock by location
const stock = await posSyncService.getStockByLocation();

// Check if agent is running
const isHealthy = await posSyncService.checkHealth();

// Sync products to backend (maps POS format)
const result = await posSyncService.syncProductsToBackend();

// Get current configuration
const config = posSyncService.getConfig();
```

## Integration Examples

### Example 1: Product List Page

```javascript
// pages/Products.jsx
import { usePOSProducts } from '../hooks/usePOSProducts.js';
import toast from 'react-hot-toast';

export default function Products() {
  const { products, loading, error, refetch } = usePOSProducts({
    refreshInterval: 5 * 60 * 1000, // Auto-refresh every 5 minutes
  });

  if (error) {
    return (
      <div className="error-container">
        <h2>Failed to load products</h2>
        <p>{error}</p>
        <button onClick={refetch}>Try Again</button>
      </div>
    );
  }

  return (
    <div className="products-container">
      <header>
        <h1>Products ({products.length})</h1>
        <button onClick={refetch} disabled={loading}>
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </header>

      {loading && <div>Loading products...</div>}

      <div className="products-grid">
        {products.map(product => (
          <div key={product.ProductCode} className="product-card">
            <h3>{product.ProductName}</h3>
            <p>Code: {product.ProductCode}</p>
            <p className="price">${product.SellingPrice.toFixed(2)}</p>
            <p className={`stock ${product.QuantityAvailable > 0 ? 'in-stock' : 'out-of-stock'}`}>
              {product.QuantityAvailable > 0 ? `${product.QuantityAvailable} in stock` : 'Out of stock'}
            </p>
            <button
              onClick={() => addToCart(product)}
              disabled={product.QuantityAvailable === 0}
            >
              Add to Cart
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function addToCart(product) {
  toast.success(`${product.ProductName} added to cart`);
  // Your cart logic here
}
```

### Example 2: Shopping Cart with Real-Time Stock Check

```javascript
// components/Cart/CartItem.jsx
import { useMemo } from 'react';
import { usePOSStock } from '../hooks/usePOSProducts.js';

export function CartItem({ item }) {
  const { stock } = usePOSStock({ refreshInterval: 30 * 1000 }); // Refresh every 30s

  // Find current stock for this product
  const currentStock = useMemo(() => {
    const stockItem = stock.find(s => s.ProductCode === item.ProductCode);
    return stockItem?.AvailableStock || 0;
  }, [stock, item.ProductCode]);

  // Warn if quantity exceeds available stock
  const isOutOfStock = currentStock < item.quantity;

  return (
    <div className="cart-item">
      <div>{item.ProductName}</div>
      <div>${item.price.toFixed(2)}</div>
      <div>Qty: {item.quantity}</div>
      {isOutOfStock && (
        <div className="warning">
          Only {currentStock} available in stock
        </div>
      )}
    </div>
  );
}
```

### Example 3: Admin Panel with Stock Management

```javascript
// pages/admin/StockManagement.jsx
import { useState } from 'react';
import { usePOSProducts, usePOSStock } from '../../hooks/usePOSProducts.js';
import toast from 'react-hot-toast';

export default function StockManagement() {
  const { products } = usePOSProducts({ refreshInterval: 2 * 60 * 1000 });
  const { stock, refetch: refreshStock } = usePOSStock();
  const [selectedProduct, setSelectedProduct] = useState(null);

  const handleRefreshStock = async () => {
    await refreshStock();
    toast.success('Stock updated');
  };

  return (
    <div className="admin-stock">
      <h1>Stock Management</h1>
      <button onClick={handleRefreshStock}>Refresh Stock</button>

      <table>
        <thead>
          <tr>
            <th>Product Code</th>
            <th>Product Name</th>
            <th>Price</th>
            <th>Available Stock</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {products.map(product => {
            const stockInfo = stock.find(s => s.ProductCode === product.ProductCode);
            const quantity = stockInfo?.AvailableStock || 0;
            const status = quantity > 10 ? 'Good' : quantity > 0 ? 'Low' : 'Out of Stock';

            return (
              <tr key={product.ProductCode} className={`status-${status.toLowerCase().replace(' ', '-')}`}>
                <td>{product.ProductCode}</td>
                <td>{product.ProductName}</td>
                <td>${product.SellingPrice.toFixed(2)}</td>
                <td>{quantity}</td>
                <td>{status}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
```

## Auto-Refresh Configuration

Use the `refreshInterval` option to auto-refresh data:

```javascript
// Refresh every 5 minutes (300000ms)
const { products } = usePOSProducts({ refreshInterval: 5 * 60 * 1000 });

// Refresh every 30 seconds
const { stock } = usePOSStock({ refreshInterval: 30 * 1000 });

// No auto-refresh (manual refetch only)
const { categories } = usePOSCategories({ refreshInterval: 0 });
```

## Error Handling

Always handle errors gracefully:

```javascript
const { products, error, loading, refetch } = usePOSProducts();

if (error?.includes('offline')) {
  return <OfflineMessage onRetry={refetch} />;
}

if (error?.includes('Unauthorized')) {
  return <div>POS Agent authentication failed - check VITE_POS_SECRET</div>;
}

if (error) {
  return <div>Error: {error}</div>;
}
```

## Troubleshooting

### "POS Agent is offline or unreachable"

**Causes:**
- POS Sync Agent not running
- Wrong `VITE_POS_AGENT_URL` in `.env`
- Firewall blocking connection

**Fix:**
```bash
# Start POS agent
cd pos-sync-agent
npm start
```

### "Unauthorized: Invalid API key"

**Cause:** `VITE_POS_SECRET` doesn't match POS agent's `POS_SECRET`

**Fix:** Update `.env`:
```env
VITE_POS_SECRET=your-pos-agent-secret-key
```

### Products returning empty array

**Causes:**
- No products in POS database
- Products not active
- Wrong location code

**Debug:**
```javascript
const config = posSyncService.getConfig();
console.log('POS Agent Config:', config);
```

## Performance Tips

1. **Cache Products** - Use `refreshInterval` to avoid excessive requests
2. **Lazy Load** - Only fetch when component mounts
3. **Conditional Fetch** - Skip fetch when data not needed

```javascript
// Good - No unnecessary requests
const { products } = usePOSProducts({ refreshInterval: 5 * 60 * 1000 });

// Bad - Too frequent refresh
const { products } = usePOSProducts({ refreshInterval: 1000 }); // Every 1 second!
```

## Next Steps

1. ✅ Update `.env` with POS agent credentials
2. ✅ Start both services
3. 📝 Replace your existing product endpoints with POS calls
4. 🔄 Set up auto-refresh intervals
5. 📊 Monitor console logs for any issues
6. 🚀 Deploy when ready

## Support

Check the [POS Sync Agent README](../../pos-sync-agent/README.md) for server-side documentation.

For React component issues, review the [API Examples](../../pos-sync-agent/API_EXAMPLES.md) guide.
