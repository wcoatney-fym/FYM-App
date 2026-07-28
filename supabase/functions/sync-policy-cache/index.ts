/**
 * sync-policy-cache — FYM App edge function
 *
 * Reads live policy data from the FYM Sales Tracker DB (lryxx, read-only)
 * and upserts into policy_cache in the FYM App DB (rcbzag).
 *
 * Stage 2 addition: also syncs agencies from tracker → rcbzag.agencies
 * so agency names stay current as new sub-agencies are added to the tracker.
 *
 * Invocation:
 *   - Manual: POST /functions/v1/sync-policy-cache (with service role key)
 *   - Scheduled: daily cron via Supabase dashboard or pg_cron
 *
 * Env vars required (set in Supabase dashboard → Functions → Secrets):
 *   TRACKER_SUPABASE_URL       — tracker project URL (lryxx)
 *   TRACKER_SUPABASE_KEY       — tracker anon/publishable key (read-only)
 *   APP_SUPABASE_URL           — FYM App project URL (rcbzag)
 *   APP_SUPABASE_SERVICE_KEY   — FYM App service role key (needed for upsert)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const BATCH_SIZE = 500; // stay well under PostgREST's default 1000-row cap

interface TrackerAgency {
  id: string;
  name: string;
  slug: string | null;
  is_active: boolean;
}

interface TrackerPolicy {
  policy_number: string;
  agent_number: string | null;
  agency_id: string | null;
  agency: string | null;
  product_type: string | null;
  status: string | null;
  plan_premium: number | null;
  billing_mode: string | null;
  policy_effective_date: string | null;
  paid_to_date: string | null;
  at_risk_fired_at: string | null;
  client_first_name: string | null;
  client_last_name: string | null;
}

interface PolicyCacheRow {
  policy_number: string;
  agent_id: string | null;
  agency_id: string;
  product_type: string | null;
  status: string | null;
  plan_premium: number | null;
  billing_mode: string | null;
  policy_effective_date: string | null;
  paid_to_date: string | null;
  draft_count: number | null;
  last_contact_date: string | null;
  flag_type: string | null;
  is_at_risk: boolean;
  synced_at: string;
  client_name: string | null;
  writing_number: string | null;
}

/**
 * Estimate draft count from paid_to_date vs effective date + billing mode.
 * billing_mode codes: '1'=monthly, '3'=quarterly, '6'=semi-annual, '12'=annual
 */
function estimateDraftCount(
  effectiveDate: string | null,
  paidToDate: string | null,
  billingMode: string | null
): number {
  if (!effectiveDate || !paidToDate) return 0;
  const eff = new Date(effectiveDate);
  const paid = new Date(paidToDate);
  const diffMs = paid.getTime() - eff.getTime();
  if (diffMs < 0) return 0;
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  const mode = billingMode ?? '1';
  if (mode === '12') return diffDays >= 30 ? 1 : 0;
  if (mode === '6') return Math.floor(diffDays / 182) + (diffDays >= 30 ? 1 : 0);
  if (mode === '3') return Math.floor(diffDays / 91) + (diffDays >= 30 ? 1 : 0);
  // monthly (default)
  return Math.max(0, Math.floor(diffDays / 30));
}

/**
 * Determine if a policy is at-risk and what flag type to assign.
 *
 * At-risk definition (matches lifecycle evaluator): active policy whose
 * paid_to_date is before today — meaning premium is overdue.
 * Flag types:
 *   - 'at_risk'        — already fired in GHL lifecycle (at_risk_fired_at set)
 *   - 'payment_failed' — paid_to_date behind today (30+ days = critical, 14+ = urgent)
 *   - 'payment_watch'  — paid_to_date behind today but < 14 days
 */
function resolveRiskFlag(policy: TrackerPolicy): { isAtRisk: boolean; flagType: string | null } {
  const today = new Date();

  // Already fired in GHL lifecycle
  if (policy.at_risk_fired_at) {
    return { isAtRisk: true, flagType: 'at_risk' };
  }

  // Non-active policies are not at risk
  if (policy.status && ['lapsed', 'terminated', 'cancelled'].includes(policy.status.toLowerCase())) {
    return { isAtRisk: false, flagType: null };
  }

  // Active policy with paid_to_date behind today = at risk
  if (policy.paid_to_date && policy.status === 'active') {
    const paid = new Date(policy.paid_to_date);
    const lagDays = (today.getTime() - paid.getTime()) / (1000 * 60 * 60 * 24);
    if (lagDays > 0) {
      return {
        isAtRisk: true,
        flagType: lagDays >= 30 ? 'payment_failed' : lagDays >= 14 ? 'payment_failed' : 'payment_watch',
      };
    }
  }

  return { isAtRisk: false, flagType: null };
}

