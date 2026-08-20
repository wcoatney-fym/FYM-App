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
import { useState, useMemo, useCallback } from 'react';
import { Header } from '@/components/layout/Header';
import { Card, CardContent } from '@/components/ui/card';
import { FadeIn, StaggerContainer, StaggerItem } from '@/components/ui/animated';
import {
  useAgentPipeline,
  isPreRTS,
  getStageIndex,
  AGENT_STAGES,
} from '@/hooks/useAgentPipeline';
import type { StepCompletion, WritingNumberSubmission } from '@/hooks/useAgentPipeline';
import { useEffectiveAuth } from '@/hooks/useEffectiveAuth';
import { useAgentRosterData } from '@/hooks/useAgentRosterData';
import { useTestViewStore } from '@/store/test-view-store';
import { TestViewToolbar } from '@/components/test-view/TestViewToolbar';
import { computeProgress } from '@/pages/contracting/pipeline/pipelineProgress';
import { ContractingProgressBar } from './ContractingProgressBar';
import { ContractingStepPanel } from './ContractingStepPanel';
import { AgentWritingNumberInput } from './AgentWritingNumberInput';
import { AgentCarrierManagement } from './AgentCarrierManagement';
import { TylerTestCard } from './TylerTestCard';
import type {
  AgentPipelineStage,
  PortalPipelineRecord,
  PortalPipelineStageStep,
  PortalLobAssignment,
} from '@/lib/contracting/types';
import {
  Loader2,
  AlertCircle,
  Shield,
  CheckCircle2,
  RefreshCw,
} from 'lucide-react';

// ── Mock data for test view ──────────────────────────────────────────────────

function makeMockPipeline(
  stage: AgentPipelineStage,
  completedSteps: Record<string, string> = {},
): PortalPipelineRecord {
  return {
    id: 'test-pipeline-001',
    ghl_opportunity_id: 'test-opp-001',
    ghl_contact_id: null,
    ghl_pipeline_id: null,
    ghl_stage_id: null,
    stage,
    agent_name: 'Test Mitchell',
    first_name: 'Test',
    last_name: 'Mitchell',
    email: 'test@teamfym.com',
    phone: '555-0100',
    agency: 'FYM',
    agency_id: null,
    agent_id: 'test-agent-001',
    writing_numbers: null,
    notes: null,
    tags: [],
    custom_fields: {},
    completed_steps: completedSteps,
    last_updated_by: 'system',
    last_updated_by_display: 'System',
    updated_by_source: 'contracting_portal',
    ghl_sync_status: 'synced',
    stage_entered_at: new Date(Date.now() - 2 * 86_400_000).toISOString(),
    created_at: new Date(Date.now() - 14 * 86_400_000).toISOString(),
    updated_at: new Date().toISOString(),
    wn_pending_review: false,
    wn_pending_count: 0,
    agent_action_pending: false,
    agent_action_at: undefined,
  };
}

const MOCK_STEPS: PortalPipelineStageStep[] = [
  { id: 'step-intake-1', internal_stage: 'hip_broker', label: 'Complete intake form', display_order: 1, active: true, created_at: '' },
  { id: 'step-iaa-1', internal_stage: 'iaa', label: 'Review Independent Agent Agreement', display_order: 1, active: true, created_at: '' },
  { id: 'step-iaa-2', internal_stage: 'iaa', label: 'Download IAA document', display_order: 2, active: true, created_at: '' },
  { id: 'step-signed-1', internal_stage: 'signed_iaa', label: 'Sign and upload IAA', display_order: 1, active: true, created_at: '' },
  { id: 'step-signed-2', internal_stage: 'signed_iaa', label: 'Confirm W-9 information', display_order: 2, active: true, created_at: '' },
  { id: 'step-bill-1', internal_stage: 'bill_com', label: 'Set up Bill.com account', display_order: 1, active: true, created_at: '' },
  { id: 'step-bill-2', internal_stage: 'bill_com', label: 'Link bank account for direct deposit', display_order: 2, active: true, created_at: '' },
  { id: 'step-contract-1', internal_stage: 'in_contracting', label: 'Submit carrier appointments', display_order: 1, active: true, created_at: '' },
  { id: 'step-contract-2', internal_stage: 'in_contracting', label: 'Complete E&O verification', display_order: 2, active: true, created_at: '' },
  { id: 'step-contract-3', internal_stage: 'in_contracting', label: 'Confirm state licenses', display_order: 3, active: true, created_at: '' },
  { id: 'tyler_test', internal_stage: 'in_contracting', label: 'Test out with Tyler', display_order: 4, active: true, created_at: '' },
];

const MOCK_LOB_VERIFIED: PortalLobAssignment[] = [
  {
    id: 'lob-1', agent_id: 'test-agent-001', line_of_business: 'HIP',
    carrier: 'UNL', writing_number: '202TEST01', verified: true,
    verified_at: new Date().toISOString(), verified_by: 'admin',
    submitted_by_agent: true, ai_extracted: false,
    source_submission_id: null, created_at: '', updated_at: '',
  },
];

