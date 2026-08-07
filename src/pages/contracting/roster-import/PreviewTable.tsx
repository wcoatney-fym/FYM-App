/**
 * PreviewTable — shows the first 10 rows of a parsed CSV with mapped
 * header labels, cancel/import controls, and a progress bar during import.
 */
import React from 'react';
import { FileSpreadsheet, Loader2, Users } from 'lucide-react';
import {
  type ImportField,
  getMappedValue,
} from '@/lib/contracting/roster-import-types';

export interface PreviewState {
  headers: string[];
  rows: Record<string, string>[];
  headerMap: Map<string, ImportField>;
}

interface PreviewTableProps {
  preview: PreviewState;
  importing: boolean;
  progress: { current: number; total: number };
  onImport: () => void;
  onCancel: () => void;
}

export function PreviewTable({
  preview,
  importing,
  progress,
  onImport,
  onCancel,
}: PreviewTableProps) {
  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      {/* Toolbar */}
      <div className="px-6 py-4 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-3">
          <FileSpreadsheet className="w-5 h-5 text-primary" />
          <div>
            <p className="text-sm font-bold text-foreground">
              {preview.rows.length} agents ready to import
            </p>
            <p className="text-xs text-muted-foreground">
              Mapped:{' '}
              {Array.from(new Set(preview.headerMap.values())).join(', ')}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-lg border border-border text-sm font-medium text-foreground/80 hover:bg-secondary/30"
          >
            Cancel
          </button>
          <button
            onClick={onImport}
            disabled={importing}
            className="flex items-center gap-2 px-5 py-2 rounded-lg gradient-primary text-primary-foreground text-sm font-semibold disabled:opacity-50"
          >
            {importing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Importing{' '}
                {progress.current}/{progress.total}…
              </>
            ) : (
              <>
                <Users className="w-4 h-4" /> Import {preview.rows.length}{' '}
                Agents
              </>
            )}
          </button>
        </div>
      </div>

      {/* Progress bar */}
      {importing && progress.total > 0 && (
        <div className="px-6 py-2 bg-secondary/10">
          <div className="w-full bg-secondary/30 rounded-full h-2 overflow-hidden">
            <div
              className="bg-primary h-full rounded-full transition-all duration-200"
              style={{
                width: `${Math.round((progress.current / progress.total) * 100)}%`,
              }}
            />
          </div>
          <p className="text-xs text-muted-foreground mt-1 text-right">
            {progress.current} of {progress.total} rows processed
          </p>
        </div>
      )}

      {/* Data rows — first 10 */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-secondary/20">
            <tr>
              <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">
                Row
              </th>
              <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">
                First Name
              </th>
              <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">
                Last Name
              </th>
              <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">
                NPN
              </th>
              <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">
                Email
              </th>
              <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">
                Agency
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {preview.rows.slice(0, 10).map((row, i) => (
              <tr key={i}>
                <td className="px-4 py-2 text-muted-foreground">{i + 2}</td>
                <td className="px-4 py-2 font-medium text-foreground">
                  {getMappedValue(row, 'first_name', preview.headerMap)}
                </td>
                <td className="px-4 py-2 text-foreground/80">
                  {getMappedValue(row, 'last_name', preview.headerMap)}
                </td>
                <td className="px-4 py-2 text-foreground/80">
                  {getMappedValue(row, 'npn', preview.headerMap)}
                </td>
                <td className="px-4 py-2 text-muted-foreground">
                  {getMappedValue(row, 'email', preview.headerMap) || '—'}
                </td>
                <td className="px-4 py-2 text-muted-foreground">
                  {getMappedValue(row, 'agency', preview.headerMap) || 'FYM'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {preview.rows.length > 10 && (
          <p className="px-4 py-2 text-xs text-muted-foreground bg-secondary/20">
            …and {preview.rows.length - 10} more rows
          </p>
        )}
      </div>
    </div>
  );
}
