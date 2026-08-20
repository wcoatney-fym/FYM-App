/**
 * TaskDetailPanel — Slide-over detail/edit panel for tasks.
 * Uses shadcn Select/Input/Textarea for visual consistency.
 * Toast confirmations are handled by the parent (CcTasksTab).
 */
import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { X, Bot, Calendar, User, BarChart2, Trash2, CheckCircle2, ArrowRight, ArrowLeft, AlertTriangle, RefreshCw, Zap } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { suggestAssignee } from '@/lib/command-center/assignment';
import type { Task, Priority, TaskStatus, TaskCategory, SkillCategoryKey, TeamMember } from '@/lib/command-center/types';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { executeSyncDirection } from '@/lib/ghl-push';
import { toast } from 'sonner';

const priorityColors: Record<Priority, string> = {
  P1: 'bg-red-400/10 text-red-400 border-red-400/20',
  P2: 'bg-amber-400/10 text-amber-400 border-amber-400/20',
  P3: 'bg-sky-400/10 text-sky-400 border-sky-400/20',
  P4: 'bg-slate-400/10 text-muted-foreground border-slate-400/20',
};

const statusOptions: { id: TaskStatus; label: string; color: string }[] = [
  { id: 'backlog',      label: 'Backlog',     color: 'bg-slate-400' },
  { id: 'todo',         label: 'To Do',       color: 'bg-sky-400' },
  { id: 'in_progress',  label: 'In Progress', color: 'bg-amber-400' },
  { id: 'review',       label: 'Review',      color: 'bg-purple-400' },
  { id: 'done',         label: 'Done',        color: 'bg-emerald-400' },
];

const SKILL_OPTIONS: SkillCategoryKey[] = ['marketing', 'sales', 'tech', 'recruiting', 'retention', 'ghl'];
const CATEGORY_OPTIONS: TaskCategory[] = ['Lead Gen', 'Recruiting', 'Retention', 'Revenue', 'Admin'];

interface Props {
  task: Task;
  members: TeamMember[];
  onClose: () => void;
  onUpdate: (id: string, updates: Partial<Task>) => void;
  onDelete: (id: string) => void;
}

