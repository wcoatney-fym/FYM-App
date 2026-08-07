import React from 'react';
import { AlertTriangle } from 'lucide-react';
import type { PortalCrmAgency } from '@/lib/contracting/types';

type AgencyNode = PortalCrmAgency & {
  children: AgencyNode[];
  agentCount: number;
};

function getDescendantIds(node: AgencyNode): string[] {
  const ids: string[] = [];
  for (const child of node.children) {
    ids.push(child.id);
    ids.push(...getDescendantIds(child));
  }
  return ids;
}

export const DeleteConfirmModal: React.FC<{
  node: AgencyNode;
  deleting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}> = ({ node, deleting, onConfirm, onCancel }) => {
  const descendantCount = getDescendantIds(node).length;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
      <div className="bg-card border border-border rounded-lg max-w-md w-full p-6">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-red-500/10 flex items-center justify-center flex-shrink-0">
            <AlertTriangle className="w-5 h-5 text-red-400" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground">Delete Agency</h3>
            <p className="text-sm text-foreground/80 mt-1">
              Are you sure you want to delete <strong>{node.name}</strong>?
            </p>
          </div>
        </div>

        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 mb-4 space-y-1.5 text-sm">
          <p className="text-red-400 font-medium">This action cannot be undone.</p>
          <ul className="list-disc list-inside space-y-1 text-xs text-red-400/80">
            {descendantCount > 0 && (
              <li>
                {descendantCount} child agenc{descendantCount === 1 ? 'y' : 'ies'} will also be deleted
              </li>
            )}
            {node.crm_enabled && <li>This agency is CRM-enabled and will be removed from CRM Team</li>}
            <li>All associated deals, GHL configs, KPIs, and tickets will be removed</li>
          </ul>
        </div>

        <div className="flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2.5 text-sm font-medium text-foreground/80 border border-border rounded-lg hover:bg-secondary/30"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={deleting}
            className="px-4 py-2.5 text-sm font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
          >
            {deleting ? 'Deleting...' : 'Delete Agency'}
          </button>
        </div>
      </div>
    </div>
  );
};
