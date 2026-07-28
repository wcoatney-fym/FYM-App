/**
 * Conditionally add agency_id filter to a Supabase query.
 * When isOrgWide is true, returns the query unmodified.
 * When false, adds .eq(column, agencyId) filter.
 *
 * Usage:
 *   const query = scopeToAgency(
 *     supabase!.from('agency_retention_summary').select('...'),
 *     isOrgWide,
 *     effectiveAgencyId
 *   );
 */
export function scopeToAgency<T>(
  query: T,
  isOrgWide: boolean,
  agencyId: string | null,
  column = 'agency_id'
): T {
  if (isOrgWide || !agencyId) return query;
  return (query as any).eq(column, agencyId) as T;
}
