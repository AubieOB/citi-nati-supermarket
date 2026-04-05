# Data Export & Import System

## Overview

A comprehensive data backup and restoration system for both **Payroll** and **Sales** modules. Exports create JSON-based snapshots of all data with relationships preserved, enabling complete data restoration in case of data loss or migration.

## Features

### Payroll Export/Import

**Exports complete payroll data including:**
- Employees (biodata, positions, departments)
- Salary structures (agreed amounts, increments, effective dates)
- Payroll periods (modes, descriptions, status)
- Payroll entries (detailed salary calculations, deductions)
- Employee loans (principal, balance, interest, repayment schedules)
- Loan transactions (payments, interest components)
- Terminations (settlement details, leave pay, final amounts)
- Reengagements (wages, effective dates, contract terms)
- Tax brackets (income bands, tax rates, policies)
- Increment policies (service-based increments)

**Format:** Structured JSON with metadata and relationships
**Use Case:** Full payroll backup/restore, data migration, audit trails

### Sales Export/Import

**Exports complete sales data including:**
- Sync sources (branches, locations, source codes)
- Invoices (sales transactions, payments, metadata)
- Invoice items (product details, quantities, prices, taxes)
- Products (catalog, pricing, stock, availability)

**Format:** Structured JSON with complete invoice/item relationships
**Use Case:** Sales data backup/restore, historical archival, multi-location consolidation

### Full Backup Archive

**Combined ZIP export containing:**
- `payroll-snapshot.json` - Complete payroll data
- `sales-snapshot.json` - Complete sales data
- `MANIFEST.json` - Index and export metadata

**Use Case:** Complete business backup for disaster recovery

## API Endpoints

### Payroll Endpoints

#### Export Payroll Snapshot
```
GET /api/business-operations/payroll/export/snapshot?locationId=[id]
```
**Response:** JSON file attachment
```json
{
  "version": "1.0.0",
  "type": "payroll",
  "exportedAt": "2026-04-05T10:30:00.000Z",
  "data": {
    "employees": [],
    "salaryStructures": [],
    "payrollPeriods": [],
    "payrollEntries": [],
    "loans": [],
    "loanTransactions": [],
    "terminations": [],
    "reengagements": [],
    "taxBrackets": [],
    "incrementPolicies": [],
    "metadata": {}
  }
}
```

#### Import Payroll Snapshot
```
POST /api/business-operations/payroll/import/snapshot
```
**Request Body:**
```json
{
  "version": "1.0.0",
  "type": "payroll",
  "data": { /* snapshot data */ },
  "upsert": true,
  "locationId": 1
}
```
**Response:**
```json
{
  "success": true,
  "message": "Payroll data imported successfully",
  "imported": {
    "employees": 150,
    "salaryStructures": 200,
    "payrollPeriods": 12,
    "payrollEntries": 1800,
    "loans": 45,
    "loanTransactions": 120,
    "terminations": 5,
    "reengagements": 10,
    "taxBrackets": 5,
    "incrementPolicies": 3
  },
  "errors": []
}
```

#### Export Full Backup ZIP
```
GET /api/business-operations/payroll/export/backup-zip?locationId=[id]&branchCode=[code]&startDate=[date]&endDate=[date]
```
**Response:** ZIP file attachment containing all snapshots

### Sales Endpoints

#### Export Sales Snapshot
```
GET /api/sales/export/snapshot?branchCode=[code]&syncSourceCode=[code]&startDate=[date]&endDate=[date]
```
**Response:** JSON file attachment with complete sales data

#### Import Sales Snapshot
```
POST /api/sales/import/snapshot
```
**Request Body:**
```json
{
  "version": "1.0.0",
  "type": "sales",
  "data": { /* snapshot data */ },
  "upsert": true
}
```
**Response:**
```json
{
  "success": true,
  "message": "Sales data imported successfully",
  "imported": {
    "syncSources": 3,
    "products": 2500,
    "invoices": 850,
    "invoiceItems": 5200
  },
  "errors": []
}
```

## Import Options

### Upsert Mode (Default)
```json
{
  "upsert": true
}
```
- Updates existing records if they already exist
- Uses unique identifiers (employee numbers, invoice numbers, etc.)
- Safe for re-importing or updating from exports
- **Recommended for most use cases**

### Insert Mode
```json
{
  "upsert": false
}
```
- Inserts all records as new items
- May fail if unique constraints are violated
- Use only when importing to empty/fresh database
- **Not recommended for production**

### Clear Before Import
```json
{
  "clearExisting": true
}
```
- Deletes all existing data of this type before importing
- **Use with extreme caution**
- Useful for complete database reset/restore

### Location/Branch Filters
```json
{
  "locationId": 1,
  "branchCode": "BLT"
}
```
- Imports data filtered to specific locations/branches
- Useful for multi-location deployments

## Usage Examples

### Backup Complete Payroll Data
```bash
curl -X GET http://localhost:3001/api/business-operations/payroll/export/snapshot \
  -H "Authorization: Bearer [token]" \
  -o payroll_backup_$(date +%Y%m%d).json
```

