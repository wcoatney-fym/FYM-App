/**
 * KpiStrip — Top-level KPI cards for the org/agency dashboard.
 *
 * Extracted from DashboardPage for maintainability (Section 4 of UX audit).
 * Includes accessibility: aria-labels on cards, screen-reader-friendly
 * status text alongside color-only indicators.
 */
import { Card, CardContent } from '@/components/ui/card';
import { HudFrame } from '@/components/ui/hud-frame';
import { StaggerContainer, StaggerItem, CountUp, RadialGauge } from '@/components/ui/animated';
import { ShieldCheck, AlertTriangle, Building2, XCircle } from 'lucide-react';
import { fmt$ } from '@/lib/formatUtils';

interface KpiStripProps {
  loading: boolean;
  stats: {
    active_policies: number;
    active_premium: number;
    terminated_policies: number;
    at_risk_count: number;
    at_risk_premium: number;
    retention_pct: number | null;
    agencies_below_target: number;
    total_agencies: number;
  } | null;
  isOrgWide: boolean;
}

export function KpiStrip({ loading, stats: s, isOrgWide }: KpiStripProps) {
  return (
    <StaggerContainer
      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4"
      role="region"
      aria-label="Key performance indicators"
    >
      {/* Active Policies */}
      <StaggerItem>
        <HudFrame>
          <Card className="border-border" role="group" aria-label="Active policies">
            <CardContent className="p-5">
              {loading ? (
                <div className="h-14 rounded shimmer" aria-hidden="true" />
              ) : (
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-base font-medium text-muted-foreground">Active Policies</p>
                    <div className="flex items-center gap-2 mt-1">
                      <CountUp
                        end={s?.active_policies ?? 0}
                        className="text-3xl font-bold text-foreground block"
                      />
                    </div>
                    {s && <p className="text-sm text-muted-foreground mt-0.5 font-data">{fmt$(s.active_premium)}/mo premium</p>}
                  </div>
                  <div className="p-2.5 rounded-lg bg-cyan-500/10" aria-hidden="true">
                    <ShieldCheck size={20} className="text-primary" />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </HudFrame>
      </StaggerItem>

      {/* 90-Day Retention — radial gauge */}
      <StaggerItem>
        <HudFrame accentColor={
          s?.retention_pct !== null && (s?.retention_pct ?? 0) >= 90
            ? 'hsl(142 71% 45% / 0.5)'
            : 'hsl(38 92% 50% / 0.5)'
        }>
          <Card className="border-border" role="group" aria-label={`90-day retention: ${s?.retention_pct ?? 'loading'}%`}>
            <CardContent className="p-5">
              {loading ? (
                <div className="h-14 rounded shimmer" aria-hidden="true" />
              ) : (
                <div className="flex items-center gap-4">
                  <RadialGauge
                    value={s?.retention_pct ?? 0}
                    label="90-day"
                    size={90}
                    strokeWidth={8}
                  />
                  <div>
                    <p className="text-base font-medium text-muted-foreground">90-Day Retention</p>
                    <p className={`text-sm mt-1 ${s?.retention_pct !== null && (s?.retention_pct ?? 0) >= 90 ? 'text-emerald-400' : 'text-amber-400'}`}>
                      {s?.retention_pct !== null && (s?.retention_pct ?? 0) >= 90 ? '✓ On target ≥ 90%' : '⚠ Below 90% target'}
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </HudFrame>
      </StaggerItem>

      {/* At-Risk Policies */}
      <StaggerItem>
        <HudFrame accentColor="hsl(0 84% 60% / 0.5)">
          <Card className="border-border" role="group" aria-label={`At-risk policies: ${s?.at_risk_count ?? 0}`}>
            <CardContent className="p-5">
              {loading ? (
                <div className="h-14 rounded shimmer" aria-hidden="true" />
              ) : (
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-base font-medium text-muted-foreground">At-Risk Policies</p>
                    <div className="flex items-center gap-2 mt-1">
                      <CountUp
                        end={s?.at_risk_count ?? 0}
                        className="text-3xl font-bold text-foreground block"
                      />
                    </div>
                    {s && s.at_risk_premium > 0 && (
                      <p className="text-sm text-muted-foreground mt-0.5 font-data">{fmt$(s.at_risk_premium)}/mo exposed</p>
                    )}
                  </div>
                  <div className="p-2.5 rounded-lg bg-red-500/10" aria-hidden="true">
                    <AlertTriangle size={20} className="text-red-400" />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </HudFrame>
      </StaggerItem>

      {/* Terminated Policies */}
      <StaggerItem>
        <HudFrame accentColor="hsl(280 60% 50% / 0.5)">
          <Card className="border-border" role="group" aria-label={`Terminated policies: ${s?.terminated_policies ?? 0}`}>
            <CardContent className="p-5">
              {loading ? (
                <div className="h-14 rounded shimmer" aria-hidden="true" />
              ) : (
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-base font-medium text-muted-foreground">Terminated</p>
                    <div className="flex items-center gap-2 mt-1">
                      <CountUp
                        end={s?.terminated_policies ?? 0}
                        className="text-3xl font-bold text-foreground block"
                      />
                    </div>
                  </div>
                  <div className="p-2.5 rounded-lg bg-purple-500/10" aria-hidden="true">
                    <XCircle size={20} className="text-purple-400" />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </HudFrame>
      </StaggerItem>

      {/* Agencies Below 90% */}
      <StaggerItem>
        <HudFrame accentColor={
          s && s.agencies_below_target > 0
            ? 'hsl(0 84% 60% / 0.5)'
            : 'hsl(142 71% 45% / 0.5)'
        }>
          <Card className="border-border" role="group" aria-label={`Agencies below 90%: ${s?.agencies_below_target ?? 0} of ${s?.total_agencies ?? 0}`}>
            <CardContent className="p-5">
              {loading ? (
                <div className="h-14 rounded shimmer" aria-hidden="true" />
              ) : (
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-base font-medium text-muted-foreground">{isOrgWide ? 'Agencies Below 90%' : 'Your Agency'}</p>
                    <CountUp
                      end={s?.agencies_below_target ?? 0}
                      className="text-3xl font-bold text-foreground mt-1 block"
                    />
                    {s && <p className="text-sm text-muted-foreground mt-0.5">{isOrgWide ? `of ${s.total_agencies} total` : (s.agencies_below_target > 0 ? '⚠ Below 90% target' : '✓ On target')}</p>}
                  </div>
                  <div className={`p-2.5 rounded-lg ${s && s.agencies_below_target > 0 ? 'bg-red-500/10' : 'bg-emerald-500/10'}`} aria-hidden="true">
                    <Building2 size={20} className={s && s.agencies_below_target > 0 ? 'text-red-400' : 'text-emerald-400'} />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </HudFrame>
      </StaggerItem>
    </StaggerContainer>
  );
}
