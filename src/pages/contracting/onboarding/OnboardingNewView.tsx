/**
 * OnboardingNewView — Create new onboarding agency, adapted from OnboardingNewPage
 * for use inside the Contracting tab (no router navigation).
 */
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { supabase } from '@/lib/supabase';
import {
  createOnboardingAgency,
  slugify,
  randomSuffix,
} from '@/lib/onboarding/storage';
import { VARIANT_CONFIGS, type AgencyVariant } from '@/lib/onboarding/variants';
import { COMP_TIER_CONFIGS, type CompTier } from '@/lib/onboarding/compTiers';

interface Agency {
  id: string;
  name: string;
}

interface OnboardingNewViewProps {
  onCreated: (slug: string) => void;
  onCancel: () => void;
}

export function OnboardingNewView({ onCreated, onCancel }: OnboardingNewViewProps) {
  const [agencyName, setAgencyName] = useState('');
  const [principalName, setPrincipalName] = useState('');
  const [principalEmail, setPrincipalEmail] = useState('');
  const [customSlug, setCustomSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [variant, setVariant] = useState<AgencyVariant>('brent_melanie');
  const [compTier, setCompTier] = useState<CompTier>('70');
  const [selectedAgencyId, setSelectedAgencyId] = useState<string>('');
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch canonical agencies for linking
  useEffect(() => {
    if (!supabase) return;
    supabase
      .from('agencies')
      .select('id, name')
      .order('name')
      .then(({ data }) => {
        if (data) setAgencies(data as Agency[]);
      });
  }, []);

  const generatedSlug = useMemo(() => {
    if (!agencyName.trim()) return '';
    return `${slugify(agencyName)}-${randomSuffix()}`;
  }, [agencyName]);

  useEffect(() => {
    if (!slugTouched) setCustomSlug(generatedSlug);
  }, [generatedSlug, slugTouched]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!agencyName.trim()) {
      setError('Agency name is required.');
      return;
    }
    const slug = customSlug.trim() || `${slugify(agencyName)}-${randomSuffix()}`;
    setSubmitting(true);
    const result = await createOnboardingAgency({
      slug,
      agency_name: agencyName.trim(),
      agency_id: selectedAgencyId || null,
      principal_name: principalName.trim() || null,
      principal_email: principalEmail.trim() || null,
      variant,
      comp_tier: compTier,
    });
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onCreated(result.agency.slug);
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <button onClick={onCancel} className="text-xs text-muted-foreground hover:text-foreground">
          ← Onboarding
        </button>
        <h2 className="text-xl font-bold tracking-tight mt-2">Onboard a Partner</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Creates the partner record and generates an unguessable URL. Send that URL to the agency principal — it's their credential.
        </p>
      </div>

      <Card>
        <CardContent className="p-6">
          <form onSubmit={onSubmit} className="space-y-5">
            <div>
              <Label>Agency name *</Label>
              <Input
                value={agencyName}
                onChange={(e) => setAgencyName(e.target.value)}
                placeholder="e.g., Acme Insurance Group"
                className="mt-1.5"
                required
              />
            </div>

            {/* Link to canonical agency */}
            <div>
              <Label>Link to agency record</Label>
              <Select value={selectedAgencyId} onValueChange={setSelectedAgencyId}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue placeholder="Select agency (optional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">None</SelectItem>
                  {agencies.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                Connects onboarding progress to the canonical agency in FYM App.
              </p>
            </div>

            <div>
              <Label>Principal name</Label>
              <Input
                value={principalName}
                onChange={(e) => setPrincipalName(e.target.value)}
                placeholder="Optional"
                className="mt-1.5"
              />
            </div>

            <div>
              <Label>Principal email</Label>
              <Input
                type="email"
                value={principalEmail}
                onChange={(e) => setPrincipalEmail(e.target.value)}
                placeholder="Optional"
                className="mt-1.5"
              />
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
              <Label>Slug</Label>
              <div className="flex items-center border rounded-md mt-1.5 focus-within:ring-2 focus-within:ring-ring">
                <span className="px-3 py-2 text-sm text-muted-foreground border-r bg-muted">
                  /activate/
                </span>
                <input
                  type="text"
                  value={customSlug}
                  onChange={(e) => {
                    setSlugTouched(true);
                    setCustomSlug(e.target.value);
                  }}
                  placeholder="auto"
                  className="flex-1 px-3 py-2 text-sm bg-transparent outline-none"
                />
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Auto-generated from agency name. Edit for a custom one.
              </p>
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-sm text-red-300">
                {error}
              </div>
            )}

            <div className="flex items-center gap-3 pt-2">
              <Button type="submit" disabled={submitting || !agencyName.trim()}>
                {submitting ? 'Creating...' : 'Create agency'}
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
