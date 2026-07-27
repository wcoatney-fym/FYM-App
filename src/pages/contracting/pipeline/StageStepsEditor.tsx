/**
 * StageStepsEditor — admin modal for defining checklist steps per stage.
 * Ported from CRM Portal.
 */
import { useState, useEffect } from 'react';
import { X, ListChecks, Plus, Trash2, Loader2, GripVertical } from 'lucide-react';
import { portalSupabase } from '@/lib/portal-supabase';
import type { AgentPipelineStage, PortalPipelineStageStep } from '@/lib/contracting/types';
import { STAGES } from './PipelineBoard';

interface StageStepsEditorProps {
  onClose: () => void;
}

export function StageStepsEditor({ onClose }: StageStepsEditorProps) {
  const [activeStage, setActiveStage] = useState<AgentPipelineStage>(STAGES[0].key);
  const [steps, setSteps] = useState<PortalPipelineStageStep[]>([]);
  const [loading, setLoading] = useState(true);
  const [newLabel, setNewLabel] = useState('');
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    if (!portalSupabase) return;
    setLoading(true);
    const { data } = await portalSupabase
      .from('agent_pipeline_stage_steps')
      .select('*')
      .order('display_order', { ascending: true });
    if (data) setSteps(data as PortalPipelineStageStep[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const stageSteps = steps.filter((s) => s.internal_stage === activeStage);

  const addStep = async () => {
    if (!portalSupabase) return;
    const label = newLabel.trim();
    if (!label) return;
    setAdding(true);
    const nextOrder =
      stageSteps.length > 0
        ? Math.max(...stageSteps.map((s) => s.display_order)) + 1
        : 1;
    const { data } = await portalSupabase
      .from('agent_pipeline_stage_steps')
      .insert({ internal_stage: activeStage, label, display_order: nextOrder })
      .select()
      .maybeSingle();
    if (data) setSteps((prev) => [...prev, data as PortalPipelineStageStep]);
    setNewLabel('');
    setAdding(false);
  };

  const deleteStep = async (id: string) => {
    if (!portalSupabase) return;
    setBusyId(id);
    const { error } = await portalSupabase
      .from('agent_pipeline_stage_steps')
      .delete()
      .eq('id', id);
    if (!error) setSteps((prev) => prev.filter((s) => s.id !== id));
    setBusyId(null);
  };

  const renameStep = async (id: string, label: string) => {
    if (!portalSupabase) return;
    await portalSupabase
      .from('agent_pipeline_stage_steps')
      .update({ label })
      .eq('id', id);
    setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, label } : s)));
  };

  const stageLabel =
    STAGES.find((s) => s.key === activeStage)?.label || activeStage;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-card rounded-2xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-card z-10 px-6 py-4 border-b border-border flex items-center justify-between rounded-t-2xl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-cyan-500/10 flex items-center justify-center">
              <ListChecks className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground">
                Stage Step Checklists
              </h2>
              <p className="text-xs text-muted-foreground">
                Define the steps agents complete in each stage
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-secondary rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
              Stage
            </label>
            <select
              value={activeStage}
              onChange={(e) =>
                setActiveStage(e.target.value as AgentPipelineStage)
              }
              className="w-full px-4 py-2.5 border border-border rounded-lg text-sm focus:ring-2 focus:ring-blue-400 focus:border-transparent bg-card"
            >
              {STAGES.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Steps for {stageLabel}
            </h3>
            {loading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-primary" />
              </div>
            ) : stageSteps.length === 0 ? (
              <p className="text-sm text-muted-foreground/70 py-4 text-center">
                No steps yet — add the first one below.
              </p>
            ) : (
              <div className="space-y-1.5">
                {stageSteps.map((step) => (
                  <div
                    key={step.id}
                    className="flex items-center gap-2 p-2 rounded-lg border border-border bg-card"
                  >
                    <GripVertical className="w-4 h-4 text-slate-300 flex-shrink-0" />
                    <input
                      defaultValue={step.label}
                      onBlur={(e) => {
                        if (
                          e.target.value.trim() &&
                          e.target.value !== step.label
                        )
                          renameStep(step.id, e.target.value.trim());
                      }}
                      className="flex-1 px-2 py-1 text-sm border border-transparent hover:border-border focus:border-blue-400 rounded focus:ring-1 focus:ring-blue-400 focus:outline-none"
                    />
                    <button
                      onClick={() => deleteStep(step.id)}
                      disabled={busyId === step.id}
                      className="p-1.5 text-muted-foreground/70 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors flex-shrink-0"
                    >
                      {busyId === step.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 pt-2 border-t border-border/50">
            <input
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') addStep();
              }}
              placeholder="Add a step..."
              className="flex-1 px-4 py-2.5 border border-border rounded-lg text-sm focus:ring-2 focus:ring-blue-400 focus:border-transparent"
            />
            <button
              onClick={addStep}
              disabled={adding || !newLabel.trim()}
              className="flex items-center gap-2 px-4 py-2.5 bg-primary text-white rounded-lg font-medium text-sm hover:bg-primary/80 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {adding ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Plus className="w-4 h-4" />
              )}
              Add
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
