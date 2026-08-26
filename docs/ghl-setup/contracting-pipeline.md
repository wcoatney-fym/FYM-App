# GHL Setup Guide: Contracting Pipeline

> **Target GHL account:** Contracting sub-account (one shared account for all agencies)
> **App surface:** Contracting → Pipeline tab (`agency.teamfym.com/contracting`)
> **Edge functions (FYM App `rcbzag`):** `push-contracting-stage` (App → GHL + bulk sync) · `contracting-pipeline-webhook` (GHL → App)
> **Data tables (Portal `akhojh`):** `agent_pipeline`, `agent_pipeline_stage_map`, `agent_pipeline_ghl_config`

---

## Overview

The Contracting Pipeline tracks agents through the contracting lifecycle — from initial agreement through actively selling. **Some team members work from the FYM App, others work from GHL. Both are fully supported — changes in either system sync to the other automatically.**

- **Working from the App:** Drag an agent card between columns in the Pipeline tab → the change pushes to GHL within seconds.
- **Working from GHL:** Move an opportunity between stages in the Contracting Pipeline → a webhook fires and the app updates automatically.

Neither direction is "primary." Use whichever surface fits your workflow — the sync keeps them in lockstep.

**Key difference from the Workboard (At-Risk) pipeline:** The contracting pipeline uses a **single shared GHL sub-account** for all agencies, not per-agency sub-accounts. The config lives in `agent_pipeline_ghl_config` (one row), not `agency_ghl_configs`.

**Loop prevention:** When a change originates in one system, a suppression tag prevents the other system from echoing it back. The tag is added on every outbound push and checked on every inbound webhook — invisible to users, fully automatic. No matter which side initiates the change, the other side receives it exactly once.

---

## Quick Reference — Copy-Paste Values

Everything you need to set up the GHL workflow, in one place:

| Item | Value |
|---|---|
| **GHL Location ID** | `pE2DOS2bdVB3AYlMcQ1a` |
| **Pipeline Name** | `FYM App \| Live Contracting Pipeline` |
| **Pipeline ID** | `sdq6bos3lVqWQYkqfojk` |
| **Suppression Tag** | `app \| contracting pipeline trigger` |
| **Webhook Method** | `POST` |
| **Webhook URL** | `https://rcbzagjyhyrkuwvlrlnf.supabase.co/functions/v1/contracting-pipeline-webhook?secret=a61883268df392dd6fdb1937072d2c86f261c18e310205f53d0db76328659ea9` |
| **Custom Data** | Leave empty (standard data covers everything) |
| **Headers** | `Content-Type` = `application/json` |

---

## Step 1: Create the Pipeline in GHL

> **Where:** GHL → Contracting Sub-Account → Opportunities → Pipelines

The app is the source of truth for stage names. Create the GHL pipeline stages using the exact names below.

If the pipeline already exists, verify the stage names match exactly. If not:

1. Click **"+ Create Pipeline"**
2. Name it: **`Contracting Pipeline`** (or whatever name is already in use — the app uses the pipeline ID, not the name)
3. Create exactly **8 active stages** in this order, using these exact names:

| # | Stage Name | App Internal Key | Description |
|---|---|---|---|
| 1 | **HIP Broker** | `hip_broker` | Agent signed as HIP Broker |
| 2 | **HIP Career** | `hip_career` | Agent signed as HIP Career |
| 3 | **IAA** | `iaa` | Independent Agent Agreement signed |
| 4 | **In Contracting** | `in_contracting` | Contracting paperwork in process |
| 5 | **Waiting for Numbers** | `waiting_for_numbers` | Submitted, waiting for writing numbers |
| 6 | **RTS** | `rts` | Ready to Sell — numbers received, can write business |
| 7 | **Actively Selling** | `actively_selling` | Agent is actively writing policies |
| 8 | **Terminated** | `terminated` | Agent terminated / contract ended |

> **The app is the source of truth for stage names.** Create GHL pipeline stages using the exact names above. The `agent_pipeline_stage_map` table maps these names to GHL stage IDs.

