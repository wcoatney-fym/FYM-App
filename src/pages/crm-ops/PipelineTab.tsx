/**
 * @crm-protected
 * DO NOT MODIFY without Charlie's explicit approval.
 * This file is part of CRM Ops (OpenClaw Dashboard).
 * Table references use hierarchy_agencies (NOT crm_agencies).
 * Any rename or schema change to hierarchy_agencies requires updating this file.
 * See: docs/CRM_OPS_FILES.md for the full protected file list.
 */
/**
 * @crm-team-protected
 *
 * DO NOT standardize agency names or apply crosswalk logic in this file.
 * DO NOT reference cc_agency_crosswalk or cleanDisplayName here.
 * CRM Team tab subtab — owns its own naming; see CrmTeam.tsx for context.
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  Archive,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  ExternalLink,
  Mail,
  MessageSquare,
  Phone,
  Search,
  Timer,
  User,
  Workflow,
  Building2,
  CircleDot,
  X,
  ListTodo,
  Loader2,
  Trash2,
  Hash,
  MapPin,
  Shield,
  FileText,
  UserX,
  AlertTriangle,
} from 'lucide-react';
import { supabase } from '@/lib/crm/portal-client';
import type { CrmAgent as Agent, CrmFormSubmission as FormSubmission } from '@/lib/crm/types';
import { formatPhoneDisplay } from '@/lib/crm/helpers';

type PipelineRecord = {
  id: string;
  agent_id: string | null;
  agency: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  seat_number: string;
  crm_number: string;
  agent_npn: string;
  stage: string;
  auto_advance_at: string | null;
  zap_sent_at: string | null;
  user_created_at: string | null;
  seat_filled_at: string | null;
  sunfire_workflows_at: string | null;
  agency_workflows_at: string | null;
  completed_at: string | null;
  terminated_at: string | null;
  notes: string;
  created_at: string;
  updated_at: string;
};

type HistoryRecord = {
  id: string;
  pipeline_record_id: string | null;
  agent_id: string | null;
  agency: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  seat_number: string;
  crm_number: string;
  agent_npn: string;
  final_stage: string;
  zap_sent_at: string | null;
  user_created_at: string | null;
  seat_filled_at: string | null;
  sunfire_workflows_at: string | null;
  agency_workflows_at: string | null;
  completed_at: string | null;
  terminated_at: string | null;
  notes: string;
  entered_at: string;
  created_at: string;
};

const STAGES = [
  { key: 'processing', label: 'Processing | Zap Running', icon: Timer, color: 'teal', auto: true },
  { key: 'sunfire_workflows', label: 'Sunfire Workflows', icon: Workflow, color: 'orange', auto: false },
  { key: 'agency_workflows', label: 'Agency Workflows', icon: Building2, color: 'rose', auto: false },
  { key: 'completed', label: 'Completed (7d)', icon: CheckCircle2, color: 'emerald', auto: false },
] as const;

const STAGE_COLORS: Record<string, { bg: string; border: string; text: string; dot: string; badge: string }> = {
  processing: { bg: 'bg-teal-500/10', border: 'border-teal-500/20', text: 'text-teal-400', dot: 'bg-teal-400', badge: 'bg-teal-400/10 text-teal-400' },
  sunfire_workflows: { bg: 'bg-amber-500/10', border: 'border-orange-500/20', text: 'text-amber-400', dot: 'bg-orange-400', badge: 'bg-orange-500/10 text-orange-300' },
  agency_workflows: { bg: 'bg-rose-500/10', border: 'border-rose-500/20', text: 'text-rose-400', dot: 'bg-rose-400', badge: 'bg-rose-500/10 text-rose-300' },
  completed: { bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', text: 'text-emerald-400', dot: 'bg-emerald-400', badge: 'bg-emerald-400/10 text-emerald-400' },
};

const formatCountdown = (ms: number) => {
  if (ms <= 0) return null;
  const totalSec = Math.ceil(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}m ${s.toString().padStart(2, '0')}s`;
};

const timeAgo = (dateStr: string) => {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
};

const sevenDaysAgo = () => {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return d;
};

export const PipelineTab: React.FC = () => {
  const [records, setRecords] = useState<PipelineRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'board' | 'tasks' | 'history' | 'terminations'>('board');
  const [agencyFilter, setAgencyFilter] = useState('All');
  const [agencyNames, setAgencyNames] = useState<string[]>([]);
  const [notesModal, setNotesModal] = useState<PipelineRecord | null>(null);
  const [noteText, setNoteText] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<PipelineRecord | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [detailRecord, setDetailRecord] = useState<PipelineRecord | null>(null);
  const [detailAgent, setDetailAgent] = useState<Agent | null>(null);
  const [detailSubmission, setDetailSubmission] = useState<FormSubmission | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [, setTick] = useState(0);
  const [historyRecords, setHistoryRecords] = useState<HistoryRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historySearch, setHistorySearch] = useState('');
  const [expandedAgencies, setExpandedAgencies] = useState<Set<string>>(new Set());
  const [terminationLog, setTerminationLog] = useState<{ id: string; agent_name: string; agent_npn: string; status: string; agency: string; terminated_at: string }[]>([]);
  const [terminationLogLoading, setTerminationLogLoading] = useState(false);

  const loadRecords = useCallback(async () => {
    const [pipelineRes, agencyRes] = await Promise.all([
      supabase.from('crm_pipeline').select('*').order('created_at', { ascending: false }),
      supabase.from('hierarchy_agencies').select('name').eq('is_active', true).order('name'),
    ]);
    setRecords(pipelineRes.data || []);
    setAgencyNames((agencyRes.data || []).map((a: { name: string }) => a.name));
    setLoading(false);
  }, []);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    const { data } = await supabase
      .from('crm_pipeline_history')
      .select('*')
      .order('entered_at', { ascending: false });
    setHistoryRecords(data || []);
    setHistoryLoading(false);
  }, []);

  useEffect(() => {
    loadRecords();
  }, [loadRecords]);

  const loadTerminationLog = useCallback(async () => {
    setTerminationLogLoading(true);
    const { data } = await supabase
      .from('crm_termination_log')
      .select('*')
      .order('terminated_at', { ascending: false });
    setTerminationLog(data || []);
    setTerminationLogLoading(false);
  }, []);

  useEffect(() => {
    if (viewMode === 'history' && historyRecords.length === 0) {
      loadHistory();
    }
    if (viewMode === 'terminations' && terminationLog.length === 0) {
      loadTerminationLog();
    }
  }, [viewMode, loadHistory, historyRecords.length, loadTerminationLog, terminationLog.length]);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const id = setInterval(async () => {
      const now = new Date().toISOString();
      const due = records.filter(
        (r) => r.stage === 'processing' && r.auto_advance_at && new Date(r.auto_advance_at).getTime() <= Date.now()
      );
      if (due.length === 0) return;

      for (const record of due) {
        const updates = {
          stage: 'sunfire_workflows',
          sunfire_workflows_at: now,
          updated_at: now,
        };
        const { error } = await supabase
          .from('crm_pipeline')
          .update(updates)
          .eq('id', record.id);

        if (!error) {
          setRecords((prev) =>
            prev.map((r) =>
              r.id === record.id ? { ...r, ...updates } as PipelineRecord : r
            )
          );
          await supabase
            .from('crm_pipeline_history')
            .update({ final_stage: 'sunfire_workflows', sunfire_workflows_at: now })
            .eq('pipeline_record_id', record.id);
        }
      }
    }, 15000);
    return () => clearInterval(id);
  }, [records]);

  const updateHistoryStage = async (pipelineRecordId: string, stage: string, extraFields?: Record<string, unknown>) => {
    const historyUpdates: Record<string, unknown> = { final_stage: stage, ...extraFields };
    await supabase
      .from('crm_pipeline_history')
      .update(historyUpdates)
      .eq('pipeline_record_id', pipelineRecordId);
  };

  const advanceStage = async (record: PipelineRecord) => {
    const stageKeys = STAGES.map((s) => s.key);
    const currentIdx = stageKeys.indexOf(record.stage as (typeof stageKeys)[number]);
    if (currentIdx < 0 || currentIdx >= stageKeys.length - 1) return;
    if (record.stage === 'processing') return;

    const nextStage = stageKeys[currentIdx + 1];
    const timestampField = `${nextStage}_at`;
    const now = new Date().toISOString();
    const updates: Record<string, unknown> = {
      stage: nextStage,
      [timestampField]: now,
      updated_at: now,
    };

    if (nextStage === 'completed') {
      updates.completed_at = now;
    }

    const { error } = await supabase
      .from('crm_pipeline')
      .update(updates)
      .eq('id', record.id);

    if (!error) {
      setRecords((prev) =>
        prev.map((r) =>
          r.id === record.id ? { ...r, ...updates } as PipelineRecord : r
        )
      );
      updateHistoryStage(record.id, nextStage, { [timestampField]: now, ...(nextStage === 'completed' ? { completed_at: now } : {}) });
    }
  };

  const regressStage = async (record: PipelineRecord) => {
    const stageKeys = STAGES.map((s) => s.key);
    const currentIdx = stageKeys.indexOf(record.stage as (typeof stageKeys)[number]);
    if (currentIdx <= 0) return;

    const prevStage = stageKeys[currentIdx - 1];
    const currentTimestampField = `${record.stage}_at` as string;
    const updates: Record<string, unknown> = {
      stage: prevStage,
      [currentTimestampField]: null,
      updated_at: new Date().toISOString(),
    };

    if (record.stage === 'completed') {
      updates.completed_at = null;
    }

    if (prevStage === 'processing') {
      updates.auto_advance_at = new Date(Date.now() + 3 * 60 * 1000).toISOString();
    }

    const { error } = await supabase
      .from('crm_pipeline')
      .update(updates)
      .eq('id', record.id);

    if (!error) {
      setRecords((prev) =>
        prev.map((r) =>
          r.id === record.id ? { ...r, ...updates } as PipelineRecord : r
        )
      );
      updateHistoryStage(record.id, prevStage, { [currentTimestampField]: null, ...(record.stage === 'completed' ? { completed_at: null } : {}) });
    }
  };

  const saveNotes = async () => {
    if (!notesModal) return;
    setSavingNotes(true);
    const { error } = await supabase
      .from('crm_pipeline')
      .update({ notes: noteText, updated_at: new Date().toISOString() })
      .eq('id', notesModal.id);

    if (!error) {
      setRecords((prev) =>
        prev.map((r) => (r.id === notesModal.id ? { ...r, notes: noteText } : r))
      );
      await supabase
        .from('crm_pipeline_history')
        .update({ notes: noteText })
        .eq('pipeline_record_id', notesModal.id);
    }
    setSavingNotes(false);
    setNotesModal(null);
  };

  const deleteRecord = async () => {
    if (!deleteConfirm) return;
    setDeleting(true);
    const { error } = await supabase
      .from('crm_pipeline')
      .delete()
      .eq('id', deleteConfirm.id);

    if (!error) {
      setRecords((prev) => prev.filter((r) => r.id !== deleteConfirm.id));
    }
    setDeleting(false);
    setDeleteConfirm(null);
  };

  const openDetail = async (record: PipelineRecord) => {
    setDetailRecord(record);
    setDetailAgent(null);
    setDetailSubmission(null);

    if (record.agent_id) {
      setDetailLoading(true);
      const [agentRes, subRes] = await Promise.all([
        supabase.from('agents').select('*').eq('id', record.agent_id).maybeSingle(),
        supabase.from('form_submissions').select('*').eq('agent_id', record.agent_id).maybeSingle(),
      ]);
      setDetailAgent(agentRes.data);
      setDetailSubmission(subRes.data);
      setDetailLoading(false);
    }
  };

  const closeDetail = () => {
    setDetailRecord(null);
    setDetailAgent(null);
    setDetailSubmission(null);
  };

  useEffect(() => {
    const id = setInterval(async () => {
      const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
      const expired = records.filter(
        (r) => r.terminated_at && Date.now() - new Date(r.terminated_at).getTime() > sevenDaysMs
      );
      if (expired.length === 0) return;

      for (const record of expired) {
        await supabase.from('crm_pipeline').delete().eq('id', record.id);
      }
      const expiredIds = new Set(expired.map((r) => r.id));
      setRecords((prev) => prev.filter((r) => !expiredIds.has(r.id)));
    }, 60000);
    return () => clearInterval(id);
  }, [records]);

  const allFiltered = agencyFilter === 'All'
    ? records
    : records.filter((r) => r.agency === agencyFilter);

  const sevenDayLimit = sevenDaysAgo();
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

  const terminatedRecords = allFiltered.filter(
    (r) => r.terminated_at && Date.now() - new Date(r.terminated_at).getTime() <= sevenDaysMs
  );

  const filtered = allFiltered.filter((r) => !r.terminated_at);

  const completedRecent = filtered.filter((r) => {
    if (!r.completed_at) return false;
    return new Date(r.completed_at) >= sevenDayLimit;
  });

  const manualTasks = filtered.filter(
    (r) => r.stage === 'sunfire_workflows' || r.stage === 'agency_workflows'
  );
  const processingRecords = filtered.filter((r) => r.stage === 'processing');
  const sunfireTasks = filtered.filter((r) => r.stage === 'sunfire_workflows');
  const agencyTasks = filtered.filter((r) => r.stage === 'agency_workflows');

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <div key={i} className="h-20 bg-card rounded-xl border border-border animate-pulse" />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <div key={i} className="h-64 bg-card rounded-2xl border border-border animate-pulse" />)}
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center gap-2 mb-5 glass rounded-xl p-1.5 overflow-x-auto shadow-none">
        {['All', ...agencyNames].map((a) => (
          <button
            key={a}
            onClick={() => setAgencyFilter(a)}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all whitespace-nowrap ${
              agencyFilter === a
                ? 'gradient-primary text-background shadow-none'
                : 'text-muted-foreground hover:bg-secondary'
            }`}
          >
            {a}
          </button>
        ))}
      </div>

      <div className={`grid grid-cols-2 ${terminatedRecords.length > 0 ? 'sm:grid-cols-5' : 'sm:grid-cols-4'} gap-4 mb-6`}>
        <StatCard label="In Pipeline" value={filtered.filter((r) => r.stage !== 'completed').length} color="text-primary" />
        <StatCard label="Awaiting Manual" value={manualTasks.length} color="text-orange-400" />
        <StatCard label="Completed (7d)" value={completedRecent.length} color="text-emerald-400" />
        {terminatedRecords.length > 0 && (
          <StatCard label="Terminated" value={terminatedRecords.length} color="text-red-400" />
        )}
        <StatCard label="Total Processed" value={filtered.length} color="text-muted-foreground" />
      </div>

      <div className="flex items-center justify-end mb-5">
        <div className="flex items-center bg-secondary rounded-lg p-0.5">
          <button
            onClick={() => setViewMode('board')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
              viewMode === 'board' ? 'bg-card text-primary shadow-none' : 'text-muted-foreground hover:text-primary'
            }`}
          >
            <CircleDot className="w-3.5 h-3.5" />
            Board
          </button>
          <button
            onClick={() => setViewMode('tasks')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
              viewMode === 'tasks' ? 'bg-card text-primary shadow-none' : 'text-muted-foreground hover:text-primary'
            }`}
          >
            <ListTodo className="w-3.5 h-3.5" />
            Tasks
          </button>
          <button
            onClick={() => setViewMode('history')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
              viewMode === 'history' ? 'bg-card text-primary shadow-none' : 'text-muted-foreground hover:text-primary'
            }`}
          >
            <Archive className="w-3.5 h-3.5" />
            History
          </button>
          <button
            onClick={() => setViewMode('terminations')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
              viewMode === 'terminations' ? 'bg-card text-primary shadow-none' : 'text-muted-foreground hover:text-primary'
            }`}
          >
            <UserX className="w-3.5 h-3.5" />
            Termination Log
          </button>
        </div>
      </div>

      {viewMode === 'board' ? (
        <BoardView
          records={filtered}
          completedRecent={completedRecent}
          onAdvance={advanceStage}
          onRegress={regressStage}
          onOpenNotes={(r) => { setNotesModal(r); setNoteText(r.notes); }}
          onDelete={setDeleteConfirm}
          onCardClick={openDetail}
        />
      ) : viewMode === 'tasks' ? (
        <TasksView
          processingRecords={processingRecords}
          sunfireTasks={sunfireTasks}
          agencyTasks={agencyTasks}
          completedRecent={completedRecent}
          onAdvance={advanceStage}
          onRegress={regressStage}
          onOpenNotes={(r) => { setNotesModal(r); setNoteText(r.notes); }}
          onDelete={setDeleteConfirm}
          onCardClick={openDetail}
        />
      ) : viewMode === 'history' ? (
        <HistoryView
          records={historyRecords}
          loading={historyLoading}
          search={historySearch}
          onSearchChange={setHistorySearch}
          agencyFilter={agencyFilter}
          expandedAgencies={expandedAgencies}
          onToggleAgency={(agency) => {
            setExpandedAgencies((prev) => {
              const next = new Set(prev);
              if (next.has(agency)) next.delete(agency);
              else next.add(agency);
              return next;
            });
          }}
        />
      ) : (
        <TerminationLogView
          records={terminationLog}
          loading={terminationLogLoading}
          agencyFilter={agencyFilter}
        />
      )}

      {terminatedRecords.length > 0 && (
        <div className="mt-6 rounded-2xl border border-red-500/20 bg-red-500/10 overflow-hidden shadow-none">
          <div className="px-5 py-4 flex items-center gap-3 border-b border-red-500/20">
            <AlertTriangle className="w-5 h-5 text-red-400" />
            <div>
              <h3 className="font-semibold text-red-400">Terminated Agents</h3>
              <p className="text-xs text-muted-foreground">Records auto-remove 7 days after termination</p>
            </div>
            <span className="ml-auto text-sm font-bold text-red-400">{terminatedRecords.length}</span>
          </div>
          <div className="px-3 pb-3 pt-2 space-y-2">
            {terminatedRecords.map((record) => {
              const daysRemaining = record.terminated_at
                ? Math.max(0, Math.ceil((7 * 24 * 60 * 60 * 1000 - (Date.now() - new Date(record.terminated_at).getTime())) / (24 * 60 * 60 * 1000)))
                : 0;
              return (
                <div key={record.id} className="bg-card rounded-xl border border-border p-4 flex items-center gap-4 shadow-none">
                  <div className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center flex-shrink-0">
                    <UserX className="w-4 h-4 text-red-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="font-semibold text-foreground text-sm">
                        {record.first_name} {record.last_name}
                      </span>
                      <AgencyBadge agency={record.agency} />
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span>Seat #{record.seat_number}</span>
                      <span>Terminated {new Date(record.terminated_at!).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                    </div>
                  </div>
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-full flex-shrink-0 ${
                    daysRemaining <= 1 ? 'bg-red-500/10 text-red-400' : 'bg-secondary text-muted-foreground'
                  }`}>
                    Removes in {daysRemaining}d
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {notesModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-2xl shadow-none max-w-lg w-full border border-border">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h2 className="text-lg font-bold text-foreground">
                Notes - {notesModal.first_name} {notesModal.last_name}
              </h2>
              <button onClick={() => setNotesModal(null)} className="p-1 hover:bg-secondary rounded transition-colors">
                <X className="w-5 h-5 text-muted-foreground/70" />
              </button>
            </div>
            <div className="px-6 py-5">
              <textarea
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                rows={5}
                placeholder="Add notes about this agent's onboarding..."
                className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring text-sm resize-none"
              />
            </div>
            <div className="px-6 py-4 bg-muted rounded-b-xl flex justify-end gap-3">
              <button
                onClick={() => setNotesModal(null)}
                className="px-4 py-2 text-sm font-medium text-foreground/80 glass rounded-lg hover:bg-muted transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={saveNotes}
                disabled={savingNotes}
                className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {savingNotes ? 'Saving...' : 'Save Notes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-2xl shadow-none max-w-md w-full border border-border">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h2 className="text-lg font-bold text-red-400">Delete Contact</h2>
              <button onClick={() => setDeleteConfirm(null)} className="p-1 hover:bg-secondary rounded transition-colors">
                <X className="w-5 h-5 text-muted-foreground/70" />
              </button>
            </div>
            <div className="px-6 py-5">
              <p className="text-foreground/80">
                Are you sure you want to delete{' '}
                <span className="font-semibold">{deleteConfirm.first_name} {deleteConfirm.last_name}</span>{' '}
                from the pipeline?
              </p>
              <p className="text-muted-foreground text-sm mt-2">This action cannot be undone.</p>
            </div>
            <div className="px-6 py-4 bg-muted rounded-b-xl flex justify-end gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                disabled={deleting}
                className="px-4 py-2 text-sm font-medium text-foreground/80 glass rounded-lg hover:bg-muted transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={deleteRecord}
                disabled={deleting}
                className="px-4 py-2 text-sm font-medium text-white bg-red-500 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {detailRecord && (
        <AgentDetailModal
          record={detailRecord}
          agent={detailAgent}
          submission={detailSubmission}
          loading={detailLoading}
          onClose={closeDetail}
        />
      )}
    </>
  );
};

interface HistoryViewProps {
  records: HistoryRecord[];
  loading: boolean;
  search: string;
  onSearchChange: (v: string) => void;
  agencyFilter: string;
  expandedAgencies: Set<string>;
  onToggleAgency: (agency: string) => void;
}

const STAGE_LABELS: Record<string, string> = {
  processing: 'Processing',
  sunfire_workflows: 'Sunfire Workflows',
  agency_workflows: 'Agency Workflows',
  completed: 'Completed',
};

const HistoryView: React.FC<HistoryViewProps> = ({ records, loading, search, onSearchChange, agencyFilter, expandedAgencies, onToggleAgency }) => {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-5 h-5 animate-spin text-primary" />
        <span className="ml-2 text-sm text-muted-foreground">Loading history...</span>
      </div>
    );
  }

  const searchLower = search.toLowerCase();
  const filtered = records.filter((r) => {
    if (agencyFilter !== 'All' && r.agency !== agencyFilter) return false;
    if (!search) return true;
    return (
      r.first_name.toLowerCase().includes(searchLower) ||
      r.last_name.toLowerCase().includes(searchLower) ||
      r.email.toLowerCase().includes(searchLower) ||
      r.agent_npn.includes(search)
    );
  });

  const grouped = filtered.reduce<Record<string, HistoryRecord[]>>((acc, r) => {
    if (!acc[r.agency]) acc[r.agency] = [];
    acc[r.agency].push(r);
    return acc;
  }, {});

  const sortedAgencies = Object.keys(grouped).sort();

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/70" />
          <input
            type="text"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search by name, email, or NPN..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring"
          />
        </div>
        <span className="text-xs text-muted-foreground font-medium">
          {filtered.length} record{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {sortedAgencies.length === 0 ? (
        <div className="text-center py-12">
          <Archive className="w-8 h-8 text-muted-foreground/60 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No history records found</p>
        </div>
      ) : (
        sortedAgencies.map((agency) => {
          const agencyRecords = grouped[agency];
          const isExpanded = expandedAgencies.has(agency);

          return (
            <div key={agency} className="border border-border rounded-xl overflow-hidden shadow-none">
              <button
                onClick={() => onToggleAgency(agency)}
                className="w-full flex items-center gap-3 px-5 py-3.5 bg-muted hover:bg-secondary transition-colors text-left"
              >
                <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${isExpanded ? '' : '-rotate-90'}`} />
                <span className="font-semibold text-foreground text-sm">{agency}</span>
                <span className="ml-auto text-xs font-bold text-muted-foreground bg-card border border-border px-2 py-0.5 rounded-full">
                  {agencyRecords.length}
                </span>
              </button>

              {isExpanded && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-t border-border bg-muted/50">
                        <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Agent</th>
                        <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Seat</th>
                        <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">NPN</th>
                        <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Stage</th>
                        <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Entered</th>
                        <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Notes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      {agencyRecords.map((r) => {
                        const stageColors = STAGE_COLORS[r.final_stage];
                        return (
                          <tr key={r.id} className="hover:bg-muted transition-colors">
                            <td className="px-4 py-3">
                              <div className="font-medium text-foreground">{r.first_name} {r.last_name}</div>
                              <div className="text-xs text-muted-foreground">{r.email}</div>
                            </td>
                            <td className="px-4 py-3 text-foreground/80">#{r.seat_number || '--'}</td>
                            <td className="px-4 py-3 text-foreground/80 font-mono text-xs">{r.agent_npn || '--'}</td>
                            <td className="px-4 py-3">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${stageColors?.badge || 'bg-secondary text-foreground/80'}`}>
                                {STAGE_LABELS[r.final_stage] || r.final_stage}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-muted-foreground text-xs whitespace-nowrap">
                              {new Date(r.entered_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                            </td>
                            <td className="px-4 py-3 text-muted-foreground text-xs max-w-[200px] truncate">
                              {r.notes || '--'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
};

const StatCard: React.FC<{ label: string; value: number; color: string }> = ({ label, value, color }) => (
  <div className="bg-card rounded-xl border border-border p-4 shadow-none hover:shadow-none transition-all duration-200">
    <p className="text-xs font-medium text-muted-foreground mb-1">{label}</p>
    <p className={`text-2xl font-bold ${color}`}>{value}</p>
  </div>
);

interface BoardViewProps {
  records: PipelineRecord[];
  completedRecent: PipelineRecord[];
  onAdvance: (r: PipelineRecord) => void;
  onRegress: (r: PipelineRecord) => void;
  onOpenNotes: (r: PipelineRecord) => void;
  onDelete: (r: PipelineRecord) => void;
  onCardClick: (r: PipelineRecord) => void;
}

const BoardView: React.FC<BoardViewProps> = ({ records, completedRecent, onAdvance, onRegress, onOpenNotes, onDelete, onCardClick }) => (
  <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
    {STAGES.map((stage) => {
      const stageRecords = stage.key === 'completed'
        ? completedRecent
        : records.filter((r) => r.stage === stage.key);
      const colors = STAGE_COLORS[stage.key];
      const StageIcon = stage.icon;

      return (
        <div key={stage.key} className={`rounded-2xl border ${colors.border} bg-card/50 min-h-[300px] shadow-none`}>
          <div className={`flex items-center gap-2 px-3.5 py-3 border-b ${colors.border} rounded-t-2xl ${colors.bg}`}>
            <StageIcon className={`w-4 h-4 ${colors.text}`} />
            <span className={`text-xs font-semibold ${colors.text}`}>{stage.label}</span>
            <span className={`ml-auto text-[11px] font-bold px-2 py-0.5 rounded-full ${colors.badge}`}>
              {stageRecords.length}
            </span>
          </div>
          <div className="p-2.5 space-y-2.5 max-h-[600px] overflow-y-auto">
            {stageRecords.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-8">No agents</p>
            ) : (
              stageRecords.map((record) => (
                <PipelineCard
                  key={record.id}
                  record={record}
                  onAdvance={stage.key !== 'completed' && stage.key !== 'processing' ? () => onAdvance(record) : undefined}
                  onRegress={stage.key !== 'processing' ? () => onRegress(record) : undefined}
                  onOpenNotes={() => onOpenNotes(record)}
                  onDelete={() => onDelete(record)}
                  onCardClick={() => onCardClick(record)}
                  compact
                />
              ))
            )}
          </div>
        </div>
      );
    })}
  </div>
);

interface TasksViewProps {
  processingRecords: PipelineRecord[];
  sunfireTasks: PipelineRecord[];
  agencyTasks: PipelineRecord[];
  completedRecent: PipelineRecord[];
  onAdvance: (r: PipelineRecord) => void;
  onRegress: (r: PipelineRecord) => void;
  onOpenNotes: (r: PipelineRecord) => void;
  onDelete: (r: PipelineRecord) => void;
  onCardClick: (r: PipelineRecord) => void;
}

const TasksView: React.FC<TasksViewProps> = ({ processingRecords, sunfireTasks, agencyTasks, completedRecent, onAdvance, onRegress, onOpenNotes, onDelete, onCardClick }) => (
  <div className="space-y-6">
    {processingRecords.length > 0 && (
      <TaskSection
        title="Incoming -- Processing"
        description="These agents will appear in Sunfire Workflows when processing completes"
        icon={Timer}
        color="teal"
        records={processingRecords}
        onAdvance={() => {}}
        onRegress={() => {}}
        onOpenNotes={onOpenNotes}
        onDelete={onDelete}
        onCardClick={onCardClick}
        actionLabel=""
        processing
      />
    )}
    <TaskSection
      title="Sunfire Subaccount Workflows"
      description="Adjust workflows in the Sunfire subaccount for these agents"
      icon={Workflow}
      color="orange"
      records={sunfireTasks}
      onAdvance={onAdvance}
      onRegress={onRegress}
      onOpenNotes={onOpenNotes}
      onDelete={onDelete}
      onCardClick={onCardClick}
      actionLabel="Mark Sunfire Done"
    />
    <TaskSection
      title="Agency Account Workflows"
      description="Adjust workflows in the agency account for these agents"
      icon={Building2}
      color="rose"
      records={agencyTasks}
      onAdvance={onAdvance}
      onRegress={onRegress}
      onOpenNotes={onOpenNotes}
      onDelete={onDelete}
      onCardClick={onCardClick}
      actionLabel="Mark Agency Done"
    />
    <TaskSection
      title="Completed (Last 7 Days)"
      description="Agents fully onboarded in the past 7 days"
      icon={CheckCircle2}
      color="emerald"
      records={completedRecent}
      onAdvance={() => {}}
      onRegress={onRegress}
      onOpenNotes={onOpenNotes}
      onDelete={onDelete}
      onCardClick={onCardClick}
      actionLabel=""
      completed
    />
  </div>
);

interface TaskSectionProps {
  title: string;
  description: string;
  icon: React.FC<{ className?: string }>;
  color: string;
  records: PipelineRecord[];
  onAdvance: (r: PipelineRecord) => void;
  onRegress: (r: PipelineRecord) => void;
  onOpenNotes: (r: PipelineRecord) => void;
  onDelete: (r: PipelineRecord) => void;
  onCardClick: (r: PipelineRecord) => void;
  actionLabel: string;
  completed?: boolean;
  processing?: boolean;
}

const TaskSection: React.FC<TaskSectionProps> = ({
  title,
  description,
  icon: Icon,
  color,
  records,
  onAdvance,
  onRegress,
  onOpenNotes,
  onDelete,
  onCardClick,
  actionLabel,
  completed,
  processing,
}) => {
  const colorMap: Record<string, { bg: string; border: string; text: string; button: string }> = {
    teal: { bg: 'bg-teal-500/10', border: 'border-teal-500/20', text: 'text-teal-400', button: 'bg-teal-500 hover:bg-teal-600' },
    orange: { bg: 'bg-amber-500/10', border: 'border-orange-500/20', text: 'text-amber-400', button: 'bg-amber-500/100/100 hover:bg-orange-600' },
    rose: { bg: 'bg-rose-500/10', border: 'border-rose-500/20', text: 'text-rose-400', button: 'bg-rose-500 hover:bg-rose-600' },
    emerald: { bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', text: 'text-emerald-400', button: 'bg-emerald-500/100 hover:bg-emerald-500' },
  };
  const colors = colorMap[color] || colorMap.teal;

  return (
    <div className={`rounded-2xl border ${colors.border} ${colors.bg} overflow-hidden shadow-none`}>
      <div className="px-5 py-4 flex items-center gap-3">
        <Icon className={`w-5 h-5 ${colors.text}`} />
        <div>
          <h3 className={`font-semibold text-sm ${colors.text}`}>{title}</h3>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        <span className={`ml-auto text-sm font-bold ${colors.text}`}>{records.length}</span>
      </div>
      {records.length === 0 ? (
        <div className="px-5 pb-5">
          <p className="text-sm text-muted-foreground">
            {completed ? 'No agents completed recently.' : 'No pending tasks -- you\'re all caught up!'}
          </p>
        </div>
      ) : (
        <div className="px-3 pb-3 space-y-2">
          {records.map((record) => (
            <div key={record.id} className="bg-card rounded-xl border border-border p-4 flex items-center gap-4 shadow-none hover:shadow-none transition-all duration-200">
              <div className="flex-1 min-w-0 cursor-pointer" onClick={() => onCardClick(record)}>
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-semibold text-foreground text-sm hover:text-primary transition-colors">
                    {record.first_name} {record.last_name}
                  </span>
                  <AgencyBadge agency={record.agency} />
                  {processing && <CountdownBadge record={record} />}
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span>Seat #{record.seat_number}</span>
                  {record.agent_npn && <span>NPN: {record.agent_npn}</span>}
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {timeAgo(record.created_at)}
                  </span>
                </div>
                {record.notes && (
                  <p className="text-xs text-muted-foreground mt-1 italic truncate">{record.notes}</p>
                )}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={() => onOpenNotes(record)}
                  className="p-2 text-muted-foreground/70 hover:text-muted-foreground hover:bg-secondary rounded-lg transition-colors"
                  title="Notes"
                >
                  <MessageSquare className="w-4 h-4" />
                </button>
                <button
                  onClick={() => onDelete(record)}
                  className="p-2 text-muted-foreground/70 hover:text-red-400 hover:bg-red-500/20 rounded-lg transition-colors"
                  title="Delete"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
                {!processing && STAGES.findIndex((s) => s.key === record.stage) > 0 && (
                  <button
                    onClick={() => onRegress(record)}
                    className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-muted-foreground glass rounded-lg hover:bg-muted transition-colors"
                    title={`Move back to ${STAGES[STAGES.findIndex((s) => s.key === record.stage) - 1]?.label}`}
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                    Back
                  </button>
                )}
                {!completed && !processing && actionLabel && (
                  <button
                    onClick={() => onAdvance(record)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white rounded-lg transition-colors ${colors.button}`}
                  >
                    {actionLabel}
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

interface PipelineCardProps {
  record: PipelineRecord;
  onAdvance?: () => void;
  onRegress?: () => void;
  onOpenNotes: () => void;
  onDelete: () => void;
  onCardClick: () => void;
  compact?: boolean;
}

const PipelineCard: React.FC<PipelineCardProps> = ({ record, onAdvance, onRegress, onOpenNotes, onDelete, onCardClick, compact }) => {
  const isProcessing = record.stage === 'processing';
  const nextStage = STAGES[STAGES.findIndex((s) => s.key === record.stage) + 1];

  return (
    <div className={`bg-card rounded-xl border border-border shadow-none hover:shadow-none hover:border-primary transition-all duration-200 ${compact ? 'p-3' : 'p-4'}`}>
      <div className="flex items-start justify-between mb-1.5">
        <div className="min-w-0 cursor-pointer" onClick={onCardClick}>
          <p className={`font-semibold text-foreground truncate hover:text-primary transition-colors ${compact ? 'text-xs' : 'text-sm'}`}>
            {record.first_name} {record.last_name}
          </p>
          <AgencyBadge agency={record.agency} />
        </div>
        <div className="flex items-center gap-0.5 flex-shrink-0">
          <button
            onClick={onOpenNotes}
            className={`p-1 text-muted-foreground/70 hover:text-muted-foreground rounded transition-colors ${record.notes ? 'text-primary' : ''}`}
            title="Notes"
          >
            <MessageSquare className={compact ? 'w-3 h-3' : 'w-4 h-4'} />
          </button>
          <button
            onClick={onDelete}
            className="p-1 text-muted-foreground/70 hover:text-red-400 rounded transition-colors"
            title="Delete"
          >
            <Trash2 className={compact ? 'w-3 h-3' : 'w-4 h-4'} />
          </button>
        </div>
      </div>

      <div className={`text-muted-foreground space-y-0.5 mb-2 ${compact ? 'text-[10px]' : 'text-xs'}`}>
        <p>Seat #{record.seat_number}</p>
        <p className="flex items-center gap-1">
          <Clock className="w-3 h-3" />
          {timeAgo(record.created_at)}
        </p>
      </div>

      {record.notes && (
        <p className={`text-muted-foreground/70 italic truncate mb-2 ${compact ? 'text-[10px]' : 'text-xs'}`}>{record.notes}</p>
      )}

      {isProcessing && <CountdownBadge record={record} compact={compact} />}

      {(onRegress || (onAdvance && nextStage && !isProcessing)) && (
        <div className="flex items-center gap-1.5">
          {onRegress && (
            <button
              onClick={onRegress}
              className={`flex items-center justify-center gap-0.5 py-1.5 px-2 text-muted-foreground bg-card border border-border rounded-md hover:bg-muted transition-colors ${compact ? 'text-[10px]' : 'text-xs'} font-medium`}
              title={`Move back to ${STAGES[STAGES.findIndex((s) => s.key === record.stage) - 1]?.label}`}
            >
              <ChevronLeft className="w-3 h-3" />
            </button>
          )}
          {onAdvance && nextStage && !isProcessing && (
            <button
              onClick={onAdvance}
              className={`flex-1 flex items-center justify-center gap-1 py-1.5 text-white rounded-md transition-colors ${compact ? 'text-[10px]' : 'text-xs'} font-medium ${
                STAGE_COLORS[record.stage]?.text.includes('orange') ? 'bg-amber-500/100/100 hover:bg-orange-600' :
                STAGE_COLORS[record.stage]?.text.includes('rose') ? 'bg-rose-500 hover:bg-rose-600' :
                'bg-muted hover:bg-secondary'
              }`}
            >
              {nextStage.label}
              <ChevronRight className="w-3 h-3" />
            </button>
          )}
        </div>
      )}
    </div>
  );
};

const CountdownBadge: React.FC<{ record: PipelineRecord; compact?: boolean }> = ({ record, compact }) => {
  const remaining = record.auto_advance_at
    ? new Date(record.auto_advance_at).getTime() - Date.now()
    : 0;
  const countdown = formatCountdown(remaining);

  if (!countdown) {
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-teal-500/10 text-teal-400 font-medium animate-pulse ${compact ? 'text-[9px]' : 'text-[10px]'}`}>
        <Loader2 className="w-3 h-3 animate-spin" />
        Moving...
      </span>
    );
  }

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-teal-500/10 text-teal-400 font-medium ${compact ? 'text-[9px]' : 'text-[10px]'}`}>
      <Timer className="w-3 h-3" />
      {countdown}
    </span>
  );
};

interface AgentDetailModalProps {
  record: PipelineRecord;
  agent: Agent | null;
  submission: FormSubmission | null;
  loading: boolean;
  onClose: () => void;
}

const formatDate = (dateStr: string | null) => {
  if (!dateStr) return '--';
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};

const maskSSN = (ssn: string) => {
  const digits = ssn.replace(/\D/g, '');
  if (digits.length < 4) return ssn;
  return `***-**-${digits.slice(-4)}`;
};

const AgentDetailModal: React.FC<AgentDetailModalProps> = ({ record, agent, submission, loading, onClose }) => {
  const currentStage = STAGES.find((s) => s.key === record.stage);
  const stageColors = STAGE_COLORS[record.stage];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-card rounded-xl shadow-none max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-card border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-card/20 flex items-center justify-center">
              <User className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">
                {record.first_name} {record.last_name}
              </h2>
              <div className="flex items-center gap-2 mt-0.5">
                <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${stageColors?.badge || 'bg-secondary text-foreground/80'}`}>
                  {currentStage && <currentStage.icon className="w-3 h-3" />}
                  {currentStage?.label}
                </span>
                <AgencyBadge agency={record.agency} />
              </div>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-card/20 rounded-lg transition-colors">
            <X className="w-5 h-5 text-white" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-6 space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <DetailField icon={Mail} label="Email" value={record.email} />
            <DetailField icon={Phone} label="Phone" value={formatPhoneDisplay(record.phone)} />
            <DetailField icon={Hash} label="Seat Number" value={record.seat_number || '--'} />
            <DetailField icon={Hash} label="CRM Number" value={record.crm_number ? formatPhoneDisplay(record.crm_number) : '--'} />
            <DetailField icon={Shield} label="NPN" value={record.agent_npn || '--'} />
            <DetailField icon={Building2} label="Agency" value={record.agency} />
          </div>

          <div>
            <h3 className="text-sm font-semibold text-foreground/80 mb-3 flex items-center gap-2">
              <Clock className="w-4 h-4 text-muted-foreground/70" />
              Pipeline Timeline
            </h3>
            <div className="bg-muted rounded-lg border border-border divide-y divide-border">
              <TimelineRow label="Entered Pipeline" value={formatDate(record.created_at)} />
              <TimelineRow label="Zap Sent" value={formatDate(record.zap_sent_at)} />
              <TimelineRow label="User Created" value={formatDate(record.user_created_at)} />
              <TimelineRow label="Seat Filled" value={formatDate(record.seat_filled_at)} />
              <TimelineRow label="Sunfire Workflows" value={formatDate(record.sunfire_workflows_at)} />
              <TimelineRow label="Agency Workflows" value={formatDate(record.agency_workflows_at)} />
              <TimelineRow label="Completed" value={formatDate(record.completed_at)} />
            </div>
          </div>

          {record.notes && (
            <div>
              <h3 className="text-sm font-semibold text-foreground/80 mb-2 flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-muted-foreground/70" />
                Notes
              </h3>
              <p className="text-sm text-muted-foreground bg-muted rounded-lg border border-border p-3 whitespace-pre-wrap">
                {record.notes}
              </p>
            </div>
          )}

          {loading && (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
              <span className="ml-2 text-sm text-muted-foreground">Loading agent details...</span>
            </div>
          )}

          {agent && (
            <div>
              <h3 className="text-sm font-semibold text-foreground/80 mb-3 flex items-center gap-2">
                <FileText className="w-4 h-4 text-muted-foreground/70" />
                Linked Agent Record
              </h3>
              <div className="bg-muted rounded-lg border border-border p-4">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-muted-foreground text-xs">Form Type</span>
                    <p className="font-medium text-foreground capitalize">{agent.form_type.replace('-', ' ')}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground text-xs">Status</span>
                    <p className="font-medium text-foreground capitalize">{agent.status}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground text-xs">CRM Onboarded</span>
                    <p className="font-medium text-foreground">{agent.crm_onboarded ? 'Yes' : 'No'}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground text-xs">Date Completed</span>
                    <p className="font-medium text-foreground">{formatDate(agent.date_completed)}</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {submission && (
            <div>
              <h3 className="text-sm font-semibold text-foreground/80 mb-3 flex items-center gap-2">
                <ExternalLink className="w-4 h-4 text-muted-foreground/70" />
                Form Submission
              </h3>
              <div className="bg-muted rounded-lg border border-border p-4">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-muted-foreground text-xs">NPN</span>
                    <p className="font-medium text-foreground font-mono">{submission.npn || '--'}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground text-xs">SSN</span>
                    <p className="font-medium text-foreground font-mono">{submission.ssn ? maskSSN(submission.ssn) : '--'}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground text-xs">Date of Birth</span>
                    <p className="font-medium text-foreground">{submission.date_of_birth || '--'}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground text-xs">Resident State</span>
                    <p className="font-medium text-foreground">{submission.resident_state || '--'}</p>
                  </div>
                  {submission.address && (
                    <div className="col-span-2">
                      <span className="text-muted-foreground text-xs">Address</span>
                      <p className="font-medium text-foreground flex items-center gap-1">
                        <MapPin className="w-3 h-3 text-muted-foreground/70 flex-shrink-0" />
                        {submission.address}, {submission.city}, {submission.state} {submission.postal_code}
                      </p>
                    </div>
                  )}
                  <div>
                    <span className="text-muted-foreground text-xs">Resident License #</span>
                    <p className="font-medium text-foreground font-mono">{submission.resident_license_number || '--'}</p>
                  </div>
                  {submission.state_licenses && submission.state_licenses.length > 0 && (
                    <div>
                      <span className="text-muted-foreground text-xs">State Licenses</span>
                      <p className="font-medium text-foreground">{submission.state_licenses.join(', ')}</p>
                    </div>
                  )}
                  <div>
                    <span className="text-muted-foreground text-xs">Submitted</span>
                    <p className="font-medium text-foreground">{formatDate(submission.submitted_at)}</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {!loading && !agent && record.agent_id && (
            <p className="text-sm text-muted-foreground/70 italic">Linked agent record not found.</p>
          )}

          {!record.agent_id && (
            <p className="text-sm text-muted-foreground/70 italic">No linked agent record for this pipeline entry.</p>
          )}
        </div>
      </div>
    </div>
  );
};

const DetailField: React.FC<{ icon: React.FC<{ className?: string }>; label: string; value: string }> = ({ icon: Icon, label, value }) => (
  <div className="flex items-start gap-2.5">
    <Icon className="w-4 h-4 text-muted-foreground/70 mt-0.5 flex-shrink-0" />
    <div className="min-w-0">
      <p className="text-[11px] text-muted-foreground leading-tight">{label}</p>
      <p className="text-sm font-medium text-foreground truncate">{value}</p>
    </div>
  </div>
);

const TimelineRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="flex items-center justify-between px-4 py-2.5">
    <span className="text-xs text-muted-foreground">{label}</span>
    <span className={`text-xs font-medium ${value === '--' ? 'text-muted-foreground/60' : 'text-foreground'}`}>{value}</span>
  </div>
);

const TerminationLogView: React.FC<{
  records: { id: string; agent_name: string; agent_npn: string; status: string; agency: string; terminated_at: string }[];
  loading: boolean;
  agencyFilter: string;
}> = ({ records, loading, agencyFilter }) => {
  const filtered = agencyFilter === 'All' ? records : records.filter((r) => r.agency === agencyFilter);

  if (loading) {
    return (
      <div className="bg-card rounded-2xl border border-border p-8 text-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">Loading termination log...</p>
      </div>
    );
  }

  if (filtered.length === 0) {
    return (
      <div className="bg-card rounded-2xl border border-border p-8 text-center">
        <UserX className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">No termination records found.</p>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-2xl border border-border overflow-hidden shadow-none">
      <div className="px-5 py-4 border-b border-border flex items-center gap-3">
        <UserX className="w-5 h-5 text-red-400" />
        <div>
          <h3 className="font-semibold text-foreground">Termination Log</h3>
          <p className="text-xs text-muted-foreground">{filtered.length} record{filtered.length !== 1 ? 's' : ''}</p>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted">
              <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Agent Name</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">NPN</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Agency</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.map((record) => (
              <tr key={record.id} className="hover:bg-muted transition-colors">
                <td className="px-5 py-3.5 font-medium text-foreground">{record.agent_name}</td>
                <td className="px-5 py-3.5 text-muted-foreground font-mono text-xs">{record.agent_npn || '--'}</td>
                <td className="px-5 py-3.5">
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-400/10 text-red-400">
                    {record.status}
                  </span>
                </td>
                <td className="px-5 py-3.5"><AgencyBadge agency={record.agency} /></td>
                <td className="px-5 py-3.5 text-muted-foreground text-xs">
                  {new Date(record.terminated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  {' '}
                  <span className="text-muted-foreground/70">
                    {new Date(record.terminated_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const AgencyBadge: React.FC<{ agency: string }> = ({ agency }) => {
  const colors: Record<string, string> = {
    FYM: 'bg-primary/5 text-primary',
    Wisechoice: 'bg-emerald-500/10 text-emerald-400',
    Aspire: 'bg-amber-500/10 text-amber-400',
  };
  return (
    <span className={`inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded ${colors[agency] || 'bg-secondary text-muted-foreground'}`}>
      {agency}
    </span>
  );
};
