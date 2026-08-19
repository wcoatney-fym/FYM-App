/**
 * CrossSellTab — Agency-scoped cross-sell products.
 * Ported 1:1 from contracting-portal PortalCrossSellTab.tsx
 * Styled for FYM App dark theme.
 */
import { useState, useEffect, useCallback } from 'react';
import { Package, User, Phone, ChevronDown, ChevronRight, Loader2, Clock, CheckCircle2, Calendar, Send, X } from 'lucide-react';
import { supabase as portalSupabase } from '@/lib/crm/portal-client';

type AgencyCrossSell = { id: string; agency_id: string; product_number: number; product_name: string; fields: Record<string, string> };
type SpecialistChangeRequest = { id: string; agency_id: string; product_number: number; requested_full_name: string; requested_mobile: string; status: 'pending' | 'calendar_added' | 'confirmed'; submitted_by: string; calendar_added_at: string | null; confirmed_at: string | null; created_at: string };
interface AgencyInfo { id: string; name: string; parent_agency_id?: string | null }

interface CrossSellTabProps { agencyName: string; agencyId: string; agencyIds: string[]; allAgencies: AgencyInfo[] }

export function CrossSellTab({ agencyIds, allAgencies }: CrossSellTabProps) {
  const [products, setProducts] = useState<AgencyCrossSell[]>([]);
  const [requests, setRequests] = useState<SpecialistChangeRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedProduct, setExpandedProduct] = useState<string | null>(null);
  const [showRequestForm, setShowRequestForm] = useState<{ agencyId: string; productNumber: number } | null>(null);
  const [requestForm, setRequestForm] = useState({ fullName: '', mobile: '', submittedBy: '' });
  const [submitting, setSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  const loadData = useCallback(async () => {
    if (agencyIds.length === 0) return;
    const [productsRes, requestsRes] = await Promise.all([
      portalSupabase.from('crm_agency_cross_sell').select('*').in('agency_id', agencyIds).order('product_number'),
      portalSupabase.from('specialist_change_requests').select('*').in('agency_id', agencyIds).order('created_at', { ascending: false }),
    ]);
    setProducts((productsRes.data || []) as AgencyCrossSell[]);
    setRequests((requestsRes.data || []) as SpecialistChangeRequest[]);
    setLoading(false);
  }, [agencyIds]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleSubmitRequest = async (agencyId: string, productNumber: number) => {
    if (!requestForm.fullName.trim() || !requestForm.mobile.trim() || !requestForm.submittedBy.trim()) return;
    setSubmitting(true);
    const { error } = await portalSupabase.from('specialist_change_requests').insert({
      agency_id: agencyId, product_number: productNumber,
      requested_full_name: requestForm.fullName.trim(), requested_mobile: requestForm.mobile.trim(), submitted_by: requestForm.submittedBy.trim(),
    });
    if (!error) {
      setSubmitSuccess(true); setRequestForm({ fullName: '', mobile: '', submittedBy: '' }); await loadData();
      setTimeout(() => { setSubmitSuccess(false); setShowRequestForm(null); }, 2000);
    }
    setSubmitting(false);
  };

  const getProductRequests = (agencyId: string, productNumber: number) => requests.filter((r) => r.agency_id === agencyId && r.product_number === productNumber);
  const agencyNameMap = new Map(allAgencies.map((a) => [a.id, a.name]));
  const parentAgencies = allAgencies.filter((a) => !a.parent_agency_id);
  const childAgenciesArr = allAgencies.filter((a) => a.parent_agency_id);
  const orderedAgencies = [...parentAgencies, ...childAgenciesArr];
  const multipleAgencies = agencyIds.length > 1 && allAgencies.length > 1;
  const getProductsForAgency = (agencyId: string) => products.filter((p) => p.agency_id === agencyId);

  if (loading) return <div className="flex items-center justify-center py-16"><Loader2 className="w-5 h-5 animate-spin text-primary" /><span className="ml-2 text-sm text-muted-foreground">Loading products...</span></div>;
  if (products.length === 0) return <div className="text-center py-16"><Package className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" /><p className="text-muted-foreground text-sm">Cross-sell products have not been configured yet.</p><p className="text-muted-foreground/60 text-xs mt-1">Your CRM team will set these up during onboarding.</p></div>;

  const inputClass = 'w-full px-3 py-2 bg-secondary/50 border border-border/50 rounded-lg focus:ring-2 focus:ring-primary/50 focus:border-primary/50 text-sm text-foreground placeholder:text-muted-foreground/50';

  const renderProductCard = (product: AgencyCrossSell) => {
    const expandKey = `${product.agency_id}-${product.product_number}`;
    const isExpanded = expandedProduct === expandKey;
    const productRequests = getProductRequests(product.agency_id, product.product_number);
    const specialistName = product.fields?.specialist_full_name || '';
    const specialistMobile = product.fields?.specialist_mobile || '';

    return (
      <div key={product.id} className="glass rounded-xl overflow-hidden">
        <button onClick={() => setExpandedProduct(isExpanded ? null : expandKey)} className="w-full flex items-center gap-3 px-5 py-4 bg-secondary/20 hover:bg-secondary/40 transition-colors text-left">
          {isExpanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
          <span className="w-7 h-7 rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-bold flex items-center justify-center">{product.product_number}</span>
          <span className="font-semibold text-foreground text-sm flex-1">{product.product_name}</span>
          {specialistName && <span className="text-xs text-muted-foreground flex items-center gap-1"><User className="w-3 h-3" />{specialistName}</span>}
        </button>
        {isExpanded && (
          <div className="p-5 space-y-4 border-t border-border/30">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-secondary/30 rounded-lg p-3"><p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide mb-1">Specialist</p><div className="flex items-center gap-2"><User className="w-4 h-4 text-muted-foreground/50" /><span className="text-sm font-medium text-foreground">{specialistName || 'Not assigned'}</span></div></div>
              <div className="bg-secondary/30 rounded-lg p-3"><p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide mb-1">Mobile</p><div className="flex items-center gap-2"><Phone className="w-4 h-4 text-muted-foreground/50" /><span className="text-sm font-medium text-foreground">{specialistMobile || 'Not assigned'}</span></div></div>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={() => { setShowRequestForm({ agencyId: product.agency_id, productNumber: product.product_number }); setRequestForm({ fullName: '', mobile: '', submittedBy: '' }); setSubmitSuccess(false); }}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-primary bg-primary/10 border border-primary/20 rounded-lg hover:bg-primary/20 transition-colors">
                <Send className="w-3.5 h-3.5" />Request Specialist Change
              </button>
            </div>
            {productRequests.length > 0 && (
              <div><p className="text-xs font-semibold text-muted-foreground mb-2">Recent Requests</p>
                <div className="space-y-2">
                  {productRequests.slice(0, 5).map((req) => (
                    <div key={req.id} className="flex items-center gap-3 px-3 py-2 bg-secondary/30 rounded-lg border border-border/20">
                      <StatusBadge status={req.status} />
                      <div className="flex-1 min-w-0"><p className="text-xs font-medium text-foreground truncate">{req.requested_full_name} - {req.requested_mobile}</p><p className="text-[10px] text-muted-foreground/60">Submitted {new Date(req.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} by {req.submitted_by}</p></div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 mb-2"><Package className="w-5 h-5 text-emerald-400" /><div><h2 className="text-lg font-bold text-foreground">Cross-Sell Products</h2><p className="text-xs text-muted-foreground">View your configured products and request specialist changes</p></div></div>

      {multipleAgencies ? orderedAgencies.map((ag) => {
        const agencyProducts = getProductsForAgency(ag.id);
        if (agencyProducts.length === 0) return null;
        const isChild = !!ag.parent_agency_id;
        return <div key={ag.id} className={isChild ? 'ml-4' : ''}>
          <div className="flex items-center gap-2 mb-3 mt-4"><span className={`text-sm font-semibold ${isChild ? 'text-muted-foreground' : 'text-foreground'}`}>{ag.name}</span>{isChild && <span className="text-[10px] text-muted-foreground/60 bg-secondary/50 px-1.5 py-0.5 rounded">Sub-agency</span>}</div>
          <div className="space-y-3">{agencyProducts.map(renderProductCard)}</div>
        </div>;
      }) : products.filter((p) => p.agency_id === agencyIds[0]).map(renderProductCard)}

      {showRequestForm !== null && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="glass rounded-2xl shadow-2xl max-w-md w-full">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border/40"><h2 className="text-lg font-bold text-foreground">Request Specialist Change</h2><button onClick={() => setShowRequestForm(null)} className="p-1 hover:bg-secondary/50 rounded transition-colors"><X className="w-5 h-5 text-muted-foreground" /></button></div>
            <div className="px-6 py-5 space-y-4">
              {submitSuccess ? (
                <div className="text-center py-4"><CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto mb-2" /><p className="font-medium text-foreground">Request Submitted</p><p className="text-xs text-muted-foreground mt-1">Your CRM team will review this shortly.</p></div>
              ) : (<>
                <p className="text-sm text-muted-foreground">Submit a request to change the specialist for Product #{showRequestForm.productNumber}{multipleAgencies && agencyNameMap.get(showRequestForm.agencyId) ? ` (${agencyNameMap.get(showRequestForm.agencyId)})` : ''}. The CRM team will add the new specialist to the calendar and confirm the change.</p>
                <div><label className="block text-xs font-medium text-foreground/80 mb-1">New Specialist Full Name</label><input type="text" value={requestForm.fullName} onChange={(e) => setRequestForm((f) => ({ ...f, fullName: e.target.value }))} className={inputClass} placeholder="John Smith" /></div>
                <div><label className="block text-xs font-medium text-foreground/80 mb-1">New Specialist Mobile #</label><input type="tel" value={requestForm.mobile} onChange={(e) => setRequestForm((f) => ({ ...f, mobile: e.target.value }))} className={inputClass} placeholder="(555) 123-4567" /></div>
                <div><label className="block text-xs font-medium text-foreground/80 mb-1">Your Name</label><input type="text" value={requestForm.submittedBy} onChange={(e) => setRequestForm((f) => ({ ...f, submittedBy: e.target.value }))} className={inputClass} placeholder="Jane Doe" /></div>
              </>)}
            </div>
            {!submitSuccess && (
              <div className="px-6 py-4 bg-secondary/20 rounded-b-2xl flex justify-end gap-3 border-t border-border/30">
                <button onClick={() => setShowRequestForm(null)} className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Cancel</button>
                <button onClick={() => handleSubmitRequest(showRequestForm.agencyId, showRequestForm.productNumber)} disabled={submitting || !requestForm.fullName.trim() || !requestForm.mobile.trim() || !requestForm.submittedBy.trim()} className="px-4 py-2 text-sm font-medium text-primary-foreground bg-primary rounded-lg hover:bg-primary/80 transition-colors disabled:opacity-50">{submitting ? 'Submitting...' : 'Submit Request'}</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { icon: React.FC<{ className?: string }>; label: string; colors: string }> = {
    pending: { icon: Clock, label: 'Pending', colors: 'bg-amber-500/15 text-amber-400 border-amber-500/20' },
    calendar_added: { icon: Calendar, label: 'Calendar Added', colors: 'bg-blue-500/15 text-blue-400 border-blue-500/20' },
    confirmed: { icon: CheckCircle2, label: 'Confirmed', colors: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20' },
  };
  const c = config[status] || config.pending;
  const Icon = c.icon;
  return <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${c.colors}`}><Icon className="w-3 h-3" />{c.label}</span>;
}
