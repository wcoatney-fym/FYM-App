import { Calculator, FileSpreadsheet, ArrowUpRight } from 'lucide-react';
import type { CompTierConfig } from '../../lib/onboarding/compTiers';
import { SectionLabel, Eyebrow } from './primitives';

export default function Tools({ compTier }: { compTier: CompTierConfig }) {
  const hasModeler = !!compTier.financialModelerUrl;

  return (
    <section id="tools" className="relative py-24 md:py-32 px-6 bg-fym-ink overflow-hidden">
      <div className="absolute inset-0 pointer-events-none opacity-[0.03]" style={{ backgroundImage: 'radial-gradient(circle, white 1px, transparent 1px)', backgroundSize: '24px 24px' }} />

      <div className="relative max-w-7xl mx-auto">
        <SectionLabel n="02" label="Tools" variant="dark" />

        <div className="max-w-2xl mb-16">
          <Eyebrow>Daily Operating System</Eyebrow>
          <h2 className="text-4xl md:text-5xl leading-[1.05] tracking-tight text-fym-paper mt-3 font-bold">
            {hasModeler ? (
              <>
                Two links your agents
                <br />
                <span className="italic text-fym-brass">should never lose.</span>
              </>
            ) : (
              <>
                The link your agents
                <br />
                <span className="italic text-fym-brass">should never lose.</span>
              </>
            )}
          </h2>
        </div>

        <div className={`grid ${hasModeler ? 'md:grid-cols-2' : 'md:grid-cols-1 max-w-xl'} gap-6`}>
          {hasModeler && (
            <a
              href={compTier.financialModelerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="group block bg-white/[0.03] border border-white/15 rounded-xl p-8 md:p-10 hover:bg-white/[0.06] hover:border-fym-brass/40 transition-all hover:-translate-y-0.5"
            >
              <div className="flex items-start justify-between mb-12">
                <div className="w-12 h-12 rounded-lg bg-fym-brass/15 border border-fym-brass/30 flex items-center justify-center">
                  <Calculator className="w-5 h-5 text-fym-brass" />
                </div>
                <ArrowUpRight className="w-5 h-5 text-fym-paper/40 group-hover:text-fym-brass group-hover:-translate-y-0.5 group-hover:translate-x-0.5 transition-all" />
              </div>
              <div className="text-2xl text-fym-paper tracking-tight font-semibold">Financial Modeler</div>
              <p className="text-fym-paper/60 text-sm leading-relaxed mt-3 max-w-sm">
                Project agent income from HIP/HHC volume. Use during agent recruiting and quarterly planning.
              </p>
              <div className="mt-8 pt-6 border-t border-white/10">
                <span className="text-[11px] tracking-[0.2em] uppercase text-fym-brass">
                  {hostFromUrl(compTier.financialModelerUrl!)}
                </span>
              </div>
            </a>
          )}

          <a
            href="https://eapp.unlinsurance.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="group block bg-white/[0.03] border border-white/15 rounded-xl p-8 md:p-10 hover:bg-white/[0.06] hover:border-fym-brass/40 transition-all hover:-translate-y-0.5"
          >
            <div className="flex items-start justify-between mb-12">
              <div className="w-12 h-12 rounded-lg bg-fym-brass/15 border border-fym-brass/30 flex items-center justify-center">
                <FileSpreadsheet className="w-5 h-5 text-fym-brass" />
              </div>
              <ArrowUpRight className="w-5 h-5 text-fym-paper/40 group-hover:text-fym-brass group-hover:-translate-y-0.5 group-hover:translate-x-0.5 transition-all" />
            </div>
            <div className="text-2xl text-fym-paper tracking-tight font-semibold">UNL Quote Tool</div>
            <p className="text-fym-paper/60 text-sm leading-relaxed mt-3 max-w-sm">
              Live quoting for HIP, HHC, Dental, Cancer, and FE Life. Every agent should have this bookmarked.
            </p>
            <div className="mt-8 pt-6 border-t border-white/10">
              <span className="text-[11px] tracking-[0.2em] uppercase text-fym-brass">
                eapp.unlinsurance.com
              </span>
            </div>
          </a>
        </div>
      </div>
    </section>
  );
}

function hostFromUrl(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
