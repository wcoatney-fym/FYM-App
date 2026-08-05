import { useEffect, useState, useCallback } from 'react';
import { Header } from '@/components/layout/Header';
import { Card, CardContent } from '@/components/ui/card';
import { HudFrame } from '@/components/ui/hud-frame';
import { Badge } from '@/components/ui/badge';
import { StaggerContainer, StaggerItem, CountUp } from '@/components/ui/animated';
import { Input } from '@/components/ui/input';
import { fetchBookOfBusiness } from '@/lib/prod-api';
import { useCachedFetch } from '@/hooks/useCachedFetch';
import { useAgencyFilter } from '@/hooks/useAgencyFilter';
import { useEffectiveAuth } from '@/hooks/useEffectiveAuth';
import { DataFilters } from '@/components/filters/DataFilters';
import { toast } from 'sonner';
import { fmt$, fmtNum, fmtDate } from '@/lib/formatUtils';
import {
  FileText, DollarSign, AlertTriangle, Clock,
  Search, ChevronLeft, ChevronRight, Download,
  Filter, X, ArrowUpDown, ArrowUp, ArrowDown,
} from 'lucide-react';
import { PeriodPills } from '@/components/filters/PeriodPills';
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

type SortField = 'premium' | 'submit_date' | 'paid_to_date' | 'policy_nbr' | 'status' | 'annual_premium' | 'draft_count';
type SortOrder = 'asc' | 'desc';

// ── Helpers ────────────────────────────────────────────────────────────────
function statusBadge(status: string) {
  const map: Record<string, string> = {
    active: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    pending: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    terminated: 'bg-red-500/10 text-red-400 border-red-500/20',
    suspended: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
  };
  return map[status] || 'bg-secondary text-muted-foreground border-border';
}

/** Map UI sort fields to edge function sort param */
function toEdgeSort(field: SortField): string {
  if (field === 'annual_premium') return 'premium';
  return field;
}

const PAGE_SIZE = 25;

// ── Sortable Header ────────────────────────────────────────────────────────
function SortHeader({
  label,
  field,
  currentSort,
  currentOrder,
  onSort,
  align = 'left',
  className = '',
}: {
  label: string;
  field: SortField;
  currentSort: SortField;
  currentOrder: SortOrder;
  onSort: (field: SortField) => void;
  align?: 'left' | 'center' | 'right';
  className?: string;
}) {
  const active = currentSort === field;
  const alignCls = align === 'right' ? 'justify-end' : align === 'center' ? 'justify-center' : 'justify-start';

  return (
    <th className={`px-4 py-2.5 text-xs font-semibold text-muted-foreground ${className}`}>
      <button
        onClick={() => onSort(field)}
        className={`flex items-center gap-1 ${alignCls} w-full hover:text-foreground transition-colors ${active ? 'text-foreground' : ''}`}
      >
        {label}
        {active ? (
          currentOrder === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />
        ) : (
          <ArrowUpDown size={10} className="opacity-40" />
        )}
      </button>
    </th>
  );
}

