/**
 * QualityCard — Locked dashboard widget showing quality metrics.
 *
 * Displays:
 *   - Policies Taken % (active / total written from production data)
 *   - 30-day Retention (via retention-data edge fn with days=30)
 *   - 90-day Retention (from OrgDataCache)
 *   - Save Rate (placeholder — requires policy_attention_actions wiring)
 *
 * This is a "required by FYM" locked widget per the PRD — always visible
 * on every role's dashboard. Respects the agency filter.
 */
import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { HudFrame } from '@/components/ui/hud-frame';
import { FadeIn } from '@/components/ui/animated';
import { fetchRetentionSummary, type RetentionSummaryResponse } from '@/lib/prod-api';
import { useOrgData } from '@/contexts/OrgDataCache';
import { Award, Lock, ChevronRight, ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';
import { Link } from 'react-router-dom';

// ── Types ──────────────────────────────────────────────────────────────────

interface QualityMetric {
  label: string;
  value: number | null;
  subtitle: string;
  trend?: { direction: 'up' | 'down' | 'flat'; label: string } | null;
}

interface QualityCardProps {
  filterAgencyId: string | null;
  loading: boolean;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function retentionStatusColor(pct: number | null): string {
  if (pct === null) return 'text-muted-foreground/40';
  if (pct >= 90) return 'text-emerald-400';
  if (pct >= 85) return 'text-amber-400';
  return 'text-red-400';
}

function TrendArrow({ direction }: { direction: 'up' | 'down' | 'flat' }) {
  if (direction === 'up') return <ArrowUpRight size={12} className="text-emerald-400" />;
  if (direction === 'down') return <ArrowDownRight size={12} className="text-red-400" />;
  return <Minus size={12} className="text-muted-foreground/50" />;
}

// ── Component ──────────────────────────────────────────────────────────────

export function QualityCard({ filterAgencyId, loading: parentLoading }: QualityCardProps) {
  const orgData = useOrgData();
  const [retention30d, setRetention30d] = useState<RetentionSummaryResponse | null>(null);
  const [loading30d, setLoading30d] = useState(true);

  // Fetch 30-day retention data
  useEffect(() => {
    setLoading30d(true);
    const params: { days: number; agency_id?: string } = { days: 30 };
    if (filterAgencyId && !filterAgencyId.startsWith('no-data:')) {
      params.agency_id = filterAgencyId;
    }
    fetchRetentionSummary(params)
      .then((data) => {
        setRetention30d(data);
        setLoading30d(false);
      })
      .catch((err) => {
        console.error('QualityCard: 30d retention fetch error:', err);
        setLoading30d(false);
      });
  }, [filterAgencyId]);

  // Derive metrics from cached + fetched data
  const metrics = useMemo((): QualityMetric[] => {
    const noData = filterAgencyId?.startsWith('no-data:') ?? false;
    if (noData) {
      return [
        { label: 'Policies Taken', value: null, subtitle: 'No data' },
        { label: '30-Day Retention', value: null, subtitle: 'No data' },
        { label: '90-Day Retention', value: null, subtitle: 'No data' },
        { label: 'Save Rate', value: null, subtitle: 'Coming soon' },
      ];
    }

    // -- Policies Taken: active / (active + terminated) --
    // This represents policies that successfully "took" (at least one premium drafted)
    const agencies = filterAgencyId
      ? orgData.retentionAgencies.filter((a) => a.agency_id === filterAgencyId)
      : orgData.retentionAgencies;

    let totalActive = 0;
    let totalTerminated = 0;
    for (const a of agencies) {
      totalActive += a.active_policies;
      totalTerminated += a.terminated_policies ?? 0;
    }
    const totalPolicies = totalActive + totalTerminated;
    const policiesTakenPct = totalPolicies > 0
      ? Math.round((totalActive / totalPolicies) * 1000) / 10
      : null;

    // -- 30-Day Retention --
    let ret30dPct: number | null = null;
    let ret30dEligible = 0;
    if (retention30d) {
      if (filterAgencyId && !filterAgencyId.startsWith('no-data:')) {
        const agencyData = retention30d.data.agencies.find((a) => a.agency_id === filterAgencyId);
        if (agencyData) {
          ret30dPct = agencyData.retention_pct;
          ret30dEligible = agencyData.eligible_90d; // field name is generic, value reflects 30d
        }
      } else {
        ret30dPct = retention30d.data.org_wide.retention_pct;
        ret30dEligible = retention30d.data.org_wide.eligible_90d;
      }
    }

    // -- 90-Day Retention from cache --
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

    return [
      {
        label: 'Policies Taken',
        value: policiesTakenPct,
        subtitle: totalPolicies > 0
          ? `${totalActive.toLocaleString()} of ${totalPolicies.toLocaleString()} active`
          : 'No policies',
      },
      {
        label: '30-Day Retention',
        value: ret30dPct,
        subtitle: ret30dEligible > 0
          ? `n=${ret30dEligible.toLocaleString()} policies`
          : loading30d ? 'Loading…' : 'No eligible policies',
      },
      {
        label: '90-Day Retention',
        value: ret90dPct,
        subtitle: ret90dEligible > 0
          ? `n=${ret90dEligible.toLocaleString()} policies`
          : 'No eligible policies',
      },
      {
        label: 'Save Rate',
        value: null,
        subtitle: 'Coming in Phase 2',
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
                  <p className="text-xs text-muted-foreground/70 mt-0.5">Last 30 days</p>
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
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-12 rounded shimmer" />
                ))}
              </div>
            ) : (
              <div className="divide-y divide-border/30">
                {metrics.map((m) => (
                  <div
                    key={m.label}
                    className="flex items-center justify-between py-3 first:pt-1"
                  >
                    <div className="space-y-0.5">
                      <p className="text-sm font-medium text-foreground">{m.label}</p>
                      <div className="flex items-center gap-1.5">
                        {m.trend && (
                          <TrendArrow direction={m.trend.direction} />
                        )}
                        <p className={`text-xs ${m.trend ? (
                          m.trend.direction === 'up' ? 'text-emerald-400/80' :
                          m.trend.direction === 'down' ? 'text-red-400/80' :
                          'text-muted-foreground/50'
                        ) : 'text-muted-foreground/50'}`}>
                          {m.trend ? m.trend.label : m.subtitle}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      {m.value !== null ? (
                        <span className={`text-xl font-bold font-data ${retentionStatusColor(m.value)}`}>
                          {m.value}
                          <span className="text-sm">%</span>
                        </span>
                      ) : (
                        <span className="text-sm text-muted-foreground/40 italic">
                          {m.subtitle === 'Coming in Phase 2' ? '—' : '—'}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {/* Locked indicator */}
            <div className="mt-3 pt-3 border-t border-border/30 flex items-center gap-1.5 text-xs text-muted-foreground/40">
              <Lock size={10} />
              <span>Required by FYM — quality signals leadership tracks</span>
            </div>
          </CardContent>
        </Card>
      </HudFrame>
    </FadeIn>
  );
}
