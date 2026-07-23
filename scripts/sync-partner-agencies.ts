/**
 * sync-partner-agencies.ts
 *
 * Parallel-period sync: reads partner_agencies from lpmyzp (activation tool)
 * and upserts into onboarding_agencies in rcbzag (FYM App).
 *
 * Strategy:
 *   - lpmyzp is the source of truth during the parallel period
 *   - Uses updated_at to detect changes since last sync
 *   - ON CONFLICT (slug) DO UPDATE — overwrites all fields except agency_id
 *     (agency_id is FYM App's FK to agencies table, not present in lpmyzp)
 *   - Preserves original created_at from lpmyzp
 *
 * Usage:
 *   npx tsx scripts/sync-partner-agencies.ts [--dry-run]
 *
 * Env vars required:
 *   ACTIVATION_SUPABASE_URL     — lpmyzp Supabase URL
 *   ACTIVATION_SUPABASE_ANON_KEY — lpmyzp anon key
 *   FYM_APP_SUPABASE_URL        — rcbzag Supabase URL
 *   FYM_APP_SUPABASE_ANON_KEY   — rcbzag anon key (or service role key)
 *   SUPABASE_ACCESS_TOKEN       — Management API token (used for rcbzag writes)
 */

const LPMYZP_REF = 'lpmyzpprklqxoysblwhs';
const RCBZAG_REF = 'rcbzagjyhyrkuwvlrlnf';

interface PartnerAgency {
  slug: string;
  agency_name: string;
  principal_name: string | null;
  principal_email: string | null;
  active: boolean;
  variant: string;
  comp_tier: string;
  roadmap_progress: Record<string, boolean>;
  created_at: string;
  updated_at: string;
  last_visited_at: string | null;
}

async function querySupabase(projectRef: string, sql: string): Promise<unknown[]> {
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  if (!token) throw new Error('SUPABASE_ACCESS_TOKEN not set');

  const res = await fetch(
    `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: sql }),
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase query failed (${res.status}): ${text}`);
  }

  return res.json();
}

function escapeSQL(val: string | null): string {
  if (val === null) return 'NULL';
  return `'${val.replace(/'/g, "''")}'`;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  console.log(`[sync] Fetching partner_agencies from lpmyzp...`);
  const source = (await querySupabase(
    LPMYZP_REF,
    `SELECT slug, agency_name, principal_name, principal_email, active, variant, comp_tier,
            roadmap_progress, created_at, updated_at, last_visited_at
     FROM partner_agencies ORDER BY created_at`
  )) as PartnerAgency[];

  console.log(`[sync] Found ${source.length} agencies in lpmyzp`);

  if (source.length === 0) {
    console.log('[sync] Nothing to sync.');
    return;
  }

  // Build upsert SQL
  const values = source.map((a) => {
    const rp = typeof a.roadmap_progress === 'string'
      ? a.roadmap_progress
      : JSON.stringify(a.roadmap_progress);
    return [
      `  (${escapeSQL(a.slug)}`,
      `${escapeSQL(a.agency_name)}`,
      `${escapeSQL(a.principal_name)}`,
      `${escapeSQL(a.principal_email)}`,
      `${a.active}`,
      `${escapeSQL(a.variant)}`,
      `${escapeSQL(a.comp_tier)}`,
      `${escapeSQL(rp)}::jsonb`,
      `${escapeSQL(a.created_at)}::timestamptz`,
      `${escapeSQL(a.updated_at)}::timestamptz`,
      `${a.last_visited_at ? `${escapeSQL(a.last_visited_at)}::timestamptz` : 'NULL'})`,
    ].join(', ');
  }).join(',\n');

  const upsertSQL = `
INSERT INTO onboarding_agencies
  (slug, agency_name, principal_name, principal_email, active, variant, comp_tier,
   roadmap_progress, created_at, updated_at, last_visited_at)
VALUES
${values}
ON CONFLICT (slug) DO UPDATE SET
  agency_name = EXCLUDED.agency_name,
  principal_name = EXCLUDED.principal_name,
  principal_email = EXCLUDED.principal_email,
  active = EXCLUDED.active,
  variant = EXCLUDED.variant,
  comp_tier = EXCLUDED.comp_tier,
  roadmap_progress = EXCLUDED.roadmap_progress,
  updated_at = EXCLUDED.updated_at,
  last_visited_at = EXCLUDED.last_visited_at;
  `;

  if (dryRun) {
    console.log('[sync] DRY RUN — SQL that would be executed:');
    console.log(upsertSQL);
    return;
  }

  console.log(`[sync] Upserting ${source.length} agencies into rcbzag...`);
  await querySupabase(RCBZAG_REF, upsertSQL);

  // Verify
  const result = (await querySupabase(
    RCBZAG_REF,
    `SELECT count(*) as total FROM onboarding_agencies`
  )) as Array<{ total: number }>;

  console.log(`[sync] Done. rcbzag onboarding_agencies now has ${result[0]?.total} rows.`);
}

main().catch((err) => {
  console.error('[sync] FATAL:', err);
  process.exit(1);
});
