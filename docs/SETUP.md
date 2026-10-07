# Trade Weft — Production Setup & Configuration Guide

This document provides step-by-step instructions for configuring Google OAuth, Supabase Auth, Upstash Redis rate limiting, and environment variables across Localhost, Staging, and Production.

---

## 1. Google Cloud Console Configuration

Trade Weft uses Google OAuth exclusively with PKCE.

1. Navigate to the **[Google Cloud Console](https://console.cloud.google.com/)**.
2. Create or select your project (e.g., `trade-weft-production`).
3. Configure the **OAuth Consent Screen**:
   - User Type: **External**
   - App Name: `Trade Weft`
   - User Support Email: your support email
   - Developer Contact Email: your engineering email
   - Authorized Domains:
     - `tradeweft.com` (production)
     - `staging.tradeweft.com` (staging)
     - `supabase.co` (Supabase callback domain)
   - Scopes: Request **only** minimal identity scopes:
     - `.../auth/userinfo.email`
     - `.../auth/userinfo.profile`
     - `openid`
4. Create **OAuth 2.0 Client ID Credentials**:
   - Application Type: **Web application**
   - Name: `Trade Weft Supabase Auth`
   - **Authorized JavaScript Origins**:
     - `http://localhost:3000` (local dev)
     - `https://staging.tradeweft.com` (staging)
     - `https://tradeweft.com` (production)
   - **Authorized Redirect URIs**:
     Enter your Supabase Auth callback URL:
     - `https://<your-supabase-project-id>.supabase.co/auth/v1/callback`
5. Note down your **Client ID** and **Client Secret**.

---

## 2. Supabase Auth Configuration

1. In the **[Supabase Dashboard](https://supabase.com/dashboard)**, go to **Authentication -> Providers -> Google**:
   - Enable **Google Provider**.
   - Paste the **Client ID** and **Client Secret** generated in Google Cloud.
   - Save changes.
2. In **Authentication -> URL Configuration**:
   - **Site URL**:
     - Localhost: `http://localhost:3000`
     - Staging: `https://staging.tradeweft.com`
     - Production: `https://tradeweft.com`
   - **Redirect URLs (Allowlist)**:
     - `http://localhost:3000/auth/callback`
     - `https://staging.tradeweft.com/auth/callback`
     - `https://tradeweft.com/auth/callback`
3. **Session & Security Settings** (Item 2 of Pre-deployment Checklist):
   - **JWT Expiry**: Set to `3600` seconds (1 hour) or `1800` seconds (30 minutes).
   - **Refresh Token Rotation**: **Enabled** (generates a new refresh token every time one is used).
   - **Reuse Detection**: **Enabled** (if a revoked refresh token is re-submitted, Supabase immediately invalidates all active sessions for that user).
   - **Disable Email Signups & Magic Links**: Ensure email signup provider is toggled off; Google is the sole authentication provider.

---

## 3. Upstash Redis Configuration

1. Go to the **[Upstash Console](https://console.upstash.com/)**.
2. Create a Redis database:
   - Name: `tradeweft-ratelimit`
   - Region: Select the closest region to your Supabase deployment (e.g., Frankfurt `eu-central-1` or Cape Town / nearest low-latency region).
3. Copy the **REST URL** (`UPSTASH_REDIS_REST_URL`) and **REST Token** (`UPSTASH_REDIS_REST_TOKEN`).

---

## 4. Environment Variables Reference

Create a `.env.local` file (for local development) or set these in Vercel / AWS Amplify:

```bash
# Environment Mode
NODE_ENV=development # 'development' | 'production' | 'test'

# Supabase Public Keys (Safe for Client)
NEXT_PUBLIC_SUPABASE_URL=https://<your-project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ...

# Supabase Service Role Key (SERVER ONLY - NEVER expose to browser)
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ...

# Upstash Redis (Server Rate Limiting)
UPSTASH_REDIS_REST_URL=https://<db>.upstash.io
UPSTASH_REDIS_REST_TOKEN=AXi...

# Security & CORS Allowed Origins
ALLOWED_ORIGINS=http://localhost:3000,https://tradeweft.com,https://staging.tradeweft.com
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

---

## 5. Running Database Migrations

### Local Development (via Supabase CLI)
```bash
# Start local Supabase container stack
npx supabase start

# Apply all migrations to local Postgres
npx supabase db reset

# Run automated pgTAP RLS security tests
npx supabase test db
```

### Remote Staging or Production
```bash
# Link to your Supabase project
npx supabase link --project-ref <project-ref>

# Push pending migrations safely
npx supabase db push
```

---

## 6. Verification & Health Check

Verify your deployment liveness endpoint:
```bash
curl -i https://your-domain.com/api/health
```

Expected response:
```json
{
  "status": "healthy",
  "service": "tradeweft-api",
  "database": "healthy",
  "latencyMs": 14,
  "timestamp": "2026-10-07T12:00:00.000Z",
  "version": "0.1.0",
  "launchRegion": "Nairobi (KE)"
}
```
