// checkin-send: Sends the daily 9 AM EST check-in SMS to all active recipients
// Triggered by cron (pg_cron or external scheduler)
// Creates checkin_responses records for today and sends Q1 to each agent

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getTodayET, isWeekdayET } from "../_shared/date-helpers.ts";

const ALLOWED_ORIGINS = [
  "https://agency.teamfym.com",
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
    console.error(`SMS to ${to} failed:`, err);
    return false;
  }
  return true;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders(req) });
  }

  try {
    // Skip weekends
    if (!isWeekdayET()) {
      return new Response(
        JSON.stringify({ message: "Weekend — skipping check-in", sent: 0 }),
        { headers: { "Content-Type": "application/json", ...corsHeaders(req) } }
      );
    }

    const sb = createClient(supabaseUrl, supabaseKey);
    const today = getTodayET();

    // Get all active recipients
    const { data: recipients, error: recErr } = await sb
      .from("checkin_recipients")
      .select("id, first_name, phone")
      .eq("active", true);

    if (recErr) throw recErr;
    if (!recipients?.length) {
      return new Response(
        JSON.stringify({ message: "No active recipients", sent: 0 }),
        { headers: { "Content-Type": "application/json", ...corsHeaders(req) } }
      );
    }

    let sent = 0;
    let skipped = 0;

    for (const r of recipients) {
      // Check if response already exists for today (idempotency)
      const { data: existing } = await sb
        .from("checkin_responses")
        .select("id")
        .eq("recipient_id", r.id)
        .eq("check_in_date", today)
        .single();

      if (existing) {
        skipped++;
        continue;
      }

      // Create response record
      const { error: insertErr } = await sb.from("checkin_responses").insert({
        recipient_id: r.id,
        check_in_date: today,
        conversation_state: "q1_sent",
      });

      if (insertErr) {
        console.error(`Failed to create response for ${r.first_name}:`, insertErr);
        continue;
      }

      // Send Q1
      const ok = await sendSms(
        r.phone,
        `Good morning, ${r.first_name}! 📋 Quick daily check-in from FYM — are you working today? Reply YES or NO`
      );

      if (ok) sent++;

      // Small delay to avoid Twilio rate limits (~1 msg/sec is safe)
      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    return new Response(
      JSON.stringify({
        message: `Check-in sent for ${today}`,
        sent,
        skipped,
        total: recipients.length,
      }),
      { headers: { "Content-Type": "application/json", ...corsHeaders(req) } }
    );
  } catch (err) {
    console.error("checkin-send error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders(req) } }
    );
  }
});
