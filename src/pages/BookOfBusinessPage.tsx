import { useEffect, useState, useCallback } from 'react';
import { Header } from '@/components/layout/Header';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { StaggerContainer, StaggerItem, CountUp } from '@/components/ui/animated';
import { Input } from '@/components/ui/input';
import { supabase } from '@/lib/supabase';
import { scopeToAgency } from '@/lib/query-helpers';
import { useEffectiveAuth } from '@/hooks/useEffectiveAuth';
import { DataFilters } from '@/components/filters/DataFilters';
import {
  FileText, DollarSign, AlertTriangle, Clock,
  Search, ChevronLeft, ChevronRight, Download,
  Filter, X,
} from 'lucide-react';
import { TimePeriodSelector } from '@/components/filters/TimePeriodSelector';
import { type DatePreset, type DateRange, DEFAULT_PRESET, getDateRange } from '@/lib/dateUtils';

// ── Types ──────────────────────────────────────────────────────────────────
interface Policy {
  policy_number: string;
  client_name: string | null;
  agent_name: string | null;
  writing_number: string | null;
  agency_name: string | null;
  agency_id: string;
  product_type: string;
  status: string;
  monthly_premium: number;
  annual_premium: number;
  billing_mode: string | null;
  policy_effective_date: string | null;
  paid_to_date: string | null;
  draft_count: number | null;
  is_at_risk: boolean;
  flag_type: string | null;
  days_since_paid: number | null;
}

