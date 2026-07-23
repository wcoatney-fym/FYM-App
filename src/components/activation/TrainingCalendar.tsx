import { CalendarPlus, Mail, Clock, Users, Video } from 'lucide-react';
import { TRAINING_SESSIONS } from '../../lib/onboarding/data';
import { applyVariant, type VariantConfig } from '../../lib/onboarding/variants';
import type { DayOfWeek } from '../../lib/onboarding/types';
import { SectionLabel, Eyebrow, H2 } from './primitives';

const DOW_TO_JS_DAY: Record<DayOfWeek, number> = {
  SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6,
};

function nextOccurrenceCT(dow: DayOfWeek): { date: string } {
  const target = DOW_TO_JS_DAY[dow];
  const now = new Date();
  const ctParts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short',
  }).formatToParts(now);
  const get = (t: string) => ctParts.find((p) => p.type === t)?.value ?? '';
  const wkMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const todayDow = wkMap[get('weekday')];
  let delta = (target - todayDow + 7) % 7;
  if (delta === 0) delta = 7;
  const y = parseInt(get('year'), 10);
  const m = parseInt(get('month'), 10);
  const d = parseInt(get('day'), 10);
  const base = new Date(Date.UTC(y, m - 1, d));
  base.setUTCDate(base.getUTCDate() + delta);
  const yyyy = base.getUTCFullYear();
  const mm = String(base.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(base.getUTCDate()).padStart(2, '0');
  return { date: `${yyyy}${mm}${dd}` };
}

function buildGcalUrl(title: string, desc: string, dayOfWeek: DayOfWeek, meetingUrl?: string): string {
  const fullDesc = meetingUrl ? `${desc}\n\nJoin: ${meetingUrl}` : desc;
  const { date } = nextOccurrenceCT(dayOfWeek);
  const dates = `${date}T120000/${date}T130000`;
  const recur = `RRULE:FREQ=WEEKLY;BYDAY=${dayOfWeek}`;
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: title,
    details: fullDesc,
    dates,
    ctz: 'America/Chicago',
    recur,
    ...(meetingUrl ? { location: meetingUrl } : {}),
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export default function TrainingCalendar({ variant }: { variant: VariantConfig }) {
  return (
    <section id="calendar" className="py-24 md:py-32 px-6 bg-fym-paper">
      <div className="max-w-7xl mx-auto">
        <SectionLabel n="06" label="Training Calendar" />

        <div className="grid lg:grid-cols-12 gap-10 mb-16">
          <div className="lg:col-span-7">
            <Eyebrow>Live Sessions</Eyebrow>
            <H2 className="mt-3">Three weekly trainings, plus your principal check-in.</H2>
            <p className="text-fym-muted mt-6 leading-[1.6] max-w-xl">
              Recurring agent-facing trainings and your private weekly with {variant.primaryFirstName}. Add them
              to your team&apos;s calendar in one click.
            </p>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {TRAINING_SESSIONS.map((s) => {
            const title = applyVariant(s.title, variant);
            const desc = applyVariant(s.desc, variant);
            return (
            <div
              key={s.title}
              className="bg-white border border-fym-ink/10 rounded-xl p-8 hover:border-fym-ink/20 hover:-translate-y-0.5 transition-all"
            >
              <div className="flex items-start justify-between mb-6">
                <Eyebrow>{s.audience}</Eyebrow>
                <Users className="w-4 h-4 text-fym-muted" />
              </div>
              <div className="text-2xl text-fym-ink tracking-tight font-semibold">{title}</div>
              <p className="text-[14px] text-fym-muted leading-relaxed mt-3">{desc}</p>

              <div className="mt-8 pt-6 border-t border-fym-ink/10 flex items-center gap-6 text-fym-ink">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-fym-brass" />
                  <span className="text-[13px]">{s.day}</span>
                </div>
                <span className="text-[13px] text-fym-muted">{s.time}</span>
              </div>

              <div className="mt-6 flex flex-wrap items-center gap-3">
                {s.cta ? (
                  <a
                    href={`mailto:${applyVariant(s.cta.to, variant)}?subject=${encodeURIComponent(s.cta.subject)}`}
                    className="inline-flex items-center gap-2 px-4 py-2.5 bg-fym-ink text-fym-paper rounded text-[12px] font-medium tracking-wide hover:bg-fym-rule transition-colors"
                  >
                    <Mail className="w-3.5 h-3.5" />
                    Email to schedule
                  </a>
                ) : (
                  <>
                    {s.meetingUrl && (
                      <a
                        href={s.meetingUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 px-4 py-2.5 bg-fym-ink text-fym-paper rounded text-[12px] font-medium tracking-wide hover:bg-fym-rule transition-colors"
                      >
                        <Video className="w-3.5 h-3.5" />
                        Join Google Meet
                      </a>
                    )}
                    {s.dayOfWeek && (
                      <a
                        href={buildGcalUrl(title, desc, s.dayOfWeek, s.meetingUrl)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 px-4 py-2.5 border border-fym-ink/15 text-fym-ink rounded text-[12px] font-medium tracking-wide hover:border-fym-ink/40 transition-colors"
                      >
                        <CalendarPlus className="w-3.5 h-3.5" />
                        Add to Calendar
                      </a>
                    )}
                  </>
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
