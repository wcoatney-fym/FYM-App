/**
 * Daily Pulse — placeholder page.
 * Will be built out with daily production snapshots, alerts, and trend signals.
 */
import { Header } from '@/components/layout/Header';
import { Card, CardContent } from '@/components/ui/card';
import { Activity } from 'lucide-react';

export function DailyPulsePage() {
  return (
    <div>
      <Header title="Daily Pulse" />
      <div className="p-6">
        <Card className="border-border">
          <CardContent className="py-16 text-center">
            <Activity size={40} className="mx-auto text-muted-foreground mb-4" />
            <h2 className="text-lg font-semibold text-foreground mb-2">Daily Pulse</h2>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              Daily production snapshots, trend signals, and alerts — coming soon.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
