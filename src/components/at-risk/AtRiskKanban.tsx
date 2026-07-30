/**
 * AtRiskKanban — 8-stage pipeline board matching the Activity Tracker's Manager View.
 *
 * Stages: New → Responded → Manager → Agent → Code Red → Pending → Saved → Lost
 *
 * Features:
 * - Drag-and-drop between stages (droppable: responded, manager_outreach,
 *   agent_outreach, code_red, saved, lost)
 * - Urgency overlays: Code Red (30d+), Heating Up (14-29d) badges on cards
 * - KPI strip with stage counts
 * - Search across client, agent, policy #
 * - Urgency filter chips
 */
import { useState, useCallback, useEffect, useMemo } from 'react';
import {
  AlertTriangle, RefreshCw, Search, Clock, DollarSign, Users,
  ShieldAlert, XCircle, Loader2,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { StaggerContainer, StaggerItem, CountUp } from '@/components/ui/animated';
import { supabase } from '@/lib/supabase';
import { scopeToAgency } from '@/lib/query-helpers';
import { useEffectiveAuth } from '@/hooks/useEffectiveAuth';
import { AtRiskPolicyModal } from './AtRiskPolicyModal';

// ── Types ──────────────────────────────────────────────────────────────────
export interface AtRiskPolicy {
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
  task_status: Stage | null;
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

const STAGES: { key: Stage; label: string; accent: string; dot: string }[] = [
  { key: 'new',                label: 'New',       accent: 'border-slate-500/60', dot: 'bg-slate-400' },
  { key: 'responded',          label: 'Responded', accent: 'border-sky-500/40',   dot: 'bg-sky-400' },
  { key: 'manager_outreach',   label: 'Manager',   accent: 'border-amber-500/40', dot: 'bg-amber-400' },
  { key: 'agent_outreach',     label: 'Agent',     accent: 'border-violet-500/40', dot: 'bg-violet-400' },
  { key: 'code_red',           label: 'Code Red',  accent: 'border-red-600/70',   dot: 'bg-red-500' },
  { key: 'agent_saved_pending', label: 'Pending',   accent: 'border-teal-500/40',  dot: 'bg-teal-400' },
  { key: 'saved',              label: 'Saved',     accent: 'border-emerald-500/40', dot: 'bg-emerald-400' },
  { key: 'lost',               label: 'Lost',      accent: 'border-rose-500/40',  dot: 'bg-rose-400' },
];

// Stages a user can manually drop a card into
const DROPPABLE: Stage[] = ['responded', 'manager_outreach', 'agent_outreach', 'code_red', 'saved', 'lost'];

// ── Helpers ────────────────────────────────────────────────────────────────
function stageOf(p: AtRiskPolicy): Stage {
  const s = p.task_status || 'new';
  const valid: Stage[] = STAGES.map(st => st.key);
  return valid.includes(s) ? s : 'new';
}

function urgencyLevel(days: number): 'code_red' | 'heating_up' | 'watch' {
  if (days >= 30) return 'code_red';
  if (days >= 14) return 'heating_up';
  return 'watch';
}

function daysToTerminate(days: number): number {
  // Grace period is ~45 days from last paid_to_date
  return Math.max(0, 45 - days);
}

type UrgencyFilter = 'all' | 'code_red' | 'heating_up';

// ── Component ──────────────────────────────────────────────────────────────
interface AtRiskKanbanProps {
  filterAgencyId: string | null;
}

export function AtRiskKanban({ filterAgencyId }: AtRiskKanbanProps) {
  const { effectiveAgencyId, isOrgWide, isAgent, effectiveWritingNumber } = useEffectiveAuth();
  const [policies, setPolicies] = useState<AtRiskPolicy[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<Stage | null>(null);
  const [movingId, setMovingId] = useState<string | null>(null);
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

        // Scope by auth role
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

      // Apply UI-level agency filter (FYM admin default)
      let filtered = allRows;
      if (filterAgencyId) {
        filtered = allRows.filter(p => p.agency_id === filterAgencyId);
      }

      // Sort by urgency: worst first
      filtered.sort((a, b) => b.days_since_draft - a.days_since_draft);
      setPolicies(filtered);
    } catch (err) {
      console.error('At-risk pipeline fetch error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [effectiveAgencyId, isOrgWide, isAgent, effectiveWritingNumber, filterAgencyId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Stage transition ─────────────────────────────────────────────────────
  const moveToStage = async (policy: AtRiskPolicy, target: Stage) => {
    const current = stageOf(policy);
    if (current === target || !DROPPABLE.includes(target)) return;
    setMovingId(policy.policy_number);

    // Optimistic update
    setPolicies(prev => prev.map(p =>
      p.policy_number === policy.policy_number
        ? { ...p, task_status: target }
        : p
    ));

    try {
      if (policy.task_id) {
        // Update existing task
        await supabase!
          .from('atrisk_tasks')
          .update({
            status: target,
            stage_changed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', policy.task_id);
      } else {
        // Create new task at target stage
        const { data } = await supabase!
          .from('atrisk_tasks')
          .insert({
            policy_number: policy.policy_number,
            agency_id: policy.agency_id,
            status: target,
            flag_type: 'at_risk',
            due_date: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
          })
          .select('id')
          .single();

        if (data) {
          setPolicies(prev => prev.map(p =>
            p.policy_number === policy.policy_number
              ? { ...p, task_id: data.id, task_status: target }
              : p
          ));
        }
      }
    } catch {
      // Revert on failure
      setPolicies(prev => prev.map(p =>
        p.policy_number === policy.policy_number
          ? { ...p, task_status: current }
          : p
      ));
    } finally {
      setMovingId(null);
    }
  };

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
    const level = urgencyLevel(p.days_since_draft);
    return urgencyFilter === level;
  };

  const visible = useMemo(
    () => policies.filter(p => matchesQuery(p) && matchesUrgency(p)),
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

      {/* Triage bar + search */}
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

      {/* Kanban board */}
      {policies.length === 0 ? (
        <Card className="border-border">
          <CardContent className="py-12 text-center text-muted-foreground/70 text-sm">
            No at-risk policies right now. Nice and clean.
          </CardContent>
        </Card>
      ) : (
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide snap-x lg:grid lg:grid-cols-8 lg:gap-2.5 lg:overflow-visible">
          {STAGES.map(stage => {
            const cards = byStage(stage.key);
            const isDroppable = DROPPABLE.includes(stage.key);
            const isOver = dropTarget === stage.key && isDroppable;

            return (
              <div
                key={stage.key}
                onDragOver={e => {
                  if (isDroppable && dragId) { e.preventDefault(); setDropTarget(stage.key); }
                }}
                onDragLeave={() => setDropTarget(t => t === stage.key ? null : t)}
                onDrop={e => {
                  e.preventDefault();
                  setDropTarget(null);
                  const p = policies.find(w => w.policy_number === dragId);
                  if (p) moveToStage(p, stage.key);
                  setDragId(null);
                }}
                className={`shrink-0 w-[68vw] sm:w-[38vw] lg:w-auto snap-start rounded-lg p-1.5 transition-colors ${
                  isOver ? 'bg-primary/5 ring-1 ring-primary/40' : 'bg-card/40'
                } ${dragId && !isDroppable ? 'opacity-50' : ''}`}
              >
                {/* Column header */}
                <div className={`flex items-center gap-1.5 px-1 pb-2 border-b ${stage.accent} mb-2`}>
                  <span className={`w-2 h-2 rounded-full ${stage.dot} shrink-0`} />
                  <span className="text-[11px] font-semibold text-foreground/80 truncate">{stage.label}</span>
                  <span className="text-[11px] text-muted-foreground/50 ml-auto">{cards.length}</span>
                </div>

                {/* Cards */}
                <div className="space-y-2 min-h-[40px]">
                  {cards.length === 0 ? (
                    <p className="text-[11px] text-muted-foreground/30 px-1 py-3 text-center">—</p>
                  ) : (
                    cards.map(p => {
                      const level = urgencyLevel(p.days_since_draft);
                      const isCodeRed = level === 'code_red';
                      const isHeating = level === 'heating_up';
                      const dtt = daysToTerminate(p.days_since_draft);

                      return (
                        <button
                          key={p.policy_number}
                          draggable
                          onDragStart={() => setDragId(p.policy_number)}
                          onDragEnd={() => { setDragId(null); setDropTarget(null); }}
                          onClick={() => setSelectedPolicy(p)}
                          className={`w-full text-left bg-card border rounded-lg p-2.5 transition-colors cursor-grab active:cursor-grabbing ${
                            movingId === p.policy_number ? 'opacity-60' : ''
                          } ${
                            isCodeRed
                              ? 'border-red-500/50 hover:border-red-400'
                              : 'border-border hover:border-primary/30'
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

                          {/* Client name */}
                          <p className="text-sm font-semibold text-foreground leading-snug break-words">
                            {p.client_name || 'Unknown'}
                          </p>

                          {/* Policy details */}
                          <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                            {p.product_type === 'HHC' ? 'HHC' : 'HI'} · ${(Number(p.plan_premium) * 12).toLocaleString(undefined, { maximumFractionDigits: 0 })} AP
                          </p>

                          {/* Agent */}
                          <p className="text-[10px] text-muted-foreground/70 mt-0.5 truncate">
                            {p.agent_name || 'Unassigned'}
                            {p.writing_number ? ` · #${p.writing_number}` : ''}
                          </p>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Policy detail modal */}
      {selectedPolicy && (
        <AtRiskPolicyModal
          policy={selectedPolicy}
          onClose={() => setSelectedPolicy(null)}
          onStageChange={(policyNumber, newStage) => {
            const p = policies.find(pol => pol.policy_number === policyNumber);
            if (p) moveToStage(p, newStage);
          }}
        />
      )}
    </div>
  );
}
