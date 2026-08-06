/**
 * FuzzyMatchRow — Single fuzzy match with approve/reject/tie actions
 *
 * Shows the carrier agent name, the suggested portal match with confidence %,
 * and action buttons. User can approve the suggestion, reject it, or tie
 * to a different agent via search.
 */
import { useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  Check,
  X,
  Link2,
  ChevronUp,
} from 'lucide-react';
import type { AgentMatchResult } from '@/lib/carrier-upload';
import type { FuzzyResolution } from './CarrierUploadReportPanel';
import { AgentSearchPicker } from './AgentSearchPicker';

interface Props {
  match: AgentMatchResult;
  resolution: FuzzyResolution;
  onResolve: (res: FuzzyResolution) => void;
  supabase: SupabaseClient;
}

export function FuzzyMatchRow({ match, resolution, onResolve, supabase }: Props) {
  const [showSearch, setShowSearch] = useState(false);
  const ca = match.carrier_agent;

  const confidenceColor =
    (match.confidence ?? 0) >= 80
      ? 'text-emerald-400'
      : (match.confidence ?? 0) >= 70
        ? 'text-amber-400'
        : 'text-orange-400';

  const isApproved = resolution?.action === 'approve';
  const isRejected = resolution?.action === 'reject';
  const isTied = resolution?.action === 'tie';
  const resolved = resolution !== null;

  return (
    <div className={`px-6 py-3 ${resolved ? 'bg-secondary/5' : ''}`}>
      <div className="flex items-center justify-between gap-4">
        {/* Left: carrier agent → suggested match */}
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground truncate">
              {ca.raw_name}
            </p>
            <p className="text-[10px] text-muted-foreground font-mono">
              WN: {ca.carrier_writing_number} · {ca.status}
              {ca.agency_name && ` · ${ca.agency_name}`}
            </p>
          </div>
          <span className="text-muted-foreground text-xs">→</span>
          <div className="min-w-0">
            <p className="text-sm text-foreground/80 truncate">
              {isTied
                ? (resolution as { agentName: string }).agentName
                : match.matched_agent_name}
            </p>
            <p className={`text-[10px] font-semibold ${confidenceColor}`}>
              {isTied ? 'Manual tie' : `${match.confidence}% match`}
            </p>
          </div>
        </div>

        {/* Right: action buttons */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Approve */}
          <button
            onClick={() => onResolve(isApproved ? null : { action: 'approve' })}
            title="Approve this match"
            className={`p-1.5 rounded-md transition-colors ${
              isApproved
                ? 'bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-500/40'
                : 'text-muted-foreground hover:bg-emerald-500/10 hover:text-emerald-400'
            }`}
          >
            <Check className="w-4 h-4" />
          </button>

          {/* Reject */}
          <button
            onClick={() => onResolve(isRejected ? null : { action: 'reject' })}
            title="Reject this match"
            className={`p-1.5 rounded-md transition-colors ${
              isRejected
                ? 'bg-red-500/20 text-red-400 ring-1 ring-red-500/40'
                : 'text-muted-foreground hover:bg-red-500/10 hover:text-red-400'
            }`}
          >
            <X className="w-4 h-4" />
          </button>

          {/* Tie to different agent */}
          <button
            onClick={() => setShowSearch(!showSearch)}
            title="Tie to a different agent"
            className={`p-1.5 rounded-md transition-colors ${
              isTied
                ? 'bg-cyan-500/20 text-cyan-400 ring-1 ring-cyan-500/40'
                : 'text-muted-foreground hover:bg-cyan-500/10 hover:text-cyan-400'
            }`}
          >
            <Link2 className="w-4 h-4" />
          </button>

          {/* Expand/collapse search */}
          {showSearch && (
            <button
              onClick={() => setShowSearch(false)}
              className="p-1.5 rounded-md text-muted-foreground hover:bg-secondary/30"
            >
              <ChevronUp className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* Agent search picker — expanded when "tie" is clicked */}
      {showSearch && (
        <div className="mt-3 pl-4 border-l-2 border-cyan-500/30">
          <AgentSearchPicker
            supabase={supabase}
            onSelect={(agentId, agentName) => {
              onResolve({ action: 'tie', agentId, agentName });
              setShowSearch(false);
            }}
            onCancel={() => setShowSearch(false)}
          />
        </div>
      )}

      {/* Resolution indicator */}
      {resolved && !showSearch && (
        <div className="mt-1 text-[10px] font-semibold">
          {isApproved && <span className="text-emerald-400">✓ Will approve match</span>}
          {isRejected && <span className="text-red-400">✗ Will skip</span>}
          {isTied && (
            <span className="text-cyan-400">
              ⟶ Tied to {(resolution as { agentName: string }).agentName}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
