/**
 * AgentEditModal — Edit agent contact info, form type, agency
 *
 * Ported from contracting-portal/src/components/AgentEditModal.tsx
 * Writes to portal Supabase (akhojh…) during parallel-run period.
 */
import { useState } from 'react';
import { X, Save } from 'lucide-react';
import { supabase as portalClient, ensurePortalAuth } from '@/lib/crm/portal-client';
import type { PortalAgent } from '@/lib/contracting/types';

interface AgentEditModalProps {
  agent: PortalAgent;
  onClose: () => void;
  onSaved: (updated: PortalAgent) => void;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^[\d\s()+-]{7,20}$/;

function formatPhone(value: string): string {
  const digits = value.replace(/\D/g, '');
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
}

const FORM_TYPE_OPTIONS = [
  { value: 'life-only', label: 'Life Only' },
  { value: 'field', label: 'Field' },
  { value: 'direct-pay', label: 'Direct Pay' },
  { value: 'telesales', label: 'Telesales' },
  { value: 'hip-career', label: 'HIP Career' },
  { value: 'hip-broker', label: 'HIP Broker' },
  { value: 'hip', label: 'HIP (Legacy)' },
  { value: 'field-hip', label: 'Field HIP' },
  { value: 'direct-pay-hip', label: 'Direct Pay HIP' },
  { value: 'telesales-hip', label: 'Telesales HIP' },
];

const AGENCY_OPTIONS = ['FYM', 'Wisechoice', 'Aspire'];

export function AgentEditModal({ agent, onClose, onSaved }: AgentEditModalProps) {
  const [draft, setDraft] = useState({
    first_name: agent.first_name,
    last_name: agent.last_name,
    email: agent.email,
    phone: agent.phone,
    form_type: agent.form_type,
    agency: agent.agency,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const setField = (key: string, value: string) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: '' }));
  };

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (!draft.first_name.trim()) e.first_name = 'Required';
    if (!draft.last_name.trim()) e.last_name = 'Required';
    if (!draft.email.trim()) {
      e.email = 'Required';
    } else if (!EMAIL_REGEX.test(draft.email.trim())) {
      e.email = 'Enter a valid email';
    }
    if (!draft.phone.trim()) {
      e.phone = 'Required';
    } else if (!PHONE_REGEX.test(draft.phone.trim())) {
      e.phone = 'Enter a valid phone number';
    }
    if (!draft.form_type) e.form_type = 'Required';
    if (!draft.agency) e.agency = 'Required';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      await ensurePortalAuth();
      const patch = {
        first_name: draft.first_name.trim(),
        last_name: draft.last_name.trim(),
        email: draft.email.trim(),
        phone: draft.phone.trim(),
        form_type: draft.form_type,
        agency: draft.agency,
        updated_at: new Date().toISOString(),
      };
      const { error } = await portalClient
        .from('agents')
        .update(patch)
        .eq('id', agent.id);
      if (error) throw error;
      onSaved({ ...agent, ...patch } as PortalAgent);
    } catch {
      setErrors((prev) => ({
        ...prev,
        _form: 'Failed to save. Please try again.',
      }));
    } finally {
      setSaving(false);
    }
  };

  const inputClass = (field: string) =>
    `w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-navy-500 focus:border-transparent transition-colors ${
      errors[field] ? 'border-red-400 bg-red-500/10' : 'border-border'
    }`;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-card rounded-xl shadow-xl w-full max-w-lg">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div>
            <h2 className="text-lg font-bold text-navy-600">Edit Agent</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {agent.first_name} {agent.last_name}
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={saving}
            className="p-1.5 hover:bg-secondary rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          {errors._form && (
            <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              {errors._form}
            </p>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-foreground/80 mb-1">
                First Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={draft.first_name}
                onChange={(e) => setField('first_name', e.target.value)}
                className={inputClass('first_name')}
                autoFocus
              />
              {errors.first_name && (
                <p className="text-xs text-red-500 mt-1">{errors.first_name}</p>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-foreground/80 mb-1">
                Last Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={draft.last_name}
                onChange={(e) => setField('last_name', e.target.value)}
                className={inputClass('last_name')}
              />
              {errors.last_name && (
                <p className="text-xs text-red-500 mt-1">{errors.last_name}</p>
              )}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-foreground/80 mb-1">
              Email <span className="text-red-500">*</span>
            </label>
            <input
              type="email"
              value={draft.email}
              onChange={(e) => setField('email', e.target.value)}
              className={inputClass('email')}
            />
            {errors.email && (
              <p className="text-xs text-red-500 mt-1">{errors.email}</p>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-foreground/80 mb-1">
              Phone <span className="text-red-500">*</span>
            </label>
            <input
              type="tel"
              value={draft.phone}
              onChange={(e) => setField('phone', formatPhone(e.target.value))}
              className={inputClass('phone')}
              placeholder="(555) 123-4567"
            />
            {errors.phone && (
              <p className="text-xs text-red-500 mt-1">{errors.phone}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-foreground/80 mb-1">
                Form Type <span className="text-red-500">*</span>
              </label>
              <select
                value={draft.form_type}
                onChange={(e) => setField('form_type', e.target.value)}
                className={`${inputClass('form_type')} bg-card`}
              >
                {FORM_TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              {errors.form_type && (
                <p className="text-xs text-red-500 mt-1">{errors.form_type}</p>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-foreground/80 mb-1">
                Agency <span className="text-red-500">*</span>
              </label>
              <select
                value={draft.agency}
                onChange={(e) => setField('agency', e.target.value)}
                className={`${inputClass('agency')} bg-card`}
              >
                {AGENCY_OPTIONS.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
              {errors.agency && (
                <p className="text-xs text-red-500 mt-1">{errors.agency}</p>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-secondary rounded-b-xl border-t border-border flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 text-sm font-medium text-foreground/80 bg-card border border-border rounded-lg hover:bg-secondary transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-navy-600 rounded-lg hover:bg-navy-700 transition-colors disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
