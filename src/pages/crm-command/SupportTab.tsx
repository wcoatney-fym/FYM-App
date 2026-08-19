/**
 * SupportTab — Agency-scoped support ticket view for CRM Management.
 *
 * Reads from portal DB: crm_tickets + crm_ticket_messages
 * Allows agencies to view their submitted tickets and status.
 */
import { useState, useEffect } from 'react';
import {
  Headphones, Clock, CheckCircle2, AlertCircle,
  MessageSquare, ChevronDown, ChevronUp,
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

  useEffect(() => {
    loadTickets();
  }, [agencyName]);

  const loadTickets = async () => {
    setLoading(true);
    // Resolve portal agency IDs
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
    const groupIds = [parent, ...children].map((a: { id: string }) => a.id);

    const { data: ticketData } = await portalSupabase
      .from('crm_tickets')
      .select('*')
      .in('agency_id', groupIds)
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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mr-3" />
        Loading tickets…
      </div>
    );
  }

  if (tickets.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <Headphones className="w-12 h-12 mb-3 opacity-40" />
        <p className="text-lg font-medium">No Support Tickets</p>
        <p className="text-sm mt-1">No tickets have been submitted yet</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-foreground">
          {tickets.length} ticket{tickets.length !== 1 ? 's' : ''}
        </h3>
      </div>

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
