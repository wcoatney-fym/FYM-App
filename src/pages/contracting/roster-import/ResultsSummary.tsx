/**
 * ResultsSummary — three stat cards showing imported / skipped / error counts.
 */
import { CheckCircle2, AlertCircle, XCircle } from 'lucide-react';
import type { ImportResult } from '@/lib/contracting/roster-import-types';

interface ResultsSummaryProps {
  result: ImportResult;
}

export function ResultsSummary({ result }: ResultsSummaryProps) {
  return (
    <div className="grid grid-cols-3 gap-4">
      <div className="bg-emerald-500/10 rounded-lg border border-emerald-500/20 p-4 text-center">
        <CheckCircle2 className="w-6 h-6 text-emerald-400 mx-auto mb-1" />
        <p className="text-2xl font-bold text-emerald-400">{result.imported}</p>
        <p className="text-xs text-emerald-400/80 font-medium">Imported</p>
      </div>
      <div className="bg-amber-500/10 rounded-lg border border-amber-500/20 p-4 text-center">
        <AlertCircle className="w-6 h-6 text-amber-400 mx-auto mb-1" />
        <p className="text-2xl font-bold text-amber-400">{result.skipped}</p>
        <p className="text-xs text-amber-400/80 font-medium">
          Skipped (duplicate)
        </p>
      </div>
      <div className="bg-red-500/10 rounded-lg border border-red-500/20 p-4 text-center">
        <XCircle className="w-6 h-6 text-red-400 mx-auto mb-1" />
        <p className="text-2xl font-bold text-red-400">{result.errors}</p>
        <p className="text-xs text-red-400/80 font-medium">Errors</p>
      </div>
    </div>
  );
}
