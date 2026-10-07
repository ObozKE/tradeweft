# Trade Weft — DESIGN.md

The visual and interaction design system for **Trade Weft**, a marketplace where businesses and freelancers trade services instead of cash. It starts in Nairobi and is built to expand across Africa.

This file is the single source of truth for how Trade Weft looks and feels. It was derived from a 20-second scroll recording of a reference website, then adapted to Trade Weft's brand: **pine green, Poppins, no red**.

---

## 0. How to use this file (humans and coding agents)

1. Read this file **before** writing any UI. Use only the tokens, type styles, radii, spacing and components defined here. Do not introduce new colors, fonts, radii or shadows without adding them here first.
2. **Precedence:** security, accessibility and legal requirements in the phase prompts win over anything here. For purely visual decisions, this file wins.
3. Never hardcode hex values in components. Use semantic tokens (`bg-background`, `text-muted-foreground`, `bg-primary`) defined in section 12.
4. Everything user-facing is translatable (next-intl). Design for 30% longer strings (Swahili, French, Portuguese).
5. Suggested line to add to every build prompt: *"Read DESIGN.md first and follow it for every visual decision. If something is missing, propose an addition to DESIGN.md instead of improvising."*
6. **Do not copy anything from the reference site**: no text, logos, photography or icons. Only the design language (structure, proportions, component patterns) is reused.

### Hard rules

| # | Rule |
|---|------|
| 1 | The only typeface is **Poppins** (plus a script-specific fallback where Poppins has no glyphs, see 4.5). |
| 2 | Brand color is **pine green**. **No red anywhere**: not in tokens, gradients, illustrations, charts or photography overlays. See 3.5 for the testable rule. |
| 3 | Errors and warnings use **amber** with an icon and text. Status is never conveyed by color alone. |
| 4 | Contrast: body text at least 4.5:1, large text and UI boundaries at least 3:1. Verified values are in 3.4. |
| 5 | Mobile-first and fast on intermittent 4G (budgets in section 10). |
| 6 | Payments, ads or plans never alter trust visuals. Reputation and verification badges look identical for paying and non-paying providers. |

---

## 1. Brand

### 1.1 Name and idea (suggested story, edit freely)
*Weft* is the thread woven crosswise through the lengthwise *warp* to make cloth. In Trade Weft, two people's services cross to make one agreement, and every completed trade adds a thread to a public fabric of trust. The visual identity should feel **woven, orderly, local and trustworthy**, not corporate-glossy.

### 1.2 Personality
- **Fair**: calm, balanced, evenly weighted layouts. Nothing shouts.
- **Local**: real Nairobi businesses and people, real neighborhoods, real photography.
- **Proven**: evidence over hype. Show verified facts, never invented numbers.
- **Warm but precise**: friendly language, exact information.

### 1.3 Wordmark
- Text: **Trade Weft** (two words, capital T and W), Poppins **SemiBold 600**, letter-spacing `-0.02em`.
- Colors: ink `#151515` on light surfaces, white on pine-950 and photos. A pine-600 accent mark may sit beside it.
- Mark (to be designed): two thin strokes crossing like warp and weft threads, in pine-600. A final logo is **not** part of this file. Until it exists, use the wordmark alone.
- Clear space: at least the height of the "T" on all sides. Minimum wordmark height 20px on screen.
- Optional brand pattern: a very subtle woven grid (thin crossing lines, pine tint at 3-5% opacity), inline SVG under 2 KB, allowed only in hero and footer backgrounds.

### 1.4 Voice (microcopy)
- Plain verbs, sentence case, active voice. Name things by what users understand ("Propose a trade", not "Create agreement entity").
- A button keeps the same verb through the whole flow: "Publish" leads to the toast "Published".
- Errors say what happened and how to fix it. They never apologize and are never vague.
- Empty states are invitations: say what the screen is for and offer one action.
- Never invent statistics, testimonials or logos. Hide a section until real content exists.

---

## 2. Reference analysis (what the recording shows)

