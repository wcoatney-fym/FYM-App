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
  Phone, Mail, Calendar, User, Clock, ArrowRight,
} from 'lucide-react';
import { TimePeriodSelector } from '@/components/filters/TimePeriodSelector';
import { type DatePreset, type DateRange, DEFAULT_PRESET, getDateRange } from '@/lib/dateUtils';

import { fetchRecruitingLeads, fetchCampaigns } from '@/lib/recruiting';
import type {
  RecruitingLead, RecruitingDateFilter,
} from '@/lib/recruiting';

import { useCachedMultiFetch } from '@/hooks/useCachedFetch';

// ── Stage config ───────────────────────────────────────────────────────────
const STAGE_CONFIG: Record<string, { label: string; className: string; order: number }> = {
  lead:        { label: 'Lead',        className: 'bg-blue-500/15 text-blue-400 border-blue-500/30', order: 0 },
  attendee:    { label: 'Attendee',    className: 'bg-amber-500/15 text-amber-400 border-amber-500/30', order: 1 },
  hired:       { label: 'Hired',       className: 'bg-purple-500/15 text-purple-400 border-purple-500/30', order: 2 },
  contracting: { label: 'Contracting', className: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30', order: 3 },
  rts:         { label: 'RTS',         className: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30', order: 4 },
  producing:   { label: 'Producing',   className: 'bg-lime-500/15 text-lime-400 border-lime-500/30', order: 5 },
  lost:        { label: 'Lost',        className: 'bg-red-500/15 text-red-400 border-red-500/30', order: 6 },
};

function StageBadge({ stage }: { stage: string }) {
  const config = STAGE_CONFIG[stage] ?? STAGE_CONFIG.lead;
  return <Badge variant="outline" className={config.className}>{config.label}</Badge>;
}

// ── Pipeline summary ───────────────────────────────────────────────────────
function PipelineSummary({ leads }: { leads: RecruitingLead[] }) {
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    Object.keys(STAGE_CONFIG).forEach(k => c[k] = 0);
    leads.forEach(l => { c[l.stage] = (c[l.stage] ?? 0) + 1; });
    return c;
  }, [leads]);

  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-7 gap-3">
      {Object.entries(STAGE_CONFIG).map(([key, config]) => (
        <Card key={key} className="bg-card/60 border-border/30">
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold">{counts[key] ?? 0}</p>
            <Badge variant="outline" className={`${config.className} mt-1`}>{config.label}</Badge>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ── Lead detail modal ──────────────────────────────────────────────────────
function LeadDetailModal({ lead, open, onClose }: { lead: RecruitingLead | null; open: boolean; onClose: () => void }) {
  if (!lead) return null;

  const timeline = [
    { label: 'Lead', date: lead.leadAt, icon: User },
    lead.attendeeAt && { label: 'Attendee', date: lead.attendeeAt, icon: Calendar },
    lead.hiredAt && { label: 'Hired', date: lead.hiredAt, icon: User },
    lead.contractingAt && { label: 'Contracting', date: lead.contractingAt, icon: Clock },
    lead.rtsAt && { label: 'RTS', date: lead.rtsAt, icon: ArrowRight },
    lead.producingAt && { label: 'First Sale', date: lead.producingAt, icon: Activity },
    lead.lostAt && { label: `Lost (at ${lead.lostStage ?? 'unknown'})`, date: lead.lostAt, icon: Activity },
  ].filter(Boolean) as { label: string; date: string; icon: React.ElementType }[];

  // Compute days in current stage
  const stageTimestamps: Record<string, string | null> = {
    lead: lead.leadAt,
    attendee: lead.attendeeAt,
    hired: lead.hiredAt,
    contracting: lead.contractingAt,
    rts: lead.rtsAt,
    producing: lead.producingAt,
  };
  const enteredCurrentStage = stageTimestamps[lead.stage];
  const daysInStage = enteredCurrentStage
    ? Math.round((Date.now() - new Date(enteredCurrentStage).getTime()) / 86400000)
    : null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg bg-card border-border/40">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <span>{lead.name}</span>
            <StageBadge stage={lead.stage} />
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {/* Contact info */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            {lead.phone && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Phone size={14} />
                <span className="text-foreground">{lead.phone}</span>
              </div>
            )}
            {lead.email && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Mail size={14} />
                <span className="text-foreground truncate">{lead.email}</span>
              </div>
            )}
          </div>

          {/* Campaign & Assignment */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Campaign</p>
              <p className="text-foreground">{lead.campaignName ?? '—'}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Ad Set</p>
              <p className="text-foreground">{lead.adSetName ?? '—'}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm">
            {lead.npn && (
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">NPN</p>
                <p className="text-foreground font-mono">{lead.npn}</p>
              </div>
            )}
            {lead.writingNumber && (
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Writing Number</p>
                <p className="text-foreground font-mono">{lead.writingNumber}</p>
              </div>
            )}
            {daysInStage !== null && (
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Days in Stage</p>
                <p className={`text-sm font-mono ${daysInStage > 14 ? 'text-amber-400' : 'text-foreground'}`}>
                  {daysInStage} days
                </p>
              </div>
            )}
          </div>

          {lead.lostReason && (
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Lost Reason</p>
              <p className="text-red-400 text-sm">{lead.lostReason}</p>
            </div>
          )}

          {/* Timeline */}
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Timeline</p>
            <div className="space-y-2">
              {timeline.map((t, i) => (
                <div key={i} className="flex items-center gap-3 text-sm">
                  <div className="p-1.5 rounded bg-muted/30">
                    <t.icon size={12} className="text-muted-foreground" />
                  </div>
                  <span className="text-muted-foreground w-24">{t.label}</span>
                  <span className="text-foreground">
                    {new Date(t.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
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
  const [datePreset, setDatePreset] = useState<DatePreset>(DEFAULT_PRESET);
  const [dateRange, setDateRange] = useState<DateRange>(() => getDateRange(DEFAULT_PRESET));
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState<string>('all');
  const [campaignFilter, setCampaignFilter] = useState<string>('all');
  const [page, setPage] = useState(0);
  const [selectedLead, setSelectedLead] = useState<RecruitingLead | null>(null);

  const dateFilter: RecruitingDateFilter = useMemo(() => ({
    startDate: dateRange.startDate,
    endDate: dateRange.endDate,
  }), [dateRange]);

  const cacheKey = `recruiting-leads-${datePreset}-${dateRange.startDate.slice(0, 10)}`;

  const { data: multiData } = useCachedMultiFetch(cacheKey, {
    leads: () => fetchRecruitingLeads(dateFilter),
    campaigns: () => fetchCampaigns(),
  }, { deps: [datePreset, dateRange.startDate, dateRange.endDate] });

  const allLeads = multiData?.leads ?? [];
  const campaigns = multiData?.campaigns ?? [];

  const filtered = useMemo(() => {
    let result = allLeads;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(l =>
        l.name.toLowerCase().includes(q) ||
        (l.phone && l.phone.includes(q)) ||
        (l.email && l.email.toLowerCase().includes(q)) ||
        (l.npn && l.npn.includes(q))
      );
    }
    if (stageFilter !== 'all') result = result.filter(l => l.stage === stageFilter);
    if (campaignFilter !== 'all') result = result.filter(l => l.campaignId === campaignFilter);
    return result;
  }, [allLeads, search, stageFilter, campaignFilter]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const pageLeads = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const handleFilter = (fn: () => void) => { fn(); setPage(0); };

  function handleDateChange(range: DateRange, preset: DatePreset) {
    setDateRange(range);
    setDatePreset(preset);
    setPage(0);
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header with date selector */}
      <div className="flex items-center justify-between">
        <div />
        <TimePeriodSelector preset={datePreset} dateRange={dateRange} onChange={handleDateChange} />
      </div>

      {/* Pipeline summary */}
      <PipelineSummary leads={allLeads} />

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => handleFilter(() => setSearch(e.target.value))}
            placeholder="Search by name, phone, email, or NPN..."
            className="pl-9 bg-card/60 border-border/30"
          />
        </div>

        <Select value={stageFilter} onValueChange={v => handleFilter(() => setStageFilter(v))}>
          <SelectTrigger className="w-36 bg-card/60 border-border/30">
            <Filter size={14} className="mr-1.5 text-muted-foreground" />
            <SelectValue placeholder="Stage" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Stages</SelectItem>
            {Object.entries(STAGE_CONFIG).map(([key, config]) => (
              <SelectItem key={key} value={key}>{config.label}</SelectItem>
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
            {campaigns.map(c => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <span className="text-xs text-muted-foreground ml-auto">
          {filtered.length} recruit{filtered.length !== 1 ? 's' : ''}
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
                    <th className="text-center px-3 py-3">Stage</th>
                    <th className="text-left px-3 py-3">Campaign</th>
                    <th className="text-left px-3 py-3">NPN</th>
                    <th className="text-right px-3 py-3">Days in Stage</th>
                    <th className="text-right px-4 py-3">Lead Date</th>
                  </tr>
                </thead>
                <tbody>
                  {pageLeads.map(lead => {
                    // Compute days in current stage
                    const stageTimestamps: Record<string, string | null> = {
                      lead: lead.leadAt, attendee: lead.attendeeAt, hired: lead.hiredAt,
                      contracting: lead.contractingAt, rts: lead.rtsAt, producing: lead.producingAt,
                      lost: lead.lostAt,
                    };
                    const enteredAt = stageTimestamps[lead.stage];
                    const daysInStage = enteredAt
                      ? Math.round((Date.now() - new Date(enteredAt).getTime()) / 86400000)
                      : null;

                    return (
                      <tr
                        key={lead.id}
                        className="border-b border-border/10 hover:bg-muted/5 transition-colors cursor-pointer"
                        onClick={() => setSelectedLead(lead)}
                      >
                        <td className="px-4 py-3">
                          <p className="font-medium text-foreground">{lead.name}</p>
                          {lead.email && <p className="text-xs text-muted-foreground">{lead.email}</p>}
                        </td>
                        <td className="px-3 py-3 text-muted-foreground font-mono text-xs">{lead.phone ?? '—'}</td>
                        <td className="px-3 py-3 text-center"><StageBadge stage={lead.stage} /></td>
                        <td className="px-3 py-3 text-muted-foreground text-xs">{lead.campaignName ?? '—'}</td>
                        <td className="px-3 py-3 text-muted-foreground font-mono text-xs">{lead.npn ?? '—'}</td>
                        <td className="px-3 py-3 text-right">
                          {daysInStage !== null && (
                            <span className={`font-mono text-xs ${daysInStage > 14 ? 'text-amber-400' : 'text-muted-foreground'}`}>
                              {daysInStage}d
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right text-muted-foreground text-xs">
                          {new Date(lead.leadAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </td>
                      </tr>
                    );
                  })}
                  {pageLeads.length === 0 && (
                    <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">No recruits match your filters</td></tr>
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
