/*
  # Defuse credential landmines — REVOKE ALL anon grants on tables holding
  # API keys, passwords, or password hashes

  Context:
  - These tables hold credentials (API keys, passwords, hashes)
  - anon had ALL privileges (Supabase default grants)
  - RLS was the only protection — no anon RLS policies existed, so anon
    got empty results. But ONE future qual=true policy addition would
    instantly expose credentials to anyone with the publishable key.
  - REVOKE ALL removes the landmine entirely — no RLS policy can override
    a missing grant.

  Tables (Portal DB — akhojh):
  1. agency_ghl_configs — holds ghl_api_key (GHL API keys per agency)
     6 rows. Zero anon readers in codebase.
  2. portal_credentials — holds password_hash (portal login hashes)
     1 row. Zero anon readers — verify-portal-password edge function
     uses service_role.

  Changes:
  - REVOKE ALL ON agency_ghl_configs FROM anon
  - REVOKE ALL ON portal_credentials FROM anon

  Result:
  - anon cannot touch these tables regardless of any future RLS policy
  - authenticated + service_role unaffected
  - Zero frontend breakage (no anon code paths read these tables)
*/

REVOKE ALL ON public.agency_ghl_configs FROM anon;
REVOKE ALL ON public.portal_credentials FROM anon;

/*
  FYM App DB (rcbzag) — agencies table holds app_login_password

  NOTE: This REVOKE targets the FYM App DB (rcbzagjyhyrkuwvlrlnf),
  not the Portal DB. Applied via Management API. When running db push,
  ensure this migration runs against the correct project.

  Context:
  - agencies table holds app_login_email + app_login_password (106 rows)
  - anon had ALL privileges (Supabase default grants)
  - RLS was the only protection — no anon RLS policies existed
  - REVOKE ALL removes the landmine entirely

  Zero frontend breakage — anon SELECT on agencies already returned
  empty results (RLS blocking). Live verified.
*/

-- NOTE: This statement targets rcbzag, not akhojh.
-- If running db push against akhojh, this is a no-op (table doesn't exist there).
-- If running db push against rcbzag, this defuses the landmine.
REVOKE ALL ON public.agencies FROM anon;
