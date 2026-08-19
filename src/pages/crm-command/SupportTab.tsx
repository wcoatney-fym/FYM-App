/**
 * SupportTab — Agency-scoped support ticket view for CRM Management.
 *
 * Features:
 *   - View existing tickets with expandable message threads
 *   - Submit new support tickets (form with subject, description, category, priority)
 *   - Tickets are written to crm_tickets in the portal DB
 */
import { useState, useEffect } from 'react';
import {
  Headphones, Clock, CheckCircle2, AlertCircle,
  MessageSquare, ChevronDown, ChevronUp, Plus, X, Send,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase as portalSupabase } from '@/lib/crm/portal-client';

interface Ticket {
  id: string;
  subject: string;
  description: string;
  category: string | null;
  status: string;
  priority: string | null;
  submitted_by: string | null;
  created_at: string;
  resolved_at: string | null;
  order_type: string | null;
}

interface TicketMessage {
  id: string;
  ticket_id: string;
  sender: string;
  message: string;
  created_at: string;
}

interface SupportTabProps {
  agencyName: string;
  agencyId: string;
}

const STATUS_STYLES: Record<string, string> = {
  open: 'bg-amber-500/10 text-amber-400',
  in_progress: 'bg-blue-500/10 text-blue-400',
  resolved: 'bg-emerald-500/10 text-emerald-400',
  closed: 'bg-secondary text-muted-foreground',
};

const STATUS_ICONS: Record<string, React.ElementType> = {
  open: AlertCircle,
  in_progress: Clock,
  resolved: CheckCircle2,
  closed: CheckCircle2,
};

const CATEGORIES = [
  'Agent Roster Issue',
  'GHL / CRM Issue',
  'Billing / Commission',
  'Technical Support',
  'Product Question',
  'Other',
];

