/**
 * CrmDashboardTab — Agency-scoped CRM dashboard for CRM Management.
 *
 * Shows key metrics and activity for the agency:
 *   - Agent roster count (filled seats / total seats)
 *   - Pipeline overview (agents by stage)
 *   - Recent notifications
 *   - New business intake count
 *   - Support ticket status
 *   - CSR contact info
 */
import { useState, useEffect } from 'react';
import {
  Users, GitBranch, Bell, FileText,
  Headphones, TrendingUp, CheckCircle2, Clock,
  Zap, AlertCircle,
} from 'lucide-react';
import { supabase as portalSupabase } from '@/lib/crm/portal-client';

// ── Types ──

interface DashboardData {
  totalSeats: number;
  filledSeats: number;
  pipelineByStage: Record<string, number>;
  totalPipeline: number;
  completedPipeline: number;
  recentNotifications: { id: string; type: string; message: string; created_at: string; is_read: boolean }[];
  newBusinessCount: number;
  openTickets: number;
  terminatedCount: number;
  csrName: string | null;
  csrEmail: string | null;
  csrPhone: string | null;
  onboardingStatus: string | null;
}

interface CrmDashboardTabProps {
  agencyName: string;
  agencyId: string;
}

const STAGE_LABELS: Record<string, string> = {
  zap_sent: 'Zap Sent',
  user_created: 'User Created',
  seat_filled: 'Seat Filled',
  sunfire_workflows: 'Sunfire Workflows',
  agency_workflows: 'Agency Workflows',
  completed: 'Completed',
  terminated: 'Terminated',
};

