# Next Batch Recommendation — Post P1-P6
## Generated 2026-08-03

### Prioritization Criteria
1. **Retention leverage** — does it help agents/managers act on quality of business?
2. **User-facing impact** — does it make the app feel significantly more complete?
3. **Build feasibility** — can it ship in 1-3 days with existing data/edge functions?
4. **Foundation value** — does it unlock other features downstream?

---

## Recommended Batch 2 (P7-P10)

### P7: Quality Metric Priority Order + Enhanced Quality Card
**Effort: ~1 day | Impact: High**
- Implement the PRD-mandated quality metric priority order across all surfaces:
  Policies Taken → 30d Ret → 90d Ret → 9-mo Pers → 13-mo Pers → UW Share → Save Rate → Attn Rate
- Expand QualityCard from 4 metrics to the full 8 (add 9-mo Pers, 13-mo Pers, UW Share, Attn Rate)
- Add penguin state for not-yet-eligible cohort metrics
- This is cross-cutting — once built, it applies to every dashboard and detail page
- **Why now:** Quality of business is the prime directive. The metric order is the PRD's single most referenced pattern.

### P8: Agent Detail Drill-Down Page
**Effort: ~2 days | Impact: Very High**
- New page at `/agents/:writingNumber` (or `/people/agents/:id`)
- Hero strip with 4 KPI tiles (MTD AP, Policies Taken, Retention, Apps)
- 4 tabs: Overview / Volume / Quality / Policies
- Back button + breadcrumb navigation
- Click-through from Manager Team Table, Leaderboard, Needs Attention
- **Why now:** Every PRD references Agent Detail as a first-class destination. It's the #1 drill-down path from the Manager Team Table (P5) and Leaderboard. Without it, managers hit a dead end when they click an agent row.

### P9: Period Selector + Compare-to-Prior
**Effort: ~1-2 days | Impact: High**
- Reusable `PeriodSelector` component: [7d] [MTD] [YTD] [Custom] pills
- Compare-to-prior toggle that adds delta indicators
- Wire into Dashboard, Agent Dashboard, Leaderboard, Production pages
- localStorage persistence for default period
- **Why now:** Every PRD page specs this control. It's referenced 15+ times across the 4 PRDs. Building it as a reusable component unlocks period-awareness across the entire app.

### P10: My Production Page (Agent)
**Effort: ~2 days | Impact: High**
- New page at `/my-production` with 3 tabs: Volume / Quality / Policies
- Volume: total apps, daily sparkline, product family breakdown, policy table
- Quality: full 8-metric tile grid using P7's priority order
- Policies: searchable/filterable policy table
- Replaces/augments the existing Book Health page for agent role
- **Why now:** Agents currently have no production detail page. The Agent Dashboard (P3) is a summary; this is the full read.

---

## Recommended Batch 3 (P11-P13)

### P11: Manager Notes on Policies/Agents
**Effort: ~1 day | Impact: Medium-High**
- Manager Note Composer modal
- Notes visible on Needs Attention cards (as shown in PRD prototype)
- Notes visible on Agent Detail page
- Stored in FYM App DB (new `manager_notes` table)
- **Why:** Direct retention action — managers leaving notes on at-risk policies is a coaching tool

### P12: Leaderboard Enhancement (Executive Summary + Expanded Sorts)
**Effort: ~2 days | Impact: Medium-High**
- Executive Summary card at top of leaderboard (personal rank tiles per metric)
- Add sort options: 9-mo Pers, 13-mo Pers, UW Share
- Ramp Up board tab
- Personal row highlight with "★ You" badge
- **Why:** Gamification drives agent engagement; leaderboard is the social proof engine

### P13: Dashboard Layout Customization
**Effort: ~2 days | Impact: Medium**
- Widget grid with drag-to-reorder
- FYM-locked widgets (Needs Attention + Quality always render first)
- User preferences stored in FYM App DB
- Customize button in dashboard header
- **Why:** Every PRD specs this. It's the #1 "polish" feature that makes the app feel custom

---

## Parked (Build When Business Need Arrives)

| Feature | Reason |
|---------|--------|
| Ghost minimums / tenure tiers | Business process doesn't exist at FYM yet |
| Owner role tier | Only 3 role tiers in current DB (agent/manager/admin) |
| CDF/Monte Carlo projections | Insufficient historical data; massive compute |
| Configuration surface (Admin 7 tabs) | Low urgency — admin config is rare |
| System surface (Admin 4 tabs) | Low urgency — audit/ingest monitoring |
| Attenborough masking | Requires cross-agency data policies not yet defined |
| First-login onboarding tour | Polish — build after core features complete |
| Head-to-Head comparison | Nice-to-have, not a retention driver |
| AP Calculator (3 modes) | Nice-to-have on Goal page |
| Export (CSV/PDF) | Useful but not a retention driver |

---

## Build Order Summary

| Phase | Feature | Est. Days | Cumulative |
|-------|---------|-----------|------------|
| P7 | Quality Metric Priority Order | 1 | 1 |
| P8 | Agent Detail Drill-Down | 2 | 3 |
| P9 | Period Selector + Compare | 1.5 | 4.5 |
| P10 | My Production (Agent) | 2 | 6.5 |
| P11 | Manager Notes | 1 | 7.5 |
| P12 | Leaderboard Enhancement | 2 | 9.5 |
| P13 | Dashboard Customization | 2 | 11.5 |

**Batch 2 (P7-P10): ~6.5 days to ship**
**Batch 3 (P11-P13): ~5 additional days**
