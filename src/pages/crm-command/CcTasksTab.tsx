/**
 * CcTasksTab — Task Board with @dnd-kit kanban, shadcn components, and toast confirmations.
 *
 * Group 1: shadcn Select/Input/Textarea, @dnd-kit kanban, Sonner toasts
 * Group 2: list pagination, default due date, delete persistence
 * Group 3: URL filter persistence, inline validation, bulk actions
 */
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  KanbanSquare, List, Plus, Filter, Calendar, Bot, X,
  ChevronLeft, ChevronRight, CheckSquare, Square, Trash2, ArrowRightLeft,
} from 'lucide-react';
import { toast } from 'sonner';
import { useTasksStore, useTeamStore } from '@/stores/cc-stores';
import type { Task, TaskStatus, Priority, TaskCategory, TeamMember, SkillCategoryKey } from '@/lib/command-center/types';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { suggestAssignee } from '@/lib/command-center/assignment';
import { TaskDetailPanel } from './TaskDetailPanel';
import { EngineRunButton } from './EngineRunButton';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

const SKILL_OPTIONS: SkillCategoryKey[] = ['marketing', 'sales', 'tech', 'recruiting', 'retention', 'ghl'];

const columns: { id: TaskStatus; label: string; color: string; dotColor: string }[] = [
  { id: 'backlog', label: 'Backlog', color: 'bg-slate-500/5 border-slate-500/20', dotColor: 'bg-slate-400' },
  { id: 'todo', label: 'To Do', color: 'bg-sky-500/5 border-sky-500/20', dotColor: 'bg-sky-400' },
  { id: 'in_progress', label: 'In Progress', color: 'bg-amber-500/5 border-amber-500/20', dotColor: 'bg-amber-400' },
  { id: 'review', label: 'Review', color: 'bg-purple-500/5 border-purple-500/20', dotColor: 'bg-purple-400' },
  { id: 'done', label: 'Done', color: 'bg-emerald-500/5 border-emerald-500/20', dotColor: 'bg-emerald-400' },
];

