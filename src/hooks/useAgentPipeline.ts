/**
 * useAgentPipeline — fetch the logged-in agent's pipeline record,
 * stage steps, LOB assignments, and writing number submissions
 * from the portal DB (akhojh).
 *
 * Used by the agent contracting view to show progress, checklist,
 * and carrier management.
 */
import { useState, useEffect, useCallback } from 'react';
import { portalSupabase } from '@/lib/portal-supabase';
import { supabase } from '@/lib/supabase';
import { useEffectiveAuth } from '@/hooks/useEffectiveAuth';
import { useViewAsStore } from '@/store/view-as-store';
import type {
  PortalPipelineRecord,
  PortalPipelineStageStep,
  PortalLobAssignment,
  AgentPipelineStage,
} from '@/lib/contracting/types';

export type WritingNumberSubmission = {
  id: string;
  agent_id: string;
  carrier: string;
  writing_number: string | null;
  ai_extracted_number: string | null;
  source_image_url: string | null;
  submission_method: 'typed' | 'image';
  status: 'pending' | 'verified' | 'rejected';
  review_note: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
};

export type StepCompletion = {
  id: string;
  pipeline_id: string;
  step_id: string;
  completed_by: 'agent' | 'admin';
  status: 'pending_review' | 'approved' | 'declined';
  decline_reason: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * Agent-facing pipeline stages with clean display names.
 * Maps internal DB stages to what agents see.
 * CRM Setup removed per Charlie (2026-08-20).
 */
export const AGENT_STAGES: {
  key: AgentPipelineStage;
  label: string;
  agentCanComplete: boolean;
}[] = [
  { key: 'hip_broker', label: 'Intake', agentCanComplete: false }, // auto-completed on intake form submission
  { key: 'iaa', label: 'Agreement', agentCanComplete: true },
  { key: 'signed_iaa', label: 'Signed', agentCanComplete: true },
  { key: 'bill_com', label: 'Billing Setup', agentCanComplete: true },
  { key: 'in_contracting', label: 'In Contracting', agentCanComplete: true },
  { key: 'rts', label: 'RTS', agentCanComplete: false }, // auto-granted after Tyler test
];

/** Stages that are considered pre-RTS */
export const PRE_RTS_STAGES = new Set<AgentPipelineStage>([
  'hip_broker',
  'hip_career',
  'iaa',
  'signed_iaa',
  'bill_com',
  'crm',
  'in_contracting',
]);

/** Stages that are considered post-RTS (active) */
export const POST_RTS_STAGES = new Set<AgentPipelineStage>([
  'rts',
  'hip_broker_ready',
  'hip_career_ready',
  'actively_selling',
]);

/** Get the index of a stage in the agent-facing progression */
export function getStageIndex(stage: AgentPipelineStage): number {
  const idx = AGENT_STAGES.findIndex((s) => s.key === stage);
  // If stage not in agent-facing list, check if it's post-RTS
  if (idx === -1 && POST_RTS_STAGES.has(stage)) {
    return AGENT_STAGES.length - 1; // RTS position
  }
  return idx;
}

/** Check if agent is pre-RTS */
export function isPreRTS(stage: AgentPipelineStage): boolean {
  return PRE_RTS_STAGES.has(stage);
}

export interface AgentPipelineData {
  pipelineRecord: PortalPipelineRecord | null;
  stageSteps: PortalPipelineStageStep[];
  lobAssignments: PortalLobAssignment[];
  wnSubmissions: WritingNumberSubmission[];
  stepCompletions: StepCompletion[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  submitStepCompletion: (stepId: string) => Promise<boolean>;
  submitWritingNumber: (carrier: string, writingNumber: string) => Promise<boolean>;
  requestContracting: (carrier: string) => Promise<boolean>;
  /** Admin test-view: update the real pipeline record's stage */
  setStage: (stage: AgentPipelineStage) => Promise<void>;
  /** Admin test-view: full reset — wipes WN submissions, step completions, LOB assignments, resets to hip_broker */
  resetTestAgent: () => Promise<void>;
}

export function useAgentPipeline(): AgentPipelineData {
  const { profile, isViewingAs } = useEffectiveAuth();
  const viewAs = useViewAsStore();
  const [pipelineRecord, setPipelineRecord] = useState<PortalPipelineRecord | null>(null);
  const [stageSteps, setStageSteps] = useState<PortalPipelineStageStep[]>([]);
  const [lobAssignments, setLobAssignments] = useState<PortalLobAssignment[]>([]);
  const [wnSubmissions, setWnSubmissions] = useState<WritingNumberSubmission[]>([]);
  const [stepCompletions, setStepCompletions] = useState<StepCompletion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Resolve portal agent_id from profile NPN or email
  const resolveAgentId = useCallback(async (): Promise<string | null> => {
    if (!portalSupabase || !profile) return null;

    // Try NPN match first
    if (profile.npn) {
      const { data } = await portalSupabase
        .from('agent_intake')
        .select('agent_id')
        .eq('npn', profile.npn)
        .maybeSingle();
      if (data?.agent_id) return data.agent_id;
    }

    // Fall back to pipeline record match via writing_number
    if (profile.writing_number) {
      const { data } = await portalSupabase
        .from('agent_pipeline')
        .select('agent_id')
        .not('agent_id', 'is', null)
        .limit(1);
      // This is a fallback — ideally we'd have a direct link
      if (data?.[0]?.agent_id) return data[0].agent_id;
    }

    return null;
  }, [profile]);

  const fetchData = useCallback(async () => {
    if (!portalSupabase || !profile) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);

    try {
      // First, find the agent's pipeline record
      let agentId: string | null = null;
      let pipeline: PortalPipelineRecord | null = null;

      // In View As mode, use the View As agent ID directly — this is the
      // portal DB agent_id (e.g. Tester Mitchell), not the admin's profile.
      if (isViewingAs && viewAs.agentId) {
        agentId = viewAs.agentId;
        const { data } = await portalSupabase
          .from('agent_pipeline')
          .select('*')
          .eq('agent_id', agentId)
          .maybeSingle();
        pipeline = data as PortalPipelineRecord | null;
      }

      // Normal flow: try NPN match through agent_intake → agent_pipeline
      if (!pipeline && profile.npn) {
        const { data: intake } = await portalSupabase
          .from('agent_intake')
          .select('agent_id')
          .eq('npn', profile.npn)
          .maybeSingle();
        if (intake?.agent_id) {
          agentId = intake.agent_id;
          const { data } = await portalSupabase
            .from('agent_pipeline')
            .select('*')
            .eq('agent_id', agentId)
            .maybeSingle();
          pipeline = data as PortalPipelineRecord | null;
        }
      }

      // Fallback: try matching agent_pipeline.agent_id directly against
      // the profile ID. Handles cases where agent_intake doesn't exist
      // but pipeline record references the App DB profile ID.
      if (!pipeline && profile.id) {
        const { data } = await portalSupabase
          .from('agent_pipeline')
          .select('*')
          .eq('agent_id', profile.id)
          .maybeSingle();
        if (data) {
          pipeline = data as PortalPipelineRecord;
          agentId = profile.id;
        }
      }

      setPipelineRecord(pipeline);

      // Fetch stage steps (all stages — needed for progress display)
      const { data: steps } = await portalSupabase
        .from('agent_pipeline_stage_steps')
        .select('*')
        .eq('active', true)
        .order('display_order', { ascending: true });
      setStageSteps((steps as PortalPipelineStageStep[]) || []);

      // Fetch LOB assignments if we have an agent_id
      if (agentId) {
        const { data: lobs } = await portalSupabase
          .from('agent_lob_assignments')
          .select('*')
          .eq('agent_id', agentId)
          .order('carrier', { ascending: true });
        setLobAssignments((lobs as PortalLobAssignment[]) || []);

        // Fetch writing number submissions
        const { data: subs } = await portalSupabase
          .from('agent_writing_number_submissions')
          .select('*')
          .eq('agent_id', agentId)
          .order('created_at', { ascending: false });
        setWnSubmissions((subs as WritingNumberSubmission[]) || []);

        // Fetch step completions (agent-submitted)
        const { data: completions } = await portalSupabase
          .from('agent_step_completions')
          .select('*')
          .eq('pipeline_id', pipeline?.id ?? '')
          .order('created_at', { ascending: false });
        setStepCompletions((completions as StepCompletion[]) || []);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load pipeline data');
    } finally {
      setLoading(false);
    }
  }, [profile, resolveAgentId, isViewingAs, viewAs.agentId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  /**
   * Agent marks a step as complete — creates a pending_review record
   * that flags the admin pipeline view.
   */
  const submitStepCompletion = useCallback(
    async (stepId: string): Promise<boolean> => {
      if (!portalSupabase || !pipelineRecord) return false;
      try {
        const { data, error: e } = await portalSupabase
          .from('agent_step_completions')
          .insert({
            pipeline_id: pipelineRecord.id,
            step_id: stepId,
            completed_by: 'agent',
            status: 'pending_review',
          })
          .select()
          .maybeSingle();

        if (e) throw e;

        // Update the pipeline record to flag for admin review
        await portalSupabase
          .from('agent_pipeline')
          .update({
            agent_action_pending: true,
            agent_action_at: new Date().toISOString(),
          })
          .eq('id', pipelineRecord.id);

        if (data) {
          setStepCompletions((prev) => [data as StepCompletion, ...prev]);
        }

        // Also update the completed_steps map on the pipeline record
        // (marked as pending — admin will confirm)
        const updatedSteps = { ...pipelineRecord.completed_steps };
        updatedSteps[stepId] = `pending:${new Date().toISOString()}`;
        await portalSupabase
          .from('agent_pipeline')
          .update({ completed_steps: updatedSteps })
          .eq('id', pipelineRecord.id);

        setPipelineRecord((prev) =>
          prev ? { ...prev, completed_steps: updatedSteps, agent_action_pending: true } as PortalPipelineRecord : null
        );

        return true;
      } catch {
        return false;
      }
    },
    [pipelineRecord]
  );

  /**
   * Agent submits a writing number for a carrier.
   * Creates a pending submission for admin review.
   */
  const submitWritingNumber = useCallback(
    async (carrier: string, writingNumber: string): Promise<boolean> => {
      if (!portalSupabase || !pipelineRecord?.agent_id) return false;
      try {
        const { data, error: e } = await portalSupabase
          .from('agent_writing_number_submissions')
          .insert({
            agent_id: pipelineRecord.agent_id,
            carrier,
            writing_number: writingNumber.trim(),
            submission_method: 'typed',
            status: 'pending',
          })
          .select()
          .maybeSingle();

        if (e) throw e;

        // Flag pipeline for admin review
        const newCount = (pipelineRecord.wn_pending_count || 0) + 1;
        await portalSupabase
          .from('agent_pipeline')
          .update({
            wn_pending_review: true,
            wn_pending_count: newCount,
            agent_action_pending: true,
            agent_action_at: new Date().toISOString(),
          })
          .eq('id', pipelineRecord.id);

        if (data) {
          setWnSubmissions((prev) => [data as WritingNumberSubmission, ...prev]);
        }

        setPipelineRecord((prev) =>
          prev
            ? {
                ...prev,
                wn_pending_review: true,
                wn_pending_count: newCount,
                agent_action_pending: true,
              } as PortalPipelineRecord
            : null
        );

        return true;
      } catch {
        return false;
      }
    },
    [pipelineRecord]
  );

  /**
   * Post-RTS agent requests contracting with a new carrier.
   * Moves agent back to in_contracting with their earned status tag
   * and a carrier:XXX tag so admins can see what was requested.
   *
   * For agents without a pipeline record (majority of the base —
   * contracted before pipeline existed), creates a new record.
   */
  const requestContracting = useCallback(
    async (carrier: string): Promise<boolean> => {
      if (!portalSupabase) return false;
      const now = new Date().toISOString();
      const carrierTag = `carrier:${carrier}`;

      try {
        if (pipelineRecord) {
          // ── Existing pipeline record: update it ──
          const earnedTag = POST_RTS_STAGES.has(pipelineRecord.stage)
            ? pipelineRecord.stage === 'actively_selling'
              ? 'active_agent_request'
              : 'rts_agent_request'
            : 'rts_agent_request';

          const currentTags = pipelineRecord.tags || [];
          // Remove old status tags, keep existing carrier tags, add new ones
          const newTags = [
            ...currentTags.filter(
              (t) => t !== 'active_agent_request' && t !== 'rts_agent_request'
            ),
            earnedTag,
            // Add carrier tag if not already present
            ...(currentTags.includes(carrierTag) ? [] : [carrierTag]),
          ];

          const notes = pipelineRecord.notes
            ? `${pipelineRecord.notes}\n[${now}] Agent requested contracting with ${carrier}`
            : `[${now}] Agent requested contracting with ${carrier}`;

          await portalSupabase
            .from('agent_pipeline')
            .update({
              stage: 'in_contracting',
              stage_entered_at: now,
              tags: newTags,
              notes,
              agent_action_pending: true,
              agent_action_at: now,
              last_updated_by: 'agent',
              updated_by_source: 'contracting_portal',
            })
            .eq('id', pipelineRecord.id);
        } else {
          // ── No pipeline record: create one ──
          // This handles producing agents contracted before the pipeline existed.
          const agentName = profile?.full_name || 'Unknown Agent';

          const { error: insertErr } = await portalSupabase
            .from('agent_pipeline')
            .insert({
              ghl_opportunity_id: `agent_request_${Date.now()}`,
              stage: 'in_contracting' as AgentPipelineStage,
              agent_name: agentName,
              first_name: agentName.split(' ')[0] || null,
              last_name: agentName.split(' ').slice(1).join(' ') || null,
              email: null,
              phone: null,
              agency: null,
              tags: ['active_agent_request', carrierTag],
              custom_fields: {},
              completed_steps: {},
              stage_entered_at: now,
              last_updated_by: 'agent',
              updated_by_source: 'contracting_portal',
              ghl_sync_status: 'synced',
              notes: `[${now}] Agent requested contracting with ${carrier}`,
              agent_action_pending: true,
              agent_action_at: now,
              wn_pending_review: false,
              wn_pending_count: 0,
            });

          if (insertErr) throw insertErr;
        }

        // Refetch to get updated state
        await fetchData();
        return true;
      } catch {
        return false;
      }
    },
    [pipelineRecord, profile, fetchData]
  );

  /**
   * Admin test-view: update the real pipeline record's stage.
   * Used by the floating toolbar to walk Tester Mitchell through stages.
   */
  const setStage = useCallback(
    async (newStage: AgentPipelineStage): Promise<void> => {
      if (!portalSupabase || !pipelineRecord) return;
      const now = new Date().toISOString();
      await portalSupabase
        .from('agent_pipeline')
        .update({
          stage: newStage,
          stage_entered_at: now,
          updated_at: now,
          last_updated_by: 'admin_test',
          last_updated_by_display: 'Test View',
          updated_by_source: 'contracting_portal',
        })
        .eq('id', pipelineRecord.id);
      // Refetch to reflect new stage
      await fetchData();
    },
    [pipelineRecord, fetchData]
  );

  /**
   * Admin test-view: full reset of Tester Mitchell.
   * Wipes all accumulated test data so the test can be run
   * cleanly from scratch multiple times:
   * - Deletes all writing number submissions
   * - Deletes all step completions
   * - Deletes all LOB assignments
   * - Resets pipeline record to hip_broker with clean state
   * - Clears writing_number from App DB profile
   */
  const resetTestAgent = useCallback(
    async (): Promise<void> => {
      if (!portalSupabase || !pipelineRecord) return;
      const agentId = pipelineRecord.agent_id;
      const pipelineId = pipelineRecord.id;
      const now = new Date().toISOString();

      // 1. Delete all writing number submissions for this agent
      if (agentId) {
        await portalSupabase
          .from('agent_writing_number_submissions')
          .delete()
          .eq('agent_id', agentId);
      }

      // 2. Delete all step completions for this pipeline record
      await portalSupabase
        .from('agent_step_completions')
        .delete()
        .eq('pipeline_id', pipelineId);

      // 3. Delete all LOB assignments for this agent
      if (agentId) {
        await portalSupabase
          .from('agent_lob_assignments')
          .delete()
          .eq('agent_id', agentId);
      }

      // 4. Reset pipeline record to hip_broker with clean state
      await portalSupabase
        .from('agent_pipeline')
        .update({
          stage: 'hip_broker' as AgentPipelineStage,
          stage_entered_at: now,
          updated_at: now,
          completed_steps: {},
          tags: [],
          notes: `[${now}] Test agent reset to hip_broker (full data wipe)`,
          wn_pending_review: false,
          wn_pending_count: 0,
          agent_action_pending: false,
          agent_action_at: null,
          last_updated_by: 'admin_test',
          last_updated_by_display: 'Test View Reset',
          updated_by_source: 'contracting_portal',
        })
        .eq('id', pipelineId);

      // 5. Clear writing_number from App DB profile
      //    (WN is earned during in_contracting, shouldn't persist after reset)
      if (profile?.id && supabase) {
        await supabase
          .from('profiles')
          .update({ writing_number: null })
          .eq('id', profile.id);
      }

      // Clear local state
      setWnSubmissions([]);
      setStepCompletions([]);
      setLobAssignments([]);

      // Clear sessionStorage cache so stage hook re-resolves
      try {
        sessionStorage.removeItem('fym_agent_contracting_stage');
      } catch {
        // ignore
      }

      // Refetch everything
      await fetchData();
    },
    [pipelineRecord, profile, fetchData]
  );

  return {
    pipelineRecord,
    stageSteps,
    lobAssignments,
    wnSubmissions,
    stepCompletions,
    loading,
    error,
    refetch: fetchData,
    submitStepCompletion,
    submitWritingNumber,
    requestContracting,
    setStage,
    resetTestAgent,
  };
}
