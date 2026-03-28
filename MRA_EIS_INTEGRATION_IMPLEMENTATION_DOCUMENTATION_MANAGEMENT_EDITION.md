# MRA EIS Integration Implementation Documentation

## Management and Stakeholder Edition

---

## Document Control

| Item | Details |
| --- | --- |
| Document Title | MRA EIS Integration Implementation Documentation |
| Edition | Management and Stakeholder Edition |
| Business | Citi-Nati Supermarket |
| Owner | Citi-Nati |
| Location | Blantyre, Malawi |
| System | POS Sync Agent + Web Platform |
| System Architect and Developer | Aubrey Mkhulana |
| Document Status | Final Draft for Management Review |
| Version | 1.0 |
| Date | 25 March 2026 |
| Classification | Internal Business and Technical Governance Document |

## Revision History

| Version | Date | Author | Description |
| --- | --- | --- | --- |
| 1.0 | 25 March 2026 | Aubrey Mkhulana | Initial management and stakeholder edition |

## Intended Audience

This document is prepared for:

1. Citi-Nati ownership and management
2. Operations leadership
3. Technical support and implementation teams
4. Compliance and finance stakeholders
5. External partners or reviewers requiring a formal understanding of the MRA EIS integration model

## Approval and Sign-Off

| Role | Name | Signature | Date |
| --- | --- | --- | --- |
| Business Owner | Citi-Nati |  |  |
| System Architect and Developer | Aubrey Mkhulana |  |  |
| Operations Representative |  |  |  |
| Finance and Compliance Representative |  |  |  |

---

## 1. Executive Statement

This document presents the production implementation approach for integrating Citi-Nati Supermarket with the Malawi Revenue Authority Electronic Invoicing System. It is intended to serve as a formal business and engineering record of how the supermarket’s POS environment, local synchronization middleware, backend platform, and MRA EIS services work together to deliver compliant invoice reporting, secure communication, and resilient branch operations.

The integration is a foundational control system for the supermarket’s digital future. It is not limited to tax reporting. It is a business continuity mechanism, a compliance safeguard, and an architectural prerequisite for broader digital operations, including website-enabled sales processes, structured inventory synchronization, and customer-facing receipt validation.

Citi-Nati operates in an environment where power instability and intermittent network availability are practical realities. For this reason, the solution is intentionally designed around a local POS Sync Agent and controlled transaction recovery processes rather than a purely cloud-dependent design. This ensures that branch operations remain practical while maintaining the integrity and legal validity of reported sales.

---

## 2. Business Need and Strategic Rationale

Citi-Nati Supermarket operates as a POS-driven retail business. Sales originate at the branch terminal level and are stored in the local POS database. As the business modernizes its operations and expands digital capability, fiscal reporting can no longer remain a detached manual or batch-oriented exercise. MRA EIS requires POS and accounting systems to integrate directly through API-based transaction reporting.

This integration is therefore required for the following reasons:

1. Legal compliance with MRA electronic invoicing requirements
2. Accurate, invoice-level reporting of taxable transactions
3. Operational readiness for digital and online-enabled business workflows
4. Better auditability of sales, tax, and branch-level fiscal activity
5. Reduced business risk caused by fragmented or delayed fiscal reporting

From a management perspective, this integration is a control framework. It ensures that retail operations, compliance obligations, and digital transformation are moving in the same direction instead of operating as disconnected projects.

---

## 3. Scope of the Implemented Integration

The integration scope includes:

1. Terminal onboarding and activation with MRA using TAC
2. Secure storage and use of terminal credentials and secret key material
3. Configuration synchronization from MRA
4. Real-time submission of sales transactions to MRA EIS
5. Local offline queueing where immediate submission is not possible
6. Recovery and replay after outages or process interruption
7. Terminal state management including blocked or outdated configuration scenarios
8. Mapping of Citi-Nati POS data structures into MRA invoice payload format
9. Operational support functions such as ping, product synchronization, VAT5 validation, and block/unblock checks

The integration does not replace Citi-Nati’s POS system. It adds a fiscal integration layer that enables the existing store operations to remain operational while becoming compliant with the MRA EIS model.

---

## 4. Executive Architecture Overview

### 4.1 Enterprise View

