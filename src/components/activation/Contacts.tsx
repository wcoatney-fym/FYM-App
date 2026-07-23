import { Mail, Phone, User } from 'lucide-react';
import { CONTACTS } from '../../lib/onboarding/data';
import type { VariantConfig } from '../../lib/onboarding/variants';
import { SectionLabel, Eyebrow, H2 } from './primitives';

interface Props {
  variant: VariantConfig;
}

export default function Contacts({ variant }: Props) {
  const primary = variant.contacts;
  const rest = CONTACTS;

  const introCopy = `${variant.primaryFirstName} and ${variant.secondaryFirstName} are your primary contacts. Everyone else gets stood up at kickoff so you know exactly who handles what.`;

  return (
    <section id="contacts" className="py-24 md:py-32 px-6 bg-fym-paper">
      <div className="max-w-7xl mx-auto">
        <SectionLabel n="08" label="Your Team" />

        <div className="grid lg:grid-cols-12 gap-10 mb-16">
          <div className="lg:col-span-7">
            <Eyebrow>People to Know</Eyebrow>
            <H2 className="mt-3">Your direct line into FYM.</H2>
            <p className="text-fym-muted mt-6 leading-[1.6] max-w-xl">
              {introCopy}
            </p>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-6 mb-12">
          {primary.map((c) => (
            <div
              key={c.email}
              className="bg-fym-ink rounded-xl p-8 md:p-10 hover:-translate-y-0.5 transition-transform"
            >
              <Eyebrow className="!text-fym-brass">{c.title}</Eyebrow>
              <div className="mt-5 flex items-center gap-5">
                <div className="w-14 h-14 rounded-full bg-fym-brass/15 border border-fym-brass/30 flex items-center justify-center flex-shrink-0">
                  <User className="w-6 h-6 text-fym-brass" />
                </div>
                <div>
                  <div className="text-2xl text-fym-paper tracking-tight font-semibold">{c.name}</div>
                  <div className="text-[13px] text-fym-paper/60 mt-1">{c.description}</div>
                </div>
              </div>
              <div className="mt-8 pt-6 border-t border-white/10 space-y-2">
                <a
                  href={`mailto:${c.email}`}
                  className="inline-flex items-center gap-2 text-[13px] text-fym-brass hover:text-fym-paper transition-colors"
                >
                  <Mail className="w-4 h-4" />
                  {c.email}
                </a>
                {c.phone && (
                  <a
                    href={`tel:${c.phone.replace(/\D/g, '')}`}
                    className="flex items-center gap-2 text-[13px] text-fym-paper/70 hover:text-fym-brass transition-colors"
                  >
                    <Phone className="w-4 h-4" />
                    {c.phone}
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {rest.map((c, i) => (
            <div
              key={`${c.role}-${i}`}
              className="bg-white border border-fym-ink/10 rounded-xl p-6 hover:border-fym-ink/20 transition-colors"
            >
              <Eyebrow>{c.role}</Eyebrow>
              <div className="text-lg text-fym-ink tracking-tight mt-3 font-semibold">{c.name}</div>
              <div className="mt-4 space-y-1.5">
                {c.email && (
                  <a
                    href={`mailto:${c.email}`}
                    className="flex items-center gap-2 text-[12px] text-fym-muted hover:text-fym-brass transition-colors"
                  >
                    <Mail className="w-3.5 h-3.5" />
                    <span className="truncate">{c.email}</span>
                  </a>
                )}
                {c.phone && (
                  <a
                    href={`tel:${c.phone.replace(/\D/g, '')}`}
                    className="flex items-center gap-2 text-[12px] text-fym-muted hover:text-fym-brass transition-colors"
                  >
                    <Phone className="w-3.5 h-3.5" />
                    {c.phone}
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
