# Stage 3 — Onboarding Absorption Spec

**Goal:** Absorb FYM Agency Activation (`teamfym_com` / `lpmyzp`) into FYM App (`rcbzag`).
The activation tool stays live at `teamfym.com` until FYM App reaches full parity.

## What We're Absorbing

### 1. Partner Activation Hub (`/activation/:slug`)
A slug-gated resource hub for newly onboarded agencies. No auth — the slug IS the credential.

**9 sections, in order:**
| # | Section | Component | Data Source |
|---|---------|-----------|-------------|
| 01 | Roadmap | `Roadmap.tsx` | `ROADMAP_DATA` (4 weeks, ~22 tasks) + `partner_agencies.roadmap_progress` (jsonb) |
| 02 | Tools | `Tools.tsx` | `CompTierConfig.financialModelerUrl` — links to external Netlify apps |
| 03 | Scripts | `Scripts.tsx` | `SCRIPT_SECTIONS` (8-beat HIP sales script) + `COMPLIANCE_CHECKS` + `CHECKLIST_PRECALL` + `CHECKLIST_QUESTIONS` |
| 04 | Sample Calls | `SampleCalls.tsx` | `SAMPLE_CALLS` — 4 audio files served from `/activation/files/` |
| 05 | State Lookup | `StateLookup.tsx` | `STATES_DATA` — 37 states × 6 products (yes/no/new) |
| 06 | Training Calendar | `TrainingCalendar.tsx` | `TRAINING_SESSIONS` — 3 weekly + 1 flexible, Google Calendar link builder |
| 07 | Sample Reporting | `SampleReporting.tsx` | Hardcoded sample data (not live) — shows Friday email format |
| 08 | Contacts | `Contacts.tsx` | Variant-specific primary contacts + `CONTACTS` (FYM team directory) |
| 09 | Downloads | `Downloads.tsx` | `DOWNLOAD_FILES` — 5 PDFs/docs from `/activation/files/` |

**Hero:** Personalized with `agency_name` + `principal_name`. Stats: 30 days, 36 states, 6 products.

### 2. Variant System
Two variants control contact names, email addresses, and roadmap task visibility:
- `brent_melanie` — Melanie Fox + Brent Depeppe (default)
- `fym_direct` — Will Coatney + Jon Cole (hides week 3, hides w2-5/w2-6 tasks)

`applyVariant()` does string interpolation: `{primary}`, `{primaryEmail}`, `{secondary}`, `{secondaryEmail}`.
Variant overrides can also change task titles and CTA actions.

### 3. Comp Tier System
4 tiers: 60, 65, 70, 75. Each may have a `financialModelerUrl` (external Netlify app).
Currently only 70 and 75 have modeler URLs. Tiers without a URL hide the modeler card.

### 4. Admin Dashboard
Password-gated by `VITE_ADMIN_SLUG` (unguessable URL slug, no real auth):
- **List** (`/admin/:adminSlug`) — all agencies with progress %, last visit, stale detection (>7 days), variant/tier badges
- **Detail** (`/admin/:adminSlug/:slug`) — full roadmap view with incomplete task breakdown, edit form
- **New** (`/admin/:adminSlug/new`) — create agency with name, principal, variant, comp tier, auto-generated slug

### 5. Database (lpmyzp)

#### `partner_agencies` table
| Column | Type | Notes |
|--------|------|-------|
| `slug` | text PK | URL segment, credential |
| `agency_name` | text NOT NULL | |
| `principal_name` | text | nullable |
| `principal_email` | text | nullable |
| `roadmap_progress` | jsonb `{}` | `{task_id: boolean}` map |
| `active` | boolean `true` | false = hub shows closed message |
| `variant` | text | `brent_melanie` or `fym_direct` |
| `comp_tier` | text | `60`, `65`, `70`, `75` |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | trigger-maintained |
| `last_visited_at` | timestamptz | nullable, updated on each hub visit |

RLS: anon can SELECT, UPDATE, INSERT. No DELETE (use `active=false`).
Trigger: `trg_partner_agencies_updated_at` keeps `updated_at` fresh.

