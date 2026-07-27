import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  KanbanSquare, List, Plus, Filter, Calendar, Bot
} from 'lucide-react';
import { useTasksStore, useTeamStore } from '@/stores/cc-stores';
import type { Task, TaskStatus, Priority, TaskCategory, TeamMember, SkillCategoryKey } from '@/lib/command-center/types';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { suggestAssignee } from '@/lib/command-center/assignment';
import { TaskDetailPanel } from './TaskDetailPanel';
import { EngineRunButton } from './EngineRunButton';

const SKILL_OPTIONS: SkillCategoryKey[] = ['marketing', 'sales', 'tech', 'recruiting', 'retention', 'ghl'];

const columns: { id: TaskStatus; label: string; color: string }[] = [
  { id: 'backlog', label: 'Backlog', color: 'bg-slate-400' },
  { id: 'todo', label: 'To Do', color: 'bg-sky-400' },
  { id: 'in_progress', label: 'In Progress', color: 'bg-amber-400' },
  { id: 'review', label: 'Review', color: 'bg-purple-400' },
  { id: 'done', label: 'Done', color: 'bg-emerald-400' },
];

const priorityColors: Record<Priority, string> = {
  P1: 'bg-red-400/10 text-red-400 border-red-400/20',
  P2: 'bg-amber-400/10 text-amber-400 border-amber-400/20',
  P3: 'bg-sky-400/10 text-sky-400 border-sky-400/20',
  P4: 'bg-slate-400/10 text-muted-foreground/70 border-slate-400/20',
};

const categoryColors: Record<TaskCategory, string> = {
  'Lead Gen': 'bg-sky-400/10 text-sky-300',
  'Recruiting': 'bg-emerald-400/10 text-emerald-300',
  'Retention': 'bg-amber-400/10 text-amber-300',
  'Revenue': 'bg-green-400/10 text-green-300',
  'Admin': 'bg-slate-400/10 text-slate-300',
};

