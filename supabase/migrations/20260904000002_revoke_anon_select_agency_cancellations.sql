/*
  # Tighten anon access on agency_cancellations

  Context:
  - 1,789 rows with PII (first_name, last_name, phone)
  - anon currently has ALL privileges including SELECT with qual=true
    (any holder of the publishable key can read all cancellation records
     across every agency — the security exposure we're closing)
  - The contracting-portal (contracting.teamfym.com) INSERT path is the
    only live anon write path — agencies upload cancellation CSVs through
    PortalCancellationsTab.tsx, which runs as anon
  - The contracting-portal does NOT read from agency_cancellations
    (PortalCancellationsTab only INSERTs; TaskboardCurrentTab reads are
     dead code — route commented out in App.tsx)
  - Admin reads (TaskboardCurrentTab in FYM App) go through
    ensurePortalAuth → authenticated role — unaffected by anon REVOKE

  Changes:
  1. REVOKE all destructive grants from anon (UPDATE, DELETE, TRUNCATE,
     REFERENCES, TRIGGER) — nobody needs these
  2. REVOKE anon SELECT — closes the PII read exposure
  3. KEEP anon INSERT — portal uploads still work
  4. Drop the anon SELECT RLS policy (orphaned after REVOKE)
  5. Keep the anon INSERT RLS policy (still needed for portal uploads)

  Result:
  - anon can INSERT (portal uploads work)
  - anon cannot SELECT, UPDATE, DELETE, or anything else
  - authenticated can still SELECT + INSERT (FYM App admin reads + writes)
  - 1,789 PII records no longer exposed to anon reads

  Permanent close: when agencies migrate to FYM App's authenticated upload
  path and the contracting-portal is decommissioned, REVOKE anon INSERT too.
*/

-- Strip all destructive grants from anon
REVOKE UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.agency_cancellations FROM anon;

-- Close the PII read exposure
REVOKE SELECT ON public.agency_cancellations FROM anon;

-- Drop the orphaned anon SELECT policy
DROP POLICY IF EXISTS "Anon can view cancellations for active agencies" ON public.agency_cancellations;

-- Keep: "Anon can insert cancellations" policy (portal uploads)
-- Keep: anon INSERT grant (portal uploads)
-- Keep: authenticated SELECT + INSERT policies (FYM App admin)
