import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Megaphone, MessageSquare, UserPlus, Users, Shield, FileCheck,
  XCircle, DollarSign, TrendingUp, TrendingDown, Minus
} from 'lucide-react';
import { usePipelineStore } from '@/stores/cc-stores';
import { cn } from '@/lib/utils';
import type {
  LeadGenAd, LeadGenFollowUp, RecruitingAd, RecruitingFollowUp,
  RetentionAgent, PersistencyRecord, Placement, Cancellation, RevenueRecord
} from '@/lib/command-center/types';

type PipelineTab = 'lead-gen-ads' | 'lead-gen-followup' | 'recruiting-ads' | 'recruiting-followup' | 'retention' | 'persistency' | 'placements' | 'cancellations' | 'revenue';

const tabs: { id: PipelineTab; label: string; icon: typeof Megaphone }[] = [
  { id: 'lead-gen-ads', label: 'Lead Gen Ads', icon: Megaphone },
  { id: 'lead-gen-followup', label: 'GHL Follow-Up', icon: MessageSquare },
  { id: 'recruiting-ads', label: 'Recruiting Ads', icon: UserPlus },
  { id: 'recruiting-followup', label: 'Recruiting Pipeline', icon: Users },
  { id: 'retention', label: 'Retention', icon: Shield },
  { id: 'persistency', label: 'Persistency', icon: FileCheck },
  { id: 'placements', label: 'Placements', icon: TrendingUp },
  { id: 'cancellations', label: 'Cancellations', icon: XCircle },
  { id: 'revenue', label: 'Revenue', icon: DollarSign },
];

export function CcPipelinesTab() {
  const [activeTab, setActiveTab] = useState<PipelineTab>('lead-gen-ads');
  const store = usePipelineStore();

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
        {activeTab === 'lead-gen-ads' && <LeadGenAdsView data={store.leadGenAds} />}
        {activeTab === 'lead-gen-followup' && <LeadGenFollowUpView data={store.leadGenFollowUp} />}
        {activeTab === 'recruiting-ads' && <RecruitingAdsView data={store.recruitingAds} />}
        {activeTab === 'recruiting-followup' && <RecruitingFollowUpView data={store.recruitingFollowUp} />}
        {activeTab === 'retention' && <RetentionView data={store.retentionAgents} />}
        {activeTab === 'persistency' && <PersistencyView data={store.persistency} />}
        {activeTab === 'placements' && <PlacementsView data={store.placements} />}
        {activeTab === 'cancellations' && <CancellationsView data={store.cancellations} />}
        {activeTab === 'revenue' && <RevenueView data={store.revenue} />}
      </motion.div>
    </div>
  );
}

function EmptyState() { return <p className="text-center py-12 text-sm text-muted-foreground">Load mock data to see pipeline metrics</p>; }

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

function LeadGenAdsView({ data }: { data: LeadGenAd[] }) {
  if (data.length === 0) return <EmptyState />;
  const totalSpend = data.reduce((s, d) => s + d.spend, 0);
  const totalLeads = data.reduce((s, d) => s + d.leads, 0);
  const avgCPL = totalLeads > 0 ? (totalSpend / totalLeads).toFixed(2) : '0';
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="Total Spend" value={`$${totalSpend.toLocaleString()}`} trend="up" />
        <StatCard label="Total Leads" value={totalLeads.toString()} trend="up" />
        <StatCard label="Avg CPL" value={`$${avgCPL}`} trend="down" />
      </div>
      <div className="glass rounded-xl overflow-hidden">
        <table className="w-full text-xs"><thead><tr className="border-b border-border/50 bg-secondary/30"><th className="text-left py-3 px-4 font-medium text-muted-foreground">Campaign</th><th className="text-left py-3 px-4 font-medium text-muted-foreground">Source</th><th className="text-right py-3 px-4 font-medium text-muted-foreground">Spend</th><th className="text-right py-3 px-4 font-medium text-muted-foreground">Leads</th><th className="text-right py-3 px-4 font-medium text-muted-foreground">CPL</th><th className="text-left py-3 px-4 font-medium text-muted-foreground">Status</th></tr></thead>
          <tbody>{data.map((row) => (<tr key={row.id} className="border-b border-border/30 hover:bg-secondary/20"><td className="py-3 px-4 font-medium">{row.campaign}</td><td className="py-3 px-4 text-muted-foreground">{row.source}</td><td className="py-3 px-4 text-right">${row.spend.toLocaleString()}</td><td className="py-3 px-4 text-right">{row.leads}</td><td className="py-3 px-4 text-right">${row.cpl.toFixed(2)}</td><td className="py-3 px-4"><span className={cn('px-1.5 py-0.5 rounded text-[10px] font-medium', row.status === 'active' ? 'bg-emerald-400/10 text-emerald-400' : row.status === 'paused' ? 'bg-amber-400/10 text-amber-400' : 'bg-slate-400/10 text-muted-foreground/70')}>{row.status}</span></td></tr>))}</tbody>
        </table>
      </div>
    </div>
  );
}

