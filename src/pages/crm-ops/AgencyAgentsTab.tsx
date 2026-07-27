/**
 * @crm-protected
 * DO NOT MODIFY without Charlie's explicit approval.
 * This file is part of CRM Ops (OpenClaw Dashboard).
 * Table references use hierarchy_agencies (NOT crm_agencies).
 * Any rename or schema change to hierarchy_agencies requires updating this file.
 * See: docs/CRM_OPS_FILES.md for the full protected file list.
 */
import React, { useState, useEffect } from 'react';
import { Users, Search } from 'lucide-react';
import { supabase } from '@/lib/crm/portal-client';
import type { Agent } from '@/lib/crm/types';

interface AgencyAgentsTabProps {
  agencyName: string;
  agencyId: string;
}

type PipelineAgent = {
  id: string;
  agent_id: string;
  stage: string;
  created_at: string;
};

const STAGE_COLORS: Record<string, string> = {
  new: 'bg-blue-400/10 text-blue-400',
  'contracting-started': 'bg-amber-400/10 text-amber-400',
  'contracting-complete': 'bg-teal-400/10 text-teal-400',
  completed: 'bg-emerald-400/10 text-emerald-400',
  terminated: 'bg-red-400/10 text-red-400',
};

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-secondary text-foreground/80',
  'in-progress': 'bg-amber-400/10 text-amber-400',
  completed: 'bg-emerald-400/10 text-emerald-400',
  expired: 'bg-red-400/10 text-red-400',
  terminated: 'bg-red-400/10 text-red-400',
};

export const AgencyAgentsTab: React.FC<AgencyAgentsTabProps> = ({ agencyName }) => {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [pipelineAgents, setPipelineAgents] = useState<PipelineAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const load = async () => {
      const [agentsRes, pipelineRes] = await Promise.all([
        supabase.from('agents').select('*').eq('agency', agencyName).order('last_name'),
        supabase.from('crm_pipeline').select('*').order('created_at', { ascending: false }),
      ]);

      setAgents(agentsRes.data || []);
      setPipelineAgents(pipelineRes.data || []);
      setLoading(false);
    };
    load();
  }, [agencyName]);

  const pipelineMap = new Map<string, PipelineAgent>();
  for (const pa of pipelineAgents) {
    pipelineMap.set(pa.agent_id, pa);
  }

  const filtered = agents.filter((a) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      a.first_name.toLowerCase().includes(q) ||
      a.last_name.toLowerCase().includes(q) ||
      a.email.toLowerCase().includes(q)
    );
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/70" />
          <input
            type="text"
            placeholder="Search agents..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring text-sm"
          />
        </div>
        <div className="text-sm text-muted-foreground">
          {agents.length} agent{agents.length !== 1 ? 's' : ''}
        </div>
      </div>

      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-muted">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Email</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Form Type</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Contracting Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Pipeline Stage</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {filtered.map((agent) => {
                const pipeline = pipelineMap.get(agent.id);
                return (
                  <tr key={agent.id} className="hover:bg-muted transition-colors">
                    <td className="px-6 py-3 whitespace-nowrap">
                      <span className="text-sm font-medium text-foreground">
                        {agent.first_name} {agent.last_name}
                      </span>
                    </td>
                    <td className="px-6 py-3 whitespace-nowrap text-sm text-muted-foreground">{agent.email}</td>
                    <td className="px-6 py-3 whitespace-nowrap text-sm text-muted-foreground capitalize">{agent.form_type}</td>
                    <td className="px-6 py-3 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${STATUS_COLORS[agent.status] || 'bg-secondary text-muted-foreground'}`}>
                        {agent.status}
                      </span>
                    </td>
                    <td className="px-6 py-3 whitespace-nowrap">
                      {pipeline ? (
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${STAGE_COLORS[pipeline.stage] || 'bg-secondary text-muted-foreground'}`}>
                          {pipeline.stage.replace(/-/g, ' ')}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground/70">Not in pipeline</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center">
                    <Users className="w-8 h-8 text-muted-foreground/60 mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">
                      {agents.length === 0 ? 'No agents found for this agency' : 'No agents match your search'}
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
