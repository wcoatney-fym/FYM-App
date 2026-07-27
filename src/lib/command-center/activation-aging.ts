export interface ActivationTask { agencyName: string; category: string; }
export interface ActivationRunResult { ran: boolean; tasks: ActivationTask[]; upserted: number; reason?: string; }
export async function runActivationAging(): Promise<ActivationRunResult> {
  return { ran: false, tasks: [], upserted: 0, reason: 'Not yet configured in FYM App' };
}
