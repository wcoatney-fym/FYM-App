import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '@/components/layout/Header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/lib/supabase';
import { Search, Activity, UserPlus } from 'lucide-react';

interface AgentRow {
  id: string;
  full_name: string | null;
  writing_number: string | null;
  npn: string | null;
  agency_id: string | null;
  role: string;
  // joined from agency_retention_summary
  active_policies?: number;
  at_risk_count?: number;
  retention_pct?: number | null;
}

function roleBadge(role: string) {
  if (role === 'admin')   return 'bg-violet-50 text-violet-700 border-violet-200';
  if (role === 'manager') return 'bg-blue-50 text-blue-700 border-blue-200';
  return 'bg-slate-50 text-slate-600 border-slate-200';
}

export function AgentsPage() {
  const navigate = useNavigate();
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    async function load() {
      // Load profiles
      const { data: profiles } = await supabase!
        .from('profiles')
        .select('id, full_name, writing_number, npn, agency_id, role')
        .order('full_name', { ascending: true });

      if (!profiles) { setLoading(false); return; }

      // Load per-agency retention summary to enrich agent rows
      const { data: agencyStatsRaw } = await (supabase as any)
        .from('agency_retention_summary')
        .select('agency_id, active_policies, at_risk_count, retention_pct');

      const statsMap = new Map<string, { at_risk_count: number; retention_pct: number | null }>();
      if (agencyStatsRaw) {
        for (const s of agencyStatsRaw as any[]) statsMap.set(s.agency_id, s);
      }

      // Load per-agent policy counts from policy_cache
      const { data: agentPolicyCounts } = await (supabase as any)
        .from('policy_cache')
        .select('agent_id')
        .eq('status', 'active');

      const agentCountMap = new Map<string, number>();
      if (agentPolicyCounts) {
        for (const p of agentPolicyCounts as any[]) {
          if (p.agent_id) agentCountMap.set(p.agent_id, (agentCountMap.get(p.agent_id) ?? 0) + 1);
        }
      }

      const enriched: AgentRow[] = (profiles as any[]).map((p: any) => {
        const agencyStat = p.agency_id ? statsMap.get(p.agency_id) : undefined;
        return {
          id: p.id,
          full_name: p.full_name,
          writing_number: p.writing_number,
          npn: p.npn,
          agency_id: p.agency_id,
          role: p.role,
          active_policies: agentCountMap.get(p.id) ?? 0,
          at_risk_count: agencyStat?.at_risk_count,
          retention_pct: agencyStat?.retention_pct,
        };
      });

      setAgents(enriched);
      setLoading(false);
    }
    load();
  }, []);

  const filtered = useMemo(() => {
    if (!search) return agents;
    const q = search.toLowerCase();
    return agents.filter(a =>
      (a.full_name ?? '').toLowerCase().includes(q) ||
      (a.npn ?? '').includes(q) ||
      (a.writing_number ?? '').toLowerCase().includes(q) ||
      (a.agency_id ?? '').toLowerCase().includes(q)
    );
  }, [agents, search]);

  const withWritingNumber = agents.filter(a => a.writing_number).length;

  return (
    <div>
      <Header title="Agents" />
      <div className="p-6 space-y-4">
        {/* stats strip */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'Total Agents', value: agents.length, sub: 'in system' },
            { label: 'Writing # Set', value: withWritingNumber, sub: 'policies linked' },
            { label: 'No Writing #', value: agents.length - withWritingNumber, sub: 'health view unavailable', warn: true },
          ].map(c => (
            <Card key={c.label} className="border-slate-200">
              <CardContent className="py-4 px-5">
                <p className="text-xs font-medium text-slate-500">{c.label}</p>
                <p className={`text-2xl font-bold mt-0.5 ${c.warn && agents.length - withWritingNumber > 0 ? 'text-amber-700' : 'text-slate-900'}`}>{c.value}</p>
                <p className="text-xs text-slate-400 mt-0.5">{c.sub}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card className="border-slate-200">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <CardTitle className="text-base font-semibold text-slate-900">Agent Directory</CardTitle>
              <div className="flex items-center gap-2">
                <div className="relative w-full sm:w-64">
                  <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <Input
                    placeholder="Name, NPN, writing #…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="pl-8 bg-white h-8 text-sm"
                  />
                </div>
                <Button
                  size="sm"
                  onClick={() => navigate('/provision')}
                  className="h-8 bg-[#1e3a5f] hover:bg-[#162d4a] text-white text-xs gap-1.5"
                >
                  <UserPlus size={13} /> Add Agent
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-6 space-y-2">
                {[1,2,3,4,5].map(i => <div key={i} className="h-10 rounded bg-slate-100 animate-pulse" />)}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50">
                    <TableHead className="font-semibold text-slate-600">Name</TableHead>
                    <TableHead className="font-semibold text-slate-600">Role</TableHead>
                    <TableHead className="font-semibold text-slate-600">Writing #</TableHead>
                    <TableHead className="font-semibold text-slate-600">NPN</TableHead>
                    <TableHead className="font-semibold text-slate-600 text-right">Active Policies</TableHead>
                    <TableHead className="font-semibold text-slate-600 text-right">Retention</TableHead>
                    <TableHead className="font-semibold text-slate-600 text-right">Health</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(a => (
                    <TableRow key={a.id} className="hover:bg-slate-50 transition-colors">
                      <TableCell className="font-medium text-slate-900">{a.full_name ?? <span className="text-slate-400 italic">Unnamed</span>}</TableCell>
                      <TableCell>
                        <Badge className={`text-[10px] px-1.5 py-0 border ${roleBadge(a.role)}`}>{a.role}</Badge>
                      </TableCell>
                      <TableCell className={`font-mono text-sm ${a.writing_number ? 'text-slate-700' : 'text-slate-300 italic'}`}>
                        {a.writing_number ?? 'not set'}
                      </TableCell>
                      <TableCell className={`font-mono text-sm ${a.npn ? 'text-slate-700' : 'text-slate-300'}`}>
                        {a.npn ?? '—'}
                      </TableCell>
                      <TableCell className="text-right font-medium text-slate-700">
                        {a.active_policies ? a.active_policies.toLocaleString() : <span className="text-slate-300">—</span>}
                      </TableCell>
                      <TableCell className="text-right">
                        {a.retention_pct != null ? (
                          <span className={`font-semibold text-sm ${a.retention_pct >= 90 ? 'text-emerald-700' : a.retention_pct >= 85 ? 'text-amber-700' : 'text-red-700'}`}>
                            {a.retention_pct}%
                          </span>
                        ) : <span className="text-slate-300 text-sm">—</span>}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-blue-600 hover:text-blue-800 hover:bg-blue-50 h-7 px-2"
                          onClick={() => navigate(`/agents/${a.id}/health`)}
                          disabled={!a.writing_number}
                        >
                          <Activity size={13} className="mr-1" />
                          {a.writing_number ? 'View' : 'No data'}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {filtered.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-10 text-slate-400">
                        {agents.length === 0 ? 'No agents provisioned yet. Use the Add Agent button above.' : 'No agents match your search.'}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