export function TaskDetailPanel({ task, members, onClose, onUpdate, onDelete }: Props) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    title: task.title,
    description: task.description,
    assigneeId: task.assigneeId,
    priority: task.priority,
    category: task.category,
    status: task.status,
    difficulty: task.difficulty,
    skillCategory: task.skillCategory ?? 'retention' as SkillCategoryKey,
    dueDate: task.dueDate ?? '',
  });
  const [autoNote, setAutoNote] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [syncExecuting, setSyncExecuting] = useState(false);
  const [syncDone, setSyncDone] = useState(false);

  // Detect if this is a Pipeline Sync Direction task
  const isSyncTask = useMemo(() => task.title.startsWith('Pipeline Sync Direction'), [task.title]);

  // Parse the detected direction from the task description
  const detectedDirection = useMemo(() => {
    if (!isSyncTask || !task.description) return null;
    const match = task.description.match(/\*\*Detected direction:\*\*\s*`(\w+)`/);
    if (match) return match[1] as 'app_to_ghl' | 'ghl_to_app' | 'conflict' | 'empty';
    // Fallback: check for markdown-stripped version
    const fallback = task.description.match(/Detected direction:\s*(\w+)/);
    if (fallback) return fallback[1] as 'app_to_ghl' | 'ghl_to_app' | 'conflict' | 'empty';
    return null;
  }, [isSyncTask, task.description]);

  // Extract agency_id from task description (embedded as HTML comment or plain text)
  const syncAgencyId = useMemo(() => {
    if (!isSyncTask || !task.description) return null;
    // Match HTML comment format: <!-- agency_id: uuid -->
    const commentMatch = task.description.match(/agency_id:\s*([0-9a-f-]{36})/i);
    if (commentMatch) return commentMatch[1];
    return null;
  }, [isSyncTask, task.description]);

  const getMemberName = (id: string) => members.find((m) => m.id === id)?.name ?? 'Unassigned';

  const handleExecuteSync = async (dir: 'app_to_ghl' | 'ghl_to_app' | 'empty') => {
    if (!syncAgencyId) return;
    setSyncExecuting(true);
    try {
      const result = await executeSyncDirection(syncAgencyId, dir, task.id);
      if (result?.success) {
        setSyncDone(true);
        onUpdate(task.id, { status: 'done', completedAt: new Date().toISOString(), onTime: true });
        const label = dir === 'app_to_ghl' ? 'App → GHL' : dir === 'ghl_to_app' ? 'GHL → App' : 'two-way sync';
        toast.success(`Sync complete (${label}) — pipeline enabled`);
      } else {
        toast.error(result?.error || 'Sync failed — check the CRM Ops Agency tab');
      }
    } catch {
      toast.error('Sync failed to reach the server');
    }
    setSyncExecuting(false);
  };

  const handleAutoAssign = () => {
    const pick = suggestAssignee({ skillCategory: form.skillCategory, difficulty: form.difficulty, members });
    if (pick) {
      setForm((f) => ({ ...f, assigneeId: pick.memberId }));
      setAutoNote(`${pick.name} — ${pick.rationale}`);
    }
  };

  const handleSave = () => {
    onUpdate(task.id, {
      title: form.title, description: form.description, assigneeId: form.assigneeId,
      priority: form.priority, category: form.category, status: form.status,
      difficulty: form.difficulty, skillCategory: form.skillCategory, dueDate: form.dueDate,
    });
    setEditing(false);
  };

  const handleComplete = () => {
    onUpdate(task.id, { status: 'done', completedAt: new Date().toISOString(), onTime: task.dueDate ? new Date() <= new Date(task.dueDate) : true });
    onClose();
  };

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <motion.div initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: 'spring', damping: 28, stiffness: 260 }} className="fixed right-0 top-0 z-50 h-full w-full max-w-md bg-background border-l border-border/60 shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 p-5 border-b border-border/40">
          <div className="flex items-center gap-2 min-w-0">
            {task.aiGenerated && <Bot className="w-4 h-4 text-primary flex-shrink-0" />}
            <h2 className="text-sm font-semibold leading-snug truncate">{task.title}</h2>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="h-7 w-7 flex-shrink-0">
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {!editing && (
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className={cn('text-[11px] font-medium', priorityColors[task.priority])}>{task.priority}</Badge>
              <Badge variant="secondary" className="text-[11px] capitalize">{task.status.replace('_', ' ')}</Badge>
              <Badge variant="secondary" className="text-[11px]">{task.category}</Badge>
              {task.source && <Badge className="text-[11px] bg-primary/10 text-primary/80 border-primary/20">{task.source}</Badge>}
            </div>
          )}

          {!editing && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground"><User className="w-3.5 h-3.5" /><span>{getMemberName(task.assigneeId)}</span></div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground"><Calendar className="w-3.5 h-3.5" /><span>{task.dueDate ? format(new Date(task.dueDate), 'MMM d, yyyy') : 'No due date'}</span></div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground"><BarChart2 className="w-3.5 h-3.5" /><span>Difficulty {task.difficulty}/10{task.skillCategory ? ` · ${task.skillCategory}` : ''}</span></div>
              {task.description && (
                <div>
                  <p className="text-[11px] text-muted-foreground font-medium mb-1">Description</p>
                  <p className="text-xs leading-relaxed whitespace-pre-wrap">{task.description}</p>
                </div>
              )}

              {/* Pipeline Sync Direction — Confirm & Execute panel */}
              {isSyncTask && task.status !== 'done' && !syncDone && (
                <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <Zap className="w-4 h-4 text-primary" />
                    <span className="text-xs font-semibold text-primary">Sync Action Required</span>
                  </div>

                  {detectedDirection === 'conflict' ? (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-xs text-amber-400">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        <span>Both platforms have worked data. Choose which to preserve:</span>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={syncExecuting || !syncAgencyId}
                          onClick={() => handleExecuteSync('app_to_ghl')}
                          className="flex-1 text-xs gap-1.5 border-emerald-500/30 hover:bg-emerald-500/10"
                        >
                          <ArrowRight className="w-3.5 h-3.5" />App → GHL
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={syncExecuting || !syncAgencyId}
                          onClick={() => handleExecuteSync('ghl_to_app')}
                          className="flex-1 text-xs gap-1.5 border-cyan-500/30 hover:bg-cyan-500/10"
                        >
                          <ArrowLeft className="w-3.5 h-3.5" />GHL → App
                        </Button>
                      </div>
                    </div>
                  ) : detectedDirection === 'empty' ? (
                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground">No data on either side. Enable two-way sync for new at-risk policies.</p>
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={syncExecuting || !syncAgencyId}
                        onClick={() => handleExecuteSync('empty')}
                        className="w-full text-xs gap-1.5 border-primary/30 hover:bg-primary/10"
                      >
                        {syncExecuting ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" />Enabling…</> : <><Zap className="w-3.5 h-3.5" />Enable Two-Way Sync</>}
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground">
                        {detectedDirection === 'app_to_ghl'
                          ? 'Agency has worked the App pipeline. Confirm seeding App → GHL.'
                          : detectedDirection === 'ghl_to_app'
                          ? 'Agency has worked in GHL. Confirm importing GHL → App.'
                          : 'Confirm sync direction below.'}
                      </p>
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={syncExecuting || !syncAgencyId}
                        onClick={() => handleExecuteSync(detectedDirection === 'app_to_ghl' ? 'app_to_ghl' : detectedDirection === 'ghl_to_app' ? 'ghl_to_app' : 'empty')}
                        className="w-full text-xs gap-1.5 border-primary/30 hover:bg-primary/10"
                      >
                        {syncExecuting ? (
                          <><RefreshCw className="w-3.5 h-3.5 animate-spin" />Syncing…</>
                        ) : (
                          <>{detectedDirection === 'app_to_ghl' ? <ArrowRight className="w-3.5 h-3.5" /> : <ArrowLeft className="w-3.5 h-3.5" />}
                            Confirm & Sync {detectedDirection === 'app_to_ghl' ? 'App → GHL' : 'GHL → App'}</>
                        )}
                      </Button>
                    </div>
                  )}

                  {!syncAgencyId && (
                    <p className="text-[10px] text-amber-400">
                      ⚠️ Could not extract agency ID from task. Use the CRM Ops Agency tab to sync manually.
                    </p>
                  )}
                </div>
              )}

              {isSyncTask && syncDone && (
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span className="text-xs font-medium text-emerald-400">Sync complete — pipeline enabled</span>
                </div>
              )}

              <div>
                <p className="text-[11px] text-muted-foreground font-medium mb-2">Move to</p>
                <div className="flex flex-wrap gap-1.5">
                  {statusOptions.filter((s) => s.id !== task.status).map((s) => (
                    <Button
                      key={s.id}
                      variant="secondary"
                      size="sm"
                      onClick={() => onUpdate(task.id, { status: s.id })}
                      className="h-7 text-xs gap-1.5"
                    >
                      <div className={cn('w-2 h-2 rounded-full', s.color)} />{s.label}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Edit mode — shadcn inputs */}
          {editing && (
            <div className="space-y-3">
              <div>
                <label className="text-[11px] text-muted-foreground font-medium">Title</label>
                <Input
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  className="mt-1 bg-secondary/50 border-border/50 text-xs"
                />
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground font-medium">Description</label>
                <Textarea
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  rows={3}
                  className="mt-1 bg-secondary/50 border-border/50 text-xs resize-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] text-muted-foreground font-medium">Assignee</label>
                    <button type="button" onClick={handleAutoAssign} className="text-[10px] text-primary hover:underline flex items-center gap-1">
                      <Bot className="w-3 h-3" />Auto
                    </button>
                  </div>
                  <Select value={form.assigneeId} onValueChange={(v) => setForm((f) => ({ ...f, assigneeId: v }))}>
                    <SelectTrigger className="mt-1 bg-secondary/50 border-border/50 text-xs">
                      <SelectValue placeholder="Select member" />
                    </SelectTrigger>
                    <SelectContent>
                      {members.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {autoNote && <p className="text-[10px] text-primary/80 mt-1">{autoNote}</p>}
                </div>
                <div>
                  <label className="text-[11px] text-muted-foreground font-medium">Priority</label>
                  <Select value={form.priority} onValueChange={(v) => setForm((f) => ({ ...f, priority: v as Priority }))}>
                    <SelectTrigger className="mt-1 bg-secondary/50 border-border/50 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(['P1', 'P2', 'P3', 'P4'] as Priority[]).map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-[11px] text-muted-foreground font-medium">Status</label>
                  <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v as TaskStatus }))}>
                    <SelectTrigger className="mt-1 bg-secondary/50 border-border/50 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {statusOptions.map((s) => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-[11px] text-muted-foreground font-medium">Category</label>
                  <Select value={form.category} onValueChange={(v) => setForm((f) => ({ ...f, category: v as TaskCategory }))}>
                    <SelectTrigger className="mt-1 bg-secondary/50 border-border/50 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORY_OPTIONS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-[11px] text-muted-foreground font-medium">Skill</label>
                  <Select value={form.skillCategory} onValueChange={(v) => setForm((f) => ({ ...f, skillCategory: v as SkillCategoryKey }))}>
                    <SelectTrigger className="mt-1 bg-secondary/50 border-border/50 text-xs capitalize">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SKILL_OPTIONS.map((s) => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-[11px] text-muted-foreground font-medium">Difficulty</label>
                  <Input
                    type="number"
                    min={1}
                    max={10}
                    value={form.difficulty}
                    onChange={(e) => setForm((f) => ({ ...f, difficulty: Number(e.target.value) }))}
                    className="mt-1 bg-secondary/50 border-border/50 text-xs"
                  />
                </div>
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground font-medium">Due Date</label>
                <Input
                  type="date"
                  value={form.dueDate}
                  onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))}
                  className="mt-1 bg-secondary/50 border-border/50 text-xs"
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border/40 space-y-2">
          {!editing && task.status !== 'done' && (
            <Button
              onClick={handleComplete}
              variant="ghost"
              className="w-full bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-xs font-medium gap-2"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />Mark Complete
            </Button>
          )}
          <div className="flex gap-2">
            {!editing ? (
              <>
                <Button variant="secondary" onClick={() => setEditing(true)} className="flex-1 text-xs">
                  Edit
                </Button>
                {confirmDelete ? (
                  <Button
                    variant="destructive"
                    onClick={() => { onDelete(task.id); onClose(); }}
                    className="flex-1 text-xs"
                  >
                    Confirm Delete
                  </Button>
                ) : (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setConfirmDelete(true)}
                    className="hover:bg-red-500/10 hover:text-red-400"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                )}
              </>
            ) : (
              <>
                <Button variant="ghost" onClick={() => { setEditing(false); setAutoNote(''); }} className="flex-1 text-xs text-muted-foreground">
                  Cancel
                </Button>
                <Button onClick={handleSave} className="flex-1 gradient-primary text-background text-xs font-medium">
                  Save
                </Button>
              </>
            )}
          </div>
        </div>
      </motion.div>
    </>
  );
}
