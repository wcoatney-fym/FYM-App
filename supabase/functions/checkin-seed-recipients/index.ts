// checkin-seed-recipients: One-time (or re-runnable) seed of checkin_recipients
// from the portal roster (akhojh agents table).
// Filters to FYM internal agents only (agency = 'FYM', status = 'completed')
// Normalizes phone to E.164 and upserts into rcbzag.checkin_recipients

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const appUrl = Deno.env.get("APP_SUPABASE_URL")!;
const appKey = Deno.env.get("APP_SUPABASE_SERVICE_KEY")!;

// Portal (akhojh) — read agents from here
const portalUrl = Deno.env.get("PORTAL_SUPABASE_URL") || "https://akhojhncsswyzcnicedt.supabase.co";
const portalKey = Deno.env.get("PORTAL_SUPABASE_ANON_KEY") || Deno.env.get("CONTRACTING_SUPABASE_ANON_KEY") || "";

function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (raw.startsWith("+")) return raw;
  return `+${digits}`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const portal = createClient(portalUrl, portalKey);
    const app = createClient(appUrl, appKey);

    // Fetch FYM internal agents with phone numbers from portal roster
    const PAGE_SIZE = 500;
    let offset = 0;
    const allAgents: any[] = [];

    while (true) {
      const { data, error } = await portal
        .from("agents")
        .select("id, first_name, last_name, phone, agency, status")
        .eq("agency", "FYM")
        .eq("status", "completed")
        .not("phone", "is", null)
        .range(offset, offset + PAGE_SIZE - 1);

      if (error) throw error;
      if (!data?.length) break;
      allAgents.push(...data);
      if (data.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }

    console.log(`Found ${allAgents.length} FYM internal agents with phones`);

    // Filter out agents with blank/invalid phones
    const validAgents = allAgents.filter((a) => {
      const phone = a.phone?.trim();
      if (!phone) return false;
      const digits = phone.replace(/\D/g, "");
      return digits.length >= 10;
    });

    console.log(`${validAgents.length} with valid phone numbers`);

    let inserted = 0;
    let skipped = 0;
    let errors = 0;

    for (const agent of validAgents) {
      const phone = normalizePhone(agent.phone.trim());
      const firstName = (agent.first_name || "").trim();
      const lastName = (agent.last_name || "").trim();

      if (!firstName) {
        skipped++;
        continue;
      }

      const { error: upsertErr } = await app
        .from("checkin_recipients")
        .upsert(
          {
            portal_agent_id: agent.id,
            first_name: firstName,
            last_name: lastName,
            phone,
            active: true,
          },
          { onConflict: "portal_agent_id" }
        );

      if (upsertErr) {
        console.error(`Failed to upsert ${firstName} ${lastName}:`, upsertErr);
        errors++;
      } else {
        inserted++;
      }
    }

    return new Response(
      JSON.stringify({
        message: `Seeded ${inserted} recipients from portal roster`,
        inserted,
        skipped,
        errors,
        totalFetched: allAgents.length,
        validPhones: validAgents.length,
      }),
      { headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (err) {
    console.error("Seed error:", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
});
