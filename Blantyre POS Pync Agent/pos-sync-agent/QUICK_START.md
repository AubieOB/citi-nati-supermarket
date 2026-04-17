# POS Sync Agent - Quick Start

## 5-Minute Setup

### Step 1: Install Dependencies
```bash
cd pos-sync-agent
npm install
```

### Step 2: Configure Environment
Copy and update `.env` with your SQL Server details:
```bash
DB_SERVER=localhost
DB_DATABASE=POS
DB_USER=sa
DB_PASSWORD=YourPassword
PORT=3001
POS_SECRET=super-secret-key
```

### Step 3: Start the Agent
```bash
npm start
```

Expected output:
```
Database connection pool established
POS Sync Agent listening on port 3001
API Key validation: ENABLED
Database: localhost/POS
```

### Step 4: Test the Health Endpoint
```bash
curl http://localhost:3001/health
```

Response:
```json
{"success":true,"message":"POS Sync Agent is running","timestamp":"2026-03-04T10:30:00.000Z"}
```

### Step 5: Fetch Products
```bash
curl -H "x-pos-secret: super-secret-key" http://localhost:3001/pos-sync/products
```

## Typical Response

```json
{
  "success": true,
  "count": 150,
  "data": [
    {
      "ProductCode": "P001",
      "ProductName": "Cooking Oil 5L",
      "Barcode": "1234567890",
      "SellingPrice": 29.99,
      "QuantityAvailable": 50
    },
    {
      "ProductCode": "P002",
      "ProductName": "Sugar 1kg",
      "Barcode": "1234567891",
      "SellingPrice": 4.99,
      "QuantityAvailable": 200
    }
  ]
}
```

## Common Issues

| Issue | Fix |
|-------|-----|
| "Cannot connect to SQL Server" | Check DB_SERVER, DB_USER, DB_PASSWORD in .env |
| "Missing x-pos-secret header" | Add header: `x-pos-secret: your-key` |
| "Invalid API key" | Verify POS_SECRET matches in .env and request |
| "Port already in use" | Change PORT in .env or kill process on 3001 |

## Next Steps

- Read full [README.md](README.md) for detailed documentation
- Configure Windows Firewall if accessing from other machines
- Set up automated backups of product data
- Integrate with Citi-Nati frontend application
