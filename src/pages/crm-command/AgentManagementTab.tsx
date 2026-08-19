/**
 * AgentManagementTab — Agency-scoped agent roster view for CRM Management.
 *
 * Reads from portal DB (akhojh):
 *   - hierarchy_agencies: resolve portal agency + children
 *   - crm_roster_uploads: find the agency's roster upload
 *   - crm_roster: load agent rows from the upload
 *
 * Features:
 *   - Sub-agency filter (All / each child agency)
 *   - Search across name, email, phone, NPN
 *   - Paginated table: First Name, Last Name, Agency, Email, Phone, NPN
 *   - Edit button per row (placeholder — wired in follow-up)
 *   - Add Agent button (placeholder — wired in follow-up)
 */
import { useState, useEffect, useMemo } from 'react';
import { Search, UserPlus, Pencil, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase as portalSupabase } from '@/lib/crm/portal-client';

// ── Types ──

interface PortalAgency {
  id: string;
  name: string;
  parent_agency_id: string | null;
}

interface RosterUpload {
  id: string;
  agency: string;
  row_count: number;
}

interface AgentRow {
  id: string;
  seatNumber: string;
  firstName: string;
  lastName: string;
  agency: string;
  email: string;
  phone: string;
  npn: string;
  rowData: Record<string, string>;
}

interface AgentManagementTabProps {
  /** Agency name from the FYM App agencies table */
  agencyName: string;
  /** Agency ID from the FYM App agencies table */
  agencyId: string;
}

const PAGE_SIZE = 25;

