/**
 * AtRiskInsight — Read-only insight view for admins under Quality → At-Risk.
 *
 * Shows how many at-risk clients sit in each pipeline bucket, with drill-down
 * into individual client cards. No drag-and-drop, no stage transitions — this
 * is a performance monitoring view for admins to see how managers are working
 * the at-risk book.
 *
 * Bucket layout: stage counts shown as clickable summary cards. Click a bucket
 * to expand its client list below.
 */
import { useState, useCallback, useEffect, useMemo } from 'react';
import {
  AlertTriangle, Search, Clock, DollarSign,
  ShieldAlert, Loader2, RefreshCw, X,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { StaggerContainer, StaggerItem, CountUp } from '@/components/ui/animated';
import { supabase } from '@/lib/supabase';
import { useEffectiveAuth } from '@/hooks/useEffectiveAuth';
import { AtRiskDetailPanel } from './AtRiskDetailPanel';

// ── Types ──────────────────────────────────────────────────────────────────
interface AtRiskPolicy {
  policy_number: string;
  client_name: string | null;
  agency_id: string;
  agency_name: string | null;
  agent_id: string | null;
  agent_name: string | null;
  writing_number: string | null;
  product_type: string;
  plan_premium: number;
  flag_type: string;
  paid_to_date: string;
  policy_effective_date: string;
  draft_count: number;
  is_at_risk: boolean;
  days_since_draft: number;
  task_id: string | null;
  task_status: string | null;
  task_assigned_to: string | null;
  task_due_date: string | null;
  task_created_at: string | null;
}

// ── Pipeline stages ────────────────────────────────────────────────────────
type Stage =
  | 'new'
  | 'responded'
  | 'manager_outreach'
  | 'agent_outreach'
  | 'code_red'
  | 'agent_saved_pending'
  | 'saved'
  | 'lost';

const STAGES: { key: Stage; label: string; color: string; bg: string; border: string; dot: string }[] = [
  { key: 'new',                label: 'New / Untouched',  color: 'text-slate-300',   bg: 'bg-slate-500/10',   border: 'border-slate-500/30', dot: 'bg-slate-400' },
  { key: 'responded',          label: 'Responded',        color: 'text-sky-300',     bg: 'bg-sky-500/10',     border: 'border-sky-500/30',   dot: 'bg-sky-400' },
  { key: 'manager_outreach',   label: 'Manager Outreach', color: 'text-amber-300',   bg: 'bg-amber-500/10',   border: 'border-amber-500/30', dot: 'bg-amber-400' },
  { key: 'agent_outreach',     label: 'Agent Outreach',   color: 'text-violet-300',  bg: 'bg-violet-500/10',  border: 'border-violet-500/30', dot: 'bg-violet-400' },
  { key: 'code_red',           label: 'Code Red',         color: 'text-red-300',     bg: 'bg-red-500/10',     border: 'border-red-500/30',   dot: 'bg-red-500' },
  { key: 'agent_saved_pending', label: 'Pending Save',     color: 'text-teal-300',    bg: 'bg-teal-500/10',    border: 'border-teal-500/30',  dot: 'bg-teal-400' },
  { key: 'saved',              label: 'Saved',            color: 'text-emerald-300',  bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', dot: 'bg-emerald-400' },
  { key: 'lost',               label: 'Lost',             color: 'text-rose-300',    bg: 'bg-rose-500/10',    border: 'border-rose-500/30',  dot: 'bg-rose-400' },
];

// ── Helpers ────────────────────────────────────────────────────────────────
function stageOf(p: AtRiskPolicy): Stage {
  const s = (p.task_status || 'new') as Stage;
  const valid = STAGES.map(st => st.key);
  return valid.includes(s) ? s : 'new';
}

function urgencyLevel(days: number): 'code_red' | 'heating_up' | 'watch' {
  if (days >= 30) return 'code_red';
  if (days >= 14) return 'heating_up';
  return 'watch';
}

function daysToTerminate(days: number): number {
  return Math.max(0, 45 - days);
}

type UrgencyFilter = 'all' | 'code_red' | 'heating_up';

// ── Component ──────────────────────────────────────────────────────────────
interface AtRiskInsightProps {
  filterAgencyId: string | null;
}

export function AtRiskInsight({ filterAgencyId }: AtRiskInsightProps) {
  const { effectiveAgencyId, isOrgWide, isAgent, effectiveWritingNumber } = useEffectiveAuth();
  const [policies, setPolicies] = useState<AtRiskPolicy[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [openBucket, setOpenBucket] = useState<Stage | null>(null);
  const [query, setQuery] = useState('');
  const [urgencyFilter, setUrgencyFilter] = useState<UrgencyFilter>('all');
  const [selectedPolicy, setSelectedPolicy] = useState<AtRiskPolicy | null>(null);

  const fetchData = useCallback(async (isRefresh = false) => {
    if (!supabase) return;
    isRefresh ? setRefreshing(true) : setLoading(true);

    try {
      const PAGE_SIZE = 1000;
      const allRows: AtRiskPolicy[] = [];
      let offset = 0;

      while (true) {
        let q = supabase
          .from('manager_at_risk_board')
          .select('*')
          .order('days_since_draft', { ascending: false })
          .range(offset, offset + PAGE_SIZE - 1);

        if (isAgent && effectiveWritingNumber) {
          q = q.eq('writing_number', effectiveWritingNumber);
        } else if (!isOrgWide && effectiveAgencyId) {
          q = q.eq('agency_id', effectiveAgencyId);
        }

        const { data, error } = await q;
        if (error) { console.error('At-risk fetch error:', error.message); break; }
        if (!data || data.length === 0) break;

        allRows.push(...(data as unknown as AtRiskPolicy[]));
        if (data.length < PAGE_SIZE) break;
        offset += PAGE_SIZE;
      }

      let filtered = allRows;
      if (filterAgencyId) {
        filtered = allRows.filter(p => p.agency_id === filterAgencyId);
      }

      filtered.sort((a, b) => b.days_since_draft - a.days_since_draft);
      setPolicies(filtered);
    } catch (err) {
      console.error('At-risk insight fetch error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [effectiveAgencyId, isOrgWide, isAgent, effectiveWritingNumber, filterAgencyId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Filtering ────────────────────────────────────────────────────────────
  const matchesQuery = (p: AtRiskPolicy) => {
    if (!query.trim()) return true;
    const q = query.trim().toLowerCase();
    return (
      (p.client_name || '').toLowerCase().includes(q) ||
      (p.agent_name || '').toLowerCase().includes(q) ||
      p.policy_number.toLowerCase().includes(q) ||
      (p.agency_name || '').toLowerCase().includes(q)
    );
  };

  const matchesUrgency = (p: AtRiskPolicy) => {
    if (urgencyFilter === 'all') return true;
    return urgencyLevel(p.days_since_draft) === urgencyFilter;
  };

  const visible = useMemo(
    () => policies.filter(p => matchesQuery(p) && matchesUrgency(p)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [policies, query, urgencyFilter]
  );

  const byStage = (stage: Stage) => visible.filter(p => stageOf(p) === stage);

  // ── Counts ───────────────────────────────────────────────────────────────
  const counts = {
    total: policies.length,
    code_red: policies.filter(p => urgencyLevel(p.days_since_draft) === 'code_red').length,
    heating_up: policies.filter(p => urgencyLevel(p.days_since_draft) === 'heating_up').length,
    premium: policies.reduce((s, p) => s + Number(p.plan_premium), 0),
  };

  // ── Render ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 text-amber-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* KPI strip */}
      <StaggerContainer className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StaggerItem>
          <Card className="border-border">
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">At-Risk Policies</p>
                  <CountUp end={counts.total} className="text-xl font-bold text-foreground mt-0.5 block" />
                </div>
                <div className="p-2 rounded-lg bg-amber-500/10">
                  <AlertTriangle size={16} className="text-amber-400" />
                </div>
              </div>
            </CardContent>
          </Card>
        </StaggerItem>
        <StaggerItem>
          <Card className="border-border">
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Code Red (30d+)</p>
                  <CountUp end={counts.code_red} className="text-xl font-bold text-red-400 mt-0.5 block" />
                </div>
                <div className="p-2 rounded-lg bg-red-500/10">
                  <ShieldAlert size={16} className="text-red-400" />
                </div>
              </div>
            </CardContent>
          </Card>
        </StaggerItem>
        <StaggerItem>
          <Card className="border-border">
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Heating Up (14-29d)</p>
                  <CountUp end={counts.heating_up} className="text-xl font-bold text-amber-400 mt-0.5 block" />
                </div>
                <div className="p-2 rounded-lg bg-amber-500/10">
                  <Clock size={16} className="text-amber-400" />
                </div>
              </div>
            </CardContent>
          </Card>
        </StaggerItem>
        <StaggerItem>
          <Card className="border-border">
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Premium at Risk</p>
                  <CountUp
                    end={counts.premium * 12}
                    format={(n: number) => `$${Math.round(n).toLocaleString()}`}
                    className="text-xl font-bold text-foreground mt-0.5 block"
                  />
                  <p className="text-[10px] text-muted-foreground/70">annual</p>
                </div>
                <div className="p-2 rounded-lg bg-rose-500/10">
                  <DollarSign size={16} className="text-rose-400" />
                </div>
              </div>
            </CardContent>
          </Card>
        </StaggerItem>
      </StaggerContainer>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        {([
          { key: 'all' as UrgencyFilter, label: `All ${counts.total}`, cls: 'text-foreground/80 border-border', active: 'bg-secondary text-foreground border-primary/30' },
          { key: 'code_red' as UrgencyFilter, label: `Code Red ${counts.code_red}`, cls: 'text-red-300 border-red-500/30', active: 'bg-red-500/20 text-red-200 border-red-400' },
          { key: 'heating_up' as UrgencyFilter, label: `Heating Up ${counts.heating_up}`, cls: 'text-amber-300 border-amber-500/30', active: 'bg-amber-500/20 text-amber-200 border-amber-400' },
        ]).map(chip => (
          <button
            key={chip.key}
            onClick={() => setUrgencyFilter(f => f === chip.key ? 'all' : chip.key)}
            className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border transition-colors ${
              urgencyFilter === chip.key ? chip.active : `bg-card ${chip.cls} hover:text-foreground`
            }`}
          >
            {chip.label}
          </button>
        ))}
        <div className="relative ml-auto">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/50" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search client, agent, policy #"
            className="bg-card border border-border rounded-lg pl-8 pr-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/50 w-52"
          />
        </div>
        <button
          onClick={() => fetchData(true)}
          disabled={refreshing}
          className="text-muted-foreground hover:text-foreground p-1.5 disabled:opacity-50 rounded-md hover:bg-secondary/50 transition-colors"
          title="Refresh"
        >
          <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Pipeline stage buckets — expandable accordion */}
      {policies.length === 0 ? (
        <Card className="border-border">
          <CardContent className="py-12 text-center text-muted-foreground/70 text-sm">
            No at-risk policies right now. Clean book.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {STAGES.map(stage => {
            const cards = byStage(stage.key);
            const hasCards = cards.length > 0;

            return (
              <div key={stage.key}>
                {/* Bucket row — click opens modal */}
                <button
                  onClick={() => {
                    if (!hasCards) return;
                    setOpenBucket(stage.key);
                    setSelectedPolicy(null);
                  }}
                  disabled={!hasCards}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg border transition-colors text-left ${
                    hasCards
                      ? `bg-card border-border hover:border-primary/30 hover:${stage.bg}`
                      : 'bg-card/50 border-border/50 opacity-50 cursor-default'
                  }`}
                >
                  {/* Dot + label */}
                  <span className={`w-2 h-2 rounded-full ${stage.dot} shrink-0`} />
                  <span className={`text-sm font-semibold ${hasCards ? stage.color : 'text-muted-foreground/50'}`}>
                    {stage.label}
                  </span>

                  {/* Count */}
                  <span className={`ml-auto text-sm font-bold tabular-nums ${
                    hasCards ? stage.color : 'text-muted-foreground/30'
                  }`}>
                    {cards.length}
                  </span>

                  {/* Premium in bucket */}
                  {hasCards && (
                    <span className="text-[11px] text-muted-foreground/60 ml-2 tabular-nums">
                      ${Math.round(cards.reduce((s, p) => s + Number(p.plan_premium) * 12, 0)).toLocaleString()} AP
                    </span>
                  )}
                </button>

              </div>
            );
          })}
        </div>
      )}

      {/* Bucket modal — shows card grid for the selected stage */}
      {openBucket && (() => {
        const bucketStage = STAGES.find(s => s.key === openBucket)!;
        const bucketCards = byStage(openBucket);
        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
            onClick={() => { setOpenBucket(null); setSelectedPolicy(null); }}
          >
            <div
              className="bg-card border border-border rounded-xl w-full max-w-3xl max-h-[85vh] overflow-y-auto shadow-xl"
              onClick={e => e.stopPropagation()}
            >
              {/* Modal header */}
              <div className={`flex items-center gap-3 px-5 py-4 border-b ${bucketStage.border}`}>
                <span className={`w-2.5 h-2.5 rounded-full ${bucketStage.dot}`} />
                <h3 className={`text-base font-bold ${bucketStage.color}`}>
                  {bucketStage.label}
                </h3>
                <span className="text-sm text-muted-foreground">
                  {bucketCards.length} {bucketCards.length === 1 ? 'policy' : 'policies'}
                  {' · $'}{Math.round(bucketCards.reduce((s, p) => s + Number(p.plan_premium) * 12, 0)).toLocaleString()} AP
                </span>
                <button
                  onClick={() => { setOpenBucket(null); setSelectedPolicy(null); }}
                  className="ml-auto text-muted-foreground hover:text-foreground p-1"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Card grid */}
              <div className="p-4">
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {bucketCards.map(p => {
                    const level = urgencyLevel(p.days_since_draft);
                    const isCodeRed = level === 'code_red';
                    const isHeating = level === 'heating_up';
                    const dtt = daysToTerminate(p.days_since_draft);

                    return (
                      <button
                        key={p.policy_number}
                        onClick={() => setSelectedPolicy(p)}
                        className={`w-full text-left rounded-lg border p-3 transition-colors ${
                          isCodeRed
                            ? 'bg-card border-red-500/30 hover:border-red-400/50'
                            : 'bg-card border-border hover:border-primary/20'
                        }`}
                      >
                        {/* Urgency row */}
                        <div className="flex items-center gap-1 mb-1 min-h-[16px]">
                          {isCodeRed && (
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-red-500/15 text-red-300 border border-red-500/30">
                              CODE RED
                            </span>
                          )}
                          {isHeating && (
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">
                              HEATING UP
                            </span>
                          )}
                          <span className={`text-[11px] font-bold ml-auto ${
                            isCodeRed ? 'text-red-400'
                            : isHeating ? 'text-amber-400'
                            : 'text-muted-foreground'
                          }`}>
                            {dtt > 0 ? `${dtt}d left` : 'grace up'}
                          </span>
                        </div>

                        {/* Client */}
                        <p className="text-sm font-semibold text-foreground leading-snug">
                          {p.client_name || 'Unknown'}
                        </p>

                        {/* Product + premium */}
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          {p.product_type === 'HHC' ? 'HHC' : 'HI'} · ${(Number(p.plan_premium) * 12).toLocaleString(undefined, { maximumFractionDigits: 0 })} AP
                        </p>

                        {/* Agent */}
                        <p className="text-[10px] text-muted-foreground/70 mt-0.5 truncate">
                          {p.agent_name || 'Unassigned'}
                          {p.writing_number ? ` · #${p.writing_number}` : ''}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Detail modal — shows full client info when a card is clicked */}
      {selectedPolicy && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={() => setSelectedPolicy(null)}
        >
          <div
            className="w-full max-w-lg max-h-[85vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <AtRiskDetailPanel
              policy={selectedPolicy}
              onClose={() => setSelectedPolicy(null)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
