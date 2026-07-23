import { Eyebrow } from './primitives';

interface HeroProps {
  agencyName?: string;
  principalName?: string | null;
}

export default function Hero({ agencyName, principalName }: HeroProps) {
  return (
    <section className="relative bg-fym-ink overflow-hidden">
      <div className="absolute inset-0 pointer-events-none opacity-[0.03]" style={{ backgroundImage: 'radial-gradient(circle, white 1px, transparent 1px)', backgroundSize: '24px 24px' }} />
      <div className="absolute inset-y-0 left-1/2 w-px bg-white/5 hidden lg:block" style={{ left: '64%' }} />

      <div className="relative max-w-7xl mx-auto px-6 py-24 md:py-32 lg:py-40">
        <div className="grid lg:grid-cols-12 gap-16 items-end">
          <div className="lg:col-span-8">
            <Eyebrow className="text-fym-brass">
              {agencyName ? `Confidential · ${agencyName}` : 'Confidential · Partner Edition'}
            </Eyebrow>
            <h1 className="text-[42px] sm:text-5xl md:text-6xl lg:text-[72px] leading-[1.02] tracking-tight text-fym-paper mt-6 font-bold">
              {principalName ? `Welcome, ${principalName.split(' ')[0]}.` : "You're in."}
              <br />
              <span className="italic text-fym-brass">
                Here&apos;s your launch.
              </span>
            </h1>
            <p className="text-base md:text-lg text-fym-paper/70 mt-8 max-w-xl leading-relaxed">
              A working hub for your first thirty days as an FYM partner. Track activation, look up product
              availability, reference the script, and reach your team. Bookmark this page.
            </p>
          </div>

          <div className="lg:col-span-4">
            <div className="grid grid-cols-3 lg:grid-cols-1 lg:divide-y lg:divide-white/10 divide-x lg:divide-x-0">
              <Stat value="30" unit="days" label="To full activation" />
              <Stat value="36" unit="states" label="Available footprint" />
              <Stat value="6" unit="products" label="Shield Series + FE" />
            </div>
          </div>
        </div>
      </div>

      <div className="relative h-px bg-gradient-to-r from-transparent via-fym-brass/40 to-transparent" />
    </section>
  );
}

function Stat({ value, unit, label }: { value: string; unit: string; label: string }) {
  return (
    <div className="px-4 lg:px-0 lg:py-6 first:pl-0 lg:first:pt-0 last:pr-0 lg:last:pb-0">
      <div className="flex items-baseline gap-2">
        <span className="text-4xl md:text-5xl text-fym-paper tracking-tight font-bold">{value}</span>
        <span className="text-[11px] tracking-[0.2em] uppercase text-fym-brass">{unit}</span>
      </div>
      <div className="text-xs text-fym-paper/50 mt-2 tracking-wide">{label}</div>
    </div>
  );
}
