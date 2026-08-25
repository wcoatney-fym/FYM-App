/**
 * CoachingPlanDrawer — Detail view for a coaching plan
 *
 * Slide-out drawer showing:
 * - Agent info + flag badge + deadline countdown
 * - Stage transition buttons
 * - Action plan (requirements list with add/complete/delete)
 * - Notes thread
 * - Stage history timeline
 */
import { useState, useEffect, useCallback } from 'react';
import {
  X, Clock, User, Target, CheckCircle2, Plus, Trash2,
  ListChecks, Send, AlertTriangle, ArrowRight,
  Loader2,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  FLAG_TYPE_COLORS,
  FLAG_TYPE_LABELS,
  COACHING_STAGE_LABELS,
  COACHING_STAGE_COLORS,
  REQUIREMENT_TYPE_LABELS,
  REQUIREMENT_TYPE_ICONS,
  daysRemaining,
  validNextStages,
  isTerminal,
  type CoachingCard,
  type CoachingNote,
  type CoachingStageHistoryEntry,
  type CoachingRequirement,
  type CoachingStage,
  type CoachingRequirementType,
} from '@/lib/coaching/types';
import {
  fetchCoachingPlanDetail,
  fetchCoachingNotes,
  fetchStageHistory,
  advanceCoachingStage,
  addRequirement,
  completeRequirement,
  deleteRequirement,
  addCoachingNote,
} from '@/lib/coaching/api';
import { useEffectiveAuth } from '@/hooks/useEffectiveAuth';

interface CoachingPlanDrawerProps {
  planId: string | null;
  onClose: () => void;
  onStageChanged: () => void;
}