The recording is a top-to-bottom scroll of a consultancy-style landing page. The header was **not** visible in the clip. Measurements below are proportional because the capture was scaled; CSS pixel values in later sections are Trade Weft decisions, not claims about the reference.

### 2.1 Observed design language

| Area | Observation |
|------|-------------|
| Canvas | Very light neutral page (`#F7F7F7`) with pure white cards. Separation is by tone, almost no shadows or borders. |
| Palette | Near-black ink (`#151515`) for buttons and footer, plus exactly two pastel accents: soft orchid-pink (`#F3CBEE`) and mint (`#BCFFDB`), with one neon green (`#39FF99`) reserved for a single featured CTA. |
| Type voices | Three voices: a light serif for large headings and big numerals, a grotesque sans for body, and a monospace for small uppercase labels, buttons and prices. |
| Shape | Large soft corners on cards (about 24-28px equivalent), rounded rectangles on buttons (not full pills), full pills for tags, circles for icons. |
| Layout | Near full-bleed sections with small outer gutters, generous vertical spacing between sections, and big cards that fill the width. |
| Section rhythm | Eyebrow label, large centered heading, optional button. Repeated consistently. |
| Imagery | People photography in rounded cards, with tag pills on the photo and glassy dark caption panels carrying a pastel "View" button. |
| Components | Logo marquee, icon-circle feature tiles in a joined "tile board", pink/white/mint stat strip, plan cards with a features card below, testimonial carousel with circular arrows, rounded-row FAQ accordion, three-up insight cards, dark footer with a newsletter field. |
| Motion | Headings that darken from gray to ink as they scroll into view, rolling digits on a statistic, a logo marquee, accordion and carousel interactions. |
| Not carried over | An orange-red gradient chart card (excluded by the no-red rule), the serif and monospace faces (replaced by Poppins), and all copy, logos and photos. |

### 2.2 Keep, adapt, drop

| Reference choice | Trade Weft decision |
|------------------|---------------------|
| Black primary buttons | **Pine-600 primary buttons.** Ink buttons remain as a secondary strong style. |
| Neon green featured CTA | Replaced by pine-600 (featured plan) with pine-200 tints. No neon. |
| Mint accent | Becomes the **pine-200 / pine-100 tint family**. |
| Orchid-pink accent | **Kept as a decorative accent** (hue 308, clearly not red) for chips, icon circles and one stat tile. It never carries trust, status or promotion meaning. Removable in one token change. |
| Serif display type | Poppins Medium with tight tracking. Large numerals use Poppins Light. |
| Monospace labels | Poppins Medium uppercase with wide tracking. |
| Black footer | **Pine-950** footer. |
| Gray muted text (`#828282`, only 3.59:1 on the page) | Darkened to `#6B6B6B` (4.97:1) to pass AA. |
| Red-orange gradient card | Dropped. A pine gradient may be used on one data highlight at most (see 3.6). |
| Marketing-page layout | Extended with an app shell and domain components (section 7). |

---

## 3. Color

### 3.1 Reference measurements (from the video, for traceability)

| Role in reference | Measured value |
|-------------------|----------------|
| Page background | `#F7F7F7` |
| Card / surface | `#FFFFFF` |
| Ink (buttons, footer) | `#151515` |
| Dark text variant | `#2C2C2C` |
| Secondary text | `#595959` |
| Muted text | `#828282` |
| Neutral chip / icon circle | `#ECEBEB` |
| FAQ row / sunken surface | `#F1F1F1` |
| Orchid-pink accent | `#F3CBEE` |
| Mint accent | `#BCFFDB` |
| Neon green CTA | `#39FF99` |

### 3.2 Trade Weft palette

**Pine (brand)**