```text
+--------------------+       +----------------------+       +----------------------+       +------------------+
| Store POS          |       | SQL Server POS DB    |       | POS Sync Agent       |       | MRA EIS API      |
| Terminal Layer     | ----> | Sales and Stock Data | <-->  | Compliance Middleware| <-->  | Fiscal Platform   |
+--------------------+       +----------------------+       +----------------------+       +------------------+
                                         ^                             |
                                         |                             v
                                 +-------------------+        +----------------------+
                                 | Backend Platform  | <----> | Monitoring / Control |
                                 +-------------------+        +----------------------+
```

### 4.2 Why the Architecture Matters to Management

A central business decision in this solution is the use of a local POS Sync Agent. This is the component that creates reliability in real operating conditions.

If the supermarket depended entirely on a live internet connection for each invoice submission, then every connectivity interruption could directly affect branch operations. The local middleware approach prevents that exposure by introducing durable local processing, secure credential handling, and controlled recovery.

This means:

1. Branch operations remain workable during temporary outages.
2. Sales data is not lost when systems restart.
3. The compliance mechanism is closer to the source transaction.
4. Sensitive credentials are not exposed in browser-facing systems.

---

## 5. System Ownership and Governance Model

### 5.1 Business Ownership

The integration belongs operationally to Citi-Nati Supermarket as the taxpayer and regulated business entity. All sales submitted through the system are attributable to the business and its configured branches or sites.

### 5.2 Technical Ownership

The implemented architecture, integration design, and operational software responsibilities sit with the system architect and developer, Aubrey Mkhulana.

### 5.3 Governance Responsibility Areas

| Area | Owner |
| --- | --- |
| Taxpayer registration and terminal acquisition | Citi-Nati management |
| Branch and stock onboarding at MRA | Citi-Nati management and operations |
| Technical implementation and maintenance | Aubrey Mkhulana |
| POS infrastructure availability | Branch operations and technical support |
| Compliance monitoring and issue escalation | Management and finance/compliance stakeholders |

---

## 6. MRA EIS Operational Lifecycle

The MRA EIS integration should be understood as a governed system lifecycle rather than a single API call.

### 6.1 Lifecycle Stages

1. Taxpayer portal registration
2. Product-based business onboarding
3. Initial stock upload and approval where applicable
4. Branch creation and stock transfer
5. Terminal application by branch/site
6. TAC issuance
7. Terminal activation by local POS Sync Agent
8. Activation confirmation and final enablement
9. Ongoing sales submission and configuration synchronization
10. Offline continuity and replay where required
11. Utility and support calls for operations, validation, and blocking management

This lifecycle has strategic importance because MRA EIS validates not only the transaction payload but also the state and legitimacy of the terminal, taxpayer, configuration version, and product context.

---

## 7. Onboarding Requirements for Citi-Nati Supermarket

Before a terminal can submit sales legally through the API, the following practical work must be complete.

### 7.1 Portal and Taxpayer Preconditions

1. Registration on the MRA taxpayer portal in the appropriate environment
2. Correct TIN, phone number, and email aligned with Msonkho Online
3. Product-based business setup reflecting supermarket operations

### 7.2 Inventory and Branch Preconditions

For Citi-Nati, the product-based onboarding path applies. This means:

1. MRA creates a virtual warehouse during onboarding
2. Initial stock is uploaded using MRA’s accepted process
3. MRA officers approve uploaded stock
4. Branches are created for actual selling locations
5. Stock is transferred from the virtual warehouse to those branches

### 7.3 Terminal Preconditions

1. Terminal application is made for each branch or selling location
2. MRA issues TAC by email or SMS after approval
3. The TAC is entered into the POS Sync Agent activation workflow

The practical meaning for management is straightforward: no branch should be considered fully EIS-ready until branch setup, inventory approvals, and terminal activation are all complete.

---

## 8. Terminal Activation and Credential Establishment

The activation process is the formal point at which the branch terminal becomes a recognized MRA EIS participant.

### 8.1 Required Activation Inputs

The POS Sync Agent submits:

1. terminalActivationCode
2. platform metadata including operating system and MAC address
3. POS software identity using the MRA-recognized product ID and product version

### 8.2 Activation Outputs

MRA returns:

1. terminalId
2. activationDate
3. JWT bearer token
4. secret key
5. taxpayer, terminal, and global configuration data

