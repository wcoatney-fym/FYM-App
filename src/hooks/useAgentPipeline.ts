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
import { useEffectiveAuth } from '@/hooks/useEffectiveAuth';
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
}

export function useAgentPipeline(): AgentPipelineData {
  const { profile } = useEffectiveAuth();
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

    // Fall back to pipeline record email match
    const email = profile.full_name; // profile doesn't have email directly
    // Try the agent_pipeline table by matching on the profiles table writing_number
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
      // Try by NPN match through agent_intake → agent_pipeline
      let agentId: string | null = null;

      if (profile.npn) {
        const { data: intake } = await portalSupabase
          .from('agent_intake')
          .select('agent_id')
          .eq('npn', profile.npn)
          .maybeSingle();
        agentId = intake?.agent_id ?? null;
      }

      // If we found an agent_id, fetch their pipeline record
      let pipeline: PortalPipelineRecord | null = null;
      if (agentId) {
        const { data } = await portalSupabase
          .from('agent_pipeline')
          .select('*')
          .eq('agent_id', agentId)
          .maybeSingle();
        pipeline = data as PortalPipelineRecord | null;
      }

      // If no match by agent_id, try email match on pipeline
      if (!pipeline && profile.full_name) {
        // Fall back — search by email in agent_pipeline
        // This handles cases where agent_id isn't populated yet
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
  }, [profile, resolveAgentId]);

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
   * Moves agent back to in_contracting with their earned status tag.
   */
  const requestContracting = useCallback(
    async (carrier: string): Promise<boolean> => {
      if (!portalSupabase || !pipelineRecord) return false;
      try {
        // Determine the earned status tag based on current/previous stage
        const earnedTag = POST_RTS_STAGES.has(pipelineRecord.stage)
          ? pipelineRecord.stage === 'actively_selling'
            ? 'active_agent_request'
            : 'rts_agent_request'
          : 'rts_agent_request';

        // Update pipeline: move to in_contracting with tag
        const currentTags = pipelineRecord.tags || [];
        const newTags = [
          ...currentTags.filter(
            (t) => t !== 'active_agent_request' && t !== 'rts_agent_request'
          ),
          earnedTag,
        ];

        await portalSupabase
          .from('agent_pipeline')
          .update({
            stage: 'in_contracting',
            stage_entered_at: new Date().toISOString(),
            tags: newTags,
            agent_action_pending: true,
            agent_action_at: new Date().toISOString(),
            last_updated_by: 'agent',
            updated_by_source: 'contracting_portal',
          })
          .eq('id', pipelineRecord.id);

        // Create a contracting request note
        const notes = pipelineRecord.notes
          ? `${pipelineRecord.notes}\n[${new Date().toISOString()}] Agent requested contracting with ${carrier}`
          : `[${new Date().toISOString()}] Agent requested contracting with ${carrier}`;

        await portalSupabase
          .from('agent_pipeline')
          .update({ notes })
          .eq('id', pipelineRecord.id);

        // Refetch to get updated state
        await fetchData();
        return true;
      } catch {
        return false;
      }
    },
    [pipelineRecord, fetchData]
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
  };
}
