/**
 * AtRiskPolicyModal — Detail modal for an at-risk policy in the Kanban pipeline.
 *
 * Shows policy details, urgency info, stage transition buttons, and activity log.
 */
import { useState } from 'react';
import {
  X, Clock, DollarSign, User, Building2, FileText,
  ArrowRight, Loader2,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { AtRiskPolicy } from './AtRiskKanban';

type Stage =
  | 'new'
  | 'responded'
  | 'manager_outreach'
  | 'agent_outreach'
  | 'code_red'
  | 'agent_saved_pending'
  | 'saved'
  | 'lost';

const STAGE_LABELS: Record<Stage, string> = {
  new: 'New',
  responded: 'Responded',
  manager_outreach: 'Manager Outreach',
  agent_outreach: 'Agent Outreach',
  code_red: 'Code Red',
  agent_saved_pending: 'Pending Save',
  saved: 'Saved',
  lost: 'Lost',
};

const STAGE_COLORS: Record<Stage, string> = {
  new: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
  responded: 'bg-sky-500/10 text-sky-400 border-sky-500/20',
  manager_outreach: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  agent_outreach: 'bg-violet-500/10 text-violet-400 border-violet-500/20',
  code_red: 'bg-red-500/10 text-red-400 border-red-500/20',
  agent_saved_pending: 'bg-teal-500/10 text-teal-400 border-teal-500/20',
  saved: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  lost: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
};

// Stages available as manual transition targets
const TRANSITION_TARGETS: Stage[] = ['responded', 'manager_outreach', 'agent_outreach', 'code_red', 'saved', 'lost'];

interface AtRiskPolicyModalProps {
  policy: AtRiskPolicy;
  onClose: () => void;
  onStageChange: (policyNumber: string, newStage: Stage) => void;
}

export function AtRiskPolicyModal({ policy, onClose, onStageChange }: AtRiskPolicyModalProps) {
  const [transitioning, setTransitioning] = useState<Stage | null>(null);

  const currentStage: Stage = (policy.task_status as Stage) || 'new';
  const daysLapsed = policy.days_since_draft;
  const dtt = Math.max(0, 45 - daysLapsed);
  const isCodeRed = daysLapsed >= 30;
  const isHeating = daysLapsed >= 14 && daysLapsed < 30;
  const annualPremium = Number(policy.plan_premium) * 12;

  const handleTransition = async (target: Stage) => {
    if (target === currentStage) return;
    setTransitioning(target);
    onStageChange(policy.policy_number, target);
    // Small delay for visual feedback before closing
    setTimeout(() => {
      setTransitioning(null);
    }, 300);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-card border border-border rounded-xl w-full max-w-lg shadow-xl max-h-[85vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-border">
          <div className="min-w-0">
            <h3 className="text-lg font-bold text-foreground">
              {policy.client_name || 'Unknown Client'}
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Policy #{policy.policy_number}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground p-1 -mr-1 -mt-1"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-5">
          {/* Current stage + urgency */}
          <div className="flex items-center gap-2 flex-wrap">
            <Badge className={`text-xs px-2 py-0.5 border ${STAGE_COLORS[currentStage]}`}>
              {STAGE_LABELS[currentStage]}
            </Badge>
            {isCodeRed && (
              <Badge className="text-xs px-2 py-0.5 border bg-red-500/15 text-red-300 border-red-500/30 font-bold">
                CODE RED
              </Badge>
            )}
            {isHeating && (
              <Badge className="text-xs px-2 py-0.5 border bg-amber-500/15 text-amber-300 border-amber-500/30 font-bold">
                HEATING UP
              </Badge>
            )}
            <span className={`text-sm font-bold ml-auto ${
              isCodeRed ? 'text-red-400' : isHeating ? 'text-amber-400' : 'text-muted-foreground'
            }`}>
              {dtt > 0 ? `${dtt} days left` : 'Grace period expired'}
            </span>
          </div>

          {/* Policy details grid */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="flex items-center gap-2">
              <FileText size={14} className="text-muted-foreground shrink-0" />
              <div>
                <p className="text-[10px] text-muted-foreground">Product</p>
                <p className="text-foreground font-medium">{policy.product_type}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <DollarSign size={14} className="text-muted-foreground shrink-0" />
              <div>
                <p className="text-[10px] text-muted-foreground">Annual Premium</p>
                <p className="text-foreground font-medium">${annualPremium.toLocaleString()}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Clock size={14} className="text-muted-foreground shrink-0" />
              <div>
                <p className="text-[10px] text-muted-foreground">Days Since Draft</p>
                <p className={`font-bold ${
                  isCodeRed ? 'text-red-400' : isHeating ? 'text-amber-400' : 'text-foreground'
                }`}>
                  {daysLapsed}d
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Clock size={14} className="text-muted-foreground shrink-0" />
              <div>
                <p className="text-[10px] text-muted-foreground">Paid To Date</p>
                <p className="text-foreground">
                  {new Date(policy.paid_to_date).toLocaleDateString('en-US', {
                    month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC'
                  })}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <User size={14} className="text-muted-foreground shrink-0" />
              <div>
                <p className="text-[10px] text-muted-foreground">Agent</p>
                <p className="text-foreground">{policy.agent_name || 'Unassigned'}</p>
                {policy.writing_number && (
                  <p className="text-[10px] text-muted-foreground">#{policy.writing_number}</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Building2 size={14} className="text-muted-foreground shrink-0" />
              <div>
                <p className="text-[10px] text-muted-foreground">Agency</p>
                <p className="text-foreground truncate">{policy.agency_name || policy.agency_id}</p>
              </div>
            </div>
          </div>

          {/* Stage transition buttons */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground mb-2">Move to Stage</p>
            <div className="flex flex-wrap gap-1.5">
              {TRANSITION_TARGETS.map(target => {
                const isCurrent = target === currentStage;
                return (
                  <Button
                    key={target}
                    size="sm"
                    variant={isCurrent ? 'default' : 'outline'}
                    disabled={isCurrent || transitioning !== null}
                    onClick={() => handleTransition(target)}
                    className={`h-7 px-2.5 text-[11px] gap-1 ${
                      isCurrent ? 'opacity-60 cursor-not-allowed' : ''
                    }`}
                  >
                    {transitioning === target ? (
                      <Loader2 size={11} className="animate-spin" />
                    ) : (
                      <ArrowRight size={11} />
                    )}
                    {STAGE_LABELS[target]}
                  </Button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