export function CcTasksTab() {
  const tasks = useTasksStore((s) => s.tasks);
  const moveTask = useTasksStore((s) => s.moveTask);
  const addTask = useTasksStore((s) => s.addTask);
  const loadLiveTasks = useTasksStore((s) => s.loadLive);
  const tasksSource = useTasksStore((s) => s.source);
  const members = useTeamStore((s) => s.members);
  const loadLiveTeam = useTeamStore((s) => s.loadLive);

  useEffect(() => {
    if (tasksSource === 'mock') return;
    void loadLiveTasks();
    if (members.length === 0) void loadLiveTeam();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [view, setView] = useState<'kanban' | 'list'>('kanban');
  const [filterAssignee, setFilterAssignee] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterPriority, setFilterPriority] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [draggedTask, setDraggedTask] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const updateTask = useTasksStore((s) => s.updateTask);
  const deleteTask = useTasksStore((s) => s.deleteTask);
  const runEngines = useTasksStore((s) => s.runEngines);

  const filteredTasks = tasks.filter((t) => {
    if (filterAssignee && t.assigneeId !== filterAssignee) return false;
    if (filterCategory && t.category !== filterCategory) return false;
    if (filterPriority && t.priority !== filterPriority) return false;
    return true;
  });

  const handleDragStart = (taskId: string) => setDraggedTask(taskId);
  const handleDragEnd = () => setDraggedTask(null);
  const handleDrop = (status: TaskStatus) => {
    if (draggedTask) { moveTask(draggedTask, status); setDraggedTask(null); }
  };

  const getMemberName = (id: string) => members.find((m) => m.id === id)?.name || 'Unassigned';
  const getMemberAvatar = (id: string) => members.find((m) => m.id === id)?.avatar || '?';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Task Board</h1>
        <div className="flex items-center gap-2">
          <div className="flex items-center glass rounded-lg p-1">
            <button onClick={() => setView('kanban')} className={cn('px-3 py-1.5 rounded-md text-xs font-medium transition-colors', view === 'kanban' ? 'bg-primary/10 text-primary' : 'text-muted-foreground')}>
              <KanbanSquare className="w-3.5 h-3.5 inline mr-1" />Kanban
            </button>
            <button onClick={() => setView('list')} className={cn('px-3 py-1.5 rounded-md text-xs font-medium transition-colors', view === 'list' ? 'bg-primary/10 text-primary' : 'text-muted-foreground')}>
              <List className="w-3.5 h-3.5 inline mr-1" />List
            </button>
          </div>
          <EngineRunButton onRun={runEngines} />
          <button onClick={() => setShowCreateModal(true)} className="flex items-center gap-1.5 px-3 py-2 rounded-lg gradient-primary text-background text-xs font-medium">
            <Plus className="w-3.5 h-3.5" />New Task
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <Filter className="w-3.5 h-3.5 text-muted-foreground" />
        <select value={filterAssignee} onChange={(e) => setFilterAssignee(e.target.value)} className="bg-secondary/50 border border-border/50 rounded-lg px-2.5 py-1.5 text-xs outline-none">
          <option value="">All Members</option>
          {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} className="bg-secondary/50 border border-border/50 rounded-lg px-2.5 py-1.5 text-xs outline-none">
          <option value="">All Categories</option>
          {(['Lead Gen', 'Recruiting', 'Retention', 'Revenue', 'Admin'] as TaskCategory[]).map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={filterPriority} onChange={(e) => setFilterPriority(e.target.value)} className="bg-secondary/50 border border-border/50 rounded-lg px-2.5 py-1.5 text-xs outline-none">
          <option value="">All Priorities</option>
          {(['P1', 'P2', 'P3', 'P4'] as Priority[]).map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        {(filterAssignee || filterCategory || filterPriority) && (
          <button onClick={() => { setFilterAssignee(''); setFilterCategory(''); setFilterPriority(''); }} className="text-xs text-primary hover:underline">Clear</button>
        )}
      </div>

      {tasks.length === 0 && (
        <div className="glass rounded-xl p-8 text-center">
          <p className="text-sm text-muted-foreground">
            No tasks yet. Create one or run the engines to auto-generate tasks from reconciliation issues.
          </p>
        </div>
      )}

      {view === 'kanban' ? (
        <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-thin">
          {columns.map((col) => {
            const columnTasks = filteredTasks.filter((t) => t.status === col.id);
            return (
              <div key={col.id} className="flex-shrink-0 w-72" onDragOver={(e) => e.preventDefault()} onDrop={() => handleDrop(col.id)}>
                <div className="flex items-center gap-2 mb-3 px-1">
                  <div className={`w-2.5 h-2.5 rounded-full ${col.color}`} />
                  <span className="text-xs font-semibold text-foreground">{col.label}</span>
                  <span className="text-xs text-muted-foreground ml-auto">{columnTasks.length}</span>
                </div>
                <div className="space-y-2.5 min-h-[200px] p-2 rounded-xl bg-secondary/20 border border-border/30">
                  <AnimatePresence>
                    {columnTasks.map((task) => (
                      <TaskCard key={task.id} task={task} memberAvatar={getMemberAvatar(task.assigneeId)} memberName={getMemberName(task.assigneeId)} onDragStart={() => handleDragStart(task.id)} onDragEnd={handleDragEnd} onClick={() => setSelectedTask(task)} />
                    ))}
                  </AnimatePresence>
                  {columnTasks.length === 0 && <p className="text-xs text-muted-foreground/50 text-center py-8">Drop tasks here</p>}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="glass rounded-xl overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border/50 bg-secondary/30">
                <th className="text-left py-3 px-4 font-medium text-muted-foreground">Task</th>
                <th className="text-left py-3 px-4 font-medium text-muted-foreground">Assignee</th>
                <th className="text-left py-3 px-4 font-medium text-muted-foreground">Priority</th>
                <th className="text-left py-3 px-4 font-medium text-muted-foreground">Category</th>
                <th className="text-left py-3 px-4 font-medium text-muted-foreground">Status</th>
                <th className="text-left py-3 px-4 font-medium text-muted-foreground">Due</th>
              </tr>
            </thead>
            <tbody>
              {filteredTasks.map((task) => (
                <tr key={task.id} onClick={() => setSelectedTask(task)} className="border-b border-border/30 hover:bg-secondary/20 transition-colors cursor-pointer">
                  <td className="py-3 px-4"><div className="flex items-center gap-2">{task.aiGenerated && <Bot className="w-3 h-3 text-primary" />}<span className="font-medium">{task.title}</span></div></td>
                  <td className="py-3 px-4 text-muted-foreground">{getMemberName(task.assigneeId)}</td>
                  <td className="py-3 px-4"><span className={`px-1.5 py-0.5 rounded text-[10px] font-medium border ${priorityColors[task.priority]}`}>{task.priority}</span></td>
                  <td className="py-3 px-4"><span className={`px-1.5 py-0.5 rounded text-[10px] ${categoryColors[task.category]}`}>{task.category}</span></td>
                  <td className="py-3 px-4 text-muted-foreground capitalize">{task.status.replace('_', ' ')}</td>
                  <td className="py-3 px-4 text-muted-foreground">{format(new Date(task.dueDate), 'MMM d')}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredTasks.length === 0 && <p className="text-center py-12 text-sm text-muted-foreground">No tasks to display</p>}
        </div>
      )}

      {showCreateModal && <CreateTaskModal members={members} onClose={() => setShowCreateModal(false)} onCreate={(task) => { addTask(task); setShowCreateModal(false); }} />}

      <AnimatePresence>
        {selectedTask && (
          <TaskDetailPanel key={selectedTask.id} task={selectedTask} members={members} onClose={() => setSelectedTask(null)} onUpdate={(id, updates) => { updateTask(id, updates); setSelectedTask((prev) => prev ? { ...prev, ...updates } : null); }} onDelete={(id) => { deleteTask(id); setSelectedTask(null); }} />
        )}
      </AnimatePresence>
    </div>
  );
}

function TaskCard({ task, memberAvatar, memberName, onDragStart, onDragEnd, onClick }: { task: Task; memberAvatar: string; memberName: string; onDragStart: () => void; onDragEnd: () => void; onClick: () => void; }) {
  return (
    <motion.div layout initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} draggable onDragStart={onDragStart} onDragEnd={onDragEnd} onClick={onClick} className="glass rounded-lg p-3 cursor-pointer hover:border-primary/30 transition-all">
      <div className="flex items-start justify-between gap-2 mb-2">
        <h3 className="text-xs font-medium leading-tight flex items-center gap-1.5">{task.aiGenerated && <Bot className="w-3 h-3 text-primary flex-shrink-0" />}{task.title}</h3>
        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium border flex-shrink-0 ${priorityColors[task.priority]}`}>{task.priority}</span>
      </div>
      <div className="flex items-center gap-2 mb-2">
        <span className={`px-1.5 py-0.5 rounded text-[10px] ${categoryColors[task.category]}`}>{task.category}</span>
        <span className="text-[10px] text-muted-foreground">D:{task.difficulty}</span>
      </div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <div className="w-5 h-5 rounded-full bg-secondary flex items-center justify-center"><span className="text-[8px] font-medium">{memberAvatar}</span></div>
          <span className="text-[10px] text-muted-foreground">{memberName.split(' ')[0]}</span>
        </div>
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground"><Calendar className="w-3 h-3" />{format(new Date(task.dueDate), 'MMM d')}</div>
      </div>
    </motion.div>
  );
}

function CreateTaskModal({ members, onClose, onCreate }: { members: TeamMember[]; onClose: () => void; onCreate: (task: Task) => void; }) {
  const [form, setForm] = useState({
    title: '', description: '', assigneeId: members[0]?.id || '',
    priority: 'P2' as Priority, category: 'Lead Gen' as TaskCategory,
    difficulty: 5, dueDate: '', skillCategory: 'retention' as SkillCategoryKey,
  });
  const [autoNote, setAutoNote] = useState('');

  const handleAutoAssign = () => {
    const pick = suggestAssignee({ skillCategory: form.skillCategory, difficulty: form.difficulty, members });
    if (pick) { setForm((f) => ({ ...f, assigneeId: pick.memberId })); setAutoNote(`${pick.name} — ${pick.rationale}`); }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const task: Task = { id: `task-${Date.now()}`, ...form, status: 'todo', createdAt: new Date().toISOString().split('T')[0] };
    onCreate(task);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="glass rounded-2xl p-6 w-full max-w-lg mx-4" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold mb-4">Create New Task</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div><label className="text-xs text-muted-foreground font-medium">Title</label><input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required className="w-full mt-1 bg-secondary/50 border border-border/50 rounded-lg px-3 py-2 text-sm outline-none focus:border-primary/50" /></div>
          <div><label className="text-xs text-muted-foreground font-medium">Description</label><textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full mt-1 bg-secondary/50 border border-border/50 rounded-lg px-3 py-2 text-sm outline-none focus:border-primary/50 resize-none" rows={2} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="flex items-center justify-between"><label className="text-xs text-muted-foreground font-medium">Assignee</label><button type="button" onClick={handleAutoAssign} className="text-[10px] text-primary hover:underline flex items-center gap-1"><Bot className="w-3 h-3" />Auto-assign</button></div>
              <select value={form.assigneeId} onChange={(e) => setForm({ ...form, assigneeId: e.target.value })} className="w-full mt-1 bg-secondary/50 border border-border/50 rounded-lg px-3 py-2 text-sm outline-none">{members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
              {autoNote && <p className="text-[10px] text-primary/80 mt-1">{autoNote}</p>}
            </div>
            <div><label className="text-xs text-muted-foreground font-medium">Skill</label><select value={form.skillCategory} onChange={(e) => setForm({ ...form, skillCategory: e.target.value as SkillCategoryKey })} className="w-full mt-1 bg-secondary/50 border border-border/50 rounded-lg px-3 py-2 text-sm outline-none capitalize">{SKILL_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}</select></div>
            <div><label className="text-xs text-muted-foreground font-medium">Priority</label><select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value as Priority })} className="w-full mt-1 bg-secondary/50 border border-border/50 rounded-lg px-3 py-2 text-sm outline-none">{['P1', 'P2', 'P3', 'P4'].map((p) => <option key={p} value={p}>{p}</option>)}</select></div>
            <div><label className="text-xs text-muted-foreground font-medium">Category</label><select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as TaskCategory })} className="w-full mt-1 bg-secondary/50 border border-border/50 rounded-lg px-3 py-2 text-sm outline-none">{['Lead Gen', 'Recruiting', 'Retention', 'Revenue', 'Admin'].map((c) => <option key={c} value={c}>{c}</option>)}</select></div>
            <div><label className="text-xs text-muted-foreground font-medium">Difficulty (1-10)</label><input type="number" min={1} max={10} value={form.difficulty} onChange={(e) => setForm({ ...form, difficulty: Number(e.target.value) })} className="w-full mt-1 bg-secondary/50 border border-border/50 rounded-lg px-3 py-2 text-sm outline-none" /></div>
          </div>
          <div><label className="text-xs text-muted-foreground font-medium">Due Date</label><input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} required className="w-full mt-1 bg-secondary/50 border border-border/50 rounded-lg px-3 py-2 text-sm outline-none" /></div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground transition-colors">Cancel</button>
            <button type="submit" className="px-4 py-2 rounded-lg gradient-primary text-background text-sm font-medium">Create Task</button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
