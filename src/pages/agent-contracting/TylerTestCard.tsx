/**
 * TylerTestCard — unlocked when agent has at least one verified
 * writing number during In Contracting.
 *
 * Charlie (2026-08-20): Once they test with Tyler and it is confirmed
 * on the admin side, the agent is automatically marked RTS.
 *
 * The agent marks the Tyler test as "completed" → goes to pending_review →
 * admin confirms → agent auto-promoted to RTS.
 */
import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import {
  GraduationCap,
  CheckCircle2,
  Clock,
  Loader2,
  Zap,
} from 'lucide-react';
import type { PortalPipelineRecord } from '@/lib/contracting/types';
import type { StepCompletion } from '@/hooks/useAgentPipeline';

/**
 * Well-known step ID for Tyler test.
 * Must match the UUID of the "Test out with Tyler" row in
 * agent_pipeline_stage_steps (internal_stage = 'rts', active = true).
 * Used as key in completed_steps JSONB and as step_id in agent_step_completions.
 */
export const TYLER_TEST_STEP_ID = 'bb52e2aa-7ffd-465f-96e9-fbd4af305c7d';

interface TylerTestCardProps {
  pipelineRecord: PortalPipelineRecord;
  stepCompletions: StepCompletion[];
  onSubmitStep: (stepId: string) => Promise<boolean>;
}

export function TylerTestCard({
  pipelineRecord,
  stepCompletions,
  onSubmitStep,
}: TylerTestCardProps) {
  const [submitting, setSubmitting] = useState(false);

  // Check status of Tyler test
  const tylerCompletion = pipelineRecord.completed_steps?.[TYLER_TEST_STEP_ID];
  const isPending = tylerCompletion?.startsWith('pending:');
  const isApproved = tylerCompletion && !isPending;

  // Check if there's a declined Tyler test
  const declinedCompletion = stepCompletions.find(
    (c) => c.step_id === TYLER_TEST_STEP_ID && c.status === 'declined'
  );
  const isDeclined = !!declinedCompletion && !tylerCompletion;

  const handleSubmit = async () => {
    setSubmitting(true);
    await onSubmitStep(TYLER_TEST_STEP_ID);
    setSubmitting(false);
  };

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center flex-shrink-0">
            <GraduationCap className="w-6 h-6 text-amber-400" />
          </div>
          <div className="flex-1 space-y-2">
            <h3 className="text-base font-bold text-foreground">
              Test Out with Tyler
            </h3>
            <p className="text-sm text-muted-foreground">
              You have at least one verified writing number — you're eligible to
              test out with Tyler Cole, FYM's trainer. Once Tyler confirms
              you've passed, you'll be marked Ready to Sell.
            </p>

            {isApproved ? (
              <div className="flex items-center gap-2 mt-3 px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                <span className="text-sm font-bold text-emerald-400">
                  Test passed — you're RTS!
                </span>
              </div>
            ) : isPending ? (
              <div className="flex items-center gap-2 mt-3 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
                <Clock className="w-5 h-5 text-amber-400" />
                <span className="text-sm font-medium text-amber-400">
                  Submitted — awaiting Tyler's confirmation
                </span>
              </div>
            ) : (
              <div className="mt-3 space-y-2">
                {isDeclined && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400">
                    Test was not approved — please try again after additional preparation.
                    {declinedCompletion.decline_reason && (
                      <span className="block mt-1 text-red-400/70">
                        Note: {declinedCompletion.decline_reason}
                      </span>
                    )}
                  </div>
                )}
                <button
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 text-white text-sm font-bold hover:from-amber-600 hover:to-orange-600 transition-all disabled:opacity-50 shadow-lg shadow-amber-500/20"
                >
                  {submitting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Zap className="w-4 h-4" />
                  )}
                  {isDeclined
                    ? 'Resubmit — I Tested with Tyler'
                    : 'I Tested with Tyler'}
                </button>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
