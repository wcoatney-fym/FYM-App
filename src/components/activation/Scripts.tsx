import { useState } from 'react';
import { Check, ChevronLeft, ChevronRight, ShieldCheck } from 'lucide-react';
import {
  SCRIPT_SECTIONS,
  COMPLIANCE_CHECKS,
  CHECKLIST_PRECALL,
  CHECKLIST_QUESTIONS,
} from '../../lib/onboarding/data';
import type { ScriptBlock } from '../../lib/onboarding/types';
import { SectionLabel, Eyebrow, H2, H3 } from './primitives';

export default function Scripts() {
  const [activeIdx, setActiveIdx] = useState(0);
  const active = SCRIPT_SECTIONS[activeIdx];

  return (
    <section id="scripts" className="py-24 md:py-32 px-6 bg-fym-paper">
      <div className="max-w-7xl mx-auto">
        <SectionLabel n="03" label="HIP Sales Script & Checklist" />

        <div className="max-w-2xl mb-16">
          <Eyebrow>The One-Call Close</Eyebrow>
          <H2 className="mt-3">Eight beats. Read them in order.</H2>
          <p className="text-fym-muted mt-6 leading-[1.6]">
            This is the script every top-performing agent on the FYM book runs - frame, awareness, reframe,
            tier, choice, application, wrap. Coaching notes are inline.
          </p>
        </div>

        <div className="grid lg:grid-cols-12 gap-10">
          <aside className="lg:col-span-4">
            <div className="lg:sticky lg:top-24 space-y-8">
              <div className="bg-white border border-fym-ink/10 rounded-xl p-6">
                <Eyebrow>Sections</Eyebrow>
                <ol className="mt-4 space-y-1">
                  {SCRIPT_SECTIONS.map((s, i) => {
                    const isActive = i === activeIdx;
                    return (
                      <li key={s.n}>
                        <button
                          onClick={() => setActiveIdx(i)}
                          className={`w-full text-left flex items-start gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                            isActive ? 'bg-fym-ink text-fym-paper' : 'hover:bg-fym-cream2/60 text-fym-ink'
                          }`}
                        >
                          <span
                            className={`text-[11px] tracking-[0.18em] uppercase mt-0.5 tabular-nums ${
                              isActive ? 'text-fym-brass' : 'text-fym-muted'
                            }`}
                          >
                            0{s.n}
                          </span>
                          <span className="text-[13px] leading-snug font-medium">{s.title}</span>
                        </button>
                      </li>
                    );
                  })}
                </ol>
              </div>

              <div className="bg-white border border-fym-ink/10 rounded-xl p-6">
                <div className="flex items-center gap-2 mb-4">
                  <ShieldCheck className="w-4 h-4 text-fym-brass" />
                  <Eyebrow>Compliance Quick Check</Eyebrow>
                </div>
                <ul className="space-y-3">
                  {COMPLIANCE_CHECKS.map((c) => (
                    <li key={c} className="flex items-start gap-3">
                      <Check className="w-4 h-4 text-fym-brass mt-0.5 flex-shrink-0" />
                      <span className="text-[13px] text-fym-ink leading-snug">{c}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </aside>

          <div className="lg:col-span-8">
            <div className="bg-white border border-fym-ink/10 rounded-xl p-8 md:p-12">
              <Eyebrow>
                Section 0{active.n} · {active.subtitle}
              </Eyebrow>
              <H3 className="mt-3">{active.title}</H3>

              <div className="mt-10 space-y-6">
                {active.body.map((b, i) => (
                  <ScriptBlockRender key={i} block={b} />
                ))}
              </div>

              <div className="mt-12 pt-8 border-t border-fym-ink/10 flex items-center justify-between">
                <button
                  onClick={() => setActiveIdx((i) => Math.max(0, i - 1))}
                  disabled={activeIdx === 0}
                  className="inline-flex items-center gap-2 text-[13px] text-fym-ink hover:text-fym-brass transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Previous
                </button>
                <span className="text-[11px] tracking-[0.2em] uppercase text-fym-muted">
                  0{activeIdx + 1} / 0{SCRIPT_SECTIONS.length}
                </span>
                <button
                  onClick={() => setActiveIdx((i) => Math.min(SCRIPT_SECTIONS.length - 1, i + 1))}
                  disabled={activeIdx === SCRIPT_SECTIONS.length - 1}
                  className="inline-flex items-center gap-2 text-[13px] text-fym-ink hover:text-fym-brass transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  Next
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="mt-8 bg-white border border-fym-ink/10 rounded-xl p-8 md:p-12">
              <Eyebrow>UNL Ancillary Call Checklist</Eyebrow>
              <H3 className="mt-3">Pre-call setup & discovery prompts.</H3>

              <div className="mt-10">
                <div className="text-[11px] tracking-[0.2em] uppercase text-fym-brass mb-4">
                  Before you dial
                </div>
                <ul className="space-y-3">
                  {CHECKLIST_PRECALL.map((c, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <span className="text-fym-brass tabular-nums w-6 flex-shrink-0 font-semibold">
                        0{i + 1}
                      </span>
                      <span className="text-[15px] text-fym-ink leading-relaxed">{c}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="mt-10 pt-10 border-t border-fym-ink/10">
                <div className="text-[11px] tracking-[0.2em] uppercase text-fym-brass mb-4">
                  Discovery questions to weave in
                </div>
                <div className="space-y-5">
                  {CHECKLIST_QUESTIONS.map((q) => (
                    <div key={q.letter} className="flex gap-4">
                      <span className="italic text-fym-brass text-lg w-6 flex-shrink-0">
                        {q.letter}.
                      </span>
                      <div className="flex-1">
                        <div className="text-[11px] tracking-[0.18em] uppercase text-fym-muted mb-1.5">
                          {q.label}
                        </div>
                        <p className="text-[14px] text-fym-ink leading-relaxed">{q.text}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function ScriptBlockRender({ block }: { block: ScriptBlock }) {
  if (block.type === 'dialogue') {
    return (
      <p className="italic text-[17px] md:text-[19px] leading-[1.55] text-fym-ink">
        {block.text}
      </p>
    );
  }
  if (block.type === 'stage') {
    return (
      <div className="flex items-center gap-3">
        <div className="w-8 h-px bg-fym-brass/60" />
        <span className="text-[11px] tracking-[0.2em] uppercase text-fym-muted">
          {block.text}
        </span>
      </div>
    );
  }
  if (block.type === 'coaching') {
    return (
      <div
        className="border-l-[3px] border-fym-brass pl-5 py-3 pr-4 rounded-r"
        style={{ background: 'rgba(182, 139, 60, 0.08)' }}
      >
        <div className="text-[10px] tracking-[0.22em] uppercase text-fym-brass font-semibold mb-1.5">
          Coaching Note
        </div>
        <p className="text-[14px] text-fym-ink leading-relaxed">{block.text}</p>
      </div>
    );
  }
  return (
    <div className="border border-fym-ink/15 rounded-lg p-5">
      <div className="text-[10px] tracking-[0.24em] uppercase text-fym-brass font-semibold mb-2">
        {block.label}
      </div>
      <p className="italic text-[16px] leading-[1.55] text-fym-ink">{block.text}</p>
    </div>
  );
}
