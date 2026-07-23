import { useMemo, useState } from 'react';
import { Lock, Check, ChevronDown } from 'lucide-react';
import { STATES_DATA, PRODUCT_META } from '../../lib/onboarding/data';
import { SectionLabel, Eyebrow, H2 } from './primitives';

export default function StateLookup() {
  const [stateCode, setStateCode] = useState('KS');

  const sortedStates = useMemo(
    () =>
      Object.entries(STATES_DATA)
        .sort(([, a], [, b]) => a.name.localeCompare(b.name))
        .map(([code, data]) => ({ code, name: data.name })),
    []
  );

  const current = STATES_DATA[stateCode];

  return (
    <section id="states" className="py-24 md:py-32 px-6 bg-fym-cream2/40">
      <div className="max-w-7xl mx-auto">
        <SectionLabel n="05" label="State Availability" />

        <div className="grid lg:grid-cols-12 gap-10 mb-12">
          <div className="lg:col-span-7">
            <Eyebrow>Shield Series · 36 States</Eyebrow>
            <H2 className="mt-3">What you can sell, where.</H2>
            <p className="text-fym-muted mt-6 leading-[1.6] max-w-xl">
              The full Shield Series footprint, by product. Filter by state before each agent rollout to
              confirm what&apos;s available - especially for Florida, where HIP just unlocked.
            </p>
          </div>

          <div className="lg:col-span-5 flex lg:items-end">
            <label className="block w-full">
              <Eyebrow>Choose a state</Eyebrow>
              <div className="relative mt-3">
                <select
                  value={stateCode}
                  onChange={(e) => setStateCode(e.target.value)}
                  className="w-full appearance-none bg-white border border-fym-ink/15 rounded-lg pl-5 pr-12 py-4 text-2xl tracking-tight text-fym-ink focus:outline-none focus:border-fym-brass transition-colors cursor-pointer font-semibold"
                >
                  {sortedStates.map((s) => (
                    <option key={s.code} value={s.code}>
                      {s.name}
                    </option>
                  ))}
                </select>
                <ChevronDown className="w-5 h-5 text-fym-muted absolute right-5 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </label>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {PRODUCT_META.map((p) => {
            const status = current.products[p.key];
            const isAvailable = status === 'yes' || status === 'new';
            const isNew = status === 'new';
            return (
              <div
                key={p.key}
                className={`relative rounded-xl p-6 transition-all ${
                  isAvailable
                    ? 'bg-white border-2 border-fym-brass/30'
                    : 'bg-white/40 border border-fym-ink/10 opacity-50'
                }`}
              >
                {isNew && (
                  <span className="absolute top-4 right-4 inline-flex items-center px-2 py-0.5 rounded bg-fym-brass text-fym-paper text-[10px] tracking-[0.18em] uppercase font-semibold">
                    New
                  </span>
                )}

                <div className="flex items-start justify-between mb-4">
                  <div>
                    <div className="text-xl text-fym-ink tracking-tight font-semibold">{p.name}</div>
                    <div className="text-[11px] tracking-[0.18em] uppercase text-fym-muted mt-1">
                      {p.ageBand}
                    </div>
                  </div>
                  {!isAvailable && <Lock className="w-4 h-4 text-fym-muted/60 mt-1" />}
                </div>

                <p className="text-[13px] text-fym-muted leading-relaxed mb-5 min-h-[40px]">
                  {p.desc}
                </p>

                <div className="pt-4 border-t border-fym-ink/10">
                  {isAvailable ? (
                    <div className="flex items-center gap-2 text-[12px] text-fym-brass font-medium">
                      <Check className="w-4 h-4" />
                      Available in {current.name}
                    </div>
                  ) : (
                    <div className="text-[12px] text-fym-muted">
                      — Not available in {current.name}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
