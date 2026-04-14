# POS Sync Agent - API Examples

## Base URL
```
http://localhost:3001
```

## Authentication

All `/pos-sync/*` endpoints require the `x-pos-secret` header:

```
x-pos-secret: your-secret-key-from-.env
```

---

## Endpoints Reference

### 1. Health Check (No Auth)

**GET** `/health`

Check if the agent is running.

#### cURL
```bash
curl http://localhost:3001/health
```

#### Response
```json
{
  "success": true,
  "message": "POS Sync Agent is running",
  "timestamp": "2026-03-04T10:30:00.000Z"
}
```

---

### 2. Get Products

**GET** `/pos-sync/products`

Fetch all active products with current pricing and inventory levels.

#### cURL
```bash
curl -H "x-pos-secret: your-secret-key" \
  http://localhost:3001/pos-sync/products
```

#### JavaScript (Fetch)
```javascript
async function getProducts() {
  const response = await fetch('http://localhost:3001/pos-sync/products', {
    method: 'GET',
    headers: {
      'x-pos-secret': 'your-secret-key',
    },
  });
  
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  
  return response.json();
}

getProducts()
  .then(data => console.log('Products:', data))
  .catch(error => console.error('Error:', error));
```

#### JavaScript (Axios)
```javascript
const axios = require('axios');

const client = axios.create({
  baseURL: 'http://localhost:3001',
  headers: {
    'x-pos-secret': 'your-secret-key',
  },
});

client
  .get('/pos-sync/products')
  .then(response => console.log('Products:', response.data))
  .catch(error => console.error('Error:', error.message));
```

#### Python
```python
import requests

headers = {
    'x-pos-secret': 'your-secret-key',
}

response = requests.get(
    'http://localhost:3001/pos-sync/products',
    headers=headers
)

if response.status_code == 200:
    data = response.json()
    print(f"Products fetched: {data['count']}")
    for product in data['data']:
        print(f"  {product['ProductCode']}: {product['ProductName']} - ${product['SellingPrice']}")
else:
    print(f"Error: {response.status_code} - {response.text}")
```

#### PowerShell
```powershell
$headers = @{
    "x-pos-secret" = "your-secret-key"
}

$response = Invoke-RestMethod `
    -Uri "http://localhost:3001/pos-sync/products" `
    -Method Get `
    -Headers $headers

Write-Host "Products fetched: $($response.count)"
$response.data | ForEach-Object {
    Write-Host "$($_.ProductCode): $($_.ProductName) - `$$($_.SellingPrice)"
}
```

#### Response Example
```json
{
  "success": true,
  "count": 3,
  "data": [
    {
      "ProductCode": "P001",
      "ProductName": "Cooking Oil 5L",
      "Barcode": "1234567890123",
      "SellingPrice": 29.99,
      "QuantityAvailable": 50
    },
    {
      "ProductCode": "P002",
      "ProductName": "Sugar 1kg",
      "Barcode": "1234567890124",
      "SellingPrice": 4.99,
      "QuantityAvailable": 200
    },
    {
      "ProductCode": "P003",
      "ProductName": "Rice 10kg",
      "Barcode": "1234567890125",
      "SellingPrice": 12.99,
      "QuantityAvailable": 75
    }
  ]
}
```

---

## Error Responses

### 401 - Unauthorized (Missing Header)
```json
{
  "success": false,
  "error": "Unauthorized: Missing x-pos-secret header"
}
```

### 401 - Unauthorized (Invalid Key)
```json
{
  "success": false,
  "error": "Unauthorized: Invalid API key"
}
```

### 404 - Not Found
```json
{
  "success": false,
  "error": "Not found"
}
```

### 500 - Server Error
```json
{
  "success": false,
  "error": "Internal server error: Failed to fetch products"
}
```

In development mode (.env NODE_ENV=development), additional error details are included:
```json
{
  "success": false,
  "error": "Internal server error: Failed to fetch products",
  "details": "Connection lost - An existing connection was forcibly closed by the remote host"
}
```

---

## Integration Examples

### React Component

```javascript
// useProducts.js
import { useState, useEffect } from 'react';

export function useProducts() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchProducts = async () => {
      try {
        const response = await fetch('http://localhost:3001/pos-sync/products', {
          headers: {
            'x-pos-secret': import.meta.env.VITE_POS_SECRET,
          },
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        setProducts(data.data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchProducts();
  }, []);

  return { products, loading, error };
}

// ProductList.jsx
function ProductList() {
  const { products, loading, error } = useProducts();

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <table>
      <thead>
        <tr>
          <th>Code</th>
          <th>Name</th>
          <th>Price</th>
          <th>Stock</th>
        </tr>
      </thead>
      <tbody>
        {products.map(product => (
          <tr key={product.ProductCode}>
            <td>{product.ProductCode}</td>
            <td>{product.ProductName}</td>
            <td>${product.SellingPrice.toFixed(2)}</td>
            <td>{product.QuantityAvailable}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

### Node.js Script

```javascript
// sync-products.js
const axios = require('axios');
const db = require('./database');

const posSyncAgent = axios.create({
  baseURL: 'http://localhost:3001',
  headers: {
    'x-pos-secret': process.env.POS_SECRET,
  },
  timeout: 10000,
});

async function syncProductsFromPOS() {
  try {
    console.log('Syncing products from POS agent...');
    
    const response = await posSyncAgent.get('/pos-sync/products');
    const { data, count } = response.data;

    console.log(`Received ${count} products from POS`);

    // Sync to local database
    for (const product of data) {
      await db.query(
        'UPSERT INTO products SET ? WHERE code = ?',
        [product, product.ProductCode]
      );
    }

    console.log('Sync complete');
  } catch (error) {
    console.error('Sync failed:', error.message);
  }
}

// Run every 5 minutes
setInterval(syncProductsFromPOS, 5 * 60 * 1000);

// Run on startup
syncProductsFromPOS();
```

---

## Testing with Postman

1. Create a new request
2. Set method to **GET**
3. URL: `http://localhost:3001/pos-sync/products`
4. Go to **Headers** tab
5. Add header:
   - **Key**: `x-pos-secret`
   - **Value**: `your-secret-key` (from .env)
6. Click **Send**

---

## Rate Limiting (Future Enhancement)

Current implementation has no rate limiting. For production, consider adding:

```javascript
const rateLimit = require('express-rate-limit');

const limiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 100 // 100 requests per minute
});

app.use('/pos-sync/', limiter);
```
