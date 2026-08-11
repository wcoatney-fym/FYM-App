/**
 * ActivityFeed — Timeline of recent at-risk pipeline activity.
 *
 * Shows stage changes, notes added, and resolutions across the at-risk pipeline.
 * Admins use this to see what happened recently without digging into individual cases.
 *
 * Data sources:
 * - manager_notes (recent notes on at-risk policies)
 * - atrisk_tasks (stage changes via updated_at)
 */
import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  MessageSquare, ArrowRight, RefreshCw, CheckCircle2,
  XCircle, Loader2, Clock,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import { formatNoteTime } from '@/lib/notes-api';
import type { PipelinePolicy } from './types';

interface ActivityFeedProps {
  policies: PipelinePolicy[];
  loading?: boolean;
}

interface FeedItem {
  id: string;
  type: 'note' | 'stage_change' | 'resolution';
  timestamp: string;
  policyNumber: string;
  clientName: string | null;
  agentName: string | null;
  agencyName: string | null;
  // Note-specific
  authorName?: string | null;
  body?: string;
  // Stage-change-specific
  stage?: string | null;
  // Resolution
  resolution?: string | null;
}

const STAGE_LABELS: Record<string, string> = {
  new: 'New',
  responded: 'Responded',
  manager_outreach: 'Manager Outreach',
  agent_outreach: 'Agent Outreach',
  code_red: 'Code Red',
  agent_saved_pending: 'Pending Save',
  saved: 'Saved',
  lost: 'Lost',
};

