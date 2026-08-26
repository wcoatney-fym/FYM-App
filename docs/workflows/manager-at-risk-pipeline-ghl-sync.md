# Manager At-Risk Pipeline — GHL Two-Way Sync Workflows

> **Pipeline:** Manager's At-Risk Pipeline (8-stage Kanban)
> **App DB:** `rcbzag` — `atrisk_tasks` + `atrisk_stage_history`
> **GHL Pipeline:** "At-Risk Pipeline" (auto-created per agency, 8 stages)
> **Edge Functions:** `atrisk-ghl-push` (App→GHL), `atrisk-ghl-webhook` (GHL→App)
> **Client Lib:** `src/lib/ghl-push.ts`

---

## Stages (1:1 mapping both directions)

| App Stage Key           | GHL Stage Name | Description            |
|-------------------------|----------------|------------------------|
| `new`                   | New            | Newly flagged at-risk  |
| `responded`             | Responded      | Client responded       |
| `manager_outreach`      | Manager        | Manager working it     |
| `agent_outreach`        | Agent          | Handed to agent        |
| `code_red`              | Code Red       | 30d+ overdue           |
| `agent_saved_pending`   | Pending        | Agent reports saved    |
| `saved`                 | Saved          | Confirmed saved        |
| `lost`                  | Lost           | Policy terminated      |

---

## Prerequisites (per-agency)

Before two-way sync is live for any agency, three conditions must be met:

1. **`hierarchy_agencies.ghl_api_enabled = true`** (portal DB `akhojh`)
2. **`agency_ghl_configs.connection_status = 'connected'`** with valid `ghl_api_key` + `ghl_location_id`
3. **`agency_ghl_configs.manager_pipeline_enabled = true`** — flipped only after CRM team confirms sync direction

If any condition is false, all push/webhook calls return `{ success: true, skipped: true }` — no error, no UI impact, no data change.

---

## Workflow 1: Initial Sync Direction Detection + Enable

**Trigger:** Agency saves GHL credentials in CRM Ops → admin clicks "Enable Pipeline" (or equivalent)

### Flow:

```
1. UI calls  atrisk-ghl-push  { action: "resolve_direction", agency_id }
   ├── Checks App side: atrisk_tasks count + atrisk_stage_history with source='app'
   ├── Checks GHL side: pipeline opportunity count + non-"New" stages
   └── Returns one of:
       • app_to_ghl  — App has worked state, GHL doesn't → seed App→GHL
       • ghl_to_app  — GHL has worked state, App doesn't → import GHL→App
       • conflict    — Both sides have worked state → manual decision needed
       • empty       — Neither side has data → just enable, no sync needed

2. UI calls  atrisk-ghl-push  { action: "create_sync_task", agency_id, direction_result }
   └── Creates a cc_tasks entry in portal DB for CRM team review
       • Source: 'flag', skill_category: 'retention'
       • P2 priority (P1 if conflict)
       • Description embeds detection details + action buttons

3. CRM team reviews the task in Task Board, confirms direction

4. UI calls  atrisk-ghl-push  { action: "execute_sync", agency_id, direction, task_id }
   ├── If app_to_ghl: runs handleSeed()
   │   ├── Phase 1: existing atrisk_tasks → push each to GHL (create/move opportunities)
   │   └── Phase 2: if no tasks exist, pull at-risk from Max's prod DB → create tasks + GHL opps
   ├── If ghl_to_app: runs handleImport()
   │   └── Fetches all GHL pipeline opportunities → upserts atrisk_tasks, maps stages
   ├── If empty: no sync, just enable
   ├── Flips  manager_pipeline_enabled = true  in agency_ghl_configs
   └── Marks cc_tasks entry as done
```

### Loop prevention during initial sync:
- `_bypass_gate = true` flag on internal seed/import calls lets them pass through the `manager_pipeline_enabled` gate (which is still false during initial sync)
- `source` field on `atrisk_stage_history` records is set to `'ghl'` for imported records or `'seed'` for app-seeded records

---

## Workflow 2: App → GHL (stage change in FYM App)

**Trigger:** User drags a card on the Workboard Kanban OR clicks a stage-change button on NeedsAttentionList

### Flow:

```
1. UI commits the stage change to  atrisk_tasks  (optimistic update)
   └── Writes: stage, status, stage_changed_at, updated_at

2. UI logs to  atrisk_stage_history:
   └── { task_id, from_stage, to_stage, source: 'app' }

3. UI calls  pushStageToGhl()  (fire-and-forget via src/lib/ghl-push.ts)
   └── POST to  atrisk-ghl-push  { action: "push", policy_number, agency_id, new_stage, ... }

4. Edge function  atrisk-ghl-push  handles the push:
   a. Checks  ghl_api_enabled  +  connection_status = 'connected'
      └── If not enabled: return { skipped: true } — silent, no error
   b. Checks  manager_pipeline_enabled = true
      └── If false: return { skipped: true } — pipeline not yet confirmed by CRM team
   c. Resolves API key: stored key in agency_ghl_configs → CRM Ops env key fallback
   d. Gets or creates the "At-Risk Pipeline" in the GHL location
   e. Maps  new_stage → GHL stage name  via STAGE_MAP
   f. If  ghl_opportunity_id  exists on the task:
      └── PUT to move the opportunity to the new stage
   g. If no opportunity:
      ├── Search GHL contacts by client name (findContact)
      ├── If found: create opportunity linked to existing contact
      ├── If not found: return { skipped: true, reason: "No GHL contact" }
      └── Store ghl_opportunity_id + ghl_contact_id back on atrisk_tasks
   h. Add suppression tag to the GHL contact:
      └── Tag: "app | manager pipeline trigger"
      └── This tag is checked by the GHL workflow BEFORE it fires the webhook
```

### Loop prevention (App → GHL direction):
- **Suppression tag:** `"app | manager pipeline trigger"` added to GHL contact on every push
- **GHL workflow condition:** The GHL workflow that fires the webhook checks for this tag. If present, the workflow drops the event and removes the tag — the webhook never fires
- **Result:** The echo (GHL sees the stage change we just pushed → tries to webhook back) is killed inside GHL before it reaches our endpoint

---

## Workflow 3: GHL → App (stage change in GHL)

**Trigger:** Someone moves an opportunity in the GHL At-Risk Pipeline (manually in GHL, or via a GHL workflow)

### Flow:

```
1. GHL workflow fires (the one WITHOUT the suppression tag present):
   └── POST to  atrisk-ghl-webhook  with opportunity data
       (webhook URL includes ?secret=<GHL_WEBHOOK_SECRET> and ?agency_id=<id>)

2. Edge function  atrisk-ghl-webhook  receives the payload:
   a. Auth: validates webhook secret query param
   b. Gate: checks  manager_pipeline_enabled  for this agency
      └── If false: return { skipped: true } — pipeline not active
   c. Normalizes the GHL payload (multiple field name variants)
      └── Extracts: opportunity_id, contact_id, pipeline_stage, location_id
   d. Maps GHL stage name → internal stage key via STAGE_REVERSE_MAP
      └── Handles aliases: "Agent | Outreach" → agent_outreach, etc.
   e. Looks up the  atrisk_tasks  record:
      ├── Primary: by  ghl_opportunity_id
      ├── Fallback: by  ghl_contact_id
      └── If neither found: return { skipped: true } — unknown opportunity
   f. Checks if stage actually changed:
      └── If same: return { skipped: true, reason: "Stage already matches" }
   g. Updates the task:
      └── { stage, status, stage_changed_at, updated_at, ghl_opportunity_id, ghl_contact_id }
   h. Logs to  atrisk_stage_history:
      └── { task_id, from_stage, to_stage, source: 'ghl', note }
```

### Loop prevention (GHL → App direction):
- **Source guard in UI:** `pushStageToGhl()` checks `params.source` — if `'ghl'`, returns immediately without calling the edge function
- **atrisk_stage_history.source = 'ghl':** When the UI reads back the stage change (which came from the webhook), the `source` field tells it not to re-push
- **Net effect:** GHL changes the stage → webhook updates the app → app sees `source='ghl'` → does NOT push back to GHL

---

## Summary: Loop Prevention Stack

| Direction | Prevention Mechanism | Where |
|-----------|---------------------|-------|
| App→GHL echo blocked | GHL suppression tag `"app \| manager pipeline trigger"` | GHL workflow condition |
| GHL→App echo blocked | `source` field on `atrisk_stage_history` + `ghl-push.ts` source guard | Edge fn + client lib |

Both mechanisms are independent — even if one fails, the other catches the loop. The tag-based approach (App→GHL) prevents the webhook from ever firing. The source-based approach (GHL→App) prevents the client from ever calling the push endpoint.

