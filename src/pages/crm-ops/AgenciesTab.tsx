/**
 * @crm-protected
 * DO NOT MODIFY without Charlie's explicit approval.
 * This file is part of CRM Ops (OpenClaw Dashboard).
 * Table references use hierarchy_agencies (NOT crm_agencies).
 * Any rename or schema change to hierarchy_agencies requires updating this file.
 * See: docs/CRM_OPS_FILES.md for the full protected file list.
 */
// @ts-nocheck
import React, { useState, useEffect } from 'react';
import { Plus, Search, Building2, ChevronRight, FlaskConical, GitBranch, X, UserCheck, Phone, ExternalLink, Zap, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/crm/portal-client';
import { useCrmViewStore } from '@/store/crm-view-store';
import { formatPhoneDisplay } from '@/lib/crm/helpers';
import type { CrmAgency } from '@/lib/crm/types';
import { AddAgencyModal } from '@/pages/crm-ops/AddAgencyModal';
import { AgencyProfileView } from './AgencyProfileView';
import { syncGhlToTracker } from '@/lib/ghl-live-feed';

const STATUS_LABELS: Record<string, string> = {
  pending_csr_assignment: 'Pending CSR Assignment',
  awaiting_agency_phone: 'Awaiting Phone & Setup',
  awaiting_roster_upload: 'Awaiting Roster Upload',
  awaiting_dba_upload: 'Awaiting DBA Upload',
  onboarding_complete: 'Onboarding Complete',
};

const STATUS_COLORS: Record<string, string> = {
  pending_csr_assignment: 'bg-amber-400/10 text-amber-400',
  awaiting_agency_phone: 'bg-sky-400/10 text-sky-400',
  awaiting_roster_upload: 'bg-blue-400/10 text-blue-400',
  awaiting_dba_upload: 'bg-teal-400/10 text-teal-400',
  onboarding_complete: 'bg-emerald-400/10 text-emerald-400',
};

export const AgenciesTab: React.FC = () => {
  const [agencies, setAgencies] = useState<CrmAgency[]>([]);
  const [filledSeats, setFilledSeats] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [csrPanelAgency, setCsrPanelAgency] = useState<CrmAgency | null>(null);
  const [csrForm, setCsrForm] = useState({ firstName: '', lastName: '', phone: '', email: '', npn: '' });
  const [csrSaving, setCsrSaving] = useState(false);
  const [crmPanelAgency, setCrmPanelAgency] = useState<CrmAgency | null>(null);
  const [crmNumberValue, setCrmNumberValue] = useState('');
  const [crmSaving, setCrmSaving] = useState(false);
  const [selectedAgency, setSelectedAgency] = useState<CrmAgency | null>(null);
  const [togglingGhlId, setTogglingGhlId] = useState<string | null>(null);

  const getParentName = (agency: CrmAgency): string | null => {
    if (agency.agency_type !== 'sub' || !agency.parent_agency_id) return null;
    return agencies.find((a) => a.id === agency.parent_agency_id)?.name || null;
  };

  const loadAgencies = async () => {
    setLoading(true);
    // Ensure auth session is active for authenticated-role reads
    // Portal auth is handled by ensurePortalAuth() via the portal-auth edge function.
    // Service credentials never touch the browser.
    const { ensurePortalAuth } = await import('@/lib/crm/portal-client');
    await ensurePortalAuth();

    const [agencyRes, uploadsRes] = await Promise.all([
      supabase.from('hierarchy_agencies').select('*').eq('crm_enabled', true).order('name'),
      supabase.from('crm_roster_uploads').select('id, agency').order('uploaded_at', { ascending: false }),
    ]);

    setAgencies(agencyRes.data || []);

    const latestUploadByAgency: Record<string, string> = {};
    for (const upload of (uploadsRes.data || [])) {
      if (upload.agency && !latestUploadByAgency[upload.agency]) {
        latestUploadByAgency[upload.agency] = upload.id;
      }
    }

    // Count filled seats per agency — query each roster individually
    // (max 200 rows each). Exclude CSR placeholder rows.
    const counts: Record<string, number> = {};
    await Promise.all(
      Object.entries(latestUploadByAgency).map(async ([agency, uploadId]) => {
        const { data: rows } = await supabase
          .from('crm_roster')
          .select('row_data')
          .eq('upload_id', uploadId)
          .limit(200);
        counts[agency] = (rows || []).filter(
          (r) => r.row_data['First Name']?.trim() && r.row_data['CSR Placeholder'] !== 'true'
        ).length;
      })
    );

    setFilledSeats(counts);
    setLoading(false);
  };

  useEffect(() => { loadAgencies(); }, []);

  const toggleActive = async (agency: CrmAgency, e: React.MouseEvent) => {
    e.stopPropagation();
    const { error } = await supabase
      .from('hierarchy_agencies')
      .update({ is_active: !agency.is_active, updated_at: new Date().toISOString() })
      .eq('id', agency.id);

    if (!error) {
      setAgencies((prev) =>
        prev.map((a) => a.id === agency.id ? { ...a, is_active: !a.is_active } : a)
      );
    }
  };

  const openCsrPanel = (agency: CrmAgency, e: React.MouseEvent) => {
    e.stopPropagation();
    setCsrPanelAgency(agency);
    setCsrForm({
      firstName: agency.csr_first_name || '',
      lastName: agency.csr_last_name || '',
      phone: agency.csr_phone || '',
      email: agency.csr_email || '',
      npn: agency.csr_npn || '',
    });
  };

  const saveCsrDetails = async () => {
    if (!csrPanelAgency) return;
    const fullName = `${csrForm.firstName.trim()} ${csrForm.lastName.trim()}`.trim();
    setCsrSaving(true);
    const { error } = await supabase
      .from('hierarchy_agencies')
      .update({
        assigned_csr: fullName || null,
        csr_first_name: csrForm.firstName.trim() || null,
        csr_last_name: csrForm.lastName.trim() || null,
        csr_phone: csrForm.phone.trim() || null,
        csr_email: csrForm.email.trim() || null,
        csr_npn: csrForm.npn.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', csrPanelAgency.id);

    if (!error) {
      setAgencies((prev) =>
        prev.map((a) => a.id === csrPanelAgency.id ? {
          ...a,
          assigned_csr: fullName || null,
          csr_first_name: csrForm.firstName.trim() || null,
          csr_last_name: csrForm.lastName.trim() || null,
          csr_phone: csrForm.phone.trim() || null,
          csr_email: csrForm.email.trim() || null,
          csr_npn: csrForm.npn.trim() || null,
        } : a)
      );
    }
    setCsrSaving(false);
    setCsrPanelAgency(null);
  };

  const openCrmPanel = (agency: CrmAgency, e: React.MouseEvent) => {
    e.stopPropagation();
    setCrmPanelAgency(agency);
    setCrmNumberValue(agency.crm_number || '');
  };

  const saveCrmNumber = async () => {
    if (!crmPanelAgency) return;
    const num = crmNumberValue.trim();
    if (!num) return;
    setCrmSaving(true);

    const { error } = await supabase
      .from('hierarchy_agencies')
      .update({ crm_number: num, updated_at: new Date().toISOString() })
      .eq('id', crmPanelAgency.id);

    if (!error) {
      const { data: uploads } = await supabase
        .from('crm_roster_uploads')
        .select('id')
        .eq('agency', crmPanelAgency.name)
        .order('uploaded_at', { ascending: false })
        .limit(1);

      if (uploads && uploads.length > 0) {
        const { data: rows } = await supabase
          .from('crm_roster')
          .select('id, row_data')
          .eq('upload_id', uploads[0].id);

        if (rows) {
          const batchSize = 50;
          for (let i = 0; i < rows.length; i += batchSize) {
            const batch = rows.slice(i, i + batchSize);
            await Promise.all(
              batch.map((row) =>
                supabase
                  .from('crm_roster')
                  .update({
                    row_data: { ...row.row_data, 'All Templates | Agent CRM #': num },
                  })
                  .eq('id', row.id)
              )
            );
          }
        }
      }

      setAgencies((prev) =>
        prev.map((a) => a.id === crmPanelAgency.id ? { ...a, crm_number: num } : a)
      );
    }
    setCrmSaving(false);
    setCrmPanelAgency(null);
  };

  const handleAgencyUpdated = (updated: CrmAgency) => {
    setAgencies((prev) => prev.map((a) => a.id === updated.id ? updated : a));
    setSelectedAgency(updated);
  };

  const filtered = search
    ? agencies.filter((a) => {
        const q = search.toLowerCase();
        const parentName = getParentName(a)?.toLowerCase() || '';
        return a.name.toLowerCase().includes(q) || parentName.includes(q);
      })
    : agencies;

  if (selectedAgency) {
    return (
      <AgencyProfileView
        agency={selectedAgency}
        allAgencies={agencies}
        onBack={() => { setSelectedAgency(null); loadAgencies(); }}
        onAgencyUpdated={handleAgencyUpdated}
        onNavigateToAgency={(a) => setSelectedAgency(a)}
      />
    );
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="h-10 w-64 glass rounded-xl animate-pulse" />
          <div className="h-10 w-36 bg-primary/10 rounded-xl animate-pulse" />
        </div>
        <div className="bg-card rounded-2xl border border-border overflow-hidden">
          {[...Array(5)].map((_, i) => <div key={i} className="h-16 border-b border-border animate-pulse" />)}
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center justify-between mb-5">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search agencies..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 border border-border rounded-xl focus:ring-2 focus:ring-ring focus:border-primary text-sm shadow-none bg-card"
          />
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-primary rounded-xl hover:bg-primary/90 transition-all shadow-none hover:shadow-none"
        >
          <Plus className="w-4 h-4" />
          Add New Agency
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className="bg-card rounded-2xl border border-border p-12 text-center shadow-none">
          <Building2 className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">{search ? 'No agencies match your search' : 'No agencies added yet'}</p>
        </div>
      ) : (
        <div className="bg-card rounded-2xl border border-border overflow-hidden shadow-none">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-muted/50 border-b border-border">
                  <th className="px-5 py-3 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Agency Name</th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Agency</th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">View CRM</th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Type</th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Assigned CSR</th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">CRM #</th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Onboarding Status</th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Date Added</th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Seats</th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">GHL Feed</th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Active</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((agency) => {
                  const parentName = getParentName(agency);
                  return (
                    <tr
                      key={agency.id}
                      onClick={() => setSelectedAgency(agency)}
                      className="hover:bg-primary/5 transition-colors cursor-pointer group"
                    >
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <div>
                            <span className="font-semibold text-foreground">{agency.name}</span>
                            {parentName && (
                              <p className="text-xs text-muted-foreground mt-0.5">under {parentName}</p>
                            )}
                          </div>
                          {agency.is_test && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-semibold bg-amber-500/10 text-amber-400 rounded border border-amber-500/20">
                              <FlaskConical className="w-2.5 h-2.5" />
                              Test
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <span className="inline-flex items-center px-2 py-0.5 rounded bg-secondary text-xs font-mono text-foreground/80">
                          {agency.name}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        {agency.crm_enabled ? (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              useCrmViewStore.getState().viewAgency(agency.id, agency.name);
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-primary/10 text-primary hover:bg-primary/20 rounded-lg transition-colors"
                          >
                            <ExternalLink className="w-3 h-3" />
                            View CRM
                          </button>
                        ) : (
                          <span className="text-xs text-muted-foreground">--</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        {agency.agency_type === 'main' ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-primary/10 text-primary">
                            Main
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-secondary text-muted-foreground">
                            <GitBranch className="w-3 h-3" />
                            Sub
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <button
                          onClick={(e) => openCsrPanel(agency, e)}
                          className="text-sm text-muted-foreground hover:text-primary hover:underline transition-colors"
                        >
                          {agency.assigned_csr || <span className="text-muted-foreground italic">Unassigned</span>}
                        </button>
                      </td>
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        {agency.crm_number ? (
                          <span className="text-sm font-medium text-foreground">{formatPhoneDisplay(agency.crm_number)}</span>
                        ) : (
                          <button
                            onClick={(e) => openCrmPanel(agency, e)}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-primary bg-primary/5 border border-primary/20 rounded-lg hover:bg-primary/10 transition-colors"
                          >
                            <Phone className="w-3 h-3" />
                            Assign
                          </button>
                        )}
                      </td>
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[agency.onboarding_status] || 'bg-secondary text-foreground/80'}`}>
                          {STATUS_LABELS[agency.onboarding_status] || agency.onboarding_status}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">
                        {new Date(agency.date_added).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </td>
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-foreground">{filledSeats[agency.name] || 0}</span>
                          <span className="text-xs text-muted-foreground">/ 200</span>
                        </div>
                      </td>
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        {(() => {
                          const ghlEnabled = agency.ghl_api_enabled ?? false;
                          const isToggling = togglingGhlId === agency.id;
                          return (
                            <button
                              onClick={async (e) => {
                                e.stopPropagation();
                                const next = !ghlEnabled;
                                if (next && !confirm(`Turn on GHL Live Feed for ${agency.name}?\n\nLive policy data and status changes (approved, terminated, at-risk) will push to this agency's GHL account.`)) return;
                                if (!next && !confirm(`Turn off GHL Live Feed for ${agency.name}?\n\nPolicy lifecycle events will stop pushing to GHL for this agency.`)) return;
                                setTogglingGhlId(agency.id);
                                try {
                                  const { error } = await supabase.from('hierarchy_agencies').update({ ghl_api_enabled: next }).eq('id', agency.id);
                                  if (!error) {
                                    setAgencies((prev) => prev.map((a) => a.id === agency.id ? { ...a, ghl_api_enabled: next } : a));
                                    // Fire-and-forget: sync to tracker DB for push logic
                                    syncGhlToTracker(agency.name, next);
                                  }
                                } finally {
                                  setTogglingGhlId(null);
                                }
                              }}
                              disabled={isToggling}
                              className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg transition-colors disabled:opacity-50 ${
                                ghlEnabled
                                  ? 'text-green-400 bg-green-400/10 hover:bg-green-400/20 border border-green-500/20'
                                  : 'text-muted-foreground bg-secondary hover:bg-secondary/80 border border-border'
                              }`}
                              title={ghlEnabled ? 'GHL Live Feed ON — click to disable' : 'GHL Live Feed OFF — click to enable'}
                            >
                              {isToggling ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <Zap className={`w-3 h-3 ${ghlEnabled ? 'fill-green-400' : ''}`} />
                              )}
                              {ghlEnabled ? 'Live' : 'Off'}
                            </button>
                          );
                        })()}
                      </td>
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <button
                          onClick={(e) => toggleActive(agency, e)}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                            agency.is_active ? 'bg-emerald-500/100' : 'bg-muted-foreground/40'
                          }`}
                        >
                          <span
                            className={`inline-block h-4 w-4 transform rounded-full bg-card transition-transform ${
                              agency.is_active ? 'translate-x-6' : 'translate-x-1'
                            }`}
                          />
                        </button>
                      </td>
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <ChevronRight className="w-4 h-4 text-muted-foreground" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showAddModal && (
        <AddAgencyModal
          onClose={() => setShowAddModal(false)}
          onSuccess={() => { setShowAddModal(false); loadAgencies(); }}
        />
      )}

      {csrPanelAgency && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setCsrPanelAgency(null)}>
          <div className="bg-card rounded-2xl shadow-none w-full max-w-lg border border-border" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-cyan-500/10 flex items-center justify-center">
                  <UserCheck className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground">Assign CSR</h3>
                  <p className="text-xs text-muted-foreground">{csrPanelAgency.name}</p>
                </div>
              </div>
              <button onClick={() => setCsrPanelAgency(null)} className="p-1 rounded-lg hover:bg-secondary transition-colors">
                <X className="w-5 h-5 text-muted-foreground" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground/80 mb-1">First Name</label>
                  <input
                    type="text"
                    value={csrForm.firstName}
                    onChange={(e) => setCsrForm((f) => ({ ...f, firstName: e.target.value }))}
                    className="w-full px-4 py-2 border border-border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring text-sm bg-card"
                    placeholder="First name"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground/80 mb-1">Last Name</label>
                  <input
                    type="text"
                    value={csrForm.lastName}
                    onChange={(e) => setCsrForm((f) => ({ ...f, lastName: e.target.value }))}
                    className="w-full px-4 py-2 border border-border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring text-sm bg-card"
                    placeholder="Last name"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground/80 mb-1">Phone</label>
                  <input
                    type="tel"
                    value={csrForm.phone}
                    onChange={(e) => setCsrForm((f) => ({ ...f, phone: e.target.value }))}
                    className="w-full px-4 py-2 border border-border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring text-sm bg-card"
                    placeholder="(555) 123-4567"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground/80 mb-1">Email</label>
                  <input
                    type="email"
                    value={csrForm.email}
                    onChange={(e) => setCsrForm((f) => ({ ...f, email: e.target.value }))}
                    className="w-full px-4 py-2 border border-border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring text-sm bg-card"
                    placeholder="csr@example.com"
                  />
                </div>
              </div>

              <div className="w-1/2">
                <label className="block text-sm font-medium text-foreground/80 mb-1">
                  NPN <span className="text-muted-foreground font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  value={csrForm.npn}
                  onChange={(e) => setCsrForm((f) => ({ ...f, npn: e.target.value }))}
                  className="w-full px-4 py-2 border border-border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring text-sm bg-card"
                  placeholder="National Producer Number"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border">
              <button
                onClick={() => setCsrPanelAgency(null)}
                className="px-4 py-2 text-sm font-medium text-foreground/80 glass rounded-lg hover:bg-muted transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={saveCsrDetails}
                disabled={csrSaving || !csrForm.firstName.trim() || !csrForm.lastName.trim() || !csrForm.phone.trim() || !csrForm.email.trim()}
                className="px-5 py-2 text-sm font-medium text-white bg-primary rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {csrSaving ? 'Saving...' : 'Save CSR Info'}
              </button>
            </div>
          </div>
        </div>
      )}

      {crmPanelAgency && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setCrmPanelAgency(null)}>
          <div className="bg-card rounded-2xl shadow-none w-full max-w-sm border border-border" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                  <Phone className="w-5 h-5 text-emerald-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground">Assign CRM #</h3>
                  <p className="text-xs text-muted-foreground">{crmPanelAgency.name}</p>
                </div>
              </div>
              <button onClick={() => setCrmPanelAgency(null)} className="p-1 rounded-lg hover:bg-secondary transition-colors">
                <X className="w-5 h-5 text-muted-foreground" />
              </button>
            </div>

            <div className="p-6">
              <label className="block text-sm font-medium text-foreground/80 mb-1">CRM Number</label>
              <input
                type="text"
                value={crmNumberValue}
                onChange={(e) => setCrmNumberValue(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && crmNumberValue.trim()) saveCrmNumber(); }}
                className="w-full px-4 py-2.5 border border-border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring text-sm bg-card"
                placeholder="e.g. 720-594-2854"
                autoFocus
              />
              <p className="mt-2 text-xs text-muted-foreground">This will auto-fill into all 200 roster rows for this agency.</p>
            </div>

            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border">
              <button
                onClick={() => setCrmPanelAgency(null)}
                className="px-4 py-2 text-sm font-medium text-foreground/80 glass rounded-lg hover:bg-muted transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={saveCrmNumber}
                disabled={crmSaving || !crmNumberValue.trim()}
                className="px-5 py-2 text-sm font-medium text-white bg-primary rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {crmSaving ? 'Saving...' : 'Save & Apply'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
