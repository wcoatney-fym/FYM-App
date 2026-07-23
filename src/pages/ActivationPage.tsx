import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { fetchOnboardingAgency, recordVisit, type OnboardingAgency } from '@/lib/onboarding/storage';
import { resolveVariant } from '@/lib/onboarding/variants';
import { resolveCompTier } from '@/lib/onboarding/compTiers';
import Hero from '@/components/activation/Hero';
import Nav from '@/components/activation/Nav';
import Roadmap from '@/components/activation/Roadmap';
import Tools from '@/components/activation/Tools';
import Scripts from '@/components/activation/Scripts';
import SampleCalls from '@/components/activation/SampleCalls';
import StateLookup from '@/components/activation/StateLookup';
import TrainingCalendar from '@/components/activation/TrainingCalendar';
import SampleReporting from '@/components/activation/SampleReporting';
import Contacts from '@/components/activation/Contacts';
import Downloads from '@/components/activation/Downloads';
import Footer from '@/components/activation/Footer';

type PageState =
  | { kind: 'loading' }
  | { kind: 'not_found' }
  | { kind: 'inactive'; agencyName: string }
  | { kind: 'ready'; agency: OnboardingAgency };

export function ActivationPage() {
  const { slug } = useParams<{ slug: string }>();
  const [state, setState] = useState<PageState>({ kind: 'loading' });

  useEffect(() => {
    if (!slug) {
      setState({ kind: 'not_found' });
      return;
    }

    let cancelled = false;

    async function load() {
      const agency = await fetchOnboardingAgency(slug!);
      if (cancelled) return;

      if (!agency) {
        setState({ kind: 'not_found' });
        return;
      }

      if (!agency.active) {
        setState({ kind: 'inactive', agencyName: agency.agency_name });
        return;
      }

      setState({ kind: 'ready', agency });

      // Fire-and-forget visit recording
      recordVisit(slug!).catch(() => {});
    }

    load();
    return () => { cancelled = true; };
  }, [slug]);

  if (state.kind === 'loading') {
    return (
      <div className="min-h-screen bg-fym-paper flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 bg-fym-ink rounded-lg flex items-center justify-center mx-auto mb-4">
            <span className="text-fym-brass text-xl font-bold">F</span>
          </div>
          <p className="text-fym-muted text-sm tracking-wide">Loading your activation hub...</p>
        </div>
      </div>
    );
  }

  if (state.kind === 'not_found') {
    return (
      <div className="min-h-screen bg-fym-paper flex items-center justify-center px-6">
        <div className="text-center max-w-md">
          <div className="w-12 h-12 bg-fym-ink rounded-lg flex items-center justify-center mx-auto mb-6">
            <span className="text-fym-brass text-xl font-bold">F</span>
          </div>
          <h1 className="text-2xl text-fym-ink tracking-tight font-bold">Hub not found</h1>
          <p className="text-fym-muted mt-3 leading-relaxed">
            This activation link doesn&apos;t match any partner hub. If you received this link from your
            FYM contact, please reach out to confirm the URL.
          </p>
        </div>
      </div>
    );
  }

  if (state.kind === 'inactive') {
    return (
      <div className="min-h-screen bg-fym-paper flex items-center justify-center px-6">
        <div className="text-center max-w-md">
          <div className="w-12 h-12 bg-fym-ink rounded-lg flex items-center justify-center mx-auto mb-6">
            <span className="text-fym-brass text-xl font-bold">F</span>
          </div>
          <h1 className="text-2xl text-fym-ink tracking-tight font-bold">Hub closed</h1>
          <p className="text-fym-muted mt-3 leading-relaxed">
            The activation hub for {state.agencyName} has been closed. If you believe this is an error,
            contact your FYM partnership manager.
          </p>
        </div>
      </div>
    );
  }

  const { agency } = state;
  const variant = resolveVariant(agency.variant);
  const compTier = resolveCompTier(agency.comp_tier);

  return (
    <div className="min-h-screen bg-fym-paper">
      <Nav agencyName={agency.agency_name} variant={variant} />
      <Hero agencyName={agency.agency_name} principalName={agency.principal_name} />
      <Roadmap
        slug={agency.slug}
        agencyName={agency.agency_name}
        initialProgress={agency.roadmap_progress}
        variant={variant}
        compTier={compTier}
      />
      <Tools compTier={compTier} />
      <Scripts />
      <SampleCalls />
      <StateLookup />
      <TrainingCalendar variant={variant} />
      <SampleReporting variant={variant} agencyName={agency.agency_name} />
      <Contacts variant={variant} />
      <Downloads />
      <Footer variant={variant} />
    </div>
  );
}
