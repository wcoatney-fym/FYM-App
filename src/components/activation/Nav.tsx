import { useEffect, useState } from 'react';
import { Mail } from 'lucide-react';
import type { VariantConfig } from '../../lib/onboarding/variants';

const SECTIONS = [
  { id: 'roadmap', label: 'Roadmap' },
  { id: 'tools', label: 'Tools' },
  { id: 'scripts', label: 'Scripts' },
  { id: 'sample-calls', label: 'Sample Calls' },
  { id: 'states', label: 'States' },
  { id: 'calendar', label: 'Training' },
  { id: 'reporting', label: 'Reporting' },
  { id: 'contacts', label: 'Contacts' },
  { id: 'downloads', label: 'Files' },
];

export default function Nav({ agencyName, variant }: { agencyName?: string; variant: VariantConfig }) {
  const primaryContact = variant.contacts[0];
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const jump = (id: string) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <nav
      className={`sticky top-0 z-50 transition-all duration-300 ${
        scrolled ? 'bg-fym-paper/95 backdrop-blur-md border-b border-fym-ink/10' : 'bg-fym-paper'
      }`}
    >
      <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between gap-6">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 bg-fym-ink rounded flex items-center justify-center flex-shrink-0">
            <span className="text-fym-brass text-sm tracking-tight font-bold">F</span>
          </div>
          <div className="min-w-0">
            <div className="text-fym-ink text-sm tracking-tight leading-none truncate font-semibold">
              FYM Financial
            </div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-fym-muted mt-1 truncate">
              {agencyName ? `${agencyName} · Activation Hub` : 'Partner Activation Hub'}
            </div>
          </div>
        </div>

        <div className="hidden lg:flex items-center gap-1">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              onClick={() => jump(s.id)}
              className="text-[12px] tracking-wide text-fym-muted hover:text-fym-ink px-3 py-2 transition-colors"
            >
              {s.label}
            </button>
          ))}
        </div>

        <a
          href={`mailto:${primaryContact.email}`}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-fym-ink text-fym-paper rounded text-[12px] font-medium tracking-wide hover:bg-fym-rule transition-colors flex-shrink-0"
        >
          <Mail className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Contact {variant.primaryFirstName}</span>
        </a>
      </div>
    </nav>
  );
}
