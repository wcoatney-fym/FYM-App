/**
 * CsrContactTab — CSR contact card + edit form.
 * Ported 1:1 from contracting-portal/src/pages/portal/PortalCsrTab.tsx
 */
import { useState } from 'react';
import { Headphones as HeadphonesIcon, Phone, Mail, Shield, User, Clock, Pencil, X } from 'lucide-react';
import { supabase as portalSupabase } from '@/lib/crm/portal-client';
import type { PortalAgency } from '@/hooks/usePortalAgency';

interface CsrContactTabProps {
  agencyName: string;
  agencyId: string;
  agency: PortalAgency;
  onRefresh: () => Promise<void>;
}

function formatPhoneDisplay(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  if (digits.length === 11 && digits[0] === '1') return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  return phone;
}

export function CsrContactTab({ agency, onRefresh }: CsrContactTabProps) {
  const [editing, setEditing] = useState(false);
  const hasCsr = agency.csr_first_name || agency.csr_last_name;
  const fullName = [agency.csr_first_name, agency.csr_last_name].filter(Boolean).join(' ');

  if (!hasCsr && !editing) {
    return (
      <div className="max-w-lg mx-auto">
        <div className="bg-white rounded-xl border border-steel-200 p-10 text-center">
          <div className="w-16 h-16 rounded-full bg-steel-100 flex items-center justify-center mx-auto mb-5">
            <HeadphonesIcon className="w-8 h-8 text-steel-400" />
          </div>
          <h2 className="text-xl font-bold text-steel-900 mb-2">CSR Not Yet Assigned</h2>
          <p className="text-sm text-steel-500 max-w-sm mx-auto">
            Your dedicated Customer Service Representative has not been assigned yet.
            You'll be notified once one is assigned to your agency.
          </p>
          <div className="mt-6 pt-6 border-t border-steel-100">
            <p className="text-xs text-steel-400">
              Need immediate help? Contact us at{' '}
              <a href="mailto:Contracting@teamFYM.com" className="text-navy-600 hover:underline font-medium">Contracting@teamFYM.com</a>
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (editing) {
    return (
      <div className="max-w-lg mx-auto">
        <CsrEditForm agency={agency} onRefresh={onRefresh} onCancel={() => setEditing(false)} />
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto">
      <div className="bg-white rounded-xl border border-steel-200 overflow-hidden shadow-sm">
        <div className="bg-gradient-to-r from-navy-800 to-navy-600 px-6 py-6 text-center relative">
          <button onClick={() => setEditing(true)} className="absolute top-4 right-4 p-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors border border-white/20" title="Edit CSR">
            <Pencil className="w-4 h-4 text-white" />
          </button>
          <div className="w-16 h-16 rounded-full bg-white/15 flex items-center justify-center mx-auto mb-3 border border-white/20">
            <User className="w-8 h-8 text-gold-300" />
          </div>
          <h2 className="text-xl font-bold text-white">{fullName}</h2>
          <p className="text-white/60 text-sm mt-0.5">Your Dedicated CSR</p>
        </div>

        <div className="p-6 space-y-4">
          {agency.csr_phone && <ContactRow icon={Phone} label="Phone" value={formatPhoneDisplay(agency.csr_phone)} href={`tel:${agency.csr_phone}`} />}
          {agency.csr_email && <ContactRow icon={Mail} label="Email" value={agency.csr_email} href={`mailto:${agency.csr_email}`} />}
          {agency.csr_npn && <ContactRow icon={Shield} label="NPN" value={agency.csr_npn} />}
          {agency.csr_gender && <ContactRow icon={User} label="Gender" value={agency.csr_gender} />}
        </div>

        {agency.csr_can_fill_seat && (
          <div className="px-6 py-3 bg-emerald-50 border-t border-emerald-100">
            <p className="text-xs text-emerald-700 font-medium">This CSR will temporarily fill an agent's seat if terminated</p>
          </div>
        )}

        <div className="px-6 py-4 bg-steel-50 border-t border-steel-100">
          <div className="flex items-center gap-2 text-xs text-steel-400"><Clock className="w-3 h-3" /><span>Available Monday - Friday, 9am - 5pm EST</span></div>
        </div>
      </div>
    </div>
  );
}

function CsrEditForm({ agency, onRefresh, onCancel }: { agency: PortalAgency; onRefresh: () => Promise<void>; onCancel: () => void }) {
  const [firstName, setFirstName] = useState(agency.csr_first_name || '');
  const [lastName, setLastName] = useState(agency.csr_last_name || '');
  const [phone, setPhone] = useState(agency.csr_phone || '');
  const [email, setEmail] = useState(agency.csr_email || '');
  const [npn, setNpn] = useState(agency.csr_npn || '');
  const [gender, setGender] = useState(agency.csr_gender || '');
  const [canFillSeat, setCanFillSeat] = useState(agency.csr_can_fill_seat || false);
  const [saving, setSaving] = useState(false);

  const isValid = firstName.trim() && lastName.trim() && phone.trim() && email.trim() && gender;
  const fullName = `${firstName.trim()} ${lastName.trim()}`.trim();
  const inputClass = 'w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-navy-500 focus:border-transparent text-sm';

  const handleSave = async () => {
    if (!isValid) return;
    setSaving(true);
    await portalSupabase.from('hierarchy_agencies').update({
      assigned_csr: fullName, csr_first_name: firstName.trim(), csr_last_name: lastName.trim(),
      csr_phone: phone.trim(), csr_email: email.trim(), csr_npn: npn.trim() || null,
      csr_gender: gender || null, csr_can_fill_seat: npn.trim() ? canFillSeat : false,
      updated_at: new Date().toISOString(),
    }).eq('id', agency.id);
    setSaving(false);
    await onRefresh();
    onCancel();
  };

  return (
    <div className="bg-white rounded-xl border border-steel-200 overflow-hidden shadow-sm">
      <div className="flex items-center justify-between px-6 py-4 border-b border-steel-100">
        <h3 className="font-semibold text-gray-900">Edit CSR Information</h3>
        <button onClick={onCancel} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors text-gray-500"><X className="w-5 h-5" /></button>
      </div>
      <div className="p-6 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div><label className="block text-sm font-medium text-gray-700 mb-1">First Name *</label><input type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)} className={inputClass} placeholder="First name" /></div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Last Name *</label><input type="text" value={lastName} onChange={(e) => setLastName(e.target.value)} className={inputClass} placeholder="Last name" /></div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Phone *</label><input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className={inputClass} placeholder="(555) 123-4567" /></div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Email *</label><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} placeholder="csr@example.com" /></div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div><label className="block text-sm font-medium text-gray-700 mb-1">NPN <span className="text-gray-400 font-normal">(optional)</span></label><input type="text" value={npn} onChange={(e) => { setNpn(e.target.value); if (!e.target.value.trim()) setCanFillSeat(false); }} className={inputClass} placeholder="National Producer Number" /></div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Gender <span className="text-red-500">*</span></label>
            <div className="flex gap-3 mt-1">
              <button type="button" onClick={() => setGender('Male')} className={`flex-1 px-4 py-2.5 rounded-lg border text-sm font-medium transition-colors ${gender === 'Male' ? 'bg-navy-600 text-white border-navy-600' : 'bg-white text-gray-700 border-gray-300 hover:border-gray-400'}`}>Male</button>
              <button type="button" onClick={() => setGender('Female')} className={`flex-1 px-4 py-2.5 rounded-lg border text-sm font-medium transition-colors ${gender === 'Female' ? 'bg-navy-600 text-white border-navy-600' : 'bg-white text-gray-700 border-gray-300 hover:border-gray-400'}`}>Female</button>
            </div>
          </div>
        </div>
        <div className={`flex items-start gap-3 p-4 rounded-lg border transition-colors ${npn.trim() ? 'bg-white border-gray-200' : 'bg-gray-50 border-gray-100'}`}>
          <button type="button" role="switch" aria-checked={canFillSeat} disabled={!npn.trim()} onClick={() => setCanFillSeat(!canFillSeat)}
            className={`relative inline-flex h-6 w-11 flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-navy-500 focus:ring-offset-2 ${!npn.trim() ? 'bg-gray-200 cursor-not-allowed' : canFillSeat ? 'bg-navy-600 cursor-pointer' : 'bg-gray-300 cursor-pointer'}`}>
            <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow ring-0 transition-transform duration-200 ease-in-out ${canFillSeat ? 'translate-x-5' : 'translate-x-0'}`} />
          </button>
          <div className="flex-1">
            <p className={`text-sm font-medium ${npn.trim() ? 'text-gray-900' : 'text-gray-400'}`}>If an agent is terminated, this CSR will temporarily fill that seat</p>
            {!npn.trim() && <p className="text-xs text-gray-400 mt-0.5">Requires NPN to enable</p>}
          </div>
        </div>
        <div className="flex items-center gap-3 justify-end pt-2">
          <button onClick={onCancel} className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 transition-colors">Cancel</button>
          <button onClick={handleSave} disabled={saving || !isValid} className="px-5 py-2.5 text-sm font-medium text-white bg-navy-600 rounded-lg hover:bg-navy-700 transition-colors disabled:opacity-50">{saving ? 'Saving...' : 'Save Changes'}</button>
        </div>
      </div>
    </div>
  );
}

function ContactRow({ icon: Icon, label, value, href }: { icon: React.FC<{ className?: string }>; label: string; value: string; href?: string }) {
  return (
    <div className="flex items-center gap-4 p-3 rounded-lg bg-steel-50 hover:bg-steel-100 transition-colors">
      <div className="w-10 h-10 rounded-lg bg-navy-50 flex items-center justify-center flex-shrink-0 border border-navy-100"><Icon className="w-5 h-5 text-navy-600" /></div>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-steel-500">{label}</p>
        {href ? <a href={href} className="text-sm font-medium text-navy-600 hover:underline">{value}</a> : <p className="text-sm font-medium text-steel-900">{value}</p>}
      </div>
    </div>
  );
}
