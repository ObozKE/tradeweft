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
│   ├── agreements/       # [Phase 3: COMPLETE] Barter trade contract proposals, revisions & milestone tracking
│   ├── trust/            # [Phase 4: COMPLETE] Double-blind reviews, dispute ledger, reputation score
│   ├── verification/     # [Phase 5: COMPLETE] Portfolio proof of work, GitHub PKCE OAuth, safeFetch, Sharp media
│   ├── admin/            # [Phase 5: COMPLETE] Ops verification queue & review moderation console
│   └── payments/         # [Phase 6 Plug-in] M-Pesa Daraja escrow & top-up barter settlements
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
  - `public_provider_profiles`: Security Definer view exposing sanitized provider metadata (`display_name`, `business_name`, `avatar_url`, `city_id`, `area_id`, `member_since`, `is_verified`, `verified_link_count`) for published providers.
- **Extension Points**:
  1. *Ranking Strategy (Top Ads / Boost)*: Paid promotions will join an auxiliary `listing_promotions` table with an expiration timestamp, leaving `service_packages` schema unmodified.
  2. *Publish Gate*: `canPublish()` in `src/features/packages/utils/publish-gate.ts` provides the single point where future identity & verification checks plug in.
  3. *Trade Proposals*: The detail page reserves `<TradeActionSlot />`, enabling Phase 3 trade initiation without modifying page templates.
  4. *Domain Events Outbox*: Background event consumers process `domain_events` for notifications and recommendation graphs.
  5. *Geographic Matching Scope*: Matching logic in `search_service_packages` is centralized in one RPC, ready to widen from neighborhood/city to regional or national tiers per country configuration.

### 2.2 Barter Agreements (`src/features/agreements`)
- **Purpose**: Contractual agreement binding two participants to an equal exchange.
- **Workflow**:
  1. User A proposes trade to User B referencing `service_package_versions(id)`.
  2. Both parties review deliverables, deadlines, and milestones frozen in the version snapshot.
  3. Acceptance triggers contract locking and terms hash recording (`terms_hash`).
- **Database Tables**:
  - `agreements`: `id` uuid, `initiator_id` FK, `recipient_id` FK, `status` enum (`proposed`, `active`, `completed`, `disputed`, `cancelled`), `terms_hash`, `trade_terms_version`, `signed_at`.
  - `agreement_lines`: snapshots of package versions, quantities, and roles.
- **RLS**: Visible only to the two participants: `using ((select auth.uid()) in (initiator_id, recipient_id))`.

### 2.3 Trust Ledger & Reviews (`src/features/trust`)
- **Purpose**: Reputation and commercial track-record system preventing retaliatory ratings and collusion.
- **Double-Blind Mechanism**:
  - When an agreement is completed, both parties are invited to submit a review within 14 days (with a 1-hour grace period for edits/withdrawals).
  - Reviews remain hidden from the other party and the public until **both** have submitted their review or the 14-day window closes.
- **Proof of Reliability Score (0–100)**:
  - Bayesian smoothing ($C = 80.0$, $m = 5$), recency decay ($t_{1/2} = 12$ months), and pair dampening ($1/k$).
  - Unlocks publicly only after $\ge 3$ distinct trading partners (displays progress beforehand).
  - Dispute neutrality: open or unresolved disputes never penalize the score.
  - Pay-to-play independence: Top Ads or Boost promotions cannot alter or hide scores.
- **Public Trust Ledger**:
  - Immutable SHA-256 contract hashes stamped upon contract acceptance.
  - Opt-in terms consent (`2026-10-v2+`) displays completed trades in the public ledger per provider.
- **Event Dispatcher & Consumer Worker**:
  - Background queue (`domain_event_deliveries`) consuming `agreement.completed` and review events via `FOR UPDATE SKIP LOCKED`.
- **Database Tables**:
  - `reviews`, `review_replies`, `review_reports`, `ledger_entries`, `provider_reputation`, `reputation_flags`, `trade_terms_versions`, `domain_event_deliveries`, `review_moderation_log`.

### 2.4 Verification & Proof of Work (`src/features/verification`, `src/features/media`)
- **Purpose**: Day-1 trust mechanisms for providers who have no barter reviews yet, establishing verified external portfolio links and secure media assets.
- **Architecture & Proof Methods**:
  1. *Provider Registry*: Up to 10 external portfolio links across 12 platforms (GitHub, Figma, Behance, Dribbble, LinkedIn, Instagram, Facebook, TikTok, YouTube, X, Google Business Profile, personal website).
  2. *Standalone GitHub OAuth*: Custom PKCE flow entirely isolated from Supabase Auth (keeping sign-up Google-only). Enforces 30-day minimum account age, eliminates token persistence (tokens immediately discarded after identity inspection), and uses partial unique index on `(provider_key, external_account_id)` to prevent multi-account verification fraud.
  3. *Socket Connect-Time SSRF Defense (`safeFetch`)*: Personal website domain proof (`/.well-known/tradeweft-verification.txt` or `<meta name="tradeweft-verification">`) using Node `http`/`https` with socket connect-time IP resolution checks blocking RFC1918, loopback, link-local, cloud metadata (`169.254.169.254`), CGNAT (`100.64.0.0/10`), and IPv4-mapped IPv6, with 100 KB max byte cap and 5s timeout.
  4. *Manual Review Queue*: Challenge codes (`TW-XXXX-XXXX`) placed in bios or posts, verified via sandboxed screenshot evidence with 48h SLA tracking.
  5. *Two-Stage Media Pipeline*:
     - Direct client upload to private `quarantine` bucket via short-lived signed URLs.
     - Node runtime finalize route (`/api/media/finalize`) with magic-byte sniffing (JPEG, PNG, WebP; strict rejection of SVG and polyglots).
     - Decompression-bomb defense ($\le 6000$px), EXIF GPS stripping, responsive WebP variants (full 1600px, thumb 400px), and base64 blur placeholders generated via `sharp`.
     - Verified images moved to `evidence` (private, signed URLs) or `public-media` (public CDN cached) buckets; quarantine assets purged.
     - Storage quota enforcement (max 100 assets / 200 MB per provider) via Postgres trigger.
  6. *Publish Gate Integration*:
     - Wired into `canPublish()` via per-country `publish_gate` enum (`none`, `link_pending_or_verified`, `verified`).
     - Automated background auto-pausing of active listings if verification is lost via `verification.status.changed` domain event.
