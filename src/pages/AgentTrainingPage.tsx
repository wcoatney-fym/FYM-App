/**
 * Agent Training Page — agent-facing training hub
 *
 * Reads from portal DB (akhojh…):
 *   - `agent_training_content` — content library (docs, videos, quizzes)
 *   - `agent_training_events` — agent engagement events (reads own, writes new)
 *   - `agent_live_sessions` — scheduled live training sessions
 *   - `agent_live_attendance` — join click records
 *
 * Records engagement events back to the portal DB so the admin-side
 * Contracting Training tab can track who clicked what, watched what,
 * and attended live trainings.
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { Header } from '@/components/layout/Header';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { StaggerContainer, StaggerItem } from '@/components/ui/animated';
import { HudFrame } from '@/components/ui/hud-frame';
import { portalSupabase } from '@/lib/portal-supabase';
import { useEffectiveAuth } from '@/hooks/useEffectiveAuth';
import {
  GraduationCap,
  BookOpen,
  Video,
  FileText,
  Play,
  Calendar,
  Clock,
  Award,
  CheckCircle2,
  ExternalLink,
  AlertCircle,
  RefreshCw,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import type {
  PortalTrainingContent,
  PortalTrainingEvent,
  PortalLiveSession,
} from '@/lib/contracting/types';

// ─── Types ───────────────────────────────────────────────────────────────────

interface AgentProgress {
  totalContent: number;
  viewedContent: number;
  quizzesAvailable: number;
  quizzesCompleted: number;
  bestScores: Map<string, number>; // content_id → best score %
  viewedIds: Set<string>;
  liveSessionsAttended: number;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const CONTENT_TYPE_ICONS: Record<string, typeof BookOpen> = {
  document: FileText,
  video: Video,
};

const CATEGORY_COLORS: Record<string, string> = {
  'Products & Benefits': 'bg-blue-500/10 text-blue-300 border-blue-500/20',
  'Prescription & Claims': 'bg-green-500/10 text-green-300 border-green-500/20',
  'Applications & Forms': 'bg-purple-500/10 text-purple-300 border-purple-500/20',
  'Training Videos': 'bg-amber-500/10 text-amber-300 border-amber-500/20',
};

// ─── Component ───────────────────────────────────────────────────────────────

export function AgentTrainingPage() {
  const { user } = useEffectiveAuth();
  const agentId = user?.id ?? null;


  // Data state
  const [content, setContent] = useState<PortalTrainingContent[]>([]);
  const [events, setEvents] = useState<PortalTrainingEvent[]>([]);
  const [sessions, setSessions] = useState<PortalLiveSession[]>([]);
  const [attendedSessionIds, setAttendedSessionIds] = useState<Set<string>>(new Set());

  // UI state
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [recordingEvent, setRecordingEvent] = useState<string | null>(null);

  // ─── Data fetch ──────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    if (!portalSupabase) {
      setError('Training hub not configured');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const [contentRes, eventsRes, sessionsRes, attendanceRes] = await Promise.all([
        portalSupabase
          .from('agent_training_content')
          .select('*')
          .eq('is_active', true)
          .order('display_order', { ascending: true }),
        portalSupabase
          .from('agent_training_events')
          .select('*')
          .eq('agent_id', agentId ?? '')
          .order('created_at', { ascending: false }),
        portalSupabase
          .from('agent_live_sessions')
          .select('*')
          .eq('is_active', true)
          .order('session_datetime', { ascending: true }),
        portalSupabase
          .from('agent_live_attendance')
          .select('session_id')
          .eq('agent_id', agentId ?? ''),
      ]);

      if (contentRes.error) throw contentRes.error;
      if (eventsRes.error) throw eventsRes.error;
      if (sessionsRes.error) throw sessionsRes.error;
      if (attendanceRes.error) throw attendanceRes.error;

      setContent(contentRes.data ?? []);
      setEvents(eventsRes.data ?? []);
      setSessions(sessionsRes.data ?? []);
      setAttendedSessionIds(new Set((attendanceRes.data ?? []).map((a: { session_id: string }) => a.session_id)));
    } catch (err) {
      console.error('[AgentTraining] load error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load training data');
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ─── Progress computation ──────────────────────────────────────────────

  const progress: AgentProgress = useMemo(() => {
    const viewedIds = new Set<string>();
    const bestScores = new Map<string, number>();

    for (const e of events) {
      if (e.content_id && (e.event_type === 'video_view' || e.event_type === 'document_view')) {
        viewedIds.add(e.content_id);
      }
      if (e.content_id && e.event_type === 'quiz_attempt' && e.quiz_score != null && e.quiz_max_score != null && e.quiz_max_score > 0) {
        const pct = Math.round((e.quiz_score / e.quiz_max_score) * 100);
        const existing = bestScores.get(e.content_id) ?? 0;
        if (pct > existing) bestScores.set(e.content_id, pct);
      }
    }

    return {
      totalContent: content.length,
      viewedContent: viewedIds.size,
      quizzesAvailable: content.filter(c => c.has_quiz).length,
      quizzesCompleted: bestScores.size,
      bestScores,
      viewedIds,
      liveSessionsAttended: attendedSessionIds.size,
    };
  }, [content, events, attendedSessionIds]);

  // ─── Event recording ──────────────────────────────────────────────────

  const recordContentView = useCallback(async (item: PortalTrainingContent) => {
    if (!portalSupabase || !agentId) return;
    setRecordingEvent(item.id);
    try {
      const eventType = item.content_type === 'video' ? 'video_view' : 'document_view';
      await portalSupabase.from('agent_training_events').insert({
        agent_id: agentId,
        event_type: eventType,
        content_id: item.id,
        content_title: item.title,
      });
      // Refresh events
      const { data } = await portalSupabase
        .from('agent_training_events')
        .select('*')
        .eq('agent_id', agentId)
        .order('created_at', { ascending: false });
      if (data) setEvents(data);
    } catch (err) {
      console.error('[AgentTraining] record event error:', err);
    } finally {
      setRecordingEvent(null);
    }
  }, [agentId]);

  const recordLiveClick = useCallback(async (session: PortalLiveSession) => {
    if (!portalSupabase || !agentId) return;
    try {
      // Record attendance
      await portalSupabase.from('agent_live_attendance').insert({
        agent_id: agentId,
        session_id: session.id,
        clicked_join_at: new Date().toISOString(),
      });
      // Record as training event too
      await portalSupabase.from('agent_training_events').insert({
        agent_id: agentId,
        event_type: 'live_training_click',
        content_title: session.title,
      });
      setAttendedSessionIds(prev => new Set([...prev, session.id]));
    } catch (err) {
      console.error('[AgentTraining] record live click error:', err);
    }
  }, [agentId]);

  // ─── Content grouped by category ───────────────────────────────────────

  const categories = useMemo(() => {
    const catMap = new Map<string, PortalTrainingContent[]>();
    for (const c of content) {
      const cat = c.category ?? 'General';
      if (!catMap.has(cat)) catMap.set(cat, []);
      catMap.get(cat)!.push(c);
    }
    return Array.from(catMap.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [content]);

  // Upcoming sessions — next 5 future events only
  const upcomingSessions = useMemo(() => {
    const now = new Date();
    return sessions
      .filter(s => new Date(s.session_datetime) >= now)
      .slice(0, 5);
  }, [sessions]);

  // ─── Render ────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <>
        <Header title="Training" />
        <div className="p-6 max-w-screen-xl mx-auto space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => <div key={i} className="h-24 rounded-xl shimmer" />)}
          </div>
          <div className="space-y-3">
            {[1, 2, 3].map(i => <div key={i} className="h-20 rounded-xl shimmer" />)}
          </div>
        </div>
      </>
    );
  }

  if (error) {
    return (
      <>
        <Header title="Training" />
        <div className="p-6 max-w-screen-xl mx-auto">
          <Card className="border-red-500/20">
            <CardContent className="p-8 text-center space-y-3">
              <AlertCircle className="w-7 h-7 text-red-500 mx-auto" />
              <h3 className="text-lg font-semibold text-foreground">Connection Error</h3>
              <p className="text-sm text-muted-foreground">{error}</p>
              <button
                onClick={loadData}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-primary text-white text-sm font-medium hover:bg-primary/80 transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Retry
              </button>
            </CardContent>
          </Card>
        </div>
      </>
    );
  }

  const completionPct = progress.totalContent > 0
    ? Math.round((progress.viewedContent / progress.totalContent) * 100)
    : 0;

  return (
    <>
      <Header title="Training" />
      <div className="p-6 max-w-screen-xl mx-auto space-y-6">
        {/* ── Progress Overview ─────────────────────────────────────── */}
        <StaggerContainer className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StaggerItem>
            <HudFrame accentColor="hsl(199 89% 48% / 0.5)">
              <Card className="border-border">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-cyan-500/10 ring-1 ring-cyan-500/20">
                      <BookOpen className="w-4 h-4 text-cyan-400" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-foreground">
                        {progress.viewedContent}/{progress.totalContent}
                      </p>
                      <p className="text-xs text-muted-foreground">Content Viewed</p>
                    </div>
                  </div>
                  {/* Progress bar */}
                  <div className="mt-3 h-1.5 bg-secondary rounded-full overflow-hidden">
                    <div
                      className="h-full bg-cyan-500 rounded-full transition-all duration-500"
                      style={{ width: `${completionPct}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1">{completionPct}% complete</p>
                </CardContent>
              </Card>
            </HudFrame>
          </StaggerItem>
          <StaggerItem>
            <HudFrame accentColor="hsl(142 71% 45% / 0.5)">
              <Card className="border-border">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-emerald-500/10 ring-1 ring-emerald-500/20">
                      <Award className="w-4 h-4 text-emerald-400" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-foreground">
                        {progress.quizzesCompleted}/{progress.quizzesAvailable}
                      </p>
                      <p className="text-xs text-muted-foreground">Quizzes Done</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </HudFrame>
          </StaggerItem>
          <StaggerItem>
            <HudFrame accentColor="hsl(271 91% 65% / 0.5)">
              <Card className="border-border">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-purple-500/10 ring-1 ring-purple-500/20">
                      <Calendar className="w-4 h-4 text-purple-400" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-foreground">
                        {progress.liveSessionsAttended}
                      </p>
                      <p className="text-xs text-muted-foreground">Live Sessions</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </HudFrame>
          </StaggerItem>
          <StaggerItem>
            <HudFrame accentColor="hsl(38 92% 50% / 0.5)">
              <Card className="border-border">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-amber-500/10 ring-1 ring-amber-500/20">
                      <GraduationCap className="w-4 h-4 text-amber-400" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-foreground">
                        {events.length}
                      </p>
                      <p className="text-xs text-muted-foreground">Total Activities</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </HudFrame>
          </StaggerItem>
        </StaggerContainer>

        {/* ── Two-column layout ──────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Content Library (2 cols) */}
          <div className="lg:col-span-2 space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <BookOpen className="w-4 h-4" /> Training Content
            </h3>

            {categories.length === 0 ? (
              <Card className="border-border">
                <CardContent className="p-8 text-center text-sm text-muted-foreground">
                  No training content available yet.
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {categories.map(([category, items]) => {
                  const isExpanded = expandedCategory === category || expandedCategory === null;
                  const categoryColor = CATEGORY_COLORS[category] ?? 'bg-secondary/40 text-foreground/80 border-border';
                  const viewedInCat = items.filter(i => progress.viewedIds.has(i.id)).length;

                  return (
                    <Card key={category} className="border-border overflow-hidden">
                      <button
                        onClick={() => setExpandedCategory(expandedCategory === category ? null : category)}
                        className="w-full flex items-center justify-between px-4 py-3 hover:bg-background transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <Badge className={`text-xs border ${categoryColor}`}>
                            {category}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {viewedInCat}/{items.length} viewed
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          {viewedInCat === items.length && items.length > 0 && (
                            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                          )}
                          {isExpanded ? (
                            <ChevronUp className="w-4 h-4 text-muted-foreground" />
                          ) : (
                            <ChevronDown className="w-4 h-4 text-muted-foreground" />
                          )}
                        </div>
                      </button>

                      {isExpanded && (
                        <div className="border-t border-border/50">
                          {items.map(item => {
                            const Icon = CONTENT_TYPE_ICONS[item.content_type] || FileText;
                            const viewed = progress.viewedIds.has(item.id);
                            const bestScore = progress.bestScores.get(item.id);
                            const isRecording = recordingEvent === item.id;

                            return (
                              <div
                                key={item.id}
                                className={`flex items-center gap-3 px-4 py-3 border-b border-border/30 last:border-b-0 transition-colors ${
                                  viewed ? 'bg-emerald-500/5' : 'hover:bg-background'
                                }`}
                              >
                                <div className={`p-1.5 rounded ${viewed ? 'bg-emerald-500/10' : 'bg-secondary/40'}`}>
                                  {viewed ? (
                                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                                  ) : (
                                    <Icon className="w-4 h-4 text-muted-foreground" />
                                  )}
                                </div>

                                <div className="flex-1 min-w-0">
                                  <p className={`text-sm font-medium truncate ${viewed ? 'text-foreground/70' : 'text-foreground'}`}>
                                    {item.title}
                                  </p>
                                  <div className="flex items-center gap-2 mt-0.5">
                                    <span className="text-[10px] text-muted-foreground capitalize">
                                      {item.content_format || item.content_type}
                                    </span>
                                    {item.carrier && (
                                      <span className="text-[10px] text-muted-foreground">
                                        · {item.carrier}
                                      </span>
                                    )}
                                    {item.has_quiz && (
                                      <span className="text-[10px] text-amber-400 flex items-center gap-0.5">
                                        <Award className="w-2.5 h-2.5" />
                                        {bestScore != null ? `${bestScore}%` : 'Quiz'}
                                      </span>
                                    )}
                                  </div>
                                </div>

                                {item.content_url && (
                                  <a
                                    href={item.content_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={() => {
                                      recordContentView(item);
                                    }}
                                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all shrink-0 ${
                                      isRecording
                                        ? 'bg-secondary text-muted-foreground cursor-wait'
                                        : viewed
                                          ? 'bg-secondary/40 text-muted-foreground hover:bg-secondary hover:text-foreground'
                                          : 'bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20'
                                    }`}
                                  >
                                    {item.content_type === 'video' ? (
                                      <><Play className="w-3 h-3" /> {viewed ? 'Rewatch' : 'Watch'}</>
                                    ) : (
                                      <><ExternalLink className="w-3 h-3" /> {viewed ? 'Review' : 'View'}</>
                                    )}
                                  </a>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </Card>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right: Sidebar — Live Sessions + Recent Activity */}
          <div className="space-y-6">
            {/* Upcoming Live Sessions */}
            <div className="space-y-3">
              <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <Calendar className="w-4 h-4" /> Upcoming Live Sessions
              </h3>
              {upcomingSessions.length === 0 ? (
                <Card className="border-border">
                  <CardContent className="p-4 text-center text-sm text-muted-foreground">
                    No upcoming sessions scheduled.
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-2">
                  {upcomingSessions.map(session => {
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
                    const attended = attendedSessionIds.has(session.id);

                    return (
                      <Card key={session.id} className="border-border">
                        <CardContent className="p-3">
                          <div className="flex items-center justify-between">
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-foreground truncate">
                                {session.title}
                              </p>
                              <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {dateStr} · {timeStr} CT
                              </p>
                            </div>
                            <a
                              href={session.join_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={() => recordLiveClick(session)}
                              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all shrink-0 ${
                                attended
                                  ? 'bg-emerald-500/10 text-emerald-400'
                                  : 'bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20'
                              }`}
                            >
                              <Play className="w-3 h-3" />
                              {attended ? 'Joined' : 'Join'}
                            </a>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Recent Activity (agent's own) */}
            <div className="space-y-3">
              <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <GraduationCap className="w-4 h-4" /> Your Recent Activity
              </h3>
              {events.length === 0 ? (
                <Card className="border-border">
                  <CardContent className="p-4 text-center text-sm text-muted-foreground">
                    No activity yet. Start by watching a video or reading a document!
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-1.5">
                  {events.slice(0, 8).map(event => {
                    const typeInfo: Record<string, { label: string; icon: typeof Play; }> = {
                      video_view: { label: 'Watched', icon: Video },
                      document_view: { label: 'Read', icon: FileText },
                      quiz_attempt: { label: 'Quiz', icon: Award },
                      live_training_click: { label: 'Joined', icon: Calendar },
                    };
                    const info = typeInfo[event.event_type] || { label: event.event_type, icon: GraduationCap };
                    const EventIcon = info.icon;
                    const timeAgoStr = getTimeAgo(event.created_at);

                    return (
                      <div
                        key={event.id}
                        className="flex items-center gap-2 px-3 py-2 bg-card border border-border/50 rounded-lg"
                      >
                        <EventIcon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        <div className="flex-1 min-w-0">
                          <span className="text-xs text-muted-foreground font-medium">{info.label}</span>
                          {event.content_title && (
                            <span className="text-xs text-muted-foreground ml-1 truncate">
                              — {event.content_title}
                            </span>
                          )}
                          {event.quiz_score != null && event.quiz_max_score != null && (
                            <span className="text-xs text-amber-400 ml-1">
                              ({event.quiz_score}/{event.quiz_max_score})
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-muted-foreground whitespace-nowrap shrink-0">
                          {timeAgoStr}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getTimeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'America/Chicago',
  });
}
