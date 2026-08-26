# GHL Setup Guide: Contracting Pipeline

> **Target GHL account:** Contracting sub-account (one shared account for all agencies)
> **App surface:** Contracting → Pipeline tab (`agency.teamfym.com/contracting`)
> **Edge functions (Portal `akhojh`):** `push-pipeline-stage` (App → GHL) · `agent-pipeline-webhook` (GHL → App) · `sync-pipeline-from-ghl` (bulk pull)
> **DB:** Portal (`akhojh`) — `agent_pipeline`, `agent_pipeline_stage_map`, `agent_pipeline_ghl_config`

---

## Overview

The Contracting Pipeline tracks agents through the contracting lifecycle — from initial agreement through actively selling. When an admin drags an agent between stages in the app, that stage change pushes to GHL. When someone moves an opportunity in GHL, a webhook fires back to the app.

**Key difference from the Workboard (At-Risk) pipeline:** The contracting pipeline uses a **single shared GHL sub-account** for all agencies, not per-agency sub-accounts. The config lives in `agent_pipeline_ghl_config` (one row), not `agency_ghl_configs`.

**Loop prevention:** The app marks each push with `updated_by_source = 'contracting_portal'` and `last_updated_by = <admin name>`. The webhook handler checks if the record was last updated by `"ghl_webhook"` — if not, it's an echo from the app's own push and gets skipped. *(See "Known Gap" in the Troubleshooting section.)*

---

## Step 1: Create the Pipeline (or Verify It Exists)

> **Where:** GHL → Contracting Sub-Account → Opportunities → Pipelines

If the pipeline already exists, skip to verifying the stages. If not:

1. Click **"+ Create Pipeline"**
2. Name it: **`Contracting Pipeline`** (or whatever name is already in use — the app uses the pipeline ID, not the name)
3. Create exactly **8 active stages** in this order:

| # | Stage Name (in GHL) | App Internal Key | Description |
|---|---|---|---|
| 1 | **HIP Broker** | `hip_broker` | Agent signed as HIP Broker |
| 2 | **HIP Career** | `hip_career` | Agent signed as HIP Career |
| 3 | **IAA** | `iaa` | Independent Agent Agreement signed |
| 4 | **In Contracting** | `in_contracting` | Contracting paperwork in process |
| 5 | **Waiting for Numbers** | `waiting_for_numbers` | Submitted, waiting for writing numbers |
| 6 | **RTS** | `rts` | Ready to Sell — numbers received, can write business |
| 7 | **Actively Selling** | `actively_selling` | Agent is actively writing policies |
| 8 | **Terminated** | `terminated` | Agent terminated / contract ended |