---

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                     FYM App (rcbzag)                        │
│                                                             │
│  ┌───────────────┐     ┌──────────────────────┐            │
│  │ Workboard UI  │────▶│ atrisk_tasks         │            │
│  │ (Kanban drag, │     │ (stage, ghl_opp_id,  │            │
│  │  action btns) │     │  ghl_contact_id)     │            │
│  └───────┬───────┘     └──────────┬───────────┘            │
│          │                        │                         │
│          │ fire-and-forget        │ stage_history           │
│          ▼                        ▼                         │
│  ┌───────────────┐     ┌──────────────────────┐            │
│  │ ghl-push.ts   │     │ atrisk_stage_history │            │
│  │ (source guard)│     │ (source: app|ghl)    │            │
│  └───────┬───────┘     └──────────────────────┘            │
│          │                                                  │
└──────────┼──────────────────────────────────────────────────┘
           │
           ▼ POST atrisk-ghl-push
┌──────────────────────────────────────────────────────────────┐
│              Supabase Edge Functions (rcbzag)                │
│                                                              │
│  ┌────────────────────┐       ┌────────────────────────┐    │
│  │ atrisk-ghl-push    │       │ atrisk-ghl-webhook     │    │
│  │ (push/seed/import/ │       │ (receives GHL stage    │    │
│  │  resolve/execute)  │       │  changes, updates      │    │
│  └────────┬───────────┘       │  atrisk_tasks)         │    │
│           │                   └────────────▲───────────┘    │
│           │                                │                 │
└───────────┼────────────────────────────────┼─────────────────┘
            │                                │
            ▼ GHL API                        │ GHL Webhook
┌───────────────────────────────────────────────────────────────┐
│                    GHL Sub-Account                            │
│                                                               │
│  ┌──────────────────────────────────────────────────────┐    │
│  │ At-Risk Pipeline (8 stages)                          │    │
│  │ Opportunities (policy-level, linked by contact)      │    │
│  └──────────────────────────────────────────────────────┘    │
│                                                               │
│  ┌──────────────────────────────────────────────────────┐    │
│  │ Workflow: "On stage change"                          │    │
│  │ Condition: contact does NOT have tag                 │    │
│  │           "app | manager pipeline trigger"           │    │
│  │ Action: fire webhook → atrisk-ghl-webhook            │    │
│  │                                                      │    │
│  │ Workflow: "Remove suppression tag"                   │    │
│  │ Condition: contact HAS tag                           │    │
│  │ Action: remove tag (done, don't fire webhook)        │    │
│  └──────────────────────────────────────────────────────┘    │
└───────────────────────────────────────────────────────────────┘
```

---

## GHL Workflow Configuration Required (per agency)

Two GHL workflows must exist in each agency's sub-account:

### Workflow 1: "At-Risk Pipeline → App Webhook"
- **Trigger:** Pipeline stage changed in "At-Risk Pipeline"
- **Condition:** Contact does NOT have tag `"app | manager pipeline trigger"`
- **Action:** Webhook → POST to `https://<rcbzag-ref>.supabase.co/functions/v1/atrisk-ghl-webhook?secret=<GHL_WEBHOOK_SECRET>&agency_id=<AGENCY_UUID>`
- **Payload:** Include opportunity ID, contact ID, new stage name, location ID

### Workflow 2: "At-Risk Suppression Tag Cleanup"
- **Trigger:** Pipeline stage changed in "At-Risk Pipeline"
- **Condition:** Contact HAS tag `"app | manager pipeline trigger"`
- **Action 1:** Remove tag `"app | manager pipeline trigger"` from contact
- **Action 2:** (No webhook — this was an app-originated change, suppress the echo)

---

## Key Tables

| Table | DB | Purpose |
|-------|-----|---------|
| `atrisk_tasks` | rcbzag | Pipeline state — one row per at-risk policy |
| `atrisk_stage_history` | rcbzag | Audit trail + loop guard (source: app\|ghl\|seed) |
| `agency_ghl_configs` | akhojh (portal) | Per-agency GHL creds + `manager_pipeline_enabled` gate |
| `hierarchy_agencies` | akhojh (portal) | `ghl_api_enabled` flag + agency name |
| `cc_tasks` | akhojh (portal) | CRM team sync direction review tasks |

## Key Files

| File | Purpose |
|------|---------|
| `supabase/functions/atrisk-ghl-push/index.ts` | App→GHL push, seed, import, direction detect, sync execute |
| `supabase/functions/atrisk-ghl-webhook/index.ts` | GHL→App webhook receiver |
| `src/lib/ghl-push.ts` | Client-side fire-and-forget push helper + source guard |
| `src/components/admin-at-risk/` | Workboard UI (Kanban + action cards) |
