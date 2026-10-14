# Trade Weft — Data Inventory, Privacy Mapping & Breach Response Runbook

**Applicable Legal Frameworks**:
- Kenya Data Protection Act, 2019 (KDPA)
- Office of the Data Protection Commissioner (ODPC) Regulations
- EU General Data Protection Regulation (GDPR) (for international reciprocity)

---

## 1. PII & Sensitive Data Inventory

| Data Element | Storage Location | Classification | Retention Period | Lawful Basis (KDPA Sec. 30) | Purpose & Access Boundary |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Full Name & Handle** | `public.profiles` | Personal Data | Account Lifetime + 30 Days | Performance of Contract | Display on profile and marketplace listings. Public via `public_provider_profiles`. |
| **Email Address** | `auth.users` | Personal Data | Account Lifetime + 30 Days | Performance of Contract | Google OAuth authentication, system transactional alerts. Strictly internal. |
| **Phone Number (E.164)** | `public.profile_contacts`<br>`public.payments` | Sensitive Personal | Active Trade Lifetime + 7 Years (Tax/Financial Records) | Performance of Contract & Legal Obligation | Exchanged strictly between active trade agreement partners; M-Pesa STK push billing. Masked as `***5678` in logs. |
| **WhatsApp Preference** | `public.profile_contacts` | Personal Data | Account Lifetime | Consent | Indicates willingness to coordinate barter trade logistics over WhatsApp. |
| **Location (City, Area)** | `public.profiles`<br>`public.service_packages` | Personal Data | Listing Lifetime | Legitimate Interest | Neighborhood marketplace matchmaking (Nairobi Westlands, Kilimani, etc.). |
| **Portfolio Links & Proofs** | `public.portfolio_links`<br>`public.media_assets` | Personal Data | Account Lifetime | Consent & Contract | Verification of external professional credentials. Public once verified. |
| **Barter Agreements & Terms** | `public.agreements`<br>`public.agreement_events` | Contractual Data | 7 Years (Statute of Limitations) | Performance of Contract | Legal record of mutual service exchange. Restricted to trade participants and verifiers. |
| **Reviews & Ratings** | `public.reviews`<br>`public.provider_reputation` | Reputation Data | Indefinite (Public Trust Ledger) | Legitimate Interest | Community trust ledger. Double-blind revealed after 14 days or mutual completion. |
| **M-Pesa Receipts & Ledger** | `public.payments`<br>`public.payment_ledger` | Financial Record | 7 Years (Kenya Tax Law) | Legal Obligation & Contract | Immutable record of cash transactions, Top Ads, and Boost subscriptions. |
| **IP Addresses & User-Agents** | Application Logs & Rate Limiters | Telemetry / Security | 90 Days Rolling | Legitimate Interest (Fraud Defense) | Brute-force protection, bot mitigation, and audit trails. Redacted in non-security logs. |

---

## 2. KDPA & ODPC Compliance Principles

1. **Data Minimization**: Trade Weft collects only the minimum necessary data required to facilitate barter matchmaking and process M-Pesa payments.
2. **Storage Limitation**: Temporary upload evidence and staging artifacts are swept after 48 hours; inactive sessions expire automatically.
3. **Integrity & Confidentiality**: All database connections require SSL/TLS. 100% of tables enforce Row Level Security (RLS). Storage buckets strictly segregate public assets from private verification evidence.
4. **No Cross-Border Transfer Without Safeguards**: Production data is stored in AWS/Supabase cloud regions with standard contractual clauses and encryption at rest.

---

## 3. Data Subject Request (DSR) Runbook

Users may exercise their rights under KDPA Sections 26–40 by emailing `privacy@tradeweft.com` or via their account dashboard.

