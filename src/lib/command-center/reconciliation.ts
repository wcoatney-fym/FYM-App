/**
 * @crm-protected
 * DO NOT MODIFY without Charlie's explicit approval.
 * This file is part of CRM Ops (OpenClaw Dashboard).
 * Table references use hierarchy_agencies (NOT crm_agencies).
 * Any rename or schema change to hierarchy_agencies requires updating this file.
 * See: docs/CRM_OPS_FILES.md for the full protected file list.
 */
/**
 * reconciliation.ts — intake ⇄ production data-integrity engine.
 *
 * Compares what the agency intake form captured (contracting-portal
 * `crm_agencies`) against what actually shows in production (the Activity
 * Tracker / UNL file). Emits typed issues at three severities so the internal
 * team can act. Pure + side-effect-free so it is trivially testable; the
 * runner in reconciliation-run.ts feeds it live data and persists results.
 *
 * Severity model:
 *   - 'critical' 🔴 identity-key conflict (NPN/EIN mismatch). Blocks a clean
 *                   handoff; becomes a P1 task.
 *   - 'warning'  🟡 soft drift (name/carrier/roster). Surfaced, non-blocking.
 *   - 'pending'  🔵 expected gap for a brand-new agency (no production yet).
 *                   NOT an error — tracked as "awaiting first production".
 *
 * Guardrail: this DETECTS and FLAGS only. It never edits production or intake.
 */

export type IssueCategory =
  | 'agency_npn'
  | 'principal_npn'
  | 'ein'
  | 'name'
  | 'carriers'
  | 'activation';

export type IssueSeverity = 'critical' | 'warning' | 'pending';

export interface IntakeAgency {
  intakeId: string;
  name: string;
  agencyNpn?: string | null;
  principalAgentNpn?: string | null;
  ein?: string | null;
  carriers?: string[] | null;
}

/** Aggregated production facts for one agency (from the tracker/UNL). */
export interface ProductionAgency {
  /** Whether ANY production rows exist for this agency. */
  hasProduction: boolean;
  name?: string | null;
  agencyNpns?: string[];
  agentNpns?: string[];
  carriers?: string[];
}

export interface ReconIssue {
  category: IssueCategory;
  severity: IssueSeverity;
  agencyName: string;
  intakeId: string;
  intakeValue: string | null;
  productionValue: string | null;
  detail: string;
}

/** Digits-only normalization for NPN/EIN comparison. */
export function normId(v: string | null | undefined): string {
  return (v ?? '').replace(/\D/g, '');
}

/** Lowercased, punctuation-stripped agency name for fuzzy compare. */
export function normName(v: string | null | undefined): string {
  return (v ?? '')
    .toLowerCase()
    .replace(/\b(llc|inc|incorporated|group|insurance|agency|the|co|company)\b/g, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

function includesId(list: string[] | undefined, target: string): boolean {
  if (!target) return false;
  return (list ?? []).some((x) => normId(x) === target);
}

/**
 * Compare one agency's intake record against its production facts.
 * Returns zero or more issues. A brand-new agency (no production) yields a
 * single 'pending' activation issue and nothing else — never false criticals.
 */
export function reconcileAgency(intake: IntakeAgency, prod: ProductionAgency): ReconIssue[] {
  const base = { agencyName: intake.name, intakeId: intake.intakeId };

  // Brand-new agency: no production to reconcile against yet.
  if (!prod.hasProduction) {
    return [{
      ...base,
      category: 'activation',
      severity: 'pending',
      intakeValue: intake.agencyNpn ?? null,
      productionValue: null,
      detail: 'Awaiting first production — no UNL policies yet. Watch for this NPN to appear.',
    }];
  }

  const issues: ReconIssue[] = [];

  // Agency NPN — hard identity key.
  const aNpn = normId(intake.agencyNpn);
  if (aNpn && (prod.agencyNpns?.length || prod.agentNpns?.length)) {
    const found = includesId(prod.agencyNpns, aNpn) || includesId(prod.agentNpns, aNpn);
    if (!found) {
      issues.push({
        ...base, category: 'agency_npn', severity: 'critical',
        intakeValue: intake.agencyNpn ?? null,
        productionValue: (prod.agencyNpns ?? []).join(', ') || null,
        detail: 'Intake agency NPN not found anywhere in this agency\u2019s production.',
      });
    }
  }

  // Principal agent NPN.
  const pNpn = normId(intake.principalAgentNpn);
  if (pNpn && prod.agentNpns?.length && !includesId(prod.agentNpns, pNpn)) {
    issues.push({
      ...base, category: 'principal_npn', severity: 'critical',
      intakeValue: intake.principalAgentNpn ?? null,
      productionValue: (prod.agentNpns ?? []).slice(0, 5).join(', ') || null,
      detail: 'Principal-agent NPN from intake is not among the agents writing under this agency.',
    });
  }

  // Name drift (fuzzy) — soft.
  if (prod.name && normName(intake.name) && normName(intake.name) !== normName(prod.name)) {
    issues.push({
      ...base, category: 'name', severity: 'warning',
      intakeValue: intake.name, productionValue: prod.name,
      detail: 'Agency name differs between intake and production (possible typo/DBA drift).',
    });
  }

  // Carrier drift — soft. Contracted-for carrier with zero production.
  const intakeCarriers = (intake.carriers ?? []).map((c) => c.toUpperCase());
  const prodCarriers = (prod.carriers ?? []).map((c) => c.toUpperCase());
  if (intakeCarriers.length && prodCarriers.length) {
    const writingUncontracted = prodCarriers.filter((c) => !intakeCarriers.includes(c));
    if (writingUncontracted.length) {
      issues.push({
        ...base, category: 'carriers', severity: 'warning',
        intakeValue: intakeCarriers.join(', '),
        productionValue: prodCarriers.join(', '),
        detail: `Writing carrier(s) not on the intake contract: ${writingUncontracted.join(', ')}.`,
      });
    }
  }

  return issues;
}

/** Reconcile a batch. */
export function reconcileAll(
  intakes: IntakeAgency[],
  prodByIntakeId: Map<string, ProductionAgency>,
): ReconIssue[] {
  const out: ReconIssue[] = [];
  for (const intake of intakes) {
    const prod = prodByIntakeId.get(intake.intakeId) ?? { hasProduction: false };
    out.push(...reconcileAgency(intake, prod));
  }
  return out;
}

/** Map a reconciliation severity to a task priority for the task-HQ feed. */
export function severityToPriority(sev: IssueSeverity): 'P1' | 'P2' | 'P3' {
  return sev === 'critical' ? 'P1' : sev === 'warning' ? 'P2' : 'P3';
}
