/*
  # REVOKE ALL anon grants + drop public-role policy on agent_lifecycle

  Context:
  - 204 rows with agent PII (first_name, last_name, email, phone,
    ghl_contact_id, writing_number)
  - Public-role policy "lifecycle_read" with qual=true allowed anon SELECT
  - Live verified: real PII (names, emails, phone numbers) returned to anon
  - Zero frontend reads — only edge functions (roster-reconcile,
    lifecycle-offboarding) read this table via service_role
  - REVOKE ALL + drop the public-role read policy

  FYM App DB (rcbzagjyhyrkuwvlrlnf)

  Changes:
  - REVOKE ALL ON agent_lifecycle FROM anon
  - DROP POLICY "lifecycle_read" (public-role, qual=true)

  Result:
  - anon cannot touch agent_lifecycle
  - service_role (edge functions) unaffected
  - Zero frontend breakage
*/

REVOKE ALL ON public.agent_lifecycle FROM anon;
DROP POLICY IF EXISTS "lifecycle_read" ON public.agent_lifecycle;
