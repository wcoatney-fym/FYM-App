/**
 * CoachingPanel — Bottom-retention agencies sorted worst-first.
 *
 * Extracted from DashboardPage for maintainability (Section 4 of UX audit).
 * Includes accessibility: semantic table, aria-labels, screen-reader text
 * for color-only retention indicators.
 */
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FadeIn } from '@/components/ui/animated';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';

interface AgencyRisk {
  agency_id: string;
  name: string | null;
  active_policies: number;
  active_premium: number;
  at_risk_count: number;
  retention_pct: number | null;
}

interface CoachingPanelProps {
  agencies: AgencyRisk[];
  belowTargetCount: number;
  isOrgWide: boolean;
}

function fmt$(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${Math.round(n).toLocaleString()}`;
}

function retentionColor(pct: number | null) {
  if (pct === null) return 'text-muted-foreground';
  if (pct >= 90) return 'text-emerald-400';
  if (pct >= 85) return 'text-amber-400';
  return 'text-red-400';
}

function retentionStatus(pct: number | null): string {
  if (pct === null) return 'no data';
  if (pct >= 90) return 'on target';
  if (pct >= 85) return 'warning';
  return 'critical';
}

export function CoachingPanel({ agencies, belowTargetCount, isOrgWide }: CoachingPanelProps) {
  if (agencies.length === 0) return null;

  return (
    <FadeIn delay={0.6}>
      <Card className="border-border" role="region" aria-label="Agency coaching signals">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base font-semibold text-foreground">
                {isOrgWide ? 'Agency Coaching Signals' : 'Coaching Signal'}
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                {isOrgWide
                  ? 'Lowest retention agencies — sorted worst first. Below 90% = coaching needed.'
                  : "Your agency's retention status. Below 90% = coaching needed."}
              </p>
            </div>
            {belowTargetCount > 0 && (
              <Badge className="bg-red-500/10 text-red-400 border-red-500/20 border">
                {belowTargetCount} below target
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y divide-border/30" role="table" aria-label="Agency coaching data">
            <div
              className="grid grid-cols-7 gap-2 px-4 py-2 bg-secondary/30 text-xs font-semibold text-muted-foreground font-data"
              role="row"
            >
              <span className="col-span-2" role="columnheader">Agency</span>
              <span className="text-right" role="columnheader">Active</span>
              <span className="text-right" role="columnheader">Premium/mo</span>
              <span className="text-right" role="columnheader">At-Risk</span>
              <span className="text-right" role="columnheader">Retention</span>
              <span role="columnheader"><span className="sr-only">Actions</span></span>
            </div>
            {agencies.map((a) => (
              <div
                key={a.agency_id}
                className={`grid grid-cols-7 gap-2 px-4 py-2.5 text-sm items-center row-hover ${
                  a.retention_pct !== null && a.retention_pct < 90 ? 'bg-red-500/5' : ''
                }`}
                role="row"
              >
                <span className="col-span-2 font-medium text-foreground truncate" role="cell">
                  {a.name ?? (
                    <span className="font-data text-xs text-muted-foreground">
                      {a.agency_id.slice(0, 8)}…
                    </span>
                  )}
                </span>
                <span className="text-right text-muted-foreground font-data" role="cell">
                  {a.active_policies.toLocaleString()}
                </span>
                <span className="text-right text-muted-foreground font-data" role="cell">
                  {fmt$(a.active_premium)}
                </span>
                <span
                  className={`text-right font-medium font-data ${
                    a.at_risk_count > 0 ? 'text-red-400' : 'text-muted-foreground'
                  }`}
                  role="cell"
                >
                  {a.at_risk_count || '—'}
                </span>
                <span
                  className={`text-right font-semibold font-data ${retentionColor(a.retention_pct)}`}
                  role="cell"
                  aria-label={a.retention_pct !== null ? `${a.retention_pct}% — ${retentionStatus(a.retention_pct)}` : 'no data'}
                >
                  {a.retention_pct !== null ? `${a.retention_pct}%` : '—'}
                </span>
                <span className="text-center" role="cell">
                  <Link
                    to={`/agencies/${a.agency_id}`}
                    aria-label={`View ${a.name ?? a.agency_id} detail`}
                  >
                    <ChevronRight
                      size={14}
                      className="text-muted-foreground/40 hover:text-primary transition-colors"
                    />
                  </Link>
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </FadeIn>
  );
}
