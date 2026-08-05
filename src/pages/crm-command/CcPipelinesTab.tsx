import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  TrendingUp, XCircle, DollarSign, Shield, TrendingDown, Minus, Loader2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { fetchBookOfBusiness } from '@/lib/prod-api';
import { useOrgData } from '@/contexts/OrgDataCache';
import { useCachedFetch } from '@/hooks/useCachedFetch';
import { fmt$ } from '@/lib/formatUtils';

type PipelineTab = 'placements' | 'cancellations' | 'retention' | 'revenue';

const tabs: { id: PipelineTab; label: string; icon: typeof TrendingUp }[] = [
  { id: 'placements', label: 'Placements', icon: TrendingUp },
  { id: 'cancellations', label: 'Cancellations', icon: XCircle },
  { id: 'retention', label: 'Retention Agencies', icon: Shield },
  { id: 'revenue', label: 'Revenue', icon: DollarSign },
];

interface PlacementRow {
  policy_number: string;
  agent_name: string | null;
  agency_name: string | null;
  product_type: string;
  status: string;
  annual_premium: number;
  policy_effective_date: string | null;
}

interface CancellationRow {
  policy_number: string;
  agent_name: string | null;
  agency_name: string | null;
  annual_premium: number;
  paid_to_date: string | null;
}

interface RetentionAgencyRow {
  agency_id: string;
  agency_name: string | null;
  active_policies: number;
  at_risk_count: number;
  retention_pct: number | null;
}

interface RevenueMonthRow {
  month: string;
  policies: number;
  annual_premium: number;
}

export function CcPipelinesTab() {
  const [activeTab, setActiveTab] = React.useState<PipelineTab>('placements');
  const orgData = useOrgData();

  // Placements — cached book-of-business fetch
  const { data: bobRecent } = useCachedFetch(
    'cc-placements',
    () => fetchBookOfBusiness({ sort: 'submit_date', order: 'desc', page_size: 200 }),
  );
  const placements = useMemo((): PlacementRow[] | null => {
    if (!bobRecent) return null;
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    return bobRecent.data
      .filter(p => p.policy_effective_date && p.policy_effective_date >= thirtyDaysAgo)
      .map(p => ({
        policy_number: p.policy_number,
        agent_name: null,
        agency_name: null,
        product_type: p.product_type,
        status: p.status,
        annual_premium: p.annual_premium,
        policy_effective_date: p.policy_effective_date,
      }));
  }, [bobRecent]);

  // Cancellations — cached book-of-business fetch
  const { data: bobTerminated } = useCachedFetch(
    'cc-cancellations',
    () => fetchBookOfBusiness({ status: 'terminated', sort: 'paid_to_date', order: 'desc', page_size: 200 }),
  );
  const cancellations = useMemo((): CancellationRow[] | null => {
    if (!bobTerminated) return null;
    return bobTerminated.data.map(p => ({
      policy_number: p.policy_number,
      agent_name: null,
      agency_name: null,
      annual_premium: p.annual_premium,
      paid_to_date: p.paid_to_date,
    }));
  }, [bobTerminated]);

  // Retention agencies — from OrgDataCache (instant)
  const retentionAgencies = useMemo((): RetentionAgencyRow[] | null => {
    if (orgData.retentionAgencies.length === 0 && orgData.initialLoading) return null;
    return orgData.retentionAgencies
      .filter(a => a.retention_pct !== null && a.retention_pct < 90)
      .sort((a, b) => (a.retention_pct ?? 100) - (b.retention_pct ?? 100))
      .slice(0, 50)
      .map(a => ({
        agency_id: a.agency_id,
        agency_name: null,
        active_policies: a.active_policies,
        at_risk_count: a.at_risk_count,
        retention_pct: a.retention_pct,
      }));
  }, [orgData.retentionAgencies, orgData.initialLoading]);

  // Revenue — from OrgDataCache (instant)
  const revenue = useMemo((): RevenueMonthRow[] | null => {
    if (orgData.monthlyProduction.length === 0 && orgData.initialLoading) return null;
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    const monthKey = sixMonthsAgo.toISOString().slice(0, 7);
    const byMonth = new Map<string, { policies: number; annual_premium: number }>();
    orgData.monthlyProduction
      .filter(m => m.month >= monthKey)
      .forEach(m => {
        const existing = byMonth.get(m.month) || { policies: 0, annual_premium: 0 };
        existing.policies += m.policies;
        existing.annual_premium += m.annual_premium;
        byMonth.set(m.month, existing);
      });
    return Array.from(byMonth.entries())
      .map(([month, v]) => ({ month, ...v }))
      .sort((a, b) => a.month.localeCompare(b.month));
  }, [orgData.monthlyProduction, orgData.initialLoading]);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Pipelines</h1>
      <div className="flex gap-1.5 overflow-x-auto pb-2 scrollbar-thin">
        {tabs.map((tab) => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={cn('flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-all', activeTab === tab.id ? 'bg-primary/10 text-primary border border-primary/20' : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50')}>
            <tab.icon className="w-3.5 h-3.5" />{tab.label}
          </button>
        ))}
      </div>
      <motion.div key={activeTab} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
        {activeTab === 'placements' && <PlacementsView data={placements} />}
        {activeTab === 'cancellations' && <CancellationsView data={cancellations} />}
        {activeTab === 'retention' && <RetentionAgenciesView data={retentionAgencies} />}
        {activeTab === 'revenue' && <RevenueView data={revenue} />}
      </motion.div>
    </div>
  );
}

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

