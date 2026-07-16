import { useState } from 'react';
import { Header } from '@/components/layout/Header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAppStore } from '@/store/app-store';
import { mockAgencies } from '@/lib/mock-data';

type Agency = (typeof mockAgencies)[number];

function statusBadge(status: string) {
  switch (status) {
    case 'active':
      return <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 border-emerald-200">Active</Badge>;
    case 'pending':
      return <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 border-amber-200">Pending</Badge>;
    case 'inactive':
      return <Badge className="bg-slate-100 text-slate-600 hover:bg-slate-100 border-slate-200">Inactive</Badge>;
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
}

export function AgenciesPage() {
  const { useMockData } = useAppStore();
  const agencies = useMockData ? mockAgencies : mockAgencies;
  const [selected, setSelected] = useState<Agency | null>(null);

  return (
    <div>
      <Header title="Agencies" />
      <div className="p-6">
        <Card className="border-slate-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold text-slate-900">
              Sub-Agency Directory
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead className="font-semibold text-slate-600">Name</TableHead>
                  <TableHead className="font-semibold text-slate-600">Principal Agent</TableHead>
                  <TableHead className="font-semibold text-slate-600">Status</TableHead>
                  <TableHead className="font-semibold text-slate-600 text-right">Policies</TableHead>
                  <TableHead className="font-semibold text-slate-600 text-right">90-Day Ret. %</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {agencies.map((agency) => (
                  <TableRow
                    key={agency.id}
                    className="cursor-pointer hover:bg-slate-50 transition-colors"
                    onClick={() => setSelected(agency)}
                  >
                    <TableCell className="font-medium text-slate-900">{agency.name}</TableCell>
                    <TableCell className="text-slate-600">{agency.principal_agent}</TableCell>
                    <TableCell>{statusBadge(agency.status)}</TableCell>
                    <TableCell className="text-right text-slate-700">{agency.policies}</TableCell>
                    <TableCell className="text-right">
                      <span className={agency.retention_90 >= 90 ? 'text-emerald-700 font-medium' : 'text-amber-700 font-medium'}>
                        {agency.retention_90}%
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Sheet open={!!selected} onOpenChange={() => setSelected(null)}>
        <SheetContent className="sm:max-w-md">
          <SheetHeader>
            <SheetTitle className="text-slate-900">{selected?.name}</SheetTitle>
          </SheetHeader>
          {selected && (
            <div className="mt-6 space-y-4">
              <DetailRow label="Principal Agent" value={selected.principal_agent} />
              <DetailRow label="Status" value={<span className="capitalize">{selected.status}</span>} />
              <DetailRow label="Active Policies" value={selected.policies.toString()} />
              <DetailRow label="90-Day Retention" value={`${selected.retention_90}%`} />
              <DetailRow label="Agency ID" value={selected.id} />
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between items-center py-2 border-b border-slate-100">
      <span className="text-sm text-slate-500">{label}</span>
      <span className="text-sm font-medium text-slate-900">{value}</span>
    </div>
  );
}
