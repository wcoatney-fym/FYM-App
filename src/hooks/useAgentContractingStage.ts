/**
 * useAgentContractingStage — lightweight hook that checks if the
 * current agent is pre-RTS or post-RTS.
 *
 * Used by Sidebar to conditionally show the pre-RTS or full agent nav.
 * Caches the result in sessionStorage to avoid portal DB hits on every render.
 */
import { useState, useEffect } from 'react';
import { portalSupabase } from '@/lib/portal-supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useEffectiveAuth } from '@/hooks/useEffectiveAuth';
import { useViewAsStore } from '@/store/view-as-store';
import { PRE_RTS_STAGES } from '@/hooks/useAgentPipeline';
import type { AgentPipelineStage } from '@/lib/contracting/types';

const CACHE_KEY = 'fym_agent_contracting_stage';
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface CachedStage {
  stage: AgentPipelineStage | null;
  ts: number;
}

interface AgentContractingStageResult {
  stage: AgentPipelineStage | null;
  isPreRTS: boolean;
  loading: boolean;
}

export function useAgentContractingStage(): AgentContractingStageResult {
  const { profile } = useAuth();
  const { effectiveRole, isViewingAs } = useEffectiveAuth();
  const viewAs = useViewAsStore();
  const [stage, setStage] = useState<AgentPipelineStage | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Only fetch for agents (or admins viewing as agent)
    if (effectiveRole !== 'agent' || !profile) {
      setLoading(false);
      return;
    }

    // Skip cache in View As mode — always fetch fresh
    if (!isViewingAs) {
      try {
        const cached = sessionStorage.getItem(CACHE_KEY);
        if (cached) {
          const parsed: CachedStage = JSON.parse(cached);
          if (Date.now() - parsed.ts < CACHE_TTL_MS) {
            setStage(parsed.stage);
            setLoading(false);
            return;
          }
        }
      } catch {
        // Ignore parse errors
      }
    }

    // Fetch from portal DB
    async function fetchStage() {
      if (!portalSupabase) {
        setLoading(false);
        return;
      }

      try {
        let pipeline: { stage: string } | null = null;

        // In View As mode, use the View As agent ID directly
        if (isViewingAs && viewAs.agentId) {
          const { data } = await portalSupabase
            .from('agent_pipeline')
            .select('stage')
            .eq('agent_id', viewAs.agentId)
            .maybeSingle();
          pipeline = data;
        }

        // Normal flow: resolve agent_id from NPN via agent_intake
        if (!pipeline && profile?.npn) {
          const { data: intake } = await portalSupabase
            .from('agent_intake')
            .select('agent_id')
            .eq('npn', profile.npn)
            .maybeSingle();

          let agentId = intake?.agent_id ?? null;

          if (agentId) {
            const { data } = await portalSupabase
              .from('agent_pipeline')
              .select('stage')
              .eq('agent_id', agentId)
              .maybeSingle();
            pipeline = data;
          }

          // Fallback: try matching agent_pipeline.agent_id against profile ID
          if (!pipeline && profile.id) {
            const { data } = await portalSupabase
              .from('agent_pipeline')
              .select('stage')
              .eq('agent_id', profile.id)
              .maybeSingle();
            if (data) {
              pipeline = data;
            }
          }
        }

        if (!pipeline?.stage) {
          // No pipeline record — if in View As mode, don't infer actively_selling
          // from the admin's writing number
          if (!isViewingAs && profile?.writing_number) {
            setStage('actively_selling');
            cacheStage('actively_selling');
          } else {
            setStage(null);
            cacheStage(null);
          }
          setLoading(false);
          return;
        }

        const s = (pipeline.stage as AgentPipelineStage) ?? null;
        setStage(s);
        cacheStage(s);
      } catch {
        // On error, don't block — assume post-RTS to show full nav
        setStage('rts');
      } finally {
        setLoading(false);
      }
    }

    fetchStage();
  }, [effectiveRole, profile, isViewingAs, viewAs.agentId]);

  function cacheStage(s: AgentPipelineStage | null) {
    try {
      sessionStorage.setItem(
        CACHE_KEY,
        JSON.stringify({ stage: s, ts: Date.now() })
      );
    } catch {
      // Ignore storage errors
    }
  }

  const isPreRTS =
    effectiveRole === 'agent' &&
    (stage === null || PRE_RTS_STAGES.has(stage));

  return { stage, isPreRTS, loading };
}
