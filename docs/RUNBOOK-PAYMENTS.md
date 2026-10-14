# Trade Weft — Payments & Monetization Runbook (Phase 6)

This document specifies the operational architecture, go-live checklist, reconciliation procedures, and emergency runbooks for Trade Weft's Phase 6 Monetization Layer (Safaricom Daraja M-Pesa STK Push, Boost Packages, and Top Ads).

---

## 1. Core Principles (Non-Negotiable)

1. **Payments Never Touch Trust Signals**: Money cannot purchase, inflate, hide, or alter reviews, Proof of Reliability scores, portfolio verification badges, completed trade ledger entries, or Mutual Matches recommendations.
2. **The Barter Core Stays Free**: 0% platform fee, 0% commissions on barter transactions. Businesses trade pure service value without cash friction.
3. **Transparent Ranking**: Promoted listings are pinned in dedicated Top Ad slots with an amber "Promoted" badge. Boost organic bonuses are bounded and strictly secondary to text search relevance.
4. **Money Correctness**: Integer minor units throughout (`amount_minor`), whole KES enforcement (`amount_minor % 100 === 0`), append-only ledger (`payment_ledger`), and provider reconciliation as the definitive source of truth.

---

## 2. Safaricom Daraja Go-Live Checklist

Before transitioning from Daraja Sandbox to Production in Nairobi, Kenya:

### Step 1: Safaricom Developer Portal & Org Registration
1. Register organization on [developer.safaricom.co.ke](https://developer.safaricom.co.ke).
2. Create an App under your production account with **Lipa Na M-Pesa Online (M-Pesa Express / STK Push)** permissions.
3. Request production go-live and obtain your production:
   - **Consumer Key**
   - **Consumer Secret**
   - **Business Shortcode** (Paybill or Buy Goods Till number)
   - **Online Passkey**

### Step 2: Server & Network Configuration
1. **Callback URL**: Ensure your production domain has a valid SSL certificate (TLS 1.2+).
2. **Callback Path**: Configure the endpoint:
   ```
   https://app.tradeweft.com/api/payments/daraja/callback/[DARAJA_CALLBACK_URL_SECRET]
   ```
3. **IP Filtering / Whitelist**:
   Safaricom Daraja dispatches callbacks from the following CIDR blocks:
   - `196.201.214.0/24`
   - `196.201.213.0/24`
   - `196.201.212.0/24`
   Allowlist these IP ranges in reverse proxy / Cloudflare / AWS WAF if IP filtering is enforced.

### Step 3: Production Environment Variables
Set the following secrets in your production environment:
```env
DARAJA_ENVIRONMENT="production"
DARAJA_CONSUMER_KEY="<production_consumer_key>"
DARAJA_CONSUMER_SECRET="<production_consumer_secret>"
DARAJA_PASSKEY="<production_passkey>"
DARAJA_SHORTCODE="<production_shortcode>"
DARAJA_CALLBACK_URL_SECRET="<crypto_random_64_char_hex_secret>"
NEXT_PUBLIC_APP_URL="https://app.tradeweft.com"
```

---

## 3. Daraja Result Codes & Handset State Machine

| Result Code | Meaning | User Feedback | Action Taken |
|---|---|---|---|
| `0` | Success | "Payment confirmed" | Settles payment, inserts ledger charge, activates Boost or Top Ad. |
| `1` | Insufficient Balance | "Insufficient M-Pesa balance on your line" | Marks payment failed, releases Top Ad slot hold. |
| `1032` | User Cancelled | "Transaction cancelled by user" | Marks payment cancelled, releases Top Ad slot hold. |
| `1037` | User Timeout | "M-Pesa PIN prompt timed out" | Marks payment timed_out, releases Top Ad slot hold. |
| `2001` | Wrong PIN | "Incorrect M-Pesa PIN entered" | Marks payment failed, releases Top Ad slot hold. |

---

## 4. Double-Check Security Protocol

Trade Weft treats inbound callbacks as **untrusted notification hints**:

```
[Customer Handset] ---> [Safaricom M-Pesa]
                             |
                   Callback Ingestion
                             v
              [Trade Weft /api/payments/daraja/callback]
                             |
                  1. Store raw payload in payment_events_raw
                  2. Query Daraja /stkpushquery/v1/query (Source of Truth)
                  3. Verify exact AmountMinor debited
                             |
                             v
              [settle_payment_transaction RPC]
                  1. Row lock on payments (for update)
                  2. Verify state is 'pending'
                  3. Transition to 'succeeded'
                  4. Insert to append-only payment_ledger
                  5. Activate Top Ad / Boost Plan
```

Even if an attacker attempts to spoof a callback payload, the system **always queries Safaricom's official API directly** before executing financial mutations.

---

## 5. Automated Reconciliation Sweeper (Cron)

The reconciliation sweeper runs every 10 minutes via `/api/cron/reconcile-payments`:

1. **Pending Payment Sweep**:
   - Queries payments with `status = 'pending'` older than 3 minutes.
   - Queries Daraja `/stkpushquery/v1/query` for each.
   - If confirmed by Safaricom, settles automatically.
   - If pending older than 30 minutes, marks `timed_out` and releases Top Ad slot hold.
2. **Expired Promotions Sweep**:
   - Scans `listing_promotions` where `period` upper bound has passed (`upper(period) <= now()`).
   - Marks them `expired`.
3. **Subscription Grace & Expiry Sweep**:
   - Subscriptions past `current_period_end` enter `grace` (3 days).
   - Subscriptions past `grace_period_end` are marked `expired`, triggering package rank synchronization (`sync_provider_rank_ts`).

---

## 6. Manual Financial Operations

### 6.1 Manual Reconciliation
If a customer reports completing their M-Pesa transaction but their dashboard shows pending:
1. Log in with a `finance` or `admin` account.
2. Navigate to `/admin/payments`.
3. Search by customer phone or Safaricom receipt number.
4. Click **"Reconcile"**.
5. The system queries Safaricom in real-time and transitions the state immediately.

### 6.2 Manual Refund Protocol
If a customer was mistakenly billed twice or requests a cancellation:
1. Navigate to `/admin/payments`.
2. Locate the succeeded transaction.
3. Click **"Refund"**.
4. Enter an audit explanation (minimum 5 characters, e.g. "Customer duplicate STK push confirmation").
5. The system transitions payment to `refunded`, writes an immutable `refund` entry to `payment_ledger`, logs to `payment_audit_log`, and deactivates any active Top Ad placement.

---

## 7. Emergency Runbooks

### 7.1 Emergency Payments Kill Switch
If Safaricom experiences an outage, or suspicious activity is detected:
Set environment variable:
```env
KILL_SWITCH_PAYMENTS=true
```
Effect:
- Top Ad and Boost subscription checkouts are disabled with a polite maintenance notice.
- Existing active promotions and subscriptions continue functioning normally.
- Barter trade operations remain 100% operational with zero disruption.

### 7.2 Database Overbooking Defense
Top Ads enforce an exclusive Postgres constraint:
```sql
EXCLUDE USING gist (
    country_code WITH =,
    city_id WITH =,
    category_id WITH =,
    slot_no WITH =,
    period WITH &&
) WHERE (status in ('held', 'active'))
```
Even under massive concurrent checkout attempts, Postgres guarantees that no two listings can hold or occupy the same slot in the same city and category simultaneously.
