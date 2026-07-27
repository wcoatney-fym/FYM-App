/**
 * engine-run.ts — unified Command Center task engine runner.
 *
 * Fires all task-generation pipelines in parallel and returns a consolidated
 * summary. Call this on app init or on a manual "refresh" trigger.
 *
 * Current pipelines:
 *   1. reconciliation — detects intake ⇄ production drift (carrier mismatch, etc.)
 *   2. activation-aging — flags agencies stuck post-onboarding or on CSR bottleneck
 */
import { runReconciliation, type ReconRunResult } from './reconciliation-run';
import { runActivationAging, type ActivationRunResult } from './activation-aging';

export interface EngineRunResult {
  reconciliation: ReconRunResult;
  activation: ActivationRunResult;
  totalUpserted: number;
  ranAt: string;
}

export async function runAllEngines(): Promise<EngineRunResult> {
  const [reconciliation, activation] = await Promise.all([
    runReconciliation().catch((e): ReconRunResult => ({
      ran: false, issues: [], persisted: 0, reason: (e as Error).message,
    })),
    runActivationAging().catch((e): ActivationRunResult => ({
      ran: false, tasks: [], upserted: 0, reason: (e as Error).message,
    })),
  ]);

  return {
    reconciliation,
    activation,
    totalUpserted: (reconciliation.persisted ?? 0) + (activation.upserted ?? 0),
    ranAt: new Date().toISOString(),
  };
}
