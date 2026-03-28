# MRA EIS Integration Implementation Documentation

## Cover Page

| Item | Details |
| --- | --- |
| Project Title | MRA EIS Integration Implementation Documentation |
| Business | Citi-Nati Supermarket |
| Location | Blantyre, Malawi |
| Owner | Citi-Nati |
| System | POS Sync Agent + Web Platform |
| System Architect and Developer | Aubrey Mkhulana |
| Document Type | Production Architecture, Implementation, Operations and Compliance Documentation |
| Version | 1.0 |
| Date | 25 March 2026 |

---

## 1. Executive Summary

Citi-Nati Supermarket is implementing an enterprise-grade integration between its POS environment and the Malawi Revenue Authority Electronic Invoicing System (MRA EIS). The integration is designed as a compliance-critical and operations-critical system that transmits invoice-level sales information to MRA in near real time, while preserving continuity in the face of power and internet instability.

The integration architecture combines a local POS Sync Agent (running close to the POS database and branch operations) with a backend web platform that orchestrates business processes and synchronization workflows. This architecture ensures that fiscal reporting can continue reliably even during interruptions, through controlled offline operation, persistent queueing, reconciliation, and deterministic replay.

This integration is required before broader website launch and expanded digital operations because:

1. It establishes legal and tax reporting compliance under MRA EIS requirements.
2. It enables auditable, structured invoice submission with security controls.
3. It prevents business disruption by supporting offline fallback and recovery.
4. It creates a scalable foundation for omnichannel transactions, branch growth, and digital receipt/validation services.

The system therefore serves four strategic goals simultaneously: MRA compliance, secure transmission, operational resilience, and readiness for digital growth.

---

## 2. Business Context and Project Background

Citi-Nati Supermarket operates in a POS-centered retail environment where sales are generated at terminal level and persisted into SQL Server. The business is moving from a purely in-store model toward an integrated digital operating model that includes web platform capabilities, centralized coordination, and stronger governance of retail data.

MRA now requires POS and accounting systems to integrate with the EIS API model, replacing legacy fiscal-device style reporting with API-based invoice reporting. Under this model, compliance is not a periodic batch exercise; it is a transactional integration discipline that requires each sale to be represented in structured payloads and submitted according to MRA validation and control rules.

The Malawi operating environment introduces practical constraints that materially affect architecture:

1. Power interruptions may abruptly stop POS terminals or middleware processes.
2. Internet availability may fluctuate by branch and by time window.
3. Recovery after restart must not cause invoice duplication or compliance gaps.
4. Branch operations must continue serving customers even when online submission is delayed.

As a result, the integration is designed not only as an API client but as a controlled fiscal transaction pipeline with local durability, state management, and reconciliation behavior.

---

## 3. Full System Architecture

### 3.1 High-Level Architecture

```text
+---------------------+        +-----------------------+        +-----------------------+        +-------------------+
| POS Terminals       |        | SQL Server POS DB     |        | POS Sync Agent        |        | MRA EIS API       |
| (Cashiers)          | -----> | (invoice, details,    | <----> | (activation, config,  | <----> | (Onboarding,      |
|                     | writes | stock, pricing tables)|        | signing, queue, retry)| HTTPS  | Sales, Utilities) |
+---------------------+        +-----------------------+        +-----------------------+        +-------------------+
                                           ^                               |
                                           |                               v
                                   +--------------------+         +-----------------------+
                                   | Web Platform       | <-----> | POS Command Queue     |
                                   | Backend APIs       |         | and Monitoring Layer  |
                                   +--------------------+         +-----------------------+
```

### 3.2 Layer Responsibilities

1. POS Terminals
- Capture sales transactions at cashier level.
- Trigger write operations into SQL Server POS tables.
- Print customer receipts and show operational messages.

2. SQL Server POS Database
- Persists invoice headers and invoice lines.
- Persists price and stock movement history.
- Holds branch/location context and product metadata.

3. POS Sync Agent
- Runs locally near POS data source.
- Activates terminal with MRA TAC.
- Stores token, secret key, and MRA configurations.
- Transforms POS records into MRA sales payloads.
- Generates required security signatures and message hashes.
- Submits invoices, handles response flags, and stores validation data.
- Manages offline queue, retries, and startup reconciliation.

4. Backend/Web Platform
- Provides orchestration and command queue management.
- Supports monitoring, audit visibility, and operational controls.
- Coordinates with agent for writeback and synchronization workflows.

5. MRA EIS API
- Authoritative external fiscal platform for onboarding, configuration, sales submission, utility checks, and terminal control (block/unblock).

### 3.3 Why POS Sync Agent Is the Correct Integration Point

A direct browser/frontend integration would expose secret material and be fragile under branch-level instability. Integrating at local middleware level provides the correct separation of concerns:

1. Security boundary: secret key remains server-side/local agent, never in frontend.
2. Reliability boundary: local queue survives transient network failures.
3. Performance boundary: local DB reads avoid remote dependency for payload construction.
4. Recovery boundary: replay and dedup logic can be deterministic and auditable.
5. Operational boundary: branch can continue transacting in controlled offline mode.

### 3.4 Architecture for Malawi Operational Conditions

The design explicitly assumes unstable connectivity and occasional power outages. Therefore:

