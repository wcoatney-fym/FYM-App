/**
 * My Production — Policies Tab
 *
 * Searchable, filterable, sortable policy table with CSV export.
 * Scoped to the logged-in agent's own policies.
 */
import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Search, Download, ChevronDown, ChevronUp } from 'lucide-react';
import type { PolicyRow } from '../types';
import { fmt$, fmtDate, statusBadge } from '../helpers';

type PolicySort = 'effective' | 'premium' | 'status' | 'drafts' | 'paid';

interface PoliciesTabProps {
  policies: PolicyRow[];
  writingNumber: string | null;
}

export function PoliciesTab({ policies, writingNumber }: PoliciesTabProps) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'terminated' | 'pending' | 'at_risk'>('all');
  const [sortKey, setSortKey] = useState<PolicySort>('effective');
  const [sortAsc, setSortAsc] = useState(false);

  const displayed = useMemo(() => {
    let filtered = [...policies];

    if (statusFilter === 'at_risk') {
      filtered = filtered.filter(p => p.is_at_risk);
    } else if (statusFilter !== 'all') {
      filtered = filtered.filter(p => p.status === statusFilter);
    }

    if (search) {
      const q = search.toLowerCase();
      filtered = filtered.filter(p =>
        p.policy_number.toLowerCase().includes(q) ||
        p.product_type.toLowerCase().includes(q)
      );
    }

    const dir = sortAsc ? 1 : -1;
    filtered.sort((a, b) => {
      switch (sortKey) {
        case 'effective':
          return dir * ((a.policy_effective_date || '').localeCompare(b.policy_effective_date || ''));
        case 'premium':
          return dir * (Number(a.annual_premium) - Number(b.annual_premium));
        case 'status':
          return dir * a.status.localeCompare(b.status);
        case 'drafts':
          return dir * (a.draft_count - b.draft_count);
        case 'paid':
          return dir * ((a.paid_to_date || '').localeCompare(b.paid_to_date || ''));
        default: return 0;
      }
    });

    return filtered;
  }, [policies, statusFilter, search, sortKey, sortAsc]);

  function toggleSort(key: PolicySort) {
    if (sortKey === key) setSortAsc(p => !p);
    else { setSortKey(key); setSortAsc(key === 'effective' ? false : true); }
  }

  function SortArrow({ k }: { k: PolicySort }) {
    if (sortKey !== k) return null;
    return sortAsc
      ? <ChevronUp size={12} className="inline ml-0.5" />
      : <ChevronDown size={12} className="inline ml-0.5" />;
  }

  function exportCSV() {
    const headers = ['Policy #', 'Product', 'Status', 'Monthly Premium', 'Annual Premium', 'Effective Date', 'Paid To Date', 'Drafts', 'At Risk', 'Flag', 'Days Since Paid'];
    const csvRows = [headers.join(',')];
    displayed.forEach(p => {
      csvRows.push([
        p.policy_number,
        p.product_type,
        p.status,
        p.monthly_premium,
        p.annual_premium,
        p.policy_effective_date || '',
        p.paid_to_date || '',
        p.draft_count,
        p.is_at_risk ? 'Yes' : 'No',
        p.flag_type || '',
        p.days_since_paid ?? '',
      ].join(','));
    });
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `my-production-${writingNumber || 'agent'}-policies.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="mt-4">
      <Card className="border-border">
        <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-3">
          <CardTitle className="text-base text-foreground">
            My Policies
            <Badge className="ml-2 bg-secondary text-muted-foreground border-border border text-xs">
              {displayed.length}{policies.length !== displayed.length ? ` / ${policies.length}` : ''}
            </Badge>
          </CardTitle>
          <div className="flex items-center gap-2 flex-wrap">
            {/* Status filter chips */}
            <div className="flex items-center gap-1">
              {([['all', 'All'], ['active', 'Active'], ['terminated', 'Term'], ['pending', 'Pend'], ['at_risk', 'At Risk']] as const).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setStatusFilter(key)}
                  className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                    statusFilter === key
                      ? 'gradient-primary text-primary-foreground'
                      : 'bg-secondary text-muted-foreground hover:bg-secondary/80'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="relative w-40">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/50" />
              <Input
                placeholder="Search..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-8 h-7 text-xs"
              />
            </div>
            <button
              onClick={exportCSV}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-secondary text-muted-foreground hover:bg-secondary/80 text-xs font-medium transition-colors"
              title="Export CSV"
            >
              <Download size={12} /> CSV
            </button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {displayed.length === 0 ? (
            <div className="px-4 py-12 text-center text-muted-foreground text-sm">
              {policies.length === 0 ? 'No policies found.' : 'No policies match your filter.'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <div className="min-w-[800px]">
                {/* Header */}
                <div className="grid grid-cols-8 gap-2 px-4 py-2.5 bg-secondary/30 text-xs font-semibold text-muted-foreground font-data border-b border-border/30">
                  <span className="col-span-2">Policy #</span>
                  <span>Product</span>
                  <span>Status</span>
                  <span
                    className="text-right cursor-pointer hover:text-foreground select-none"
                    onClick={() => toggleSort('premium')}
                  >Annual Premium <SortArrow k="premium" /></span>
                  <span
                    className="text-right cursor-pointer hover:text-foreground select-none"
                    onClick={() => toggleSort('effective')}
                  >Effective <SortArrow k="effective" /></span>
                  <span
                    className="text-right cursor-pointer hover:text-foreground select-none"
                    onClick={() => toggleSort('paid')}
                  >Paid To <SortArrow k="paid" /></span>
                  <span
                    className="text-center cursor-pointer hover:text-foreground select-none"
                    onClick={() => toggleSort('drafts')}
                  >Drafts <SortArrow k="drafts" /></span>
                </div>

                {/* Rows */}
                <div className="divide-y divide-border/20 max-h-[600px] overflow-y-auto">
                  {displayed.map(p => {
                    const sb = statusBadge(p.status, p.is_at_risk);
                    return (
                      <div
                        key={p.policy_number}
                        className="grid grid-cols-8 gap-2 px-4 py-2.5 text-sm items-center hover:bg-secondary/20 transition-colors"
                      >
                        <span className="col-span-2 font-data text-xs text-foreground truncate">
                          {p.policy_number}
                        </span>
                        <span className="text-muted-foreground text-xs">{p.product_type}</span>
                        <span>
                          <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-semibold border ${sb.cls}`}>
                            {sb.label}
                          </span>
                        </span>
                        <span className="text-right font-data text-foreground/80">
                          {fmt$(Number(p.annual_premium))}
                        </span>
                        <span className="text-right font-data text-xs text-muted-foreground">
                          {fmtDate(p.policy_effective_date)}
                        </span>
                        <span className={`text-right font-data text-xs ${
                          p.days_since_paid !== null && p.days_since_paid > 45
                            ? 'text-red-400'
                            : p.days_since_paid !== null && p.days_since_paid > 30
                            ? 'text-amber-400'
                            : 'text-muted-foreground'
                        }`}>
                          {fmtDate(p.paid_to_date)}
                          {p.days_since_paid !== null && p.days_since_paid > 30 && (
                            <span className="ml-1 text-[10px]">({p.days_since_paid}d)</span>
                          )}
                        </span>
                        <span className={`text-center font-data text-xs ${
                          p.draft_count >= 3 ? 'text-emerald-400' : p.draft_count > 0 ? 'text-foreground/70' : 'text-muted-foreground/40'
                        }`}>
                          {p.draft_count}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
