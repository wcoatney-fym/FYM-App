import { useEffect, useState } from 'react';
import { supabase, supabaseConfigured } from './tracker-supabase';

/**
 * Dashboard KPIs — retention sourced from Max's production DB via the
 * quality-metrics-direct edge function (direct Postgres → Akamai/Linode analytics DB).
 *
 * Edge fn response shape: { retention_90d: { drafted_first, retained, retention_pct },
 *   placement: [...], persistency: [...], _elapsed_ms, _source: "prod_direct" }
 *
 * Total policy count: from tracker DB count (form_submissions) — stays accurate
 * regardless of source, and we only need a scalar count (no row data).
 *
 * At-risk count: at_risk_activities in tracker DB — independent of source transition.
 *
 * Auth: quality-metrics-direct requires an admin session token for whole-book scope.
 * Supply via VITE_ADMIN_SESSION_TOKEN (build-time env). Without it we skip the edge fn
 * and show '—' for retention.
 */

export interface DashboardStats {
  /** 90-day retention % across whole book (billing-mode-aware, from Max's DB) */
  retentionPct: string;
  /** Persistency = same as retention for top-line display */
  persistencyPct: string;
  /** Total policies in tracker DB (scalar count — no row data fetched) */
  totalPolicies: number;
  /** Policies currently at-risk (from tracker at_risk_activities) */
  atRiskCount: number;
  loading: boolean;
  error: string | null;
  configured: boolean;
}

interface Retention90d {
  drafted_first?: number;
  retained?: number;
  retention_pct?: number | null;
}

interface QualityMetricsResponse {
  retention_90d?: Retention90d;
  _source?: string;
  _elapsed_ms?: number;
  error?: string;
}

async function fetchQualityMetrics(
  supabaseUrl: string,
  anonKey: string,
  adminToken: string,
): Promise<QualityMetricsResponse> {
  const fnUrl = `${supabaseUrl}/functions/v1/quality-metrics-direct`;
  const res = await fetch(fnUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${anonKey}`,
    },
    body: JSON.stringify({ token: adminToken }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`quality-metrics-direct ${res.status}: ${text}`);
  }
  return res.json() as Promise<QualityMetricsResponse>;
}

export function useDashboardStats(): DashboardStats {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  const adminToken = import.meta.env.VITE_ADMIN_SESSION_TOKEN as string | undefined;

  const edgeFnConfigured = Boolean(supabaseUrl && anonKey && adminToken);
  const isConfigured = supabaseConfigured || edgeFnConfigured;

  const [state, setState] = useState<DashboardStats>({
    retentionPct: '—',
    persistencyPct: '—',
    totalPolicies: 0,
    atRiskCount: 0,
    loading: isConfigured,
    error: null,
    configured: isConfigured,
  });

  useEffect(() => {
    if (!isConfigured) return;
    let cancelled = false;

    (async () => {
      try {
        // 1. Retention % from Max's DB via edge fn (whole-book, no agency filter)
        let retentionPct = '—';

        if (edgeFnConfigured) {
          const qm = await fetchQualityMetrics(supabaseUrl!, anonKey!, adminToken!);
          if (qm.error) throw new Error(qm.error);
          const pct = qm.retention_90d?.retention_pct;
          retentionPct = pct != null ? `${pct}%` : '—';
        }

        // 2. Total policy count from tracker DB (count only — no row data, no pagination needed)
        let totalPolicies = 0;
        if (supabase) {
          const { count, error: countErr } = await supabase
            .from('form_submissions')
            .select('*', { count: 'exact', head: true });
          if (countErr) throw countErr;
          totalPolicies = count ?? 0;
        }

        // 3. At-risk count from tracker DB
        let atRiskCount = 0;
        if (supabase) {
          const { count, error: arErr } = await supabase
            .from('at_risk_activities')
            .select('*', { count: 'exact', head: true });
          if (arErr) throw arErr;
          atRiskCount = count ?? 0;
        }

        if (!cancelled) {
          setState({
            retentionPct,
            persistencyPct: retentionPct,
            totalPolicies,
            atRiskCount,
            loading: false,
            error: null,
            configured: true,
          });
        }
      } catch (e) {
        if (!cancelled) {
          setState((prev) => ({
            ...prev,
            loading: false,
            error: e instanceof Error ? e.message : 'Failed to load stats',
            configured: true,
          }));
        }
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return state;
}