export function CoachingPlanDrawer({ planId, onClose, onStageChanged }: CoachingPlanDrawerProps) {
  const { profile, effectiveRole } = useEffectiveAuth();
  const profileId = profile?.id ?? null;
  const [plan, setPlan] = useState<CoachingCard | null>(null);
  const [notes, setNotes] = useState<CoachingNote[]>([]);
  const [history, setHistory] = useState<CoachingStageHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'plan' | 'notes' | 'history'>('plan');

  // Note input
  const [noteDraft, setNoteDraft] = useState('');
  const [sendingNote, setSendingNote] = useState(false);

  // Add requirement form
  const [showAddReq, setShowAddReq] = useState(false);
  const [newReqType, setNewReqType] = useState<CoachingRequirementType>('custom_task');
  const [newReqTitle, setNewReqTitle] = useState('');
  const [newReqDesc, setNewReqDesc] = useState('');
  const [newReqCount, setNewReqCount] = useState(3);
  const [addingReq, setAddingReq] = useState(false);

  // Stage transition
  const [transitioning, setTransitioning] = useState(false);

  const loadDetail = useCallback(async () => {
    if (!planId) return;
    setLoading(true);
    const [planData, notesData, historyData] = await Promise.all([
      fetchCoachingPlanDetail(planId),
      fetchCoachingNotes(planId),
      fetchStageHistory(planId),
    ]);
    setPlan(planData);
    setNotes(notesData);
    setHistory(historyData);
    setLoading(false);
  }, [planId]);

  useEffect(() => {
    if (planId) {
      loadDetail();
      setActiveTab('plan');
      setNoteDraft('');
      setShowAddReq(false);
    }
  }, [planId, loadDetail]);

  const handleAdvanceStage = async (toStage: CoachingStage) => {
    if (!plan || !profileId) return;
    setTransitioning(true);
    const result = await advanceCoachingStage(plan.id, toStage, profileId);
    if (result) {
      await loadDetail();
      onStageChanged();
    }
    setTransitioning(false);
  };

  const handleAddRequirement = async () => {
    if (!plan || !newReqTitle.trim()) return;
    setAddingReq(true);
    await addRequirement({
      planId: plan.id,
      type: newReqType,
      title: newReqTitle.trim(),
      description: newReqDesc.trim() || undefined,
      requiredCount: newReqType === 'live_attendance' ? newReqCount : undefined,
      sortOrder: (plan.requirements.length),
    });
    setNewReqTitle('');
    setNewReqDesc('');
    setShowAddReq(false);
    await loadDetail();
    setAddingReq(false);
  };

  const handleCompleteReq = async (reqId: string) => {
    if (!profileId) return;
    await completeRequirement(reqId, profileId);
    await loadDetail();
  };

  const handleDeleteReq = async (reqId: string) => {
    await deleteRequirement(reqId);
    await loadDetail();
  };

  const handleSendNote = async () => {
    if (!plan || !profileId || !noteDraft.trim()) return;
    setSendingNote(true);
    await addCoachingNote(plan.id, profileId, noteDraft.trim());
    setNoteDraft('');
    const notesData = await fetchCoachingNotes(plan.id);
    setNotes(notesData);
    setSendingNote(false);
  };

  if (!planId) return null;

  const activeFlags = plan?.active_flag_types ?? [];
  const days = plan ? daysRemaining(plan.deadline) : 0;
  const isOverdue = days < 0;
  const nextStages = plan ? validNextStages(plan.stage) : [];
  const canEdit = effectiveRole === 'admin' || effectiveRole === 'manager';

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-40"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="fixed right-0 top-0 bottom-0 w-full max-w-lg bg-background border-l border-border z-50 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-border flex items-start justify-between">
          <div className="min-w-0">
            {loading ? (
              <div className="h-6 w-48 rounded shimmer" />
            ) : plan ? (
              <>
                <div className="flex items-center gap-2 mb-1">
                  <h2 className="text-lg font-semibold text-foreground truncate">
                    {plan.agent_first_name} {plan.agent_last_name}
                  </h2>
                  {activeFlags.map(ft => (
                    <Badge key={ft} variant="outline" className={`text-[10px] shrink-0 ${FLAG_TYPE_COLORS[ft].badge}`}>
                      {FLAG_TYPE_COLORS[ft].icon} {FLAG_TYPE_LABELS[ft]}
                    </Badge>
                  ))}
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  {plan.agent_writing_number && (
                    <span className="font-mono">WN: {plan.agent_writing_number}</span>
                  )}
                  <span className="flex items-center gap-1">
                    <Badge variant="outline" className={`text-[10px] ${COACHING_STAGE_COLORS[plan.stage].badge}`}>
                      {COACHING_STAGE_LABELS[plan.stage]}
                    </Badge>
                  </span>
                  <span className={`flex items-center gap-1 ${isOverdue ? 'text-red-400 font-medium' : ''}`}>
                    <Clock size={11} />
                    {isOverdue ? `${Math.abs(days)}d overdue` : `${days}d left`}
                  </span>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Plan not found</p>
            )}
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} className="shrink-0">
            <X size={16} />
          </Button>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="animate-spin text-muted-foreground" size={24} />
          </div>
        ) : plan ? (
          <>
            {/* Stage transition buttons */}
            {canEdit && nextStages.length > 0 && !isTerminal(plan.stage) && (
              <div className="px-4 py-2 border-b border-border flex items-center gap-2 flex-wrap">
                <span className="text-xs text-muted-foreground mr-1">Move to:</span>
                {nextStages.map(stage => (
                  <Button
                    key={stage}
                    size="sm"
                    variant={stage === 'escalated' ? 'destructive' : stage === 'resolved' ? 'default' : 'outline'}
                    onClick={() => handleAdvanceStage(stage)}
                    disabled={transitioning}
                    className="h-7 text-xs gap-1"
                  >
                    <ArrowRight size={11} />
                    {COACHING_STAGE_LABELS[stage]}
                  </Button>
                ))}
              </div>
            )}

            {/* Tabs */}
            <div className="px-4 pt-2 border-b border-border flex gap-4">
              {(['plan', 'notes', 'history'] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`pb-2 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === tab
                      ? 'border-primary text-foreground'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {tab === 'plan' ? 'Action Plan' : tab === 'notes' ? `Notes (${notes.length})` : 'History'}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div className="flex-1 overflow-y-auto p-4">
              {activeTab === 'plan' && (
                <ActionPlanTab
                  plan={plan}
                  canEdit={canEdit}
                  showAddReq={showAddReq}
                  setShowAddReq={setShowAddReq}
                  newReqType={newReqType}
                  setNewReqType={setNewReqType}
                  newReqTitle={newReqTitle}
                  setNewReqTitle={setNewReqTitle}
                  newReqDesc={newReqDesc}
                  setNewReqDesc={setNewReqDesc}
                  newReqCount={newReqCount}
                  setNewReqCount={setNewReqCount}
                  addingReq={addingReq}
                  onAddRequirement={handleAddRequirement}
                  onCompleteReq={handleCompleteReq}
                  onDeleteReq={handleDeleteReq}
                />
              )}

              {activeTab === 'notes' && (
                <NotesTab
                  notes={notes}
                  noteDraft={noteDraft}
                  setNoteDraft={setNoteDraft}
                  sendingNote={sendingNote}
                  onSendNote={handleSendNote}
                />
              )}

              {activeTab === 'history' && (
                <HistoryTab history={history} />
              )}
            </div>
          </>
        ) : null}
      </div>
    </>
  );
}

// ── Action Plan Tab ──────────────────────────────────────────────────────

function ActionPlanTab({
  plan,
  canEdit,
  showAddReq,
  setShowAddReq,
  newReqType,
  setNewReqType,
  newReqTitle,
  setNewReqTitle,
  newReqDesc,
  setNewReqDesc,
  newReqCount,
  setNewReqCount,
  addingReq,
  onAddRequirement,
  onCompleteReq,
  onDeleteReq,
}: {
  plan: CoachingCard;
  canEdit: boolean;
  showAddReq: boolean;
  setShowAddReq: (v: boolean) => void;
  newReqType: CoachingRequirementType;
  setNewReqType: (v: CoachingRequirementType) => void;
  newReqTitle: string;
  setNewReqTitle: (v: string) => void;
  newReqDesc: string;
  setNewReqDesc: (v: string) => void;
  newReqCount: number;
  setNewReqCount: (v: number) => void;
  addingReq: boolean;
  onAddRequirement: () => void;
  onCompleteReq: (id: string) => void;
  onDeleteReq: (id: string) => void;
}) {
  const progress = plan.requirements_total > 0
    ? Math.round((plan.requirements_completed / plan.requirements_total) * 100)
    : 0;

  return (
    <div className="space-y-4">
      {/* Per-flag trigger & target context */}
      {plan.flags.filter(f => !f.resolved).map((flag, idx) => {
        const fc = FLAG_TYPE_COLORS[flag.type];
        return (
          <Card key={`${flag.type}-${idx}`} className={`border ${fc.border}`}>
            <CardContent className="p-3">
              <p className="text-xs font-medium text-foreground mb-1 flex items-center gap-1.5">
                <AlertTriangle size={12} className={fc.text} />
                {fc.icon} {FLAG_TYPE_LABELS[flag.type]} — Trigger
              </p>
              <div className="text-xs text-muted-foreground space-y-0.5">
                {Object.entries(flag.trigger_metric || {}).map(([k, v]) => (
                  <div key={k} className="flex justify-between">
                    <span>{k.replace(/_/g, ' ')}</span>
                    <span className="font-mono font-medium text-foreground">
                      {typeof v === 'number' ? (k.includes('pct') ? `${v}%` : v) : String(v)}
                    </span>
                  </div>
                ))}
              </div>
              {flag.target_metric && Object.keys(flag.target_metric).length > 0 && (
                <div className="mt-2 pt-2 border-t border-border/30">
                  <p className="text-[10px] font-medium text-foreground mb-1 flex items-center gap-1">
                    <Target size={10} className="text-primary" />
                    Target
                  </p>
                  <div className="text-xs text-muted-foreground space-y-0.5">
                    {Object.entries(flag.target_metric).map(([k, v]) => (
                      <div key={k} className="flex justify-between">
                        <span>{k.replace(/_/g, ' ')}</span>
                        <span className="font-mono font-medium text-foreground">
                          {typeof v === 'number' ? (k.includes('pct') ? `${v}%` : v) : String(v)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}

      {/* Progress summary */}
      {plan.requirements_total > 0 && (
        <div>
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
            <span className="font-medium text-foreground">Progress</span>
            <span>{plan.requirements_completed}/{plan.requirements_total} complete ({progress}%)</span>
          </div>
          <div className="h-2 bg-secondary rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                progress === 100 ? 'bg-emerald-500' : 'bg-primary'
              }`}
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Requirements list */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-foreground flex items-center gap-1.5">
            <ListChecks size={14} />
            Requirements
          </h3>
          {canEdit && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowAddReq(!showAddReq)}
              className="h-7 text-xs gap-1 border-border"
            >
              <Plus size={12} />
              Add
            </Button>
          )}
        </div>

        {plan.requirements.length === 0 && !showAddReq && (
          <p className="text-xs text-muted-foreground italic py-4 text-center">
            No requirements set yet. {canEdit ? 'Click "Add" to build the action plan.' : ''}
          </p>
        )}

        {plan.requirements.map(req => (
          <RequirementItem
            key={req.id}
            req={req}
            canEdit={canEdit}
            onComplete={() => onCompleteReq(req.id)}
            onDelete={() => onDeleteReq(req.id)}
          />
        ))}

        {/* Add requirement form */}
        {showAddReq && (
          <Card className="border-border">
            <CardContent className="p-3 space-y-3">
              <div>
                <Label className="text-xs text-muted-foreground">Type</Label>
                <div className="flex gap-1.5 mt-1 flex-wrap">
                  {(['custom_task', 'training', 'coaching_meeting', 'live_attendance'] as CoachingRequirementType[]).map(t => (
                    <Button
                      key={t}
                      size="sm"
                      variant={newReqType === t ? 'default' : 'outline'}
                      onClick={() => setNewReqType(t)}
                      className="h-6 text-[10px] gap-1 border-border"
                    >
                      {REQUIREMENT_TYPE_ICONS[t]} {REQUIREMENT_TYPE_LABELS[t]}
                    </Button>
                  ))}
                </div>
              </div>

              <div>
                <Label className="text-xs text-muted-foreground">Title</Label>
                <Input
                  value={newReqTitle}
                  onChange={e => setNewReqTitle(e.target.value)}
                  placeholder={
                    newReqType === 'training' ? 'e.g. Complete HHC Product Training'
                    : newReqType === 'coaching_meeting' ? 'e.g. Weekly 1:1 with manager'
                    : newReqType === 'live_attendance' ? 'e.g. Attend live training sessions'
                    : 'e.g. Shadow a senior agent for 2 calls'
                  }
                  className="mt-1 h-8 text-sm bg-card"
                />
              </div>

              {newReqType === 'live_attendance' && (
                <div>
                  <Label className="text-xs text-muted-foreground">Required count</Label>
                  <Input
                    type="number"
                    min={1}
                    max={20}
                    value={newReqCount}
                    onChange={e => setNewReqCount(parseInt(e.target.value) || 1)}
                    className="mt-1 h-8 text-sm bg-card w-20"
                  />
                </div>
              )}

              <div>
                <Label className="text-xs text-muted-foreground">Description (optional)</Label>
                <Textarea
                  value={newReqDesc}
                  onChange={e => setNewReqDesc(e.target.value)}
                  placeholder="Additional details..."
                  className="mt-1 text-sm bg-card min-h-[60px]"
                />
              </div>

              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={onAddRequirement}
                  disabled={!newReqTitle.trim() || addingReq}
                  className="h-7 text-xs gap-1"
                >
                  {addingReq ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                  Add Requirement
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setShowAddReq(false)}
                  className="h-7 text-xs"
                >
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

// ── Requirement Item ─────────────────────────────────────────────────────

function RequirementItem({
  req,
  canEdit,
  onComplete,
  onDelete,
}: {
  req: CoachingRequirement;
  canEdit: boolean;
  onComplete: () => void;
  onDelete: () => void;
}) {
  const icon = REQUIREMENT_TYPE_ICONS[req.requirement_type];

  return (
    <div className={`flex items-start gap-2 p-2.5 rounded-lg border transition-colors ${
      req.is_completed ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-border'
    }`}>
      {/* Completion toggle */}
      <button
        onClick={canEdit && !req.is_completed ? onComplete : undefined}
        className={`mt-0.5 shrink-0 ${
          req.is_completed
            ? 'text-emerald-400'
            : canEdit ? 'text-muted-foreground hover:text-primary cursor-pointer' : 'text-muted-foreground'
        }`}
        disabled={req.is_completed || !canEdit}
      >
        <CheckCircle2 size={16} className={req.is_completed ? 'fill-emerald-500/20' : ''} />
      </button>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-xs">{icon}</span>
          <span className={`text-sm ${req.is_completed ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
            {req.title}
          </span>
        </div>
        {req.description && (
          <p className="text-[11px] text-muted-foreground mt-0.5">{req.description}</p>
        )}
        {req.requirement_type === 'live_attendance' && req.required_count && (
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {req.completed_count}/{req.required_count} attended
          </p>
        )}
        {req.requirement_type === 'coaching_meeting' && req.meeting_scheduled_at && (
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Scheduled: {new Date(req.meeting_scheduled_at).toLocaleDateString('en-US', { timeZone: 'America/Chicago' })}
            {req.meeting_attended && ' ✅ Attended'}
          </p>
        )}
      </div>

      {/* Delete button */}
      {canEdit && !req.is_completed && (
        <button
          onClick={onDelete}
          className="text-muted-foreground hover:text-red-400 transition-colors shrink-0"
        >
          <Trash2 size={13} />
        </button>
      )}
    </div>
  );
}

// ── Notes Tab ────────────────────────────────────────────────────────────

function NotesTab({
  notes,
  noteDraft,
  setNoteDraft,
  sendingNote,
  onSendNote,
}: {
  notes: CoachingNote[];
  noteDraft: string;
  setNoteDraft: (v: string) => void;
  sendingNote: boolean;
  onSendNote: () => void;
}) {
  return (
    <div className="space-y-3">
      {/* Note input */}
      <div className="flex gap-2">
        <Textarea
          value={noteDraft}
          onChange={e => setNoteDraft(e.target.value)}
          placeholder="Add a note..."
          className="text-sm bg-card min-h-[60px] flex-1"
        />
        <Button
          size="sm"
          onClick={onSendNote}
          disabled={!noteDraft.trim() || sendingNote}
          className="h-8 self-end gap-1"
        >
          {sendingNote ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
        </Button>
      </div>

      {/* Notes list */}
      {notes.length === 0 ? (
        <p className="text-xs text-muted-foreground italic text-center py-6">
          No notes yet
        </p>
      ) : (
        <div className="space-y-2">
          {notes.map(note => (
            <div key={note.id} className="p-3 rounded-lg border border-border">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-foreground flex items-center gap-1">
                  <User size={10} />
                  {note.author_id.slice(0, 8)}…
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {new Date(note.created_at).toLocaleString('en-US', {
                    timeZone: 'America/Chicago',
                    month: 'short',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                  })} CT
                </span>
              </div>
              <p className="text-sm text-foreground whitespace-pre-wrap">{note.body}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── History Tab ──────────────────────────────────────────────────────────

function HistoryTab({ history }: { history: CoachingStageHistoryEntry[] }) {
  return (
    <div className="space-y-0">
      {history.length === 0 ? (
        <p className="text-xs text-muted-foreground italic text-center py-6">
          No stage history yet
        </p>
      ) : (
        <div className="relative pl-4">
          {/* Timeline line */}
          <div className="absolute left-1.5 top-2 bottom-2 w-px bg-border" />

          {history.map((entry) => (
            <div key={entry.id} className="relative pb-4 last:pb-0">
              {/* Dot */}
              <div className={`absolute -left-2.5 top-1.5 w-2 h-2 rounded-full ${
                entry.to_stage === 'resolved' ? 'bg-emerald-500'
                : entry.to_stage === 'escalated' ? 'bg-red-500'
                : 'bg-primary'
              }`} />

              <div className="ml-4">
                <div className="flex items-center gap-2">
                  {entry.from_stage && (
                    <>
                      <Badge variant="outline" className="text-[9px] border-border text-muted-foreground">
                        {COACHING_STAGE_LABELS[entry.from_stage]}
                      </Badge>
                      <ArrowRight size={10} className="text-muted-foreground" />
                    </>
                  )}
                  <Badge variant="outline" className={`text-[9px] ${COACHING_STAGE_COLORS[entry.to_stage].badge}`}>
                    {COACHING_STAGE_LABELS[entry.to_stage]}
                  </Badge>
                </div>
                {entry.note && (
                  <p className="text-[11px] text-muted-foreground mt-0.5">{entry.note}</p>
                )}
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {new Date(entry.created_at).toLocaleString('en-US', {
                    timeZone: 'America/Chicago',
                    month: 'short',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                  })} CT
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
