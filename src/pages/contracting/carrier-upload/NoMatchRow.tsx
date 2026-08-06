/**
 * NoMatchRow — Single unmatched carrier agent with tie/add-new/skip actions
 *
 * Shows the carrier agent details and lets the user:
 * - Tie to an existing agent via search
 * - Add as a new agent
 * - Skip (do nothing)
 */
import { useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  Link2,
  UserPlus,
  SkipForward,
} from 'lucide-react';
import type { AgentMatchResult, SupportedCarrier } from '@/lib/carrier-upload';
import type { NoMatchResolution } from './CarrierUploadReportPanel';
import { AgentSearchPicker } from './AgentSearchPicker';

interface Props {
  match: AgentMatchResult;
  carrier: SupportedCarrier;
  resolution: NoMatchResolution;
  onResolve: (res: NoMatchResolution) => void;
  supabase: SupabaseClient;
}

export function NoMatchRow({ match, resolution, onResolve, supabase }: Props) {
  const [showSearch, setShowSearch] = useState(false);
  const ca = match.carrier_agent;

  const isTied = resolution?.action === 'tie';
  const isAddNew = resolution?.action === 'add-new';
  const isSkipped = resolution?.action === 'skip';
  const resolved = resolution !== null;

  return (
    <div className={`px-6 py-3 ${resolved ? 'bg-secondary/5' : ''}`}>
      <div className="flex items-center justify-between gap-4">
        {/* Left: carrier agent info */}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground truncate">
            {ca.raw_name}
          </p>
          <div className="flex items-center gap-3 text-[10px] text-muted-foreground font-mono">
            <span>WN: {ca.carrier_writing_number}</span>
            <span>Status: {ca.status}</span>
            {ca.email && <span>{ca.email}</span>}
            {ca.agency_name && <span>Agency: {ca.agency_name}</span>}
            {ca.state && <span>State: {ca.state}</span>}
          </div>
        </div>

        {/* Right: action buttons */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Tie to existing */}
          <button
            onClick={() => setShowSearch(!showSearch)}
            title="Tie to existing agent"
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
              isTied
                ? 'bg-cyan-500/20 text-cyan-400 ring-1 ring-cyan-500/40'
                : 'text-muted-foreground hover:bg-cyan-500/10 hover:text-cyan-400'
            }`}
          >
            <Link2 className="w-3.5 h-3.5" />
            Tie
          </button>

          {/* Add as new */}
          <button
            onClick={() => onResolve(isAddNew ? null : { action: 'add-new' })}
            title="Add as new agent"
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
              isAddNew
                ? 'bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-500/40'
                : 'text-muted-foreground hover:bg-emerald-500/10 hover:text-emerald-400'
            }`}
          >
            <UserPlus className="w-3.5 h-3.5" />
            Add New
          </button>

          {/* Skip */}
          <button
            onClick={() => onResolve(isSkipped ? null : { action: 'skip' })}
            title="Skip — don't import"
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
              isSkipped
                ? 'bg-secondary/40 text-foreground/60 ring-1 ring-border'
                : 'text-muted-foreground hover:bg-secondary/30 hover:text-foreground/60'
            }`}
          >
            <SkipForward className="w-3.5 h-3.5" />
            Skip
          </button>
        </div>
      </div>

      {/* Agent search picker */}
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
          {isTied && (
            <span className="text-cyan-400">
              ⟶ Tied to {(resolution as { agentName: string }).agentName}
            </span>
          )}
          {isAddNew && (
            <span className="text-emerald-400">+ Will add as new agent</span>
          )}
          {isSkipped && (
            <span className="text-muted-foreground">— Skipped</span>
          )}
        </div>
      )}
    </div>
  );
}
