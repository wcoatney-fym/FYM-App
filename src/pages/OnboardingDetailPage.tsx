import { useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Circle, CheckCircle2, ExternalLink, Mail, Copy, Check, Pencil } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import {
  fetchOnboardingAgency,
  updateOnboardingAgency,
  relativeTime,
  type OnboardingAgency,
} from '@/lib/onboarding/storage';
import { ROADMAP_DATA } from '@/lib/onboarding/data';
import { resolveVariant, VARIANT_CONFIGS, type AgencyVariant } from '@/lib/onboarding/variants';
import { resolveCompTier, COMP_TIER_CONFIGS, type CompTier } from '@/lib/onboarding/compTiers';

export function OnboardingDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const [agency, setAgency] = useState<OnboardingAgency | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!slug) return;
    fetchOnboardingAgency(slug).then((a) => {
      setAgency(a);
      setLoading(false);
    });
  }, [slug]);

  const visibleWeeks = useMemo(() => {
    const variant = resolveVariant(agency?.variant);
    const isTaskHidden = (id: string) => variant.roadmapOverrides?.[id]?.hidden === true;
    const isWeekHidden = (w: number) => variant.weekOverrides?.[`w${w}`]?.hidden === true;
    return ROADMAP_DATA.filter((w) => !isWeekHidden(w.week)).map((w) => ({
      ...w,
      tasks: w.tasks.filter((t) => !isTaskHidden(t.id)),
    }));
  }, [agency]);

  const stats = useMemo(() => {
    if (!agency) return { done: 0, pct: 0, total: 0, incomplete: [] as { week: number; title: string; tasks: typeof ROADMAP_DATA[0]['tasks'] }[] };
    const progress = agency.roadmap_progress || {};
    const allVisible = visibleWeeks.flatMap((w) => w.tasks);
    const done = allVisible.filter((t) => progress[t.id]).length;
    const total = allVisible.length;
    const incomplete = visibleWeeks
      .map((w, idx) => ({
        week: idx + 1,
        title: w.title,
        tasks: w.tasks.filter((t) => !progress[t.id]),
      }))
      .filter((w) => w.tasks.length > 0);
    return { done, total, pct: total ? Math.round((done / total) * 100) : 0, incomplete };
  }, [agency, visibleWeeks]);

  const partnerUrl = agency ? `${window.location.origin}/activate/${agency.slug}` : '';

  const copyUrl = () => {
    navigator.clipboard.writeText(partnerUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    });
  };

  if (loading) {
    return <div className="text-sm text-muted-foreground">Loading...</div>;
  }

  if (!agency) {
    return (
      <Card>
        <CardContent className="p-12 text-center">
          <h2 className="text-xl font-bold">Agency not found.</h2>
          <Button asChild variant="link" className="mt-4">
            <Link to="/people/onboarding">← Back to list</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (editing) {
    return (
      <EditAgencyForm
        agency={agency}
        onSaved={(updated) => {
          setAgency(updated);
          setEditing(false);
        }}
        onCancel={() => setEditing(false)}
      />
    );
  }

  const progress = agency.roadmap_progress || {};

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link to="/people/onboarding" className="text-xs text-muted-foreground hover:text-foreground">
              ← Onboarding
            </Link>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold tracking-tight">{agency.agency_name}</h1>
            <Badge variant="outline">{resolveVariant(agency.variant).label}</Badge>
            <Badge variant="secondary">{resolveCompTier(agency.comp_tier).label}</Badge>
            {!agency.active && <Badge variant="destructive">Inactive</Badge>}
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
          <Pencil className="w-3.5 h-3.5 mr-1.5" />
          Edit
        </Button>
      </div>

      {/* Summary card */}
      <Card>
        <CardContent className="p-6">
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div>
              <Label className="text-xs text-muted-foreground">Principal</Label>
              <div className="text-sm font-medium mt-1">
                {agency.principal_name || '—'}
              </div>
              {agency.principal_email && (
                <a
                  href={`mailto:${agency.principal_email}`}
                  className="inline-flex items-center gap-1.5 mt-1 text-xs text-cyan-400 hover:text-blue-300"
                >
                  <Mail className="w-3 h-3" />
                  {agency.principal_email}
                </a>
              )}
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Progress</Label>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-2xl font-bold">{stats.pct}%</span>
                <span className="text-xs text-muted-foreground">
                  {stats.done}/{stats.total}
                </span>
              </div>
              <Progress value={stats.pct} className="mt-2 h-1.5" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Last Visited</Label>
              <div className="text-sm font-medium mt-1">{relativeTime(agency.last_visited_at)}</div>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Created</Label>
              <div className="text-sm font-medium mt-1">
                {new Date(agency.created_at).toLocaleDateString()}
              </div>
            </div>
          </div>

          {/* Partner URL */}
          <div className="mt-6 pt-4 border-t flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <Label className="text-xs text-muted-foreground whitespace-nowrap">Partner URL</Label>
              <code className="text-xs text-muted-foreground truncate">{partnerUrl}</code>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <Button variant="ghost" size="sm" onClick={copyUrl}>
                {copied ? (
                  <><Check className="w-3.5 h-3.5 text-emerald-400 mr-1" /> Copied</>
                ) : (
                  <><Copy className="w-3.5 h-3.5 mr-1" /> Copy</>
                )}
              </Button>
              <Button asChild size="sm">
                <a href={`/activate/${agency.slug}`} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="w-3.5 h-3.5 mr-1" />
                  Open hub
                </a>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Roadmap */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Roadmap</h2>
        {visibleWeeks.map((week, idx) => {
          const displayNum = idx + 1;
          const weekDone = week.tasks.filter((t) => progress[t.id]).length;
          return (
            <Card key={week.week}>
              <CardHeader className="pb-3">
                <div className="flex items-baseline gap-4">
                  <span className="text-2xl font-bold text-cyan-400">0{displayNum}</span>
                  <div className="flex-1">
                    <div className="text-xs text-muted-foreground uppercase tracking-wider">
                      Week {displayNum}
                    </div>
                    <CardTitle className="text-lg">{week.title}</CardTitle>
                  </div>
                  <div className="text-sm text-muted-foreground tabular-nums">
                    <span className="font-medium text-foreground">{weekDone}</span> / {week.tasks.length}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0 space-y-1">
                {week.tasks.map((task) => {
                  const done = !!progress[task.id];
                  return (
                    <div key={task.id} className="flex items-start gap-3 py-2">
                      {done ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                      ) : (
                        <Circle className="w-4 h-4 text-muted-foreground/30 flex-shrink-0 mt-0.5" />
                      )}
                      <span className={`text-sm ${done ? 'text-muted-foreground line-through' : ''}`}>
                        {task.label}
                      </span>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Incomplete tasks */}
      {stats.incomplete.length > 0 && (
        <Card className="bg-card text-white border-0">
          <CardContent className="p-6">
            <h3 className="text-xs uppercase tracking-wider text-blue-400 mb-1">Incomplete Tasks</h3>
            <p className="text-lg font-semibold mb-4">What they're stuck on.</p>
            <div className="space-y-4">
              {stats.incomplete.map((w) => (
                <div key={w.week}>
                  <div className="text-xs uppercase tracking-wider text-white/50 mb-2">
                    Week {w.week} · {w.title}
                  </div>
                  <ul className="space-y-1.5">
                    {w.tasks.map((t) => (
                      <li key={t.id} className="flex items-start gap-2 text-sm text-white/85">
                        <Circle className="w-3.5 h-3.5 text-blue-400/60 flex-shrink-0 mt-1" />
                        {t.label}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// --- Edit form ---

function EditAgencyForm({
  agency,
  onSaved,
  onCancel,
}: {
  agency: OnboardingAgency;
  onSaved: (a: OnboardingAgency) => void;
  onCancel: () => void;
}) {
  const [agencyName, setAgencyName] = useState(agency.agency_name);
  const [principalName, setPrincipalName] = useState(agency.principal_name || '');
  const [principalEmail, setPrincipalEmail] = useState(agency.principal_email || '');
  const [variant, setVariant] = useState<AgencyVariant>(agency.variant);
  const [compTier, setCompTier] = useState<CompTier>(agency.comp_tier);
  const [active, setActive] = useState(agency.active);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!agencyName.trim()) {
      setError('Agency name is required.');
      return;
    }

    const changes: Record<string, unknown> = {};
    if (agencyName.trim() !== agency.agency_name) changes.agency_name = agencyName.trim();
    if ((principalName.trim() || '') !== (agency.principal_name || '')) changes.principal_name = principalName.trim() || null;
    if ((principalEmail.trim() || '') !== (agency.principal_email || '')) changes.principal_email = principalEmail.trim() || null;
    if (variant !== agency.variant) changes.variant = variant;
    if (compTier !== agency.comp_tier) changes.comp_tier = compTier;
    if (active !== agency.active) changes.active = active;

    if (Object.keys(changes).length === 0) {
      onCancel();
      return;
    }

    setSubmitting(true);
    const result = await updateOnboardingAgency({
      slug: agency.slug,
      ...changes,
    } as Parameters<typeof updateOnboardingAgency>[0]);
    setSubmitting(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }
    onSaved(result.agency);
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <Link to="/people/onboarding" className="text-xs text-muted-foreground hover:text-foreground">
          ← Onboarding
        </Link>
        <h1 className="text-2xl font-bold tracking-tight mt-2">Edit: {agency.agency_name}</h1>
      </div>

      <Card>
        <CardContent className="p-6">
          <form onSubmit={onSubmit} className="space-y-5">
            <div>
              <Label>Slug</Label>
              <Input value={agency.slug} disabled className="mt-1.5 bg-muted" />
              <p className="text-xs text-muted-foreground mt-1">Slugs can't be changed.</p>
            </div>

            <div>
              <Label>Agency name *</Label>
              <Input value={agencyName} onChange={(e) => setAgencyName(e.target.value)} className="mt-1.5" required />
            </div>

            <div>
              <Label>Principal name</Label>
              <Input value={principalName} onChange={(e) => setPrincipalName(e.target.value)} className="mt-1.5" placeholder="Optional" />
            </div>

            <div>
              <Label>Principal email</Label>
              <Input type="email" value={principalEmail} onChange={(e) => setPrincipalEmail(e.target.value)} className="mt-1.5" placeholder="Optional" />
            </div>

            <div>
              <Label>Variant *</Label>
              <div className="grid grid-cols-2 gap-3 mt-1.5">
                {Object.values(VARIANT_CONFIGS).map((cfg) => (
                  <button
                    key={cfg.key}
                    type="button"
                    onClick={() => setVariant(cfg.key)}
                    className={`text-left rounded-lg border px-4 py-3 transition-all ${
                      variant === cfg.key ? 'border-blue-500 bg-cyan-500/10' : 'border-border hover:border-foreground/30'
                    }`}
                  >
                    <div className="text-sm font-medium">{cfg.label}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {cfg.contacts[0].name.split(' ')[0]} & {cfg.contacts[1].name.split(' ')[0]}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <Label>Comp Tier *</Label>
              <div className="grid grid-cols-4 gap-2 mt-1.5">
                {Object.values(COMP_TIER_CONFIGS).map((cfg) => (
                  <button
                    key={cfg.key}
                    type="button"
                    onClick={() => setCompTier(cfg.key)}
                    className={`text-center rounded-lg border px-3 py-2.5 transition-all ${
                      compTier === cfg.key ? 'border-blue-500 bg-cyan-500/10' : 'border-border hover:border-foreground/30'
                    }`}
                  >
                    <div className="text-sm font-medium">{cfg.label}</div>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <Label>Status</Label>
              <div className="grid grid-cols-2 gap-3 mt-1.5">
                {[true, false].map((val) => (
                  <button
                    key={String(val)}
                    type="button"
                    onClick={() => setActive(val)}
                    className={`text-left rounded-lg border px-4 py-3 transition-all ${
                      active === val ? 'border-blue-500 bg-cyan-500/10' : 'border-border hover:border-foreground/30'
                    }`}
                  >
                    <div className="text-sm font-medium">{val ? 'Active' : 'Inactive'}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {val ? 'Hub is visible to the partner' : 'Hub shows a closed message'}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-sm text-red-300">
                {error}
              </div>
            )}

            <div className="flex items-center gap-3 pt-2">
              <Button type="submit" disabled={submitting || !agencyName.trim()}>
                {submitting ? 'Saving...' : 'Save changes'}
              </Button>
              <Button type="button" variant="ghost" onClick={onCancel}>
                Cancel
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
