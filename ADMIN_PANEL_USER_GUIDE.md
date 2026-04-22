# Citi-Nati Supermarket Admin Panel User Guide

## 1. Purpose of this guide

This guide explains the admin dashboard in full, panel by panel and tab by tab.
It is intended for administrators, supervisors, and operations staff with admin access.

This guide covers:

- admin access and navigation
- operational location scoping
- each main admin sidebar panel
- business operations sub-tabs
- standard admin procedures
- troubleshooting and safe-operation practices

## 2. Admin access entry points

## 2.1 Admin route

- `/admin` main dashboard shell

Access requirement:

- user must be authenticated and have `ADMIN_DASHBOARD_ACCESS` permission

## 2.2 Additional mapped admin routes

- `/admin/emergency-sales`
- `/admin/business-operations`

These routes load the same dashboard shell and open the corresponding section.

## 2.3 Maintenance mode admin access

- `/admin-login` can be used during maintenance mode for authorized admin entry

## 3. Admin dashboard structure

The admin UI is organized by sidebar scopes and tabs.

### Sidebar scopes

- All
- Online
- Shared
- POS
- Business
- Admin

### Main sidebar tabs

- Inbox
- Orders
- Online Refunds
- Online Support
- Quotations
- Online Sales
- Online Users
- Delivery Drivers
- Products
- Stocks
- Promotions
- Emergency Sale
- Emergency Reports
- POS Management
- POS Sync Monitor
- Emergency Cashiers
- Business Operations
- Delivery Coverage
- System
- Security

All tabs are permission-gated. A user can only see tabs granted to their role.

## 4. Operational location model (critical)

Location-aware behavior is core to safe admin operations.

Typical scopes include:

- Blantyre SH (`BT`)
- Zomba SH (`SH`)
- Zomba BAR (`BAR`)
- Zomba RES (`ST999`)

Rules:

1. Always confirm selected location before editing stock, prices, promotions, or POS operations.
2. Do not assume Zomba locations share one stock pool.
3. Re-check location after refresh, tab changes, and deep links.

## 5. Dashboard-wide behavior

## 5.1 Realtime and background refresh

For product-related tabs, data refreshes silently in background after first load.

Expected behavior:

- initial load can show loading state
- later refreshes should not blank lists
- filters/search/location remain stable during background refresh

## 5.2 Search and filter consistency

Search in product-related admin panels is normalized and stable.

Matching rules include:

- case-insensitive matching
- whitespace normalization
- partial substring matching
- per-field token consistency

## 5.3 Mobile behavior limits

Some heavy admin tools are desktop-only on mobile for safety/usability.

## 6. Panel-by-panel guide

## 6.1 Inbox panel

Purpose:

- monitor incoming admin messages and alerts
- triage unread vs read notifications

Common actions:

- mark single message as read/unread
- mark all as read
- delete single message
- delete all messages
- filter/search by type and text

How to process inbox daily:

1. Open `Inbox`.
2. Filter unread first.
3. Handle stock-critical/system-critical alerts first.
4. Mark resolved messages as read.
5. Clear stale informational messages periodically.

## 6.2 Orders panel

Purpose:

- monitor and manage customer orders
- update status lifecycle
- assign drivers

Common actions:

- view grouped orders
- open order details
- update status
- assign/reassign driver
- filter and search orders

Recommended flow:

1. Open `Orders`.
2. Identify new unassigned orders.
3. Assign drivers.
4. Update status only when operationally confirmed.
5. Recheck live updates before closing session.

## 6.3 Online Refunds panel

Purpose:

- process customer refund requests and statuses

Typical actions:

- review request details
- approve or reject according to policy
- update refund state and notes

Operational note:

- reconcile refund action with payment records and order status before final action.

## 6.4 Online Support panel

Purpose:

- manage support conversations/tickets from online store users

Typical actions:

- review incoming support items
- respond and resolve
- track unresolved/open issues

## 6.5 Quotations panel

Purpose:

- manage business/customer quotation workflows

Typical actions:

- search products for quotation lines
- create and update quotations
- track quotation state

## 6.6 Online Sales panel

Purpose:

- view sales metrics and order-value trends

Typical actions:

- monitor totals and period summaries
- apply date/status filters
- review performance indicators

## 6.7 Online Users panel

Purpose:

- manage user accounts and roles (as permitted)

