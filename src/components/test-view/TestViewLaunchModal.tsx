/**
 * TestViewLaunchModal — pre-launch configuration for the test agent view.
 *
 * Before entering test mode, the admin can:
 * 1. Pick which pipeline stage to start at
 * 2. Reset the test agent's pipeline record to hip_broker
 * 3. Then launch into the view at the chosen stage
 *
 * All updates hit the real portal DB (agent_pipeline for Tester Mitchell).
 */
import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  FlaskConical,
  RotateCcw,
  Play,
  Loader2,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { AGENT_STAGES } from '@/hooks/useAgentPipeline';
import { portalSupabase } from '@/lib/portal-supabase';
import type { AgentPipelineStage } from '@/lib/contracting/types';

/** Tester Mitchell's stable IDs in the portal DB */
const TEST_AGENT_ID = 'd6fe7763-adec-4acc-9d72-0f269be15025';
const TEST_AGENCY_ID = '723620b6-0297-4690-a9ad-52c18945fdb4';

/**
 * The test agent's intake form is always submitted (that's how they got their
 * NPN and login). So the baseline reset stage is 'iaa' (Agreement), not
 * 'hip_broker' (Intake). Intake is always completed for the test agent.
 */
const RESET_STAGE: AgentPipelineStage = 'iaa';

interface TestViewLaunchModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLaunch: (startingStage: AgentPipelineStage) => void;
}

