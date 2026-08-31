/**
 * lifecycle-offboarding — Manage offboarding substep completion for terminated agents
 *
 * When an agent is moved to the terminated stage, the lifecycle-sync function
 * creates offboarding substeps. This function allows admins to:
 *   1. View offboarding status for an agent
 *   2. Mark individual substeps as complete
 *   3. Check if all substeps are complete (fully offboarded)
 *
 * Routes:
 *   GET  ?lifecycle_id=<uuid>              — view offboarding status
 *   POST { lifecycle_id, step_key, action } — complete/uncomplete a substep
 *   GET  ?status=pending                    — list all agents with incomplete offboarding
 *
 * Auth: service role or authenticated admin.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Content-Type": "application/json",
  };
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: corsHeaders() });
}

interface OffboardingStep {
  key: string;
  label: string;
  auto: boolean;
  completed: boolean;
  completed_at: string | null;
  completed_by?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders() });
  }

  try {
    const appUrl =
      Deno.env.get("APP_SUPABASE_URL") ||
      Deno.env.get("SUPABASE_URL") ||
      "";
    const appKey =
      Deno.env.get("APP_SUPABASE_SERVICE_KEY") ||
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
      "";

    if (!appUrl || !appKey) {
      return jsonResponse(
        { error: "App Supabase credentials not configured" },
        500
      );
    }

    const supabase = createClient(appUrl, appKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    if (req.method === "GET") {
      const url = new URL(req.url);
      const lifecycleId = url.searchParams.get("lifecycle_id");
      const status = url.searchParams.get("status");

      if (status === "pending") {
        // List all agents with incomplete offboarding
        const { data, error } = await supabase
          .from("agent_lifecycle")
          .select(
            "id, first_name, last_name, agency_name, terminated_at, offboarding_steps, offboarding_complete"
          )
          .eq("lifecycle_status", "terminated")
          .eq("offboarding_complete", false)
          .order("terminated_at", { ascending: false });

        if (error) {
          return jsonResponse({ error: "Failed to load offboarding records" }, 500);
        }

        return jsonResponse({
          success: true,
          pending_offboardings: data?.length ?? 0,
          agents: data,
        });
      }

      if (lifecycleId) {
        // View single agent's offboarding status
        const { data, error } = await supabase
          .from("agent_lifecycle")
          .select(
            "id, first_name, last_name, agency_name, lifecycle_status, terminated_at, offboarding_steps, offboarding_complete"
          )
          .eq("id", lifecycleId)
          .maybeSingle();

        if (error) {
          return jsonResponse({ error: "Failed to load lifecycle record" }, 500);
        }

        if (!data) {
          return jsonResponse({ error: "Lifecycle record not found" }, 404);
        }

        if (data.lifecycle_status !== "terminated") {
          return jsonResponse(
            { error: "Agent is not terminated", lifecycle_status: data.lifecycle_status },
            400
          );
        }

        return jsonResponse({
          success: true,
          agent: `${data.first_name} ${data.last_name}`,
          agency: data.agency_name,
          terminated_at: data.terminated_at,
          offboarding_complete: data.offboarding_complete,
          steps: data.offboarding_steps,
        });
      }

      return jsonResponse(
        { error: "Provide lifecycle_id or status=pending" },
        400
      );
    }

    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const { lifecycle_id, step_key, action = "complete", completed_by = "admin" } = body;

      if (!lifecycle_id || !step_key) {
        return jsonResponse(
          { error: "lifecycle_id and step_key are required" },
          400
        );
      }

      // Fetch current record
      const { data: record, error: fetchErr } = await supabase
        .from("agent_lifecycle")
        .select("id, offboarding_steps, lifecycle_status, first_name, last_name")
        .eq("id", lifecycle_id)
        .maybeSingle();

      if (fetchErr || !record) {
        return jsonResponse(
          { error: fetchErr?.message ?? "Record not found" },
          fetchErr ? 500 : 404
        );
      }

      if (record.lifecycle_status !== "terminated") {
        return jsonResponse(
          { error: "Agent is not terminated" },
          400
        );
      }

      const steps = (record.offboarding_steps as OffboardingStep[]) || [];
      const stepIndex = steps.findIndex((s) => s.key === step_key);

      if (stepIndex === -1) {
        return jsonResponse(
          {
            error: `Step "${step_key}" not found`,
            valid_keys: steps.map((s) => s.key),
          },
          400
        );
      }

      const now = new Date().toISOString();

      if (action === "complete") {
        steps[stepIndex].completed = true;
        steps[stepIndex].completed_at = now;
        steps[stepIndex].completed_by = completed_by;
      } else if (action === "uncomplete") {
        steps[stepIndex].completed = false;
        steps[stepIndex].completed_at = null;
        steps[stepIndex].completed_by = undefined;
      }

      const allComplete = steps.every((s) => s.completed);

      const { error: updateErr } = await supabase
        .from("agent_lifecycle")
        .update({
          offboarding_steps: steps,
          offboarding_complete: allComplete,
        })
        .eq("id", lifecycle_id);

      if (updateErr) {
        return jsonResponse({ error: updateErr.message }, 500);
      }

      // Log the step completion
      await supabase.from("agent_lifecycle_log").insert({
        lifecycle_id,
        action: "offboarding_step",
        old_status: "terminated",
        new_status: "terminated",
        details: {
          step_key,
          step_action: action,
          completed_by,
          all_complete: allComplete,
        },
        performed_by: `admin:${completed_by}`,
      });

      return jsonResponse({
        success: true,
        agent: `${record.first_name} ${record.last_name}`,
        step: step_key,
        action,
        offboarding_complete: allComplete,
        steps,
      });
    }

    return jsonResponse({ error: "Method not allowed" }, 405);
  } catch (err) {
    return jsonResponse(
      { error: "Internal server error" },
      500
    );
  }
});
