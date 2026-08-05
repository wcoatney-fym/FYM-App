/**
 * risk-utils.ts — Shared at-risk / urgency helpers
 *
 * Single source of truth for urgency classification across
 * AgentDashboardPage, AttentionCard, NotificationPanel, etc.
 */

export type UrgencySeverity = 'danger' | 'warning';

export interface UrgencyInfo {
  label: string;
  severity: UrgencySeverity;
}

/**
 * Classify an at-risk policy's urgency from its flag type and days idle.
 *
 * Returns a human-readable label and a danger/warning severity.
 * Used by AgentDashboardPage's "Needs Attention" cards and anywhere
 * else that needs a one-line urgency summary.
 */
export function urgencyLabel(
  flagType: string | null,
  daysIdle: number | null,
): UrgencyInfo {
  const days = daysIdle ?? 0;

  if (days >= 38) return { label: `Final 7 days · Day ${days}/45`, severity: 'danger' };
  if (days >= 30) return { label: `Critical · Day ${days}/45`, severity: 'danger' };

  const ft = (flagType || '').toLowerCase();
  if (ft === 'future_term' || ft === 'future term') {
    return { label: `Future Term · Day ${days}/45`, severity: 'danger' };
  }
  if (ft === 'pended') return { label: `Pended · ${days} days`, severity: 'warning' };
  if (ft === 'suspended') return { label: `Suspended · ${days} days`, severity: 'warning' };

  return { label: `At Risk · ${days} days`, severity: 'warning' };
}
