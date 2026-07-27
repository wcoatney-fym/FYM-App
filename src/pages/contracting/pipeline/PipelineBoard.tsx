/**
 * PipelineBoard — Kanban board for agent pipeline.
 * Ported from CRM Portal's AgentPipelineBoard.
 * Reads from portal DB (akhojh…) via portal-supabase.ts.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Search,
  RefreshCw,
  Clock,
  User,
  Building2,
  Filter,
  PenLine,
  Wifi,
  WifiOff,
  Loader2,
  Download,
  CheckCircle2,
  ArrowRight,
  ListChecks,
  FileCheck,
  AlertCircle,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { portalSupabase } from '@/lib/portal-supabase';
import type {
  PortalPipelineRecord,
  AgentPipelineStage,
  PortalPipelineStageStep,
} from '@/lib/contracting/types';
import { PipelineSummaryBar } from './PipelineSummaryBar';
import { PipelineDetailModal } from './PipelineDetailModal';
import { StageStepsEditor } from './StageStepsEditor';
import { ProgressRing } from './ProgressRing';
import { computeProgress, stageHealth } from './pipelineProgress';

// ─── Stage definitions ───────────────────────────────────────────────────────

export const STAGES: { key: AgentPipelineStage; label: string; color: string }[] = [
  { key: 'hip_broker', label: 'HIP Broker', color: 'bg-cyan-500/10 border-blue-200' },
  { key: 'hip_career', label: 'HIP Career', color: 'bg-indigo-50 border-indigo-200' },
  { key: 'iaa', label: 'IAA', color: 'bg-violet-50 border-violet-200' },
  { key: 'signed_iaa', label: 'Signed IAA', color: 'bg-purple-50 border-purple-200' },
  { key: 'bill_com', label: 'Bill.com', color: 'bg-fuchsia-50 border-fuchsia-200' },
  { key: 'in_contracting', label: 'In Contracting', color: 'bg-teal-50 border-teal-200' },
  { key: 'rts', label: 'RTS', color: 'bg-emerald-50 border-emerald-200' },
  { key: 'crm', label: 'CRM Onboarding', color: 'bg-cyan-50 border-cyan-200' },
  { key: 'hip_broker_ready', label: 'HIP Broker READY', color: 'bg-emerald-500/10 border-green-200' },
  { key: 'hip_career_ready', label: 'HIP Career READY', color: 'bg-lime-50 border-lime-200' },
  { key: 'actively_selling', label: 'Actively Selling', color: 'bg-amber-50 border-amber-200' },
  { key: 'terminated', label: 'Terminated', color: 'bg-red-500/10 border-red-500/20' },
];

const HEALTH_BORDER: Record<string, string> = {
  fresh: 'border-border',
  aging: 'border-amber-300',
  stalled: 'border-red-300',
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d`;
  return `${Math.floor(days / 30)}mo`;
}

// ─── Edge function calls (portal Supabase) ───────────────────────────────────

const PORTAL_URL = import.meta.env.VITE_PORTAL_SUPABASE_URL || '';
const PORTAL_KEY = import.meta.env.VITE_PORTAL_SUPABASE_KEY || '';

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
  const res = await fetch(`${PORTAL_URL}/functions/v1/push-pipeline-stage`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${PORTAL_KEY}`,
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
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<AgentPipelineStage | null>(null);
  const [pushingIds, setPushingIds] = useState<Set<string>>(new Set());
  const [toastMsg, setToastMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [ghlConnected, setGhlConnected] = useState(false);
  const [ghlPipelineId, setGhlPipelineId] = useState<string | null>(null);
  const toastTimer = useRef<number>();

  const showToast = (text: string, type: 'success' | 'error') => {
    setToastMsg({ text, type });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToastMsg(null), 3500);
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

  // ── GHL sync ─────────────────────────────────────────────────────────────

  const handleSyncFromGhl = async () => {
    setSyncing(true);
    try {
      const res = await fetch(`${PORTAL_URL}/functions/v1/sync-pipeline-from-ghl`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${PORTAL_KEY}`,
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

  const handleStageChange = async (
    recordId: string,
    newStage: AgentPipelineStage
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
        'success'
      );
    } else {
      // Revert
      setRecords((prev) =>
        prev.map((r) => (r.id === recordId ? record : r))
      );
      showToast(result.error || 'Failed to move agent', 'error');
    }

    setPushingIds((prev) => {
      const next = new Set(prev);
      next.delete(recordId);
      return next;
    });
  };

  // ── Drag and drop ────────────────────────────────────────────────────────

  const handleDragStart = (e: React.DragEvent, recordId: string) => {
    e.dataTransfer.setData('text/plain', recordId);
    e.dataTransfer.effectAllowed = 'move';
    setDraggingId(recordId);
  };

  const handleDragEnd = () => {
    setDraggingId(null);
    setDragOverStage(null);
  };

  const handleDragOver = (e: React.DragEvent, stageKey: AgentPipelineStage) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverStage(stageKey);
  };

  const handleDragLeave = () => {
    setDragOverStage(null);
  };

  const handleDrop = (e: React.DragEvent, stageKey: AgentPipelineStage) => {
    e.preventDefault();
    const recordId = e.dataTransfer.getData('text/plain');
    setDragOverStage(null);
    setDraggingId(null);
    if (recordId) handleStageChange(recordId, stageKey);
  };

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
            Set <code className="bg-slate-100 px-1 py-0.5 rounded text-xs">VITE_PORTAL_SUPABASE_URL</code> and{' '}
            <code className="bg-slate-100 px-1 py-0.5 rounded text-xs">VITE_PORTAL_SUPABASE_KEY</code> to connect.
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
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/70" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search agents..."
            className="w-full pl-10 pr-4 py-2 border border-border rounded-lg text-sm focus:ring-2 focus:ring-blue-400 focus:border-transparent bg-card"
          />
        </div>
        <div className="relative">
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/70" />
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
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">
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

        <span className="text-sm text-muted-foreground ml-auto">
          {totalCount} agent{totalCount !== 1 ? 's' : ''} in pipeline
        </span>
      </div>

      {/* Summary Bar */}
      <PipelineSummaryBar records={records} stageSteps={stageSteps} />

      {/* Board */}
      <div className="flex-1 overflow-x-auto pb-4">
        <div className="flex gap-3 min-w-max h-full">
          {groupedByStage.map((col) => (
            <div
              key={col.key}
              onDragOver={(e) => handleDragOver(e, col.key)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, col.key)}
              className={`w-[220px] flex-shrink-0 rounded-xl border ${col.color} flex flex-col transition-all ${
                dragOverStage === col.key
                  ? 'ring-2 ring-blue-400 ring-offset-1 scale-[1.01]'
                  : ''
              }`}
            >
              {/* Column Header */}
              <div className="p-3 border-b border-inherit">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-foreground/80 truncate pr-2">
                    {col.label}
                  </h3>
                  <span
                    className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${
                      col.key === 'terminated'
                        ? 'bg-red-200 text-red-700'
                        : 'bg-card/80 text-muted-foreground border border-border'
                    }`}
                  >
                    {col.records.length}
                  </span>
                </div>
                {col.readyCount > 0 && (
                  <div className="mt-1.5 inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700">
                    <CheckCircle2 className="w-3 h-3" /> {col.readyCount} ready
                  </div>
                )}
              </div>

              {/* Cards */}
              <div
                className="flex-1 overflow-y-auto p-2 space-y-2"
                style={{ maxHeight: 'min(calc(100vh - 380px), 540px)' }}
              >
                {col.records.map((record) => {
                  const progress = computeProgress(record, stageSteps);
                  const health = stageHealth(record);
                  return (
                    <div
                      key={record.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, record.id)}
                      onDragEnd={handleDragEnd}
                      onClick={() => setSelectedRecord(record)}
                      className={`w-full text-left bg-card rounded-lg border p-3 glow-sm hover:glow-primary transition-all cursor-grab active:cursor-grabbing ${
                        progress.allComplete
                          ? 'border-emerald-300 ring-1 ring-emerald-200 shadow-emerald-100'
                          : HEALTH_BORDER[health]
                      } ${draggingId === record.id ? 'opacity-50 scale-95' : ''} ${
                        pushingIds.has(record.id) ? 'animate-pulse' : ''
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <User className="w-3.5 h-3.5 text-muted-foreground/70 mt-0.5 flex-shrink-0" />
                        <span className="text-sm font-semibold text-foreground line-clamp-2 leading-tight flex-1">
                          {record.agent_name || 'Unnamed'}
                        </span>
                        {progress.total > 0 && (
                          <ProgressRing
                            fraction={progress.fraction}
                            completed={progress.completedCount}
                            total={progress.total}
                            complete={progress.allComplete}
                          />
                        )}
                      </div>
                      {progress.total > 0 &&
                        (progress.allComplete ? (
                          <div className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-100 rounded px-1.5 py-0.5">
                            <CheckCircle2 className="w-3 h-3" /> Ready to advance
                          </div>
                        ) : progress.nextStep ? (
                          <div className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground">
                            <ArrowRight className="w-3 h-3 text-blue-400 flex-shrink-0" />
                            <span className="truncate">
                              Next: {progress.nextStep.label}
                            </span>
                          </div>
                        ) : null)}
                      {record.agency && (
                        <div className="flex items-center gap-1.5 mt-2">
                          <Building2 className="w-3 h-3 text-muted-foreground/70" />
                          <span className="text-[11px] text-muted-foreground truncate">
                            {record.agency}
                          </span>
                        </div>
                      )}
                      {record.tags && record.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {record.tags.slice(0, 3).map((tag) => (
                            <span
                              key={tag}
                              className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-cyan-500/10 text-primary border border-blue-100 truncate max-w-[90px]"
                            >
                              {tag}
                            </span>
                          ))}
                          {record.tags.length > 3 && (
                            <span className="text-[10px] text-muted-foreground/70">
                              +{record.tags.length - 3}
                            </span>
                          )}
                        </div>
                      )}
                      <div className="flex items-center justify-between mt-2">
                        <div className="flex items-center gap-1 flex-wrap gap-y-0.5">
                          <Clock className="w-3 h-3 text-muted-foreground/70" />
                          <span className="text-[11px] text-muted-foreground/70">
                            {timeAgo(record.stage_entered_at)}
                          </span>
                          {record.updated_by_source && (
                            <span
                              className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold border ${
                                record.updated_by_source === 'training_hub'
                                  ? 'bg-purple-50 text-purple-700 border-purple-200'
                                  : record.updated_by_source === 'contracting_portal'
                                    ? 'bg-cyan-500/10 text-cyan-400 border-blue-200'
                                    : record.updated_by_source === 'ghl_webhook'
                                      ? 'bg-amber-500/10 text-amber-400 border-orange-200'
                                      : 'bg-secondary text-muted-foreground border-border'
                              }`}
                            >
                              {record.updated_by_source === 'training_hub'
                                ? 'Training'
                                : record.updated_by_source === 'contracting_portal'
                                  ? 'Contracting'
                                  : record.updated_by_source === 'ghl_webhook'
                                    ? 'GHL'
                                    : record.updated_by_source}
                            </span>
                          )}
                        </div>
                        {pushingIds.has(record.id) ? (
                          <Loader2 className="w-3 h-3 text-primary animate-spin" />
                        ) : record.wn_pending_review ? (
                          <div className="flex items-center gap-1 bg-amber-100 border border-amber-200 rounded px-1.5 py-0.5">
                            <FileCheck className="w-3 h-3 text-amber-600" />
                            <span className="text-[10px] text-amber-700 font-bold">
                              {record.wn_pending_count > 0
                                ? `${record.wn_pending_count} WN`
                                : 'WN'}
                            </span>
                          </div>
                        ) : (col.key === 'hip_broker_ready' ||
                            col.key === 'hip_career_ready') &&
                          record.writing_numbers ? (
                          <div className="flex items-center gap-1">
                            <PenLine className="w-3 h-3 text-emerald-500" />
                            <span className="text-[10px] text-emerald-600 font-medium truncate max-w-[60px]">
                              {record.writing_numbers}
                            </span>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
                {col.records.length === 0 && (
                  <div className="text-center py-6 text-xs text-muted-foreground/70">
                    No agents
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Toast */}
      {toastMsg && (
        <div
          className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-lg glow-primary text-sm font-medium transition-all ${
            toastMsg.type === 'success'
              ? 'bg-emerald-600 text-white'
              : 'bg-red-600 text-white'
          }`}
        >
          {toastMsg.text}
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
