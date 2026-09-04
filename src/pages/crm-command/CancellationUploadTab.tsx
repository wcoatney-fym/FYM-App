/**
 * CancellationUploadTab — Agency-scoped cancellation roster upload + log.
 * Ported 1:1 from contracting-portal PortalCancellationsTab.tsx
 * Styled for FYM App dark theme.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Upload, Download, FileText, AlertTriangle, CheckCircle2,
  XCircle, RefreshCw, Building2, Clock,
} from 'lucide-react';
import { supabase as portalSupabase, ensurePortalAuth } from '@/lib/crm/portal-client';
import type { PortalAgency } from '@/hooks/usePortalAgency';

interface CancellationUploadTabProps {
  agencyName: string;
  agencyId: string;
  agencyIds: string[];
  agency: PortalAgency;
}

interface ParsedRow { rowNumber: number; firstName: string; lastName: string; phone: string; tag: string; }
interface ValidationError { row: number; message: string; }
interface UploadRecord {
  id: string; file_name: string; row_count: number; status: string;
  errors: ValidationError[] | null; rejection_reason: string | null; created_at: string;
}

const REQUIRED_TAG = 'cancelled policy | launch';
const EXPECTED_HEADERS = ['First Name', 'Last Name', 'Phone', 'Tag'];

function parseCSV(text: string): string[][] {
  const lines = text.split(/\r?\n/).filter(line => line.trim() !== '');
  return lines.map(line => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { current += '"'; i++; } else { inQuotes = !inQuotes; }
      } else if (ch === ',' && !inQuotes) { result.push(current.trim()); current = ''; } else { current += ch; }
    }
    result.push(current.trim());
    return result;
  });
}

function hasMiddleInitial(name: string): boolean {
  const parts = name.trim().split(/\s+/);
  if (parts.length > 1) return true;
  if (/\.\s*$/.test(name.trim())) return true;
  return false;
}

function validateRows(rows: string[][], headers: string[]): { parsed: ParsedRow[]; errors: ValidationError[] } {
  const errors: ValidationError[] = [];
  const parsed: ParsedRow[] = [];
  const headerNorm = headers.map(h => h.toLowerCase().trim());
  const fnIdx = headerNorm.indexOf('first name');
  const lnIdx = headerNorm.indexOf('last name');
  const phIdx = headerNorm.indexOf('phone');
  const tagIdx = headerNorm.indexOf('tag');

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2;
    const firstName = (row[fnIdx] || '').trim();
    const lastName = (row[lnIdx] || '').trim();
    const phone = (row[phIdx] || '').trim();
    const tag = (row[tagIdx] || '').trim();
    if (!firstName && !lastName && !phone && !tag) continue;
    if (!firstName) errors.push({ row: rowNum, message: 'First Name is missing' });
    else if (hasMiddleInitial(firstName)) errors.push({ row: rowNum, message: 'First Name appears to contain a middle initial or extra name — only first name allowed' });
    if (!lastName) errors.push({ row: rowNum, message: 'Last Name is missing' });
    if (!phone) errors.push({ row: rowNum, message: 'Phone is missing' });
    if (!tag) errors.push({ row: rowNum, message: 'Tag is missing' });
    else if (tag.toLowerCase() !== REQUIRED_TAG.toLowerCase()) errors.push({ row: rowNum, message: `Tag must be exactly "${REQUIRED_TAG}"` });
    parsed.push({ rowNumber: rowNum, firstName, lastName, phone, tag });
  }
  return { parsed, errors };
}

function downloadTemplate() {
  const csv = EXPECTED_HEADERS.join(',') + '\n';
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'cancellation_upload_template.csv'; a.click();
  URL.revokeObjectURL(url);
}

export function CancellationUploadTab({ agency, agencyIds }: CancellationUploadTabProps) {
  const [uploads, setUploads] = useState<UploadRecord[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [dragActive, setDragActive] = useState(false);
  const [parsedRows, setParsedRows] = useState<ParsedRow[] | null>(null);
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);
  const [fileName, setFileName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [expandedRejectionId, setExpandedRejectionId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [childAgencies, setChildAgencies] = useState<{ id: string; name: string }[]>([]);
  const [selectedUploadAgency, setSelectedUploadAgency] = useState<{ id: string; name: string } | null>(null);
  const [loadingAgencies, setLoadingAgencies] = useState(false);

  useEffect(() => {
    if (agency.agency_type === 'main') {
      setLoadingAgencies(true);
      (async () => {
        await ensurePortalAuth();
        const { data } = await portalSupabase
          .from('hierarchy_agencies')
          .select('id, name')
          .eq('parent_agency_id', agency.id)
          .eq('is_active', true)
          .order('name') as { data: { id: string; name: string }[] | null };
        const children = data || [];
        if (children.length > 0) {
          setChildAgencies([{ id: agency.id, name: agency.name }, ...children]);
        } else {
          setSelectedUploadAgency({ id: agency.id, name: agency.name });
        }
        setLoadingAgencies(false);
      })();
    } else {
      setSelectedUploadAgency({ id: agency.id, name: agency.name });
    }
  }, [agency]);

  const fetchHistory = useCallback(async () => {
    setLoadingHistory(true);
    await ensurePortalAuth();
    const { data } = await portalSupabase
      .from('agency_cancellation_uploads')
      .select('id, file_name, row_count, status, errors, rejection_reason, created_at')
      .in('agency_id', agencyIds)
      .order('created_at', { ascending: false })
      .limit(20);
    setUploads((data as UploadRecord[] | null) || []);
    setLoadingHistory(false);
  }, [agencyIds]);

  useEffect(() => { fetchHistory(); }, [fetchHistory]);

  const processFile = (file: File) => {
    setSuccessMessage('');
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const allRows = parseCSV(text);
      if (allRows.length < 1) { setValidationErrors([{ row: 0, message: 'File is empty' }]); setParsedRows(null); return; }
      const headers = allRows[0];
      const headerNorm = headers.map(h => h.toLowerCase().trim());
      const missingHeaders = EXPECTED_HEADERS.filter(h => !headerNorm.includes(h.toLowerCase()));
      if (missingHeaders.length > 0) { setValidationErrors([{ row: 1, message: `Missing required columns: ${missingHeaders.join(', ')}` }]); setParsedRows(null); return; }
      const dataRows = allRows.slice(1);
      if (dataRows.length === 0) { setValidationErrors([{ row: 0, message: 'No data rows found' }]); setParsedRows(null); return; }
      const { parsed, errors } = validateRows(dataRows, headers);
      setParsedRows(parsed);
      setValidationErrors(errors);
      if (errors.length > 0) logRejection(file.name, dataRows.length, errors);
    };
    reader.readAsText(file);
  };

  const logRejection = async (name: string, rowCount: number, errors: ValidationError[]) => {
    const targetId = selectedUploadAgency?.id || agency.id;
    await ensurePortalAuth();
    await portalSupabase.from('agency_cancellation_uploads').insert({
      agency_id: targetId, file_name: name, row_count: rowCount, status: 'rejected',
      errors: errors as unknown as Record<string, unknown>[],
    });
    fetchHistory();
  };

  const handleSubmit = async () => {
    if (!parsedRows || validationErrors.length > 0 || !selectedUploadAgency) return;
    setSubmitting(true);
    await ensurePortalAuth();
    const targetId = selectedUploadAgency.id;
    const uploadId = crypto.randomUUID();
    const { error: insertError } = await portalSupabase.from('agency_cancellation_uploads').insert({
      id: uploadId, agency_id: targetId, file_name: fileName, row_count: parsedRows.length, status: 'pending_approval',
    });
    if (insertError) { setValidationErrors([{ row: 0, message: `Failed to submit upload: ${insertError.message}` }]); setParsedRows(null); setSubmitting(false); return; }
    const rows = parsedRows.map(r => ({
      agency_id: targetId, upload_id: uploadId, first_name: r.firstName, last_name: r.lastName, phone: r.phone, tag: r.tag,
    }));
    const batchSize = 500;
    for (let i = 0; i < rows.length; i += batchSize) { await portalSupabase.from('agency_cancellations').insert(rows.slice(i, i + batchSize)); }
    setSuccessMessage(`Upload submitted for review (${parsedRows.length} records). Our team will confirm and process shortly.`);
    setParsedRows(null); setValidationErrors([]); setFileName(''); setSubmitting(false); fetchHistory();
  };

  const handleDrop = (e: React.DragEvent) => { e.preventDefault(); setDragActive(false); const file = e.dataTransfer.files[0]; if (file && file.name.endsWith('.csv')) processFile(file); };
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => { const file = e.target.files?.[0]; if (file) processFile(file); e.target.value = ''; };
  const reset = () => { setParsedRows(null); setValidationErrors([]); setFileName(''); setSuccessMessage(''); };

  const latestRejection = uploads.find(u => u.status === 'rejected' && u.rejection_reason);
  const hasNewerPendingOrSuccess = latestRejection ? uploads.some(u => (u.status === 'pending_approval' || u.status === 'success') && new Date(u.created_at) > new Date(latestRejection.created_at)) : false;
  const showRejectionBanner = latestRejection && !hasNewerPendingOrSuccess;

  return (
    <div className="space-y-6">
      {showRejectionBanner && (
        <div className="flex items-start gap-3 p-5 bg-red-500/10 rounded-xl border border-red-500/20">
          <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-red-300">Cancellation Upload Rejected</p>
            <p className="text-sm text-red-400/80 mt-1">{latestRejection!.rejection_reason}</p>
            <p className="text-xs text-red-400/60 mt-2">File: <span className="font-medium">{latestRejection!.file_name}</span> — Please address the issue above and re-upload your corrected cancellation data.</p>
          </div>
        </div>
      )}

      <div className="glass rounded-xl overflow-hidden">
        <div className="px-6 py-5 border-b border-border/40">
          <h3 className="text-lg font-semibold text-foreground">Cancellation Upload</h3>
          <p className="text-sm text-muted-foreground mt-1">Upload cancelled policy records using the required CSV format.</p>
        </div>
        <div className="px-6 py-5">
          {loadingAgencies && <div className="text-center py-4 text-sm text-muted-foreground">Loading agencies...</div>}

          {!loadingAgencies && childAgencies.length > 0 && !selectedUploadAgency && (
            <div className="mb-5">
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4 mb-4">
                <h4 className="text-sm font-semibold text-amber-300 mb-1">Select Agency</h4>
                <p className="text-xs text-amber-400/80">Which agency is this cancellation report for?</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {childAgencies.map(a => (
                  <button key={a.id} onClick={() => setSelectedUploadAgency(a)}
                    className="flex items-center gap-3 p-4 glass rounded-lg hover:bg-secondary/50 transition-colors text-left">
                    <Building2 className="w-5 h-5 text-muted-foreground shrink-0" />
                    <span className="text-sm font-medium text-foreground">{a.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {selectedUploadAgency && childAgencies.length > 0 && (
            <div className="flex items-center gap-2 mb-4 px-3 py-2 bg-primary/10 border border-primary/20 rounded-lg">
              <Building2 className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium text-primary">Uploading for: {selectedUploadAgency.name}</span>
              <button onClick={() => { setSelectedUploadAgency(null); reset(); }} className="ml-auto text-xs text-primary/70 hover:text-primary underline">Change</button>
            </div>
          )}

          {selectedUploadAgency && (
            <div className="bg-secondary/30 border border-border/30 rounded-lg p-4 mb-5">
              <h4 className="text-sm font-semibold text-foreground mb-2">Upload Requirements</h4>
              <ul className="text-sm text-muted-foreground space-y-1.5 list-disc pl-5">
                <li>File must be a <strong className="text-foreground">.csv</strong> with these exact columns: <span className="font-mono text-xs bg-secondary/50 px-1.5 py-0.5 rounded border border-border/30 text-foreground/80">First Name</span>, <span className="font-mono text-xs bg-secondary/50 px-1.5 py-0.5 rounded border border-border/30 text-foreground/80">Last Name</span>, <span className="font-mono text-xs bg-secondary/50 px-1.5 py-0.5 rounded border border-border/30 text-foreground/80">Phone</span>, <span className="font-mono text-xs bg-secondary/50 px-1.5 py-0.5 rounded border border-border/30 text-foreground/80">Tag</span></li>
                <li><strong className="text-foreground">No middle initials</strong> — First Name should contain only the first name</li>
                <li><strong className="text-foreground">Phone number is required</strong> on every row</li>
                <li>Tag column must contain exactly: <span className="font-mono text-xs bg-secondary/50 px-1.5 py-0.5 rounded border border-border/30 text-foreground/80">cancelled policy | launch</span></li>
              </ul>
              <button onClick={downloadTemplate} className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/80 transition-colors">
                <Download className="w-4 h-4" />Download Template
              </button>
            </div>
          )}

          {selectedUploadAgency && !parsedRows && validationErrors.length === 0 && !successMessage && (
            <div onDragOver={(e) => { e.preventDefault(); setDragActive(true); }} onDragLeave={() => setDragActive(false)} onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${
                dragActive ? 'border-primary bg-primary/5' : 'border-border/50 hover:border-border bg-secondary/20'
              }`}>
              <Upload className="w-10 h-10 text-muted-foreground/50 mx-auto mb-3" />
              <p className="text-sm font-medium text-foreground/80">Drag and drop your CSV file here, or click to browse</p>
              <p className="text-xs text-muted-foreground mt-1">Only .csv files accepted</p>
              <input ref={fileInputRef} type="file" accept=".csv" onChange={handleFileChange} className="hidden" />
            </div>
          )}

          {validationErrors.length > 0 && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-3"><XCircle className="w-5 h-5 text-red-400" /><h4 className="text-sm font-semibold text-red-300">Upload Rejected — {validationErrors.length} issue{validationErrors.length !== 1 ? 's' : ''} found</h4></div>
              <p className="text-xs text-red-400/70 mb-3">Please fix the following issues in your CSV and re-upload.</p>
              <div className="max-h-60 overflow-y-auto space-y-1.5">
                {validationErrors.map((err, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm"><AlertTriangle className="w-3.5 h-3.5 text-red-400 mt-0.5 shrink-0" /><span className="text-red-300/80"><strong>Row {err.row}:</strong> {err.message}</span></div>
                ))}
              </div>
              <button onClick={reset} className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-red-500/20 text-red-300 text-sm font-medium rounded-lg hover:bg-red-500/30 transition-colors border border-red-500/30"><RefreshCw className="w-4 h-4" />Upload Again</button>
            </div>
          )}

          {parsedRows && validationErrors.length === 0 && !successMessage && (
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-3"><CheckCircle2 className="w-5 h-5 text-emerald-400" /><h4 className="text-sm font-semibold text-emerald-300">Validation Passed — {parsedRows.length} row{parsedRows.length !== 1 ? 's' : ''} ready</h4></div>
              <div className="bg-secondary/30 border border-border/30 rounded-lg overflow-hidden mb-4">
                <table className="w-full text-sm">
                  <thead><tr className="bg-secondary/50 border-b border-border/30"><th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">#</th><th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">First Name</th><th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Last Name</th><th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Phone</th><th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Tag</th></tr></thead>
                  <tbody>
                    {parsedRows.slice(0, 5).map((row, i) => (
                      <tr key={i} className="border-b border-border/20 last:border-0"><td className="px-3 py-2 text-muted-foreground">{row.rowNumber}</td><td className="px-3 py-2 text-foreground">{row.firstName}</td><td className="px-3 py-2 text-foreground">{row.lastName}</td><td className="px-3 py-2 text-foreground">{row.phone}</td><td className="px-3 py-2 text-foreground font-mono text-xs">{row.tag}</td></tr>
                    ))}
                  </tbody>
                </table>
                {parsedRows.length > 5 && <div className="px-3 py-2 text-xs text-muted-foreground bg-secondary/30 border-t border-border/20">...and {parsedRows.length - 5} more row{parsedRows.length - 5 !== 1 ? 's' : ''}</div>}
              </div>
              <div className="flex items-center gap-3">
                <button onClick={handleSubmit} disabled={submitting} className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-500/20 text-emerald-300 text-sm font-medium rounded-lg hover:bg-emerald-500/30 transition-colors border border-emerald-500/30 disabled:opacity-50">
                  {submitting ? <><RefreshCw className="w-4 h-4 animate-spin" />Uploading...</> : <><CheckCircle2 className="w-4 h-4" />Submit for Review</>}
                </button>
                <button onClick={reset} className="px-4 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Cancel</button>
              </div>
            </div>
          )}

          {successMessage && (
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-5 text-center">
              <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto mb-2" />
              <p className="text-sm font-semibold text-emerald-300">{successMessage}</p>
              <button onClick={reset} className="mt-3 text-sm text-emerald-400/80 hover:text-emerald-300 underline">Upload another file</button>
            </div>
          )}
        </div>
      </div>

      <div className="glass rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-border/40"><h3 className="text-sm font-semibold text-foreground">Upload History</h3></div>
        {loadingHistory ? (
          <div className="px-6 py-8 text-center text-sm text-muted-foreground">Loading...</div>
        ) : uploads.length === 0 ? (
          <div className="px-6 py-8 text-center"><FileText className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" /><p className="text-sm text-muted-foreground">No uploads yet</p></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="bg-secondary/30 border-b border-border/30"><th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Date</th><th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">File</th><th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Rows</th><th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Status</th></tr></thead>
              <tbody>
                {uploads.map(u => (
                  <tr key={u.id}
                    className={`border-b border-border/20 last:border-0 ${u.status === 'rejected' && u.rejection_reason ? 'cursor-pointer hover:bg-red-500/5 transition-colors' : ''} ${u.status === 'rejected' ? 'border-l-2 border-l-red-500/50' : ''}`}
                    onClick={() => { if (u.status === 'rejected' && u.rejection_reason) setExpandedRejectionId(expandedRejectionId === u.id ? null : u.id); }}>
                    <td className="px-4 py-2.5 text-foreground/70 whitespace-nowrap">{new Date(u.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}</td>
                    <td className="px-4 py-2.5 text-foreground font-medium max-w-[200px] truncate">{u.file_name}</td>
                    <td className="px-4 py-2.5 text-foreground/70">{u.row_count}</td>
                    <td className="px-4 py-2.5">
                      {u.status === 'success' ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/20"><CheckCircle2 className="w-3 h-3" />Confirmed</span>
                        : u.status === 'pending_approval' ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-500/15 text-amber-400 border border-amber-500/20"><Clock className="w-3 h-3" />Pending Review</span>
                        : <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-500/15 text-red-400 border border-red-500/20"><XCircle className="w-3 h-3" />Rejected{u.rejection_reason && <span className="text-red-400/50 ml-1">— click for details</span>}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
