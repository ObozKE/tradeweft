# Trade Weft — Architecture & Extensibility Guide

Trade Weft is a production-grade B2B service barter marketplace engineered for African markets, launching in Nairobi, Kenya.

---

## 1. Core Architectural Principles

1. **Strict Server Authorization (Zero IDOR)**:
   - Client assertions and middleware are **never** treated as security boundaries (mitigating CVE-2025-29927).
   - Real authorization lives in the `server-only` Data Access Layer (`src/server/dal.ts`).
   - Every protected Server Component, Server Action, and Route Handler verifies identity using `supabase.auth.getUser()`, cross-checking user UUID ownership against Postgres Row Level Security (`(select auth.uid())`).

2. **Pan-African Expansion by Data, Not Code**:
   - Multi-country database schema (`countries` and self-referential `locations` table).
   - Adding a new country (e.g., Uganda `UG`, Tanzania `TZ`, Nigeria `NG`, South Africa `ZA`) requires **zero application code changes**—only inserting SQL seed rows for currency, phone code, timezone, and hierarchical administrative location slugs.

3. **Feature Isolation Architecture**:
   - Structure: `src/features/<feature>/{actions,components,queries,schemas,types}` with a public `index.ts`.
   - Features do not import each other's private internals.
   - Shared infrastructure lives in `src/lib/` and core domain logic lives in `src/server/`.

4. **Zero-Red Brand Discipline**:
   - Adherence to [DESIGN.md](../DESIGN.md). Pine Green primary (`#01796F`), neutrals, and deep amber (`#B45309`) for warnings/errors.
   - Status and errors are **always** paired with an icon and explanatory text, never color alone.

---

## 2. Phase 1 vs. Future Feature Plug-In Points

```
src/
├── features/
│   ├── auth/             # [Phase 1: COMPLETE] Supabase Google OAuth PKCE, Email & Password Auth, Callbacks, Sign-out
│   ├── onboarding/       # [Phase 1: COMPLETE] Hierarchical location cascading, Profile setup
│   │
│   ├── packages/         # [Phase 2: COMPLETE] Service Packages, Category taxonomy, Versions, Search/Explore
│   ├── agreements/       # [Phase 3 Plug-in] Barter trade contract proposals & milestone tracking
│   ├── trust/            # [Phase 4 Plug-in] Double-blind reviews, dispute ledger, reputation score
│   ├── payments/         # [Phase 5 Plug-in] M-Pesa Daraja escrow & top-up barter settlements
│   ├── verification/     # [Phase 6 Plug-in] National ID, KRA PIN, company registration checks
│   └── admin/            # [Phase 7 Plug-in] Ops moderation & dispute adjudication
```

### 2.1 Service Packages (`src/features/packages`)
- **Purpose**: Strictly scoped service listings that every future barter agreement will reference.
  - *Offerings*: Fixed deliverables, turnaround time, monthly capacity, indicative value, exclusions.
  - *Needs*: Up to 5 categories the provider is seeking in return for automated matchmaking.
- **Database Tables & Views**:
  - `service_categories` & `service_category_translations`: Hierarchical taxonomy (English & Swahili).
  - `service_packages`: Time-ordered UUIDv7 rows with generated multilingual `search_vector`.
  - `service_package_seeking_categories`: Composite key `(package_id, category_id)` for reverse lookup.
  - `service_package_versions`: Immutable audit snapshots created upon each publish. Future Phase 3 agreements reference a specific version ID so subsequent edits cannot rewrite an agreed deal.
  - `domain_events`: Insert-only outbox table capturing `package.created`, `package.published`, `package.paused`, `package.archived`.
  - `public_provider_profiles`: Security Definer view exposing only sanitized provider metadata (`display_name`, `business_name`, `avatar_url`, `city_id`, `area_id`, `member_since`) for published providers.
