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
// @ts-nocheck
import React, { useState, useEffect, useRef } from 'react';
import {
  ArrowLeft,
  Lock,
  CheckCircle2,
  Clock,
  Upload,
  Download,
  FileSpreadsheet,
  Shield,
  UserCheck,
  Database,
  FlaskConical,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  RotateCcw,
  Eye,
  Undo2,
  X,
  Phone,
  Settings,
  Zap,
  Calendar,
  Globe,
  Building2,
  Pencil,
  AlertTriangle,
} from 'lucide-react';
import { supabase } from '@/lib/crm/portal-client';
import { fireCrmOnboardingWebhook, warmUpCrmOnboardingWebhook, fireCrossSellConfirmWebhook } from '@/lib/crm/webhooks';
import type { CrmAgency, CrmTemplate } from '@/lib/crm/types';
import { parseCSV } from '@/lib/crm/csv-parser';
import { ConfirmationModal } from './ConfirmationModal';
import { STEPS, getStepIndex, getStepState, escapeField, padRosterTo200, handleUndoStep } from './onboardingHelpers';
import { CrossSellSection } from './CrossSellSection';
import { normalizeRosterRows, ROSTER_TEMPLATE_HEADERS } from '@/lib/crm/roster-normalizer';

interface AgencyOnboardingViewProps {
  agency: CrmAgency;
  allAgencies?: CrmAgency[];
  onBack: () => void;
  onAgencyUpdated: (updated: CrmAgency) => void;
  onNavigateToAgency?: (agency: CrmAgency) => void;
}

export const AgencyOnboardingView: React.FC<AgencyOnboardingViewProps> = ({
  agency: initialAgency,
  allAgencies = [],
  onBack,
  onAgencyUpdated,
  onNavigateToAgency = () => {},
}) => {
  const [agency, setAgency] = useState<CrmAgency>(initialAgency);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const currentIdx = getStepIndex(agency);
  const isTest = agency.is_test;

  const renderStepBody = (idx: number) => {
    if (idx === 0) return <CsrStep agency={agency} onRefresh={refreshAgency} />;
    if (idx === 1) return <PhoneSetupStep agency={agency} onRefresh={refreshAgency} />;
    if (idx === 2) return <RosterStep agency={agency} onRefresh={refreshAgency} />;
    if (idx === 3) return <DbaStep agency={agency} onRefresh={refreshAgency} />;
    return null;
  };

  const refreshAgency = async () => {
    const { data } = await supabase
      .from('hierarchy_agencies')
      .select('*')
      .eq('id', agency.id)
      .maybeSingle();
    if (data) {
      setAgency(data);
      onAgencyUpdated(data);
    }
  };

  const parentAgency = agency.agency_type === 'sub' && agency.parent_agency_id
    ? allAgencies.find((a) => a.id === agency.parent_agency_id) || null
    : null;
  const childAgencies = agency.agency_type === 'main'
    ? allAgencies.filter((a) => a.parent_agency_id === agency.id)
    : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button
          onClick={onBack}
          className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-secondary rounded-lg transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Agencies
        </button>
        <div className="flex items-center gap-3">
          <div>
            <h2 className="text-xl font-bold text-foreground">{agency.name}</h2>
            <div className="flex items-center gap-2">
              <p className="text-sm text-muted-foreground">Onboarding Workflow</p>
              {parentAgency && (
                <button
                  onClick={() => onNavigateToAgency(parentAgency)}
                  className="text-sm text-primary hover:underline transition-colors"
                >
                  Parent: {parentAgency.name}
                </button>
              )}
            </div>
          </div>
          {agency.agency_type === 'sub' && (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-secondary text-muted-foreground">
              Sub Agency
            </span>
          )}
          {isTest && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold bg-amber-500/100/10 text-amber-400 rounded-full border border-amber-500/20">
              <FlaskConical className="w-3 h-3" />
              Test Account
            </span>
          )}
        </div>
      </div>

      {childAgencies.length > 0 && (
        <div className="bg-card rounded-xl border border-border p-4">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Sub-Agencies</p>
          <div className="flex flex-wrap gap-2">
            {childAgencies.map((child) => (
              <button
                key={child.id}
                onClick={() => onNavigateToAgency(child)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-primary bg-primary/5 border border-primary/15 rounded-lg hover:bg-primary/10 transition-colors"
              >
                {child.name}
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            ))}
          </div>
        </div>
      )}

      <StepperBar agency={agency} currentIdx={currentIdx} />

      {isTest && (
        <TestStepControls agency={agency} onRefresh={refreshAgency} />
      )}

      {agency.onboarding_status === 'onboarding_complete' ? (
        <CompletionState agency={agency} isTest={isTest} onBack={onBack} onReset={async () => {
          await handleUndoStep(0, agency);
          await refreshAgency();
        }} />
      ) : (
        <div className="space-y-4">
          {STEPS.map((step, idx) => {
            const state = getStepState(idx, currentIdx, agency);
            if (state === 'locked') {
              return <LockedStepCard key={step.key} step={step} />;
            }
            if (state === 'complete') {
              if (editingIdx === idx) {
                return (
                  <div key={step.key} className="space-y-2">
                    <div className="flex items-center justify-between px-1">
                      <span className="text-xs font-semibold text-amber-600 uppercase tracking-wide">
                        Editing — {step.label}
                      </span>
                      <button
                        onClick={async () => { setEditingIdx(null); await refreshAgency(); }}
                        className="px-3 py-1.5 text-xs font-medium text-muted-foreground glass rounded-lg hover:bg-muted transition-colors"
                      >
                        Done editing
                      </button>
                    </div>
                    {renderStepBody(idx)}
                  </div>
                );
              }
              return <CompletedStepCard key={step.key} step={step} onEdit={() => setEditingIdx(idx)} />;
            }
            return <React.Fragment key={step.key}>{renderStepBody(idx)}</React.Fragment>;
          })}
        </div>
      )}
    </div>
  );
};

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
                    ? 'bg-emerald-500/100 text-white'
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
                      ? 'text-emerald-400'
                      : state === 'awaiting'
                      ? 'text-amber-400'
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

const LockedStepCard: React.FC<{ step: typeof STEPS[number] }> = ({ step }) => (
  <div className="bg-muted rounded-xl border border-border p-6 opacity-60">
    <div className="flex items-center gap-3">
      <div className="w-9 h-9 rounded-lg bg-secondary/80 flex items-center justify-center">
        <Lock className="w-4 h-4 text-muted-foreground/70" />
      </div>
      <div>
        <h3 className="font-semibold text-muted-foreground">{step.label}</h3>
        <p className="text-xs text-muted-foreground/70">This step will unlock after the previous step is confirmed</p>
      </div>
    </div>
  </div>
);

const CompletedStepCard: React.FC<{
  step: typeof STEPS[number];
  onEdit?: () => void;
}> = ({ step, onEdit }) => (
  <div className="bg-emerald-500/10/50 rounded-xl border border-emerald-500/20 p-6">
    <div className="flex items-center gap-3">
      <div className="w-9 h-9 rounded-lg bg-emerald-500/100/10 flex items-center justify-center">
        <CheckCircle2 className="w-5 h-5 text-emerald-600" />
      </div>
      <div className="flex-1">
        <h3 className="font-semibold text-emerald-400">{step.label}</h3>
        <p className="text-xs text-emerald-600">Confirmed</p>
      </div>
      {onEdit && (
        <button
          onClick={onEdit}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-emerald-400 bg-card border border-emerald-300 rounded-lg hover:bg-emerald-500/100/10 transition-colors"
        >
          <Pencil className="w-3.5 h-3.5" />
          Edit
        </button>
      )}
    </div>
  </div>
);

const CompletionState: React.FC<{
  agency: CrmAgency;
  isTest: boolean;
  onBack: () => void;
  onReset: () => void;
}> = ({ agency, isTest, onBack, onReset }) => {
  const [resetting, setResetting] = useState(false);

  const handleReset = async () => {
    setResetting(true);
    await onReset();
    setResetting(false);
  };

  return (
    <div className="bg-card rounded-xl border border-border p-12 text-center">
      <div className="w-20 h-20 rounded-full bg-emerald-500/100/10 flex items-center justify-center mx-auto mb-5">
        <CheckCircle2 className="w-10 h-10 text-emerald-600" />
      </div>
      <h3 className="text-2xl font-bold text-foreground mb-2">Onboarding Complete</h3>
      <p className="text-muted-foreground mb-6">
        {agency.name} has been fully onboarded and is ready to use the CRM.
      </p>
      <div className="flex items-center justify-center gap-3">
        <button
          onClick={onBack}
          className="px-5 py-2.5 text-sm font-medium text-white bg-primary rounded-lg hover:bg-primary/90 transition-colors"
        >
          Back to Agencies
        </button>
        {isTest && (
          <button
            onClick={handleReset}
            disabled={resetting}
            className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg hover:bg-amber-500/100/20 transition-colors disabled:opacity-50"
          >
            <RotateCcw className="w-4 h-4" />
            {resetting ? 'Resetting...' : 'Reset to Step 1'}
          </button>
        )}
      </div>
    </div>
  );
};