/**
 * Sync agencies from tracker → rcbzag.agencies.
 * Upserts on tracker_id so names/slugs stay fresh as tracker evolves.
 * Returns { synced, errors }.
 */
async function syncAgencies(
  tracker: ReturnType<typeof createClient>,
  app: ReturnType<typeof createClient>
): Promise<{ synced: number; errors: string[] }> {
  const errors: string[] = [];
  let synced = 0;

  // Paginate tracker agencies (currently 103, well under 1K, but paginate defensively)
  let offset = 0;
  while (true) {
    const { data: agencies, error } = await tracker
      .from('agencies')
      .select('id, name, slug, is_active')
      .order('name', { ascending: true })
      .range(offset, offset + BATCH_SIZE - 1);

    if (error) {
      errors.push(`agencies fetch @${offset}: ${error.message}`);
      break;
    }
    if (!agencies || agencies.length === 0) break;

    const rows = (agencies as TrackerAgency[]).map((a) => ({
      tracker_id: a.id,
      name: a.name,
      slug: a.slug ?? null,
      is_active: a.is_active,
    }));

    const { error: upsertError } = await app
      .from('agencies')
      .upsert(rows, { onConflict: 'tracker_id' });

    if (upsertError) {
      errors.push(`agencies upsert @${offset}: ${upsertError.message}`);
    } else {
      synced += rows.length;
    }

    if (agencies.length < BATCH_SIZE) break;
    offset += BATCH_SIZE;
  }

  return { synced, errors };
}

