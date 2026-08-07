/**
 * ResultsDetailTable — scrollable table showing per-row import status
 * with export and "import another" actions.
 */
import { useCallback } from 'react';
import {
  Download,
  CheckCircle2,
  AlertCircle,
  XCircle,
} from 'lucide-react';
import type { ImportResult } from '@/lib/contracting/roster-import-types';

interface ResultsDetailTableProps {
  result: ImportResult;
  onReset: () => void;
}

export function ResultsDetailTable({
  result,
  onReset,
}: ResultsDetailTableProps) {
  const downloadResults = useCallback(() => {
    const csvHeader = 'row,name,npn,status,reason\n';
    const csvRows = result.details
      .map((d) => {
        const escapedReason = (d.reason ?? '').replace(/"/g, '""');
        return `${d.row},"${d.name}","${d.npn}",${d.status},"${escapedReason}"`;
      })
      .join('\n');
    const blob = new Blob([csvHeader + csvRows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `roster_import_results_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [result]);

  const statusIcon = (status: string) => {
    switch (status) {
      case 'imported':
        return <CheckCircle2 className="w-3 h-3" />;
      case 'skipped':
        return <AlertCircle className="w-3 h-3" />;
      default:
        return <XCircle className="w-3 h-3" />;
    }
  };

  const statusClasses = (status: string) => {
    switch (status) {
      case 'imported':
        return 'bg-emerald-500/10 text-emerald-400';
      case 'skipped':
        return 'bg-amber-500/10 text-amber-400';
      default:
        return 'bg-red-500/10 text-red-400';
    }
  };

  const rowBg = (status: string) => {
    if (status === 'error') return 'bg-red-500/5';
    if (status === 'skipped') return 'bg-amber-500/5';
    return '';
  };

  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border flex items-center justify-between">
        <p className="text-sm font-bold text-foreground">Import Details</p>
        <div className="flex gap-2">
          <button
            onClick={downloadResults}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border text-sm font-medium text-foreground/80 hover:bg-secondary/30"
          >
            <Download className="w-4 h-4" /> Export Results
          </button>
          <button
            onClick={onReset}
            className="px-4 py-2 rounded-lg gradient-primary text-primary-foreground text-sm font-semibold"
          >
            Import Another
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto max-h-96">
        <table className="w-full text-sm">
          <thead className="bg-secondary/20 sticky top-0">
            <tr>
              <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">
                Row
              </th>
              <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">
                Name
              </th>
              <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">
                NPN
              </th>
              <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">
                Status
              </th>
              <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">
                Details
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {result.details.map((d, i) => (
              <tr key={i} className={rowBg(d.status)}>
                <td className="px-4 py-2 text-muted-foreground">{d.row}</td>
                <td className="px-4 py-2 font-medium text-foreground">
                  {d.name}
                </td>
                <td className="px-4 py-2 text-foreground/80">{d.npn}</td>
                <td className="px-4 py-2">
                  <span
                    className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-lg ${statusClasses(d.status)}`}
                  >
                    {statusIcon(d.status)}
                    {d.status.charAt(0).toUpperCase() + d.status.slice(1)}
                  </span>
                </td>
                <td className="px-4 py-2 text-xs text-muted-foreground">
                  {d.reason || '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
