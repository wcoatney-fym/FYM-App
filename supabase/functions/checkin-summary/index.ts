// checkin-summary: Sends manager SMS summary ~1 hr after check-in blast
// Triggered by cron at 10 AM EST weekdays
// Sends high-level stats to all active managers
// Manager can reply "MORE" to checkin-webhook for agent-by-agent breakdown

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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

function getTodayEST(): string {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const y = parts.find((p) => p.type === "year")!.value;
  const m = parts.find((p) => p.type === "month")!.value;
  const d = parts.find((p) => p.type === "day")!.value;
  return `${y}-${m}-${d}`;
}

function formatDateFriendly(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const sb = createClient(supabaseUrl, supabaseKey);
    const today = getTodayEST();
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
        { headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Compute stats
    const responded = responses!.filter(
      (r) => r.conversation_state === "complete" || r.conversation_state === "declined"
    );
    const working = responses!.filter((r) => r.is_working === true);
    const notWorking = responses!.filter((r) => r.is_working === false);
    const noResponse = responses!.filter(
      (r) => !["complete", "declined"].includes(r.conversation_state)
    );
    const fourPlusHrs = responses!.filter((r) => r.has_four_plus_hours === true);
    const totalApps = responses!.reduce((sum, r) => sum + (r.app_goal || 0), 0);
    const responseRate = total > 0 ? Math.round((responded.length / total) * 100) : 0;

    // Build summary message
    const summary = [
      `📊 Daily Check-In — ${friendlyDate}`,
      ``,
      `✅ ${working.length} working / ${total} total (${responseRate}% response rate)`,
      `⏰ ${fourPlusHrs.length} planning 4+ hrs talk time`,
      `📝 ${totalApps} total apps committed`,
      `🚫 ${notWorking.length} not working | ${noResponse.length} no response`,
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
        { headers: { "Content-Type": "application/json", ...corsHeaders } }
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
          responded: responded.length,
          working: working.length,
          notWorking: notWorking.length,
          noResponse: noResponse.length,
          fourPlusHrs: fourPlusHrs.length,
          totalApps,
          responseRate,
        },
      }),
      { headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (err) {
    console.error("checkin-summary error:", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
});