1. Every submission is treated as a state transition, not a fire-and-forget HTTP call.
2. Local persistence is used for configuration, terminal state, and pending transactions.
3. Startup includes reconciliation checks before normal flow resumes.
4. Last-submitted endpoints from MRA are used to re-align local and remote transaction pointers.

---

## 4. MRA EIS Lifecycle Understanding (Based on Developer Portal and API Guide)

MRA EIS is a lifecycle API, not only a sales endpoint. Correct implementation requires handling the full sequence below.

### 4.1 Lifecycle Stages

1. Terminal acquisition via MRA portal.
2. TAC issuance via email/SMS.
3. Terminal activation call using TAC and environment metadata.
4. Activation response persistence (terminalId, jwtToken, secretKey, configuration).
5. Terminal activated confirmation using x-signature.
6. Operational cycle:
- Refresh configuration when required.
- Submit sales in real-time when online.
- Use offline signature and queue when offline.
- Reconcile using last online/offline transaction endpoints.
7. Utility support operations:
- Ping and product status.
- Site products synchronization.
- VAT5 validation.
- Initial inventory upload support.
- Terminal blocking/unblock checks.

### 4.2 Key Security and Protocol Requirements

1. Bearer token from activation response is required for subsequent calls.
2. Secret key from activation response is used for HMAC operations.
3. x-signature is required for terminal activation confirmation and is computed from TAC using secret key with HMAC-SHA512, then Base64.
4. x-eis-message-hash is required for requests that need payload signing (except activation); hash input is endpoint-defined payload representation and key is secret key.
5. HTTPS is mandatory for transport security.

### 4.3 Endpoint Groups in MRA EIS v1

1. OnBoarding
- activate-terminal
- terminal-activated-confirmation

2. Configuration
- get-latest-configs
- request-new-terminal-token

3. Sales
- submit-sales-transaction
- last-submitted-online-transaction
- last-submitted-offline-transaction

4. Utilities
- ping
- product-status
- taxpayer-initial-inventory-upload
- get-terminal-site-products
- validate-vat5-certificate
- get-terminal-blocking-message
- check-terminal-unblock-status

---

## 5. Terminologies

| Term | Definition | Integration Relevance |
| --- | --- | --- |
| MRA | Malawi Revenue Authority | Regulatory authority receiving fiscal transactions. |
| EIS | Electronic Invoicing System | API platform for invoice-level reporting and validation. |
| REST API | HTTP-based resource interface style | Transport and invocation model for EIS endpoints. |
| JSON | Structured text payload format | Request and response body format for EIS integration. |
| Terminal | POS/accounting client instance integrated with EIS | Primary identity boundary for activation and submission. |
| TAC | Terminal Activation Code | One-time code used to activate a terminal. |
| Secret Key | Terminal cryptographic key from activation | Used for HMAC signature and message hash generation. |
| HMAC-SHA512 | Hash-based message authentication algorithm | Used for x-signature and signed request proof. |
| JWT Token | Bearer authorization token | Required in Authorization header for protected endpoints. |
| Validation URL | MRA-provided or offline-generated verification URL | Printed or encoded in receipt QR for invoice verification. |
| Offline Signature | Signature proving an invoice was generated offline | Included in invoiceSummary for offline transactions. |
| Site ID | MRA site/branch identifier | Included in invoice header to identify selling location. |
| Taxpayer Configuration | MRA configuration subset for taxpayer details | Needed for accurate seller identity and compliance fields. |
| Terminal Configuration | MRA terminal-specific settings | Includes terminal label and offline limit controls. |
| Global Configuration | MRA-wide tax and policy configuration | Defines rates and tax rule context. |

---

## 6. Pre-Integration and Onboarding Process

### 6.1 Mandatory Preconditions

Before coding and before live operation, Citi-Nati must complete MRA onboarding dependencies in the taxpayer portal environment.

1. Register on taxpayer portal (sandbox and target environment).
2. Confirm legal taxpayer identity and contact details.
3. Align TIN, phone, and email with Msonkho Online records.
4. Identify business scenario (product-based for supermarket operations).

### 6.2 Product-Based Setup Path for Citi-Nati

For a product-based supermarket, MRA onboarding includes inventory lifecycle setup:

1. Virtual warehouse is created during onboarding.
2. Initial stock is uploaded using MRA template and submitted for approval.
3. Branches are created for physical trading locations.
4. Approved stock is transferred from virtual warehouse to branches.
5. Terminal applications are submitted per branch/location.
6. TAC is issued after terminal approval.

This sequence is operationally important because EIS expects saleable products/services to be pre-registered and synchronized through official product endpoints.

### 6.3 POS Catalog Synchronization Requirement

Citi-Nati POS product catalog should periodically reconcile with:

- GET terminal site products/services endpoint.

This ensures that local products sold at branch level remain aligned with MRA-approved product/service records and mapped tax metadata.

---

## 7. Terminal Activation Implementation

### 7.1 Activation Request Structure

Endpoint:
- POST /api/v1/onboarding/activate-terminal

Example request:

```json
{
  "terminalActivationCode": "ABCD-EFDC-GSHH-RT45",
  "environment": {
    "platform": {
      "osName": "Windows 11",
      "osVersion": "Windows 11",
      "osBuild": "11.901.2",
      "macAddress": "00-11-22-33-44-55"
    },
    "pos": {
      "productID": "MRA-desktop/2f5a2a4d-8fe1-49ae-95a7-d5cd0f7d2f59",
      "productVersion": "1.0.0"
    }
  }
}
```

