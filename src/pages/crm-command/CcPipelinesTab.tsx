import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  TrendingUp, XCircle, DollarSign, Shield, TrendingDown, Minus, Loader2,
  ArrowUpDown, ArrowUp, ArrowDown, AlertTriangle, Calendar
} from 'lucide-react';
import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend,
} from 'recharts';
import { cn } from '@/lib/utils';
import { fetchBookOfBusiness } from '@/lib/prod-api';
import { useOrgData } from '@/contexts/OrgDataCache';
import { useCachedFetch } from '@/hooks/useCachedFetch';
import { supabase } from '@/lib/supabase';
import { fmt$, fmtDate, fmtNum } from '@/lib/formatUtils';
import { type DatePreset, DATE_PRESETS, getDateRange } from '@/lib/dateUtils';

type PipelineTab = 'placements' | 'cancellations' | 'retention' | 'revenue';
type SortDir = 'asc' | 'desc';

// ── Generic sort helpers ────────────────────────────────────────────────

function cmp(a: string | number | null, b: string | number | null): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  if (typeof a === 'string' && typeof b === 'string') return a.localeCompare(b);
  return (a as number) - (b as number);
}

function sortRows<T>(rows: T[], accessor: ((r: T) => string | number | null) | null, dir: SortDir): T[] {
  if (!accessor) return rows;
  return [...rows].sort((a, b) => {
    const c = cmp(accessor(a), accessor(b));
    return dir === 'asc' ? c : -c;
  });
}

// ── Sort icon + header (reused from CcAgencyHealthTab pattern) ──────────

function SortIcon<K extends string>({ columnKey, activeKey, dir }: { columnKey: K; activeKey: K | null; dir: SortDir }) {
  if (activeKey !== columnKey) return <ArrowUpDown className="w-3 h-3 opacity-30" />;
  return dir === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />;
}

function SortableHeader<K extends string>({ label, sortKey: key, active, dir, onSort, align }: {
  label: string; sortKey: K; active: K | null; dir: SortDir;
  onSort: (k: K) => void; align?: 'right';
}) {
  return (
    <th
      className={cn(
        'px-4 py-3 font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors',
        align === 'right' && 'text-right',
      )}
      onClick={() => onSort(key)}
    >
      <span className={cn('inline-flex items-center gap-1', align === 'right' && 'justify-end')}>
        {label}
        <SortIcon columnKey={key} activeKey={active} dir={dir} />
      </span>
    </th>
  );
}

function useSort<K extends string>(defaultDir: SortDir = 'desc') {
  const [sortKey, setSortKey] = useState<K | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>(defaultDir);
  const toggleSort = useCallback((key: K) => {
    setSortKey(prev => {
      if (prev === key) {
        setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        return key;
      }
      setSortDir(key === ('agency' as K) || key === ('month' as K) ? 'asc' : 'desc');
      return key;
    });
  }, []);
  return { sortKey, sortDir, toggleSort };
}

// ── Truncation warning ──────────────────────────────────────────────────

const PAGE_SIZE = 200;

function TruncationWarning({ count }: { count: number }) {
  if (count < PAGE_SIZE) return null;
  return (
    <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-400/10 text-amber-400 text-xs">
      <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
      <span>
        Showing the first {PAGE_SIZE} results. There may be additional records not displayed.
      </span>
    </div>
  );
}

// ── Row type interfaces ─────────────────────────────────────────────────

interface PlacementRow {
  policy_number: string;
  agent_name: string;
  agency_name: string;
  product_type: string;
  status: string;
  annual_premium: number;
  policy_effective_date: string | null;
}

interface CancellationRow {
  policy_number: string;
  agent_name: string;
  agency_name: string;
  annual_premium: number;
  paid_to_date: string | null;
}

interface RetentionAgencyRow {
  agency_id: string;
  agency_name: string;
  active_policies: number;
  at_risk_count: number;
  retention_pct: number | null;
}

interface RevenueMonthRow {
  month: string;
  policies: number;
  annual_premium: number;
}

// ── Agency name enrichment hook (same pattern as CcDashboardTab) ────────

