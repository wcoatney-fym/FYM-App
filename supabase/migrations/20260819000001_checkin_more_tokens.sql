-- checkin_more_tokens: Short-code tokens for the hosted MORE page.
-- Each row maps a short alphanumeric code to a manager + date,
-- with an expiry timestamp. The React page validates via this table.

CREATE TABLE IF NOT EXISTS checkin_more_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  manager_id UUID NOT NULL REFERENCES checkin_managers(id),
  check_in_date DATE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast code lookups
CREATE INDEX IF NOT EXISTS idx_checkin_more_tokens_code ON checkin_more_tokens (code);

-- Index for cleanup queries (expired tokens)
CREATE INDEX IF NOT EXISTS idx_checkin_more_tokens_expires ON checkin_more_tokens (expires_at);

-- RLS: service role only (edge functions use service key)
ALTER TABLE checkin_more_tokens ENABLE ROW LEVEL SECURITY;

-- No public access — all reads/writes go through the service key in edge functions
-- The anon key cannot read or write this table
