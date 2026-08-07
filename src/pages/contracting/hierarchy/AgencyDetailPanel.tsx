/**
 * AgencyDetailPanel — Side panel with sub-tabs for agency detail:
 * Onboarding, Roster, Carriers, CRM.
 *
 * Extracted from ContractingHierarchyTab.tsx (Group 1 decomposition).
 * All data reads/writes go through portalSupabase (akhojh…).
 */
import React, { useState, useEffect, useRef } from 'react';
import {
  FileText,
  Users,
  Shield,
  Monitor,
  X,
  Save,
  Check,
  CheckCircle2,
  Circle,
  Phone,
  Mail,
  Calendar,
  Globe,
  Hash,
  User,
  AlertCircle,
  MapPin,
  StickyNote,
  Eye,
  EyeOff,
  Check as CheckIcon,
  ExternalLink,
  Link2,
  Send,
  Upload,
  UserPlus,
  Copy,
  Search,
  Plus,
  Trash2,
  AlertTriangle,
  Building2,
} from 'lucide-react';
import { portalSupabase } from '@/lib/portal-supabase';
import { parseCSV } from '@/lib/contracting/csvParser';
import { normalizeRosterRows } from '@/lib/contracting/rosterNormalizer';
import type {
  PortalCrmAgency,
  AgencyContact,
  AgencyNote,
} from '@/lib/contracting/types';
import { US_STATES } from '@/lib/contracting/types';

// ─── Agency detail side panel ──────────────────────────────────────────────

type DetailTab = 'onboarding' | 'roster' | 'crm' | 'carriers';

export const AgencyDetailPanel: React.FC<{
  agency: PortalCrmAgency;
  onClose: () => void;
  onAgencyUpdated: (updated: PortalCrmAgency) => void;
  onRefresh: () => void;
}> = ({ agency, onClose, onAgencyUpdated, onRefresh }) => {
  const [activeTab, setActiveTab] = useState<DetailTab>('onboarding');

  const tabs: { key: DetailTab; label: string; icon: React.FC<{ className?: string }> }[] = [
    { key: 'onboarding', label: 'Onboarding', icon: FileText },
    { key: 'roster', label: 'Roster', icon: Users },
    { key: 'carriers', label: 'Carriers', icon: Shield },
    { key: 'crm', label: 'CRM', icon: Monitor },
  ];

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex justify-end">
      <div className="w-full max-w-3xl bg-card border-l border-border shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-secondary/20">
          <div>
            <h2 className="text-lg font-bold text-foreground">{agency.name}</h2>
            <div className="flex items-center gap-2 mt-0.5">
              <span
                className={`text-xs px-2 py-0.5 rounded font-medium ${
                  agency.agency_type === 'main'
                    ? 'bg-secondary/30 text-primary'
                    : 'bg-secondary/40 text-foreground/80'
                }`}
              >
                {agency.agency_type === 'main' ? 'Main Agency' : 'Sub-Agency'}
              </span>
              {agency.crm_enabled && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-emerald-500/10 text-emerald-400">
                  <Monitor className="w-3 h-3" />
                  CRM Enabled
                </span>
              )}
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-secondary/30 rounded-lg transition-colors">
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        <div className="flex border-b border-border">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.key
                  ? 'border-primary text-primary bg-secondary/20'
                  : 'border-transparent text-muted-foreground hover:text-foreground/80 hover:bg-secondary/10'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto">
          {activeTab === 'onboarding' && (
            <ContractingOnboardingSubTab agency={agency} onAgencyUpdated={onAgencyUpdated} />
          )}
          {activeTab === 'roster' && <HierarchyRosterSubTab agency={agency} />}
          {activeTab === 'crm' && (
            <CrmToggleSubTab agency={agency} onAgencyUpdated={onAgencyUpdated} onRefresh={onRefresh} />
          )}
          {activeTab === 'carriers' && (
            <CarriersSubTab agency={agency} onAgencyUpdated={onAgencyUpdated} />
          )}
        </div>
      </div>
    </div>
  );
};

// ─── Onboarding sub-tab ─────────────────────────────────────────────────────

