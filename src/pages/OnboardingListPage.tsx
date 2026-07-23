import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Copy, ExternalLink, Check, Plus } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import {
  fetchAllOnboardingAgencies,
  relativeTime,
  type OnboardingAgency,
} from '@/lib/onboarding/storage';
import { ROADMAP_DATA } from '@/lib/onboarding/data';
import { resolveVariant } from '@/lib/onboarding/variants';

function visibleTaskIdsFor(variantKey: OnboardingAgency['variant']): string[] {
  const variant = resolveVariant(variantKey);
  const ids: string[] = [];
  for (const w of ROADMAP_DATA) {
    if (variant.weekOverrides?.[`w${w.week}`]?.hidden) continue;
    for (const t of w.tasks) {
      if (variant.roadmapOverrides?.[t.id]?.hidden) continue;
      ids.push(t.id);
    }
  }
  return ids;
}

function pct(a: OnboardingAgency): number {
  const ids = visibleTaskIdsFor(a.variant);
  const progress = a.roadmap_progress || {};
  const done = ids.filter((id) => progress[id]).length;
  return ids.length ? Math.round((done / ids.length) * 100) : 0;
}

function isStale(a: OnboardingAgency): boolean {
  if (pct(a) >= 100) return false;
  if (!a.last_visited_at) return true;
  const ageDays = (Date.now() - new Date(a.last_visited_at).getTime()) / 86400000;
  return ageDays >= 7;
}

function visitedThisWeek(a: OnboardingAgency): boolean {
  if (!a.last_visited_at) return false;
  const ageDays = (Date.now() - new Date(a.last_visited_at).getTime()) / 86400000;
  return ageDays < 7;
}

export function OnboardingListPage() {
  const [agencies, setAgencies] = useState<OnboardingAgency[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    fetchAllOnboardingAgencies().then((rows) => {
      setAgencies(rows);
      setLoading(false);
    });
  }, []);

  const stats = useMemo(
    () => ({
      total: agencies.length,
      thisWeek: agencies.filter(visitedThisWeek).length,
      complete: agencies.filter((a) => pct(a) >= 100).length,
      stalled: agencies.filter(isStale).length,
    }),
    [agencies],
  );

  const copyUrl = (slug: string) => {
    const url = `${window.location.origin}/activate/${slug}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(slug);
      setTimeout(() => setCopied(null), 1200);
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Agency Onboarding</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Partner activation hubs — first 30 days from contract to revenue.
          </p>
        </div>
        <Button asChild>
          <Link to="/onboarding/new">
            <Plus className="w-4 h-4 mr-2" />
            New Agency
          </Link>
        </Button>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Total" value={stats.total} />
        <StatCard label="Active this week" value={stats.thisWeek} />
        <StatCard label="At 100%" value={stats.complete} />
        <StatCard label="Stalled" value={stats.stalled} accent={stats.stalled > 0} />
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-12 text-center text-sm text-muted-foreground">Loading...</div>
          ) : agencies.length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-sm text-muted-foreground mb-4">No agencies yet.</p>
              <Button asChild>
                <Link to="/onboarding/new">Create the first agency</Link>
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Agency</TableHead>
                  <TableHead>Slug</TableHead>
                  <TableHead>Progress</TableHead>
                  <TableHead>Last Visited</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {agencies.map((a) => {
                  const p = pct(a);
                  const stale = isStale(a);
                  const never = !a.last_visited_at;
                  const inactive = !a.active;
                  return (
                    <TableRow
                      key={a.slug}
                      className={inactive ? 'opacity-45' : never ? 'opacity-60' : ''}
                    >
                      <TableCell>
                        <div className="flex items-center gap-2 flex-wrap">
                          <Link
                            to={`/onboarding/${a.slug}`}
                            className="font-medium hover:underline"
                          >
                            {a.agency_name}
                          </Link>
                          <Badge variant="outline" className="text-[10px]">
                            {resolveVariant(a.variant).label}
                          </Badge>
                          <Badge variant="secondary" className="text-[10px]">
                            {a.comp_tier} Comp
                          </Badge>
                          {inactive && <Badge variant="destructive">Inactive</Badge>}
                        </div>
                        {a.principal_name && (
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {a.principal_name}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <code className="text-xs text-muted-foreground truncate max-w-[160px]">
                            {a.slug}
                          </code>
                          <button
                            onClick={() => copyUrl(a.slug)}
                            className="text-muted-foreground hover:text-foreground transition-colors"
                            title="Copy partner URL"
                          >
                            {copied === a.slug ? (
                              <Check className="w-3.5 h-3.5 text-green-600" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-3 min-w-[140px]">
                          <Progress value={p} className="flex-1 h-1.5" />
                          <span className="text-xs font-medium tabular-nums">{p}%</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className={`text-xs ${stale ? 'text-red-600 font-medium' : 'text-muted-foreground'}`}>
                          {relativeTime(a.last_visited_at)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs text-muted-foreground">
                          {new Date(a.created_at).toLocaleDateString()}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center gap-3 justify-end">
                          <Link
                            to={`/onboarding/${a.slug}`}
                            className="text-xs hover:underline"
                          >
                            Detail
                          </Link>
                          <a
                            href={`/activate/${a.slug}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                          >
                            Open
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="text-xs text-muted-foreground uppercase tracking-wider">{label}</div>
        <div className={`text-3xl font-bold mt-2 ${accent ? 'text-red-600' : ''}`}>{value}</div>
      </CardContent>
    </Card>
  );
}
