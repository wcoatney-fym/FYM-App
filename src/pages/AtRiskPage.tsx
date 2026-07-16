import { Header } from '@/components/layout/Header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAppStore } from '@/store/app-store';
import { mockAtRiskPolicies } from '@/lib/mock-data';

function riskBadge(status: string) {
  switch (status) {
    case 'lapse_pending':
      return <Badge className="bg-red-100 text-red-800 hover:bg-red-100 border-red-200">Lapse Pending</Badge>;
    case 'payment_issue':
      return <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 border-amber-200">Payment Issue</Badge>;
    case 'no_contact':
      return <Badge className="bg-slate-100 text-slate-700 hover:bg-slate-100 border-slate-200">No Contact</Badge>;
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
}

function daysColor(days: number) {
  if (days >= 21) return 'text-red-700 font-bold';
  if (days >= 14) return 'text-amber-700 font-semibold';
  return 'text-slate-700 font-medium';
}

export function AtRiskPage() {
  const { useMockData } = useAppStore();
  const policies = useMockData ? mockAtRiskPolicies : mockAtRiskPolicies;

  return (
    <div>
      <Header title="At-Risk Policies" />
      <div className="p-6">
        <Card className="border-slate-200">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold text-slate-900">
                Policies Flagged At-Risk
              </CardTitle>
              <Badge className="bg-red-100 text-red-800 border-red-200 hover:bg-red-100">
                {policies.length} flagged
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead className="font-semibold text-slate-600">Client Name</TableHead>
                  <TableHead className="font-semibold text-slate-600">Policy #</TableHead>
                  <TableHead className="font-semibold text-slate-600">Product</TableHead>
                  <TableHead className="font-semibold text-slate-600">Agent</TableHead>
                  <TableHead className="font-semibold text-slate-600 text-right">Days at Risk</TableHead>
                  <TableHead className="font-semibold text-slate-600">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {policies.map((policy) => (
                  <TableRow key={policy.id} className="hover:bg-slate-50 transition-colors">
                    <TableCell className="font-medium text-slate-900">{policy.client_name}</TableCell>
                    <TableCell className="text-slate-600 font-mono text-sm">{policy.policy_number}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="font-mono text-xs">
                        {policy.product}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-slate-600">{policy.agent}</TableCell>
                    <TableCell className={`text-right ${daysColor(policy.days_at_risk)}`}>
                      {policy.days_at_risk}
                    </TableCell>
                    <TableCell>{riskBadge(policy.status)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
