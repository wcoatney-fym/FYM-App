import { useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { HudFrame } from '@/components/ui/hud-frame';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Search, Filter, ChevronLeft, ChevronRight, Activity,
  Phone, Mail, Calendar, User, Building2, MessageSquare,
} from 'lucide-react';
import { MOCK_LEADS, MOCK_CAMPAIGNS } from '@/lib/recruiting';
import type { Lead, LeadStatus } from '@/lib/recruiting';

// ── Status config ──────────────────────────────────────────────────────────
const STATUS_CONFIG: Record<LeadStatus, { label: string; className: string; order: number }> = {
  new: { label: 'New', className: 'bg-blue-500/15 text-blue-400 border-blue-500/30', order: 0 },
  contacted: { label: 'Contacted', className: 'bg-amber-500/15 text-amber-400 border-amber-500/30', order: 1 },
  quoted: { label: 'Quoted', className: 'bg-purple-500/15 text-purple-400 border-purple-500/30', order: 2 },
  placed: { label: 'Placed', className: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30', order: 3 },
  lost: { label: 'Lost', className: 'bg-red-500/15 text-red-400 border-red-500/30', order: 4 },
};

function StatusBadge({ status }: { status: LeadStatus }) {
  const { label, className } = STATUS_CONFIG[status];
  return <Badge variant="outline" className={className}>{label}</Badge>;
}

// ── Pipeline summary ───────────────────────────────────────────────────────
function PipelineSummary({ leads }: { leads: Lead[] }) {
  const counts = useMemo(() => {
    const c: Record<LeadStatus, number> = { new: 0, contacted: 0, quoted: 0, placed: 0, lost: 0 };
    leads.forEach(l => c[l.status]++);
    return c;
  }, [leads]);

  return (
    <div className="grid grid-cols-5 gap-3">
      {(Object.keys(STATUS_CONFIG) as LeadStatus[]).map(status => {
        const { label, className } = STATUS_CONFIG[status];
        return (
          <Card key={status} className="bg-card/60 border-border/30">
            <CardContent className="p-3 text-center">
              <p className="text-2xl font-bold">{counts[status]}</p>
              <Badge variant="outline" className={`${className} mt-1`}>{label}</Badge>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

// ── Lead detail modal ──────────────────────────────────────────────────────
function LeadDetailModal({ lead, open, onClose }: { lead: Lead | null; open: boolean; onClose: () => void }) {
  if (!lead) return null;

  const timeline = [
    { label: 'Created', date: lead.createdAt, icon: Calendar },
    lead.contactedAt && { label: 'Contacted', date: lead.contactedAt, icon: Phone },
    lead.quotedAt && { label: 'Quoted', date: lead.quotedAt, icon: MessageSquare },
    lead.placedAt && { label: 'Placed', date: lead.placedAt, icon: User },
    lead.lostAt && { label: 'Lost', date: lead.lostAt, icon: Activity },
  ].filter(Boolean) as { label: string; date: string; icon: React.ElementType }[];

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg bg-card border-border/40">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <span>{lead.firstName} {lead.lastName}</span>
            <StatusBadge status={lead.status} />
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {/* Contact info */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Phone size={14} />
              <span className="text-foreground">{lead.phone}</span>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <Mail size={14} />
              <span className="text-foreground truncate">{lead.email}</span>
            </div>
          </div>

          {/* Campaign & Assignment */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Campaign</p>
              <p className="text-foreground">{lead.campaignName}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Agency</p>
              <p className="text-foreground">{lead.assignedAgency ?? '—'}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Assigned Agent</p>
              <p className="text-foreground">{lead.assignedAgent ?? '—'}</p>
            </div>
            {lead.lostReason && (
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Lost Reason</p>
                <p className="text-red-400 text-sm">{lead.lostReason}</p>
              </div>
            )}
          </div>

          {/* Timeline */}
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Timeline</p>
            <div className="space-y-2">
              {timeline.map((t, i) => (
                <div key={i} className="flex items-center gap-3 text-sm">
                  <div className="p-1.5 rounded bg-muted/30">
                    <t.icon size={12} className="text-muted-foreground" />
                  </div>
                  <span className="text-muted-foreground w-20">{t.label}</span>
                  <span className="text-foreground">
                    {new Date(t.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────
const PAGE_SIZE = 20;

export function RecruitingLeadsTab() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<LeadStatus | 'all'>('all');
  const [campaignFilter, setCampaignFilter] = useState<string>('all');
  const [page, setPage] = useState(0);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);

  const filtered = useMemo(() => {
    let result = MOCK_LEADS;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(l =>
        l.firstName.toLowerCase().includes(q) ||
        l.lastName.toLowerCase().includes(q) ||
        l.phone.includes(q) ||
        l.email.toLowerCase().includes(q)
      );
    }
    if (statusFilter !== 'all') result = result.filter(l => l.status === statusFilter);
    if (campaignFilter !== 'all') result = result.filter(l => l.campaignId === campaignFilter);
    return result;
  }, [search, statusFilter, campaignFilter]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const pageLeads = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  // Reset page on filter change
  const handleFilter = (fn: () => void) => { fn(); setPage(0); };

  return (
    <div className="p-6 space-y-6">
      {/* Mock data banner */}
      <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs">
        <Activity size={14} />
        <span>Displaying sample data — connect Meta Ads API to see live leads</span>
      </div>

      {/* Pipeline summary */}
      <PipelineSummary leads={MOCK_LEADS} />

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => handleFilter(() => setSearch(e.target.value))}
            placeholder="Search by name, phone, or email..."
            className="pl-9 bg-card/60 border-border/30"
          />
        </div>

        <Select value={statusFilter} onValueChange={v => handleFilter(() => setStatusFilter(v as LeadStatus | 'all'))}>
          <SelectTrigger className="w-36 bg-card/60 border-border/30">
            <Filter size={14} className="mr-1.5 text-muted-foreground" />
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {(Object.keys(STATUS_CONFIG) as LeadStatus[]).map(s => (
              <SelectItem key={s} value={s}>{STATUS_CONFIG[s].label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={campaignFilter} onValueChange={v => handleFilter(() => setCampaignFilter(v))}>
          <SelectTrigger className="w-48 bg-card/60 border-border/30">
            <Filter size={14} className="mr-1.5 text-muted-foreground" />
            <SelectValue placeholder="Campaign" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Campaigns</SelectItem>
            {MOCK_CAMPAIGNS.map(c => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <span className="text-xs text-muted-foreground ml-auto">
          {filtered.length} lead{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Lead table */}
      <HudFrame>
        <Card className="bg-card/60 border-border/30 overflow-hidden">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/30 text-muted-foreground text-xs uppercase tracking-wider">
                    <th className="text-left px-4 py-3">Name</th>
                    <th className="text-left px-3 py-3">Phone</th>
                    <th className="text-center px-3 py-3">Status</th>
                    <th className="text-left px-3 py-3">Campaign</th>
                    <th className="text-left px-3 py-3">Agency</th>
                    <th className="text-left px-3 py-3">Agent</th>
                    <th className="text-right px-4 py-3">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {pageLeads.map(lead => (
                    <tr
                      key={lead.id}
                      className="border-b border-border/10 hover:bg-muted/5 transition-colors cursor-pointer"
                      onClick={() => setSelectedLead(lead)}
                    >
                      <td className="px-4 py-3">
                        <p className="font-medium text-foreground">{lead.firstName} {lead.lastName}</p>
                        <p className="text-xs text-muted-foreground">{lead.email}</p>
                      </td>
                      <td className="px-3 py-3 text-muted-foreground font-mono text-xs">{lead.phone}</td>
                      <td className="px-3 py-3 text-center"><StatusBadge status={lead.status} /></td>
                      <td className="px-3 py-3 text-muted-foreground text-xs">{lead.campaignName}</td>
                      <td className="px-3 py-3 text-muted-foreground text-xs">
                        {lead.assignedAgency ? (
                          <span className="flex items-center gap-1"><Building2 size={12} />{lead.assignedAgency}</span>
                        ) : '—'}
                      </td>
                      <td className="px-3 py-3 text-muted-foreground text-xs">
                        {lead.assignedAgent ? (
                          <span className="flex items-center gap-1"><User size={12} />{lead.assignedAgent}</span>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-3 text-right text-muted-foreground text-xs">
                        {new Date(lead.createdAt + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </td>
                    </tr>
                  ))}
                  {pageLeads.length === 0 && (
                    <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">No leads match your filters</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-border/20">
                <span className="text-xs text-muted-foreground">
                  Page {page + 1} of {totalPages}
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="outline" size="sm"
                    disabled={page === 0}
                    onClick={() => setPage(p => p - 1)}
                    className="h-7 px-2"
                  >
                    <ChevronLeft size={14} />
                  </Button>
                  <Button
                    variant="outline" size="sm"
                    disabled={page >= totalPages - 1}
                    onClick={() => setPage(p => p + 1)}
                    className="h-7 px-2"
                  >
                    <ChevronRight size={14} />
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </HudFrame>

      {/* Detail modal */}
      <LeadDetailModal lead={selectedLead} open={!!selectedLead} onClose={() => setSelectedLead(null)} />
    </div>
  );
}
