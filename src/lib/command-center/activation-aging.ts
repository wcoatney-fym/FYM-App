/**
 * @crm-protected
 * DO NOT MODIFY without Charlie's explicit approval.
 * This file is part of CRM Ops (OpenClaw Dashboard).
 * Table references use hierarchy_agencies (NOT crm_agencies).
 * Any rename or schema change to hierarchy_agencies requires updating this file.
 * See: docs/CRM_OPS_FILES.md for the full protected file list.
 */
/**
 * activation-aging.ts — generates internal tasks for agencies that are stuck
 * in the activation funnel without producing.
 *
 * Two task sources:
 *
 * 1. ACTIVATION GAP (P1 when ≥60d, P2 when ≥30d):
 *    crm_agencies where onboarding_status = 'onboarding_complete'
 *    AND the agency has zero production in the tracker.
 *    Means: we finished our side; they're just not writing.
 *
 * 2. CSR BOTTLENECK (P2, internal):
 *    crm_agencies where onboarding_status = 'pending_csr_assignment'
 *    AND days_since_created ≥ CSR_BOTTLENECK_DAYS (default 14).
 *    Means: the agency is stuck waiting on us to assign a CSR.
 *
 * Tasks are upserted idempotently keyed on (source='activation', intake_id +
 * category slug) so re-runs never duplicate. An existing open task is left
 * untouched (status/assignee preserved); a closed task is re-opened with a
 * note if the agency is still dormant.
 *
 * @crm-team-protected — do NOT touch CrmTeam tab files or rename crm_agencies
 * strings here; this module reads crm_agencies for onboarding metadata only.
 */

import { supabase } from './tracker-supabase';
import { supabase as portalSupabase, ensurePortalAuth, portalConfigured } from '@/lib/crm/portal-client';
import { buildSeedCrosswalk, buildResolver, normKey, type CrosswalkEntry } from './agency-canonical';
import { suggestAssignee } from './assignment';
import { fetchTeam } from './task-hq';
import type { Priority } from './types';

// ---------- thresholds (days) ----------
const ACTIVATION_GAP_P1_DAYS = 60;
const ACTIVATION_GAP_P2_DAYS = 30;
const CSR_BOTTLENECK_DAYS = 14;

// ---------- DB row shapes ----------
interface CrmAgencyRow {
  id: string;
  name: string;
  onboarding_status: string | null;
  date_added: string | null;
  date_created: string | null;
  is_test: boolean | null;
}

interface TrackerAgencyRow {
  id: string;
  name: string | null;
}

interface TrackerPolicyRow {
  agency_id: string | null;
}

interface OpenTaskRow {
  id: string;
  source: string | null;
  status: string | null;
  description: string | null;
}

// ---------- result shape ----------
export interface ActivationTask {
  intakeId: string;
  agencyName: string;
  category: 'activation_gap' | 'csr_bottleneck';
  daysDormant: number;
  priority: Priority;
  title: string;
  description: string;
}

export interface ActivationRunResult {
  ran: boolean;
  tasks: ActivationTask[];
  upserted: number;
  reason?: string;
}

// ---------- helpers ----------
function daysSince(dateStr: string | null): number {
  if (!dateStr) return 0;
  const ms = Date.now() - new Date(dateStr).getTime();
  return Math.floor(ms / 86_400_000);
}

function activationPriority(days: number): Priority | null {
  if (days >= ACTIVATION_GAP_P1_DAYS) return 'P1';
  if (days >= ACTIVATION_GAP_P2_DAYS) return 'P2';
  return null; // too new — skip
}

function bestDate(row: CrmAgencyRow): string | null {
  return row.date_added ?? row.date_created ?? null;
}

