/**
 * VerificationModal — ported from contracting-portal
 *
 * Confirmation modal shown before final form submission.
 * Displays all contact info fields for the agent to verify.
 * Styled for FYM App dark theme.
 */
import { useState, useEffect } from 'react';
import { X, AlertTriangle, CheckSquare, Square, Pencil, Send } from 'lucide-react';

interface ContactField {
  label: string;
  value: string;
}

interface VerificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  loading: boolean;
  fields: ContactField[];
}

export function VerificationModal({
  isOpen,
  onClose,
  onConfirm,
  loading,
  fields,
}: VerificationModalProps) {
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    if (isOpen) setConfirmed(false);
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative bg-card rounded-2xl shadow-2xl border border-border w-full max-w-lg max-h-[90vh] flex flex-col animate-in">
        <div className="p-6 pb-0">
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 right-4 w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-3 mb-4">
            <div className="w-11 h-11 rounded-full bg-destructive/10 flex items-center justify-center flex-shrink-0 ring-4 ring-destructive/20">
              <AlertTriangle className="w-5 h-5 text-destructive" />
            </div>
            <h2 className="text-xl font-bold text-foreground">
              Verify Contact Information
            </h2>
          </div>

          <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg px-4 py-3 mb-5">
            <p className="text-sm text-amber-400 leading-relaxed font-medium">
              We will use the information below to send you training links, contracting information, and all agent communications.
            </p>
          </div>

          <div className="flex gap-3 mb-5">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 border-2 border-border rounded-lg text-muted-foreground font-semibold hover:bg-secondary hover:border-muted-foreground transition-all text-sm"
            >
              <Pencil className="w-4 h-4" />
              Edit Information
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={!confirmed || loading}
              className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-accent text-accent-foreground rounded-lg font-semibold hover:bg-accent/90 transition-all disabled:opacity-40 disabled:cursor-not-allowed text-sm shadow-sm"
            >
              <Send className="w-4 h-4" />
              {loading ? 'Submitting...' : 'Submit'}
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 pb-2">
          <div className="space-y-2">
            {fields.map((field, i) => (
              <div
                key={i}
                className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 py-3 px-4 rounded-lg bg-secondary border border-border hover:border-muted-foreground/30 transition-colors"
              >
                <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider sm:w-44 sm:flex-shrink-0">
                  {field.label}
                </span>
                <span className="text-sm font-medium text-foreground break-all">
                  {field.value || <span className="text-muted-foreground italic">Not provided</span>}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="p-6 pt-4 border-t border-border space-y-4">
          <label
            className="flex items-start gap-3 cursor-pointer group select-none"
            onClick={() => setConfirmed((v) => !v)}
          >
            <div className="mt-0.5 flex-shrink-0">
              {confirmed ? (
                <CheckSquare className="w-5 h-5 text-accent" />
              ) : (
                <Square className="w-5 h-5 text-muted-foreground group-hover:text-foreground transition-colors" />
              )}
            </div>
            <span className="text-sm text-muted-foreground leading-snug">
              I confirm this information is accurate and ready to submit
            </span>
          </label>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 border-2 border-border rounded-lg text-muted-foreground font-semibold hover:bg-secondary hover:border-muted-foreground transition-all text-sm"
            >
              <Pencil className="w-4 h-4" />
              Edit Information
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={!confirmed || loading}
              className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 bg-accent text-accent-foreground rounded-lg font-bold hover:bg-accent/90 transition-all disabled:opacity-40 disabled:cursor-not-allowed text-sm shadow-sm"
            >
              <Send className="w-4 h-4" />
              {loading ? 'Submitting...' : 'Submit'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