const ONBOARDING_STATUSES = [
  'pending_csr_assignment',
  'awaiting_agency_phone',
  'awaiting_roster_upload',
  'awaiting_dba_upload',
  'onboarding_complete',
] as const;

const STATUS_LABELS: Record<string, string> = {
  pending_csr_assignment: 'Step 1: CSR Assignment',
  awaiting_agency_phone: 'Step 2: Phone & Subaccount Setup',
  awaiting_roster_upload: 'Step 3: Roster Upload',
  awaiting_dba_upload: 'Step 4: DBA Upload',
  onboarding_complete: 'Complete',
};

const TestStepControls: React.FC<{
  agency: CrmAgency;
  onRefresh: () => void;
}> = ({ agency, onRefresh }) => {
  const [moving, setMoving] = useState(false);
  const statusIdx = ONBOARDING_STATUSES.indexOf(
    agency.onboarding_status as typeof ONBOARDING_STATUSES[number]
  );

  const moveToStatus = async (newStatus: string) => {
    setMoving(true);
    const now = new Date().toISOString();
    const confirmFlags: Record<string, boolean> = {};

    const targetIdx = ONBOARDING_STATUSES.indexOf(newStatus as typeof ONBOARDING_STATUSES[number]);

    if (targetIdx >= 1) confirmFlags.csr_confirmed = true;
    else confirmFlags.csr_confirmed = false;

    if (targetIdx >= 3) confirmFlags.roster_confirmed = true;
    else confirmFlags.roster_confirmed = false;

    if (targetIdx >= 4) confirmFlags.dba_confirmed = true;
    else confirmFlags.dba_confirmed = false;

    await supabase
      .from('hierarchy_agencies')
      .update({
        onboarding_status: newStatus,
        ...confirmFlags,
        updated_at: now,
      })
      .eq('id', agency.id);

    await supabase.from('crm_notifications').insert({
      agency_id: agency.id,
      type: 'test_step_move',
      message: `[TEST] ${agency.name} moved to: ${STATUS_LABELS[newStatus] || newStatus}`,
    });

    await onRefresh();
    setMoving(false);
  };

  const canGoBack = statusIdx > 0;
  const canGoForward = statusIdx < ONBOARDING_STATUSES.length - 1;
  const prevStatus = canGoBack ? ONBOARDING_STATUSES[statusIdx - 1] : null;
  const nextStatus = canGoForward ? ONBOARDING_STATUSES[statusIdx + 1] : null;

  return (
    <div className="bg-amber-500/10 rounded-xl border border-amber-500/20 p-4">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <FlaskConical className="w-4 h-4 text-amber-600" />
          <span className="text-xs font-semibold text-amber-400 uppercase tracking-wide">Test Controls</span>
        </div>
        <span className="text-xs text-amber-600">
          Current: {STATUS_LABELS[agency.onboarding_status] || agency.onboarding_status}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => prevStatus && moveToStatus(prevStatus)}
            disabled={moving || !canGoBack}
            className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-amber-400 bg-card border border-amber-300 rounded-lg hover:bg-amber-500/100/20 transition-colors disabled:opacity-40"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            Back
          </button>
          <button
            onClick={() => nextStatus && moveToStatus(nextStatus)}
            disabled={moving || !canGoForward}
            className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-amber-400 bg-card border border-amber-300 rounded-lg hover:bg-amber-500/100/20 transition-colors disabled:opacity-40"
          >
            Forward
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => moveToStatus('pending_csr_assignment')}
            disabled={moving || statusIdx === 0}
            className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-red-400 bg-card border border-red-500/20 rounded-lg hover:bg-red-500/20 transition-colors disabled:opacity-40"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset All
          </button>
        </div>
      </div>
    </div>
  );
};

