import { supabase } from '../supabase';
import type { AgencyVariant } from './variants';
import type { CompTier } from './compTiers';

export type RoadmapProgress = Record<string, boolean>;

export interface OnboardingAgency {
  id: string;
  agency_id: string | null;
  slug: string;
  agency_name: string;
  principal_name: string | null;
  principal_email: string | null;
  roadmap_progress: RoadmapProgress;
  active: boolean;
  variant: AgencyVariant;
  comp_tier: CompTier;
  created_at: string;
  updated_at: string;
  last_visited_at: string | null;
}

// --- Admin reads (authenticated) ---

export async function fetchAllOnboardingAgencies(): Promise<OnboardingAgency[]> {
  const PAGE_SIZE = 500;
  const all: OnboardingAgency[] = [];
  let offset = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await supabase
      .from('onboarding_agencies')
      .select('*')
      .order('last_visited_at', { ascending: false, nullsFirst: false })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) {
      console.error('fetchAllOnboardingAgencies error:', error);
      break;
    }
    const rows = (data as OnboardingAgency[]) ?? [];
    all.push(...rows);
    if (rows.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return all;
}

export async function fetchOnboardingAgency(slug: string): Promise<OnboardingAgency | null> {
  const { data, error } = await supabase
    .from('onboarding_agencies')
    .select('*')
    .eq('slug', slug)
    .maybeSingle();
  if (error) {
    console.error('fetchOnboardingAgency error:', error);
    return null;
  }
  return (data as OnboardingAgency | null) ?? null;
}

// --- Partner-facing (anon-safe, slug-gated) ---

export async function updateRoadmapProgress(
  slug: string,
  progress: RoadmapProgress,
): Promise<void> {
  const { error } = await supabase
    .from('onboarding_agencies')
    .update({ roadmap_progress: progress })
    .eq('slug', slug);
  if (error) console.error('updateRoadmapProgress error:', error);
}

export async function recordVisit(slug: string): Promise<void> {
  const { error } = await supabase
    .from('onboarding_agencies')
    .update({ last_visited_at: new Date().toISOString() })
    .eq('slug', slug);
  if (error) console.error('recordVisit error:', error);
}

// --- Admin mutations ---

export interface CreateOnboardingAgencyInput {
  slug?: string;
  agency_name: string;
  agency_id?: string | null;
  principal_name?: string | null;
  principal_email?: string | null;
  variant?: AgencyVariant;
  comp_tier?: CompTier;
}

export async function createOnboardingAgency(
  input: CreateOnboardingAgencyInput,
): Promise<{ ok: true; agency: OnboardingAgency } | { ok: false; error: string }> {
  const slug = input.slug || `${slugify(input.agency_name)}-${randomSuffix()}`;

  const { data, error } = await supabase
    .from('onboarding_agencies')
    .insert({
      slug,
      agency_name: input.agency_name,
      agency_id: input.agency_id ?? null,
      principal_name: input.principal_name ?? null,
      principal_email: input.principal_email ?? null,
      variant: input.variant ?? 'brent_melanie',
      comp_tier: input.comp_tier ?? '70',
    })
    .select()
    .single();

  if (error) {
    console.error('createOnboardingAgency error:', error);
    return { ok: false, error: error.message };
  }
  return { ok: true, agency: data as OnboardingAgency };
}

export interface UpdateOnboardingAgencyInput {
  slug: string;
  agency_name?: string;
  principal_name?: string | null;
  principal_email?: string | null;
  variant?: AgencyVariant;
  comp_tier?: CompTier;
  active?: boolean;
  agency_id?: string | null;
}

export async function updateOnboardingAgency(
  input: UpdateOnboardingAgencyInput,
): Promise<{ ok: true; agency: OnboardingAgency } | { ok: false; error: string }> {
  const updates: Record<string, unknown> = {};
  if (input.agency_name !== undefined) updates.agency_name = input.agency_name;
  if (input.principal_name !== undefined) updates.principal_name = input.principal_name;
  if (input.principal_email !== undefined) updates.principal_email = input.principal_email;
  if (input.variant !== undefined) updates.variant = input.variant;
  if (input.comp_tier !== undefined) updates.comp_tier = input.comp_tier;
  if (input.active !== undefined) updates.active = input.active;
  if (input.agency_id !== undefined) updates.agency_id = input.agency_id;

  if (Object.keys(updates).length === 0) {
    return { ok: false, error: 'No fields to update' };
  }

  const { data, error } = await supabase
    .from('onboarding_agencies')
    .update(updates)
    .eq('slug', input.slug)
    .select()
    .single();

  if (error) {
    console.error('updateOnboardingAgency error:', error);
    return { ok: false, error: error.message };
  }
  return { ok: true, agency: data as OnboardingAgency };
}

// --- Utility ---

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

export function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 6);
}

export function relativeTime(iso: string | null): string {
  if (!iso) return 'Never';
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'Just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo ago`;
  return new Date(iso).toLocaleDateString();
}
