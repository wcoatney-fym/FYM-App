// checkin-summary: Sends manager SMS summary ~1 hr after check-in blast
// Triggered by cron at 10 AM EST weekdays
// Sends high-level stats to all active managers
// Manager can reply "MORE" to checkin-webhook for agent-by-agent breakdown

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getTodayET, formatDateFriendly } from "../_shared/date-helpers.ts";

const ALLOWED_ORIGINS = [
  "https://agency.teamfym.com",
  "https://crm.teamfym.com",
  "https://www.crm.teamfym.com",
  "https://www.agency.teamfym.com",
  "https://crm.teamfym.com",
  "https://www.crm.teamfym.com",
  "http://localhost:5173",
  "http://localhost:3000",
  "http://localhost:4173",
];

function corsHeaders(req?: Request | null): Record<string, string> {
  const origin = req?.headers?.get("Origin") || req?.headers?.get("origin");
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Vary"] = "Origin";
  }
  return headers;
};

const TWILIO_SID = Deno.env.get("TWILIO_SID_SURVEY_NUMBER")!;
const TWILIO_TOKEN = Deno.env.get("TWILIO_SID_SURVEY_NUMBER_TOKEN")!;
const TWILIO_FROM = "+13466342716";

const supabaseUrl = Deno.env.get("APP_SUPABASE_URL")!;
const supabaseKey = Deno.env.get("APP_SUPABASE_SERVICE_KEY")!;

async function sendSms(to: string, body: string): Promise<boolean> {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`;
  const params = new URLSearchParams({ To: to, From: TWILIO_FROM, Body: body });
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: "Basic " + btoa(`${TWILIO_SID}:${TWILIO_TOKEN}`),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });
  if (!resp.ok) {
    const err = await resp.text();
    console.error(`Summary SMS to ${to} failed:`, err);
    return false;
  }
  return true;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders(req) });
  }

  try {
    const sb = createClient(supabaseUrl, supabaseKey);
    const today = getTodayET();
    const friendlyDate = formatDateFriendly(today);

    // Get today's responses
    const { data: responses, error: respErr } = await sb
      .from("checkin_responses")
      .select("*")
      .eq("check_in_date", today);

    if (respErr) throw respErr;

    const total = responses?.length || 0;

    if (total === 0) {
      return new Response(
        JSON.stringify({ message: "No check-in records for today", sent: 0 }),
        { headers: { "Content-Type": "application/json", ...corsHeaders(req) } }
      );
    }

    // Compute stats — mutually exclusive buckets. No double-counting.
    //
    // Buckets:
    //   working    = complete + is_working=true (finished survey, said yes)
    //   notWorking = declined + is_working=false (said no to Q1)
    //   midSurvey  = q2_sent or q3_sent (answered Q1 yes, still in survey)
    //   noResponse = q1_sent, pending, nudged (never answered Q1)
    //
    // "Responded" = working + notWorking + midSurvey (anyone who answered Q1)
    // Invariant: working + notWorking + midSurvey + noResponse === total

    const working = responses!.filter(
      (r) => r.conversation_state === "complete" && r.is_working === true
    );
    const notWorking = responses!.filter(
      (r) => r.conversation_state === "declined" && r.is_working === false
    );
    const midSurvey = responses!.filter(
      (r) => ["q2_sent", "q3_sent"].includes(r.conversation_state)
    );
    const noResponse = responses!.filter(
      (r) => ["q1_sent", "pending", "nudged"].includes(r.conversation_state)
    );

    const responded = working.length + notWorking.length + midSurvey.length;
    const fourPlusHrs = responses!.filter((r) => r.has_four_plus_hours === true);
    const totalApps = responses!.reduce((sum, r) => sum + (r.app_goal || 0), 0);
    const responseRate = total > 0 ? Math.round((responded / total) * 100) : 0;

    // Sanity check: buckets must sum to total
    const bucketSum = working.length + notWorking.length + midSurvey.length + noResponse.length;
    if (bucketSum !== total) {
      console.error(
        `BUCKET MISMATCH: working(${working.length}) + notWorking(${notWorking.length}) + midSurvey(${midSurvey.length}) + noResponse(${noResponse.length}) = ${bucketSum}, total = ${total}`
      );
    }

    // Build summary message
    const midSurveyLine = midSurvey.length > 0
      ? `\n⏳ ${midSurvey.length} responding (mid-survey)`
      : "";
    const summary = [
      `📊 Daily Check-In — ${friendlyDate}`,
      ``,
      `✅ ${working.length} working / ${total} total (${responseRate}% response rate)`,
      `⏰ ${fourPlusHrs.length} planning 4+ hrs talk time`,
      `📝 ${totalApps} total apps committed`,
      `🚫 ${notWorking.length} not working | ${noResponse.length} no response${midSurveyLine}`,
      ``,
      `Reply MORE for agent-by-agent breakdown`,
    ].join("\n");

    // Get active managers
    const { data: managers, error: mgrErr } = await sb
      .from("checkin_managers")
      .select("id, name, phone")
      .eq("active", true);

    if (mgrErr) throw mgrErr;
    if (!managers?.length) {
      return new Response(
        JSON.stringify({ message: "No active managers to notify", sent: 0 }),
        { headers: { "Content-Type": "application/json", ...corsHeaders(req) } }
      );
    }

    let sent = 0;
    for (const mgr of managers) {
      const ok = await sendSms(mgr.phone, summary);
      if (ok) sent++;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    return new Response(
      JSON.stringify({
        message: `Summary sent to ${sent} managers`,
        sent,
        stats: {
          total,
          responded,
          working: working.length,
          notWorking: notWorking.length,
          midSurvey: midSurvey.length,
          noResponse: noResponse.length,
          fourPlusHrs: fourPlusHrs.length,
          totalApps,
          responseRate,
        },
      }),
      { headers: { "Content-Type": "application/json", ...corsHeaders(req) } }
    );
  } catch (err) {
    console.error("checkin-summary error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders(req) } }
    );
  }
});