export function ActivityFeed({ policies, loading }: ActivityFeedProps) {
  const [notes, setNotes] = useState<FeedItem[]>([]);
  const [notesLoading, setNotesLoading] = useState(true);
  const [limit, setLimit] = useState(20);

  // Build a lookup map from policies
  const policyMap = useMemo(() => {
    const map = new Map<string, PipelinePolicy>();
    for (const p of policies) map.set(p.policy_number, p);
    return map;
  }, [policies]);

  // Fetch recent notes
  const fetchNotes = useCallback(async () => {
    if (!supabase) { setNotesLoading(false); return; }
    setNotesLoading(true);
    try {
      const { data, error } = await supabase
        .from('manager_notes')
        .select('*')
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) {
        console.error('[ActivityFeed] notes fetch error:', error);
        setNotesLoading(false);
        return;
      }

      const noteItems: FeedItem[] = (data ?? [])
        .filter((n: any) => n.policy_number && policyMap.has(n.policy_number))
        .map((n: any) => {
          const pol = policyMap.get(n.policy_number);
          return {
            id: `note-${n.id}`,
            type: 'note' as const,
            timestamp: n.created_at,
            policyNumber: n.policy_number,
            clientName: pol?.client_name ?? null,
            agentName: n.agent_name || pol?.agent_name || null,
            agencyName: pol?.agency_name ?? null,
            authorName: n.author_name,
            body: n.body,
          };
        });

      setNotes(noteItems);
    } catch (err) {
      console.error('[ActivityFeed] notes fetch error:', err);
    } finally {
      setNotesLoading(false);
    }
  }, [policyMap]);

  useEffect(() => { fetchNotes(); }, [fetchNotes]);

  // Build feed: stage changes from policies + notes
  const feed = useMemo(() => {
    const items: FeedItem[] = [...notes];

    // Add stage-change items for recently touched tasks
    for (const p of policies) {
      if (!p.task_status || p.task_status === 'new') continue;
      if (!p.task_created_at) continue;

      // Saved / Lost = resolution
      if (p.task_status === 'saved' || p.task_status === 'lost') {
        items.push({
          id: `resolution-${p.policy_number}`,
          type: 'resolution',
          timestamp: p.task_created_at,
          policyNumber: p.policy_number,
          clientName: p.client_name,
          agentName: p.agent_name,
          agencyName: p.agency_name,
          stage: p.task_status,
          resolution: p.task_status === 'saved' ? 'Policy saved' : 'Policy lost',
        });
      } else {
        items.push({
          id: `stage-${p.policy_number}`,
          type: 'stage_change',
          timestamp: p.task_created_at,
          policyNumber: p.policy_number,
          clientName: p.client_name,
          agentName: p.agent_name,
          agencyName: p.agency_name,
          stage: p.task_status,
        });
      }
    }

    // Sort by timestamp descending
    items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    // Deduplicate by id
    const seen = new Set<string>();
    return items.filter(item => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
  }, [policies, notes]);

  const visibleFeed = feed.slice(0, limit);
  const hasMore = limit < feed.length;

  if (loading || notesLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3, 4].map(i => <div key={i} className="h-14 rounded-xl shimmer" />)}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Section header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-amber-500/10">
            <Clock size={16} className="text-amber-400" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-foreground">Activity Feed</h3>
            <p className="text-[11px] text-muted-foreground">
              Recent pipeline activity — stage changes, notes, resolutions
            </p>
          </div>
        </div>
        <button
          onClick={fetchNotes}
          className="text-muted-foreground hover:text-foreground p-1.5 rounded-md hover:bg-secondary/50 transition-colors"
          title="Refresh"
        >
          <RefreshCw size={14} />
        </button>
      </div>

      {feed.length === 0 ? (
        <Card className="border-border">
          <CardContent className="py-8 text-center text-muted-foreground text-sm">
            No recent activity in the at-risk pipeline.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-1">
          {visibleFeed.map(item => (
            <div
              key={item.id}
              className={cn(
                'flex items-start gap-3 px-4 py-3 rounded-lg border border-border/30 bg-card/50 hover:bg-muted/20 transition-colors',
                item.type === 'resolution' && item.stage === 'saved' && 'border-l-2 border-l-emerald-500',
                item.type === 'resolution' && item.stage === 'lost' && 'border-l-2 border-l-rose-500',
              )}
            >
              {/* Icon */}
              <div className={cn(
                'p-1.5 rounded-lg flex-shrink-0 mt-0.5',
                item.type === 'note' && 'bg-sky-500/10',
                item.type === 'stage_change' && 'bg-amber-500/10',
                item.type === 'resolution' && item.stage === 'saved' && 'bg-emerald-500/10',
                item.type === 'resolution' && item.stage === 'lost' && 'bg-rose-500/10',
              )}>
                {item.type === 'note' && <MessageSquare size={14} className="text-sky-400" />}
                {item.type === 'stage_change' && <ArrowRight size={14} className="text-amber-400" />}
                {item.type === 'resolution' && item.stage === 'saved' && <CheckCircle2 size={14} className="text-emerald-400" />}
                {item.type === 'resolution' && item.stage === 'lost' && <XCircle size={14} className="text-rose-400" />}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[12px] font-semibold text-foreground">
                    {item.clientName || 'Unknown'}
                  </span>
                  {item.type === 'note' && (
                    <span className="text-[11px] text-muted-foreground">
                      — note by {item.authorName || 'Manager'}
                    </span>
                  )}
                  {item.type === 'stage_change' && (
                    <span className="text-[11px] text-muted-foreground">
                      → {STAGE_LABELS[item.stage || ''] || item.stage}
                    </span>
                  )}
                  {item.type === 'resolution' && (
                    <span className={cn(
                      'text-[11px] font-semibold',
                      item.stage === 'saved' ? 'text-emerald-400' : 'text-rose-400'
                    )}>
                      {item.resolution}
                    </span>
                  )}
                </div>

                {/* Note body (truncated) */}
                {item.type === 'note' && item.body && (
                  <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">
                    {item.body}
                  </p>
                )}

                {/* Meta */}
                <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground/70">
                  {item.agentName && <span>Agent: {item.agentName}</span>}
                  {item.agencyName && (
                    <>
                      <span>·</span>
                      <span>{item.agencyName}</span>
                    </>
                  )}
                </div>
              </div>

              {/* Timestamp */}
              <span className="text-[10px] text-muted-foreground flex-shrink-0 mt-1">
                {formatNoteTime(item.timestamp)}
              </span>
            </div>
          ))}

          {/* Load more */}
          {hasMore && (
            <button
              onClick={() => setLimit(l => l + 20)}
              className="w-full py-2.5 text-xs font-semibold text-muted-foreground hover:text-foreground border border-border rounded-xl hover:bg-muted transition-colors"
            >
              Show more ({feed.length - limit} remaining)
            </button>
          )}
        </div>
      )}
    </div>
  );
}
