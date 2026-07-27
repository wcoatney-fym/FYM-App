/**
 * ContractingRosterImportTab — CSV bulk import of historical agents into
 * the Agent Database, with NPN dedup against `agents` and `agent_intake`.
 *
 * Ported from contracting-portal/src/pages/RosterImport.tsx
 * All data reads/writes go through portalSupabase (akhojh…).
 */
import React, { useState, useRef } from 'react';
import {
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  XCircle,
  Loader2,
  Download,
  Users,
  Database,
} from 'lucide-react';
import { portalSupabase } from '@/lib/portal-supabase';

interface ImportResult {
  imported: number;
  skipped: number;
  errors: number;
  details: {
    row: number;
    name: string;
    npn: string;
    status: 'imported' | 'skipped' | 'error';
    reason?: string;
  }[];
}

const REQUIRED_FIELDS = ['first_name', 'last_name', 'npn'];

function parseCSV(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return { headers: [], rows: [] };

  const headers = lines[0].split(',').map((h) => h.trim().toLowerCase().replace(/\s+/g, '_'));
  const rows = lines.slice(1).map((line) => {
    const values = line.split(',').map((v) => v.trim().replace(/^["']|["']$/g, ''));
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = values[i] || '';
    });
    return row;
  });

  return { headers, rows };
}

function normalizeHeaders(headers: string[]): Map<string, string> {
  const map = new Map<string, string>();
  const aliases: Record<string, string[]> = {
    first_name: ['first_name', 'firstname', 'first', 'agent_first_name'],
    last_name: ['last_name', 'lastname', 'last', 'agent_last_name'],
    npn: ['npn', 'agent_npn', 'national_producer_number'],
    email: ['email', 'agent_email', 'email_address'],
    phone: ['phone', 'agent_phone', 'phone_number', 'cell', 'mobile'],
    agency: ['agency', 'agency_name', 'sub_agency'],
    resident_state: ['resident_state', 'state', 'home_state'],
  };

  for (const h of headers) {
    for (const [canonical, alts] of Object.entries(aliases)) {
      if (alts.includes(h)) {
        map.set(h, canonical);
        break;
      }
    }
  }
  return map;
}

export function ContractingRosterImportTab() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [preview, setPreview] = useState<{
    headers: string[];
    rows: Record<string, string>[];
    headerMap: Map<string, string>;
  } | null>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState('');

  const processFile = (file: File) => {
    setError('');
    setResult(null);

    if (!file.name.endsWith('.csv')) {
      setError('Please upload a .csv file.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const { headers, rows } = parseCSV(text);

      if (rows.length === 0) {
        setError('No data rows found in the CSV.');
        return;
      }

      const headerMap = normalizeHeaders(headers);
      const mapped = Array.from(headerMap.values());
      const missing = REQUIRED_FIELDS.filter((f) => !mapped.includes(f));

      if (missing.length > 0) {
        setError(`Missing required columns: ${missing.join(', ')}. Found: ${headers.join(', ')}`);
        return;
      }

      setPreview({ headers, rows, headerMap });
    };
    reader.readAsText(file);
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  };

  const getMappedValue = (row: Record<string, string>, field: string): string => {
    if (!preview) return '';
    for (const [rawHeader, canonical] of preview.headerMap.entries()) {
      if (canonical === field) return row[rawHeader]?.trim() || '';
    }
    return '';
  };

  const handleImport = async () => {
    if (!preview) return;
    if (!portalSupabase) {
      setError('Portal connection not configured.');
      return;
    }
    setImporting(true);
    setError('');

    const details: ImportResult['details'] = [];
    let imported = 0;
    let skipped = 0;
    let errors = 0;

    for (let i = 0; i < preview.rows.length; i++) {
      const row = preview.rows[i];
      const firstName = getMappedValue(row, 'first_name');
      const lastName = getMappedValue(row, 'last_name');
      const npn = getMappedValue(row, 'npn');
      const email = getMappedValue(row, 'email') || null;
      const phone = getMappedValue(row, 'phone') || null;
      const agency = getMappedValue(row, 'agency') || 'FYM';
      const residentState = getMappedValue(row, 'resident_state') || null;
      const name = `${firstName} ${lastName}`;

      if (!firstName || !lastName || !npn) {
        errors++;
        details.push({
          row: i + 2,
          name: name.trim() || '(empty)',
          npn: npn || '(empty)',
          status: 'error',
          reason: 'Missing required field',
        });
        continue;
      }

      try {
        const { data: existing } = await (portalSupabase as any)
          .from('agents')
          .select('id, first_name, last_name, npn')
          .eq('npn', npn)
          .maybeSingle();

        if (existing) {
          skipped++;
          details.push({
            row: i + 2,
            name,
            npn,
            status: 'skipped',
            reason: `Duplicate NPN — matches ${existing.first_name} ${existing.last_name}`,
          });
          continue;
        }

        const { data: intakeMatch } = await (portalSupabase as any)
          .from('agent_intake')
          .select('agent_id, npn')
          .eq('npn', npn)
          .maybeSingle();

        if (intakeMatch) {
          skipped++;
          details.push({
            row: i + 2,
            name,
            npn,
            status: 'skipped',
            reason: 'NPN already exists in intake records',
          });
          continue;
        }

        const { data: newAgent, error: insertErr } = await (portalSupabase as any)
          .from('agents')
          .insert({
            first_name: firstName,
            last_name: lastName,
            npn,
            email,
            phone,
            agency,
            resident_state: residentState,
            source: 'roster_import',
            status: 'completed',
            crm_onboarded: true,
          })
          .select('id')
          .maybeSingle();

        if (insertErr || !newAgent) {
          errors++;
          const reason = insertErr?.message?.includes('idx_agents_npn_unique')
            ? 'Duplicate NPN (conflict on insert)'
            : insertErr?.message || 'Insert failed';
          details.push({ row: i + 2, name, npn, status: 'error', reason });
          continue;
        }

        const agentSlug = [firstName, lastName, npn]
          .map((s) => s.toLowerCase().replace(/[^a-z0-9]/g, ''))
          .filter(Boolean)
          .join('-');

        await (portalSupabase as any).from('agent_hub_tokens').insert({
          agent_id: newAgent.id,
          npn,
          agent_slug: agentSlug || null,
        });

        imported++;
        details.push({ row: i + 2, name, npn, status: 'imported' });
      } catch (err: any) {
        errors++;
        details.push({ row: i + 2, name, npn, status: 'error', reason: err?.message || 'Unknown error' });
      }
    }

    setResult({ imported, skipped, errors, details });
    setImporting(false);
  };

  const handleReset = () => {
    setPreview(null);
    setResult(null);
    setError('');
    if (fileRef.current) fileRef.current.value = '';
  };

  const downloadTemplate = () => {
    const csv =
      'first_name,last_name,npn,email,phone,agency,resident_state\nJohn,Smith,12345678,john@email.com,555-123-4567,DH Insurance,Georgia\n';
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'agent_roster_template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!portalSupabase) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Database className="w-12 h-12 mx-auto mb-3 text-muted-foreground/50" />
        <p className="font-medium">Portal connection not configured</p>
        <p className="text-sm mt-1">
          Set VITE_PORTAL_SUPABASE_URL and VITE_PORTAL_SUPABASE_KEY to enable.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Import Agent Roster</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Upload a CSV of historical agents to add them to the Agent Database. Duplicates are
            detected by NPN.
          </p>
        </div>
        <button
          onClick={downloadTemplate}
          className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border text-sm font-medium text-foreground/80 hover:bg-secondary/30"
        >
          <Download className="w-4 h-4" /> Download Template
        </button>
      </div>

      {/* Upload area */}
      {!preview && !result && (
        <div
          className={`border-2 border-dashed rounded-lg p-12 text-center cursor-pointer transition-colors ${
            dragOver ? 'border-primary/50 bg-secondary/20' : 'border-border hover:border-primary/40 hover:bg-secondary/20'
          }`}
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
        >
          <Upload className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm font-semibold text-foreground/80">Click to upload or drag and drop a CSV</p>
          <p className="text-xs text-muted-foreground mt-1">
            Required columns: first_name, last_name, npn · Optional: email, phone, agency, resident_state
          </p>
          <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFile} />
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/20 rounded-lg p-4">
          <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {/* Preview */}
      {preview && !result && (
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="px-6 py-4 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-3">
              <FileSpreadsheet className="w-5 h-5 text-primary" />
              <div>
                <p className="text-sm font-bold text-foreground">
                  {preview.rows.length} agents ready to import
                </p>
                <p className="text-xs text-muted-foreground">
                  Mapped: {Array.from(new Set(preview.headerMap.values())).join(', ')}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleReset}
                className="px-4 py-2 rounded-lg border border-border text-sm font-medium text-foreground/80 hover:bg-secondary/30"
              >
                Cancel
              </button>
              <button
                onClick={handleImport}
                disabled={importing}
                className="flex items-center gap-2 px-5 py-2 rounded-lg gradient-primary text-primary-foreground text-sm font-semibold disabled:opacity-50"
              >
                {importing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Importing...
                  </>
                ) : (
                  <>
                    <Users className="w-4 h-4" /> Import {preview.rows.length} Agents
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Preview table — first 10 rows */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-secondary/20">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Row</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">First Name</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Last Name</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">NPN</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Email</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Agency</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {preview.rows.slice(0, 10).map((row, i) => (
                  <tr key={i}>
                    <td className="px-4 py-2 text-muted-foreground/50">{i + 2}</td>
                    <td className="px-4 py-2 font-medium text-foreground">
                      {getMappedValue(row, 'first_name')}
                    </td>
                    <td className="px-4 py-2 text-foreground/80">{getMappedValue(row, 'last_name')}</td>
                    <td className="px-4 py-2 text-foreground/80">{getMappedValue(row, 'npn')}</td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {getMappedValue(row, 'email') || '—'}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {getMappedValue(row, 'agency') || 'FYM'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {preview.rows.length > 10 && (
              <p className="px-4 py-2 text-xs text-muted-foreground/50 bg-secondary/20">
                …and {preview.rows.length - 10} more rows
              </p>
            )}
          </div>
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="space-y-4">
          {/* Summary cards */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-emerald-500/10 rounded-lg border border-emerald-500/20 p-4 text-center">
              <CheckCircle2 className="w-6 h-6 text-emerald-400 mx-auto mb-1" />
              <p className="text-2xl font-bold text-emerald-400">{result.imported}</p>
              <p className="text-xs text-emerald-400/80 font-medium">Imported</p>
            </div>
            <div className="bg-amber-500/10 rounded-lg border border-amber-500/20 p-4 text-center">
              <AlertCircle className="w-6 h-6 text-amber-400 mx-auto mb-1" />
              <p className="text-2xl font-bold text-amber-400">{result.skipped}</p>
              <p className="text-xs text-amber-400/80 font-medium">Skipped (duplicate)</p>
            </div>
            <div className="bg-red-500/10 rounded-lg border border-red-500/20 p-4 text-center">
              <XCircle className="w-6 h-6 text-red-400 mx-auto mb-1" />
              <p className="text-2xl font-bold text-red-400">{result.errors}</p>
              <p className="text-xs text-red-400/80 font-medium">Errors</p>
            </div>
          </div>

          {/* Detail table */}
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <div className="px-6 py-4 border-b border-border flex items-center justify-between">
              <p className="text-sm font-bold text-foreground">Import Details</p>
              <button
                onClick={handleReset}
                className="px-4 py-2 rounded-lg gradient-primary text-primary-foreground text-sm font-semibold"
              >
                Import Another
              </button>
            </div>
            <div className="overflow-x-auto max-h-96">
              <table className="w-full text-sm">
                <thead className="bg-secondary/20 sticky top-0">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Row</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Name</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">NPN</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Status</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {result.details.map((d, i) => (
                    <tr
                      key={i}
                      className={
                        d.status === 'error'
                          ? 'bg-red-500/5'
                          : d.status === 'skipped'
                            ? 'bg-amber-500/5'
                            : ''
                      }
                    >
                      <td className="px-4 py-2 text-muted-foreground/50">{d.row}</td>
                      <td className="px-4 py-2 font-medium text-foreground">{d.name}</td>
                      <td className="px-4 py-2 text-foreground/80">{d.npn}</td>
                      <td className="px-4 py-2">
                        <span
                          className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-lg ${
                            d.status === 'imported'
                              ? 'bg-emerald-500/10 text-emerald-400'
                              : d.status === 'skipped'
                                ? 'bg-amber-500/10 text-amber-400'
                                : 'bg-red-500/10 text-red-400'
                          }`}
                        >
                          {d.status === 'imported' ? (
                            <CheckCircle2 className="w-3 h-3" />
                          ) : d.status === 'skipped' ? (
                            <AlertCircle className="w-3 h-3" />
                          ) : (
                            <XCircle className="w-3 h-3" />
                          )}
                          {d.status.charAt(0).toUpperCase() + d.status.slice(1)}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-xs text-muted-foreground">{d.reason || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
