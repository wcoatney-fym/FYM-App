/**
 * ContractingOnboardingTab — Agency onboarding (activation) within Contracting.
 *
 * Replaces the standalone OnboardingListPage / OnboardingDetailPage / OnboardingNewPage
 * routes. Uses internal state to switch between list → detail → new views
 * without leaving the Contracting tab context.
 *
 * Data source: `onboarding_agencies` table in rcbzag (FYM App DB).
 */
import { useState } from 'react';
import { OnboardingListView } from './OnboardingListView';
import { OnboardingDetailView } from './OnboardingDetailView';
import { OnboardingNewView } from './OnboardingNewView';

type View =
  | { kind: 'list' }
  | { kind: 'detail'; slug: string }
  | { kind: 'new' };

export function ContractingOnboardingTab() {
  const [view, setView] = useState<View>({ kind: 'list' });

  if (view.kind === 'new') {
    return (
      <OnboardingNewView
        onCreated={(slug) => setView({ kind: 'detail', slug })}
        onCancel={() => setView({ kind: 'list' })}
      />
    );
  }

  if (view.kind === 'detail') {
    return (
      <OnboardingDetailView
        slug={view.slug}
        onBack={() => setView({ kind: 'list' })}
      />
    );
  }

  return (
    <OnboardingListView
      onSelectAgency={(slug) => setView({ kind: 'detail', slug })}
      onNewAgency={() => setView({ kind: 'new' })}
    />
  );
}
