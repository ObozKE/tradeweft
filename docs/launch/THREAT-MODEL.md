# Trade Weft — STRIDE Threat Model (Phases 1–6)

**Target**: Production Launch (Nairobi, Kenya)  
**Methodology**: STRIDE (Spoofing, Tampering, Repudiation, Information Disclosure, Denial of Service, Elevation of Privilege)  
**Scope**: Full Stack Architecture (Supabase Auth, Packages, Agreements, Trust Ledger, Verification, M-Pesa Monetization)

---

## 1. System Decomposition & Trust Boundaries

```
[ Unauthenticated Public Internet ]
               │
               ▼ (HTTPS / Cloudflare Edge / CSP)
┌────────────────────────────────────────────────────────┐
│ Trade Weft Web Application (Next.js 16 App Router)     │
│  - Middleware & DAL Session Enforcement                │
│  - Zod Input Sanitization Boundaries                   │
│  - Pino Redacted Audit Logger                          │
└──────────────┬──────────────────────────┬──────────────┘
               │                          │
 (Internal RPC / SSRF SafeFetch)  (Service Role / Postgres Session)
               │                          │
┌──────────────▼─────────────┐ ┌──────────▼──────────────┐
│ Third-Party External APIs  │ │ Supabase Managed DB     │
│  - Safaricom Daraja M-Pesa │ │  - 47 Tables with RLS   │
│  - GitHub OAuth Provider   │ │  - Append-Only Ledgers  │
│  - User Domain DNS Lookups │ │  - GiST Concurrency Lock│
└────────────────────────────┘ └─────────────────────────┘
```

---

## 2. STRIDE Analysis by Phase

### 2.1 Spoofing (Identity & Origin)

| Phase | Threat Scenario | Mitigation Architecture | Verification Evidence |
| :--- | :--- | :--- | :--- |
| **Phase 1** | Attacker spoofs Supabase Auth session or submits forged JWT to gain access to provider dashboard. | • Strict server-side verification using `supabase.auth.getUser()`. Never trusts client JWT or `getSession()`.<br>• DAL helpers (`requireUser()`, `requireOnboardedUser()`) throw Next.js redirect on invalid auth. | `src/server/dal.ts:17`<br>`tests/audit/auth-matrix.test.ts` |
| **Phase 5** | Provider claims false ownership of external portfolios (e.g. Behance, GitHub, personal domain). | • GitHub: State-pinned OAuth flow without Supabase Auth linking.<br>• Domain: Server-side DNS resolution & meta tag checking via hardened `safeFetch`.<br>• Other: Verification code placed in public bio + screenshot manual review. | `src/features/verification/utils/safe-fetch.ts`<br>`20261015000003_verification_rpc_functions.sql` |
| **Phase 6** | Fraudster sends fake Daraja payment callback to credit free Top Ads or Boost plans. | • Unguessable 32-character random secret token in callback URL path.<br>• Production IP check restricting callbacks to Safaricom subnets (`196.201.212.0/22`).<br>• **Double Verification**: Callbacks are treated as untrusted hints; Trade Weft queries Safaricom status query API before settling. | `src/app/api/payments/daraja/callback/[secretToken]/route.ts:34, 124` |

---

### 2.2 Tampering (Data Integrity)

| Phase | Threat Scenario | Mitigation Architecture | Verification Evidence |
| :--- | :--- | :--- | :--- |
| **Phase 2** | Provider edits published package details to deceive an active trade partner. | • Service packages use immutable versioning (`service_package_versions`).<br>• Agreements lock to specific `package_version_id`. Modifications generate a new revision without altering the agreed version. | `20261008000002_create_service_packages_and_versions.sql:35` |
| **Phase 3** | Attacker tampers with agreed barter terms or quantities mid-trade. | • SHA-256 terms hash computed over canonical trade lines upon proposal and counter-offers.<br>• Database trigger validates terms hash before allowing status transition to `in_progress`. | `20261013000002_agreement_integrity_triggers.sql:42` |
| **Phase 4** | User tampers with completed review or competitor wipes reputation score. | • Reviews table is append-only for ratings; status transitions strictly controlled by triggers.<br>• **Identified P0 (SEC-P0-01)**: `recompute_provider_reputation` RPC exposed to `authenticated` without parameter lock. Mitigated in Stage B by revoking public execute. | `supabase/migrations/20261014000003_reputation_scoring_function.sql:5` |
| **Phase 6** | Two users check out the exact same Top Ad slot simultaneously, causing double booking. | • Physical Postgres GiST exclusion constraint (`no_overlapping_promoted_slots`) using `btree_gist` prevents any overlapping time periods for the same city, category, and slot. | `20261016000002_monetization_constraints_and_triggers.sql:57`<br>`docs/PERFORMANCE.md:265` |

---

### 2.3 Repudiation (Accountability & Auditability)