function useAgencyNames(): Map<string, string> {
  const [names, setNames] = useState<Map<string, string>>(new Map());
  useEffect(() => {
    if (!supabase) return;
    (async () => {
      const { data } = await supabase
        .from('agencies')
        .select('writing_number, name');
      if (data) {
        const nm = new Map<string, string>();
        for (const a of data as { writing_number: string | null; name: string }[]) {
          if (a.writing_number) nm.set(a.writing_number, a.name);
        }
        setNames(nm);
      }
    })();
  }, []);
  return names;
}

// ── Main component ──────────────────────────────────────────────────────

export function CcPipelinesTab() {
  const [activeTab, setActiveTab] = React.useState<PipelineTab>('placements');
  const orgData = useOrgData();
  const agencyNames = useAgencyNames();

  // Placements — cached book-of-business fetch
  const { data: bobRecent } = useCachedFetch(
    'cc-placements',
    () => fetchBookOfBusiness({ sort: 'submit_date', order: 'desc', page_size: PAGE_SIZE }),
  );
  const placements = useMemo((): PlacementRow[] | null => {
    if (!bobRecent) return null;
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    return bobRecent.data
      .filter(p => p.policy_effective_date && p.policy_effective_date >= thirtyDaysAgo)
      .map(p => ({
        policy_number: p.policy_number,
        agent_name: p.agent_writing_number || '—',
        agency_name: agencyNames.get(p.agency_id) || p.agency_id || '—',
        product_type: p.product_type,
        status: p.status,
        annual_premium: p.annual_premium,
        policy_effective_date: p.policy_effective_date,
      }));
  }, [bobRecent, agencyNames]);

  // Cancellations — cached book-of-business fetch
  const { data: bobTerminated } = useCachedFetch(
    'cc-cancellations',
    () => fetchBookOfBusiness({ status: 'terminated', sort: 'paid_to_date', order: 'desc', page_size: PAGE_SIZE }),
  );
  const cancellations = useMemo((): CancellationRow[] | null => {
    if (!bobTerminated) return null;
    return bobTerminated.data.map(p => ({
      policy_number: p.policy_number,
      agent_name: p.agent_writing_number || '—',
      agency_name: agencyNames.get(p.agency_id) || p.agency_id || '—',
      annual_premium: p.annual_premium,
      paid_to_date: p.paid_to_date,
    }));
  }, [bobTerminated, agencyNames]);

  // Retention agencies — from OrgDataCache (instant)
  const retentionAgencies = useMemo((): RetentionAgencyRow[] | null => {
    if (orgData.retentionAgencies.length === 0 && orgData.initialLoading) return null;
    return orgData.retentionAgencies
      .filter(a => a.retention_pct !== null && a.retention_pct < 90)
      .sort((a, b) => (a.retention_pct ?? 100) - (b.retention_pct ?? 100))
      .slice(0, 50)
      .map(a => ({
        agency_id: a.agency_id,
        agency_name: agencyNames.get(a.agency_id) || a.agency_id,
        active_policies: a.active_policies,
        at_risk_count: a.at_risk_count,
        retention_pct: a.retention_pct,
      }));
  }, [orgData.retentionAgencies, orgData.initialLoading, agencyNames]);

  // Revenue — from OrgDataCache, filtered by date preset
  const [revenuePreset, setRevenuePreset] = useState<DatePreset>('past6Months');
  const revenueDateRange = useMemo(() => getDateRange(revenuePreset), [revenuePreset]);

  const revenue = useMemo((): RevenueMonthRow[] | null => {
    if (orgData.monthlyProduction.length === 0 && orgData.initialLoading) return null;
    const startMonth = revenueDateRange.startDate.slice(0, 7);
    const endMonth = revenueDateRange.endDate.slice(0, 7);
    const byMonth = new Map<string, { policies: number; annual_premium: number }>();
    orgData.monthlyProduction
      .filter(m => m.month >= startMonth && m.month <= endMonth)
      .forEach(m => {
        const existing = byMonth.get(m.month) || { policies: 0, annual_premium: 0 };
        existing.policies += m.policies;
        existing.annual_premium += m.annual_premium;
        byMonth.set(m.month, existing);
      });
    return Array.from(byMonth.entries())
      .map(([month, v]) => ({ month, ...v }))
      .sort((a, b) => a.month.localeCompare(b.month));
  }, [orgData.monthlyProduction, orgData.initialLoading, revenueDateRange]);

  // Count badges for tabs
  const counts: Record<PipelineTab, number | null> = {
    placements: placements?.length ?? null,
    cancellations: cancellations?.length ?? null,
    retention: retentionAgencies?.length ?? null,
    revenue: revenue?.length ?? null,
  };

  const tabs: { id: PipelineTab; label: string; icon: typeof TrendingUp }[] = [
    { id: 'placements', label: 'Placements', icon: TrendingUp },
    { id: 'cancellations', label: 'Cancellations', icon: XCircle },
    { id: 'retention', label: 'Retention', icon: Shield },
    { id: 'revenue', label: 'Revenue', icon: DollarSign },
  ];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Pipelines</h1>
      <div className="flex gap-1.5 overflow-x-auto pb-2 scrollbar-thin">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-all',
              activeTab === tab.id
                ? 'bg-primary/10 text-primary border border-primary/20'
                : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
            )}
          >
            <tab.icon className="w-3.5 h-3.5" />
            {tab.label}
            {counts[tab.id] !== null && (
              <span className={cn(
                'ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold tabular-nums',
                activeTab === tab.id
                  ? 'bg-primary/20 text-primary'
                  : 'bg-secondary text-muted-foreground'
              )}>
                {counts[tab.id]}
              </span>
            )}
          </button>
        ))}
      </div>
      <motion.div key={activeTab} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
        {activeTab === 'placements' && <PlacementsView data={placements} truncated={bobRecent ? bobRecent.data.length >= PAGE_SIZE : false} />}
        {activeTab === 'cancellations' && <CancellationsView data={cancellations} truncated={bobTerminated ? bobTerminated.data.length >= PAGE_SIZE : false} />}
        {activeTab === 'retention' && <RetentionAgenciesView data={retentionAgencies} />}
        {activeTab === 'revenue' && <RevenueView data={revenue} preset={revenuePreset} onPresetChange={setRevenuePreset} />}
      </motion.div>
    </div>
  );
}