// ── Helpers ────────────────────────────────────────────────────────────────
function fmt$(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000).toLocaleString()}K`;
  return `$${Math.round(n).toLocaleString()}`;
}
function fmtNum(n: number) { return n.toLocaleString(); }
function fmtDate(d: string | null) {
  if (!d) return '—';
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
}

function statusBadge(status: string) {
  const map: Record<string, string> = {
    active: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    pending: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    terminated: 'bg-red-500/10 text-red-400 border-red-500/20',
    suspended: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
  };
  return map[status] || 'bg-secondary text-muted-foreground border-border';
}

const PAGE_SIZE = 25;

// ── Component ──────────────────────────────────────────────────────────────
export function BookOfBusinessPage() {
  const { effectiveAgencyId, isOrgWide } = useEffectiveAuth();
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [productFilter, setProductFilter] = useState<string>('all');
  const [showFilters, setShowFilters] = useState(false);
  const [filterAgencyId, setFilterAgencyId] = useState<string | null>(null);
  const [filterAgentId, setFilterAgentId] = useState<string | null>(null);
  const [datePreset, setDatePreset] = useState<DatePreset>(DEFAULT_PRESET);
  const [dateRange, setDateRange] = useState<DateRange>(() => getDateRange(DEFAULT_PRESET));
  const dateStart = datePreset === 'allTime' ? null : dateRange.startDate.split('T')[0];
  const dateEnd = datePreset === 'allTime' ? null : dateRange.endDate.split('T')[0];

  // Summary stats
  const [summaryStats, setSummaryStats] = useState({
    active: 0, pending: 0, atRisk: 0, terminated: 0,
    totalPremium: 0, atRiskPremium: 0,
  });

  // Load summary stats — re-runs when agency/agent filter changes
  useEffect(() => {
    async function loadSummary() {
      if (!supabase) return;

      // Paginate the full count with filters applied
      let all: { status: string; is_at_risk: boolean; monthly_premium: number }[] = [];
      let offset = 0;
      const PG = 1000;
      while (true) {
        let query = scopeToAgency(
          supabase
            .from('book_of_business')
            .select('status, is_at_risk, monthly_premium')
            .range(offset, offset + PG - 1),
          isOrgWide,
          effectiveAgencyId
        );
        if (filterAgencyId) query = query.eq('agency_id', filterAgencyId);
        if (filterAgentId) query = query.eq('writing_number', filterAgentId);
        if (dateStart) query = query.gte('policy_effective_date', dateStart);
        if (dateEnd) query = query.lte('policy_effective_date', dateEnd);

        const { data: chunk } = await query;
        if (!chunk || chunk.length === 0) break;
        all = [...all, ...(chunk as typeof all)];
        if (chunk.length < PG) break;
        offset += PG;
      }

      const stats = {
        active: all.filter(p => p.status === 'active').length,
        pending: all.filter(p => p.status === 'pending').length,
        atRisk: all.filter(p => p.is_at_risk).length,
        terminated: all.filter(p => p.status === 'terminated').length,
        totalPremium: all.filter(p => p.status === 'active').reduce((s, p) => s + (Number(p.monthly_premium) * 12 || 0), 0),
        atRiskPremium: all.filter(p => p.is_at_risk).reduce((s, p) => s + (Number(p.monthly_premium) * 12 || 0), 0),
      };
      setSummaryStats(stats);
    }
    loadSummary();
  }, [effectiveAgencyId, isOrgWide, filterAgencyId, filterAgentId, dateStart, dateEnd]);

  // Load paginated policies
  const loadPolicies = useCallback(async () => {
    setLoading(true);
      if (!supabase) { setLoading(false); return; }
    try {
      let query = scopeToAgency(
        supabase
          .from('book_of_business')
          .select('*', { count: 'exact' }),
        isOrgWide,
        effectiveAgencyId
      );

      if (filterAgencyId) {
        query = query.eq('agency_id', filterAgencyId);
      }
      if (filterAgentId) {
        query = query.eq('writing_number', filterAgentId);
      }
      if (dateStart) {
        query = query.gte('policy_effective_date', dateStart);
      }
      if (dateEnd) {
        query = query.lte('policy_effective_date', dateEnd);
      }
      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }
      if (productFilter !== 'all') {
        query = query.eq('product_type', productFilter);
      }
      if (search) {
        query = query.or(`policy_number.ilike.%${search}%,client_name.ilike.%${search}%,agent_name.ilike.%${search}%,agency_name.ilike.%${search}%`);
      }

      const { data, count, error } = await query
        .order('policy_effective_date', { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      if (error) throw error;
      setPolicies((data || []) as unknown as Policy[]);
      setTotalCount(count || 0);
    } catch (err) {
      console.error('Book load error:', err);
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, productFilter, search, effectiveAgencyId, isOrgWide, filterAgencyId, filterAgentId, dateStart, dateEnd]);

  useEffect(() => { loadPolicies(); }, [loadPolicies]);

  // Reset page on filter change
  useEffect(() => { setPage(0); }, [statusFilter, productFilter, search, filterAgencyId, filterAgentId, dateStart, dateEnd]);

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  // Export CSV
  async function exportCsv() {
    let all: Policy[] = [];
    let offset = 0;
    const PG = 1000;
    while (true) {
      if (!supabase) break;
      let query = scopeToAgency(
        supabase.from('book_of_business').select('*'),
        isOrgWide,
        effectiveAgencyId
      );
      if (statusFilter !== 'all') query = query.eq('status', statusFilter);
      if (productFilter !== 'all') query = query.eq('product_type', productFilter);
      if (search) query = query.or(`policy_number.ilike.%${search}%,agent_name.ilike.%${search}%,agency_name.ilike.%${search}%`);
      const { data } = await query.order('policy_effective_date', { ascending: false }).range(offset, offset + PG - 1);
      if (!data || data.length === 0) break;
      all = [...all, ...(data as unknown as Policy[])];
      if (data.length < PG) break;
      offset += PG;
    }

    const headers = ['Policy #', 'Client', 'Agent', 'Writing #', 'Agency', 'Product', 'Status', 'Monthly Premium', 'Annual Premium', 'Effective Date', 'Paid To', 'Drafts', 'At Risk', 'Flag'];
    const rows = all.map(p => [
      p.policy_number, (p as any).client_name || '', p.agent_name || '', p.writing_number || '', p.agency_name || '',
      p.product_type, p.status, p.monthly_premium, p.annual_premium,
      p.policy_effective_date || '', p.paid_to_date || '', p.draft_count || '',
      p.is_at_risk ? 'Yes' : 'No', p.flag_type || '',
    ]);
    const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `book_of_business_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <Header title="Book of Business" />
      <div className="p-6 space-y-6 max-w-screen-xl mx-auto">

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
        {/* Summary Strip */}
        <StaggerContainer className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { title: 'Active Policies', end: summaryStats.active, icon: FileText, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
            { title: 'Annual Premium', end: summaryStats.totalPremium, fmt: fmt$, icon: DollarSign, color: 'text-primary', bg: 'bg-cyan-500/10' },
            { title: 'At Risk', end: summaryStats.atRisk, icon: AlertTriangle, color: 'text-red-400', bg: 'bg-red-500/10' },
            { title: 'At-Risk Premium', end: summaryStats.atRiskPremium, fmt: fmt$, icon: Clock, color: 'text-amber-400', bg: 'bg-amber-500/10' },
          ].map(card => (
            <StaggerItem key={card.title}>
              <Card className="border-border">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-medium text-muted-foreground">{card.title}</p>
                      <CountUp
                        end={card.end}
                        format={card.fmt || fmtNum}
                        className="text-xl font-bold text-foreground mt-0.5 block font-data"
                      />
                    </div>
                    <div className={`p-2 rounded-lg ${card.bg}`}>
                      <card.icon size={18} className={card.color} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </StaggerItem>
          ))}
        </StaggerContainer>

        {/* Toolbar */}
        <Card className="border-border">
          <CardContent className="p-3">
            <div className="flex items-center gap-3 flex-wrap">
              {/* Search */}
              <div className="relative flex-1 min-w-[200px]">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/50" />
                <Input
                  placeholder="Search by policy #, agent, or agency..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="pl-8 h-9"
                />
              </div>

              {/* Filter toggle */}
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={`flex items-center gap-1.5 px-3 py-2 text-sm rounded-md transition-colors ${
                  showFilters ? 'bg-primary/20 text-primary' : 'bg-secondary text-muted-foreground hover:text-foreground'
                }`}
              >
                <Filter size={14} /> Filters
                {(statusFilter !== 'all' || productFilter !== 'all') && (
                  <Badge className="bg-primary text-primary-foreground text-[10px] px-1.5 py-0">
                    {[statusFilter !== 'all', productFilter !== 'all'].filter(Boolean).length}
                  </Badge>
                )}
              </button>

              {/* Time Period */}
              <TimePeriodSelector
                preset={datePreset}
                dateRange={dateRange}
                onChange={(range, preset) => { setDateRange(range); setDatePreset(preset); }}
              />

              {/* Export */}
              <button
                onClick={exportCsv}
                className="flex items-center gap-1.5 px-3 py-2 text-sm bg-secondary text-muted-foreground hover:text-foreground rounded-md transition-colors"
              >
                <Download size={14} /> Export CSV
              </button>
            </div>

            {/* Filter Row */}
            {showFilters && (
              <div className="flex items-center gap-3 mt-3 pt-3 border-t border-border/30">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-muted-foreground">Status:</span>
                  {['all', 'active', 'pending', 'terminated', 'suspended'].map(s => (
                    <button
                      key={s}
                      onClick={() => setStatusFilter(s)}
                      className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
                        statusFilter === s
                          ? 'gradient-primary text-primary-foreground'
                          : 'bg-secondary text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
                    </button>
                  ))}
                </div>
                <div className="w-px h-5 bg-border" />
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-muted-foreground">Product:</span>
                  {['all', 'HI', 'HHC'].map(p => (
                    <button
                      key={p}
                      onClick={() => setProductFilter(p)}
                      className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
                        productFilter === p
                          ? 'gradient-primary text-primary-foreground'
                          : 'bg-secondary text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {p === 'all' ? 'All' : p}
                    </button>
                  ))}
                </div>
                {(statusFilter !== 'all' || productFilter !== 'all') && (
                  <button
                    onClick={() => { setStatusFilter('all'); setProductFilter('all'); }}
                    className="ml-auto flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                  >
                    <X size={12} /> Clear
                  </button>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Policy Table */}
        <Card className="border-border">
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/30">
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground font-data">Policy #</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">Client</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">Agent</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">Agency</th>
                  <th className="px-4 py-2.5 text-center text-xs font-semibold text-muted-foreground">Product</th>
                  <th className="px-4 py-2.5 text-center text-xs font-semibold text-muted-foreground">Status</th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground font-data">Monthly</th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground font-data">Annual</th>
                  <th className="px-4 py-2.5 text-center text-xs font-semibold text-muted-foreground">Effective</th>
                  <th className="px-4 py-2.5 text-center text-xs font-semibold text-muted-foreground">Paid To</th>
                  <th className="px-4 py-2.5 text-center text-xs font-semibold text-muted-foreground font-data">Drafts</th>
                  <th className="px-4 py-2.5 text-center text-xs font-semibold text-muted-foreground">Flag</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {loading ? (
                  Array.from({ length: 10 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 12 }).map((_, j) => (
                        <td key={j} className="px-4 py-3"><div className="h-4 rounded shimmer" /></td>
                      ))}
                    </tr>
                  ))
                ) : policies.length === 0 ? (
                  <tr>
                    <td colSpan={12} className="px-4 py-8 text-center text-muted-foreground">
                      No policies match your filters.
                    </td>
                  </tr>
                ) : (
                  policies.map(p => (
                    <tr key={p.policy_number} className="row-hover">
                      <td className="px-4 py-2.5 font-data text-foreground">{p.policy_number}</td>
                      <td className="px-4 py-2.5 text-foreground truncate max-w-[140px]">
                        {p.client_name || '—'}
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground truncate max-w-[140px]">
                        {p.agent_name || '—'}
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground truncate max-w-[140px]">
                        {p.agency_name || '—'}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <Badge className={`text-[10px] ${
                          p.product_type === 'HHC'
                            ? 'bg-sky-500/10 text-sky-400 border-sky-500/20'
                            : 'bg-violet-500/10 text-violet-400 border-violet-500/20'
                        }`}>
                          {p.product_type}
                        </Badge>
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <Badge className={`text-[10px] border ${statusBadge(p.status)}`}>
                          {p.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-2.5 text-right font-data text-muted-foreground">
                        ${Number(p.monthly_premium).toFixed(2)}
                      </td>
                      <td className="px-4 py-2.5 text-right font-data text-foreground/80 font-medium">
                        {fmt$(Number(p.annual_premium))}
                      </td>
                      <td className="px-4 py-2.5 text-center text-muted-foreground text-xs">
                        {fmtDate(p.policy_effective_date)}
                      </td>
                      <td className="px-4 py-2.5 text-center text-muted-foreground text-xs">
                        {fmtDate(p.paid_to_date)}
                      </td>
                      <td className="px-4 py-2.5 text-center font-data text-muted-foreground">
                        {p.draft_count ?? '—'}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        {p.is_at_risk ? (
                          <Badge className="text-[10px] bg-red-500/10 text-red-400 border-red-500/20 border">
                            {p.flag_type || 'at-risk'}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground/30">—</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-border/30">
                <p className="text-xs text-muted-foreground font-data">
                  Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, totalCount)} of {fmtNum(totalCount)}
                </p>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPage(p => Math.max(0, p - 1))}
                    disabled={page === 0}
                    className="p-1.5 rounded-md bg-secondary text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
                  >
                    <ChevronLeft size={14} />
                  </button>
                  <span className="text-xs text-muted-foreground font-data px-2">
                    Page {page + 1} of {totalPages}
                  </span>
                  <button
                    onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                    disabled={page >= totalPages - 1}
                    className="p-1.5 rounded-md bg-secondary text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
                  >
                    <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
