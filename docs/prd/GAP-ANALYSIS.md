# PRD Gap Analysis — P1-P6 vs Full PRD Specs
## Generated 2026-08-03

### Legend
- ✅ = Built in P1-P6
- 🔶 = Partially built (foundation exists, needs enhancement)
- ❌ = Not yet built
- ⏸️ = Explicitly deferred (business process doesn't exist yet or out of scope)

---

## Phase 2A — Writing Agent

| # | Feature | Status | Notes |
|---|---------|--------|-------|
| §4 | Dashboard with MTD hero, KPI tiles, period selector | 🔶 | P3 Agent Dashboard built — has MTD hero, KPI tiles, trend chart. Missing: period selector pills (7d/MTD/YTD/Custom), Compare-to-prior toggle, Customize button |
| §4.4 | Year-End Projection widget on dashboard | ✅ | P4 Goal page has year-end projection; P3 dashboard integrates goal progress |
| §4.4 | Dashboard layout customization with locked widgets | ❌ | PRD specs drag-to-reorder with Needs Attention + Quality locked |
| §4.6 | Empty/brand-new-agent states | 🔶 | P3 has no-data states but not the full penguin/zero-apps treatment |
| §5 | Needs Attention page | ✅ | P2 built — urgency sort, tri-state actions, filters |
| §5.7 | Save Rate indicator on Needs Attention page | ❌ | PRD specs a Save Rate KPI tile at top of attention page |
| §6 | My Production page (3 tabs: Volume/Quality/AP) | ❌ | Not built — agents currently see Book Health page |
| §6.3.2 | Quality tab with full metric priority order | ❌ | QualityCard exists (P1) but not the full 8-metric tile grid |
| §7 | My Goal page with AP Calculator | 🔶 | P4 Goal page built — goal entry, progress, pacing. Missing: AP Calculator (3 modes), ghost-minimum tooltip |
| §8 | Leaderboards with Executive Summary card | 🔶 | Existing LeaderboardPage exists. Missing: Executive Summary card with per-metric rank tiles, Ramp Up board, expanded sort metrics (9-mo, 13-mo, UW share) |
| §8.7 | Attenborough-style masking for cross-agency rows | ❌ | Not built |
| §9 | Head-to-Head Comparison | ❌ | Not built |
| §10 | Policy Detail modal | ❌ | Not built — attention cards link to at-risk page but no policy detail view |
| §11 | Profile & Settings with notification preferences | 🔶 | Settings page exists but no notification preferences |
| §11.5 | Home Dashboard Layout customization | ❌ | Not built |
| §12.6 | Dancing Penguin for not-yet-eligible metrics | ❌ | Not built |
| §12.7 | Quality metric priority order across all surfaces | ❌ | Not implemented as a cross-cutting pattern |
| §3.4 | First-login onboarding tour | ❌ | Not built |

## Phase 2B — Agency Manager

| # | Feature | Status | Notes |
|---|---------|--------|-------|
| §4 | Manager Dashboard (book-level hero, team quality, pacing) | 🔶 | Admin dashboard exists; P5 Manager Team Table built. Missing: book-level hero card, team quality widget, pacing breakdown card on dashboard |
| §5 | My Team page (roster grid with per-agent KPIs) | ✅ | P5 Manager Team Table — sortable table with MTD AP, vs Goal, apps, retention, attention counts |
| §6 | Team Needs Attention (By Policy + By Agent views) | 🔶 | P2 Needs Attention exists but is agent-scoped. Missing: By Agent toggle view, agent attribution on rows |
| §6.7 | Manager Note Composer modal | ❌ | Not built |
| §7 | Book-level Production page (Volume/Quality/AP tabs) | ❌ | Production page exists at admin level but not book-scoped for managers |
| §7.2.2 | Quality tab with pivotable chart "Quality by Agent" | ❌ | Not built |
| §8 | Manager-level Goals page (per-agent goal table, bulk apply) | ❌ | P4 built agent self-service goals; manager bulk goal setting not built |
| §9 | Book-level Projections (linear) | ❌ | Not built |
| §10 | 4-tab Leaderboards (Books/Agents/Agencies/All) | ❌ | Single leaderboard exists; nested tabs not built |
| §11 | Agent Detail drill-down (hero strip + 5 tabs) | ❌ | Not built — this is a major new page |
| §11.3.5 | Agent audit tab | ❌ | Not built |
| §13.5 | Drill-down pattern with breadcrumb + back button | ❌ | Not built as a cross-cutting pattern |

## Phase 2B — Agency Owner

| # | Feature | Status | Notes |
|---|---------|--------|-------|
| §4 | Owner Dashboard (agency-level hero, manager roster health) | ❌ | Not built — Owner role not implemented |
| §4.4 | Manager Roster Health card (4 books grid) | ❌ | Not built |
| §5 | Agency page (Books/Managers/Agents tabs) | ❌ | Not built |
| §6 | Agency-wide Needs Attention (3 views: By Book/Agent/Policy) | ❌ | Not built |
| §7 | Agency-level Production with per-book breakdowns | ❌ | Not built |
| §8 | Goals & Min (agency goals, ghost minimums, manager exceptions) | ❌ | Not built |
| §9 | Own-agency CDF Projections with 4-lever scenario authoring | ⏸️ | Deferred — insufficient historical data, massive effort |
| §11 | Manager Detail drill-down (hero strip + 5 tabs) | ❌ | Not built |
| §12 | Agent Detail from Owner perspective | ❌ | Not built |
| §13.5-13.8 | Invite/Reassign/Promote/Terminate modals | ❌ | Not built |

## Phase 2C — FYM Admin

| # | Feature | Status | Notes |
|---|---------|--------|-------|
| §5 | Admin Dashboard with 4-wide hero strip + 3 pillars | ❌ | Current admin dashboard exists but uses different layout |
| §5.3.1 | Hero KPI strip (Org MTD, Quality pivot, Year-end P50, Apps) | ❌ | Not built |
| §5.3.2 | Volume Pillar (daily AP sparkline, pivot chart, top states) | ❌ | Not built |
| §5.3.3 | Quality Pillar (vital signs, pivotable chart by agency) | ❌ | P1 QualityCard exists but not the full pillar layout |
| §5.3.4 | Projections Pillar (12-month fan chart preview) | ⏸️ | CDF/Monte Carlo deferred |
| §5.3.5 | Agency Roster Health strip (8 agency cards) | ❌ | Not built |
| §5.3.6 | System & Alerts strip | ❌ | Not built |
| §6 | Performance page (Volume/Quality/Leaderboards tabs) | ❌ | Separate production + leaderboard pages exist but not unified |
| §7 | Agency Detail drill-down (6 tabs) | ❌ | Not built |
| §8 | Manager Detail drill-down | ❌ | Not built |
| §9 | Agent Detail drill-down | ❌ | Not built |
| §10 | Configuration surface (7 tabs) | ❌ | Not built |
| §11 | Org-wide CDF Projections | ⏸️ | Deferred |
| §12 | System surface (4 tabs: Audit/Ingest/Corrections/Health) | ❌ | Not built |
| §13.4 | Pivot chip pattern | ❌ | Not built as reusable pattern |
| §13.8 | Hero-pivot popover | ❌ | Not built |
| §14 | Quality Metric Priority Order (cross-cutting) | ❌ | Not implemented |

## Cross-Cutting (All PRDs)

| Feature | Status | Notes |
|---------|--------|-------|
| Period selector pills (7d/MTD/YTD/Custom) | ❌ | Not built — pages use fixed time ranges |
| Compare-to-prior toggle | ❌ | Not built |
| Dashboard layout customization | ❌ | Not built |
| Dancing penguin for not-yet-eligible | ❌ | Not built |
| Quality metric priority order | ❌ | Not implemented as ordering pattern |
| Data freshness indicator | 🔶 | StatusBar shows time but not "Data as of X" per-page |
| Export (CSV/PDF) | ❌ | Not built on any page |
| Notification preferences | ❌ | P6 adds bell + panel but no preferences UI |
| Drill-down pattern with breadcrumb | ❌ | Not built |
| First-login onboarding tour | ❌ | Not built |
| Attenborough masking | ❌ | Not built |

---

## Summary Counts

| Status | Count |
|--------|-------|
| ✅ Fully built | 4 |
| 🔶 Partially built | 8 |
| ❌ Not built | 42 |
| ⏸️ Deferred | 3 |

**Total PRD features identified: 57**
**Coverage: ~21% (12 of 57 fully or partially built)**
