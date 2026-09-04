/*
  # Fix agent_hub_tokens.token column default — base64url not supported

  Bug: The token column default used `encode(gen_random_bytes(24), 'base64url')`
  but 'base64url' is not a valid Postgres encoding. Every INSERT into this table
  has been silently failing since creation (2026-07-21). The single existing
  token ('mock-123') was manually inserted.

  Fix: Use standard 'base64' encoding with translate() for URL-safe characters
  (+ → -, / → _, strip =).

  Impact: 7 agents since Sep 2 got no hub tokens. Backfilled via Management API.

  Applied to live DB 2026-09-04 via Management API.
*/

ALTER TABLE public.agent_hub_tokens
  ALTER COLUMN token
  SET DEFAULT replace(replace(replace(
    encode(gen_random_bytes(24), 'base64'),
    '+', '-'), '/', '_'), '=', '');
