# GHL Setup Guide: Workboard (At-Risk Pipeline)

> **Target GHL account:** FYM Agency sub-account (per agency)
> **App surface:** Workboard → Pipeline view (`agency.teamfym.com/workboard`)
> **Edge functions:** `atrisk-ghl-push` (App → GHL) · `atrisk-ghl-webhook` (GHL → App)
> **DB:** FYM App (`rcbzag`) — `atrisk_tasks`, `atrisk_stage_history`

---

## Overview

The Workboard tracks at-risk policies (policies where premiums failed to draft). When a manager drags a card between stages in the app, that stage change pushes to GHL. When someone moves an opportunity in GHL, a webhook fires back to the app.

**Loop prevention:** The app adds a suppression tag to the GHL contact after every push. A GHL workflow checks for that tag before firing the webhook — if the tag is present, GHL drops the event (it was the app's own push echoing back).

---

## Step 1: Create the Pipeline

> **Where:** GHL → Sub-Account → Opportunities → Pipelines

1. Click **"+ Create Pipeline"**
2. Name it: **`At-Risk Pipeline`**
   - The app also recognizes: `Manager Pipeline`, `Ancillary | At Risk Pipeline`, or anything containing "at risk" or "at-risk" (case-insensitive). If this pipeline already exists under any of those names, skip creation — just verify the stages below.
3. Create exactly **8 stages** in this order:

| # | Stage Name | App Internal Key | Description |
|---|---|---|---|
| 1 | **New** | `new` | Policy just flagged at-risk. No outreach yet. |
| 2 | **Responded** | `responded` | Manager or client has responded to outreach. |
| 3 | **Manager** | `manager_outreach` | Manager is actively working the case. |
| 4 | **Agent** | `agent_outreach` | Escalated to the writing agent for direct contact. |
| 5 | **Code Red** | `code_red` | 30+ days past due. Highest urgency. |
| 6 | **Pending** | `agent_saved_pending` | Agent reports the client intends to pay / is in process. |
| 7 | **Saved** | `saved` | Policy saved — premium drafted successfully. |
| 8 | **Lost** | `lost` | Policy terminated / client declined. |

4. Click **Save**.
5. Copy the **Pipeline ID** — you'll need it for the webhook workflow. (Click the pipeline name → the ID is in the URL: `/opportunities/pipeline/{PIPELINE_ID}`)

> **Important:** Stage names must match exactly (case-insensitive). The app uses these names to map between GHL stage IDs and internal stage keys. If a stage is named differently, the sync will skip it.

---

## Step 2: Create the Suppression Tag

> **Where:** GHL → Sub-Account → Settings → Tags (or create it inline in Step 3)

The suppression tag prevents infinite loops. When the app pushes a stage change to GHL, it also adds this tag to the contact. The GHL workflow checks for it before firing the webhook back.

- **Tag name:** `app | manager pipeline trigger`
  - Must be exactly this string (lowercase, with pipes and spaces).
  - You can create it now in Settings → Tags, or let GHL auto-create it when the app first adds it to a contact.

---

## Step 3: Create the GHL Workflow — "Webhook on Stage Change"

> **Where:** GHL → Sub-Account → Automation → Workflows

This workflow fires whenever an opportunity changes stage in the At-Risk Pipeline, BUT only if the change was made in GHL (not echoed from the app).

### 3a. Create the Workflow

1. Click **"+ Create Workflow"**
2. Name it: **`At-Risk Pipeline → FYM App Sync`**
3. Set the trigger:
   - **Trigger type:** `Pipeline Stage Changed`
   - **Pipeline:** Select **At-Risk Pipeline** (the one you created in Step 1)
   - **Stage:** Leave blank / "Any stage" — we want ALL stage changes to fire

### 3b. Add the Tag Check (Loop Prevention)

This is the critical step. Without it, every app push echoes back infinitely.

1. Add an **If/Else** condition as the first action after the trigger:
   - **Condition:** Contact → Tag → **Does Not Contain** → `app | manager pipeline trigger`
   - **If true (YES branch):** Continue to the webhook step (Step 3c)
   - **If false (NO branch):** Remove the tag, then stop.

2. On the **NO branch** (tag IS present):
   - Add action: **Remove Tag** → `app | manager pipeline trigger`
   - Add action: **Stop** (or just let the branch end)

   > This cleans up the suppression tag so it's ready for the next app push. The tag is single-use: added by the app, checked and removed by GHL.

### 3c. Add the Webhook Action (YES branch only)

On the YES branch (tag is NOT present = this was a genuine GHL change):

1. Add action: **Webhook / Custom Webhook**
2. Configure:
   - **Method:** `POST`
   - **URL:** `https://rcbzagjyhyrkuwvlrlnf.supabase.co/functions/v1/atrisk-ghl-webhook`
   - **Query parameters:**
     - `secret` = *(the GHL_WEBHOOK_SECRET value — get this from Diamond/Will)*
     - `agency_id` = *(the FYM App agency UUID for this sub-account — get this from the Agency GHL Settings tab in the app)*
   - **Headers:**
     - `Content-Type`: `application/json`
   - **Body (JSON):**
     ```json
     {
       "opportunity_id": "{{opportunity.id}}",
       "contact_id": "{{contact.id}}",
       "pipeline_stage": "{{opportunity.pipeline_stage_name}}",
       "location_id": "{{location.id}}"
     }
     ```

   > **Merge field names:** The exact GHL merge field syntax may vary. Common variants:
   > - `{{opportunity.id}}` or `{{opportunity_id}}`
   > - `{{contact.id}}` or `{{contact_id}}`
   > - `{{opportunity.pipeline_stage_name}}` or `{{opportunity.stageName}}`
   > - `{{location.id}}` or `{{location_id}}`
   >
   > Use whatever your GHL version shows in the merge field picker. The webhook handler accepts all common field name variants.

3. Click **Save** and **Publish** the workflow.

### 3d. Complete Workflow Diagram

```
TRIGGER: Pipeline Stage Changed (At-Risk Pipeline, Any Stage)
  │
  ▼
IF Contact tag DOES NOT contain "app | manager pipeline trigger"
  │
  ├── YES → POST webhook to FYM App (with opportunity + contact + stage data)
  │           └── END
  │
  └── NO  → Remove tag "app | manager pipeline trigger"
              └── END
```

---

## Step 4: Connect the Agency in the FYM App

> **Where:** FYM App → CRM Command → Agencies → [Select Agency] → GHL Settings tab

1. Enter the agency's **GHL API Key** and **Location ID**
2. Click **Save & Test Connection**
3. If the connection test passes, a **Pipeline Sync Direction** task is auto-created in CRM Command → Tasks
4. Open the task → Review the detected sync direction (App → GHL or GHL → App)
5. Click **Confirm & Sync** to execute the initial sync and enable two-way sync

> **After this point, sync is live.** Every stage drag in the Workboard pushes to GHL, and every stage change in GHL pushes back to the app.

---

## Step 5: Verify the Sync

### Test App → GHL:
1. Open the Workboard in the FYM App
2. Drag a card from "New" to "Responded"
3. In GHL, open the At-Risk Pipeline → Confirm the opportunity moved to "Responded"
4. Check that the contact now has the tag `app | manager pipeline trigger`

### Test GHL → App:
1. In GHL, move an opportunity from "Responded" to "Manager"
2. Confirm the workflow fired (check workflow execution history)
3. In the FYM App Workboard, refresh → Confirm the card moved to "Manager"

### Verify loop prevention:
1. In the App, move a card to "Agent"
2. In GHL, confirm the opportunity moved AND the suppression tag was added
3. Confirm the workflow fired BUT took the NO branch (tag was present → removed tag, no webhook sent)
4. In the App, confirm the card did NOT move back (no echo)

---

## Troubleshooting

| Symptom | Likely Cause | Fix |
|---|---|---|
| App push works, GHL doesn't update | API key lacks opportunities scope | Use a CRM Ops API key with full scope (Diamond has fallback keys for FYM, Wisechoice, Aspire, MHA, 360) |
| GHL changes don't reach the app | Workflow not published, or webhook URL wrong | Check workflow is published + active. Verify the webhook URL and secret. |
| Infinite loop (cards bouncing back and forth) | Tag check missing or wrong tag name | Verify the If/Else condition checks for exactly `app \| manager pipeline trigger` |
| "No GHL contact found" on push | Contact doesn't exist in GHL yet | The app matches by client name. Contact must exist in GHL first (created by lifecycle push or manually). |
| Stage shows "skipped: unknown stage" in webhook logs | GHL stage name doesn't match the 8-stage map | Verify stage names match exactly: New, Responded, Manager, Agent, Code Red, Pending, Saved, Lost |
| "Manager pipeline not yet enabled" | CRM team hasn't confirmed sync direction | Complete the Pipeline Sync Direction task in CRM Command |

---

## Reference: Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         FYM App                                 │
│                                                                 │
│  Workboard (drag card)                                          │
│       │                                                         │
│       ▼                                                         │
│  ghl-push.ts (client)                                           │
│       │  fire-and-forget                                        │
│       ▼                                                         │
│  atrisk-ghl-push (edge fn)                                      │
│       │  1. Check agency GHL config                             │
│       │  2. Check manager_pipeline_enabled gate                 │
│       │  3. Move opportunity via GHL API                        │
│       │  4. Add suppression tag to contact                      │
│       ▼                                                         │
│  atrisk_tasks (update stage)                                    │
│  atrisk_stage_history (log, source='app')                       │
│                                                                 │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼ GHL API
┌─────────────────────────────────────────────────────────────────┐
│                    GHL Sub-Account                              │
│                                                                 │
│  At-Risk Pipeline                                               │
│       │ (stage change triggers workflow)                        │
│       ▼                                                         │
│  Workflow: "At-Risk Pipeline → FYM App Sync"                    │
│       │                                                         │
│       ├─ IF tag "app | manager pipeline trigger" NOT present    │
│       │       ▼                                                 │
│       │  POST webhook → atrisk-ghl-webhook (edge fn)            │
│       │       │                                                 │
│       │       ▼                                                 │
│       │  atrisk_tasks (update stage)                            │
│       │  atrisk_stage_history (log, source='ghl')               │
│       │                                                         │
│       └─ ELSE (tag present = echo from app)                     │
│               ▼                                                 │
│          Remove tag → STOP (no webhook)                         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Key Tables & Files

| Item | Location | Purpose |
|---|---|---|
| `atrisk_tasks` | FYM App DB (`rcbzag`) | One row per at-risk policy. Stores `ghl_contact_id`, `ghl_opportunity_id`, `stage`. |
| `atrisk_stage_history` | FYM App DB (`rcbzag`) | Audit log. `source` column = `'app'` or `'ghl'` — used for loop prevention on the app side. |
| `agency_ghl_configs` | Portal DB (`akhojh`) | Per-agency GHL API keys, location IDs, `manager_pipeline_enabled` gate. |
| `atrisk-ghl-push/index.ts` | `supabase/functions/` (FYM App) | App → GHL push handler. Also handles seed, import, direction detection, sync tasks. |
| `atrisk-ghl-webhook/index.ts` | `supabase/functions/` (FYM App) | GHL → App webhook receiver. |
| `src/lib/ghl-push.ts` | FYM App client | Client-side fire-and-forget push helper. |
