/**
 * WritingNumberScreenshotUpload — agent uploads a screenshot of their
 * writing number for a carrier. Admin reviews and manually enters the WN.
 *
 * Charlie (2026-08-25): "Allow agent to upload screenshot with writing
 * number for each carrier. We need admins to be able to view the upload
 * and manually add the writing number for the specified carrier."
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
} from 'lucide-react';
import { portalSupabase } from '@/lib/portal-supabase';
import type { WritingNumberSubmission } from '@/hooks/useAgentPipeline';

/** All carriers an agent might upload screenshots for */
const UPLOAD_CARRIERS = ['Manhattan', 'AHL', 'UNL', 'GTL', 'Heartland'] as const;

interface WritingNumberScreenshotUploadProps {
  agentId: string | null;
  wnSubmissions: WritingNumberSubmission[];
  onUploadComplete: () => Promise<void>;
}

export function WritingNumberScreenshotUpload({
  agentId,
  wnSubmissions,
  onUploadComplete,
}: WritingNumberScreenshotUploadProps) {
  const [showUpload, setShowUpload] = useState(false);
  const [carrier, setCarrier] = useState<string>(UPLOAD_CARRIERS[0]);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  // Carriers that already have a pending image submission
  const pendingImageCarriers = new Set(
    wnSubmissions
      .filter((s) => s.status === 'pending' && s.submission_method === 'image')
      .map((s) => s.carrier),
  );

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;

    // Validate file type
    if (!f.type.startsWith('image/')) {
      setError('Please upload an image file (PNG, JPG, etc.)');
      return;
    }
    // Validate file size (max 5MB)
    if (f.size > 5 * 1024 * 1024) {
      setError('Image must be under 5MB');
      return;
    }

    setFile(f);
    setError('');

    // Create preview
    const reader = new FileReader();
    reader.onload = () => setPreview(reader.result as string);
    reader.readAsDataURL(f);
  };

  const handleUpload = async () => {
    if (!portalSupabase || !agentId || !file) return;
    setUploading(true);
    setError('');

    try {
      // Upload to Supabase Storage
      const ext = file.name.split('.').pop() || 'png';
      const path = `${agentId}/${carrier}_${Date.now()}.${ext}`;

      const { error: uploadErr } = await portalSupabase.storage
        .from('wn-screenshots')
        .upload(path, file, {
          contentType: file.type,
          upsert: false,
        });

      if (uploadErr) {
        // If bucket doesn't exist yet, provide helpful error
        if (uploadErr.message?.includes('not found') || uploadErr.message?.includes('Bucket')) {
          setError('Storage bucket not configured yet. Contact admin.');
        } else {
          throw uploadErr;
        }
        setUploading(false);
        return;
      }

      // Get public URL
      const { data: urlData } = portalSupabase.storage
        .from('wn-screenshots')
        .getPublicUrl(path);

      const publicUrl = urlData?.publicUrl || path;

      // Create submission record
      const { error: insertErr } = await portalSupabase
        .from('agent_writing_number_submissions')
        .insert({
          agent_id: agentId,
          carrier,
          writing_number: null, // admin fills this after reviewing screenshot
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
            Upload Writing Number Screenshot
          </p>
          {success && (
            <span className="text-xs text-emerald-400 flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" /> Uploaded!
            </span>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          Upload a screenshot showing your writing number for a carrier. An admin
          will review and confirm.
        </p>

        {/* Pending image submissions */}
        {wnSubmissions.filter((s) => s.submission_method === 'image' && s.status === 'pending').length > 0 && (
          <div className="space-y-1.5">
            <p className="text-[11px] font-bold uppercase tracking-wider text-amber-400">
              Pending Review
            </p>
            {wnSubmissions
              .filter((s) => s.submission_method === 'image' && s.status === 'pending')
              .map((sub) => (
                <div
                  key={sub.id}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/5 border border-amber-500/20 text-sm"
                >
                  <ImageIcon className="w-4 h-4 text-amber-400 flex-shrink-0" />
                  <span className="font-medium text-foreground">{sub.carrier}</span>
                  <span className="text-amber-400 text-xs ml-auto">Screenshot pending review</span>
                </div>
              ))}
          </div>
        )}

        {!showUpload ? (
          <button
            onClick={() => setShowUpload(true)}
            className="flex items-center gap-2 w-full px-4 py-3 rounded-lg border border-dashed border-primary/30 text-primary text-sm font-medium hover:bg-primary/5 hover:border-primary/50 transition-colors"
          >
            <Camera className="w-4 h-4" />
            Upload Screenshot
          </button>
        ) : (
          <div className="space-y-3 p-4 rounded-lg border border-border/30 bg-card">
            {/* Carrier select */}
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

            {/* File input */}
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

            {/* Preview */}
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
        )}
      </CardContent>
    </Card>
  );
}