### 7.2 Required Field Semantics

| Field | Meaning | Notes |
| --- | --- | --- |
| terminalActivationCode | TAC issued by MRA portal | Mandatory, one-time onboarding code. |
| environment.platform.osName | Platform OS name | Example: Windows 11. |
| environment.platform.osVersion | Platform version label | OS release string. |
| environment.platform.osBuild | Build identifier | Optional in guide, but recommended. |
| environment.platform.macAddress | MAC address of terminal host | Used for environment identity context. |
| environment.pos.productID | Unique POS product identifier | Issued by MRA for certified product, test product ID during development. |
| environment.pos.productVersion | POS software version | Used for compatibility and traceability. |

### 7.3 Activation Response Handling

Activation response includes:

1. terminalId
2. activationDate
3. terminalCredentials.jwtToken
4. terminalCredentials.secretKey
5. configuration object (global, terminal, taxpayer)

The Sync Agent must persist all these values atomically before proceeding.

### 7.4 Terminal Activated Confirmation

Endpoint:
- POST /api/v1/onboarding/terminal-activated-confirmation

Confirmation request includes terminalId and x-signature header.

x-signature generation rule:
- x-signature = Base64(HMAC_SHA512(TAC, secretKey))

Node.js implementation:

```javascript
const crypto = require("crypto");

function computeXSignature(terminalActivationCode, secretKey) {
  return crypto
    .createHmac("sha512", Buffer.from(secretKey, "utf8"))
    .update(Buffer.from(terminalActivationCode, "utf8"))
    .digest("base64");
}
```

Sample confirmation payload:

```json
{
  "terminalId": "3a6d3703-1c39-41e8-98ce-b38d9574540d"
}
```

Successful response example:

```json
{
  "statusCode": 1,
  "remark": "Terminal is now fully activated and ready for use!",
  "data": true,
  "errors": []
}
```

---

## 8. Configuration Management

### 8.1 Endpoint and Trigger Conditions

Endpoint:
- GET /api/v1/configuration/get-latest-configs

The system must refresh configuration:

1. At terminal startup.
2. Whenever sales response has shouldDownloadLatestConfig = true.
3. On scheduled periodic checks.
4. On explicit operator/admin recovery operations.

### 8.2 Configuration Domains

MRA configuration payload includes:

1. globalConfiguration
- Tax rates and broad compliance settings.

2. terminalConfiguration
- Terminal identity, site binding, offline limits, terminal-specific behavior.

3. taxpayerConfiguration
- Seller identity, contact and registration context.

### 8.3 Version Numbers and Drift Control

The integration must track and persist:

1. globalConfigVersion
2. taxpayerConfigVersion
3. terminalConfigVersion

These versions are embedded into invoiceHeader on submission so MRA can validate that the terminal is operating with current policy context.

### 8.4 Behavior for shouldDownloadLatestConfig

If submit-sales-transaction response returns shouldDownloadLatestConfig true:

1. Stop further invoice submissions.
2. Call get-latest-configs.
3. Persist new config atomically.
4. Resume submission with updated versions.

Failure to apply latest config should transition terminal to PENDING_CONFIG_REFRESH state.

### 8.5 Local Storage and Safety

Configuration must be stored in encrypted local storage (or encrypted DB fields), with:

1. Version metadata.
2. Last refresh timestamp.
3. Integrity checksum for corruption detection.
4. Safe rollback to previous known-good config only for read continuity, not for continued fiscal submission.

---

## 9. Sales Submission Flow

### 9.1 End-to-End Transaction Flow

```text
Cashier completes sale
    -> POS writes invoice + invoicedetails into SQL Server
    -> POS Sync Agent detects new invoice
    -> Agent loads header and line rows
    -> Agent maps rows into MRA JSON model
    -> Agent computes security hash (x-eis-message-hash)
    -> Agent sends submit-sales-transaction to MRA
    -> Agent receives response
       -> Store validationURL and compliance response metadata
       -> If shouldDownloadLatestConfig=true: refresh config then continue
       -> If shouldBlockTerminal=true: fetch blocking message and stop sales
    -> Mark invoice sync status and audit trail
```

### 9.2 Sequence Diagram (Online Path)

```text
POS Terminal        SQL Server        POS Sync Agent         MRA EIS
    |                   |                    |                  |
1.  | Save Sale         |                    |                  |
    |------------------>|                    |                  |
2.  |                   | New rows ready     |                  |
    |                   |------------------->|                  |
3.  |                   |                    | Build payload    |
    |                   |                    |----------------->|
4.  |                   |                    | Receive response |
    |                   |                    |<-----------------|
5.  | Print receipt     |                    | Store validation |
    |<------------------|                    |                  |
```

### 9.3 Offline Fallback Path

If MRA is unreachable:

1. Build invoice payload normally.
2. Generate offlineSignature according to MRA offline signing rules.
3. Queue transaction locally with durable status.
4. Continue POS operation within offline thresholds.
5. On connectivity return, replay queue oldest-first with dedup guard.

---

## 10. POS Database Tables and Real Data Mapping

### 10.1 Core Table Roles