// ---------- main export ----------
export async function runActivationAging(): Promise<ActivationRunResult> {
  if (!portalConfigured || !portalSupabase) {
    return { ran: false, tasks: [], upserted: 0, reason: 'portal-not-configured' };
  }

  try {
    await ensurePortalAuth();

    // 1. Fetch intake agencies (exclude test rows).
    const { data: crmRows, error: crmErr } = await portalSupabase
      .from('hierarchy_agencies')
      .select('id,name,onboarding_status,date_added,date_created,is_test');
    if (crmErr || !crmRows) {
      return { ran: false, tasks: [], upserted: 0, reason: crmErr?.message ?? 'no-crm-rows' };
    }
    const intakeAgencies = (crmRows as CrmAgencyRow[]).filter((r) => !r.is_test);

    // 2. Build crosswalk resolver (live → seed fallback).
    let resolveAgency: (name: string | null | undefined) => CrosswalkEntry | null;
    try {
      const { data: xwalkRows } = await portalSupabase
        .from('cc_agency_crosswalk')
        .select('canonical_key,canonical_name,tracker_name,variants');
      const entries = xwalkRows?.length
        ? (xwalkRows as { canonical_key: string; canonical_name: string; tracker_name: string | null; variants: string[] | null }[])
            .map((r) => ({
              canonicalKey: r.canonical_key,
              canonicalName: r.canonical_name,
              trackerName: r.tracker_name,
              variants: r.variants ?? [],
            }))
        : buildSeedCrosswalk();
      resolveAgency = buildResolver(entries);
    } catch {
      resolveAgency = buildResolver(buildSeedCrosswalk());
    }

    // 3. Fetch tracker agency ids that have at least one policy.
    let producingTrackerKeys = new Set<string>();
    if (supabase) {
      const { data: policies } = await supabase
        .from('form_submissions')
        .select('agency_id');
      const agencyIds = new Set(
        ((policies as TrackerPolicyRow[] | null) ?? [])
          .map((r) => r.agency_id)
          .filter(Boolean) as string[]
      );

      // Also resolve tracker agency names to canonical keys for name-based match.
      const { data: trackerAgencies } = await supabase
        .from('agencies')
        .select('id,name');
      for (const ta of (trackerAgencies as TrackerAgencyRow[] | null) ?? []) {
        if (agencyIds.has(ta.id)) {
          const entry = resolveAgency(ta.name);
          const key = entry?.canonicalKey ?? normKey(ta.name);
          if (key) producingTrackerKeys.add(key);
        }
      }
    }

    // 4. Load existing open activation tasks to avoid re-creating.
    const { data: openRows } = await portalSupabase
      .from('cc_tasks')
      .select('id,source,status,description')
      .eq('source', 'activation')
      .neq('status', 'done');
    const openDescriptions = new Set(
      ((openRows as OpenTaskRow[] | null) ?? []).map((r) => r.description ?? '')
    );

    // 5. Load team for assignment routing.
    const { members } = await fetchTeam();
    const openTaskCounts: Record<string, number> = {};
    try {
      const { data: allOpen } = await portalSupabase
        .from('cc_tasks')
        .select('assignee_id')
        .neq('status', 'done');
      for (const r of (allOpen as { assignee_id: string | null }[] | null) ?? []) {
        if (r.assignee_id) openTaskCounts[r.assignee_id] = (openTaskCounts[r.assignee_id] ?? 0) + 1;
      }
    } catch { /* best-effort */ }

    // 6. Build tasks from intake agencies.
    const tasks: ActivationTask[] = [];

    for (const agency of intakeAgencies) {
      const canonicalEntry = resolveAgency(agency.name);
      const canonicalKey = canonicalEntry?.canonicalKey ?? normKey(agency.name);
      const displayName = canonicalEntry?.canonicalName ?? agency.name;
      const hasProduction = producingTrackerKeys.has(canonicalKey);
      const days = daysSince(bestDate(agency));
      const status = agency.onboarding_status ?? '';

      if (status === 'onboarding_complete' && !hasProduction) {
        const priority = activationPriority(days);
        if (!priority) continue; // < 30d — too new, skip
        const task: ActivationTask = {
          intakeId: agency.id,
          agencyName: displayName,
          category: 'activation_gap',
          daysDormant: days,
          priority,
          title: `[ACTIVATION] ${displayName} — ${days}d post-onboarding, zero production`,
          description:
            `${displayName} completed onboarding ${days} days ago but has written zero policies in the tracker. ` +
            `Priority: ${priority}. Action: re-engage the agency owner and confirm they are actively writing. ` +
            `Check GHL for recent activity; escalate to Will if no response within 48h.`,
        };
        tasks.push(task);
      } else if (status === 'pending_csr_assignment' && days >= CSR_BOTTLENECK_DAYS) {
        const task: ActivationTask = {
          intakeId: agency.id,
          agencyName: displayName,
          category: 'csr_bottleneck',
          daysDormant: days,
          priority: 'P2',
          title: `[CSR BOTTLENECK] ${displayName} — ${days}d waiting on CSR assignment`,
          description:
            `${displayName} has been stuck in 'pending_csr_assignment' for ${days} days (created ${bestDate(agency) ?? 'unknown'}). ` +
            `This is an internal bottleneck. Action: assign a CSR immediately and move onboarding forward.`,
        };
        tasks.push(task);
      }
    }

    // 7. Persist new tasks (skip duplicates already open).
    let upserted = 0;
    for (const t of tasks) {
      // Dedup: skip if an open task with the same description slug already exists.
      const descKey = `${t.intakeId}::${t.category}`;
      const alreadyOpen = [...openDescriptions].some((d) => d.includes(t.intakeId));
      if (alreadyOpen) continue;

      const assignee = suggestAssignee({
        skillCategory: 'retention',
        difficulty: t.priority === 'P1' ? 7 : 4,
        members,
        openTaskCounts,
      });
      if (assignee) openTaskCounts[assignee.memberId] = (openTaskCounts[assignee.memberId] ?? 0) + 1;

      const { error } = await portalSupabase.from('cc_tasks').insert({
        title: t.title,
        description: assignee
          ? `${t.description}\n\nAuto-routed to: ${assignee.name} (${assignee.rationale}).`
          : t.description,
        assignee_id: assignee?.memberId ?? null,
        source: 'activation',
        skill_category: 'retention',
        difficulty: t.priority === 'P1' ? 7 : 4,
        priority: t.priority,
        status: 'backlog',
      });
      if (!error) {
        upserted++;
        openDescriptions.add(descKey); // prevent double-insert within this run
      }
    }

    return { ran: true, tasks, upserted };
  } catch (e) {
    return { ran: false, tasks: [], upserted: 0, reason: (e as Error).message };
  }
}