Deno.serve(async (req) => {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  // ?check=1 — test both keys live without doing a full sync
  const url = new URL(req.url);
  if (url.searchParams.get('check') === '1') {
    const trackerUrl = Deno.env.get('TRACKER_SUPABASE_URL') ?? '';
    const trackerKey = Deno.env.get('TRACKER_SUPABASE_KEY') ?? '';
    const appUrl = Deno.env.get('APP_SUPABASE_URL') ?? '';
    const appServiceKey = Deno.env.get('APP_SUPABASE_SERVICE_KEY') ?? '';

    let trackerOk = false;
    let trackerDetail = '';
    try {
      const res = await fetch(`${trackerUrl}/rest/v1/form_submissions?limit=1&select=policy_number`, {
        headers: { apikey: trackerKey, Authorization: `Bearer ${trackerKey}` },
      });
      const body = await res.json();
      if (Array.isArray(body) && body.length > 0) {
        trackerOk = true;
        trackerDetail = `OK — sample policy_number: ${body[0].policy_number}`;
      } else {
        trackerDetail = `Unexpected response: ${JSON.stringify(body).slice(0, 120)}`;
      }
    } catch (e) {
      trackerDetail = `Exception: ${e}`;
    }

    let appOk = false;
    let appDetail = '';
    try {
      const canary = [{
        policy_number: '__canary_test__',
        agency_id: 'test',
        is_at_risk: false,
        synced_at: new Date().toISOString(),
      }];
      const upsertRes = await fetch(`${appUrl}/rest/v1/policy_cache`, {
        method: 'POST',
        headers: {
          apikey: appServiceKey,
          Authorization: `Bearer ${appServiceKey}`,
          'Content-Type': 'application/json',
          Prefer: 'resolution=merge-duplicates,return=minimal',
        },
        body: JSON.stringify(canary),
      });
      if (upsertRes.ok || upsertRes.status === 201) {
        await fetch(`${appUrl}/rest/v1/policy_cache?policy_number=eq.__canary_test__`, {
          method: 'DELETE',
          headers: { apikey: appServiceKey, Authorization: `Bearer ${appServiceKey}` },
        });
        appOk = true;
        appDetail = 'OK — write + delete succeeded';
      } else {
        const body = await upsertRes.json();
        appDetail = `HTTP ${upsertRes.status}: ${JSON.stringify(body).slice(0, 120)}`;
      }
    } catch (e) {
      appDetail = `Exception: ${e}`;
    }

    return new Response(JSON.stringify({
      tracker: { ok: trackerOk, detail: trackerDetail },
      app: { ok: appOk, detail: appDetail },
    }, null, 2), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  const trackerUrl = Deno.env.get('TRACKER_SUPABASE_URL');
  const trackerKey = Deno.env.get('TRACKER_SUPABASE_KEY');
  const appUrl = Deno.env.get('APP_SUPABASE_URL');
  const appServiceKey = Deno.env.get('APP_SUPABASE_SERVICE_KEY');

  if (!trackerUrl || !trackerKey || !appUrl || !appServiceKey) {
    return new Response(
      JSON.stringify({ error: 'Missing required env vars', required: ['TRACKER_SUPABASE_URL', 'TRACKER_SUPABASE_KEY', 'APP_SUPABASE_URL', 'APP_SUPABASE_SERVICE_KEY'] }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const tracker = createClient(trackerUrl, trackerKey);
  const app = createClient(appUrl, appServiceKey);

  const syncedAt = new Date().toISOString();

  // ── Step 1: Sync agencies (Stage 2 addition) ──────────────────────────────
  const agencyResult = await syncAgencies(tracker, app);
  console.log(`Agencies synced: ${agencyResult.synced}, errors: ${agencyResult.errors.length}`);

  // ── Step 2: Load writing_number → UUID map from app profiles ──────────────
  const profileMap = new Map<string, string>();
  let profileOffset = 0;
  while (true) {
    const { data: profiles, error } = await app
      .from('profiles')
      .select('id, writing_number')
      .not('writing_number', 'is', null)
      .range(profileOffset, profileOffset + BATCH_SIZE - 1);
    if (error) {
      console.error('Error loading profiles:', error.message);
      break;
    }
    for (const p of profiles ?? []) {
      if (p.writing_number) profileMap.set(p.writing_number.trim(), p.id);
    }
    if ((profiles?.length ?? 0) < BATCH_SIZE) break;
    profileOffset += BATCH_SIZE;
  }
  console.log(`Loaded ${profileMap.size} agent writing_number → UUID mappings`);

  // ── Step 3: Paginate through tracker form_submissions (HI + HHC) ──────────
  let totalSynced = 0;
  let totalErrors = 0;
  const errorMessages: string[] = [...agencyResult.errors];

  for (const productType of ['HI', 'HHC']) {
    let trackerOffset = 0;
    while (true) {
      const { data: policies, error: fetchError } = await tracker
        .from('form_submissions')
        .select(
          'policy_number, agent_number, agency_id, agency, product_type, status, plan_premium, billing_mode, policy_effective_date, paid_to_date, at_risk_fired_at, client_first_name, client_last_name'
        )
        .eq('product_type', productType)
        .range(trackerOffset, trackerOffset + BATCH_SIZE - 1);

      if (fetchError) {
        console.error(`${productType} fetch error:`, fetchError.message);
        errorMessages.push(`${productType} fetch @${trackerOffset}: ${fetchError.message}`);
        totalErrors++;
        break;
      }
      if (!policies || policies.length === 0) break;

      const rows: PolicyCacheRow[] = policies
        .filter((p: TrackerPolicy) => !!p.policy_number)
        .map((p: TrackerPolicy) => {
          const { isAtRisk, flagType } = resolveRiskFlag(p);
          const agentId = p.agent_number ? (profileMap.get(p.agent_number.trim()) ?? null) : null;
          // Build client name from first + last
          const clientName = [p.client_first_name, p.client_last_name]
            .filter(Boolean)
            .map(s => s!.trim())
            .join(' ') || null;

          return {
            policy_number: p.policy_number,
            agent_id: agentId,
            // Only use real agency UUID — never fall back to person-name strings
            // from the agency column, which are individual agent names
            agency_id: p.agency_id ?? 'unknown',
            product_type: p.product_type,
            status: p.status,
            plan_premium: p.plan_premium,
            billing_mode: p.billing_mode,
            policy_effective_date: p.policy_effective_date,
            paid_to_date: p.paid_to_date,
            draft_count: estimateDraftCount(p.policy_effective_date, p.paid_to_date, p.billing_mode),
            last_contact_date: null,
            flag_type: flagType,
            is_at_risk: isAtRisk,
            synced_at: syncedAt,
            client_name: clientName,
            writing_number: p.agent_number?.trim() ?? null,
          };
        });

      const { error: upsertError } = await app
        .from('policy_cache')
        .upsert(rows, { onConflict: 'policy_number' });

      if (upsertError) {
        console.error(`${productType} upsert error @${trackerOffset}:`, upsertError.message);
        errorMessages.push(`${productType} upsert @${trackerOffset}: ${upsertError.message}`);
        totalErrors++;
      } else {
        totalSynced += rows.length;
      }

      if (policies.length < BATCH_SIZE) break;
      trackerOffset += BATCH_SIZE;
    }
  }

  const result = {
    ok: totalErrors === 0,
    agencies: { synced: agencyResult.synced, errors: agencyResult.errors.length },
    policies: { synced: totalSynced, errors: totalErrors },
    errorMessages,
    agentsMapped: profileMap.size,
    syncedAt,
  };

  console.log('Sync complete:', result);

  return new Response(JSON.stringify(result), {
    status: totalErrors > 0 ? 207 : 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
