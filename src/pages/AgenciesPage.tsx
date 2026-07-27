import { useState, useMemo, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Header } from '@/components/layout/Header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/lib/supabase';
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
  if (pct === null) return 'text-muted-foreground/70';
  if (pct >= 90) return 'text-emerald-700 font-semibold';
  if (pct >= 85) return 'text-amber-700 font-semibold';
  return 'text-red-700 font-bold';
}

function retentionBadge(pct: number | null) {
  if (pct === null) return null;
  if (pct >= 90) return <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 border text-[10px] px-1.5 py-0">On target</Badge>;
  if (pct >= 85) return <Badge className="bg-amber-50 text-amber-700 border-amber-200 border text-[10px] px-1.5 py-0">At risk</Badge>;
  return <Badge className="bg-red-500/10 text-red-700 border-red-500/20 border text-[10px] px-1.5 py-0">Below target</Badge>;
}

function fmt$(n: number) {
  return '$' + Math.round(n).toLocaleString();
}

export function AgenciesPage() {
  const [rows, setRows] = useState<AgencyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    async function load() {
      // Live agency retention summary
      const { data: stats } = await supabase!
        .from('agency_retention_summary')
        .select('*')
        .order('active_premium', { ascending: false });

      if (!stats) { setLoading(false); return; }

      // Enrich with name from agencies table (if populated)
      const { data: agencyNames } = await (supabase as any)
        .from('agencies')
        .select('tracker_id, name, slug, is_active');

      const nameMap = new Map<string, { name: string; slug?: string; is_active: boolean }>();
      if (agencyNames) {
        for (const a of agencyNames as any[]) {
          if (a.tracker_id) nameMap.set(a.tracker_id, { name: a.name, slug: a.slug ?? undefined, is_active: a.is_active });
        }
      }

      const enriched: AgencyRow[] = (stats as any[]).map((s: any) => ({
        agency_id: s.agency_id,
        active_policies: s.active_policies,
        active_premium: s.active_premium,
        at_risk_count: s.at_risk_count,
        eligible_90d: s.eligible_90d,
        retained_90d: s.retained_90d,
        retention_pct: s.retention_pct,
        ...(nameMap.get(s.agency_id) ?? {}),
      }));

      setRows(enriched);
      setLoading(false);
    }
    load();
  }, []);

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
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Total Agencies', value: rows.length, sub: 'writing active policies' },
            { label: 'Active Premium', value: fmt$(totalPremium), sub: '/mo across all agencies' },
            { label: 'On Target (≥90%)', value: onTarget, sub: 'retention ≥ 90%', color: 'text-emerald-700' },
            { label: 'Below Target', value: belowTarget, sub: 'need coaching', color: belowTarget > 0 ? 'text-red-700' : 'text-foreground' },
          ].map(c => (
            <Card key={c.label} className="border-border">
              <CardContent className="py-4 px-5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">{c.label}</p>
                    <p className={`text-2xl font-bold mt-0.5 ${c.color ?? 'text-foreground'}`}>{c.value}</p>
                    <p className="text-xs text-muted-foreground/70 mt-0.5">{c.sub}</p>
                  </div>
                  <div className="p-2 rounded-lg bg-cyan-500/10">
                    <Building2 size={18} className="text-primary" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card className="border-border">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <CardTitle className="text-base font-semibold text-foreground">Agency Directory</CardTitle>
              <div className="relative w-full sm:w-64">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/70" />
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
                {[1,2,3,4,5].map(i => <div key={i} className="h-10 rounded bg-slate-100 animate-pulse" />)}
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
                      className={`hover:bg-background transition-colors cursor-pointer ${r.retention_pct !== null && r.retention_pct < 90 ? 'bg-red-500/10/20' : ''}`}
                    >
                      <TableCell>
                        <div className="font-medium text-foreground">
                          {r.name ?? <span className="font-mono text-xs text-muted-foreground/70">{r.agency_id.slice(0, 8)}…</span>}
                        </div>
                        {r.slug && <div className="text-xs text-muted-foreground/70">{r.slug}</div>}
                      </TableCell>
                      <TableCell className="text-right font-medium text-foreground/80">
                        {r.active_policies.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right text-foreground/80">
                        {fmt$(r.active_premium)}
                      </TableCell>
                      <TableCell className="text-right">
                        <span className={r.at_risk_count > 0 ? 'text-red-700 font-semibold' : 'text-muted-foreground/70'}>
                          {r.at_risk_count || '—'}
                        </span>
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {r.eligible_90d > 0 ? r.eligible_90d.toLocaleString() : <span className="text-slate-300">—</span>}
                      </TableCell>
                      <TableCell className={`text-right ${retentionColor(r.retention_pct)}`}>
                        {r.retention_pct !== null ? `${r.retention_pct}%` : '—'}
                      </TableCell>
                      <TableCell className="text-center">
                        {retentionBadge(r.retention_pct)}
                      </TableCell>
                      <TableCell className="text-center">
                        <Link to={`/agencies/${r.agency_id}`}>
                          <ChevronRight size={16} className="text-muted-foreground/70 hover:text-primary transition-colors" />
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                  {filtered.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-10 text-muted-foreground/70">
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
