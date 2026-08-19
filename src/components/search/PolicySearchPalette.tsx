/**
 * PolicySearchPalette — ⌘K / Ctrl+K command palette for client-centric policy search.
 *
 * Searches across all policies via the book-of-business edge function.
 * Results grouped by client name, showing all their policies.
 * Selecting a policy opens the ClientDetailDrawer.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { Search, FileText, User, AlertTriangle, X } from 'lucide-react';
import {
  CommandDialog,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
} from '@/components/ui/command';
import { Badge } from '@/components/ui/badge';
import { fetchBookOfBusiness } from '@/lib/prod-api';
import type { PolicyRow } from '@/lib/prod-api';
import { fmt$, fmtDate } from '@/lib/formatUtils';
import type { DrawerPolicy } from '@/components/client-detail/ClientDetailDrawer';

interface PolicySearchPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectPolicy: (policy: DrawerPolicy) => void;
}

// Group policies by client name
function groupByClient(policies: PolicyRow[]): Map<string, PolicyRow[]> {
  const map = new Map<string, PolicyRow[]>();
  for (const p of policies) {
    const key = p.client_name || 'Unknown Client';
    const group = map.get(key) || [];
    group.push(p);
    map.set(key, group);
  }
  return map;
}

// Map edge function PolicyRow to DrawerPolicy
function toDrawerPolicy(p: PolicyRow): DrawerPolicy {
  return {
    policy_number: p.policy_number,
    product_type: p.product_type,
    status: p.status,
    plan_premium: p.plan_premium,
    annual_premium: p.annual_premium,
    paid_to_date: p.paid_to_date,
    policy_effective_date: p.policy_effective_date,
    term_date: p.term_date,
    draft_count: p.draft_count,
    is_at_risk: p.is_at_risk,
    flag_type: p.flag_type,
    agency_id: p.agency_id,
    agency_name: p.agency_name,
    agent_writing_number: p.agent_writing_number,
    agent_name: p.agent_name,
    client_name: p.client_name,
    billing_mode: p.billing_mode,
    writing_number: p.writing_number,
  };
}

const STATUS_COLORS: Record<string, string> = {
  Active: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  Terminated: 'bg-red-500/10 text-red-400 border-red-500/20',
  Pending: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
};

export function PolicySearchPalette({ open, onOpenChange, onSelectPolicy }: PolicySearchPaletteProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PolicyRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setQuery('');
      setResults([]);
      setSearched(false);
      setLoading(false);
    }
  }, [open]);

  // Debounced search
  const doSearch = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setResults([]);
      setSearched(false);
      return;
    }
    setLoading(true);
    setSearched(true);
    try {
      const res = await fetchBookOfBusiness({ search: q.trim(), page_size: 50 });
      setResults(res.data);
    } catch (err) {
      console.error('[PolicySearchPalette] search error:', err);
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Debounce input
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(query), 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, doSearch]);

  const grouped = groupByClient(results);
  const clientNames = Array.from(grouped.keys());

  const handleSelect = (p: PolicyRow) => {
    onSelectPolicy(toDrawerPolicy(p));
    onOpenChange(false);
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <div className="flex items-center border-b px-3">
        <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
        <input
          className="flex h-12 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
          placeholder="Search by client name, policy number, or agent…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />
        {query && (
          <button onClick={() => setQuery('')} className="p-1 hover:bg-secondary/50 rounded">
            <X className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        )}
      </div>
      <CommandList className="max-h-[400px]">
        {loading && (
          <div className="flex items-center justify-center py-6 text-sm text-muted-foreground">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary mr-2" />
            Searching…
          </div>
        )}

        {!loading && searched && results.length === 0 && (
          <CommandEmpty>No policies found for "{query}"</CommandEmpty>
        )}

        {!loading && !searched && (
          <div className="py-8 text-center text-sm text-muted-foreground">
            <Search className="mx-auto h-8 w-8 mb-2 opacity-30" />
            <p>Type a client name, policy number, or agent name</p>
            <p className="text-xs mt-1 opacity-60">Minimum 2 characters</p>
          </div>
        )}

        {!loading && clientNames.map((clientName, i) => {
          const policies = grouped.get(clientName)!;
          return (
            <div key={clientName}>
              {i > 0 && <CommandSeparator />}
              <CommandGroup
                heading={
                  <span className="flex items-center gap-1.5">
                    <User className="h-3 w-3" />
                    {clientName}
                    <span className="text-[10px] opacity-60">
                      ({policies.length} {policies.length === 1 ? 'policy' : 'policies'})
                    </span>
                  </span>
                }
              >
                {policies.map((p) => (
                  <CommandItem
                    key={p.policy_number}
                    value={`${clientName} ${p.policy_number} ${p.agent_name || ''}`}
                    onSelect={() => handleSelect(p)}
                    className="flex items-center gap-3 py-2.5 cursor-pointer"
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="font-mono text-xs text-muted-foreground shrink-0">
                        {p.policy_number}
                      </span>
                      <Badge className={`text-[10px] shrink-0 border ${
                        p.product_type === 'HHC'
                          ? 'bg-sky-500/10 text-sky-400 border-sky-500/20'
                          : 'bg-violet-500/10 text-violet-400 border-violet-500/20'
                      }`}>
                        {p.product_type}
                      </Badge>
                      <Badge className={`text-[10px] shrink-0 border ${
                        STATUS_COLORS[p.status] || 'bg-secondary text-muted-foreground'
                      }`}>
                        {p.status}
                      </Badge>
                      {p.is_at_risk && (
                        <AlertTriangle className="h-3 w-3 shrink-0 text-amber-400" />
                      )}
                    </div>
                    <div className="flex items-center gap-3 shrink-0 text-xs text-muted-foreground">
                      <span>{fmt$(p.annual_premium)}/yr</span>
                      {p.agent_name && (
                        <span className="hidden sm:inline truncate max-w-[120px]">
                          {p.agent_name}
                        </span>
                      )}
                      {p.paid_to_date && (
                        <span className="hidden md:inline">
                          Paid to {fmtDate(p.paid_to_date)}
                        </span>
                      )}
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </div>
          );
        })}
      </CommandList>
      <div className="flex items-center justify-between border-t px-3 py-1.5 text-[10px] text-muted-foreground">
        <span>
          {results.length > 0 ? `${results.length} policies across ${clientNames.length} clients` : 'Policy Search'}
        </span>
        <span className="flex items-center gap-1.5">
          <kbd className="px-1.5 py-0.5 bg-secondary rounded text-[10px] font-mono">↑↓</kbd> navigate
          <kbd className="px-1.5 py-0.5 bg-secondary rounded text-[10px] font-mono">↵</kbd> open
          <kbd className="px-1.5 py-0.5 bg-secondary rounded text-[10px] font-mono">esc</kbd> close
        </span>
      </div>
    </CommandDialog>
  );
}