export function AgentManagementTab({ agencyName }: AgentManagementTabProps) {
  // ── State ──
  const [loading, setLoading] = useState(true);
  const [portalAgencies, setPortalAgencies] = useState<PortalAgency[]>([]);
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [agencyFilter, setAgencyFilter] = useState('All');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // ── Load portal agencies + roster data ──
  useEffect(() => {
    loadData();
  }, [agencyName]);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      // 1. Find the portal agency by name (case-insensitive)
      const { data: matchedAgencies } = await portalSupabase
        .from('hierarchy_agencies')
        .select('id, name, parent_agency_id')
        .eq('is_active', true)
        .eq('crm_enabled', true);

      if (!matchedAgencies || matchedAgencies.length === 0) {
        setError('No CRM-enabled agencies found in portal');
        setLoading(false);
        return;
      }

      // Find the agency that matches our name (case-insensitive, partial match)
      const normalizedName = agencyName.toLowerCase().trim();
      const parentAgency = matchedAgencies.find(
        (a: PortalAgency) => a.name.toLowerCase().trim() === normalizedName
      ) || matchedAgencies.find(
        (a: PortalAgency) => normalizedName.includes(a.name.toLowerCase().trim()) ||
          a.name.toLowerCase().trim().includes(normalizedName)
      );

      if (!parentAgency) {
        setError(`Agency "${agencyName}" not found in CRM portal`);
        setLoading(false);
        return;
      }

      // 2. Find child agencies
      const childAgencies = matchedAgencies.filter(
        (a: PortalAgency) => a.parent_agency_id === parentAgency.id
      );

      const allAgencies = [parentAgency, ...childAgencies];
      setPortalAgencies(allAgencies);

      // 3. Get roster uploads for all agencies in the group
      const agencyNames = allAgencies.map((a: PortalAgency) => a.name);
      const { data: uploads } = await portalSupabase
        .from('crm_roster_uploads')
        .select('id, agency, row_count')
        .in('agency', agencyNames);

      if (!uploads || uploads.length === 0) {
        setAgents([]);
        setLoading(false);
        return;
      }

      // 4. Load roster rows for all uploads
      const uploadIds = (uploads as RosterUpload[]).map((u) => u.id);
      // Build an upload-to-agency map
      const uploadAgencyMap: Record<string, string> = {};
      for (const u of uploads as RosterUpload[]) {
        uploadAgencyMap[u.id] = u.agency;
      }

      // Paginate the roster query to avoid Supabase default cap
      const allRows: { id: string; upload_id: string; row_data: Record<string, string> }[] = [];
      const FETCH_PAGE = 1000;
      for (let offset = 0; ; offset += FETCH_PAGE) {
        const { data: batch } = await portalSupabase
          .from('crm_roster')
          .select('id, upload_id, row_data')
          .in('upload_id', uploadIds)
          .range(offset, offset + FETCH_PAGE - 1);
        if (!batch || batch.length === 0) break;
        allRows.push(...(batch as typeof allRows));
        if (batch.length < FETCH_PAGE) break;
      }

      // 5. Transform to AgentRow
      const agentRows: AgentRow[] = allRows
        .map((row) => {
          const rd = row.row_data || {};
          const seatNum = rd['Seat Number'] || '';
          // Skip empty/placeholder rows (no name)
          if (!rd['First Name'] && !rd['Last Name']) return null;
          return {
            id: row.id,
            seatNumber: seatNum,
            firstName: rd['First Name'] || '',
            lastName: rd['Last Name'] || '',
            agency: uploadAgencyMap[row.upload_id] || '',
            email: rd['Email'] || rd['email'] || '',
            phone: rd['Phone'] || rd['phone'] || '',
            npn: rd['Agent NPN'] || rd['NPN'] || '',
            rowData: rd,
          };
        })
        .filter((r): r is AgentRow => r !== null)
        .sort((a, b) => {
          // Sort by seat number numerically
          const aNum = parseInt(a.seatNumber) || 999;
          const bNum = parseInt(b.seatNumber) || 999;
          return aNum - bNum;
        });

      setAgents(agentRows);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load roster data');
    } finally {
      setLoading(false);
    }
  };

  // ── Filtered + searched agents ──
  const filteredAgents = useMemo(() => {
    let result = agents;

    // Agency filter
    if (agencyFilter !== 'All') {
      result = result.filter((a) => a.agency === agencyFilter);
    }

    // Search filter
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      result = result.filter(
        (a) =>
          a.firstName.toLowerCase().includes(q) ||
          a.lastName.toLowerCase().includes(q) ||
          a.email.toLowerCase().includes(q) ||
          a.phone.includes(q) ||
          a.npn.includes(q)
      );
    }

    return result;
  }, [agents, agencyFilter, search]);

  // ── Pagination ──
  const totalPages = Math.max(1, Math.ceil(filteredAgents.length / PAGE_SIZE));
  const pagedAgents = filteredAgents.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  // Reset page when filter/search changes
  useEffect(() => {
    setPage(0);
  }, [agencyFilter, search]);

  // ── Loading state ──
  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mr-3" />
        Loading agent roster…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <p className="text-destructive font-medium">{error}</p>
        <button
          onClick={loadData}
          className="mt-3 text-xs text-primary hover:underline"
        >
          Retry
        </button>
      </div>
    );
  }

  // ── Unique agency names for the filter ──
  const agencyFilterOptions = portalAgencies.map((a) => a.name);

  return (
    <div className="flex flex-col gap-4">
      {/* Sub-agency filter */}
      {agencyFilterOptions.length > 1 && (
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setAgencyFilter('All')}
            className={cn(
              'px-3 py-1.5 text-xs font-medium rounded-lg transition-colors',
              agencyFilter === 'All'
                ? 'bg-primary text-primary-foreground'
                : 'bg-secondary text-muted-foreground hover:text-foreground'
            )}
          >
            All
          </button>
          {agencyFilterOptions.map((name) => (
            <button
              key={name}
              onClick={() => setAgencyFilter(name)}
              className={cn(
                'px-3 py-1.5 text-xs font-medium rounded-lg transition-colors',
                agencyFilter === name
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary text-muted-foreground hover:text-foreground'
              )}
            >
              {name}
            </button>
          ))}
        </div>
      )}

      {/* Search + count + Add Agent */}
      <div className="flex items-center justify-between gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search agents…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm bg-secondary/50 border border-border/40 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary/50"
          />
        </div>
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          {filteredAgents.length} agent{filteredAgents.length !== 1 ? 's' : ''}
        </span>
        <button
          className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
          onClick={() => {
            // Placeholder — will be wired to AddAgentModal in follow-up
          }}
        >
          <UserPlus className="w-3.5 h-3.5" />
          Add Agent
        </button>
      </div>

      {/* Agent table */}
      <div className="border border-border/40 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-secondary/30 border-b border-border/40">
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">First Name</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Last Name</th>
                {agencyFilterOptions.length > 1 && (
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Agency</th>
                )}
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Email</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Phone</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">NPN</th>
                <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground w-16"></th>
              </tr>
            </thead>
            <tbody>
              {pagedAgents.length === 0 ? (
                <tr>
                  <td
                    colSpan={agencyFilterOptions.length > 1 ? 7 : 6}
                    className="text-center py-8 text-muted-foreground text-sm"
                  >
                    {search ? 'No agents match your search' : 'No agents in roster'}
                  </td>
                </tr>
              ) : (
                pagedAgents.map((agent) => (
                  <tr
                    key={agent.id}
                    className="border-b border-border/20 hover:bg-secondary/10 transition-colors"
                  >
                    <td className="px-4 py-2.5 font-medium">{agent.firstName}</td>
                    <td className="px-4 py-2.5">{agent.lastName}</td>
                    {agencyFilterOptions.length > 1 && (
                      <td className="px-4 py-2.5 text-muted-foreground">{agent.agency}</td>
                    )}
                    <td className="px-4 py-2.5 text-muted-foreground">{agent.email}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{agent.phone}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{agent.npn}</td>
                    <td className="px-4 py-2.5 text-right">
                      <button
                        className="p-1 rounded hover:bg-secondary/50 text-muted-foreground hover:text-foreground transition-colors"
                        title="Edit agent"
                        onClick={() => {
                          // Placeholder — will be wired to EditAgentModal in follow-up
                        }}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-1">
          <span className="text-xs text-muted-foreground">
            Page {page + 1} of {totalPages}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="p-1.5 rounded hover:bg-secondary/50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="p-1.5 rounded hover:bg-secondary/50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
