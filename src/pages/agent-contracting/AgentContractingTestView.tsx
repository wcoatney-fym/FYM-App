/**
 * AgentContractingTestView — admin-only demo/test harness that renders
 * the agent contracting experience with simulated pipeline data.
 *
 * Built for the 2026-08-21 demo. No DB writes — everything runs in
 * local state with mock data.
 *
 * Features:
 * - Stage selector to jump to any pipeline stage
 * - Next / Previous controls to walk through sequentially
 * - Reset button snaps back to Intake (hip_broker)
 * - Simulates step completions, WN submissions, and Tyler test flow
 * - Renders the exact same visual components the agent sees
 */
import { useState, useCallback, useMemo } from 'react';
import { Header } from '@/components/layout/Header';
import { Card, CardContent } from '@/components/ui/card';
import { FadeIn, StaggerContainer, StaggerItem } from '@/components/ui/animated';
import {
  AGENT_STAGES,
  getStageIndex,
  isPreRTS,
} from '@/hooks/useAgentPipeline';
import type { StepCompletion, WritingNumberSubmission } from '@/hooks/useAgentPipeline';
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
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  FlaskConical,
  Eye,
  CheckCircle2,
} from 'lucide-react';

// ─── Mock Data Generators ────────────────────────────────────────────────────

const MOCK_AGENT_NAME = 'Demo Agent';