#### `agent_applications` table
Recruiting form submissions (Meta lead form → Winter/Get HIP pages). Pre-contract stage — upstream of CRM Portal.
**Not part of Stage 3 scope** — this is a marketing/recruiting form, not an activation feature.

### 6. Edge Functions (lpmyzp)
- `create-partner-agency` — validates ADMIN_SLUG, creates row with service key
- `update-partner-agency` — validates ADMIN_SLUG, updates agency fields with service key
- `send-meta-capi` — Meta CAPI event forwarding (marketing, not activation)

### 7. Static Assets
Audio files and PDFs served from `public_clean/activation/files/`:
- 4 `.mp3` sample call recordings
- 5 downloadable docs (PDF, DOCX, PPTX)

---

## Absorption Architecture

### What moves to `rcbzag`
1. **`onboarding_agencies` table** — new table in rcbzag, mirrors `partner_agencies` schema + adds FK to `agencies.id`
2. **Roadmap progress tracking** — same jsonb approach
3. **Edge functions** — `create-onboarding-agency` and `update-onboarding-agency` in rcbzag
4. **Admin UI** — new `/onboarding` route in FYM App (admin-only sidebar item)

### What stays as-is (code reuse)
- All activation data files (`data.ts`, `types.ts`, `variants.ts`, `compTiers.ts`) → copy into FYM App `src/lib/onboarding/`
- Component structure (Roadmap, Scripts, etc.) → rebuild as FYM App components with shadcn/ui styling
- Variant system + comp tier system → exact same logic

### What changes
1. **Auth model** — FYM App has real auth. Admin features use role-based access instead of URL slugs
2. **Partner hub** — still slug-gated (no auth for agency owners), but could optionally be a separate public route or stay on teamfym.com until fully migrated
3. **Agency identity** — `onboarding_agencies` links to `rcbzag.agencies` via FK, connecting onboarding progress to the canonical agency record
4. **Static assets** — audio/docs move to FYM App's public directory or a CDN

### What's NOT in scope (Stage 3)
- `agent_applications` / recruiting forms (marketing, separate concern)
- Meta CAPI integration
- The public-facing teamfym.com homepage / marketing pages
- Winter campaign pages

---

## Build Plan — PR Sequence

### PR #13: `stage-3/onboarding-foundation`
**Migration + admin list/detail/create**
1. Migration: `onboarding_agencies` table in rcbzag (schema matches `partner_agencies` + `agency_id uuid REFERENCES agencies(id)`)
2. Copy activation data files into `src/lib/onboarding/`
3. Edge function: `manage-onboarding-agency` (create + update in one fn, auth'd via service key + role check)
4. Admin pages:
   - `/onboarding` — agency list with progress, stale detection, variant/tier badges
   - `/onboarding/:slug` — detail view with roadmap breakdown, edit form
   - `/onboarding/new` — create agency form
5. Sidebar: add "Onboarding" nav item for admin role
6. Seed existing `partner_agencies` data from lpmyzp → rcbzag (one-time migration edge fn or SQL)

### PR #14: `stage-3/partner-hub`
**Public-facing activation hub in FYM App**
1. Public route: `/activate/:slug` (no auth required)
2. Port all 9 sections as FYM App components
3. Roadmap progress persistence via rcbzag
4. Static asset serving (audio + docs)
5. Variant + comp tier system working end-to-end

### PR #15: `stage-3/data-sync`
**Migration of existing partner data + nightly sync**
1. One-time seed of existing partner_agencies from lpmyzp → rcbzag
2. Optional: nightly sync during parallel period (both tools reading/writing)
3. Deprecation notice on teamfym.com admin pointing to FYM App

---

## Decision Points (need team input)
1. **Partner hub URL:** Keep `teamfym.com/activation/:slug` during parallel period? Or redirect to `agency.teamfym.com/activate/:slug`?
2. **Audio/doc hosting:** Move to FYM App public dir, or use a CDN/storage bucket?
3. **Variant system evolution:** Are `brent_melanie` and `fym_direct` still the right variants, or has the team structure changed?