| Token | Hex | Typical use |
|-------|-----|-------------|
| `pine-950` | `#07201B` | Footer, deep surfaces on dark |
| `pine-900` | `#0B2E27` | Dark hover states |
| `pine-800` | `#0F4037` | Text on pine tints, pressed state |
| `pine-700` | `#14574A` | Primary hover, strong links |
| **`pine-600`** | **`#01796F`** | **Primary brand color, primary buttons, links, focus** |
| `pine-500` | `#1A9486` | Focus ring, charts |
| `pine-400` | `#4DB3A5` | Charts, decorative |
| `pine-300` | `#8ACFC5` | Links on dark, highlights |
| `pine-200` | `#BDE5DF` | Tag fill, stat tile, selected rows |
| `pine-100` | `#E1F3F0` | Soft panels, success background |
| `pine-50` | `#F2FAF8` | Subtle tint |

**Neutrals**

| Token | Hex | Use |
|-------|-----|-----|
| `ink` | `#151515` | Headings, primary text, ink buttons |
| `ink-2` | `#2C2C2C` | Strong secondary surfaces and text |
| `text-secondary` | `#595959` | Body copy on cards |
| `text-muted` | `#6B6B6B` | Captions, eyebrows, helper text |
| `border` | `#E6E6E6` | Decorative dividers, card outlines |
| `input-border` | `#8C8C8C` | Form control boundaries (3.36:1 on white) |
| `surface-sunken` | `#F1F1F1` | FAQ rows, chips, inactive tabs |
| `tile-gap` | `#F0F0F0` | Gaps in the tile board |
| `surface` | `#FFFFFF` | Cards |
| `background` | `#F7F7F7` | Page |

**Accents and feedback**

| Token | Hex | Use |
|-------|-----|-----|
| `orchid-200` | `#F3CBEE` | Decorative chips, icon circles, one stat tile, soft "View" button |
| `orchid-50` | `#FAEAF8` | Decorative tint |
| `amber-800` | `#92400E` | Warning and error text on amber tints |
| `amber-700` | `#B45309` | Warning and error icons and borders, the `destructive` token |
| `amber-100` | `#FEF3C7` | Warning and error background |
| `amber-50` | `#FFFBEB` | Subtle warning surface |
| `success` | `pine-600` on `pine-100` | Success states |

### 3.3 Usage rules
- **One filled primary action per view.** Everything else is outline, soft or ghost.
- Pine-600 is for actions, links, selection and brand moments. Do not use it for decoration everywhere; let the neutrals carry the page.
- **Orchid is decorative only.** Never use it for status, trust, verification, promotion, price or anything with meaning. Use it on at most one element per screen region.
- Amber means "needs attention" (errors, warnings, paused, failed payment). Always with an icon and a text label.
- Text on photos always sits on a dark panel or gradient that gives at least 4.5:1.
- Large areas are neutral. Color is used for emphasis, grouping and brand, never as the only carrier of meaning.

### 3.4 Verified contrast (WCAG 2.2, computed)

| Pair | Ratio | Result |
|------|-------|--------|
| Ink on page `#F7F7F7` | 17.05:1 | Pass |
| Text-secondary `#595959` on page | 6.54:1 | Pass |
| **Text-muted `#6B6B6B` on page** | **4.97:1** | Pass (AA text) |
| Text-muted on white | 5.33:1 | Pass |
| White on pine-600 | 5.30:1 | Pass |
| White on pine-700 | 8.43:1 | Pass |
| Pine-600 text on white | 5.30:1 | Pass |
| Pine-600 text on page `#F7F7F7` | 4.94:1 | Pass |
| Pine-800 on pine-100 | 10.11:1 | Pass |
| Pine-800 on pine-200 | 8.53:1 | Pass |
| Ink on orchid-200 | 12.69:1 | Pass |
| Ink on pine-200 | 13.42:1 | Pass |
| White on pine-950 | 17.05:1 | Pass |
| Pine-300 on pine-950 (footer links) | 9.59:1 | Pass |
| `#A9B8B4` on pine-950 (muted on dark) | 8.28:1 | Pass |
| Amber-800 on amber-100 | 6.37:1 | Pass |
| Amber-700 on white | 5.02:1 | Pass |
| Amber-700 on amber-50 | 4.84:1 | Pass |
| White on ink button | 18.26:1 | Pass |
| Input border `#8C8C8C` on white | 3.36:1 | Pass (needs 3:1) |
| **Reference muted `#828282` on page** | **3.59:1** | **Fail for small text, not used** |