| Table | Role in Integration |
| --- | --- |
| invoice | Invoice header source for MRA invoiceHeader and summary rollups. |
| invoicedetails | Line item source for MRA invoiceLineItems and tax breakdown. |
| LastCashSaleNo | Invoice sequence continuity and cash sale numbering. |
| Products | Product master metadata used for product code/name verification (legacy naming in some POS installations). |
| productprices | Source of latest item pricing context (commonly latest by PriceID DESC). |
| ProductActivity | Stock movement table used for available quantity calculations. |
| stockdetailsreport | Stock/batch reporting source (branch-specific stock snapshots in some deployments). |
| DailyStockBalance | Daily stock snapshot source per location and date. |
| stocks | Branch stock holding table in deployments where consolidated stock table exists. |

Note: In current agent code, the table productsmaster is used as the product master source. In environments where Products exists instead, mapping should use the active schema abstraction.

### 10.2 Mandatory Header-to-Detail Relationship

The key relationship used by the integration is:

- invoice.InvoiceNo = invoicedetails.InvoiceCode

This relationship must be enforced in all extraction queries to avoid line/header mismatches.

### 10.3 SQL Extraction Example

```sql
SELECT
  i.InvoiceNo,
  i.InvoiceDate,
  i.InvoiceTime,
  i.CustomerCode,
  i.LocationCode,
  i.GrossSale,
  i.VAT,
  i.Discount,
  i.NetSale,
  i.PayMethod1,
  i.TenAmt1,
  i.InvoiceSerialNo,
  i.TillID,
  i.UserName,
  i.PriceTypeCode,
  i.CashSaleNo,
  d.InvDetailID,
  d.InvoiceCode,
  d.ProductCode,
  d.ProductName,
  d.Qty,
  d.PriceTypeCode AS DetailPriceTypeCode,
  d.UnitPrice,
  d.Discount AS LineDiscount,
  d.Amount,
  d.TaxRate,
  d.TaxAmount,
  d.FPrice,
  d.LocationCode AS DetailLocationCode,
  d.LevyRate,
  d.LevyAmount,
  d.DiscountAmount,
  d.CostPrice,
  d.GrnDate
FROM invoice i
INNER JOIN invoicedetails d
  ON d.InvoiceCode = i.InvoiceNo
WHERE i.InvoiceNo = @InvoiceNo;
```

### 10.4 Mapping Table A: invoice to MRA invoiceHeader

| POS Source Field | MRA Target Field | Transformation Logic |
| --- | --- | --- |
| InvoiceNo or derived serial | invoiceHeader.invoiceNumber | Use deterministic invoice number policy aligned with MRA format rules. |
| InvoiceDate + InvoiceTime | invoiceHeader.invoiceDateTime | Combine into ISO-8601 datetime. |
| Seller TIN from taxpayer config | invoiceHeader.sellerTIN | Not from POS invoice table; from activated taxpayerConfiguration. |
| CustomerCode and B2B mapping | invoiceHeader.buyerTIN / buyerName | Conditional for B2B flow. |
| LocationCode | invoiceHeader.siteId | Map POS branch code to MRA siteId. |
| globalConfigVersion | invoiceHeader.globalConfigVersion | From latest MRA config. |
| taxpayerConfigVersion | invoiceHeader.taxpayerConfigVersion | From latest MRA config. |
| terminalConfigVersion | invoiceHeader.terminalConfigVersion | From latest MRA config. |
| PayMethod1 | invoiceHeader.paymentMethod | Normalize POS codes to MRA enum string. |
| VAT relief indicator | invoiceHeader.isReliefSupply | Derived from sale context and VAT5 validation process. |

### 10.5 Mapping Table B: invoicedetails to MRA invoiceLineItems

| POS Source Field | MRA Target Field | Transformation Logic |
| --- | --- | --- |
| ProductCode | invoiceLineItems[].productCode | Direct map; must be MRA-recognized product code. |
| ProductName | invoiceLineItems[].description | Direct map or normalized description. |
| Qty | invoiceLineItems[].quantity | Decimal quantity. |
| UnitPrice | invoiceLineItems[].unitPrice | POS unit price field. |
| Discount / DiscountAmount | invoiceLineItems[].discount | Use line discount amount in monetary terms. |
| FPrice | invoiceLineItems[].total | Pre-VAT taxable amount per line where available. |
| TaxAmount | invoiceLineItems[].totalVAT | VAT amount per line. |
| TaxRate | invoiceLineItems[].taxRateId (via config lookup) | Map numeric POS tax rate to MRA tax rate ID by config table. |
| Product/service classification | invoiceLineItems[].isProduct | True for physical goods, false for service lines. |

### 10.6 Mapping Table C: Summary and Calculated Fields to MRA invoiceSummary

| Calculation Source | MRA Target Field | Rule |
| --- | --- | --- |
| SUM(line TaxAmount) | invoiceSummary.totalVAT | Sum all line VAT amounts. |
| SUM(line taxable + line VAT) or NetSale policy | invoiceSummary.invoiceTotal | Final invoice payable total. |
| Group by taxRateId | invoiceSummary.taxBreakDown[] | Build taxableAmount and taxAmount per rate. |
| Group levy lines | invoiceSummary.levyBreakDown[] | Include levy fields when applicable. |
| Offline signing logic | invoiceSummary.offlineSignature | Null for online, populated for offline. |
| Tendered amount from POS payments | invoiceSummary.amountTendered | Customer tender amount before change. |

### 10.7 VAT and Amount Interpretation (Important)

Observed POS semantics used in current implementation patterns:

1. FPrice is treated as pre-VAT taxable amount indicator.
2. TaxAmount represents VAT amount for the line.
3. Amount and UnitPrice can be VAT-inclusive in some POS contexts and must be normalized.
4. invoice.VAT aggregates VAT at header level.
5. GrossSale represents pre-VAT subtotal in current queue writeback flow.
6. NetSale is treated as GrossSale + VAT in current operational logic.

Integration rule:
- Always derive taxBreakDown from normalized taxable base and VAT components, not from ambiguous display totals.

---

## 11. Real Payload Examples

### 11.1 Terminal Activation Request

```json
{
  "terminalActivationCode": "CN-2026-ABCD-EFGH",
  "environment": {
    "platform": {
      "osName": "Windows 11 Pro",
      "osVersion": "23H2",
      "osBuild": "22631.3155",
      "macAddress": "00-11-22-33-44-55"
    },
    "pos": {
      "productID": "MRA-desktop/citi-nati-pos-agent",
      "productVersion": "2.4.0"
    }
  }
}
```

### 11.2 Terminal Activated Confirmation Request

Headers:
- Authorization: Bearer <jwtToken>
- x-signature: <Base64(HMAC_SHA512(TAC, secretKey))>

Body:

```json
{
  "terminalId": "3a6d3703-1c39-41e8-98ce-b38d9574540d"
}
```

### 11.3 Sales Submission Payload Example

```json
{
  "invoiceHeader": {
    "invoiceNumber": "E-CN-bTlH-B",
    "invoiceDateTime": "2026-03-25T14:13:09+02:00",
    "sellerTIN": "31233951",
    "buyerTIN": "",
    "buyerName": "",
    "buyerAuthorizationCode": null,
    "siteId": "BLT-CN-01",
    "globalConfigVersion": 4,
    "taxpayerConfigVersion": 3,
    "terminalConfigVersion": 8,
    "isReliefSupply": false,
    "paymentMethod": "Cash"
  },
  "invoiceLineItems": [
    {
      "productCode": "10151530",
      "description": "Sugar 1kg",
      "unitPrice": 1800.00,
      "quantity": 2.0,
      "discount": 0.00,
      "total": 3600.00,
      "totalVAT": 594.00,
      "taxRateId": "A",
      "isProduct": true
    },
    {
      "productCode": "10000021",
      "description": "Salt 500g",
      "unitPrice": 900.00,
      "quantity": 1.0,
      "discount": 0.00,
      "total": 900.00,
      "totalVAT": 148.50,
      "taxRateId": "A",
      "isProduct": true
    }
  ],
  "invoiceSummary": {
    "taxBreakDown": [
      {
        "rateId": "A",
        "taxableAmount": 4500.00,
        "taxAmount": 742.50
      }
    ],
    "levyBreakDown": [],
    "totalVAT": 742.50,
    "invoiceTotal": 5242.50,
    "offlineSignature": null,
    "amountTendered": 5300.00
  }
}
```

### 11.4 Sales Response Example

```json
{
  "statusCode": 1,
  "remark": "Successful",
  "data": {
    "validationURL": "https://eservices.mra.mw/doc/v/?vc=90241313200014&c=fdd8d5ccc06a49d6a1efbf7e3896f0b4",
    "shouldDownloadLatestConfig": false,
    "shouldBlockTerminal": false,
    "validationErrors": []
  },
  "errors": []
}
```

### 11.5 Configuration Response Usage Example

```json
{
  "statusCode": 1,
  "remark": "Successful",
  "data": {
    "globalConfiguration": {
      "versionNo": 4,
      "taxRates": [
        { "id": "A", "name": "VAT-A", "rate": 16.5, "chargeMode": "G", "ordinal": 5 }
      ]
    },
    "terminalConfiguration": {
      "versionNo": 8,
      "terminalLabel": "Cashier 1",
      "isActiveTerminal": true,
      "terminalSite": { "siteId": "BLT-CN-01", "siteName": "Blantyre Main" },
      "offlineLimit": {
        "maxTransactionAgeInHours": 24,
        "maximumTransactionAmount": 750000
      }
    },
    "taxpayerConfiguration": {
      "versionNo": 3,
      "tin": "31233951",
      "tradingName": "Citi-Nati Supermarket"
    }
  },
  "errors": []
}
```

---

## 12. Security Implementation

### 12.1 Security Controls

1. HTTPS transport for all calls.
2. Authorization: Bearer JWT for protected endpoints.
3. Secret key used only in backend/agent process.
4. HMAC signatures for activation confirmation and message authentication.
5. Payload hashing through x-eis-message-hash where required.
6. Structured audit logging without exposing secrets.

### 12.2 x-signature vs x-eis-message-hash

| Header | Purpose | Algorithm | Typical Use |
| --- | --- | --- | --- |
| x-signature | Prove TAC ownership during activation confirmation | HMAC-SHA512 + Base64 | terminal-activated-confirmation |
| x-eis-message-hash | Prove signed payload integrity | HMAC (per MRA endpoint signing rules, using secret key) | Most post-activation signed requests |

### 12.3 Node.js Snippet: x-signature

```javascript
const crypto = require("crypto");

function xSignatureFromTac(tac, secretKey) {
  const mac = crypto.createHmac("sha512", Buffer.from(secretKey, "utf8"));
  mac.update(Buffer.from(tac, "utf8"));
  return mac.digest("base64");
}
```

### 12.4 Node.js Snippet: x-eis-message-hash

