/**
 * sync-policy-cache — Phase 3 edge function
 *
 * Reads live policy data from the FYM Sales Tracker DB (lryxx, read-only)
 * and upserts into policy_cache in the FYM App DB (rcbzag).
 *
 * Invocation:
 *   - Manual: POST /functions/v1/sync-policy-cache (with service role key)
 *   - Scheduled: daily cron via Supabase dashboard or pg_cron
 *
 * Env vars required (set in Supabase dashboard → Functions → Secrets):
 *   TRACKER_SUPABASE_URL       — tracker project URL (lryxx)
 *   TRACKER_SUPABASE_KEY       — tracker service role key (read-only anon is fine)
 *   APP_SUPABASE_URL           — FYM App project URL (rcbzag)
 *   APP_SUPABASE_SERVICE_KEY   — FYM App service role key (needed for upsert)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const BATCH_SIZE = 500; // stay well under PostgREST's default 1000-row cap

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
 * Primary signal: at_risk_fired_at set in tracker (already flagged upstream).
 * Secondary: paid_to_date is >60 days behind today (payment likely failed).
 */
function resolveRiskFlag(policy: TrackerPolicy): { isAtRisk: boolean; flagType: string | null } {
  const today = new Date();

  // Tracker already flagged it
  if (policy.at_risk_fired_at) {
    return { isAtRisk: true, flagType: 'at_risk' };
  }

  // Lapsed / terminated status
  if (policy.status && ['lapsed', 'terminated', 'cancelled'].includes(policy.status.toLowerCase())) {
    return { isAtRisk: false, flagType: null }; // not at-risk, just inactive
  }

  // Paid-to-date is stale (>60 days behind) on an active policy
  if (policy.paid_to_date && policy.status === 'active') {
    const paid = new Date(policy.paid_to_date);
    const lagDays = (today.getTime() - paid.getTime()) / (1000 * 60 * 60 * 24);
    if (lagDays > 60) {
      return { isAtRisk: true, flagType: 'payment_failed' };
    }
  }

  return { isAtRisk: false, flagType: null };
}

Deno.serve(async (req) => {
  // Allow GET for easy manual testing; POST for cron/scheduled invocation
  if (req.method !== 'GET' && req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
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

  // ── Step 1: Load writing_number → UUID map from app profiles ──────────────
  const profileMap = new Map<string, string>(); // writing_number → profile UUID
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

  // ── Step 2: Paginate through tracker form_submissions ────────────────────
  let trackerOffset = 0;
  let totalSynced = 0;
  let totalErrors = 0;
  const errorMessages: string[] = [];
  const syncedAt = new Date().toISOString();

  while (true) {
    const { data: policies, error: fetchError } = await tracker
      .from('form_submissions')
      .select(
        'policy_number, agent_number, agency_id, agency, product_type, status, plan_premium, billing_mode, policy_effective_date, paid_to_date, at_risk_fired_at'
      )
      .eq('product_type', 'HI') // HI first — re-run will get HHC via product_type filter param or remove filter
      .range(trackerOffset, trackerOffset + BATCH_SIZE - 1);

    if (fetchError) {
      console.error('Tracker fetch error:', fetchError.message);
      errorMessages.push('HI fetch @' + trackerOffset + ': ' + fetchError.message);
      totalErrors++;
      break;
    }
    if (!policies || policies.length === 0) break;

    // ── Step 3: Transform → policy_cache rows ─────────────────────────────
    // Filter out rows with null policy_number — they can't be upserted
    const rows: PolicyCacheRow[] = policies.filter((p: TrackerPolicy) => !!p.policy_number).map((p: TrackerPolicy) => {
      const { isAtRisk, flagType } = resolveRiskFlag(p);
      const agentId = p.agent_number ? (profileMap.get(p.agent_number.trim()) ?? null) : null;

      return {
        policy_number: p.policy_number,
        agent_id: agentId,
        agency_id: p.agency_id ?? p.agency ?? 'unknown',
        product_type: p.product_type,
        status: p.status,
        plan_premium: p.plan_premium,
        billing_mode: p.billing_mode,
        policy_effective_date: p.policy_effective_date,
        paid_to_date: p.paid_to_date,
        draft_count: estimateDraftCount(p.policy_effective_date, p.paid_to_date, p.billing_mode),
        last_contact_date: null, // not in tracker — populated later via GHL contact data
        flag_type: flagType,
        is_at_risk: isAtRisk,
        synced_at: syncedAt,
      };
    });

    // ── Step 4: Upsert into policy_cache ──────────────────────────────────
    const { error: upsertError } = await app
      .from('policy_cache')
      .upsert(rows, { onConflict: 'policy_number' });

    if (upsertError) {
      console.error('Upsert error at offset', trackerOffset, ':', upsertError.message);
      errorMessages.push('HI upsert @' + trackerOffset + ': ' + upsertError.message);
      totalErrors++;
    } else {
      totalSynced += rows.length;
    }

    if (policies.length < BATCH_SIZE) break;
    trackerOffset += BATCH_SIZE;
  }

  // ── Step 5: Repeat for HHC ────────────────────────────────────────────
  trackerOffset = 0;
  while (true) {
    const { data: policies, error: fetchError } = await tracker
      .from('form_submissions')
      .select(
        'policy_number, agent_number, agency_id, agency, product_type, status, plan_premium, billing_mode, policy_effective_date, paid_to_date, at_risk_fired_at'
      )
      .eq('product_type', 'HHC')
      .range(trackerOffset, trackerOffset + BATCH_SIZE - 1);

    if (fetchError) {
      console.error('Tracker HHC fetch error:', fetchError.message);
      errorMessages.push('HHC fetch @' + trackerOffset + ': ' + fetchError.message);
      totalErrors++;
      break;
    }
    if (!policies || policies.length === 0) break;

    const rows: PolicyCacheRow[] = policies.filter((p: TrackerPolicy) => !!p.policy_number).map((p: TrackerPolicy) => {
      const { isAtRisk, flagType } = resolveRiskFlag(p);
      const agentId = p.agent_number ? (profileMap.get(p.agent_number.trim()) ?? null) : null;

      return {
        policy_number: p.policy_number,
        agent_id: agentId,
        agency_id: p.agency_id ?? p.agency ?? 'unknown',
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
      };
    });

    const { error: upsertError } = await app
      .from('policy_cache')
      .upsert(rows, { onConflict: 'policy_number' });

    if (upsertError) {
      console.error('HHC upsert error at offset', trackerOffset, ':', upsertError.message);
      errorMessages.push('HHC upsert @' + trackerOffset + ': ' + upsertError.message);
      totalErrors++;
    } else {
      totalSynced += rows.length;
    }

    if (policies.length < BATCH_SIZE) break;
    trackerOffset += BATCH_SIZE;
  }

  // Debug: check which env vars are present
  const envCheck = {
    TRACKER_SUPABASE_URL: !!Deno.env.get('TRACKER_SUPABASE_URL'),
    TRACKER_SUPABASE_KEY: !!Deno.env.get('TRACKER_SUPABASE_KEY'),
    APP_SUPABASE_URL: !!Deno.env.get('APP_SUPABASE_URL'),
    APP_SUPABASE_SERVICE_KEY: !!Deno.env.get('APP_SUPABASE_SERVICE_KEY'),
  };

  const result = {
    ok: totalErrors === 0,
    synced: totalSynced,
    errors: totalErrors,
    errorMessages,
    agentsMapped: profileMap.size,
    syncedAt,
    envCheck,
  };

  console.log('Sync complete:', result);

  return new Response(JSON.stringify(result), {
    status: totalErrors > 0 ? 207 : 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
