/*
  # Revoke anon SELECT + destructive grants on uploaded_files

  Context:
  - 19 rows containing actual file content (multi-MB JPEGs, signed PDFs)
    stored in the `file_data` column — not metadata, the documents themselves
  - anon has ALL privileges including SELECT with qual=true
    → anyone with the publishable key can download every agent document
  - Worst exposure on the board: it's not contact info, it's files

  Read path trace:
  - FYM App: ContractingTrackingTab.tsx, AgentDetailModal.tsx
    → both use portalSupabase + ensurePortalAuth → authenticated. Unaffected.
  - contracting-portal: AgentTracking.tsx, AgentDatabase.tsx
    → both use anon client. These are admin routes behind PasswordGate.
    → REVOKE breaks these reads. But FYM App has authenticated equivalents
      and is the active admin surface. Accepted breakage on legacy portal admin.

  Write path trace:
  - contracting-portal forms (HIP.tsx, LifeOnly.tsx, Field.tsx, DirectPay.tsx,
    Telesales.tsx) → plain .insert(), no .select() chain. Defaults to
    Prefer: return=minimal → no SELECT needed. REVOKE won't break uploads.
  - FYM App forms → same pattern via portalSupabase (authenticated).

  Changes:
  1. REVOKE SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER from anon
  2. KEEP anon INSERT (contracting-portal form uploads need it)
  3. DROP orphaned anon SELECT RLS policy
  4. KEEP anon INSERT RLS policy

  Result:
  - anon can INSERT (form uploads work)
  - anon cannot SELECT/download documents
  - authenticated can still do everything (FYM App admin reads + writes)
  - 19 agent documents no longer downloadable by anyone with publishable key

  Accepted breakage: contracting-portal admin pages (AgentTracking,
  AgentDatabase) lose file display. FYM App equivalents are the active surface.
*/

-- Strip destructive grants
REVOKE UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.uploaded_files FROM anon;

-- Close the document download exposure
REVOKE SELECT ON public.uploaded_files FROM anon;

-- Drop orphaned anon SELECT policy
DROP POLICY IF EXISTS "anon_select_uploaded_files" ON public.uploaded_files;

-- Keep: anon_insert_uploaded_files policy (form uploads)
-- Keep: anon INSERT grant (form uploads)
-- Keep: authenticated_all_uploaded_files policy (FYM App admin)
