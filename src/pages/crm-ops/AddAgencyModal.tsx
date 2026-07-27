import React, { useState, useEffect } from 'react';
import { X, Link2 } from 'lucide-react';
import { supabase } from '@/lib/crm/portal-client';
import { generateSlug, RESERVED_SLUGS } from '@/lib/crm/types';
import type { CrmAgency } from '@/lib/crm/types';

interface AddAgencyModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

export const AddAgencyModal: React.FC<AddAgencyModalProps> = ({ onClose, onSuccess }) => {
  const [name, setName] = useState('');
  const [dateCreated, setDateCreated] = useState(new Date().toISOString().slice(0, 10));
  const [agencyType, setAgencyType] = useState<'main' | 'sub'>('main');
  const [parentAgencyId, setParentAgencyId] = useState('');
  const [existingAgency, setExistingAgency] = useState(false);
  const [mainAgencies, setMainAgencies] = useState<CrmAgency[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const loadMainAgencies = async () => {
      const { data } = await supabase
        .from('hierarchy_agencies')
        .select('*')
        .eq('agency_type', 'main')
        .eq('is_active', true)
        .order('name');
      setMainAgencies(data || []);
    };
    loadMainAgencies();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Agency name is required.');
      setSubmitting(false);
      return;
    }

    if (agencyType === 'sub' && !parentAgencyId) {
      setError('Please select a parent agency for sub-agencies.');
      setSubmitting(false);
      return;
    }

    const slug = generateSlug(trimmedName);
    if (RESERVED_SLUGS.has(slug)) {
      setError(`The name "${trimmedName}" conflicts with a reserved URL path. Please choose a different name.`);
      setSubmitting(false);
      return;
    }

    // Ensure auth session is active before writing
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) {
      const serviceEmail = import.meta.env.VITE_PORTAL_SERVICE_EMAIL;
      const servicePassword = import.meta.env.VITE_PORTAL_SERVICE_PASSWORD;
      if (serviceEmail && servicePassword) {
        await supabase.auth.signInWithPassword({ email: serviceEmail, password: servicePassword });
      }
    }

    const portalPassword = `${trimmedName}CRMPortal!`;

    const { data: newAgency, error: insertError } = await supabase
      .from('hierarchy_agencies')
      .insert({
        name: trimmedName,
        onboarding_status: existingAgency ? 'onboarding_complete' : 'pending_csr_assignment',
        is_active: true,
        agency_type: agencyType,
        parent_agency_id: agencyType === 'sub' ? parentAgencyId : null,
        slug,
        portal_password: portalPassword,
        date_created: dateCreated || null,
        zaps_paused: existingAgency,
        crm_enabled: true,
      })
      .select()
      .maybeSingle();

    if (insertError) {
      if (insertError.code === '23505') {
        setError('An agency with this name already exists.');
      } else {
        setError(`Failed to create agency: ${insertError.message}`);
      }
      setSubmitting(false);
      return;
    }

    if (!newAgency) {
      setError('Agency creation failed. Please log out and log back in, then try again.');
      setSubmitting(false);
      return;
    }

    const parentName = agencyType === 'sub'
      ? mainAgencies.find((a) => a.id === parentAgencyId)?.name
      : null;
    const message = existingAgency
      ? `Existing agency "${trimmedName}" added -- zaps paused for backfill`
      : agencyType === 'sub'
        ? `New sub-agency "${trimmedName}" added under ${parentName} -- begin onboarding`
        : `New agency "${trimmedName}" added -- begin onboarding`;

    await supabase.from('crm_notifications').insert({
      agency_id: newAgency.id,
      type: 'agency_added',
      message,
    });

    setSubmitting(false);
    onSuccess();
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-card rounded-xl shadow-none max-w-md w-full">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-lg font-bold text-primary">Add New Agency</h2>
          <button onClick={onClose} className="p-1 hover:bg-secondary rounded transition-colors">
            <X className="w-5 h-5 text-muted-foreground/70" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground/80 mb-1">Agency Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-2 border border-border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring text-sm"
              placeholder="Enter agency name"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground/80 mb-1">Date Created</label>
            <input
              type="date"
              value={dateCreated}
              onChange={(e) => setDateCreated(e.target.value)}
              className="w-full px-4 py-2 border border-border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring text-sm"
            />
            <p className="text-xs text-muted-foreground/70 mt-1">Backdate if the account was created before today.</p>
          </div>

          <label className="flex items-center gap-2.5 cursor-pointer group">
            <input
              type="checkbox"
              checked={existingAgency}
              onChange={(e) => setExistingAgency(e.target.checked)}
              className="w-4 h-4 rounded border-border text-primary focus:ring-ring"
            />
            <span className="text-sm text-foreground/80 group-hover:text-foreground transition-colors">
              Existing agency (pause zaps during backfill)
            </span>
          </label>

          <div>
            <label className="block text-sm font-medium text-foreground/80 mb-2">Agency Type</label>
            <div className="flex rounded-lg border border-border overflow-hidden">
              <button
                type="button"
                onClick={() => { setAgencyType('main'); setParentAgencyId(''); }}
                className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors ${
                  agencyType === 'main'
                    ? 'gradient-primary text-background'
                    : 'bg-card text-muted-foreground hover:bg-muted'
                }`}
              >
                Main Agency
              </button>
              <button
                type="button"
                onClick={() => setAgencyType('sub')}
                className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors border-l border-border ${
                  agencyType === 'sub'
                    ? 'gradient-primary text-background'
                    : 'bg-card text-muted-foreground hover:bg-muted'
                }`}
              >
                Sub Agency
              </button>
            </div>
          </div>

          {agencyType === 'sub' && (
            <div>
              <label className="block text-sm font-medium text-foreground/80 mb-1">Parent Agency</label>
              <select
                value={parentAgencyId}
                onChange={(e) => setParentAgencyId(e.target.value)}
                className="w-full px-4 py-2 border border-border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring text-sm bg-card"
              >
                <option value="">Select a parent agency...</option>
                {mainAgencies.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
              {mainAgencies.length === 0 && (
                <p className="text-xs text-amber-600 mt-1">No active main agencies found. Create a main agency first.</p>
              )}
            </div>
          )}

          {name.trim() && (
            <div className="bg-muted rounded-lg border border-border p-3 space-y-1">
              <div className="flex items-center gap-2 text-xs">
                <Link2 className="w-3.5 h-3.5 text-muted-foreground/70" />
                <span className="text-muted-foreground">Portal URL:</span>
                <span className="font-mono font-medium text-primary">/{generateSlug(name.trim())}</span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className="text-muted-foreground ml-5.5">Password:</span>
                <span className="font-mono font-medium text-foreground/80">{name.trim()}CRMPortal!</span>
              </div>
            </div>
          )}

          <p className="text-xs text-muted-foreground/70">
            {existingAgency
              ? 'The agency will skip onboarding and zaps will be paused until you manually enable them after backfilling data.'
              : agencyType === 'sub'
                ? 'The sub-agency will have its own independent CSR assignment and onboarding workflow.'
                : 'The agency will start in the onboarding workflow where you can assign a CSR, upload rosters, and complete setup.'}
          </p>

          {error && (
            <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 text-sm font-medium text-foreground/80 bg-card border border-border rounded-lg hover:bg-muted transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {submitting ? 'Creating...' : 'Create Agency'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
