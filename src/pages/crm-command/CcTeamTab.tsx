import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Users, Loader2, AlertTriangle } from 'lucide-react';
import { useTeamStore, useTasksStore } from '@/stores/cc-stores';
import type { SkillCategoryKey, TeamMember } from '@/lib/command-center/types';
import { TeamMemberPanel } from './TeamMemberPanel';

const skillLabels: SkillCategoryKey[] = [
  'marketing', 'sales', 'tech', 'recruiting', 'retention', 'ghl',
];
const skillColors: Record<string, string> = {
  marketing: 'bg-sky-400', sales: 'bg-emerald-400', tech: 'bg-amber-400',
  recruiting: 'bg-green-400', retention: 'bg-rose-400', ghl: 'bg-violet-400',
};
const skillDisplay: Record<string, string> = {
  marketing: 'Marketing', sales: 'Sales', tech: 'Tech',
  recruiting: 'Recruiting', retention: 'Retention', ghl: 'GHL',
};
const confidenceStyle: Record<string, string> = {
  low: 'bg-slate-400/10 text-muted-foreground border-slate-400/20',
  medium: 'bg-sky-400/10 text-sky-300 border-sky-400/20',
  high: 'bg-emerald-400/10 text-emerald-300 border-emerald-400/20',
};

function WorkloadSummaryStrip({ members, allTasks }: { members: TeamMember[]; allTasks: import('@/lib/command-center/types').Task[] }) {
  const stats = useMemo(() => {
    const openTasks = allTasks.filter((t) => t.status !== 'done');
    const unassigned = openTasks.filter((t) => !t.assigneeId || !members.some((m) => m.id === t.assigneeId)).length;
    const overloaded = members.filter((m) => {
      const cap = m.workload || 10;
      const count = openTasks.filter((t) => t.assigneeId === m.id).length;
      return cap > 0 && (count / cap) >= 0.9;
    }).length;
    const idle = members.filter((m) => {
      const count = openTasks.filter((t) => t.assigneeId === m.id).length;
      return count === 0;
    }).length;
    return { total: openTasks.length, unassigned, overloaded, idle };
  }, [members, allTasks]);

  if (members.length === 0) return null;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {[
        { label: 'Open Tasks', value: stats.total, color: 'text-sky-400' },
        { label: 'Unassigned', value: stats.unassigned, color: stats.unassigned > 0 ? 'text-amber-400' : 'text-muted-foreground' },
        { label: 'At Capacity', value: stats.overloaded, color: stats.overloaded > 0 ? 'text-red-400' : 'text-muted-foreground', icon: stats.overloaded > 0 },
        { label: 'Idle', value: stats.idle, color: stats.idle > 0 ? 'text-emerald-400' : 'text-muted-foreground' },
      ].map((s) => (
        <div key={s.label} className="glass rounded-lg px-4 py-3 flex items-center gap-3">
          <p className={`text-xl font-bold leading-none ${s.color}`}>{s.value}</p>
          <div className="flex items-center gap-1">
            {s.icon && <AlertTriangle className="w-3 h-3 text-red-400" />}
            <p className="text-[11px] text-muted-foreground">{s.label}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

export function CcTeamTab() {
  const members = useTeamStore((s) => s.members);
  const loading = useTeamStore((s) => s.loading);
  const source = useTeamStore((s) => s.source);
  const loadLive = useTeamStore((s) => s.loadLive);
  const updateMember = useTeamStore((s) => s.updateMember);
  const allTasks = useTasksStore((s) => s.tasks);
  const [selectedMember, setSelectedMember] = useState<TeamMember | null>(null);

  useEffect(() => {
    if (source === 'mock') return;
    if (members.length === 0) void loadLive();
  }, [source, members.length, loadLive]);

  if (loading && members.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center">
        <Loader2 className="w-8 h-8 text-primary animate-spin mb-4" />
        <p className="text-sm text-muted-foreground">Loading team…</p>
      </div>
    );
  }

  if (members.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center">
        <Users className="w-12 h-12 text-muted-foreground mb-4" />
        <h2 className="text-lg font-semibold mb-2">Team & Roles</h2>
        <p className="text-sm text-muted-foreground">No team members found.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold">Team &amp; Roles</h1>
        {source && source !== 'mock' && (
          <span className="text-[11px] text-muted-foreground">
            {source === 'live' ? 'Live — task-HQ DB' : 'Seed estimates (low confidence) — firms up as tasks complete'}
          </span>
        )}
      </div>

      <WorkloadSummaryStrip members={members} allTasks={allTasks} />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {members.map((member, i) => (
          <motion.div key={member.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} onClick={() => setSelectedMember(member)} className="glass rounded-xl p-5 glass-hover cursor-pointer hover:border-primary/30 transition-all">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-xl gradient-primary flex items-center justify-center">
                <span className="text-sm font-bold text-background">{member.avatar || member.name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2)}</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold truncate">{member.name}</h3>
                  {(() => { const count = allTasks.filter((t) => t.assigneeId === member.id && t.status !== 'done').length; return count > 0 ? <span className="flex-shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-primary/20 text-primary">{count} task{count !== 1 ? 's' : ''}</span> : null; })()}
                </div>
                <p className="text-xs text-muted-foreground">{member.role}</p>
              </div>
            </div>
            <div className="space-y-2">
              {skillLabels.map((skill) => {
                const score = member.proficiency?.[skill];
                const level = score ? score.level : ((member.skills?.[skill] ?? 0) * 10);
                const confidence = score?.confidence ?? 'low';
                return (
                  <div key={skill} className="flex items-center gap-2">
                    <span className="text-[10px] text-muted-foreground w-16">{skillDisplay[skill]}</span>
                    <div className="flex-1 h-1.5 bg-secondary/50 rounded-full overflow-hidden">
                      <motion.div initial={{ width: 0 }} animate={{ width: `${level}%` }} transition={{ duration: 0.5, delay: i * 0.05 }} className={`h-full rounded-full ${skillColors[skill]} ${score?.stale ? 'opacity-40' : ''}`} />
                    </div>
                    <span className="text-[10px] text-muted-foreground w-7 text-right">{Math.round(level)}</span>
                    <span className={`text-[8px] px-1 py-0.5 rounded border w-12 text-center ${confidenceStyle[confidence]}`}>{confidence}</span>
                  </div>
                );
              })}
            </div>
          </motion.div>
        ))}
      </div>

      <AnimatePresence>
        {selectedMember && (
          <TeamMemberPanel key={selectedMember.id} member={selectedMember} allTasks={allTasks} onClose={() => setSelectedMember(null)} onUpdate={(id, updates) => { updateMember(id, updates); setSelectedMember((prev) => prev ? { ...prev, ...updates } : null); }} />
        )}
      </AnimatePresence>
    </div>
  );
}
