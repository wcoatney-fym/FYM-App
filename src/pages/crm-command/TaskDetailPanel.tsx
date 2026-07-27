import { useState } from 'react';
import { motion } from 'framer-motion';
import { X, Bot, Calendar, User, BarChart2, Trash2, CheckCircle2 } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { suggestAssignee } from '@/lib/command-center/assignment';
import type { Task, Priority, TaskStatus, TaskCategory, SkillCategoryKey, TeamMember } from '@/lib/command-center/types';

const priorityColors: Record<Priority, string> = {
  P1: 'bg-red-400/10 text-red-400 border-red-400/20',
  P2: 'bg-amber-400/10 text-amber-400 border-amber-400/20',
  P3: 'bg-sky-400/10 text-sky-400 border-sky-400/20',
  P4: 'bg-slate-400/10 text-slate-400 border-slate-400/20',
};

const statusOptions: { id: TaskStatus; label: string; color: string }[] = [
  { id: 'backlog',     label: 'Backlog',      color: 'bg-slate-400' },
  { id: 'todo',       label: 'To Do',        color: 'bg-sky-400' },
  { id: 'in_progress',label: 'In Progress',  color: 'bg-amber-400' },
  { id: 'review',     label: 'Review',       color: 'bg-purple-400' },
  { id: 'done',       label: 'Done',         color: 'bg-emerald-400' },
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
        <div className="flex items-start justify-between gap-3 p-5 border-b border-border/40">
          <div className="flex items-center gap-2 min-w-0">
            {task.aiGenerated && <Bot className="w-4 h-4 text-primary flex-shrink-0" />}
            <h2 className="text-sm font-semibold leading-snug truncate">{task.title}</h2>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"><X className="w-4 h-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {!editing && (
            <div className="flex flex-wrap gap-2">
              <span className={cn('px-2 py-1 rounded text-[11px] font-medium border', priorityColors[task.priority])}>{task.priority}</span>
              <span className="px-2 py-1 rounded text-[11px] bg-secondary/60 text-muted-foreground capitalize">{task.status.replace('_', ' ')}</span>
              <span className="px-2 py-1 rounded text-[11px] bg-secondary/60 text-muted-foreground">{task.category}</span>
              {task.source && <span className="px-2 py-1 rounded text-[11px] bg-primary/10 text-primary/80">{task.source}</span>}
            </div>
          )}
          {!editing && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground"><User className="w-3.5 h-3.5" /><span>{getMemberName(task.assigneeId)}</span></div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground"><Calendar className="w-3.5 h-3.5" /><span>{task.dueDate ? format(new Date(task.dueDate), 'MMM d, yyyy') : 'No due date'}</span></div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground"><BarChart2 className="w-3.5 h-3.5" /><span>Difficulty {task.difficulty}/10{task.skillCategory ? ` · ${task.skillCategory}` : ''}</span></div>
              {task.description && <div><p className="text-[11px] text-muted-foreground font-medium mb-1">Description</p><p className="text-xs leading-relaxed">{task.description}</p></div>}
              <div>
                <p className="text-[11px] text-muted-foreground font-medium mb-2">Move to</p>
                <div className="flex flex-wrap gap-1.5">
                  {statusOptions.filter((s) => s.id !== task.status).map((s) => (
                    <button key={s.id} onClick={() => onUpdate(task.id, { status: s.id })} className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-secondary/50 hover:bg-secondary text-xs transition-colors">
                      <div className={cn('w-2 h-2 rounded-full', s.color)} />{s.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
          {editing && (
            <div className="space-y-3">
              <div><label className="text-[11px] text-muted-foreground font-medium">Title</label><input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} className="w-full mt-1 bg-secondary/50 border border-border/50 rounded-lg px-3 py-2 text-xs outline-none focus:border-primary/50" /></div>
              <div><label className="text-[11px] text-muted-foreground font-medium">Description</label><textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} rows={3} className="w-full mt-1 bg-secondary/50 border border-border/50 rounded-lg px-3 py-2 text-xs outline-none focus:border-primary/50 resize-none" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="flex items-center justify-between"><label className="text-[11px] text-muted-foreground font-medium">Assignee</label><button type="button" onClick={handleAutoAssign} className="text-[10px] text-primary hover:underline flex items-center gap-1"><Bot className="w-3 h-3" />Auto</button></div>
                  <select value={form.assigneeId} onChange={(e) => setForm((f) => ({ ...f, assigneeId: e.target.value }))} className="w-full mt-1 bg-secondary/50 border border-border/50 rounded-lg px-2 py-2 text-xs outline-none">{members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
                  {autoNote && <p className="text-[10px] text-primary/80 mt-1">{autoNote}</p>}
                </div>
                <div><label className="text-[11px] text-muted-foreground font-medium">Priority</label><select value={form.priority} onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value as Priority }))} className="w-full mt-1 bg-secondary/50 border border-border/50 rounded-lg px-2 py-2 text-xs outline-none">{['P1','P2','P3','P4'].map((p) => <option key={p} value={p}>{p}</option>)}</select></div>
                <div><label className="text-[11px] text-muted-foreground font-medium">Status</label><select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as TaskStatus }))} className="w-full mt-1 bg-secondary/50 border border-border/50 rounded-lg px-2 py-2 text-xs outline-none">{statusOptions.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select></div>
                <div><label className="text-[11px] text-muted-foreground font-medium">Category</label><select value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as TaskCategory }))} className="w-full mt-1 bg-secondary/50 border border-border/50 rounded-lg px-2 py-2 text-xs outline-none">{CATEGORY_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}</select></div>
                <div><label className="text-[11px] text-muted-foreground font-medium">Skill</label><select value={form.skillCategory} onChange={(e) => setForm((f) => ({ ...f, skillCategory: e.target.value as SkillCategoryKey }))} className="w-full mt-1 bg-secondary/50 border border-border/50 rounded-lg px-2 py-2 text-xs outline-none capitalize">{SKILL_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}</select></div>
                <div><label className="text-[11px] text-muted-foreground font-medium">Difficulty</label><input type="number" min={1} max={10} value={form.difficulty} onChange={(e) => setForm((f) => ({ ...f, difficulty: Number(e.target.value) }))} className="w-full mt-1 bg-secondary/50 border border-border/50 rounded-lg px-2 py-2 text-xs outline-none" /></div>
              </div>
              <div><label className="text-[11px] text-muted-foreground font-medium">Due Date</label><input type="date" value={form.dueDate} onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))} className="w-full mt-1 bg-secondary/50 border border-border/50 rounded-lg px-3 py-2 text-xs outline-none" /></div>
            </div>
          )}
        </div>
        <div className="p-4 border-t border-border/40 space-y-2">
          {!editing && task.status !== 'done' && (
            <button onClick={handleComplete} className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-xs font-medium transition-colors"><CheckCircle2 className="w-3.5 h-3.5" />Mark Complete</button>
          )}
          <div className="flex gap-2">
            {!editing ? (
              <>
                <button onClick={() => setEditing(true)} className="flex-1 py-2 rounded-lg bg-secondary/60 hover:bg-secondary text-xs font-medium transition-colors">Edit</button>
                {confirmDelete ? (
                  <button onClick={() => { onDelete(task.id); onClose(); }} className="flex-1 py-2 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-400 text-xs font-medium transition-colors">Confirm Delete</button>
                ) : (
                  <button onClick={() => setConfirmDelete(true)} className="px-3 py-2 rounded-lg bg-secondary/60 hover:bg-red-500/10 text-muted-foreground hover:text-red-400 text-xs transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                )}
              </>
            ) : (
              <>
                <button onClick={() => { setEditing(false); setAutoNote(''); }} className="flex-1 py-2 rounded-lg bg-secondary/60 hover:bg-secondary text-xs font-medium transition-colors text-muted-foreground">Cancel</button>
                <button onClick={handleSave} className="flex-1 py-2 rounded-lg gradient-primary text-background text-xs font-medium">Save</button>
              </>
            )}
          </div>
        </div>
      </motion.div>
    </>
  );
}
