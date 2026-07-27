/**
 * @crm-protected
 * DO NOT MODIFY without Charlie's explicit approval.
 * This file is part of CRM Ops (OpenClaw Dashboard).
 * Table references use hierarchy_agencies (NOT crm_agencies).
 * Any rename or schema change to hierarchy_agencies requires updating this file.
 * See: docs/CRM_OPS_FILES.md for the full protected file list.
 */
// @ts-nocheck
import React, { useState, useEffect } from 'react';
import {
  Building2,
  ArrowRight,
  Eye,
  BarChart3,
  Contact,
  CalendarDays,
  CalendarRange,
  Repeat2,
  ShieldCheck,
  XCircle,
  UserPlus,
  GitBranchPlus,
  RefreshCw,
  AlertCircle,
  TrendingUp,
} from 'lucide-react';
import { supabase } from '@/lib/crm/portal-client';
import type { CrmAgency, CrmNotification, AgencyKpi } from '@/lib/crm/types';
import { avgContactsPerWeek, avgContactsPerMonth } from '@/lib/crm/helpers';

interface GhlConfig {
  agency_id: string;
  connection_status: string;
}

interface KpiDashboardTabProps {
  onNavigate: (tab: string) => void;
}

interface PipelineRow {
  agency: string;
  stage: string;
}

interface ActionCount {
  pendingCsr: number;
  pendingRoster: number;
  openTickets: number;
  pendingCancellations: number;
}

const NOTIFICATION_COLORS: Record<string, string> = {
  agency_added: 'bg-blue-100 text-primary',
  csr_confirmed: 'bg-teal-400/10 text-teal-400',
  roster_uploaded: 'bg-amber-400/10 text-amber-400',
  roster_confirmed: 'bg-emerald-400/10 text-emerald-400',
  dba_uploaded: 'bg-amber-400/10 text-amber-400',
  dba_confirmed: 'bg-emerald-400/10 text-emerald-400',
  cancellation_confirmed: 'bg-emerald-400/10 text-emerald-400',
  cancellation_rejected: 'bg-red-400/10 text-red-400',
};

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function computeAgencyPipelineCounts(rows: PipelineRow[], agencyName: string) {
  const agencyRows = rows.filter((r) => r.agency === agencyName);
  return {
    onboarded: agencyRows.filter((r) => r.stage === 'completed').length,
    inPipeline: agencyRows.filter((r) => r.stage !== 'completed' && r.stage !== 'terminated').length,
  };
}

