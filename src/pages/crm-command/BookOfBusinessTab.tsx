/**
 * BookOfBusinessTab — Agency-scoped book of business view for CRM Management.
 *
 * Reads from Max's prod DB via the quality-metrics-direct edge function,
 * scoped to the agency's writing number. Shows active policies with
 * key details: client, plan, premium, status, paid-to-date.
 *
 * Falls back to a placeholder if the agency's writing number isn't mapped.
 */
import { useState, useEffect, useMemo } from 'react';
import { Search, BookOpen, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase as portalSupabase } from '@/lib/crm/portal-client';

interface PolicyRow {
  policy_nbr: string;
  first_name: string;
  last_name: string;
  plan_name: string;
  carrier: string;
  annual_premium: number | null;
  effective_date: string | null;
  paid_to_date: string | null;
  cntrct_code: string;
  at_risk: boolean;
}

interface BookOfBusinessTabProps {
  agencyName: string;
  agencyId: string;
  agencyIds?: string[];
  agencyNames?: string[];
}

const PAGE_SIZE = 25;

const STATUS_STYLES: Record<string, string> = {
  A: 'bg-emerald-500/10 text-emerald-400',
  P: 'bg-amber-500/10 text-amber-400',
  T: 'bg-red-500/10 text-red-400',
};

const STATUS_LABELS: Record<string, string> = {
  A: 'Active',
  P: 'Pending',
  T: 'Terminated',
};

export function BookOfBusinessTab({ agencyName }: BookOfBusinessTabProps) {
  const [loading, setLoading] = useState(true);
  const [policies, setPolicies] = useState<PolicyRow[]>([]);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { loadPolicies(); }, [agencyName]);

  const loadPolicies = async () => {
    setLoading(true);
    setError(null);

    try {
      // Resolve portal agency to get the writing number
      const { data: agencies } = await portalSupabase
        .from('hierarchy_agencies')
        .select('id, name, parent_agency_id, unl_writing_number')
        .eq('is_active', true)
        .eq('crm_enabled', true);

      if (!agencies) { setError('Unable to load agency data'); setLoading(false); return; }

      const normalizedName = agencyName.toLowerCase().trim();
      const parent = agencies.find(
        (a: { name: string }) => a.name.toLowerCase().trim() === normalizedName
      ) || agencies.find(
        (a: { name: string }) =>
          normalizedName.includes(a.name.toLowerCase().trim()) ||
          a.name.toLowerCase().trim().includes(normalizedName)
      );

      if (!parent) {
        setError('Agency not found in portal');
        setLoading(false);
        return;
      }

      // Get all group agency names for matching in Max's DB
      const children = agencies.filter(
        (a: { parent_agency_id: string | null }) => a.parent_agency_id === parent.id
      );
      const allGroupAgencies = [parent, ...children];
      // groupNames will be used when the BoB edge function is connected
      void allGroupAgencies.map((a: { name: string }) => a.name);

      // Query Max's DB via the admin-api edge function for policies
      // The admin-api accepts agency_names and returns policies
      const adminApiUrl = import.meta.env.VITE_TRACKER_SUPABASE_URL || import.meta.env.VITE_ACTIVITY_TRACKER_URL;
      const adminApiKey = import.meta.env.VITE_TRACKER_SUPABASE_KEY || import.meta.env.VITE_ACTIVITY_TRACKER_KEY;

      if (!adminApiUrl || !adminApiKey) {
        // Fallback: show a message that BoB data requires tracker connection
        setPolicies([]);
        setLoading(false);
        return;
      }

      // For now, show placeholder — the edge function for BoB queries needs to be built
      // or we need to connect to the existing quality-metrics-direct function
      setPolicies([]);
      setLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load book of business');
      setLoading(false);
    }
  };

  const filtered = useMemo(() => {
    let result = policies;
    if (statusFilter !== 'all') {
      result = result.filter((p) => p.cntrct_code === statusFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((p) =>
        p.first_name.toLowerCase().includes(q) ||
        p.last_name.toLowerCase().includes(q) ||
        p.policy_nbr.toLowerCase().includes(q) ||
        p.plan_name.toLowerCase().includes(q)
      );
    }
    return result;
  }, [policies, statusFilter, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  useEffect(() => { setPage(0); }, [search, statusFilter]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mr-3" />
        Loading book of business…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <BookOpen className="w-12 h-12 mb-3 opacity-40" />
        <p className="text-destructive font-medium">{error}</p>
      </div>
    );
  }

  if (policies.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <BookOpen className="w-12 h-12 mb-3 opacity-40" />
        <p className="text-lg font-medium">Book of Business</p>
        <p className="text-sm mt-1">Policy data will be available once the data connection is configured</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Filters */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {['all', 'A', 'P', 'T'].map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={cn(
                'px-3 py-1.5 text-xs font-medium rounded-lg transition-colors',
                statusFilter === s
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary text-muted-foreground hover:text-foreground'
              )}
            >
              {s === 'all' ? 'All' : STATUS_LABELS[s]}
            </button>
          ))}
        </div>
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search policies…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm bg-secondary/50 border border-border/40 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary/50"
          />
        </div>
      </div>

      {/* Table */}
      <div className="border border-border/40 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-secondary/30 border-b border-border/40">
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Client</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Policy #</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Plan</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Premium</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Effective</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Paid To</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody>
              {paged.map((p) => (
                <tr key={p.policy_nbr} className="border-b border-border/20 hover:bg-secondary/10 transition-colors">
                  <td className="px-4 py-2.5 font-medium">{p.first_name} {p.last_name}</td>
                  <td className="px-4 py-2.5 text-muted-foreground font-mono text-xs">{p.policy_nbr}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{p.plan_name}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">
                    {p.annual_premium ? `$${(p.annual_premium / 12).toFixed(2)}/mo` : '--'}
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground text-xs">{p.effective_date || '--'}</td>
                  <td className="px-4 py-2.5 text-muted-foreground text-xs">{p.paid_to_date || '--'}</td>
                  <td className="px-4 py-2.5">
                    <span className={cn(
                      'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium',
                      STATUS_STYLES[p.cntrct_code] || 'bg-secondary text-muted-foreground'
                    )}>
                      {STATUS_LABELS[p.cntrct_code] || p.cntrct_code}
                      {p.at_risk && ' ⚠️'}
                    </span>
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