const ContractingOnboardingSubTab: React.FC<{
  agency: PortalCrmAgency;
  onAgencyUpdated: (updated: PortalCrmAgency) => void;
}> = ({ agency, onAgencyUpdated }) => {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [noteInput, setNoteInput] = useState('');
  const [notesSaving, setNotesSaving] = useState(false);
  const [notes, setNotes] = useState<AgencyNote[]>(
    Array.isArray(agency.internal_notes) ? agency.internal_notes : []
  );
  const noteInputRef = useRef<HTMLTextAreaElement>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [passwordCopied, setPasswordCopied] = useState(false);
  const [hasRoster, setHasRoster] = useState(false);
  const [form, setForm] = useState({
    agency_phone: agency.agency_phone || '',
    business_name: agency.business_name || '',
    agency_npn: agency.agency_npn || '',
    agency_ein: agency.agency_ein || '',
    principal_agent: agency.principal_agent || '',
    principal_agent_npn: agency.principal_agent_npn || '',
    contracting_email: agency.contracting_email || '',
    contracting_contact: agency.contracting_contact || '',
    street_address: agency.street_address || '',
    city: agency.city || '',
    agency_state: agency.agency_state || '',
    zip: agency.zip || '',
  });
  const [additionalContacts, setAdditionalContacts] = useState<AgencyContact[]>(
    agency.additional_contacts ?? []
  );

  const isFym = agency.name.toLowerCase() === 'fym';
  const isRoot = agency.agency_type === 'main';
  const showContractingRequired = !isFym && !isRoot;

  useEffect(() => {
    checkRoster();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agency.name]);

  const checkRoster = async () => {
    if (!portalSupabase) return;
    const { data } = await (portalSupabase as any)
      .from('crm_roster_uploads')
      .select('id')
      .eq('agency', agency.name)
      .limit(1);
    setHasRoster((data || []).length > 0);
  };

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  const handleCopyPassword = () => {
    if (!agency.portal_password) return;
    navigator.clipboard.writeText(agency.portal_password).then(() => {
      setPasswordCopied(true);
      setTimeout(() => setPasswordCopied(false), 2000);
    });
  };

  const handleSave = async () => {
    if (!portalSupabase) return;
    if (form.contracting_email.trim() && !emailRegex.test(form.contracting_email.trim())) {
      setEmailError('Please enter a valid email address.');
      return;
    }
    setEmailError('');
    setSaving(true);
    const cleanedContacts = additionalContacts.filter((c) => c.name.trim());
    const { error } = await (portalSupabase as any)
      .from('hierarchy_agencies')
      .update({
        agency_phone: form.agency_phone.trim() || null,
        business_name: form.business_name.trim() || null,
        agency_npn: form.agency_npn.trim() || null,
        agency_ein: form.agency_ein.trim() || null,
        principal_agent: form.principal_agent.trim() || null,
        principal_agent_npn: form.principal_agent_npn.trim() || null,
        contracting_email: form.contracting_email.trim() || null,
        contracting_contact: form.contracting_contact.trim() || null,
        street_address: form.street_address.trim() || null,
        city: form.city.trim() || null,
        agency_state: form.agency_state.trim() || null,
        zip: form.zip.trim() || null,
        additional_contacts: cleanedContacts,
        updated_at: new Date().toISOString(),
      })
      .eq('id', agency.id);

    if (!error) {
      onAgencyUpdated({
        ...agency,
        agency_phone: form.agency_phone.trim() || null,
        business_name: form.business_name.trim() || null,
        agency_npn: form.agency_npn.trim() || null,
        agency_ein: form.agency_ein.trim() || null,
        principal_agent: form.principal_agent.trim() || null,
        principal_agent_npn: form.principal_agent_npn.trim() || null,
        contracting_email: form.contracting_email.trim() || null,
        contracting_contact: form.contracting_contact.trim() || null,
        street_address: form.street_address.trim() || null,
        city: form.city.trim() || null,
        agency_state: form.agency_state.trim() || null,
        zip: form.zip.trim() || null,
        additional_contacts: cleanedContacts,
      });
      setAdditionalContacts(cleanedContacts);
      setEditing(false);
    }
    setSaving(false);
  };

  const contractingDetailsFilled = !!(
    agency.agency_npn?.trim() &&
    agency.agency_ein?.trim() &&
    agency.principal_agent?.trim() &&
    agency.principal_agent_npn?.trim() &&
    agency.contracting_email?.trim()
  );

  const steps = [
    {
      label: 'Agency Information Collected',
      done: true,
      detail: `Created on ${agency.date_created || agency.created_at?.slice(0, 10) || 'Unknown'}`,
    },
    ...(showContractingRequired
      ? [
          {
            label: 'Contracting Details Provided',
            done: contractingDetailsFilled,
            detail: contractingDetailsFilled
              ? `NPN: ${agency.agency_npn} | Principal: ${agency.principal_agent}`
              : 'Missing required contracting fields -- click Edit below to complete',
          },
        ]
      : []),
    {
      label: 'Contact Details Provided',
      done: !!agency.agency_phone?.trim(),
      detail: agency.agency_phone ? `Phone: ${agency.agency_phone}` : 'Phone number not yet provided',
    },
    {
      label: 'Agent Roster Uploaded',
      done: hasRoster,
      detail: hasRoster ? 'Roster file uploaded' : 'No roster uploaded yet',
    },
    {
      label: 'Ready for Production',
      done: hasRoster && !!agency.agency_phone?.trim() && (contractingDetailsFilled || !showContractingRequired),
      detail:
        hasRoster && agency.agency_phone?.trim() && (contractingDetailsFilled || !showContractingRequired)
          ? 'All prerequisites met'
          : 'Complete above steps first',
    },
  ];

  const completedCount = steps.filter((s) => s.done).length;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-foreground">Contracting Onboarding</h3>
          <p className="text-sm text-muted-foreground mt-0.5">
            {completedCount}/{steps.length} steps completed
          </p>
        </div>
        <div className="w-12 h-12 rounded-full border-4 border-secondary/30 flex items-center justify-center relative">
          <svg className="absolute inset-0 w-12 h-12 -rotate-90">
            <circle cx="24" cy="24" r="18" fill="none" stroke="currentColor" className="text-secondary/30" strokeWidth="4" />
            <circle
              cx="24"
              cy="24"
              r="18"
              fill="none"
              stroke="currentColor"
              className="text-primary"
              strokeWidth="4"
              strokeDasharray={`${(completedCount / steps.length) * 113} 113`}
              strokeLinecap="round"
            />
          </svg>
          <span className="text-xs font-bold text-primary">
            {Math.round((completedCount / steps.length) * 100)}%
          </span>
        </div>
      </div>

      <div className="space-y-3">
        {steps.map((step, i) => (
          <div
            key={i}
            className={`flex items-start gap-3 p-3 rounded-lg border ${
              step.done ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-card border-border'
            }`}
          >
            {step.done ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-400 mt-0.5 flex-shrink-0" />
            ) : (
              <Circle className="w-5 h-5 text-muted-foreground mt-0.5 flex-shrink-0" />
            )}
            <div>
              <p className={`text-sm font-medium ${step.done ? 'text-emerald-400' : 'text-foreground/80'}`}>
                {step.label}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">{step.detail}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="border-t border-border pt-6">
        <div className="flex items-center justify-between mb-4">
          <h4 className="font-semibold text-foreground text-sm">Agency Details</h4>
          {!editing ? (
            <button onClick={() => setEditing(true)} className="text-xs text-primary hover:text-primary/80 font-medium">
              Edit
            </button>
          ) : (
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setEditing(false);
                  setEmailError('');
                }}
                className="text-xs text-muted-foreground hover:text-foreground/80"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 font-medium disabled:opacity-50"
              >
                <Save className="w-3 h-3" />
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          )}
        </div>

        {emailError && (
          <div className="mb-4 flex items-center gap-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
            {emailError}
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground flex items-center gap-1">
              <Building2 className="w-3 h-3" />
              Agency Name
            </label>
            <p className="text-sm font-medium text-foreground">{agency.name}</p>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              Date Created
            </label>
            <p className="text-sm font-medium text-foreground">
              {agency.date_created || agency.created_at?.slice(0, 10) || '--'}
            </p>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground flex items-center gap-1">
              <Phone className="w-3 h-3" />
              Agency Phone
            </label>
            {editing ? (
              <input
                type="tel"
                value={form.agency_phone}
                onChange={(e) => setForm((f) => ({ ...f, agency_phone: e.target.value }))}
                className="w-full px-3 py-1.5 text-sm border border-border rounded-md focus:ring-2 focus:ring-primary/40 focus:border-transparent bg-secondary/20 text-foreground"
                placeholder="(555) 123-4567"
              />
            ) : (
              <p className="text-sm font-medium text-foreground">{agency.agency_phone || '--'}</p>
            )}
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground flex items-center gap-1">
              <Globe className="w-3 h-3" />
              Business Name (DBA)
            </label>
            {editing ? (
              <input
                type="text"
                value={form.business_name}
                onChange={(e) => setForm((f) => ({ ...f, business_name: e.target.value }))}
                className="w-full px-3 py-1.5 text-sm border border-border rounded-md focus:ring-2 focus:ring-primary/40 focus:border-transparent bg-secondary/20 text-foreground"
                placeholder="Business name"
              />
            ) : (
              <p className="text-sm font-medium text-foreground">{agency.business_name || '--'}</p>
            )}
          </div>
        </div>
      </div>

      {/* Contracting Portal Access */}
      <div className="border-t border-border pt-6">
        <div className="flex items-center gap-2 mb-4">
          <Link2 className="w-4 h-4 text-muted-foreground" />
          <h4 className="font-semibold text-foreground text-sm">Contracting Portal Access</h4>
        </div>
        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Portal URL</label>
            {agency.slug ? (
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-foreground font-mono">
                  contracting.teamfym.com/agency/<span className="text-primary">{agency.slug}</span>
                </p>
                <a
                  href={`https://contracting.teamfym.com/agency/${agency.slug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-1 text-muted-foreground hover:text-primary transition-colors"
                  title="Open contracting portal"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground italic">Not assigned</p>
            )}
          </div>

          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Portal Password</label>
            {agency.portal_password ? (
              <div className="flex items-center gap-1.5">
                <p className="text-sm font-medium text-foreground font-mono tracking-wide select-all">
                  {showPassword ? agency.portal_password : '••••••••••••'}
                </p>
                <button
                  onClick={() => setShowPassword((v) => !v)}
                  className="p-1 text-muted-foreground hover:text-foreground/80 transition-colors"
                  title={showPassword ? 'Hide password' : 'Reveal password'}
                >
                  {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
                <button
                  onClick={handleCopyPassword}
                  className="p-1 text-muted-foreground hover:text-primary transition-colors"
                  title="Copy password"
                >
                  {passwordCopied ? (
                    <CheckIcon className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground italic">Not set</p>
            )}
          </div>
        </div>
      </div>

      {(agency.agency_state || agency.unl_writing_number || agency.unl_status) && (
        <div className="border-t border-border pt-6">
          <h4 className="font-semibold text-foreground text-sm mb-4">UNL Reference Data</h4>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">State</label>
              <p className="text-sm font-medium text-foreground">{agency.agency_state || '--'}</p>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">UNL Writing Number</label>
              <p className="text-sm font-medium text-foreground font-mono">
                {agency.unl_writing_number || '--'}
              </p>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">UNL Status</label>
              <p
                className={`text-sm font-medium ${
                  agency.unl_status === 'Active'
                    ? 'text-emerald-400'
                    : agency.unl_status === 'Terminated'
                      ? 'text-red-400'
                      : 'text-amber-400'
                }`}
              >
                {agency.unl_status || '--'}
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="border-t border-border pt-6">
        <div className="flex items-center gap-2 mb-4">
          <h4 className="font-semibold text-foreground text-sm">Contracting Details</h4>
          {showContractingRequired && !contractingDetailsFilled && (
            <span className="text-[10px] font-bold text-orange-400 bg-orange-500/10 px-2 py-0.5 rounded-full uppercase">
              Incomplete
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground flex items-center gap-1">
              <Hash className="w-3 h-3" />
              Agency NPN {showContractingRequired && <span className="text-red-400">*</span>}
            </label>
            {editing ? (
              <input
                type="text"
                value={form.agency_npn}
                onChange={(e) => setForm((f) => ({ ...f, agency_npn: e.target.value }))}
                className="w-full px-3 py-1.5 text-sm border border-border rounded-md focus:ring-2 focus:ring-primary/40 focus:border-transparent bg-secondary/20 text-foreground"
                placeholder="e.g. 12345678"
              />
            ) : (
              <p className={`text-sm font-medium ${agency.agency_npn ? 'text-foreground' : 'text-muted-foreground italic'}`}>
                {agency.agency_npn || 'Not provided'}
              </p>
            )}
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground flex items-center gap-1">
              <Hash className="w-3 h-3" />
              Agency EIN {showContractingRequired && <span className="text-red-400">*</span>}
            </label>
            {editing ? (
              <input
                type="text"
                value={form.agency_ein}
                onChange={(e) => setForm((f) => ({ ...f, agency_ein: e.target.value }))}
                className="w-full px-3 py-1.5 text-sm border border-border rounded-md focus:ring-2 focus:ring-primary/40 focus:border-transparent bg-secondary/20 text-foreground"
                placeholder="e.g. 12-3456789"
              />
            ) : (
              <p className={`text-sm font-medium ${agency.agency_ein ? 'text-foreground' : 'text-muted-foreground italic'}`}>
                {agency.agency_ein || 'Not provided'}
              </p>
            )}
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground flex items-center gap-1">
              <User className="w-3 h-3" />
              Principal Agent {showContractingRequired && <span className="text-red-400">*</span>}
            </label>
            {editing ? (
              <input
                type="text"
                value={form.principal_agent}
                onChange={(e) => setForm((f) => ({ ...f, principal_agent: e.target.value }))}
                className="w-full px-3 py-1.5 text-sm border border-border rounded-md focus:ring-2 focus:ring-primary/40 focus:border-transparent bg-secondary/20 text-foreground"
                placeholder="Full name"
              />
            ) : (
              <p className={`text-sm font-medium ${agency.principal_agent ? 'text-foreground' : 'text-muted-foreground italic'}`}>
                {agency.principal_agent || 'Not provided'}
              </p>
            )}
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground flex items-center gap-1">
              <Hash className="w-3 h-3" />
              Principal Agent NPN {showContractingRequired && <span className="text-red-400">*</span>}
            </label>
            {editing ? (
              <input
                type="text"
                value={form.principal_agent_npn}
                onChange={(e) => setForm((f) => ({ ...f, principal_agent_npn: e.target.value }))}
                className="w-full px-3 py-1.5 text-sm border border-border rounded-md focus:ring-2 focus:ring-primary/40 focus:border-transparent bg-secondary/20 text-foreground"
                placeholder="e.g. 87654321"
              />
            ) : (
              <p
                className={`text-sm font-medium ${agency.principal_agent_npn ? 'text-foreground' : 'text-muted-foreground italic'}`}
              >
                {agency.principal_agent_npn || 'Not provided'}
              </p>
            )}
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground flex items-center gap-1">
              <Mail className="w-3 h-3" />
              Contracting Email {showContractingRequired && <span className="text-red-400">*</span>}
            </label>
            {editing ? (
              <input
                type="email"
                value={form.contracting_email}
                onChange={(e) => {
                  setForm((f) => ({ ...f, contracting_email: e.target.value }));
                  setEmailError('');
                }}
                className="w-full px-3 py-1.5 text-sm border border-border rounded-md focus:ring-2 focus:ring-primary/40 focus:border-transparent bg-secondary/20 text-foreground"
                placeholder="email@example.com"
              />
            ) : (
              <p
                className={`text-sm font-medium ${agency.contracting_email ? 'text-foreground' : 'text-muted-foreground italic'}`}
              >
                {agency.contracting_email || 'Not provided'}
              </p>
            )}
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground flex items-center gap-1">
              <User className="w-3 h-3" />
              Contracting Contact
            </label>
            {editing ? (
              <input
                type="text"
                value={form.contracting_contact}
                onChange={(e) => setForm((f) => ({ ...f, contracting_contact: e.target.value }))}
                className="w-full px-3 py-1.5 text-sm border border-border rounded-md focus:ring-2 focus:ring-primary/40 focus:border-transparent bg-secondary/20 text-foreground"
                placeholder="If applicable"
              />
            ) : (
              <p
                className={`text-sm font-medium ${agency.contracting_contact ? 'text-foreground' : 'text-muted-foreground italic'}`}
              >
                {agency.contracting_contact || 'Not provided'}
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="border-t border-border pt-6">
        <div className="flex items-center gap-2 mb-4">
          <MapPin className="w-4 h-4 text-muted-foreground" />
          <h4 className="font-semibold text-foreground text-sm">Agency Address</h4>
        </div>
        {editing ? (
          <div className="space-y-3">
            <input
              type="text"
              value={form.street_address}
              onChange={(e) => setForm((f) => ({ ...f, street_address: e.target.value }))}
              className="w-full px-3 py-1.5 text-sm border border-border rounded-md focus:ring-2 focus:ring-primary/40 focus:border-transparent bg-secondary/20 text-foreground"
              placeholder="Street Address"
            />
            <div className="grid grid-cols-3 gap-2">
              <input
                type="text"
                value={form.city}
                onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
                className="col-span-1 px-3 py-1.5 text-sm border border-border rounded-md focus:ring-2 focus:ring-primary/40 focus:border-transparent bg-secondary/20 text-foreground"
                placeholder="City"
              />
              <select
                value={form.agency_state}
                onChange={(e) => setForm((f) => ({ ...f, agency_state: e.target.value }))}
                className="px-3 py-1.5 text-sm border border-border rounded-md focus:ring-2 focus:ring-primary/40 focus:border-transparent bg-secondary/20 text-foreground"
              >
                <option value="">State</option>
                {US_STATES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <input
                type="text"
                value={form.zip}
                onChange={(e) => setForm((f) => ({ ...f, zip: e.target.value }))}
                className="px-3 py-1.5 text-sm border border-border rounded-md focus:ring-2 focus:ring-primary/40 focus:border-transparent bg-secondary/20 text-foreground"
                placeholder="ZIP"
                maxLength={10}
              />
            </div>
          </div>
        ) : (
          <p className={`text-sm ${agency.street_address || agency.city ? 'text-foreground' : 'text-muted-foreground italic'}`}>
            {[agency.street_address, agency.city, agency.agency_state, agency.zip].filter(Boolean).join(', ') ||
              'Not provided'}
          </p>
        )}
      </div>

      <div className="border-t border-border pt-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-muted-foreground" />
            <h4 className="font-semibold text-foreground text-sm">Additional Contacts</h4>
          </div>
          {editing && (
            <button
              type="button"
              onClick={() =>
                setAdditionalContacts((prev) => [
                  ...prev,
                  { name: '', title: '', department: '', email: '', phone: '' },
                ])
              }
              className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 font-medium"
            >
              <Plus className="w-3.5 h-3.5" />
              Add
            </button>
          )}
        </div>

        {!editing && additionalContacts.length === 0 && (
          <p className="text-sm text-muted-foreground italic">No additional contacts on file.</p>
        )}

        {editing ? (
          <div className="space-y-3">
            {additionalContacts.length === 0 && (
              <p className="text-xs text-muted-foreground italic">No contacts — click Add above.</p>
            )}
            {additionalContacts.map((c, i) => (
              <div key={i} className="relative border border-border rounded-lg p-3 bg-secondary/10">
                <button
                  type="button"
                  onClick={() => setAdditionalContacts((prev) => prev.filter((_, idx) => idx !== i))}
                  className="absolute top-2.5 right-2.5 text-muted-foreground hover:text-red-400 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
                <p className="text-[10px] font-semibold text-muted-foreground uppercase mb-2">
                  Contact {i + 1}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {(['name', 'title', 'department', 'email', 'phone'] as (keyof AgencyContact)[]).map(
                    (field) => (
                      <input
                        key={field}
                        type={field === 'email' ? 'email' : field === 'phone' ? 'tel' : 'text'}
                        value={c[field]}
                        onChange={(e) =>
                          setAdditionalContacts((prev) =>
                            prev.map((ct, idx) => (idx === i ? { ...ct, [field]: e.target.value } : ct))
                          )
                        }
                        placeholder={field.charAt(0).toUpperCase() + field.slice(1)}
                        className="px-2.5 py-1.5 text-xs border border-border rounded-md focus:ring-1 focus:ring-primary/40 focus:border-transparent bg-secondary/20 text-foreground"
                      />
                    )
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {additionalContacts.map((c, i) => (
              <div key={i} className="text-sm">
                <span className="font-medium text-foreground">{c.name}</span>
                {c.title && <span className="text-muted-foreground"> · {c.title}</span>}
                {c.department && <span className="text-muted-foreground"> ({c.department})</span>}
                {c.email && <span className="text-muted-foreground"> · {c.email}</span>}
                {c.phone && <span className="text-muted-foreground"> · {c.phone}</span>}
              </div>
            ))}
          </div>
        )}
      </div>

      <InternalNotesSection
        agencyId={agency.id}
        notes={notes}
        onNotesChange={(updated) => {
          setNotes(updated);
          onAgencyUpdated({ ...agency, internal_notes: updated });
        }}
        noteInput={noteInput}
        setNoteInput={setNoteInput}
        notesSaving={notesSaving}
        setNotesSaving={setNotesSaving}
        noteInputRef={noteInputRef}
      />
    </div>
  );
};

function formatNoteTimestamp(iso: string): string {
  try {
    return (
      new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Chicago',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      }).format(new Date(iso)) + ' CT'
    );
  } catch {
    return iso;
  }
}

const InternalNotesSection: React.FC<{
  agencyId: string;
  notes: AgencyNote[];
  onNotesChange: (updated: AgencyNote[]) => void;
  noteInput: string;
  setNoteInput: (v: string) => void;
  notesSaving: boolean;
  setNotesSaving: (v: boolean) => void;
  noteInputRef: React.RefObject<HTMLTextAreaElement>;
}> = ({ agencyId, notes, onNotesChange, noteInput, setNoteInput, notesSaving, setNotesSaving, noteInputRef }) => {
  const [focused, setFocused] = useState(false);

  const handleAddNote = async () => {
    if (!portalSupabase) return;
    const text = noteInput.trim();
    if (!text) return;
    setNotesSaving(true);
    const newNote: AgencyNote = {
      text,
      created_at: new Date().toISOString(),
    };
    const updated = [newNote, ...notes];
    const { error } = await (portalSupabase as any)
      .from('hierarchy_agencies')
      .update({ internal_notes: updated, updated_at: new Date().toISOString() })
      .eq('id', agencyId);
    if (!error) {
      onNotesChange(updated);
      setNoteInput('');
      setFocused(false);
    }
    setNotesSaving(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleAddNote();
    }
    if (e.key === 'Escape') {
      setNoteInput('');
      setFocused(false);
      noteInputRef.current?.blur();
    }
  };

  return (
    <div className="border-t border-border pt-6">
      <div className="flex items-center gap-2 mb-4">
        <StickyNote className="w-4 h-4 text-muted-foreground" />
        <h4 className="font-semibold text-foreground text-sm">Internal Notes</h4>
        <span className="text-xs text-muted-foreground ml-auto">
          {notes.length > 0 ? `${notes.length} entr${notes.length === 1 ? 'y' : 'ies'}` : ''}
        </span>
      </div>

      <div
        className={`mb-4 rounded-lg border transition-all ${
          focused ? 'border-primary/40 ring-2 ring-primary/10 bg-card' : 'border-border bg-secondary/10 hover:border-border'
        }`}
      >
        <textarea
          ref={noteInputRef}
          value={noteInput}
          onChange={(e) => setNoteInput(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            if (!noteInput.trim()) setFocused(false);
          }}
          onKeyDown={handleKeyDown}
          rows={focused ? 3 : 1}
          placeholder="Add a note… (Cmd+Enter to save)"
          className="w-full px-3 py-2 text-sm bg-transparent border-none outline-none resize-none placeholder:text-muted-foreground text-foreground"
        />
        {focused && (
          <div className="flex items-center justify-between px-3 pb-2">
            <span className="text-[10px] text-muted-foreground">Cmd+Enter to save · Esc to cancel</span>
            <button
              onClick={handleAddNote}
              disabled={notesSaving || !noteInput.trim()}
              className="flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-md gradient-primary text-primary-foreground disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <Send className="w-3 h-3" />
              {notesSaving ? 'Saving…' : 'Add Note'}
            </button>
          </div>
        )}
      </div>

      {notes.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">No notes yet.</p>
      ) : (
        <div className="space-y-3">
          {notes.map((note, i) => (
            <div key={i} className="rounded-lg bg-amber-500/10 border border-amber-500/20 px-4 py-3">
              <p className="text-xs text-amber-400 font-medium mb-1">{formatNoteTimestamp(note.created_at)}</p>
              <p className="text-sm text-foreground whitespace-pre-wrap">{note.text}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ─── Roster sub-tab ─────────────────────────────────────────────────────────

const MALE_PROFILE_IMAGE =
  'https://storage.googleapis.com/msgsndr/YM9XmCanfO6p28b1sQOH/media/6882b3d23303840127a970fb.png';
const FEMALE_PROFILE_IMAGE =
  'https://storage.googleapis.com/msgsndr/YM9XmCanfO6p28b1sQOH/media/6882b3d2f665866357dfd218.png';

type RosterRow = {
  id: string;
  row_data: Record<string, string>;
};

const HierarchyRosterSubTab: React.FC<{ agency: PortalCrmAgency }> = ({ agency }) => {
  const [rows, setRows] = useState<RosterRow[]>([]);
  const [uploadId, setUploadId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [search, setSearch] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadRoster();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agency.name]);

  const loadRoster = async () => {
    if (!portalSupabase) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data: uploads } = await (portalSupabase as any)
      .from('crm_roster_uploads')
      .select('id, headers')
      .eq('agency', agency.name)
      .order('uploaded_at', { ascending: false })
      .limit(1);

    if (uploads && uploads.length > 0) {
      setUploadId(uploads[0].id);
      const { data: rosterRows } = await (portalSupabase as any)
        .from('crm_roster')
        .select('id, row_data')
        .eq('upload_id', uploads[0].id);

      const sorted = (rosterRows || []).sort((a: RosterRow, b: RosterRow) => {
        const aNum = parseInt(a.row_data['Seat Number'] || '', 10);
        const bNum = parseInt(b.row_data['Seat Number'] || '', 10);
        if (isNaN(aNum) && isNaN(bNum)) return 0;
        if (isNaN(aNum)) return 1;
        if (isNaN(bNum)) return -1;
        return aNum - bNum;
      });
      setRows(sorted);
    } else {
      setUploadId(null);
      setRows([]);
    }
    setLoading(false);
  };

  const handleUpload = async (file: File) => {
    if (!portalSupabase) return;
    setUploading(true);
    try {
      const text = await file.text();
      const { rows: rawRows } = parseCSV(text);
      if (rawRows.length === 0) {
        alert('CSV file appears to be empty or invalid.');
        setUploading(false);
        return;
      }

      const { data: agencyRecord } = await (portalSupabase as any)
        .from('hierarchy_agencies')
        .select('crm_number, csr_npn, calendar_embed_code, agency_url_prefix')
        .eq('name', agency.name)
        .maybeSingle();

      const crmNumber = agencyRecord?.crm_number || '';
      const { headers: canonicalHeaders, rows: normalizedRows } = normalizeRosterRows(
        rawRows,
        crmNumber,
        agencyRecord?.csr_npn || undefined
      );

      if (uploadId) {
        await (portalSupabase as any).from('crm_roster_uploads').delete().eq('id', uploadId);
      }

      const { data: uploadRecord, error: uploadError } = await (portalSupabase as any)
        .from('crm_roster_uploads')
        .insert({
          file_name: file.name,
          row_count: normalizedRows.length,
          headers: canonicalHeaders,
          agency: agency.name,
        })
        .select()
        .maybeSingle();

      if (uploadError || !uploadRecord) {
        throw uploadError || new Error('Failed to create upload record');
      }

      const BATCH_SIZE = 500;
      for (let i = 0; i < normalizedRows.length; i += BATCH_SIZE) {
        const batch = normalizedRows.slice(i, i + BATCH_SIZE).map((row) => ({
          upload_id: uploadRecord.id,
          row_data: row,
        }));
        await (portalSupabase as any).from('crm_roster').insert(batch);
      }

      await padRosterTo200(uploadRecord.id, canonicalHeaders, agencyRecord);
      await loadRoster();
    } catch (err) {
      console.error(err);
      alert('Error uploading CSV. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const padRosterTo200 = async (uploadIdVal: string, headers: string[], agencyRecord: any) => {
    if (!portalSupabase) return;
    const { data: existingRows } = await (portalSupabase as any)
      .from('crm_roster')
      .select('id, row_data')
      .eq('upload_id', uploadIdVal);

    const numericRows = (existingRows || []).filter((r: RosterRow) => /^\d+$/.test(r.row_data['Seat Number'] || ''));
    const occupiedSeats = new Set(numericRows.map((r: RosterRow) => Number(r.row_data['Seat Number'])));

    let crmNumber = '';
    const rowWithCrm = numericRows.find((r: RosterRow) => r.row_data['All Templates | Agent CRM #']?.trim());
    if (rowWithCrm) crmNumber = rowWithCrm.row_data['All Templates | Agent CRM #'];

    const calendarEmbed = agencyRecord?.calendar_embed_code?.trim() || '';
    const urlPrefix = agencyRecord?.agency_url_prefix?.trim() || '';

    const rowsToInsert: { upload_id: string; row_data: Record<string, string> }[] = [];
    for (let seat = 1; seat <= 200; seat++) {
      if (!occupiedSeats.has(seat)) {
        const row: Record<string, string> = {};
        for (const h of headers) row[h] = '';
        row['Seat Number'] = String(seat);
        if (crmNumber) row['All Templates | Agent CRM #'] = crmNumber;
        if (calendarEmbed) row['Calendar Embed Code'] = calendarEmbed;
        if (urlPrefix) {
          row['Digital Business Card Home Page'] = `https://${urlPrefix}.my-agent-appt.com/r${seat}-click-to-schedule`;
          row['Appt Booked Confirmation Page'] = `https://${urlPrefix}.my-agent-appt.com/r${seat}-youre-confirmed`;
        }
        rowsToInsert.push({ upload_id: uploadIdVal, row_data: row });
      }
    }

    const BATCH_SIZE = 500;
    for (let i = 0; i < rowsToInsert.length; i += BATCH_SIZE) {
      await (portalSupabase as any).from('crm_roster').insert(rowsToInsert.slice(i, i + BATCH_SIZE));
    }
  };

  const handleAddAgent = async (form: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    npn: string;
    gender: string;
  }) => {
    if (!portalSupabase) return 'Portal connection not configured.';
    if (!uploadId) return 'No roster exists. Upload a CSV first.';

    const openSeat = rows.find((r) => !r.row_data['First Name']?.trim() && r.row_data['Seat Number']?.trim());
    if (!openSeat) return 'No open seats available.';

    const profileImage = form.gender === 'Male' ? MALE_PROFILE_IMAGE : FEMALE_PROFILE_IMAGE;
    const crmNumber =
      rows.find((r) => r.row_data['All Templates | Agent CRM #']?.trim())?.row_data[
        'All Templates | Agent CRM #'
      ] || '';

    const updatedRowData = {
      ...openSeat.row_data,
      'First Name': form.firstName.trim(),
      'Last Name': form.lastName.trim(),
      Phone: form.phone.trim(),
      phone: form.phone.trim(),
      Email: form.email.trim(),
      email: form.email.trim(),
      'Agent NPN': form.npn.trim(),
      'All Templates | Agent CRM #': crmNumber,
      'All Templates | Agent Profile Image': profileImage,
      'CSR Placeholder': '',
    };

    const { error } = await (portalSupabase as any)
      .from('crm_roster')
      .update({ row_data: updatedRowData })
      .eq('id', openSeat.id);

    if (error) return 'Failed to assign seat.';
    await loadRoster();
    return null;
  };

  const populatedRows = rows.filter((r) => r.row_data['First Name']?.trim());
  const filteredRows = search
    ? populatedRows.filter((r) => {
        const name = `${r.row_data['First Name']} ${r.row_data['Last Name']}`.toLowerCase();
        return name.includes(search.toLowerCase());
      })
    : populatedRows;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-foreground">Agent Roster</h3>
          <p className="text-sm text-muted-foreground">{populatedRows.length}/200 seats filled</p>
        </div>
        <div className="flex gap-2">
          {uploadId && (
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium gradient-primary text-primary-foreground rounded-lg transition-colors"
            >
              <UserPlus className="w-4 h-4" />
              Add Agent
            </button>
          )}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium border border-border text-foreground/80 rounded-lg hover:bg-secondary/30 transition-colors disabled:opacity-50"
          >
            <Upload className="w-4 h-4" />
            {uploading ? 'Uploading...' : uploadId ? 'Replace CSV' : 'Upload CSV'}
          </button>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".csv"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleUpload(file);
          if (fileInputRef.current) fileInputRef.current.value = '';
        }}
      />

      {!uploadId ? (
        <div className="text-center py-12 border-2 border-dashed border-border rounded-lg">
          <Upload className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground mb-3">No roster uploaded for this agency</p>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="px-4 py-2 gradient-primary text-primary-foreground text-sm font-medium rounded-lg disabled:opacity-50"
          >
            Upload CSV
          </button>
        </div>
      ) : (
        <>
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search agents..."
              className="w-full pl-9 pr-4 py-2 text-sm border border-border rounded-lg focus:ring-2 focus:ring-primary/40 focus:border-transparent bg-secondary/20 text-foreground"
            />
          </div>

          <div className="space-y-1 max-h-[400px] overflow-y-auto">
            {filteredRows.map((row) => (
              <div
                key={row.id}
                className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-secondary/20 border border-transparent hover:border-border transition-colors"
              >
                <div className="w-8 h-8 rounded-full bg-secondary/30 flex items-center justify-center text-xs font-bold text-foreground/80">
                  {row.row_data['Seat Number']}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {row.row_data['First Name']} {row.row_data['Last Name']}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {row.row_data['Email'] || row.row_data['email'] || '--'}
                  </p>
                </div>
                <span className="text-xs text-muted-foreground">{row.row_data['Agent NPN'] || ''}</span>
              </div>
            ))}
            {filteredRows.length === 0 && (
              <p className="text-center text-sm text-muted-foreground py-8">
                {search ? 'No agents match your search.' : 'No agents on roster yet.'}
              </p>
            )}
          </div>
        </>
      )}

      {showAddModal && <AddAgentToRosterModal onClose={() => setShowAddModal(false)} onAdd={handleAddAgent} />}
    </div>
  );
};

