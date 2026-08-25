/**
 * AgentCarrierManagement — post-RTS view for managing carrier
 * appointments, backfilling writing numbers, and requesting
 * additional contracting.
 *
 * Charlie (2026-08-20):
 * - Once RTS, contracting allows requesting additional carriers
 * - Allow agents to backfill writing numbers if they have them
 * - If agent backfills/requests contracting, they go back to
 *   In Contracting with their earned status tag (RTS or Active)
 * - All changes require admin approval
 */
import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import {
  CheckCircle2,
  Plus,
  PenLine,
  FileText,
  Loader2,
  AlertCircle,
  Shield,
} from 'lucide-react';
import { cn } from '@/lib/utils';
// HIP_CARRIERS import removed — carrier list is now inline (8-stage pipeline)
import type { PortalLobAssignment } from '@/lib/contracting/types';
import type { WritingNumberSubmission } from '@/hooks/useAgentPipeline';
import type { CarrierWritingNumber } from '@/hooks/useAgentRosterData';

/** All carriers agents might work with.
 * Charlie (2026-08-25): Manhattan, AHL, UNL, GTL, Heartland */
const ALL_CARRIERS = ['Manhattan', 'AHL', 'UNL', 'GTL', 'Heartland'] as const;

interface AgentCarrierManagementProps {
  lobAssignments: PortalLobAssignment[];
  wnSubmissions: WritingNumberSubmission[];
  onRequestContracting: (carrier: string) => Promise<boolean>;
  onSubmitWritingNumber: (carrier: string, writingNumber: string) => Promise<boolean>;
  /** Verified carriers from agency_rosters (for agents without pipeline records) */
  rosterCarriers?: CarrierWritingNumber[];
}

