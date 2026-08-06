/**
 * CarrierUploadTab — Upload carrier hierarchy reports (Manhattan, GTL)
 *
 * Flow:
 * 1. User selects carrier + drops/picks XLSX file
 * 2. Orchestrator parses → matches → auto-applies exact matches
 * 3. Report modal opens with three tiers: exact (done), fuzzy (approve/reject), no-match (tie/add/skip)
 * 4. User resolves fuzzy + no-match items, clicks "Apply All"
 *
 * All data reads/writes go through portalSupabase (akhojh…).
 */
import { useState, useRef, useCallback } from 'react';
import {
  Upload,
  FileSpreadsheet,
  Loader2,
  Shield,
  AlertTriangle,
} from 'lucide-react';
import { portalSupabase } from '@/lib/portal-supabase';
import {
  processCarrierUpload,
  SUPPORTED_CARRIERS,
  type SupportedCarrier,
  type CarrierUploadReport,
} from '@/lib/carrier-upload';
import { CarrierUploadReportPanel } from './CarrierUploadReportPanel';
import { UploadHistoryTable } from './UploadHistoryTable';

export function CarrierUploadTab() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [carrier, setCarrier] = useState<SupportedCarrier>('Manhattan');
  const [dragOver, setDragOver] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState('');
  const [report, setReport] = useState<CarrierUploadReport | null>(null);
  const [error, setError] = useState('');

  const handleFile = useCallback(
    async (file: File) => {
      if (!portalSupabase) {
        setError('Portal connection not configured.');
        return;
      }

      const validExts = ['.xlsx', '.xls', '.xlsb'];
      const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
      if (!validExts.includes(ext)) {
        setError('Please upload an Excel file (.xlsx, .xls).');
        return;
      }

      setError('');
      setReport(null);
      setProcessing(true);
      setProgress('Reading file…');

      try {
        const buffer = await file.arrayBuffer();
        setProgress('Parsing report & matching agents…');

        const result = await processCarrierUpload(
          portalSupabase,
          buffer,
          carrier,
          file.name,
        );

        setReport(result);
        setProgress('');
      } catch (err: any) {
        setError(err?.message || 'Failed to process the report.');
        setProgress('');
      } finally {
        setProcessing(false);
      }
    },
    [carrier],
  );

  const onFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    // Reset so same file can be re-uploaded
    if (fileRef.current) fileRef.current.value = '';
  };

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  const handleReset = () => {
    setReport(null);
    setError('');
    setProgress('');
    if (fileRef.current) fileRef.current.value = '';
  };

  if (!portalSupabase) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Shield className="w-12 h-12 mx-auto mb-3 text-muted-foreground" />
        <p className="font-medium">Portal connection not configured</p>
        <p className="text-sm mt-1">
          Set VITE_PORTAL_SUPABASE_URL and VITE_PORTAL_SUPABASE_KEY to enable.
        </p>
      </div>
    );
  }

  // Show report panel when we have results
  if (report) {
    return (
      <CarrierUploadReportPanel
        report={report}
        supabase={portalSupabase}
        onReset={handleReset}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">
          Carrier Hierarchy Upload
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Upload a carrier hierarchy report to match agents, assign writing
          numbers, and update carrier tags automatically.
        </p>
      </div>

      {/* Carrier selector */}
      <div className="flex items-center gap-3">
        <label className="text-sm font-medium text-foreground/80">
          Carrier:
        </label>
        <div className="flex gap-2">
          {SUPPORTED_CARRIERS.map((c) => (
            <button
              key={c}
              onClick={() => setCarrier(c)}
              disabled={processing}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                carrier === c
                  ? 'gradient-primary text-primary-foreground'
                  : 'bg-secondary/40 text-foreground/70 hover:bg-secondary/60 border border-border'
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {/* Upload drop zone */}
      <div
        className={`border-2 border-dashed rounded-lg p-12 text-center transition-colors ${
          processing
            ? 'border-primary/30 bg-primary/5 cursor-wait'
            : dragOver
              ? 'border-primary/50 bg-secondary/20 cursor-pointer'
              : 'border-border hover:border-primary/40 hover:bg-secondary/20 cursor-pointer'
        }`}
        onClick={() => !processing && fileRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          if (!processing) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
      >
        {processing ? (
          <>
            <Loader2 className="w-10 h-10 text-primary mx-auto mb-3 animate-spin" />
            <p className="text-sm font-semibold text-foreground/80">
              {progress}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              This may take a moment for large reports.
            </p>
          </>
        ) : (
          <>
            <Upload className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm font-semibold text-foreground/80">
              Click to upload or drag and drop a {carrier} hierarchy report
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Supports .xlsx and .xls files
            </p>
          </>
        )}
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls,.xlsb"
          className="hidden"
          onChange={onFileInput}
        />
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/20 rounded-lg p-4">
          <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {/* How it works */}
      <div className="bg-card border border-border rounded-lg p-6">
        <h2 className="text-sm font-bold text-foreground mb-3">How it works</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-emerald-400 font-semibold">
              <FileSpreadsheet className="w-4 h-4" />
              1. Upload Report
            </div>
            <p className="text-muted-foreground text-xs">
              Drop the carrier's hierarchy/roster XLSX. The parser extracts
              agents, writing numbers, and agency hierarchy.
            </p>
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-cyan-400 font-semibold">
              <Shield className="w-4 h-4" />
              2. Auto-Match
            </div>
            <p className="text-muted-foreground text-xs">
              Exact name matches are applied automatically — carrier tags and
              writing numbers get written. Fuzzy matches and unknowns are
              queued for your review.
            </p>
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-amber-400 font-semibold">
              <Upload className="w-4 h-4" />
              3. Resolve & Apply
            </div>
            <p className="text-muted-foreground text-xs">
              Approve fuzzy matches, tie unknowns to existing agents, or add
              them as new. Resolved aliases are remembered for next time.
            </p>
          </div>
        </div>
      </div>

      {/* Upload history */}
      <UploadHistoryTable supabase={portalSupabase} />
    </div>
  );
}
