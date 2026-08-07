import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Inbox, X, Check } from 'lucide-react';
import type { PortalCrmAgency, AgencyIntakeSubmission } from '@/lib/contracting/types';
import { IntakeField } from './ApproveIntakeModal';

export const PendingIntakeTray: React.FC<{
  submissions: AgencyIntakeSubmission[];
  processingId: string | null;
  error: string;
  agencies: PortalCrmAgency[];
  onApprove: (submission: AgencyIntakeSubmission) => void;
  onReject: (submission: AgencyIntakeSubmission) => void;
}> = ({ submissions, processingId, error, onApprove, onReject }) => {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="mb-6 rounded-lg border border-amber-500/20 bg-amber-500/5 overflow-hidden">
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
      >
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
            <Inbox className="w-4 h-4 text-amber-400" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">
              Pending Intake
              <span className="ml-2 inline-flex items-center justify-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/20 text-amber-400">
                {submissions.length}
              </span>
            </p>
            <p className="text-xs text-muted-foreground">
              Submitted via the public agency intake link — review to create the agency.
            </p>
          </div>
        </div>
        {collapsed ? (
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        )}
      </button>

      {!collapsed && (
        <div className="px-4 pb-4 space-y-3">
          {error && (
            <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              {error}
            </p>
          )}
          {submissions.map((s) => {
            const busy = processingId === s.id;
            return (
              <div key={s.id} className="bg-card rounded-lg border border-border p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-semibold text-foreground text-sm truncate">{s.agency_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {s.invited_by_agency_name
                        ? `Invited by: ${s.invited_by_agency_name}`
                        : 'Direct intake'}
                      {' · '}
                      {new Date(s.created_at).toLocaleDateString()}
                    </p>
                    <p className="text-xs text-muted-foreground italic">
                      Parent assigned during approval
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => onReject(s)}
                      disabled={busy}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-foreground/80 bg-card border border-border rounded-lg hover:bg-secondary/30 transition-colors disabled:opacity-50"
                    >
                      <X className="w-3.5 h-3.5" />
                      Reject
                    </button>
                    <button
                      onClick={() => onApprove(s)}
                      disabled={busy}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-primary-foreground gradient-primary rounded-lg transition-colors disabled:opacity-50"
                    >
                      <Check className="w-3.5 h-3.5" />
                      {busy ? 'Working...' : 'Approve'}
                    </button>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-xs">
                  <IntakeField label="Agency NPN" value={s.agency_npn} />
                  <IntakeField label="Agency EIN" value={s.agency_ein || '—'} />
                  <IntakeField label="Principal Agent" value={s.principal_agent} />
                  <IntakeField label="Principal Agent NPN" value={s.principal_agent_npn || '—'} />
                  <IntakeField label="Contracting Email" value={s.contracting_email} />
                  <IntakeField label="Contracting Contact" value={s.contracting_contact || '—'} />
                  {(s.street_address || s.city || s.state) && (
                    <IntakeField
                      label="Address"
                      value={[s.street_address, s.city, s.state, s.zip].filter(Boolean).join(', ')}
                    />
                  )}
                </div>
                {(s.additional_contacts ?? []).length > 0 && (
                  <div className="mt-2">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase mb-1">
                      Additional Contacts
                    </p>
                    <div className="space-y-1">
                      {(s.additional_contacts ?? []).map((c, ci) => (
                        <p key={ci} className="text-xs text-foreground/80">
                          <span className="font-medium">{c.name}</span>
                          {c.title && ` · ${c.title}`}
                          {c.department && ` (${c.department})`}
                          {c.email && ` · ${c.email}`}
                          {c.phone && ` · ${c.phone}`}
                        </p>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
