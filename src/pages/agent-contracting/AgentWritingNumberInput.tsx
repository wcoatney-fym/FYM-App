/**
 * AgentWritingNumberInput — agent inputs writing numbers per carrier
 * during the In Contracting stage.
 *
 * Charlie (2026-08-20): Agent can input their own writing numbers
 * when in the In Contracting step. Upon inputting even a single
 * writing number and it being confirmed on the admin side,
 * a "Test out with Tyler" option is shown.
 */
import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import {
  PenLine,
  Plus,
  Loader2,
  CheckCircle2,
  Clock,
  XCircle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { cn } from '@/lib/utils';
// HIP_CARRIERS import removed — carrier list is now inline (8-stage pipeline)
import type { PortalLobAssignment } from '@/lib/contracting/types';
import type { WritingNumberSubmission } from '@/hooks/useAgentPipeline';

/** All carriers an agent might need writing numbers for.
 * Charlie (2026-08-25): Manhattan, AHL, UNL, GTL */
const ALL_CARRIERS = ['Manhattan', 'AHL', 'UNL', 'GTL'] as const;

interface AgentWritingNumberInputProps {
  lobAssignments: PortalLobAssignment[];
  wnSubmissions: WritingNumberSubmission[];
  onSubmit: (carrier: string, writingNumber: string) => Promise<boolean>;
}

export function AgentWritingNumberInput({
  lobAssignments,
  wnSubmissions,
  onSubmit,
}: AgentWritingNumberInputProps) {
  const [showForm, setShowForm] = useState(false);
  const [carrier, setCarrier] = useState<string>(ALL_CARRIERS[0]);
  const [writingNumber, setWritingNumber] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [historyExpanded, setHistoryExpanded] = useState(false);

  // Carriers that already have verified writing numbers
  const verifiedCarriers = new Set(
    lobAssignments.filter((l) => l.verified).map((l) => l.carrier)
  );

  // Carriers with pending submissions
  const pendingCarriers = new Set(
    wnSubmissions.filter((s) => s.status === 'pending').map((s) => s.carrier)
  );

  // Available carriers to submit for (not already verified or pending)
  const availableCarriers = ALL_CARRIERS.filter(
    (c) => !verifiedCarriers.has(c)
  );

  const handleSubmit = async () => {
    if (!writingNumber.trim()) {
      setError('Please enter a writing number.');
      return;
    }
    setSubmitting(true);
    setError('');
    setSuccess(false);

    const ok = await onSubmit(carrier, writingNumber.trim());
    if (ok) {
      setSuccess(true);
      setWritingNumber('');
      setTimeout(() => setSuccess(false), 3000);
    } else {
      setError('Failed to submit. Please try again.');
    }
    setSubmitting(false);
  };

  return (
    <Card>
      <CardContent className="p-4 space-y-4">
        <p className="text-[11px] font-bold uppercase tracking-wider text-primary">Writing Numbers</p>
        <p className="text-sm text-muted-foreground">
          Enter your writing numbers for each carrier. Each submission will be
          verified by the admin team.
        </p>

        {/* Verified writing numbers */}
        {lobAssignments.filter((l) => l.verified).length > 0 && (
          <div className="space-y-1.5">
            <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-400">
              Verified
            </p>
            {lobAssignments
              .filter((l) => l.verified)
              .map((lob) => (
                <div
                  key={lob.id}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-500/5 border border-emerald-500/20 text-sm"
                >
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                  <span className="font-medium text-foreground">
                    {lob.carrier}
                  </span>
                  <span className="font-mono text-xs text-muted-foreground">
                    {lob.writing_number}
                  </span>
                  <span className="text-emerald-400 text-[10px] ml-auto">
                    ✓ Verified
                  </span>
                </div>
              ))}
          </div>
        )}

        {/* Pending submissions */}
        {wnSubmissions.filter((s) => s.status === 'pending').length > 0 && (
          <div className="space-y-1.5">
            <p className="text-[11px] font-bold uppercase tracking-wider text-amber-400">
              Pending Review
            </p>
            {wnSubmissions
              .filter((s) => s.status === 'pending')
              .map((sub) => (
                <div
                  key={sub.id}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/5 border border-amber-500/20 text-sm"
                >
                  <Clock className="w-4 h-4 text-amber-400 flex-shrink-0" />
                  <span className="font-medium text-foreground">
                    {sub.carrier}
                  </span>
                  <span className="font-mono text-xs text-muted-foreground">
                    {sub.writing_number}
                  </span>
                  <span className="text-amber-400 text-[10px] ml-auto">
                    Awaiting review
                  </span>
                </div>
              ))}
          </div>
        )}

        {/* Submit new writing number */}
        {availableCarriers.length > 0 && (
          <>
            {!showForm ? (
              <button
                onClick={() => setShowForm(true)}
                className="flex items-center gap-2 w-full px-4 py-3 rounded-lg border border-dashed border-primary/30 text-primary text-sm font-medium hover:bg-primary/5 hover:border-primary/50 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Add Writing Number
              </button>
            ) : (
              <div className="space-y-3 p-4 rounded-lg border border-border/30 bg-card">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
                    Carrier
                  </label>
                  <select
                    value={carrier}
                    onChange={(e) => setCarrier(e.target.value)}
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-card focus:ring-2 focus:ring-primary focus:border-transparent"
                  >
                    {availableCarriers.map((c) => (
                      <option key={c} value={c}>
                        {c}
                        {pendingCarriers.has(c) ? ' (pending)' : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
                    Writing Number
                  </label>
                  <input
                    value={writingNumber}
                    onChange={(e) => {
                      setWritingNumber(e.target.value);
                      setError('');
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSubmit();
                    }}
                    placeholder="e.g. 12345678"
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm font-mono bg-card focus:ring-2 focus:ring-primary focus:border-transparent"
                  />
                </div>

                {error && (
                  <p className="text-xs text-red-400">{error}</p>
                )}
                {success && (
                  <p className="text-xs text-emerald-400 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Submitted for review!
                  </p>
                )}

                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setShowForm(false);
                      setWritingNumber('');
                      setError('');
                    }}
                    className="flex-1 py-2 rounded-lg border border-border text-sm font-medium text-muted-foreground hover:bg-background transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSubmit}
                    disabled={submitting || !writingNumber.trim()}
                    className="flex-1 py-2 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary/80 transition-colors disabled:opacity-40 flex items-center justify-center gap-1.5"
                  >
                    {submitting ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <PenLine className="w-4 h-4" />
                    )}
                    Submit
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {/* Submission history toggle */}
        {wnSubmissions.filter((s) => s.status !== 'pending').length > 0 && (
          <div>
            <button
              onClick={() => setHistoryExpanded((v) => !v)}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {historyExpanded ? (
                <ChevronUp className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
              Submission History
            </button>
            {historyExpanded && (
              <div className="mt-2 space-y-1.5">
                {wnSubmissions
                  .filter((s) => s.status !== 'pending')
                  .map((sub) => (
                    <div
                      key={sub.id}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg bg-card border border-border/30 text-xs"
                    >
                      {sub.status === 'verified' ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <XCircle className="w-3.5 h-3.5 text-red-400" />
                      )}
                      <span className="font-medium">{sub.carrier}</span>
                      <span className="font-mono text-muted-foreground">
                        {sub.writing_number}
                      </span>
                      <span
                        className={cn(
                          'ml-auto font-semibold',
                          sub.status === 'verified'
                            ? 'text-emerald-400'
                            : 'text-red-400'
                        )}
                      >
                        {sub.status === 'verified' ? 'Verified' : 'Rejected'}
                      </span>
                    </div>
                  ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
