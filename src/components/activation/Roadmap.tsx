import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Circle, CheckCircle2, Check, Loader2 } from 'lucide-react';
import { ROADMAP_DATA } from '../../lib/onboarding/data';
import { updateRoadmapProgress, type RoadmapProgress } from '../../lib/onboarding/storage';
import { applyVariant, type VariantConfig } from '../../lib/onboarding/variants';
import type { CompTierConfig } from '../../lib/onboarding/compTiers';
import { SectionLabel, Eyebrow, H2, TaskCTA } from './primitives';
import type { RoadmapCTA } from '../../lib/onboarding/types';

interface Props {
  slug: string;
  agencyName: string;
  initialProgress: RoadmapProgress;
  variant: VariantConfig;
  compTier: CompTierConfig;
}

type SaveStatus = 'idle' | 'saving' | 'saved';

export default function Roadmap({ slug, agencyName, initialProgress, variant, compTier }: Props) {
  const resolveCta = (id: string, cta: RoadmapCTA | undefined): RoadmapCTA | undefined => {
    if (!cta) return cta;
    if (id === 'w1-4' && cta.type === 'link') {
      return { ...cta, url: compTier.financialModelerUrl ?? '' };
    }
    if (cta.type === 'email') {
      return { ...cta, to: applyVariant(cta.to, variant) };
    }
    return cta;
  };
  const [progress, setProgress] = useState<RoadmapProgress>(initialProgress);
  const [openWeek, setOpenWeek] = useState<number>(1);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (idleTimer.current) clearTimeout(idleTimer.current);
    };
  }, []);

  const isHidden = (id: string) => variant.roadmapOverrides?.[id]?.hidden === true;

  const isWeekHidden = (week: number) =>
    variant.weekOverrides?.[`w${week}`]?.hidden === true;

  const visibleWeeks = useMemo(
    () =>
      ROADMAP_DATA.filter((w) => !isWeekHidden(w.week)).map((w) => ({
        ...w,
        tasks: w.tasks.filter((t) => !isHidden(t.id)),
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [variant],
  );

  const totals = useMemo(() => {
    const all = visibleWeeks.flatMap((w) => w.tasks);
    const completed = all.filter((t) => progress[t.id]).length;
    return { completed, total: all.length, pct: all.length ? Math.round((completed / all.length) * 100) : 0 };
  }, [progress, visibleWeeks]);

  const toggle = (id: string) => {
    setProgress((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      setSaveStatus('saving');
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (idleTimer.current) clearTimeout(idleTimer.current);
      saveTimer.current = setTimeout(async () => {
        await updateRoadmapProgress(slug, next);
        setSaveStatus('saved');
        idleTimer.current = setTimeout(() => setSaveStatus('idle'), 1500);
      }, 300);
      return next;
    });
  };

  return (
    <section id="roadmap" className="py-24 md:py-32 px-6 bg-fym-paper">
      <div className="max-w-7xl mx-auto">
        <SectionLabel n="01" label="The First 30 Days" />

        <div className="grid lg:grid-cols-12 gap-12 mb-16">
          <div className="lg:col-span-7">
            <Eyebrow>Activation Roadmap</Eyebrow>
            <H2 className="mt-3">A four-week prescription, written in order.</H2>
            <p className="text-fym-muted mt-6 leading-[1.6] max-w-xl">
              Every task here is part of the path from contract to consistent revenue. Check them off as you
              go - your progress saves automatically and syncs across devices.
            </p>
          </div>

          <div className="lg:col-span-5 lg:pl-8 lg:border-l border-fym-ink/10">
            <div className="flex items-center justify-between">
              <Eyebrow>Overall Progress</Eyebrow>
              <SaveIndicator status={saveStatus} />
            </div>
            <div className="mt-3 flex items-baseline gap-3">
              <span className="text-6xl text-fym-ink tracking-tight font-bold">{totals.pct}%</span>
              <span className="text-sm text-fym-muted">
                {totals.completed} of {totals.total} tasks complete
              </span>
            </div>
            <div className="mt-4 h-1.5 bg-fym-ink/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-fym-brass transition-all duration-500"
                style={{ width: `${totals.pct}%` }}
              />
            </div>
          </div>
        </div>

        <div className="space-y-3">
          {visibleWeeks.map((week, idx) => {
            const displayNum = idx + 1;
            const isOpen = openWeek === week.week;
            const weekDone = week.tasks.filter((t) => progress[t.id]).length;
            return (
              <div
                key={week.week}
                className="bg-white border border-fym-ink/10 rounded-xl overflow-hidden hover:border-fym-ink/20 transition-colors"
              >
                <button
                  onClick={() => setOpenWeek(isOpen ? -1 : week.week)}
                  className="w-full flex items-center gap-6 p-6 md:p-8 text-left"
                >
                  <div className="text-3xl text-fym-brass tracking-tight w-16 flex-shrink-0 font-bold">
                    0{displayNum}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] tracking-[0.2em] uppercase text-fym-muted">
                      Week {displayNum}
                    </div>
                    <div className="text-xl md:text-2xl text-fym-ink tracking-tight mt-1 font-semibold">
                      {week.title}
                    </div>
                    <div className="text-sm text-fym-muted mt-2 hidden md:block">{week.summary}</div>
                  </div>
                  <div className="flex items-center gap-4 flex-shrink-0">
                    <div className="text-sm text-fym-muted tabular-nums">
                      <span className="text-fym-ink font-medium">{weekDone}</span>
                      <span className="text-fym-muted/60"> / {week.tasks.length}</span>
                    </div>
                    <ChevronDown
                      className={`w-5 h-5 text-fym-muted transition-transform ${isOpen ? 'rotate-180' : ''}`}
                    />
                  </div>
                </button>

                {isOpen && (
                  <div className="border-t border-fym-ink/10 px-6 md:px-8 py-6 space-y-2">
                    {week.tasks.map((task) => {
                      const done = !!progress[task.id];
                      const override = variant.roadmapOverrides?.[task.id];
                      const displayLabel = applyVariant(override?.title ?? task.label, variant);
                      let overrideCta: RoadmapCTA | undefined;
                      if (override?.action?.type === 'mailto') {
                        const recipient =
                          override.action.to === 'secondary'
                            ? variant.contacts[1].email
                            : variant.contacts[0].email;
                        const subject = override.action.subjectTemplate.replace(
                          /\{agency_name\}/g,
                          agencyName,
                        );
                        overrideCta = { type: 'email', to: recipient, subject };
                      }
                      const effectiveCta = overrideCta ?? (task.cta ? resolveCta(task.id, task.cta) : undefined);
                      return (
                        <div
                          key={task.id}
                          className="group flex items-start gap-4 p-4 -mx-2 rounded-lg hover:bg-fym-cream2/40 transition-colors"
                        >
                          <button
                            onClick={() => toggle(task.id)}
                            className="flex-shrink-0 mt-0.5"
                            aria-label={done ? 'Mark incomplete' : 'Mark complete'}
                          >
                            {done ? (
                              <CheckCircle2 className="w-5 h-5 text-fym-brass" />
                            ) : (
                              <Circle className="w-5 h-5 text-fym-ink/30 group-hover:text-fym-ink/60 transition-colors" />
                            )}
                          </button>
                          <div className="flex-1 min-w-0">
                            <p
                              className={`text-[15px] leading-relaxed ${
                                done ? 'text-fym-muted line-through' : 'text-fym-ink'
                              }`}
                            >
                              {displayLabel}
                            </p>
                            {effectiveCta && (
                              <div className="mt-2">
                                <TaskCTA cta={effectiveCta} />
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function SaveIndicator({ status }: { status: SaveStatus }) {
  if (status === 'idle') return null;
  if (status === 'saving') {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] text-fym-muted">
        <Loader2 className="w-3 h-3 animate-spin" />
        Saving...
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-fym-brass transition-opacity">
      <Check className="w-3 h-3" />
      Saved
    </span>
  );
}
