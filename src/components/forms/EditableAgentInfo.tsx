/**
 * EditableAgentInfo — ported from contracting-portal
 *
 * Editable agent name/email/phone fields shown on intake forms.
 * Uses portalSupabase to update the portal DB (akhojh…).
 * Styled for FYM App dark theme.
 */
import { useState } from 'react';
import { Pencil, Save, X } from 'lucide-react';
import { portalSupabase } from '@/lib/portal-supabase';
import type { PortalAgent } from '@/lib/contracting/types';

interface EditableAgentInfoProps {
  agent: PortalAgent;
  onAgentUpdate: (agent: PortalAgent) => void;
  variant?: 'default' | 'hip';
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^[\d\s()+-]{7,20}$/;

function formatPhone(value: string): string {
  const digits = value.replace(/\D/g, '');
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
}

export function EditableAgentInfo({
  agent,
  onAgentUpdate,
  variant = 'default',
}: EditableAgentInfoProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState({
    first_name: agent.first_name,
    last_name: agent.last_name,
    email: agent.email,
    phone: agent.phone,
  });

  const isHip = variant === 'hip';

  const inputReadOnly = 'w-full px-4 py-2 bg-muted border border-border rounded-lg text-muted-foreground';
  const inputEditable = 'w-full px-4 py-2 bg-secondary border border-border rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent text-foreground';
  const inputError = 'border-destructive focus:ring-destructive';

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!draft.first_name.trim()) newErrors.first_name = 'First name is required';
    if (!draft.last_name.trim()) newErrors.last_name = 'Last name is required';
    if (!draft.email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!EMAIL_REGEX.test(draft.email)) {
      newErrors.email = 'Enter a valid email address';
    }
    if (!draft.phone.trim()) {
      newErrors.phone = 'Phone number is required';
    } else if (!PHONE_REGEX.test(draft.phone)) {
      newErrors.phone = 'Enter a valid phone number';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleEdit = () => {
    setDraft({
      first_name: agent.first_name,
      last_name: agent.last_name,
      email: agent.email,
      phone: agent.phone,
    });
    setErrors({});
    setIsEditing(true);
  };

  const handleCancel = () => {
    setErrors({});
    setIsEditing(false);
  };

  const handleSave = async () => {
    if (!validate() || !portalSupabase) return;

    setSaving(true);
    try {
      const { error } = await portalSupabase
        .from('agents')
        .update({
          first_name: draft.first_name.trim(),
          last_name: draft.last_name.trim(),
          email: draft.email.trim(),
          phone: draft.phone.trim(),
        })
        .eq('id', agent.id);

      if (error) throw error;

      const updated: PortalAgent = {
        ...agent,
        first_name: draft.first_name.trim(),
        last_name: draft.last_name.trim(),
        email: draft.email.trim(),
        phone: draft.phone.trim(),
      };
      onAgentUpdate(updated);
      setIsEditing(false);
    } catch {
      setErrors({ _form: 'Failed to save changes. Please try again.' });
    } finally {
      setSaving(false);
    }
  };

  const handlePhoneChange = (value: string) => {
    setDraft({ ...draft, phone: formatPhone(value) });
    if (errors.phone) setErrors({ ...errors, phone: '' });
  };

  const handleFieldChange = (field: string, value: string) => {
    setDraft({ ...draft, [field]: value });
    if (errors[field]) setErrors({ ...errors, [field]: '' });
  };

  const fields: { key: string; label: string; type: string; hint?: string }[] = [
    { key: 'first_name', label: 'First Name', type: 'text' },
    { key: 'last_name', label: 'Last Name', type: 'text' },
    { key: 'email', label: 'Email', type: 'email' },
    { key: 'phone', label: 'Mobile Phone Number', type: 'tel', hint: 'Please provide your mobile number for SMS notifications' },
  ];

  return (
    <>
      <div className={isHip ? 'sm:col-span-2' : 'md:col-span-2'}>
        <div className="flex items-center justify-between mb-1">
          <p className="text-xs text-muted-foreground">
            {isEditing
              ? 'Update your information below, then save.'
              : 'Your name, email, and phone are pre-filled from your record.'}
          </p>
          {!isEditing ? (
            <button
              type="button"
              onClick={handleEdit}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:text-primary/80 transition-colors"
            >
              <Pencil className="w-3.5 h-3.5" />
              Edit
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCancel}
                disabled={saving}
                className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="w-3.5 h-3.5" />
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="inline-flex items-center gap-1 text-sm font-medium text-primary-foreground bg-primary hover:bg-primary/90 px-3 py-1 rounded-md transition-colors disabled:opacity-50"
              >
                <Save className="w-3.5 h-3.5" />
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          )}
        </div>
        {errors._form && (
          <p className="text-sm text-destructive mb-2">{errors._form}</p>
        )}
      </div>

      {fields.map(({ key, label, type, hint }) => (
        <div key={key}>
          <label className="block text-sm font-medium text-muted-foreground mb-1">{label}</label>
          {isEditing ? (
            <>
              <input
                type={type}
                value={draft[key as keyof typeof draft]}
                onChange={(e) =>
                  key === 'phone'
                    ? handlePhoneChange(e.target.value)
                    : handleFieldChange(key, e.target.value)
                }
                className={`${inputEditable} ${errors[key] ? inputError : ''}`}
              />
              {errors[key] && (
                <p className="text-xs text-destructive mt-1">{errors[key]}</p>
              )}
            </>
          ) : (
            <input
              type={type}
              value={agent[key as keyof PortalAgent] as string}
              readOnly
              className={inputReadOnly}
            />
          )}
          {hint && !errors[key] && (
            <p className="text-xs text-muted-foreground mt-1">{hint}</p>
          )}
        </div>
      ))}
    </>
  );
}
