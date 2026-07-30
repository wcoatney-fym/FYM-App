import { useEffect, useState, useMemo } from 'react';
import { Header } from '@/components/layout/Header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/lib/supabase';
import { scopeToAgency } from '@/lib/query-helpers';
import { useEffectiveAuth } from '@/hooks/useEffectiveAuth';
import {
  AlertTriangle, Clock, CheckCircle2, Search,
  TrendingDown, TrendingUp, ChevronDown, ChevronUp,
} from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────────
interface AtRiskRow {
  policy_number: string;
  agency_id: string;
  agency_name: string;
  agent_id: string | null;
  product_type: string;
  plan_premium: number;
  flag_type: string;
  paid_to_date: string;
  days_since_draft: number;
  draft_count: number;
  task_id: string | null;
  task_status: string | null;
  task_due_date: string | null;
}

interface AgencyRetention {
  agency_id: string;
  agency_name: string;
  active_policies: number;
  active_premium: number;
  at_risk_count: number;
  retained_90d: number;
  eligible_90d: number;
  retention_pct: number | null;
}

// ── Helpers ────────────────────────────────────────────────────────────────
function urgencyLevel(days: number): 'critical' | 'high' | 'medium' {
  if (days >= 30) return 'critical';
  if (days >= 14) return 'high';
  return 'medium';
}


function taskBadge(status: string | null) {
  if (!status) return 'shimmer text-muted-foreground border-border';
  if (status === 'open') return 'bg-blue-500/10 text-cyan-400 border-blue-500/20';
  if (status === 'resolved') return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
  return 'shimmer text-muted-foreground border-border';
}

function retentionColor(pct: number | null) {
  if (pct === null) return 'text-muted-foreground/70';
  if (pct >= 90) return 'text-emerald-400 font-semibold';
  if (pct >= 85) return 'text-amber-400 font-semibold';
  return 'text-red-400 font-bold';
}

function fmt$(n: number) {
  return '$' + n.toLocaleString();
}


type SortKey = 'days' | 'premium' | 'drafts' | 'agency';
type SortDir = 'asc' | 'desc';

