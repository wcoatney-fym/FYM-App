/**
 * Contracting Training Tab — Stage 4 (live)
 *
 * Reads from portal DB (akhojh…) via portal-supabase.ts:
 *   - `agent_training_content` — content library (docs, videos, quizzes)
 *   - `agent_training_events` — agent engagement events
 *   - `agent_live_sessions` — scheduled live training sessions
 *   - `agent_live_attendance` — join click records
 *   - `agent_hub_logins` — agent hub login tracking
 *
 * Layout follows FYM App design language (slate/[#1e3a5f] palette).
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  GraduationCap,
  BookOpen,
  Video,
  FileText,
  Clock,
  Users,
  TrendingUp,
  RefreshCw,
  AlertCircle,
  Calendar,
  Play,
  Award,
  BarChart3,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Eye,
  MousePointerClick,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { portalSupabase } from '@/lib/portal-supabase';
import { timeAgo } from '@/lib/contracting/helpers';
import type {
  PortalTrainingContent,
  PortalTrainingEvent,
  PortalLiveSession,
  PortalLiveAttendance,
  PortalHubLogin,
} from '@/lib/contracting/types';

// ─── Types ───────────────────────────────────────────────────────────────────

interface TrainingStats {
  totalContent: number;
  activeContent: number;
  withQuizzes: number;
  totalEvents: number;
  uniqueAgents: number;
  videoViews: number;
  quizAttempts: number;
  liveClicks: number;
}

interface ContentWithStats extends PortalTrainingContent {
  view_count: number;
  quiz_attempt_count: number;
  avg_score: number | null;
}

interface UpcomingSession extends PortalLiveSession {
  attendance_count: number;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const CONTENT_TYPE_ICONS: Record<string, typeof BookOpen> = {
  document: FileText,
  video: Video,
};

const CATEGORY_COLORS: Record<string, string> = {
  'Products & Benefits': 'bg-blue-100 text-blue-800',
  'Prescription & Claims': 'bg-green-100 text-green-800',
  'Applications & Forms': 'bg-purple-100 text-purple-800',
  'Training Videos': 'bg-amber-100 text-amber-800',
};

// ─── Component ───────────────────────────────────────────────────────────────

export function ContractingTrainingTab() {
  // Data state
  const [content, setContent] = useState<PortalTrainingContent[]>([]);
  const [events, setEvents] = useState<PortalTrainingEvent[]>([]);
  const [sessions, setSessions] = useState<PortalLiveSession[]>([]);
  const [attendance, setAttendance] = useState<PortalLiveAttendance[]>([]);
  const [hubLogins, setHubLogins] = useState<PortalHubLogin[]>([]);

  // UI state
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [contentFilter, setContentFilter] = useState<string>('all');
  const [showAllSessions, setShowAllSessions] = useState(false);
  const [expandedContent, setExpandedContent] = useState<string | null>(null);

  // ─── Data fetch ──────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    if (!portalSupabase) {
      setError('Portal connection not configured');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const [contentRes, eventsRes, sessionsRes, attendanceRes, loginsRes] =
        await Promise.all([
          portalSupabase
            .from('agent_training_content')
            .select('*')
            .order('display_order', { ascending: true }),
          portalSupabase
            .from('agent_training_events')
            .select('*')
            .order('created_at', { ascending: false }),
          portalSupabase
            .from('agent_live_sessions')
            .select('*')
            .eq('is_active', true)
            .order('session_datetime', { ascending: true }),
          portalSupabase
            .from('agent_live_attendance')
            .select('*'),
          portalSupabase
            .from('agent_hub_logins')
            .select('*')
            .order('logged_in_at', { ascending: false }),
        ]);

      if (contentRes.error) throw contentRes.error;
      if (eventsRes.error) throw eventsRes.error;
      if (sessionsRes.error) throw sessionsRes.error;
      if (attendanceRes.error) throw attendanceRes.error;
      if (loginsRes.error) throw loginsRes.error;

      setContent(contentRes.data ?? []);
      setEvents(eventsRes.data ?? []);
      setSessions(sessionsRes.data ?? []);
      setAttendance(attendanceRes.data ?? []);
      setHubLogins(loginsRes.data ?? []);
    } catch (err) {
      console.error('[Training] load error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load training data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ─── Computed stats ────────────────────────────────────────────────────

  const stats: TrainingStats = useMemo(() => {
    const uniqueAgentIds = new Set(events.map((e) => e.agent_id));
    return {
      totalContent: content.length,
      activeContent: content.filter((c) => c.is_active).length,
      withQuizzes: content.filter((c) => c.has_quiz).length,
      totalEvents: events.length,
      uniqueAgents: uniqueAgentIds.size,
      videoViews: events.filter((e) => e.event_type === 'video_view').length,
      quizAttempts: events.filter((e) => e.event_type === 'quiz_attempt').length,
      liveClicks: events.filter((e) => e.event_type === 'live_training_click').length,
    };
  }, [content, events]);

  const contentWithStats: ContentWithStats[] = useMemo(() => {
    return content.map((c) => {
      const contentEvents = events.filter((e) => e.content_id === c.id);
      const views = contentEvents.filter(
        (e) => e.event_type === 'video_view' || e.event_type === 'document_view'
      );
      const quizzes = contentEvents.filter((e) => e.event_type === 'quiz_attempt');
      const scores = quizzes
        .filter((e) => e.quiz_score !== null && e.quiz_max_score !== null && e.quiz_max_score > 0)
        .map((e) => ((e.quiz_score ?? 0) / (e.quiz_max_score ?? 1)) * 100);

      return {
        ...c,
        view_count: views.length,
        quiz_attempt_count: quizzes.length,
        avg_score: scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : null,
      };
    });
  }, [content, events]);

  const filteredContent = useMemo(() => {
    if (contentFilter === 'all') return contentWithStats;
    return contentWithStats.filter((c) => c.category === contentFilter);
  }, [contentWithStats, contentFilter]);

  const categories = useMemo(() => {
    const cats = new Set(
      content.map((c) => c.category).filter((c): c is string => c !== null && c !== '')
    );
    return ['all', ...Array.from(cats).sort()];
  }, [content]);

  const upcomingSessions: UpcomingSession[] = useMemo(() => {
    const now = new Date();
    return sessions
      .filter((s) => new Date(s.session_datetime) >= now)
      .slice(0, showAllSessions ? undefined : 5)
      .map((s) => ({
        ...s,
        attendance_count: attendance.filter((a) => a.session_id === s.id).length,
      }));
  }, [sessions, attendance, showAllSessions]);

  const pastSessions = useMemo(() => {
    const now = new Date();
    return sessions.filter((s) => new Date(s.session_datetime) < now);
  }, [sessions]);

  const recentEvents = useMemo(() => events.slice(0, 10), [events]);

  // ─── Render ────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <RefreshCw className="w-5 h-5 animate-spin text-muted-foreground/70 mr-2" />
        <span className="text-sm text-muted-foreground">Loading training data…</span>
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border-red-500/20 bg-red-500/10">
        <CardContent className="p-6 text-center space-y-2">
          <AlertCircle className="w-6 h-6 text-red-500 mx-auto" />
          <p className="text-sm text-red-700">{error}</p>
          <button
            onClick={loadData}
            className="text-sm text-red-400 hover:text-red-800 underline"
          >
            Try again
          </button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── KPI Cards ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard
          icon={BookOpen}
          label="Content Items"
          value={stats.activeContent}
          sublabel={`${stats.withQuizzes} with quizzes`}
          color="blue"
        />
        <KpiCard
          icon={Users}
          label="Agents Engaged"
          value={stats.uniqueAgents}
          sublabel={`${stats.totalEvents} total events`}
          color="green"
        />
        <KpiCard
          icon={Eye}
          label="Content Views"
          value={stats.videoViews}
          sublabel={`${stats.liveClicks} live clicks`}
          color="purple"
        />
        <KpiCard
          icon={Award}
          label="Quiz Attempts"
          value={stats.quizAttempts}
          sublabel={hubLogins.length > 0 ? `${hubLogins.length} hub logins` : 'No hub logins yet'}
          color="amber"
        />
      </div>

      {/* ── Two-column layout ─────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Content Library (2 cols) */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <GraduationCap className="w-4 h-4" /> Content Library
            </h3>
            <div className="flex items-center gap-2">
              {/* Category filter */}
              <select
                value={contentFilter}
                onChange={(e) => setContentFilter(e.target.value)}
                className="text-xs border border-border rounded-lg px-2 py-1.5 bg-card text-foreground/80 focus:ring-2 focus:ring-blue-400"
              >
                {categories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat === 'all' ? 'All Categories' : cat}
                  </option>
                ))}
              </select>
              <button
                onClick={loadData}
                className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground/70 hover:text-muted-foreground transition-colors"
                title="Refresh"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {filteredContent.length === 0 ? (
            <Card className="border-border">
              <CardContent className="p-6 text-center text-sm text-muted-foreground">
                No content found
                {contentFilter !== 'all' ? ` in "${contentFilter}"` : ''}.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {filteredContent.map((item) => (
                <ContentRow
                  key={item.id}
                  item={item}
                  expanded={expandedContent === item.id}
                  onToggle={() =>
                    setExpandedContent(expandedContent === item.id ? null : item.id)
                  }
                />
              ))}
            </div>
          )}
        </div>

        {/* Right: Sidebar (1 col) */}
        <div className="space-y-6">
          {/* Upcoming Live Sessions */}
          <div className="space-y-3">
            <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <Calendar className="w-4 h-4" /> Upcoming Sessions
            </h3>
            {upcomingSessions.length === 0 ? (
              <Card className="border-border">
                <CardContent className="p-4 text-center text-sm text-muted-foreground">
                  No upcoming sessions scheduled.
                </CardContent>
              </Card>
            ) : (
              <>
                <div className="space-y-2">
                  {upcomingSessions.map((session) => (
                    <SessionCard key={session.id} session={session} />
                  ))}
                </div>
                {sessions.filter((s) => new Date(s.session_datetime) >= new Date()).length > 5 && (
                  <button
                    onClick={() => setShowAllSessions(!showAllSessions)}
                    className="w-full text-xs text-cyan-400 hover:text-blue-800 flex items-center justify-center gap-1 py-1"
                  >
                    {showAllSessions ? (
                      <>Show less <ChevronUp className="w-3 h-3" /></>
                    ) : (
                      <>
                        Show all{' '}
                        {sessions.filter((s) => new Date(s.session_datetime) >= new Date()).length}{' '}
                        sessions <ChevronDown className="w-3 h-3" />
                      </>
                    )}
                  </button>
                )}
              </>
            )}

            {/* Past sessions summary */}
            {pastSessions.length > 0 && (
              <div className="text-xs text-muted-foreground/70 px-1">
                {pastSessions.length} past session{pastSessions.length !== 1 ? 's' : ''}
                {' · '}
                {attendance.length} total join click{attendance.length !== 1 ? 's' : ''}
              </div>
            )}
          </div>

          {/* Recent Activity */}
          <div className="space-y-3">
            <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <TrendingUp className="w-4 h-4" /> Recent Activity
            </h3>
            {recentEvents.length === 0 ? (
              <Card className="border-border">
                <CardContent className="p-4 text-center text-sm text-muted-foreground">
                  No training activity recorded yet.
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-1.5">
                {recentEvents.map((event) => (
                  <EventRow key={event.id} event={event} />
                ))}
              </div>
            )}
          </div>

          {/* Hub Logins */}
          {hubLogins.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <MousePointerClick className="w-4 h-4" /> Recent Hub Logins
              </h3>
              <div className="space-y-1.5">
                {hubLogins.slice(0, 5).map((login) => (
                  <div
                    key={login.id}
                    className="flex items-center justify-between px-3 py-2 bg-card border border-border/50 rounded-lg text-xs"
                  >
                    <span className="text-muted-foreground font-medium truncate">
                      {login.login_method}
                    </span>
                    <span className="text-muted-foreground/70 whitespace-nowrap ml-2">
                      {timeAgo(login.logged_in_at)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────

function KpiCard({
  icon: Icon,
  label,
  value,
  sublabel,
  color,
}: {
  icon: typeof BookOpen;
  label: string;
  value: number;
  sublabel: string;
  color: 'blue' | 'green' | 'purple' | 'amber';
}) {
  const colorMap = {
    blue: { bg: 'bg-cyan-500/10', icon: 'text-cyan-400', ring: 'ring-blue-100' },
    green: { bg: 'bg-emerald-50', icon: 'text-emerald-600', ring: 'ring-emerald-100' },
    purple: { bg: 'bg-purple-50', icon: 'text-purple-600', ring: 'ring-purple-100' },
    amber: { bg: 'bg-amber-50', icon: 'text-amber-600', ring: 'ring-amber-100' },
  };
  const c = colorMap[color];

  return (
    <Card className="border-border">
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${c.bg} ring-1 ${c.ring}`}>
            <Icon className={`w-4 h-4 ${c.icon}`} />
          </div>
          <div className="min-w-0">
            <p className="text-2xl font-bold text-foreground">{value}</p>
            <p className="text-xs text-muted-foreground font-medium">{label}</p>
          </div>
        </div>
        <p className="text-xs text-muted-foreground/70 mt-2">{sublabel}</p>
      </CardContent>
    </Card>
  );
}

function ContentRow({
  item,
  expanded,
  onToggle,
}: {
  item: ContentWithStats;
  expanded: boolean;
  onToggle: () => void;
}) {
  const Icon = CONTENT_TYPE_ICONS[item.content_type] || FileText;
  const categoryColor = CATEGORY_COLORS[item.category ?? ''] ?? 'bg-slate-100 text-foreground/80';

  return (
    <Card className={`border-border transition-colors ${!item.is_active ? 'opacity-60' : ''}`}>
      <CardContent className="p-0">
        <button
          onClick={onToggle}
          className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-background transition-colors"
        >
          <div className="p-1.5 rounded bg-slate-100">
            <Icon className="w-4 h-4 text-muted-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-foreground truncate">
                {item.title}
              </span>
              {!item.is_active && (
                <span className="text-[10px] bg-slate-200 text-muted-foreground px-1.5 py-0.5 rounded font-medium">
                  INACTIVE
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              {item.category && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${categoryColor}`}>
                  {item.category}
                </span>
              )}
              {item.carrier && (
                <span className="text-[10px] text-muted-foreground/70">{item.carrier}</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-4 text-xs text-muted-foreground/70 shrink-0">
            {item.view_count > 0 && (
              <span className="flex items-center gap-1">
                <Eye className="w-3 h-3" /> {item.view_count}
              </span>
            )}
            {item.has_quiz && (
              <span className="flex items-center gap-1">
                <Award className="w-3 h-3" />
                {item.quiz_attempt_count > 0
                  ? `${item.quiz_attempt_count} attempt${item.quiz_attempt_count !== 1 ? 's' : ''}`
                  : 'Quiz'}
              </span>
            )}
            {expanded ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
          </div>
        </button>

        {expanded && (
          <div className="px-4 pb-3 border-t border-border/50">
            <div className="pt-3 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              <div>
                <span className="text-muted-foreground/70 block">Type</span>
                <span className="text-foreground/80 font-medium capitalize">
                  {item.content_format || item.content_type}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground/70 block">Views</span>
                <span className="text-foreground/80 font-medium">{item.view_count}</span>
              </div>
              {item.has_quiz && (
                <>
                  <div>
                    <span className="text-muted-foreground/70 block">Quiz Attempts</span>
                    <span className="text-foreground/80 font-medium">
                      {item.quiz_attempt_count}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground/70 block">Avg Score</span>
                    <span className="text-foreground/80 font-medium">
                      {item.avg_score !== null ? `${item.avg_score.toFixed(0)}%` : '—'}
                    </span>
                  </div>
                </>
              )}
              {!item.has_quiz && (
                <div>
                  <span className="text-muted-foreground/70 block">Quiz</span>
                  <span className="text-muted-foreground">None</span>
                </div>
              )}
            </div>
            {item.description && (
              <p className="text-xs text-muted-foreground mt-2">{item.description}</p>
            )}
            {item.content_url && (
              <a
                href={item.content_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-cyan-400 hover:text-blue-800 mt-2"
              >
                Open content <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SessionCard({ session }: { session: UpcomingSession }) {
  const dt = new Date(session.session_datetime);
  const dateStr = dt.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'America/Chicago',
  });
  const timeStr = dt.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/Chicago',
  });

  return (
    <Card className="border-border">
      <CardContent className="p-3">
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground truncate">
              {session.title}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {dateStr} · {timeStr} CT
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {session.attendance_count > 0 && (
              <span className="text-xs text-muted-foreground/70 flex items-center gap-1">
                <Users className="w-3 h-3" /> {session.attendance_count}
              </span>
            )}
            <a
              href={session.join_url}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1.5 rounded-lg bg-cyan-500/10 hover:bg-blue-100 text-cyan-400 transition-colors"
              title="Join session"
            >
              <Play className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function EventRow({ event }: { event: PortalTrainingEvent }) {
  const typeLabels: Record<string, { label: string; icon: typeof Eye }> = {
    video_view: { label: 'Watched', icon: Play },
    document_view: { label: 'Viewed', icon: FileText },
    quiz_attempt: { label: 'Quiz', icon: Award },
    live_training_click: { label: 'Joined live', icon: Calendar },
    tyler_schedule_click: { label: 'Tyler schedule', icon: Clock },
  };

  const info = typeLabels[event.event_type] || { label: event.event_type, icon: BarChart3 };
  const Icon = info.icon;

  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-card border border-border/50 rounded-lg">
      <Icon className="w-3.5 h-3.5 text-muted-foreground/70 shrink-0" />
      <div className="flex-1 min-w-0">
        <span className="text-xs text-muted-foreground font-medium">{info.label}</span>
        {event.content_title && (
          <span className="text-xs text-muted-foreground/70 ml-1 truncate">
            — {event.content_title}
          </span>
        )}
        {event.quiz_score !== null && event.quiz_max_score !== null && (
          <span className="text-xs text-muted-foreground ml-1">
            ({event.quiz_score}/{event.quiz_max_score})
          </span>
        )}
      </div>
      <span className="text-[10px] text-muted-foreground/70 whitespace-nowrap shrink-0">
        {timeAgo(event.created_at)}
      </span>
    </div>
  );
}
