# FYM Admin Contracting Pipeline — GHL Two-Way Sync Workflows

> **Pipeline:** FYM Admin Contracting Pipeline (8-stage Kanban)
> **App DB:** Portal `akhojh` — `agent_pipeline` + `agent_pipeline_stage_map` + `agent_pipeline_ghl_config`
> **GHL Pipeline:** "New Agents Pipeline" (FYM Contracting Support sub-account `pE2DOS2bdVB3AYlMcQ1a`)
> **Edge Functions (portal `akhojh`):**
>   - `push-pipeline-stage` (App→GHL)
>   - `sync-pipeline-from-ghl` (GHL→App bulk pull)
>   - `agent-pipeline-webhook` (GHL→App real-time)
> **UI:** `src/pages/contracting/pipeline/PipelineBoard.tsx` (FYM App reads portal DB)

---

## Stages (8 active + 5 legacy)

| App Stage Key         | GHL Stage Name (mapped via `agent_pipeline_stage_map`) | Description                    |
|-----------------------|-------------------------------------------------------|--------------------------------|
| `hip_broker`          | *(mapped in DB)*                                      | HIP Broker intake              |
| `hip_career`          | *(mapped in DB)*                                      | HIP Career intake              |
| `iaa`                 | *(mapped in DB)*                                      | Independent Agent Agreement    |
| `in_contracting`      | IN CONTRACTING PROCESS (`e5086dba`)                   | Active contracting             |
| `waiting_for_numbers` | *(mapped in DB)*                                      | Awaiting writing numbers       |
| `rts`                 | RTS Status (Tracey) (`6cc9d0c5`)                      | Ready to sell                  |
| `actively_selling`    | Actively Selling - (`ccc320f2`)                       | Producing agent                |
| `terminated`          | *(mapped in DB)*                                      | Terminated                     |

**Legacy stages** (still loaded, no longer shown as columns): `signed_iaa`, `bill_com`, `crm`, `hip_broker_ready`, `hip_career_ready`

**Stage map is DB-driven:** The `agent_pipeline_stage_map` table in portal DB holds `internal_stage ↔ ghl_stage_id ↔ ghl_stage_name` mappings. No hardcoded map in the edge functions — adding/renaming stages only requires a DB row update.

---

## Prerequisites

1. **`agent_pipeline_ghl_config` table** must have a row with valid `ghl_api_key`, `ghl_location_id`, `ghl_pipeline_id`
2. **`agent_pipeline_stage_map` table** must have entries mapping internal stages ↔ GHL stage IDs
3. **GHL webhook** must be configured in the contracting sub-account to POST to `agent-pipeline-webhook`

If `agent_pipeline_ghl_config` is empty or incomplete, the `push-pipeline-stage` function falls back to local-only updates (no GHL push, no error).

---

## Workflow 1: App → GHL (stage change in FYM App)

**Trigger:** Admin drags a card on the Contracting Pipeline Kanban, OR any code path calls `push-pipeline-stage` (WritingNumberReviewPanel, LobAssignment, AgentDetailPage ContractingTab)

### Flow:

```
1. UI calls  push-pipeline-stage  edge function (portal DB akhojh):
   └── POST { record_id, new_stage, updated_by, updated_by_source: "contracting_portal" }

2. Edge function loads the  agent_pipeline  record by ID

3. Edge function loads GHL config from  agent_pipeline_ghl_config:
   └── If no config / missing key / missing pipeline_id:
       ├── Update record locally (stage, timestamps, attribution)
       └── Return { success: true, ghl_pushed: false, reason: "no_config" }

4. Edge function looks up  agent_pipeline_stage_map  for the target stage:
   └── If no mapping for this stage:
       ├── Update record locally
       └── Return { success: true, ghl_pushed: false, reason: "no_stage_mapping" }

5. Edge function marks record  ghl_sync_status = "pushing"

6. Edge function resolves the GHL opportunity:
   a. Start with stored  ghl_opportunity_id  on the record
   b. If the record has a phone number:
      └── Search GHL opportunities by phone (normalized) to find the correct one
      └── Phone match overrides stored opportunity ID (handles stale IDs)

7. Edge function pushes to GHL:
   └── PUT  /opportunities/{opportunityId}
       { pipelineId, pipelineStageId: stageMap.ghl_stage_id }

8. On success:
   ├── Update  agent_pipeline:
   │   └── { stage, ghl_stage_id, last_updated_by: displayName,
   │         updated_by_source: "contracting_portal", ghl_sync_status: "synced",
   │         stage_entered_at: now }
   └── Log to  webhook_log  { source: "push-pipeline-stage", event_type: "push_success" }

9. On GHL API failure:
   ├── Revert  ghl_sync_status = "synced"
   ├── Log to  webhook_log  { event_type: "push_failed" }
   └── Return { success: false, ghl_pushed: false, error: "..." }
       (UI shows error toast but app state is NOT reverted — stage change is committed)
```

