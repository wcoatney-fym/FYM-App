import { useEffect, useState, useMemo } from 'react';
import { Header } from '@/components/layout/Header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { StaggerContainer, StaggerItem, CountUp } from '@/components/ui/animated';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useEffectiveAuth } from '@/hooks/useEffectiveAuth';
import { DataFilters } from '@/components/filters/DataFilters';
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
  if (u === 'critical') return 'bg-red-500/10 text-red-400 border-red-500/20';
  if (u === 'high') return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
  return 'bg-secondary text-foreground/80 border-border';
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
  const { effectiveAgencyId, effectiveWritingNumber, isOrgWide, isAgent } = useEffectiveAuth();
  const [rows, setRows] = useState<AtRiskRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('days');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [filterUrgency, setFilterUrgency] = useState<'all' | 'critical' | 'high' | 'medium'>('all');
  const [togglingTask, setTogglingTask] = useState<string | null>(null);
  const [filterAgencyId, setFilterAgencyId] = useState<string | null>(null);
  const [filterAgentId, setFilterAgentId] = useState<string | null>(null);

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

        // Agents see only their own policies (by writing number)
        if (isAgent && effectiveWritingNumber) {
          query = query.eq('agent_id', effectiveWritingNumber);
        } else if (!isOrgWide && effectiveAgencyId) {
          // Managers & agency admins see their agency's policies
          query = query.eq('agency_id', effectiveAgencyId);
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
  }, [role, profile, effectiveAgencyId, effectiveWritingNumber, isOrgWide, isAgent]);

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

    // Agency/agent filters (org-wide admins only)
    if (filterAgencyId) {
      r = r.filter(row => row.agency_id === filterAgencyId);
    }
    if (filterAgentId) {
      r = r.filter(row => (row as any).agent_id === filterAgentId);
    }

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
  }, [rows, search, filterUrgency, sortKey, sortDir, filterAgencyId, filterAgentId]);

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
          {[1,2,3].map(i => <div key={i} className="h-28 rounded-lg shimmer" />)}
        </div>
      </div>
    );
  }

  return (
    <div>
      <Header title={isAgent ? 'Your At-Risk Policies' : 'At-Risk Policies'} />
      <div className="p-6 space-y-6">

        {/* Agency + Agent filters — FYM admins only */}
        {isOrgWide && (
          <DataFilters
            showAgentFilter
            selectedAgencyId={filterAgencyId}
            selectedAgentId={filterAgentId}
            onAgencyChange={setFilterAgencyId}
            onAgentChange={setFilterAgentId}
          />
        )}

        {/* KPI strip */}
        <StaggerContainer className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Total At-Risk', end: rows.length, sub: `${untasked} need attention`, icon: AlertTriangle, color: 'text-red-400', bg: 'bg-red-500/10' },
            { label: 'Critical (30+ days)', end: critical, sub: 'no draft in 30+ days', icon: Clock, color: 'text-red-400', bg: 'bg-red-500/10' },
            { label: 'Urgent (14-29 days)', end: high, sub: 'approaching critical', icon: Clock, color: 'text-amber-400', bg: 'bg-amber-500/10' },
            { label: 'At-Risk Premium', end: totalPremium, sub: 'monthly premium exposed', icon: TrendingDown, color: 'text-amber-400', bg: 'bg-amber-500/10', fmt: (n: number) => `$${Math.round(n).toLocaleString()}` },
          ].map(card => (
            <StaggerItem key={card.label}>
              <Card className="border-border">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">{card.label}</p>
                      <CountUp
                        end={card.end}
                        format={card.fmt}
                        className="text-2xl font-bold text-foreground mt-1 block"
                      />
                      <p className="text-xs text-muted-foreground/70 mt-0.5">{card.sub}</p>
                    </div>
                    <div className={`p-2.5 rounded-lg ${card.bg}`}>
                      <card.icon size={20} className={card.color} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </StaggerItem>
          ))}
        </StaggerContainer>

        {/* Policy table */}
        <Card className="border-border">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <CardTitle className="text-base font-semibold text-foreground">Flagged Policies</CardTitle>
                <p className="text-xs text-muted-foreground/70 mt-0.5">{displayRows.length} of {rows.length} shown</p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {(['all', 'critical', 'high', 'medium'] as const).map(f => (
                  <button
                    key={f}
                    onClick={() => setFilterUrgency(f)}
                    className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                      filterUrgency === f
                        ? 'gradient-primary text-primary-foreground border-primary/30'
                        : 'bg-secondary text-muted-foreground border-border hover:border-primary/30'
                    }`}
                  >
                    {f === 'all' ? `All (${rows.length})` :
                     f === 'critical' ? `Critical (${critical})` :
                     f === 'high' ? `Urgent (${high})` :
                     `Watch (${rows.length - critical - high})`}
                  </button>
                ))}
                <div className="relative">
                  <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/70" />
                  <Input
                    placeholder="Search policy #…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="pl-8 h-8 text-sm w-44 bg-card"
                  />
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {/* Table header */}
            <div className="grid grid-cols-12 gap-2 px-4 py-2 bg-background text-xs font-semibold text-muted-foreground border-t border-border/50">
              <span className="col-span-2">Policy #</span>
              <span className="col-span-2 cursor-pointer hover:text-foreground" onClick={() => toggleSort('product')}>Product <SortIcon k="product" /></span>
              <span className="col-span-2 text-right cursor-pointer hover:text-foreground" onClick={() => toggleSort('premium')}>Premium <SortIcon k="premium" /></span>
              <span className="text-center">Drafts</span>
              <span className="col-span-2 text-right cursor-pointer hover:text-foreground" onClick={() => toggleSort('days')}>Days Idle <SortIcon k="days" /></span>
              <span className="text-center">Urgency</span>
              <span className="col-span-2 text-center">Action</span>
            </div>

            <div className="divide-y divide-border/30 max-h-[560px] overflow-y-auto scrollbar-thin">
              {displayRows.length === 0 && (
                <div className="py-10 text-center text-muted-foreground/70 text-sm">
                  {rows.length === 0 ? 'No at-risk policies found.' : 'No policies match your filters.'}
                </div>
              )}
              {displayRows.map(row => {
                const urgency = urgencyLevel(row.days_since_draft);
                const isBusy = togglingTask === row.policy_number;
                return (
                  <div
                    key={row.policy_number}
                    className={`grid grid-cols-12 gap-2 px-4 py-2.5 text-sm items-center hover:bg-background transition-colors ${
                      urgency === 'critical' ? 'border-l-2 border-l-red-400' :
                      urgency === 'high' ? 'border-l-2 border-l-amber-400' : ''
                    }`}
                  >
                    <span className="col-span-2 font-data text-xs text-foreground/80 truncate">{row.policy_number}</span>
                    <span className="col-span-2">
                      <Badge className={`text-[10px] px-1.5 py-0 border ${
                        row.product_type === 'HHC' ? 'bg-sky-500/10 text-sky-400 border-sky-500/20' : 'bg-violet-500/10 text-violet-400 border-violet-500/20'
                      }`}>
                        {row.product_type}
                      </Badge>
                    </span>
                    <span className="col-span-2 text-right text-foreground/80 font-medium font-data">
                      ${Number(row.plan_premium).toFixed(0)}
                    </span>
                    <span className="text-center text-muted-foreground font-data">{row.draft_count}</span>
                    <span className={`col-span-2 text-right font-semibold font-data ${
                      urgency === 'critical' ? 'text-red-400' : urgency === 'high' ? 'text-amber-400' : 'text-muted-foreground'
                    }`}>
                      {row.days_since_draft}d
                    </span>
                    <span className="text-center">
                      <Badge className={`text-[10px] px-1.5 py-0 border ${urgencyBadge(row.days_since_draft)}`}>
                        {urgencyLabel(row.days_since_draft)}
                      </Badge>
                    </span>
                    <span className="col-span-2 text-center">
                      {isAgent ? (
                        // Agents see status only, no task controls
                        row.task_status === 'resolved'
                          ? <span className="text-xs text-emerald-400 font-medium">✓ Resolved</span>
                          : row.task_id
                          ? <Badge className="text-[10px] px-1.5 py-0 border bg-cyan-500/10 text-cyan-400 border-cyan-500/20">In Review</Badge>
                          : <Badge className="text-[10px] px-1.5 py-0 border bg-amber-500/10 text-amber-400 border-amber-500/20">Needs Attention</Badge>
                      ) : (
                        !row.task_id ? (
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
                            className="h-6 px-2 text-[11px] bg-emerald-500 hover:bg-emerald-600 text-white"
                          >
                            {isBusy ? '…' : <><CheckCircle2 size={11} className="mr-1 inline" />Resolve</>}
                          </Button>
                        ) : (
                          <span className="text-xs text-emerald-400 font-medium">✓ Done</span>
                        )
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
