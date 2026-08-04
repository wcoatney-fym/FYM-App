/**
 * Agent Detail — Quality Tab (§11.3.3)
 *
 * Four KPI tiles in §13.7 priority order:
 *   Policies Taken (PRIMARY) → 30d Retention → 9-mo Persistency → UW Share
 *
 * Below: retention breakdown showing draft distribution and at-risk policy breakdown.
 *
 * Note: 30d retention, 9-mo persistency, and UW share require cohort-level data
 * from Max's prod DB. For now, we compute what we can from policy_cache and show
 * placeholders for metrics that need prod DB views (marked INTERIM).
 */
import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { StaggerContainer, StaggerItem, CountUp, RadialGauge } from '@/components/ui/animated';
import { ShieldCheck, AlertTriangle, FileText, HelpCircle } from 'lucide-react';
import type { AgentStats, PolicyRow } from '../types';
import { fmtNum, retentionColor } from '../helpers';

interface QualityTabProps {
  stats: AgentStats;
  policies: PolicyRow[];
}

export function QualityTab({ stats, policies }: QualityTabProps) {
  // Draft distribution for retention visualization
  const draftDist = useMemo(() => {
    const dist = { zero: 0, one: 0, two: 0, three_plus: 0 };
    policies.forEach(p => {
      if (p.draft_count >= 3) dist.three_plus++;
      else if (p.draft_count === 2) dist.two++;
      else if (p.draft_count === 1) dist.one++;
      else dist.zero++;
    });
    return dist;
  }, [policies]);

  // At-risk breakdown by flag type
  const flagBreakdown = useMemo(() => {
    const flags = new Map<string, number>();
    policies.filter(p => p.is_at_risk).forEach(p => {
      const flag = p.flag_type || 'unclassified';
      flags.set(flag, (flags.get(flag) || 0) + 1);
    });
    return Array.from(flags.entries())
      .map(([flag, count]) => ({ flag, count }))
      .sort((a, b) => b.count - a.count);
  }, [policies]);

  const retPct = stats.retention_pct !== null ? Number(stats.retention_pct) : null;

  return (
    <div className="space-y-4 mt-4">
      {/* ── KPI tiles in §13.7 priority order ────────────────────────── */}
      <StaggerContainer className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* 1. Policies Taken — PRIMARY */}
        <StaggerItem>
          <Card className="border-border border-l-2 border-l-cyan-500">
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-1.5">
                    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Policies Taken</p>
                    <Badge className="bg-cyan-500/15 text-cyan-400 border-cyan-500/20 text-[8px] px-1 py-0">PRIMARY</Badge>
                  </div>
                  <CountUp
                    end={stats.active_policies}
                    format={fmtNum}
                    className="text-xl font-bold mt-1 block text-foreground"
                  />
                  <p className="text-[10px] text-muted-foreground">{fmtNum(stats.total_policies)} total</p>
                </div>
                <div className="p-1.5 rounded-lg bg-cyan-500/10">
                  <FileText size={14} className="text-primary" />
                </div>
              </div>
            </CardContent>
          </Card>
        </StaggerItem>

        {/* 2. 90-Day Retention (using available 90d data) */}
        <StaggerItem>
          <Card className="border-border">
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">90d Retention</p>
                  <CountUp
                    end={retPct ?? 0}
                    format={(n: number) => retPct !== null ? `${n.toFixed(1)}%` : '—'}
                    className={`text-xl font-bold mt-1 block ${retentionColor(retPct)}`}
                  />
                  <p className="text-[10px] text-muted-foreground">
                    {stats.ever_drafted > 0 ? `${stats.retained_policies}/${stats.ever_drafted}` : 'No eligible'}
                  </p>
                </div>
                <div className="p-1.5 rounded-lg bg-emerald-500/10">
                  <ShieldCheck size={14} className={retentionColor(retPct)} />
                </div>
              </div>
            </CardContent>
          </Card>
        </StaggerItem>

        {/* 3. 9-mo Persistency — INTERIM (needs prod DB view) */}
        <StaggerItem>
          <Card className="border-border">
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-1.5">
                    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">9-mo Persistency</p>
                    <Badge className="bg-amber-500/15 text-amber-400 border-amber-500/20 text-[8px] px-1 py-0">INTERIM</Badge>
                  </div>
                  <p className="text-xl font-bold mt-1 text-muted-foreground">—</p>
                  <p className="text-[10px] text-muted-foreground">Pending prod DB view</p>
                </div>
                <div className="p-1.5 rounded-lg bg-secondary">
                  <HelpCircle size={14} className="text-muted-foreground" />
                </div>
              </div>
            </CardContent>
          </Card>
        </StaggerItem>

        {/* 4. UW Share vs GI — INTERIM (needs prod DB view) */}
        <StaggerItem>
          <Card className="border-border">
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-1.5">
                    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">UW Share</p>
                    <Badge className="bg-amber-500/15 text-amber-400 border-amber-500/20 text-[8px] px-1 py-0">INTERIM</Badge>
                  </div>
                  <p className="text-xl font-bold mt-1 text-muted-foreground">—</p>
                  <p className="text-[10px] text-muted-foreground">Pending prod DB view</p>
                </div>
                <div className="p-1.5 rounded-lg bg-secondary">
                  <HelpCircle size={14} className="text-muted-foreground" />
                </div>
              </div>
            </CardContent>
          </Card>
        </StaggerItem>
      </StaggerContainer>

      {/* ── Retention detail row ─────────────────────────────────────── */}
      <div className="grid lg:grid-cols-2 gap-4">
        {/* Retention gauge + draft distribution */}
        <Card className="border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-foreground flex items-center gap-2">
              <ShieldCheck size={16} className="text-emerald-400" />
              Retention Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-6">
              {/* Radial gauge */}
              <RadialGauge
                value={retPct ?? 0}
                label="90d"
                size={120}
                strokeWidth={8}
              />

              {/* Draft distribution bars */}
              <div className="flex-1 space-y-2">
                {[
                  { label: '3+ Drafts (Retained)', count: draftDist.three_plus, color: 'bg-emerald-500' },
                  { label: '2 Drafts', count: draftDist.two, color: 'bg-amber-400' },
                  { label: '1 Draft', count: draftDist.one, color: 'bg-orange-400' },
                  { label: '0 Drafts', count: draftDist.zero, color: 'bg-red-400' },
                ].map(({ label, count, color }) => {
                  const total = policies.length || 1;
                  const pct = (count / total) * 100;
                  return (
                    <div key={label}>
                      <div className="flex items-center justify-between text-xs mb-0.5">
                        <span className="text-muted-foreground">{label}</span>
                        <span className="text-foreground font-data">{count} ({pct.toFixed(0)}%)</span>
                      </div>
                      <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${color} transition-all duration-700`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* At-risk breakdown by flag type */}
        <Card className="border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-foreground flex items-center gap-2">
              <AlertTriangle size={16} className="text-red-400" />
              At-Risk Breakdown
              {stats.at_risk_policies > 0 && (
                <Badge className="bg-red-500/15 text-red-400 border-red-500/20 text-xs ml-auto">
                  {stats.at_risk_policies}
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {flagBreakdown.length === 0 ? (
              <div className="flex items-center gap-3 py-8 justify-center text-muted-foreground text-sm">
                <ShieldCheck size={20} className="text-emerald-400" />
                No at-risk policies — clean book
              </div>
            ) : (
              <div className="space-y-3">
                {flagBreakdown.map(({ flag, count }) => {
                  const total = stats.at_risk_policies || 1;
                  const pct = (count / total) * 100;
                  return (
                    <div key={flag}>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="text-muted-foreground capitalize">
                          {flag.replace(/_/g, ' ')}
                        </span>
                        <span className="text-red-400 font-data font-medium">{count}</span>
                      </div>
                      <div className="h-2 bg-secondary rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full bg-red-400/60 transition-all duration-700"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
