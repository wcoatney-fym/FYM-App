import { useState, useMemo, useEffect } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { Header } from '@/components/layout/Header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { StaggerContainer, StaggerItem, CountUp } from '@/components/ui/animated';
import { supabase } from '@/lib/supabase';
import { useEffectiveAuth } from '@/hooks/useEffectiveAuth';
import { useOrgData } from '@/contexts/OrgDataCache';
import { Search, Building2, ChevronRight } from 'lucide-react';

interface AgencyRow {
  agency_id: string;
  active_policies: number;
  active_premium: number;
  at_risk_count: number;
  eligible_90d: number;
  retained_90d: number;
  retention_pct: number | null;
  // enriched from agencies table if available
  name?: string;
  slug?: string;
  is_active?: boolean;
}

function retentionColor(pct: number | null) {
  if (pct === null) return 'text-muted-foreground';
  if (pct >= 90) return 'text-emerald-400 font-semibold';
  if (pct >= 85) return 'text-amber-400 font-semibold';
  return 'text-red-400 font-bold';
}

function retentionBadge(pct: number | null) {
  if (pct === null) return null;
  if (pct >= 90) return <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 border text-[10px] px-1.5 py-0">On target</Badge>;
  if (pct >= 85) return <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/20 border text-[10px] px-1.5 py-0">At risk</Badge>;
  return <Badge className="bg-red-500/10 text-red-400 border-red-500/20 border text-[10px] px-1.5 py-0">Below target</Badge>;
}

function fmt$(n: number) {
  return '$' + Math.round(n).toLocaleString();
}

