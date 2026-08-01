-- Migration: Add writing_number column to agencies table
-- Root cause fix: agency filter sends tracker_id (UUID) but edge functions
-- key agencies by writing_number from Max's prod DB roster hierarchy.
-- This column bridges the two identity systems.

ALTER TABLE public.agencies ADD COLUMN IF NOT EXISTS writing_number text;

-- Create unique index for fast lookup
CREATE UNIQUE INDEX IF NOT EXISTS idx_agencies_writing_number
  ON public.agencies (writing_number) WHERE writing_number IS NOT NULL;

-- Populate from Max's prod DB roster hierarchy mapping (depth=02, non-person)
-- 27 active agencies matched by name normalization
UPDATE public.agencies SET writing_number = m.wn
FROM (VALUES
  ('Almond Family Insurance Llc',          '202NBF00'),
  ('American Entitlements Llc',            '202NDY00'),
  ('American Senior Health And Life Llc',  '202NDU00'),
  ('Clear Path Coverage',                  '202NNW00'),
  ('Dh Insurance Group',                   '202NGA00'),
  ('Drivegen Media Dba Pro Health Partners','202NGF00'),
  ('Guardian Benefits Inc',                '202NEW00'),
  ('Guide To Insure Llc',                  '202NHS00'),
  ('Healthcare123 Insurance Services Llc', '202NMJ00'),
  ('Highland Health Direct Llc',           '202JZ200'),
  ('Insurance Sales Experts',              '202NEP00'),
  ('McKenzie Real Holdings Llc',           '202NL900'),
  ('Medicare Health Advisors',             '202NCX00'),
  ('Partners In Care Insurance Llc',       '202NLR00'),
  ('Pitch Health Solutions Llc',           '202NJF00'),
  ('Providence Group',                     '202NFQ00'),
  ('Residual Brothers Llc',                '202KEZ00'),
  ('Rl Advisors',                          '202KYC00'),
  ('Senior Benefits Agency Llc',           '202NEG00'),
  ('Senior Services Direct',               '202NE400'),
  ('Signature Medicare Solutions',         '202NG100'),
  ('Silver Care Advisors Llc',             '202NNB00'),
  ('Steel City Financial Services Inc.',   '202GDY00'),
  ('The Premier Agency Llc',               '202ACY00'),
  ('Trucare Insurance Group Inc',          '202NJC00'),
  ('Wealth Alliance Group',                '202AYX00'),
  ('Wisechoice Senior Advisors Llc',       '202LAX00')
) AS m(agency_name, wn)
WHERE public.agencies.name = m.agency_name;
