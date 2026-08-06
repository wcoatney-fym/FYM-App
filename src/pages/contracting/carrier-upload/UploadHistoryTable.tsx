/**
 * UploadHistoryTable — Shows recent carrier hierarchy uploads
 *
 * Reads from `carrier_hierarchy_uploads` table to show audit trail
 * of past uploads with status, counts, and timestamps.
 */
import { useState, useEffect } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  FileSpreadsheet,
} from 'lucide-react';

interface UploadRecord {
  id: string;
  carrier: string;
  file_name: string;
  uploaded_by: string | null;
  status: 'processing' | 'completed' | 'failed';
  summary: Record<string, unknown> | null;
  created_at: string;
  completed_at: string | null;
}

interface Props {
  supabase: SupabaseClient;
}

export function UploadHistoryTable({ supabase }: Props) {
  const [uploads, setUploads] = useState<UploadRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('carrier_hierarchy_uploads')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) {
        console.error('[UploadHistory] Load error:', error);
      } else {
        setUploads((data as UploadRecord[]) || []);
      }
    } catch (err) {
      console.error('[UploadHistory] Load failed:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
        <Loader2 className="w-4 h-4 animate-spin mr-2" />
        Loading upload history…
      </div>
    );
  }

  if (uploads.length === 0) {
    return null; // Don't show the section if no history
  }

  const formatDate = (iso: string) =>
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Chicago',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(iso));

  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      <div className="px-6 py-4 border-b border-border flex items-center gap-3">
        <Clock className="w-4 h-4 text-muted-foreground" />
        <p className="text-sm font-bold text-foreground">Upload History</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-secondary/20">
            <tr>
              <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">
                Date
              </th>
              <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">
                Carrier
              </th>
              <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">
                File
              </th>
              <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">
                Status
              </th>
              <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">
                Results
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {uploads.map((u) => {
              const s = u.summary as Record<string, number> | null;
              return (
                <tr key={u.id}>
                  <td className="px-4 py-2 text-muted-foreground text-xs">
                    {formatDate(u.created_at)}
                  </td>
                  <td className="px-4 py-2 font-medium text-foreground">
                    {u.carrier}
                  </td>
                  <td className="px-4 py-2 text-foreground/80 flex items-center gap-1.5">
                    <FileSpreadsheet className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <span className="truncate max-w-[200px]">{u.file_name}</span>
                  </td>
                  <td className="px-4 py-2">
                    {u.status === 'completed' && (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-400">
                        <CheckCircle2 className="w-3 h-3" /> Completed
                      </span>
                    )}
                    {u.status === 'failed' && (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-400">
                        <XCircle className="w-3 h-3" /> Failed
                      </span>
                    )}
                    {u.status === 'processing' && (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-400">
                        <Loader2 className="w-3 h-3 animate-spin" /> Processing
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-xs text-muted-foreground">
                    {s && u.status === 'completed' ? (
                      <span>
                        {s.total_agents ?? '?'} agents · {s.exact_matches ?? 0} exact · {s.fuzzy_matches ?? 0} fuzzy · {s.no_matches ?? 0} none
                      </span>
                    ) : u.status === 'failed' && s?.error ? (
                      <span className="text-red-400">{String(s.error).slice(0, 80)}</span>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
