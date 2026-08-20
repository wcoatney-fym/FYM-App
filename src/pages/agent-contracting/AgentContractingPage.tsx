/**
 * AgentContractingPage — the agent's view of their contracting progress.
 *
 * Split experience:
 * - Pre-RTS: progress bar + current step checklist + writing number input
 * - Post-RTS: carrier management + backfill/request contracting
 *
 * Agent can mark steps complete (pending admin approval).
 * Agent can input writing numbers during In Contracting.
 * One confirmed writing number → "Test Out with Tyler" unlocks.
 * Tyler test confirmed by admin → auto-RTS.
 *
 * Charlie direction (2026-08-20):
 * - Split view with progress bar showing current step
 * - Steps unlock sequentially
 * - Agent marks complete → admin approves/declines
 * - CRM Setup removed from agent-facing stages
 */
import { useState } from 'react';
import { Header } from '@/components/layout/Header';
import { Card, CardContent } from '@/components/ui/card';
import { FadeIn, StaggerContainer, StaggerItem } from '@/components/ui/animated';
import {
  useAgentPipeline,
  isPreRTS,
  getStageIndex,
} from '@/hooks/useAgentPipeline';
import { computeProgress } from '@/pages/contracting/pipeline/pipelineProgress';
import { ContractingProgressBar } from './ContractingProgressBar';
import { ContractingStepPanel } from './ContractingStepPanel';
import { AgentWritingNumberInput } from './AgentWritingNumberInput';
import { AgentCarrierManagement } from './AgentCarrierManagement';
import { TylerTestCard } from './TylerTestCard';
import {
  Loader2,
  AlertCircle,
  Shield,
  RefreshCw,
} from 'lucide-react';