Typical actions:

- review users
- update role/access where permitted
- investigate account access concerns

Safety note:

- role changes are high-impact. Apply least privilege.

## 6.8 Delivery Drivers panel

Purpose:

- create and maintain driver records

Capabilities:

- add driver profile
- edit details
- update phone/contact details
- delete driver entries
- manual refresh and search

How to add a driver:

1. Open `Delivery Drivers`.
2. Click add/new driver form.
3. Enter required fields.
4. Save and verify row appears in table.

## 6.9 Products panel

Purpose:

- manage website product catalog and product metadata

Core capabilities:

- search and filter products
- create product
- edit product
- delete product
- manage sale pricing fields
- voice-assisted search
- export product table PDF
- expiry alerts sub-tab and alerts PDF export

Sub-tabs:

- `Products`
- `Expiry Alerts`

Recommended editing flow:

1. Confirm operational location.
2. Search target product.
3. Edit fields (name, pricing, stock-related metadata, category, visibility).
4. Save.
5. Verify realtime update in list.

## 6.10 Stocks panel

Purpose:

- inventory operations and stock interventions

Core capabilities:

- stock search and category filtering
- stock status filtering (in-stock, low-stock, out-of-stock)
- stock add/subtract actions
- stock override controls
- low-stock threshold configuration
- stock PDF export

Safe stock update flow:

1. Confirm location.
2. Open target product.
3. Apply add/subtract or override.
4. Add reason where required.
5. Save and verify updated effective stock.

## 6.11 Promotions panel

Purpose:

- define and manage promotional pricing

Core capabilities:

- create/edit/remove promotions
- location-aware promotion targeting
- monitor promotion states

Critical note:

- always verify branch/location target before saving promotion.

## 6.12 Emergency Sale panel

Purpose:

- process emergency sales workflows and POS fallback operations

Typical capabilities:

- open/close emergency sales day controls
- cashier-usable emergency sale recording
- product lookup and scanning flows
- receipt/print support

Suggested flow for supervisors:

1. Ensure emergency day status is correct.
2. Confirm assigned emergency cashiers.
3. Monitor emergency sales posting/sync health.

## 6.13 Emergency Reports panel

Purpose:

- review emergency sales analytics and export reports

Capabilities:

- filter by date presets/custom dates
- apply/reset report filters
- export CSV and PDF (sales/product/cashier views)
- retry failed sync attempts where exposed

## 6.14 POS Management panel

Purpose:

- manage POS-synced catalog visibility and bulk operations

Core capabilities:

- search POS products by name/code/category
- category filter pills
- toggle hide/show from storefront
- bulk hide/unhide/delete selected
- delete all POS products (high-risk)
- stats cards and pagination
- realtime product visibility updates

Safety rules:

1. Use bulk delete only after explicit confirmation and backup expectations.
2. Prefer hide/unhide for temporary storefront control.

## 6.15 POS Sync Monitor panel

Purpose:

- monitor POS integration health and sync activity

Monitor tabs:

- Overview
- Activity
- Health and Issues
- Command Queue
- Live Events

Use this panel to:

- validate branch sync heartbeat
- inspect warnings/failures
- check command queue state
- review recent live sync events

## 6.16 Emergency Cashiers panel

Purpose:

- maintain emergency cashier accounts

Capabilities:

- create/edit/delete cashier accounts
- reset/edit account details
- manual refresh and filtering

## 6.17 Business Operations panel

Purpose:

- run structured business operations modules by functional domain

Top tabs:

- Sales Reports
- Suppliers
- Goods Intake
- Expenses
- Monthly Summary
- Employees
- Payroll
- Report History
- Sales Balancing
- Analytics
- Actions

### 6.17.1 Sales Reports

Use for:

- report summaries
- sales breakdown views
- report export/import (permission-based)
- full workbook import/export (permission-based)

### 6.17.2 Suppliers

Use for:

- supplier master data
- supplier transactions and balances

### 6.17.3 Goods Intake

Use for:

- goods intake entry forms
- intake history
- create/edit/delete/export based on granular permissions

### 6.17.4 Expenses

Use for:

- expense categories
- expense records and drilldowns

### 6.17.5 Monthly Summary

Use for:

- overview cards
- sales/expenses/payroll/suppliers/net summaries
- drilldown navigation into source tabs

### 6.17.6 Employees

