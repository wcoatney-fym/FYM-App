/**
 * DashboardErrorBanner — Shown when edge function fetch fails.
 *
 * Section 2 of UX audit: users must know when data is stale or failed.
 * Includes a retry button that triggers OrgDataCache.refresh().
 */
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface DashboardErrorBannerProps {
  error: string;
  onRetry: () => void;
}

export function DashboardErrorBanner({ error, onRetry }: DashboardErrorBannerProps) {
  return (
    <div
      className="rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-3 flex items-center justify-between gap-3"
      role="alert"
    >
      <div className="flex items-center gap-3 min-w-0">
        <AlertTriangle size={18} className="text-red-400 shrink-0" />
        <div className="min-w-0">
          <p className="text-sm font-medium text-red-300">
            Failed to load dashboard data
          </p>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">
            {error}
          </p>
        </div>
      </div>
      <button
        onClick={onRetry}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors shrink-0"
        aria-label="Retry loading dashboard data"
      >
        <RefreshCw size={12} />
        Retry
      </button>
    </div>
  );
}
