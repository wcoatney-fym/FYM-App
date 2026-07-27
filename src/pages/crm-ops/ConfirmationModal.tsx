import React from 'react';

interface ConfirmationModalProps {
  title: string;
  message: React.ReactNode;
  confirmLabel: string;
  confirmColor?: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
}

export const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
  title,
  message,
  confirmLabel,
  confirmColor = 'bg-primary hover:bg-primary/90',
  onConfirm,
  onCancel,
  loading = false,
}) => (
  <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
    <div className="bg-card rounded-xl shadow-xl max-w-md w-full animate-in fade-in">
      <div className="px-6 py-4 border-b border-border">
        <h2 className="text-lg font-bold text-foreground">{title}</h2>
      </div>
      <div className="px-6 py-5">
        <div className="text-foreground/80 text-sm">{message}</div>
      </div>
      <div className="px-6 py-4 bg-secondary rounded-b-xl flex justify-end gap-3">
        <button
          onClick={onCancel}
          disabled={loading}
          className="px-4 py-2 text-sm font-medium text-foreground/80 bg-card border border-border rounded-lg hover:bg-secondary transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={onConfirm}
          disabled={loading}
          className={`px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors disabled:opacity-50 ${confirmColor}`}
        >
          {loading ? 'Processing...' : confirmLabel}
        </button>
      </div>
    </div>
  </div>
);
