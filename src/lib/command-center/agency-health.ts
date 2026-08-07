import { supabase } from './tracker-supabase';

export interface PolicyRow {
  policy_effective_date: string | null;
  product_type: string | null;
  plan_premium: number | string | null;
  billing_mode: string | number | null;
  agency_id: string | null;
  agency: string | null;
}

export interface AgencyHealth {
  agencyId: string | null;
  agency: string;
  appsAllTime: number;
  appsRecent: number;
  hiPctAllTime: number;
  hiPctRecent: number;
  avgApAllTime: number;
  avgApRecent: number;
  apLiftPct: number | null;
  trajectory: 'diversifying' | 'still-hi-heavy' | 'slowing' | 'no-recent';
  tylerTarget: boolean;
  opportunityScore: number;
}

const RECENT_DAYS = 30;
const HI = 'HI';

/** Shared threshold: agencies at or above this HI% are flagged. Used by both
 *  targeting logic (tylerTarget) and UI highlight (amber text). */
export const HI_PCT_THRESHOLD = 55;

function annualize(premium: number, billingMode: string | number | null): number {
  const bm = String(billingMode ?? '1');
  const mult = bm === '3' ? 4 : bm === '12' ? 1 : 12;
  return premium * mult;
}

function toNum(v: number | string | null): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

export async function fetchPolicies(): Promise<PolicyRow[]> {
  if (!supabase) throw new Error('Supabase is not configured');
  const pageSize = 1000;
  let offset = 0;
  const all: PolicyRow[] = [];
  for (;;) {
    const { data, error } = await supabase
      .from('form_submissions')
      .select('policy_effective_date,product_type,plan_premium,billing_mode,agency_id,agency')
      .range(offset, offset + pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...(data as PolicyRow[]));
    if (data.length < pageSize) break;
    offset += pageSize;
  }
  return all;
}

interface Bucket {
  n: number;
  hi: number;
  ap: number[];
}
const emptyBucket = (): Bucket => ({ n: 0, hi: 0, ap: [] });

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const pct = (part: number, whole: number) => (whole ? (100 * part) / whole : 0);

export function computeAgencyHealth(
  rows: PolicyRow[],
  agencyNames: Record<string, string>,
  minApps = 5,
): AgencyHealth[] {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - RECENT_DAYS);

  const all = new Map<string, Bucket>();
  const recent = new Map<string, Bucket>();
  /** Track the first agency_id seen for each resolved name. */
  const idByName = new Map<string, string | null>();

  for (const r of rows) {
    const name = (r.agency_id && agencyNames[r.agency_id]) || r.agency || 'Unknown';
    if (!idByName.has(name)) idByName.set(name, r.agency_id);
    const isHi = r.product_type === HI ? 1 : 0;
    const premium = toNum(r.plan_premium);
    const ap = premium !== null ? annualize(premium, r.billing_mode) : null;

    const a = all.get(name) ?? emptyBucket();
    a.n += 1;
    a.hi += isHi;
    if (ap !== null) a.ap.push(ap);
    all.set(name, a);

    if (r.policy_effective_date) {
      const d = new Date(r.policy_effective_date);
      const now = new Date();
      if (d >= cutoff && d <= now) {
        const b = recent.get(name) ?? emptyBucket();
        b.n += 1;
        b.hi += isHi;
        if (ap !== null) b.ap.push(ap);
        recent.set(name, b);
      }
    }
  }

  const out: AgencyHealth[] = [];
  for (const [name, a] of all) {
    if (a.n < minApps) continue;
    const r = recent.get(name) ?? emptyBucket();
    const hiAll = pct(a.hi, a.n);
    const hiRecent = pct(r.hi, r.n);
    const apAll = avg(a.ap);
    const apRecent = avg(r.ap);
    const apLiftPct = apAll > 0 && r.ap.length ? (100 * (apRecent / apAll - 1)) : null;

    let trajectory: AgencyHealth['trajectory'];
    if (r.n === 0) trajectory = 'no-recent';
    else if (hiRecent < hiAll - 8) trajectory = 'diversifying';
    else if (r.n < a.n / 24) trajectory = 'slowing';
    else trajectory = 'still-hi-heavy';

    const tylerTarget =
      r.n >= 10 && hiRecent >= HI_PCT_THRESHOLD && apRecent > 0 && apRecent < 700;

    const apGap = Math.max(0, 700 - apRecent);
    const opportunityScore = tylerTarget ? Math.round(r.n * (hiRecent / 100) * (apGap / 700) * 100) : 0;

    out.push({
      agencyId: idByName.get(name) ?? null,
      agency: name,
      appsAllTime: a.n,
      appsRecent: r.n,
      hiPctAllTime: Math.round(hiAll),
      hiPctRecent: Math.round(hiRecent),
      avgApAllTime: Math.round(apAll),
      avgApRecent: Math.round(apRecent),
      apLiftPct: apLiftPct === null ? null : Math.round(apLiftPct),
      trajectory,
      tylerTarget,
      opportunityScore,
    });
  }

  out.sort((x, y) => y.opportunityScore - x.opportunityScore || y.appsRecent - x.appsRecent);
  return out;
}

export async function fetchAgencyNames(): Promise<Record<string, string>> {
  if (!supabase) throw new Error('Supabase is not configured');
  const { data, error } = await supabase.from('agencies').select('id,name').range(0, 999);
  if (error) throw error;
  const map: Record<string, string> = {};
  for (const a of data ?? []) map[(a as { id: string }).id] = (a as { name: string }).name;
  return map;
}
