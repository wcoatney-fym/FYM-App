/**
 * VerificationModal — ported from contracting-portal
 *
 * Confirmation modal shown before final form submission.
 * Displays all contact info fields for the agent to verify.
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
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col animate-in">
        <div className="p-6 pb-0">
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 right-4 w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-3 mb-4">
            <div className="w-11 h-11 rounded-full bg-red-50 flex items-center justify-center flex-shrink-0 ring-4 ring-red-100">
              <AlertTriangle className="w-5 h-5 text-red-600" />
            </div>
            <h2 className="text-xl font-bold animate-flash-red">
              Verify Contact Information
            </h2>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 mb-5">
            <p className="text-sm text-amber-900 leading-relaxed font-medium">
              We will use the information below to send you training links, contracting information, and all agent communications.
            </p>
          </div>

          <div className="flex gap-3 mb-5">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 border-2 border-gray-300 rounded-lg text-gray-700 font-semibold hover:bg-gray-50 hover:border-gray-400 transition-all text-sm"
            >
              <Pencil className="w-4 h-4" />
              Edit Information
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={!confirmed || loading}
              className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-lg font-semibold hover:bg-emerald-700 transition-all disabled:opacity-40 disabled:cursor-not-allowed text-sm shadow-sm"
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
                className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 py-3 px-4 rounded-lg bg-gray-50 border border-gray-100 hover:border-gray-200 transition-colors"
              >
                <span className="text-xs font-bold text-gray-500 uppercase tracking-wider sm:w-44 sm:flex-shrink-0">
                  {field.label}
                </span>
                <span className="text-sm font-medium text-gray-900 break-all">
                  {field.value || <span className="text-gray-400 italic">Not provided</span>}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="p-6 pt-4 border-t border-gray-100 space-y-4">
          <label
            className="flex items-start gap-3 cursor-pointer group select-none"
            onClick={() => setConfirmed((v) => !v)}
          >
            <div className="mt-0.5 flex-shrink-0">
              {confirmed ? (
                <CheckSquare className="w-5 h-5 text-emerald-600" />
              ) : (
                <Square className="w-5 h-5 text-gray-400 group-hover:text-gray-500 transition-colors" />
              )}
            </div>
            <span className="text-sm text-gray-700 leading-snug">
              I confirm this information is accurate and ready to submit
            </span>
          </label>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 border-2 border-gray-300 rounded-lg text-gray-700 font-semibold hover:bg-gray-50 hover:border-gray-400 transition-all text-sm"
            >
              <Pencil className="w-4 h-4" />
              Edit Information
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={!confirmed || loading}
              className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 bg-emerald-600 text-white rounded-lg font-bold hover:bg-emerald-700 transition-all disabled:opacity-40 disabled:cursor-not-allowed text-sm shadow-sm"
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
