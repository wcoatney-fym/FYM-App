import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/lib/supabase';
import { Target, Save, RotateCcw, CheckCircle2, AlertCircle } from 'lucide-react';

interface Thresholds {
  retention_pct_min: number;
  at_risk_pct_max: number;
  terminated_pct_max: number;
  min_eligible_policies: number;
  production_min_policies: number;
  production_window_days: number;
  quality_window_days: number;
  rts_window_days: number;
}

const DEFAULTS: Thresholds = {
  retention_pct_min: 90.0,
  at_risk_pct_max: 15.0,
  terminated_pct_max: 20.0,
  min_eligible_policies: 5,
  production_min_policies: 3,
  production_window_days: 30,
  quality_window_days: 30,
  rts_window_days: 7,
};

export function CoachingThresholdsCard() {
  const [thresholds, setThresholds] = useState<Thresholds>(DEFAULTS);
  const [original, setOriginal] = useState<Thresholds>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    loadThresholds();
  }, []);

  async function loadThresholds() {
    if (!supabase) { setLoading(false); return; }
    const { data, error } = await (supabase as any)
      .from('coaching_thresholds')
      .select('retention_pct_min, at_risk_pct_max, terminated_pct_max, min_eligible_policies, production_min_policies, production_window_days, quality_window_days, rts_window_days')
      .eq('id', 1)
      .maybeSingle();
    if (error) {
      console.error('Failed to load coaching thresholds:', error);
      setLoading(false);
      return;
    }
    if (data) {
      const loaded: Thresholds = {
        retention_pct_min: Number(data.retention_pct_min),
        at_risk_pct_max: Number(data.at_risk_pct_max),
        terminated_pct_max: Number(data.terminated_pct_max),
        min_eligible_policies: Number(data.min_eligible_policies),
        production_min_policies: Number(data.production_min_policies ?? 3),
        production_window_days: Number(data.production_window_days ?? 30),
        quality_window_days: Number(data.quality_window_days ?? 30),
        rts_window_days: Number(data.rts_window_days ?? 7),
      };
      setThresholds(loaded);
      setOriginal(loaded);
    }
    setLoading(false);
  }

  const isDirty = (Object.keys(DEFAULTS) as (keyof Thresholds)[]).some(
    (k) => thresholds[k] !== original[k],
  );

  async function handleSave() {
    if (!supabase) return;
    setSaving(true);
    setMessage(null);
    const { error } = await (supabase as any)
      .from('coaching_thresholds')
      .update({
        retention_pct_min: thresholds.retention_pct_min,
        at_risk_pct_max: thresholds.at_risk_pct_max,
        terminated_pct_max: thresholds.terminated_pct_max,
        min_eligible_policies: thresholds.min_eligible_policies,
        production_min_policies: thresholds.production_min_policies,
        production_window_days: thresholds.production_window_days,
        quality_window_days: thresholds.quality_window_days,
        rts_window_days: thresholds.rts_window_days,
        updated_at: new Date().toISOString(),
      })
      .eq('id', 1);
    setSaving(false);
    if (error) {
      setMessage({ type: 'error', text: error.message ?? 'Failed to save thresholds' });
      return;
    }
    setOriginal({ ...thresholds });
    setMessage({ type: 'success', text: 'Coaching thresholds updated' });
    setTimeout(() => setMessage(null), 3000);
  }

  function handleReset() {
    setThresholds({ ...original });
    setMessage(null);
  }

  function handleRestoreDefaults() {
    setThresholds({ ...DEFAULTS });
  }

  if (loading) {
    return (
      <Card className="border-border">
        <CardHeader>
          <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
            <Target size={16} className="text-amber-400" />
            Coaching Thresholds
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {[1, 2, 3].map(i => <div key={i} className="h-10 rounded-md shimmer" />)}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border" role="region" aria-label="Coaching Thresholds">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
            <Target size={16} className="text-amber-400" />
            Coaching Thresholds
          </CardTitle>
          {isDirty && (
            <Badge variant="outline" className="text-amber-400 border-amber-500/40 text-[10px]">
              Unsaved changes
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <p className="text-xs text-muted-foreground">
          Set thresholds that flag agents for coaching intervention on the Quality → Coaching tab.
          Agents whose book metrics breach any threshold appear in the "Needs Coaching" table.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-sm font-medium text-foreground/80">
              90-Day Retention Minimum
            </Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                step="0.5"
                min="0"
                max="100"
                value={thresholds.retention_pct_min}
                onChange={(e) => setThresholds(prev => ({
                  ...prev,
                  retention_pct_min: parseFloat(e.target.value) || 0,
                }))}
                className="bg-card font-data w-24"
              />
              <span className="text-sm text-muted-foreground">%</span>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Agents below this 3-month persistency rate are flagged.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm font-medium text-foreground/80">
              At-Risk Maximum
            </Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                step="0.5"
                min="0"
                max="100"
                value={thresholds.at_risk_pct_max}
                onChange={(e) => setThresholds(prev => ({
                  ...prev,
                  at_risk_pct_max: parseFloat(e.target.value) || 0,
                }))}
                className="bg-card font-data w-24"
              />
              <span className="text-sm text-muted-foreground">% of active book</span>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Agents with more than this % of active policies at-risk are flagged.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm font-medium text-foreground/80">
              Terminated Maximum
            </Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                step="0.5"
                min="0"
                max="100"
                value={thresholds.terminated_pct_max}
                onChange={(e) => setThresholds(prev => ({
                  ...prev,
                  terminated_pct_max: parseFloat(e.target.value) || 0,
                }))}
                className="bg-card font-data w-24"
              />
              <span className="text-sm text-muted-foreground">% of total book</span>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Agents with more than this % of their total book terminated are flagged.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm font-medium text-foreground/80">
              Minimum Eligible Policies
            </Label>
            <Input
              type="number"
              step="1"
              min="1"
              max="100"
              value={thresholds.min_eligible_policies}
              onChange={(e) => setThresholds(prev => ({
                ...prev,
                min_eligible_policies: parseInt(e.target.value) || 1,
              }))}
              className="bg-card font-data w-24"
            />
            <p className="text-[11px] text-muted-foreground">
              Agents with fewer policies than this are excluded from threshold checks (too small a sample).
            </p>
          </div>
        </div>

        {/* ── Coaching Pipeline Thresholds ──────────────────── */}
        <div className="pt-3 border-t border-border">
          <h4 className="text-sm font-medium text-foreground/80 mb-3 flex items-center gap-2">
            Pipeline Settings
            <Badge variant="outline" className="text-[10px] border-border text-muted-foreground">Coaching Pipeline</Badge>
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-foreground/80 flex items-center gap-1.5">
                <span className="text-amber-400">🟡</span> Production Minimum
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  step="1"
                  min="0"
                  max="100"
                  value={thresholds.production_min_policies}
                  onChange={(e) => setThresholds(prev => ({
                    ...prev,
                    production_min_policies: parseInt(e.target.value) || 0,
                  }))}
                  className="bg-card font-data w-24"
                />
                <span className="text-sm text-muted-foreground">policies</span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Agents below this count in the trailing window are flagged for production coaching.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-foreground/80 flex items-center gap-1.5">
                <span className="text-amber-400">🟡</span> Production Window
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  step="1"
                  min="7"
                  max="90"
                  value={thresholds.production_window_days}
                  onChange={(e) => setThresholds(prev => ({
                    ...prev,
                    production_window_days: parseInt(e.target.value) || 30,
                  }))}
                  className="bg-card font-data w-24"
                />
                <span className="text-sm text-muted-foreground">days</span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Coaching deadline for production flags.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-foreground/80 flex items-center gap-1.5">
                <span className="text-red-400">🔴</span> Quality Window
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  step="1"
                  min="7"
                  max="90"
                  value={thresholds.quality_window_days}
                  onChange={(e) => setThresholds(prev => ({
                    ...prev,
                    quality_window_days: parseInt(e.target.value) || 30,
                  }))}
                  className="bg-card font-data w-24"
                />
                <span className="text-sm text-muted-foreground">days</span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Coaching deadline for quality flags (at-risk / terminated %).
              </p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-foreground/80 flex items-center gap-1.5">
                <span className="text-emerald-400">🟢</span> RTS Watch Window
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  step="1"
                  min="1"
                  max="30"
                  value={thresholds.rts_window_days}
                  onChange={(e) => setThresholds(prev => ({
                    ...prev,
                    rts_window_days: parseInt(e.target.value) || 7,
                  }))}
                  className="bg-card font-data w-24"
                />
                <span className="text-sm text-muted-foreground">days</span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Observation window when an agent moves to RTS.
              </p>
            </div>
          </div>
        </div>

        {message && (
          <div className={`p-3 rounded-lg flex items-start gap-2 ${
            message.type === 'success'
              ? 'bg-emerald-500/10 border border-emerald-500/20'
              : 'bg-red-500/10 border border-red-500/20'
          }`}>
            {message.type === 'success'
              ? <CheckCircle2 size={14} className="text-emerald-400 mt-0.5 shrink-0" />
              : <AlertCircle size={14} className="text-red-400 mt-0.5 shrink-0" />}
            <p className={`text-xs ${message.type === 'success' ? 'text-emerald-300' : 'text-red-400'}`}>
              {message.text}
            </p>
          </div>
        )}

        <div className="flex items-center gap-2 pt-1">
          <Button
            onClick={handleSave}
            disabled={!isDirty || saving}
            className="bg-primary hover:bg-primary/80 gap-1.5"
          >
            <Save size={14} />
            {saving ? 'Saving…' : 'Save Thresholds'}
          </Button>
          {isDirty && (
            <Button
              variant="outline"
              onClick={handleReset}
              className="gap-1.5 border-border"
            >
              <RotateCcw size={14} />
              Undo
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRestoreDefaults}
            className="text-xs text-muted-foreground hover:text-foreground ml-auto"
          >
            Restore defaults
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
