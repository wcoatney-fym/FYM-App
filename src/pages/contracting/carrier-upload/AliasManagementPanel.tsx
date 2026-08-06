/**
 * AliasManagementPanel — View, search, filter, and delete stored carrier aliases
 *
 * Shows all persistent alias mappings created by exact matches, fuzzy approvals,
 * and manual ties. Lets admins search by name, filter by carrier/entity type,
 * and delete stale aliases that should be re-evaluated on next upload.
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  Search,
  Trash2,
  Loader2,
  Link2,
  Filter,
  RefreshCw,
  Users,
  Building2,
  CheckCircle2,
  AlertCircle,
  UserPlus,

} from 'lucide-react';
import type { CarrierEntityAlias, SupportedCarrier } from '@/lib/carrier-upload';
import { SUPPORTED_CARRIERS } from '@/lib/carrier-upload';

interface Props {
  supabase: SupabaseClient;
}

type EntityFilter = 'all' | 'agent' | 'agency';
type MatchFilter = 'all' | 'exact' | 'fuzzy' | 'manual';

export function AliasManagementPanel({ supabase }: Props) {
  const [aliases, setAliases] = useState<CarrierEntityAlias[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [carrierFilter, setCarrierFilter] = useState<SupportedCarrier | 'all'>('all');
  const [entityFilter, setEntityFilter] = useState<EntityFilter>('all');
  const [matchFilter, setMatchFilter] = useState<MatchFilter>('all');
  const [showFilters, setShowFilters] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const loadAliases = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('carrier_entity_aliases')
        .select('*')
        .order('updated_at', { ascending: false });

      if (error) {
        console.error('[AliasManagement] Load error:', error);
      } else {
        setAliases((data as CarrierEntityAlias[]) || []);
      }
    } catch (err) {
      console.error('[AliasManagement] Load failed:', err);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    loadAliases();
  }, [loadAliases]);

  const handleDelete = async (id: string) => {
    setDeleting(id);
    try {
      const { error } = await supabase
        .from('carrier_entity_aliases')
        .delete()
        .eq('id', id);

      if (error) {
        console.error('[AliasManagement] Delete error:', error);
      } else {
        setAliases((prev) => prev.filter((a) => a.id !== id));
      }
    } catch (err) {
      console.error('[AliasManagement] Delete failed:', err);
    } finally {
      setDeleting(null);
      setConfirmDelete(null);
    }
  };

  const handleBulkDelete = async (ids: string[]) => {
    setDeleting('bulk');
    try {
      const { error } = await supabase
        .from('carrier_entity_aliases')
        .delete()
        .in('id', ids);

      if (error) {
        console.error('[AliasManagement] Bulk delete error:', error);
      } else {
        setAliases((prev) => prev.filter((a) => !ids.includes(a.id)));
      }
    } catch (err) {
      console.error('[AliasManagement] Bulk delete failed:', err);
    } finally {
      setDeleting(null);
    }
  };

  // Filtered aliases
  const filtered = useMemo(() => {
    let result = aliases;

    if (carrierFilter !== 'all') {
      result = result.filter((a) => a.carrier === carrierFilter);
    }
    if (entityFilter !== 'all') {
      result = result.filter((a) => a.entity_type === entityFilter);
    }
    if (matchFilter !== 'all') {
      result = result.filter((a) => a.match_type === matchFilter);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter(
        (a) =>
          a.carrier_name.toLowerCase().includes(q) ||
          (a.carrier_number && a.carrier_number.toLowerCase().includes(q)),
      );
    }

    return result;
  }, [aliases, carrierFilter, entityFilter, matchFilter, search]);

  // Stats
  const stats = useMemo(() => {
    const byCarrier: Record<string, number> = {};
    const byType: Record<string, number> = {};
    const byMatch: Record<string, number> = {};

    for (const a of aliases) {
      byCarrier[a.carrier] = (byCarrier[a.carrier] || 0) + 1;
      byType[a.entity_type] = (byType[a.entity_type] || 0) + 1;
      byMatch[a.match_type] = (byMatch[a.match_type] || 0) + 1;
    }

    return { byCarrier, byType, byMatch, total: aliases.length };
  }, [aliases]);

  const formatDate = (iso: string) =>
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Chicago',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(iso));

  const matchTypeIcon = (type: string) => {
    switch (type) {
      case 'exact':
        return <CheckCircle2 className="w-3 h-3 text-emerald-400" />;
      case 'fuzzy':
        return <AlertCircle className="w-3 h-3 text-amber-400" />;
      case 'manual':
        return <UserPlus className="w-3 h-3 text-cyan-400" />;
      default:
        return null;
    }
  };

  const matchTypeLabel: Record<string, string> = {
    exact: 'Auto (exact)',
    fuzzy: 'Approved (fuzzy)',
    manual: 'Manual tie',
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
        <Loader2 className="w-4 h-4 animate-spin mr-2" />
        Loading aliases…
      </div>
    );
  }

  if (aliases.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Link2 className="w-10 h-10 mx-auto mb-3 opacity-40" />
        <p className="text-sm font-medium">No aliases yet</p>
        <p className="text-xs mt-1">
          Aliases are created automatically when reports are uploaded and matches are resolved.
          Upload a carrier hierarchy report to get started.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Stats bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-card border border-border rounded-lg p-3 text-center">
          <Link2 className="w-5 h-5 mx-auto mb-1 text-primary" />
          <p className="text-xl font-bold text-foreground">{stats.total}</p>
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
            Total Aliases
          </p>
        </div>
        {SUPPORTED_CARRIERS.map((c) => (
          <div key={c} className="bg-card border border-border rounded-lg p-3 text-center">
            <p className="text-lg font-bold text-foreground">{stats.byCarrier[c] || 0}</p>
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
              {c}
            </p>
          </div>
        ))}
        <div className="bg-card border border-border rounded-lg p-3 text-center">
          <p className="text-lg font-bold text-foreground">
            {(stats.byMatch['fuzzy'] || 0) + (stats.byMatch['manual'] || 0)}
          </p>
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
            Manually Resolved
          </p>
        </div>
      </div>

      {/* Search + filters bar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search aliases by name or number…"
            className="w-full pl-9 pr-3 py-2 rounded-lg bg-secondary/30 border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
          />
        </div>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors border ${
            showFilters || carrierFilter !== 'all' || entityFilter !== 'all' || matchFilter !== 'all'
              ? 'bg-primary/10 text-primary border-primary/30'
              : 'bg-secondary/30 text-foreground/70 border-border hover:bg-secondary/50'
          }`}
        >
          <Filter className="w-3.5 h-3.5" />
          Filters
          {(carrierFilter !== 'all' || entityFilter !== 'all' || matchFilter !== 'all') && (
            <span className="bg-primary/20 text-primary text-[10px] px-1.5 py-0.5 rounded-full font-bold">
              {[carrierFilter !== 'all', entityFilter !== 'all', matchFilter !== 'all'].filter(Boolean).length}
            </span>
          )}
        </button>
        <button
          onClick={loadAliases}
          className="p-2 rounded-lg text-muted-foreground hover:bg-secondary/30 hover:text-foreground border border-border"
          title="Refresh"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Filter row */}
      {showFilters && (
        <div className="flex flex-wrap gap-3 bg-secondary/10 rounded-lg px-4 py-3 border border-border">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground font-medium">Carrier:</span>
            <div className="flex gap-1">
              {(['all', ...SUPPORTED_CARRIERS] as const).map((c) => (
                <button
                  key={c}
                  onClick={() => setCarrierFilter(c)}
                  className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                    carrierFilter === c
                      ? 'bg-primary/20 text-primary'
                      : 'text-muted-foreground hover:text-foreground hover:bg-secondary/30'
                  }`}
                >
                  {c === 'all' ? 'All' : c}
                </button>
              ))}
            </div>
          </div>
          <div className="w-px bg-border" />
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground font-medium">Type:</span>
            <div className="flex gap-1">
              {(['all', 'agent', 'agency'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setEntityFilter(t)}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                    entityFilter === t
                      ? 'bg-primary/20 text-primary'
                      : 'text-muted-foreground hover:text-foreground hover:bg-secondary/30'
                  }`}
                >
                  {t === 'agent' && <Users className="w-3 h-3" />}
                  {t === 'agency' && <Building2 className="w-3 h-3" />}
                  {t === 'all' ? 'All' : t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
          </div>
          <div className="w-px bg-border" />
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground font-medium">Match:</span>
            <div className="flex gap-1">
              {(['all', 'exact', 'fuzzy', 'manual'] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setMatchFilter(m)}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                    matchFilter === m
                      ? 'bg-primary/20 text-primary'
                      : 'text-muted-foreground hover:text-foreground hover:bg-secondary/30'
                  }`}
                >
                  {m !== 'all' && matchTypeIcon(m)}
                  {m === 'all' ? 'All' : matchTypeLabel[m] || m}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Results count + bulk delete */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Showing {filtered.length} of {aliases.length} aliases
        </p>
        {filtered.length > 0 && filtered.length < aliases.length && (
          <button
            onClick={() => {
              if (confirm(`Delete ${filtered.length} filtered aliases? This cannot be undone.`)) {
                handleBulkDelete(filtered.map((a) => a.id));
              }
            }}
            disabled={deleting !== null}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-red-400 hover:bg-red-500/10 border border-red-500/20"
          >
            <Trash2 className="w-3 h-3" />
            Delete Filtered ({filtered.length})
          </button>
        )}
      </div>

      {/* Alias table */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/20 sticky top-0">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">
                  Carrier Name
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">
                  Carrier #
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">
                  Carrier
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">
                  Type
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">
                  How Matched
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">
                  Last Updated
                </th>
                <th className="px-4 py-2 text-right text-xs font-medium text-muted-foreground">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((alias) => (
                <tr key={alias.id} className="hover:bg-secondary/5">
                  <td className="px-4 py-2.5 font-medium text-foreground">
                    {alias.carrier_name}
                  </td>
                  <td className="px-4 py-2.5 text-foreground/80 font-mono text-xs">
                    {alias.carrier_number || '—'}
                  </td>
                  <td className="px-4 py-2.5 text-foreground/80">
                    {alias.carrier}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="inline-flex items-center gap-1 text-xs">
                      {alias.entity_type === 'agent' ? (
                        <Users className="w-3 h-3 text-muted-foreground" />
                      ) : (
                        <Building2 className="w-3 h-3 text-muted-foreground" />
                      )}
                      <span className="text-foreground/70">
                        {alias.entity_type === 'agent' ? 'Agent' : 'Agency'}
                      </span>
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium">
                      {matchTypeIcon(alias.match_type)}
                      {matchTypeLabel[alias.match_type] || alias.match_type}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">
                    {formatDate(alias.updated_at)}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {confirmDelete === alias.id ? (
                      <div className="flex items-center gap-1.5 justify-end">
                        <button
                          onClick={() => handleDelete(alias.id)}
                          disabled={deleting === alias.id}
                          className="px-2 py-1 rounded text-xs font-medium bg-red-500/20 text-red-400 hover:bg-red-500/30"
                        >
                          {deleting === alias.id ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            'Confirm'
                          )}
                        </button>
                        <button
                          onClick={() => setConfirmDelete(null)}
                          className="px-2 py-1 rounded text-xs font-medium text-muted-foreground hover:bg-secondary/30"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmDelete(alias.id)}
                        className="p-1.5 rounded-md text-muted-foreground hover:bg-red-500/10 hover:text-red-400 transition-colors"
                        title="Delete alias"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filtered.length === 0 && (
          <div className="text-center py-8 text-muted-foreground text-sm">
            No aliases match your filters.
          </div>
        )}
      </div>
    </div>
  );
}
