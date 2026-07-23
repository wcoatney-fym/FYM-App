import { Header } from '@/components/layout/Header';
import { Card, CardContent } from '@/components/ui/card';
import { FileText, ExternalLink } from 'lucide-react';

export function ContractingPage() {
  return (
    <div>
      <Header title="Contracting" />
      <div className="p-6">
        <Card className="border-slate-200 max-w-lg mx-auto mt-8">
          <CardContent className="p-8 text-center space-y-4">
            <div className="p-3 rounded-full bg-blue-50 w-fit mx-auto">
              <FileText size={28} className="text-[#1e3a5f]" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-slate-900">Contracting Portal</h3>
              <p className="text-sm text-slate-500 mt-1">
                Agent contracting and onboarding is managed in the CRM Portal.
              </p>
            </div>
            <a
              href="https://contracting.teamfym.com"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-[#1e3a5f] text-white text-sm font-medium hover:bg-[#162d4a] transition-colors"
            >
              Open CRM Portal <ExternalLink size={14} />
            </a>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
