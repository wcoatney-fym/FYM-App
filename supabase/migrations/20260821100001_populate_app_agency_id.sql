-- Migration: Populate profiles.app_agency_id from profiles.agency_id
--
-- Context:
--   Every profile row has app_agency_id = NULL. The app_agency_id column is a
--   UUID FK → agencies.id. The legacy agency_id column stores the same UUID
--   values as TEXT (type mismatch). This migration copies the value over,
--   casting text → uuid, but only where:
--     1. app_agency_id is currently NULL  (idempotent — safe to re-run)
--     2. agency_id is not NULL            (skip profiles with no agency link)
--     3. agency_id::uuid matches an existing agencies.id  (FK-safe)
--
-- Expected result (as of 2026-08-21):
--   106 of 111 profiles updated.
--   5 profiles skipped (admin users with NULL agency_id):
--     Will Coatney, Chris Banner, Joe Guerra, James Walker, Charlie Mitchell.
--   0 profiles have an agency_id that doesn't match an agencies row.

UPDATE public.profiles
SET    app_agency_id = agency_id::uuid,
       updated_at    = now()
WHERE  app_agency_id IS NULL
  AND  agency_id IS NOT NULL
  AND  EXISTS (
         SELECT 1
         FROM   public.agencies a
         WHERE  a.id = agency_id::uuid
       );
