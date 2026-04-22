# Citi-Nati Supermarket Emergency Cashier Dashboard User Guide

## 1. Purpose of this guide

This guide explains the emergency cashier dashboard in full.
It is intended for authorized cashier users operating emergency POS sales.

This guide covers:

- cashier route access and security PIN verification
- location selection and lock confirmation workflow
- emergency sales panel operation
- payment, receipt, and sync-status workflows
- keyboard shortcuts and troubleshooting

## 2. Cashier access route and requirements

## 2.1 Cashier dashboard route

- `/cashier`

Access requirements:

- user must be authenticated
- role must be `cashier`
- cashier security PIN gate may appear before access is granted

## 2.2 Security PIN gate

Before dashboard entry, cashier route may require security key/PIN verification.

Expected behavior:

- if no key exists yet, access can continue
- if key exists, PIN must be verified
- invalid PIN blocks access with error message

## 3. Entry flow: location lock and day availability

Cashier POS requires location confirmation at session start.

## 3.1 Location selection modal

On first session load, cashier chooses one location:

- Zomba SH
- Zomba BAR
- Zomba RES
- Blantyre SH

Session behavior:

- selected location is stored in session storage
- location is reused until logout/session reset

## 3.2 Location warning confirmation

After selecting location, a warning modal requires final confirmation.

Purpose:

- prevent sales under wrong branch/location scope

If incorrect:

- cashier can return and reselect location before proceeding

## 3.3 Emergency sales day open/closed check

The dashboard polls system status and can lock cashier POS when day is closed.

Closed-day behavior:

- panel is blocked
- cashier sees lock message
- sales cannot be processed until admin reopens emergency day

## 4. Dashboard layout overview

Top bar includes:

- dashboard title
- selected location badge
- logged-in cashier identity
- logout action

Main panel uses emergency sales interface with:

- command/action buttons
- invoice/cart table
- totals and VAT/discount summary
- sync counters
- recent emergency sales list
- search, quick menu, and payment modals

## 5. Core sales workflow

## 5.1 Build invoice/cart

Ways to add products:

- barcode/code scanner input
- search modal product lookup

Cart operations:

- edit quantity with plus/minus
- direct qty input
- remove selected row
- clear invoice to start new bill

Guardrails:

- stock checks prevent exceeding available stock
- selected row controls delete behavior

## 5.2 Review totals

Before payment, verify:

- subtotal
- VAT summary (enabled/disabled and configured rate)
- discount value
- final total due

## 5.3 Accept payment

Open payment dialog and complete:

1. Select payment method (`CASH`, `CARD`, `MOBILE_MONEY`).
2. Enter tendered amount.
3. Confirm change and balance due values.
4. Click `Accept & Print`.

Expected result:

- sale is saved through cashier emergency sales API
- receipt is generated and printed (if popup allowed)
- invoice clears for next transaction
- recent sales and sync counters refresh

## 5.4 Receipt operations

For recent and last sale records, cashier can:

- print receipt
- view receipt
- download receipt text
- reprint last receipt

If browser popup is blocked:

- user sees popup warning
- enable popups and retry print/view

## 6. Sync status and counters

Emergency sales are tracked by sync state:

- `Pending POS Sync`
- `Synced to POS`
- `Sync Failed`

Dashboard shows status counters and per-sale status labels.

Operational use:

- monitor backlog and failed syncs during shift
- escalate repeated sync failures with sale references

## 7. Keyboard shortcuts and controls

Main shortcuts:

- `F1`: open search modal
- `F3`: focus scanner/invoice capture input
- `F4`: open quick menu
- `F6`: open save/payment dialog
- `F8`: print last receipt
- `F9`: delete selected line
- `F10`: new invoice (clear)
- `F11`: toggle fullscreen panel
- `Escape`: close active modal
- `Enter`: submit in payment/search contexts
- `ArrowDown` / `ArrowUp`: move selected invoice row

Scanner behavior:

- printable keys feed scanner buffer when no modal is active
- `Enter` can commit buffered scan lookup

## 8. Search modal workflow

Search modal supports barcode, product code, and name lookup.

How to use:

1. Press `F1` or click `SEARCH`.
2. Type barcode, code, or product name.
3. Use arrow keys to highlight result.
4. Press `Enter` to add selected product.
5. Press `Escape` to close.

## 9. Quick menu workflow

Quick menu options:

- New Invoice (`F10`)
- Save / Sale (`F6`)
- Print (`F8`)
- Close (`Esc`)

Use quick menu for keyboard-heavy operation during peak periods.

## 10. Session and logout behavior

Logout flow:

- requires confirmation
- clears session-selected cashier location
- ends cashier session

Recommendation:

- always logout at end of shift to prevent location/scope leakage

## 11. Daily operating procedures (SOP)

## 11.1 Shift start checklist

1. Log in and pass cashier security PIN check.
2. Confirm correct location and warning confirmation.
3. Ensure emergency day is open.
4. Test one product lookup (scanner or search).
5. Verify receipt popups are allowed in browser.

## 11.2 Per-sale checklist

1. Add all products and verify quantities.
2. Confirm discount and total values.
3. Capture payment method and tendered amount.
4. Accept sale and print receipt.
5. Verify sale appears in recent sales with sync status.

## 11.3 Shift close checklist

1. Ensure no active customer invoice remains.
2. Review sync counters for pending/failed records.
3. Reprint/download any missing receipts if needed.
4. Logout to clear session location.

## 12. Troubleshooting

## 12.1 POS locked: emergency day closed

Symptoms:

- lock message shown and sales panel unavailable

Action:

1. Contact admin operations to open emergency sales day.
2. Retry after admin confirmation.

## 12.2 Cannot access dashboard due to PIN

Action:

1. Re-enter PIN carefully.
2. Verify no extra spaces.
3. Request admin PIN reset if verification fails repeatedly.

## 12.3 Product scan/search returns no result

Action:

1. Verify barcode/code source.
2. Use search by product name.
3. Confirm selected location is correct.
4. Escalate missing product mapping to admin.

## 12.4 Sale saved but receipt not printed

Action:

1. Check popup blocker settings.
2. Use reprint last receipt (`F8`) after enabling popups.
3. Use receipt view/download from recent sales if needed.

## 12.5 Frequent sync failures

Action:

1. Record affected sale refs and timestamps.
2. Capture displayed sync status.
3. Escalate to admin/POS sync monitor team.

## 13. Escalation data template

When escalating cashier issues, include:

- cashier account identity
- selected location
- sale reference (if available)
- action attempted and keyboard/button used
- displayed error message
- sync status and timestamp

## 14. Support-ready snippets

### 14.1 Location lock reminder

```text
Emergency cashier POS is location-scoped per session. Confirm the correct location before processing the first sale.
```

### 14.2 Popup/receipt reminder

```text
If receipt print/view fails, enable browser popups for this site and use Reprint Last Receipt (F8).
```

### 14.3 Day-closed lock reminder

```text
Emergency sales are currently locked by admin. Cashier sales can continue only after admin opens the emergency sales day.
```

## 15. Quick reference checklist for emergency cashiers

1. Login and verify cashier security PIN.
2. Select and confirm correct location.
3. Confirm emergency day is open.
4. Add items by scan/search and verify totals.
5. Accept payment and print receipt.
6. Watch sync status counters.
7. Logout at shift end.

## 16. Change control note

This guide reflects current cashier dashboard and emergency sales panel behavior.
When emergency POS workflow or controls change, update this guide with release notes to keep cashier operations accurate.
