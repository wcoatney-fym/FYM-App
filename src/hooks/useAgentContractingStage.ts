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
  const { effectiveRole } = useEffectiveAuth();
  const [stage, setStage] = useState<AgentPipelineStage | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Only fetch for agents
    if (effectiveRole !== 'agent' || !profile) {
      setLoading(false);
      return;
    }

    // Check sessionStorage cache first
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

    // Fetch from portal DB
    async function fetchStage() {
      if (!portalSupabase || !profile?.npn) {
        setLoading(false);
        return;
      }

      try {
        // Resolve agent_id from NPN via agent_intake
        const { data: intake } = await portalSupabase
          .from('agent_intake')
          .select('agent_id')
          .eq('npn', profile.npn)
          .maybeSingle();

        if (!intake?.agent_id) {
          // No pipeline record — treat as pre-RTS (new agent)
          setStage(null);
          cacheStage(null);
          setLoading(false);
          return;
        }

        // Get pipeline stage
        const { data: pipeline } = await portalSupabase
          .from('agent_pipeline')
          .select('stage')
          .eq('agent_id', intake.agent_id)
          .maybeSingle();

        const s = (pipeline?.stage as AgentPipelineStage) ?? null;
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
  }, [effectiveRole, profile]);

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
