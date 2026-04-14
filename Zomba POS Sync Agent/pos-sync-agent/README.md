# POS Sync Agent

Lightweight Node.js POS Sync Agent for Windows desktop integration with SQL Server.

## Overview

The POS Sync Agent provides a REST API to synchronize product data, pricing, and inventory from your POS SQL Server database. It features:

- **Connection Pooling**: Efficient SQL Server connection management
- **API Key Protection**: Secure endpoints with `x-pos-secret` header validation
- **Read-Only Operations**: Safe data retrieval without write operations
- **Error Handling**: Comprehensive error handling and logging
- **Async/Await**: Modern async pattern for database operations
- **Health Checks**: Built-in health check endpoint

## Requirements

- Node.js (v14 or higher)
- SQL Server database with POS data
- npm or yarn

## Installation

1. Navigate to the project directory:
   ```bash
   cd pos-sync-agent
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a `.env` file based on `.env.example`:
   ```bash
   cp .env.example .env
   ```

4. Update `.env` with your SQL Server credentials and configuration:
   ```env
   DB_SERVER=localhost
   DB_DATABASE=POS
   DB_USER=sa
   DB_PASSWORD=YourPassword
   PORT=3001
   POS_SECRET=your-secret-key
   ```

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DB_SERVER` | SQL Server hostname | `localhost` |
| `DB_DATABASE` | Database name | `POS` |
| `DB_USER` | SQL Server username | Required |
| `DB_PASSWORD` | SQL Server password | Required |
| `PORT` | Server port | `3001` |
| `POS_SECRET` | API secret key for authentication | Required |

## Running the Agent

### Development Mode
```bash
npm start
```

The server will start on the configured PORT (default: 3001).

Output:
```
POS Sync Agent listening on port 3001
API Key validation: ENABLED
Database: localhost/POS
Database connection pool established
```

## API Endpoints

### Health Check

**GET** `/health`

No authentication required.

**Response:**
```json
{
  "success": true,
  "message": "POS Sync Agent is running",
  "timestamp": "2026-03-04T10:30:00.000Z"
}
```

### Fetch Products

**GET** `/pos-sync/products`

Fetches active products with pricing and current stock information.

**Headers:**
```
x-pos-secret: your-secret-key
```

**Response (Success):**
```json
{
  "success": true,
  "count": 150,
  "data": [
    {
      "ProductCode": "P001",
      "ProductName": "Product Name",
      "Barcode": "1234567890",
      "SellingPrice": 29.99,
      "QuantityAvailable": 50
    }
  ]
}
```

**Response (Missing API Key):**
```json
{
  "success": false,
  "error": "Unauthorized: Missing x-pos-secret header"
}
```

Status: `401 Unauthorized`

**Response (Invalid API Key):**
```json
{
  "success": false,
  "error": "Unauthorized: Invalid API key"
}
```

Status: `401 Unauthorized`

## Usage Examples

### Using cURL

```bash
# Check health
curl http://localhost:3001/health

# Fetch products with valid API key
curl -H "x-pos-secret: your-secret-key" http://localhost:3001/pos-sync/products
```

### Using Fetch API (JavaScript)

```javascript
const apiKey = 'your-secret-key';

// Fetch products
const response = await fetch('http://localhost:3001/pos-sync/products', {
  method: 'GET',
  headers: {
    'x-pos-secret': apiKey,
  },
});

const data = await response.json();
console.log(data);
```

### Using Axios (JavaScript)

```javascript
const axios = require('axios');

const apiKey = 'your-secret-key';

axios
  .get('http://localhost:3001/pos-sync/products', {
    headers: {
      'x-pos-secret': apiKey,
    },
  })
  .then(response => console.log(response.data))
  .catch(error => console.error(error.message));
```

## Database Tables Used

The endpoint queries the following POS database tables:

- `POS.dbo.productsmaster`: Product master data
- `POS.dbo.productprices`: Product pricing information
- `POS.dbo.StocksReport`: Stock/inventory data

**Query Conditions:**
- Only active products (`p.Active = 1`)
- Location filter: `'SH'`
- Latest stock report date only

## Security

1. **API Key Protection**: All `/pos-sync/*` endpoints require valid `x-pos-secret` header
2. **Read-Only**: No write operations to database
3. **Connection Pooling**: Prevents connection exhaustion
4. **Error Details**: Error details only shown in development mode

### Best Practices

- Store `POS_SECRET` securely (use environment variables, never commit to repo)
- Use HTTPS in production
- Rotate API keys periodically
- Monitor logs for unauthorized access attempts
- Use Windows firewall to restrict who can access the agent

## Troubleshooting

### Connection Pool Error

**Problem:** "Failed to create connection pool"

**Solution:**
1. Verify SQL Server is running
2. Check `DB_SERVER` is correct in `.env`
3. Verify credentials (`DB_USER`, `DB_PASSWORD`)
4. Ensure SQL Server login exists and has database access

### Query Returns No Data

**Problem:** Products endpoint returns empty array

**Solution:**
1. Verify data exists in `POS.dbo.productsmaster`
2. Check `StocksReport` has recent entries (ReportDate check)
3. Verify products have `Active = 1`
4. Confirm pricing and stock records for location `'SH'`

### 401 Unauthorized Error

**Problem:** "Invalid API key" error

**Solution:**
1. Verify `x-pos-secret` header is included in request
2. Check `POS_SECRET` value matches between request and `.env`
3. Ensure no extra whitespace in header value

### Port Already in Use

**Problem:** "Port 3001 is already in use"

**Solution:**
1. Change `PORT` in `.env`
2. Or kill existing process using the port

## Performance Considerations

- **Connection Pooling**: Default max 10 connections, min 2
- **Idle Timeout**: 30 seconds per idle connection
- **Connection Timeout**: 5 seconds to establish connection
- **Query Optimization**: Index tables for faster queries, especially on `LocationCode` and `ReportDate`

## Logging

All operations are logged to console:
- Database connection events
- Query errors with timestamps
- Server startup/shutdown events
- Unauthorized access attempts

## Graceful Shutdown

The agent handles graceful shutdown on `SIGTERM` and `SIGINT` signals:
- Waits for active queries to complete
- Closes database connection pool
- Logs shutdown event

## License

ISC

## Support

For issues or questions, refer to the server logs or check:
1. Database connectivity
2. Environment variable configuration
3. API key validation
4. SQL Server permissions
