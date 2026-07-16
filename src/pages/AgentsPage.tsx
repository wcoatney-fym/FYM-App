import { useState, useMemo } from 'react';
import { Header } from '@/components/layout/Header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAppStore } from '@/store/app-store';
import { mockAgents } from '@/lib/mock-data';
import { Search } from 'lucide-react';

export function AgentsPage() {
  const { useMockData } = useAppStore();
  const agents = useMockData ? mockAgents : mockAgents;
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search) return agents;
    const q = search.toLowerCase();
    return agents.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        a.npn.includes(q) ||
        a.agency.toLowerCase().includes(q)
    );
  }, [agents, search]);

  return (
    <div>
      <Header title="Agents" />
      <div className="p-6">
        <Card className="border-slate-200">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <CardTitle className="text-base font-semibold text-slate-900">
                Agent Directory
              </CardTitle>
              <div className="relative w-full sm:w-72">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <Input
                  placeholder="Search by name, NPN, or agency..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 bg-white"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead className="font-semibold text-slate-600">Name</TableHead>
                  <TableHead className="font-semibold text-slate-600">NPN</TableHead>
                  <TableHead className="font-semibold text-slate-600">Agency</TableHead>
                  <TableHead className="font-semibold text-slate-600">Writing #</TableHead>
                  <TableHead className="font-semibold text-slate-600 text-right">Active Policies</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((agent) => (
                  <TableRow key={agent.id} className="hover:bg-slate-50 transition-colors">
                    <TableCell className="font-medium text-slate-900">{agent.name}</TableCell>
                    <TableCell className="text-slate-600 font-mono text-sm">{agent.npn}</TableCell>
                    <TableCell className="text-slate-600">{agent.agency}</TableCell>
                    <TableCell className="text-slate-600 font-mono text-sm">{agent.writing_number}</TableCell>
                    <TableCell className="text-right text-slate-700 font-medium">{agent.active_policies}</TableCell>
                  </TableRow>
                ))}
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-slate-400">
                      No agents match your search.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