Use for:

- employee records
- employee lifecycle actions

### 6.17.7 Payroll

Use for:

- payroll periods
- salary structures
- tax and policy forms
- payroll entries and summaries

### 6.17.8 Report History

Use for:

- historical report tracking
- refresh and audit trail review

### 6.17.9 Sales Balancing

Use for:

- balancing sales data and reconciliation support

### 6.17.10 Analytics

Use for:

- performance analytics views and trend monitoring

### 6.17.11 Actions

Use for:

- sensitive operational actions (including data wipe where permitted)

Warning:

- actions tab can include destructive operations. Follow approval process.

## 6.18 Delivery Coverage panel

Purpose:

- configure delivery zones and coverage rules

Capabilities:

- create/edit zone
- district and area management
- custom area option
- latitude/longitude/radius configuration
- delivery fee and active toggle
- activate/deactivate zone
- delete zone

How to add a zone:

1. Open `Delivery Coverage`.
2. Fill district, area, geo and fee fields.
3. Set active state.
4. Save.
5. Verify zone appears and is active.

## 6.19 System panel

Purpose:

- system-level controls and operational settings

Typical use:

- maintenance controls
- environment/system service checks
- platform-wide configuration actions

## 6.20 Security panel

Purpose:

- security administration and controls

Typical use:

- security settings
- credential/security workflows
- access hardening tasks

## 7. Permission model and role behavior

Visibility and actions are permission-gated.

Examples:

- a user can view a tab but still lack manage actions
- business operations has panel-level and tab-level permissions
- goods intake has granular create/edit/delete/export permissions

Operator rule:

1. If action buttons are missing, check assigned permissions first.
2. Do not attempt workaround edits using unrelated tabs.

## 8. Standard operating procedures (SOP)

## 8.1 Start-of-day admin checks

1. Confirm admin login works.
2. Confirm selected location defaults correctly.
3. Check POS Sync Monitor health.
4. Check Inbox for unresolved critical alerts.
5. Verify product and stock panels load without errors.

## 8.2 Mid-day operations

1. Use location-scoped tabs for stock and pricing work.
2. Process new orders and assign drivers quickly.
3. Monitor emergency workflows if emergency day is open.
4. Review delivery coverage issues reported by checkout errors.

## 8.3 End-of-day checks

1. Review failed sync entries and queue state.
2. Review emergency report outputs.
3. Confirm promotions and stock overrides are still valid.
4. Log pending issues for next shift.

## 9. Admin troubleshooting

## 9.1 Data appears stale in product tabs

1. Confirm location is correct.
2. Use manual refresh button once.
3. Check POS Sync Monitor for branch health.
4. Confirm filters/search are not hiding rows.

## 9.2 Missing action buttons

1. Confirm current user permissions.
2. Confirm tab-level permission assignment.
3. Re-login after role changes.

## 9.3 Order assignment/update not reflected

1. Refresh Orders panel.
2. Check socket/live update indicators.
3. Verify backend status API response in logs.

## 9.4 Delivery validation failures reported by customers

1. Open Delivery Coverage.
2. Verify zone is active and fee is set.
3. Confirm area spelling and custom area rules.
4. Validate radius coordinates if radius-based enforcement is used.

## 10. Snippets for admin training and handoff

### 10.1 Location safety reminder

```
Before changing stock, price, or promotion, verify the selected operational location first.
```

### 10.2 High-risk action reminder

```
Use bulk delete or wipe actions only with explicit approval and verified scope.
```

### 10.3 Troubleshooting escalation snippet

```
If POS values are not updating, capture selected location, product code, timestamp, and POS Sync Monitor status before escalation.
```

## 11. Quick reference task index

- Manage customer-facing product records: Products
- Adjust inventory and overrides: Stocks
- Run discounts/promotions: Promotions
- Process emergency POS fallback sales: Emergency Sale
- Export emergency analytics: Emergency Reports
- Control POS-synced visibility and bulk actions: POS Management
- Diagnose integration health: POS Sync Monitor
- Configure delivery zones and fees: Delivery Coverage
- Manage drivers and cashiers: Drivers, Emergency Cashiers
- Run financial and operational reporting: Business Operations

## 12. Change control note

This guide reflects the active admin dashboard tab architecture and permission model.
Update this file whenever new admin tabs, permission gates, or workflows are introduced.
