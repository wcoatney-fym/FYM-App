/**
 * ContractingCoachingTab — Coaching embedded inside the Contracting page.
 *
 * Renders CoachingPage / CoachingPipelinePage in embedded mode (no Header,
 * no standalone sub-nav). Internal sub-tabs toggle between the two views.
 *
 * Added 2026-08-27 per Charlie: contracting + training + coaching teams
 * work closely — minimize back-and-forth by co-locating.
 */
import { useState } from 'react';
import { HeartPulse, Zap } from 'lucide-react';
import { CoachingPage } from '@/pages/CoachingPage';
import { CoachingPipelinePage } from '@/pages/CoachingPipelinePage';

type CoachingSubTab = 'policy-pipeline' | 'agent-coaching';

export function ContractingCoachingTab() {
  const [subTab, setSubTab] = useState<CoachingSubTab>('policy-pipeline');

  return (
    <div className="space-y-4">
      {/* Sub-navigation */}
      <div className="flex gap-1 border-b border-border">
        <button
          onClick={() => setSubTab('policy-pipeline')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
            subTab === 'policy-pipeline'
              ? 'border-primary text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <HeartPulse size={13} />
          Policy Pipeline
        </button>
        <button
          onClick={() => setSubTab('agent-coaching')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
            subTab === 'agent-coaching'
              ? 'border-primary text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <Zap size={13} />
          Agent Coaching
        </button>
      </div>

      {/* Content — embedded mode strips Header + standalone sub-nav */}
      {subTab === 'policy-pipeline' ? (
        <CoachingPage embedded />
      ) : (
        <CoachingPipelinePage embedded />
      )}
    </div>
  );
}