function LeadGenFollowUpView({ data }: { data: LeadGenFollowUp[] }) {
  if (data.length === 0) return <EmptyState />;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <StatCard label="Avg Response Rate" value={`${(data.reduce((s, d) => s + d.responseRate, 0) / data.length).toFixed(0)}%`} trend="up" />
        <StatCard label="Total Appt Sets" value={data.reduce((s, d) => s + d.appointmentSets, 0).toString()} trend="up" />
        <StatCard label="Avg Show Rate" value={`${(data.reduce((s, d) => s + d.showRate, 0) / data.length).toFixed(0)}%`} trend="flat" />
        <StatCard label="Avg Conversion" value={`${(data.reduce((s, d) => s + d.conversionRate, 0) / data.length).toFixed(0)}%`} trend="up" />
      </div>
      <div className="glass rounded-xl overflow-hidden">
        <table className="w-full text-xs"><thead><tr className="border-b border-border/50 bg-secondary/30"><th className="text-left py-3 px-4 font-medium text-muted-foreground">Automation</th><th className="text-right py-3 px-4 font-medium text-muted-foreground">Response Rate</th><th className="text-right py-3 px-4 font-medium text-muted-foreground">Appt Sets</th><th className="text-right py-3 px-4 font-medium text-muted-foreground">Show Rate</th><th className="text-right py-3 px-4 font-medium text-muted-foreground">Conversion</th></tr></thead>
          <tbody>{data.map((row) => (<tr key={row.id} className="border-b border-border/30 hover:bg-secondary/20"><td className="py-3 px-4 font-medium">{row.automation}</td><td className="py-3 px-4 text-right">{row.responseRate}%</td><td className="py-3 px-4 text-right">{row.appointmentSets}</td><td className="py-3 px-4 text-right">{row.showRate}%</td><td className="py-3 px-4 text-right">{row.conversionRate}%</td></tr>))}</tbody>
        </table>
      </div>
    </div>
  );
}

function RecruitingAdsView({ data }: { data: RecruitingAd[] }) {
  if (data.length === 0) return <EmptyState />;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="Total Spend" value={`$${data.reduce((s, d) => s + d.spend, 0).toLocaleString()}`} trend="flat" />
        <StatCard label="Applications" value={data.reduce((s, d) => s + d.applications, 0).toString()} trend="up" />
        <StatCard label="Avg Cost/Recruit" value={`$${(data.reduce((s, d) => s + d.costPerRecruit, 0) / data.length).toFixed(0)}`} trend="down" />
      </div>
      <div className="glass rounded-xl overflow-hidden">
        <table className="w-full text-xs"><thead><tr className="border-b border-border/50 bg-secondary/30"><th className="text-left py-3 px-4 font-medium text-muted-foreground">Campaign</th><th className="text-right py-3 px-4 font-medium text-muted-foreground">Spend</th><th className="text-right py-3 px-4 font-medium text-muted-foreground">Applications</th><th className="text-right py-3 px-4 font-medium text-muted-foreground">Cost/Recruit</th><th className="text-left py-3 px-4 font-medium text-muted-foreground">Status</th></tr></thead>
          <tbody>{data.map((row) => (<tr key={row.id} className="border-b border-border/30 hover:bg-secondary/20"><td className="py-3 px-4 font-medium">{row.campaign}</td><td className="py-3 px-4 text-right">${row.spend.toLocaleString()}</td><td className="py-3 px-4 text-right">{row.applications}</td><td className="py-3 px-4 text-right">${row.costPerRecruit.toFixed(0)}</td><td className="py-3 px-4"><span className={cn('px-1.5 py-0.5 rounded text-[10px] font-medium', row.status === 'active' ? 'bg-emerald-400/10 text-emerald-400' : 'bg-amber-400/10 text-amber-400')}>{row.status}</span></td></tr>))}</tbody>
        </table>
      </div>
    </div>
  );
}

