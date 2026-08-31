// checkin-webhook: Twilio inbound SMS handler for daily agent check-in
// Handles the conversational SMS flow: Q1 → Q2 → Q3 → quote
// Also handles manager "MORE" replies for detailed breakdown

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getTodayET } from "../_shared/date-helpers.ts";

const ALLOWED_ORIGINS = [
  "https://agency.teamfym.com",
  "https://www.agency.teamfym.com",
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

const FALLBACK_REPLY =
  "Hey! This number is for FYM's daily check-in survey only. " +
  "For questions or support, reach out to Bianca Bill at bbill@teamfym.com — " +
  "she'll get you to the right person.";

const MANAGER_NON_MORE_REPLY =
  "This is FYM's daily check-in line. Reply MORE for the agent-by-agent breakdown.";

function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return `+${digits}`;
}

function parseYesNo(body: string): boolean | null {
  const b = body.trim().toLowerCase();
  if (["yes", "y", "yeah", "yep", "yea", "si", "yup"].includes(b)) return true;
  if (["no", "n", "nah", "nope"].includes(b)) return false;
  return null;
}

function parseAppGoal(body: string): number | null {
  const b = body.trim().replace("+", "");
  const n = parseInt(b, 10);
  if (n >= 1 && n <= 5) return n;
  if (body.trim() === "5+") return 5;
  return null;
}

async function sendSms(to: string, body: string): Promise<void> {
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
    console.error("Twilio send failed:", err);
  }
}