// ── Component ──────────────────────────────────────────────────────────────
export function ManagerWorkboardPage() {
  const { effectiveAgencyId, isOrgWide } = useEffectiveAuth();
  const [rows, setRows] = useState<AtRiskRow[]>([]);
  const [agencies, setAgencies] = useState<AgencyRetention[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('days');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [filterStatus, setFilterStatus] = useState<'all' | 'untasked' | 'open' | 'resolved'>('all');
  const [togglingTask, setTogglingTask] = useState<string | null>(null);

  async function load() {
    if (!supabase) { setLoading(false); return; }

    const { data: boardData } = await scopeToAgency(
      supabase
        .from('manager_at_risk_board')
        .select('*')
        .order('days_since_draft', { ascending: false }),
      isOrgWide,
      effectiveAgencyId
    );

    if (boardData) setRows(boardData as unknown as AtRiskRow[]);

    const { data: agencyData } = await scopeToAgency(
      supabase
        .from('agency_retention_summary')
        .select('*')
        .order('retention_pct', { ascending: true })
        .limit(20),
      isOrgWide,
      effectiveAgencyId
    );

    if (agencyData) setAgencies(agencyData as AgencyRetention[]);

    setLoading(false);
  }

  useEffect(() => { load(); }, [effectiveAgencyId, isOrgWide]);

  // Open a task on a policy (upsert into atrisk_tasks)
  async function openTask(policy_number: string, agency_id: string) {
    if (!supabase) return;
    setTogglingTask(policy_number);
    const { error } = await (supabase as any)
      .from('atrisk_tasks')
      .insert({
        policy_number,
        agency_id,
        status: 'open',
        flag_type: 'at_risk',
        due_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      });
    if (!error) {
      setRows(prev => prev.map(r =>
        r.policy_number === policy_number
          ? { ...r, task_id: 'pending', task_status: 'open' }
          : r
      ));
    }
    setTogglingTask(null);
  }

  async function resolveTask(task_id: string, policy_number: string) {
    if (!supabase || !task_id || task_id === 'pending') return;
    setTogglingTask(policy_number);
    await (supabase as any)
      .from('atrisk_tasks')
      .update({ status: 'resolved', updated_at: new Date().toISOString() })
      .eq('id', task_id);
    setRows(prev => prev.map(r =>
      r.policy_number === policy_number
        ? { ...r, task_status: 'resolved' }
        : r
    ));
    setTogglingTask(null);
  }

  // Sorted + filtered rows
  const displayRows = useMemo(() => {
    let r = rows;

    if (search) {
      const q = search.toLowerCase();
      r = r.filter(row =>
        row.policy_number.toLowerCase().includes(q) ||
        (row.agency_name || row.agency_id || '').toLowerCase().includes(q)
      );
    }

    if (filterStatus === 'untasked') r = r.filter(row => !row.task_id);
    if (filterStatus === 'open')     r = r.filter(row => row.task_status === 'open');
    if (filterStatus === 'resolved') r = r.filter(row => row.task_status === 'resolved');

    const dir = sortDir === 'desc' ? -1 : 1;
    return [...r].sort((a, b) => {
      if (sortKey === 'days')    return dir * (a.days_since_draft - b.days_since_draft);
      if (sortKey === 'premium') return dir * (a.plan_premium - b.plan_premium);
      if (sortKey === 'drafts')  return dir * (a.draft_count - b.draft_count);
      if (sortKey === 'agency')  return dir * (a.agency_name || a.agency_id || '').localeCompare(b.agency_name || b.agency_id || '');
      return 0;
    });
  }, [rows, search, filterStatus, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    else { setSortKey(key); setSortDir('desc'); }
  }

  function SortIcon({ k }: { k: SortKey }) {
    if (sortKey !== k) return null;
    return sortDir === 'desc' ? <ChevronDown size={13} className="inline ml-0.5" /> : <ChevronUp size={13} className="inline ml-0.5" />;
  }

  // KPIs
  const untasked  = rows.filter(r => !r.task_id).length;
  const critical  = rows.filter(r => urgencyLevel(r.days_since_draft) === 'critical').length;
  const atRiskPremium = rows.reduce((s, r) => s + r.plan_premium, 0);
  const belowTarget = agencies.filter(a => a.retention_pct !== null && a.retention_pct < 90).length;

  if (loading) {
    return (
      <div>
        <Header title="Manager Workboard" />
        <div className="p-6 space-y-4">
          {[1,2,3].map(i => <div key={i} className="h-28 rounded-lg shimmer " />)}
        </div>
      </div>
    );
  }

  return (
    <div>
      <Header title="Manager Workboard" />
      <div className="p-6 space-y-6">

        {/* ── KPI strip ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'At-Risk Policies', value: rows.length, sub: `${untasked} untasked`, icon: AlertTriangle, color: 'text-red-400', bg: 'bg-red-500/10' },
            { label: 'Critical (30+ days)', value: critical, sub: 'no draft in 30+ days', icon: Clock, color: 'text-red-400', bg: 'bg-red-500/10' },
            { label: 'At-Risk Premium', value: fmt$(Math.round(atRiskPremium)), sub: 'recoverable', icon: TrendingDown, color: 'text-amber-400', bg: 'bg-amber-500/10' },
            { label: 'Agencies Below 90%', value: belowTarget, sub: 'need coaching', icon: TrendingUp, color: 'text-cyan-400', bg: 'bg-cyan-500/10' },
          ].map(card => (
            <Card key={card.label} className="border-border">
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">{card.label}</p>
                    <p className="text-2xl font-bold text-foreground mt-1">{card.value}</p>
                    <p className="text-xs text-muted-foreground/70 mt-0.5">{card.sub}</p>
                  </div>
                  <div className={`p-2.5 rounded-lg ${card.bg}`}>
                    <card.icon size={20} className={card.color} />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* ── Agency coaching panel ── */}
        {agencies.length > 0 && (
          <Card className="border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold text-foreground">Agency Retention Coaching Signals</CardTitle>
              <p className="text-xs text-muted-foreground/70 mt-0.5">Agencies sorted by 90-day retention (worst first). Below 90% = coaching needed.</p>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-border/30">
                <div className="grid grid-cols-6 gap-2 px-4 py-2 bg-background text-xs font-semibold text-muted-foreground">
                  <span className="col-span-2">Agency</span>
                  <span className="text-right">Active</span>
                  <span className="text-right">At-Risk</span>
                  <span className="text-right">Eligible</span>
                  <span className="text-right">Retention</span>
                </div>
                {agencies.slice(0, 10).map((a, i) => (
                  <div key={i} className={`grid grid-cols-6 gap-2 px-4 py-2.5 text-sm ${a.retention_pct !== null && a.retention_pct < 90 ? 'bg-red-500/30' : ''}`}>
                    <span className="col-span-2 font-medium text-foreground truncate" title={a.agency_name}>{a.agency_name}</span>
                    <span className="text-right text-muted-foreground">{a.active_policies}</span>
                    <span className={`text-right font-medium ${a.at_risk_count > 0 ? 'text-red-400' : 'text-muted-foreground'}`}>{a.at_risk_count}</span>
                    <span className="text-right text-muted-foreground">{a.eligible_90d}</span>
                    <span className={`text-right ${retentionColor(a.retention_pct)}`}>
                      {a.retention_pct !== null ? `${a.retention_pct}%` : '—'}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── At-risk workboard ── */}
        <Card className="border-border">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <CardTitle className="text-base font-semibold text-foreground">At-Risk Policy Workboard</CardTitle>
                <p className="text-xs text-muted-foreground/70 mt-0.5">{displayRows.length} of {rows.length} shown</p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {/* filter tabs */}
                {(['all','untasked','open','resolved'] as const).map(f => (
                  <button
                    key={f}
                    onClick={() => setFilterStatus(f)}
                    className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                      filterStatus === f
                        ? 'gradient-primary text-primary-foreground border-primary/30'
                        : 'bg-secondary text-muted-foreground border-border hover:border-primary/30'
                    }`}
                  >
                    {f === 'all' ? `All (${rows.length})` :
                     f === 'untasked' ? `Untasked (${rows.filter(r => !r.task_id).length})` :
                     f === 'open' ? `Open (${rows.filter(r => r.task_status === 'open').length})` :
                     `Resolved (${rows.filter(r => r.task_status === 'resolved').length})`}
                  </button>
                ))}
                <div className="relative">
                  <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/70" />
                  <Input
                    placeholder="Search policy or agency…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="pl-8 h-8 text-sm w-52 bg-card"
                  />
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {/* table header */}
            <div className="grid grid-cols-12 gap-2 px-4 py-2 bg-background text-xs font-semibold text-muted-foreground border-t border-border/50">
              <span className="col-span-2">Policy #</span>
              <span className="col-span-2 cursor-pointer hover:text-foreground" onClick={() => toggleSort('agency')}>Agency <SortIcon k="agency" /></span>
              <span className="text-center">Product</span>
              <span className="text-right cursor-pointer hover:text-foreground" onClick={() => toggleSort('premium')}>Premium <SortIcon k="premium" /></span>
              <span className="text-right cursor-pointer hover:text-foreground" onClick={() => toggleSort('drafts')}>Drafts <SortIcon k="drafts" /></span>
              <span className="text-right cursor-pointer hover:text-foreground col-span-2" onClick={() => toggleSort('days')}>Days Idle <SortIcon k="days" /></span>
              <span className="text-center">Task</span>
              <span className="col-span-2 text-center">Action</span>
            </div>

            <div className="divide-y divide-border/30 max-h-[520px] overflow-y-auto">
              {displayRows.length === 0 && (
                <div className="py-10 text-center text-muted-foreground/70 text-sm">No policies match your filters.</div>
              )}
              {displayRows.map(row => {
                const urgency = urgencyLevel(row.days_since_draft);
                const isBusy = togglingTask === row.policy_number;
                return (
                  <div
                    key={row.policy_number}
                    className={`grid grid-cols-12 gap-2 px-4 py-2.5 text-sm items-center hover:bg-background transition-colors ${
                      urgency === 'critical' ? 'border-l-2 border-l-red-400' : urgency === 'high' ? 'border-l-2 border-l-amber-400' : ''
                    }`}
                  >
                    <span className="col-span-2 font-data text-xs text-foreground/80 truncate">{row.policy_number}</span>
                    <span className="col-span-2 text-muted-foreground text-xs truncate" title={row.agency_name}>{row.agency_name}</span>
                    <span className="text-center">
                      <Badge className={`text-[10px] px-1.5 py-0 ${row.product_type === 'HHC' ? 'bg-sky-500/10 text-sky-400 border-sky-500/20' : 'bg-violet-500/10 text-violet-400 border-violet-500/20'} border`}>
                        {row.product_type}
                      </Badge>
                    </span>
                    <span className="text-right text-foreground/80 font-medium">${row.plan_premium.toFixed(0)}</span>
                    <span className="text-right text-muted-foreground">{row.draft_count}</span>
                    <span className={`text-right col-span-2 font-semibold ${urgency === 'critical' ? 'text-red-400' : urgency === 'high' ? 'text-amber-400' : 'text-muted-foreground'}`}>
                      {row.days_since_draft}d
                      {urgency === 'critical' && <span className="ml-1 text-[10px] text-red-500">⚠</span>}
                    </span>
                    <span className="text-center">
                      <Badge className={`text-[10px] px-1.5 py-0 border ${taskBadge(row.task_status)}`}>
                        {row.task_status ?? 'none'}
                      </Badge>
                    </span>
                    <span className="col-span-2 text-center">
                      {!row.task_id ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={isBusy}
                          onClick={() => openTask(row.policy_number, row.agency_id)}
                          className="h-6 px-2 text-[11px] border-border hover:border-primary/50 hover:text-primary"
                        >
                          {isBusy ? '…' : 'Open Task'}
                        </Button>
                      ) : row.task_status !== 'resolved' ? (
                        <Button
                          size="sm"
                          disabled={isBusy}
                          onClick={() => resolveTask(row.task_id!, row.policy_number)}
                          className="h-6 px-2 text-[11px] bg-emerald-600 hover:bg-emerald-700 text-white"
                        >
                          {isBusy ? '…' : <><CheckCircle2 size={11} className="mr-1 inline" />Resolve</>}
                        </Button>
                      ) : (
                        <span className="text-xs text-emerald-400 font-medium">✓ Done</span>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

      </div>
    </div>
  );
}
