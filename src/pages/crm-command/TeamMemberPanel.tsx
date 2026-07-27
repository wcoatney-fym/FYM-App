import { useState } from 'react';
import { motion } from 'framer-motion';
import { X, Bot, Clock, AlertCircle, BarChart2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Task, TeamMember, SkillCategoryKey } from '@/lib/command-center/types';

const SKILL_KEYS: SkillCategoryKey[] = ['marketing', 'sales', 'tech', 'recruiting', 'retention', 'ghl'];

const skillDisplay: Record<SkillCategoryKey, string> = {
  marketing: 'Marketing', sales: 'Sales', tech: 'Tech',
  recruiting: 'Recruiting', retention: 'Retention', ghl: 'GHL',
};
const skillColors: Record<SkillCategoryKey, string> = {
  marketing: 'bg-sky-400', sales: 'bg-emerald-400', tech: 'bg-amber-400',
  recruiting: 'bg-green-400', retention: 'bg-rose-400', ghl: 'bg-violet-400',
};
const confidenceStyle: Record<string, string> = {
  low: 'text-slate-400', medium: 'text-sky-400', high: 'text-emerald-400',
};
const statusColors: Record<string, string> = {
  backlog: 'bg-slate-400/10 text-slate-400', todo: 'bg-sky-400/10 text-sky-400',
  in_progress: 'bg-amber-400/10 text-amber-400', review: 'bg-purple-400/10 text-purple-400',
  done: 'bg-emerald-400/10 text-emerald-400',
};

interface Props {
  member: TeamMember;
  allTasks: Task[];
  onClose: () => void;
  onUpdate: (id: string, updates: Partial<TeamMember>) => void;
}

