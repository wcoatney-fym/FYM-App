import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Zap, CheckCircle2, AlertCircle, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { EngineRunSummary } from '@/stores/cc-tasks-store';

interface Props {
  onRun: () => Promise<EngineRunSummary>;
}

type RunState = 'idle' | 'running' | 'done' | 'error';

export function EngineRunButton({ onRun }: Props) {
  const [state, setState] = useState<RunState>('idle');
  const [result, setResult] = useState<EngineRunSummary | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleRun = async () => {
    if (state === 'running') return;
    setState('running');
    setResult(null);
    setExpanded(false);
    setErrorMsg('');
    try {
      const summary = await onRun();
      setResult(summary);
      setState('done');
      setExpanded(true);
      setTimeout(() => setExpanded(false), 12000);
    } catch (e) {
      setErrorMsg((e as Error).message ?? 'Unknown error');
      setState('error');
    }
  };

  const buttonLabel =
    state === 'running' ? 'Running engines…' :
    state === 'done'    ? `Done · ${result?.totalUpserted ?? 0} tasks` :
    state === 'error'   ? 'Engine error' :
    'Run Engines';

  const buttonClass = cn(
    'flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all',
    state === 'running' && 'bg-primary/10 text-primary cursor-not-allowed',
    state === 'done'    && 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20',
    state === 'error'   && 'bg-red-500/10 text-red-400 hover:bg-red-500/20',
    state === 'idle'    && 'bg-secondary/60 hover:bg-secondary text-foreground',
  );

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-1">
        <button onClick={handleRun} disabled={state === 'running'} className={buttonClass}>
          {state === 'running' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : state === 'done' ? <CheckCircle2 className="w-3.5 h-3.5" /> : state === 'error' ? <AlertCircle className="w-3.5 h-3.5" /> : <Zap className="w-3.5 h-3.5" />}
          {buttonLabel}
        </button>
        {(state === 'done' || state === 'error') && (
          <button onClick={() => setExpanded((e) => !e)} className="p-1.5 rounded-lg bg-secondary/40 hover:bg-secondary text-muted-foreground transition-colors">
            {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
        )}
      </div>
      <AnimatePresence>
        {expanded && result && (
          <motion.div initial={{ opacity: 0, y: -6, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6, scale: 0.97 }} transition={{ duration: 0.15 }} className="w-72 glass rounded-xl p-4 border border-border/50 glow-primary space-y-3 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-sm">Engine Run Complete</span>
              <span className="text-muted-foreground text-[10px]">{new Date(result.ranAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between"><span className="text-muted-foreground font-medium">Reconciliation</span><EngineStatus ran={result.reconciliation.ran} reason={result.reconciliation.reason} /></div>
              {result.reconciliation.ran && <div className="flex gap-3 pl-2 text-[11px] text-muted-foreground"><span>{result.reconciliation.issues.length} issues found</span><span>{result.reconciliation.persisted} tasks written</span></div>}
              {result.reconciliation.ran && result.reconciliation.issues.length > 0 && (
                <div className="pl-2 space-y-1 mt-1">
                  {result.reconciliation.issues.slice(0, 3).map((issue, i) => <div key={i} className="text-[10px] text-muted-foreground truncate">· {issue.agencyName}: {issue.category}</div>)}
                  {result.reconciliation.issues.length > 3 && <div className="text-[10px] text-muted-foreground pl-2">+{result.reconciliation.issues.length - 3} more</div>}
                </div>
              )}
            </div>
            <div className="border-t border-border/30" />
            <div className="space-y-1">
              <div className="flex items-center justify-between"><span className="text-muted-foreground font-medium">Activation Aging</span><EngineStatus ran={result.activation.ran} reason={result.activation.reason} /></div>
              {result.activation.ran && <div className="flex gap-3 pl-2 text-[11px] text-muted-foreground"><span>{result.activation.tasks.length} agencies flagged</span><span>{result.activation.upserted} tasks written</span></div>}
              {result.activation.ran && result.activation.tasks.length > 0 && (
                <div className="pl-2 space-y-1 mt-1">
                  {result.activation.tasks.slice(0, 3).map((t, i) => <div key={i} className="text-[10px] text-muted-foreground truncate">· {t.agencyName}: {t.category}</div>)}
                  {result.activation.tasks.length > 3 && <div className="text-[10px] text-muted-foreground pl-2">+{result.activation.tasks.length - 3} more</div>}
                </div>
              )}
            </div>
            <div className="border-t border-border/30" />
            <div className="flex items-center justify-between font-medium"><span>Total tasks written</span><span className={cn('text-sm', result.totalUpserted > 0 ? 'text-primary' : 'text-muted-foreground')}>{result.totalUpserted}</span></div>
            {result.totalUpserted > 0 && <p className="text-[10px] text-muted-foreground">Board has been refreshed with new tasks above.</p>}
          </motion.div>
        )}
        {expanded && state === 'error' && (
          <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} className="w-64 glass rounded-xl p-3 border border-red-500/20 text-xs text-red-400">{errorMsg || 'Engine run failed — check console.'}</motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function EngineStatus({ ran, reason }: { ran: boolean; reason?: string }) {
  if (ran) return <span className="text-emerald-400 text-[10px]">✓ ran</span>;
  return <span className="text-amber-400 text-[10px]">{reason ?? 'skipped'}</span>;
}