Re-verify any new pairing before shipping it, and add it here.

### 3.5 The no-red rule (testable)
No color token, gradient stop, chart series, illustration or overlay may have a hue between **340° and 15°** with saturation above **20%**. Orchid (hue 308°) and amber (hue 26° and 48°) are outside that range. Add an automated check that scans design tokens and CSS for violations. Photography is judged by eye (avoid red-dominant hero images and red tint overlays).

### 3.6 Gradients and effects
- Default: **no gradients.** Flat tonal surfaces carry the design.
- One permitted gradient: a pine data highlight card, `linear-gradient(160deg, #14574A 0%, #1A9486 55%, #BDE5DF 100%)`, at most once per page.
- Photo captions use a dark scrim: `linear-gradient(180deg, rgba(21,21,21,0) 0%, rgba(21,21,21,0.72) 100%)`.
- Glass caption panel: `background: rgba(21,21,21,0.55); backdrop-filter: blur(20px);` with a solid fallback `rgba(21,21,21,0.78)` where `backdrop-filter` is unsupported. Use glass on at most 3 elements per viewport (performance).
- Shadows: none on resting cards. Floating layers (popovers, toasts, sticky header on scroll) use `0 8px 24px rgba(7, 32, 27, 0.08)`.

### 3.7 Dark mode (provisional)
Ship light first. Tokens are dark-ready; values below are starting points that must be contrast-verified at implementation.

| Token | Dark value |
|-------|------------|
| `background` | `#0B1512` |
| `surface` | `#111D19` |
| `border` | `#1F302A` |
| `text` | `#F2F5F4` |
| `text-muted` | `#A9B8B4` |
| `primary` | `pine-400` `#4DB3A5` with ink text |

---

## 4. Typography: Poppins

### 4.1 One family, three voices
The reference uses three typefaces (serif headings, grotesque body, monospace labels). Trade Weft expresses the same three voices with **Poppins only**, by changing weight, size, case and tracking.

| Voice | Reference | Trade Weft (Poppins) |
|-------|-----------|----------------------|
| Display and headings | Light serif | Poppins **Medium 500**, tight tracking (`-0.02em` to `-0.03em`) |
| Body and UI | Grotesque sans | Poppins **Regular 400**, Medium 500 for emphasis |
| Labels, tags, buttons, prices | Monospace, uppercase | Poppins **Medium 500**, uppercase, wide tracking (`+0.04em` to `+0.08em`) |
| Big numerals (stats) | Light serif | Poppins **Light 300**, large, tight tracking |

### 4.2 Loading (self-hosted, 4G-friendly)
Poppins ships as static weights, so every weight is a separate file. Load **400, 500, 600** everywhere and **300** only for stat numerals. Never load italics or 700+ unless a component needs them and it is added here.

```ts
// src/lib/fonts.ts
import { Poppins } from "next/font/google";

export const poppins = Poppins({
  subsets: ["latin", "latin-ext"],
  weight: ["300", "400", "500", "600"],
  display: "swap",
  variable: "--font-poppins",
});
```

```tsx
// app/layout.tsx
<html lang={locale} className={poppins.variable}>
  <body className="font-sans antialiased">{children}</body>
</html>
```

`next/font` downloads and self-hosts the files at build time, so there are no runtime requests to Google. Verify the current API in the Next.js docs before implementing.

### 4.3 Type scale

Poppins is a wide geometric sans with tall line metrics. The sizes below are tuned for it. Mobile values apply below 768px.

