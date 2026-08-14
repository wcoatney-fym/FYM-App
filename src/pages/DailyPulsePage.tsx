import { useEffect, useState, useCallback } from 'react';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import { useEffectiveAuth } from '@/hooks/useEffectiveAuth';
import { PulseKpiCards } from '@/components/daily-pulse/PulseKpiCards';
import { ResponseTable, type CheckinResponse } from '@/components/daily-pulse/ResponseTable';
import { RecipientManager } from '@/components/daily-pulse/RecipientManager';
import { RefreshCw, Calendar, Settings2, BarChart3, TrendingUp } from 'lucide-react';
import { PulseTrendChart } from '@/components/daily-pulse/PulseTrendChart';

type Tab = 'today' | 'trends' | 'recipients';

function getTodayEST(): string {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const y = parts.find((p) => p.type === 'year')!.value;
  const m = parts.find((p) => p.type === 'month')!.value;
  const d = parts.find((p) => p.type === 'day')!.value;
  return `${y}-${m}-${d}`;
}

function formatDateFriendly(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', {
    timeZone: 'America/New_York',
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

export function DailyPulsePage() {
  const { effectiveAgencyId, isOrgWide } = useEffectiveAuth();
  const [tab, setTab] = useState<Tab>('today');
  const [loading, setLoading] = useState(true);
  const [responses, setResponses] = useState<CheckinResponse[]>([]);
  const [recipients, setRecipients] = useState<any[]>([]);
  const [managers, setManagers] = useState<any[]>([]);
  const [selectedDate, setSelectedDate] = useState(getTodayEST());

  const fetchResponses = useCallback(async () => {
    setLoading(true);
    if (!supabase) { setLoading(false); return; }
    // Org-wide admins see all responses (left join); scoped users filter by agency (inner join)
    const joinType = !isOrgWide && effectiveAgencyId
      ? 'checkin_recipients!inner(first_name, last_name, phone, agency_id)'
      : 'checkin_recipients(first_name, last_name, phone, agency_id)';
    let query = (supabase as any)
      .from('checkin_responses')
      .select(`*, ${joinType}`)
      .eq('check_in_date', selectedDate)
      .order('conversation_state', { ascending: true });
    // Scope to manager's agency (non-org-wide users)
    if (!isOrgWide && effectiveAgencyId) {
      query = query.eq('checkin_recipients.agency_id', effectiveAgencyId);
    }
    const { data, error } = await query;

    if (!error && data) {
      setResponses(
        data.map((r: any) => ({
          id: r.id,
          check_in_date: r.check_in_date,
          is_working: r.is_working,
          has_four_plus_hours: r.has_four_plus_hours,
          app_goal: r.app_goal,
          conversation_state: r.conversation_state,
          nudge_sent: r.nudge_sent,
          responded_at: r.responded_at,
          recipient: {
            first_name: r.checkin_recipients.first_name,
            last_name: r.checkin_recipients.last_name,
            phone: r.checkin_recipients.phone,
          },
        }))
      );
    }
    setLoading(false);
  }, [selectedDate, isOrgWide, effectiveAgencyId]);

  const fetchRecipients = useCallback(async () => {
    if (!supabase) return;
    let query = (supabase as any)
      .from('checkin_recipients')
      .select('*')
      .order('last_name', { ascending: true });
    // Scope to manager's agency (non-org-wide users)
    if (!isOrgWide && effectiveAgencyId) {
      query = query.eq('agency_id', effectiveAgencyId);
    }
    const { data } = await query;
    if (data) setRecipients(data);
  }, [isOrgWide, effectiveAgencyId]);

  const fetchManagers = useCallback(async () => {
    if (!supabase) return;
    const { data } = await (supabase as any)
      .from('checkin_managers')
      .select('*')
      .order('name', { ascending: true });
    if (data) setManagers(data);
  }, []);

  useEffect(() => {
    fetchResponses();
  }, [fetchResponses]);

  useEffect(() => {
    fetchRecipients();
    fetchManagers();
  }, [fetchRecipients, fetchManagers]);

  const refreshAll = () => {
    fetchResponses();
    fetchRecipients();
    fetchManagers();
  };

  // Compute stats
  const stats = {
    total: responses.length,
    responded: responses.filter(
      (r) => r.conversation_state === 'complete' || r.conversation_state === 'declined'
    ).length,
    working: responses.filter((r) => r.is_working === true).length,
    notWorking: responses.filter((r) => r.is_working === false).length,
    noResponse: responses.filter(
      (r) => !['complete', 'declined'].includes(r.conversation_state)
    ).length,
    fourPlusHrs: responses.filter((r) => r.has_four_plus_hours === true).length,
    totalApps: responses.reduce((sum, r) => sum + (r.app_goal || 0), 0),
    responseRate:
      responses.length > 0
        ? Math.round(
            (responses.filter(
              (r) => r.conversation_state === 'complete' || r.conversation_state === 'declined'
            ).length /
              responses.length) *
              100
          )
        : 0,
  };

  const isToday = selectedDate === getTodayEST();

  return (
    <div className="space-y-6">
      <Header title="Daily Pulse" />

      {/* Tab bar + controls */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setTab('today')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-colors ${
              tab === 'today'
                ? 'bg-sky-500/20 text-sky-400 border border-sky-500/30'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5" /> Responses
          </button>
          <button
            onClick={() => setTab('trends')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-colors ${
              tab === 'trends'
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5" /> Trends
          </button>
          <button
            onClick={() => setTab('recipients')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-colors ${
              tab === 'recipients'
                ? 'bg-violet-500/20 text-violet-400 border border-violet-500/30'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Settings2 className="w-3.5 h-3.5" /> Recipients
          </button>
        </div>
        <div className="flex items-center gap-2">
          {(tab === 'today') && (
            <>
              <div className="flex items-center gap-1.5 text-xs text-zinc-400">
                <Calendar className="w-3.5 h-3.5" />
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="bg-zinc-800/50 border border-zinc-700 rounded px-2 py-1 text-zinc-300 text-xs"
                />
              </div>
              {!isToday && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs border-zinc-700 text-zinc-300"
                  onClick={() => setSelectedDate(getTodayEST())}
                >
                  Today
                </Button>
              )}
            </>
          )}
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs border-zinc-700 text-zinc-300"
            onClick={refreshAll}
          >
            <RefreshCw className="w-3 h-3 mr-1" /> Refresh
          </Button>
        </div>
      </div>

      {/* Date label */}
      {tab === 'today' && (
        <div className="text-sm text-zinc-400">
          {isToday ? "Today's Check-In" : formatDateFriendly(selectedDate)}
        </div>
      )}

      {/* Content */}
      {tab === 'today' && (
        <div className="space-y-6">
          <PulseKpiCards stats={stats} loading={loading} />
          <ResponseTable responses={responses} loading={loading} />
        </div>
      )}

      {tab === 'trends' && (
        <PulseTrendChart agencyId={!isOrgWide && effectiveAgencyId ? effectiveAgencyId : undefined} />
      )}

      {tab === 'recipients' && (
        <RecipientManager
          recipients={recipients}
          managers={managers}
          onRefresh={refreshAll}
        />
      )}
    </div>
  );
}