### 3.1 Right of Access (Data Portability Export)
- **SLA**: 14 calendar days from identity verification.
- **Runbook**:
  1. Verify the requester's identity via authenticated email challenge.
  2. Execute the customer export script using the read-only service role client:
     ```sql
     -- Customer Export Procedure
     select json_build_object(
       'profile', (select row_to_json(p) from public.profiles p where p.id = $USER_ID),
       'contacts', (select row_to_json(c) from public.profile_contacts c where c.user_id = $USER_ID),
       'packages', (select json_agg(row_to_json(sp)) from public.service_packages sp where sp.provider_id = $USER_ID),
       'agreements', (select json_agg(row_to_json(a)) from public.agreements a where a.proposer_id = $USER_ID or a.recipient_id = $USER_ID),
       'reviews', (select json_agg(row_to_json(r)) from public.reviews r where r.reviewer_id = $USER_ID or r.reviewee_id = $USER_ID),
       'payments', (select json_agg(row_to_json(pay)) from public.payments pay where pay.payer_id = $USER_ID)
     );
     ```
  3. Package the exported JSON into an encrypted archive and provide a secure download link expiring in 72 hours.

### 3.2 Right to Erasure (Account Deletion & Anonymization)
- **SLA**: 30 calendar days.
- **Runbook**:
  1. Verify zero active trade agreements (`in_progress` or `disputed`) and zero pending financial settlements.
  2. Soft-delete and anonymize personal identifiers while preserving financial ledger integrity:
     ```sql
     -- Anonymization Script
     update public.profiles
     set full_name = 'Deactivated User',
         handle = concat('user_', substring(id::text, 1, 8)),
         avatar_url = null,
         headline = null,
         bio = null
     where id = $USER_ID;

     delete from public.profile_contacts where user_id = $USER_ID;
     delete from public.portfolio_links where provider_id = $USER_ID;
     update public.service_packages set status = 'archived' where provider_id = $USER_ID;
     ```
  3. In accordance with Kenya Tax and Financial regulations, `payments` and `payment_ledger` records are retained in an immutable, pseudonymized state.

---

## 4. 72-Hour Data Breach Response SLA (ODPC Kenya)

Under KDPA Section 43, Trade Weft must notify the Data Protection Commissioner within **72 hours** of becoming aware of any personal data breach that is likely to result in a real risk of harm.

```
Hour 0 ──────────────► Hour 12 ──────────────► Hour 36 ──────────────► Hour 72
  │                       │                       │                       │
Triage & Containment    Forensic Scope        ODPC Notification       Remediation
- Isolate affected      - Enumerate exposed   - Submit ODPC breach    - Permanent code fix
  credentials             records               form                  - Post-mortem report
- Revoke DB keys        - Assess harm level   - Notify affected       - System hardening
- Deploy hotfix                                 users if high risk
```

### 4.1 Breach Response Workflow

1. **Phase 1: Detection & Immediate Containment (Hours 0–12)**:
   - Incident Commander (CTO/Lead Engineer) isolates affected services or database credentials.
   - If Supabase credentials compromised: Immediately rotate `SUPABASE_SERVICE_ROLE_KEY` and invalid all active JWT sessions via Supabase console.
   - Block malicious IPs at Cloudflare edge.

2. **Phase 2: Forensic Impact Assessment (Hours 12–36)**:
   - Analyze Supabase query logs and Pino application audit logs.
   - Enumerate exact tables and rows accessed.
   - Determine whether unencrypted PII (phone numbers, full names, financial receipts) was exfiltrated.

3. **Phase 3: Regulatory & User Notification (Hours 36–72)**:
   - If risk of harm exists: Submit formal notification to the Office of the Data Protection Commissioner (ODPC) via `complaints@odpc.go.ke` using the official ODPC Breach Notification Template.
   - Dispatch advisory email to affected users detailing: nature of the breach, measures taken, and recommended precautions (e.g. M-Pesa PIN hygiene).

4. **Phase 4: Post-Incident Review (Hours 72+)**:
   - Publish internal Root Cause Analysis (RCA) and schedule immediate architecture hardening.
