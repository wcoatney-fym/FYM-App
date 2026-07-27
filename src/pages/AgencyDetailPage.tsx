import { useEffect, useState, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Header } from '@/components/layout/Header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import {
  ShieldCheck, TrendingUp, AlertTriangle, DollarSign,
  ArrowLeft, ChevronDown, ChevronUp,
} from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────────
interface AgencySummary {
  agency_id: string;
  active_policies: number;
  active_premium: number;
  at_risk_count: number;
  retained_90d: number;
  eligible_90d: number;
  retention_pct: number | null;
}

interface AgencyInfo {
  tracker_id: string;
  name: string;
  slug: string | null;
  is_active: boolean;
}

interface PolicyRow {
  policy_number: string;
  product_type: string | null;
  status: string | null;
  plan_premium: number | null;
  paid_to_date: string | null;
  policy_effective_date: string | null;
  draft_count: number | null;
  is_at_risk: boolean;
  flag_type: string | null;
}

interface ProductBreakdown {
  product: string;
  count: number;
  premium: number;
  atRisk: number;
}

// ── Helpers ────────────────────────────────────────────────────────────────
function fmt$(n: number) {
  return '$' + Math.round(n).toLocaleString();
}

function retentionColor(pct: number | null) {
  if (pct === null) return 'text-muted-foreground/70';
  if (pct >= 90) return 'text-emerald-700';
  if (pct >= 85) return 'text-amber-700';
  return 'text-red-700';
}

function retentionBg(pct: number | null) {
  if (pct === null) return 'bg-background';
  if (pct >= 90) return 'bg-emerald-50';
  if (pct >= 85) return 'bg-amber-50';
  return 'bg-red-500/10';
}

type SortKey = 'premium' | 'days' | 'product' | 'status';
type SortDir = 'asc' | 'desc';