const STAGE_COLORS: Record<string, string> = {
  zap_sent: 'bg-blue-500/10 text-blue-400',
  user_created: 'bg-sky-500/10 text-sky-400',
  seat_filled: 'bg-indigo-500/10 text-indigo-400',
  sunfire_workflows: 'bg-amber-500/10 text-amber-400',
  agency_workflows: 'bg-orange-500/10 text-orange-400',
  completed: 'bg-emerald-500/10 text-emerald-400',
  terminated: 'bg-red-500/10 text-red-400',
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

function StatCard({
  icon: Icon,
  label,
  value,
  subtext,
  color = 'text-primary',
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  subtext?: string;
  color?: string;
}) {
  return (
    <div className="bg-card border border-border/40 rounded-xl p-4 flex items-start gap-3">
      <div className={`p-2 rounded-lg bg-secondary/50 ${color}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <p className="text-2xl font-bold text-foreground">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
        {subtext && <p className="text-xs text-muted-foreground/70 mt-0.5">{subtext}</p>}
      </div>
    </div>
  );
}

export function CrmDashboardTab({ agencyName, agencyId }: CrmDashboardTabProps) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<DashboardData | null>(null);

  useEffect(() => {
    loadDashboard();
  }, [agencyName, agencyId]);

  const loadDashboard = async () => {
    setLoading(true);
    try {
      // Find portal agency by name (case-insensitive match)
      const { data: allAgencies } = await portalSupabase
        .from('hierarchy_agencies')
        .select('id, name, parent_agency_id, seat_count, assigned_csr, csr_email, csr_phone, onboarding_status, crm_enabled')
        .eq('is_active', true)
        .eq('crm_enabled', true);

      if (!allAgencies) {
        setLoading(false);
        return;
      }

      const normalizedName = agencyName.toLowerCase().trim();
      const parentAgency = allAgencies.find(
        (a: { name: string }) => a.name.toLowerCase().trim() === normalizedName
      ) || allAgencies.find(
        (a: { name: string }) =>
          normalizedName.includes(a.name.toLowerCase().trim()) ||
          a.name.toLowerCase().trim().includes(normalizedName)
      );

      if (!parentAgency) {
        setLoading(false);
        return;
      }

      // Find child agencies
      const childAgencies = allAgencies.filter(
        (a: { parent_agency_id: string | null }) => a.parent_agency_id === parentAgency.id
      );
      const allGroupAgencies = [parentAgency, ...childAgencies];
      const groupNames = allGroupAgencies.map((a: { name: string }) => a.name);
      const groupIds = allGroupAgencies.map((a: { id: string }) => a.id);

      // Total seat count across the group
      const totalSeats = allGroupAgencies.reduce(
        (sum: number, a: { seat_count: number }) => sum + (a.seat_count || 0),
        0
      );

      // Load roster data for filled seat count
      const { data: uploads } = await portalSupabase
        .from('crm_roster_uploads')
        .select('id, agency')
        .in('agency', groupNames);

      let filledSeats = 0;
      if (uploads && uploads.length > 0) {
        const uploadIds = (uploads as { id: string }[]).map((u) => u.id);
        // Count non-empty rows
        const { data: rosterRows } = await portalSupabase
          .from('crm_roster')
          .select('row_data')
          .in('upload_id', uploadIds);

        if (rosterRows) {
          filledSeats = rosterRows.filter(
            (r: { row_data: Record<string, string> }) => r.row_data?.['First Name']?.trim()
          ).length;
        }
      }

      // Pipeline data
      const { data: pipelineRows } = await portalSupabase
        .from('crm_pipeline')
        .select('stage')
        .in('agency', groupNames);

      const pipelineByStage: Record<string, number> = {};
      let totalPipeline = 0;
      let completedPipeline = 0;
      if (pipelineRows) {
        for (const row of pipelineRows as { stage: string }[]) {
          pipelineByStage[row.stage] = (pipelineByStage[row.stage] || 0) + 1;
          totalPipeline++;
          if (row.stage === 'completed') completedPipeline++;
        }
      }

      // Notifications (recent 10)
      const { data: notifications } = await portalSupabase
        .from('crm_notifications')
        .select('id, type, message, created_at, is_read')
        .in('agency_id', groupIds)
        .order('created_at', { ascending: false })
        .limit(10);

      // New business intake count
      const { data: intakeRows } = await portalSupabase
        .from('crm_business_intake')
        .select('id', { count: 'exact', head: true })
        .in('agency_id', groupIds);
      // head query returns count in the response metadata, but supabase-js returns count separately
      const newBusinessCount = intakeRows ? (Array.isArray(intakeRows) ? intakeRows.length : 0) : 0;

      // Open tickets
      const { data: ticketRows } = await portalSupabase
        .from('crm_tickets')
        .select('id')
        .in('agency_id', groupIds)
        .neq('status', 'resolved');
      const openTickets = ticketRows?.length || 0;

      // Terminated agents
      const { data: termRows } = await portalSupabase
        .from('crm_termination_log')
        .select('id')
        .in('agency', groupNames);
      const terminatedCount = termRows?.length || 0;

      setData({
        totalSeats,
        filledSeats,
        pipelineByStage,
        totalPipeline,
        completedPipeline,
        recentNotifications: (notifications || []) as DashboardData['recentNotifications'],
        newBusinessCount,
        openTickets,
        terminatedCount,
        csrName: parentAgency.assigned_csr || null,
        csrEmail: parentAgency.csr_email || null,
        csrPhone: parentAgency.csr_phone || null,
        onboardingStatus: parentAgency.onboarding_status || null,
      });
    } catch (err) {
      console.error('Dashboard load error:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mr-3" />
        Loading dashboard…
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <AlertCircle className="w-8 h-8 mb-2 opacity-40" />
        <p>Unable to load dashboard data</p>
      </div>
    );
  }

  const activePipelineStages = Object.entries(data.pipelineByStage)
    .filter(([stage]) => stage !== 'completed' && stage !== 'terminated')
    .sort((a, b) => b[1] - a[1]);

  return (
    <div className="flex flex-col gap-6">
      {/* Stat cards row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          icon={Users}
          label="Agents"
          value={data.filledSeats}
          subtext={data.totalSeats > 0 ? `of ${data.totalSeats} seats` : undefined}
          color="text-primary"
        />
        <StatCard
          icon={GitBranch}
          label="Pipeline"
          value={data.totalPipeline}
          subtext={`${data.completedPipeline} completed`}
          color="text-emerald-400"
        />
        <StatCard
          icon={FileText}
          label="New Business"
          value={data.newBusinessCount}
          color="text-blue-400"
        />
        <StatCard
          icon={Headphones}
          label="Open Tickets"
          value={data.openTickets}
          color={data.openTickets > 0 ? 'text-amber-400' : 'text-muted-foreground'}
        />
      </div>

      {/* Two-column layout: Pipeline + Activity */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Pipeline breakdown */}
        <div className="bg-card border border-border/40 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-muted-foreground" />
            Agent Pipeline
          </h3>
          {data.totalPipeline === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No pipeline data yet</p>
          ) : (
            <div className="space-y-2">
              {/* Active stages */}
              {activePipelineStages.map(([stage, count]) => (
                <div key={stage} className="flex items-center justify-between">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STAGE_COLORS[stage] || 'bg-secondary text-muted-foreground'}`}>
                    {STAGE_LABELS[stage] || stage}
                  </span>
                  <span className="text-sm font-medium text-foreground">{count}</span>
                </div>
              ))}
              {/* Completed */}
              {data.completedPipeline > 0 && (
                <div className="flex items-center justify-between pt-2 border-t border-border/30">
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-400">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Completed
                  </span>
                  <span className="text-sm font-medium text-foreground">{data.completedPipeline}</span>
                </div>
              )}
              {/* Terminated */}
              {data.terminatedCount > 0 && (
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-red-400">
                    <AlertCircle className="w-3.5 h-3.5" />
                    Terminated
                  </span>
                  <span className="text-sm font-medium text-foreground">{data.terminatedCount}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Recent activity / notifications */}
        <div className="bg-card border border-border/40 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
            <Bell className="w-4 h-4 text-muted-foreground" />
            Recent Activity
          </h3>
          {data.recentNotifications.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No recent activity</p>
          ) : (
            <div className="space-y-2 max-h-[280px] overflow-y-auto">
              {data.recentNotifications.map((n) => (
                <div
                  key={n.id}
                  className="flex items-start gap-2 p-2 rounded-lg hover:bg-secondary/30 transition-colors"
                >
                  <div className={`mt-0.5 p-1 rounded ${n.is_read ? 'bg-secondary/50' : 'bg-primary/10'}`}>
                    <Zap className={`w-3 h-3 ${n.is_read ? 'text-muted-foreground' : 'text-primary'}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-foreground line-clamp-2">{n.message}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      <Clock className="w-2.5 h-2.5 inline mr-0.5" />
                      {timeAgo(n.created_at)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* CSR Contact card */}
      {data.csrName && (
        <div className="bg-card border border-border/40 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
            <Headphones className="w-4 h-4 text-muted-foreground" />
            Your CSR
          </h3>
          <div className="flex items-center gap-4 text-sm">
            <span className="font-medium text-foreground">{data.csrName}</span>
            {data.csrEmail && (
              <a href={`mailto:${data.csrEmail}`} className="text-primary hover:underline text-xs">
                {data.csrEmail}
              </a>
            )}
            {data.csrPhone && (
              <span className="text-muted-foreground text-xs">{data.csrPhone}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