export function AgentContractingPage() {
  const realPipeline = useAgentPipeline();
  const { effectiveWritingNumber, isFymAdmin } = useEffectiveAuth();
  const rosterData = useAgentRosterData();
  const testView = useTestViewStore();
  const [refreshing, setRefreshing] = useState(false);
  const [testCompletedSteps, setTestCompletedSteps] = useState<Record<string, string>>({});
  const [testStepCompletions, setTestStepCompletions] = useState<StepCompletion[]>([]);
  const [testWnSubmissions, setTestWnSubmissions] = useState<WritingNumberSubmission[]>([]);

  // ── Test view mode: use mock data instead of real DB data ──────────────
  const isTestMode = isFymAdmin && testView.active;
  const testStageKey = testView.stage ?? AGENT_STAGES[0].key;
  const testPreRTS = isPreRTS(testStageKey);

  const testPipelineRecord = useMemo(
    () => makeMockPipeline(testStageKey, testCompletedSteps),
    [testStageKey, testCompletedSteps],
  );

  const testLobAssignments = useMemo(() => {
    if (testStageKey === 'in_contracting') return MOCK_LOB_VERIFIED;
    if (!testPreRTS) return MOCK_LOB_VERIFIED;
    return [];
  }, [testStageKey, testPreRTS]);

  // Mock step completion handler
  const handleTestStepComplete = useCallback(async (stepId: string): Promise<boolean> => {
    const ts = new Date().toISOString();
    setTestCompletedSteps((prev) => ({ ...prev, [stepId]: `pending:${ts}` }));
    setTestStepCompletions((prev) => [{
      id: `comp-${Date.now()}`,
      pipeline_id: 'test-pipeline-001',
      step_id: stepId,
      completed_by: 'agent',
      status: 'pending_review',
      decline_reason: null,
      created_at: ts,
      updated_at: ts,
    }, ...prev]);
    return true;
  }, []);

  // Mock WN submission handler
  const handleTestSubmitWN = useCallback(async (carrier: string, writingNumber: string): Promise<boolean> => {
    setTestWnSubmissions((prev) => [{
      id: `wn-${Date.now()}`,
      agent_id: 'test-agent-001',
      carrier,
      writing_number: writingNumber,
      ai_extracted_number: null,
      source_image_url: null,
      submission_method: 'typed',
      status: 'pending',
      review_note: null,
      reviewed_by: null,
      reviewed_at: null,
      created_at: new Date().toISOString(),
    }, ...prev]);
    return true;
  }, []);

  const handleTestRequestContracting = useCallback(async (_carrier: string): Promise<boolean> => {
    return true;
  }, []);

  // ── Resolve effective values (real or test) ────────────────────────────
  const pipelineRecord = isTestMode ? testPipelineRecord : realPipeline.pipelineRecord;
  const stageSteps = isTestMode ? MOCK_STEPS : realPipeline.stageSteps;
  const lobAssignments = isTestMode ? testLobAssignments : realPipeline.lobAssignments;
  const wnSubmissions = isTestMode ? testWnSubmissions : realPipeline.wnSubmissions;
  const stepCompletions = isTestMode ? testStepCompletions : realPipeline.stepCompletions;
  const loading = isTestMode ? false : realPipeline.loading;
  const error = isTestMode ? null : realPipeline.error;
  const refetch = realPipeline.refetch;
  const submitStepCompletion = isTestMode ? handleTestStepComplete : realPipeline.submitStepCompletion;
  const submitWritingNumber = isTestMode ? handleTestSubmitWN : realPipeline.submitWritingNumber;
  const requestContracting = isTestMode ? handleTestRequestContracting : realPipeline.requestContracting;

  const handleRefresh = async () => {
    setRefreshing(true);
    if (isTestMode) {
      // Reset test state
      setTestCompletedSteps({});
      setTestStepCompletions([]);
      setTestWnSubmissions([]);
    } else {
      await refetch();
    }
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

  // No pipeline record found (skip in test mode — always have mock data)
  if (!pipelineRecord && !isTestMode) {
    // If agent has a writing number, they're producing — show post-RTS view
    // Most existing agents were contracted before the pipeline was built
    if (effectiveWritingNumber) {
      return (
        <div className="p-6 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <Header title="My Contracting" />
              <p className="text-sm text-muted-foreground mt-1 px-6">
                Manage your carrier appointments
              </p>
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
            <Card className="border-emerald-500/20 bg-emerald-500/5">
              <CardContent className="p-4 flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-foreground">Active Agent</p>
                  <p className="text-xs text-muted-foreground">
                    You're fully contracted and producing. Use this page to manage your carrier appointments or request contracting with additional carriers.
                  </p>
                </div>
              </CardContent>
            </Card>
          </FadeIn>

          {/* Show carrier data from agency roster as verified carriers */}
          {rosterData.loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : (
            <AgentCarrierManagement
              lobAssignments={lobAssignments}
              wnSubmissions={wnSubmissions}
              onRequestContracting={requestContracting}
              onSubmitWritingNumber={submitWritingNumber}
              rosterCarriers={rosterData.carriers}
            />
          )}
        </div>
      );
    }

    // Truly new agent with no writing number and no pipeline record
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

  // Past this point, pipelineRecord is guaranteed non-null:
  // - In test mode, it's always the mock record
  // - In real mode, the null guard above already returned
  const pipeline = pipelineRecord!;

  // Compute step progress for current stage
  const progress = computeProgress(pipeline, stageSteps);

  // Check if agent is in the "additional contracting" flow (post-RTS but in_contracting)
  const isAdditionalContracting =
    currentStage === 'in_contracting' &&
    (pipeline.tags?.includes('active_agent_request') ||
      pipeline.tags?.includes('rts_agent_request'));

  const earnedStatusLabel = pipeline.tags?.includes('active_agent_request')
    ? 'Active'
    : pipeline.tags?.includes('rts_agent_request')
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
                  pipelineRecord={pipeline}
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
                      pipelineRecord={pipeline}
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

      {/* Test view floating toolbar — only visible for admins in test mode */}
      {isTestMode && <TestViewToolbar />}
    </div>
  );
}