const PRIORITIES = ['Low', 'Medium', 'High', 'Urgent'];

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function SupportTab({ agencyName }: SupportTabProps) {
  const [loading, setLoading] = useState(true);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [expandedTicket, setExpandedTicket] = useState<string | null>(null);
  const [messages, setMessages] = useState<Record<string, TicketMessage[]>>({});
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [portalAgencyId, setPortalAgencyId] = useState<string | null>(null);

  // Form state
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [priority, setPriority] = useState('Medium');

  useEffect(() => {
    loadTickets();
  }, [agencyName]);

  const loadTickets = async () => {
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

    if (!parent) { setLoading(false); return; }

    const children = agencies.filter(
      (a: { parent_agency_id: string | null }) => a.parent_agency_id === parent.id
    );
    const ids = [parent, ...children].map((a: { id: string }) => a.id);
    setPortalAgencyId(parent.id);

    const { data: ticketData } = await portalSupabase
      .from('crm_tickets')
      .select('*')
      .in('agency_id', ids)
      .order('created_at', { ascending: false });

    setTickets((ticketData || []) as Ticket[]);
    setLoading(false);
  };

  const loadMessages = async (ticketId: string) => {
    if (messages[ticketId]) return;
    const { data } = await portalSupabase
      .from('crm_ticket_messages')
      .select('*')
      .eq('ticket_id', ticketId)
      .order('created_at', { ascending: true });
    setMessages((prev) => ({ ...prev, [ticketId]: (data || []) as TicketMessage[] }));
  };

  const toggleTicket = (ticketId: string) => {
    if (expandedTicket === ticketId) {
      setExpandedTicket(null);
    } else {
      setExpandedTicket(ticketId);
      loadMessages(ticketId);
    }
  };

  const submitTicket = async () => {
    if (!subject.trim() || !description.trim() || !portalAgencyId) return;
    setSubmitting(true);

    const { data, error } = await portalSupabase
      .from('crm_tickets')
      .insert({
        agency_id: portalAgencyId,
        subject: subject.trim(),
        description: description.trim(),
        category,
        priority: priority.toLowerCase(),
        status: 'open',
        submitted_by: agencyName,
      })
      .select()
      .single();

    setSubmitting(false);

    if (!error && data) {
      setTickets((prev) => [data as Ticket, ...prev]);
      setShowForm(false);
      setSubject('');
      setDescription('');
      setCategory(CATEGORIES[0]);
      setPriority('Medium');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mr-3" />
        Loading tickets…
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header with Submit button */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">
          {tickets.length} ticket{tickets.length !== 1 ? 's' : ''}
        </h3>
        <button
          onClick={() => setShowForm(!showForm)}
          className={cn(
            'flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg transition-colors',
            showForm
              ? 'bg-secondary text-muted-foreground hover:text-foreground'
              : 'bg-primary text-primary-foreground hover:bg-primary/90'
          )}
        >
          {showForm ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
          {showForm ? 'Cancel' : 'Submit Ticket'}
        </button>
      </div>

      {/* New ticket form */}
      {showForm && (
        <div className="bg-card border border-border/40 rounded-xl p-5 space-y-4">
          <h4 className="text-sm font-semibold text-foreground">New Support Ticket</h4>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Subject *</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Brief description of your issue"
              className="w-full px-3 py-2 text-sm bg-secondary/50 border border-border/40 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary/50"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-secondary/50 border border-border/40 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary/50"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Priority</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-secondary/50 border border-border/40 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary/50"
              >
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Description *</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              placeholder="Describe the issue in detail. Include any relevant agent names, NPN numbers, or policy numbers."
              className="w-full px-3 py-2 text-sm bg-secondary/50 border border-border/40 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary/50 resize-none"
            />
          </div>

          <div className="flex justify-end">
            <button
              onClick={submitTicket}
              disabled={submitting || !subject.trim() || !description.trim()}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {submitting ? (
                <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-primary-foreground" />
              ) : (
                <Send className="w-3.5 h-3.5" />
              )}
              {submitting ? 'Submitting…' : 'Submit Ticket'}
            </button>
          </div>
        </div>
      )}

      {/* Empty state */}
      {tickets.length === 0 && !showForm && (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <Headphones className="w-12 h-12 mb-3 opacity-40" />
          <p className="text-lg font-medium">No Support Tickets</p>
          <p className="text-sm mt-1">Click "Submit Ticket" to create your first support request</p>
        </div>
      )}

      {/* Ticket list */}
      {tickets.map((ticket) => {
        const StatusIcon = STATUS_ICONS[ticket.status] || AlertCircle;
        const isExpanded = expandedTicket === ticket.id;
        const ticketMessages = messages[ticket.id] || [];

        return (
          <div key={ticket.id} className="bg-card border border-border/40 rounded-xl overflow-hidden">
            <button
              onClick={() => toggleTicket(ticket.id)}
              className="w-full flex items-center justify-between p-4 hover:bg-secondary/20 transition-colors text-left"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className={cn('p-1.5 rounded-lg', STATUS_STYLES[ticket.status] || 'bg-secondary')}>
                  <StatusIcon className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{ticket.subject}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {ticket.category && <span className="mr-2">{ticket.category}</span>}
                    {timeAgo(ticket.created_at)}
                    {ticket.priority && (
                      <span className={cn(
                        'ml-2 px-1.5 py-0.5 rounded text-[10px] font-medium',
                        ticket.priority === 'urgent' ? 'bg-red-500/10 text-red-400' :
                        ticket.priority === 'high' ? 'bg-amber-500/10 text-amber-400' :
                        'bg-secondary text-muted-foreground'
                      )}>
                        {ticket.priority}
                      </span>
                    )}
                  </p>
                </div>
              </div>
              {isExpanded ? (
                <ChevronUp className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              ) : (
                <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              )}
            </button>

            {isExpanded && (
              <div className="px-4 pb-4 border-t border-border/30">
                <p className="text-sm text-foreground/80 mt-3 whitespace-pre-wrap">{ticket.description}</p>

                {ticketMessages.length > 0 && (
                  <div className="mt-4 space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
                      <MessageSquare className="w-3 h-3" />
                      Messages
                    </p>
                    {ticketMessages.map((msg) => (
                      <div key={msg.id} className="bg-secondary/30 rounded-lg p-3">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-medium text-foreground">{msg.sender}</span>
                          <span className="text-[10px] text-muted-foreground">{timeAgo(msg.created_at)}</span>
                        </div>
                        <p className="text-xs text-foreground/80">{msg.message}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
