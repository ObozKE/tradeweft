# Trade Weft — Workspace Rules

This repository enforces strict production engineering standards for Trade Weft. All files, modifications, and agents operating in this workspace must adhere to the following rules:

- [Version & Code Rules](./.agents/rules/version-code-rules.md)
- [9-Point Pre-Deployment Checklist](./.agents/rules/pre-deployment-checklist.md)
- [Design System & UI Guidelines](./DESIGN.md)

## Core Guardrails
- **Color Discipline**: Pine green primary (#01796F), neutrals, amber for warnings/errors. **Zero red anywhere**.
- **No IDOR / Strict Server Authorization**: Never rely solely on middleware or client assertions. Every server action, route handler, and protected page checks `supabase.auth.getUser()` and validates tenant/user ownership in code and RLS.
- **Strict Input Validation**: Every boundary validates inputs via Zod.
- **I18n by Default**: `next-intl` with translatable strings, logical CSS properties (`ms-*`, `me-*`, `ps-*`, `pe-*`), and mobile-first responsive design.