```javascript
const crypto = require("crypto");

function computeMessageHash(payloadObject, secretKey) {
  const payload = JSON.stringify(payloadObject);
  return crypto
    .createHmac("sha512", Buffer.from(secretKey, "utf8"))
    .update(Buffer.from(payload, "utf8"))
    .digest("base64");
}
```

### 12.5 Key Storage Policy

1. Secret key is never exposed to browser clients.
2. Key is persisted only in local secured agent store with OS-level protection.
3. Logs must mask all secrets and tokens.
4. Token refresh and key rotation events are auditable.

---

## 13. Error Handling and Terminal State Management

### 13.1 Response Envelope Handling

All responses should be parsed as:

1. statusCode
2. remark
3. data
4. errors[]

statusCode 1 indicates success; negative status codes indicate failure context.

### 13.2 Common Error Codes

| Error Code | Meaning | Required System Action |
| --- | --- | --- |
| -100500 | Server error (e.g., DB inaccessible) | Retry with backoff; keep invoice queued. |
| -100401 | Authentication failure | Refresh/reacquire token; move state to AUTH_ERROR. |
| -100999 | Business rule violation | Mark invoice as failed-validation; require operator/admin review. |
| -100000 | Outdated configuration | Transition to PENDING_CONFIG_REFRESH and call config endpoint. |
| -199999 | Terminal de-activated | Transition to BLOCKED/DEACTIVATED; stop sales submission path. |
| -200010 | Mandatory field missing | Data mapping defect; fail invoice and alert support. |
| -200011 | Invalid value/range/pattern | Validation defect; fail invoice and alert support. |

### 13.3 Terminal State Model

| State | Meaning | System Behavior |
| --- | --- | --- |
| NOT_ACTIVATED | Terminal has not completed activation lifecycle | Allow only activation calls; block fiscal submission. |
| ACTIVE | Normal online operation | Submit sales in real-time and monitor responses. |
| OFFLINE | Connectivity not available | Queue signed offline invoices within thresholds. |
| BLOCKED | MRA has blocked terminal | Stop sales submission and show blocking reason. |
| PENDING_CONFIG_REFRESH | Config update required | Fetch/apply latest config before further submissions. |
| SYNCING | Replay/reconciliation in progress | Controlled background sync and dedup checks. |

### 13.4 State Transition Controls

1. ACTIVE -> OFFLINE on connectivity failure or repeated network timeout.
2. OFFLINE -> SYNCING when connectivity restored.
3. SYNCING -> ACTIVE only after queue consistency and reconciliation checks pass.
4. Any state -> BLOCKED when shouldBlockTerminal true or deactivation code received.

---

## 14. Offline System and Recovery Design

### 14.1 Why Offline Is Mission-Critical

For Citi-Nati in Blantyre, temporary outages are operationally realistic. The system must avoid two extremes:

1. Stopping sales entirely during outage.
2. Continuing sales without audit and compliance controls.

Offline mode therefore supports continuity with governed constraints.

### 14.2 Offline Queue Design

Each unsent invoice record in local queue contains:

1. Local invoice identity.
2. Full MRA payload snapshot.
3. offlineSignature.
4. Attempt count and last error.
5. First-seen and last-attempt timestamps.
6. Idempotency key/hash.
7. Sync status (queued, retrying, submitted, failed-permanent).

### 14.3 Offline Signature Logic

MRA guide describes offline validation URL/signature generation from key invoice attributes and secret key. Practical implementation should maintain:

1. Deterministic signature input.
2. Persisted offlineSignature alongside invoice queue item.
3. Null offlineSignature for online-first transactions.

### 14.4 Replay and Retry Strategy

Pseudo-algorithm:

```text
On startup or connectivity restore:
  load pending queue ordered by createdAt ASC
  for each invoice:
    if terminal state is BLOCKED or PENDING_CONFIG_REFRESH: stop replay
    check duplicate guard (local hash + MRA last submitted pointers)
    submit to MRA
    if success: mark submitted, store validationURL and submittedAt
    if retryable failure: increment retryCount, schedule backoff
    if non-retryable validation failure: mark failed-permanent and alert
```

### 14.5 Use of Last Submitted Endpoints

1. last-submitted-online-transaction
- Used when online submission acknowledgement is uncertain (crash, timeout during response).

2. last-submitted-offline-transaction
- Used after offline replay cycles to verify remote pointer and prevent duplicate resubmission.

### 14.6 Duplicate Prevention Strategy

1. Deterministic invoice number generation and uniqueness per terminal.
2. Local idempotency key for each payload.
3. Replay checks against local completion logs and MRA last-submitted responses.
4. Atomic state transitions in queue persistence.

### 14.7 Crash Recovery

On process restart:

1. Rehydrate terminal state and configs.
2. Perform ping and auth check.
3. Reconcile in-flight submissions where status uncertain.
4. Resume replay from oldest pending item.
5. Unlock stale processing records after timeout guard.

---

## 15. Utilities and Support Endpoints in Operations

### 15.1 Ping

Operational use:

1. Health check before high-volume replay.
2. Scheduled heartbeat for connectivity dashboard.
3. Server time comparison to detect clock drift risks.

### 15.2 Product Status

Operational use:

1. Validate product mapping to MRA categorization.
2. Investigate rejected sales lines due to product/tax mismatch.
3. Support master-data governance for branch catalogs.

### 15.3 Get Terminal Site Products

