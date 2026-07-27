/**
 * @crm-protected
 * DO NOT MODIFY without Charlie's explicit approval.
 * This file is part of CRM Ops (OpenClaw Dashboard).
 * Table references use hierarchy_agencies (NOT crm_agencies).
 * Any rename or schema change to hierarchy_agencies requires updating this file.
 * See: docs/CRM_OPS_FILES.md for the full protected file list.
 */
/**
 * @crm-team-protected
 *
 * DO NOT standardize agency names or apply crosswalk logic in this file.
 * DO NOT reference cc_agency_crosswalk or cleanDisplayName here.
 * CRM Team tab subtab — owns its own naming; see CrmTeam.tsx for context.
 */
import React, { useState, useEffect } from 'react';
import { Building2, AlertTriangle, ChevronRight } from 'lucide-react';
import { supabase } from '@/lib/crm/portal-client';
import type { CrmAgency } from '@/lib/crm/types';
import { AgencyOnboardingView } from './AgencyOnboardingView';

const ONBOARDING_STEPS = [
  { key: 'pending_csr_assignment', label: 'CSR Assignment', short: '1' },
  { key: 'awaiting_agency_phone', label: 'Phone & Setup', short: '2' },
  { key: 'awaiting_roster_upload', label: 'Roster Upload', short: '3' },
  { key: 'awaiting_dba_upload', label: 'DBA Upload', short: '4' },
  { key: 'onboarding_complete', label: 'Complete', short: '5' },
] as const;

export const TaskboardOnboardingTab: React.FC = () => {
  const [agencies, setAgencies] = useState<CrmAgency[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAgency, setSelectedAgency] = useState<CrmAgency | null>(null);
  const [pendingActionCount, setPendingActionCount] = useState(0);

  const load = async () => {
    const [agencyRes, notifRes] = await Promise.all([
      supabase
        .from('hierarchy_agencies')
        .select('*')
        .neq('onboarding_status', 'onboarding_complete')
        .eq('is_active', true)
        .order('date_added', { ascending: false }),
      supabase
        .from('crm_notifications')
        .select('id')
        .eq('is_read', false)
        .in('type', ['roster_uploaded', 'dba_uploaded', 'no_dba_request']),
    ]);
    setAgencies(agencyRes.data || []);
    setPendingActionCount((notifRes.data || []).length);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleAgencyUpdated = (updated: CrmAgency) => {
    setAgencies((prev) => prev.map((a) => a.id === updated.id ? updated : a));
    setSelectedAgency(updated);
  };

  if (selectedAgency) {
    return (
      <AgencyOnboardingView
        agency={selectedAgency}
        onBack={() => { setSelectedAgency(null); load(); }}
        onAgencyUpdated={handleAgencyUpdated}
      />
    );
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-16 bg-card rounded-2xl border border-border animate-pulse" />
        {[...Array(3)].map((_, i) => <div key={i} className="h-28 bg-card rounded-2xl border border-border animate-pulse" />)}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {pendingActionCount > 0 && (
        <div className="flex items-center gap-3 p-4 bg-amber-50 border border-amber-200 rounded-2xl shadow-none">
          <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
            <AlertTriangle className="w-5 h-5 text-amber-600" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-amber-800">
              {pendingActionCount} pending confirmation{pendingActionCount !== 1 ? 's' : ''} require your attention
            </p>
            <p className="text-xs text-amber-600 mt-0.5">Roster or DBA uploads awaiting review</p>
          </div>
        </div>
      )}

      {agencies.length === 0 ? (
        <div className="bg-card rounded-2xl border border-border p-12 text-center shadow-none">
          <div className="w-14 h-14 rounded-2xl bg-secondary flex items-center justify-center mx-auto mb-4">
            <Building2 className="w-7 h-7 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium text-muted-foreground">No agencies currently in onboarding</p>
          <p className="text-xs text-muted-foreground mt-1">New agencies will appear here when they begin onboarding</p>
        </div>
      ) : (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-sm font-semibold text-muted-foreground">
              Agencies In Onboarding
            </h4>
            <span className="text-xs font-bold text-primary bg-primary/5 px-2.5 py-1 rounded-full">
              {agencies.length}
            </span>
          </div>
          <div className="space-y-3">
            {agencies.map((agency) => {
              const currentStepIdx = ONBOARDING_STEPS.findIndex(
                (s) => s.key === agency.onboarding_status
              );
              const progressPercent = Math.round((currentStepIdx / (ONBOARDING_STEPS.length - 1)) * 100);

              return (
                <button
                  key={agency.id}
                  onClick={() => setSelectedAgency(agency)}
                  className="w-full bg-card rounded-2xl border border-border p-5 text-left hover:border-primary hover:shadow-none transition-all duration-200 group shadow-none"
                >
                  {/* Progress bar at top */}
                  <div className="h-1 bg-secondary rounded-full mb-4 overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-primary to-emerald-400 rounded-full transition-all duration-500"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>

                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-primary/5 border border-primary flex items-center justify-center">
                        <Building2 className="w-4.5 h-4.5 text-primary" />
                      </div>
                      <div>
                        <h4 className="font-semibold text-muted-foreground group-hover:text-foreground transition-colors">{agency.name}</h4>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          Added {new Date(agency.date_added).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {agency.assigned_csr && (
                        <span className="text-[11px] font-medium text-muted-foreground bg-secondary px-2.5 py-1 rounded-lg">
                          CSR: {agency.assigned_csr}
                        </span>
                      )}
                      <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    {ONBOARDING_STEPS.slice(0, -1).map((step, idx) => {
                      const isActive = idx === currentStepIdx;
                      const isCompleted = idx < currentStepIdx;

                      return (
                        <React.Fragment key={step.key}>
                          <div className="flex items-center gap-2 flex-1">
                            <div
                              className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 transition-all ${
                                isCompleted
                                  ? 'bg-emerald-500 text-white shadow-none'
                                  : isActive
                                  ? 'gradient-primary text-background ring-2 ring-primary/20 shadow-none'
                                  : 'bg-secondary/80 text-muted-foreground'
                              }`}
                            >
                              {step.short}
                            </div>
                            <span
                              className={`text-[11px] font-medium whitespace-nowrap ${
                                isActive ? 'text-primary' : isCompleted ? 'text-emerald-600' : 'text-muted-foreground'
                              }`}
                            >
                              {step.label}
                            </span>
                          </div>
                          {idx < ONBOARDING_STEPS.length - 2 && (
                            <div className={`h-0.5 flex-1 min-w-[16px] rounded-full ${
                              idx < currentStepIdx ? 'bg-emerald-400' : 'bg-secondary/80'
                            }`} />
                          )}
                        </React.Fragment>
                      );
                    })}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
