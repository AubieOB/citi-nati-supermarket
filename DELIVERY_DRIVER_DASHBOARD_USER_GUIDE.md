# Citi-Nati Supermarket Delivery Driver Dashboard User Guide

## 1. Purpose of this guide

This guide explains the delivery driver dashboard in full.
It is intended for active delivery drivers and support staff who assist drivers.

This guide covers:

- route access and security gate requirements
- assigned, in-transit, and completed delivery workflows
- order details and map usage
- realtime updates and notifications
- troubleshooting and escalation-ready notes

## 2. Driver access route and requirements

## 2.1 Driver dashboard route

- `/driver`

Access requirements:

- user must be authenticated
- role must be `driver`
- driver security key gate may appear before access is granted

## 2.2 Security key gate

On protected driver route entry, the system checks driver security key status.

Expected behavior:

- if no key is configured yet, entry can continue
- if key exists, driver must verify before dashboard opens
- invalid key shows an error and blocks entry

## 3. Dashboard overview

The dashboard is organized into operational sections:

- metrics cards (deliveries, earnings, active deliveries)
- available orders (`ASSIGNED`)
- in-transit orders (`IN_TRANSIT`)
- completed orders (`DELIVERED`)
- order details modal with timeline and order content

Main actions:

- `View Details`
- `Start Delivery`
- `Mark Delivered`

## 4. Realtime behavior

The dashboard listens for order updates assigned to the logged-in driver.

Expected realtime behavior:

- new assigned order triggers notification and refresh
- transition to in-transit triggers notification and refresh
- delivered status triggers success notification and refresh

Operational note:

- if order lists look stale, use manual refresh workflow in section 10.1

## 5. Understanding delivery statuses

Driver dashboard status model:

- `ASSIGNED`: ready to pick and start trip
- `IN_TRANSIT`: delivery has started
- `DELIVERED`: delivery completed

Status transitions for driver actions:

1. `ASSIGNED` -> `IN_TRANSIT`
2. `IN_TRANSIT` -> `DELIVERED`

## 6. Available orders workflow (`ASSIGNED`)

Available orders appear as cards in the `Available Orders` section.

Typical fields shown:

- order ID
- delivery address
- house number
- order total
- created timestamp

How to process an available order:

1. Open `Available Orders`.
2. Identify target order card.
3. Click `View Details` to verify customer and items.
4. Click `Start Delivery` when ready to dispatch.
5. Confirm action in the prompt.

Expected result:

- order moves from `Available Orders` to `In Transit`.

## 7. In-transit workflow (`IN_TRANSIT`)

In-transit orders are shown in the `In Transit` section.

Additional behavior:

- map preview iframe appears when latitude/longitude exists
- warning banner appears when no coordinates are available

How to complete delivery:

1. Open `In Transit`.
2. Click `View Details` to confirm destination/order lines.
3. Use map preview where coordinates are present.
4. Click `Mark Delivered` at successful handoff.
5. Confirm action in the prompt.

Expected result:

- order moves to `Completed` section.

## 8. Completed deliveries (`DELIVERED`)

Completed deliveries are grouped into:

- `Completed Today`
- `Previous Deliveries`

Notes:

- grouping is based on completion timestamp
- each row can be opened again via `View Details`

Use completed tables for:

- quick proof of completed workload
- basic operational history checks

## 9. Order details modal

The details modal is available from all order sections.

Modal includes:

- delivery timeline (`ASSIGNED`, `IN_TRANSIT`, `DELIVERED`)
- status badge
- order metadata (customer, address, house number)
- item lines and monetary values
- map section when coordinates are available

Best practice:

- always verify address and contact context before `Start Delivery` and before `Mark Delivered`

## 10. Daily operating procedures (SOP)

## 10.1 Driver shift start checklist

1. Log in and open `/driver`.
2. Complete driver security key verification if prompted.
3. Confirm dashboard sections load without errors.
4. Review `Available Orders` and `In Transit` counts.
5. Open first assigned order details before dispatch.

## 10.2 Per-order execution checklist

1. Verify order ID, address, and house number.
2. Start delivery only when physically prepared to leave.
3. Use in-transit map data where available.
4. Confirm delivery with customer.
5. Mark delivered immediately after successful handoff.

## 10.3 Shift close checklist

1. Confirm `In Transit` count is correct.
2. Review `Completed Today` list for expected totals.
3. Report unresolved exceptions to admin support.
4. Log out securely.

## 11. Error handling and troubleshooting

## 11.1 Dashboard failed to load orders

Symptoms:

- error panel shown instead of order lists

Checks:

1. Confirm internet connectivity.
2. Refresh the page once.
3. Re-login if token is expired.
4. Escalate with timestamp and screenshot if still failing.

## 11.2 Security key verification fails

Checks:

1. Re-enter key carefully.
2. Confirm no extra spaces.
3. Request admin reset if key is forgotten or locked.

## 11.3 Order does not move after action

Checks:

1. Re-open order details.
2. Confirm action prompt was accepted.
3. Check whether status changed in section list.
4. Refresh page and verify again.
5. Escalate with order ID if mismatch persists.

## 11.4 Missing map coordinates

Behavior:

- dashboard shows `No coordinates available`

Action:

- continue using textual address and house number
- report repeated location-data gaps to admin operations

## 12. Escalation data template

When escalating an issue, provide:

- driver account identifier
- order ID
- current visible status
- attempted action (start or delivered)
- exact error message
- timestamp and network condition

## 13. Support-ready snippets

### 13.1 Driver status update reminder

```text
Please update each order status in sequence: ASSIGNED to IN_TRANSIT, then IN_TRANSIT to DELIVERED.
```

### 13.2 Missing coordinates fallback note

```text
No map coordinates were provided for this order. Use deliveryAddress and houseNumber exactly as shown in order details.
```

### 13.3 Security key escalation note

```text
If your driver security key cannot be verified, stop processing deliveries and request an admin key reset.
```

## 14. Quick reference checklist for drivers

1. Log in and pass driver security key check.
2. Open assigned order details before dispatch.
3. Start delivery only when leaving.
4. Use map preview when available.
5. Mark delivered immediately after handoff.
6. Review completed-today list before logout.

## 15. Change control note

This guide reflects the current behavior of the driver dashboard route and status flow.
When driver workflow logic changes, update this guide with release notes so operational instructions stay accurate.