const AddAgentToRosterModal: React.FC<{
  onClose: () => void;
  onAdd: (form: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    npn: string;
    gender: string;
  }) => Promise<string | null>;
}> = ({ onClose, onAdd }) => {
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', phone: '', npn: '', gender: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.firstName.trim() || !form.lastName.trim() || !form.phone.trim() || !form.gender) {
      setError('First name, last name, phone, and gender are required.');
      return;
    }
    setSubmitting(true);
    setError('');
    const err = await onAdd(form);
    if (err) setError(err);
    else onClose();
    setSubmitting(false);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
      <div className="bg-card border border-border rounded-lg max-w-md w-full">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h3 className="font-semibold text-foreground">Add Agent to Roster</h3>
          <button onClick={onClose} className="p-1.5 hover:bg-secondary/30 rounded-lg">
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-foreground/80 mb-1">First Name *</label>
              <input
                type="text"
                value={form.firstName}
                onChange={(e) => {
                  setForm((f) => ({ ...f, firstName: e.target.value }));
                  setError('');
                }}
                className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:ring-2 focus:ring-primary/40 focus:border-transparent bg-secondary/20 text-foreground"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground/80 mb-1">Last Name *</label>
              <input
                type="text"
                value={form.lastName}
                onChange={(e) => {
                  setForm((f) => ({ ...f, lastName: e.target.value }));
                  setError('');
                }}
                className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:ring-2 focus:ring-primary/40 focus:border-transparent bg-secondary/20 text-foreground"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-foreground/80 mb-1">Email</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:ring-2 focus:ring-primary/40 focus:border-transparent bg-secondary/20 text-foreground"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-foreground/80 mb-1">Phone *</label>
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => {
                  setForm((f) => ({ ...f, phone: e.target.value }));
                  setError('');
                }}
                className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:ring-2 focus:ring-primary/40 focus:border-transparent bg-secondary/20 text-foreground"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground/80 mb-1">NPN</label>
              <input
                type="text"
                value={form.npn}
                onChange={(e) => setForm((f) => ({ ...f, npn: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:ring-2 focus:ring-primary/40 focus:border-transparent bg-secondary/20 text-foreground"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-foreground/80 mb-2">Gender *</label>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, gender: 'Male' }))}
                className={`flex-1 px-3 py-2 text-sm font-medium rounded-lg border transition-colors ${
                  form.gender === 'Male'
                    ? 'bg-secondary/30 border-primary/40 text-primary ring-2 ring-primary/20'
                    : 'border-border text-foreground/80 hover:bg-secondary/20'
                }`}
              >
                Male
              </button>
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, gender: 'Female' }))}
                className={`flex-1 px-3 py-2 text-sm font-medium rounded-lg border transition-colors ${
                  form.gender === 'Female'
                    ? 'bg-secondary/30 border-primary/40 text-primary ring-2 ring-primary/20'
                    : 'border-border text-foreground/80 hover:bg-secondary/20'
                }`}
              >
                Female
              </button>
            </div>
          </div>
          {error && (
            <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-foreground/80 border border-border rounded-lg hover:bg-secondary/30"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 text-sm font-medium gradient-primary text-primary-foreground rounded-lg disabled:opacity-50"
            >
              {submitting ? 'Adding...' : 'Add Agent'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ─── Carriers sub-tab ───────────────────────────────────────────────────────

const ALL_CARRIERS = ['UNL', 'GTL', 'AHL', 'Manhattan', 'Heartland'] as const;

const CarriersSubTab: React.FC<{
  agency: PortalCrmAgency;
  onAgencyUpdated: (updated: PortalCrmAgency) => void;
}> = ({ agency, onAgencyUpdated }) => {
  const [saving, setSaving] = useState<string | null>(null);
  const current = agency.carriers || [];

  const toggle = async (carrier: string) => {
    if (!portalSupabase) return;
    setSaving(carrier);
    const updated = current.includes(carrier) ? current.filter((c) => c !== carrier) : [...current, carrier];

    const { error } = await (portalSupabase as any)
      .from('hierarchy_agencies')
      .update({ carriers: updated, updated_at: new Date().toISOString() })
      .eq('id', agency.id);

    if (!error) {
      onAgencyUpdated({ ...agency, carriers: updated });
    }
    setSaving(null);
  };

  return (
    <div className="p-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-lg bg-sky-500/10 flex items-center justify-center">
          <Shield className="w-5 h-5 text-sky-400" />
        </div>
        <div>
          <h3 className="text-base font-bold text-foreground">Carrier Assignments</h3>
          <p className="text-sm text-muted-foreground">Toggle which carriers this agency is contracted with</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3">
        {ALL_CARRIERS.map((carrier) => {
          const active = current.includes(carrier);
          const isSaving = saving === carrier;
          return (
            <button
              key={carrier}
              onClick={() => toggle(carrier)}
              disabled={isSaving}
              className={`flex items-center justify-between px-4 py-3 rounded-lg border-2 transition-all ${
                active ? 'border-sky-500/30 bg-sky-500/10' : 'border-border bg-card hover:border-border'
              } ${isSaving ? 'opacity-60 pointer-events-none' : ''}`}
            >
              <span className={`text-sm font-semibold ${active ? 'text-sky-400' : 'text-foreground/80'}`}>
                {carrier}
              </span>
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center transition-colors ${
                  active ? 'bg-sky-500 text-white' : 'bg-secondary/30 text-muted-foreground'
                }`}
              >
                <Check className="w-3.5 h-3.5" />
              </div>
            </button>
          );
        })}
      </div>

      {current.length > 0 && (
        <div className="mt-6 p-4 rounded-lg bg-secondary/20 border border-border">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
            Active Carriers
          </p>
          <div className="flex flex-wrap gap-2">
            {current.map((c) => (
              <span
                key={c}
                className="px-2.5 py-1 rounded-full text-xs font-bold bg-sky-500/10 text-sky-400 uppercase tracking-wider"
              >
                {c}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// ─── CRM toggle sub-tab ─────────────────────────────────────────────────────

const CRM_ONBOARDING_LABELS: Record<string, string> = {
  pending_csr_assignment: 'Pending CSR Assignment',
  awaiting_agency_phone: 'Awaiting Phone & Setup',
  awaiting_subaccount_setup: 'Awaiting Subaccount Setup',
  awaiting_roster_upload: 'Awaiting Roster Upload',
  awaiting_dba_upload: 'Awaiting DBA Upload',
  onboarding_complete: 'Onboarding Complete',
};

const CrmToggleSubTab: React.FC<{
  agency: PortalCrmAgency;
  onAgencyUpdated: (updated: PortalCrmAgency) => void;
  onRefresh: () => void;
}> = ({ agency, onAgencyUpdated, onRefresh }) => {
  const [hasRoster, setHasRoster] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [enabling, setEnabling] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkPrerequisites();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agency.name]);

  const checkPrerequisites = async () => {
    if (!portalSupabase) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data } = await (portalSupabase as any)
      .from('crm_roster_uploads')
      .select('id')
      .eq('agency', agency.name)
      .limit(1);
    setHasRoster((data || []).length > 0);
    setLoading(false);
  };

  const handleEnable = async () => {
    if (!portalSupabase) return;
    setEnabling(true);
    const { error } = await (portalSupabase as any)
      .from('hierarchy_agencies')
      .update({
        crm_enabled: true,
        onboarding_status: 'pending_csr_assignment',
        is_active: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', agency.id);

    if (!error) {
      const updated = {
        ...agency,
        crm_enabled: true,
        onboarding_status: 'pending_csr_assignment' as const,
        is_active: true,
      };
      onAgencyUpdated(updated);
      onRefresh();
    }
    setEnabling(false);
    setShowConfirm(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (agency.crm_enabled) {
    return (
      <div className="p-6">
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-6">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-lg bg-emerald-500/10 flex items-center justify-center">
              <CheckCircle2 className="w-6 h-6 text-emerald-400" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-emerald-400">CRM Onboarding Enabled</h3>
              <p className="text-sm text-emerald-400/80 mt-1">
                This agency is visible in the CRM Team tab and is being onboarded through the CRM workflow.
              </p>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-emerald-500/20">
            <h4 className="text-sm font-semibold text-emerald-400 mb-2">CRM Onboarding Status</h4>
            <div className="flex items-center gap-2">
              <span
                className={`inline-flex items-center px-3 py-1.5 rounded-lg text-sm font-medium ${
                  agency.onboarding_status === 'onboarding_complete'
                    ? 'bg-emerald-500/20 text-emerald-400'
                    : 'bg-amber-500/10 text-amber-400'
                }`}
              >
                {CRM_ONBOARDING_LABELS[agency.onboarding_status] || agency.onboarding_status}
              </span>
            </div>
          </div>

          <div className="mt-4 p-3 bg-emerald-500/5 rounded-lg">
            <p className="text-xs text-emerald-400/80 flex items-start gap-2">
              <Shield className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
              CRM enablement cannot be disabled from here. Contact the CRM team if changes are needed.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const prerequisites = [
    { label: 'Agency is active', done: agency.is_active },
    { label: 'Roster has been uploaded', done: hasRoster },
    { label: 'Agency phone provided', done: !!agency.agency_phone?.trim() },
  ];

  const allPrereqsMet = agency.is_test || prerequisites.every((p) => p.done);

  return (
    <div className="p-6">
      <div className="bg-secondary/10 border border-border rounded-lg p-6">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-lg bg-secondary/30 flex items-center justify-center">
            <Monitor className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-foreground">Enable CRM Onboarding</h3>
            <p className="text-sm text-foreground/80 mt-1">
              Enabling CRM will make this agency visible in the CRM Team tab and begin the CRM onboarding
              workflow (CSR assignment, subaccount setup, etc.).
            </p>
          </div>
        </div>

        <div className="mt-6">
          <h4 className="text-sm font-semibold text-foreground/80 mb-3">Prerequisites</h4>
          <div className="space-y-2">
            {prerequisites.map((prereq, i) => (
              <div key={i} className="flex items-center gap-2.5">
                {prereq.done ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                ) : (
                  <Circle className="w-4 h-4 text-muted-foreground" />
                )}
                <span className={`text-sm ${prereq.done ? 'text-foreground/80' : 'text-muted-foreground'}`}>
                  {prereq.label}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-6 pt-4 border-t border-border">
          <button
            onClick={() => setShowConfirm(true)}
            disabled={!allPrereqsMet}
            className={`w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-medium text-sm transition-all ${
              allPrereqsMet
                ? 'gradient-primary text-primary-foreground'
                : 'bg-secondary/30 text-muted-foreground cursor-not-allowed'
            }`}
          >
            <Monitor className="w-4 h-4" />
            {allPrereqsMet ? 'Enable CRM Onboarding' : 'Complete prerequisites to enable'}
          </button>
          {!allPrereqsMet && (
            <p className="text-xs text-muted-foreground text-center mt-2">
              All prerequisites must be met before enabling CRM.
            </p>
          )}
        </div>
      </div>

      {showConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
          <div className="bg-card border border-border rounded-lg max-w-md w-full p-6">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground">Confirm CRM Enablement</h3>
                <p className="text-sm text-foreground/80 mt-1">
                  This will make <strong>{agency.name}</strong> visible in the CRM Team tab.
                </p>
              </div>
            </div>

            <div className="bg-secondary/20 rounded-lg p-3 mb-4 space-y-1.5 text-sm text-foreground/80">
              <p>What will happen:</p>
              <ul className="list-disc list-inside space-y-1 text-xs text-muted-foreground">
                <li>Agency will appear in CRM Team for onboarding</li>
                <li>CRM team begins CSR assignment, subaccount setup, etc.</li>
                <li>Existing roster will be used for CRM workflows</li>
                <li>This action cannot be undone from here</li>
              </ul>
            </div>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowConfirm(false)}
                className="px-4 py-2.5 text-sm font-medium text-foreground/80 border border-border rounded-lg hover:bg-secondary/30"
              >
                Cancel
              </button>
              <button
                onClick={handleEnable}
                disabled={enabling}
                className="px-4 py-2.5 text-sm font-medium gradient-primary text-primary-foreground rounded-lg disabled:opacity-50"
              >
                {enabling ? 'Enabling...' : 'Yes, Enable CRM'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