- **Extension Points**:
  1. *Ranking Strategy (Top Ads / Boost)*: Paid promotions will join an auxiliary `listing_promotions` table with an expiration timestamp, leaving `service_packages` schema unmodified.
  2. *Publish Gate*: `canPublish()` in `src/features/packages/utils/publish-gate.ts` provides the single point where future identity & verification checks will plug in.
  3. *Trade Proposals*: The detail page reserves `<TradeActionSlot />`, enabling Phase 3 trade initiation without modifying page templates.
  4. *Domain Events Outbox*: Background event consumers will process `domain_events` for notifications and recommendation graphs.
  5. *Geographic Matching Scope*: Matching logic in `search_service_packages` is centralized in one RPC, ready to widen from neighborhood/city to regional or national tiers per country configuration.

### 2.2 Barter Agreements (`src/features/agreements`)
- **Purpose**: Contractual agreement binding two participants to an equal exchange.
- **Workflow**:
  1. User A proposes trade to User B referencing `service_package_versions(id)`.
  2. Both parties review deliverables, deadlines, and milestones frozen in the version snapshot.
  3. Acceptance triggers contract locking and optional escrow hold.
- **Database Tables**:
  - `barter_agreements`: `id` uuid, `initiator_id` FK, `recipient_id` FK, `status` enum (`draft`, `proposed`, `active`, `completed`, `disputed`, `cancelled`), `terms_version`, `signed_at`.
  - `agreement_milestones`: `agreement_id` FK, `assigned_user_id` FK, `title`, `due_date`, `status` enum (`pending`, `submitted`, `approved`).
- **RLS**: Visible only to the two participants: `using ((select auth.uid()) in (initiator_id, recipient_id))`.

### 2.3 Trust Ledger & Reviews (`src/features/trust`)
- **Purpose**: Reputation system preventing retaliatory ratings.
- **Double-Blind Mechanism**:
  - When an agreement is marked completed, both parties are invited to submit a review within 14 days.
  - Reviews remain hidden from the other party until **both** have submitted their review or the window expires.
- **Database Tables**:
  - `trust_reviews`: `id`, `agreement_id`, `author_id`, `subject_id`, `rating` (1-5), `review_text`, `is_published` bool.
  - `user_reputation_stats`: Materialized summary of completed trades, average rating, and on-time delivery rate.

### 2.4 Billing & Payments (`src/server/payments`)
- **Purpose**: Handles commitment deposits, cash top-ups for asymmetric trades (e.g., KES 10,000 cash + landing page for 6 months office rent), and platform fees.
- **Architecture**:
  - `PaymentProvider` interface in `src/server/payments/types.ts`.
  - Safaricom M-Pesa Daraja adapter (`MpesaDarajaAdapter.ts`):
    - STK Push (`Lipa Na M-Pesa Online`) for instant mobile checkout in Kenya.
    - C2B & B2C endpoints for automated escrow disbursement.
    - Strict webhook HMAC / validation signature verification.
  - MTN MoMo & Airtel Money adapters for Uganda, Tanzania, and Ghana.

### 2.5 Verification (`src/features/verification`)
- **Purpose**: Verified Business and Identity Badges.
- **Kenya Launch**:
  - Freelancer: National ID number / Passport lookup or selfie match.
  - Business: Kenya Revenue Authority (KRA) PIN and Business Registration Number (eCitizen / BRS).
- **Visual Rule**: Reputation and verification badges look identical for paying and non-paying providers (per `DESIGN.md` hard rule #6).

### 2.6 Admin & Moderation (`src/features/admin`)
- **Privilege Separation**:
  - App roles (`user`, `admin`, `support`) live in `public.user_roles`.
  - No user-facing insert/update policies exist on `user_roles`.
  - Admin operations require server verification:
    ```ts
    const { data } = await supabase.from('user_roles').select('role').eq('user_id', user.id).eq('role', 'admin').single();
    if (!data) throw new AppError('FORBIDDEN', 'Admin access required');
    ```

---

## 3. Rate Limiting Strategy (Upstash Redis)

Sliding-window limits are applied at every critical intake point:
- `/auth/callback`: 15 requests / minute per IP.
- OAuth initiation: 20 requests / minute per IP.
- Onboarding submission: 10 requests / minute per User ID.
- Server Actions & Database mutations: 30 requests / minute per User ID.
- **Fail-Closed in Production**: If Redis connection fails in `NODE_ENV === 'production'`, mutations fail closed with friendly localized retry errors.
