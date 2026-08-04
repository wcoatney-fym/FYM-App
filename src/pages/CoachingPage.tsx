import { useEffect, useMemo, useState, useCallback } from 'react';
import { Header } from '@/components/layout/Header';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { StaggerContainer, StaggerItem, CountUp } from '@/components/ui/animated';
import { HudFrame } from '@/components/ui/hud-frame';
import { supabase } from '@/lib/supabase';
import { useEffectiveAuth } from '@/hooks/useEffectiveAuth';
import { useAgencyFilter } from '@/hooks/useAgencyFilter';
import { DataFilters } from '@/components/filters/DataFilters';
import { type DatePreset, type DateRange, DEFAULT_PRESET, getDateRange } from '@/lib/dateUtils';
import {
  AlertTriangle, TrendingUp, DollarSign, ShieldCheck,
  ArrowLeft, ArrowRight, RefreshCw, Calendar, User, Building2,
} from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────────
interface CoachingRow {
  task_id: string;
  policy_number: string;
  agency_id: string;
  agency_name: string | null;
  stage: string;
  status: string;
  priority: string;
  assigned_to: string | null;
  assigned_name: string | null;
  notes: string | null;
  last_contact_date: string | null;
  resolution: string | null;
  escalated_at: string | null;
  flag_type: string;
  due_date: string | null;
  created_at: string;
  updated_at: string;
  product_type: string | null;
  plan_premium: number | null;
  paid_to_date: string | null;
  draft_count: number | null;
  policy_effective_date: string | null;
  agent_id: string | null;
  agent_name: string | null;
  is_at_risk: boolean | null;
  days_since_paid: number | null;
}

interface AtRiskBoardRow {
  policy_number: string;
  agency_id: string;
  agent_id: string | null;
  product_type: string;
  plan_premium: number;
  flag_type: string;
  paid_to_date: string;
  days_since_draft: number;
  draft_count: number;
  task_id: string | null;
  task_status: string | null;
  task_due_date: string | null;
}

// ── Stage config ─────────────────────────────────────────────────────────
const STAGES = [
  { key: 'new', label: 'New', color: 'border-slate-500/40', dot: 'bg-slate-400', description: 'Newly flagged at-risk' },
  { key: 'outreach', label: 'Outreach', color: 'border-sky-500/40', dot: 'bg-sky-400', description: 'Initial contact attempted' },
  { key: 'coaching', label: 'Coaching', color: 'border-amber-500/40', dot: 'bg-amber-400', description: 'Active coaching in progress' },
  { key: 'escalated', label: 'Escalated', color: 'border-red-500/40', dot: 'bg-red-500', description: 'Escalated to manager/Tyler' },
  { key: 'pending_save', label: 'Pending Save', color: 'border-teal-500/40', dot: 'bg-teal-400', description: 'Save attempt in progress' },
  { key: 'saved', label: 'Saved', color: 'border-emerald-500/40', dot: 'bg-emerald-400', description: 'Policy retained' },
  { key: 'lost', label: 'Lost', color: 'border-rose-500/40', dot: 'bg-rose-400', description: 'Policy terminated' },
] as const;

type StageKey = typeof STAGES[number]['key'];

const STAGE_ORDER: StageKey[] = STAGES.map(s => s.key);

