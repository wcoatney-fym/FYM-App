/**
 * @crm-protected
 * DO NOT MODIFY without Charlie's explicit approval.
 * This file is part of CRM Ops (OpenClaw Dashboard).
 * Table references use hierarchy_agencies (NOT crm_agencies).
 * Any rename or schema change to hierarchy_agencies requires updating this file.
 * See: docs/CRM_OPS_FILES.md for the full protected file list.
 */
import { supabase } from './tracker-supabase';
import { supabase as portalSupabase, ensurePortalAuth, portalConfigured } from '@/lib/crm/portal-client';
import {
  reconcileAll, severityToPriority, normName,
  type IntakeAgency, type ProductionAgency, type ReconIssue,
} from './reconciliation';
import { suggestAssignee } from './assignment';
import { fetchTeam } from './task-hq';
import {
  buildSeedCrosswalk, buildResolver, type CrosswalkEntry,
} from './agency-canonical';

/**
 * Load the standardization crosswalk from cc_agency_crosswalk (the live source
 * of truth), falling back to the static seed if the table is empty/unreachable.
 * The resolver maps any known agency string (intake/portal/tracker variant) to
 * one canonical entry so intake<->production matching is exact, not brittle.
 */
async function loadResolver() {
  let entries: CrosswalkEntry[] = buildSeedCrosswalk();
  if (portalConfigured && portalSupabase) {
    try {
      await ensurePortalAuth();
      const { data } = await portalSupabase
        .from('cc_agency_crosswalk')
        .select('canonical_key,canonical_name,tracker_name,variants');
      const rows = (data as XwalkRow[] | null) ?? [];
      if (rows.length) {
        entries = rows.map((r) => ({
          canonicalKey: r.canonical_key,
          canonicalName: r.canonical_name,
          trackerName: r.tracker_name,
          variants: r.variants ?? [],
        }));
      }
    } catch {
      /* fall back to seed */
    }
  }
  return buildResolver(entries);
}

/**
 * reconciliation-run.ts — wires the pure engine to live data and the task feed.
 *
 * Intake  ← contracting-portal `crm_agencies` (agency intake form).
 * Production ← Activity Tracker (`agencies` + `form_submissions`).
 *
 * Detected issues are upserted into `cc_reconciliation_issues`; criticals and
 * warnings also materialize a `cc_tasks` row (source='flag') routed to the
 * internal team. Everything is guarded/best-effort so a missing config or a
 * transient error never throws into the UI.
 *
 * NOTE: full agency/agent-NPN matching against production lights up once the
 * production NPN feed is connected; until then the engine still correctly
 * emits 'pending' for no-production agencies and name/carrier drift.
 */

interface CrmAgencyRow {
  id: string;
  name: string;
  agency_npn: string | null;
  principal_agent_npn: string | null;
  agency_ein: string | null;
  carriers: string[] | null;
  is_test: boolean | null;
}

interface TrackerPolicyRow { agency_id: string | null; agency: string | null; carrier: string | null }
interface XwalkRow { canonical_key: string; canonical_name: string; tracker_name: string | null; variants: string[] | null }

async function fetchIntake(): Promise<IntakeAgency[]> {
  if (!portalConfigured || !portalSupabase) return [];
  await ensurePortalAuth();
  const { data, error } = await portalSupabase
    .from('hierarchy_agencies')
    .select('id,name,agency_npn,principal_agent_npn,agency_ein,carriers,is_test');
  if (error || !data) return [];
  return (data as CrmAgencyRow[])
    .filter((r) => !r.is_test)
    .map((r) => ({
      intakeId: r.id,
      name: r.name,
      agencyNpn: r.agency_npn,
      principalAgentNpn: r.principal_agent_npn,
      ein: r.agency_ein,
      carriers: r.carriers ?? [],
    }));
}

/**
 * Build production facts keyed by intake agency id, matching intake agencies to
 * tracker production by normalized name.
 */
