/**
 * FYM's agency tracker_id — used to default FYM admin views to FYM's own data.
 * This matches the `tracker_id` column in the `agencies` table and the
 * `agency_id` column in data tables (policy_cache, views, etc.).
 */
export const FYM_AGENCY_TRACKER_ID = '04813b3b-4a2c-4c55-9f7d-3964d26533f3';

/**
 * Internal agency tracker_ids — FYM + Wisechoice (Will's personal agency).
 * Used for "internal" vs "all agencies" scoping where relevant.
 */
export const FYM_INTERNAL_AGENCY_IDS = [
  '04813b3b-4a2c-4c55-9f7d-3964d26533f3', // FYM
  '982f4e5d-cdff-4b25-bde2-e80c27c4274b', // Wisechoice Senior Advisors
];