| Style | Desktop size / line | Mobile size / line | Weight | Tracking | Use |
|-------|--------------------|--------------------|--------|----------|-----|
| `display` | 64 / 68 | 40 / 44 | 500 | -0.03em | Hero headline only |
| `h1` | 56 / 60 | 36 / 40 | 500 | -0.025em | Page titles on marketing pages |
| `h2` | 44 / 52 | 30 / 38 | 500 | -0.02em | Section headings |
| `h3` | 32 / 40 | 24 / 32 | 500 | -0.015em | App page titles, sub-sections |
| `h4` | 22 / 30 | 20 / 28 | 500 | -0.01em | Card titles |
| `body-lg` | 18 / 30 | 17 / 28 | 400 | 0 | Lead paragraphs |
| `body` | 16 / 26 | 16 / 26 | 400 | 0 | Default text |
| `small` | 14 / 22 | 14 / 22 | 400 | 0 | Secondary text, table cells |
| `caption` | 12 / 16 | 12 / 16 | 400 or 500 | +0.01em | Meta, helper text |
| `label` | 12 / 16 | 12 / 16 | 500 | +0.08em, uppercase | Eyebrows, tags, table headers |
| `button` (marketing) | 13 / 16 | 13 / 16 | 500 | +0.04em, uppercase | Marketing buttons |
| `button` (app) | 14 / 20 | 14 / 20 | 500 | 0, sentence case | In-app buttons |
| `stat` | 72 / 72 | 48 / 48 | 300 | -0.03em | Large statistics |
| `price` | 44 / 48 | 36 / 40 | 500 | -0.02em | Plan prices |

### 4.4 Rules
- Line length 45-70 characters for body copy. Headings break at roughly 18-22 characters per line (use `text-wrap: balance`).
- Uppercase is applied with CSS `text-transform`, never typed, so screen readers and translators get normal text. Only labels, tags, table headers and **marketing** buttons are uppercase, and only up to about 4 words. Never uppercase headings, body, errors or in-app buttons: translations expand and uppercase accented letters read poorly.
- Use an eyebrow label only where it orients the reader (for example a section name). Do not put one above every heading.
- Do not accent a single word in a headline by color or weight.
- Numbers in tables and prices are right-aligned. Use tabular figures if the font file supports them; otherwise rely on alignment. Format with `Intl.NumberFormat` (currencies differ in decimals).
- Minimum text size is 12px, and only for labels and captions with AA-passing colors.
- Link text in running copy is pine-600 with an underline. Never rely on color alone.

### 4.5 Scripts Poppins does not cover
Poppins covers Latin, Latin Extended and Devanagari. That handles English, Swahili, French and Portuguese. For other scripts, load a matching fallback only when that locale is enabled, and keep Poppins first in the stack:

| Locale / script | Fallback |
|-----------------|----------|
| Arabic (RTL) | Noto Sans Arabic |
| Amharic (Ethiopic) | Noto Sans Ethiopic |
| Other | Noto Sans for that script |

```css
--font-sans: var(--font-poppins), "Noto Sans Arabic", "Noto Sans Ethiopic",
  ui-sans-serif, system-ui, sans-serif;
```

---

## 5. Layout, spacing, shape

### 5.1 Grid and containers
- Base unit **4px**. Spacing scale: 4, 8, 12, 16, 24, 32, 48, 64, 96, 128.
- Marketing pages are near full-bleed like the reference: container `max-width: 1440px`, outer gutters **24px** (16px on mobile), 12-column grid, 24px column gap.
- App shell: left sidebar 264px (collapsed 72px), content `max-width: 1200px`, page padding 32px (16px mobile).
- Text-only sections (FAQ, long copy) use `max-width: 720px`.

### 5.2 Vertical rhythm
- Section padding: **96px** top and bottom on desktop, **64px** on mobile.
- Gap between a section header and its content: 48px (32px mobile).
- Card padding: **32px** (20px mobile). Gap between cards: 24px (16px mobile), or **4px** inside a joined tile board.

### 5.3 Breakpoints
`sm 640`, `md 768`, `lg 1024`, `xl 1280`, `2xl 1536`. Design mobile first.

### 5.4 Radius

