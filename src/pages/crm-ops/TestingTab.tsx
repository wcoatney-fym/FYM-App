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
import {
  FlaskConical,
  Plus,
  RotateCcw,
  Trash2,
  Undo2,
  CheckCircle2,
  Lock,
  Clock,
  Loader2,
} from 'lucide-react';
import { supabase } from '@/lib/crm/portal-client';
import { generateSlug } from '@/lib/crm/types';
import type { CrmAgency } from '@/lib/crm/types';
import { ConfirmationModal } from './ConfirmationModal';
import {
  STEPS,
  getStepIndex,
  getStepState,
  handleUndoStep,
  deleteRosterData,
  deleteDbaData,
} from './onboardingHelpers';
import { AgencyOnboardingView } from './AgencyOnboardingView';

export const TestingTab: React.FC = () => {
  const [agency, setAgency] = useState<CrmAgency | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [undoTarget, setUndoTarget] = useState<number | null>(null);
  const [undoing, setUndoing] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);

  const loadTestAgency = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('hierarchy_agencies')
      .select('*')
      .eq('is_test', true)
      .limit(1)
      .maybeSingle();
    setAgency(data);
    setLoading(false);
  };

  useEffect(() => { loadTestAgency(); }, []);

  const handleCreate = async () => {
    setCreating(true);
    const now = new Date().toISOString();
    const name = 'Test';
    const slug = generateSlug(name);
    const portalPassword = `${name}CRMPortal!`;
    const { data } = await supabase
      .from('hierarchy_agencies')
      .insert({
        name,
        is_test: true,
        is_active: true,
        crm_enabled: true,
        onboarding_status: 'pending_csr_assignment',
        csr_confirmed: false,
        roster_confirmed: false,
        dba_confirmed: false,
        seat_count: 200,
        slug,
        portal_password: portalPassword,
        date_added: now,
        created_at: now,
        updated_at: now,
      })
      .select()
      .maybeSingle();
    if (data) setAgency(data);
    setCreating(false);
  };

  const handleUndo = async (stepIdx: number) => {
    if (!agency) return;
    setUndoing(true);
    await handleUndoStep(stepIdx, agency);
    setUndoing(false);
    setUndoTarget(null);
    await loadTestAgency();
  };

  const handleDelete = async () => {
    if (!agency) return;
    setDeleting(true);
    await deleteDbaData(agency.name);
    await deleteRosterData(agency.name);
    await supabase.from('crm_pipeline').delete().eq('agency', agency.name);
    await supabase.from('agents').delete().eq('agency', agency.name);
    await supabase.from('hierarchy_agencies').delete().eq('id', agency.id);
    setAgency(null);
    setDeleting(false);
    setShowDelete(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!agency) {
    return (
      <div className="bg-card rounded-xl border border-border p-12 text-center max-w-lg mx-auto mt-8">
        <div className="w-16 h-16 rounded-full bg-amber-50 flex items-center justify-center mx-auto mb-4">
          <FlaskConical className="w-8 h-8 text-amber-500" />
        </div>
        <h3 className="text-lg font-bold text-foreground mb-2">No Test Agency</h3>
        <p className="text-sm text-muted-foreground mb-6">
          Create a test agency to walk through the onboarding workflow. It will appear in the Agencies tab with a "Test" badge.
        </p>
        <button
          onClick={handleCreate}
          disabled={creating}
          className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-primary rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {creating ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Plus className="w-4 h-4" />
          )}
          {creating ? 'Creating...' : 'Create Test Agency'}
        </button>
      </div>
    );
  }

  if (showOnboarding) {
    return (
      <AgencyOnboardingView
        agency={agency}
        onBack={() => { setShowOnboarding(false); loadTestAgency(); }}
        onAgencyUpdated={(updated) => setAgency(updated)}
      />
    );
  }

  const currentIdx = getStepIndex(agency);

  return (
    <div className="space-y-6">
      <div className="bg-card rounded-xl border border-border p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-amber-50 flex items-center justify-center">
              <FlaskConical className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-foreground">{agency.name}</h2>
                <StatusBadge status={agency.onboarding_status} />
              </div>
              <p className="text-xs text-muted-foreground">
                Test sandbox -- use the controls below to step forward, undo, reset, or delete
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowOnboarding(true)}
              className="px-4 py-2 text-sm font-medium text-primary bg-cyan-500/10 border border-primary/20 rounded-lg hover:bg-blue-100 transition-colors"
            >
              Open Onboarding View
            </button>
            <button
              onClick={() => setUndoTarget(0)}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset All
            </button>
            <button
              onClick={() => setShowDelete(true)}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-red-700 bg-red-500/10 border border-red-500/20 rounded-lg hover:bg-red-100 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete
            </button>
          </div>
        </div>
      </div>

      <StepperBar agency={agency} currentIdx={currentIdx} />

      <div className="space-y-4">
        {STEPS.map((step, idx) => {
          const state = getStepState(idx, currentIdx, agency);
          return (
            <StepCard
              key={step.key}
              step={step}
              idx={idx}
              state={state}
              onUndo={() => setUndoTarget(idx)}
              onOpenStep={() => setShowOnboarding(true)}
            />
          );
        })}
      </div>

      {agency.onboarding_status === 'onboarding_complete' && (
        <div className="bg-emerald-50 rounded-xl border border-emerald-200 p-6 text-center">
          <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto mb-3" />
          <h3 className="text-lg font-bold text-foreground mb-1">Onboarding Complete</h3>
          <p className="text-sm text-muted-foreground">
            All 3 steps are confirmed. Use "Reset All" to start over, or "Delete" to remove the test agency entirely.
          </p>
        </div>
      )}

      {undoTarget !== null && (
        <ConfirmationModal
          title={
            undoTarget === 0
              ? 'Reset All Steps'
              : `Undo Step ${undoTarget + 1}: ${STEPS[undoTarget].label}`
          }
          message={
            <div>
              <p className="mb-3">
                {undoTarget === 0 ? (
                  <>
                    This will reset <span className="font-semibold">all onboarding progress</span> for{' '}
                    <span className="font-semibold">{agency.name}</span>, including CSR assignment, roster upload, and DBA upload.
                  </>
                ) : undoTarget === 1 ? (
                  <>
                    This will undo the roster upload for <span className="font-semibold">{agency.name}</span> and reset step 3 as well.
                  </>
                ) : (
                  <>
                    This will undo the DBA upload for <span className="font-semibold">{agency.name}</span>.
                  </>
                )}
              </p>
              <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 rounded-lg border border-amber-200">
                <FlaskConical className="w-4 h-4 text-amber-600 flex-shrink-0" />
                <p className="text-xs text-amber-700 font-medium">Test-only action -- does not affect real agencies</p>
              </div>
            </div>
          }
          confirmLabel={undoing ? 'Resetting...' : undoTarget === 0 ? 'Reset All' : 'Undo Step'}
          confirmColor="bg-amber-600 hover:bg-amber-700"
          onConfirm={() => handleUndo(undoTarget)}
          onCancel={() => setUndoTarget(null)}
          loading={undoing}
        />
      )}

      {showDelete && (
        <ConfirmationModal
          title="Delete Test Agency"
          message={
            <div>
              <p className="mb-3">
                This will permanently delete <span className="font-semibold">{agency.name}</span> and all associated data
                (roster uploads, DBA uploads, notifications).
              </p>
              <div className="flex items-center gap-2 px-3 py-2 bg-red-500/10 rounded-lg border border-red-500/20">
                <Trash2 className="w-4 h-4 text-red-400 flex-shrink-0" />
                <p className="text-xs text-red-700 font-medium">You can recreate a fresh test agency at any time</p>
              </div>
            </div>
          }
          confirmLabel={deleting ? 'Deleting...' : 'Delete Test Agency'}
          confirmColor="bg-red-600 hover:bg-red-700"
          onConfirm={handleDelete}
          onCancel={() => setShowDelete(false)}
          loading={deleting}
        />
      )}
    </div>
  );
};