// ── Component ──────────────────────────────────────────────────────────────
export function BookOfBusinessPage() {
  const { effectiveAgencyWritingNumber, isOrgWide } = useEffectiveAuth();
  const { filterAgencyId, setFilterAgencyId, showAgencyFilter } = useAgencyFilter();
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [productFilter, setProductFilter] = useState<string>('all');
  const [showFilters, setShowFilters] = useState(false);
  const [exporting, setExporting] = useState(false);

  const [filterAgentId, setFilterAgentId] = useState<string | null>(null);
  const [datePreset, setDatePreset] = useState<DatePreset>(DEFAULT_PRESET);
  const [dateRange, setDateRange] = useState<DateRange>(() => getDateRange(DEFAULT_PRESET));
  const dateStart = datePreset === 'allTime' ? null : dateRange.startDate.split('T')[0];
  const dateEnd = datePreset === 'allTime' ? null : dateRange.endDate.split('T')[0];

  // Sorting state
  const [sortField, setSortField] = useState<SortField>('submit_date');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  }

  // Summary stats
  const [summaryStats, setSummaryStats] = useState({
    active: 0, pending: 0, atRisk: 0, terminated: 0,
    totalPremium: 0, atRiskPremium: 0,
  });

  // Cached summary stats — instant render from localStorage
  const summaryAgencyId = filterAgencyId || (!isOrgWide && effectiveAgencyWritingNumber ? effectiveAgencyWritingNumber : undefined);
  const summaryCacheKey = `bob-summary-${summaryAgencyId || 'org'}-${filterAgentId || 'all'}`;
  const { data: summaryRes } = useCachedFetch(
    summaryCacheKey,
    () => fetchBookOfBusiness({
      agency_id: summaryAgencyId,
      agent_wn: filterAgentId || undefined,
      page_size: 1,
    }),
    { deps: [summaryAgencyId, filterAgentId] }
  );

  // Derive summary stats from cached response
  useEffect(() => {
    if (!summaryRes) return;
    const s = summaryRes.summary;
    setSummaryStats({
      active: s.status_breakdown['active'] || 0,
      pending: s.status_breakdown['pending'] || 0,
      atRisk: s.at_risk_policies,
      terminated: s.status_breakdown['terminated'] || 0,
      totalPremium: s.active_annual_premium,
      atRiskPremium: s.at_risk_annual_premium ?? 0,
    });
  }, [summaryRes]);

  // Load paginated policies from prod DB edge function
  const loadPolicies = useCallback(async () => {
    setLoading(true);
    try {
      const agencyId = filterAgencyId || (!isOrgWide && effectiveAgencyWritingNumber ? effectiveAgencyWritingNumber : undefined);
      const res = await fetchBookOfBusiness({
        agency_id: agencyId,
        agent_wn: filterAgentId || undefined,
        status: statusFilter !== 'all' ? statusFilter : undefined,
        product_type: productFilter !== 'all' ? productFilter : undefined,
        search: search || undefined,
        sort: toEdgeSort(sortField),
        order: sortOrder,
        page,
        page_size: PAGE_SIZE,
      });

      const mapped: Policy[] = res.data.map(p => ({
        policy_number: p.policy_number,
        client_name: p.client_name,
        agent_name: null,
        writing_number: p.writing_number,
        agency_name: null,
        agency_id: p.agency_id,
        product_type: p.product_type,
        status: p.status,
        monthly_premium: p.plan_premium,
        annual_premium: p.annual_premium,
        billing_mode: p.billing_mode ? String(p.billing_mode) : null,
        policy_effective_date: p.policy_effective_date,
        paid_to_date: p.paid_to_date,
        draft_count: p.draft_count,
        is_at_risk: p.is_at_risk,
        flag_type: p.flag_type,
        days_since_paid: p.paid_to_date
          ? Math.max(0, Math.floor((Date.now() - new Date(p.paid_to_date).getTime()) / 86400000))
          : null,
      }));

      setPolicies(mapped);
      setTotalCount(res.pagination.total_count);
    } catch (err) {
      console.error('Book load error:', err);
      toast.error('Failed to load policies', {
        description: err instanceof Error ? err.message : 'Check your connection and try again.',
      });
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, productFilter, search, effectiveAgencyWritingNumber, isOrgWide, filterAgencyId, filterAgentId, dateStart, dateEnd, sortField, sortOrder]);

  useEffect(() => { loadPolicies(); }, [loadPolicies]);

  // Reset page on filter/sort change
  useEffect(() => { setPage(0); }, [statusFilter, productFilter, search, filterAgencyId, filterAgentId, dateStart, dateEnd, sortField, sortOrder]);

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  // Export CSV
  async function exportCsv() {
    setExporting(true);
    try {
      let all: Policy[] = [];
      let pg = 0;
      const PG = 500;
      while (true) {
        const agencyId = filterAgencyId || (!isOrgWide && effectiveAgencyWritingNumber ? effectiveAgencyWritingNumber : undefined);
        const res = await fetchBookOfBusiness({
          agency_id: agencyId,
          agent_wn: filterAgentId || undefined,
          status: statusFilter !== 'all' ? statusFilter : undefined,
          product_type: productFilter !== 'all' ? productFilter : undefined,
          search: search || undefined,
          sort: toEdgeSort(sortField),
          order: sortOrder,
          page: pg,
          page_size: PG,
        });
        const mapped = res.data.map(p => ({
          policy_number: p.policy_number,
          client_name: p.client_name,
          agent_name: null,
          writing_number: p.writing_number,
          agency_name: null,
          agency_id: p.agency_id,
          product_type: p.product_type,
          status: p.status,
          monthly_premium: p.plan_premium,
          annual_premium: p.annual_premium,
          billing_mode: p.billing_mode ? String(p.billing_mode) : null,
          policy_effective_date: p.policy_effective_date,
          paid_to_date: p.paid_to_date,
          draft_count: p.draft_count,
          is_at_risk: p.is_at_risk,
          flag_type: p.flag_type,
          days_since_paid: null as number | null,
        }));
        all = [...all, ...mapped];
        if (res.data.length < PG) break;
        pg++;
      }

      const headers = ['Policy #', 'Client', 'Agent', 'Writing #', 'Agency', 'Product', 'Status', 'Monthly Premium', 'Annual Premium', 'Submit Date', 'Paid To', 'Drafts', 'At Risk', 'Flag'];
      const rows = all.map(p => [
        p.policy_number, p.client_name || '', p.agent_name || '', p.writing_number || '', p.agency_name || '',
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
      toast.success(`Exported ${all.length.toLocaleString()} policies`);
    } catch (err) {
      console.error('CSV export error:', err);
      toast.error('CSV export failed', {
        description: err instanceof Error ? err.message : 'Try again in a moment.',
      });
    } finally {
      setExporting(false);
    }
  }

  return (
    <>
      <Header title="Book of Business" />
      <div className="p-6 space-y-6 max-w-screen-xl mx-auto">

        {/* Agency + Agent filters — FYM admins only */}
        {showAgencyFilter && (
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
            { title: 'Active Policies', end: summaryStats.active, icon: FileText, color: 'text-emerald-400', bg: 'bg-emerald-500/10', accent: 'hsl(142 71% 45% / 0.4)' },
            { title: 'Annual Premium', end: summaryStats.totalPremium, fmt: fmt$, icon: DollarSign, color: 'text-primary', bg: 'bg-cyan-500/10', accent: 'hsl(199 89% 48% / 0.5)' },
            { title: 'At Risk', end: summaryStats.atRisk, icon: AlertTriangle, color: 'text-red-400', bg: 'bg-red-500/10', accent: 'hsl(0 84% 60% / 0.5)' },
            { title: 'At-Risk Premium', end: summaryStats.atRiskPremium, fmt: fmt$, icon: Clock, color: 'text-amber-400', bg: 'bg-amber-500/10', accent: 'hsl(38 92% 50% / 0.5)' },
          ].map(card => (
            <StaggerItem key={card.title}>
              <HudFrame accentColor={card.accent}>
                <Card className="border-border">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">{card.title}</p>
                        <CountUp
                          end={card.end}
                          format={card.fmt || fmtNum}
                          className="text-2xl font-bold text-foreground mt-1 block font-data"
                        />
                      </div>
                      <div className={`p-2.5 rounded-lg ${card.bg}`}>
                        <card.icon size={20} className={card.color} />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </HudFrame>
            </StaggerItem>
          ))}
        </StaggerContainer>

        {/* Toolbar */}
        <Card className="border-border">
          <CardContent className="p-3">
            <div className="flex items-center gap-3 flex-wrap">
              {/* Search */}
              <div className="relative flex-1 min-w-[200px]">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
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
              <PeriodPills
                preset={datePreset}
                dateRange={dateRange}
                onChange={(range, preset) => { setDateRange(range); setDatePreset(preset); }}
                showCompare={false}
                storageKey="book-of-business"
                compact
              />

              {/* Export */}
              <button
                onClick={exportCsv}
                disabled={exporting}
                className="flex items-center gap-1.5 px-3 py-2 text-sm bg-secondary text-muted-foreground hover:text-foreground rounded-md transition-colors disabled:opacity-50"
              >
                {exporting ? (
                  <>
                    <div className="h-3.5 w-3.5 border-2 border-muted-foreground/30 border-t-muted-foreground rounded-full animate-spin" />
                    Exporting…
                  </>
                ) : (
                  <>
                    <Download size={14} /> Export CSV
                  </>
                )}
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
                  <SortHeader label="Policy #" field="policy_nbr" currentSort={sortField} currentOrder={sortOrder} onSort={handleSort} className="font-data" />
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">Client</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">Agent</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">Agency</th>
                  <th className="px-4 py-2.5 text-center text-xs font-semibold text-muted-foreground">Product</th>
                  <SortHeader label="Status" field="status" currentSort={sortField} currentOrder={sortOrder} onSort={handleSort} align="center" />
                  <SortHeader label="Monthly" field="premium" currentSort={sortField} currentOrder={sortOrder} onSort={handleSort} align="right" className="font-data" />
                  <SortHeader label="Annual" field="annual_premium" currentSort={sortField} currentOrder={sortOrder} onSort={handleSort} align="right" className="font-data" />
                  <SortHeader label="Submitted" field="submit_date" currentSort={sortField} currentOrder={sortOrder} onSort={handleSort} align="center" />
                  <SortHeader label="Paid To" field="paid_to_date" currentSort={sortField} currentOrder={sortOrder} onSort={handleSort} align="center" />
                  <SortHeader label="Drafts" field="draft_count" currentSort={sortField} currentOrder={sortOrder} onSort={handleSort} align="center" className="font-data" />
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
                          <span className="text-muted-foreground">—</span>
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