- **Database Tables & Views**:
  - `portfolio_links`, `oauth_states`, `provider_verification`, `verification_audit_log`, `media_assets`, `package_media`.
  - `public_verified_portfolio_links` view exposing only verified links.

### 2.5 Admin & Moderation (`src/app/(app)/admin`)
- **Privilege Separation**:
  - App roles (`user`, `verifier`, `admin`) in `public.user_roles`.
  - Protected via `requireVerifierOrAdmin()` DAL utility returning 404 (`notFound()`) for unauthorized users to prevent reconnaissance.
  - Review verification queue at `/admin/verification` with 48h SLA badges and append-only audit trail.
  - Review moderation queue at `/admin/moderation` executing Phase 4 `moderate_review` RPC.

### 2.6 Monetization & Payments Layer (`src/features/payments`)
- **Purpose**: Optional provider visibility and listing capacity products while strictly preserving cash-free barter core (0% platform commissions on trades).
- **Architecture & Principles**:
  1. *Trust Isolation Firewall*: Payments never touch trust signals. Money cannot alter or influence reviews, Proof of Reliability scores, portfolio verification badges, completed trade ledger entries, or Mutual Matches recommendations.
  2. *Provider-Agnostic Payments Layer*: Abstract `PaymentProvider` interface with Safaricom Daraja M-Pesa Express (`Lipa Na M-Pesa Online` / STK Push) as the first production adapter.
  3. *Money Correctness & Auditability*:
     - All amounts stored as integer minor units (`amount_minor`).
     - Safaricom Daraja requirement enforced: whole KES amounts (`amount_minor % 100 === 0`).
     - Append-only `payment_ledger` with triggers blocking `UPDATE` and `DELETE` mutations.
     - Untrusted callback hint model: inbound callbacks are saved in `payment_events_raw` and double-checked by querying Daraja `/mpesa/stkpushquery/v1/query` directly before executing state transitions.
  4. *Top Ads (Pinned Category Placements)*:
     - 7, 14, or 30-day pinned placements for specific city and category.
     - Strictly limited to 3 concurrent slots per category/city, guaranteed by a database-level exclusion constraint (`btree_gist` on `(country_code, city_id, category_id, slot_no, period)`).
     - Overbooking is physically impossible at the database engine level.
     - Displayed with an amber "Promoted" badge on page 1 of search.
  5. *Boost Packages (Listing Capacity & Freshness)*:
     - 30-day prepaid plans (Basic, Pro, Enterprise) configured via country-scoped `price_book`.
     - Entitlements SQL engine (`get_entitlements`) dynamically governing active package limits (`publish_service_package` check).
     - Bounded freshness ranking bonus (`rank_ts`) decaying naturally over time; when a search query is present, keyword relevance strictly dominates and freshness bonus serves only as a secondary tie-breaker.
  6. *Privacy-First Analytics*:
     - Client beacon ingestion route (`/api/analytics/collect`) with crawler/bot filtering and 1-hour session deduplication.
     - Atomic upsert counters into `package_daily_stats` and `promotion_daily_stats`.
     - Tiered visibility (Basic: 30-day totals; Pro: 90-day daily trends; Enterprise: CSV export).
  7. *Admin Finance Console (`/admin/payments`, `/admin/promotions`, `/admin/revenue`)*:
     - Protected via `requireFinanceOrAdmin()` returning 404 for unprivileged users.
     - Live search, manual Daraja reconciliation, and refund recording with ledger audit logs.
- **Database Tables**:
  - `payment_providers`, `ad_products`, `plans`, `price_book`, `payments`, `payment_events_raw`, `payment_ledger`, `listing_promotions`, `subscriptions`, `subscription_invoices`, `package_daily_stats`, `promotion_daily_stats`, `payment_audit_log`.

---

## 3. Rate Limiting Strategy (Upstash Redis)

Sliding-window limits are applied at every critical intake point:
- `/auth/callback`: 15 requests / minute per IP.
- OAuth initiation: 20 requests / minute per IP.
- Onboarding submission: 10 requests / minute per User ID.
- Server Actions & Database mutations: 30 requests / minute per User ID.
- **Fail-Closed in Production**: If Redis connection fails in `NODE_ENV === 'production'`, mutations fail closed with friendly localized retry errors.
