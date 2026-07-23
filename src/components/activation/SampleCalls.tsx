import { SAMPLE_CALLS } from '../../lib/onboarding/data';
import { SectionLabel, Eyebrow, H2, H3 } from './primitives';

export default function SampleCalls() {
  return (
    <section id="sample-calls" className="py-24 md:py-32 px-6 bg-fym-paper">
      <div className="max-w-7xl mx-auto">
        <SectionLabel n="04" label="Hear It Done Right" />

        <div className="max-w-2xl mb-16">
          <Eyebrow>Top Performer Recordings</Eyebrow>
          <H2 className="mt-3">Hear it done right.</H2>
          <p className="text-fym-muted mt-6 leading-[1.6]">
            Four real calls from top-producing agents. The script comes alive when you hear it land.
            Listen on commute, between appointments, or alongside your team.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {SAMPLE_CALLS.map((call) => (
            <div
              key={call.id}
              className="group bg-fym-cream2/50 border border-fym-ink/10 rounded-xl p-8 md:p-10 hover:border-fym-brass/40 transition-colors"
            >
              <Eyebrow>{call.subtitle}</Eyebrow>
              <H3 className="mt-3">{call.title}</H3>
              <p className="text-fym-muted text-sm leading-relaxed mt-4">
                {call.takeaway}
              </p>
              <div className="mt-6 pt-6 border-t border-fym-brass/30">
                <audio
                  controls
                  preload="metadata"
                  className="w-full"
                  src={`/activation/files/${call.filename}`}
                >
                  Your browser does not support the audio element.
                </audio>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
