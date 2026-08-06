/**
 * CarrierUploadReportPanel — Shows the three-tier match report after upload.
 *
 * Layout:
 * - Summary KPI cards (total agents, exact, fuzzy, no-match, agencies, conflicts)
 * - Exact matches section (collapsed by default — already applied)
 * - Fuzzy matches section (needs approve/reject per item)
 * - No matches section (needs tie/add-new/skip per item)
 * - Agency matches section (collapsible)
 * - "Apply All Resolutions" button to commit fuzzy/no-match decisions
 */
import { useState, useMemo, useCallback } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  CheckCircle2,
  AlertCircle,
  XCircle,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Users,
  Building2,
  Loader2,
  RotateCcw,
  ArrowRight,
  Link2,
} from 'lucide-react';
import type {
  CarrierUploadReport,
  AgencyMatchResult,
  SupportedCarrier,
} from '@/lib/carrier-upload';
import {
  resolveMatch,
  applySingleAgentMatch,
  addNewAgentFromCarrier,
} from '@/lib/carrier-upload';
import { FuzzyMatchRow } from './FuzzyMatchRow';
import { NoMatchRow } from './NoMatchRow';

// ─── Resolution State ────────────────────────────────────────────────────────

export type FuzzyResolution =
  | { action: 'approve' }
  | { action: 'reject' }
  | { action: 'tie'; agentId: string; agentName: string }
  | null;

export type NoMatchResolution =
  | { action: 'tie'; agentId: string; agentName: string }
  | { action: 'add-new' }
  | { action: 'skip' }
  | null;

interface Props {
  report: CarrierUploadReport;
  supabase: SupabaseClient;
  onReset: () => void;
}

