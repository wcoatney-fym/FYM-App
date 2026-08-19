/**
 * CancellationUploadTab — Agency-scoped cancellation/termination log view.
 *
 * Reads from portal DB: crm_termination_log
 * Shows agents that have been terminated from the roster.
 */
import { useState, useEffect, useMemo } from 'react';
import { Search, FileUp, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase as portalSupabase } from '@/lib/crm/portal-client';

interface TerminationRecord {
  id: string;
  agent_name: string | null;
  agent_npn: string | null;
  status: string | null;
  agency: string | null;
  terminated_at: string | null;
  created_at: string;
}

interface CancellationUploadTabProps {
  agencyName: string;
  agencyId: string;
}

const PAGE_SIZE = 25;

export function CancellationUploadTab({ agencyName }: CancellationUploadTabProps) {
  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState<TerminationRecord[]>([]);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);

  useEffect(() => { loadRecords(); }, [agencyName]);

  const loadRecords = async () => {
    setLoading(true);

    const { data: agencies } = await portalSupabase
      .from('hierarchy_agencies')
      .select('id, name, parent_agency_id')
      .eq('is_active', true)
      .eq('crm_enabled', true);

    if (!agencies) { setLoading(false); return; }

    const normalizedName = agencyName.toLowerCase().trim();
    const parent = agencies.find(
      (a: { name: string }) => a.name.toLowerCase().trim() === normalizedName
    ) || agencies.find(
      (a: { name: string }) =>
        normalizedName.includes(a.name.toLowerCase().trim()) ||
        a.name.toLowerCase().trim().includes(normalizedName)
    );

    if (!parent) { setRecords([]); setLoading(false); return; }

    const children = agencies.filter(
      (a: { parent_agency_id: string | null }) => a.parent_agency_id === parent.id
    );
    const groupNames = [parent, ...children].map((a: { name: string }) => a.name);

    const { data } = await portalSupabase
      .from('crm_termination_log')
      .select('*')
      .in('agency', groupNames)
      .order('created_at', { ascending: false });

    setRecords((data || []) as TerminationRecord[]);
    setLoading(false);
  };

  const filtered = useMemo(() => {
    if (!search.trim()) return records;
    const q = search.toLowerCase();
    return records.filter((r) =>
      (r.agent_name || '').toLowerCase().includes(q) ||
      (r.agent_npn || '').includes(q) ||
      (r.agency || '').toLowerCase().includes(q)
    );
  }, [records, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  useEffect(() => { setPage(0); }, [search]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mr-3" />
        Loading terminations…
      </div>
    );
  }

  if (records.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <FileUp className="w-12 h-12 mb-3 opacity-40" />
        <p className="text-lg font-medium">No Cancellations</p>
        <p className="text-sm mt-1">No agent terminations recorded</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search by agent name or NPN…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm bg-secondary/50 border border-border/40 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary/50"
          />
        </div>
        <span className="text-xs text-muted-foreground">
          {filtered.length} record{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="border border-border/40 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-secondary/30 border-b border-border/40">
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Agent Name</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">NPN</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Agency</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Status</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Terminated</th>
              </tr>
            </thead>
            <tbody>
              {paged.map((r) => (
                <tr key={r.id} className="border-b border-border/20 hover:bg-secondary/10 transition-colors">
                  <td className="px-4 py-2.5 font-medium">{r.agent_name || '--'}</td>
                  <td className="px-4 py-2.5 text-muted-foreground font-mono text-xs">{r.agent_npn || '--'}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{r.agency || '--'}</td>
                  <td className="px-4 py-2.5">
                    <span className={cn(
                      'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium',
                      r.status === 'confirmed' ? 'bg-emerald-500/10 text-emerald-400' :
                      r.status === 'rejected' ? 'bg-red-500/10 text-red-400' :
                      'bg-amber-500/10 text-amber-400'
                    )}>
                      {r.status || 'pending'}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground text-xs">
                    {r.terminated_at
                      ? new Date(r.terminated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                      : '--'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between px-1">
          <span className="text-xs text-muted-foreground">Page {page + 1} of {totalPages}</span>
          <div className="flex items-center gap-1">
            <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}
              className="p-1.5 rounded hover:bg-secondary/50 disabled:opacity-30 transition-colors">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
              className="p-1.5 rounded hover:bg-secondary/50 disabled:opacity-30 transition-colors">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
