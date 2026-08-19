/**
 * CrossSellTab — Agency-scoped cross-sell products view for CRM Management.
 *
 * Features:
 *   - View configured cross-sell products
 *   - Request changes (submit a support ticket tagged as cross-sell change)
 */
import { useState, useEffect } from 'react';
import { ArrowLeftRight, Package, MessageSquare, Send, X, CheckCircle2 } from 'lucide-react';
import { supabase as portalSupabase } from '@/lib/crm/portal-client';

interface CrossSellProduct {
  id: string;
  product_number: string | null;
  product_name: string | null;
  fields: Record<string, unknown> | null;
  ai_prompt: string | null;
  created_at: string;
}

interface CrossSellTabProps {
  agencyName: string;
  agencyId: string;
}

export function CrossSellTab({ agencyName }: CrossSellTabProps) {
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<CrossSellProduct[]>([]);
  const [portalAgencyId, setPortalAgencyId] = useState<string | null>(null);
  const [requestingFor, setRequestingFor] = useState<string | null>(null);
  const [requestMessage, setRequestMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState<string | null>(null);

  useEffect(() => { loadProducts(); }, [agencyName]);

  const loadProducts = async () => {
    setLoading(true);

    const { data: agencies } = await portalSupabase
      .from('hierarchy_agencies')
      .select('id, name, parent_agency_id')
      .eq('is_active', true)
      .eq('crm_enabled', true);

    if (!agencies) { setLoading(false); return; }

    const normalizedName = agencyName.toLowerCase().trim();
    const parent = agencies.find(
      (a: { name: string }) => a.name.toLowerCase().trim() === normalizedName
    ) || agencies.find(
      (a: { name: string }) =>
        normalizedName.includes(a.name.toLowerCase().trim()) ||
        a.name.toLowerCase().trim().includes(normalizedName)
    );

    if (!parent) { setProducts([]); setLoading(false); return; }

    setPortalAgencyId(parent.id);

    const children = agencies.filter(
      (a: { parent_agency_id: string | null }) => a.parent_agency_id === parent.id
    );
    const groupIds = [parent, ...children].map((a: { id: string }) => a.id);

    const { data } = await portalSupabase
      .from('crm_agency_cross_sell')
      .select('*')
      .in('agency_id', groupIds)
      .order('created_at', { ascending: false });

    setProducts((data || []) as CrossSellProduct[]);
    setLoading(false);
  };

  const submitChangeRequest = async (productName: string) => {
    if (!requestMessage.trim() || !portalAgencyId) return;
    setSubmitting(true);

    // Submit as a support ticket with category "Cross-Sell Change"
    const { error } = await portalSupabase
      .from('crm_tickets')
      .insert({
        agency_id: portalAgencyId,
        subject: `Cross-Sell Change Request: ${productName}`,
        description: requestMessage.trim(),
        category: 'Cross-Sell Change',
        priority: 'medium',
        status: 'open',
        submitted_by: agencyName,
      });

    setSubmitting(false);

    if (!error) {
      setSubmitted(productName);
      setRequestingFor(null);
      setRequestMessage('');
      // Clear success message after 3 seconds
      setTimeout(() => setSubmitted(null), 3000);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mr-3" />
        Loading cross-sell products…
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <ArrowLeftRight className="w-12 h-12 mb-3 opacity-40" />
        <p className="text-lg font-medium">No Cross-Sell Products</p>
        <p className="text-sm mt-1">No cross-sell products have been configured for your agency.</p>
        <p className="text-sm mt-1">Contact your CSR to set up cross-sell products.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">
          {products.length} product{products.length !== 1 ? 's' : ''} configured
        </h3>
        <p className="text-xs text-muted-foreground">Click "Request Change" to modify a product configuration</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {products.map((p) => {
          const isRequesting = requestingFor === p.id;
          const justSubmitted = submitted === (p.product_name || p.id);

          return (
            <div key={p.id} className="bg-card border border-border/40 rounded-xl p-4">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Package className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-semibold text-foreground">
                    {p.product_name || 'Unnamed Product'}
                  </h4>
                  {p.product_number && (
                    <p className="text-xs text-muted-foreground font-mono mt-0.5">
                      #{p.product_number}
                    </p>
                  )}
                  <p className="text-[10px] text-muted-foreground mt-1">
                    Added {new Date(p.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </p>

                  {/* Request Change button / form */}
                  {!isRequesting && !justSubmitted && (
                    <button
                      onClick={() => { setRequestingFor(p.id); setRequestMessage(''); }}
                      className="mt-2 flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors"
                    >
                      <MessageSquare className="w-3 h-3" />
                      Request Change
                    </button>
                  )}

                  {justSubmitted && (
                    <div className="mt-2 flex items-center gap-1 text-xs text-emerald-400">
                      <CheckCircle2 className="w-3 h-3" />
                      Change request submitted
                    </div>
                  )}

                  {isRequesting && (
                    <div className="mt-3 space-y-2">
                      <textarea
                        value={requestMessage}
                        onChange={(e) => setRequestMessage(e.target.value)}
                        rows={3}
                        placeholder="Describe what you'd like changed (e.g., update specialist, change product details, add/remove fields)…"
                        className="w-full px-3 py-2 text-xs bg-secondary/50 border border-border/40 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary/50 resize-none"
                      />
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => submitChangeRequest(p.product_name || 'Unknown Product')}
                          disabled={submitting || !requestMessage.trim()}
                          className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          {submitting ? (
                            <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-primary-foreground" />
                          ) : (
                            <Send className="w-3 h-3" />
                          )}
                          Submit
                        </button>
                        <button
                          onClick={() => { setRequestingFor(null); setRequestMessage(''); }}
                          className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium bg-secondary text-muted-foreground rounded-lg hover:text-foreground transition-colors"
                        >
                          <X className="w-3 h-3" />
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
