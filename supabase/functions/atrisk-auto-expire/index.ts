/**
 * atrisk-auto-expire — Auto-expire at-risk tasks to "Lost" after 46 days.
 *
 * Runs daily via pg_cron. Finds all atrisk_tasks where:
 *   - created_at is older than 46 days
 *   - stage is NOT "saved" or "lost" (terminal stages)
 *
 * For each expired task:
 *   1. Updates stage to "lost" in the app DB
 *   2. Logs to atrisk_stage_history (source: "auto_expire")
 *   3. Pushes the stage change to GHL (if the task has GHL IDs)
 *
 * Auth: Service role key via cron, or anon key for manual trigger.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGINS = [
  "https://agency.teamfym.com",
  "https://www.agency.teamfym.com",
  "http://localhost:5173",
  "http://localhost:3000",
  "http://localhost:4173",
];

function CORS_HEADERS(req?: Request | null): Record<string, string> {
  const origin = req?.headers?.get("Origin") || req?.headers?.get("origin");
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Vary"] = "Origin";
  }
  return headers;
}

const EXPIRE_AFTER_DAYS = 46;
const TERMINAL_STAGES = ["saved", "lost"];

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS(undefined), "Content-Type": "application/json" },
  });
}

function getAppClient() {
  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  return createClient(url, key);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS(req) });
  }

  try {
    const app = getAppClient();
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - EXPIRE_AFTER_DAYS);
    const cutoffISO = cutoffDate.toISOString();

    // Find all tasks that should be auto-expired
    const { data: expiredTasks, error: fetchErr } = await app
      .from("atrisk_tasks")
      .select("id, policy_number, agency_id, stage, ghl_contact_id, ghl_opportunity_id, created_at")
      .lt("created_at", cutoffISO)
      .not("stage", "in", `(${TERMINAL_STAGES.join(",")})`);

    if (fetchErr) {
      console.error("Failed to fetch expired tasks:", fetchErr);
      return json({ error: fetchErr.message }, 500);
    }

    if (!expiredTasks || expiredTasks.length === 0) {
      return json({
        success: true,
        expired: 0,
        message: `No tasks older than ${EXPIRE_AFTER_DAYS} days need expiration`,
      });
    }

    const results: Array<{
      id: string;
      policy_number: string;
      from_stage: string;
      ghl_pushed: boolean;
      error?: string;
    }> = [];

    for (const task of expiredTasks) {
      try {
        const oldStage = task.stage;

        // 1. Update the task to "lost"
        const { error: updateErr } = await app
          .from("atrisk_tasks")
          .update({
            stage: "lost",
            status: "lost",
            stage_changed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            resolution: `Auto-expired after ${EXPIRE_AFTER_DAYS} days without being saved`,
          })
          .eq("id", task.id);

        if (updateErr) throw new Error(`DB update failed: ${updateErr.message}`);

        // 2. Log to stage history
        await app.from("atrisk_stage_history").insert({
          task_id: task.id,
          from_stage: oldStage,
          to_stage: "lost",
          source: "auto_expire",
          note: `Auto-expired: ${EXPIRE_AFTER_DAYS} days since flagged at-risk (created ${task.created_at})`,
        });

        // 3. Push to GHL if we have the IDs
        let ghlPushed = false;
        if (task.ghl_opportunity_id && task.agency_id) {
          try {
            const pushUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/atrisk-ghl-push`;
            const pushRes = await fetch(pushUrl, {
              method: "POST",
              headers: {
                Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                policy_number: task.policy_number,
                agency_id: task.agency_id,
                new_stage: "lost",
                task_id: task.id,
                ghl_contact_id: task.ghl_contact_id,
                ghl_opportunity_id: task.ghl_opportunity_id,
              }),
            });
            const pushResult = await pushRes.json();
            ghlPushed = pushResult.success === true && !pushResult.skipped;
          } catch (pushErr: any) {
            console.warn(`GHL push failed for ${task.policy_number}:`, pushErr.message);
          }
        }

        results.push({
          id: task.id,
          policy_number: task.policy_number,
          from_stage: oldStage,
          ghl_pushed: ghlPushed,
        });
      } catch (taskErr: any) {
        results.push({
          id: task.id,
          policy_number: task.policy_number,
          from_stage: task.stage,
          ghl_pushed: false,
          error: taskErr.message,
        });
      }
    }

    const expiredCount = results.filter((r) => !r.error).length;
    const errorCount = results.filter((r) => r.error).length;
    const ghlPushedCount = results.filter((r) => r.ghl_pushed).length;

    console.log(
      `atrisk-auto-expire: ${expiredCount} expired, ${ghlPushedCount} pushed to GHL, ${errorCount} errors`
    );

    return json({
      success: true,
      expired: expiredCount,
      ghl_pushed: ghlPushedCount,
      errors: errorCount,
      cutoff_date: cutoffISO,
      details: results,
    });
  } catch (err: any) {
    console.error("atrisk-auto-expire error:", err);
    return json({ error: "Internal server error" }, 500);
  }
});
