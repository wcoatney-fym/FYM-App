/**
 * CrossSellTab — Agency-scoped cross-sell products view for CRM Management.
 *
 * Reads from portal DB: crm_agency_cross_sell
 * Shows cross-sell products configured for this agency.
 */
import { useState, useEffect } from 'react';
import { ArrowLeftRight, Package } from 'lucide-react';
import { supabase as portalSupabase } from '@/lib/crm/portal-client';

interface CrossSellProduct {
  id: string;
  product_number: string | null;
  product_name: string | null;
  fields: Record<string, unknown> | null;
  created_at: string;
}

interface CrossSellTabProps {
  agencyName: string;
  agencyId: string;
}

export function CrossSellTab({ agencyName }: CrossSellTabProps) {
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<CrossSellProduct[]>([]);

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
        <p className="text-sm mt-1">No cross-sell products have been configured for your agency</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-sm font-semibold text-foreground">
        {products.length} product{products.length !== 1 ? 's' : ''} configured
      </h3>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {products.map((p) => (
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
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