export function CarrierUploadReportPanel({ report, supabase, onReset }: Props) {
  const { summary, agent_results, agency_results, carrier } = report;

  // Count alias-resolved items (these auto-resolved from prior uploads)
  const aliasResolvedCount = useMemo(
    () => agent_results.filter((r) => r.alias_resolved).length,
    [agent_results],
  );
  const agencyAliasResolvedCount = useMemo(
    () => agency_results.filter((r) => r.alias_resolved).length,
    [agency_results],
  );

  // Partition agents by tier
  const exactMatches = useMemo(
    () => agent_results.filter((r) => r.match_tier === 'exact'),
    [agent_results],
  );
  const fuzzyMatches = useMemo(
    () => agent_results.filter((r) => r.match_tier === 'fuzzy'),
    [agent_results],
  );
  const noMatches = useMemo(
    () => agent_results.filter((r) => r.match_tier === 'none'),
    [agent_results],
  );

  // Collapsible sections
  const [showExact, setShowExact] = useState(false);
  const [showAgencies, setShowAgencies] = useState(false);

  // Resolution state — keyed by carrier_agent.raw_name (unique per report)
  const [fuzzyResolutions, setFuzzyResolutions] = useState<
    Record<string, FuzzyResolution>
  >({});
  const [noMatchResolutions, setNoMatchResolutions] = useState<
    Record<string, NoMatchResolution>
  >({});

  // Apply state
  const [applying, setApplying] = useState(false);
  const [applyProgress, setApplyProgress] = useState('');
  const [applyResult, setApplyResult] = useState<{
    applied: number;
    added: number;
    skipped: number;
    errors: string[];
  } | null>(null);

  const setFuzzyRes = useCallback(
    (key: string, res: FuzzyResolution) => {
      setFuzzyResolutions((prev) => ({ ...prev, [key]: res }));
    },
    [],
  );

  const setNoMatchRes = useCallback(
    (key: string, res: NoMatchResolution) => {
      setNoMatchResolutions((prev) => ({ ...prev, [key]: res }));
    },
    [],
  );

  // Count resolved items
  const fuzzyResolved = Object.values(fuzzyResolutions).filter(
    (r) => r !== null,
  ).length;
  const noMatchResolved = Object.values(noMatchResolutions).filter(
    (r) => r !== null,
  ).length;
  const totalNeedingReview = fuzzyMatches.length + noMatches.length;
  const totalResolved = fuzzyResolved + noMatchResolved;

  // ─── Apply All Resolutions ─────────────────────────────────────────────────

  const handleApplyAll = async () => {
    setApplying(true);
    setApplyResult(null);
    let applied = 0;
    let added = 0;
    let skipped = 0;
    const errors: string[] = [];

    // Apply fuzzy resolutions
    for (const match of fuzzyMatches) {
      const key = match.carrier_agent.raw_name;
      const res = fuzzyResolutions[key];
      if (!res) {
        skipped++;
        continue;
      }

      try {
        if (res.action === 'approve' && match.matched_agent_id) {
          setApplyProgress(`Applying: ${match.carrier_agent.raw_name}`);
          // Create alias + apply match
          await resolveMatch(
            supabase,
            carrier as SupportedCarrier,
            'agent',
            match.carrier_agent.raw_name,
            match.carrier_agent.carrier_writing_number,
            match.matched_agent_id,
          );
          await applySingleAgentMatch(
            supabase,
            carrier as SupportedCarrier,
            match.matched_agent_id,
            match.carrier_agent.carrier_writing_number,
            match.carrier_agent.status,
          );
          applied++;
        } else if (res.action === 'tie' && res.agentId) {
          setApplyProgress(`Tying: ${match.carrier_agent.raw_name} → ${res.agentName}`);
          await resolveMatch(
            supabase,
            carrier as SupportedCarrier,
            'agent',
            match.carrier_agent.raw_name,
            match.carrier_agent.carrier_writing_number,
            res.agentId,
          );
          await applySingleAgentMatch(
            supabase,
            carrier as SupportedCarrier,
            res.agentId,
            match.carrier_agent.carrier_writing_number,
            match.carrier_agent.status,
          );
          applied++;
        } else if (res.action === 'reject') {
          skipped++;
        }
      } catch (err: any) {
        errors.push(`${match.carrier_agent.raw_name}: ${err?.message || 'Failed'}`);
      }
    }

    // Apply no-match resolutions
    for (const match of noMatches) {
      const key = match.carrier_agent.raw_name;
      const res = noMatchResolutions[key];
      if (!res) {
        skipped++;
        continue;
      }

      try {
        if (res.action === 'tie' && res.agentId) {
          setApplyProgress(`Tying: ${match.carrier_agent.raw_name} → ${res.agentName}`);
          await resolveMatch(
            supabase,
            carrier as SupportedCarrier,
            'agent',
            match.carrier_agent.raw_name,
            match.carrier_agent.carrier_writing_number,
            res.agentId,
          );
          await applySingleAgentMatch(
            supabase,
            carrier as SupportedCarrier,
            res.agentId,
            match.carrier_agent.carrier_writing_number,
            match.carrier_agent.status,
          );
          applied++;
        } else if (res.action === 'add-new') {
          setApplyProgress(`Adding new: ${match.carrier_agent.raw_name}`);
          await addNewAgentFromCarrier(supabase, carrier as SupportedCarrier, {
            first_name: match.carrier_agent.first_name,
            last_name: match.carrier_agent.last_name,
            email: match.carrier_agent.email,
            phone: match.carrier_agent.phone,
            carrier_writing_number: match.carrier_agent.carrier_writing_number,
            status: match.carrier_agent.status,
            agency: match.carrier_agent.agency_name,
          });
          added++;
        } else if (res.action === 'skip') {
          skipped++;
        }
      } catch (err: any) {
        errors.push(`${match.carrier_agent.raw_name}: ${err?.message || 'Failed'}`);
      }
    }

    setApplyProgress('');
    setApplyResult({ applied, added, skipped, errors });
    setApplying(false);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            {carrier} Upload Report
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {report.file_name} · {report.timestamp}
          </p>
        </div>
        <button
          onClick={onReset}
          className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border text-sm font-medium text-foreground/80 hover:bg-secondary/30"
        >
          <RotateCcw className="w-4 h-4" /> Upload Another
        </button>
      </div>

      {/* Summary KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        <KpiCard
          label="Total Agents"
          value={summary.total_agents}
          icon={Users}
          color="text-foreground"
        />
        <KpiCard
          label="Exact Matches"
          value={summary.exact_matches}
          icon={CheckCircle2}
          color="text-emerald-400"
          bgColor="bg-emerald-500/10"
          borderColor="border-emerald-500/20"
        />
        <KpiCard
          label="Alias Resolved"
          value={aliasResolvedCount}
          icon={Link2}
          color="text-purple-400"
          bgColor="bg-purple-500/10"
          borderColor="border-purple-500/20"
          subtitle={aliasResolvedCount > 0 ? 'from prior uploads' : undefined}
        />
        <KpiCard
          label="Fuzzy Matches"
          value={summary.fuzzy_matches}
          icon={AlertCircle}
          color="text-amber-400"
          bgColor="bg-amber-500/10"
          borderColor="border-amber-500/20"
        />
        <KpiCard
          label="No Matches"
          value={summary.no_matches}
          icon={XCircle}
          color="text-red-400"
          bgColor="bg-red-500/10"
          borderColor="border-red-500/20"
        />
        <KpiCard
          label="Agencies"
          value={summary.total_agencies}
          icon={Building2}
          color="text-cyan-400"
        />
        <KpiCard
          label="WN Conflicts"
          value={summary.writing_number_conflicts}
          icon={AlertTriangle}
          color={summary.writing_number_conflicts > 0 ? 'text-orange-400' : 'text-muted-foreground'}
          bgColor={summary.writing_number_conflicts > 0 ? 'bg-orange-500/10' : undefined}
          borderColor={summary.writing_number_conflicts > 0 ? 'border-orange-500/20' : undefined}
        />
      </div>

      {/* Alias learning callout — shows when aliases saved time */}
      {aliasResolvedCount > 0 && (
        <div className="flex items-center gap-3 bg-purple-500/10 border border-purple-500/20 rounded-lg px-5 py-3">
          <Link2 className="w-5 h-5 text-purple-400 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-purple-300">
              {aliasResolvedCount} agent{aliasResolvedCount !== 1 ? 's' : ''}
              {agencyAliasResolvedCount > 0 && ` + ${agencyAliasResolvedCount} agenc${agencyAliasResolvedCount !== 1 ? 'ies' : 'y'}`}
              {' '}auto-resolved from prior uploads
            </p>
            <p className="text-xs text-purple-400/70">
              These matched instantly via aliases saved from previous manual resolutions — no review needed.
            </p>
          </div>
        </div>
      )}

      {/* Exact matches — collapsed summary */}
      {exactMatches.length > 0 && (
        <CollapsibleSection
          title={`Exact Matches — ${exactMatches.length} auto-applied`}
          subtitle={`Carrier tags and writing numbers already written${aliasResolvedCount > 0 ? ` (${aliasResolvedCount} via alias)` : ''}`}
          icon={CheckCircle2}
          iconColor="text-emerald-400"
          open={showExact}
          onToggle={() => setShowExact(!showExact)}
          badge={
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400">
              Done
            </span>
          }
        >
          <div className="overflow-x-auto max-h-72">
            <table className="w-full text-sm">
              <thead className="bg-secondary/20 sticky top-0">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">
                    Carrier Name
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">
                    Matched To
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">
                    Writing #
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">
                    Status
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">
                    Via
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {exactMatches.map((m, i) => (
                  <tr key={i} className={m.writing_number_conflict ? 'bg-orange-500/5' : ''}>
                    <td className="px-4 py-2 font-medium text-foreground">
                      {m.carrier_agent.raw_name}
                    </td>
                    <td className="px-4 py-2 text-foreground/80">
                      {m.matched_agent_name}
                    </td>
                    <td className="px-4 py-2 text-foreground/80 font-mono text-xs">
                      {m.carrier_agent.carrier_writing_number}
                      {m.writing_number_conflict && (
                        <span className="ml-2 text-orange-400 text-[10px]">
                          ⚠ was {m.existing_writing_number}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      <StatusBadge status={m.carrier_agent.status} />
                    </td>
                    <td className="px-4 py-2 text-xs">
                      {m.alias_resolved ? (
                        <span className="inline-flex items-center gap-1 text-purple-400 font-semibold">
                          <Link2 className="w-3 h-3" /> Alias
                        </span>
                      ) : (
                        <span className="text-muted-foreground">Name</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CollapsibleSection>
      )}

      {/* Fuzzy matches — needs review */}
      {fuzzyMatches.length > 0 && (
        <div className="bg-card border border-amber-500/20 rounded-lg overflow-hidden">
          <div className="px-6 py-4 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-amber-400" />
              <div>
                <p className="text-sm font-bold text-foreground">
                  Fuzzy Matches — {fuzzyMatches.length} need review
                </p>
                <p className="text-xs text-muted-foreground">
                  {fuzzyResolved} of {fuzzyMatches.length} resolved
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  const all: Record<string, FuzzyResolution> = {};
                  fuzzyMatches.forEach((m) => {
                    all[m.carrier_agent.raw_name] = { action: 'approve' };
                  });
                  setFuzzyResolutions(all);
                }}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/20"
              >
                Approve All
              </button>
              <button
                onClick={() => {
                  const all: Record<string, FuzzyResolution> = {};
                  fuzzyMatches.forEach((m) => {
                    all[m.carrier_agent.raw_name] = { action: 'reject' };
                  });
                  setFuzzyResolutions(all);
                }}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20"
              >
                Reject All
              </button>
            </div>
          </div>
          <div className="divide-y divide-border">
            {fuzzyMatches.map((m, i) => (
              <FuzzyMatchRow
                key={i}
                match={m}
                resolution={fuzzyResolutions[m.carrier_agent.raw_name] ?? null}
                onResolve={(res) => setFuzzyRes(m.carrier_agent.raw_name, res)}
                supabase={supabase}
              />
            ))}
          </div>
        </div>
      )}

      {/* No matches — needs review */}
      {noMatches.length > 0 && (
        <div className="bg-card border border-red-500/20 rounded-lg overflow-hidden">
          <div className="px-6 py-4 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-3">
              <XCircle className="w-5 h-5 text-red-400" />
              <div>
                <p className="text-sm font-bold text-foreground">
                  No Matches — {noMatches.length} unrecognized
                </p>
                <p className="text-xs text-muted-foreground">
                  {noMatchResolved} of {noMatches.length} resolved
                </p>
              </div>
            </div>
            <button
              onClick={() => {
                const all: Record<string, NoMatchResolution> = {};
                noMatches.forEach((m) => {
                  all[m.carrier_agent.raw_name] = { action: 'skip' };
                });
                setNoMatchResolutions(all);
              }}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-secondary/40 text-foreground/70 hover:bg-secondary/60 border border-border"
            >
              Skip All
            </button>
          </div>
          <div className="divide-y divide-border">
            {noMatches.map((m, i) => (
              <NoMatchRow
                key={i}
                match={m}
                carrier={carrier as SupportedCarrier}
                resolution={noMatchResolutions[m.carrier_agent.raw_name] ?? null}
                onResolve={(res) => setNoMatchRes(m.carrier_agent.raw_name, res)}
                supabase={supabase}
              />
            ))}
          </div>
        </div>
      )}

      {/* Agency matches */}
      {agency_results.length > 0 && (
        <CollapsibleSection
          title={`Agency Matches — ${summary.agency_exact} exact, ${summary.agency_fuzzy} fuzzy, ${summary.agency_no_match} unmatched`}
          icon={Building2}
          iconColor="text-cyan-400"
          open={showAgencies}
          onToggle={() => setShowAgencies(!showAgencies)}
        >
          <div className="overflow-x-auto max-h-72">
            <table className="w-full text-sm">
              <thead className="bg-secondary/20 sticky top-0">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">
                    Carrier Agency
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">
                    Carrier #
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">
                    Match
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">
                    Matched To
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">
                    Confidence
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {agency_results.map((a, i) => (
                  <AgencyRow key={i} match={a} />
                ))}
              </tbody>
            </table>
          </div>
        </CollapsibleSection>
      )}

      {/* Apply All / Results */}
      {totalNeedingReview > 0 && !applyResult && (
        <div className="flex items-center justify-between bg-card border border-border rounded-lg px-6 py-4">
          <div className="text-sm text-foreground/80">
            <span className="font-semibold text-foreground">{totalResolved}</span> of{' '}
            <span className="font-semibold text-foreground">{totalNeedingReview}</span>{' '}
            items resolved
          </div>
          <button
            onClick={handleApplyAll}
            disabled={applying || totalResolved === 0}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg gradient-primary text-primary-foreground text-sm font-semibold disabled:opacity-50"
          >
            {applying ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {applyProgress || 'Applying…'}
              </>
            ) : (
              <>
                <ArrowRight className="w-4 h-4" />
                Apply {totalResolved} Resolution{totalResolved !== 1 ? 's' : ''}
              </>
            )}
          </button>
        </div>
      )}

      {/* Apply results */}
      {applyResult && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-emerald-500/10 rounded-lg border border-emerald-500/20 p-4 text-center">
              <CheckCircle2 className="w-6 h-6 text-emerald-400 mx-auto mb-1" />
              <p className="text-2xl font-bold text-emerald-400">{applyResult.applied}</p>
              <p className="text-xs text-emerald-400/80 font-medium">Matched & Applied</p>
            </div>
            <div className="bg-cyan-500/10 rounded-lg border border-cyan-500/20 p-4 text-center">
              <Users className="w-6 h-6 text-cyan-400 mx-auto mb-1" />
              <p className="text-2xl font-bold text-cyan-400">{applyResult.added}</p>
              <p className="text-xs text-cyan-400/80 font-medium">Added as New</p>
            </div>
            <div className="bg-secondary/40 rounded-lg border border-border p-4 text-center">
              <XCircle className="w-6 h-6 text-muted-foreground mx-auto mb-1" />
              <p className="text-2xl font-bold text-foreground/60">{applyResult.skipped}</p>
              <p className="text-xs text-muted-foreground font-medium">Skipped</p>
            </div>
          </div>

          {applyResult.errors.length > 0 && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4">
              <p className="text-sm font-semibold text-red-400 mb-2">
                {applyResult.errors.length} error{applyResult.errors.length !== 1 ? 's' : ''}
              </p>
              <ul className="text-xs text-red-400/80 space-y-1">
                {applyResult.errors.map((e, i) => (
                  <li key={i}>• {e}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Sub-Components ──────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  icon: Icon,
  color,
  bgColor,
  borderColor,
  subtitle,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  bgColor?: string;
  borderColor?: string;
  subtitle?: string;
}) {
  return (
    <div
      className={`rounded-lg border p-3 text-center ${bgColor || 'bg-card'} ${borderColor || 'border-border'}`}
    >
      <Icon className={`w-5 h-5 mx-auto mb-1 ${color}`} />
      <p className={`text-xl font-bold ${color}`}>{value}</p>
      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
        {label}
      </p>
      {subtitle && (
        <p className="text-[9px] text-muted-foreground mt-0.5">{subtitle}</p>
      )}
    </div>
  );
}

function CollapsibleSection({
  title,
  subtitle,
  icon: Icon,
  iconColor,
  open,
  onToggle,
  badge,
  children,
}: {
  title: string;
  subtitle?: string;
  icon: React.ComponentType<{ className?: string }>;
  iconColor: string;
  open: boolean;
  onToggle: () => void;
  badge?: React.ReactNode;
  children: React.ReactNode;
}) {
  const Chevron = open ? ChevronDown : ChevronRight;
  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full px-6 py-4 flex items-center justify-between hover:bg-secondary/10 transition-colors"
      >
        <div className="flex items-center gap-3">
          <Icon className={`w-5 h-5 ${iconColor}`} />
          <div className="text-left">
            <p className="text-sm font-bold text-foreground">{title}</p>
            {subtitle && (
              <p className="text-xs text-muted-foreground">{subtitle}</p>
            )}
          </div>
          {badge}
        </div>
        <Chevron className="w-4 h-4 text-muted-foreground" />
      </button>
      {open && children}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    active: 'bg-emerald-500/10 text-emerald-400',
    pending: 'bg-amber-500/10 text-amber-400',
    terminated: 'bg-red-500/10 text-red-400',
  };
  return (
    <span
      className={`inline-flex text-xs font-semibold px-2 py-0.5 rounded-full ${colors[status] || 'bg-secondary/40 text-muted-foreground'}`}
    >
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

function AgencyRow({ match }: { match: AgencyMatchResult }) {
  const tierColors: Record<string, string> = {
    exact: 'text-emerald-400',
    fuzzy: 'text-amber-400',
    none: 'text-red-400',
  };
  return (
    <tr>
      <td className="px-4 py-2 font-medium text-foreground">
        {match.carrier_agency.raw_name}
      </td>
      <td className="px-4 py-2 text-foreground/80 font-mono text-xs">
        {match.carrier_agency.carrier_number}
      </td>
      <td className="px-4 py-2">
        <span className={`text-xs font-semibold ${tierColors[match.match_tier]}`}>
          {match.match_tier === 'exact'
            ? '✓ Exact'
            : match.match_tier === 'fuzzy'
              ? '~ Fuzzy'
              : '✗ None'}
        </span>
      </td>
      <td className="px-4 py-2 text-foreground/80">
        {match.matched_agency_name || '—'}
      </td>
      <td className="px-4 py-2 text-xs text-muted-foreground">
        {match.confidence !== null ? `${match.confidence}%` : '—'}
      </td>
    </tr>
  );
}