| Token | Value | Use |
|-------|-------|-----|
| `radius-xl` | 28px | Hero images, large photo cards |
| `radius-lg` | 24px | Cards, tile boards, stat strip |
| `radius-md` | 20px | Caption panels, app cards |
| `radius-sm` | 16px | FAQ rows, inputs' containers |
| `radius-button` | 12px | Buttons, inputs (rounded rectangles, **not** pills) |
| `radius-chip` | 9999px | Tags, chips, badges, icon circles, carousel arrows |

One radius per hierarchy level. Never apply a single radius to everything.

### 5.5 Elevation
Flat by default. Use tone, not shadow, to separate (white card on `#F7F7F7`). Only floating layers get the soft shadow from 3.6.

### 5.6 Responsive behavior
- Tile board: 2×2 with a photo tile on large screens, a single column on mobile (photo first).
- Stat strip: three tiles in a row on desktop, stacked with 8px gaps on mobile.
- Showcase cards: full width, caption panel below the image on mobile (no overlay) to keep text readable.
- Footer columns stack into an accordion on mobile.
- Primary navigation collapses into a sheet below `lg`.

---

## 6. Components (marketing and shared)

All components are built on shadcn/ui and Radix primitives, restyled with the tokens above.

### 6.1 Buttons

| Size | Height | Horizontal padding |
|------|--------|--------------------|
| `sm` | 36px | 16px |
| `md` (default, minimum touch target 44px) | 44px | 20px |
| `lg` | 52px | 28px |

| Variant | Appearance | Use |
|---------|------------|-----|
| `primary` | Pine-600 fill, white text. Hover pine-700, pressed pine-800 | The one main action per view |
| `ink` | `#151515` fill, white text. Hover `#2C2C2C` | Strong secondary action, plan cards, actions on tinted backgrounds |
| `soft` | Orchid-200 fill, ink text | "View" buttons on photo captions. Decorative |
| `outline` | 1px ink border, transparent | Secondary action |
| `ghost` | Text only, underline on hover | Tertiary and inline actions |
| `icon-circle` | 44px circle, white, 1px `border`, ink icon | Carousel arrows, close, small utilities |

- Marketing buttons use uppercase `button (marketing)` style with a trailing arrow icon (Lucide `arrow-right`, 16px, `aria-hidden`). The arrow shifts 2px on hover and mirrors in RTL.
- In-app buttons use sentence case and no arrow unless it signals navigation.
- Focus: 2px pine-500 ring with 2px offset on every interactive element.
- Disabled: reduced emphasis (`#D9D9D9` fill, `#6B6B6B` text), and **a visible reason next to the control**. Pending: spinner plus the same label, `aria-busy="true"`, clicks ignored.

### 6.2 Tags and chips
Pill, 28px high, 12px horizontal padding, `label` style.

| Variant | Fill | Text |
|---------|------|------|
| `category` (default) | pine-200 | pine-800 |
| `accent` | orchid-200 | ink |
| `neutral` | `#ECEBEB` | ink |
| `outline` | transparent, 1px ink | ink |

On photos, place a tag 16px from the top-left corner. Do not number tags (`01 / ...`) unless the content is a real sequence.

### 6.3 Icon circles
64px circle (48px on mobile), 24px Lucide icon with stroke 1.75, ink. Fills: neutral `#ECEBEB`, pine-200 or orchid-200. Use one accent fill per group of four and never use the fill to encode meaning.

### 6.4 Section header
Optional eyebrow (`label`, `text-muted`), 16px gap, `h2` centered at `max-width: 18ch`, optional `body-lg` lead in `text-secondary`, and an optional button 32px below. Left-aligned variant for dense app pages: `h3` plus a hairline rule and a ghost link on the right.

### 6.5 Tile board (feature grid)
A container with `radius-lg` and `overflow: hidden`, background `tile-gap`, grid gap **4px**. Tiles are white with 32px padding: icon circle, `h4` title, `small` description in `text-secondary`. An optional tall photo tile (with a category tag) sits at the left on desktop.

