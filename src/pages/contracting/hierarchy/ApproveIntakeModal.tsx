import React from 'react';
import type { PortalCrmAgency, AgencyIntakeSubmission } from '@/lib/contracting/types';

export const ApproveIntakeModal: React.FC<{
  submission: AgencyIntakeSubmission;
  agencies: PortalCrmAgency[];
  parentId: string;
  onParentChange: (id: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}> = ({ submission, agencies, parentId, onParentChange, onConfirm, onCancel }) => {
  const sortedAgencies = [...agencies].sort((a, b) => a.name.localeCompare(b.name));
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-lg w-full max-w-md">
        <div className="px-6 py-5 border-b border-border">
          <h3 className="text-lg font-bold text-foreground">Approve Intake</h3>
          <p className="text-sm text-muted-foreground mt-0.5">
            Assign a parent agency before creating{' '}
            <span className="font-semibold">{submission.agency_name}</span>.
          </p>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground/80 mb-1">Parent Agency</label>
            <select
              value={parentId}
              onChange={(e) => onParentChange(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:ring-2 focus:ring-primary/40 focus:border-transparent bg-card text-foreground"
            >
              <option value="">Select a parent agency…</option>
              {sortedAgencies.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground mt-1">
              Required — every new agency must map to a parent.
            </p>
          </div>
        </div>
        <div className="px-6 py-4 border-t border-border flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-foreground/80 bg-card border border-border rounded-lg hover:bg-secondary/30 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={!parentId}
            className="px-4 py-2 text-sm font-medium text-primary-foreground gradient-primary rounded-lg transition-colors disabled:opacity-50"
          >
            Approve &amp; Create
          </button>
        </div>
      </div>
    </div>
  );
};

export const IntakeField: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="flex items-center gap-2">
    <span className="text-muted-foreground">{label}:</span>
    <span className="font-medium text-foreground/80 truncate">{value}</span>
  </div>
);
