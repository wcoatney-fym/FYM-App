import { useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Search, ArrowUpDown, CheckCircle, XCircle, Clock, AlertTriangle } from 'lucide-react';

export interface CheckinResponse {
  id: string;
  check_in_date: string;
  is_working: boolean | null;
  has_four_plus_hours: boolean | null;
  app_goal: number | null;
  conversation_state: string;
  nudge_sent: boolean;
  responded_at: string | null;
  recipient: {
    first_name: string;
    last_name: string;
    phone: string;
  };
}

interface ResponseTableProps {
  responses: CheckinResponse[];
  loading?: boolean;
}

type SortKey = 'name' | 'status' | 'hours' | 'apps';

function stateLabel(state: string): { label: string; color: string; icon: typeof CheckCircle } {
  switch (state) {
    case 'complete':
      return { label: 'Complete', color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30', icon: CheckCircle };
    case 'declined':
      return { label: 'Not Working', color: 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30', icon: XCircle };
    case 'q1_sent':
    case 'nudged':
    case 'pending':
      return { label: 'No Response', color: 'bg-red-500/20 text-red-400 border-red-500/30', icon: AlertTriangle };
    case 'q2_sent':
    case 'q3_sent':
      return { label: 'In Progress', color: 'bg-amber-500/20 text-amber-400 border-amber-500/30', icon: Clock };
    default:
      return { label: state, color: 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30', icon: Clock };
  }
}

export function ResponseTable({ responses, loading }: ResponseTableProps) {
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('status');
  const [sortAsc, setSortAsc] = useState(true);

  const filtered = useMemo(() => {
    let result = [...responses];
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (r) =>
          r.recipient.first_name.toLowerCase().includes(q) ||
          r.recipient.last_name.toLowerCase().includes(q)
      );
    }
    result.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case 'name':
          cmp = `${a.recipient.last_name} ${a.recipient.first_name}`.localeCompare(
            `${b.recipient.last_name} ${b.recipient.first_name}`
          );
          break;
        case 'status': {
          const order: Record<string, number> = { complete: 0, declined: 1, q3_sent: 2, q2_sent: 3, nudged: 4, q1_sent: 5, pending: 6 };
          cmp = (order[a.conversation_state] ?? 9) - (order[b.conversation_state] ?? 9);
          break;
        }
        case 'hours':
          cmp = (a.has_four_plus_hours ? 1 : 0) - (b.has_four_plus_hours ? 1 : 0);
          break;
        case 'apps':
          cmp = (a.app_goal ?? 0) - (b.app_goal ?? 0);
          break;
      }
      return sortAsc ? cmp : -cmp;
    });
    return result;
  }, [responses, search, sortKey, sortAsc]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(true);
    }
  };

  if (loading) {
    return (
      <Card className="bg-zinc-900/60 border-zinc-800">
        <CardContent className="p-6">
          <div className="animate-pulse space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-10 bg-zinc-800 rounded" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-zinc-900/60 border-zinc-800">
      <CardContent className="p-4">
        <div className="flex items-center gap-3 mb-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <Input
              placeholder="Search agents..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 bg-zinc-800/50 border-zinc-700 text-sm"
            />
          </div>
          <span className="text-xs text-zinc-500">{filtered.length} agents</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800">
                <th
                  className="text-left py-2 px-3 text-xs text-zinc-400 uppercase tracking-wider cursor-pointer hover:text-zinc-200"
                  onClick={() => toggleSort('name')}
                >
                  <span className="flex items-center gap-1">
                    Agent <ArrowUpDown className="w-3 h-3" />
                  </span>
                </th>
                <th
                  className="text-left py-2 px-3 text-xs text-zinc-400 uppercase tracking-wider cursor-pointer hover:text-zinc-200"
                  onClick={() => toggleSort('status')}
                >
                  <span className="flex items-center gap-1">
                    Status <ArrowUpDown className="w-3 h-3" />
                  </span>
                </th>
                <th className="text-left py-2 px-3 text-xs text-zinc-400 uppercase tracking-wider">Working</th>
                <th
                  className="text-left py-2 px-3 text-xs text-zinc-400 uppercase tracking-wider cursor-pointer hover:text-zinc-200"
                  onClick={() => toggleSort('hours')}
                >
                  <span className="flex items-center gap-1">
                    4+ Hrs <ArrowUpDown className="w-3 h-3" />
                  </span>
                </th>
                <th
                  className="text-left py-2 px-3 text-xs text-zinc-400 uppercase tracking-wider cursor-pointer hover:text-zinc-200"
                  onClick={() => toggleSort('apps')}
                >
                  <span className="flex items-center gap-1">
                    Apps Goal <ArrowUpDown className="w-3 h-3" />
                  </span>
                </th>
                <th className="text-left py-2 px-3 text-xs text-zinc-400 uppercase tracking-wider">Nudged</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const s = stateLabel(r.conversation_state);
                return (
                  <tr key={r.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors">
                    <td className="py-2.5 px-3 text-zinc-200 font-medium">
                      {r.recipient.first_name} {r.recipient.last_name}
                    </td>
                    <td className="py-2.5 px-3">
                      <Badge variant="outline" className={`text-xs ${s.color}`}>
                        <s.icon className="w-3 h-3 mr-1" />
                        {s.label}
                      </Badge>
                    </td>
                    <td className="py-2.5 px-3 text-zinc-300">
                      {r.is_working === null ? '—' : r.is_working ? '✅ Yes' : '❌ No'}
                    </td>
                    <td className="py-2.5 px-3 text-zinc-300">
                      {r.has_four_plus_hours === null ? '—' : r.has_four_plus_hours ? '✅ Yes' : '❌ No'}
                    </td>
                    <td className="py-2.5 px-3 text-zinc-300 font-mono">
                      {r.app_goal === null ? '—' : r.app_goal === 5 ? '5+' : r.app_goal}
                    </td>
                    <td className="py-2.5 px-3 text-zinc-300">
                      {r.nudge_sent ? '📩' : '—'}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-zinc-500">
                    {search ? 'No matching agents' : 'No check-in data for today'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