function RecruitingFollowUpView({ data }: { data: RecruitingFollowUp[] }) {
  if (data.length === 0) return <EmptyState />;
  const stages = ['applied', 'screening', 'interview', 'offer', 'onboarding', 'productive'] as const;
  const stageColors: Record<string, string> = { applied: 'bg-slate-400', screening: 'bg-sky-400', interview: 'bg-amber-400', offer: 'bg-emerald-400', onboarding: 'bg-green-400', productive: 'bg-emerald-500' };
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
        {stages.map((stage) => (<div key={stage} className="glass rounded-xl p-3 text-center"><div className={`w-3 h-3 rounded-full ${stageColors[stage]} mx-auto mb-1.5`} /><p className="text-lg font-bold">{data.filter((d) => d.stage === stage).length}</p><p className="text-[10px] text-muted-foreground capitalize">{stage}</p></div>))}
      </div>
      <div className="glass rounded-xl overflow-hidden">
        <table className="w-full text-xs"><thead><tr className="border-b border-border/50 bg-secondary/30"><th className="text-left py-3 px-4 font-medium text-muted-foreground">Candidate</th><th className="text-left py-3 px-4 font-medium text-muted-foreground">Stage</th><th className="text-right py-3 px-4 font-medium text-muted-foreground">Days in Stage</th></tr></thead>
          <tbody>{data.map((row) => (<tr key={row.id} className="border-b border-border/30 hover:bg-secondary/20"><td className="py-3 px-4 font-medium">{row.candidate}</td><td className="py-3 px-4"><span className="px-1.5 py-0.5 rounded text-[10px] font-medium capitalize bg-secondary text-foreground">{row.stage}</span></td><td className="py-3 px-4 text-right">{row.daysInStage}d</td></tr>))}</tbody>
        </table>
      </div>
    </div>
  );
}

function RetentionView({ data }: { data: RetentionAgent[] }) {
  if (data.length === 0) return <EmptyState />;
  const atRisk = data.filter((d) => d.atRisk).length;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="Active Agents" value={data.length.toString()} trend="flat" />
        <StatCard label="At Risk" value={atRisk.toString()} trend={atRisk > 0 ? 'down' : 'up'} />
        <StatCard label="Avg Engagement" value={`${(data.reduce((s, d) => s + d.engagementScore, 0) / data.length).toFixed(0)}/100`} trend="flat" />
      </div>
      <div className="glass rounded-xl overflow-hidden">
        <table className="w-full text-xs"><thead><tr className="border-b border-border/50 bg-secondary/30"><th className="text-left py-3 px-4 font-medium text-muted-foreground">Agent</th><th className="text-right py-3 px-4 font-medium text-muted-foreground">Engagement</th><th className="text-right py-3 px-4 font-medium text-muted-foreground">Policies</th><th className="text-left py-3 px-4 font-medium text-muted-foreground">Status</th></tr></thead>
          <tbody>{data.map((row) => (<tr key={row.id} className="border-b border-border/30 hover:bg-secondary/20"><td className="py-3 px-4 font-medium">{row.name}</td><td className="py-3 px-4 text-right">{row.engagementScore}/100</td><td className="py-3 px-4 text-right">{row.policiesActive}</td><td className="py-3 px-4">{row.atRisk ? <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-400/10 text-red-400">At Risk</span> : <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-400/10 text-emerald-400">Active</span>}</td></tr>))}</tbody>
        </table>
      </div>
    </div>
  );
}