> **Legacy stages** (exist in the app's DB but NO LONGER shown as columns): `signed_iaa`, `bill_com`, `crm`, `hip_broker_ready`, `hip_career_ready`. If these exist as GHL stages from an older setup, leave them — the app maps them to the appropriate active column automatically. Do NOT create them as new stages.

4. Click **Save**.
5. Copy the **Pipeline ID** from the URL.
6. For each stage, copy the **Stage ID** — you'll need these for the stage map table. (Click a stage → the ID is in the URL or available via the GHL API.)

---

## Step 2: Record the Stage IDs in the App Database

> **Where:** Portal Supabase (`akhojh`) → Table `agent_pipeline_stage_map`

The app uses a database-driven stage map (not hardcoded) to translate between GHL stage IDs and internal stage keys. This table must be populated for sync to work.

For each of the 8 active stages, insert or update a row:

| `internal_stage` | `ghl_stage_name` | `ghl_stage_id` |
|---|---|---|
| `hip_broker` | `HIP Broker` | *(paste the GHL stage ID)* |
| `hip_career` | `HIP Career` | *(paste the GHL stage ID)* |
| `iaa` | `IAA` | *(paste the GHL stage ID)* |
| `in_contracting` | `In Contracting` | *(paste the GHL stage ID)* |
| `waiting_for_numbers` | `Waiting for Numbers` | *(paste the GHL stage ID)* |
| `rts` | `RTS` | *(paste the GHL stage ID)* |
| `actively_selling` | `Actively Selling` | *(paste the GHL stage ID)* |
| `terminated` | `Terminated` | *(paste the GHL stage ID)* |

> **Auto-learn shortcut:** If you leave `ghl_stage_id` empty but populate `ghl_stage_name`, the webhook handler will auto-learn the stage ID from the first incoming webhook that includes that stage name. But this means the *first* webhook for each stage won't map correctly — populating upfront is recommended.

---

## Step 3: Configure the GHL Connection

> **Where:** Portal Supabase (`akhojh`) → Table `agent_pipeline_ghl_config`

This table holds the connection credentials. Insert one row:

| Column | Value | Notes |
|---|---|---|
| `ghl_api_key` | *(Contracting sub-account API key)* | Must have `opportunities` scope (read + update) |
| `ghl_location_id` | *(Contracting sub-account location ID)* | The location where the pipeline lives |
| `ghl_pipeline_id` | *(Pipeline ID from Step 1)* | The specific pipeline to sync with |
| `connection_status` | `connected` | Set after initial sync confirms working |

> **How to get these values:**
> - **Location ID:** GHL → Settings → Business Profile → the ID in the URL, or Business Info section
> - **API Key:** GHL → Settings → Business Profile → API Keys (or create a Private Integration with `opportunities.readWrite` scope)
> - **Pipeline ID:** From the pipeline URL in Step 1

---

## Step 4: Create the GHL Workflow — "Webhook on Stage Change"

> **Where:** GHL → Contracting Sub-Account → Automation → Workflows

This workflow fires whenever an opportunity changes stage in the Contracting Pipeline.

### 4a. Create the Workflow

1. Click **"+ Create Workflow"**
2. Name it: **`Contracting Pipeline → FYM App Sync`**
3. Set the trigger:
   - **Trigger type:** `Pipeline Stage Changed`
   - **Pipeline:** Select the Contracting Pipeline
   - **Stage:** Leave blank / "Any stage" — we want ALL stage changes to fire

### 4b. Add the Suppression Tag Check (Loop Prevention)

> **Important:** The contracting pipeline uses a tag-based loop prevention pattern (same as the at-risk pipeline) to reliably prevent echoes.

1. Add a tag that the app will set on every push: **`app | contracting pipeline trigger`**

2. Add an **If/Else** condition as the first action after the trigger:
   - **Condition:** Contact → Tag → **Does Not Contain** → `app | contracting pipeline trigger`
   - **If true (YES branch):** Continue to the webhook (Step 4c)
   - **If false (NO branch):** Remove the tag, then stop.

3. On the **NO branch** (tag IS present — this is an echo from the app):
   - Add action: **Remove Tag** → `app | contracting pipeline trigger`
   - Add action: **Stop**

### 4c. Add the Webhook Action (YES branch only)

1. Add action: **Webhook / Custom Webhook**
2. Configure:
   - **Method:** `POST`
   - **URL:** `https://akhojhncsswyzcnicedt.supabase.co/functions/v1/agent-pipeline-webhook`
   - **Headers:**
     - `Content-Type`: `application/json`
   - **Body (JSON):**
     ```json
     {
       "opportunity_id": "{{opportunity.id}}",
       "contact_id": "{{contact.id}}",
       "pipeline_stage": "{{opportunity.pipeline_stage_name}}",
       "location_id": "{{location.id}}",
       "opportunity": {
         "id": "{{opportunity.id}}",
         "pipelineId": "{{opportunity.pipeline_id}}",
         "pipelineStageId": "{{opportunity.pipeline_stage_id}}",
         "pipelineStageName": "{{opportunity.pipeline_stage_name}}",
         "contactId": "{{contact.id}}",
         "contact": {
           "id": "{{contact.id}}",
           "name": "{{contact.name}}",
           "email": "{{contact.email}}",
           "phone": "{{contact.phone}}"
         },
         "name": "{{opportunity.name}}",
         "locationId": "{{location.id}}"
       }
     }
     ```

   > **Note on merge fields:** Use your GHL version's merge field picker to get the exact syntax. The webhook handler normalizes multiple field name variants — `opportunity_id` or `opportunityId`, `pipeline_stage` or `pipelineStageName`, etc.

3. Click **Save** and **Publish** the workflow.

### 4d. Complete Workflow Diagram

```
TRIGGER: Pipeline Stage Changed (Contracting Pipeline, Any Stage)
  │
  ▼
IF Contact tag DOES NOT contain "app | contracting pipeline trigger"
  │
  ├── YES → POST webhook to FYM App (with opportunity + contact + stage data)
  │           └── END
  │
  └── NO  → Remove tag "app | contracting pipeline trigger"
              └── END
```

---

## Step 5: Run the Initial Sync

> **Where:** FYM App → CRM Command → Agencies (or directly via edge function)

Before enabling two-way sync, you need to pull existing GHL pipeline data into the app (or push app data to GHL, depending on which side has the canonical data).

### Option A: Pull GHL → App (GHL has the data)

This is the most common scenario — the contracting pipeline has been running in GHL and you want to pull all existing opportunities into the app.

1. Trigger the `sync-pipeline-from-ghl` edge function:
   ```
   POST https://akhojhncsswyzcnicedt.supabase.co/functions/v1/sync-pipeline-from-ghl
   Authorization: Bearer <portal_service_key>
   Content-Type: application/json
   ```
   No body needed — it reads the config from `agent_pipeline_ghl_config`.

2. The function will:
   - Fetch all opportunities from the pipeline (paginated, 20 per page)
   - Enrich each with full contact detail (name, email, phone, tags, custom fields)
   - Upsert into `agent_pipeline` (matched by `ghl_opportunity_id`)
   - Only reset `stage_entered_at` on actual stage changes (preserves time-in-stage)
   - Update `connection_status` to `connected` on success

3. Check the response — it reports `synced`, `skipped`, and `total_fetched` counts.

### Option B: Push App → GHL (App has the data)

If agents were already tracked in the app's `agent_pipeline` table and you need to push them to GHL, you'll need to create opportunities in GHL for each. *(This path is less common and may require custom scripting — talk to Diamond.)*

---

## Step 6: Verify the Sync

### Test App → GHL:
1. Open the FYM App → Contracting → Pipeline tab
2. Drag an agent from "IAA" to "In Contracting"
3. In GHL, open the Contracting Pipeline → Confirm the opportunity moved to "In Contracting"
4. Check that the contact now has the tag `app | contracting pipeline trigger`

### Test GHL → App:
1. In GHL, move an opportunity from "In Contracting" to "RTS"
2. Confirm the workflow fired (check workflow execution history)
3. In the FYM App, refresh the Pipeline tab → Confirm the agent moved to "RTS"

### Verify loop prevention:
1. In the App, move an agent to "Actively Selling"
2. In GHL, confirm the opportunity moved AND the suppression tag was added
3. Confirm the workflow fired BUT took the NO branch (tag present → removed, no webhook)
4. In the App, confirm the agent did NOT move back (no echo)

---

## Troubleshooting

| Symptom | Likely Cause | Fix |
|---|---|---|
| App push works locally but GHL doesn't update | Missing or incomplete `agent_pipeline_ghl_config` | Verify `ghl_api_key`, `ghl_location_id`, and `ghl_pipeline_id` are all populated |
| GHL changes don't reach the app | Workflow not published, or webhook URL wrong | Check workflow is published + active. Verify URL points to `akhojh` (portal), not `rcbzag` (app). |
| Stage mapping fails ("Unknown stage name") | Stage name in GHL doesn't match `agent_pipeline_stage_map.ghl_stage_name` | Check the stage map table — names must match exactly (case-sensitive) |
| "No agency mapped to this location" on webhook | `agency_ghl_configs` has no row matching the GHL location ID | Add a row to `agency_ghl_configs` with the contracting sub-account's location ID, OR ensure `agent_pipeline_ghl_config` has the correct `ghl_location_id` |
| Infinite loop | Suppression tag check missing or wrong tag name | Verify the If/Else checks for exactly `app \| contracting pipeline trigger` |
| New opportunities from GHL don't have agency names | Webhook can't resolve agency from location | Ensure `agency_ghl_configs` has a row for this location with `agency_id` linking to `hierarchy_agencies` |
| Stage IDs not populated in stage map | Initial setup skipped Step 2 | Populate `ghl_stage_id` in `agent_pipeline_stage_map`, or trigger one GHL change per stage to auto-learn |

---

## Reference: Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         FYM App                                 │
│                                                                 │
│  Contracting → Pipeline (drag card)                             │
│       │                                                         │
│       ▼                                                         │
│  PipelineBoard.tsx → pushStageChange()                          │
│       │  POST to portal edge function                           │
│       ▼                                                         │
│  push-pipeline-stage (portal edge fn)                           │
│       │  1. Load agent_pipeline record                          │
│       │  2. Load agent_pipeline_ghl_config                      │
│       │  3. Look up ghl_stage_id from agent_pipeline_stage_map  │
│       │  4. Find GHL opportunity (by stored ID or phone match)  │
│       │  5. PUT opportunity → new stage                         │
│       │  6. Add suppression tag to contact                      │
│       │  7. Update agent_pipeline (stage, sync status)          │
│       ▼                                                         │
│  agent_pipeline (update stage + last_updated_by)                │
│  webhook_log (audit entry)                                      │
│                                                                 │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼ GHL API
┌─────────────────────────────────────────────────────────────────┐
│               GHL Contracting Sub-Account                       │
│                                                                 │
│  Contracting Pipeline                                           │
│       │ (stage change triggers workflow)                        │
│       ▼                                                         │
│  Workflow: "Contracting Pipeline → FYM App Sync"                │
│       │                                                         │
│       ├─ IF tag "app | contracting pipeline trigger" NOT present│
│       │       ▼                                                 │
│       │  POST webhook → agent-pipeline-webhook (portal edge fn) │
│       │       │                                                 │
│       │       ▼                                                 │
│       │  agent_pipeline (upsert — matched by ghl_opportunity_id)│
│       │                                                         │
│       └─ ELSE (tag present = echo from app)                     │
│               ▼                                                 │
│          Remove tag → STOP (no webhook)                         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Reference: Bulk Sync (sync-pipeline-from-ghl)

For periodic full reconciliation or initial population, the `sync-pipeline-from-ghl` edge function does a complete pull:

```
POST /functions/v1/sync-pipeline-from-ghl
Authorization: Bearer <service_role_key>

No body required — reads config from agent_pipeline_ghl_config.
```

- Fetches all opportunities from the pipeline (paginated, 20/page, max 1,000)
- Enriches each contact with tags + custom fields (individual API call per contact)
- Upserts into `agent_pipeline` by `ghl_opportunity_id`
- Preserves `stage_entered_at` on unchanged stages
- Paces at 200ms between pages and per-contact enrichment calls (rate limit protection)
- Updates `connection_status` to `connected` on success

> **When to use:** Initial setup, after manual GHL changes, or as a periodic reconciliation. Not needed for day-to-day sync — the webhook handles that in real time.

---

## Key Tables & Files

| Item | Location | Purpose |
|---|---|---|
| `agent_pipeline` | Portal DB (`akhojh`) | One row per agent in the pipeline. Stores `ghl_opportunity_id`, `ghl_contact_id`, `stage`, `last_updated_by`. |
| `agent_pipeline_stage_map` | Portal DB (`akhojh`) | Maps `internal_stage` ↔ `ghl_stage_name` + `ghl_stage_id`. DB-driven, not hardcoded. |
| `agent_pipeline_ghl_config` | Portal DB (`akhojh`) | Single-row config: API key, location ID, pipeline ID, connection status. |
| `webhook_log` | Portal DB (`akhojh`) | Audit trail for push successes/failures. |
| `push-pipeline-stage/index.ts` | `supabase/functions/` (Portal) | App → GHL push handler. |
| `agent-pipeline-webhook/index.ts` | `supabase/functions/` (Portal) | GHL → App webhook receiver. |
| `sync-pipeline-from-ghl/index.ts` | `supabase/functions/` (Portal) | Bulk pull: GHL → App (all opportunities). |
| `src/pages/contracting/pipeline/PipelineBoard.tsx` | FYM App client | Kanban UI — calls `pushStageChange()` on drag. |

---

## Side-by-Side: At-Risk vs. Contracting Pipeline Differences

| Aspect | At-Risk (Workboard) | Contracting |
|---|---|---|
| **GHL account** | Per-agency sub-account | Single contracting sub-account |
| **Pipeline stages** | 8 (policy lifecycle) | 8 active + 5 legacy (agent lifecycle) |
| **App DB** | `rcbzag` (`atrisk_tasks`) | `akhojh` (`agent_pipeline`) |
| **Stage map** | Hardcoded in edge function | DB-driven (`agent_pipeline_stage_map`) |
| **Config table** | `agency_ghl_configs` (per agency) | `agent_pipeline_ghl_config` (single row) |
| **Loop prevention** | Tag-based (`app \| manager pipeline trigger`) | Tag-based (`app \| contracting pipeline trigger`) |
| **Contact matching** | By client name (policy holder) | By phone number or stored `ghl_opportunity_id` |
| **Gate control** | `manager_pipeline_enabled` per agency | `connection_status` on config |
| **Suppression tag** | `app \| manager pipeline trigger` | `app \| contracting pipeline trigger` |