### Callers (4 UI surfaces push stage changes):

| File | Trigger |
|------|---------|
| `PipelineBoard.tsx` | Kanban drag-and-drop + bulk move |
| `WritingNumberReviewPanel.tsx` | Writing number review → auto-advance |
| `LobAssignment.tsx` | LOB assignment changes → stage update |
| `AgentDetailPage > ContractingTab.tsx` | Admin stage override from agent detail |

---

## Workflow 2: GHL → App — Bulk Sync (manual pull)

**Trigger:** Admin clicks the "Sync from GHL" button on the Pipeline Board

### Flow:

```
1. UI calls  sync-pipeline-from-ghl  edge function:
   └── POST (no body required — reads config from DB)

2. Edge function loads GHL config from  agent_pipeline_ghl_config

3. Edge function loads stage map from  agent_pipeline_stage_map:
   └── Builds  ghl_stage_id → internal_stage  lookup

4. Edge function resolves agency context:
   └── Looks up  agency_ghl_configs  by GHL location_id to get agency name/ID

5. Edge function fetches ALL opportunities from the GHL pipeline:
   ├── Paginated: 20 per page, up to 50 pages (1,000 max)
   ├── Rate-limit aware: 200ms delay between pages, retry on 429
   └── Collects all opportunities across all stages

6. For each opportunity:
   a. Map  ghl_stage_id → internal_stage  (skip if unmapped)
   b. Fetch full contact detail from GHL (tags, custom fields, name, email, phone)
      └── Enriches data that the opportunities/search endpoint omits
   c. Check if stage actually changed vs existing record:
      └── Only update  stage_entered_at  if stage is different (preserves time-in-stage)
   d. Upsert into  agent_pipeline  (conflict on  ghl_opportunity_id):
      └── { ghl_opportunity_id, ghl_contact_id, ghl_pipeline_id, ghl_stage_id,
            stage, agent_name, first_name, last_name, email, phone, agency,
            agency_id, tags, custom_fields, last_updated_by: "ghl_webhook",
            ghl_sync_status: "synced" }
      └── Rate-limited: 200ms delay per contact enrichment call

7. Update  agent_pipeline_ghl_config  → connection_status: "connected"

8. Return { synced, skipped, total_fetched }
```

### Loop prevention:
- `last_updated_by` is set to `"ghl_webhook"` on synced records
- The `push-pipeline-stage` function does NOT re-push records that were just synced — the push only fires on explicit UI actions (drag, button click), not on data reloads
- This is a **one-direction pull** — it only reads from GHL and writes to the app. No GHL writes happen during sync.

---

## Workflow 3: GHL → App — Real-Time Webhook

**Trigger:** An opportunity stage changes in the GHL "New Agents Pipeline" (manual move in GHL, or GHL automation)

### Flow:

```
1. GHL workflow fires:
   └── POST to  agent-pipeline-webhook  with opportunity payload
       { locationId, opportunity: { id, pipelineStageId, pipelineStageName, contact, ... } }

2. Edge function  agent-pipeline-webhook  receives the payload:
   a. Validates locationId is present
   b. Resolves agency:
      ├── Checks  agency_ghl_configs  by ghl_location_id
      └── Checks  agent_pipeline_ghl_config  by ghl_location_id
      └── If neither found: return 404

3. Extracts opportunity data:
   └── ghl_opportunity_id, stage name (multiple field name variants handled)

4. Maps stage name → internal stage via  agent_pipeline_stage_map:
   └── By  ghl_stage_name  match
   └── If no match: return { skipped, message: "Unknown stage" }

5. Auto-learns GHL stage IDs:
   └── If incoming webhook has  pipelineStageId  but stage_map row has no  ghl_stage_id:
       └── UPDATE the stage_map row with the incoming ID
       └── This is how the stage map self-populates from real webhook traffic

6. LOOP GUARD — checks if this is an echo from our own push:
   ├── Loads existing  agent_pipeline  record by  ghl_opportunity_id
   ├── If  stage === incoming_stage  AND  last_updated_by === "ui"  AND  ghl_sync_status === "synced":
   │   └── This is the bounce-back from push-pipeline-stage → SKIP
   └── Otherwise: proceed with update

7. Upserts  agent_pipeline  (conflict on  ghl_opportunity_id):
   └── { stage, ghl_stage_id, agent_name, first_name, last_name, email, phone,
         agency, agency_id, last_updated_by: "ghl_webhook", ghl_sync_status: "synced" }
   └── Only sets  stage_entered_at  if stage actually changed

8. Returns success with message
```

