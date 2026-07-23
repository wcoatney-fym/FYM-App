import { Mail, ArrowRight } from 'lucide-react';
import type { VariantConfig } from '../../lib/onboarding/variants';
import { Eyebrow } from './primitives';

export default function Footer({ variant }: { variant: VariantConfig }) {
  const referralHref = `mailto:${variant.contacts[0].email}?subject=${encodeURIComponent('Referral - Agency Principal')}`;
  return (
    <footer className="bg-fym-ink text-fym-paper py-20 md:py-24 px-6 relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none opacity-[0.03]" style={{ backgroundImage: 'radial-gradient(circle, white 1px, transparent 1px)', backgroundSize: '24px 24px' }} />

      <div className="relative max-w-7xl mx-auto">
        <div className="grid lg:grid-cols-12 gap-12 mb-16">
          <div className="lg:col-span-7">
            <Eyebrow className="!text-fym-brass">About FYM Financial</Eyebrow>
            <h3 className="text-3xl md:text-4xl tracking-tight leading-[1.1] mt-4 max-w-xl font-bold">
              A boutique FMO built for agencies that care about the
              <span className="italic text-fym-brass"> off-season too.</span>
            </h3>
            <p className="text-fym-paper/70 leading-relaxed mt-6 max-w-xl">
              We focus on Hospital Indemnity, Home Healthcare, and ancillary protection for the Medicare-age
              population - so your agency can produce twelve months a year, not just AEP.
            </p>
          </div>

          <div className="lg:col-span-5 lg:pl-8 lg:border-l border-white/10">
            <Eyebrow className="!text-fym-brass">Know an Agency Principal?</Eyebrow>
            <p className="text-fym-paper/70 leading-relaxed mt-4">
              Refer a peer who runs a Medicare agency. We&apos;ll handle the rest - and you&apos;ll know
              they&apos;re in good hands.
            </p>
            <a
              href={referralHref}
              className="inline-flex items-center gap-2 mt-6 px-5 py-3 bg-fym-brass text-fym-ink rounded text-[13px] font-medium tracking-wide hover:bg-fym-paper transition-colors"
            >
              <Mail className="w-4 h-4" />
              Send a referral
              <ArrowRight className="w-4 h-4" />
            </a>
          </div>
        </div>

        <div className="pt-8 border-t border-white/10 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="text-[12px] text-fym-paper/40 tracking-wide">
            © {new Date().getFullYear()} FYM Financial · Confidential Partner Edition
          </div>
          <div className="text-[10px] tracking-[0.2em] uppercase text-fym-paper/40">
            Not for redistribution
          </div>
        </div>
      </div>
    </footer>
  );
}