function PersistencyView({ data }: { data: PersistencyRecord[] }) {
  if (data.length === 0) return <EmptyState />;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="Active Policies" value={data.filter((d) => d.status === 'active').length.toString()} trend="up" />
        <StatCard label="Warnings" value={data.filter((d) => d.lapseWarning).length.toString()} trend="down" />
        <StatCard label="Lapsed" value={data.filter((d) => d.status === 'lapsed').length.toString()} trend="down" />
      </div>
      <div className="glass rounded-xl overflow-hidden">
        <table className="w-full text-xs"><thead><tr className="border-b border-border/50 bg-secondary/30"><th className="text-left py-3 px-4 font-medium text-muted-foreground">Policy ID</th><th className="text-right py-3 px-4 font-medium text-muted-foreground">13-Month %</th><th className="text-right py-3 px-4 font-medium text-muted-foreground">25-Month %</th><th className="text-left py-3 px-4 font-medium text-muted-foreground">Status</th></tr></thead>
          <tbody>{data.map((row) => (<tr key={row.id} className="border-b border-border/30 hover:bg-secondary/20"><td className="py-3 px-4 font-medium">{row.policyId}</td><td className="py-3 px-4 text-right">{row.month13 || '-'}%</td><td className="py-3 px-4 text-right">{row.month25 || '-'}%</td><td className="py-3 px-4"><span className={cn('px-1.5 py-0.5 rounded text-[10px] font-medium', row.status === 'active' ? 'bg-emerald-400/10 text-emerald-400' : row.status === 'warning' ? 'bg-amber-400/10 text-amber-400' : 'bg-red-400/10 text-red-400')}>{row.status}</span></td></tr>))}</tbody>
        </table>
      </div>
    </div>
  );
}

function PlacementsView({ data }: { data: Placement[] }) {
  if (data.length === 0) return <EmptyState />;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <StatCard label="Placed" value={data.filter((d) => d.status === 'placed').length.toString()} trend="up" />
        <StatCard label="Approved" value={data.filter((d) => d.status === 'approved').length.toString()} trend="up" />
        <StatCard label="Pending" value={data.filter((d) => d.status === 'pending' || d.status === 'submitted').length.toString()} trend="flat" />
        <StatCard label="Total Premium" value={`$${data.reduce((s, d) => s + d.premium, 0).toLocaleString()}`} trend="up" />
      </div>
      <div className="glass rounded-xl overflow-hidden">
        <table className="w-full text-xs"><thead><tr className="border-b border-border/50 bg-secondary/30"><th className="text-left py-3 px-4 font-medium text-muted-foreground">Client</th><th className="text-left py-3 px-4 font-medium text-muted-foreground">Product</th><th className="text-right py-3 px-4 font-medium text-muted-foreground">Premium</th><th className="text-left py-3 px-4 font-medium text-muted-foreground">Status</th></tr></thead>
          <tbody>{data.map((row) => (<tr key={row.id} className="border-b border-border/30 hover:bg-secondary/20"><td className="py-3 px-4 font-medium">{row.client}</td><td className="py-3 px-4 text-muted-foreground">{row.product}</td><td className="py-3 px-4 text-right">${row.premium.toLocaleString()}</td><td className="py-3 px-4"><span className={cn('px-1.5 py-0.5 rounded text-[10px] font-medium', row.status === 'placed' ? 'bg-emerald-400/10 text-emerald-400' : row.status === 'approved' ? 'bg-sky-400/10 text-sky-400' : 'bg-amber-400/10 text-amber-400')}>{row.status}</span></td></tr>))}</tbody>
        </table>
      </div>
    </div>
  );
}

