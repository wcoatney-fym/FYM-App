import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ScrollText, Send, Loader2 } from 'lucide-react';
import { portalSupabase } from '@/lib/portal-supabase';
import { formatDistanceToNow } from 'date-fns';

interface ActivityEntry {
  id: string;
  agent_id: string | null;
  action: string;
  details: string;
  created_at: string;
}

export function CcChatTab() {
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const loadEntries = async () => {
    if (!portalSupabase) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data } = await portalSupabase
      .from('activity_log')
      .select('id, agent_id, action, details, created_at')
      .order('created_at', { ascending: false })
      .limit(50);
    setEntries((data as ActivityEntry[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    void loadEntries();
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [entries]);

  const handleAddNote = async () => {
    if (!note.trim() || !portalSupabase) return;
    setSubmitting(true);
    try {
      await portalSupabase.from('activity_log').insert({
        action: 'note',
        details: note.trim(),
      });
      setNote('');
      await loadEntries();
    } finally {
      setSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void handleAddNote(); }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-120px)]">
      <div className="flex items-center gap-3 pb-4 border-b border-border/50">
        <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center">
          <ScrollText className="w-5 h-5 text-background" />
        </div>
        <div>
          <h1 className="text-lg font-semibold flex items-center gap-2">
            Command Log
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-400/10 text-emerald-400 font-medium">LIVE</span>
          </h1>
          <p className="text-xs text-muted-foreground">Real-time activity feed &amp; team notes</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto py-6 space-y-4 scrollbar-thin">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <Loader2 className="w-8 h-8 text-primary animate-spin mb-4" />
            <p className="text-sm text-muted-foreground">Loading activity…</p>
          </div>
        ) : entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-16 h-16 rounded-2xl gradient-primary flex items-center justify-center mb-4">
              <ScrollText className="w-8 h-8 text-background" />
            </div>
            <h2 className="text-lg font-semibold mb-2">No activity yet.</h2>
            <p className="text-sm text-muted-foreground max-w-md">
              Activity from contracting, onboarding, and team notes will appear here as it happens.
            </p>
          </div>
        ) : (
          <AnimatePresence>
            {[...entries].reverse().map((entry) => (
              <motion.div key={entry.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex justify-start">
                <div className="max-w-[85%]">
                  <div className="flex items-end gap-2">
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${entry.action === 'note' ? 'gradient-primary' : 'bg-secondary'}`}>
                      <ScrollText className={`w-3.5 h-3.5 ${entry.action === 'note' ? 'text-background' : 'text-muted-foreground'}`} />
                    </div>
                    <div className="glass rounded-2xl rounded-bl-md px-4 py-3 text-sm leading-relaxed">
                      <p className="text-[10px] uppercase tracking-wide text-primary/70 font-semibold mb-1">{entry.action}</p>
                      <div className="whitespace-pre-wrap text-foreground/90">{entry.details}</div>
                    </div>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1 ml-9">
                    {formatDistanceToNow(new Date(entry.created_at), { addSuffix: true })}
                  </p>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="border-t border-border/50 pt-4">
        <div className="flex items-end gap-3">
          <div className="flex-1 glass rounded-xl p-1">
            <textarea value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={handleKeyDown} placeholder="Add a note to the command log..." rows={1} className="w-full bg-transparent px-3 py-2.5 text-sm resize-none outline-none placeholder:text-muted-foreground" style={{ minHeight: '40px', maxHeight: '120px' }} />
          </div>
          <button onClick={() => void handleAddNote()} disabled={!note.trim() || submitting} className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 transition-opacity">
            {submitting ? <Loader2 className="w-4 h-4 text-background animate-spin" /> : <Send className="w-4 h-4 text-background" />}
          </button>
        </div>
      </div>
    </div>
  );
}