### Restore Payroll Data
```bash
curl -X POST http://localhost:3001/api/business-operations/payroll/import/snapshot \
  -H "Authorization: Bearer [token]" \
  -H "Content-Type: application/json" \
  -d @payroll_backup_20260405.json
```

### Download Full Company Backup
```bash
curl -X GET http://localhost:3001/api/business-operations/payroll/export/backup-zip \
  -H "Authorization: Bearer [token]" \
  -o company_backup_$(date +%Y%m%d).zip
```

### Export and Restore Single Location
```bash
# Export
curl -X GET "http://localhost:3001/api/business-operations/payroll/export/snapshot?locationId=1" \
  -H "Authorization: Bearer [token]" \
  -o location_1_backup.json

# Restore to different location
curl -X POST http://localhost:3001/api/business-operations/payroll/import/snapshot \
  -H "Authorization: Bearer [token]" \
  -H "Content-Type: application/json" \
  -d '{
    "version": "1.0.0",
    "type": "payroll",
    "data": {/* ...snapshot data... */},
    "upsert": true,
    "locationId": 2
  }'
```

### Archive Sales Data with Date Range
```bash
curl -X GET "http://localhost:3001/api/sales/export/snapshot?startDate=2026-01-01&endDate=2026-03-31" \
  -H "Authorization: Bearer [token]" \
  -o sales_q1_2026.json
```

## Data Integrity & Safety

### Automatic Validations
- Relationship integrity (employee IDs, period IDs, etc.)
- Date format validation (ISO 8601 strings converted to Date objects)
- Numeric field validation and type coercion
- Null/undefined handling for optional fields

### Rollback Capability
- Upsert mode won't delete existing data
- Failed imports don't partially update database
- Transaction-like behavior at entity level

### Error Reporting
- Detailed error logs for each import batch
- Summary of successfully imported items
- Lists specific errors for troubleshooting

## Database Requirements

### Snapshot Service Dependencies
Requires access to Prisma models:
- `Employee`, `EmployeeSalaryStructure`
- `PayrollPeriod`, `PayrollEntry`
- `EmployeeLoan`, `EmployeeLoanTransaction`
- `EmployeeTermination`, `EmployeeReengagement`
- `PayrollTaxBracket`, `PayrollIncrementPolicy`
- `SalesSyncSource`, `SalesInvoice`, `SalesInvoiceItem`, `Product`

### Database Connection
Requires active PostgreSQL connection via Prisma client configured in `prisma/schema.prisma`

## Version Control

### Current Version
```
SNAPSHOT_VERSION: 1.0.0
```

### Future Compatibility
- Snapshots include version number for migration paths
- Designed for backward compatibility with future versions
- Breaking changes will increment major version

## Security Considerations

### Authentication
- All endpoints require valid JWT token
- Admin role verification on all endpoints
- Rate limiting recommended for production

### Data Sensitivity
- Snapshots contain all business data (salaries, transactions, PII)
- Store exports in secure, encrypted locations
- Implement access controls on export files
- Consider PII redaction for non-admin users

### Audit Trail
- All import operations logged with timestamp
- Import summary available in response
- Recommend audit logging for production deployments

## Performance Notes

### Large Datasets
- Batch sizes configurable (default 1000 records per batch)
- ZIP compression for backup archives
- Asynchronous processing for large imports
- Consider import during off-peak hours

### Memory Usage
- Streaming used for file downloads
- Buffered batch processing for imports
- Suitable for databases up to 100k+ records

## Troubleshooting

### Common Errors

**"Invalid snapshot format: missing data"**
- Ensure request body includes `data` property
- Validate JSON structure matches export format

**"Relationship integrity error"**
- Verify employee IDs exist before importing terminations
- Ensure payroll periods exist before importing entries

**"Unique constraint violation"**
- Set `upsert: true` to update existing records
- Or delete existing conflicts before import

**Out of memory during large import**
- Check available system RAM
- Reduce batch size
- Import by location/branch separately

## Maintenance

### Backup Schedule
- **Weekly:** Full company backup to ZIP
- **Daily:** Automated payroll snapshot (optional)
- **Monthly:** Archived sales data by branch
- **As-needed:** Spot backups before major changes

### Retention Policy
- **Latest 4 weeks:** Local backup copies
- **Quarterly:** Off-site archive copies
- **Annual:** Long-term retention backup
- **Deleted records:** 7-day retention in snapshots

## Next Steps/Future Enhancements

1. **Incremental Backups** - Export only changed records since last backup
2. **Compression** - Built-in gzip for JSON exports
3. **Encryption** - Optional AES-256 encryption for sensitive exports
4. **Scheduling** - Automated export scheduling with webhooks
5. **Version Diffing** - Compare two snapshots to identify changes
6. **Partial Restore** - Restore specific entities or date ranges
7. **Cloud Storage** - Direct export to S3, Google Cloud Storage
8. **Scheduled Delete** - Automatic purge of old exports