These values must be stored locally and securely before activation can be considered complete.

### 8.3 Activation Confirmation

After the terminal successfully persists the response, it must send activation confirmation with the x-signature header. This final step is what allows the terminal to move from pending activation into full operational state.

Management implication:
- A terminal is not truly operational merely because a TAC was entered. It is operational only after activation response is stored and confirmation is accepted by MRA.

---

## 9. Configuration Lifecycle and Change Control

MRA EIS operates with versioned configuration across three domains:

1. Global configuration
2. Taxpayer configuration
3. Terminal configuration

These configurations define tax and identity context used in invoice processing. If a terminal is using outdated configuration, MRA may reject transactions or instruct the system to refresh immediately.

### 9.1 Management Significance

This is not a background technical detail. Configuration drift is a compliance risk. The system therefore treats a required configuration refresh as an operational event.

When MRA indicates that the latest configuration must be downloaded:

1. The agent pauses further sales submissions.
2. The latest configuration is retrieved and stored.
3. Normal transaction submission resumes only after the refresh succeeds.

This protects the business from continuing to transact using outdated tax or terminal policy data.

---

## 10. Sales Reporting Model

### 10.1 Operational Business Flow

The implemented model is designed around the real branch sales flow:

1. A customer purchases goods at a POS terminal.
2. The POS writes the sale into SQL Server tables.
3. The POS Sync Agent detects the completed invoice.
4. The invoice is mapped into the MRA sales schema.
5. Security signatures and hashes are generated.
6. The invoice is submitted to MRA.
7. MRA returns validation information and operational control flags.
8. Receipt validation information is stored for future customer verification and audit purposes.

### 10.2 Business Value

This model ensures that the legal fiscal representation of the sale is tied closely to the actual operational transaction, reducing the risk of lost or deferred compliance events.

---

## 11. Citi-Nati POS Data Mapping Model

The implementation uses actual table relationships from the Citi-Nati POS environment.

### 11.1 Key Relationship

The mandatory invoice-to-line relationship is:

- invoice.InvoiceNo = invoicedetails.InvoiceCode

This is a critical integration invariant. If this relationship is broken or inconsistently queried, line items can be attached to the wrong invoice header, creating both operational and compliance risk.

### 11.2 Main Table Roles

| Table | Business Purpose |
| --- | --- |
| invoice | Stores sale header records |
| invoicedetails | Stores sale line items |
| LastCashSaleNo | Maintains invoice/cash sale numbering continuity |
| productprices | Stores pricing history and current selling price context |
| ProductActivity | Stores stock movement history |
| DailyStockBalance | Holds stock position snapshots |
| stocks / stockdetailsreport | Support operational stock references in environments where these structures are active |

### 11.3 Important Financial Interpretation

The current Citi-Nati implementation patterns indicate the following:

1. FPrice behaves as the pre-VAT or taxable amount basis
2. TaxAmount represents VAT
3. GrossSale behaves as the pre-VAT subtotal in current POS queue logic
4. NetSale is treated as GrossSale plus VAT in current implementation flows

This distinction matters because MRA payloads require clear separation between taxable amount, VAT amount, and invoice total.

---

## 12. Security and Control Model

The security design is one of the strongest reasons for the chosen architecture.

### 12.1 Core Controls

1. HTTPS is used for transport security
2. Bearer JWT token protects post-activation endpoints
3. Secret key remains server-side within the Sync Agent context
4. x-signature proves activation confirmation integrity
5. x-eis-message-hash protects signed request integrity

### 12.2 Business Importance

This model ensures that:

1. Sensitive fiscal credentials are not exposed to end users or browsers
2. Payload tampering is detectable
3. Terminal identity remains controlled and auditable
4. Compliance evidence can be retained in logs without exposing secrets

---

## 13. Offline Continuity and Business Resilience

### 13.1 Why This Section Matters

For branch retail operations in Malawi, offline resilience is not optional. It is a practical requirement.

The MRA EIS documentation explicitly supports offline transaction handling subject to controlled thresholds. Citi-Nati’s implementation approach follows this model by storing locally generated offline transactions in a durable queue and replaying them when connectivity returns.

### 13.2 Operational Policy

When connectivity is lost:

