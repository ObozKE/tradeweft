# VERSION & CODE RULES

- Before installing anything, verify the current STABLE version of every package from official docs/registry. Do not rely on training memory. No beta, canary, RC or "testing" releases. Pin exact versions.
- Next.js App Router (`app/`) ONLY. No Pages Router, no `getServerSideProps`/`getStaticProps`, no class components, no deprecated hooks or APIs. Default to React Server Components; add `"use client"` only where interactivity requires it, and keep client components as small leaf components.
- Use the newest methodology wherever a library deprecated the old way. If the current Next.js major has renamed `middleware.ts` (e.g., to `proxy.ts`), use the current convention. Use `useActionState` for Server Action forms.
- Use the current shadcn/ui CLI (`shadcn@latest`) and the Tailwind version it targets (CSS-first config with `@theme` if Tailwind v4+). Accessibility (WCAG 2.2 AA) is mandatory: labels, focus rings, keyboard navigation, `aria-live` for errors, reduced-motion support.