export const KpiDashboardTab: React.FC<KpiDashboardTabProps> = ({ onNavigate }) => {
  const [agencies, setAgencies] = useState<CrmAgency[]>([]);
  const [kpis, setKpis] = useState<AgencyKpi[]>([]);
  const [pipelineRows, setPipelineRows] = useState<PipelineRow[]>([]);
  const [notifications, setNotifications] = useState<CrmNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [selectedAgencyId, setSelectedAgencyId] = useState<string | null>(null);
  const [ghlConfigs, setGhlConfigs] = useState<GhlConfig[]>([]);
  const [actionCounts, setActionCounts] = useState<ActionCount>({ pendingCsr: 0, pendingRoster: 0, openTickets: 0, pendingCancellations: 0 });

  const loadData = async () => {
    const [agencyRes, kpiRes, notifRes, pipelineRes, ghlRes, ticketRes, cancelRes] = await Promise.all([
      supabase.from('hierarchy_agencies').select('*').eq('crm_enabled', true).order('name'),
      supabase.from('agency_kpis').select('*').order('computed_at', { ascending: false }),
      supabase.from('crm_notifications').select('*, hierarchy_agencies(name)').order('created_at', { ascending: false }).limit(15),
      supabase.from('crm_pipeline').select('agency, stage'),
      supabase.from('agency_ghl_configs').select('agency_id, connection_status'),
      supabase.from('crm_tickets').select('id', { count: 'exact', head: true }).eq('status', 'open'),
      supabase.from('agency_cancellation_uploads').select('id', { count: 'exact', head: true }).eq('status', 'pending_approval'),
    ]);

    const agencyData = agencyRes.data || [];
    setAgencies(agencyData);
    setKpis(kpiRes.data || []);
    setNotifications(notifRes.data || []);
    setPipelineRows(pipelineRes.data || []);
    setGhlConfigs(ghlRes.data || []);

    setActionCounts({
      pendingCsr: agencyData.filter(a => a.is_active && a.onboarding_status === 'pending_csr_assignment').length,
      pendingRoster: agencyData.filter(a => a.is_active && a.onboarding_status === 'awaiting_roster_upload').length,
      openTickets: ticketRes.count || 0,
      pendingCancellations: cancelRes.count || 0,
    });

    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  const handleSyncKpis = async () => {
    setSyncing(true);
    setSyncResult(null);

    const connectedIds = selectedAgencyId
      ? ghlConfigs.filter((c) => c.agency_id === selectedAgencyId && c.connection_status === 'connected').map((c) => c.agency_id)
      : ghlConfigs.filter((c) => c.connection_status === 'connected').map((c) => c.agency_id);

    if (connectedIds.length === 0) {
      setSyncResult({ ok: false, message: 'No connected GHL agencies to sync' });
      setSyncing(false);
      return;
    }

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
    let succeeded = 0;

    for (const agencyId of connectedIds) {
      try {
        const res = await fetch(`${supabaseUrl}/functions/v1/sync-ghl-data`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${supabaseKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ agency_id: agencyId }),
        });
        if (res.ok) {
          const result = await res.json();
          if (result.success) succeeded++;
        }
      } catch {
        // continue to next agency
      }
    }

    setSyncResult({
      ok: succeeded > 0,
      message: `Synced ${succeeded} of ${connectedIds.length} agencies`,
    });

    await loadData();
    setSyncing(false);
  };

  const markAsRead = async (id: string) => {
    await supabase.from('crm_notifications').update({ is_read: true }).eq('id', id);
    setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, is_read: true } : n));
  };

  const latestKpiByAgency = (agencyId: string): AgencyKpi | null => {
    return kpis.find((k) => k.agency_id === agencyId) || null;
  };

  const selectedAgency = selectedAgencyId ? agencies.find((a) => a.id === selectedAgencyId) : null;

  const filteredKpis = selectedAgencyId
    ? kpis.filter((k) => k.agency_id === selectedAgencyId)
    : kpis;

  const latestPerAgency = new Map<string, AgencyKpi>();
  for (const k of filteredKpis) {
    if (!latestPerAgency.has(k.agency_id)) {
      latestPerAgency.set(k.agency_id, k);
    }
  }
  const latestValues = Array.from(latestPerAgency.values());

  const totalContacts = latestValues.reduce((s, k) => s + k.total_contacts, 0);
  const contactsWeek = latestValues.reduce((s, k) => {
    const agency = agencies.find((a) => a.id === k.agency_id);
    return s + avgContactsPerWeek(k.total_contacts, agency?.date_created ?? null, agency?.dba_client_count ?? 0);
  }, 0);
  const contactsMonth = latestValues.reduce((s, k) => {
    const agency = agencies.find((a) => a.id === k.agency_id);
    return s + avgContactsPerMonth(k.total_contacts, agency?.date_created ?? null, agency?.dba_client_count ?? 0);
  }, 0);
  const crossSellOpps = latestValues.reduce((s, k) => s + k.cross_sell_opportunities, 0);
  const savedPolicies = latestValues.reduce((s, k) => s + k.saved_policies, 0);
  const cancellations = latestValues.reduce((s, k) => s + k.cancellations, 0);

  const filteredPipelineRows = selectedAgency
    ? pipelineRows.filter((r) => r.agency === selectedAgency.name)
    : pipelineRows;

  const totalOnboarded = filteredPipelineRows.filter((r) => r.stage === 'completed').length;
  const totalInPipeline = filteredPipelineRows.filter((r) => r.stage !== 'completed' && r.stage !== 'terminated').length;

  const totalActions = actionCounts.pendingCsr + actionCounts.pendingRoster + actionCounts.openTickets + actionCounts.pendingCancellations;

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-40 bg-secondary/60 rounded-xl animate-pulse" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <div key={i} className="h-28 bg-card rounded-xl border border-border animate-pulse" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Action Required Hero */}
      {totalActions > 0 && (
        <div className="bg-gradient-to-r from-card to-secondary rounded-2xl p-6 text-foreground relative overflow-hidden">
          <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)', backgroundSize: '24px 24px' }} />
          <div className="relative">
            <div className="flex items-center gap-2 mb-4">
              <AlertCircle className="w-5 h-5 text-gold-400" />
              <h3 className="text-sm font-semibold text-white/90 uppercase tracking-wide">Action Required</h3>
              <span className="ml-auto bg-card/15 backdrop-blur-sm text-white text-xs font-bold px-2.5 py-1 rounded-full border border-white/20">
                {totalActions} pending
              </span>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {actionCounts.pendingCsr > 0 && (
                <button onClick={() => onNavigate('work-queue')} className="bg-card/10 backdrop-blur-sm rounded-xl p-4 border border-white/10 hover:bg-card/20 transition-colors text-left">
                  <p className="text-2xl font-bold">{actionCounts.pendingCsr}</p>
                  <p className="text-xs text-white/70 mt-0.5">CSR Assignments</p>
                </button>
              )}
              {actionCounts.openTickets > 0 && (
                <button onClick={() => onNavigate('work-queue')} className="bg-card/10 backdrop-blur-sm rounded-xl p-4 border border-white/10 hover:bg-card/20 transition-colors text-left">
                  <p className="text-2xl font-bold">{actionCounts.openTickets}</p>
                  <p className="text-xs text-white/70 mt-0.5">Open Tickets</p>
                </button>
              )}
              {actionCounts.pendingCancellations > 0 && (
                <button onClick={() => onNavigate('work-queue')} className="bg-card/10 backdrop-blur-sm rounded-xl p-4 border border-white/10 hover:bg-card/20 transition-colors text-left">
                  <p className="text-2xl font-bold">{actionCounts.pendingCancellations}</p>
                  <p className="text-xs text-white/70 mt-0.5">Cancellation Approvals</p>
                </button>
              )}
              {actionCounts.pendingRoster > 0 && (
                <button onClick={() => onNavigate('work-queue')} className="bg-card/10 backdrop-blur-sm rounded-xl p-4 border border-white/10 hover:bg-card/20 transition-colors text-left">
                  <p className="text-2xl font-bold">{actionCounts.pendingRoster}</p>
                  <p className="text-xs text-white/70 mt-0.5">Awaiting Roster</p>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Agency Filter + Sync */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 glass rounded-xl p-1.5 overflow-x-auto flex-1 shadow-none">
          <button
            onClick={() => setSelectedAgencyId(null)}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all whitespace-nowrap ${
              !selectedAgencyId ? 'gradient-primary text-background shadow-none' : 'text-muted-foreground hover:bg-secondary'
            }`}
          >
            All Agencies
          </button>
          {agencies.filter((a) => a.is_active).map((a) => {
            const hasGhl = ghlConfigs.some((c) => c.agency_id === a.id && c.connection_status === 'connected');
            return (
              <button
                key={a.id}
                onClick={() => setSelectedAgencyId(a.id === selectedAgencyId ? null : a.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all whitespace-nowrap flex items-center gap-1.5 ${
                  selectedAgencyId === a.id ? 'gradient-primary text-background shadow-none' : 'text-muted-foreground hover:bg-secondary'
                }`}
              >
                {hasGhl && <span className={`inline-block w-1.5 h-1.5 rounded-full ${selectedAgencyId === a.id ? 'bg-emerald-300' : 'bg-emerald-500'}`} />}
                {a.name}
              </button>
            );
          })}
        </div>
        <button
          onClick={handleSyncKpis}
          disabled={syncing}
          className="flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-primary rounded-xl hover:bg-primary/90 transition-all shadow-none hover:shadow-none disabled:opacity-50 whitespace-nowrap"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
          {syncing ? 'Syncing...' : 'Sync KPIs'}
        </button>
      </div>

      {syncResult && (
        <div className={`flex items-center gap-2 p-3 rounded-xl text-sm ${syncResult.ok ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-700 border border-amber-200'}`}>
          {syncResult.ok ? <RefreshCw className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
          {syncResult.message}
          <button onClick={() => setSyncResult(null)} className="ml-auto text-xs underline opacity-70 hover:opacity-100">Dismiss</button>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard icon={Contact} label="Total Contacts" value={totalContacts.toLocaleString()} color="text-primary" accentColor="border-blue-400" bgColor="bg-cyan-500/10" />
        <KpiCard icon={CalendarDays} label="Avg / Week" value={contactsWeek.toLocaleString()} color="text-cyan-700" accentColor="border-cyan-400" bgColor="bg-cyan-50" />
        <KpiCard icon={CalendarRange} label="Avg / Month" value={contactsMonth.toLocaleString()} color="text-sky-700" accentColor="border-sky-400" bgColor="bg-sky-50" />
        <KpiCard icon={Repeat2} label="Cross-Sell Opps" value={crossSellOpps.toLocaleString()} color="text-amber-700" accentColor="border-amber-400" bgColor="bg-amber-50" />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard icon={ShieldCheck} label="Saved Policies" value={savedPolicies.toLocaleString()} color="text-emerald-700" accentColor="border-emerald-400" bgColor="bg-emerald-50" />
        <KpiCard icon={XCircle} label="Cancellations" value={cancellations.toLocaleString()} color="text-red-700" accentColor="border-red-400" bgColor="bg-red-500/10" />
        <KpiCard icon={UserPlus} label="Agents Onboarded" value={totalOnboarded.toLocaleString()} color="text-teal-700" accentColor="border-teal-400" bgColor="bg-teal-50" />
        <KpiCard icon={GitBranchPlus} label="Agents In Pipeline" value={totalInPipeline.toLocaleString()} color="text-primary" accentColor="border-primary" bgColor="bg-primary/5" />
      </div>

      {/* Agency Breakdown Table */}
      <div className="bg-card rounded-2xl border border-border overflow-hidden shadow-none">
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-semibold text-muted-foreground">Agency Breakdown</h3>
          </div>
          <span className="text-xs text-muted-foreground">{agencies.filter(a => a.is_active).length} agencies</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-muted/50">
                <th className="px-5 py-3 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Agency</th>
                <th className="px-4 py-3 text-right text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Contacts</th>
                <th className="px-4 py-3 text-right text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Avg / Week</th>
                <th className="px-4 py-3 text-right text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Avg / Month</th>
                <th className="px-4 py-3 text-right text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Cross-Sell</th>
                <th className="px-4 py-3 text-right text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Saved</th>
                <th className="px-4 py-3 text-right text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Cancelled</th>
                <th className="px-4 py-3 text-center text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Onboarded</th>
                <th className="px-4 py-3 text-center text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">In Pipeline</th>
                <th className="px-4 py-3 text-center text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {agencies.filter((a) => a.is_active).map((agency, idx) => {
                const kpi = latestKpiByAgency(agency.id);
                const counts = computeAgencyPipelineCounts(pipelineRows, agency.name);
                return (
                  <tr
                    key={agency.id}
                    className={`hover:bg-primary/5 cursor-pointer transition-colors ${idx % 2 === 1 ? 'bg-muted/30' : ''}`}
                    onClick={() => onNavigate('agencies')}
                  >
                    <td className="px-5 py-3.5 whitespace-nowrap">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-primary/5 border border-primary flex items-center justify-center">
                          <Building2 className="w-4 h-4 text-primary" />
                        </div>
                        <span className="text-sm font-medium text-muted-foreground">{agency.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-right text-sm font-semibold text-muted-foreground">
                      {kpi ? kpi.total_contacts.toLocaleString() : '--'}
                    </td>
                    <td className="px-4 py-3.5 text-right text-sm text-muted-foreground">
                      {kpi ? avgContactsPerWeek(kpi.total_contacts, agency.date_created, agency.dba_client_count).toLocaleString() : '--'}
                    </td>
                    <td className="px-4 py-3.5 text-right text-sm text-muted-foreground">
                      {kpi ? avgContactsPerMonth(kpi.total_contacts, agency.date_created, agency.dba_client_count).toLocaleString() : '--'}
                    </td>
                    <td className="px-4 py-3.5 text-right text-sm text-muted-foreground">
                      {kpi ? kpi.cross_sell_opportunities.toLocaleString() : '--'}
                    </td>
                    <td className="px-4 py-3.5 text-right text-sm text-emerald-600 font-medium">
                      {kpi ? kpi.saved_policies.toLocaleString() : '--'}
                    </td>
                    <td className="px-4 py-3.5 text-right text-sm text-red-400 font-medium">
                      {kpi ? kpi.cancellations.toLocaleString() : '--'}
                    </td>
                    <td className="px-4 py-3.5 text-center text-sm font-semibold text-teal-600">
                      {counts.onboarded}
                    </td>
                    <td className="px-4 py-3.5 text-center text-sm font-semibold text-primary">
                      {counts.inPipeline}
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      <span className={`inline-flex w-2.5 h-2.5 rounded-full ${agency.is_active ? 'bg-emerald-500' : 'bg-muted-foreground/30'}`} />
                    </td>
                  </tr>
                );
              })}
              {agencies.filter((a) => a.is_active).length === 0 && (
                <tr>
                  <td colSpan={10} className="px-6 py-12 text-center text-sm text-muted-foreground">
                    No active agencies
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Activity + Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-card rounded-2xl border border-border p-6 shadow-none">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-muted-foreground">Recent Activity</h3>
            <button onClick={() => onNavigate('history')} className="text-xs text-primary hover:text-primary font-medium">
              View all
            </button>
          </div>
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center mb-3">
                <Building2 className="w-6 h-6 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground">No activity yet</p>
              <p className="text-xs text-muted-foreground mt-1">Activity will appear here as agencies are onboarded</p>
            </div>
          ) : (
            <div className="space-y-1 max-h-[320px] overflow-y-auto">
              {notifications.map((notif) => {
                const colorClass = NOTIFICATION_COLORS[notif.type] || 'bg-secondary text-muted-foreground';
                return (
                  <div
                    key={notif.id}
                    className={`flex items-start gap-3 p-3 rounded-xl transition-all ${
                      notif.is_read ? 'opacity-60' : 'bg-primary/5 border border-primary/10'
                    }`}
                  >
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${colorClass}`}>
                      <BarChart3 className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      {(notif as any).hierarchy_agencies?.name && (
                        <span className="inline-block text-[11px] font-semibold bg-primary/10 text-primary px-1.5 py-0.5 rounded mb-1">
                          {(notif as any).hierarchy_agencies.name}
                        </span>
                      )}
                      <p className={`text-sm ${notif.is_read ? 'text-muted-foreground' : 'text-muted-foreground font-medium'}`}>
                        {notif.message}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">{timeAgo(notif.created_at)}</p>
                    </div>
                    {!notif.is_read && (
                      <button
                        onClick={() => markAsRead(notif.id)}
                        className="p-1.5 text-muted-foreground hover:text-primary hover:bg-primary/5 rounded-lg transition-colors flex-shrink-0"
                        title="Mark as read"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="space-y-3">
          <QuickAction title="View Agencies" description="Manage agency profiles and performance" onClick={() => onNavigate('agencies')} />
          <QuickAction title="Work Queue" description="Tickets, onboarding, and cancellations" onClick={() => onNavigate('work-queue')} />
          <QuickAction title="Pipeline" description="Track agent CRM onboarding workflow" onClick={() => onNavigate('pipeline')} />
        </div>
      </div>
    </div>
  );
};

const KpiCard: React.FC<{
  icon: React.FC<{ className?: string }>;
  label: string;
  value: string;
  color: string;
  accentColor: string;
  bgColor: string;
}> = ({ icon: Icon, label, value, color, accentColor, bgColor }) => (
  <div className={`bg-card rounded-xl border border-border p-5 shadow-none hover:shadow-none transition-all duration-200 border-l-4 ${accentColor}`}>
    <div className="flex items-center justify-between mb-3">
      <div className={`w-10 h-10 rounded-xl ${bgColor} flex items-center justify-center`}>
        <Icon className={`w-5 h-5 ${color}`} />
      </div>
    </div>
    <p className={`text-3xl font-bold ${color}`}>{value}</p>
    <p className="text-xs text-muted-foreground mt-1 font-medium">{label}</p>
  </div>
);

const QuickAction: React.FC<{
  title: string;
  description: string;
  onClick: () => void;
}> = ({ title, description, onClick }) => (
  <button
    onClick={onClick}
    className="w-full bg-card rounded-xl border border-border p-5 text-left hover:border-primary hover:shadow-none transition-all duration-200 group shadow-none"
  >
    <div className="flex items-center justify-between mb-1.5">
      <h4 className="font-semibold text-muted-foreground text-sm">{title}</h4>
      <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
    </div>
    <p className="text-xs text-muted-foreground">{description}</p>
  </button>
);
