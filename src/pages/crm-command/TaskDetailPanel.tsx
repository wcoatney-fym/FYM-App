/**
 * TaskDetailPanel — Slide-over detail/edit panel for tasks.
 * Uses shadcn Select/Input/Textarea for visual consistency.
 * Toast confirmations are handled by the parent (CcTasksTab).
 */
import { useState } from 'react';
import { motion } from 'framer-motion';
import { X, Bot, Calendar, User, BarChart2, Trash2, CheckCircle2 } from 'lucide-react';
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

  const getMemberName = (id: string) => members.find((m) => m.id === id)?.name ?? 'Unassigned';

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
                  <p className="text-xs leading-relaxed">{task.description}</p>
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