### Loop prevention (GHL → App direction):
- **`last_updated_by` + `ghl_sync_status` guard:** When the app pushes a stage change, it sets `last_updated_by` to the admin's display name (e.g. "Tracey") and `ghl_sync_status` to `"synced"`. The webhook checks: if the stage matches AND the last updater was `"ui"` AND status is `"synced"`, it's an echo → skip.
- **Important gap:** The current guard checks for `last_updated_by === "ui"`, but `push-pipeline-stage` sets `last_updated_by` to the admin's name (e.g. "Tracey", "Bianca"), not `"ui"`. This means the echo guard may not reliably catch all bounces — see Issues section.

---

## Summary: Loop Prevention Stack

| Direction | Prevention Mechanism | Where | Reliability |
|-----------|---------------------|-------|-------------|
| App→GHL echo blocked | `last_updated_by` + stage match + `ghl_sync_status` check | `agent-pipeline-webhook` | ⚠️ See note below |
| GHL→App echo blocked | N/A — bulk sync is read-only; webhook updates set `last_updated_by: "ghl_webhook"`, and push only fires on explicit UI actions | `push-pipeline-stage` + UI | ✅ Solid |

### ⚠️ Known Issue: Echo Guard Mismatch

The webhook's loop guard checks `last_updated_by === "ui"`, but `push-pipeline-stage` never sets `last_updated_by` to `"ui"` — it uses the admin's display name (Tracey, Bianca, or the `updated_by` param from the caller). This means:

- **When an admin drags a card → push fires → GHL stage changes → webhook fires back:**
  The webhook sees `last_updated_by = "Tracey"` (not `"ui"`), so the echo guard does NOT trigger, and the webhook processes the bounce-back.
  
- **In practice this is mostly harmless** because the stage is already the same value — the upsert overwrites with the same stage and sets `last_updated_by: "ghl_webhook"`. But it's an unnecessary write and it overwrites the admin attribution.

**Recommended fix:** Either:
1. Have `push-pipeline-stage` set a separate `push_in_flight` flag that the webhook checks and clears, OR
2. Change the webhook guard to check `stage === incoming AND ghl_sync_status === "synced"` (drop the `last_updated_by` check), OR
3. Adopt the same tag-based suppression pattern used by the at-risk pipeline (add a GHL contact tag on push, check it in the GHL workflow before firing the webhook)

---

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│               FYM App UI (agency.teamfym.com)                   │
│                                                                  │
│  ┌────────────────────┐                                         │
│  │ PipelineBoard.tsx  │──── drag/button ────┐                   │
│  │ WritingNumberReview│                      │                   │
│  │ LobAssignment      │                      │                   │
│  │ ContractingTab     │                      │                   │
│  └────────────────────┘                      │                   │
│         ▲ reads                              │                   │
│         │                                    ▼                   │
│  ┌──────┴─────────────────────────────────────────────┐         │
│  │        Portal DB (akhojh)                          │         │
│  │                                                    │         │
│  │  agent_pipeline         (pipeline records)         │         │
│  │  agent_pipeline_ghl_config  (GHL creds/pipeline)   │         │
│  │  agent_pipeline_stage_map   (stage ID ↔ name)      │         │
│  │  webhook_log            (push audit trail)         │         │
│  └────────────────────────────────────────────────────┘         │
└──────────────────────────────────────────────────────────────────┘
                              │
                              ▼ Edge functions (portal akhojh)
