# Amazon SP-API Data Protection Policy (DPP) Compliance

This document is the **Master Technical Specification and Compliance Record** for SeplorX. It documents the mandatory security standards required to maintain restricted access to Amazon PII for **Seller Flex (FBA Onsite)** inventory management.

---

## 🎯 Role Justification & Use Case
**Restricted Role**: `Direct-to-Consumer Shipping (Restricted)`
**Operation**: `batchInventory` (External Fulfillment Inventory API v2024-09-11)
**Technical Need**: This role is the only programmatic gateway to update warehouse-level stock for Seller Flex accounts. SeplorX requires PII during the fulfillment lifecycle to generate shipping labels and manage onsite inventory.

---

## 📋 Submitted Security Profile (March 2026)
This section records the exact technical answers provided to Amazon for the audit record.

### 1- Network Protection & Architecture
- **Infrastructure Strategy**: 3-tier VPC architecture.
  - Public Subnet: Application Load Balancer (ALB) + WAF.
  - Private App Subnet: SeplorX Node.js environment.
  - Private Data Subnet: Relational Database (No public IP).
- **Controls**: IDS/IPS, WAF (Rate limiting + SQLi protection), Network Segmentation.
- **Admin Access**: Restricted to whitelisted IPs via encrypted VPN with MFA.

### 2- Access Control & IAM
- **Policy**: Unique per-user credentials. Shared logins are programmatically prohibited.
- **Complexity**: 12-character minimum, alphanumeric + symbols.
- **Expiration**: Mandatory 365-day rotation with a 5-password history.
- **MFA**: Enforced for all internal portal users.

### 3- Data Lifecycle & Disposal
- **Retention**: < 31 days after shipment.
- **Disposal**: Automated field-level redaction (Names, Addresses, Phones purged).
- **Test Data**: 100% synthetic mock data. No PII is migrated from Production to Dev/Staging.

### 4- Encryption at Rest & KMS
- **Method**: AES-256-GCM.
- **Scope**: Field-level encryption for specific database columns.
- **KMS**: Use of cloud-native KMS (AWS/Google) with HSM-backed keys. No keys in config files.

---

## 🏗️ Technical Implementation Plan

### Phase 1: Identity & Access Management (SecOps)
- **[TODO] MFA Enrollment**: Integrate a TOTP or SMS enrollment flow for all users.
- **[TODO] RBAC Middleware**: Ensure all PII endpoints verify the user's role (`WAREHOUSE_MANAGER` or `SYSTEM_ADIMN`).
- **[TODO] Password Validation**: Update the registration/change-password logic to enforce the 12-char complexity.

### Phase 2: Data Encryption (Field-Level)
- **[TODO] PII Column Inventory**: Encrypt the following columns in relevant tables:
  - `shipping_address_name`
  - `shipping_address_line1`
  - `shipping_phone`
  - `customer_email`
- **[TODO] KMS Utility**: Implement a `getEncryptionKey()` service that authenticates with the cloud KMS to retrieve a Data Encryption Key (DEK).

### Phase 3: Observability & Governance
- **[TODO] Audit Log Table**: Record every PII read event.
  - Fields: `userId`, `action` (e.g., READ_PII), `timestamp`, `ipAddress`, `resourceId`.
- **[TODO] Bi-Weekly Review**: Schedule an automated report that summarizes all PII access for the previous 14 days for admin review.
- **[TODO] 12-Month Retention**: Enable log archiving to S3/Cloud Storage with a 1-year lifecycle policy.

### Phase 4: Network & Hardware (DevOps)
- **[TODO] WAF Configuration**: Deploy a WAF with Managed Rules for OWASP Top 10 and Amazon-specific security rules.
- **[TODO] Endpoint Lockdown**: Ensure the SeplorX UI disables the "Download" button for all PII data and prevents copy-pasting customer details.
- **[TODO] Backup Encryption**: Ensure all DB snapshots are encrypted cross-region.

---

## 🧪 Security Standards Calendar
- **Bi-Weekly**: Mandatory review of PII access logs.
- **Monthly**: Automated vulnerability scans of production infrastructure.
- **Every Release**: SAST (Static Analysis) and Dependency scanning (Dependabot/Snyk).
- **Quarterly**: Disaster Recovery / Restoration testing (Verify 24hr RTO).
- **Biannually**: Formal Incident Response Plan review/update.
- **Annually**: Full Penetration Test of all public-facing endpoints.

---

## 🚨 Incident Response Protocol (Submitted to Amazon)
1.  **Identification**: Monitoring alerts trigger security investigation.
2.  **Containment**: Immediate isolation of affected servers/accounts.
3.  **Remediation**: Eradication of vulnerability and forensic analysis.
4.  **Reporting**: Notification to `security@amazon.com` within 24 hours of any PII breach.

---

## 🔗 Official References
- [Amazon SP-API Data Protection Policy](https://developer-docs.amazon.com/sp-api/docs/data-protection-policy)
- [Acceptable Use Policy](https://developer-docs.amazon.com/sp-api/docs/acceptable-use-policy)
