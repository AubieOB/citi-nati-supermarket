# POS Sync Agent - Windows Desktop Setup Guide

## Complete Setup Instructions for Windows

### Prerequisites

1. **Node.js** - Download and install from https://nodejs.org (v14+)
2. **SQL Server** - With POS database containing required tables
3. **Windows PowerShell** or Command Prompt

### Installation Steps

#### 1. Navigate to Project Directory

Open PowerShell or Command Prompt and navigate to the pos-sync-agent folder:

```powershell
cd "c:\Users\aubre\Desktop\Citi-Nati Supermarket website\pos-sync-agent"
```

#### 2. Install Node Dependencies

```powershell
npm install
```

This creates a `node_modules` folder and installs:
- `express` - Web framework
- `mssql` - SQL Server driver
- `dotenv` - Environment configuration

#### 3. Create Environment Configuration

Copy the example file:
```powershell
Copy-Item .env.example .env
```

Edit `.env` with your SQL Server details:

```env
DB_SERVER=localhost
DB_DATABASE=POS
DB_USER=sa
DB_PASSWORD=YourPassword123
PORT=3001
POS_SECRET=SecureKeyChangeThis
```

**Important Settings:**
- `DB_SERVER`: Use `localhost`, `.`, or SQL Server machine name
- `DB_USER`: SQL Server login (e.g., `sa`)
- `DB_PASSWORD`: SQL Server password
- `PORT`: Port number (3001 is default)
- `POS_SECRET`: Strong API key for requests

#### 4. Verify SQL Server Connection

Before running the agent, verify your SQL Server is accessible:

**Using PowerShell:**
```powershell
# Test SQL Server connection
sqlcmd -S localhost -U sa -P YourPassword123 -Q "SELECT @@VERSION"
```

You should see SQL Server version information.

### Running the Agent

#### Method 1: Command Line (Development)

```powershell
npm start
```

Expected output:
```
Database connection pool established
POS Sync Agent listening on port 3001
API Key validation: ENABLED
Database: localhost/POS
```

#### Method 2: Batch File (Recommended for Desktop)

Double-click `START_AGENT.bat`:
- Checks Node.js installation
- Verifies .env file exists
- Installs dependencies if needed
- Starts the agent
- Keeps command window open for logs

#### Method 3: Background Process (PowerShell)

```powershell
# Start in background
Start-Process powershell -ArgumentList "npm start" -WindowStyle Hidden

# View running processes
Get-Process node

# Kill the process
Stop-Process -Name node -Force
```

### Testing the Agent

#### 1. Health Check (No Auth Required)

```powershell
$response = Invoke-RestMethod -Uri "http://localhost:3001/health"
$response | ConvertTo-Json
```

#### 2. Fetch Products (With Auth)

```powershell
$headers = @{
    "x-pos-secret" = "SecureKeyChangeThis"
}

$response = Invoke-RestMethod `
    -Uri "http://localhost:3001/pos-sync/products" `
    -Method Get `
    -Headers $headers

Write-Host "Total Products: $($response.count)"
$response.data | Select-Object ProductCode, ProductName, SellingPrice, QuantityAvailable | Format-Table
```

### Firewall Configuration

To allow other machines to access the agent:

#### GUI Method:
1. Open **Windows Defender Firewall with Advanced Security**
2. Click **Inbound Rules** → **New Rule...**
3. Select **Port** → **Next**
4. Select **TCP**, Enter **Port: 3001** → **Next**
5. Select **Allow** → **Next**
6. Name it "POS Sync Agent" → **Finish**

#### PowerShell Method:
```powershell
# Run as Administrator
New-NetFirewallRule -DisplayName "POS Sync Agent" `
    -Direction Inbound `
    -LocalPort 3001 `
    -Protocol TCP `
    -Action Allow
```

### Autostart Configuration

To make the agent start automatically when Windows starts:

#### Using Task Scheduler:

1. Open **Task Scheduler**
2. Click **Create Task** (right panel)
3. **General tab:**
   - Name: `POS Sync Agent`
   - Check "Run whether user is logged in or not"
   - Check "Run with highest privileges"
4. **Triggers tab:**
   - New → At startup
5. **Actions tab:**
   - Program: `C:\Program Files\nodejs\node.exe`
   - Arguments: `server.js`
   - Start in: `c:\Users\aubre\Desktop\Citi-Nati Supermarket website\pos-sync-agent`
6. Click **OK**

#### Using Batch File:

Save as `C:\ProgramData\Microsoft\Windows\Start Menu\Programs\StartUp\POS-Sync-Agent.bat`:

```batch
@echo off
cd "c:\Users\aubre\Desktop\Citi-Nati Supermarket website\pos-sync-agent"
node server.js
```

### Troubleshooting

#### Cannot Find SQL Server

**Error:** `ConnectionError: Connection lost`

**Solutions:**
```powershell
# 1. Verify SQL Server is running
Get-Service MSSQL* | Select-Object Name, Status

