/**
 * CancellationUploadTab — Agency-scoped cancellation roster upload + log.
 *
 * Features:
 *   - Instructions for submitting agent cancellations
 *   - Download cancellation template CSV
 *   - Upload completed cancellation roster (inserts to crm_termination_log)
 *   - View existing termination records
 */
import { useState, useEffect, useMemo, useRef } from 'react';
import { Search, FileUp, Download, Upload, ChevronLeft, ChevronRight, AlertCircle, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase as portalSupabase } from '@/lib/crm/portal-client';

interface TerminationRecord {
  id: string;
  agent_name: string | null;
  agent_npn: string | null;
  status: string | null;
  agency: string | null;
  terminated_at: string | null;
  created_at: string;
}

interface CancellationUploadTabProps {
  agencyName: string;
  agencyId: string;
}

const PAGE_SIZE = 25;

const TEMPLATE_CSV = `Agent First Name,Agent Last Name,Agent NPN,Termination Date,Reason
John,Doe,12345678,${new Date().toISOString().split('T')[0]},Voluntary
Jane,Smith,87654321,${new Date().toISOString().split('T')[0]},Involuntary`;

export function CancellationUploadTab({ agencyName }: CancellationUploadTabProps) {
  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState<TerminationRecord[]>([]);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<{ success: boolean; message: string } | null>(null);
  const [portalAgencyName, setPortalAgencyName] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { loadRecords(); }, [agencyName]);

  const loadRecords = async () => {
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

    if (!parent) { setRecords([]); setLoading(false); return; }

    setPortalAgencyName(parent.name);

    const children = agencies.filter(
      (a: { parent_agency_id: string | null }) => a.parent_agency_id === parent.id
    );
    const groupNames = [parent, ...children].map((a: { name: string }) => a.name);

    const { data } = await portalSupabase
      .from('crm_termination_log')
      .select('*')
      .in('agency', groupNames)
      .order('created_at', { ascending: false });

    setRecords((data || []) as TerminationRecord[]);
    setLoading(false);
  };

  const downloadTemplate = () => {
    const blob = new Blob([TEMPLATE_CSV], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'cancellation-template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !portalAgencyName) return;

    setUploading(true);
    setUploadResult(null);

    try {
      const text = await file.text();
      const lines = text.trim().split('\n');
      if (lines.length < 2) {
        setUploadResult({ success: false, message: 'CSV file must have a header row and at least one data row' });
        setUploading(false);
        return;
      }

      // Parse CSV (simple — assumes no commas in values)
      const headers = lines[0].split(',').map((h) => h.trim());
      const firstNameIdx = headers.findIndex((h) => /first/i.test(h));
      const lastNameIdx = headers.findIndex((h) => /last/i.test(h));
      const npnIdx = headers.findIndex((h) => /npn/i.test(h));
      const dateIdx = headers.findIndex((h) => /date/i.test(h));

      if (firstNameIdx < 0 && lastNameIdx < 0) {
        setUploadResult({ success: false, message: 'CSV must have "First Name" and "Last Name" columns' });
        setUploading(false);
        return;
      }

      const rows = [];
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',').map((c) => c.trim());
        const firstName = firstNameIdx >= 0 ? cols[firstNameIdx] : '';
        const lastName = lastNameIdx >= 0 ? cols[lastNameIdx] : '';
        const name = `${firstName} ${lastName}`.trim();
        if (!name) continue;

        rows.push({
          agent_name: name,
          agent_npn: npnIdx >= 0 ? cols[npnIdx] || null : null,
          agency: portalAgencyName,
          status: 'pending',
          terminated_at: dateIdx >= 0 && cols[dateIdx] ? cols[dateIdx] : new Date().toISOString(),
        });
      }

      if (rows.length === 0) {
        setUploadResult({ success: false, message: 'No valid agent rows found in the CSV' });
        setUploading(false);
        return;
      }

      const { error } = await portalSupabase
        .from('crm_termination_log')
        .insert(rows);

      if (error) {
        setUploadResult({ success: false, message: `Upload failed: ${error.message}` });
      } else {
        setUploadResult({ success: true, message: `${rows.length} cancellation${rows.length !== 1 ? 's' : ''} submitted successfully` });
        await loadRecords();
      }
    } catch (err) {
      setUploadResult({ success: false, message: `Error reading file: ${err instanceof Error ? err.message : 'Unknown error'}` });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const filtered = useMemo(() => {
    if (!search.trim()) return records;
    const q = search.toLowerCase();
    return records.filter((r) =>
      (r.agent_name || '').toLowerCase().includes(q) ||
      (r.agent_npn || '').includes(q) ||
      (r.agency || '').toLowerCase().includes(q)
    );
  }, [records, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  useEffect(() => { setPage(0); }, [search]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mr-3" />
        Loading cancellations…
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Instructions + Upload section */}
      <div className="bg-card border border-border/40 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
          <FileUp className="w-4 h-4 text-muted-foreground" />
          Submit Agent Cancellations
        </h3>
        <div className="space-y-3">
          <div className="bg-secondary/30 rounded-lg p-3">
            <p className="text-xs text-foreground/80 leading-relaxed">
              <strong>Instructions:</strong> To cancel/terminate agents from your roster, download the template below,
              fill in the agent details (first name, last name, NPN, termination date, and reason), then upload the
              completed CSV. Your CSR will review and confirm each cancellation.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={downloadTemplate}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-secondary hover:bg-secondary/80 text-foreground rounded-lg transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              Download Template
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleFileUpload}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {uploading ? (
                <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-primary-foreground" />
              ) : (
                <Upload className="w-3.5 h-3.5" />
              )}
              {uploading ? 'Uploading…' : 'Upload Cancellation Roster'}
            </button>
          </div>

          {uploadResult && (
            <div className={cn(
              'flex items-center gap-2 p-3 rounded-lg text-xs font-medium',
              uploadResult.success ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
            )}>
              {uploadResult.success ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
              {uploadResult.message}
            </div>
          )}
        </div>
      </div>

      {/* Existing cancellations */}
      {records.length > 0 && (
        <>
          <div className="flex items-center justify-between gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search by agent name or NPN…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm bg-secondary/50 border border-border/40 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary/50"
              />
            </div>
            <span className="text-xs text-muted-foreground">
              {filtered.length} record{filtered.length !== 1 ? 's' : ''}
            </span>
          </div>

          <div className="border border-border/40 rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-secondary/30 border-b border-border/40">
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Agent Name</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">NPN</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Agency</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Status</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Terminated</th>
                  </tr>
                </thead>
                <tbody>
                  {paged.map((r) => (
                    <tr key={r.id} className="border-b border-border/20 hover:bg-secondary/10 transition-colors">
                      <td className="px-4 py-2.5 font-medium">{r.agent_name || '--'}</td>
                      <td className="px-4 py-2.5 text-muted-foreground font-mono text-xs">{r.agent_npn || '--'}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">{r.agency || '--'}</td>
                      <td className="px-4 py-2.5">
                        <span className={cn(
                          'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium',
                          r.status === 'confirmed' ? 'bg-emerald-500/10 text-emerald-400' :
                          r.status === 'rejected' ? 'bg-red-500/10 text-red-400' :
                          'bg-amber-500/10 text-amber-400'
                        )}>
                          {r.status || 'pending'}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground text-xs">
                        {r.terminated_at
                          ? new Date(r.terminated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                          : '--'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between px-1">
              <span className="text-xs text-muted-foreground">Page {page + 1} of {totalPages}</span>
              <div className="flex items-center gap-1">
                <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}
                  className="p-1.5 rounded hover:bg-secondary/50 disabled:opacity-30 transition-colors">
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
                  className="p-1.5 rounded hover:bg-secondary/50 disabled:opacity-30 transition-colors">
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Empty state for records (still show upload section above) */}
      {records.length === 0 && (
        <div className="text-center py-6 text-muted-foreground text-sm">
          No cancellations submitted yet. Use the form above to upload a cancellation roster.
        </div>
      )}
    </div>
  );
}
