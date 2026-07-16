import { Header } from '@/components/layout/Header';
import { Card, CardContent } from '@/components/ui/card';
import { Headphones, RefreshCw, Users } from 'lucide-react';

export function CrmOpsPage() {
  const placeholderItems = [
    { icon: Users, title: 'Roster Management', description: 'Sync and manage agent rosters across carriers. Coming soon.' },
    { icon: RefreshCw, title: 'GHL Sync Controls', description: 'GoHighLevel CRM sync status and manual triggers. Coming soon.' },
    { icon: Headphones, title: 'Support Queue', description: 'Internal support ticket monitoring. Coming soon.' },
  ];

  return (
    <div>
      <Header title="CRM Ops" />
      <div className="p-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {placeholderItems.map((item) => (
            <Card key={item.title} className="border-slate-200 border-dashed">
              <CardContent className="p-6 text-center">
                <div className="mx-auto w-12 h-12 rounded-lg bg-slate-100 flex items-center justify-center mb-4">
                  <item.icon size={24} className="text-slate-400" />
                </div>
                <h3 className="text-sm font-semibold text-slate-700 mb-1">{item.title}</h3>
                <p className="text-xs text-slate-400">{item.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="mt-8 p-6 rounded-lg bg-slate-100 border border-slate-200 text-center">
          <p className="text-sm text-slate-500">
            This section will house roster management, GHL sync controls, and internal support tooling.
          </p>
          <p className="text-xs text-slate-400 mt-2">Module under development</p>
        </div>
      </div>
    </div>
  );
}