// ── Shared UI components ────────────────────────────────────────────────

function Loading() {
  return (
    <div className="flex flex-col items-center justify-center py-16">
      <Loader2 className="w-6 h-6 text-primary animate-spin mb-2" />
      <p className="text-xs text-muted-foreground">Loading live data…</p>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return <p className="text-center py-12 text-sm text-muted-foreground">{message}</p>;
}

function StatCard({ label, value, trend }: { label: string; value: string; trend?: 'up' | 'down' | 'flat' }) {
  return (
    <div className="glass rounded-xl p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="flex items-center gap-2 mt-1">
        <span className="text-xl font-bold">{value}</span>
        {trend === 'up' && <TrendingUp className="w-4 h-4 text-emerald-400" />}
        {trend === 'down' && <TrendingDown className="w-4 h-4 text-red-400" />}
        {trend === 'flat' && <Minus className="w-4 h-4 text-muted-foreground" />}
      </div>
    </div>
  );
}

// ── Placements view ─────────────────────────────────────────────────────

type PlacementSortKey = 'policy_number' | 'agent' | 'agency' | 'product' | 'premium' | 'effective' | 'status';

const PLACEMENT_ACCESSORS: Record<PlacementSortKey, (r: PlacementRow) => string | number | null> = {
  policy_number: r => r.policy_number,
  agent: r => r.agent_name.toLowerCase(),
  agency: r => r.agency_name.toLowerCase(),
  product: r => r.product_type.toLowerCase(),
  premium: r => r.annual_premium,
  effective: r => r.policy_effective_date,
  status: r => r.status,
};

function PlacementsView({ data, truncated }: { data: PlacementRow[] | null; truncated: boolean }) {
  const { sortKey, sortDir, toggleSort } = useSort<PlacementSortKey>();

  const sorted = useMemo(() => {
    if (!data) return null;
    return sortRows(data, sortKey ? PLACEMENT_ACCESSORS[sortKey] : null, sortDir);
  }, [data, sortKey, sortDir]);

  if (sorted === null) return <Loading />;
  if (sorted.length === 0) return <EmptyState message="No placements in the last 30 days." />;

  const totalPremium = sorted.reduce((s, d) => s + (Number(d.annual_premium) || 0), 0);
  const activeCount = sorted.filter((d) => d.status === 'active').length;

  return (
    <div className="space-y-4">
      {truncated && <TruncationWarning count={PAGE_SIZE} />}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="Placed (30d)" value={sorted.length.toString()} trend="up" />
        <StatCard label="Active" value={activeCount.toString()} trend="up" />
        <StatCard label="Total Annual Premium" value={fmt$(totalPremium)} trend="up" />
      </div>
      <div className="glass rounded-xl overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border/50 bg-secondary/30">
              <SortableHeader label="Policy #" sortKey="policy_number" active={sortKey} dir={sortDir} onSort={toggleSort} />
              <SortableHeader label="Agent" sortKey="agent" active={sortKey} dir={sortDir} onSort={toggleSort} />
              <SortableHeader label="Agency" sortKey="agency" active={sortKey} dir={sortDir} onSort={toggleSort} />
              <SortableHeader label="Product" sortKey="product" active={sortKey} dir={sortDir} onSort={toggleSort} />
              <SortableHeader label="Annual Premium" sortKey="premium" active={sortKey} dir={sortDir} onSort={toggleSort} align="right" />
              <SortableHeader label="Effective" sortKey="effective" active={sortKey} dir={sortDir} onSort={toggleSort} />
              <SortableHeader label="Status" sortKey="status" active={sortKey} dir={sortDir} onSort={toggleSort} />
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => (
              <tr key={row.policy_number} className="border-b border-border/30 hover:bg-secondary/20">
                <td className="py-3 px-4 font-medium">{row.policy_number}</td>
                <td className="py-3 px-4 text-muted-foreground">{row.agent_name}</td>
                <td className="py-3 px-4 text-muted-foreground">{row.agency_name}</td>
                <td className="py-3 px-4 text-muted-foreground">{row.product_type}</td>
                <td className="py-3 px-4 text-right">{fmt$(Number(row.annual_premium) || 0)}</td>
                <td className="py-3 px-4 text-muted-foreground">{fmtDate(row.policy_effective_date)}</td>
                <td className="py-3 px-4">
                  <span className={cn(
                    'px-1.5 py-0.5 rounded text-[10px] font-medium',
                    row.status === 'active'
                      ? 'bg-emerald-400/10 text-emerald-400'
                      : 'bg-amber-400/10 text-amber-400'
                  )}>
                    {row.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Cancellations view ──────────────────────────────────────────────────

type CancellationSortKey = 'policy_number' | 'agent' | 'agency' | 'premium' | 'paid_to';

const CANCELLATION_ACCESSORS: Record<CancellationSortKey, (r: CancellationRow) => string | number | null> = {
  policy_number: r => r.policy_number,
  agent: r => r.agent_name.toLowerCase(),
  agency: r => r.agency_name.toLowerCase(),
  premium: r => r.annual_premium,
  paid_to: r => r.paid_to_date,
};

function CancellationsView({ data, truncated }: { data: CancellationRow[] | null; truncated: boolean }) {
  const { sortKey, sortDir, toggleSort } = useSort<CancellationSortKey>();

  const sorted = useMemo(() => {
    if (!data) return null;
    return sortRows(data, sortKey ? CANCELLATION_ACCESSORS[sortKey] : null, sortDir);
  }, [data, sortKey, sortDir]);

  if (sorted === null) return <Loading />;
  if (sorted.length === 0) return <EmptyState message="No cancellations found." />;

  const premiumAtRisk = sorted.reduce((s, d) => s + (Number(d.annual_premium) || 0), 0);

  return (
    <div className="space-y-4">
      {truncated && <TruncationWarning count={PAGE_SIZE} />}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <StatCard label="Total Cancellations" value={sorted.length.toString()} trend="down" />
        <StatCard label="Premium Lost" value={fmt$(premiumAtRisk)} trend="down" />
      </div>
      <div className="glass rounded-xl overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border/50 bg-secondary/30">
              <SortableHeader label="Policy #" sortKey="policy_number" active={sortKey} dir={sortDir} onSort={toggleSort} />
              <SortableHeader label="Agent" sortKey="agent" active={sortKey} dir={sortDir} onSort={toggleSort} />
              <SortableHeader label="Agency" sortKey="agency" active={sortKey} dir={sortDir} onSort={toggleSort} />
              <SortableHeader label="Annual Premium" sortKey="premium" active={sortKey} dir={sortDir} onSort={toggleSort} align="right" />
              <SortableHeader label="Paid To Date" sortKey="paid_to" active={sortKey} dir={sortDir} onSort={toggleSort} />
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => (
              <tr key={row.policy_number} className="border-b border-border/30 hover:bg-secondary/20">
                <td className="py-3 px-4 font-medium">{row.policy_number}</td>
                <td className="py-3 px-4 text-muted-foreground">{row.agent_name}</td>
                <td className="py-3 px-4 text-muted-foreground">{row.agency_name}</td>
                <td className="py-3 px-4 text-right text-red-400">{fmt$(Number(row.annual_premium) || 0)}</td>
                <td className="py-3 px-4 text-muted-foreground">{fmtDate(row.paid_to_date)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Retention agencies view ─────────────────────────────────────────────

type RetentionSortKey = 'agency' | 'active' | 'at_risk' | 'retention';

const RETENTION_ACCESSORS: Record<RetentionSortKey, (r: RetentionAgencyRow) => string | number | null> = {
  agency: r => r.agency_name.toLowerCase(),
  active: r => r.active_policies,
  at_risk: r => r.at_risk_count,
  retention: r => r.retention_pct,
};

function RetentionAgenciesView({ data }: { data: RetentionAgencyRow[] | null }) {
  const { sortKey, sortDir, toggleSort } = useSort<RetentionSortKey>();

  const sorted = useMemo(() => {
    if (!data) return null;
    return sortRows(data, sortKey ? RETENTION_ACCESSORS[sortKey] : null, sortDir);
  }, [data, sortKey, sortDir]);

  if (sorted === null) return <Loading />;
  if (sorted.length === 0) return <EmptyState message="All agencies at or above 90% retention." />;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <StatCard label="Agencies Below 90%" value={sorted.length.toString()} trend="down" />
        <StatCard label="Total At-Risk Policies" value={sorted.reduce((s, d) => s + (Number(d.at_risk_count) || 0), 0).toString()} trend="down" />
      </div>
      <div className="glass rounded-xl overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border/50 bg-secondary/30">
              <SortableHeader label="Agency" sortKey="agency" active={sortKey} dir={sortDir} onSort={toggleSort} />
              <SortableHeader label="Active Policies" sortKey="active" active={sortKey} dir={sortDir} onSort={toggleSort} align="right" />
              <SortableHeader label="At Risk" sortKey="at_risk" active={sortKey} dir={sortDir} onSort={toggleSort} align="right" />
              <SortableHeader label="Retention %" sortKey="retention" active={sortKey} dir={sortDir} onSort={toggleSort} align="right" />
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => (
              <tr key={row.agency_id} className="border-b border-border/30 hover:bg-secondary/20">
                <td className="py-3 px-4 font-medium">{row.agency_name}</td>
                <td className="py-3 px-4 text-right text-muted-foreground">{row.active_policies}</td>
                <td className="py-3 px-4 text-right text-red-400">{row.at_risk_count}</td>
                <td className="py-3 px-4 text-right font-medium">
                  <span className={row.retention_pct !== null && row.retention_pct >= 85 ? 'text-amber-400' : 'text-red-400'}>
                    {row.retention_pct !== null ? `${row.retention_pct.toFixed(1)}%` : '—'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Revenue view ────────────────────────────────────────────────────────

type RevenueSortKey = 'month' | 'policies' | 'premium';

const REVENUE_ACCESSORS: Record<RevenueSortKey, (r: RevenueMonthRow) => string | number | null> = {
  month: r => r.month,
  policies: r => r.policies,
  premium: r => r.annual_premium,
};

const REVENUE_PRESETS: DatePreset[] = ['thisQuarter', 'past6Months', 'pastYear', 'allTime'];

function fmtMonthLabel(iso: string): string {
  const [y, m] = iso.split('-');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[parseInt(m, 10) - 1]} ${y.slice(2)}`;
}

function RevenueView({ data, preset, onPresetChange }: {
  data: RevenueMonthRow[] | null;
  preset: DatePreset;
  onPresetChange: (p: DatePreset) => void;
}) {
  const { sortKey, sortDir, toggleSort } = useSort<RevenueSortKey>();

  // Chart data is always chronological; table data respects sort
  const chartData = useMemo(() => {
    if (!data) return null;
    return data.map(r => ({
      ...r,
      label: fmtMonthLabel(r.month),
    }));
  }, [data]);

  const sorted = useMemo(() => {
    if (!data) return null;
    return sortRows(data, sortKey ? REVENUE_ACCESSORS[sortKey] : null, sortDir);
  }, [data, sortKey, sortDir]);

  if (sorted === null) return <Loading />;
  if (sorted.length === 0) return <EmptyState message="No production data available." />;

  const totalPremium = sorted.reduce((s, d) => s + d.annual_premium, 0);
  const totalPolicies = sorted.reduce((s, d) => s + d.policies, 0);
  const presetLabel = DATE_PRESETS.find(p => p.key === preset)?.label ?? preset;

  return (
    <div className="space-y-4">
      {/* Date range selector */}
      <div className="flex items-center gap-2">
        <Calendar className="w-4 h-4 text-muted-foreground" />
        <div className="flex gap-1">
          {REVENUE_PRESETS.map(p => {
            const label = DATE_PRESETS.find(dp => dp.key === p)?.label ?? p;
            return (
              <button
                key={p}
                onClick={() => onPresetChange(p)}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                  preset === p
                    ? 'bg-primary/10 text-primary border border-primary/20'
                    : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
                )}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <StatCard label={`Total Policies (${presetLabel})`} value={totalPolicies.toLocaleString()} trend="up" />
        <StatCard label={`Total Annual Premium (${presetLabel})`} value={fmt$(totalPremium)} trend="up" />
      </div>

      {/* Revenue trend chart */}
      {chartData && chartData.length > 1 && (
        <div className="glass rounded-xl p-4">
          <p className="text-xs text-muted-foreground mb-3">Revenue Trend — {presetLabel}</p>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(217 33% 17%)" />
                <XAxis
                  dataKey="label"
                  stroke="hsl(215 20% 55%)"
                  fontSize={11}
                  interval={chartData.length > 12 ? Math.floor(chartData.length / 8) : 0}
                  angle={chartData.length > 8 ? -45 : 0}
                  textAnchor={chartData.length > 8 ? 'end' : 'middle'}
                  height={chartData.length > 8 ? 50 : 30}
                />
                <YAxis
                  yAxisId="ap"
                  orientation="left"
                  stroke="hsl(215 20% 55%)"
                  fontSize={11}
                  tickFormatter={v => fmt$(v)}
                />
                <YAxis
                  yAxisId="policies"
                  orientation="right"
                  stroke="hsl(215 20% 55%)"
                  fontSize={11}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: '8px',
                    border: '1px solid hsl(217 33% 20%)',
                    background: 'hsl(222 47% 9%)',
                    color: 'hsl(210 40% 98%)',
                    fontSize: 12,
                  }}
                  formatter={(value: number, name: string) => [
                    name === 'annual_premium' ? fmt$(value) : fmtNum(value),
                    name === 'annual_premium' ? 'Annual Premium' : 'Policies',
                  ]}
                  labelFormatter={(label: string) => label}
                />
                <Legend
                  formatter={(value: string) => value === 'annual_premium' ? 'Annual Premium' : 'Policies'}
                  wrapperStyle={{ color: 'hsl(215 20% 65%)' }}
                />
                <Bar
                  yAxisId="ap"
                  dataKey="annual_premium"
                  fill="hsl(199 89% 48%)"
                  fillOpacity={0.3}
                  stroke="hsl(199 89% 48%)"
                  radius={[3, 3, 0, 0]}
                />
                <Line
                  yAxisId="policies"
                  type="monotone"
                  dataKey="policies"
                  stroke="hsl(142 71% 45%)"
                  strokeWidth={2.5}
                  dot={{ r: 3, fill: 'hsl(142 71% 45%)' }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      <div className="glass rounded-xl overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border/50 bg-secondary/30">
              <SortableHeader label="Month" sortKey="month" active={sortKey} dir={sortDir} onSort={toggleSort} />
              <SortableHeader label="Policies" sortKey="policies" active={sortKey} dir={sortDir} onSort={toggleSort} align="right" />
              <SortableHeader label="Annual Premium" sortKey="premium" active={sortKey} dir={sortDir} onSort={toggleSort} align="right" />
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => (
              <tr key={row.month} className="border-b border-border/30 hover:bg-secondary/20">
                <td className="py-3 px-4 font-medium">{fmtMonthLabel(row.month)}</td>
                <td className="py-3 px-4 text-right">{row.policies.toLocaleString()}</td>
                <td className="py-3 px-4 text-right">{fmt$(row.annual_premium)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