Operational use:

1. Synchronize approved MRA products/services to POS catalog.
2. Reduce risk of selling unmapped items.
3. Align descriptions, tax behavior, and branch-level availability.

### 15.4 Taxpayer Initial Inventory Upload

Operational use:

1. One-time onboarding data migration for product inventory.
2. Phased batch upload with staging and finalization.
3. Follow-up portal synchronization and approval workflow required before inventory becomes active.

### 15.5 VAT5 Validation

Operational use:

1. Required when isReliefSupply true.
2. Confirms certificate authenticity and eligibility for VAT-exempt treatment.
3. Prevents invalid tax relief submissions.

### 15.6 Get Terminal Blocking Message

Operational use:

1. Called when sales response indicates shouldBlockTerminal true.
2. Retrieves official reason text to display to operator.
3. Supports immediate compliance communication.

### 15.7 Check Terminal Unblock Status

Operational use:

1. Periodic check for blocked terminals.
2. Allows controlled return to service when isUnblocked true.
3. Prevents unauthorized resume of fiscal submissions.

---

## 16. Receipts, Validation URL and QR Context

### 16.1 EFD to EIS Transition Impact

Under EIS, the emphasis shifts from legacy fiscal-device print channels to API-backed validation workflows. This reduces dependence on specialized fiscal paper mechanisms and allows digital-first verification patterns.

### 16.2 Validation URL Behavior

1. Online sales: validationURL returned by MRA in submit response.
2. Offline sales: validation URL generated using offline signature method and later validated on replay.

### 16.3 Receipt Implications

1. Receipt should carry validation reference (URL and/or QR).
2. Customer can validate transaction through MRA verification flow.
3. Store systems should archive validation URL with invoice metadata.

### 16.4 Future Extensions

Architecture can be extended to support:

1. PDF receipt generation with embedded QR.
2. WhatsApp receipt sharing.
3. Email delivery with validation link.
4. Customer portal self-service verification.

---

## 17. Deployment and Production Design

### 17.1 Runtime Responsibilities

1. POS Machine
- Runs POS application and local transaction capture.
- Maintains branch operations and receipt printing.

2. POS Sync Agent
- Connects to SQL Server.
- Handles MRA onboarding/config/sales/security/offline logic.
- Performs queue processing and reconciliation.

3. Backend Platform (including Render-hosted services where applicable)
- Provides orchestration APIs, command queue, monitoring, and support tooling.

### 17.2 Environment and Secrets

Typical production variables include:

1. DB_SERVER, DB_DATABASE, DB_USER, DB_PASSWORD
2. POS_LOCATION_CODE
3. POS_SECRET (internal API authentication)
4. MRA_BASE_URL and environment mode
5. MRA_VENDOR_ACCESS_KEY (production activation)
6. Polling intervals and retry controls

### 17.3 Startup Procedure

1. Load local terminal credentials and config.
2. Validate connectivity via ping.
3. Check for config refresh.
4. Resume pending queue reconciliation.
5. Enter ACTIVE state only after checks pass.

### 17.4 Shutdown and Restart Recovery

1. Graceful shutdown flushes in-memory state and closes DB connections.
2. On restart, stale in-progress jobs are re-evaluated with lock timeout policy.
3. Replay process resumes from persistent queue state.

### 17.5 Logging and Monitoring

Log domains:

1. Activation lifecycle events.
2. Config version changes.
3. Submission attempts and outcomes.
4. Offline queue depth and age.
5. Block/unblock and operator notifications.

Monitoring indicators:

1. Submission success rate.
2. Average submission latency.
3. Pending queue size and oldest pending age.
4. Terminal state distribution.
5. Authentication and config drift error counts.

### 17.6 Internet Dependency Boundaries

1. Selling can continue offline within thresholds.
2. Fiscal submission and configuration refresh depend on internet.
3. Recovery is automatic when connectivity returns.

---

## 18. Testing Strategy

### 18.1 Test Scope Matrix

| Test Area | Objective | Expected Result |
| --- | --- | --- |
| Sandbox activation | Validate TAC activation and confirmation lifecycle | Terminal transitions to ACTIVE with persisted credentials. |
| Configuration refresh | Validate shouldDownloadLatestConfig handling | Agent blocks submissions until new config is applied. |
| Sales payload validation | Validate field mapping and tax computations | MRA accepts payload and returns validationURL. |
| Online success path | Validate normal real-time submission | Completed invoice with no queue residue. |
| Offline queue path | Validate controlled offline operation | Offline invoices queued with signatures and replayed later. |
| Blocked terminal scenario | Validate shouldBlockTerminal branch | Terminal enters BLOCKED state and displays message. |
| Outdated config scenario | Validate error -100000 handling | PENDING_CONFIG_REFRESH state and successful refresh. |
| Recovery and reconciliation | Validate restart after crash/timeouts | No duplicates and queue integrity preserved. |
| UAT with branch staff | Validate operational usability | Staff can operate with clear prompts and escalation flow. |

### 18.2 Production Readiness Criteria

1. End-to-end pass in sandbox with audit evidence.
2. No unresolved mandatory-field or invalid-value mapping defects.
3. Proven offline replay without duplication.
4. Documented runbook and support escalation path.

---

## 19. Operational Guide for Management and Staff

### 19.1 Normal Sales Operation

In normal online operation, staff continue using POS as usual. The system submits invoices to MRA in background and stores validation information automatically.

