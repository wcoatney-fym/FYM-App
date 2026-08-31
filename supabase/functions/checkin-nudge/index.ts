// checkin-nudge: 30-min follow-up for agents who haven't responded
// Triggered by cron at 9:30 AM EST weekdays
// Sends one nudge to agents still in q1_sent or pending state

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getTodayET } from "../_shared/date-helpers.ts";

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
    console.error(`Nudge SMS to ${to} failed:`, err);
    return false;
  }
  return true;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const sb = createClient(supabaseUrl, supabaseKey);
    const today = getTodayET();

    // Find agents who haven't responded (still in q1_sent or pending, not yet nudged)
    const { data: pending, error } = await sb
      .from("checkin_responses")
      .select("id, recipient_id, checkin_recipients!inner(first_name, phone)")
      .eq("check_in_date", today)
      .in("conversation_state", ["q1_sent", "pending"])
      .eq("nudge_sent", false);

    if (error) throw error;
    if (!pending?.length) {
      return new Response(
        JSON.stringify({ message: "No agents to nudge", nudged: 0 }),
        { headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    let nudged = 0;

    for (const p of pending) {
      const rec = (p as any).checkin_recipients;

      const ok = await sendSms(
        rec.phone,
        `Hey ${rec.first_name}! Don't forget your daily check-in — are you working today? Reply YES or NO 📋`
      );

      if (ok) {
        await sb
          .from("checkin_responses")
          .update({
            nudge_sent: true,
            conversation_state: "nudged",
          })
          .eq("id", p.id);
        nudged++;
      }

      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    return new Response(
      JSON.stringify({ message: `Nudged ${nudged} agents`, nudged, total: pending.length }),
      { headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (err) {
    console.error("checkin-nudge error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
});