// ── Helpers ────────────────────────────────────────────────────────────────
function fmt$(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000).toLocaleString()}K`;
  return `$${Math.round(n).toLocaleString()}`;
}

function priorityFromDays(days: number | null | undefined): 'critical' | 'high' | 'medium' {
  if (days === null || days === undefined) return 'medium';
  if (days >= 30) return 'critical';
  if (days >= 14) return 'high';
  return 'medium';
}

function priorityBadgeClass(priority: string) {
  if (priority === 'critical') return 'bg-red-500/10 text-red-400 border-red-500/30';
  if (priority === 'high') return 'bg-amber-500/10 text-amber-400 border-amber-500/30';
  return 'bg-secondary text-muted-foreground border-border';
}

function productBadgeClass(product: string | null) {
  if (product === 'HHC') return 'bg-sky-500/10 text-sky-400 border-sky-500/30';
  if (product === 'HI') return 'bg-violet-500/10 text-violet-400 border-violet-500/30';
  return 'bg-secondary text-muted-foreground border-border';
}

function fmtDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

const PAGE = 500;

async function fetchAllPaginated<T>(
  table: string,
  select: string,
  order?: { column: string; ascending?: boolean },
  agencyFilter?: { isOrgWide: boolean; agencyId: string | null; writingNumber?: string | null; isAgent?: boolean }
): Promise<T[]> {
  if (!supabase) return [];
  let all: T[] = [];
  let offset = 0;
  while (true) {
    let query = (supabase as any).from(table).select(select).range(offset, offset + PAGE - 1);
    if (order) query = query.order(order.column, { ascending: order.ascending ?? true });
    // Agents see only their own policies (by writing number)
    if (agencyFilter?.isAgent && agencyFilter.writingNumber) {
      query = query.eq('agent_id', agencyFilter.writingNumber);
    } else if (agencyFilter && !agencyFilter.isOrgWide && agencyFilter.agencyId) {
      query = query.eq('agency_id', agencyFilter.agencyId);
    }
    const { data, error } = await query;
    if (error) throw error;
    all = [...all, ...((data || []) as T[])];
    if (!data || data.length < PAGE) break;
    offset += PAGE;
  }
  return all;
}

// ── Component ──────────────────────────────────────────────────────────────
export function CoachingPage() {
  const { effectiveAgencyId, effectiveWritingNumber, isOrgWide, isAgent } = useEffectiveAuth();
  const { filterAgencyId, setFilterAgencyId, showAgencyFilter } = useAgencyFilter();
  const [rows, setRows] = useState<CoachingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [notesDraft, setNotesDraft] = useState('');
  const [resolutionDraft, setResolutionDraft] = useState('');
  const [savingField, setSavingField] = useState<string | null>(null);
  const [datePreset, setDatePreset] = useState<DatePreset>(DEFAULT_PRESET);
  const [dateRange, setDateRange] = useState<DateRange>(() => getDateRange(DEFAULT_PRESET));
  const [filterAgentId, setFilterAgentId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!supabase) { setLoading(false); return; }
    setLoading(true);
    try {
      const data = await fetchAllPaginated<CoachingRow>('coaching_pipeline', '*', undefined, { isOrgWide, agencyId: effectiveAgencyId, writingNumber: effectiveWritingNumber, isAgent });
      setRows(data);
    } catch (err) {
      console.error('Coaching pipeline load error:', err);
    } finally {
      setLoading(false);
    }
  }, [isOrgWide, effectiveAgencyId, effectiveWritingNumber, isAgent]);

  useEffect(() => { load(); }, [load]);

  const selectedRow = useMemo(
    () => rows.find(r => r.task_id === selectedTaskId) || null,
    [rows, selectedTaskId]
  );

  useEffect(() => {
    if (selectedRow) {
      setNotesDraft(selectedRow.notes ?? '');
      setResolutionDraft(selectedRow.resolution ?? '');
    }
  }, [selectedRow?.task_id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Filter rows by agency/agent ──
  const filteredRows = useMemo(() => {
    let r = rows;
    if (filterAgencyId) r = r.filter(row => row.agency_id === filterAgencyId);
    if (filterAgentId) r = r.filter(row => row.agent_id === filterAgentId);
    return r;
  }, [rows, filterAgencyId, filterAgentId]);

  // ── KPI summary ──
  const summary = useMemo(() => {
    const total = filteredRows.length;
    const critical = filteredRows.filter(r => r.priority === 'critical').length;
    const premiumAtRisk = filteredRows
      .filter(r => r.stage !== 'saved' && r.stage !== 'lost')
      .reduce((s, r) => s + (r.plan_premium || 0), 0);
    const saved = filteredRows.filter(r => r.stage === 'saved').length;
    const lost = filteredRows.filter(r => r.stage === 'lost').length;
    const saveRate = (saved + lost) > 0 ? (saved / (saved + lost)) * 100 : null;
    return { total, critical, premiumAtRisk, saveRate };
  }, [filteredRows]);

  // ── Columns grouped by stage ──
  const columns = useMemo(() => {
    const map = new Map<string, CoachingRow[]>();
    STAGES.forEach(s => map.set(s.key, []));
    filteredRows.forEach(r => {
      const key = STAGE_ORDER.includes(r.stage as StageKey) ? r.stage : 'new';
      map.get(key)!.push(r);
    });
    return map;
  }, [filteredRows]);

  // ── Mutations ──
  async function updateTask(taskId: string, patch: Record<string, any>) {
    if (!supabase) return;
    const { error } = await (supabase as any)
      .from('atrisk_tasks')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', taskId);
    if (error) {
      console.error('updateTask error:', error);
      return;
    }
    setRows(prev => prev.map(r => r.task_id === taskId ? { ...r, ...patch, updated_at: new Date().toISOString() } : r));
  }

  async function moveStage(taskId: string, direction: 'prev' | 'next') {
    const row = rows.find(r => r.task_id === taskId);
    if (!row) return;
    const idx = STAGE_ORDER.indexOf(row.stage as StageKey);
    const newIdx = direction === 'next' ? Math.min(idx + 1, STAGE_ORDER.length - 1) : Math.max(idx - 1, 0);
    if (newIdx === idx) return;
    const newStage = STAGE_ORDER[newIdx];
    setSavingField('stage');

    const patch: Record<string, any> = { stage: newStage };
    if (newStage === 'escalated') patch.escalated_at = new Date().toISOString();
    if (newStage === 'saved' || newStage === 'lost') {
      patch.status = 'resolved';
      patch.resolution = resolutionDraft || row.resolution || null;
    }
    await updateTask(taskId, patch);
    setSavingField(null);
  }

  async function updatePriority(taskId: string, priority: string) {
    setSavingField('priority');
    await updateTask(taskId, { priority });
    setSavingField(null);
  }

  async function saveNotes(taskId: string) {
    if (!selectedRow || notesDraft === (selectedRow.notes ?? '')) return;
    setSavingField('notes');
    await updateTask(taskId, { notes: notesDraft });
    setSavingField(null);
  }

  async function saveResolution(taskId: string) {
    if (!selectedRow || resolutionDraft === (selectedRow.resolution ?? '')) return;
    setSavingField('resolution');
    await updateTask(taskId, { resolution: resolutionDraft });
    setSavingField(null);
  }

  async function updateLastContact(taskId: string, date: string) {
    setSavingField('last_contact_date');
    await updateTask(taskId, { last_contact_date: date || null });
    setSavingField(null);
  }

  // ── Auto-sync from manager_at_risk_board ──
  async function syncAtRisk() {
    if (!supabase) return;
    setSyncing(true);
    try {
      const board = await fetchAllPaginated<AtRiskBoardRow>('manager_at_risk_board', '*');
      const untasked = board.filter(b => !b.task_id);

      if (untasked.length === 0) {
        setSyncing(false);
        await load();
        return;
      }

      const inserts = untasked.map(b => ({
        policy_number: b.policy_number,
        agency_id: b.agency_id,
        status: 'new',
        flag_type: b.flag_type,
        due_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
        stage: 'new',
        priority: priorityFromDays(b.days_since_draft),
      }));

      // Insert in chunks to stay well under request size limits
      const CHUNK = 200;
      for (let i = 0; i < inserts.length; i += CHUNK) {
        const chunk = inserts.slice(i, i + CHUNK);
        const { error } = await (supabase as any).from('atrisk_tasks').insert(chunk);
        if (error) {
          console.error('syncAtRisk insert error:', error);
          break;
        }
      }
      await load();
    } catch (err) {
      console.error('syncAtRisk error:', err);
    } finally {
      setSyncing(false);
    }
  }

  if (!supabase) {
    return (
      <>
        <Header title="Coaching" />
        <div className="p-6 text-center text-muted-foreground">
          <p>Supabase is not configured — running in mock mode. Connect Supabase to view the coaching pipeline.</p>
        </div>
      </>
    );
  }

  if (loading) {
    return (
      <>
        <Header title="Coaching" />
        <div className="p-6 space-y-4">
          {[1, 2, 3].map(i => <div key={i} className="h-28 rounded-lg shimmer" />)}
        </div>
      </>
    );
  }

  return (
    <>
      <Header title="Coaching" />
      <div className="p-6 space-y-6">

        {/* Filters — time period always visible, agency/agent for admins */}
        <DataFilters
          showAgencyFilter={showAgencyFilter}
          showAgentFilter={showAgencyFilter}
          showTimePeriod
          selectedAgencyId={filterAgencyId}
          selectedAgentId={filterAgentId}
          selectedPreset={datePreset}
          selectedDateRange={dateRange}
          onAgencyChange={setFilterAgencyId}
          onAgentChange={setFilterAgentId}
          onDateRangeChange={(range, preset) => { setDateRange(range); setDatePreset(preset); }}
        />

        {/* ── KPI strip ── */}
        <StaggerContainer className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            {
              title: 'In Pipeline',
              end: summary.total,
              fmt: (n: number) => n.toLocaleString(),
              sub: 'active coaching cases',
              icon: ShieldCheck,
              color: 'text-primary',
              bg: 'bg-cyan-500/10',
              accent: 'hsl(199 89% 48%)',
            },
            {
              title: 'Critical Priority',
              end: summary.critical,
              fmt: (n: number) => n.toLocaleString(),
              sub: '30+ days since draft',
              icon: AlertTriangle,
              color: summary.critical > 0 ? 'text-red-400' : 'text-muted-foreground',
              bg: summary.critical > 0 ? 'bg-red-500/10' : 'bg-secondary',
              accent: summary.critical > 0 ? 'hsl(0 84% 60%)' : 'hsl(215 20% 55%)',
            },
            {
              title: 'Premium At Risk',
              end: summary.premiumAtRisk,
              fmt: fmt$,
              sub: 'open pipeline, not yet saved/lost',
              icon: DollarSign,
              color: 'text-amber-400',
              bg: 'bg-amber-500/10',
              accent: 'hsl(38 92% 50%)',
            },
            {
              title: 'Save Rate',
              end: summary.saveRate ?? 0,
              fmt: (n: number) => summary.saveRate === null ? '—' : `${n.toFixed(1)}%`,
              sub: 'saved / (saved + lost)',
              icon: TrendingUp,
              color: (summary.saveRate ?? 0) >= 60 ? 'text-emerald-400' : 'text-amber-400',
              bg: (summary.saveRate ?? 0) >= 60 ? 'bg-emerald-500/10' : 'bg-amber-500/10',
              accent: (summary.saveRate ?? 0) >= 60 ? 'hsl(142 71% 45%)' : 'hsl(38 92% 50%)',
            },
          ].map(card => (
            <StaggerItem key={card.title}>
              <HudFrame accentColor={card.accent}>
                <Card className="border-border h-full">
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">{card.title}</p>
                        <CountUp
                          end={card.end}
                          format={card.fmt}
                          className="text-2xl font-bold text-foreground mt-1 block font-data"
                        />
                        <p className="text-xs text-muted-foreground mt-0.5">{card.sub}</p>
                      </div>
                      <div className={`p-2.5 rounded-lg ${card.bg}`}>
                        <card.icon size={20} className={card.color} />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </HudFrame>
            </StaggerItem>
          ))}
        </StaggerContainer>

        {/* ── Toolbar ── */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-base font-semibold text-foreground">{isAgent ? 'Your Coaching Cases' : 'Escalation Pipeline'}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{isAgent ? 'Policies your manager is coaching on your behalf.' : 'Click a card to open coaching detail and move stages.'}</p>
          </div>
          {!isAgent && (
            <Button
              size="sm"
              variant="outline"
              disabled={syncing}
              onClick={syncAtRisk}
              className="h-8 text-xs border-border hover:border-primary/50 hover:text-primary"
            >
              <RefreshCw size={13} className={`mr-1.5 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? 'Syncing…' : 'Sync At-Risk'}
            </Button>
          )}
        </div>

        {/* ── Kanban board ── */}
        <div className="flex gap-4 overflow-x-auto pb-4 -mx-1 px-1">
          {STAGES.map(stage => {
            const stageRows = columns.get(stage.key) || [];
            return (
              <div key={stage.key} className="flex-shrink-0 w-72">
                <div className={`rounded-lg border ${stage.color} bg-secondary/20 h-full flex flex-col`}>
                  <div className="px-3 py-2.5 border-b border-border/30 flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${stage.dot}`} />
                      <span className="text-sm font-semibold text-foreground truncate">{stage.label}</span>
                    </div>
                    <Badge className="bg-secondary text-muted-foreground border-border border text-[10px] px-1.5 py-0 flex-shrink-0">
                      {stageRows.length}
                    </Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground px-3 pt-2 pb-1">{stage.description}</p>
                  <div className="flex-1 p-2 space-y-2 overflow-y-auto max-h-[560px] scrollbar-thin">
                    {stageRows.length === 0 && (
                      <div className="text-center text-[11px] text-muted-foreground py-6">No cases</div>
                    )}
                    {stageRows.map(row => (
                      <button
                        key={row.task_id}
                        onClick={() => setSelectedTaskId(row.task_id)}
                        className={`w-full text-left rounded-md border border-border/50 bg-card hover:border-primary/40 transition-colors p-2.5 space-y-1.5 ${
                          row.priority === 'critical' ? 'border-l-2 border-l-red-400' : row.priority === 'high' ? 'border-l-2 border-l-amber-400' : ''
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="font-data text-xs text-foreground/90 truncate">{row.policy_number}</span>
                          <Badge className={`text-[9px] px-1 py-0 border flex-shrink-0 ${priorityBadgeClass(row.priority)}`}>
                            {row.priority}
                          </Badge>
                        </div>
                        <div className="text-[11px] text-muted-foreground truncate" title={row.agency_name ?? row.agency_id}>
                          {row.agency_name ?? row.agency_id}
                        </div>
                        <div className="flex items-center justify-between gap-1">
                          <Badge className={`text-[9px] px-1 py-0 border ${productBadgeClass(row.product_type)}`}>
                            {row.product_type ?? '—'}
                          </Badge>
                          <span className="font-data text-[11px] text-foreground/80">
                            {row.plan_premium != null ? `$${row.plan_premium.toFixed(0)}` : '—'}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                          <span>{row.days_since_paid != null ? `${row.days_since_paid}d idle` : '—'}</span>
                          <span className="truncate max-w-[100px]" title={row.assigned_name ?? ''}>
                            {row.assigned_name ?? 'Unassigned'}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Detail panel ── */}
      <Dialog open={!!selectedTaskId} onOpenChange={(open) => { if (!open) setSelectedTaskId(null); }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          {selectedRow && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 font-data">
                  {selectedRow.policy_number}
                  <Badge className={`text-[10px] px-1.5 py-0 border ${productBadgeClass(selectedRow.product_type)}`}>
                    {selectedRow.product_type ?? '—'}
                  </Badge>
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-5">
                {/* Policy details */}
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="flex items-center gap-2">
                    <Building2 size={14} className="text-muted-foreground flex-shrink-0" />
                    <span className="text-muted-foreground">Agency:</span>
                    <span className="text-foreground font-medium truncate">{selectedRow.agency_name ?? selectedRow.agency_id}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <User size={14} className="text-muted-foreground flex-shrink-0" />
                    <span className="text-muted-foreground">Agent:</span>
                    <span className="text-foreground font-medium truncate">{selectedRow.agent_name ?? '—'}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Premium:</span>{' '}
                    <span className="text-foreground font-medium font-data">
                      {selectedRow.plan_premium != null ? `$${selectedRow.plan_premium.toFixed(2)}` : '—'}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Drafts:</span>{' '}
                    <span className="text-foreground font-medium font-data">{selectedRow.draft_count ?? '—'}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Submitted:</span>{' '}
                    <span className="text-foreground font-medium font-data">{fmtDate(selectedRow.policy_effective_date)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Paid to date:</span>{' '}
                    <span className="text-foreground font-medium font-data">{fmtDate(selectedRow.paid_to_date)}</span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-muted-foreground">Days since paid:</span>{' '}
                    <span className={`font-medium font-data ${
                      (selectedRow.days_since_paid ?? 0) >= 30 ? 'text-red-400' :
                      (selectedRow.days_since_paid ?? 0) >= 14 ? 'text-amber-400' : 'text-foreground'
                    }`}>
                      {selectedRow.days_since_paid != null ? `${selectedRow.days_since_paid}d` : '—'}
                    </span>
                  </div>
                </div>

                {/* Stage control — read-only for agents */}
                <div className="border-t border-border/30 pt-4">
                  <p className="text-xs font-semibold text-muted-foreground mb-2">Pipeline Stage</p>
                  {isAgent ? (
                    <Badge className={`text-xs px-2.5 py-1 border ${STAGES.find(s => s.key === selectedRow.stage)?.color ?? 'border-border'} bg-secondary text-foreground`}>
                      <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${STAGES.find(s => s.key === selectedRow.stage)?.dot ?? 'bg-slate-400'}`} />
                      {STAGES.find(s => s.key === selectedRow.stage)?.label ?? selectedRow.stage}
                    </Badge>
                  ) : (
                    <div className="flex items-center justify-between gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={savingField === 'stage' || STAGE_ORDER.indexOf(selectedRow.stage as StageKey) === 0}
                        onClick={() => moveStage(selectedRow.task_id, 'prev')}
                        className="h-8 text-xs border-border"
                      >
                        <ArrowLeft size={13} className="mr-1" /> Previous
                      </Button>
                      <Badge className={`text-xs px-2.5 py-1 border ${STAGES.find(s => s.key === selectedRow.stage)?.color ?? 'border-border'} bg-secondary text-foreground`}>
                        <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${STAGES.find(s => s.key === selectedRow.stage)?.dot ?? 'bg-slate-400'}`} />
                        {STAGES.find(s => s.key === selectedRow.stage)?.label ?? selectedRow.stage}
                      </Badge>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={savingField === 'stage' || STAGE_ORDER.indexOf(selectedRow.stage as StageKey) === STAGE_ORDER.length - 1}
                        onClick={() => moveStage(selectedRow.task_id, 'next')}
                        className="h-8 text-xs border-border"
                      >
                        Next <ArrowRight size={13} className="ml-1" />
                      </Button>
                    </div>
                  )}
                </div>

                {/* Priority — read-only badge for agents, editable for managers */}
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-2">Priority</p>
                  {isAgent ? (
                    <Badge className={`text-xs px-2.5 py-1 border capitalize ${priorityBadgeClass(selectedRow.priority)}`}>
                      {selectedRow.priority}
                    </Badge>
                  ) : (
                    <div className="flex items-center gap-2">
                      {(['critical', 'high', 'medium'] as const).map(p => (
                        <button
                          key={p}
                          onClick={() => updatePriority(selectedRow.task_id, p)}
                          disabled={savingField === 'priority'}
                          className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors capitalize ${
                            selectedRow.priority === p
                              ? priorityBadgeClass(p) + ' ring-1 ring-inset'
                              : 'bg-secondary text-muted-foreground border-border hover:border-primary/30'
                          }`}
                        >
                          {p}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Last contact date */}
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
                    <Calendar size={12} /> Last Contact Date
                  </p>
                  {isAgent ? (
                    <span className="text-sm text-foreground font-data">{selectedRow.last_contact_date ? fmtDate(selectedRow.last_contact_date) : '—'}</span>
                  ) : (
                    <input
                      type="date"
                      defaultValue={selectedRow.last_contact_date ?? ''}
                      onBlur={(e) => updateLastContact(selectedRow.task_id, e.target.value)}
                      className="h-8 text-sm bg-card border border-border rounded-md px-2 text-foreground w-44"
                    />
                  )}
                </div>

                {/* Notes — read-only for agents */}
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-2">Coaching Notes</p>
                  {isAgent ? (
                    <p className="text-sm text-foreground/80 whitespace-pre-wrap">{selectedRow.notes || <span className="text-muted-foreground italic">No notes yet.</span>}</p>
                  ) : (
                    <Textarea
                      value={notesDraft}
                      onChange={(e) => setNotesDraft(e.target.value)}
                      onBlur={() => saveNotes(selectedRow.task_id)}
                      placeholder="Log outreach attempts, coaching conversations, agent commitments…"
                      className="min-h-[80px] text-sm bg-card border-border"
                    />
                  )}
                </div>

                {/* Resolution (saved/lost stages) — read-only for agents */}
                {(selectedRow.stage === 'saved' || selectedRow.stage === 'lost' || selectedRow.stage === 'pending_save') && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground mb-2">Resolution</p>
                    {isAgent ? (
                      <p className="text-sm text-foreground/80 whitespace-pre-wrap">{selectedRow.resolution || <span className="text-muted-foreground italic">No resolution noted.</span>}</p>
                    ) : (
                      <Textarea
                        value={resolutionDraft}
                        onChange={(e) => setResolutionDraft(e.target.value)}
                        onBlur={() => saveResolution(selectedRow.task_id)}
                        placeholder="How was this resolved? Payment plan, carrier rate action, non-responsive, etc."
                        className="min-h-[60px] text-sm bg-card border-border"
                      />
                    )}
                  </div>
                )}

                {selectedRow.escalated_at && (
                  <p className="text-[11px] text-muted-foreground">
                    Escalated {fmtDate(selectedRow.escalated_at)}
                  </p>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