| Phase | Threat Scenario | Mitigation Architecture | Verification Evidence |
| :--- | :--- | :--- | :--- |
| **Phase 3** | Provider delivers service outside Trade Weft and recipient claims non-delivery. | • Formal two-party confirmation workflow: Provider marks delivered with evidence notes; Recipient has 72-hour window to confirm or raise dispute.<br>• Complete audit log in `agreement_events`. | `20261013000001_create_agreement_enums_and_tables.sql:85` |
| **Phase 4** | Reviewer denies submitting negative review or provider claims retaliation. | • Double-blind mechanism: Reviews remain pending and unrevealed until both parties review or the 14-day window closes.<br>• Immutable `ledger_entries` record completion. | `20261014000001_create_reviews_and_ledger_tables.sql:60` |
| **Phase 6** | Customer disputes payment, claiming money was debited but entitlement was not granted. | • `payment_events_raw` stores raw, unmodified JSON payload from Safaricom callback before any processing.<br>• Immutable `payment_ledger` records every minor unit transition. Triggers block any update or delete. | `20261016000001_create_monetization_enums_and_tables.sql:95`<br>`20261016000002_monetization_constraints_and_triggers.sql:10` |

---

### 2.4 Information Disclosure (Confidentiality)

| Phase | Threat Scenario | Mitigation Architecture | Verification Evidence |
| :--- | :--- | :--- | :--- |
| **Phase 1 & 3** | Competitors harvest phone numbers, WhatsApp contacts, and physical locations. | • Strict RLS on `profile_contacts`: only users in an active, mutually accepted agreement can view contact information.<br>• Phone numbers masked in application logs (`***5678`). | `20261013000004_agreement_rls_policies.sql:88`<br>`src/lib/logger.ts` |
| **Phase 4** | Early review reveals bias trade partner's reciprocal review. | • Postgres RLS policy hides review body and rating from the reviewee until `revealed_at IS NOT NULL`. | `20261014000006_review_rls_policies.sql:40` |
| **Phase 6** | Competitor extracts platform gross revenue, transaction counts, and customer identities. | • `payments` and `payment_ledger` protected by user-scoped RLS.<br>• **Identified P0 (SEC-P0-02)**: `get_revenue_metrics` RPC accepted untrusted `p_actor_id`. Mitigated in Stage B by deriving actor from `auth.uid()`. | `20261016000008_analytics_and_admin_rpc.sql:185` |

---

### 2.5 Denial of Service (Availability)

| Phase | Threat Scenario | Mitigation Architecture | Verification Evidence |
| :--- | :--- | :--- | :--- |
| **All Phases** | Malicious bot floods search, trade proposals, or checkout endpoints. | • Sliding window rate limiters via Upstash Redis with token-bucket fallback.<br>• Auth: 5/min, Trade propose: 10/5min, Reviews: 10/10min, Verification: 10/hr, Payments: 30/min. | `src/lib/rate-limit.ts`<br>`src/lib/rate-limit.test.ts` |
| **Phase 5** | Attacker uploads decompression bomb (e.g. 50,000x50,000px image) to exhaust server memory. | • Sharp image processor inspects metadata and strictly rejects images exceeding 6,000px dimensions or 10 MB raw bytes before decoding. | `src/features/media/utils/image-processor.ts:25`<br>`tests/audit/hostile-security.test.ts:135` |
| **Phase 5** | Attacker provides target domain that triggers internal SSRF or resolves to slow link. | • `safeFetch` enforces DNS pre-resolution, connect-time socket check, 5s timeout, 100 KB payload limit, and max 3 redirects. | `src/features/verification/utils/safe-fetch.ts:114` |
| **Phase 6** | Flooding Daraja callback route with multi-megabyte payloads. | • Explicit 32 KB body size cap enforced at route entry point (`413 Payload Too Large`). | `src/app/api/payments/daraja/callback/[secretToken]/route.ts:55` |

---

### 2.6 Elevation of Privilege (Authorization)

| Phase | Threat Scenario | Mitigation Architecture | Verification Evidence |
| :--- | :--- | :--- | :--- |
| **Phase 1** | Standard user modifies role to 'admin' or assigns roles to other users. | • `user_roles` table has RLS policy forbidding user insert/update/delete. Only service role or DB triggers can modify roles. | `20261006000004_rls_policies.sql:75` |
| **Phase 5** | Verification staff member attempts to trigger refunds or view company revenue. | • Segregation of Duties: DAL `requireFinanceOrAdmin` denies verifier role with `404 notFound()`. | `src/server/dal.ts:90`<br>`tests/audit/auth-matrix.test.ts:180` |
| **Phase 6** | Attacker calls financial admin RPC to execute unauthorized refunds. | • **Identified P0 (SEC-P0-02)**: Addressed in Stage B by removing `p_actor_id` and binding authorization directly to `auth.uid()`. | `20261016000008_analytics_and_admin_rpc.sql:76` |
