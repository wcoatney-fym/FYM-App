/**
 * PipelineBoard — Kanban board for agent pipeline.
 * Ported from CRM Portal's AgentPipelineBoard.
 * Reads from portal DB (akhojh…) via portal-supabase.ts.
 *
 * Uses @dnd-kit/core for touch + pointer + keyboard drag-and-drop.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  Search,
  RefreshCw,
  Wifi,
  WifiOff,
  Loader2,
  Download,
  Filter,
  ListChecks,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  CheckSquare,
  Square,
  X,
  ArrowRightLeft,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { portalSupabase, portalUrl, portalKey } from '@/lib/portal-supabase';
import type {
  PortalPipelineRecord,
  AgentPipelineStage,
  PortalPipelineStageStep,
} from '@/lib/contracting/types';
import { PipelineSummaryBar } from './PipelineSummaryBar';
import { PipelineDetailModal } from './PipelineDetailModal';
import { StageStepsEditor } from './StageStepsEditor';
import { DroppableColumn } from './DroppableColumn';
import { DraggableCard } from './DraggableCard';
import { computeProgress } from './pipelineProgress';

// ─── Stage definitions ───────────────────────────────────────────────────────

export const STAGES: { key: AgentPipelineStage; label: string; color: string }[] = [
  { key: 'hip_broker', label: 'HIP Broker', color: 'bg-cyan-500/10 border-blue-500/20' },
  { key: 'hip_career', label: 'HIP Career', color: 'bg-indigo-500/10 border-indigo-500/20' },
  { key: 'iaa', label: 'IAA', color: 'bg-violet-500/10 border-violet-500/20' },
  { key: 'signed_iaa', label: 'Signed IAA', color: 'bg-purple-500/10 border-purple-500/20' },
  { key: 'bill_com', label: 'Bill.com', color: 'bg-fuchsia-500/10 border-fuchsia-500/20' },
  { key: 'in_contracting', label: 'In Contracting', color: 'bg-teal-500/10 border-teal-500/20' },
  { key: 'rts', label: 'RTS', color: 'bg-emerald-500/10 border-emerald-500/20' },
  { key: 'crm', label: 'CRM Onboarding', color: 'bg-cyan-500/10 border-cyan-500/20' },
  { key: 'hip_broker_ready', label: 'HIP Broker READY', color: 'bg-emerald-500/10 border-green-500/20' },
  { key: 'hip_career_ready', label: 'HIP Career READY', color: 'bg-lime-500/10 border-lime-500/20' },
  { key: 'actively_selling', label: 'Actively Selling', color: 'bg-amber-500/10 border-amber-500/20' },
  { key: 'terminated', label: 'Terminated', color: 'bg-red-500/10 border-red-500/20' },
];

// ─── Edge function calls (portal Supabase) ─────────────────────────────────

async function pushStageChange(
  recordId: string,
  newStage: AgentPipelineStage,
  updatedBy = 'FYM App',
): Promise<{
  success: boolean;
  record?: PortalPipelineRecord;
  error?: string;
  ghl_pushed?: boolean;
}> {
  const res = await fetch(`${portalUrl}/functions/v1/push-pipeline-stage`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${portalKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      record_id: recordId,
      new_stage: newStage,
      updated_by: updatedBy,
      updated_by_source: 'contracting_portal',
    }),
  });
  if (!res.ok) return { success: false, error: `Request failed (${res.status})` };
  return await res.json();
}

// ─── Scroll indicator hook ───────────────────────────────────────────────────

function useScrollIndicators(ref: React.RefObject<HTMLDivElement | null>) {
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 8);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 8);
  }, [ref]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    update();
    el.addEventListener('scroll', update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', update);
      ro.disconnect();
    };
  }, [ref, update]);

  const scrollBy = useCallback(
    (dir: 'left' | 'right') => {
      ref.current?.scrollBy({
        left: dir === 'left' ? -240 : 240,
        behavior: 'smooth',
      });
    },
    [ref],
  );

  return { canScrollLeft, canScrollRight, scrollBy, refresh: update };
}

// ─── Component ───────────────────────────────────────────────────────────────

export function PipelineBoard() {
  const [records, setRecords] = useState<PortalPipelineRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [agencyFilter, setAgencyFilter] = useState('');
  const [selectedRecord, setSelectedRecord] = useState<PortalPipelineRecord | null>(null);
  const [agencies, setAgencies] = useState<string[]>([]);
  const [showStepsEditor, setShowStepsEditor] = useState(false);
  const [stageSteps, setStageSteps] = useState<PortalPipelineStageStep[]>([]);
  const [pushingIds, setPushingIds] = useState<Set<string>>(new Set());
  const [toastMsg, setToastMsg] = useState<{
    text: string;
    type: 'success' | 'error';
    retry?: () => void;
  } | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [ghlConnected, setGhlConnected] = useState(false);
  const [ghlPipelineId, setGhlPipelineId] = useState<string | null>(null);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  // Bulk selection
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkMoving, setBulkMoving] = useState(false);
  const toastTimer = useRef<number>();
  const scrollRef = useRef<HTMLDivElement>(null);

  const { canScrollLeft, canScrollRight, scrollBy, refresh: refreshScroll } =
    useScrollIndicators(scrollRef);

  // ── dnd-kit sensors ──────────────────────────────────────────────────────

  const pointerSensor = useSensor(PointerSensor, {
    activationConstraint: { distance: 8 },
  });
  const touchSensor = useSensor(TouchSensor, {
    activationConstraint: { delay: 200, tolerance: 6 },
  });
  const keyboardSensor = useSensor(KeyboardSensor);
  const sensors = useSensors(pointerSensor, touchSensor, keyboardSensor);

  const showToast = (text: string, type: 'success' | 'error', retry?: () => void) => {
    setToastMsg({ text, type, retry });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    // Error toasts with retry stay longer so the user can click
    const duration = type === 'error' && retry ? 8000 : 3500;
    toastTimer.current = window.setTimeout(() => setToastMsg(null), duration);
  };

  // ── Data loading ─────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    if (!portalSupabase) return;
    const { data } = await portalSupabase
      .from('agent_pipeline')
      .select('*')
      .order('stage_entered_at', { ascending: false });

    if (data) {
      setRecords(data as PortalPipelineRecord[]);
      const uniqueAgencies = [
        ...new Set(data.map((r: PortalPipelineRecord) => r.agency).filter(Boolean)),
      ] as string[];
      uniqueAgencies.sort();
      setAgencies(uniqueAgencies);
    }
    setLoading(false);
  }, []);

  const loadStageSteps = useCallback(async () => {
    if (!portalSupabase) return;
    const { data } = await portalSupabase
      .from('agent_pipeline_stage_steps')
      .select('*')
      .order('display_order', { ascending: true });
    if (data) setStageSteps(data as PortalPipelineStageStep[]);
  }, []);

  const loadGhlConfig = useCallback(async () => {
    if (!portalSupabase) return;
    const { data } = await portalSupabase
      .from('agent_pipeline_ghl_config')
      .select('connection_status, ghl_pipeline_id')
      .limit(1)
      .maybeSingle();
    if (data) {
      setGhlConnected(data.connection_status === 'connected');
      setGhlPipelineId(data.ghl_pipeline_id);
    }
  }, []);

  useEffect(() => {
    loadData();
    loadGhlConfig();
    loadStageSteps();
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, [loadData, loadGhlConfig, loadStageSteps]);

  // Refresh scroll indicators after data loads
  useEffect(() => {
    if (!loading) refreshScroll();
  }, [loading, records, refreshScroll]);

  // ── GHL sync ─────────────────────────────────────────────────────────────

  const handleSyncFromGhl = async () => {
    setSyncing(true);
    try {
      const res = await fetch(`${portalUrl}/functions/v1/sync-pipeline-from-ghl`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${portalKey}`,
          'Content-Type': 'application/json',
        },
      });
      const result = await res.json();
      if (result.success) {
        showToast(result.message || `Synced ${result.synced} agents from GHL`, 'success');
        await loadData();
      } else {
        showToast(result.error || 'Sync failed', 'error');
      }
    } catch {
      showToast('Network error during sync', 'error');
    } finally {
      setSyncing(false);
    }
  };

  // ── Filter ───────────────────────────────────────────────────────────────

  const filtered = records.filter((r) => {
    if (search && !r.agent_name.toLowerCase().includes(search.toLowerCase())) return false;
    if (agencyFilter && r.agency !== agencyFilter) return false;
    return true;
  });

  const groupedByStage = STAGES.map((stage) => {
    const stageRecords = filtered.filter((r) => r.stage === stage.key);
    const readyCount = stageRecords.filter(
      (r) => computeProgress(r, stageSteps).allComplete
    ).length;
    return { ...stage, records: stageRecords, readyCount };
  });

  const totalCount = filtered.length;

  // ── Record updates ───────────────────────────────────────────────────────

  const handleRecordUpdated = (updated: PortalPipelineRecord) => {
    setRecords((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
    setSelectedRecord(updated);
  };

  // ── Bulk actions ──────────────────────────────────────────────────────

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const clearSelection = () => {
    setSelectMode(false);
    setSelectedIds(new Set());
  };

  const handleBulkMove = async (newStage: AgentPipelineStage) => {
    if (selectedIds.size === 0) return;
    setBulkMoving(true);
    const ids = [...selectedIds];
    let successCount = 0;
    let failCount = 0;
    for (const id of ids) {
      const record = records.find((r) => r.id === id);
      if (!record || record.stage === newStage) continue;

      setPushingIds((prev) => new Set(prev).add(id));
      setRecords((prev) =>
        prev.map((r) =>
          r.id === id
            ? { ...r, stage: newStage, stage_entered_at: new Date().toISOString() }
            : r
        )
      );

      const result = await pushStageChange(id, newStage);
      if (result.success && result.record) {
        setRecords((prev) =>
          prev.map((r) => (r.id === id ? result.record! : r))
        );
        successCount++;
      } else {
        setRecords((prev) =>
          prev.map((r) => (r.id === id ? record : r))
        );
        failCount++;
      }
      setPushingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
    const stageLabel = STAGES.find((s) => s.key === newStage)?.label || newStage;
    if (failCount === 0) {
      showToast(`Moved ${successCount} agent${successCount !== 1 ? 's' : ''} to ${stageLabel}`, 'success');
    } else {
      showToast(`${successCount} moved, ${failCount} failed → ${stageLabel}`, 'error');
    }
    clearSelection();
    setBulkMoving(false);
  };

  const handleStageChange = async (
    recordId: string,
    newStage: AgentPipelineStage,
  ) => {
    const record = records.find((r) => r.id === recordId);
    if (!record || record.stage === newStage) return;

    setPushingIds((prev) => new Set(prev).add(recordId));

    // Optimistic update
    setRecords((prev) =>
      prev.map((r) =>
        r.id === recordId
          ? { ...r, stage: newStage, stage_entered_at: new Date().toISOString() }
          : r
      )
    );

    const result = await pushStageChange(recordId, newStage);

    if (result.success && result.record) {
      setRecords((prev) =>
        prev.map((r) => (r.id === recordId ? result.record! : r))
      );
      if (selectedRecord?.id === recordId) setSelectedRecord(result.record);
      const stageLabel =
        STAGES.find((s) => s.key === newStage)?.label || newStage;
      showToast(
        `Moved to ${stageLabel}${result.ghl_pushed ? ' (synced to GHL)' : ''}`,
        'success',
      );
    } else {
      // Revert
      setRecords((prev) =>
        prev.map((r) => (r.id === recordId ? record : r))
      );
      showToast(
        result.error || 'Failed to move agent',
        'error',
        () => handleStageChange(recordId, newStage),
      );
    }

    setPushingIds((prev) => {
      const next = new Set(prev);
      next.delete(recordId);
      return next;
    });
  };

  // ── dnd-kit handlers ─────────────────────────────────────────────────────

  const handleDragStart = (event: DragStartEvent) => {
    setActiveDragId(String(event.active.id));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveDragId(null);

    if (!over) return;

    const recordId = String(active.id);
    const newStage = String(over.id) as AgentPipelineStage;

    // Validate the drop target is a stage column
    if (STAGES.some((s) => s.key === newStage)) {
      handleStageChange(recordId, newStage);
    }
  };

  const activeDragRecord = activeDragId
    ? records.find((r) => r.id === activeDragId) ?? null
    : null;

  // ── Render ───────────────────────────────────────────────────────────────

  if (!portalSupabase) {
    return (
      <Card className="border-border">
        <CardContent className="p-8 text-center space-y-3">
          <AlertCircle size={28} className="text-amber-500 mx-auto" />
          <h3 className="text-lg font-semibold text-foreground">
            Portal Connection Required
          </h3>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Set <code className="bg-secondary/40 px-1 py-0.5 rounded text-xs">VITE_PORTAL_SUPABASE_URL</code> and{' '}
            <code className="bg-secondary/40 px-1 py-0.5 rounded text-xs">VITE_PORTAL_SUPABASE_KEY</code> to connect.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search agents..."
            className="w-full pl-10 pr-4 py-2 border border-border rounded-lg text-sm focus:ring-2 focus:ring-blue-400 focus:border-transparent bg-card"
          />
        </div>
        <div className="relative">
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <select
            value={agencyFilter}
            onChange={(e) => setAgencyFilter(e.target.value)}
            className="pl-10 pr-8 py-2 border border-border rounded-lg text-sm focus:ring-2 focus:ring-blue-400 focus:border-transparent bg-card appearance-none"
          >
            <option value="">All Agencies</option>
            {agencies.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </div>
        <button
          onClick={() => { setLoading(true); loadData(); }}
          className="flex items-center gap-2 px-3 py-2 border border-border rounded-lg text-sm text-muted-foreground hover:bg-background transition-colors"
        >
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>

        {/* GHL Status */}
        <div className="flex items-center gap-2">
          {ghlConnected ? (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-full">
              <Wifi className="w-3 h-3" /> GHL Synced
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground bg-background border border-border px-2.5 py-1 rounded-full">
              <WifiOff className="w-3 h-3" /> GHL Off
            </span>
          )}
          <button
            onClick={handleSyncFromGhl}
            disabled={syncing || !ghlPipelineId}
            className="flex items-center gap-1.5 px-3 py-2 border border-border rounded-lg text-sm text-muted-foreground hover:bg-background transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            title="Pull all opportunities from GHL"
          >
            {syncing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            Sync
          </button>
          <button
            onClick={() => setShowStepsEditor(true)}
            className="flex items-center gap-1.5 px-3 py-2 border border-border rounded-lg text-sm text-muted-foreground hover:bg-background transition-colors"
            title="Edit stage step checklists"
          >
            <ListChecks className="w-4 h-4" /> Steps
          </button>
        </div>

        {/* Bulk select toggle */}
        <button
          onClick={() => {
            if (selectMode) clearSelection();
            else setSelectMode(true);
          }}
          className={`flex items-center gap-1.5 px-3 py-2 border rounded-lg text-sm transition-colors ${
            selectMode
              ? 'border-primary bg-primary/10 text-primary font-medium'
              : 'border-border text-muted-foreground hover:bg-background'
          }`}
          title={selectMode ? 'Exit selection mode' : 'Select agents for bulk move'}
        >
          {selectMode ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
          Select
        </button>

        <span className="text-sm text-muted-foreground ml-auto">
          {totalCount} agent{totalCount !== 1 ? 's' : ''} in pipeline
        </span>
      </div>

      {/* Bulk action bar */}
      {selectMode && selectedIds.size > 0 && (
        <div className="flex items-center gap-3 mb-3 px-4 py-2.5 rounded-lg bg-primary/10 border border-primary/20">
          <span className="text-sm font-semibold text-primary">
            {selectedIds.size} selected
          </span>
          <div className="relative">
            <ArrowRightLeft className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary" />
            <select
              disabled={bulkMoving}
              onChange={(e) => {
                if (e.target.value) handleBulkMove(e.target.value as AgentPipelineStage);
                e.target.value = '';
              }}
              className="pl-10 pr-8 py-2 border border-primary/30 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent bg-card appearance-none disabled:opacity-50"
            >
              <option value="">Move selected to…</option>
              {STAGES.map((s) => (
                <option key={s.key} value={s.key}>{s.label}</option>
              ))}
            </select>
          </div>
          {bulkMoving && <Loader2 className="w-4 h-4 animate-spin text-primary" />}
          <button
            onClick={clearSelection}
            className="ml-auto flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs text-muted-foreground hover:bg-background border border-border transition-colors"
          >
            <X className="w-3.5 h-3.5" /> Clear
          </button>
        </div>
      )}

      {/* Summary Bar */}
      <PipelineSummaryBar records={records} stageSteps={stageSteps} loading={loading} />

      {/* Board with scroll indicators */}
      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="flex-1 relative">
          {/* Left scroll fade + arrow */}
          {canScrollLeft && (
            <>
              <div className="absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-background to-transparent z-10 pointer-events-none" />
              <button
                onClick={() => scrollBy('left')}
                className="absolute left-1 top-1/2 -translate-y-1/2 z-20 w-8 h-8 rounded-full bg-card border border-border shadow-lg flex items-center justify-center hover:bg-background transition-colors"
                aria-label="Scroll left"
              >
                <ChevronLeft className="w-4 h-4 text-muted-foreground" />
              </button>
            </>
          )}

          {/* Right scroll fade + arrow */}
          {canScrollRight && (
            <>
              <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-background to-transparent z-10 pointer-events-none" />
              <button
                onClick={() => scrollBy('right')}
                className="absolute right-1 top-1/2 -translate-y-1/2 z-20 w-8 h-8 rounded-full bg-card border border-border shadow-lg flex items-center justify-center hover:bg-background transition-colors"
                aria-label="Scroll right"
              >
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </button>
            </>
          )}

          <div ref={scrollRef} className="overflow-x-auto pb-4 h-full">
            <div className="flex gap-3 min-w-max h-full">
              {groupedByStage.map((col) => (
                <DroppableColumn
                  key={col.key}
                  stageKey={col.key}
                  label={col.label}
                  color={col.color}
                  records={col.records}
                  readyCount={col.readyCount}
                  stageSteps={stageSteps}
                  pushingIds={pushingIds}
                  onCardClick={selectMode ? (r) => toggleSelect(r.id) : setSelectedRecord}
                  selectMode={selectMode}
                  selectedIds={selectedIds}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Drag overlay — rendered above everything for the dragged card ghost */}
        <DragOverlay dropAnimation={null}>
          {activeDragRecord && (
            <div className="w-[204px]">
              <DraggableCard
                record={activeDragRecord}
                stageSteps={stageSteps}
                stageKey={activeDragRecord.stage}
                isPushing={false}
                onClick={() => {}}
                isOverlay
              />
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {/* Toast */}
      {toastMsg && (
        <div
          className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-lg glow-primary text-sm font-medium transition-all flex items-center gap-3 ${
            toastMsg.type === 'success'
              ? 'bg-emerald-500 text-white'
              : 'bg-red-600 text-white'
          }`}
        >
          {toastMsg.text}
          {toastMsg.type === 'error' && toastMsg.retry && (
            <button
              onClick={() => {
                const retryFn = toastMsg.retry!;
                setToastMsg(null);
                retryFn();
              }}
              className="ml-1 px-2.5 py-1 rounded bg-white/20 hover:bg-white/30 text-white text-xs font-bold transition-colors"
            >
              Retry
            </button>
          )}
        </div>
      )}

      {/* Detail Modal */}
      {selectedRecord && (
        <PipelineDetailModal
          record={selectedRecord}
          stageSteps={stageSteps}
          onClose={() => setSelectedRecord(null)}
          onRecordUpdated={handleRecordUpdated}
          onStageChange={handleStageChange}
        />
      )}

      {/* Stage Steps Editor */}
      {showStepsEditor && (
        <StageStepsEditor
          onClose={() => {
            setShowStepsEditor(false);
            loadStageSteps();
          }}
        />
      )}
    </div>
  );
}
