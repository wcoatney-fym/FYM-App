/**
 * CoachingPanel — Bottom-retention agencies sorted worst-first.
 *
 * Extracted from DashboardPage for maintainability (Section 4 of UX audit).
 * Includes accessibility: semantic table, aria-labels, screen-reader text
 * for color-only retention indicators.
 *
 * FYM admin (org-wide): shows ALL agencies with search + scrollable list.
 * Agency admin: shows only their agency's row.
 */
import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FadeIn } from '@/components/ui/animated';
import { Link } from 'react-router-dom';
import { ChevronRight, Search, ArrowUp, ArrowDown } from 'lucide-react';
import { fmt$ } from '@/lib/formatUtils';

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

type SortKey = 'name' | 'active' | 'premium' | 'atRisk' | 'retention';

export function CoachingPanel({ agencies, belowTargetCount, isOrgWide }: CoachingPanelProps) {
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('retention');
  const [sortAsc, setSortAsc] = useState(true); // true = worst-first for retention (ascending %)

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(key === 'name' || key === 'retention'); // name alpha asc, retention worst-first (asc)
    }
  }

  function SortIndicator({ active, asc }: { active: boolean; asc: boolean }) {
    if (!active) return null;
    return asc
      ? <ArrowUp size={11} className="inline ml-0.5 text-primary" />
      : <ArrowDown size={11} className="inline ml-0.5 text-primary" />;
  }

  const filtered = useMemo(() => {
    let arr = agencies;
    if (search.trim()) {
      const q = search.toLowerCase();
      arr = arr.filter(
        (a) =>
          (a.name ?? '').toLowerCase().includes(q) ||
          a.agency_id.toLowerCase().includes(q)
      );
    }
    // Sort
    const dir = sortAsc ? 1 : -1;
    return [...arr].sort((a, b) => {
      switch (sortKey) {
        case 'name': return dir * (a.name ?? a.agency_id).localeCompare(b.name ?? b.agency_id);
        case 'active': return dir * (a.active_policies - b.active_policies);
        case 'premium': return dir * (a.active_premium - b.active_premium);
        case 'atRisk': return dir * (a.at_risk_count - b.at_risk_count);
        case 'retention': return dir * ((a.retention_pct ?? -1) - (b.retention_pct ?? -1));
        default: return 0;
      }
    });
  }, [agencies, search, sortKey, sortAsc]);

  if (agencies.length === 0) return null;

  // Show search bar when there are more than 8 agencies (org-wide view)
  const showSearch = isOrgWide && agencies.length > 8;
  // Scroll when more than 10 rows visible
  const scrollable = filtered.length > 10;

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
                  ? `${agencies.length} agencies — sorted worst first. Below 90% = coaching needed.`
                  : "Your agency's retention status. Below 90% = coaching needed."}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {belowTargetCount > 0 && (
                <Badge className="bg-red-500/10 text-red-400 border-red-500/20 border">
                  {belowTargetCount} below target
                </Badge>
              )}
            </div>
          </div>
          {showSearch && (
            <div className="relative mt-2">
              <Search
                size={14}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <input
                type="text"
                placeholder="Search agencies…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 rounded-md border border-border bg-secondary/30 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
                aria-label="Search agencies"
              />
            </div>
          )}
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y divide-border/30" role="table" aria-label="Agency coaching data">
            <div
              className="grid grid-cols-7 gap-2 px-4 py-2 bg-secondary/30 text-xs font-semibold text-muted-foreground font-data sticky top-0 z-10"
              role="row"
            >
              <button className="col-span-2 text-left hover:text-foreground transition-colors" role="columnheader" onClick={() => handleSort('name')}>
                Agency<SortIndicator active={sortKey === 'name'} asc={sortAsc} />
              </button>
              <button className="text-right hover:text-foreground transition-colors" role="columnheader" onClick={() => handleSort('active')}>
                Active<SortIndicator active={sortKey === 'active'} asc={sortAsc} />
              </button>
              <button className="text-right hover:text-foreground transition-colors" role="columnheader" onClick={() => handleSort('premium')}>
                Premium/mo<SortIndicator active={sortKey === 'premium'} asc={sortAsc} />
              </button>
              <button className="text-right hover:text-foreground transition-colors" role="columnheader" onClick={() => handleSort('atRisk')}>
                At-Risk<SortIndicator active={sortKey === 'atRisk'} asc={sortAsc} />
              </button>
              <button className="text-right hover:text-foreground transition-colors" role="columnheader" onClick={() => handleSort('retention')}>
                Retention<SortIndicator active={sortKey === 'retention'} asc={sortAsc} />
              </button>
              <span role="columnheader"><span className="sr-only">Actions</span></span>
            </div>
            <div
              className={scrollable ? 'max-h-[480px] overflow-y-auto' : ''}
              role="rowgroup"
            >
              {filtered.length === 0 && search.trim() && (
                <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                  No agencies match "{search}"
                </div>
              )}
              {filtered.map((a) => (
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
                        className="text-muted-foreground hover:text-primary transition-colors"
                      />
                    </Link>
                  </span>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </FadeIn>
  );
}
