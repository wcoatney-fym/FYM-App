/**
 * WritingNumberScreenshotUpload — agent uploads a screenshot of their
 * writing number for a carrier. Admin reviews and manually enters the WN.
 *
 * Charlie (2026-08-28): Screenshot upload is the PRIMARY method for all
 * contracting flows. Manual code entry removed from waiting_for_numbers
 * and in_contracting stages. Manual entry option available ONLY in
 * additional contracting (active agents requesting new carrier).
 *
 * Directions tell agents to screenshot their writing number from the
 * carrier's email.
 *
 * Uses Supabase Storage (portal DB bucket: 'wn-screenshots').
 */
import { useState, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import {
  Camera,
  Upload,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Image as ImageIcon,
  X,
  PenLine,
  Clock,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { portalSupabase } from '@/lib/portal-supabase';
import type { WritingNumberSubmission } from '@/hooks/useAgentPipeline';

/** All carriers an agent might upload screenshots for */
const UPLOAD_CARRIERS = ['Manhattan', 'AHL', 'UNL', 'GTL', 'Heartland'] as const;

interface WritingNumberScreenshotUploadProps {
  agentId: string | null;
  wnSubmissions: WritingNumberSubmission[];
  onUploadComplete: () => Promise<void>;
  /** Allow manual writing number entry — only true for additional contracting */
  allowManualEntry?: boolean;
  /** Handler for manual WN submission (carrier, writingNumber) */
  onSubmitManual?: (carrier: string, writingNumber: string) => Promise<boolean>;
}

export function WritingNumberScreenshotUpload({
  agentId,
  wnSubmissions,
  onUploadComplete,
  allowManualEntry = false,
  onSubmitManual,
}: WritingNumberScreenshotUploadProps) {
  // Screenshot upload state
  const [showUpload, setShowUpload] = useState(false);
  const [carrier, setCarrier] = useState<string>(UPLOAD_CARRIERS[0]);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  // Manual entry state (additional contracting only)
  const [showManual, setShowManual] = useState(false);
  const [manualCarrier, setManualCarrier] = useState<string>(UPLOAD_CARRIERS[0]);
  const [manualWN, setManualWN] = useState('');
  const [manualSubmitting, setManualSubmitting] = useState(false);
  const [manualSuccess, setManualSuccess] = useState(false);
  const [manualError, setManualError] = useState('');

  // History toggle
  const [historyExpanded, setHistoryExpanded] = useState(false);

  // Carriers that already have a pending image submission
  const pendingImageCarriers = new Set(
    wnSubmissions
      .filter((s) => s.status === 'pending' && s.submission_method === 'image')
      .map((s) => s.carrier),
  );

  // Carriers with pending manual submissions
  const pendingManualCarriers = new Set(
    wnSubmissions
      .filter((s) => s.status === 'pending' && s.submission_method === 'typed')
      .map((s) => s.carrier),
  );

  // All pending submissions
  const allPending = wnSubmissions.filter((s) => s.status === 'pending');
  const resolvedSubs = wnSubmissions.filter((s) => s.status !== 'pending');

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;

    if (!f.type.startsWith('image/')) {
      setError('Please upload an image file (PNG, JPG, etc.)');
      return;
    }
    if (f.size > 5 * 1024 * 1024) {
      setError('Image must be under 5MB');
      return;
    }

    setFile(f);
    setError('');

    const reader = new FileReader();
    reader.onload = () => setPreview(reader.result as string);
    reader.readAsDataURL(f);
  };

  const handleUpload = async () => {
    if (!portalSupabase || !agentId || !file) return;
    setUploading(true);
    setError('');

    try {
      const ext = file.name.split('.').pop() || 'png';
      const path = `${agentId}/${carrier}_${Date.now()}.${ext}`;

      const { error: uploadErr } = await portalSupabase.storage
        .from('wn-screenshots')
        .upload(path, file, {
          contentType: file.type,
          upsert: false,
        });

      if (uploadErr) {
        if (uploadErr.message?.includes('not found') || uploadErr.message?.includes('Bucket')) {
          setError('Storage bucket not configured yet. Contact admin.');
        } else {
          throw uploadErr;
        }
        setUploading(false);
        return;
      }

      const { data: urlData } = portalSupabase.storage
        .from('wn-screenshots')
        .getPublicUrl(path);

      const publicUrl = urlData?.publicUrl || path;

      const { error: insertErr } = await portalSupabase
        .from('agent_writing_number_submissions')
        .insert({
          agent_id: agentId,
          carrier,
          writing_number: null,
          source_image_url: publicUrl,
          submission_method: 'image',
          status: 'pending',
        });

      if (insertErr) throw insertErr;

      setSuccess(true);
      setFile(null);
      setPreview(null);
      setShowUpload(false);
      await onUploadComplete();
      setTimeout(() => setSuccess(false), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleManualSubmit = async () => {
    if (!onSubmitManual || !manualWN.trim()) {
      setManualError('Please enter a writing number.');
      return;
    }
    setManualSubmitting(true);
    setManualError('');
    setManualSuccess(false);

    const ok = await onSubmitManual(manualCarrier, manualWN.trim());
    if (ok) {
      setManualSuccess(true);
      setManualWN('');
      setShowManual(false);
      setTimeout(() => setManualSuccess(false), 3000);
    } else {
      setManualError('Failed to submit. Please try again.');
    }
    setManualSubmitting(false);
  };

  const clearFile = () => {
    setFile(null);
    setPreview(null);
    setError('');
    if (fileRef.current) fileRef.current.value = '';
  };

  if (!agentId) return null;

  return (
    <Card>
      <CardContent className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-bold uppercase tracking-wider text-primary">
            Writing Numbers
          </p>
          {(success || manualSuccess) && (
            <span className="text-xs text-emerald-400 flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" /> Submitted!
            </span>
          )}
        </div>

        {/* Directions */}
        <div className="rounded-lg bg-primary/5 border border-primary/20 px-3 py-2.5">
          <p className="text-sm text-foreground font-medium mb-1">
            How to submit your writing number:
          </p>
          <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
            <li>Find the email from the carrier confirming your writing number</li>
            <li>Take a screenshot showing your writing number clearly</li>
            <li>Upload the screenshot below for the correct carrier</li>
            <li>An admin will review and enter your number</li>
          </ol>
        </div>

        {/* Pending submissions (both image and manual) */}
        {allPending.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-[11px] font-bold uppercase tracking-wider text-amber-400">
              Pending Review
            </p>
            {allPending.map((sub) => (
              <div
                key={sub.id}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/5 border border-amber-500/20 text-sm"
              >
                {sub.submission_method === 'image' ? (
                  <ImageIcon className="w-4 h-4 text-amber-400 flex-shrink-0" />
                ) : (
                  <PenLine className="w-4 h-4 text-amber-400 flex-shrink-0" />
                )}
                <span className="font-medium text-foreground">{sub.carrier}</span>
                {sub.submission_method === 'typed' && sub.writing_number && (
                  <span className="font-mono text-xs text-muted-foreground">
                    {sub.writing_number}
                  </span>
                )}
                <span className="text-amber-400 text-xs ml-auto">
                  {sub.submission_method === 'image' ? 'Screenshot pending review' : 'Awaiting admin approval'}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Screenshot upload button / form */}
        {!showUpload && !showManual ? (
          <div className="space-y-2">
            <button
              onClick={() => setShowUpload(true)}
              className="flex items-center gap-2 w-full px-4 py-3 rounded-lg border border-dashed border-primary/30 text-primary text-sm font-medium hover:bg-primary/5 hover:border-primary/50 transition-colors"
            >
              <Camera className="w-4 h-4" />
              Upload Screenshot
            </button>

            {/* Manual entry option — additional contracting only */}
            {allowManualEntry && onSubmitManual && (
              <button
                onClick={() => setShowManual(true)}
                className="flex items-center gap-2 w-full px-4 py-2.5 rounded-lg border border-dashed border-muted-foreground/20 text-muted-foreground text-sm font-medium hover:bg-muted/10 hover:border-muted-foreground/40 hover:text-foreground transition-colors"
              >
                <PenLine className="w-4 h-4" />
                Enter Writing Number Manually
              </button>
            )}
          </div>
        ) : showUpload ? (
          /* ── Screenshot upload form ── */
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
                {UPLOAD_CARRIERS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                    {pendingImageCarriers.has(c) ? ' (pending)' : ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
                Screenshot
              </label>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleFileChange}
                className="w-full text-sm text-muted-foreground file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20"
              />
            </div>

            {preview && (
              <div className="relative">
                <img
                  src={preview}
                  alt="Screenshot preview"
                  className="w-full max-h-48 object-contain rounded-lg border border-border"
                />
                <button
                  onClick={clearFile}
                  className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/60 flex items-center justify-center hover:bg-black/80 transition-colors"
                >
                  <X className="w-4 h-4 text-white" />
                </button>
              </div>
            )}

            {error && (
              <div className="flex items-center gap-2 text-xs text-red-400">
                <AlertCircle className="w-3.5 h-3.5" />
                {error}
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => {
                  setShowUpload(false);
                  clearFile();
                }}
                className="flex-1 py-2 rounded-lg border border-border text-sm font-medium text-muted-foreground hover:bg-background transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleUpload}
                disabled={uploading || !file}
                className="flex-1 py-2 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary/80 transition-colors disabled:opacity-40 flex items-center justify-center gap-1.5"
              >
                {uploading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Upload className="w-4 h-4" />
                )}
                Upload
              </button>
            </div>
          </div>
        ) : (
          /* ── Manual entry form (additional contracting only) ── */
          <div className="space-y-3 p-4 rounded-lg border border-border/30 bg-card">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
                Carrier
              </label>
              <select
                value={manualCarrier}
                onChange={(e) => setManualCarrier(e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-card focus:ring-2 focus:ring-primary focus:border-transparent"
              >
                {UPLOAD_CARRIERS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                    {pendingManualCarriers.has(c) ? ' (pending)' : ''}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
                Writing Number
              </label>
              <input
                value={manualWN}
                onChange={(e) => {
                  setManualWN(e.target.value);
                  setManualError('');
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleManualSubmit();
                }}
                placeholder="e.g. 12345678"
                className="w-full px-3 py-2 border border-border rounded-lg text-sm font-mono bg-card focus:ring-2 focus:ring-primary focus:border-transparent"
              />
            </div>

            {manualError && (
              <p className="text-xs text-red-400">{manualError}</p>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => {
                  setShowManual(false);
                  setManualWN('');
                  setManualError('');
                }}
                className="flex-1 py-2 rounded-lg border border-border text-sm font-medium text-muted-foreground hover:bg-background transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleManualSubmit}
                disabled={manualSubmitting || !manualWN.trim()}
                className="flex-1 py-2 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary/80 transition-colors disabled:opacity-40 flex items-center justify-center gap-1.5"
              >
                {manualSubmitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <PenLine className="w-4 h-4" />
                )}
                Submit
              </button>
            </div>
          </div>
        )}

        {/* Submission history toggle */}
        {resolvedSubs.length > 0 && (
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
                {resolvedSubs.map((sub) => (
                  <div
                    key={sub.id}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg bg-card border border-border/30 text-xs"
                  >
                    {sub.status === 'verified' ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <Clock className="w-3.5 h-3.5 text-red-400" />
                    )}
                    <span className="font-medium">{sub.carrier}</span>
                    {sub.writing_number && (
                      <span className="font-mono text-muted-foreground">
                        {sub.writing_number}
                      </span>
                    )}
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