export function TeamMemberPanel({ member, allTasks, onClose, onUpdate }: Props) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ role: member.role, capacity: member.workload ?? 10 });

  const memberTasks = allTasks.filter((t) => t.assigneeId === member.id);
  const openTasks = memberTasks.filter((t) => t.status !== 'done');
  const doneTasks = memberTasks.filter((t) => t.status === 'done');
  const overdueTasks = openTasks.filter((t) => t.dueDate && new Date(t.dueDate) < new Date());
  const inProgressTasks = openTasks.filter((t) => t.status === 'in_progress');

  const capacity = member.workload ?? 10;
  const loadPct = capacity > 0 ? Math.min((openTasks.length / capacity) * 100, 100) : 0;
  const loadColor = loadPct >= 90 ? 'bg-red-400' : loadPct >= 70 ? 'bg-amber-400' : 'bg-emerald-400';

  const handleSave = () => { onUpdate(member.id, { role: form.role, workload: form.capacity }); setEditing(false); };

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <motion.div initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: 'spring', damping: 28, stiffness: 260 }} className="fixed right-0 top-0 z-50 h-full w-full max-w-md bg-background border-l border-border/60 shadow-2xl flex flex-col">
        <div className="flex items-center justify-between gap-3 p-5 border-b border-border/40">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl gradient-primary flex items-center justify-center flex-shrink-0"><span className="text-sm font-bold text-background">{member.avatar}</span></div>
            <div><h2 className="text-sm font-semibold">{member.name}</h2><p className="text-xs text-muted-foreground">{member.role}</p></div>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors"><X className="w-4 h-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          <div>
            <div className="flex items-center justify-between mb-2"><span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Workload</span><span className="text-xs text-muted-foreground">{openTasks.length} / {capacity} open tasks</span></div>
            <div className="h-2 bg-secondary/50 rounded-full overflow-hidden"><motion.div initial={{ width: 0 }} animate={{ width: `${loadPct}%` }} transition={{ duration: 0.5 }} className={cn('h-full rounded-full', loadColor)} /></div>
            <div className="flex justify-between mt-1">
              <span className="text-[10px] text-muted-foreground">{Math.round(loadPct)}% capacity</span>
              {loadPct >= 90 && <span className="text-[10px] text-red-400 font-medium">⚠ At limit</span>}
              {loadPct >= 70 && loadPct < 90 && <span className="text-[10px] text-amber-400">Getting full</span>}
              {loadPct < 70 && <span className="text-[10px] text-emerald-400">Has room</span>}
            </div>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {[
              { label: 'Open', value: openTasks.length, color: 'bg-sky-400/10 text-sky-400' },
              { label: 'Active', value: inProgressTasks.length, color: 'bg-amber-400/10 text-amber-400' },
              { label: 'Overdue', value: overdueTasks.length, color: overdueTasks.length > 0 ? 'bg-red-400/10 text-red-400' : 'bg-secondary/50 text-muted-foreground' },
              { label: 'Done', value: doneTasks.length, color: 'bg-emerald-400/10 text-emerald-400' },
            ].map((s) => (
              <div key={s.label} className={cn('rounded-lg p-2 text-center', s.color)}><p className="text-lg font-bold leading-none">{s.value}</p><p className="text-[10px] mt-1">{s.label}</p></div>
            ))}
          </div>
          <div>
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-3">Competency</p>
            <div className="space-y-2.5">
              {SKILL_KEYS.map((skill) => {
                const score = member.proficiency?.[skill];
                const level = score ? score.level : (member.skills[skill] ?? 0) * 10;
                const confidence = score?.confidence ?? 'low';
                const stale = score?.stale ?? false;
                return (
                  <div key={skill} className="flex items-center gap-2">
                    <span className="text-[11px] text-muted-foreground w-20">{skillDisplay[skill]}</span>
                    <div className="flex-1 h-1.5 bg-secondary/50 rounded-full overflow-hidden"><motion.div initial={{ width: 0 }} animate={{ width: `${level}%` }} transition={{ duration: 0.5 }} className={cn('h-full rounded-full', skillColors[skill], stale && 'opacity-40')} /></div>
                    <span className="text-[11px] text-muted-foreground w-8 text-right font-medium">{Math.round(level)}</span>
                    <span className={cn('text-[9px] w-12 text-right', confidenceStyle[confidence])}>{confidence}</span>
                  </div>
                );
              })}
            </div>
            <p className="text-[10px] text-muted-foreground/60 mt-2">Confidence firms up as tasks complete. Low = seed estimate.</p>
          </div>
          {openTasks.length > 0 && (
            <div>
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-3">Open Tasks</p>
              <div className="space-y-2">
                {openTasks.slice(0, 8).map((task) => (
                  <div key={task.id} className="flex items-start gap-2.5 p-2.5 rounded-lg bg-secondary/30 border border-border/30">
                    <div className="mt-0.5">
                      {task.status === 'in_progress' ? <Clock className="w-3 h-3 text-amber-400" /> : overdueTasks.includes(task) ? <AlertCircle className="w-3 h-3 text-red-400" /> : <BarChart2 className="w-3 h-3 text-muted-foreground/60" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 min-w-0">{task.aiGenerated && <Bot className="w-2.5 h-2.5 text-primary flex-shrink-0" />}<p className="text-xs font-medium truncate">{task.title}</p></div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className={cn('text-[9px] px-1.5 py-0.5 rounded', statusColors[task.status])}>{task.status.replace('_', ' ')}</span>
                        <span className="text-[9px] text-muted-foreground">{task.priority}</span>
                        {task.dueDate && <span className={cn('text-[9px]', overdueTasks.includes(task) ? 'text-red-400' : 'text-muted-foreground')}>due {new Date(task.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>}
                      </div>
                    </div>
                  </div>
                ))}
                {openTasks.length > 8 && <p className="text-[11px] text-muted-foreground text-center">+{openTasks.length - 8} more</p>}
              </div>
            </div>
          )}
          {editing && (
            <div className="space-y-3 p-4 rounded-xl bg-secondary/20 border border-border/30">
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Edit Profile</p>
              <div><label className="text-[11px] text-muted-foreground font-medium">Role</label><input value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))} className="w-full mt-1 bg-secondary/50 border border-border/50 rounded-lg px-3 py-2 text-xs outline-none focus:border-primary/50" /></div>
              <div><label className="text-[11px] text-muted-foreground font-medium">Task Capacity</label><p className="text-[10px] text-muted-foreground/60 mb-1">Max concurrent tasks before they show as at-limit</p><input type="number" min={1} max={50} value={form.capacity} onChange={(e) => setForm((f) => ({ ...f, capacity: Number(e.target.value) }))} className="w-full bg-secondary/50 border border-border/50 rounded-lg px-3 py-2 text-xs outline-none focus:border-primary/50" /></div>
            </div>
          )}
        </div>
        <div className="p-4 border-t border-border/40">
          {!editing ? (
            <button onClick={() => setEditing(true)} className="w-full py-2 rounded-lg bg-secondary/60 hover:bg-secondary text-xs font-medium transition-colors">Edit Profile</button>
          ) : (
            <div className="flex gap-2">
              <button onClick={() => setEditing(false)} className="flex-1 py-2 rounded-lg bg-secondary/60 hover:bg-secondary text-xs font-medium transition-colors text-muted-foreground">Cancel</button>
              <button onClick={handleSave} className="flex-1 py-2 rounded-lg gradient-primary text-background text-xs font-medium">Save</button>
            </div>
          )}
        </div>
      </motion.div>
    </>
  );
}
