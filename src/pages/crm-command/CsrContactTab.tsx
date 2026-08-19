/**
 * CsrContactTab — Agency-scoped CSR contact info for CRM Management.
 *
 * Shows the assigned CSR details from hierarchy_agencies.
 */
import { useState, useEffect } from 'react';
import { UserCircle, Mail, Phone, Shield } from 'lucide-react';
import { supabase as portalSupabase } from '@/lib/crm/portal-client';

interface CsrData {
  name: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  npn: string | null;
  canFillSeat: boolean;
}

interface CsrContactTabProps {
  agencyName: string;
  agencyId: string;
}

export function CsrContactTab({ agencyName }: CsrContactTabProps) {
  const [loading, setLoading] = useState(true);
  const [csr, setCsr] = useState<CsrData | null>(null);

  useEffect(() => {
    loadCsr();
  }, [agencyName]);

  const loadCsr = async () => {
    setLoading(true);
    const { data: agencies } = await portalSupabase
      .from('hierarchy_agencies')
      .select('assigned_csr, csr_first_name, csr_last_name, csr_email, csr_phone, csr_npn, csr_can_fill_seat, name')
      .eq('is_active', true)
      .eq('crm_enabled', true);

    if (!agencies) { setLoading(false); return; }

    const normalizedName = agencyName.toLowerCase().trim();
    const agency = agencies.find(
      (a: { name: string }) => a.name.toLowerCase().trim() === normalizedName
    ) || agencies.find(
      (a: { name: string }) =>
        normalizedName.includes(a.name.toLowerCase().trim()) ||
        a.name.toLowerCase().trim().includes(normalizedName)
    );

    if (!agency) { setLoading(false); return; }

    setCsr({
      name: agency.assigned_csr || null,
      firstName: agency.csr_first_name || null,
      lastName: agency.csr_last_name || null,
      email: agency.csr_email || null,
      phone: agency.csr_phone || null,
      npn: agency.csr_npn || null,
      canFillSeat: agency.csr_can_fill_seat || false,
    });
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mr-3" />
        Loading CSR info…
      </div>
    );
  }

  if (!csr || !csr.name) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <UserCircle className="w-12 h-12 mb-3 opacity-40" />
        <p className="text-lg font-medium">No CSR Assigned</p>
        <p className="text-sm mt-1">A CSR has not been assigned to your agency yet</p>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto">
      <div className="bg-card border border-border/40 rounded-xl p-6">
        <div className="flex items-center gap-4 mb-6">
          <div className="p-3 rounded-full bg-primary/10">
            <UserCircle className="w-8 h-8 text-primary" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-foreground">{csr.name}</h3>
            <p className="text-xs text-muted-foreground">Your Assigned CSR</p>
          </div>
        </div>

        <div className="space-y-4">
          {csr.email && (
            <div className="flex items-center gap-3">
              <Mail className="w-4 h-4 text-muted-foreground" />
              <a href={`mailto:${csr.email}`} className="text-sm text-primary hover:underline">
                {csr.email}
              </a>
            </div>
          )}

          {csr.phone && (
            <div className="flex items-center gap-3">
              <Phone className="w-4 h-4 text-muted-foreground" />
              <a href={`tel:${csr.phone}`} className="text-sm text-foreground hover:text-primary">
                {csr.phone}
              </a>
            </div>
          )}

          {csr.npn && (
            <div className="flex items-center gap-3">
              <Shield className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm text-foreground">NPN: {csr.npn}</span>
            </div>
          )}

          {csr.canFillSeat && (
            <div className="mt-4 p-3 bg-emerald-500/10 rounded-lg">
              <p className="text-xs text-emerald-400 font-medium">
                ✓ This CSR can fill roster seats for your agency
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
