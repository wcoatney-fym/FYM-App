/**
 * AgentSearchPicker — Inline search to find and select an existing agent
 *
 * Used by FuzzyMatchRow and NoMatchRow when the user wants to manually
 * tie a carrier agent to an existing portal agent.
 *
 * Searches the `agents` table by first_name, last_name, or email.
 * Uses ilike for partial matching.
 */
import { useState, useCallback, useRef, useEffect } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Search, X, Loader2 } from 'lucide-react';

interface Props {
  supabase: SupabaseClient;
  onSelect: (agentId: string, agentName: string) => void;
  onCancel: () => void;
}

interface AgentResult {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  agency: string | null;
  npn: string | null;
}

export function AgentSearchPicker({ supabase, onSelect, onCancel }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<AgentResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Auto-focus on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const doSearch = useCallback(
    async (q: string) => {
      if (q.trim().length < 2) {
        setResults([]);
        setSearched(false);
        return;
      }

      setSearching(true);
      setSearched(true);

      try {
        const term = `%${q.trim()}%`;

        // Search by first_name, last_name, or email
        const { data, error } = await supabase
          .from('agents')
          .select('id, first_name, last_name, email, agency, npn')
          .or(`first_name.ilike.${term},last_name.ilike.${term},email.ilike.${term}`)
          .limit(15);

        if (error) {
          console.error('[AgentSearchPicker] Search error:', error);
          setResults([]);
        } else {
          setResults((data as AgentResult[]) || []);
        }
      } catch (err) {
        console.error('[AgentSearchPicker] Search failed:', err);
        setResults([]);
      } finally {
        setSearching(false);
      }
    },
    [supabase],
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);

    // Debounce search
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(val), 300);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onCancel();
    }
  };

  const formatName = (a: AgentResult) =>
    [a.first_name, a.last_name].filter(Boolean).join(' ') || 'Unknown';

  return (
    <div className="space-y-2">
      {/* Search input */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="Search agents by name or email…"
            className="w-full pl-9 pr-3 py-2 rounded-lg bg-secondary/30 border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
          />
          {searching && (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground animate-spin" />
          )}
        </div>
        <button
          onClick={onCancel}
          className="p-2 rounded-md text-muted-foreground hover:bg-secondary/30 hover:text-foreground"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Results */}
      {searched && !searching && results.length === 0 && (
        <p className="text-xs text-muted-foreground py-2">
          No agents found matching "{query}"
        </p>
      )}

      {results.length > 0 && (
        <div className="border border-border rounded-lg overflow-hidden max-h-48 overflow-y-auto">
          {results.map((agent) => (
            <button
              key={agent.id}
              onClick={() => onSelect(agent.id, formatName(agent))}
              className="w-full px-4 py-2.5 text-left hover:bg-primary/10 transition-colors border-b border-border last:border-b-0 flex items-center justify-between gap-3"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground truncate">
                  {formatName(agent)}
                </p>
                <p className="text-[10px] text-muted-foreground truncate">
                  {[
                    agent.email,
                    agent.agency && `Agency: ${agent.agency}`,
                    agent.npn && `NPN: ${agent.npn}`,
                  ]
                    .filter(Boolean)
                    .join(' · ') || 'No details'}
                </p>
              </div>
              <span className="text-[10px] text-primary font-semibold shrink-0">
                Select
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
