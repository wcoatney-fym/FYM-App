/**
 * TrainingContentUploadModal — admin form to add new training content
 * to the `agent_training_content` table in the portal DB.
 *
 * Opens as a modal overlay. Fields:
 *   - Title (required)
 *   - Description
 *   - Content Type (document / video)
 *   - Category (predefined list + custom)
 *   - Carrier (UNL / GTL / AHL / Ameritas / General + custom)
 *   - Content URL (required — link to doc, video, or hosted file)
 *   - Has Quiz toggle
 *   - Active toggle (default on)
 *
 * Inserts directly into portal DB via portalSupabase client.
 */
import { useState, useCallback, useEffect, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { portalSupabase } from '@/lib/portal-supabase';
import {
  X,
  Upload,
  FileText,
  Video,
  Loader2,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';

// ─── Constants ───────────────────────────────────────────────────────────────

const CATEGORIES = [
  'Products & Benefits',
  'Prescription & Claims',
  'Applications & Forms',
  'Scripts & Sales Process',
  'Tools & How-To',
  'Training Videos',
] as const;

const CARRIERS = ['UNL', 'GTL', 'AHL', 'Ameritas', 'General'] as const;

const CONTENT_TYPES = [
  { value: 'document', label: 'Document', icon: FileText },
  { value: 'video', label: 'Video', icon: Video },
] as const;

// ─── Types ───────────────────────────────────────────────────────────────────

interface FormData {
  title: string;
  description: string;
  content_type: 'document' | 'video';
  category: string;
  carrier: string;
  content_url: string;
  has_quiz: boolean;
  is_active: boolean;
}

const INITIAL_FORM: FormData = {
  title: '',
  description: '',
  content_type: 'document',
  category: '',
  carrier: '',
  content_url: '',
  has_quiz: false,
  is_active: true,
};

// ─── Component ───────────────────────────────────────────────────────────────

export function TrainingContentUploadModal({
  open,
  onClose,
  onSuccess,
  existingContentCount,
}: {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  existingContentCount: number;
}) {
  const [form, setForm] = useState<FormData>(INITIAL_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  // Focus title on open
  useEffect(() => {
    if (open) {
      setForm(INITIAL_FORM);
      setError(null);
      setSuccess(false);
      setTimeout(() => titleRef.current?.focus(), 100);
    }
  }, [open]);

  // Close on escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  const updateField = useCallback(
    <K extends keyof FormData>(key: K, value: FormData[K]) => {
      setForm((prev) => ({ ...prev, [key]: value }));
      setError(null);
    },
    []
  );

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      // Validation
      if (!form.title.trim()) {
        setError('Title is required');
        return;
      }
      if (!form.content_url.trim()) {
        setError('Content URL is required');
        return;
      }
      if (!form.category) {
        setError('Please select a category');
        return;
      }

      if (!portalSupabase) {
        setError('Portal connection not configured');
        return;
      }

      setSaving(true);
      setError(null);

      try {
        const { error: insertError } = await portalSupabase
          .from('agent_training_content')
          .insert({
            title: form.title.trim(),
            description: form.description.trim() || null,
            content_type: form.content_type,
            content_format: form.content_type, // matches existing pattern
            content_url: form.content_url.trim(),
            category: form.category,
            carrier: form.carrier || null,
            has_quiz: form.has_quiz,
            is_active: form.is_active,
            display_order: existingContentCount + 1,
          });

        if (insertError) throw insertError;

        setSuccess(true);
        setTimeout(() => {
          onSuccess();
          onClose();
        }, 800);
      } catch (err) {
        console.error('[Training Upload] insert error:', err);
        setError(
          err instanceof Error ? err.message : 'Failed to save content'
        );
      } finally {
        setSaving(false);
      }
    },
    [form, existingContentCount, onSuccess, onClose]
  );

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <Card className="relative z-10 w-full max-w-lg mx-4 border-border shadow-2xl max-h-[90vh] overflow-y-auto">
        <CardContent className="p-0">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-border">
            <div className="flex items-center gap-2">
              <Upload className="w-5 h-5 text-primary" />
              <h2 className="text-lg font-bold text-foreground">
                Add Training Content
              </h2>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-6 space-y-5">
            {/* Title */}
            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                Title <span className="text-red-400">*</span>
              </label>
              <input
                ref={titleRef}
                type="text"
                value={form.title}
                onChange={(e) => updateField('title', e.target.value)}
                placeholder="e.g. UNL Hospital Indemnity Overview"
                className="w-full px-3 py-2 rounded-lg border border-border bg-card text-foreground text-sm focus:ring-2 focus:ring-primary/50 focus:border-primary outline-none transition-colors"
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                Description
              </label>
              <textarea
                value={form.description}
                onChange={(e) => updateField('description', e.target.value)}
                placeholder="Brief description of what this content covers…"
                rows={2}
                className="w-full px-3 py-2 rounded-lg border border-border bg-card text-foreground text-sm focus:ring-2 focus:ring-primary/50 focus:border-primary outline-none resize-none transition-colors"
              />
            </div>

            {/* Content Type */}
            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                Content Type <span className="text-red-400">*</span>
              </label>
              <div className="flex gap-2">
                {CONTENT_TYPES.map(({ value, label, icon: Icon }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => updateField('content_type', value)}
                    className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border text-sm font-medium transition-colors ${
                      form.content_type === value
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border bg-card text-muted-foreground hover:bg-secondary/50'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Category */}
            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                Category <span className="text-red-400">*</span>
              </label>
              <select
                value={form.category}
                onChange={(e) => updateField('category', e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-border bg-card text-foreground text-sm focus:ring-2 focus:ring-primary/50 focus:border-primary outline-none transition-colors"
              >
                <option value="">Select a category…</option>
                {CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            {/* Carrier */}
            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                Carrier
              </label>
              <select
                value={form.carrier}
                onChange={(e) => updateField('carrier', e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-border bg-card text-foreground text-sm focus:ring-2 focus:ring-primary/50 focus:border-primary outline-none transition-colors"
              >
                <option value="">No specific carrier</option>
                {CARRIERS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            {/* Content URL */}
            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                Content URL <span className="text-red-400">*</span>
              </label>
              <input
                type="url"
                value={form.content_url}
                onChange={(e) => updateField('content_url', e.target.value)}
                placeholder="https://…"
                className="w-full px-3 py-2 rounded-lg border border-border bg-card text-foreground text-sm focus:ring-2 focus:ring-primary/50 focus:border-primary outline-none transition-colors"
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                Link to the document, video, or hosted file
              </p>
            </div>

            {/* Toggles */}
            <div className="flex items-center gap-6">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.has_quiz}
                  onChange={(e) => updateField('has_quiz', e.target.checked)}
                  className="w-4 h-4 rounded border-border text-primary focus:ring-primary/50"
                />
                <span className="text-sm text-foreground">Has Quiz</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(e) => updateField('is_active', e.target.checked)}
                  className="w-4 h-4 rounded border-border text-primary focus:ring-primary/50"
                />
                <span className="text-sm text-foreground">Active</span>
              </label>
            </div>

            {/* Error */}
            {error && (
              <div className="flex items-center gap-2 text-sm text-red-400 bg-red-500/5 border border-red-500/20 rounded-lg px-3 py-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Success */}
            {success && (
              <div className="flex items-center gap-2 text-sm text-emerald-400 bg-emerald-500/5 border border-emerald-500/20 rounded-lg px-3 py-2">
                <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                <span>Content added successfully!</span>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                className="px-4 py-2 rounded-lg border border-border text-sm font-medium text-muted-foreground hover:bg-secondary transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving || success}
                className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary/80 transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Saving…
                  </>
                ) : success ? (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    Added!
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4" />
                    Add Content
                  </>
                )}
              </button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
