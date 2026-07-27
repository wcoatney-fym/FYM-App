export interface ReconIssue { agencyName: string; category: string; }
export interface ReconRunResult { ran: boolean; issues: ReconIssue[]; persisted: number; reason?: string; }
export async function runReconciliation(): Promise<ReconRunResult> {
  return { ran: false, issues: [], persisted: 0, reason: 'Not yet configured in FYM App' };
}
