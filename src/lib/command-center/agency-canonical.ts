/**
 * agency-canonical.ts — the single source of truth for agency name
 * standardization across the tools (Activity Tracker, contracting portal, and
 * FYM App Command Center).
 *
 * Canonical basis: the Activity Tracker `agencies` table (the production DB).
 * The tracker's strings are machine title-cased off the UNL file ("Dh", "Llc",
 * ...), so we derive a CLEAN canonical DISPLAY name from them while matching on
 * a stable normalized key. Nothing here renames source rows — the crosswalk is
 * an additive alias layer (see cc_agency_crosswalk).
 *
 * EXCLUSION: the contracting portal's "CRM Team" tab keeps its own agency
 * strings untouched — some agencies carry a CRM/payment-type suffix (e.g.
 * "MHA (IFG)" vs "MHA (YFMO)") that distinguishes two CRMs and MUST be
 * preserved there. Those suffixed intake names are mapped here as *variants*
 * of one canonical agency, never rewritten at the source.
 *
 * HOW TO IDENTIFY PROTECTED CODE: any file tagged `@crm-team-protected` at
 * the top is CRM Team-owned. Do NOT apply cleanDisplayName, normKey, or
 * crosswalk resolution inside those files. When the CRM Team tab moves into
 * FYM Command, carry the @crm-team-protected marker with the migrated files.
 */

/** Tokens to force to a fixed casing when cleaning a tracker string. */
const CASING: Record<string, string> = {
  llc: 'LLC',
  inc: 'Inc.',
  dba: 'DBA',
  dh: 'DH',
  rl: 'RL',
  fym: 'FYM',
};

/** Explicit overrides for names the generic rules cannot nail. */
const DISPLAY_OVERRIDES: Record<string, string> = {
  // normKey -> clean display
};

/** Normalized match key: lowercased, punctuation/entity-suffix stripped. */
export function normKey(v: string | null | undefined): string {
  return (v ?? '')
    .toLowerCase()
    .replace(/\b(llc|inc|incorporated|group|insurance|agency|the|co|company|dba)\b/g, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

/**
 * Turn a raw tracker string into a clean canonical display name.
 *  - fixes known acronyms/suffix casing (LLC, Inc., DBA, DH, RL, FYM)
 *  - inserts a comma before a trailing legal suffix ("Foo LLC" -> "Foo, LLC")
 */
export function cleanDisplayName(raw: string): string {
  const key = normKey(raw);
  if (DISPLAY_OVERRIDES[key]) return DISPLAY_OVERRIDES[key];

  const words = raw.trim().split(/\s+/).map((w) => {
    const bare = w.toLowerCase().replace(/\.$/, '');
    return CASING[bare] ?? w;
  });

  let out = words.join(' ');
  // Comma before a trailing legal suffix, if not already present.
  out = out.replace(/\s+(LLC|Inc\.)$/,(_,s) => `, ${s}`);
  return out;
}

/** One row of the standardization crosswalk. */
export interface CrosswalkEntry {
  canonicalKey: string;        // stable normalized match key
  canonicalName: string;       // clean display name (all tools render this)
  trackerName: string | null;  // raw Activity Tracker string (production truth)
  variants: string[];          // known alias strings (intake/portal/tracker)
}

/**
 * Seed from the tracker's 28 canonical agencies (as of 2026-07-09). New
 * agencies get added as they appear in production; the DB table is the live
 * source and this array is the bootstrap/fallback.
 */
export const TRACKER_CANONICAL: string[] = [
  'Almond Family Insurance Llc',
  'American Entitlements Llc',
  'American Senior Health And Life Llc',
  'Clear Path Coverage',
  'Dh Insurance Group',
  'Drivegen Media Dba Pro Health Partners',
  'FYM',
  'Guardian Benefits Inc',
  'Guide To Insure Llc',
  'Healthcare123 Insurance Services Llc',
  'Highland Health Direct Llc',
  'Insurance Sales Experts',
  'McKenzie Real Holdings Llc',
  'Medicare Health Advisors',
  'Partners In Care Insurance Llc',
  'Pitch Health Solutions Llc',
  'Providence Group',
  'Residual Brothers Llc',
  'Rl Advisors',
  'Senior Benefits Agency Llc',
  'Senior Services Direct',
  'Signature Medicare Solutions',
  'Silver Care Advisors Llc',
  'Steel City Financial Services Inc.',
  'The Premier Agency Llc',
  'Trucare Insurance Group Inc',
  'Wealth Alliance Group',
  'Wisechoice Senior Advisors Llc',
];

/**
 * Confirmed intake/portal alias -> canonical tracker string. These are the
 * variants that normalized matching alone can't catch (acronyms, DBAs, the
 * two-CRM MHA split). Confirmed with Charlie 2026-07-09.
 */
export const INTAKE_ALIASES: Record<string, string> = {
  'DH Insurance Group': 'Dh Insurance Group',
  'Wisechoice': 'Wisechoice Senior Advisors Llc',
  'MHA (IFG)': 'Medicare Health Advisors',
  'MHA (YFMO)': 'Medicare Health Advisors',
  // FYM is an exact match already.
};

/** Build the seed crosswalk (tracker canon + confirmed intake variants). */
export function buildSeedCrosswalk(): CrosswalkEntry[] {
  const byKey = new Map<string, CrosswalkEntry>();
  for (const tracker of TRACKER_CANONICAL) {
    const canonicalKey = normKey(tracker);
    byKey.set(canonicalKey, {
      canonicalKey,
      canonicalName: cleanDisplayName(tracker),
      trackerName: tracker,
      variants: [tracker],
    });
  }
  for (const [alias, tracker] of Object.entries(INTAKE_ALIASES)) {
    const canonicalKey = normKey(tracker);
    const entry = byKey.get(canonicalKey);
    if (entry && !entry.variants.includes(alias)) entry.variants.push(alias);
  }
  return [...byKey.values()];
}

/**
 * Build a resolver: any known variant string (or a fuzzy normKey hit against a
 * canonical) -> the canonical entry. Falls back to normKey equality so brand
 * new tracker names still resolve to themselves.
 */
export function buildResolver(entries: CrosswalkEntry[]) {
  const byVariantKey = new Map<string, CrosswalkEntry>();
  for (const e of entries) {
    byVariantKey.set(e.canonicalKey, e);
    for (const v of e.variants) byVariantKey.set(normKey(v), e);
  }
  return function resolve(name: string | null | undefined): CrosswalkEntry | null {
    const k = normKey(name);
    if (!k) return null;
    return byVariantKey.get(k) ?? null;
  };
}
