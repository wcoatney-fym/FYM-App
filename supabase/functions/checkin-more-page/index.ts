// checkin-more-page: Generates short-code links and serves check-in data for the hosted MORE page.
//
// Two modes:
//   POST /checkin-more-page  { action: "generate", manager_id, date }
//     → Creates a short code in `checkin_more_tokens`, returns { url, code }.
//     → Called by checkin-webhook when a manager texts MORE.
//
//   GET /checkin-more-page?c=<short-code>
//     → Validates the code (not expired), returns the full check-in data as JSON.
//     → Called by the React page.
//
// Short codes: 8-char alphanumeric, stored in `checkin_more_tokens` table.
// Expiry: 8 hours from generation.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getTodayET } from "../_shared/date-helpers.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const supabaseUrl = Deno.env.get("APP_SUPABASE_URL")!;
const supabaseKey = Deno.env.get("APP_SUPABASE_SERVICE_KEY")!;
const APP_URL = Deno.env.get("APP_PUBLIC_URL") || "https://agency.teamfym.com";

// Token expiry: 8 hours
const TOKEN_EXPIRY_HOURS = 8;

// --- Helpers ---

function generateCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let code = "";
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  for (const b of bytes) {
    code += chars[b % chars.length];
  }
  return code;
}

// --- Handlers ---

async function handleGenerate(body: { manager_id: string; date?: string }): Promise<Response> {
  const sb = createClient(supabaseUrl, supabaseKey);
  const date = body.date || getTodayET();
  const code = generateCode();
  const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_HOURS * 60 * 60 * 1000).toISOString();

  // Check if a valid (non-expired) code already exists for this manager + date
  const { data: existing } = await sb
    .from("checkin_more_tokens")
    .select("code, expires_at")
    .eq("manager_id", body.manager_id)
    .eq("check_in_date", date)
    .gt("expires_at", new Date().toISOString())
    .limit(1)
    .single();

  if (existing) {
    // Reuse existing valid code
    const url = `${APP_URL}/checkin/more?c=${existing.code}`;
    return new Response(JSON.stringify({ url, code: existing.code }), {
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  // Insert new code
  const { error } = await sb.from("checkin_more_tokens").insert({
    code,
    manager_id: body.manager_id,
    check_in_date: date,
    expires_at: expiresAt,
  });

  if (error) {
    console.error("Failed to create token:", error);
    return new Response(JSON.stringify({ error: "Failed to generate link" }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  const url = `${APP_URL}/checkin/more?c=${code}`;
  return new Response(JSON.stringify({ url, code }), {
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

async function handleData(code: string): Promise<Response> {
  const sb = createClient(supabaseUrl, supabaseKey);

  // Look up the code
  const { data: token, error: tokenErr } = await sb
    .from("checkin_more_tokens")
    .select("*")
    .eq("code", code)
    .single();

  if (tokenErr || !token) {
    return new Response(
      JSON.stringify({ error: "Invalid link. Text MORE for a new one." }),
      { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }

  // Check expiry
  if (new Date(token.expires_at) < new Date()) {
    return new Response(
      JSON.stringify({ error: "Link expired. Text MORE for a new one." }),
      { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }

  const date = token.check_in_date;

  // Fetch all responses for the date
  const { data: responses, error: respErr } = await sb
    .from("checkin_responses")
    .select("*, checkin_recipients!inner(first_name, last_name)")
    .eq("check_in_date", date);

  if (respErr) {
    return new Response(
      JSON.stringify({ error: "Failed to fetch data" }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }

  const rows = (responses || []).map((r: any) => ({
    id: r.id,
    first_name: r.checkin_recipients.first_name,
    last_name: r.checkin_recipients.last_name,
    conversation_state: r.conversation_state,
    is_working: r.is_working,
    has_four_plus_hours: r.has_four_plus_hours,
    app_goal: r.app_goal,
    responded_at: r.responded_at,
    nudge_sent: r.nudge_sent,
  }));

  // Sort: responded first (complete→declined→mid-survey), then no response.
  // Within each group, alphabetical by last_name, first_name.
  const stateOrder: Record<string, number> = {
    complete: 0,
    declined: 1,
    q3_sent: 2,
    q2_sent: 3,
    nudged: 4,
    q1_sent: 5,
    pending: 6,
  };

  rows.sort((a: any, b: any) => {
    const sa = stateOrder[a.conversation_state] ?? 9;
    const sb2 = stateOrder[b.conversation_state] ?? 9;
    if (sa !== sb2) return sa - sb2;
    const nameA = `${a.last_name} ${a.first_name}`.toLowerCase();
    const nameB = `${b.last_name} ${b.first_name}`.toLowerCase();
    return nameA.localeCompare(nameB);
  });

  // Compute summary stats (mutually exclusive buckets)
  const total = rows.length;
  const working = rows.filter((r: any) => r.conversation_state === "complete" && r.is_working === true).length;
  const notWorking = rows.filter((r: any) => r.conversation_state === "declined" && r.is_working === false).length;
  const midSurvey = rows.filter((r: any) => ["q2_sent", "q3_sent"].includes(r.conversation_state)).length;
  const noResponse = rows.filter((r: any) => ["q1_sent", "pending", "nudged"].includes(r.conversation_state)).length;
  const responded = working + notWorking + midSurvey;
  const fourPlusHrs = rows.filter((r: any) => r.has_four_plus_hours === true).length;
  const totalApps = rows.reduce((sum: number, r: any) => sum + (r.app_goal || 0), 0);
  const responseRate = total > 0 ? Math.round((responded / total) * 100) : 0;

  return new Response(
    JSON.stringify({
      date,
      stats: { total, working, notWorking, midSurvey, noResponse, responded, fourPlusHrs, totalApps, responseRate },
      agents: rows,
    }),
    { headers: { "Content-Type": "application/json", ...corsHeaders } }
  );
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // POST = generate short code (called by checkin-webhook)
    if (req.method === "POST") {
      const body = await req.json();
      if (body.action === "generate") {
        return handleGenerate(body);
      }
      return new Response(JSON.stringify({ error: "Unknown action" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // GET = serve data (called by React page)
    const url = new URL(req.url);
    const code = url.searchParams.get("c");
    if (!code) {
      return new Response(JSON.stringify({ error: "Missing code" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }
    return handleData(code);
  } catch (err) {
    console.error("checkin-more-page error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});