### 6.6 Photo cards
- **Portrait carousel card:** `radius-lg`, 4:5 image, white caption card overlapping the bottom edge (`radius-md`, 16px inset) with an `h4` title and a one-line description.
- **Showcase card:** 16:9 image, `radius-xl`, glass caption panel (3.6) pinned to the bottom with white `h4` title, `small` description in white at 85% opacity, and a `soft` "View" button on the right.
- Always provide meaningful `alt` text, a blur placeholder and explicit dimensions to prevent layout shift.

### 6.7 Stat strip
Three tiles in one rounded container: **pine-200**, **white** and **orchid-200** (the reference's pink, white and mint rhythm). Each tile: `stat` numeral with a short label at its top-right, a 1px divider at 12% ink, and a `small` paragraph pinned to the bottom (minimum tile height 280px on desktop). **Only real numbers.** If there is no real data yet, do not render the strip.

### 6.8 Plan card (Boost plans, pricing)
A card with a `label` ("Per month"), the `price` in KES (or the local currency from the price book), a full-width button, and a second white card beneath with grouped lists ("What's included", "Limits"). The featured plan gets the `primary` button, the others get `ink`. No ribbons, no neon, no urgency tricks. State what each plan does **and does not** do (it never affects reviews, reputation or verification).

### 6.9 FAQ accordion
Single column, `max-width: 720px`. Rows use `surface-sunken`, `radius-sm`, padding 20px 24px, an 8px gap. A plus icon at the left rotates 45° when open. Built with Radix Accordion (keyboard and screen-reader support). Open state animates height in 250ms and respects reduced motion.

### 6.10 Testimonial / story carousel
Cards are white, `radius-lg`, padding 32px: a quote in `h4` weight 400, the name in `h4` with the role inline in `small text-muted`, and a 56px rounded-square avatar at the right. Horizontal scroll with snap, `icon-circle` previous and next buttons centered below (with `aria-label`s). **No auto-advance.** Only publish real stories with written consent.

### 6.11 Insight (blog) card
Image on top (`radius-lg`, 16:10), then a `label`-style category prefixed with a slash (`/guides`) and the date at the right, an `h4` title and a two-line `small` excerpt in `text-secondary`.

### 6.12 Footer
Background **pine-950**, padding 80px 24px. Left: wordmark in white and a short address or contact block. Columns have a `label` heading in pine-300 and links in white at 90% (hover and current page: pine-300). Social icons 20px. Bottom row: legal text in `#A9B8B4` at 13px.
- **The newsletter field is off** until an email or WhatsApp channel is chosen. Do not ship a form that collects data with no sender behind it.
- Required links: Terms, Privacy, Trade terms, How ranking works (`/trust`), How verification works, Support.

### 6.13 Header (inferred, not seen in the recording)
Transparent over the page background, wordmark left, links center, one `primary` button right. On scroll it gains a 1px `border` and the soft floating shadow. Below `lg` it collapses into a sheet. Keep a visible "Sign in" link next to the primary button.

### 6.14 Forms
- Label above the field: `small` weight 500. Required fields are marked in text ("Required"), not only with an asterisk.
- Input: height 48px, `radius-button`, 1px `input-border`, white fill, 16px text (prevents iOS zoom). Hover border `#6B6B6B`. Focus 2px pine-500 ring.
- Helper text `caption` in `text-muted`. Errors: amber-800 text with an alert icon, placed under the field, announced via `aria-live="polite"`, and the field gets an amber-700 border plus the icon.
- Selects and comboboxes use Radix. Location pickers are dependent dropdowns (country, city, neighborhood).
- Phone inputs accept national format and show the country dial code.

### 6.15 Feedback
- Toasts (Sonner): bottom center on mobile, bottom right on desktop. Success is pine, warning is amber. **No red.** The verb matches the action ("Published").
- Empty state: icon circle, `h4` title, one sentence, one primary action.
- Loading: skeletons that match the final layout, never spinners over blank pages.
- Error pages (`error.tsx`, `not-found.tsx`): plain explanation, what to do next, a primary action back to safety. No stack traces, ever.

---