function PlacementsView({ data }: { data: PlacementRow[] | null }) {
  if (data === null) return <Loading />;
  if (data.length === 0) return <EmptyState message="No placements in the last 30 days." />;
  const totalPremium = data.reduce((s, d) => s + (Number(d.annual_premium) || 0), 0);
  const activeCount = data.filter((d) => d.status === 'active').length;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="Placed (30d)" value={data.length.toString()} trend="up" />
        <StatCard label="Active" value={activeCount.toString()} trend="up" />
        <StatCard label="Total Annual Premium" value={fmt$(totalPremium)} trend="up" />
      </div>
      <div className="glass rounded-xl overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border/50 bg-secondary/30">
              <th className="text-left py-3 px-4 font-medium text-muted-foreground">Policy #</th>
              <th className="text-left py-3 px-4 font-medium text-muted-foreground">Agent</th>
              <th className="text-left py-3 px-4 font-medium text-muted-foreground">Product</th>
              <th className="text-right py-3 px-4 font-medium text-muted-foreground">Annual Premium</th>
              <th className="text-left py-3 px-4 font-medium text-muted-foreground">Submitted</th>
              <th className="text-left py-3 px-4 font-medium text-muted-foreground">Status</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row) => (
              <tr key={row.policy_number} className="border-b border-border/30 hover:bg-secondary/20">
                <td className="py-3 px-4 font-medium">{row.policy_number}</td>
                <td className="py-3 px-4 text-muted-foreground">{row.agent_name || '—'}</td>
                <td className="py-3 px-4 text-muted-foreground">{row.product_type}</td>
                <td className="py-3 px-4 text-right">{fmt$(Number(row.annual_premium) || 0)}</td>
                <td className="py-3 px-4 text-muted-foreground">{row.policy_effective_date || '—'}</td>
                <td className="py-3 px-4">
                  <span className={cn('px-1.5 py-0.5 rounded text-[10px] font-medium', row.status === 'active' ? 'bg-emerald-400/10 text-emerald-400' : 'bg-amber-400/10 text-amber-400')}>{row.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CancellationsView({ data }: { data: CancellationRow[] | null }) {
  if (data === null) return <Loading />;
  if (data.length === 0) return <EmptyState message="No cancellations in the last 30 days." />;
  const premiumAtRisk = data.reduce((s, d) => s + (Number(d.annual_premium) || 0), 0);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <StatCard label="Cancellations (30d)" value={data.length.toString()} trend="down" />
        <StatCard label="Premium Lost" value={fmt$(premiumAtRisk)} trend="down" />
      </div>
      <div className="glass rounded-xl overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border/50 bg-secondary/30">
              <th className="text-left py-3 px-4 font-medium text-muted-foreground">Policy #</th>
              <th className="text-left py-3 px-4 font-medium text-muted-foreground">Agent</th>
              <th className="text-left py-3 px-4 font-medium text-muted-foreground">Agency</th>
              <th className="text-right py-3 px-4 font-medium text-muted-foreground">Annual Premium</th>
              <th className="text-left py-3 px-4 font-medium text-muted-foreground">Term Date</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row) => (
              <tr key={row.policy_number} className="border-b border-border/30 hover:bg-secondary/20">
                <td className="py-3 px-4 font-medium">{row.policy_number}</td>
                <td className="py-3 px-4 text-muted-foreground">{row.agent_name || '—'}</td>
                <td className="py-3 px-4 text-muted-foreground">{row.agency_name || '—'}</td>
                <td className="py-3 px-4 text-right text-red-400">{fmt$(Number(row.annual_premium) || 0)}</td>
                <td className="py-3 px-4 text-muted-foreground">{row.paid_to_date || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RetentionAgenciesView({ data }: { data: RetentionAgencyRow[] | null }) {
  if (data === null) return <Loading />;
  if (data.length === 0) return <EmptyState message="All agencies at or above 90% retention." />;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <StatCard label="Agencies Below 90%" value={data.length.toString()} trend="down" />
        <StatCard label="Total At-Risk Policies" value={data.reduce((s, d) => s + (Number(d.at_risk_count) || 0), 0).toString()} trend="down" />
      </div>
      <div className="glass rounded-xl overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border/50 bg-secondary/30">
              <th className="text-left py-3 px-4 font-medium text-muted-foreground">Agency</th>
              <th className="text-right py-3 px-4 font-medium text-muted-foreground">Active Policies</th>
              <th className="text-right py-3 px-4 font-medium text-muted-foreground">At Risk</th>
              <th className="text-right py-3 px-4 font-medium text-muted-foreground">Retention %</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row) => (
              <tr key={row.agency_id} className="border-b border-border/30 hover:bg-secondary/20">
                <td className="py-3 px-4 font-medium">{row.agency_name || 'Unknown Agency'}</td>
                <td className="py-3 px-4 text-right text-muted-foreground">{row.active_policies}</td>
                <td className="py-3 px-4 text-right text-red-400">{row.at_risk_count}</td>
                <td className="py-3 px-4 text-right font-medium">
                  <span className={row.retention_pct !== null && row.retention_pct >= 85 ? 'text-amber-400' : 'text-red-400'}>
                    {row.retention_pct !== null ? `${row.retention_pct}%` : '—'}
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

function RevenueView({ data }: { data: RevenueMonthRow[] | null }) {
  if (data === null) return <Loading />;
  if (data.length === 0) return <EmptyState message="No production data available." />;
  const totalPremium = data.reduce((s, d) => s + d.annual_premium, 0);
  const totalPolicies = data.reduce((s, d) => s + d.policies, 0);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <StatCard label="Total Policies (6mo)" value={totalPolicies.toLocaleString()} trend="up" />
        <StatCard label="Total Annual Premium (6mo)" value={fmt$(totalPremium)} trend="up" />
      </div>
      <div className="glass rounded-xl overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border/50 bg-secondary/30">
              <th className="text-left py-3 px-4 font-medium text-muted-foreground">Month</th>
              <th className="text-right py-3 px-4 font-medium text-muted-foreground">Policies</th>
              <th className="text-right py-3 px-4 font-medium text-muted-foreground">Annual Premium</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row) => (
              <tr key={row.month} className="border-b border-border/30 hover:bg-secondary/20">
                <td className="py-3 px-4 font-medium">{row.month}</td>
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