const CsrStep: React.FC<{ agency: CrmAgency; onRefresh: () => void }> = ({ agency, onRefresh }) => {
  const [firstName, setFirstName] = useState(agency.csr_first_name || '');
  const [lastName, setLastName] = useState(agency.csr_last_name || '');
  const [phone, setPhone] = useState(agency.csr_phone || '');
  const [email, setEmail] = useState(agency.csr_email || '');
  const [npn, setNpn] = useState(agency.csr_npn || '');
  const [saving, setSaving] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const isFormValid = firstName.trim() && lastName.trim() && phone.trim() && email.trim();
  const fullName = `${firstName.trim()} ${lastName.trim()}`.trim();

  const handleSaveCsr = async () => {
    if (!isFormValid) return;
    setSaving(true);
    await supabase
      .from('hierarchy_agencies')
      .update({
        assigned_csr: fullName,
        csr_first_name: firstName.trim(),
        csr_last_name: lastName.trim(),
        csr_phone: phone.trim(),
        csr_email: email.trim(),
        csr_npn: npn.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', agency.id);
    setSaving(false);
    await onRefresh();
  };

  const handleConfirm = async () => {
    setConfirming(true);
    const now = new Date().toISOString();
    await supabase
      .from('hierarchy_agencies')
      .update({
        csr_confirmed: true,
        onboarding_status: 'awaiting_agency_phone',
        updated_at: now,
      })
      .eq('id', agency.id);

    await supabase.from('crm_notifications').insert({
      agency_id: agency.id,
      type: 'csr_confirmed',
      message: `CSR assignment confirmed for ${agency.name} (${fullName})`,
    });

    setConfirming(false);
    setShowConfirm(false);
    await onRefresh();
  };

  const inputClass = 'w-full px-4 py-2 border border-border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring text-sm';

  return (
    <>
      <div className="bg-card rounded-xl border border-border p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-9 h-9 rounded-lg bg-cyan-500/10 flex items-center justify-center">
            <UserCheck className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground">Step 1: Assign CSR</h3>
            <p className="text-xs text-muted-foreground">Assign a customer service representative to this agency</p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground/80 mb-1">First Name</label>
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className={inputClass}
                placeholder="First name"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground/80 mb-1">Last Name</label>
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className={inputClass}
                placeholder="Last name"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground/80 mb-1">Phone</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className={inputClass}
                placeholder="(555) 123-4567"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground/80 mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputClass}
                placeholder="csr@example.com"
              />
            </div>
          </div>

          <div className="sm:w-1/2">
            <label className="block text-sm font-medium text-foreground/80 mb-1">
              NPN <span className="text-muted-foreground/70 font-normal">(optional)</span>
            </label>
            <input
              type="text"
              value={npn}
              onChange={(e) => setNpn(e.target.value)}
              className={inputClass}
              placeholder="National Producer Number"
            />
          </div>

          <div className="flex justify-end">
            <button
              onClick={handleSaveCsr}
              disabled={saving || !isFormValid}
              className="px-5 py-2 text-sm font-medium text-white bg-primary rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save CSR Info'}
            </button>
          </div>

          {agency.csr_first_name?.trim() && agency.csr_last_name?.trim() && (
            <div className="pt-4 border-t border-border/50">
              <div className="flex items-center gap-2 mb-3">
                <Shield className="w-4 h-4 text-muted-foreground/70" />
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">CRM Team Action</span>
              </div>
              <button
                onClick={() => setShowConfirm(true)}
                className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-primary bg-cyan-500/10 border border-primary/20 rounded-lg hover:bg-blue-100 transition-colors"
              >
                <CheckCircle2 className="w-4 h-4" />
                Confirm CSR Assignment
              </button>
              <p className="text-xs text-muted-foreground/70 mt-2">This will lock in the CSR and unlock Step 2</p>
            </div>
          )}
        </div>
      </div>

      {showConfirm && (
        <ConfirmationModal
          title="Confirm CSR Assignment"
          message={
            <p>
              Are you sure you want to confirm CSR assignment for{' '}
              <span className="font-semibold">{agency.name}</span>?
              CSR: <span className="font-semibold">{agency.assigned_csr}</span>.
              This will unlock Step 2 (Phone &amp; Subaccount Setup).
            </p>
          }
          confirmLabel="Confirm"
          onConfirm={handleConfirm}
          onCancel={() => setShowConfirm(false)}
          loading={confirming}
        />
      )}
    </>
  );
};

const SETUP_TASKS = [
  { key: 'setup_subaccount' as const, label: 'Set up subaccount' },
  { key: 'setup_snapshot' as const, label: 'Push snapshot' },
  { key: 'setup_ghl_api' as const, label: 'Add GHL API' },
  {
    key: 'setup_zapier' as const,
    label: 'Wire up Zapier',
    link: 'https://zapier.com/editor/00000000-0000-c000-8000-000357476597/published',
  },
] as const;

const PhoneSetupStep: React.FC<{ agency: CrmAgency; onRefresh: () => void }> = ({ agency, onRefresh }) => {
  const [phoneValue, setPhoneValue] = useState(agency.crm_number || agency.agency_phone || '');
  const [saving, setSaving] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [crossSellExpanded, setCrossSellExpanded] = useState(false);
  const [crossSellConfirmed, setCrossSellConfirmed] = useState(agency.cross_sell_confirmed ?? false);
  const [showCrossSellConfirm, setShowCrossSellConfirm] = useState(false);
  const [calendarEmbed, setCalendarEmbed] = useState(agency.calendar_embed_code || '');
  const [urlPrefix, setUrlPrefix] = useState(agency.agency_url_prefix || '');
  const [businessName, setBusinessName] = useState(agency.business_name || '');
  const [businessLogoUrl, setBusinessLogoUrl] = useState(agency.business_logo_url || '');
  const [logoUnavailable, setLogoUnavailable] = useState(false);

  const phoneSaved = !!agency.agency_phone?.trim();
  const calendarUrlSaved = !!agency.calendar_embed_code?.trim() && !!agency.agency_url_prefix?.trim();
  // Logo URL is optional (some agencies have no hosted logo). Business details are
  // considered saved once the business name is persisted.
  const businessDetailsSaved = !!agency.business_name?.trim();
  const allSetupDone = agency.setup_subaccount && agency.setup_snapshot && agency.setup_ghl_api && agency.setup_zapier;
  const crossSellReady = phoneSaved && calendarUrlSaved;
  const canComplete = phoneValue.trim().length > 0 && allSetupDone && crossSellConfirmed && calendarUrlSaved && businessDetailsSaved;

  const handleSavePhone = async () => {
    if (!phoneValue.trim()) return;
    setSaving('phone');
    await supabase
      .from('hierarchy_agencies')
      .update({
        agency_phone: phoneValue.trim(),
        crm_number: phoneValue.trim(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', agency.id);
    await onRefresh();
    setSaving(null);
  };

  const handleToggle = async (key: 'setup_subaccount' | 'setup_snapshot' | 'setup_ghl_api' | 'setup_zapier') => {
    setSaving(key);
    const newValue = !agency[key];
    await supabase
      .from('hierarchy_agencies')
      .update({ [key]: newValue, updated_at: new Date().toISOString() })
      .eq('id', agency.id);
    await onRefresh();
    setSaving(null);
  };

  const handleSaveCalendarUrl = async () => {
    if (!calendarEmbed.trim() || !urlPrefix.trim()) return;
    setSaving('calendar_url');
    await supabase
      .from('hierarchy_agencies')
      .update({
        calendar_embed_code: calendarEmbed.trim(),
        agency_url_prefix: urlPrefix.trim(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', agency.id);
    await onRefresh();
    setSaving(null);
  };

  const handleSaveBusinessDetails = async () => {
    if (!businessName.trim()) return;
    if (!businessLogoUrl.trim() && !logoUnavailable) return;
    setSaving('business_details');
    await supabase
      .from('hierarchy_agencies')
      .update({
        business_name: businessName.trim(),
        business_logo_url: logoUnavailable ? '' : businessLogoUrl.trim(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', agency.id);
    await onRefresh();
    setSaving(null);
  };

  const handleComplete = async () => {
    if (!canComplete) return;
    setConfirming(true);
    const now = new Date().toISOString();
    await supabase
      .from('hierarchy_agencies')
      .update({
        agency_phone: phoneValue.trim(),
        crm_number: phoneValue.trim(),
        onboarding_status: 'awaiting_roster_upload',
        updated_at: now,
      })
      .eq('id', agency.id);
    await supabase.from('crm_notifications').insert({
      agency_id: agency.id,
      type: 'phone_setup_complete',
      message: `Phone & subaccount setup completed for ${agency.name}`,
    });
    setConfirming(false);
    setShowConfirm(false);
    await onRefresh();
  };

  return (
    <>
      <div className="bg-card rounded-xl border border-border p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-9 h-9 rounded-lg bg-cyan-500/10 flex items-center justify-center">
            <Phone className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground">Step 2: Phone & Subaccount Setup</h3>
            <p className="text-xs text-muted-foreground">Assign the agency phone number and complete subaccount configuration</p>
          </div>
        </div>

        <div className="space-y-6">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Shield className="w-4 h-4 text-muted-foreground/70" />
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Agency Phone Number</span>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="tel"
                value={phoneValue}
                onChange={(e) => setPhoneValue(e.target.value)}
                className="flex-1 max-w-sm px-4 py-2.5 border border-border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring text-sm"
                placeholder="(555) 123-4567"
              />
              {!phoneSaved && phoneValue.trim() && (
                <button
                  onClick={handleSavePhone}
                  disabled={saving === 'phone'}
                  className="px-3 py-2.5 text-xs font-medium text-primary bg-cyan-500/10 border border-primary/20 rounded-lg hover:bg-blue-100 transition-colors disabled:opacity-50"
                >
                  {saving === 'phone' ? 'Saving...' : 'Save'}
                </button>
              )}
              {phoneSaved && (
                <span className="flex items-center gap-1 text-xs text-emerald-600 font-medium">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Saved
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground/70 mt-1.5">This will be used as the Agent CRM # in the roster</p>
          </div>

          <div className="border-t border-border/50 pt-5">
            <div className="flex items-center gap-2 mb-3">
              <Settings className="w-4 h-4 text-muted-foreground/70" />
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Subaccount Setup</span>
            </div>
            <div className="space-y-3">
              {SETUP_TASKS.map((task) => {
                const checked = agency[task.key];
                const isSaving = saving === task.key;
                return (
                  <label
                    key={task.key}
                    className={`flex items-center gap-3 p-3 rounded-lg border transition-all cursor-pointer ${
                      checked
                        ? 'bg-emerald-500/10 border-emerald-500/20'
                        : 'bg-muted border-border hover:border-border'
                    } ${isSaving ? 'opacity-60 pointer-events-none' : ''}`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => handleToggle(task.key)}
                      className="w-4.5 h-4.5 rounded border-border text-primary focus:ring-ring cursor-pointer"
                    />
                    <span className={`text-sm font-medium flex-1 ${checked ? 'text-emerald-400 line-through' : 'text-foreground/80'}`}>
                      {task.label}
                    </span>
                    {'link' in task && (
                      <a
                        href={task.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="text-xs font-medium text-primary hover:underline"
                      >
                        Open Zapier
                      </a>
                    )}
                  </label>
                );
              })}
            </div>
          </div>

          {agency.setup_snapshot && (
            <div className="border-t border-border/50 pt-5">
              <div className="flex items-center gap-2 mb-3">
                <Building2 className="w-4 h-4 text-muted-foreground/70" />
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Business Details</span>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-foreground/80 mb-1.5">Business Name</label>
                  <input
                    type="text"
                    value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                    className="w-full max-w-sm px-4 py-2.5 border border-border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring text-sm"
                    placeholder="Agency business name"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-sm font-medium text-foreground/80">Business Logo URL <span className="text-muted-foreground/70 font-normal">(optional)</span></label>
                    <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={logoUnavailable}
                        onChange={(e) => setLogoUnavailable(e.target.checked)}
                        className="rounded border-border"
                      />
                      Unavailable
                    </label>
                  </div>
                  <input
                    type="url"
                    value={businessLogoUrl}
                    onChange={(e) => setBusinessLogoUrl(e.target.value)}
                    disabled={logoUnavailable}
                    className="w-full px-4 py-2.5 border border-border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring text-sm disabled:bg-secondary disabled:text-muted-foreground/70"
                    placeholder={logoUnavailable ? 'Marked unavailable' : 'https://example.com/logo.png'}
                  />
                  {!logoUnavailable && businessLogoUrl.trim() && (
                    <div className="mt-3 flex items-center gap-3">
                      <div className="w-12 h-12 rounded-lg border border-border bg-muted flex items-center justify-center overflow-hidden">
                        <img
                          src={businessLogoUrl.trim()}
                          alt="Logo preview"
                          className="w-full h-full object-contain"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                          onLoad={(e) => { (e.target as HTMLImageElement).style.display = 'block'; }}
                        />
                      </div>
                      <span className="text-xs text-muted-foreground/70">Preview</span>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  {businessName.trim() && (businessLogoUrl.trim() || logoUnavailable) && (
                    <button
                      onClick={handleSaveBusinessDetails}
                      disabled={saving === 'business_details'}
                      className="px-4 py-2 text-xs font-medium text-primary bg-cyan-500/10 border border-primary/20 rounded-lg hover:bg-blue-100 transition-colors disabled:opacity-50"
                    >
                      {saving === 'business_details'
                        ? 'Saving...'
                        : businessDetailsSaved
                        ? 'Update Business Details'
                        : 'Save Business Details'}
                    </button>
                  )}
                  {businessDetailsSaved && saving !== 'business_details' && (
                    <span className="flex items-center gap-1 text-xs text-emerald-600 font-medium">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Saved
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

          {agency.setup_snapshot && (
            <div className="border-t border-border/50 pt-5">
              <div className="flex items-center gap-2 mb-3">
                <Calendar className="w-4 h-4 text-muted-foreground/70" />
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Calendar & Agency URL</span>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-foreground/80 mb-1.5">Calendar Embed Code</label>
                  <textarea
                    value={calendarEmbed}
                    onChange={(e) => setCalendarEmbed(e.target.value)}
                    rows={3}
                    className="w-full px-4 py-2.5 border border-border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring text-sm font-mono"
                    placeholder='<iframe src="https://..." ...></iframe>'
                  />
                  <p className="text-xs text-muted-foreground/70 mt-1">This will be applied to all 200 roster rows</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground/80 mb-1.5">Agency URL Prefix</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={urlPrefix}
                      onChange={(e) => setUrlPrefix(e.target.value)}
                      className="flex-1 max-w-xs px-4 py-2.5 border border-border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring text-sm"
                      placeholder="agencyname"
                    />
                    <span className="text-sm text-muted-foreground">.my-agent-appt.com</span>
                  </div>
                  {urlPrefix.trim() && (
                    <div className="mt-2 p-3 bg-muted rounded-lg border border-border">
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <Globe className="w-3.5 h-3.5 text-muted-foreground/70" />
                        <span className="text-xs font-medium text-muted-foreground">URL Preview (Seat 1)</span>
                      </div>
                      <p className="text-xs text-muted-foreground font-mono">{urlPrefix.trim()}.my-agent-appt.com/r1-click-to-schedule</p>
                      <p className="text-xs text-muted-foreground font-mono">{urlPrefix.trim()}.my-agent-appt.com/r1-youre-confirmed</p>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  {!calendarUrlSaved && calendarEmbed.trim() && urlPrefix.trim() && (
                    <button
                      onClick={handleSaveCalendarUrl}
                      disabled={saving === 'calendar_url'}
                      className="px-4 py-2 text-xs font-medium text-primary bg-cyan-500/10 border border-primary/20 rounded-lg hover:bg-blue-100 transition-colors disabled:opacity-50"
                    >
                      {saving === 'calendar_url' ? 'Saving...' : 'Save Calendar & URL'}
                    </button>
                  )}
                  {calendarUrlSaved && (
                    <span className="flex items-center gap-1 text-xs text-emerald-600 font-medium">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Saved
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="border-t border-border/50 pt-5">
            <div className="flex items-center gap-2 mb-3">
              <Zap className="w-4 h-4 text-muted-foreground/70" />
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Cross-Sell Products</span>
            </div>
            {!crossSellReady ? (
              <div className="flex items-start gap-3 p-4 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                <p className="text-sm text-amber-400">
                  Save the <span className="font-medium">Agency Phone Number</span> and <span className="font-medium">Calendar & URL Prefix</span> above before configuring cross-sell products.
                </p>
              </div>
            ) : (
              <div
                className={`rounded-lg border transition-all ${
                  crossSellConfirmed
                    ? 'bg-emerald-500/10 border-emerald-500/20'
                    : 'bg-muted border-border'
                }`}
              >
                <button
                  type="button"
                  onClick={() => setCrossSellExpanded(!crossSellExpanded)}
                  className="w-full flex items-center gap-3 p-3 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={crossSellConfirmed}
                    readOnly
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!crossSellConfirmed) {
                        setShowCrossSellConfirm(true);
                      } else {
                        setCrossSellConfirmed(false);
                        supabase
                          .from('hierarchy_agencies')
                          .update({ cross_sell_confirmed: false, updated_at: new Date().toISOString() })
                          .eq('id', agency.id)
                          .then(() => onRefresh());
                      }
                    }}
                    className="w-4.5 h-4.5 rounded border-border text-primary focus:ring-ring cursor-pointer"
                  />
                  <span className={`text-sm font-medium flex-1 text-left ${crossSellConfirmed ? 'text-emerald-400 line-through' : 'text-foreground/80'}`}>
                    Confirm Cross-Sell Products
                  </span>
                  <ChevronDown className={`w-4 h-4 text-muted-foreground/70 transition-transform ${crossSellExpanded ? 'rotate-180' : ''}`} />
                </button>
                {crossSellExpanded && (
                  <div className="px-3 pb-4 border-t border-border">
                    <CrossSellSection
                      agencyId={agency.id}
                      agencyName={agency.name}
                      csrFirstName={agency.csr_first_name}
                      csrLastName={agency.csr_last_name}
                      csrPhone={agency.csr_phone}
                      csrEmail={agency.csr_email}
                      agencyPhone={agency.agency_phone}
                      agencyUrlPrefix={agency.agency_url_prefix}
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="pt-2">
            <button
              onClick={() => setShowConfirm(true)}
              disabled={!canComplete}
              className="w-full px-5 py-2.5 text-sm font-medium text-white bg-primary rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Complete & Unlock Roster Upload
            </button>
            <p className="text-xs text-muted-foreground/70 mt-2 text-center">Requires phone number, all setup tasks, calendar/URL, and cross-sell confirmation</p>
          </div>
        </div>
      </div>

      {showConfirm && (
        <ConfirmationModal
          title="Complete Phone & Subaccount Setup"
          message={
            <p>
              Confirm phone number <span className="font-semibold">{phoneValue.trim()}</span> and
              subaccount setup for <span className="font-semibold">{agency.name}</span>?
              This will unlock the Agent Roster Upload step.
            </p>
          }
          confirmLabel="Complete & Continue"
          onConfirm={handleComplete}
          onCancel={() => setShowConfirm(false)}
          loading={confirming}
        />
      )}
      {showCrossSellConfirm && (
        <ConfirmationModal
          title="Confirm Cross-Sell Products"
          message={
            <div className="space-y-2">
              <p>
                Are all cross-sell products configured correctly for <span className="font-semibold">{agency.name}</span>?
              </p>
              <p className="text-muted-foreground text-xs">
                Please verify that product names, content, and specialist details are accurate before continuing. You can expand the section above to review.
              </p>
            </div>
          }
          confirmLabel="Confirm Products"
          onConfirm={async () => {
            const { data: products } = await supabase
              .from('crm_agency_cross_sell')
              .select('product_number, product_name, fields')
              .eq('agency_id', agency.id)
              .order('product_number');

            if (products && products.length > 0) {
              await fireCrossSellConfirmWebhook({
                agency: agency.name,
                businessName: agency.business_name || '',
                businessLogoUrl: agency.business_logo_url || '',
                csrFirstName: agency.csr_first_name || '',
                csrLastName: agency.csr_last_name || '',
                csrPhone: agency.csr_phone || '',
                csrEmail: agency.csr_email || '',
                agencyPhone: agency.agency_phone || '',
                agencyUrlPrefix: agency.agency_url_prefix || '',
                products: products.map(p => ({
                  product_number: p.product_number,
                  product_name: p.product_name,
                  fields: p.fields,
                })),
              });
            }

            await supabase
              .from('hierarchy_agencies')
              .update({ cross_sell_confirmed: true, updated_at: new Date().toISOString() })
              .eq('id', agency.id);

            setCrossSellConfirmed(true);
            setShowCrossSellConfirm(false);
            await onRefresh();
          }}
          onCancel={() => setShowCrossSellConfirm(false)}
        />
      )}
    </>
  );
};

const RosterStep: React.FC<{ agency: CrmAgency; onRefresh: () => void }> = ({ agency, onRefresh }) => {
  const [uploadedFile, setUploadedFile] = useState<{ name: string; rowCount: number } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const [showView, setShowView] = useState(false);
  const [viewData, setViewData] = useState<{ headers: string[]; rows: Record<string, unknown>[] } | null>(null);
  const [viewLoading, setViewLoading] = useState(false);
  const [showSendBack, setShowSendBack] = useState(false);
  const [sendBackReason, setSendBackReason] = useState('');
  const [sendingBack, setSendingBack] = useState(false);
  const [zapSending, setZapSending] = useState(false);
  const [zapProgress, setZapProgress] = useState({ sent: 0, total: 0, failed: 0 });
  const [zapResult, setZapResult] = useState<{ sent: number; failed: number; total: number } | null>(null);
  const [zapConfirmOpen, setZapConfirmOpen] = useState(false);

  const handleFireToZap = async () => {
    setZapConfirmOpen(false);
    setZapSending(true);
    setZapResult(null);

    const { data: agencyData } = await supabase
      .from('hierarchy_agencies')
      .select('zaps_paused')
      .eq('name', agency.name)
      .maybeSingle();

    if (agencyData?.zaps_paused) {
      setZapSending(false);
      setZapResult({ sent: 0, failed: 0, total: 0 });
      return;
    }

    const { data: uploads } = await supabase
      .from('crm_roster_uploads')
      .select('id, headers')
      .eq('agency', agency.name)
      .order('uploaded_at', { ascending: false })
      .limit(1);

    if (!uploads || uploads.length === 0) {
      setZapSending(false);
      setZapResult({ sent: 0, failed: 0, total: 0 });
      return;
    }

    const { data: rows } = await supabase
      .from('crm_roster')
      .select('row_data')
      .eq('upload_id', uploads[0].id)
      .order('created_at');

    const populatedRows = (rows || []).filter((r: { row_data: Record<string, string> }) => r.row_data['First Name']?.trim());

    if (populatedRows.length === 0) {
      setZapSending(false);
      setZapResult({ sent: 0, failed: 0, total: 0 });
      return;
    }

    const total = populatedRows.length;
    setZapProgress({ sent: 0, total, failed: 0 });

    await warmUpCrmOnboardingWebhook();
    await new Promise((r) => setTimeout(r, 1500));

    let sent = 0;
    let failed = 0;
    const failedRows: typeof populatedRows = [];

    for (const row of populatedRows) {
      const rd = row.row_data as Record<string, string>;
      const success = await fireCrmOnboardingWebhook({
        seatNumber: rd['Seat Number'] || '',
        agentNpn: rd['Agent NPN'] || '',
        firstName: rd['First Name'] || '',
        lastName: rd['Last Name'] || '',
        email: rd['Email'] || '',
        phone: rd['Phone'] || '',
        profileImage: rd['All Templates | Agent Profile Image'] || '',
        crmNumber: rd['All Templates | Agent CRM #'] || '',
        agency: agency.name,
        digitalBusinessCardUrl: rd['Digital Business Card Home Page'] || '',
        confirmationPageUrl: rd['Appt Booked Confirmation Page'] || '',
        calendarEmbedCode: rd['Calendar Embed Code'] || '',
      });

      if (success) {
        sent++;
      } else {
        failed++;
        failedRows.push(row);
      }
      setZapProgress({ sent, total, failed });
      await new Promise((r) => setTimeout(r, 3000));
    }

    if (failedRows.length > 0) {
      await new Promise((r) => setTimeout(r, 5000));
      for (const row of failedRows) {
        const rd = row.row_data as Record<string, string>;
        const success = await fireCrmOnboardingWebhook({
          seatNumber: rd['Seat Number'] || '',
          agentNpn: rd['Agent NPN'] || '',
          firstName: rd['First Name'] || '',
          lastName: rd['Last Name'] || '',
          email: rd['Email'] || '',
          phone: rd['Phone'] || '',
          profileImage: rd['All Templates | Agent Profile Image'] || '',
          crmNumber: rd['All Templates | Agent CRM #'] || '',
          agency: agency.name,
          digitalBusinessCardUrl: rd['Digital Business Card Home Page'] || '',
          confirmationPageUrl: rd['Appt Booked Confirmation Page'] || '',
          calendarEmbedCode: rd['Calendar Embed Code'] || '',
        });

        if (success) {
          sent++;
          failed--;
          setZapProgress({ sent, total, failed });
        }
        await new Promise((r) => setTimeout(r, 5000));
      }
    }

    setZapSending(false);
    setZapResult({ sent, failed, total });
  };

  const handleView = async () => {
    setViewLoading(true);
    setShowView(true);
    const { data: uploads } = await supabase
      .from('crm_roster_uploads')
      .select('id, headers')
      .eq('agency', agency.name)
      .order('uploaded_at', { ascending: false })
      .limit(1);
    if (uploads && uploads.length > 0) {
      const { data: rows } = await supabase
        .from('crm_roster')
        .select('row_data')
        .eq('upload_id', uploads[0].id)
        .order('created_at');
      setViewData({
        headers: (uploads[0].headers as string[]) || [],
        rows: (rows || []).map((r) => r.row_data as Record<string, unknown>),
      });
    }
    setViewLoading(false);
  };

  const handleSendBack = async () => {
    if (!sendBackReason.trim()) return;
    setSendingBack(true);
    const { data: uploads } = await supabase
      .from('crm_roster_uploads')
      .select('id')
      .eq('agency', agency.name);
    if (uploads) {
      for (const u of uploads) {
        await supabase.from('crm_roster').delete().eq('upload_id', u.id);
        await supabase.from('crm_roster_uploads').delete().eq('id', u.id);
      }
    }
    const now = new Date().toISOString();
    await supabase
      .from('hierarchy_agencies')
      .update({
        roster_confirmed: false,
        roster_sent_back_reason: sendBackReason.trim(),
        onboarding_status: 'awaiting_roster_upload',
        updated_at: now,
      })
      .eq('id', agency.id);
    await supabase.from('crm_notifications').insert({
      agency_id: agency.id,
      type: 'roster_sent_back',
      message: `Agent roster sent back for ${agency.name}: ${sendBackReason.trim()}`,
    });
    setSendingBack(false);
    setShowSendBack(false);
    setSendBackReason('');
    await onRefresh();
  };

  useEffect(() => {
    const load = async () => {
      const { data: existing } = await supabase
        .from('crm_roster_uploads')
        .select('file_name, row_count')
        .eq('agency', agency.name)
        .order('uploaded_at', { ascending: false })
        .limit(1);
      if (existing && existing.length > 0) {
        setUploadedFile({ name: existing[0].file_name, rowCount: existing[0].row_count });
      }
    };
    load();
  }, [agency.name]);

  const downloadRosterTemplate = () => {
    const csvHeader = ROSTER_TEMPLATE_HEADERS.map(escapeField).join(',');
    const blob = new Blob([csvHeader + '\n'], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'agent_roster_template.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError('');

    try {
      const text = await file.text();
      const { rows: rawRows } = parseCSV(text);
      if (rawRows.length === 0) {
        setError('CSV file appears to be empty or invalid.');
        setUploading(false);
        return;
      }

      const crmNumber = agency.crm_number || '';
      const { headers: canonicalHeaders, rows: normalizedRows } = normalizeRosterRows(rawRows, crmNumber, agency.csr_npn || undefined);

      const { data: existing } = await supabase
        .from('crm_roster_uploads')
        .select('id')
        .eq('agency', agency.name);
      if (existing && existing.length > 0) {
        for (const ex of existing) {
          await supabase.from('crm_roster_uploads').delete().eq('id', ex.id);
        }
      }

      const { data: uploadRecord, error: uploadError } = await supabase
        .from('crm_roster_uploads')
        .insert({ file_name: file.name, row_count: normalizedRows.length, headers: canonicalHeaders, agency: agency.name })
        .select()
        .maybeSingle();

      if (uploadError || !uploadRecord) throw uploadError || new Error('Failed to create upload');

      const BATCH_SIZE = 500;
      for (let i = 0; i < normalizedRows.length; i += BATCH_SIZE) {
        const batch = normalizedRows.slice(i, i + BATCH_SIZE).map((row) => ({ upload_id: uploadRecord.id, row_data: row }));
        await supabase.from('crm_roster').insert(batch);
      }

      await padRosterTo200(uploadRecord.id, canonicalHeaders, {
        calendarEmbedCode: agency.calendar_embed_code,
        agencyUrlPrefix: agency.agency_url_prefix,
      });

      await supabase.from('crm_notifications').insert({
        agency_id: agency.id,
        type: 'roster_uploaded',
        message: `${agency.name} uploaded their agent roster (${normalizedRows.length} rows) -- action required`,
      });

      if (agency.roster_sent_back_reason) {
        await supabase
          .from('hierarchy_agencies')
          .update({ roster_sent_back_reason: null, updated_at: new Date().toISOString() })
          .eq('id', agency.id);
      }

      setUploadedFile({ name: file.name, rowCount: normalizedRows.length });
    } catch {
      setError('Error uploading CSV. Please check the file and try again.');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleConfirm = async () => {
    setConfirming(true);
    const now = new Date().toISOString();

    await supabase
      .from('hierarchy_agencies')
      .update({ roster_confirmed: true, onboarding_status: 'awaiting_dba_upload', updated_at: now })
      .eq('id', agency.id);

    await supabase.from('crm_notifications').insert({
      agency_id: agency.id,
      type: 'roster_confirmed',
      message: `Agent roster confirmed for ${agency.name}`,
    });

    setConfirming(false);
    setShowConfirm(false);
    await onRefresh();
  };


  return (
    <>
      <div className="bg-card rounded-xl border border-border p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-9 h-9 rounded-lg bg-cyan-500/10 flex items-center justify-center">
            <Upload className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground">Step 2: Upload Agent Roster</h3>
            <p className="text-xs text-muted-foreground">Agency uploads their agent roster CSV</p>
          </div>
        </div>

        <div className="space-y-4">
          <button
            onClick={downloadRosterTemplate}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-primary bg-cyan-500/10 rounded-lg hover:bg-blue-100 transition-colors"
          >
            <Download className="w-4 h-4" />
            Download Agent Roster Template
          </button>

          <div>
            <div className="flex items-center gap-2 mb-2">
              <FileSpreadsheet className="w-4 h-4 text-muted-foreground/70" />
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Agency Action</span>
            </div>
            <input ref={fileRef} type="file" accept=".csv" onChange={handleUpload} className="hidden" />
            {!uploadedFile ? (
              <button
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="w-full flex flex-col items-center justify-center py-8 border-2 border-dashed border-border rounded-lg hover:border-primary/40 hover:bg-cyan-500/10/30 transition-colors cursor-pointer disabled:opacity-50"
              >
                <Upload className="w-8 h-8 text-muted-foreground/70 mb-2" />
                <p className="text-sm font-medium text-muted-foreground">
                  {uploading ? 'Uploading...' : 'Click to upload agent roster CSV'}
                </p>
              </button>
            ) : (
              <div className="flex items-center gap-3 p-4 bg-emerald-500/10 rounded-lg border border-emerald-500/20">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground">{uploadedFile.name}</p>
                  <p className="text-xs text-muted-foreground">{uploadedFile.rowCount} rows uploaded</p>
                </div>
                <button
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  className="text-xs font-medium text-primary hover:underline"
                >
                  Replace
                </button>
              </div>
            )}
            {error && <p className="text-sm text-red-400 mt-2">{error}</p>}
          </div>

          {uploadedFile && (
            <div className="pt-4 border-t border-border/50">
              <div className="flex items-center gap-2 mb-3">
                <Shield className="w-4 h-4 text-muted-foreground/70" />
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">CRM Team Action</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={handleView}
                  className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-foreground/80 glass rounded-lg hover:bg-muted transition-colors"
                >
                  <Eye className="w-4 h-4" />
                  View
                </button>
                {!agency.roster_confirmed && (
                  <button
                    onClick={() => setShowConfirm(true)}
                    className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-primary bg-cyan-500/10 border border-primary/20 rounded-lg hover:bg-blue-100 transition-colors"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    Confirm Roster Upload
                  </button>
                )}
                <button
                  onClick={() => setShowSendBack(true)}
                  className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg hover:bg-red-500/20 transition-colors"
                >
                  <Undo2 className="w-4 h-4" />
                  Send Back
                </button>
                {agency.roster_confirmed && (
                  <button
                    onClick={() => { setZapResult(null); setZapConfirmOpen(true); }}
                    disabled={zapSending}
                    className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-amber-500/100 rounded-lg hover:bg-amber-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Zap className="w-4 h-4" />
                    {zapSending
                      ? `Sending ${zapProgress.sent}/${zapProgress.total}...`
                      : 'Send to Zap'}
                  </button>
                )}
              </div>
              {!agency.roster_confirmed && (
                <p className="text-xs text-muted-foreground/70 mt-2">Confirm will lock in the roster and unlock Step 3</p>
              )}

              {zapSending && zapProgress.total > 0 && (
                <div className="mt-4">
                  <div className="flex items-center justify-between text-sm text-muted-foreground mb-1.5">
                    <span>Sending {zapProgress.sent + zapProgress.failed} of {zapProgress.total}...</span>
                    <span className="tabular-nums font-medium">
                      {Math.round(((zapProgress.sent + zapProgress.failed) / zapProgress.total) * 100)}%
                    </span>
                  </div>
                  <div className="w-full h-3 bg-secondary/80 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500 ease-out"
                      style={{
                        width: `${((zapProgress.sent + zapProgress.failed) / zapProgress.total) * 100}%`,
                        background: zapProgress.failed > 0
                          ? 'linear-gradient(90deg, #f59e0b, #ef4444)'
                          : 'linear-gradient(90deg, #f59e0b, #22c55e)',
                      }}
                    />
                  </div>
                  <div className="flex items-center gap-4 mt-1.5 text-xs text-muted-foreground">
                    <span className="text-emerald-400 font-medium">{zapProgress.sent} sent</span>
                    {zapProgress.failed > 0 && (
                      <span className="text-red-400 font-medium">{zapProgress.failed} failed</span>
                    )}
                  </div>
                </div>
              )}

              {zapResult && (
                <div className={`mt-4 px-4 py-3 rounded-lg text-sm font-medium ${
                  zapResult.failed === 0 && zapResult.sent > 0
                    ? 'bg-emerald-500/100/10 text-emerald-400 border border-green-200'
                    : zapResult.sent === 0
                    ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                    : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                }`}>
                  {zapResult.sent === 0 && zapResult.failed === 0
                    ? 'Zaps are paused for this agency. No rows were sent.'
                    : `Sent ${zapResult.sent} of ${zapResult.total} agents to Zap.${zapResult.failed > 0 ? ` ${zapResult.failed} failed.` : ''}`}
                  <button onClick={() => setZapResult(null)} className="ml-3 underline opacity-70 hover:opacity-100">Dismiss</button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {showConfirm && (
        <ConfirmationModal
          title="Confirm Agent Roster"
          message={
            <p>
              Are you sure you want to confirm the agent roster upload for{' '}
              <span className="font-semibold">{agency.name}</span>?
              This will unlock Step 3 (DBA Client Roster Upload).
            </p>
          }
          confirmLabel="Confirm"
          onConfirm={handleConfirm}
          onCancel={() => setShowConfirm(false)}
          loading={confirming}
        />
      )}

      {showSendBack && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-xl shadow-none max-w-md w-full">
            <div className="px-6 py-4 border-b border-border">
              <h2 className="text-lg font-bold text-foreground">Send Back Agent Roster</h2>
            </div>
            <div className="px-6 py-5 space-y-4">
              <p className="text-sm text-foreground/80">
                This will delete the uploaded roster and require{' '}
                <span className="font-semibold">{agency.name}</span> to re-upload.
              </p>
              <div>
                <label className="block text-sm font-medium text-foreground/80 mb-1">Reason *</label>
                <textarea
                  value={sendBackReason}
                  onChange={(e) => setSendBackReason(e.target.value)}
                  rows={3}
                  className="w-full px-4 py-2.5 border border-border rounded-lg focus:ring-2 focus:ring-red-500 focus:border-ring text-sm resize-none"
                  placeholder="Explain why the roster is being sent back..."
                />
              </div>
            </div>
            <div className="px-6 py-4 bg-muted rounded-b-xl flex justify-end gap-3">
              <button
                onClick={() => { setShowSendBack(false); setSendBackReason(''); }}
                disabled={sendingBack}
                className="px-4 py-2 text-sm font-medium text-foreground/80 glass rounded-lg hover:bg-muted transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSendBack}
                disabled={sendingBack || !sendBackReason.trim()}
                className="px-4 py-2 text-sm font-medium text-white bg-red-500 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                {sendingBack ? 'Sending...' : 'Send Back'}
              </button>
            </div>
          </div>
        </div>
      )}

      {zapConfirmOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-xl shadow-none max-w-md w-full">
            <div className="px-6 py-4 border-b border-border">
              <h2 className="text-lg font-bold text-amber-600">Send Roster to Zap</h2>
            </div>
            <div className="px-6 py-5">
              <p className="text-foreground/80">
                This will send the populated agent rows from the roster
                to the onboarding Zap for <span className="font-semibold">{agency.name}</span>, one at a time.
              </p>
              <p className="text-muted-foreground text-sm mt-2">Each row includes: Seat Number, First Name, Last Name, Email, Phone, Agent NPN, Profile Image, and CRM Number.</p>
            </div>
            <div className="px-6 py-4 bg-muted rounded-b-xl flex justify-end gap-3">
              <button
                onClick={() => setZapConfirmOpen(false)}
                className="px-4 py-2 text-sm font-medium text-foreground/80 glass rounded-lg hover:bg-muted transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleFireToZap}
                className="px-4 py-2 text-sm font-medium text-white bg-amber-500/100 rounded-lg hover:bg-amber-500 transition-colors"
              >
                Send All
              </button>
            </div>
          </div>
        </div>
      )}

      {showView && (
        <div className="fixed inset-0 bg-black/60 flex flex-col z-50">
          <div className="flex items-center justify-between px-6 py-4 bg-card border-b border-border">
            <div>
              <h2 className="text-lg font-bold text-foreground">Agent Roster - {agency.name}</h2>
              {uploadedFile && (
                <p className="text-xs text-muted-foreground">{uploadedFile.name} -- {uploadedFile.rowCount} rows</p>
              )}
            </div>
            <button
              onClick={() => { setShowView(false); setViewData(null); }}
              className="p-2 text-muted-foreground hover:text-foreground/80 hover:bg-secondary rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="flex-1 overflow-auto bg-muted p-6">
            {viewLoading ? (
              <div className="flex items-center justify-center h-64">
                <p className="text-sm text-muted-foreground">Loading roster data...</p>
              </div>
            ) : viewData && viewData.headers.length > 0 ? (
              <div className="bg-card rounded-lg border border-border overflow-auto">
                <table className="min-w-full divide-y divide-border text-sm">
                  <thead className="bg-muted sticky top-0">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">#</th>
                      {viewData.headers.map((h) => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {viewData.rows.map((row, i) => (
                      <tr key={i} className="hover:bg-muted">
                        <td className="px-4 py-2.5 text-muted-foreground/70 text-xs">{i + 1}</td>
                        {viewData.headers.map((h) => (
                          <td key={h} className="px-4 py-2.5 text-foreground/80 whitespace-nowrap">{String(row[h] ?? '')}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="flex items-center justify-center h-64">
                <p className="text-sm text-muted-foreground">No data found.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};

const DbaStep: React.FC<{ agency: CrmAgency; onRefresh: () => void }> = ({ agency, onRefresh }) => {
  const [templates, setTemplates] = useState<CrmTemplate[]>([]);
  const [uploadedFile, setUploadedFile] = useState<{ name: string; rowCount: number } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const [showView, setShowView] = useState(false);
  const [viewData, setViewData] = useState<{ headers: string[]; rows: Record<string, unknown>[] } | null>(null);
  const [viewLoading, setViewLoading] = useState(false);
  const [showSendBack, setShowSendBack] = useState(false);
  const [sendBackReason, setSendBackReason] = useState('');
  const [sendingBack, setSendingBack] = useState(false);
  const [savingNoDba, setSavingNoDba] = useState(false);
  const [noDbaRequested, setNoDbaRequested] = useState(false);

  const handleToggleNoDba = async () => {
    setSavingNoDba(true);
    const newValue = !noDbaRequested;
    if (newValue) {
      await supabase.from('crm_notifications').insert({
        agency_id: agency.id,
        type: 'no_dba_request',
        message: `${agency.name} marked as no DBA by CRM team -- approval required to complete onboarding`,
      });
    } else {
      await supabase
        .from('crm_notifications')
        .delete()
        .eq('agency_id', agency.id)
        .eq('type', 'no_dba_request')
        .eq('is_read', false);
    }
    setNoDbaRequested(newValue);
    setSavingNoDba(false);
  };

  const handleConfirmNoDba = async () => {
    setConfirming(true);
    const now = new Date().toISOString();
    await supabase
      .from('hierarchy_agencies')
      .update({ dba_confirmed: true, onboarding_status: 'onboarding_complete', updated_at: now })
      .eq('id', agency.id);
    await supabase
      .from('crm_notifications')
      .update({ is_read: true })
      .eq('agency_id', agency.id)
      .eq('type', 'no_dba_request');
    await supabase.from('crm_notifications').insert({
      agency_id: agency.id,
      type: 'dba_confirmed',
      message: `Onboarding completed for ${agency.name} without a DBA (no DBA on file) -- CRM approved`,
    });
    setConfirming(false);
    await onRefresh();
  };

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.from('crm_templates').select('*').order('name');
      setTemplates(data || []);

      const { data: existing } = await supabase
        .from('crm_dba_uploads')
        .select('file_name, row_count')
        .eq('agency', agency.name)
        .limit(1);
      if (existing && existing.length > 0) {
        setUploadedFile({ name: existing[0].file_name, rowCount: existing[0].row_count });
      }

      const { data: pendingNoDba } = await supabase
        .from('crm_notifications')
        .select('id')
        .eq('agency_id', agency.id)
        .eq('type', 'no_dba_request')
        .eq('is_read', false)
        .limit(1);
      if (pendingNoDba && pendingNoDba.length > 0) {
        setNoDbaRequested(true);
      }
    };
    load();
  }, [agency.name, agency.id]);

  const downloadTemplate = (template: CrmTemplate) => {
    const csvHeader = template.headers.map(escapeField).join(',');
    const blob = new Blob([csvHeader + '\n'], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = template.file_name || `${template.name}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError('');

    try {
      const text = await file.text();
      const { headers, rows } = parseCSV(text);
      if (headers.length === 0 || rows.length === 0) {
        setError('CSV file appears to be empty or invalid.');
        setUploading(false);
        return;
      }

      await supabase.from('crm_dba_uploads').delete().eq('agency', agency.name);

      const { data: uploadRecord, error: uploadError } = await supabase
        .from('crm_dba_uploads')
        .insert({ agency: agency.name, file_name: file.name, row_count: rows.length, headers })
        .select()
        .maybeSingle();

      if (uploadError || !uploadRecord) throw uploadError || new Error('Failed to create upload');

      const BATCH_SIZE = 500;
      for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        const batch = rows.slice(i, i + BATCH_SIZE).map((row) => ({ upload_id: uploadRecord.id, row_data: row }));
        await supabase.from('crm_dba_rows').insert(batch);
      }

      await supabase.from('crm_notifications').insert({
        agency_id: agency.id,
        type: 'dba_uploaded',
        message: `${agency.name} uploaded their DBA client roster (${rows.length} rows) -- action required`,
      });

      if (agency.dba_sent_back_reason) {
        await supabase
          .from('hierarchy_agencies')
          .update({ dba_sent_back_reason: null, updated_at: new Date().toISOString() })
          .eq('id', agency.id);
      }

      setUploadedFile({ name: file.name, rowCount: rows.length });
    } catch {
      setError('Error uploading CSV. Please check the file and try again.');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleConfirm = async () => {
    setConfirming(true);
    const now = new Date().toISOString();
    await supabase
      .from('hierarchy_agencies')
      .update({
        dba_confirmed: true,
        onboarding_status: 'onboarding_complete',
        updated_at: now,
      })
      .eq('id', agency.id);

    await supabase.from('crm_notifications').insert({
      agency_id: agency.id,
      type: 'dba_confirmed',
      message: `DBA client roster confirmed for ${agency.name} -- onboarding complete`,
    });

    setConfirming(false);
    setShowConfirm(false);
    await onRefresh();
  };

  const handleView = async () => {
    setViewLoading(true);
    setShowView(true);
    const { data: uploads } = await supabase
      .from('crm_dba_uploads')
      .select('id, headers')
      .eq('agency', agency.name)
      .limit(1);
    if (uploads && uploads.length > 0) {
      const { data: rows } = await supabase
        .from('crm_dba_rows')
        .select('row_data')
        .eq('upload_id', uploads[0].id)
        .order('created_at');
      setViewData({
        headers: (uploads[0].headers as string[]) || [],
        rows: (rows || []).map((r) => r.row_data as Record<string, unknown>),
      });
    }
    setViewLoading(false);
  };

  const handleSendBack = async () => {
    if (!sendBackReason.trim()) return;
    setSendingBack(true);
    const { data: uploads } = await supabase
      .from('crm_dba_uploads')
      .select('id')
      .eq('agency', agency.name);
    if (uploads) {
      for (const u of uploads) {
        await supabase.from('crm_dba_rows').delete().eq('upload_id', u.id);
        await supabase.from('crm_dba_uploads').delete().eq('id', u.id);
      }
    }
    const now = new Date().toISOString();
    await supabase
      .from('hierarchy_agencies')
      .update({
        dba_confirmed: false,
        dba_sent_back_reason: sendBackReason.trim(),
        onboarding_status: 'awaiting_dba_upload',
        updated_at: now,
      })
      .eq('id', agency.id);
    await supabase.from('crm_notifications').insert({
      agency_id: agency.id,
      type: 'dba_sent_back',
      message: `DBA client roster sent back for ${agency.name}: ${sendBackReason.trim()}`,
    });
    setSendingBack(false);
    setShowSendBack(false);
    setSendBackReason('');
    await onRefresh();
  };

  const dbaTemplate = templates.find((t) => t.name.toLowerCase().includes('dba'));

  return (
    <>
      <div className="bg-card rounded-xl border border-border p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-9 h-9 rounded-lg bg-cyan-500/10 flex items-center justify-center">
            <Database className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground">Step 3: Upload DBA Client Roster</h3>
            <p className="text-xs text-muted-foreground">Agency uploads their DBA client roster CSV</p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="p-4 bg-muted rounded-lg border border-border space-y-3">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-foreground">No DBA for this agency</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {noDbaRequested
                    ? 'ON — this agency has no DBA. CRM approval completes onboarding without an upload.'
                    : 'OFF — normal flow: agency uploads a DBA roster and CRM confirms it.'}
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={noDbaRequested}
                onClick={handleToggleNoDba}
                disabled={savingNoDba || agency.dba_confirmed}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${noDbaRequested ? 'bg-emerald-500/100' : 'bg-muted-foreground/30'}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-card transition-transform ${noDbaRequested ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>
            {noDbaRequested && !agency.dba_confirmed && (
              <button
                onClick={handleConfirmNoDba}
                disabled={confirming}
                className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-emerald-500 rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50"
              >
                <CheckCircle2 className="w-4 h-4" />
                {confirming ? 'Completing...' : 'Approve & Complete Onboarding (No DBA)'}
              </button>
            )}
          </div>

          {dbaTemplate && (
            <button
              onClick={() => downloadTemplate(dbaTemplate)}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-primary bg-cyan-500/10 rounded-lg hover:bg-blue-100 transition-colors"
            >
              <Download className="w-4 h-4" />
              Download DBA Template
            </button>
          )}

          <div>
            <div className="flex items-center gap-2 mb-2">
              <FileSpreadsheet className="w-4 h-4 text-muted-foreground/70" />
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Agency Action</span>
            </div>
            <input ref={fileRef} type="file" accept=".csv" onChange={handleUpload} className="hidden" />
            {!uploadedFile ? (
              <button
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="w-full flex flex-col items-center justify-center py-8 border-2 border-dashed border-border rounded-lg hover:border-primary/40 hover:bg-cyan-500/10/30 transition-colors cursor-pointer disabled:opacity-50"
              >
                <Upload className="w-8 h-8 text-muted-foreground/70 mb-2" />
                <p className="text-sm font-medium text-muted-foreground">
                  {uploading ? 'Uploading...' : 'Click to upload DBA client roster CSV'}
                </p>
              </button>
            ) : (
              <div className="flex items-center gap-3 p-4 bg-emerald-500/10 rounded-lg border border-emerald-500/20">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground">{uploadedFile.name}</p>
                  <p className="text-xs text-muted-foreground">{uploadedFile.rowCount} rows uploaded</p>
                </div>
                <button
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  className="text-xs font-medium text-primary hover:underline"
                >
                  Replace
                </button>
              </div>
            )}
            {error && <p className="text-sm text-red-400 mt-2">{error}</p>}
          </div>

          {uploadedFile && (
            <div className="pt-4 border-t border-border/50">
              <div className="flex items-center gap-2 mb-3">
                <Shield className="w-4 h-4 text-muted-foreground/70" />
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">CRM Team Action</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={handleView}
                  className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-foreground/80 glass rounded-lg hover:bg-muted transition-colors"
                >
                  <Eye className="w-4 h-4" />
                  View
                </button>
                {!agency.dba_confirmed && (
                  <button
                    onClick={() => setShowConfirm(true)}
                    className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-primary bg-cyan-500/10 border border-primary/20 rounded-lg hover:bg-blue-100 transition-colors"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    Confirm DBA Upload
                  </button>
                )}
                <button
                  onClick={() => setShowSendBack(true)}
                  className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg hover:bg-red-500/20 transition-colors"
                >
                  <Undo2 className="w-4 h-4" />
                  Send Back
                </button>
              </div>
              {!agency.dba_confirmed && (
                <p className="text-xs text-muted-foreground/70 mt-2">Confirm will complete the onboarding process</p>
              )}
            </div>
          )}
        </div>
      </div>

      {showConfirm && (
        <ConfirmationModal
          title="Confirm DBA Client Roster"
          message={
            <p>
              Are you sure you want to confirm the DBA client roster for{' '}
              <span className="font-semibold">{agency.name}</span>?
              This will mark onboarding as complete.
            </p>
          }
          confirmLabel="Confirm & Complete"
          confirmColor="bg-emerald-500 hover:bg-emerald-700"
          onConfirm={handleConfirm}
          onCancel={() => setShowConfirm(false)}
          loading={confirming}
        />
      )}

      {showSendBack && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-xl shadow-none max-w-md w-full">
            <div className="px-6 py-4 border-b border-border">
              <h2 className="text-lg font-bold text-foreground">Send Back DBA Roster</h2>
            </div>
            <div className="px-6 py-5 space-y-4">
              <p className="text-sm text-foreground/80">
                This will delete the uploaded DBA roster and require{' '}
                <span className="font-semibold">{agency.name}</span> to re-upload.
              </p>
              <div>
                <label className="block text-sm font-medium text-foreground/80 mb-1">Reason *</label>
                <textarea
                  value={sendBackReason}
                  onChange={(e) => setSendBackReason(e.target.value)}
                  rows={3}
                  className="w-full px-4 py-2.5 border border-border rounded-lg focus:ring-2 focus:ring-red-500 focus:border-ring text-sm resize-none"
                  placeholder="Explain why the DBA roster is being sent back..."
                />
              </div>
            </div>
            <div className="px-6 py-4 bg-muted rounded-b-xl flex justify-end gap-3">
              <button
                onClick={() => { setShowSendBack(false); setSendBackReason(''); }}
                disabled={sendingBack}
                className="px-4 py-2 text-sm font-medium text-foreground/80 glass rounded-lg hover:bg-muted transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSendBack}
                disabled={sendingBack || !sendBackReason.trim()}
                className="px-4 py-2 text-sm font-medium text-white bg-red-500 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                {sendingBack ? 'Sending...' : 'Send Back'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showView && (
        <div className="fixed inset-0 bg-black/60 flex flex-col z-50">
          <div className="flex items-center justify-between px-6 py-4 bg-card border-b border-border">
            <div>
              <h2 className="text-lg font-bold text-foreground">DBA Client Roster - {agency.name}</h2>
              {uploadedFile && (
                <p className="text-xs text-muted-foreground">{uploadedFile.name} -- {uploadedFile.rowCount} rows</p>
              )}
            </div>
            <button
              onClick={() => { setShowView(false); setViewData(null); }}
              className="p-2 text-muted-foreground hover:text-foreground/80 hover:bg-secondary rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="flex-1 overflow-auto bg-muted p-6">
            {viewLoading ? (
              <div className="flex items-center justify-center h-64">
                <p className="text-sm text-muted-foreground">Loading roster data...</p>
              </div>
            ) : viewData && viewData.headers.length > 0 ? (
              <div className="bg-card rounded-lg border border-border overflow-auto">
                <table className="min-w-full divide-y divide-border text-sm">
                  <thead className="bg-muted sticky top-0">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">#</th>
                      {viewData.headers.map((h) => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {viewData.rows.map((row, i) => (
                      <tr key={i} className="hover:bg-muted">
                        <td className="px-4 py-2.5 text-muted-foreground/70 text-xs">{i + 1}</td>
                        {viewData.headers.map((h) => (
                          <td key={h} className="px-4 py-2.5 text-foreground/80 whitespace-nowrap">{String(row[h] ?? '')}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="flex items-center justify-center h-64">
                <p className="text-sm text-muted-foreground">No data found.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};
