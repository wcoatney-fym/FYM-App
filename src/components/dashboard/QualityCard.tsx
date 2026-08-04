/**
 * QualityCard — Locked dashboard widget showing quality metrics.
 *
 * Displays the PRD-mandated Quality Metric Priority Order (§12.7 / §14):
 *   1. Policies Taken %
 *   2. 30-Day Retention
 *   3. 90-Day Retention
 *   4. 9-Month Persistency   (penguin — not yet available)
 *   5. 13-Month Persistency  (penguin — not yet available)
 *   6. UW Share (vs. GI)     (penguin — not yet available)
 *   7. Save Rate              (penguin — not yet available)
 *   8. Attention Rate
 *
 * This is a "required by FYM" locked widget per the PRD — always visible
 * on every role's dashboard. Respects the agency filter.
 */
import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { HudFrame } from '@/components/ui/hud-frame';
import { FadeIn } from '@/components/ui/animated';
import { fetchRetentionSummary } from '@/lib/prod-api';
import { useCachedFetch } from '@/hooks/useCachedFetch';
import { useOrgData } from '@/contexts/OrgDataCache';
import { Award, Lock, ChevronRight, ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';
import { Link } from 'react-router-dom';

// ── Types ──────────────────────────────────────────────────────────────────

interface QualityMetric {
  label: string;
  value: number | null;
  subtitle: string;
  trend?: { direction: 'up' | 'down' | 'flat'; label: string } | null;
  /** When true, show a penguin placeholder instead of a value */
  penguin?: boolean;
  penguinReason?: string;
}

interface QualityCardProps {
  filterAgencyId: string | null;
  loading: boolean;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function retentionStatusColor(pct: number | null): string {
  if (pct === null) return 'text-muted-foreground';
  if (pct >= 90) return 'text-emerald-400';
  if (pct >= 85) return 'text-amber-400';
  return 'text-red-400';
}

function TrendArrow({ direction }: { direction: 'up' | 'down' | 'flat' }) {
  if (direction === 'up') return <ArrowUpRight size={12} className="text-emerald-400" />;
  if (direction === 'down') return <ArrowDownRight size={12} className="text-red-400" />;
  return <Minus size={12} className="text-muted-foreground" />;
}

/** Dancing penguin SVG for not-yet-eligible metrics */
function PenguinPlaceholder({ reason }: { reason?: string }) {
  return (
    <div className="flex items-center gap-2">
      <svg width="20" height="26" viewBox="0 0 20 26" className="flex-shrink-0 animate-bounce" style={{ animationDuration: '1.6s' }}>
        {/* Body */}
        <ellipse cx="10" cy="13" rx="7" ry="10" fill="#0F172A" />
        {/* Belly */}
        <ellipse cx="10" cy="15" rx="4.5" ry="7" fill="white" />
        {/* Eyes */}
        <circle cx="7.5" cy="9" r="1.5" fill="white" />
        <circle cx="12.5" cy="9" r="1.5" fill="white" />
        <circle cx="7.5" cy="9" r="0.8" fill="#0F172A" />
        <circle cx="12.5" cy="9" r="0.8" fill="#0F172A" />
        {/* Beak */}
        <polygon points="10,11 8.5,13 11.5,13" fill="#F59E0B" />
        {/* Feet */}
        <ellipse cx="7" cy="24" rx="2.5" ry="1" fill="#F59E0B" />
        <ellipse cx="13" cy="24" rx="2.5" ry="1" fill="#F59E0B" />
      </svg>
      <span className="text-xs text-muted-foreground italic">
        {reason || 'Coming soon'}
      </span>
    </div>
  );
}

// ── Component ──────────────────────────────────────────────────────────────

export function QualityCard({ filterAgencyId, loading: parentLoading }: QualityCardProps) {
  const orgData = useOrgData();
  // Cached 30-day retention fetch — instant render from localStorage
  const ret30dAgencyId = (filterAgencyId && !filterAgencyId.startsWith('no-data:')) ? filterAgencyId : undefined;
  const ret30dCacheKey = `quality-ret30d-${ret30dAgencyId || 'org'}`;
  const { data: retention30d, loading: loading30d } = useCachedFetch(
    ret30dCacheKey,
    () => {
      const params: { days: number; agency_id?: string } = { days: 30 };
      if (ret30dAgencyId) params.agency_id = ret30dAgencyId;
      return fetchRetentionSummary(params);
    },
    { deps: [ret30dAgencyId] }
  );

  // Derive the full 8-metric priority list
  const metrics = useMemo((): QualityMetric[] => {
    const noData = filterAgencyId?.startsWith('no-data:') ?? false;
    if (noData) {
      return [
        { label: 'Policies Taken', value: null, subtitle: 'No data' },
        { label: '30-Day Retention', value: null, subtitle: 'No data' },
        { label: '90-Day Retention', value: null, subtitle: 'No data' },
        { label: '9-Mo Persistency', value: null, subtitle: 'Not yet available', penguin: true, penguinReason: 'Pending Max' },
        { label: '13-Mo Persistency', value: null, subtitle: 'Not yet available', penguin: true, penguinReason: 'Pending Max' },
        { label: 'UW Share', value: null, subtitle: 'Not yet available', penguin: true, penguinReason: 'Pending data' },
        { label: 'Save Rate', value: null, subtitle: 'Not yet available', penguin: true, penguinReason: 'Phase 2' },
        { label: 'Attention Rate', value: null, subtitle: 'No data' },
      ];
    }

    // -- 1. Policies Taken: active / (active + terminated) --
    const agencies = filterAgencyId
      ? orgData.retentionAgencies.filter((a) => a.agency_id === filterAgencyId)
      : orgData.retentionAgencies;

    let totalActive = 0;
    let totalTerminated = 0;
    let totalAtRisk = 0;
    let totalPoliciesAll = 0;
    for (const a of agencies) {
      totalActive += a.active_policies;
      totalTerminated += a.terminated_policies ?? 0;
      totalAtRisk += a.at_risk_count ?? 0;
      totalPoliciesAll += a.active_policies + (a.terminated_policies ?? 0);
    }
    const totalPolicies = totalActive + totalTerminated;
    const policiesTakenPct = totalPolicies > 0
      ? Math.round((totalActive / totalPolicies) * 1000) / 10
      : null;

    // -- 2. 30-Day Retention --
    let ret30dPct: number | null = null;
    let ret30dEligible = 0;
    if (retention30d) {
      if (filterAgencyId && !filterAgencyId.startsWith('no-data:')) {
        const agencyData = retention30d.data.agencies.find((a) => a.agency_id === filterAgencyId);
        if (agencyData) {
          ret30dPct = agencyData.retention_pct;
          ret30dEligible = agencyData.eligible_90d;
        }
      } else {
        ret30dPct = retention30d.data.org_wide.retention_pct;
        ret30dEligible = retention30d.data.org_wide.eligible_90d;
      }
    }

    // -- 3. 90-Day Retention from cache --
    let ret90dPct: number | null = null;
    let ret90dEligible = 0;
    if (filterAgencyId && !filterAgencyId.startsWith('no-data:')) {
      const agencyData = orgData.retentionAgencies.find((a) => a.agency_id === filterAgencyId);
      if (agencyData) {
        ret90dPct = agencyData.retention_pct;
        ret90dEligible = agencyData.eligible_90d;
      }
    } else if (orgData.retentionSummary) {
      ret90dPct = orgData.retentionSummary.data.org_wide.retention_pct;
      ret90dEligible = orgData.retentionSummary.data.org_wide.eligible_90d;
    }

    // -- 8. Attention Rate: at-risk / total active policies --
    const attentionRatePct = totalActive > 0
      ? Math.round((totalAtRisk / totalActive) * 1000) / 10
      : null;

    return [
      // Priority 1: Policies Taken
      {
        label: 'Policies Taken',
        value: policiesTakenPct,
        subtitle: totalPolicies > 0
          ? `${totalActive.toLocaleString()} of ${totalPolicies.toLocaleString()} active`
          : 'No policies',
      },
      // Priority 2: 30-Day Retention
      {
        label: '30-Day Retention',
        value: ret30dPct,
        subtitle: ret30dEligible > 0
          ? `n=${ret30dEligible.toLocaleString()} policies`
          : loading30d ? 'Loading…' : 'No eligible policies',
      },
      // Priority 3: 90-Day Retention
      {
        label: '90-Day Retention',
        value: ret90dPct,
        subtitle: ret90dEligible > 0
          ? `n=${ret90dEligible.toLocaleString()} policies`
          : 'No eligible policies',
      },
      // Priority 4: 9-Month Persistency (not yet available)
      {
        label: '9-Mo Persistency',
        value: null,
        subtitle: 'Pending source-of-truth definitions from Max',
        penguin: true,
        penguinReason: 'Awaiting Max',
      },
      // Priority 5: 13-Month Persistency (not yet available)
      {
        label: '13-Mo Persistency',
        value: null,
        subtitle: 'Pending source-of-truth definitions from Max',
        penguin: true,
        penguinReason: 'Awaiting Max',
      },
      // Priority 6: UW Share vs. GI (not yet available)
      {
        label: 'UW Share',
        value: null,
        subtitle: 'Underwriting type data not yet in view',
        penguin: true,
        penguinReason: 'Pending data',
      },
      // Priority 7: Save Rate (not yet wired)
      {
        label: 'Save Rate',
        value: null,
        subtitle: 'Needs attention-action aggregation',
        penguin: true,
        penguinReason: 'Phase 2',
      },
      // Priority 8: Attention Rate
      {
        label: 'Attention Rate',
        value: attentionRatePct,
        subtitle: totalActive > 0
          ? `${totalAtRisk.toLocaleString()} of ${totalActive.toLocaleString()} flagged`
          : 'No active policies',
      },
    ];
  }, [orgData.retentionAgencies, orgData.retentionSummary, retention30d, filterAgencyId, loading30d]);

  const isLoading = parentLoading || (orgData.initialLoading && orgData.retentionAgencies.length === 0);

  return (
    <FadeIn delay={0.3}>
      <HudFrame accentColor="hsl(142 71% 45% / 0.4)">
        <Card className="border-border">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-emerald-500/10">
                  <Award size={18} className="text-emerald-400" />
                </div>
                <div>
                  <CardTitle className="text-base font-semibold text-foreground">Quality</CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Last 30 days · priority order per §12.7
                  </p>
                </div>
              </div>
              <Link
                to="/retention"
                className="text-xs text-primary hover:underline flex items-center gap-1"
              >
                View all <ChevronRight size={12} />
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                  <div key={i} className="h-10 rounded shimmer" />
                ))}
              </div>
            ) : (
              <div className="divide-y divide-border/30">
                {metrics.map((m) => (
                  <div
                    key={m.label}
                    className="flex items-center justify-between py-2.5 first:pt-1"
                  >
                    <div className="space-y-0.5 min-w-0 flex-1">
                      <p className={`text-base font-medium ${m.penguin ? 'text-muted-foreground' : 'text-foreground'}`}>
                        {m.label}
                      </p>
                      <div className="flex items-center gap-1.5">
                        {m.trend && (
                          <TrendArrow direction={m.trend.direction} />
                        )}
                        <p className={`text-xs ${m.trend ? (
                          m.trend.direction === 'up' ? 'text-emerald-400/80' :
                          m.trend.direction === 'down' ? 'text-red-400/80' :
                          'text-muted-foreground'
                        ) : 'text-muted-foreground'}`}>
                          {m.trend ? m.trend.label : m.subtitle}
                        </p>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0 ml-3">
                      {m.penguin ? (
                        <PenguinPlaceholder reason={m.penguinReason} />
                      ) : m.value !== null ? (
                        <span className={`text-2xl font-bold font-data ${
                          m.label === 'Attention Rate'
                            ? attentionRateColor(m.value)
                            : retentionStatusColor(m.value)
                        }`}>
                          {m.value}
                          <span className="text-sm">%</span>
                        </span>
                      ) : (
                        <span className="text-sm text-muted-foreground italic">—</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {/* Locked indicator */}
            <div className="mt-3 pt-3 border-t border-border/30 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Lock size={10} />
              <span>Required by FYM — quality signals leadership tracks</span>
            </div>
          </CardContent>
        </Card>
      </HudFrame>
    </FadeIn>
  );
}

/** Attention rate uses inverted color logic — lower is better */
function attentionRateColor(pct: number | null): string {
  if (pct === null) return 'text-muted-foreground';
  if (pct <= 5) return 'text-emerald-400';
  if (pct <= 15) return 'text-amber-400';
  return 'text-red-400';
}