const STATUS_LABELS: Record<string, string> = {
  pending_csr_assignment: 'Pending CSR Assignment',
  awaiting_agency_phone: 'Awaiting Phone & Setup',
  awaiting_roster_upload: 'Awaiting Roster Upload',
  awaiting_dba_upload: 'Awaiting DBA Upload',
  onboarding_complete: 'Onboarding Complete',
};

const STATUS_COLORS: Record<string, string> = {
  pending_csr_assignment: 'bg-amber-400/10 text-amber-400 border-amber-200',
  awaiting_agency_phone: 'bg-sky-400/10 text-sky-400 border-sky-200',
  awaiting_roster_upload: 'bg-blue-400/10 text-blue-400 border-blue-200',
  awaiting_dba_upload: 'bg-teal-400/10 text-teal-400 border-teal-200',
  onboarding_complete: 'bg-emerald-400/10 text-emerald-400 border-emerald-200',
};

const StatusBadge: React.FC<{ status: string }> = ({ status }) => (
  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${STATUS_COLORS[status] || 'bg-secondary text-foreground/80 border-border'}`}>
    {STATUS_LABELS[status] || status}
  </span>
);

const StepperBar: React.FC<{ agency: CrmAgency; currentIdx: number }> = ({ agency, currentIdx }) => (
  <div className="bg-card rounded-xl border border-border p-6">
    <div className="flex items-center justify-between">
      {STEPS.map((step, idx) => {
        const state = getStepState(idx, currentIdx, agency);
        return (
          <React.Fragment key={step.key}>
            <div className="flex items-center gap-3">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
                  state === 'complete'
                    ? 'bg-emerald-500 text-white'
                    : state === 'awaiting'
                    ? 'bg-amber-400/10 text-amber-400 ring-2 ring-amber-300'
                    : state === 'active'
                    ? 'gradient-primary text-background ring-2 ring-primary/20'
                    : 'bg-secondary text-muted-foreground/70'
                }`}
              >
                {state === 'complete' ? (
                  <CheckCircle2 className="w-5 h-5" />
                ) : state === 'awaiting' ? (
                  <Clock className="w-5 h-5" />
                ) : state === 'locked' ? (
                  <Lock className="w-4 h-4" />
                ) : (
                  <span className="text-sm font-bold">{idx + 1}</span>
                )}
              </div>
              <div className="hidden sm:block">
                <p
                  className={`text-sm font-semibold ${
                    state === 'complete'
                      ? 'text-emerald-700'
                      : state === 'awaiting'
                      ? 'text-amber-700'
                      : state === 'active'
                      ? 'text-primary'
                      : 'text-muted-foreground/70'
                  }`}
                >
                  {step.label}
                </p>
                <p className="text-xs text-muted-foreground/70">
                  {state === 'complete'
                    ? 'Confirmed'
                    : state === 'awaiting'
                    ? 'Awaiting Confirmation'
                    : state === 'active'
                    ? 'In Progress'
                    : 'Locked'}
                </p>
              </div>
            </div>
            {idx < STEPS.length - 1 && (
              <div
                className={`flex-1 h-0.5 mx-4 rounded ${
                  idx < currentIdx ? 'bg-emerald-400' : 'bg-secondary/80'
                }`}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  </div>
);

const StepCard: React.FC<{
  step: typeof STEPS[number];
  idx: number;
  state: 'locked' | 'active' | 'awaiting' | 'complete';
  onUndo: () => void;
  onOpenStep: () => void;
}> = ({ step, idx, state, onUndo, onOpenStep }) => {
  if (state === 'locked') {
    return (
      <div className="bg-muted rounded-xl border border-border p-5 opacity-60">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-secondary/80 flex items-center justify-center">
            <Lock className="w-4 h-4 text-muted-foreground/70" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-muted-foreground">Step {idx + 1}: {step.label}</h3>
            <p className="text-xs text-muted-foreground/70">Locked until previous step is confirmed</p>
          </div>
        </div>
      </div>
    );
  }

  if (state === 'complete') {
    return (
      <div className="bg-emerald-50/50 rounded-xl border border-emerald-200 p-5">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-emerald-100 flex items-center justify-center">
            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-emerald-800">Step {idx + 1}: {step.label}</h3>
            <p className="text-xs text-emerald-600">Confirmed</p>
          </div>
          <button
            onClick={onUndo}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 transition-colors"
          >
            <Undo2 className="w-3.5 h-3.5" />
            Undo
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-xl border-2 border-primary/20 p-5">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-cyan-500/10 flex items-center justify-center">
          <span className="text-sm font-bold text-primary">{idx + 1}</span>
        </div>
        <div className="flex-1">
          <h3 className="font-semibold text-foreground">Step {idx + 1}: {step.label}</h3>
          <p className="text-xs text-muted-foreground">
            {state === 'awaiting' ? 'Awaiting confirmation' : 'In progress -- action needed'}
          </p>
        </div>
        <button
          onClick={onOpenStep}
          className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-lg hover:bg-primary/90 transition-colors"
        >
          Continue Step
        </button>
      </div>
    </div>
  );
};
