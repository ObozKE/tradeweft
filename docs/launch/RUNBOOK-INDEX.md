# Trade Weft — Production Operational Runbook Index

This document provides step-by-step procedures for platform operations, disaster recovery, secret rotation, and payment gateway downtime handling.

---

## 1. Point-in-Time Recovery (PITR) & Disaster Recovery Drill

### Objective
Restore database state to a specific second in the event of accidental mass data corruption or destructive query execution without losing append-only financial ledgers.

### Prerequisites
- Supabase Pro / Enterprise tier with Point-in-Time Recovery (WAL archiving) active.
- AWS S3 daily physical backup snapshots configured.

### Drill Procedure
1. **Identify Corruption Timestamp**:
   Query application error logs or database transaction logs to determine the exact timestamp ($T_{\text{corrupt}}$) of corruption.
2. **Halt Incoming Writes (Emergency Freeze)**:
   Set application feature flag `NEXT_PUBLIC_MAINTENANCE_MODE=true` in Vercel/hosting environment to pause user transactions.
3. **Execute PITR in Supabase Console / CLI**:
   ```bash
   supabase branches create recovery-branch --point-in-time "2026-10-14T05:00:00Z"
   ```
4. **Export Financial Deltas**:
   If legitimate M-Pesa payments settled between $T_{\text{corrupt}}$ and the freeze, export `payment_events_raw` and `payment_ledger` deltas from the corrupted primary:
   ```sql
   copy (
     select * from public.payment_events_raw where created_at >= '2026-10-14T05:00:00Z'
   ) to stdout with csv header;
   ```
5. **Promote Recovered Database**:
   Update production connection string pooler URI (`DATABASE_URL`, `SUPABASE_URL`) to point to the recovered instance.
6. **Replay Financial Deltas**:
   Import raw payment events and execute `reconcile_pending_payments()` to ensure zero lost customer funds.
7. **Disable Maintenance Mode**:
   Unset maintenance mode and monitor error rates via Pino / Sentry.

---

## 2. Zero-Downtime Rollback Rehearsal

### Principles
- All database migrations are backward-compatible (expand before contract).
- Existing code versions never depend on newly added nullable columns or newly deployed RPCs.

### Procedure
1. **Application Deployment Rollback**:
   In Vercel or hosting platform:
   - Navigate to **Deployments** $\rightarrow$ select the previous stable deployment $\rightarrow$ click **Promote to Production** (Instant edge atomic pointer switch, takes $< 5\text{ seconds}$).
2. **Database Migration State Handling**:
   - Because all migrations use `IF NOT EXISTS` and do not drop existing columns, rolling back the application code requires **zero database rollbacks** under ordinary circumstances.
   - If a specific migration function must be reverted, apply an explicit forward rollback migration script (e.g. `20261016999999_revert_feature.sql`). Never delete historical migration records from `supabase_migrations`.

---

## 3. Production Secret Rotation Runbook

| Secret Name | Location | Impact of Rotation | Zero-Downtime Rotation Steps |
| :--- | :--- | :--- | :--- |
| **`SUPABASE_SERVICE_ROLE_KEY`** | Environment Variables | Service actions, cron jobs, DAL bypass | 1. Generate new key in Supabase API settings.<br>2. Update in staging and test.<br>3. Deploy to production environment.<br>4. Invalidate old key in Supabase console. |
| **`DARAJA_PASSKEY` / `CONSUMER_SECRET`** | Environment Variables | M-Pesa STK push generation | 1. Generate new credentials in Safaricom Daraja Developer Portal.<br>2. Update `DARAJA_PASSKEY` and `DARAJA_CONSUMER_SECRET` in environment.<br>3. Redeploy application.<br>4. Test end-to-end STK push on physical SIM. |
| **`DARAJA_CALLBACK_SECRET`** | Environment Variables | Webhook URL path | 1. Configure dual-token acceptance in callback route during rotation window.<br>2. Update URL in Safaricom portal.<br>3. Update production environment variable.<br>4. Deprecate old token. |
| **`CRON_SECRET`** | Environment Variables | Automated dispatchers & payment reconciliation | 1. Update `CRON_SECRET` in Vercel cron configuration.<br>2. Update `CRON_SECRET` in application environment variables.<br>3. Trigger manual curl verification to confirm 200 OK. |
| **`UPSTASH_REDIS_REST_TOKEN`** | Environment Variables | Rate limiting | 1. Upstash allows active secondary tokens.<br>2. Promote secondary token to primary in environment.<br>3. Invalidate old token in Upstash console. |

---

## 4. Safaricom Daraja Downtime & Split-Brain Reconciliation

### Threat Scenario
Safaricom M-Pesa API experiences upstream network degradation or complete downtime in Kenya. Users initiate STK push, funds are debited from the user's M-Pesa wallet, but callbacks fail to reach Trade Weft, or STK push requests time out.

### Automated Self-Healing Architecture
1. **Payment Status Stays `pending`**:
   The payment record is created in `payments` with `status = 'pending'`. The client UI displays a friendly polling state: *"Waiting for M-Pesa confirmation... Check your phone."*
2. **Automated Background Sweeper**:
   The cron job `/api/cron/reconcile-payments` runs every 2 minutes. It queries `reconcile_pending_payments()` which fetches all payments pending for $> 2$ minutes.
3. **Provider Query as Source of Truth**:
   The engine invokes `queryDarajaStkStatus(checkoutRequestId)`. If Safaricom's query API indicates success with an `MpesaReceiptNumber`:
   - Payment is automatically transitioned to `succeeded`.
   - Entitlements (Top Ad slot or Boost Package) are automatically activated.
   - An append-only credit entry is written to `payment_ledger`.
   - The user receives an in-app notification confirming their payment was reconciled.

### Manual Operator Intervention Runbook (Prolonged Outage)
If Safaricom's query API is also unreachable:
1. Operator navigates to `/admin/payments`.
2. Inspects pending payments flagged with *"Unreconciled > 15m"*.
3. Once Safaricom restores services, clicks **"Reconcile with Provider"** on the affected payment.
4. The system directly queries Daraja, matches the M-Pesa transaction code, credits the account, and appends an audit log entry.
5. If the user was double-charged or cancelled by Safaricom, the operator clicks **"Record Refund"**, which executes `admin_record_refund` with required justification.

---

## 5. Emergency Platform Killswitches

In the event of an ongoing security incident or financial anomaly:

1. **Pause Publishing Market-Wide**:
   ```sql
   update public.countries set publish_gate = 'verified' where code = 'KE';
   ```
2. **Freeze Payment Gateway (Prevent New Checkouts)**:
   Set `NEXT_PUBLIC_PAYMENTS_ENABLED=false` in environment variables. STK push checkout buttons will render as temporarily disabled with customer advisory notice.
3. **Suspend Event Dispatcher**:
   Revoke `CRON_SECRET` in Vercel to halt background dispatch processing without taking the web application offline.