### 19.2 When Internet Is Down

1. POS continues sales in offline mode if thresholds permit.
2. System queues transactions locally.
3. Once internet returns, queued transactions are sent automatically.
4. No manual re-entry should be required.

### 19.3 When Terminal Is Blocked

1. Sales submission process halts.
2. System retrieves and displays official MRA blocking message.
3. Management contacts designated compliance/support owner.
4. System periodically checks unblock status until cleared.

### 19.4 When New Configuration Is Required

1. System indicates configuration refresh needed.
2. Agent downloads and applies latest config.
3. Sales submission resumes after successful refresh.

### 19.5 Logs and Support Information to Retain

Management and support should retain:

1. Invoice numbers and submission timestamps.
2. Terminal state transitions.
3. Error codes and remarks.
4. Queue statistics and replay outcomes.
5. Block/unblock event history.

### 19.6 Management Dashboard Focus

Management should monitor:

1. Daily successful submissions vs total sales.
2. Offline queue backlog risk.
3. Repeated authentication/config errors.
4. Terminal block incidents and resolution SLA.

---

## 20. Risks, Limitations and Mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Power outages | Interrupted submissions and potential in-flight uncertainty | Local durable queue, restart reconciliation, UPS where feasible. |
| Poor connectivity | Delayed fiscal reporting | Offline mode with threshold enforcement and replay. |
| Incorrect product mapping | Rejected lines or tax non-compliance | Product synchronization and product-status validation controls. |
| Configuration drift | Submission failures due to version mismatch | Automatic refresh on startup and on shouldDownloadLatestConfig. |
| Token expiry/auth failure | Submission interruption | Token refresh workflow and retry policy. |
| Terminal blocking | Sales processing interruption | Immediate block message retrieval and unblock polling runbook. |
| Duplicate submissions | Audit and compliance inconsistencies | Idempotency keys, last-submitted reconciliation, atomic queue states. |
| Incorrect VAT mapping | Tax calculation errors and compliance risk | Deterministic tax breakdown from normalized taxable base and config tax IDs. |
| Database access issues | Inability to build payloads from POS | Connection pool health checks, failover procedures, alerting. |

---

## 21. Implementation Notes for Citi-Nati Existing Platform

### 21.1 Current Platform Building Blocks Already in Place

Citi-Nati already has important production components that directly support MRA integration hardening:

1. POS Sync Agent with periodic polling and SQL interaction.
2. Backend command queue with status lifecycle (PENDING, PROCESSING, COMPLETED, FAILED).
3. Retry framework with bounded backoff.
4. Invoice writeback and structured field handling between backend and POS.

These components reduce implementation risk because they already establish durable workflow and idempotent command processing patterns.

### 21.2 Required MRA Adapter Additions

To complete full MRA EIS production integration, the POS Sync Agent should include an MRA adapter module with:

1. Terminal onboarding service.
2. Configuration service and local version store.
3. Sales payload mapper from invoice/invoicedetails to MRA model.
4. Cryptographic service for x-signature and x-eis-message-hash.
5. Offline queue and replay/reconciliation service.
6. Utility service wrapper (ping, products, VAT5, block/unblock).

---

## 22. Conclusion

The Citi-Nati Supermarket integration with MRA EIS is not only a regulatory interface. It is a production transaction system that combines compliance, continuity, and digital modernization in one architecture.

By placing fiscal integration logic in the POS Sync Agent, enforcing secure credential handling, implementing strict state management, and supporting offline resilience with reconciliation, Citi-Nati achieves:

1. Compliance assurance for invoice-level reporting to MRA.
2. Business continuity under real operating constraints in Malawi.
3. A robust base for website launch and digital retail expansion.
4. Scalable architecture that can support additional branches, channels, and customer-facing receipt services.

This implementation positions Citi-Nati Supermarket to operate responsibly and competitively, with fiscal compliance embedded as an operational capability rather than a post-fact administrative task.

---

## Appendix A: Quick Endpoint Reference

| Category | Endpoint |
| --- | --- |
| Onboarding | POST /api/v1/onboarding/activate-terminal |
| Onboarding | POST /api/v1/onboarding/terminal-activated-confirmation |
| Configuration | GET /api/v1/configuration/get-latest-configs |
| Configuration | POST /api/v1/configuration/request-new-terminal-token |
| Sales | POST /api/v1/sales/submit-sales-transaction |
| Sales | POST /api/v1/sales/last-submitted-online-transaction |
| Sales | POST /api/v1/sales/last-submitted-offline-transaction |
| Utilities | POST /api/v1/utilities/ping |
| Utilities | POST /api/v1/utilities/product-status |
| Utilities | POST /api/v1/utilities/get-terminal-site-products |
| Utilities | POST /api/v1/utilities/taxpayer-initial-inventory-upload |
| Utilities | POST /api/v1/utilities/validate-vat5-certificate |
| Utilities | POST /api/v1/utilities/get-terminal-blocking-message |
| Utilities | POST /api/v1/utilities/check-terminal-unblock-status |

## Appendix B: MRA Response Envelope Pattern

```json
{
  "statusCode": 1,
  "remark": "Success",
  "data": {},
  "errors": []
}
```

## Appendix C: Core Integration Invariant

Always enforce:

- invoice.InvoiceNo = invoicedetails.InvoiceCode

Any violation should fail mapping and trigger data-quality alert before submission to MRA.