async function getRandomQuote(sb: ReturnType<typeof createClient>): Promise<{ quote_text: string; attribution: string | null; id: string } | null> {
  // Get a quote that hasn't been used recently (or least recently used)
  const { data, error } = await sb
    .from("checkin_quotes")
    .select("id, quote_text, attribution")
    .eq("active", true)
    .order("last_used_at", { ascending: true, nullsFirst: true })
    .limit(5);

  if (error || !data?.length) return null;

  // Pick randomly from the 5 least-recently-used
  const pick = data[Math.floor(Math.random() * data.length)];

  // Mark as used
  await sb.from("checkin_quotes").update({ last_used_at: new Date().toISOString() }).eq("id", pick.id);

  return pick;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders(req) });
  }

  try {
    const sb = createClient(supabaseUrl, supabaseKey);

    // Parse Twilio webhook body (application/x-www-form-urlencoded)
    const formData = await req.formData();
    const from = formData.get("From") as string;
    const body = (formData.get("Body") as string || "").trim();
    const incomingPhone = normalizePhone(from);
    const today = getTodayET(); // Fixed: was UTC, now America/New_York

    console.log(`Inbound SMS from ***${incomingPhone.slice(-4)}: "${body}"`);

    // Check if this is a manager replying "MORE"
    const { data: manager } = await sb
      .from("checkin_managers")
      .select("id, name")
      .eq("phone", incomingPhone)
      .eq("active", true)
      .single();

    if (manager && body.toLowerCase() !== "more") {
      // Manager texted something other than MORE — short helpful reply, NOT Bianca redirect
      await sendSms(incomingPhone, MANAGER_NON_MORE_REPLY);
      return new Response("<Response></Response>", {
        headers: { "Content-Type": "text/xml", ...corsHeaders(req) },
      });
    }

    if (manager && body.toLowerCase() === "more") {
      // Generate a signed token and send a short SMS with the hosted page link.
      // The hosted page shows the full agent-by-agent breakdown, mobile-optimized.

      // Quick stats for the headline
      const { data: responses } = await sb
        .from("checkin_responses")
        .select("conversation_state, is_working")
        .eq("check_in_date", today);

      if (!responses?.length) {
        await sendSms(incomingPhone, "No check-in responses yet for today.");
        return new Response("<Response></Response>", {
          headers: { "Content-Type": "text/xml", ...corsHeaders(req) },
        });
      }

      // Compute headline stats (mutually exclusive buckets)
      const working = responses.filter(
        (r) => r.conversation_state === "complete" && r.is_working === true
      ).length;
      const notWorking = responses.filter(
        (r) => r.conversation_state === "declined" && r.is_working === false
      ).length;
      const noResponse = responses.filter(
        (r) => ["q1_sent", "pending", "nudged"].includes(r.conversation_state)
      ).length;

      // Generate signed token via the checkin-more-page edge function
      const tokenResp = await fetch(
        `${supabaseUrl}/functions/v1/checkin-more-page`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${supabaseKey}`,
          },
          body: JSON.stringify({ action: "generate", manager_id: manager.id, date: today }),
        }
      );

      if (!tokenResp.ok) {
        console.error("Token generation failed:", await tokenResp.text());
        await sendSms(incomingPhone, "Unable to generate breakdown link. Try again in a moment.");
        return new Response("<Response></Response>", {
          headers: { "Content-Type": "text/xml", ...corsHeaders(req) },
        });
      }

      const { url } = await tokenResp.json();

      // Build short SMS — plain text, no emoji, under one segment (160 chars GSM-7)
      // GSM-7 safe: no emoji, no special unicode
      const smsBody = `${working} working, ${notWorking} off, ${noResponse} silent. Full breakdown: ${url}`;

      await sendSms(incomingPhone, smsBody);

      return new Response("<Response></Response>", {
        headers: { "Content-Type": "text/xml", ...corsHeaders(req) },
      });
    }

    // Look up the agent in recipients
    const { data: recipient } = await sb
      .from("checkin_recipients")
      .select("id, first_name")
      .eq("phone", incomingPhone)
      .eq("active", true)
      .single();

    if (!recipient) {
      // Unknown sender — send fallback redirect to Bianca
      console.log(`Unknown sender: ***${incomingPhone.slice(-4)}`);
      await sendSms(incomingPhone, FALLBACK_REPLY);
      return new Response("<Response></Response>", {
        headers: { "Content-Type": "text/xml", ...corsHeaders(req) },
      });
    }

    // Get or create today's response record
    let { data: response } = await sb
      .from("checkin_responses")
      .select("*")
      .eq("recipient_id", recipient.id)
      .eq("check_in_date", today)
      .single();

    if (!response) {
      // Create one if somehow it doesn't exist (agent texted before the blast)
      const { data: newResp } = await sb
        .from("checkin_responses")
        .insert({
          recipient_id: recipient.id,
          check_in_date: today,
          conversation_state: "q1_sent",
        })
        .select()
        .single();
      response = newResp;
    }

    if (!response) {
      console.error("Failed to create/find response record");
      return new Response("<Response></Response>", {
        headers: { "Content-Type": "text/xml", ...corsHeaders(req) },
      });
    }

    // State machine
    const state = response.conversation_state;

    if (state === "complete" || state === "declined") {
      // Already done for today — include Bianca's contact info
      await sendSms(
        incomingPhone,
        "You've already completed today's check-in. See you tomorrow! 💪\n\n" +
          "Need help with something? Reach out to Bianca Bill at bbill@teamfym.com — " +
          "she'll get you to the right person."
      );
      return new Response("<Response></Response>", {
        headers: { "Content-Type": "text/xml", ...corsHeaders(req) },
      });
    }

    if (state === "q1_sent" || state === "pending" || state === "nudged") {
      // Expecting YES/NO for "Are you working today?"
      const answer = parseYesNo(body);
      if (answer === null) {
        await sendSms(incomingPhone, "Just reply YES or NO — are you working today?");
        return new Response("<Response></Response>", {
          headers: { "Content-Type": "text/xml", ...corsHeaders(req) },
        });
      }

      if (answer) {
        // Working — move to Q2
        await sb
          .from("checkin_responses")
          .update({
            is_working: true,
            conversation_state: "q2_sent",
            responded_at: new Date().toISOString(),
          })
          .eq("id", response.id);

        await sendSms(incomingPhone, "Will you have 4+ hours of talk time today? Reply YES or NO");
      } else {
        // Not working — done
        await sb
          .from("checkin_responses")
          .update({
            is_working: false,
            conversation_state: "declined",
            responded_at: new Date().toISOString(),
          })
          .eq("id", response.id);

        await sendSms(incomingPhone, "Rest up — we'll be here tomorrow 💪");
      }
    } else if (state === "q2_sent") {
      // Expecting YES/NO for "4+ hours talk time?"
      const answer = parseYesNo(body);
      if (answer === null) {
        await sendSms(incomingPhone, "Just reply YES or NO — will you have 4+ hours of talk time?");
        return new Response("<Response></Response>", {
          headers: { "Content-Type": "text/xml", ...corsHeaders(req) },
        });
      }

      await sb
        .from("checkin_responses")
        .update({
          has_four_plus_hours: answer,
          conversation_state: "q3_sent",
          responded_at: new Date().toISOString(),
        })
        .eq("id", response.id);

      await sendSms(incomingPhone, "How many apps are you planning to write today? Reply 1, 2, 3, 4, or 5+");
    } else if (state === "q3_sent") {
      // Expecting app goal number
      const goal = parseAppGoal(body);
      if (goal === null) {
        await sendSms(incomingPhone, "Reply with a number: 1, 2, 3, 4, or 5+");
        return new Response("<Response></Response>", {
          headers: { "Content-Type": "text/xml", ...corsHeaders(req) },
        });
      }

      // Get a quote
      const quote = await getRandomQuote(sb);
      const quoteText = quote
        ? `${quote.quote_text}${quote.attribution ? ` — ${quote.attribution}` : ""}`
        : "Let's get it today!";

      await sb
        .from("checkin_responses")
        .update({
          app_goal: goal,
          quote_shown: quoteText,
          conversation_state: "complete",
          responded_at: new Date().toISOString(),
        })
        .eq("id", response.id);

      await sendSms(
        incomingPhone,
        `${goal === 5 ? "5+" : goal} apps — love the ambition! 🔥\n\n"${quoteText}"\n\nLet's get it, ${recipient.first_name}!`
      );
    }

    // Return empty TwiML (we handle replies via API, not TwiML response)
    return new Response("<Response></Response>", {
      headers: { "Content-Type": "text/xml", ...corsHeaders(req) },
    });
  } catch (err) {
    console.error("Webhook error:", err);
    return new Response("<Response></Response>", {
      status: 200,
      headers: { "Content-Type": "text/xml", ...corsHeaders(req) },
    });
  }
});