export function AgentCarrierManagement({
  lobAssignments,
  wnSubmissions,
  onRequestContracting,
  onSubmitWritingNumber,
  rosterCarriers = [],
}: AgentCarrierManagementProps) {
  const [activeAction, setActiveAction] = useState<{
    carrier: string;
    type: 'backfill' | 'request';
  } | null>(null);
  const [writingNumber, setWritingNumber] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Build a map of carrier → assignment status
  // Merge roster carriers (from agency_rosters) with LOB assignments (from portal)
  const carrierMap = new Map<
    string,
    {
      assignment: PortalLobAssignment | null;
      rosterWN: CarrierWritingNumber | null;
      pending: WritingNumberSubmission | null;
    }
  >();

  for (const c of ALL_CARRIERS) {
    const assignment = lobAssignments.find(
      (l) => l.carrier === c && l.verified
    );
    const rosterWN = rosterCarriers.find((r) => r.carrier === c) ?? null;
    const pending = wnSubmissions.find(
      (s) => s.carrier === c && s.status === 'pending'
    );
    carrierMap.set(c, { assignment: assignment ?? null, rosterWN, pending: pending ?? null });
  }

  const handleBackfill = async () => {
    if (!activeAction || !writingNumber.trim()) {
      setError('Please enter a writing number.');
      return;
    }
    setSubmitting(true);
    setError('');
    setSuccess('');

    const ok = await onSubmitWritingNumber(
      activeAction.carrier,
      writingNumber.trim()
    );
    if (ok) {
      setSuccess(`Writing number submitted for ${activeAction.carrier}. Awaiting admin review.`);
      setWritingNumber('');
      setActiveAction(null);
    } else {
      setError('Failed to submit. Please try again.');
    }
    setSubmitting(false);
  };

  const handleRequestContracting = async (carrier: string) => {
    setSubmitting(true);
    setError('');
    setSuccess('');

    const ok = await onRequestContracting(carrier);
    if (ok) {
      setSuccess(
        `Contracting requested for ${carrier}. You'll be moved to In Contracting while this is processed.`
      );
    } else {
      setError('Failed to request contracting. Please try again.');
    }
    setSubmitting(false);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 space-y-4">
          <p className="text-[11px] font-bold uppercase tracking-wider text-primary">My Carriers</p>
          <p className="text-sm text-muted-foreground">
            Manage your carrier appointments. Add writing numbers you already have,
            or request contracting with new carriers.
          </p>

          {/* Carrier list */}
          <div className="space-y-2">
            {ALL_CARRIERS.map((carrier) => {
              const { assignment, rosterWN, pending } = carrierMap.get(carrier) || {};
              const isVerified = !!assignment || !!rosterWN;
              const verifiedWN = assignment?.writing_number || rosterWN?.writing_number;

              return (
                <div
                  key={carrier}
                  className={cn(
                    'rounded-lg border p-4 transition-all',
                    isVerified
                      ? 'border-emerald-500/20 bg-emerald-500/5'
                      : pending
                        ? 'border-amber-500/20 bg-amber-500/5'
                        : 'border-border/30 bg-card'
                  )}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div
                        className={cn(
                          'w-10 h-10 rounded-full flex items-center justify-center',
                          isVerified
                            ? 'bg-emerald-500/20'
                            : pending
                              ? 'bg-amber-500/20'
                              : 'bg-muted/20'
                        )}
                      >
                        {isVerified ? (
                          <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                        ) : pending ? (
                          <Loader2 className="w-5 h-5 text-amber-400 animate-spin" />
                        ) : (
                          <FileText className="w-5 h-5 text-muted-foreground" />
                        )}
                      </div>
                      <div>
                        <p className="text-sm font-bold text-foreground">
                          {carrier}
                        </p>
                        {isVerified ? (
                          <p className="text-xs text-emerald-400 font-mono">
                            WN: {verifiedWN}
                          </p>
                        ) : pending ? (
                          <p className="text-xs text-amber-400">
                            Pending review · WN: {pending.writing_number}
                          </p>
                        ) : (
                          <p className="text-xs text-muted-foreground">
                            Not contracted — request below
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Action buttons */}
                    {!isVerified && !pending && (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            setActiveAction({ carrier, type: 'backfill' });
                            setWritingNumber('');
                            setError('');
                            setSuccess('');
                          }}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/20 text-primary text-xs font-semibold hover:bg-primary/20 transition-colors"
                        >
                          <PenLine className="w-3.5 h-3.5" />
                          Add WN
                        </button>
                        <button
                          onClick={() => handleRequestContracting(carrier)}
                          disabled={submitting}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-semibold hover:bg-amber-500/20 transition-colors disabled:opacity-50"
                        >
                          {submitting ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Plus className="w-3.5 h-3.5" />
                          )}
                          Request Contracting
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Inline backfill form */}
                  {activeAction?.carrier === carrier &&
                    activeAction.type === 'backfill' && (
                      <div className="mt-3 pt-3 border-t border-border/30 space-y-2">
                        <div className="flex gap-2">
                          <input
                            value={writingNumber}
                            onChange={(e) => {
                              setWritingNumber(e.target.value);
                              setError('');
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleBackfill();
                            }}
                            placeholder="Enter writing number"
                            className="flex-1 px-3 py-2 border border-border rounded-lg text-sm font-mono bg-card focus:ring-2 focus:ring-primary focus:border-transparent"
                            autoFocus
                          />
                          <button
                            onClick={handleBackfill}
                            disabled={submitting || !writingNumber.trim()}
                            className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary/80 transition-colors disabled:opacity-40 flex items-center gap-1.5"
                          >
                            {submitting ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : null}
                            Submit
                          </button>
                          <button
                            onClick={() => {
                              setActiveAction(null);
                              setWritingNumber('');
                              setError('');
                            }}
                            className="px-3 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:bg-background transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                        {error && (
                          <p className="text-xs text-red-400 flex items-center gap-1">
                            <AlertCircle className="w-3.5 h-3.5" />
                            {error}
                          </p>
                        )}
                      </div>
                    )}
                </div>
              );
            })}
          </div>

          {/* Success/error banners */}
          {success && (
            <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-sm text-emerald-400">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              {success}
            </div>
          )}
          {error && !activeAction && (
            <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          {/* Info note */}
          <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-muted/10 border border-border/20">
            <Shield className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
            <p className="text-xs text-muted-foreground">
              All writing number additions and contracting requests require admin
              approval. You'll be temporarily moved to "In Contracting" while new
              appointments are processed, then returned to your current status.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
