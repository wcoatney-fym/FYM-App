/**
 * SupportTab — Agency-scoped support tickets.
 * Ported 1:1 from contracting-portal PortalTicketsTab.tsx
 * Styled for FYM App dark theme.
 */
import { useState, useEffect, useCallback } from 'react';
import {
  MessageSquareText, Plus, ArrowLeft, Clock, Send,
  AlertCircle, CheckCircle2, Loader2, Tag, User, ShieldCheck,
} from 'lucide-react';
import { supabase as portalSupabase } from '@/lib/crm/portal-client';
import type { PortalAgency } from '@/hooks/usePortalAgency';

interface SupportTabProps {
  agencyName: string;
  agencyId: string;
  agencyIds: string[];
  agency: PortalAgency;
}

interface Ticket {
  id: string;
  agency_id: string;
  subject: string;
  description: string;
  category: string;
  status: string;
  priority: string;
  submitted_by: string;
  created_at: string;
  resolved_at: string | null;
  order_type: string | null;
  roster_row_id: string | null;
}

interface TicketMessage {
  id: string;
  ticket_id: string;
  sender_type: string;
  sender_name: string;
  message: string;
  created_at: string;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.FC<{ className?: string }> }> = {
  open: { label: 'Open', color: 'bg-blue-500/15 text-blue-400 border border-blue-500/20', icon: AlertCircle },
  'in-progress': { label: 'In Progress', color: 'bg-amber-500/15 text-amber-400 border border-amber-500/20', icon: Loader2 },
  resolved: { label: 'Resolved', color: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20', icon: CheckCircle2 },
  closed: { label: 'Closed', color: 'bg-secondary text-muted-foreground border border-border/30', icon: CheckCircle2 },
};

const PRIORITY_CONFIG: Record<string, { label: string; color: string }> = {
  low: { label: 'Low', color: 'bg-secondary text-muted-foreground' },
  normal: { label: 'Normal', color: 'bg-blue-500/10 text-blue-400' },
  high: { label: 'High', color: 'bg-red-500/10 text-red-400' },
};

const CATEGORY_LABELS: Record<string, string> = {
  'agent-issue': 'Agent Issue',
  'crm-issue': 'CRM Issue',
  billing: 'Billing',
  other: 'Other',
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function SupportTab({ agency, agencyIds }: SupportTabProps) {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewForm, setShowNewForm] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [statusFilter, setStatusFilter] = useState('all');

  const loadTickets = useCallback(async () => {
    const { data } = await portalSupabase
      .from('crm_tickets')
      .select('*')
      .in('agency_id', agencyIds)
      .order('created_at', { ascending: false });

    setTickets((data || []) as Ticket[]);
    setLoading(false);
  }, [agencyIds.join(',')]);

  useEffect(() => { loadTickets(); }, [loadTickets]);

  const filtered = statusFilter === 'all'
    ? tickets
    : tickets.filter((t) => t.status === statusFilter);

  if (selectedTicket) {
    return (
      <TicketDetailView
        ticket={selectedTicket}
        agencyName={agency.name}
        onBack={() => { setSelectedTicket(null); loadTickets(); }}
      />
    );
  }

  if (showNewForm) {
    return (
      <NewTicketForm
        agencyId={agency.id}
        onCancel={() => setShowNewForm(false)}
        onSuccess={() => { setShowNewForm(false); loadTickets(); }}
      />
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  const openCount = tickets.filter((t) => t.status === 'open' || t.status === 'in-progress').length;

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-foreground">Support Tickets</h2>
          <p className="text-sm text-muted-foreground">
            {openCount > 0 ? `${openCount} open ticket${openCount !== 1 ? 's' : ''}` : 'No open tickets'}
          </p>
        </div>
        <button
          onClick={() => setShowNewForm(true)}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-primary-foreground bg-primary rounded-lg hover:bg-primary/80 transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Ticket
        </button>
      </div>

      <div className="flex items-center gap-2 glass rounded-lg p-1 overflow-x-auto">
        {['all', 'open', 'in-progress', 'resolved', 'closed'].map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              statusFilter === s ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-secondary/50 hover:text-foreground'
            }`}
          >
            {s === 'all' ? `All (${tickets.length})` : `${STATUS_CONFIG[s]?.label || s} (${tickets.filter((t) => t.status === s).length})`}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="glass rounded-xl p-12 text-center">
          <MessageSquareText className="w-10 h-10 text-muted-foreground/50 mx-auto mb-3" />
          <p className="text-muted-foreground text-sm">
            {tickets.length === 0
              ? 'No tickets yet. Create one if you need help.'
              : 'No tickets match this filter.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((ticket) => {
            const status = STATUS_CONFIG[ticket.status] || STATUS_CONFIG.open;
            const priority = PRIORITY_CONFIG[ticket.priority] || PRIORITY_CONFIG.normal;
            const StatusIcon = status.icon;

            return (
              <button
                key={ticket.id}
                onClick={() => setSelectedTicket(ticket)}
                className="w-full glass rounded-xl p-5 text-left hover:bg-secondary/30 transition-all group"
              >
                <div className="flex items-start justify-between gap-3 mb-2">
                  <h3 className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
                    {ticket.subject}
                  </h3>
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0 ${status.color}`}>
                    <StatusIcon className="w-3 h-3" />
                    {status.label}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground line-clamp-2 mb-3">{ticket.description}</p>
                <div className="flex items-center gap-3 text-xs text-muted-foreground/70">
                  <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${priority.color}`}>
                    {priority.label}
                  </span>
                  <span className="flex items-center gap-1">
                    <Tag className="w-3 h-3" />
                    {CATEGORY_LABELS[ticket.category] || ticket.category}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {timeAgo(ticket.created_at)}
                  </span>
                  <span>by {ticket.submitted_by}</span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function NewTicketForm({ agencyId, onCancel, onSuccess }: {
  agencyId: string;
  onCancel: () => void;
  onSuccess: () => void;
}) {
  const [form, setForm] = useState({
    subject: '',
    description: '',
    category: 'other',
    priority: 'normal',
    submittedBy: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!form.subject.trim() || !form.description.trim() || !form.submittedBy.trim()) {
      setError('Please fill in all required fields.');
      return;
    }

    setSubmitting(true);

    const { error: insertError } = await portalSupabase.from('crm_tickets').insert({
      agency_id: agencyId,
      subject: form.subject.trim(),
      description: form.description.trim(),
      category: form.category,
      priority: form.priority,
      submitted_by: form.submittedBy.trim(),
    });

    if (insertError) {
      setError('Failed to create ticket. Please try again.');
      setSubmitting(false);
      return;
    }

    setSubmitting(false);
    onSuccess();
  };

  const inputClass = 'w-full px-4 py-2.5 bg-secondary/50 border border-border/50 rounded-lg focus:ring-2 focus:ring-primary/50 focus:border-primary/50 text-sm text-foreground placeholder:text-muted-foreground/50';

  return (
    <div className="max-w-2xl">
      <button
        onClick={onCancel}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to tickets
      </button>

      <div className="glass rounded-xl">
        <div className="px-6 py-4 border-b border-border/40">
          <h2 className="text-lg font-bold text-foreground">New Support Ticket</h2>
          <p className="text-sm text-muted-foreground mt-0.5">Describe your issue and we'll get back to you.</p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground/80 mb-1">
              Your Name <span className="text-red-400">*</span>
            </label>
            <input type="text" value={form.submittedBy} onChange={(e) => setForm((f) => ({ ...f, submittedBy: e.target.value }))} className={inputClass} placeholder="Your name" />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground/80 mb-1">
              Subject <span className="text-red-400">*</span>
            </label>
            <input type="text" value={form.subject} onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))} className={inputClass} placeholder="Brief description of the issue" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground/80 mb-1">Category</label>
              <select value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} className={inputClass}>
                <option value="agent-issue">Agent Issue</option>
                <option value="crm-issue">CRM Issue</option>
                <option value="billing">Billing</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground/80 mb-1">Priority</label>
              <select value={form.priority} onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))} className={inputClass}>
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground/80 mb-1">
              Description <span className="text-red-400">*</span>
            </label>
            <textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} rows={5} className={`${inputClass} resize-none`} placeholder="Provide as much detail as possible..." />
          </div>

          {error && (
            <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onCancel} disabled={submitting} className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Cancel</button>
            <button type="submit" disabled={submitting} className="px-5 py-2 text-sm font-medium text-primary-foreground bg-primary rounded-lg hover:bg-primary/80 transition-colors disabled:opacity-50">{submitting ? 'Submitting...' : 'Submit Ticket'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function TicketDetailView({ ticket, agencyName, onBack }: {
  ticket: Ticket;
  agencyName: string;
  onBack: () => void;
}) {
  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);

  const loadMessages = useCallback(async () => {
    const { data } = await portalSupabase
      .from('crm_ticket_messages')
      .select('*')
      .eq('ticket_id', ticket.id)
      .order('created_at', { ascending: true });

    setMessages((data || []) as TicketMessage[]);
    setLoading(false);
  }, [ticket.id]);

  useEffect(() => { loadMessages(); }, [loadMessages]);

  const handleSend = async () => {
    if (!newMessage.trim()) return;
    setSending(true);

    const { error } = await portalSupabase.from('crm_ticket_messages').insert({
      ticket_id: ticket.id,
      sender_type: 'agency',
      sender_name: ticket.submitted_by,
      message: newMessage.trim(),
    });

    if (!error) {
      setNewMessage('');
      loadMessages();
    }
    setSending(false);
  };

  const status = STATUS_CONFIG[ticket.status] || STATUS_CONFIG.open;
  const priority = PRIORITY_CONFIG[ticket.priority] || PRIORITY_CONFIG.normal;
  const StatusIcon = status.icon;
  const canReply = ticket.status === 'open' || ticket.status === 'in-progress';

  return (
    <div className="max-w-3xl">
      <button onClick={onBack} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors">
        <ArrowLeft className="w-4 h-4" />
        Back to tickets
      </button>

      <div className="glass rounded-xl overflow-hidden">
        <div className="px-6 py-5 border-b border-border/40">
          <div className="flex items-start justify-between gap-3 mb-3">
            <h2 className="text-lg font-bold text-foreground">{ticket.subject}</h2>
            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium flex-shrink-0 ${status.color}`}>
              <StatusIcon className="w-3 h-3" />
              {status.label}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${priority.color}`}>{priority.label} Priority</span>
            <span className="flex items-center gap-1"><Tag className="w-3 h-3" />{CATEGORY_LABELS[ticket.category] || ticket.category}</span>
            <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{new Date(ticket.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
            <span>by {ticket.submitted_by}</span>
          </div>
        </div>

        <div className="px-6 py-4 bg-secondary/30 border-b border-border/30">
          <p className="text-sm text-foreground/80 whitespace-pre-wrap">{ticket.description}</p>
        </div>

        <div className="divide-y divide-border/20">
          {loading ? (
            <div className="flex items-center justify-center py-8"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" /></div>
          ) : messages.length === 0 ? (
            <div className="px-6 py-8 text-center text-sm text-muted-foreground/60">No replies yet.</div>
          ) : (
            messages.map((msg) => {
              const isAdmin = msg.sender_type === 'admin';
              return (
                <div key={msg.id} className={`px-6 py-4 ${isAdmin ? 'bg-primary/5' : ''}`}>
                  <div className="flex items-center gap-2 mb-1.5">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center ${isAdmin ? 'bg-primary/20' : 'bg-secondary/50'}`}>
                      {isAdmin ? <ShieldCheck className="w-3 h-3 text-primary" /> : <User className="w-3 h-3 text-muted-foreground" />}
                    </div>
                    <span className={`text-sm font-medium ${isAdmin ? 'text-primary' : 'text-foreground'}`}>{msg.sender_name}</span>
                    <span className="text-[10px] text-muted-foreground/60 font-medium uppercase">{isAdmin ? 'FYM Support' : agencyName}</span>
                    <span className="text-xs text-muted-foreground/50 ml-auto">{timeAgo(msg.created_at)}</span>
                  </div>
                  <p className="text-sm text-foreground/80 whitespace-pre-wrap pl-8">{msg.message}</p>
                </div>
              );
            })
          )}
        </div>

        {canReply && (
          <div className="px-6 py-4 border-t border-border/40">
            <div className="flex items-end gap-3">
              <textarea
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                rows={2}
                placeholder="Type your reply..."
                className="flex-1 px-4 py-2.5 bg-secondary/50 border border-border/50 rounded-lg focus:ring-2 focus:ring-primary/50 focus:border-primary/50 text-sm text-foreground placeholder:text-muted-foreground/50 resize-none"
                onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSend(); }}
              />
              <button onClick={handleSend} disabled={sending || !newMessage.trim()} className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-primary-foreground bg-primary rounded-lg hover:bg-primary/80 transition-colors disabled:opacity-50">
                <Send className="w-4 h-4" />{sending ? 'Sending...' : 'Send'}
              </button>
            </div>
          </div>
        )}

        {!canReply && (
          <div className="px-6 py-4 border-t border-border/40 bg-secondary/20 text-center">
            <p className="text-sm text-muted-foreground">This ticket has been {ticket.status}. No further replies can be added.</p>
          </div>
        )}
      </div>
    </div>
  );
}
