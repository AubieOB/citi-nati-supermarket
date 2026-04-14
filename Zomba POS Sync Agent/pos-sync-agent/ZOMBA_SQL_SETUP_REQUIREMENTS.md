# Zomba SQL Setup Requirements

This checklist is for the Zomba machine running the copied POS sync agent.

## 1) SQL Server connection settings required

Set these in `.env` on the Zomba agent machine:

- `POS_DB_SERVER` (or `DB_SERVER` legacy fallback)
- `POS_DB_NAME` (or `DB_NAME` / `DB_DATABASE` fallback)
- `POS_DB_USER` (or `DB_USER` fallback)
- `POS_DB_PASSWORD` (or `DB_PASSWORD` fallback)
- `POS_LOCATION_CODE` (Zomba POS location code used by stock/price/expiry queries)
- `BRANCH_CODE=ZOMBA`
- `BRANCH_NAME=Zomba`
- `LOCATION_ID=2`
- `SYNC_SOURCE_CODE=ZOMBA_POS_01`

## 2) Minimum SQL read permissions required

The SQL login used by the agent must be able to read from these tables/views used by the sync flow:

- `POS.dbo.productsmaster`
- `POS.dbo.producttypes`
- `POS.dbo.ProductActivity`
- `POS.dbo.productprices`
- `POS.dbo.invoice`
- `POS.dbo.invoicedetails`
- `POS.dbo.stockdetails`
- `POS.dbo.stocks`
- `INFORMATION_SCHEMA.COLUMNS` (for dynamic latest-cost column discovery)

If the account cannot read any of the above, sync batches will fail.

## 3) Write permissions (only if write-back features are enabled)

If write-back commands are enabled (`ENABLE_INVOICE_WRITEBACK`, `ENABLE_STOCK_WRITEBACK`, etc.), the SQL login also needs write permissions to the POS writeback target tables used by the existing command executor flow.

If Zomba is reporting-only, disable writeback flags in `.env`.

## 4) Network and SQL mode checks

- SQL Server service is running on the Zomba machine.
- SQL authentication is enabled if using SQL user/password.
- TCP/IP protocol is enabled for SQL Server.
- Windows firewall allows SQL Server inbound port (default 1433) if remote access is used.
- Agent process can resolve and reach `POS_DB_SERVER`.

## 5) Quick verification steps

1. Start the copied Zomba agent.
2. Confirm startup logs show successful DB connection.
3. Confirm product fetch logs include Zomba sync prefix and location.
4. Trigger one reporting sync cycle and verify backend receives branch/location metadata.
5. Confirm no auth or permission errors appear for invoice/detail/latest-cost reads.

## 6) Common missing setup symptoms

- `Login failed for user`: wrong SQL user/password or SQL auth mode.
- `Invalid object name ...`: wrong DB name or schema/table mismatch.
- `The SELECT permission was denied`: SQL account missing read grants.
- Timeouts/connection refused: SQL service/network/firewall issues.
