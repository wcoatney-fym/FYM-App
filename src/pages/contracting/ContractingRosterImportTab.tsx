/**
 * ContractingRosterImportTab — CSV bulk import of historical agents into
 * the Agent Database, with NPN dedup against `agents` and `agent_intake`.
 *
 * Ported from contracting-portal/src/pages/RosterImport.tsx
 * All data reads/writes go through portalSupabase (akhojh…).
 *
 * Refactored (Group 1): RFC 4180 parser, shared types, file guard, progress, export.
 * Refactored (Group 2): Decomposed into UploadZone, PreviewTable, ResultsSummary,
 *   ResultsDetailTable sub-components. Removed `as any` casts.
 */
import { useState, useCallback } from 'react';
import { Download, AlertCircle, Database } from 'lucide-react';
import { supabase as portalSupabase, portalConfigured } from '@/lib/crm/portal-client';
import { parseCSV } from '@/lib/csv-parser';
import {
  type ImportResult,
  type ImportRowDetail,
  resolveImportHeaders,
  findMissingRequired,
  getMappedValue,
  createTemplateBlobUrl,
} from '@/lib/contracting/roster-import-types';
import {
  UploadZone,
  PreviewTable,
  ResultsSummary,
  ResultsDetailTable,
  type PreviewState,
} from './roster-import';

/* ------------------------------------------------------------------ */
/*  Component                                                         */
/* ------------------------------------------------------------------ */

export function ContractingRosterImportTab() {
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState('');

  /* ---- file accepted from UploadZone ---- */

  const handleFileAccepted = useCallback((file: File) => {
    setError('');
    setResult(null);

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const { headers, rows } = parseCSV(text);

      if (rows.length === 0) {
        setError('No data rows found in the CSV.');
        return;
      }

      const headerMap = resolveImportHeaders(headers);
      const missing = findMissingRequired(headerMap);

      if (missing.length > 0) {
        setError(
          `Missing required columns: ${missing.join(', ')}. Found: ${headers.join(', ')}`,
        );
        return;
      }

      setPreview({ headers, rows, headerMap });
    };
    reader.readAsText(file);
  }, []);

  /* ---- import ---- */

  const handleImport = useCallback(async () => {
    if (!preview || !portalConfigured) return;
    setImporting(true);
    setError('');

    const details: ImportRowDetail[] = [];
    let imported = 0;
    let skipped = 0;
    let errors = 0;
    const total = preview.rows.length;
    setProgress({ current: 0, total });

    for (let i = 0; i < total; i++) {
      setProgress({ current: i + 1, total });
      const row = preview.rows[i];
      const firstName = getMappedValue(row, 'first_name', preview.headerMap);
      const lastName = getMappedValue(row, 'last_name', preview.headerMap);
      const npn = getMappedValue(row, 'npn', preview.headerMap);
      const email = getMappedValue(row, 'email', preview.headerMap) || null;
      const phone = getMappedValue(row, 'phone', preview.headerMap) || null;
      const agency = getMappedValue(row, 'agency', preview.headerMap) || 'FYM';
      const residentState =
        getMappedValue(row, 'resident_state', preview.headerMap) || null;
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
        // Dedup against agents table
        const { data: existing } = await portalSupabase
          .from('agents')
          .select('id, first_name, last_name, npn')
          .eq('npn', npn)
          .maybeSingle();

        if (existing) {
          const ex = existing as { id: string; first_name: string; last_name: string; npn: string };
          skipped++;
          details.push({
            row: i + 2,
            name,
            npn,
            status: 'skipped',
            reason: `Duplicate NPN — matches ${ex.first_name} ${ex.last_name}`,
          });
          continue;
        }

        // Dedup against agent_intake table
        const { data: intakeMatch } = await portalSupabase
          .from('agent_intake_safe')
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

        // Insert new agent
        const { data: newAgent, error: insertErr } = await portalSupabase
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

        // Create hub token for the new agent
        const agent = newAgent as { id: string };
        const agentSlug = [firstName, lastName, npn]
          .map((s) => s.toLowerCase().replace(/[^a-z0-9]/g, ''))
          .filter(Boolean)
          .join('-');

        await portalSupabase.from('agent_hub_tokens').insert({
          agent_id: agent.id,
          npn,
          agent_slug: agentSlug || null,
        });

        imported++;
        details.push({ row: i + 2, name, npn, status: 'imported' });
      } catch (err: unknown) {
        errors++;
        const message =
          err instanceof Error ? err.message : 'Unknown error';
        details.push({
          row: i + 2,
          name,
          npn,
          status: 'error',
          reason: message,
        });
      }
    }

    setResult({ imported, skipped, errors, details });
    setImporting(false);
  }, [preview]);

  /* ---- reset ---- */

  const handleReset = useCallback(() => {
    setPreview(null);
    setResult(null);
    setError('');
    setProgress({ current: 0, total: 0 });
  }, []);

  /* ---- template download ---- */

  const downloadTemplate = useCallback(() => {
    const url = createTemplateBlobUrl();
    const a = document.createElement('a');
    a.href = url;
    a.download = 'agent_roster_template.csv';
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  /* ---- render: no portal connection ---- */

  if (!portalConfigured) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Database className="w-12 h-12 mx-auto mb-3 text-muted-foreground" />
        <p className="font-medium">Portal connection not configured</p>
        <p className="text-sm mt-1">
          Set VITE_PORTAL_SUPABASE_URL and VITE_PORTAL_SUPABASE_KEY to enable.
        </p>
      </div>
    );
  }

  /* ---- render: main ---- */

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            Import Agent Roster
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Upload a CSV of historical agents to add them to the Agent Database.
            Duplicates are detected by NPN.
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
        <UploadZone
          onFileAccepted={handleFileAccepted}
          onError={setError}
        />
      )}

      {/* Error banner */}
      {error && (
        <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/20 rounded-lg p-4">
          <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {/* Preview */}
      {preview && !result && (
        <PreviewTable
          preview={preview}
          importing={importing}
          progress={progress}
          onImport={handleImport}
          onCancel={handleReset}
        />
      )}

      {/* Results */}
      {result && (
        <div className="space-y-4">
          <ResultsSummary result={result} />
          <ResultsDetailTable result={result} onReset={handleReset} />
        </div>
      )}
    </div>
  );
}