export function TestViewLaunchModal({
  open,
  onOpenChange,
  onLaunch,
}: TestViewLaunchModalProps) {
  const [selectedStage, setSelectedStage] = useState<AgentPipelineStage>(RESET_STAGE);
  const [currentStage, setCurrentStage] = useState<AgentPipelineStage | null>(null);
  const [pipelineId, setPipelineId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetDone, setResetDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch current pipeline state when modal opens
  useEffect(() => {
    if (!open || !portalSupabase) return;
    setResetDone(false);
    setError(null);

    (async () => {
      setLoading(true);
      // Look up by agent_id (stable across resets)
      const { data, error: fetchErr } = await portalSupabase
        .from('agent_pipeline')
        .select('id, stage')
        .eq('agent_id', TEST_AGENT_ID)
        .maybeSingle();

      if (fetchErr) {
        setError(`Failed to load pipeline: ${fetchErr.message}`);
      } else if (data) {
        setPipelineId(data.id);
        setCurrentStage(data.stage as AgentPipelineStage);
        setSelectedStage(data.stage as AgentPipelineStage);
      } else {
        setError('No pipeline record found for Tester Mitchell');
      }
      setLoading(false);
    })();
  }, [open]);

  async function handleReset() {
    if (!portalSupabase || !pipelineId) return;
    setResetting(true);
    setError(null);

    const now = new Date().toISOString();

    // Reset pipeline record: stage, tags, completed_steps
    const { error: updateErr } = await portalSupabase
      .from('agent_pipeline')
      .update({
        stage: RESET_STAGE,
        stage_entered_at: now,
        updated_at: now,
        last_updated_by: 'admin_test',
        last_updated_by_display: 'Test View Reset',
        updated_by_source: 'contracting_portal',
        completed_steps: {},
        tags: [],
        writing_numbers: null,
        wn_pending_review: false,
        wn_pending_count: 0,
        agent_action_pending: false,
        agent_action_at: null,
      })
      .eq('id', pipelineId);

    if (updateErr) {
      setError(`Reset failed: ${updateErr.message}`);
      setResetting(false);
      return;
    }

    // Clear step completions for this pipeline
    await portalSupabase
      .from('agent_step_completions')
      .delete()
      .eq('pipeline_id', pipelineId);

    // Clear writing number submissions
    await portalSupabase
      .from('agent_writing_number_submissions')
      .delete()
      .eq('agent_id', TEST_AGENT_ID);

    // Re-seed mock intake form data so it's always present
    await portalSupabase
      .from('agent_intake')
      .upsert({
        agent_id: TEST_AGENT_ID,
        date_of_birth: '1990-01-15',
        address: '456 Mock Ave',
        city: 'Dallas',
        state: 'TX',
        postal_code: '75201',
        ssn: '000-00-0000',
        resident_license_number: 'TEST000',
        npn: '99999999',
        resident_state: 'TX',
        release_needed: 'no',
        state_licenses: [],
        submitted_at: now,
        agent_type: 'hip_career',
      }, { onConflict: 'agent_id' });

    // Seed mock production data (visible if agent reaches Actively Selling)
    const mockPeriods = [
      { start: '2026-07-01', end: '2026-07-31', written: 12, active: 11, cancelled: 1, premium: 6380 },
      { start: '2026-08-01', end: '2026-08-31', written: 8, active: 8, cancelled: 0, premium: 4520 },
    ];

    // Clear old mock production first
    await portalSupabase
      .from('agent_production')
      .delete()
      .eq('agent_id', TEST_AGENT_ID);

    // Insert fresh mock production
    await portalSupabase
      .from('agent_production')
      .insert(
        mockPeriods.map((p) => ({
          agency_id: TEST_AGENCY_ID,
          agent_id: TEST_AGENT_ID,
          period_start: p.start,
          period_end: p.end,
          policies_written: p.written,
          policies_active: p.active,
          policies_cancelled: p.cancelled,
          total_premium: p.premium,
          carrier: 'UNL',
          computed_at: now,
        }))
      );

    setCurrentStage(RESET_STAGE);
    setSelectedStage(RESET_STAGE);
    setResetDone(true);
    setTimeout(() => setResetDone(false), 2000);
    setResetting(false);
  }

  async function handleLaunch() {
    if (!portalSupabase || !pipelineId) return;
    setLoading(true);
    setError(null);

    // If selected stage differs from current, update before launching
    if (selectedStage !== currentStage) {
      const now = new Date().toISOString();
      const { error: updateErr } = await portalSupabase
        .from('agent_pipeline')
        .update({
          stage: selectedStage,
          stage_entered_at: now,
          updated_at: now,
          last_updated_by: 'admin_test',
          last_updated_by_display: 'Test View Launch',
          updated_by_source: 'contracting_portal',
        })
        .eq('id', pipelineId);

      if (updateErr) {
        setError(`Failed to set stage: ${updateErr.message}`);
        setLoading(false);
        return;
      }
    }

    setLoading(false);
    onLaunch(selectedStage);
  }

  const currentStageLabel = currentStage
    ? AGENT_STAGES.find((s) => s.key === currentStage)?.label ?? currentStage
    : '—';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-card border-border">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground">
            <FlaskConical className="w-5 h-5 text-purple-400" />
            Launch Test Agent View
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Configure the starting stage for Tester Mitchell before entering the agent view.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="flex items-center gap-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="space-y-4 py-2">
          {/* Current stage indicator */}
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Current stage:</span>
            <span className="font-medium text-foreground">
              {loading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin inline" />
              ) : (
                currentStageLabel
              )}
            </span>
          </div>

          {/* Stage selector */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">
              Start at stage:
            </label>
            <div className="grid grid-cols-1 gap-1.5">
              {AGENT_STAGES.map((stage, idx) => {
                const isSelected = selectedStage === stage.key;
                const isCurrent = currentStage === stage.key;
                return (
                  <button
                    key={stage.key}
                    onClick={() => setSelectedStage(stage.key)}
                    disabled={loading}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left transition-all ${
                      isSelected
                        ? 'border-purple-500/50 bg-purple-500/10 text-foreground'
                        : 'border-border/40 bg-secondary/10 text-muted-foreground hover:bg-secondary/20 hover:text-foreground'
                    }`}
                  >
                    <div
                      className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0 ${
                        isSelected
                          ? 'bg-purple-500 text-white'
                          : 'bg-muted/30 text-muted-foreground'
                      }`}
                    >
                      {idx + 1}
                    </div>
                    <span className="text-sm font-medium flex-1">{stage.label}</span>
                    {isCurrent && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                        current
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            onClick={handleReset}
            disabled={loading || resetting}
            className="border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-300"
          >
            {resetting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
            ) : resetDone ? (
              <CheckCircle2 className="w-3.5 h-3.5 mr-1.5 text-emerald-400" />
            ) : (
              <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
            )}
            {resetDone ? 'Reset!' : 'Reset to Agreement'}
          </Button>
          <Button
            onClick={handleLaunch}
            disabled={loading || !pipelineId}
            className="bg-purple-500 hover:bg-purple-600 text-white flex-1"
          >
            {loading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
            ) : (
              <Play className="w-3.5 h-3.5 mr-1.5" />
            )}
            Launch
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
