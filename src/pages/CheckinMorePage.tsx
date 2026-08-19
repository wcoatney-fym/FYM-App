// CheckinMorePage: Hyper-mobile-friendly check-in breakdown page
// Public route — no login required. Authenticated via signed expiring token in URL.
// Optimized for a manager glancing at their phone from a text message.

import { useEffect, useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';

// --- Types ---

interface AgentRow {
  id: string;
  first_name: string;
  last_name: string;
  conversation_state: string;
  is_working: boolean | null;
  has_four_plus_hours: boolean | null;
  app_goal: number | null;
  responded_at: string | null;
  nudge_sent: boolean;
}

interface Stats {
  total: number;
  working: number;
  notWorking: number;
  midSurvey: number;
  noResponse: number;
  responded: number;
  fourPlusHrs: number;
  totalApps: number;
  responseRate: number;
}

interface MoreData {
  date: string;
  stats: Stats;
  agents: AgentRow[];
}

type Filter = 'all' | 'working' | 'not-working' | 'in-progress' | 'no-response';

// --- Helpers ---

function friendlyDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function statusInfo(state: string): { label: string; color: string; bg: string; emoji: string } {
  switch (state) {
    case 'complete':
      return { label: 'Working', color: '#34d399', bg: 'rgba(52,211,153,0.12)', emoji: '✅' };
    case 'declined':
      return { label: 'Not Working', color: '#a1a1aa', bg: 'rgba(161,161,170,0.12)', emoji: '❌' };
    case 'q2_sent':
    case 'q3_sent':
      return { label: 'In Progress', color: '#fbbf24', bg: 'rgba(251,191,36,0.12)', emoji: '⏳' };
    case 'q1_sent':
    case 'nudged':
    case 'pending':
      return { label: 'No Response', color: '#f87171', bg: 'rgba(248,113,113,0.12)', emoji: '⚠️' };
    default:
      return { label: state, color: '#a1a1aa', bg: 'rgba(161,161,170,0.12)', emoji: '❓' };
  }
}

function matchesFilter(agent: AgentRow, filter: Filter): boolean {
  if (filter === 'all') return true;
  switch (filter) {
    case 'working': return agent.conversation_state === 'complete' && agent.is_working === true;
    case 'not-working': return agent.conversation_state === 'declined' && agent.is_working === false;
    case 'in-progress': return ['q2_sent', 'q3_sent'].includes(agent.conversation_state);
    case 'no-response': return ['q1_sent', 'pending', 'nudged'].includes(agent.conversation_state);
    default: return true;
  }
}

// --- Component ---

export function CheckinMorePage() {
  const [params] = useSearchParams();
  const code = params.get('c') || params.get('token'); // 'c' is the short code, 'token' is legacy fallback
  const [state, setState] = useState<'loading' | 'error' | 'ready'>('loading');
  const [error, setError] = useState('');
  const [data, setData] = useState<MoreData | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!code) {
      setError('No code provided. Text MORE to get a new link.');
      setState('error');
      return;
    }

    async function fetchData() {
      try {
        const resp = await fetch(
          `${SUPABASE_URL}/functions/v1/checkin-more-page?c=${encodeURIComponent(code!)}`,
          { headers: { 'Content-Type': 'application/json' } }
        );
        if (!resp.ok) {
          const body = await resp.json().catch(() => ({}));
          setError(body.error || 'Link expired or invalid. Text MORE for a new one.');
          setState('error');
          return;
        }
        const json = await resp.json();
        setData(json);
        setState('ready');
      } catch (e) {
        setError('Unable to load data. Check your connection and try again.');
        setState('error');
      }
    }

    fetchData();
  }, [code]);

  const filtered = useMemo(() => {
    if (!data) return [];
    let agents = data.agents;
    if (filter !== 'all') {
      agents = agents.filter((a) => matchesFilter(a, filter));
    }
    if (search) {
      const q = search.toLowerCase();
      agents = agents.filter(
        (a) =>
          a.first_name.toLowerCase().includes(q) ||
          a.last_name.toLowerCase().includes(q)
      );
    }
    return agents;
  }, [data, filter, search]);

  // --- Render ---

  if (state === 'loading') {
    return (
      <div style={styles.page}>
        <div style={styles.center}>
          <div style={styles.spinner} />
          <p style={{ color: '#a1a1aa', marginTop: 16 }}>Loading check-in data...</p>
        </div>
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div style={styles.page}>
        <div style={styles.center}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🔒</div>
          <h1 style={{ color: '#f4f4f5', fontSize: 18, fontWeight: 600, marginBottom: 8 }}>
            Link Expired
          </h1>
          <p style={{ color: '#a1a1aa', fontSize: 14, maxWidth: 280, textAlign: 'center' as const }}>
            {error}
          </p>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { stats, date } = data;
  const filterButtons: { key: Filter; label: string; count: number; color: string }[] = [
    { key: 'all', label: 'All', count: stats.total, color: '#60a5fa' },
    { key: 'working', label: 'Working', count: stats.working, color: '#34d399' },
    { key: 'not-working', label: 'Not Working', count: stats.notWorking, color: '#a1a1aa' },
    { key: 'in-progress', label: 'In Progress', count: stats.midSurvey, color: '#fbbf24' },
    { key: 'no-response', label: 'No Response', count: stats.noResponse, color: '#f87171' },
  ];

  return (
    <div style={styles.page}>
      {/* Header */}
      <div style={styles.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 20 }}>📊</span>
          <div>
            <h1 style={{ color: '#f4f4f5', fontSize: 17, fontWeight: 700, margin: 0 }}>
              Daily Check-In
            </h1>
            <p style={{ color: '#71717a', fontSize: 12, margin: 0 }}>{friendlyDate(date)}</p>
          </div>
        </div>
        <div style={styles.rateBadge}>
          {stats.responseRate}%
        </div>
      </div>

      {/* KPI strip */}
      <div style={styles.kpiStrip}>
        <div style={styles.kpi}>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#f4f4f5' }}>{stats.responded}</div>
          <div style={{ fontSize: 10, color: '#71717a', textTransform: 'uppercase' as const, letterSpacing: 0.5 }}>Responded</div>
        </div>
        <div style={styles.kpiDivider} />
        <div style={styles.kpi}>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#34d399' }}>{stats.fourPlusHrs}</div>
          <div style={{ fontSize: 10, color: '#71717a', textTransform: 'uppercase' as const, letterSpacing: 0.5 }}>4+ Hrs</div>
        </div>
        <div style={styles.kpiDivider} />
        <div style={styles.kpi}>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#60a5fa' }}>{stats.totalApps}</div>
          <div style={{ fontSize: 10, color: '#71717a', textTransform: 'uppercase' as const, letterSpacing: 0.5 }}>Apps</div>
        </div>
        <div style={styles.kpiDivider} />
        <div style={styles.kpi}>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#f87171' }}>{stats.noResponse}</div>
          <div style={{ fontSize: 10, color: '#71717a', textTransform: 'uppercase' as const, letterSpacing: 0.5 }}>Silent</div>
        </div>
      </div>

      {/* Filter pills — horizontally scrollable */}
      <div style={styles.filterRow}>
        {filterButtons.map((fb) => (
          <button
            key={fb.key}
            onClick={() => setFilter(fb.key)}
            style={{
              ...styles.filterPill,
              background: filter === fb.key ? fb.color + '22' : 'transparent',
              borderColor: filter === fb.key ? fb.color + '55' : '#3f3f46',
              color: filter === fb.key ? fb.color : '#a1a1aa',
            }}
          >
            {fb.label} <span style={{ fontWeight: 700 }}>{fb.count}</span>
          </button>
        ))}
      </div>

      {/* Search */}
      <div style={styles.searchWrap}>
        <input
          type="text"
          placeholder="Search agents..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={styles.searchInput}
        />
        <span style={{ position: 'absolute' as const, right: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: '#71717a' }}>
          {filtered.length}
        </span>
      </div>

      {/* Agent list — card-based for mobile */}
      <div style={styles.agentList}>
        {filtered.map((agent) => {
          const si = statusInfo(agent.conversation_state);
          return (
            <div key={agent.id} style={styles.agentCard}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontWeight: 600, fontSize: 14, color: '#f4f4f5' }}>
                  {agent.first_name} {agent.last_name}
                </div>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: si.color,
                    background: si.bg,
                    padding: '2px 8px',
                    borderRadius: 12,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  <span>{si.emoji}</span> {si.label}
                </div>
              </div>

              {/* Detail row — only show if agent has responded */}
              {(agent.conversation_state === 'complete' || agent.conversation_state === 'declined' ||
                agent.conversation_state === 'q2_sent' || agent.conversation_state === 'q3_sent') && (
                <div style={styles.detailRow}>
                  {agent.is_working !== null && (
                    <span style={styles.detailChip}>
                      {agent.is_working ? '✅ Working' : '❌ Off'}
                    </span>
                  )}
                  {agent.has_four_plus_hours !== null && (
                    <span style={styles.detailChip}>
                      {agent.has_four_plus_hours ? '⏰ 4+ hrs' : '⏰ <4 hrs'}
                    </span>
                  )}
                  {agent.app_goal !== null && (
                    <span style={styles.detailChip}>
                      📝 {agent.app_goal === 5 ? '5+' : agent.app_goal} apps
                    </span>
                  )}
                  {agent.nudge_sent && (
                    <span style={styles.detailChip}>📩 Nudged</span>
                  )}
                </div>
              )}

              {/* No response — show nudge status */}
              {['q1_sent', 'pending', 'nudged'].includes(agent.conversation_state) && (
                <div style={styles.detailRow}>
                  {agent.nudge_sent ? (
                    <span style={styles.detailChip}>📩 Nudged — no reply</span>
                  ) : (
                    <span style={styles.detailChip}>Awaiting response</span>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {filtered.length === 0 && (
          <div style={{ textAlign: 'center' as const, padding: '32px 0', color: '#71717a' }}>
            {search ? 'No matching agents' : 'No agents in this category'}
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={styles.footer}>
        FYM Daily Check-In &middot; {stats.total} agents
      </div>
    </div>
  );
}

// --- Inline styles for zero-dependency mobile page ---

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    background: '#09090b',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    WebkitFontSmoothing: 'antialiased',
    padding: '0 0 80px 0',
  },
  center: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    padding: 24,
  },
  spinner: {
    width: 32,
    height: 32,
    border: '3px solid #3f3f46',
    borderTopColor: '#60a5fa',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px 16px 12px',
    borderBottom: '1px solid #27272a',
    position: 'sticky' as const,
    top: 0,
    background: '#09090b',
    zIndex: 10,
  },
  rateBadge: {
    background: 'rgba(96,165,250,0.15)',
    color: '#60a5fa',
    fontSize: 18,
    fontWeight: 700,
    padding: '6px 14px',
    borderRadius: 12,
  },
  kpiStrip: {
    display: 'flex',
    justifyContent: 'space-around',
    padding: '14px 8px',
    borderBottom: '1px solid #27272a',
  },
  kpi: {
    textAlign: 'center' as const,
    flex: 1,
  },
  kpiDivider: {
    width: 1,
    background: '#27272a',
    alignSelf: 'stretch' as const,
  },
  filterRow: {
    display: 'flex',
    gap: 6,
    padding: '10px 16px',
    overflowX: 'auto' as const,
    WebkitOverflowScrolling: 'touch' as const,
    scrollbarWidth: 'none' as const,
  },
  filterPill: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    padding: '5px 10px',
    borderRadius: 20,
    border: '1px solid',
    fontSize: 12,
    fontWeight: 500,
    whiteSpace: 'nowrap' as const,
    cursor: 'pointer',
    background: 'none',
    outline: 'none',
    flexShrink: 0,
  },
  searchWrap: {
    position: 'relative' as const,
    padding: '0 16px 10px',
  },
  searchInput: {
    width: '100%',
    padding: '8px 40px 8px 12px',
    background: '#18181b',
    border: '1px solid #3f3f46',
    borderRadius: 8,
    color: '#f4f4f5',
    fontSize: 14,
    outline: 'none',
    boxSizing: 'border-box' as const,
  },
  agentList: {
    padding: '0 12px',
  },
  agentCard: {
    padding: '10px 12px',
    borderBottom: '1px solid #1f1f23',
  },
  detailRow: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: 6,
    marginTop: 6,
  },
  detailChip: {
    fontSize: 11,
    color: '#a1a1aa',
    background: '#18181b',
    padding: '2px 8px',
    borderRadius: 6,
    border: '1px solid #27272a',
  },
  footer: {
    position: 'fixed' as const,
    bottom: 0,
    left: 0,
    right: 0,
    padding: '10px 16px',
    background: '#09090b',
    borderTop: '1px solid #27272a',
    textAlign: 'center' as const,
    fontSize: 11,
    color: '#52525b',
  },
};
