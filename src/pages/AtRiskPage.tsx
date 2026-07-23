import { useEffect, useState, useMemo } from 'react';
import { Header } from '@/components/layout/Header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import {
  AlertTriangle, Clock, Search, ChevronDown, ChevronUp,
  CheckCircle2, TrendingDown,
} from 'lucide-react';

interface AtRiskRow {
  policy_number: string;
  agency_id: string;
  product_type: string;
  plan_premium: number;
  flag_type: string;
  paid_to_date: string;
  policy_effective_date: string;
  days_since_draft: number;
  draft_count: number;
  is_at_risk: boolean;
  task_id: string | null;
  task_status: string | null;
  task_due_date: string | null;
}

function urgencyLevel(days: number): 'critical' | 'high' | 'medium' {
  if (days >= 30) return 'critical';
  if (days >= 14) return 'high';
  return 'medium';
}

function urgencyBadge(days: number) {
  const u = urgencyLevel(days);
  if (u === 'critical') return 'bg-red-100 text-red-800 border-red-200';
  if (u === 'high') return 'bg-amber-100 text-amber-800 border-amber-200';
  return 'bg-slate-100 text-slate-700 border-slate-200';
}

function urgencyLabel(days: number) {
  const u = urgencyLevel(days);
  if (u === 'critical') return 'Critical';
  if (u === 'high') return 'Urgent';
  return 'Watch';
}

type SortKey = 'days' | 'premium' | 'product';
type SortDir = 'asc' | 'desc';