async function fetchProduction(
  intakes: IntakeAgency[],
  resolve: (name: string | null | undefined) => CrosswalkEntry | null,
): Promise<Map<string, ProductionAgency>> {
  const map = new Map<string, ProductionAgency>();
  if (!supabase) return map;

  const { data: policies } = await supabase
    .from('form_submissions')
    .select('agency_id,agency,carrier');
  const rows = (policies as TrackerPolicyRow[] | null) ?? [];

  // Aggregate production by CANONICAL key (via the crosswalk), so tracker name
  // drift ("Wisechoice Senior Advisors Llc") still matches intake ("Wisechoice").
  // Fall back to the normalized name when a production agency isn't yet in the
  // crosswalk.
  const byKey = new Map<string, { count: number; carriers: Set<string>; name: string }>();
  for (const p of rows) {
    const entry = resolve(p.agency);
    const key = entry?.canonicalKey ?? normName(p.agency);
    if (!key) continue;
    const agg = byKey.get(key) ?? { count: 0, carriers: new Set<string>(), name: entry?.canonicalName ?? (p.agency ?? '') };
    agg.count += 1;
    if (p.carrier) agg.carriers.add(p.carrier.toUpperCase());
    byKey.set(key, agg);
  }

  for (const intake of intakes) {
    const entry = resolve(intake.name);
    const key = entry?.canonicalKey ?? normName(intake.name);
    const agg = byKey.get(key);
    map.set(intake.intakeId, agg
      ? { hasProduction: agg.count > 0, name: agg.name, carriers: [...agg.carriers] }
      : { hasProduction: false });
  }
  return map;
}

export interface ReconRunResult {
  ran: boolean;
  issues: ReconIssue[];
  persisted: number;
  reason?: string;
}

/** Run reconciliation across all intake agencies and persist the results. */
export async function runReconciliation(): Promise<ReconRunResult> {
  if (!portalConfigured || !portalSupabase) {
    return { ran: false, issues: [], persisted: 0, reason: 'portal-not-configured' };
  }
  try {
    const intakes = await fetchIntake();
    if (intakes.length === 0) return { ran: false, issues: [], persisted: 0, reason: 'no-intake' };

    const resolve = await loadResolver();
    const prod = await fetchProduction(intakes, resolve);
    const issues = reconcileAll(intakes, prod);

    const persisted = await persistIssues(issues);
    return { ran: true, issues, persisted };
  } catch (e) {
    return { ran: false, issues: [], persisted: 0, reason: (e as Error).message };
  }
}

async function persistIssues(issues: ReconIssue[]): Promise<number> {
  if (!portalSupabase || issues.length === 0) return 0;
  await ensurePortalAuth();
  const now = new Date().toISOString();

  // Load the team + current open-task load so flags auto-route to the best owner.
  const { members } = await fetchTeam();
  const openTaskCounts: Record<string, number> = {};
  try {
    const { data: openRows } = await portalSupabase
      .from('cc_tasks')
      .select('assignee_id')
      .neq('status', 'done');
    for (const r of (openRows as { assignee_id: string | null }[] | null) ?? []) {
      if (r.assignee_id) openTaskCounts[r.assignee_id] = (openTaskCounts[r.assignee_id] ?? 0) + 1;
    }
  } catch {
    /* load is best-effort; assignment still works without it */
  }

  // Upsert issues (idempotent on intake_id+category+severity).
  const rows = issues.map((i) => ({
    intake_id: i.intakeId,
    agency_name: i.agencyName,
    category: i.category,
    severity: i.severity,
    intake_value: i.intakeValue,
    production_value: i.productionValue,
    detail: i.detail,
    last_seen_at: now,
    updated_at: now,
  }));
  const { error } = await portalSupabase
    .from('cc_reconciliation_issues')
    .upsert(rows, { onConflict: 'intake_id,category,severity' });
  if (error) return 0;

  // Materialize actionable (non-pending) issues into the task feed.
  const actionable = issues.filter((i) => i.severity !== 'pending');
  for (const i of actionable) {
    const difficulty = i.severity === 'critical' ? 6 : 3;
    const assignee = suggestAssignee({
      skillCategory: 'retention',
      difficulty,
      members,
      openTaskCounts,
    });
    if (assignee) openTaskCounts[assignee.memberId] = (openTaskCounts[assignee.memberId] ?? 0) + 1;
    await portalSupabase.from('cc_tasks').insert({
      title: `[${i.severity.toUpperCase()}] ${i.agencyName}: ${i.category} mismatch`,
      description: assignee ? `${i.detail}\n\nAuto-routed: ${assignee.name} (${assignee.rationale}).` : i.detail,
      assignee_id: assignee?.memberId ?? null,
      source: 'flag',
      skill_category: 'retention',
      difficulty,
      priority: severityToPriority(i.severity),
      status: 'backlog',
    });
  }
  return rows.length;
}