function CancellationsView({ data }: { data: Cancellation[] }) {
  if (data.length === 0) return <EmptyState />;
  const saved = data.filter((d) => d.saved).length;
  const saveRate = data.length > 0 ? ((saved / data.length) * 100).toFixed(0) : '0';
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="Total Cancellation Attempts" value={data.length.toString()} trend="down" />
        <StatCard label="Saved" value={`${saved} (${saveRate}%)`} trend="up" />
        <StatCard label="Premium at Risk" value={`$${data.filter((d) => !d.saved).reduce((s, d) => s + d.premium, 0).toLocaleString()}`} trend="down" />
      </div>
      <div className="glass rounded-xl overflow-hidden">
        <table className="w-full text-xs"><thead><tr className="border-b border-border/50 bg-secondary/30"><th className="text-left py-3 px-4 font-medium text-muted-foreground">Client</th><th className="text-left py-3 px-4 font-medium text-muted-foreground">Reason</th><th className="text-right py-3 px-4 font-medium text-muted-foreground">Premium</th><th className="text-left py-3 px-4 font-medium text-muted-foreground">Save Attempt</th><th className="text-left py-3 px-4 font-medium text-muted-foreground">Outcome</th></tr></thead>
          <tbody>{data.map((row) => (<tr key={row.id} className="border-b border-border/30 hover:bg-secondary/20"><td className="py-3 px-4 font-medium">{row.client}</td><td className="py-3 px-4 text-muted-foreground">{row.reason}</td><td className="py-3 px-4 text-right">${row.premium.toLocaleString()}</td><td className="py-3 px-4">{row.saveAttempt ? 'Yes' : 'No'}</td><td className="py-3 px-4"><span className={cn('px-1.5 py-0.5 rounded text-[10px] font-medium', row.saved ? 'bg-emerald-400/10 text-emerald-400' : 'bg-red-400/10 text-red-400')}>{row.saved ? 'Saved' : 'Lost'}</span></td></tr>))}</tbody>
        </table>
      </div>
    </div>
  );
}

function RevenueView({ data }: { data: RevenueRecord[] }) {
  if (data.length === 0) return <EmptyState />;
  const totalActual = data.reduce((s, d) => s + d.actual, 0);
  const totalProjected = data.reduce((s, d) => s + d.projected, 0);
  const totalCommission = data.reduce((s, d) => s + d.commission, 0);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="Actual Revenue MTD" value={`$${totalActual.toLocaleString()}`} trend={totalActual >= totalProjected ? 'up' : 'down'} />
        <StatCard label="Projected" value={`$${totalProjected.toLocaleString()}`} trend="flat" />
        <StatCard label="Total Commission" value={`$${totalCommission.toLocaleString()}`} trend="up" />
      </div>
      <div className="glass rounded-xl overflow-hidden">
        <table className="w-full text-xs"><thead><tr className="border-b border-border/50 bg-secondary/30"><th className="text-left py-3 px-4 font-medium text-muted-foreground">Source</th><th className="text-right py-3 px-4 font-medium text-muted-foreground">Projected</th><th className="text-right py-3 px-4 font-medium text-muted-foreground">Actual</th><th className="text-right py-3 px-4 font-medium text-muted-foreground">Commission</th><th className="text-left py-3 px-4 font-medium text-muted-foreground">Variance</th></tr></thead>
          <tbody>{data.map((row) => { const variance = ((row.actual - row.projected) / row.projected * 100).toFixed(1); const positive = row.actual >= row.projected; return (<tr key={row.id} className="border-b border-border/30 hover:bg-secondary/20"><td className="py-3 px-4 font-medium">{row.source}</td><td className="py-3 px-4 text-right">${row.projected.toLocaleString()}</td><td className="py-3 px-4 text-right">${row.actual.toLocaleString()}</td><td className="py-3 px-4 text-right">${row.commission.toLocaleString()}</td><td className="py-3 px-4"><span className={positive ? 'text-emerald-400' : 'text-red-400'}>{positive ? '+' : ''}{variance}%</span></td></tr>); })}</tbody>
        </table>
      </div>
    </div>
  );
}