# 2. Enable TCP/IP (SQL Server Configuration Manager)
# 3. Test connectivity
Test-NetConnection -ComputerName localhost -Port 1433
```

#### Missing Dependencies

**Error:** `Cannot find module 'express'`

**Solution:**
```powershell
npm install
```

#### Port Already in Use

**Error:** `listen EADDRINUSE :::3001`

**Solutions:**
```powershell
# 1. Find process using port 3001
netstat -ano | findstr :3001

# 2. Kill the process (replace PID)
taskkill /PID <PID> /F

# 3. Or change PORT in .env
```

#### Invalid API Key

**Test:**
```powershell
# Wrong key
$headers = @{"x-pos-secret" = "wrong-key"}
$response = try {
    Invoke-RestMethod `
        -Uri "http://localhost:3001/pos-sync/products" `
        -Headers $headers
} catch {
    $_.Exception.Response.StatusCode, $_.Exception.Message
}

# Should show: 401 Unauthorized
```

#### No Products Returned

**Check:**
1. Products exist: `SELECT COUNT(*) FROM POS.dbo.productsmaster WHERE Active = 1`
2. Prices exist: `SELECT COUNT(*) FROM POS.dbo.productprices WHERE LocationCode = 'SH'`
3. Stock exists: `SELECT COUNT(*) FROM POS.dbo.StocksReport WHERE LocationCode = 'SH'`

### Performance Tuning

#### Connection Pool Settings in `server.js`

```javascript
pool: {
  max: 10,        // Max connections
  min: 2,         // Min connections
  idleTimeoutMillis: 30000,    // 30 seconds
  connectionTimeoutMillis: 5000, // 5 seconds
}
```

Increase `max` for high-traffic scenarios:
```javascript
max: 20,  // Handle more concurrent requests
```

### Monitoring

#### Log Current Connections

Create `check-connections.js`:

```javascript
require('dotenv').config();
const sql = require('mssql');

const config = {
  server: process.env.DB_SERVER,
  database: process.env.DB_DATABASE,
  authentication: {
    type: 'default',
    options: {
      userName: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
    },
  },
  options: { trustServerCertificate: true },
};

new sql.ConnectionPool(config)
  .connect()
  .then(pool => {
    return pool
      .request()
      .query('SELECT COUNT(*) as ActiveProducts FROM POS.dbo.productsmaster WHERE Active = 1');
  })
  .then(result => {
    console.log('Active Products:', result.recordset[0].ActiveProducts);
    process.exit(0);
  })
  .catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
  });
```

Run:
```powershell
node check-connections.js
```

### Security Best Practices

1. **Strong API Key:**
   ```powershell
   # Generate random key
   [System.Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes([System.Guid]::NewGuid()))
   ```

2. **SQL Server Authentication:**
   - Use SQL Server login (not Windows auth in this setup)
   - Strong password (min 8 chars, mixed case, numbers, symbols)

3. **Firewall:**
   - Restrict access to specific IPs if possible
   - Don't expose on public networks

4. **Logs:**
   - Monitor console output for errors
   - Log failed authentication attempts

5. **.env File:**
   ```powershell
   # Make .env read-only
   attrib +r .env
   ```

### Backup and Recovery

#### Backup Configuration

```powershell
# Create backup
Copy-Item .env .env.backup
```

#### Recovery

```powershell
# Restore from backup
Copy-Item .env.backup .env
```

### Uninstall

To completely remove:

```powershell
# Stop the process
Stop-Process -Name node -Force

# Remove node_modules (optional, frees space)
Remove-Item -Path "node_modules" -Recurse -Force

# Delete folder or just clear it
Remove-Item -Path "*" -Recurse -Force
```

---

## Next Steps

1. ✅ Complete setup using the steps above
2. 📝 Document your SQL Server credentials securely
3. 🔐 Generate and set a strong `POS_SECRET`
4. 🧪 Test endpoints with the scripts in [API_EXAMPLES.md](API_EXAMPLES.md)
5. 📱 Integrate with Citi-Nati frontend application
6. 🚀 Consider autostart setup for production use

## References

- [Node.js Official](https://nodejs.org)
- [Express.js](https://expressjs.com)
- [mssql Package](https://www.npmjs.com/package/mssql)
- [SQL Server Documentation](https://docs.microsoft.com/en-us/sql/)