export function AgenciesPage() {
  const { effectiveAgencyId, effectiveAgencyWritingNumber, isOrgWide } = useEffectiveAuth();
  const orgData = useOrgData();
  const [nameMap, setNameMap] = useState<Map<string, { name: string; slug?: string; is_active: boolean }>>(new Map());
  const [search, setSearch] = useState('');

  // Load agency names from local Supabase (lightweight, not from Max's DB)
  useEffect(() => {
    if (!supabase) return;
    (async () => {
      const { data: agencyNames } = await (supabase as any)
        .from('agencies')
        .select('tracker_id, writing_number, name, slug, is_active');
      if (agencyNames) {
        const nm = new Map<string, { name: string; slug?: string; is_active: boolean }>();
        for (const a of agencyNames as any[]) {
          if (a.writing_number) nm.set(a.writing_number, { name: a.name, slug: a.slug ?? undefined, is_active: a.is_active });
          if (a.tracker_id) nm.set(a.tracker_id, { name: a.name, slug: a.slug ?? undefined, is_active: a.is_active });
        }
        setNameMap(nm);
      }
    })();
  }, []);

  // Derive rows from OrgDataCache (instant — no fetch, no shimmer)
  const loading = orgData.initialLoading && orgData.retentionAgencies.length === 0;
  const rows = useMemo((): AgencyRow[] => {
    const stats = orgData.retentionAgencies;
    if (!stats || stats.length === 0) return [];
    return stats
      .map(s => ({
        agency_id: s.agency_id,
        active_policies: s.active_policies,
        active_premium: s.active_premium,
        at_risk_count: s.at_risk_count,
        eligible_90d: s.eligible_90d,
        retained_90d: s.retained_90d,
        retention_pct: s.retention_pct,
        ...(nameMap.get(s.agency_id) ?? {}),
      }))
      .sort((a, b) => b.active_premium - a.active_premium);
  }, [orgData.retentionAgencies, nameMap]);

  // Managers / agency admins: redirect to their own agency detail
  // Placed AFTER all hooks to satisfy React's rules of hooks.
  if (!isOrgWide && (effectiveAgencyWritingNumber || effectiveAgencyId)) {
    return <Navigate to={`/agencies/${effectiveAgencyWritingNumber || effectiveAgencyId}`} replace />;
  }

  const filtered = useMemo(() => {
    if (!search) return rows;
    const q = search.toLowerCase();
    return rows.filter(r =>
      (r.name ?? r.agency_id).toLowerCase().includes(q) ||
      (r.slug ?? '').toLowerCase().includes(q)
    );
  }, [rows, search]);

  const totalPremium   = rows.reduce((s, r) => s + r.active_premium, 0);
  const belowTarget    = rows.filter(r => r.retention_pct !== null && r.retention_pct < 90).length;
  const onTarget       = rows.filter(r => r.retention_pct !== null && r.retention_pct >= 90).length;

  return (
    <div>
      <Header title="Agencies" />
      <div className="p-6 space-y-4">

        {/* stats strip */}
        <StaggerContainer className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Total Agencies', end: rows.length, sub: 'writing active policies' },
            { label: 'Active Premium', end: totalPremium, sub: '/mo across all agencies', fmt: (n: number) => fmt$(n) },
            { label: 'On Target (≥90%)', end: onTarget, sub: 'retention ≥ 90%', color: 'text-emerald-400' },
            { label: 'Below Target', end: belowTarget, sub: 'need coaching', color: belowTarget > 0 ? 'text-red-400' : 'text-foreground' },
          ].map(c => (
            <StaggerItem key={c.label}>
              <Card className="border-border">
                <CardContent className="py-4 px-5">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs font-medium text-muted-foreground">{c.label}</p>
                      <CountUp
                        end={c.end}
                        format={c.fmt}
                        className={`text-2xl font-bold mt-0.5 block ${c.color ?? 'text-foreground'}`}
                      />
                      <p className="text-xs text-muted-foreground mt-0.5">{c.sub}</p>
                    </div>
                    <div className="p-2 rounded-lg bg-cyan-500/10">
                      <Building2 size={18} className="text-primary" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </StaggerItem>
          ))}
        </StaggerContainer>

        <Card className="border-border">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <CardTitle className="text-base font-semibold text-foreground">Agency Directory</CardTitle>
              <div className="relative w-full sm:w-64">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search agency…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="pl-8 bg-card h-8 text-sm"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-6 space-y-2">
                {[1,2,3,4,5].map(i => <div key={i} className="h-10 rounded shimmer" />)}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="bg-background">
                    <TableHead className="font-semibold text-muted-foreground">Agency</TableHead>
                    <TableHead className="font-semibold text-muted-foreground text-right">Active</TableHead>
                    <TableHead className="font-semibold text-muted-foreground text-right">Premium/mo</TableHead>
                    <TableHead className="font-semibold text-muted-foreground text-right">At-Risk</TableHead>
                    <TableHead className="font-semibold text-muted-foreground text-right">Eligible</TableHead>
                    <TableHead className="font-semibold text-muted-foreground text-right">Retention</TableHead>
                    <TableHead className="font-semibold text-muted-foreground text-center">Status</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(r => (
                    <TableRow
                      key={r.agency_id}
                      className={`hover:bg-background transition-colors cursor-pointer ${r.retention_pct !== null && r.retention_pct < 90 ? 'bg-red-500/10' : ''}`}
                    >
                      <TableCell>
                        <div className="font-medium text-foreground">
                          {r.name ?? <span className="font-data text-xs text-muted-foreground">{r.agency_id.slice(0, 8)}…</span>}
                        </div>
                        {r.slug && <div className="text-xs text-muted-foreground">{r.slug}</div>}
                      </TableCell>
                      <TableCell className="text-right font-medium text-foreground/80 font-data">
                        {r.active_policies.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right text-foreground/80 font-data">
                        {fmt$(r.active_premium)}
                      </TableCell>
                      <TableCell className="text-right">
                        <span className={r.at_risk_count > 0 ? 'text-red-400 font-semibold' : 'text-muted-foreground'}>
                          {r.at_risk_count || '—'}
                        </span>
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {r.eligible_90d > 0 ? r.eligible_90d.toLocaleString() : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className={`text-right ${retentionColor(r.retention_pct)}`}>
                        {r.retention_pct !== null ? `${r.retention_pct}%` : '—'}
                      </TableCell>
                      <TableCell className="text-center">
                        {retentionBadge(r.retention_pct)}
                      </TableCell>
                      <TableCell className="text-center">
                        <Link to={`/agencies/${r.agency_id}`}>
                          <ChevronRight size={16} className="text-muted-foreground hover:text-primary transition-colors" />
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                  {filtered.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-10 text-muted-foreground">
                        {rows.length === 0 ? 'No agency data yet — sync policy cache to populate.' : 'No agencies match your search.'}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