> **Legacy stages** (exist in the app's DB but NO LONGER shown as columns): `signed_iaa`, `bill_com`, `crm`, `hip_broker_ready`, `hip_career_ready`. If these exist as GHL stages from an older setup, leave them — the app maps them to the appropriate active column automatically. Do NOT create them as new stages.

4. Click **Save**.
5. Copy the **Pipeline ID** from the URL.
6. For each stage, copy the **Stage ID** — you'll need these for the stage map table. (Click a stage → the ID is in the URL or available via the GHL API.)

---

## Step 2: Record the Stage IDs in the App Database

> **Where:** Portal Supabase (`akhojh`) → Table `agent_pipeline_stage_map`

The app uses a database-driven stage map (not hardcoded) to translate between GHL stage IDs and internal stage keys. This table must be populated for sync to work in both directions — app users dragging cards AND GHL users moving opportunities both depend on it.

For each of the 8 active stages, insert or update a row:

| `internal_stage` | `ghl_stage_name` | `ghl_stage_id` |
|---|---|---|
| `hip_broker` | `HIP Broker` | *(paste from GHL after creating pipeline)* |
| `hip_career` | `HIP Career` | *(paste from GHL after creating pipeline)* |
| `iaa` | `IAA` | *(paste from GHL after creating pipeline)* |
| `in_contracting` | `In Contracting` | *(paste from GHL after creating pipeline)* |
| `waiting_for_numbers` | `Waiting for Numbers` | *(paste from GHL after creating pipeline)* |
| `rts` | `RTS` | *(paste from GHL after creating pipeline)* |
| `actively_selling` | `Actively Selling` | *(paste from GHL after creating pipeline)* |
| `terminated` | `Terminated` | *(paste from GHL after creating pipeline)* |

> **`ghl_stage_name` must match the GHL stage name exactly.** Since you're creating the GHL pipeline to match the app, use the names from the table in Step 1. After creating the pipeline in GHL, come back here and fill in each `ghl_stage_id`.

> **Auto-learn shortcut:** If you leave `ghl_stage_id` empty but populate `ghl_stage_name`, the webhook handler will auto-learn the stage ID from the first incoming GHL webhook that includes that stage name. But this means the *first* GHL-initiated change for each stage won't map correctly — populating upfront is recommended.

---

## Step 3: Configure the GHL Connection

> **Where:** Portal Supabase (`akhojh`) → Table `agent_pipeline_ghl_config`

This table holds the connection credentials. Both sync directions use this config. Insert one row:

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

This workflow is what makes GHL → App sync work. When someone moves an opportunity in GHL, this workflow fires a webhook to the app. Without it, only App → GHL works — GHL users' changes would be invisible in the app.

### 4a. Create the Workflow

1. Click **"+ Create Workflow"**
2. Name it: **`Contracting Pipeline → FYM App Sync`**
3. Set the trigger:
   - **Trigger type:** `Pipeline Stage Changed`
   - **Pipeline:** Select the Contracting Pipeline
   - **Stage:** Leave blank / "Any stage" — we want ALL stage changes to fire

### 4b. Add the Suppression Tag Check (Loop Prevention)

> **Why this matters:** Without the tag check, when an app user drags a card, the push moves the GHL opportunity, which triggers this workflow, which sends a webhook back, which would move the card again — infinite loop. The tag check stops that. It also works the other direction: when a GHL user moves an opportunity, the tag isn't there (only the app adds it), so the webhook fires normally and the app receives the change.

1. Add a tag that the app will set on every push: **`app | contracting pipeline trigger`**

2. Add an **If/Else** condition as the first action after the trigger:
   - **Condition:** Contact → Tag → **Does Not Contain** → `app | contracting pipeline trigger`
   - **If true (YES branch):** This was a genuine GHL user action → continue to the webhook (Step 4c)
   - **If false (NO branch):** This was an echo from an app user's change → remove the tag, then stop.

3. On the **NO branch** (tag IS present — this is an echo from the app):
   - Add action: **Remove Tag** → `app | contracting pipeline trigger`
   - Add action: **Stop** (or just let the branch end)

   > This cleans up the suppression tag so it's ready for the next app-initiated push. The tag is single-use: added by the app, checked and removed by GHL.

### 4c. Add the Webhook Action (YES branch only)

On the YES branch (tag is NOT present = a GHL user made this change):

1. Add action: **Webhook / Custom Webhook**
2. Configure:
   - **Method:** `POST`
   - **URL — copy this exactly:**
     ```
     https://rcbzagjyhyrkuwvlrlnf.supabase.co/functions/v1/contracting-pipeline-webhook?secret=a61883268df392dd6fdb1937072d2c86f261c18e310205f53d0db76328659ea9
     ```
     - **Important:** Paste the full URL including `https://`. GHL will show "Please enter a valid URL" if the protocol is missing.
     - The `?secret=...` query parameter is the webhook authentication. It must be part of the URL.
   - **Custom Data:** Leave empty — do NOT add any key-value pairs here. GHL's standard data payload automatically includes the opportunity ID, contact ID, pipeline stage, and location ID. The webhook handler reads all of these from the standard payload.
   - **Headers:**
     - `Content-Type`: `application/json` *(should already be there by default)*
   - **Test Mode / Send Test:** If GHL offers a "Send Test" button, click it — but don't expect a meaningful response unless there's a real opportunity in the pipeline. The important test is Step 6.

   > **No JSON body needed.** GHL's Webhook action doesn't have a raw JSON body editor — it sends "standard data" (contact + opportunity fields) automatically with every webhook. The handler normalizes all GHL field name variants (`opportunity_id`/`opportunityId`, `pipeline_stage`/`pipelineStageName`, etc.), so the standard payload is all it needs.

3. Click **Save Action** (the button at the bottom of the webhook config panel).
4. Make sure the workflow is **Published** (toggle at the top right of the workflow builder). Unpublished workflows won't fire.

### 4d. Complete Workflow Diagram

```
TRIGGER: Pipeline Stage Changed (Contracting Pipeline, Any Stage)
  |
  v
IF Contact tag DOES NOT contain "app | contracting pipeline trigger"
  |
  |-- YES (GHL user made this change)
  |       v
  |   POST webhook to FYM App (with opportunity + contact + stage data)
  |       --> App pipeline view updates on next refresh
  |
  |-- NO (echo from an app user's change)
          v
      Remove tag "app | contracting pipeline trigger"
          --> STOP (no webhook, no echo)
```

---

## Step 5: Run the Initial Sync

> **Where:** FYM App → CRM Command → Agencies (or directly via edge function)

Before two-way sync is live, you need to align the data between GHL and the app. Choose the direction based on where the data currently lives.

### Option A: Pull GHL → App (GHL has the data)

Use this if the contracting pipeline has been running in GHL and you want to pull all existing opportunities into the app.

1. Trigger the `push-contracting-stage` edge function with the `sync` action:
   ```
   POST https://rcbzagjyhyrkuwvlrlnf.supabase.co/functions/v1/push-contracting-stage
   Authorization: Bearer <app_anon_key>
   Content-Type: application/json
   Body: { "action": "sync" }
   ```
   It reads the GHL config from `agent_pipeline_ghl_config` in the portal DB.

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

Run all three tests. Both directions must work — some team members will only ever use the app, others will only ever use GHL.

### Test 1: Someone works from the App (App → GHL)
1. Open the FYM App → Contracting → Pipeline tab
2. Drag an agent from "IAA" to "In Contracting"
3. In GHL, open the Contracting Pipeline → Confirm the opportunity moved to "In Contracting"
4. Check that the contact now has the tag `app | contracting pipeline trigger`
5. Confirm the GHL workflow fired, hit the NO branch (tag present), removed the tag, and stopped — no webhook sent back

### Test 2: Someone works from GHL (GHL → App)
1. In GHL, move an opportunity from "In Contracting" to "RTS"
2. Confirm the workflow fired, hit the YES branch (no tag), and sent the webhook
3. In the FYM App, refresh the Pipeline tab → Confirm the agent moved to "RTS"

### Test 3: No echoes in either direction
1. After Test 1: confirm the agent did NOT move back in the app (no echo from GHL)
2. After Test 2: confirm the opportunity did NOT move back in GHL (no echo from the app)
3. Both systems should show the same stage with no bouncing

---

## Troubleshooting

| Symptom | Likely Cause | Fix |
|---|---|---|
| App user drags a card, GHL doesn't update | Missing or incomplete `agent_pipeline_ghl_config` | Verify `ghl_api_key`, `ghl_location_id`, and `ghl_pipeline_id` are all populated |
| GHL user moves an opportunity, app doesn't update | Workflow not published, or webhook URL wrong | Check workflow is published + active. Verify URL points to `rcbzag` (FYM App). |
| Stage mapping fails ("Unknown stage name") | Stage name in GHL doesn't match `agent_pipeline_stage_map.ghl_stage_name` | Check the stage map table — names must match the app exactly (case-sensitive) |
| "No agency mapped to this location" on webhook | `agency_ghl_configs` has no row matching the GHL location ID | Add a row to `agency_ghl_configs` with the contracting sub-account's location ID, OR ensure `agent_pipeline_ghl_config` has the correct `ghl_location_id` |
| Infinite loop (stages bouncing back and forth) | Suppression tag check missing or wrong tag name | Verify the If/Else checks for exactly `app \| contracting pipeline trigger` |
| New opportunities from GHL don't have agency names | Webhook can't resolve agency from location | Ensure `agency_ghl_configs` has a row for this location with `agency_id` linking to `hierarchy_agencies` |
| Stage IDs not populated in stage map | Initial setup skipped Step 2 | Populate `ghl_stage_id` in `agent_pipeline_stage_map`, or trigger one GHL change per stage to auto-learn |
| App user's change doesn't appear in GHL but no error | Opportunity not found in GHL | The app matches by phone number or stored `ghl_opportunity_id`. The contact/opportunity must exist in GHL first. Run a bulk sync (Option A) to link existing records. |
| GHL user's change doesn't appear in the app | Webhook fired but stage name didn't map | Check GHL workflow execution history → verify the webhook body includes `pipeline_stage_name`. Then check `agent_pipeline_stage_map` has a matching `ghl_stage_name`. |

---

## Reference: Data Flow

Both directions are fully independent. A user in either system triggers a one-way push to the other.

### When someone works from the App:
```
App user drags card in Pipeline tab
  --> PipelineBoard.tsx calls pushStageChange()
  --> push-contracting-stage edge function (FYM App)
      1. Updates agent_pipeline in portal DB
      2. Pushes stage change to GHL via API
      3. Adds suppression tag to GHL contact
  --> GHL pipeline updates
  --> GHL workflow fires, sees tag --> removes tag, STOPS
  --> No echo back to app
```

### When someone works from GHL:
```
GHL user moves opportunity in Contracting Pipeline
  --> GHL workflow fires
  --> No suppression tag found --> sends webhook
  --> contracting-pipeline-webhook edge function (FYM App)
      1. Maps GHL stage name to internal stage
      2. Upserts agent_pipeline in portal DB
  --> App pipeline view updates on next refresh
  --> No echo back to GHL (webhook sets last_updated_by = 'ghl_webhook')
```

---

## Reference: Bulk Sync (push-contracting-stage?action=sync)

For periodic full reconciliation or initial population, the `push-contracting-stage` edge function's `sync` action does a complete pull from GHL:

```
POST /functions/v1/push-contracting-stage
Authorization: Bearer <app_anon_key>
Content-Type: application/json
Body: { "action": "sync" }
```

- Fetches all opportunities from the pipeline (paginated, 20/page, max 1,000)
- Enriches each contact with tags + custom fields (individual API call per contact)
- Upserts into `agent_pipeline` by `ghl_opportunity_id`
- Preserves `stage_entered_at` on unchanged stages
- Paces at 200ms between pages and per-contact enrichment calls (rate limit protection)
- Updates `connection_status` to `connected` on success

> **When to use:** Initial setup, after bulk manual changes in GHL, or as a periodic reconciliation. Not needed for day-to-day sync — the workflow + webhook handles real-time sync for both app and GHL users automatically.

---

## Key Tables & Files

| Item | Location | Purpose |
|---|---|---|
| `agent_pipeline` | Portal DB (`akhojh`) | One row per agent in the pipeline. Stores `ghl_opportunity_id`, `ghl_contact_id`, `stage`, `last_updated_by`. |
| `agent_pipeline_stage_map` | Portal DB (`akhojh`) | Maps `internal_stage` ↔ `ghl_stage_name` + `ghl_stage_id`. DB-driven, not hardcoded. Used by both sync directions. |
| `agent_pipeline_ghl_config` | Portal DB (`akhojh`) | Single-row config: API key, location ID, pipeline ID, connection status. Used by both sync directions. |
| `webhook_log` | Portal DB (`akhojh`) | Audit trail for push successes/failures (App → GHL direction). |
| `push-contracting-stage/index.ts` | `supabase/functions/` (FYM App) | App → GHL push + bulk sync handler. |
| `contracting-pipeline-webhook/index.ts` | `supabase/functions/` (FYM App) | GHL → App webhook receiver. |
| `src/pages/contracting/pipeline/PipelineBoard.tsx` | FYM App client | Kanban UI — calls `pushStageChange()` on drag. |

---

## Side-by-Side: At-Risk vs. Contracting Pipeline Differences

| Aspect | At-Risk (Workboard) | Contracting |
|---|---|---|
| **GHL account** | Per-agency sub-account | Single contracting sub-account |
| **Pipeline stages** | 8 (policy lifecycle) | 8 active + 5 legacy (agent lifecycle) |
| **Who uses the app** | Managers reviewing at-risk policies | Admins tracking agent contracting |
| **Who uses GHL** | Agency managers who prefer GHL | Contracting team members who prefer GHL |
| **App DB** | `rcbzag` (`atrisk_tasks`) | `akhojh` (`agent_pipeline`) |
| **Stage map** | Hardcoded in edge function | DB-driven (`agent_pipeline_stage_map`) |
| **Config table** | `agency_ghl_configs` (per agency) | `agent_pipeline_ghl_config` (single row) |
| **Loop prevention** | Tag-based (`app \| manager pipeline trigger`) | Tag-based (`app \| contracting pipeline trigger`) |
| **Contact matching** | By client name (policy holder) | By phone number or stored `ghl_opportunity_id` |
| **Gate control** | `manager_pipeline_enabled` per agency | `connection_status` on config |