export function AtRiskPage() {
  const { role, profile } = useAuth();
  const [rows, setRows] = useState<AtRiskRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('days');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [filterUrgency, setFilterUrgency] = useState<'all' | 'critical' | 'high' | 'medium'>('all');
  const [togglingTask, setTogglingTask] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }

    async function load() {
      const PAGE_SIZE = 1000;
      const allRows: AtRiskRow[] = [];
      let offset = 0;

      while (true) {
        let query = supabase!
          .from('manager_at_risk_board')
          .select('*')
          .order('days_since_draft', { ascending: false })
          .range(offset, offset + PAGE_SIZE - 1);

        // Agents see only their agency's policies
        if (role === 'agent' && profile?.agency_id) {
          query = query.eq('agency_id', profile.agency_id);
        }

        const { data, error } = await query;
        if (error) { console.error('At-risk fetch error:', error.message); break; }
        if (!data || data.length === 0) break;

        allRows.push(...(data as AtRiskRow[]));

        if (data.length < PAGE_SIZE) break; // last page
        offset += PAGE_SIZE;
      }

      setRows(allRows);
      setLoading(false);
    }

    load();
  }, [role, profile]);

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

  const displayRows = useMemo(() => {
    let r = rows;

    if (search) {
      const q = search.toLowerCase();
      r = r.filter(row =>
        row.policy_number.toLowerCase().includes(q) ||
        row.product_type.toLowerCase().includes(q)
      );
    }

    if (filterUrgency !== 'all') {
      r = r.filter(row => urgencyLevel(row.days_since_draft) === filterUrgency);
    }

    const dir = sortDir === 'desc' ? -1 : 1;
    return [...r].sort((a, b) => {
      if (sortKey === 'days') return dir * (a.days_since_draft - b.days_since_draft);
      if (sortKey === 'premium') return dir * (a.plan_premium - b.plan_premium);
      if (sortKey === 'product') return dir * a.product_type.localeCompare(b.product_type);
      return 0;
    });
  }, [rows, search, filterUrgency, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    else { setSortKey(key); setSortDir('desc'); }
  }

  function SortIcon({ k }: { k: SortKey }) {
    if (sortKey !== k) return null;
    return sortDir === 'desc' ? <ChevronDown size={13} className="inline ml-0.5" /> : <ChevronUp size={13} className="inline ml-0.5" />;
  }

  // KPIs
  const critical = rows.filter(r => urgencyLevel(r.days_since_draft) === 'critical').length;
  const high = rows.filter(r => urgencyLevel(r.days_since_draft) === 'high').length;
  const totalPremium = rows.reduce((s, r) => s + Number(r.plan_premium), 0);
  const untasked = rows.filter(r => !r.task_id).length;

  if (loading) {
    return (
      <div>
        <Header title="At-Risk Policies" />
        <div className="p-6 space-y-4">
          {[1,2,3].map(i => <div key={i} className="h-28 rounded-lg bg-slate-100 animate-pulse" />)}
        </div>
      </div>
    );
  }

  return (
    <div>
      <Header title="At-Risk Policies" />
      <div className="p-6 space-y-6">

        {/* KPI strip */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Total At-Risk', value: rows.length.toString(), sub: `${untasked} need attention`, icon: AlertTriangle, color: 'text-red-600', bg: 'bg-red-50' },
            { label: 'Critical (30+ days)', value: critical.toString(), sub: 'no draft in 30+ days', icon: Clock, color: 'text-red-700', bg: 'bg-red-50' },
            { label: 'Urgent (14-29 days)', value: high.toString(), sub: 'approaching critical', icon: Clock, color: 'text-amber-700', bg: 'bg-amber-50' },
            { label: 'At-Risk Premium', value: `$${Math.round(totalPremium).toLocaleString()}`, sub: 'monthly premium exposed', icon: TrendingDown, color: 'text-amber-700', bg: 'bg-amber-50' },
          ].map(card => (
            <Card key={card.label} className="border-slate-200">
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-500">{card.label}</p>
                    <p className="text-2xl font-bold text-slate-900 mt-1">{card.value}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{card.sub}</p>
                  </div>
                  <div className={`p-2.5 rounded-lg ${card.bg}`}>
                    <card.icon size={20} className={card.color} />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Policy table */}
        <Card className="border-slate-200">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <CardTitle className="text-base font-semibold text-slate-900">Flagged Policies</CardTitle>
                <p className="text-xs text-slate-400 mt-0.5">{displayRows.length} of {rows.length} shown</p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {(['all', 'critical', 'high', 'medium'] as const).map(f => (
                  <button
                    key={f}
                    onClick={() => setFilterUrgency(f)}
                    className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                      filterUrgency === f
                        ? 'bg-[#1e3a5f] text-white border-[#1e3a5f]'
                        : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'
                    }`}
                  >
                    {f === 'all' ? `All (${rows.length})` :
                     f === 'critical' ? `Critical (${critical})` :
                     f === 'high' ? `Urgent (${high})` :
                     `Watch (${rows.length - critical - high})`}
                  </button>
                ))}
                <div className="relative">
                  <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <Input
                    placeholder="Search policy #…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="pl-8 h-8 text-sm w-44 bg-white"
                  />
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {/* Table header */}
            <div className="grid grid-cols-12 gap-2 px-4 py-2 bg-slate-50 text-xs font-semibold text-slate-500 border-t border-slate-100">
              <span className="col-span-2">Policy #</span>
              <span className="col-span-2 cursor-pointer hover:text-slate-800" onClick={() => toggleSort('product')}>Product <SortIcon k="product" /></span>
              <span className="col-span-2 text-right cursor-pointer hover:text-slate-800" onClick={() => toggleSort('premium')}>Premium <SortIcon k="premium" /></span>
              <span className="text-center">Drafts</span>
              <span className="col-span-2 text-right cursor-pointer hover:text-slate-800" onClick={() => toggleSort('days')}>Days Idle <SortIcon k="days" /></span>
              <span className="text-center">Urgency</span>
              <span className="col-span-2 text-center">Action</span>
            </div>

            <div className="divide-y divide-slate-100 max-h-[560px] overflow-y-auto">
              {displayRows.length === 0 && (
                <div className="py-10 text-center text-slate-400 text-sm">
                  {rows.length === 0 ? 'No at-risk policies found.' : 'No policies match your filters.'}
                </div>
              )}
              {displayRows.map(row => {
                const urgency = urgencyLevel(row.days_since_draft);
                const isBusy = togglingTask === row.policy_number;
                return (
                  <div
                    key={row.policy_number}
                    className={`grid grid-cols-12 gap-2 px-4 py-2.5 text-sm items-center hover:bg-slate-50 transition-colors ${
                      urgency === 'critical' ? 'border-l-2 border-l-red-400' :
                      urgency === 'high' ? 'border-l-2 border-l-amber-400' : ''
                    }`}
                  >
                    <span className="col-span-2 font-mono text-xs text-slate-700 truncate">{row.policy_number}</span>
                    <span className="col-span-2">
                      <Badge className={`text-[10px] px-1.5 py-0 border ${
                        row.product_type === 'HHC' ? 'bg-sky-50 text-sky-700 border-sky-200' : 'bg-violet-50 text-violet-700 border-violet-200'
                      }`}>
                        {row.product_type}
                      </Badge>
                    </span>
                    <span className="col-span-2 text-right text-slate-700 font-medium tabular-nums">
                      ${Number(row.plan_premium).toFixed(0)}
                    </span>
                    <span className="text-center text-slate-600 tabular-nums">{row.draft_count}</span>
                    <span className={`col-span-2 text-right font-semibold tabular-nums ${
                      urgency === 'critical' ? 'text-red-700' : urgency === 'high' ? 'text-amber-700' : 'text-slate-600'
                    }`}>
                      {row.days_since_draft}d
                    </span>
                    <span className="text-center">
                      <Badge className={`text-[10px] px-1.5 py-0 border ${urgencyBadge(row.days_since_draft)}`}>
                        {urgencyLabel(row.days_since_draft)}
                      </Badge>
                    </span>
                    <span className="col-span-2 text-center">
                      {!row.task_id ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={isBusy}
                          onClick={() => openTask(row.policy_number, row.agency_id)}
                          className="h-6 px-2 text-[11px] border-slate-300 hover:border-[#1e3a5f] hover:text-[#1e3a5f]"
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
                        <span className="text-xs text-emerald-600 font-medium">✓ Done</span>
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