function makeMockPipeline(
  stage: AgentPipelineStage,
  completedSteps: Record<string, string> = {},
  tags: string[] = [],
): PortalPipelineRecord {
  return {
    id: 'test-pipeline-001',
    ghl_opportunity_id: 'test-opp-001',
    ghl_contact_id: null,
    ghl_pipeline_id: null,
    ghl_stage_id: null,
    stage,
    agent_name: MOCK_AGENT_NAME,
    first_name: 'Demo',
    last_name: 'Agent',
    email: 'demo@test.com',
    phone: '555-0100',
    agency: 'FYM',
    agency_id: null,
    agent_id: 'test-agent-001',
    writing_numbers: null,
    notes: null,
    tags,
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

/** Mock stage steps — one per agent-facing stage for demo purposes */
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

const MOCK_LOB_POST_RTS: PortalLobAssignment[] = [
  ...MOCK_LOB_VERIFIED,
  {
    id: 'lob-2', agent_id: 'test-agent-001', line_of_business: 'HIP',
    carrier: 'GTL', writing_number: '300TEST02', verified: true,
    verified_at: new Date().toISOString(), verified_by: 'admin',
    submitted_by_agent: false, ai_extracted: false,
    source_submission_id: null, created_at: '', updated_at: '',
  },
];

// ─── Component ───────────────────────────────────────────────────────────────

export function AgentContractingTestView() {
  const [stageIndex, setStageIndex] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<Record<string, string>>({});
  const [stepCompletions, setStepCompletions] = useState<StepCompletion[]>([]);
  const [wnSubmissions, setWnSubmissions] = useState<WritingNumberSubmission[]>([]);
  const [showPostRTS, setShowPostRTS] = useState(false);

  const currentStageKey = AGENT_STAGES[stageIndex]?.key ?? 'hip_broker';
  const preRTS = isPreRTS(currentStageKey);
  const currentStageIndex = getStageIndex(currentStageKey);

  // Build mock pipeline record from current state
  const pipelineRecord = useMemo(
    () => makeMockPipeline(currentStageKey, completedSteps),
    [currentStageKey, completedSteps],
  );

  // Choose LOB assignments based on stage
  const lobAssignments = useMemo(() => {
    if (showPostRTS || !preRTS) return MOCK_LOB_POST_RTS;
    if (currentStageKey === 'in_contracting') return MOCK_LOB_VERIFIED;
    return [];
  }, [currentStageKey, preRTS, showPostRTS]);

  const hasVerifiedWN = lobAssignments.some((l) => l.verified);

  const progress = useMemo(
    () => computeProgress(pipelineRecord, MOCK_STEPS),
    [pipelineRecord],
  );

  // ── Demo actions (local state only, no DB) ─────────────────────────────

  const handleReset = useCallback(() => {
    setStageIndex(0);
    setCompletedSteps({});
    setStepCompletions([]);
    setWnSubmissions([]);
    setShowPostRTS(false);
  }, []);

  const handlePrev = useCallback(() => {
    setStageIndex((i) => Math.max(0, i - 1));
  }, []);

  const handleNext = useCallback(() => {
    setStageIndex((i) => Math.min(AGENT_STAGES.length - 1, i + 1));
  }, []);

  const handleJumpToStage = useCallback((idx: number) => {
    setStageIndex(idx);
    if (idx >= AGENT_STAGES.length - 1) {
      setShowPostRTS(true);
    } else {
      setShowPostRTS(false);
    }
  }, []);

  // Simulated step completion — marks as pending_review locally
  const handleSubmitStep = useCallback(async (stepId: string): Promise<boolean> => {
    const ts = new Date().toISOString();
    setCompletedSteps((prev) => ({ ...prev, [stepId]: `pending:${ts}` }));
    setStepCompletions((prev) => [
      {
        id: `comp-${Date.now()}`,
        pipeline_id: 'test-pipeline-001',
        step_id: stepId,
        completed_by: 'agent',
        status: 'pending_review',
        decline_reason: null,
        created_at: ts,
        updated_at: ts,
      },
      ...prev,
    ]);
    return true;
  }, []);

  // Simulated WN submission
  const handleSubmitWN = useCallback(async (carrier: string, writingNumber: string): Promise<boolean> => {
    setWnSubmissions((prev) => [
      {
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
      },
      ...prev,
    ]);
    return true;
  }, []);

  // Simulated request contracting (no-op for demo)
  const handleRequestContracting = useCallback(async (_carrier: string): Promise<boolean> => {
    return true;
  }, []);

  // Pending/rejected WN subs
  const pendingWNs = wnSubmissions.filter((s) => s.status === 'pending');

  return (
    <div className="p-6 space-y-6">
      {/* ── Test Controls Banner ── */}
      <FadeIn>
        <Card className="border-purple-500/30 bg-purple-500/5">
          <CardContent className="p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FlaskConical className="w-5 h-5 text-purple-400" />
                <span className="text-sm font-bold text-purple-300">Test View</span>
                <span className="text-xs text-muted-foreground">— Agent contracting experience demo</span>
              </div>
              <button
                onClick={handleReset}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-bold hover:bg-red-500/20 transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Reset to Start
              </button>
            </div>

            {/* Stage selector */}
            <div className="flex items-center gap-2 flex-wrap">
              <Eye className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <span className="text-[11px] text-muted-foreground font-medium">VIEWING:</span>
              {AGENT_STAGES.map((stage, idx) => (
                <button
                  key={stage.key}
                  onClick={() => handleJumpToStage(idx)}
                  className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-colors ${
                    idx === stageIndex
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted/30 text-muted-foreground hover:bg-muted/50'
                  }`}
                >
                  {stage.label}
                </button>
              ))}
              <button
                onClick={() => { handleJumpToStage(AGENT_STAGES.length - 1); setShowPostRTS(true); }}
                className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-colors ${
                  showPostRTS && stageIndex === AGENT_STAGES.length - 1
                    ? 'bg-emerald-500 text-white'
                    : 'bg-muted/30 text-muted-foreground hover:bg-muted/50'
                }`}
              >
                Post-RTS
              </button>
            </div>

            {/* Prev / Next controls */}
            <div className="flex items-center gap-2">
              <button
                onClick={handlePrev}
                disabled={stageIndex === 0}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:text-foreground transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                Previous Stage
              </button>
              <button
                onClick={handleNext}
                disabled={stageIndex >= AGENT_STAGES.length - 1}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:text-foreground transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                Next Stage
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
              <span className="text-xs text-muted-foreground ml-2">
                Stage {stageIndex + 1} of {AGENT_STAGES.length}
                {showPostRTS ? ' (Post-RTS view)' : ''}
              </span>
            </div>
          </CardContent>
        </Card>
      </FadeIn>

      {/* ── Divider ── */}
      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-border/30" />
        </div>
        <div className="relative flex justify-center">
          <span className="bg-background px-3 text-[10px] text-muted-foreground uppercase tracking-widest font-semibold">
            Agent View Below
          </span>
        </div>
      </div>

      {/* ── Simulated Agent View ── */}
      <div>
        <Header title="My Contracting" />
        <p className="text-sm text-muted-foreground mt-1 px-6">
          {preRTS && !showPostRTS
            ? 'Track your onboarding progress'
            : 'Manage your carrier appointments'}
        </p>
      </div>

      <FadeIn>
        {/* Progress Bar */}
        <ContractingProgressBar
          currentStage={currentStageKey}
          currentStageIndex={currentStageIndex}
        />

        <div className="mt-6 space-y-6">
          {preRTS && !showPostRTS ? (
            /* ── Pre-RTS View ── */
            <StaggerContainer className="space-y-4">
              {/* Current Step Panel */}
              <StaggerItem>
                <ContractingStepPanel
                  pipelineRecord={pipelineRecord}
                  stepCompletions={stepCompletions}
                  progress={progress}
                  onSubmitStep={handleSubmitStep}
                />
              </StaggerItem>

              {/* Writing Number Input — shown during In Contracting */}
              {currentStageKey === 'in_contracting' && (
                <StaggerItem>
                  <AgentWritingNumberInput
                    lobAssignments={lobAssignments}
                    wnSubmissions={wnSubmissions}
                    onSubmit={handleSubmitWN}
                  />
                </StaggerItem>
              )}

              {/* Tyler Test Card — shown in In Contracting with verified WN */}
              {currentStageKey === 'in_contracting' && hasVerifiedWN && (
                <StaggerItem>
                  <TylerTestCard
                    pipelineRecord={pipelineRecord}
                    stepCompletions={stepCompletions}
                    onSubmitStep={handleSubmitStep}
                  />
                </StaggerItem>
              )}

              {/* Pending WN submissions */}
              {pendingWNs.length > 0 && (
                <StaggerItem>
                  <Card className="border-amber-500/20 bg-amber-500/5">
                    <CardContent className="p-4 space-y-2">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-amber-400 mb-2">
                        Pending Review
                      </p>
                      {pendingWNs.map((sub) => (
                        <div key={sub.id} className="flex items-center gap-3 text-sm">
                          <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                          <span className="text-foreground font-medium">{sub.carrier}</span>
                          <span className="text-muted-foreground font-mono text-xs">{sub.writing_number}</span>
                          <span className="text-amber-400 text-xs ml-auto">Awaiting admin review</span>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                </StaggerItem>
              )}
            </StaggerContainer>
          ) : (
            /* ── Post-RTS View ── */
            <div className="space-y-4">
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
              <AgentCarrierManagement
                lobAssignments={lobAssignments}
                wnSubmissions={wnSubmissions}
                onRequestContracting={handleRequestContracting}
                onSubmitWritingNumber={handleSubmitWN}
              />
            </div>
          )}
        </div>
      </FadeIn>
    </div>
  );
}