const priorityColors: Record<Priority, string> = {
  P1: 'bg-red-400/10 text-red-400 border-red-400/20',
  P2: 'bg-amber-400/10 text-amber-400 border-amber-400/20',
  P3: 'bg-sky-400/10 text-sky-400 border-sky-400/20',
  P4: 'bg-slate-400/10 text-muted-foreground border-slate-400/20',
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

  // ─── URL filter persistence ──────────────────────────────────────────
  const [searchParams, setSearchParams] = useSearchParams();

  const view = (searchParams.get('view') as 'kanban' | 'list') || 'kanban';
  const filterAssignee = searchParams.get('assignee') || '';
  const filterCategory = searchParams.get('category') || '';
  const filterPriority = searchParams.get('priority') || '';

  const setParam = useCallback((key: string, value: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value) next.set(key, value);
      else next.delete(key);
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  const setView = useCallback((v: 'kanban' | 'list') => setParam('view', v === 'kanban' ? '' : v), [setParam]);
  const setFilterAssignee = useCallback((v: string) => setParam('assignee', v), [setParam]);
  const setFilterCategory = useCallback((v: string) => setParam('category', v), [setParam]);
  const setFilterPriority = useCallback((v: string) => setParam('priority', v), [setParam]);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [listPage, setListPage] = useState(0);
  const LIST_PAGE_SIZE = 25;

  // ─── Bulk selection (list view only) ─────────────────────────────────
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkMove, setShowBulkMove] = useState(false);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(pagedTaskIds));
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
    setShowBulkMove(false);
  }, []);

  const updateTask = useTasksStore((s) => s.updateTask);
  const deleteTask = useTasksStore((s) => s.deleteTask);
  const runEngines = useTasksStore((s) => s.runEngines);

  const filteredTasks = useMemo(() => tasks.filter((t) => {
    if (filterAssignee && t.assigneeId !== filterAssignee) return false;
    if (filterCategory && t.category !== filterCategory) return false;
    if (filterPriority && t.priority !== filterPriority) return false;
    return true;
  }), [tasks, filterAssignee, filterCategory, filterPriority]);

  // Reset list pagination and clear selection when filters change
  useEffect(() => { setListPage(0); clearSelection(); }, [filterAssignee, filterCategory, filterPriority, clearSelection]);

  // Paginated slice for list view
  const totalListPages = Math.max(1, Math.ceil(filteredTasks.length / LIST_PAGE_SIZE));
  const pagedTasks = useMemo(
    () => filteredTasks.slice(listPage * LIST_PAGE_SIZE, (listPage + 1) * LIST_PAGE_SIZE),
    [filteredTasks, listPage],
  );
  const pagedTaskIds = useMemo(() => pagedTasks.map((t) => t.id), [pagedTasks]);
  const handlePrevPage = useCallback(() => { setListPage((p) => Math.max(0, p - 1)); clearSelection(); }, [clearSelection]);
  const handleNextPage = useCallback(() => { setListPage((p) => Math.min(totalListPages - 1, p + 1)); clearSelection(); }, [totalListPages, clearSelection]);

  // ─── Bulk action handlers ────────────────────────────────────────────
  const handleBulkMove = useCallback((status: TaskStatus) => {
    const colLabel = columns.find((c) => c.id === status)?.label ?? status;
    selectedIds.forEach((id) => moveTask(id, status));
    toast.success(`Moved ${selectedIds.size} task${selectedIds.size > 1 ? 's' : ''} → ${colLabel}`);
    clearSelection();
  }, [selectedIds, moveTask, clearSelection]);

  const handleBulkDelete = useCallback(() => {
    const count = selectedIds.size;
    selectedIds.forEach((id) => deleteTask(id));
    toast.success(`Deleted ${count} task${count > 1 ? 's' : ''}`);
    clearSelection();
  }, [selectedIds, deleteTask, clearSelection]);

  // ─── @dnd-kit sensors (pointer + touch + keyboard) ──────────────────
  const pointerSensor = useSensor(PointerSensor, { activationConstraint: { distance: 8 } });
  const touchSensor = useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } });
  const keyboardSensor = useSensor(KeyboardSensor);
  const sensors = useSensors(pointerSensor, touchSensor, keyboardSensor);

  const handleDragStart = (event: DragStartEvent) => {
    const task = tasks.find((t) => t.id === event.active.id);
    if (task) setActiveTask(task);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveTask(null);
    const { active, over } = event;
    if (!over) return;
    const taskId = active.id as string;
    const newStatus = over.id as TaskStatus;
    const task = tasks.find((t) => t.id === taskId);
    if (!task || task.status === newStatus) return;
    const colLabel = columns.find((c) => c.id === newStatus)?.label ?? newStatus;
    moveTask(taskId, newStatus);
    toast.success(`Moved "${task.title}" → ${colLabel}`);
  };

  const getMemberName = (id: string) => members.find((m) => m.id === id)?.name || 'Unassigned';
  const getMemberAvatar = (id: string) => members.find((m) => m.id === id)?.avatar || '?';

  const hasActiveFilters = !!(filterAssignee || filterCategory || filterPriority);
  const hasBulkSelection = selectedIds.size > 0;

  return (
    <div className="space-y-4">
      {/* Header */}
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
          <Button onClick={() => setShowCreateModal(true)} size="sm" className="gap-1.5 gradient-primary text-background text-xs font-medium">
            <Plus className="w-3.5 h-3.5" />New Task
          </Button>
        </div>
      </div>

      {/* Filters — shadcn Select */}
      <div className="flex items-center gap-2 flex-wrap">
        <Filter className="w-3.5 h-3.5 text-muted-foreground" />
        <Select value={filterAssignee} onValueChange={setFilterAssignee}>
          <SelectTrigger className="w-[160px] h-8 text-xs bg-secondary/50 border-border/50">
            <SelectValue placeholder="All Members" />
          </SelectTrigger>
          <SelectContent>
            {members.map((m) => <SelectItem key={m.id} value={m.id} className="text-xs">{m.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterCategory} onValueChange={setFilterCategory}>
          <SelectTrigger className="w-[150px] h-8 text-xs bg-secondary/50 border-border/50">
            <SelectValue placeholder="All Categories" />
          </SelectTrigger>
          <SelectContent>
            {(['Lead Gen', 'Recruiting', 'Retention', 'Revenue', 'Admin'] as TaskCategory[]).map((c) => <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterPriority} onValueChange={setFilterPriority}>
          <SelectTrigger className="w-[130px] h-8 text-xs bg-secondary/50 border-border/50">
            <SelectValue placeholder="All Priorities" />
          </SelectTrigger>
          <SelectContent>
            {(['P1', 'P2', 'P3', 'P4'] as Priority[]).map((p) => <SelectItem key={p} value={p} className="text-xs">{p}</SelectItem>)}
          </SelectContent>
        </Select>
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={() => {
            setSearchParams((prev) => {
              const next = new URLSearchParams(prev);
              next.delete('assignee'); next.delete('category'); next.delete('priority');
              return next;
            }, { replace: true });
          }} className="text-xs text-primary h-8 px-2 gap-1">
            <X className="w-3 h-3" />Clear
          </Button>
        )}
      </div>

      {/* Bulk action bar (list view) */}
      {view === 'list' && hasBulkSelection && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3 glass rounded-lg px-4 py-2.5"
        >
          <span className="text-xs font-medium">{selectedIds.size} selected</span>
          <div className="flex items-center gap-1.5 ml-auto">
            <div className="relative">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowBulkMove(!showBulkMove)}
                className="text-xs gap-1.5 h-7"
              >
                <ArrowRightLeft className="w-3 h-3" />Move to…
              </Button>
              {showBulkMove && (
                <div className="absolute right-0 top-full mt-1 z-50 glass rounded-lg border border-border/50 p-1 min-w-[140px] shadow-lg">
                  {columns.map((col) => (
                    <button
                      key={col.id}
                      onClick={() => { handleBulkMove(col.id); setShowBulkMove(false); }}
                      className="flex items-center gap-2 w-full px-3 py-1.5 rounded-md text-xs hover:bg-secondary/60 transition-colors"
                    >
                      <div className={cn('w-2 h-2 rounded-full', col.dotColor)} />{col.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleBulkDelete}
              className="text-xs gap-1.5 h-7 text-red-400 hover:text-red-300 hover:bg-red-500/10"
            >
              <Trash2 className="w-3 h-3" />Delete
            </Button>
            <Button variant="ghost" size="sm" onClick={clearSelection} className="text-xs h-7 px-2">
              <X className="w-3 h-3" />
            </Button>
          </div>
        </motion.div>
      )}

      {/* Empty state */}
      {tasks.length === 0 && (
        <div className="glass rounded-xl p-8 text-center">
          <p className="text-sm text-muted-foreground">
            No tasks yet. Create one or run the engines to auto-generate tasks from reconciliation issues.
          </p>
        </div>
      )}

      {/* Kanban view with @dnd-kit */}
      {view === 'kanban' ? (
        <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-thin">
            {columns.map((col) => {
              const columnTasks = filteredTasks.filter((t) => t.status === col.id);
              return (
                <KanbanColumn
                  key={col.id}
                  column={col}
                  tasks={columnTasks}
                  getMemberAvatar={getMemberAvatar}
                  getMemberName={getMemberName}
                  onCardClick={setSelectedTask}
                />
              );
            })}
          </div>
          <DragOverlay dropAnimation={{ duration: 200, easing: 'ease' }}>
            {activeTask ? (
              <TaskCard
                task={activeTask}
                memberAvatar={getMemberAvatar(activeTask.assigneeId)}
                memberName={getMemberName(activeTask.assigneeId)}
                isOverlay
              />
            ) : null}
          </DragOverlay>
        </DndContext>
      ) : (
        /* List view with pagination + bulk select */
        <div className="glass rounded-xl overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border/50 bg-secondary/30">
                <th className="py-3 px-2 w-8">
                  <button onClick={selectedIds.size === pagedTasks.length ? clearSelection : selectAll} className="text-muted-foreground hover:text-foreground transition-colors">
                    {selectedIds.size === pagedTasks.length && pagedTasks.length > 0
                      ? <CheckSquare className="w-3.5 h-3.5 text-primary" />
                      : <Square className="w-3.5 h-3.5" />}
                  </button>
                </th>
                <th className="text-left py-3 px-4 font-medium text-muted-foreground">Task</th>
                <th className="text-left py-3 px-4 font-medium text-muted-foreground">Assignee</th>
                <th className="text-left py-3 px-4 font-medium text-muted-foreground">Priority</th>
                <th className="text-left py-3 px-4 font-medium text-muted-foreground">Category</th>
                <th className="text-left py-3 px-4 font-medium text-muted-foreground">Status</th>
                <th className="text-left py-3 px-4 font-medium text-muted-foreground">Due</th>
              </tr>
            </thead>
            <tbody>
              {pagedTasks.map((task) => (
                <tr
                  key={task.id}
                  onClick={() => setSelectedTask(task)}
                  className={cn(
                    'border-b border-border/30 hover:bg-secondary/20 transition-colors cursor-pointer',
                    selectedIds.has(task.id) && 'bg-primary/5',
                  )}
                >
                  <td className="py-3 px-2 w-8" onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => toggleSelect(task.id)} className="text-muted-foreground hover:text-foreground transition-colors">
                      {selectedIds.has(task.id)
                        ? <CheckSquare className="w-3.5 h-3.5 text-primary" />
                        : <Square className="w-3.5 h-3.5" />}
                    </button>
                  </td>
                  <td className="py-3 px-4"><div className="flex items-center gap-2">{task.aiGenerated && <Bot className="w-3 h-3 text-primary" />}<span className="font-medium">{task.title}</span></div></td>
                  <td className="py-3 px-4 text-muted-foreground">{getMemberName(task.assigneeId)}</td>
                  <td className="py-3 px-4"><Badge variant="outline" className={cn('text-[10px] font-medium', priorityColors[task.priority])}>{task.priority}</Badge></td>
                  <td className="py-3 px-4"><Badge variant="secondary" className={cn('text-[10px]', categoryColors[task.category])}>{task.category}</Badge></td>
                  <td className="py-3 px-4 text-muted-foreground capitalize">{task.status.replace('_', ' ')}</td>
                  <td className="py-3 px-4 text-muted-foreground">{format(new Date(task.dueDate), 'MMM d')}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredTasks.length === 0 && <p className="text-center py-12 text-sm text-muted-foreground">No tasks to display</p>}
          {/* Pagination controls */}
          {filteredTasks.length > LIST_PAGE_SIZE && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-border/30">
              <span className="text-xs text-muted-foreground">
                {listPage * LIST_PAGE_SIZE + 1}–{Math.min((listPage + 1) * LIST_PAGE_SIZE, filteredTasks.length)} of {filteredTasks.length}
              </span>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" onClick={handlePrevPage} disabled={listPage === 0} className="h-7 w-7">
                  <ChevronLeft className="w-3.5 h-3.5" />
                </Button>
                <span className="text-xs text-muted-foreground px-2">{listPage + 1} / {totalListPages}</span>
                <Button variant="ghost" size="icon" onClick={handleNextPage} disabled={listPage >= totalListPages - 1} className="h-7 w-7">
                  <ChevronRight className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Create modal */}
      {showCreateModal && (
        <CreateTaskModal
          members={members}
          onClose={() => setShowCreateModal(false)}
          onCreate={(task) => {
            addTask(task);
            setShowCreateModal(false);
            toast.success(`Task "${task.title}" created`);
          }}
        />
      )}

      {/* Detail panel */}
      <AnimatePresence>
        {selectedTask && (
          <TaskDetailPanel
            key={selectedTask.id}
            task={selectedTask}
            members={members}
            onClose={() => setSelectedTask(null)}
            onUpdate={(id, updates) => {
              updateTask(id, updates);
              setSelectedTask((prev) => prev ? { ...prev, ...updates } : null);
              toast.success('Task updated');
            }}
            onDelete={(id) => {
              const name = selectedTask.title;
              deleteTask(id);
              setSelectedTask(null);
              toast.success(`Task "${name}" deleted`);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── KanbanColumn (droppable) ──────────────────────────────────────────────

function KanbanColumn({
  column,
  tasks,
  getMemberAvatar,
  getMemberName,
  onCardClick,
}: {
  column: { id: TaskStatus; label: string; color: string; dotColor: string };
  tasks: Task[];
  getMemberAvatar: (id: string) => string;
  getMemberName: (id: string) => string;
  onCardClick: (task: Task) => void;
}) {
  const { isOver, setNodeRef } = useDroppable({ id: column.id });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex-shrink-0 w-72 rounded-xl border transition-all',
        column.color,
        isOver && 'ring-2 ring-primary/60 ring-offset-1 scale-[1.01]',
      )}
    >
      <div className="flex items-center gap-2 p-3 border-b border-inherit">
        <div className={cn('w-2.5 h-2.5 rounded-full', column.dotColor)} />
        <span className="text-xs font-semibold text-foreground">{column.label}</span>
        <span className="text-xs text-muted-foreground ml-auto">{tasks.length}</span>
      </div>
      <div className="space-y-2.5 min-h-[200px] p-2 overflow-y-auto" style={{ maxHeight: 'var(--tasks-col-height, min(calc(100vh - 340px), 540px))' }}>
        <AnimatePresence>
          {tasks.map((task) => (
            <DraggableTaskCard
              key={task.id}
              task={task}
              memberAvatar={getMemberAvatar(task.assigneeId)}
              memberName={getMemberName(task.assigneeId)}
              onClick={() => onCardClick(task)}
            />
          ))}
        </AnimatePresence>
        {tasks.length === 0 && <p className="text-xs text-muted-foreground text-center py-8">Drop tasks here</p>}
      </div>
    </div>
  );
}

// ─── DraggableTaskCard (draggable wrapper) ─────────────────────────────────

function DraggableTaskCard({
  task,
  memberAvatar,
  memberName,
  onClick,
}: {
  task: Task;
  memberAvatar: string;
  memberName: string;
  onClick: () => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id });

  return (
    <div ref={setNodeRef} {...listeners} {...attributes}>
      <TaskCard
        task={task}
        memberAvatar={memberAvatar}
        memberName={memberName}
        isDragging={isDragging}
        onClick={onClick}
      />
    </div>
  );
}

// ─── TaskCard (pure display) ───────────────────────────────────────────────

function TaskCard({
  task,
  memberAvatar,
  memberName,
  isDragging = false,
  isOverlay = false,
  onClick,
}: {
  task: Task;
  memberAvatar: string;
  memberName: string;
  isDragging?: boolean;
  isOverlay?: boolean;
  onClick?: () => void;
}) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: isDragging ? 0.4 : 1, scale: isDragging ? 0.95 : 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      onClick={onClick}
      className={cn(
        'glass rounded-lg p-3 transition-all touch-none',
        isOverlay
          ? 'rotate-2 scale-105 ring-2 ring-primary shadow-xl cursor-grabbing'
          : 'cursor-grab active:cursor-grabbing hover:border-primary/30',
        isDragging && 'opacity-40',
      )}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <h3 className="text-xs font-medium leading-tight flex items-center gap-1.5">
          {task.aiGenerated && <Bot className="w-3 h-3 text-primary flex-shrink-0" />}
          {task.title}
        </h3>
        <Badge variant="outline" className={cn('text-[10px] font-medium flex-shrink-0', priorityColors[task.priority])}>
          {task.priority}
        </Badge>
      </div>
      <div className="flex items-center gap-2 mb-2">
        <Badge variant="secondary" className={cn('text-[10px]', categoryColors[task.category])}>
          {task.category}
        </Badge>
        <span className="text-[10px] text-muted-foreground">D:{task.difficulty}</span>
      </div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <div className="w-5 h-5 rounded-full bg-secondary flex items-center justify-center">
            <span className="text-[8px] font-medium">{memberAvatar}</span>
          </div>
          <span className="text-[10px] text-muted-foreground">{memberName.split(' ')[0]}</span>
        </div>
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <Calendar className="w-3 h-3" />
          {format(new Date(task.dueDate), 'MMM d')}
        </div>
      </div>
    </motion.div>
  );
}

// ─── CreateTaskModal (shadcn inputs) ───────────────────────────────────────

function CreateTaskModal({
  members,
  onClose,
  onCreate,
}: {
  members: TeamMember[];
  onClose: () => void;
  onCreate: (task: Task) => void;
}) {
  // Default due date = 7 days from now
  const defaultDue = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().split('T')[0];
  }, []);

  const [form, setForm] = useState({
    title: '',
    description: '',
    assigneeId: members[0]?.id || '',
    priority: 'P2' as Priority,
    category: 'Lead Gen' as TaskCategory,
    difficulty: 5,
    dueDate: defaultDue,
    skillCategory: 'retention' as SkillCategoryKey,
  });
  const [autoNote, setAutoNote] = useState('');
  const [touched, setTouched] = useState(false);

  const titleEmpty = !form.title.trim();
  const difficultyValid = form.difficulty >= 1 && form.difficulty <= 10;

  const handleAutoAssign = () => {
    const pick = suggestAssignee({ skillCategory: form.skillCategory, difficulty: form.difficulty, members });
    if (pick) {
      setForm((f) => ({ ...f, assigneeId: pick.memberId }));
      setAutoNote(`${pick.name} — ${pick.rationale}`);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (titleEmpty) return;
    const clampedDifficulty = Math.min(10, Math.max(1, form.difficulty));
    const task: Task = {
      id: crypto.randomUUID(),
      ...form,
      difficulty: clampedDifficulty,
      status: 'todo',
      createdAt: new Date().toISOString().split('T')[0],
    };
    onCreate(task);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="glass rounded-2xl p-6 w-full max-w-lg mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold mb-4">Create New Task</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs text-muted-foreground font-medium">Title <span className="text-red-400">*</span></label>
            <Input
              value={form.title}
              onChange={(e) => { setForm({ ...form, title: e.target.value }); setTouched(true); }}
              required
              placeholder="Task title"
              className={cn(
                'mt-1 bg-secondary/50 border-border/50 text-sm',
                touched && titleEmpty && 'border-red-500/60 focus-visible:ring-red-500/40',
              )}
            />
            {touched && titleEmpty && <p className="text-[10px] text-red-400 mt-1">Title is required</p>}
          </div>
          <div>
            <label className="text-xs text-muted-foreground font-medium">Description</label>
            <Textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Optional description"
              className="mt-1 bg-secondary/50 border-border/50 text-sm resize-none"
              rows={2}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="flex items-center justify-between">
                <label className="text-xs text-muted-foreground font-medium">Assignee</label>
                <button type="button" onClick={handleAutoAssign} className="text-[10px] text-primary hover:underline flex items-center gap-1">
                  <Bot className="w-3 h-3" />Auto-assign
                </button>
              </div>
              <Select value={form.assigneeId} onValueChange={(v) => setForm({ ...form, assigneeId: v })}>
                <SelectTrigger className="mt-1 bg-secondary/50 border-border/50 text-sm">
                  <SelectValue placeholder="Select member" />
                </SelectTrigger>
                <SelectContent>
                  {members.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                </SelectContent>
              </Select>
              {autoNote && <p className="text-[10px] text-primary/80 mt-1">{autoNote}</p>}
            </div>
            <div>
              <label className="text-xs text-muted-foreground font-medium">Skill</label>
              <Select value={form.skillCategory} onValueChange={(v) => setForm({ ...form, skillCategory: v as SkillCategoryKey })}>
                <SelectTrigger className="mt-1 bg-secondary/50 border-border/50 text-sm capitalize">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SKILL_OPTIONS.map((s) => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground font-medium">Priority</label>
              <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v as Priority })}>
                <SelectTrigger className="mt-1 bg-secondary/50 border-border/50 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(['P1', 'P2', 'P3', 'P4'] as Priority[]).map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground font-medium">Category</label>
              <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v as TaskCategory })}>
                <SelectTrigger className="mt-1 bg-secondary/50 border-border/50 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(['Lead Gen', 'Recruiting', 'Retention', 'Revenue', 'Admin'] as TaskCategory[]).map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground font-medium">Difficulty (1–10)</label>
              <Input
                type="number"
                min={1}
                max={10}
                value={form.difficulty}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setForm({ ...form, difficulty: Math.min(10, Math.max(1, isNaN(v) ? 1 : v)) });
                }}
                className={cn(
                  'mt-1 bg-secondary/50 border-border/50 text-sm',
                  !difficultyValid && 'border-amber-500/60',
                )}
              />
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground font-medium">Due Date</label>
            <Input
              type="date"
              value={form.dueDate}
              onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
              required
              className="mt-1 bg-secondary/50 border-border/50 text-sm"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit" className="gradient-primary text-background font-medium">Create Task</Button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
