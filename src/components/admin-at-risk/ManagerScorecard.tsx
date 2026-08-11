/**
 * ManagerScorecard — Admin oversight of manager performance on at-risk cases.
 *
 * Groups policies by agency (since managers work at the agency level),
 * showing assigned cases, activity, save rate, and Code Red count.
 * Expandable rows drill into individual cases.
 *
 * Note: "manager" here maps to agency-level responsibility. The assigned_to
 * field in atrisk_tasks identifies who's working the case.
 */
import { useState, useMemo } from 'react';
import {
  Users, ChevronDown, ChevronRight,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { AdminAtRiskPolicy } from './types';
import { STAGE_LABELS } from './types';

interface ManagerScorecardProps {
  policies: AdminAtRiskPolicy[];
  loading?: boolean;
}

interface AgencyRow {
  agencyId: string;
  totalCases: number;
  inPipeline: number;
  codeRed: number;
  saved: number;
  lost: number;
  saveRate: number;
  premiumAtRisk: number;
  avgDaysIdle: number;
  policies: AdminAtRiskPolicy[];
}

export function ManagerScorecard({ policies, loading }: ManagerScorecardProps) {
  const [expandedAgency, setExpandedAgency] = useState<string | null>(null);

  const agencies = useMemo(() => {
    const map = new Map<string, AdminAtRiskPolicy[]>();
    for (const p of policies) {
      const key = p.agency_id || 'unknown';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(p);
    }

    const rows: AgencyRow[] = [];
    for (const [agencyId, pols] of map) {
      const inPipeline = pols.filter(p => p.task_stage !== null).length;
      const codeRed = pols.filter(p => p.task_stage === 'code_red').length;
      const saved = pols.filter(p => p.task_stage === 'saved').length;
      const lost = pols.filter(p => p.task_stage === 'lost').length;
      const resolved = saved + lost;
      const saveRate = resolved > 0 ? Math.round((saved / resolved) * 100) : 0;
      const premiumAtRisk = pols.reduce((s, p) => s + (p.plan_premium || 0), 0);
      const avgDaysIdle = pols.length > 0
        ? Math.round(pols.reduce((s, p) => s + p.days_idle, 0) / pols.length)
        : 0;

      rows.push({
        agencyId,
        totalCases: pols.length,
        inPipeline,
        codeRed,
        saved,
        lost,
        saveRate,
        premiumAtRisk,
        avgDaysIdle,
        policies: pols.sort((a, b) => b.days_idle - a.days_idle),
      });
    }

    // Sort by total cases descending
    rows.sort((a, b) => b.totalCases - a.totalCases);
    return rows;
  }, [policies]);

  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map(i => <div key={i} className="h-14 rounded-xl shimmer" />)}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Section header */}
      <div className="flex items-center gap-2">
        <div className="p-1.5 rounded-lg bg-indigo-500/10">
          <Users size={16} className="text-indigo-400" />
        </div>
        <div>
          <h3 className="text-sm font-bold text-foreground">Manager Scorecard</h3>
          <p className="text-[11px] text-muted-foreground">
            {agencies.length} agencies with at-risk cases — expand to see details
          </p>
        </div>
      </div>

      {agencies.length === 0 ? (
        <Card className="border-border">
          <CardContent className="py-8 text-center text-muted-foreground text-sm">
            No agencies with at-risk cases.
          </CardContent>
        </Card>
      ) : (
        <div className="border border-border rounded-xl overflow-hidden">
          {/* Table header */}
          <div className="grid grid-cols-8 gap-2 px-4 py-2.5 bg-muted/30 text-[10px] font-bold text-muted-foreground uppercase tracking-wider border-b border-border">
            <div className="col-span-2">Agency</div>
            <div className="text-center">Cases</div>
            <div className="text-center">In Pipeline</div>
            <div className="text-center">Code Red</div>
            <div className="text-center">Save Rate</div>
            <div className="text-center">Premium</div>
            <div className="text-center">Avg Days</div>
          </div>

          {/* Rows */}
          {agencies.map(agency => {
            const isExpanded = expandedAgency === agency.agencyId;

            return (
              <div key={agency.agencyId}>
                {/* Agency row */}
                <button
                  onClick={() => setExpandedAgency(isExpanded ? null : agency.agencyId)}
                  className="w-full grid grid-cols-8 gap-2 px-4 py-3 text-xs hover:bg-muted/20 transition-colors border-b border-border/50 items-center"
                >
                  <div className="col-span-2 flex items-center gap-2 text-left">
                    {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    <span className="font-semibold text-foreground truncate">
                      {agency.agencyId}
                    </span>
                  </div>
                  <div className="text-center font-bold text-foreground">{agency.totalCases}</div>
                  <div className="text-center text-muted-foreground">
                    {agency.inPipeline}
                  </div>
                  <div className={cn('text-center font-bold', agency.codeRed > 0 ? 'text-rose-400' : 'text-muted-foreground')}>
                    {agency.codeRed}
                  </div>
                  <div className={cn(
                    'text-center font-bold',
                    agency.saveRate >= 50 ? 'text-emerald-400' : agency.saveRate > 0 ? 'text-amber-400' : 'text-muted-foreground'
                  )}>
                    {agency.saveRate}%
                  </div>
                  <div className="text-center text-muted-foreground">
                    ${Math.round(agency.premiumAtRisk / 1000)}K
                  </div>
                  <div className={cn('text-center', agency.avgDaysIdle >= 30 ? 'text-rose-400 font-bold' : 'text-muted-foreground')}>
                    {agency.avgDaysIdle}d
                  </div>
                </button>

                {/* Expanded case list */}
                {isExpanded && (
                  <div className="bg-muted/10 border-b border-border">
                    <div className="grid grid-cols-7 gap-2 px-6 py-2 text-[9px] font-bold text-muted-foreground uppercase tracking-wider border-b border-border/30">
                      <div className="col-span-2">Client / Policy</div>
                      <div>Product</div>
                      <div>Stage</div>
                      <div className="text-center">Days Idle</div>
                      <div className="text-right">Premium</div>
                      <div>Flag</div>
                    </div>
                    {agency.policies.map(p => (
                      <div
                        key={p.policy_number}
                        className="grid grid-cols-7 gap-2 px-6 py-2 text-[11px] border-b border-border/20 hover:bg-muted/20"
                      >
                        <div className="col-span-2 truncate">
                          <span className="font-semibold text-foreground">
                            {p.client_name || 'Unknown'}
                          </span>
                          <span className="text-muted-foreground ml-1.5 text-[10px]">
                            {p.policy_number}
                          </span>
                        </div>
                        <div className="text-muted-foreground">{p.product_type}</div>
                        <div>
                          {p.task_stage ? (
                            <span className={cn(
                              'inline-flex px-1.5 py-0.5 rounded text-[9px] font-bold',
                              p.task_stage === 'code_red' && 'bg-rose-500/20 text-rose-400',
                              p.task_stage === 'saved' && 'bg-emerald-500/20 text-emerald-400',
                              p.task_stage === 'lost' && 'bg-zinc-500/20 text-zinc-400',
                              !['code_red', 'saved', 'lost'].includes(p.task_stage) && 'bg-sky-500/20 text-sky-400',
                            )}>
                              {STAGE_LABELS[p.task_stage] || p.task_stage}
                            </span>
                          ) : (
                            <span className="text-muted-foreground/50 text-[10px]">—</span>
                          )}
                        </div>
                        <div className={cn(
                          'text-center font-mono',
                          p.days_idle >= 30 ? 'text-rose-400 font-bold' : p.days_idle >= 15 ? 'text-amber-400' : 'text-muted-foreground'
                        )}>
                          {p.days_idle}d
                        </div>
                        <div className="text-right text-muted-foreground font-mono">
                          ${Math.round(p.plan_premium)}
                        </div>
                        <div className="text-[10px] text-muted-foreground">
                          {(p.flag_type || 'at_risk').replace(/_/g, ' ')}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