┌──────────────────────────────────────────────────────────────────┐
│                                                                   │
│  ┌─────────────────────┐  ┌──────────────────────────────┐      │
│  │ push-pipeline-stage │  │ sync-pipeline-from-ghl       │      │
│  │ (App→GHL push)      │  │ (bulk GHL→App pull)          │      │
│  └─────────┬───────────┘  └──────────────▲───────────────┘      │
│            │                              │                      │
│            │                              │ manual trigger       │
│            │                              │                      │
│  ┌─────────┴──────────────────────────────┴───────────────┐     │
│  │              agent-pipeline-webhook                     │     │
│  │              (real-time GHL→App)                        │     │
│  └──────────────────────────▲──────────────────────────────┘     │
│                              │                                    │
└──────────────────────────────┼────────────────────────────────────┘
                               │
                               │ GHL Webhook
                               │
┌──────────────────────────────┴────────────────────────────────────┐
│              GHL Contracting Sub-Account                          │
│              (pE2DOS2bdVB3AYlMcQ1a)                              │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │ "New Agents Pipeline" (8h8F2lAFHXUkEJgZa2KD) — 30 stgs │    │
│  │ Opportunities = agent contracting records                │    │
│  │ Contact = agent (name, phone, email)                     │    │
│  └──────────────────────────────────────────────────────────┘    │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │ Workflow: "On stage change → fire webhook"               │    │
│  │ Action: POST → agent-pipeline-webhook                    │    │
│  │ Payload: opportunity ID, stage name, contact, location   │    │
│  └──────────────────────────────────────────────────────────┘    │
└───────────────────────────────────────────────────────────────────┘
```

---

## Key Differences vs. At-Risk Pipeline

| Aspect | At-Risk Pipeline | Contracting Pipeline |
|--------|-----------------|---------------------|
| **DB** | FYM App `rcbzag` | Portal `akhojh` |
| **Stage map** | Hardcoded in edge function (`STAGE_MAP`) | DB-driven (`agent_pipeline_stage_map`) |
| **Loop prevention** | GHL tag-based suppression (robust) | `last_updated_by` + stage match (⚠️ gap) |
| **Per-agency** | Yes — each agency has its own GHL pipeline | Single contracting sub-account for all of FYM |
| **Enable gate** | `manager_pipeline_enabled` with CRM team review | `agent_pipeline_ghl_config` exists = enabled |
| **Initial sync** | Direction detection + seed/import | Manual "Sync from GHL" button |
| **Opportunity matching** | By `ghl_opportunity_id`, fallback `ghl_contact_id` | By `ghl_opportunity_id`, fallback phone search |
| **Push timing** | Real-time, fire-and-forget | Real-time, synchronous (waits for result) |
| **Source attribution** | `atrisk_stage_history.source` (app/ghl/seed) | `agent_pipeline.last_updated_by` (name/ghl_webhook) |
| **Auto-learn stage IDs** | No — hardcoded map | Yes — webhook auto-populates `ghl_stage_id` |

---

## Key Tables (all in portal DB `akhojh`)

| Table | Purpose |
|-------|---------|
| `agent_pipeline` | Pipeline state — one row per agent opportunity |
| `agent_pipeline_ghl_config` | GHL credentials + pipeline ID for the contracting sub-account |
| `agent_pipeline_stage_map` | `internal_stage ↔ ghl_stage_id ↔ ghl_stage_name` mapping |
| `agent_pipeline_stage_steps` | Per-stage checklist items |
| `agent_writing_number_submissions` | Agent-submitted writing numbers (pending admin review) |
| `agent_step_completions` | Agent-submitted step completions (pending admin review) |
| `agent_lob_assignments` | Per-agent carrier/LOB assignments |
| `webhook_log` | Push success/failure audit trail |

## Key Files

| File | Purpose |
|------|---------|
| `contracting-portal/supabase/functions/push-pipeline-stage/index.ts` | App→GHL push on stage change |
| `contracting-portal/supabase/functions/sync-pipeline-from-ghl/index.ts` | Bulk GHL→App pull (manual) |
| `contracting-portal/supabase/functions/agent-pipeline-webhook/index.ts` | Real-time GHL→App webhook receiver |
| `FYM-App/src/pages/contracting/pipeline/PipelineBoard.tsx` | Kanban UI — drag-drop, sync button, stage changes |
| `FYM-App/src/hooks/useAgentPipeline.ts` | Agent-facing pipeline data hook |
| `FYM-App/src/lib/contracting/types.ts` | Shared TypeScript types for pipeline stages |