// ── Component ──────────────────────────────────────────────────────────────
export function AgencyDetailPage() {
  const { agencyId } = useParams<{ agencyId: string }>();
  const [info, setInfo] = useState<AgencyInfo | null>(null);
  const [summary, setSummary] = useState<AgencySummary | null>(null);
  const [policies, setPolicies] = useState<PolicyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAtRisk, setShowAtRisk] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('premium');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [togglingTask, setTogglingTask] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase || !agencyId) { setLoading(false); return; }
    const targetId = agencyId;

    async function load() {
      // Agency name from agencies table
      const { data: agencyData } = await (supabase as any)
        .from('agencies')
        .select('tracker_id, name, slug, is_active')
        .eq('tracker_id', targetId)
        .maybeSingle();
      if (agencyData) setInfo(agencyData as AgencyInfo);

      // Retention summary from view
      const { data: summaryData } = await supabase!
        .from('agency_retention_summary')
        .select('*')
        .eq('agency_id', targetId)
        .maybeSingle();
      if (summaryData) setSummary(summaryData as unknown as AgencySummary);

      // All policies for this agency
      const allPolicies: PolicyRow[] = [];
      let offset = 0;
      const PAGE = 500;
      while (true) {
        const { data, error } = await supabase!
          .from('policy_cache')
          .select('policy_number, product_type, status, plan_premium, paid_to_date, policy_effective_date, draft_count, is_at_risk, flag_type')
          .eq('agency_id', targetId)
          .order('plan_premium', { ascending: false })
          .range(offset, offset + PAGE - 1);
        if (error || !data) break;
        allPolicies.push(...(data as PolicyRow[]));
        if (data.length < PAGE) break;
        offset += PAGE;
      }
      setPolicies(allPolicies);
      setLoading(false);
    }

    load();
  }, [agencyId]);

  // Product breakdown
  const productBreakdown = useMemo(() => {
    const map: Record<string, ProductBreakdown> = {};
    for (const p of policies) {
      const key = p.product_type ?? 'Unknown';
      if (!map[key]) map[key] = { product: key, count: 0, premium: 0, atRisk: 0 };
      if (p.status === 'active') {
        map[key].count++;
        map[key].premium += Number(p.plan_premium) || 0;
      }
      if (p.is_at_risk) map[key].atRisk++;
    }
    return Object.values(map).sort((a, b) => b.premium - a.premium);
  }, [policies]);

  // At-risk policies (sortable)
  const atRiskPolicies = useMemo(() => {
    let rows = policies.filter(p => p.is_at_risk);
    const dir = sortDir === 'desc' ? -1 : 1;
    return [...rows].sort((a, b) => {
      if (sortKey === 'premium') return dir * ((Number(a.plan_premium) || 0) - (Number(b.plan_premium) || 0));
      if (sortKey === 'days') {
        const daysA = a.paid_to_date ? Math.floor((Date.now() - new Date(a.paid_to_date).getTime()) / 86400000) : 0;
        const daysB = b.paid_to_date ? Math.floor((Date.now() - new Date(b.paid_to_date).getTime()) / 86400000) : 0;
        return dir * (daysA - daysB);
      }
      if (sortKey === 'product') return dir * (a.product_type ?? '').localeCompare(b.product_type ?? '');
      return 0;
    });
  }, [policies, sortKey, sortDir]);

  // Policy status breakdown
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const p of policies) {
      const s = p.status ?? 'unknown';
      counts[s] = (counts[s] || 0) + 1;
    }
    return counts;
  }, [policies]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    else { setSortKey(key); setSortDir('desc'); }
  }

  function SortIcon({ k }: { k: SortKey }) {
    if (sortKey !== k) return null;
    return sortDir === 'desc' ? <ChevronDown size={13} className="inline ml-0.5" /> : <ChevronUp size={13} className="inline ml-0.5" />;
  }

  async function openTask(policy_number: string) {
    if (!supabase || !agencyId) return;
    setTogglingTask(policy_number);
    await (supabase as any)
      .from('atrisk_tasks')
      .insert({
        policy_number,
        agency_id: agencyId,
        status: 'open',
        flag_type: 'at_risk',
        due_date: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
      });
    setTogglingTask(null);
  }

  const agencyName = info?.name ?? agencyId?.slice(0, 8) + '…';
  const s = summary;

  if (loading) {
    return (
      <div>
        <Header title="Agency Detail" />
        <div className="p-6 space-y-4">
          {[1, 2, 3].map(i => <div key={i} className="h-28 rounded-lg bg-slate-100 animate-pulse" />)}
        </div>
      </div>
    );
  }

  return (
    <div>
      <Header title={agencyName} />
      <div className="p-6 space-y-6">

        {/* Back link */}
        <Link to="/agencies" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors">
          <ArrowLeft size={14} /> All Agencies
        </Link>

        {/* KPI strip */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            {
              title: 'Active Policies',
              value: s ? s.active_policies.toLocaleString() : '—',
              sub: s ? fmt$(s.active_premium) + '/mo' : '',
              icon: ShieldCheck, color: 'text-primary', bg: 'bg-cyan-500/10',
            },
            {
              title: '90-Day Retention',
              value: s?.retention_pct !== null && s?.retention_pct !== undefined ? `${s.retention_pct}%` : '—',
              sub: s ? `${s.retained_90d} of ${s.eligible_90d} eligible` : '',
              icon: TrendingUp,
              color: s ? retentionColor(s.retention_pct) : 'text-muted-foreground/70',
              bg: s ? retentionBg(s.retention_pct) : 'bg-background',
            },
            {
              title: 'At-Risk',
              value: s ? s.at_risk_count.toString() : '—',
              sub: 'flagged policies',
              icon: AlertTriangle,
              color: s && s.at_risk_count > 0 ? 'text-red-400' : 'text-muted-foreground/70',
              bg: s && s.at_risk_count > 0 ? 'bg-red-500/10' : 'bg-background',
            },
            {
              title: 'Avg Premium',
              value: s && s.active_policies > 0 ? fmt$(s.active_premium / s.active_policies) : '—',
              sub: 'per active policy',
              icon: DollarSign, color: 'text-foreground/80', bg: 'bg-slate-100',
            },
          ].map(card => (
            <Card key={card.title} className="border-border">
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">{card.title}</p>
                    <p className="text-2xl font-bold text-foreground mt-1">{card.value}</p>
                    {card.sub && <p className="text-xs text-muted-foreground/70 mt-0.5">{card.sub}</p>}
                  </div>
                  <div className={`p-2.5 rounded-lg ${card.bg}`}>
                    <card.icon size={20} className={card.color} />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Product breakdown + status */}
        <div className="grid lg:grid-cols-2 gap-6">
          <Card className="border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold text-foreground">Product Mix</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-slate-100">
                <div className="grid grid-cols-4 gap-2 px-4 py-2 bg-background text-xs font-semibold text-muted-foreground">
                  <span>Product</span>
                  <span className="text-right">Active</span>
                  <span className="text-right">Premium/mo</span>
                  <span className="text-right">At-Risk</span>
                </div>
                {productBreakdown.map(p => (
                  <div key={p.product} className="grid grid-cols-4 gap-2 px-4 py-2.5 text-sm">
                    <span>
                      <Badge className={`text-[10px] px-1.5 py-0 border ${
                        p.product === 'HHC' ? 'bg-sky-50 text-sky-700 border-sky-200' :
                        p.product === 'HI' ? 'bg-violet-50 text-violet-700 border-violet-200' :
                        'bg-background text-muted-foreground border-border'
                      }`}>{p.product}</Badge>
                    </span>
                    <span className="text-right text-foreground/80 font-medium">{p.count}</span>
                    <span className="text-right text-foreground/80">{fmt$(p.premium)}</span>
                    <span className={`text-right font-medium ${p.atRisk > 0 ? 'text-red-700' : 'text-muted-foreground/70'}`}>
                      {p.atRisk || '—'}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold text-foreground">Policy Status</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {Object.entries(statusCounts)
                  .sort(([, a], [, b]) => b - a)
                  .map(([status, count]) => {
                    const total = policies.length || 1;
                    const pct = Math.round((count / total) * 100);
                    const barColor =
                      status === 'active' ? 'bg-emerald-500' :
                      status === 'lapsed' ? 'bg-red-400' :
                      status === 'terminated' ? 'bg-slate-400' :
                      'bg-amber-400';
                    return (
                      <div key={status}>
                        <div className="flex items-center justify-between text-sm mb-1">
                          <span className="capitalize text-foreground/80 font-medium">{status}</span>
                          <span className="text-muted-foreground tabular-nums">{count} ({pct}%)</span>
                        </div>
                        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* At-risk policies expandable section */}
        {atRiskPolicies.length > 0 && (
          <Card className="border-border">
            <CardHeader className="pb-3">
              <button
                onClick={() => setShowAtRisk(!showAtRisk)}
                className="w-full flex items-center justify-between"
              >
                <div className="flex items-center gap-2">
                  <CardTitle className="text-base font-semibold text-foreground">
                    At-Risk Policies
                  </CardTitle>
                  <Badge className="bg-red-500/10 text-red-700 border-red-500/20 border">
                    {atRiskPolicies.length}
                  </Badge>
                </div>
                {showAtRisk ? <ChevronUp size={18} className="text-muted-foreground/70" /> : <ChevronDown size={18} className="text-muted-foreground/70" />}
              </button>
            </CardHeader>
            {showAtRisk && (
              <CardContent className="p-0 border-t border-border/50">
                <div className="grid grid-cols-8 gap-2 px-4 py-2 bg-background text-xs font-semibold text-muted-foreground">
                  <span className="col-span-2">Policy #</span>
                  <span className="cursor-pointer hover:text-foreground" onClick={() => toggleSort('product')}>Product <SortIcon k="product" /></span>
                  <span className="text-right cursor-pointer hover:text-foreground" onClick={() => toggleSort('premium')}>Premium <SortIcon k="premium" /></span>
                  <span className="text-center">Drafts</span>
                  <span className="text-right cursor-pointer hover:text-foreground" onClick={() => toggleSort('days')}>Days Idle <SortIcon k="days" /></span>
                  <span className="text-center">Flag</span>
                  <span className="text-center">Action</span>
                </div>
                <div className="divide-y divide-slate-100 max-h-[400px] overflow-y-auto">
                  {atRiskPolicies.map(p => {
                    const daysIdle = p.paid_to_date
                      ? Math.floor((Date.now() - new Date(p.paid_to_date).getTime()) / 86400000)
                      : 0;
                    const isBusy = togglingTask === p.policy_number;
                    return (
                      <div
                        key={p.policy_number}
                        className={`grid grid-cols-8 gap-2 px-4 py-2.5 text-sm items-center hover:bg-background ${
                          daysIdle >= 30 ? 'border-l-2 border-l-red-400' : daysIdle >= 14 ? 'border-l-2 border-l-amber-400' : ''
                        }`}
                      >
                        <span className="col-span-2 font-mono text-xs text-foreground/80 truncate">{p.policy_number}</span>
                        <span>
                          <Badge className={`text-[10px] px-1.5 py-0 border ${
                            p.product_type === 'HHC' ? 'bg-sky-50 text-sky-700 border-sky-200' : 'bg-violet-50 text-violet-700 border-violet-200'
                          }`}>{p.product_type}</Badge>
                        </span>
                        <span className="text-right text-foreground/80 font-medium tabular-nums">${(Number(p.plan_premium) || 0).toFixed(0)}</span>
                        <span className="text-center text-muted-foreground tabular-nums">{p.draft_count ?? 0}</span>
                        <span className={`text-right font-semibold tabular-nums ${daysIdle >= 30 ? 'text-red-700' : daysIdle >= 14 ? 'text-amber-700' : 'text-muted-foreground'}`}>
                          {daysIdle}d
                        </span>
                        <span className="text-center">
                          <Badge className={`text-[10px] px-1.5 py-0 border ${
                            p.flag_type === 'at_risk' ? 'bg-red-500/10 text-red-700 border-red-500/20' :
                            p.flag_type === 'payment_failed' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                            'bg-background text-muted-foreground border-border'
                          }`}>{p.flag_type ?? '—'}</Badge>
                        </span>
                        <span className="text-center">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={isBusy}
                            onClick={() => openTask(p.policy_number)}
                            className="h-6 px-2 text-[11px] border-border hover:border-[#1e3a5f] hover:text-primary"
                          >
                            {isBusy ? '…' : 'Task'}
                          </Button>
                        </span>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}
