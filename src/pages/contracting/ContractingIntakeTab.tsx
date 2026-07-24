/**
 * Contracting Intake Tab — Stage 4 shell
 *
 * Will show: new hires queue (real-time), form generator/sender,
 * generated form details with copyable URL + security code.
 *
 * Data source: portal DB `new_hires`, `agents` tables + GHL/Zapier webhook.
 * Full implementation in Step 3.
 */
import { Card, CardContent } from '@/components/ui/card';
import { UserPlus } from 'lucide-react';

export function ContractingIntakeTab() {
  return (
    <Card className="border-slate-200">
      <CardContent className="p-8 text-center space-y-3">
        <div className="p-3 rounded-full bg-emerald-50 w-fit mx-auto">
          <UserPlus size={24} className="text-emerald-700" />
        </div>
        <h3 className="text-lg font-semibold text-slate-900">
          Agent Intake
        </h3>
        <p className="text-sm text-slate-500 max-w-md mx-auto">
          New hires queue, intake form generator, and form sender — coming soon.
          This tab will handle the full agent onboarding intake flow.
        </p>
      </CardContent>
    </Card>
  );
}