1. Sales may continue only within the configured MRA offline thresholds
2. Offline signature is generated and stored with the queued invoice
3. Transactions remain locally durable until successful replay
4. On reconnection, the system submits queued invoices in a controlled order

### 13.3 Management Significance

This design protects revenue continuity without ignoring compliance obligations. It allows stores to continue serving customers while still preserving an auditable path back to MRA submission.

---

## 14. Terminal Blocking, Exceptions and Recovery

MRA may instruct the terminal to block further sales submissions. This may happen due to compliance or administrative reasons.

When this occurs:

1. The system stops normal submission flow
2. The blocking reason is retrieved from MRA
3. The reason is shown to the operator
4. The system periodically checks if the terminal has been unblocked

This process ensures that blocked operation is handled in a controlled and transparent way instead of leaving branch staff with unexplained system failure.

---

## 15. Operational Responsibilities in Production

### 15.1 Store Staff

Store staff should continue normal selling procedures. They are not expected to manage fiscal payloads or technical synchronization directly.

What staff should expect:

1. Normal receipts during normal online operation
2. Minimal disruption during short internet outages where offline thresholds permit
3. Clear on-screen messages if the terminal is blocked or configuration refresh is required

### 15.2 Management

Management should monitor:

1. Submission success rates
2. Offline backlog size
3. Repeated error categories
4. Terminal block incidents
5. Whether branch onboarding and configuration remain current

### 15.3 Technical Support

Technical support should monitor:

1. Agent health and startup state
2. SQL Server connectivity
3. Pending queue age and size
4. Authentication and configuration failures
5. Replay and recovery logs after outages

---

## 16. Testing and Readiness Assurance

Before live rollout, the following must be demonstrated:

1. Successful sandbox activation and confirmation
2. Successful configuration retrieval and version usage
3. Successful online invoice submission
4. Successful offline queue creation and replay
5. Correct handling of outdated configuration responses
6. Correct handling of blocked terminal scenarios
7. Verified recovery after process interruption or power event
8. User acceptance testing with branch operations staff

This is necessary because MRA compliance depends not only on happy-path API success, but on correct handling of interruptions and operational edge cases.

---

## 17. Risks and Management Controls

| Risk | Business Effect | Management Control |
| --- | --- | --- |
| Power outage | Interrupted operations and uncertain sync state | Durable local queue, restart recovery process, branch power planning |
| Poor connectivity | Delayed real-time submission | Controlled offline model and replay policy |
| Product mapping issues | Rejected transactions or incorrect tax treatment | Product synchronization and data governance |
| Outdated configuration | Compliance failure or transaction rejection | Automatic config refresh workflow |
| Credential/authentication issues | Terminal unable to submit | Secure storage and controlled refresh workflows |
| Terminal blocking | Sales reporting disruption | Blocking message retrieval and unblock monitoring |
| Duplicate replay | Audit and tax inconsistency | Idempotency controls and last-submitted reconciliation |
| VAT mapping errors | Incorrect reporting and compliance exposure | Structured tax mapping and validation review |
| Local database access failure | Cannot prepare transaction payload | Infrastructure monitoring and support response |

---

## 18. Management Conclusion

The MRA EIS integration for Citi-Nati Supermarket should be regarded as a strategic production system. It enables the business to comply with MRA electronic invoicing requirements while protecting branch continuity in real operating conditions.

The chosen design, centered around the POS Sync Agent and supported by the backend platform, is appropriate for the supermarket’s operating environment in Blantyre, Malawi. It balances compliance, resilience, security, and future readiness.

In practical terms, this implementation provides Citi-Nati with:

1. A compliant fiscal reporting pathway
2. A resilient branch transaction model under unstable connectivity conditions
3. A stronger foundation for digital retail operations and website launch readiness
4. A scalable architecture for future growth, branch expansion, and customer-facing receipt validation services

This is therefore not just a tax integration. It is a business continuity and digital transformation control system for Citi-Nati Supermarket.

---

## 19. Related Technical Reference

The full implementation-level technical reference is available in the companion document:

- [MRA_EIS_INTEGRATION_IMPLEMENTATION_DOCUMENTATION.md](MRA_EIS_INTEGRATION_IMPLEMENTATION_DOCUMENTATION.md)