export function AgentContractingPage() {
  const {
    pipelineRecord,
    stageSteps,
    lobAssignments,
    wnSubmissions,
    stepCompletions,
    loading,
    error,
    refetch,
    submitStepCompletion,
    submitWritingNumber,
    requestContracting,
  } = useAgentPipeline();

  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  // Determine if agent is pre-RTS or post-RTS
  const currentStage = pipelineRecord?.stage;
  const preRTS = currentStage ? isPreRTS(currentStage) : true;
  const currentStageIndex = currentStage ? getStageIndex(currentStage) : 0;

  // Check if agent has any verified writing numbers (unlocks Tyler Test)
  const verifiedWNs = lobAssignments.filter((l) => l.verified);
  const hasVerifiedWN = verifiedWNs.length > 0;

  // Check for pending submissions
  const pendingWNs = wnSubmissions.filter((s) => s.status === 'pending');
  const rejectedWNs = wnSubmissions.filter((s) => s.status === 'rejected');

  // Loading state
  if (loading) {
    return (
      <div className="p-6">
        <Header title="Contracting" />
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="p-6">
        <Header title="Contracting" />
        <Card className="max-w-lg mx-auto mt-8">
          <CardContent className="py-8 text-center">
            <AlertCircle className="w-10 h-10 text-red-400 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground mb-4">{error}</p>
            <button
              onClick={handleRefresh}
              className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/80 transition-colors"
            >
              Try Again
            </button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // No pipeline record found
  if (!pipelineRecord) {
    return (
      <div className="p-6">
        <Header title="Contracting" />
        <Card className="max-w-lg mx-auto mt-8">
          <CardContent className="py-8 text-center">
            <Shield className="w-10 h-10 text-primary mx-auto mb-3" />
            <h3 className="text-lg font-bold text-foreground mb-2">
              Getting Started
            </h3>
            <p className="text-sm text-muted-foreground">
              Your contracting profile is being set up. Check back soon or
              contact your manager for status.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Compute step progress for current stage
  const progress = computeProgress(pipelineRecord, stageSteps);

  // Check if agent is in the "additional contracting" flow (post-RTS but in_contracting)
  const isAdditionalContracting =
    currentStage === 'in_contracting' &&
    (pipelineRecord.tags?.includes('active_agent_request') ||
      pipelineRecord.tags?.includes('rts_agent_request'));

  const earnedStatusLabel = pipelineRecord.tags?.includes('active_agent_request')
    ? 'Active'
    : pipelineRecord.tags?.includes('rts_agent_request')
      ? 'RTS'
      : null;

  const subtitleText =
    preRTS && !isAdditionalContracting
      ? 'Track your onboarding progress'
      : isAdditionalContracting
        ? `Additional Contracting · ${earnedStatusLabel} Agent`
        : 'Manage your carrier appointments';

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Header title="My Contracting" />
          <p className="text-sm text-muted-foreground mt-1 px-6">{subtitleText}</p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-background transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      <FadeIn>
        {/* ── Progress Bar ── */}
        <ContractingProgressBar
          currentStage={currentStage!}
          currentStageIndex={currentStageIndex}
          isAdditionalContracting={isAdditionalContracting}
          earnedStatusLabel={earnedStatusLabel}
        />

        <div className="mt-6 space-y-6">
          {preRTS || isAdditionalContracting ? (
            /* ── Pre-RTS View ── */
            <StaggerContainer className="space-y-4">
              {/* Current Step Panel */}
              <StaggerItem>
                <ContractingStepPanel
                  pipelineRecord={pipelineRecord}
                  stepCompletions={stepCompletions}
                  progress={progress}
                  onSubmitStep={submitStepCompletion}
                />
              </StaggerItem>

              {/* Writing Number Input — shown during In Contracting */}
              {(currentStage === 'in_contracting' || isAdditionalContracting) && (
                <StaggerItem>
                  <AgentWritingNumberInput
                    lobAssignments={lobAssignments}
                    wnSubmissions={wnSubmissions}
                    onSubmit={submitWritingNumber}
                  />
                </StaggerItem>
              )}

              {/* Tyler Test Card — unlocked when at least one WN is verified */}
              {currentStage === 'in_contracting' &&
                !isAdditionalContracting &&
                hasVerifiedWN && (
                  <StaggerItem>
                    <TylerTestCard
                      pipelineRecord={pipelineRecord}
                      stepCompletions={stepCompletions}
                      onSubmitStep={submitStepCompletion}
                    />
                  </StaggerItem>
                )}

              {/* Pending/Declined feedback */}
              {pendingWNs.length > 0 && (
                <StaggerItem>
                  <Card className="border-amber-500/20 bg-amber-500/5">
                    <CardContent className="p-4 space-y-2">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-amber-400 mb-2">Pending Review</p>
                      {pendingWNs.map((sub) => (
                        <div
                          key={sub.id}
                          className="flex items-center gap-3 text-sm"
                        >
                          <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                          <span className="text-foreground font-medium">
                            {sub.carrier}
                          </span>
                          <span className="text-muted-foreground font-mono text-xs">
                            {sub.writing_number}
                          </span>
                          <span className="text-amber-400 text-xs ml-auto">
                            Awaiting admin review
                          </span>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                </StaggerItem>
              )}

              {rejectedWNs.length > 0 && (
                <StaggerItem>
                  <Card className="border-red-500/20 bg-red-500/5">
                    <CardContent className="p-4 space-y-2">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-red-400 mb-2">Action Required</p>
                      {rejectedWNs.map((sub) => (
                        <div key={sub.id} className="space-y-1">
                          <div className="flex items-center gap-3 text-sm">
                            <AlertCircle className="w-4 h-4 text-red-400" />
                            <span className="text-foreground font-medium">
                              {sub.carrier}
                            </span>
                            <span className="text-red-400 text-xs ml-auto">
                              Declined
                            </span>
                          </div>
                          {sub.review_note && (
                            <p className="text-xs text-muted-foreground ml-7">
                              {sub.review_note}
                            </p>
                          )}
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                </StaggerItem>
              )}
            </StaggerContainer>
          ) : (
            /* ── Post-RTS View ── */
            <AgentCarrierManagement
              lobAssignments={lobAssignments}
              wnSubmissions={wnSubmissions}
              onRequestContracting={requestContracting}
              onSubmitWritingNumber={submitWritingNumber}
            />
          )}
        </div>
      </FadeIn>
    </div>
  );
}
