/**
 * NewBusinessTab — Agency-scoped new business intake view for CRM Management.
 *
 * Reads from portal DB: crm_business_intake
 * Shows submitted new business records with status tracking.
 */
import { useState, useEffect, useMemo } from 'react';
import { Search, FileText, CheckCircle2, Clock, AlertTriangle, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase as portalSupabase } from '@/lib/crm/portal-client';

interface IntakeRecord {
  id: string;
  agent_first_name: string | null;
  agent_last_name: string | null;
  client_first_name: string | null;
  client_last_name: string | null;
  client_phone: string | null;
  carrier: string | null;
  product_type: string | null;
  policy_number: string | null;
  premium_amount: number | null;
  effective_date: string | null;
  status: string | null;
  created_at: string;
  needs_fix: boolean | null;
}

interface NewBusinessTabProps {
  agencyName: string;
  agencyId: string;
}

const PAGE_SIZE = 25;

const STATUS_STYLES: Record<string, string> = {
  pending: 'bg-amber-500/10 text-amber-400',
  approved: 'bg-emerald-500/10 text-emerald-400',
  rejected: 'bg-red-500/10 text-red-400',
  needs_fix: 'bg-orange-500/10 text-orange-400',
};

export function NewBusinessTab({ agencyName }: NewBusinessTabProps) {
  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState<IntakeRecord[]>([]);
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
    const groupIds = [parent, ...children].map((a: { id: string }) => a.id);

    const { data } = await portalSupabase
      .from('crm_business_intake')
      .select('id, agent_first_name, agent_last_name, client_first_name, client_last_name, client_phone, carrier, product_type, policy_number, premium_amount, effective_date, status, created_at, needs_fix')
      .in('agency_id', groupIds)
      .order('created_at', { ascending: false });

    setRecords((data || []) as IntakeRecord[]);
    setLoading(false);
  };

  const filtered = useMemo(() => {
    if (!search.trim()) return records;
    const q = search.toLowerCase();
    return records.filter((r) =>
      (r.client_first_name || '').toLowerCase().includes(q) ||
      (r.client_last_name || '').toLowerCase().includes(q) ||
      (r.agent_first_name || '').toLowerCase().includes(q) ||
      (r.agent_last_name || '').toLowerCase().includes(q) ||
      (r.policy_number || '').toLowerCase().includes(q) ||
      (r.carrier || '').toLowerCase().includes(q)
    );
  }, [records, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  useEffect(() => { setPage(0); }, [search]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mr-3" />
        Loading new business…
      </div>
    );
  }

  if (records.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <FileText className="w-12 h-12 mb-3 opacity-40" />
        <p className="text-lg font-medium">No New Business</p>
        <p className="text-sm mt-1">No business intake records submitted yet</p>
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
            placeholder="Search by client, agent, policy…"
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
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Client</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Agent</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Carrier</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Product</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Policy #</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Premium</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody>
              {paged.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-muted-foreground text-sm">
                    No records match your search
                  </td>
                </tr>
              ) : (
                paged.map((r) => (
                  <tr key={r.id} className="border-b border-border/20 hover:bg-secondary/10 transition-colors">
                    <td className="px-4 py-2.5 font-medium">
                      {r.client_first_name} {r.client_last_name}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {r.agent_first_name} {r.agent_last_name}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">{r.carrier || '--'}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{r.product_type || '--'}</td>
                    <td className="px-4 py-2.5 text-muted-foreground font-mono text-xs">{r.policy_number || '--'}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {r.premium_amount ? `$${r.premium_amount.toFixed(2)}` : '--'}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={cn(
                        'inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium',
                        r.needs_fix
                          ? STATUS_STYLES.needs_fix
                          : STATUS_STYLES[r.status || ''] || 'bg-secondary text-muted-foreground'
                      )}>
                        {r.needs_fix ? (
                          <><AlertTriangle className="w-3 h-3" /> Needs Fix</>
                        ) : r.status === 'approved' ? (
                          <><CheckCircle2 className="w-3 h-3" /> Approved</>
                        ) : r.status === 'rejected' ? (
                          <>Rejected</>
                        ) : (
                          <><Clock className="w-3 h-3" /> Pending</>
                        )}
                      </span>
                    </td>
                  </tr>
                ))
              )}
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
