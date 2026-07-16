import { Header } from '@/components/layout/Header';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAppStore } from '@/store/app-store';
import { mockContractingPipeline } from '@/lib/mock-data';
import { Clock, CheckCircle2, FileCheck } from 'lucide-react';

const columns = [
  { key: 'pending_review' as const, label: 'Pending Review', icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50', badge: 'bg-amber-100 text-amber-800 border-amber-200' },
  { key: 'approved' as const, label: 'Approved', icon: CheckCircle2, color: 'text-blue-600', bg: 'bg-blue-50', badge: 'bg-blue-100 text-blue-800 border-blue-200' },
  { key: 'contracted' as const, label: 'Contracted', icon: FileCheck, color: 'text-emerald-600', bg: 'bg-emerald-50', badge: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
];

export function ContractingPage() {
  const { useMockData } = useAppStore();
  const pipeline = useMockData ? mockContractingPipeline : mockContractingPipeline;

  return (
    <div>
      <Header title="Contracting" />
      <div className="p-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {columns.map((col) => (
            <div key={col.key} className="space-y-3">
              <div className="flex items-center gap-2 px-1">
                <col.icon size={18} className={col.color} />
                <h3 className="text-sm font-semibold text-slate-700">{col.label}</h3>
                <Badge className={`ml-auto ${col.badge} hover:${col.badge}`}>
                  {pipeline[col.key].length}
                </Badge>
              </div>
              <div className="space-y-3">
                {pipeline[col.key].map((item) => (
                  <Card key={item.id} className="border-slate-200 hover:shadow-md transition-shadow">
                    <CardContent className="p-4">
                      <p className="font-medium text-slate-900 text-sm">{item.agency_name}</p>
                      <p className="text-sm text-slate-500 mt-1">{item.principal_agent}</p>
                      <p className="text-xs text-slate-400 mt-2">
                        Submitted {new Date(item.submission_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
