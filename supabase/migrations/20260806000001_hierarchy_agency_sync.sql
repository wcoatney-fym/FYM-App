-- Migration: Populate missing writing_numbers in agencies from hierarchy_agencies (portal DB)
--
-- Context: agencies table was originally seeded from Max's DB via static migration.
-- Only 28/103 agencies had writing_numbers populated. The hierarchy_agencies table
-- in the portal DB (akhojh) has 95 agencies with unl_writing_number values.
--
-- This migration populates writing_numbers for the 75 agencies that were missing them,
-- using name-matching against the hierarchy data. Going forward, the sync-agencies
-- edge function keeps this table in sync with hierarchy_agencies.
--
-- The writing_number values below come from the verified hierarchy_agencies audit
-- run on 2026-08-06 (three-way cross-reference: hierarchy ↔ rcbzag ↔ Max's prod DB).

-- Populate writing_numbers by name match
UPDATE public.agencies SET writing_number = m.wn, updated_at = now()
FROM (VALUES
  ('369 Insurance Inc',                    '202NPK00'),
  ('Aca Agent LLC',                        '202NLM00'),
  ('Agility Health Group LLC',             '202KTH00'),
  ('Aidmed Insurance LLC',                 '202NL800'),
  ('Alfred Robinson',                      '202JL300'),
  ('Ap Insurance Partners',                '202NL700'),
  ('Archon Insurance Agency, LLC',         '202NJR00'),
  ('Axia Senior Insurance Advisors',       '202JCT00'),
  ('Better Insurance Management',          '202NF700'),
  ('Blueprint Health Agency',              '202NG900'),
  ('Breelee-Cole, LLC',                    '202NF600'),
  ('Brooks Automation Empire LLC',         '202NFL00'),
  ('Brown Networking Solutions',           '202JW200'),
  ('BWL Insurance II LLC',                 '202NHJ00'),
  ('Charthern Consulting',                 '202JRM00'),
  ('Clearview Health Advisors',            '202BJN00'),
  ('Complete Care Solutions LC',           '202BJM00'),
  ('Crystal Coast Marketing Group',        '202NG400'),
  ('Dawkins Agency',                       '202JMB00'),
  ('Dh Insurance Group',                   '202NGA00'),
  ('E&E Financial Solutions LLC',          '202A9V00'),
  ('East West Senior Solutions LLC',       '202NFP00'),
  ('EF Marshall Agency',                   '202NG700'),
  ('Elite Insurance Group Agency, LLC',    '202NKX00'),
  ('Emery Insurance LLC',                  '202NN500'),
  ('Essential Health Affiliates LLC',      '202NGD00'),
  ('Evercare Insurance Inc',               '202NLH00'),
  ('Family Financial Consultants LLC',     '202JPD00'),
  ('Family First Insurance Advisors LLC',  '202NHK00'),
  ('Freedom Financial Consultants LLC',    '202JNZ00'),
  ('Gap Insurance Group LLC',              '202NM600'),
  ('Health Wise',                          '202NPC00'),
  ('Insure Choice',                        '202NM700'),
  ('Insure Health Now',                    '202NHH00'),
  ('Integrity Brokers LLC',                '202KRT00'),
  ('JAR Insurance Services',               '202NNK00'),
  ('JTM Insurance & Financial Group LLC',  '202NHR00'),
  ('KM&RM Solutions LLC',                  '202NMM00'),
  ('Legacy Family Advisors',               '202JLB00'),
  ('Local Heritage Benefits, LP',          '202JX600'),
  ('Longevity Capital Insurance, LLC',     '202KFZ00'),
  ('Magnolia Health Advisors',             '202NPH00'),
  ('Markham Financial Assurance',          '202DAX00'),
  ('Matthews Health Solutions LLC',        '202NG800'),
  ('Med Advantage Advisors',               '202NMD00'),
  ('Medicare Medical Benefits LLC',        '202JM200'),
  ('Miranda Breaux LLC',                   '202NF300'),
  ('MyHealthAngel Insurance LLC',          '202NEY00'),
  ('National Senior Benefit Advisors',     '202NGZ00'),
  ('National Underwriting Service LLC',    '202NFD00'),
  ('NFG Insurance Solutions Inc',          '202NM500'),
  ('Platinum Choice Healthcare LLC',       '202NFY00'),
  ('Platinum Shield Insurance LLC',        '202NFS00'),
  ('Reviva Health Group LLC',              '202NNL00'),
  ('Rhonda Ridgely Agency LLC',            '202JPC00'),
  ('Salud Network LLC',                    '202AJA00'),
  ('Savage Financial Group Inc',           '202NKR00'),
  ('Senior Health Advocates',              '202NFT00'),
  ('Senior Market Consultants LLC',        '202NFA00'),
  ('Senior Market Insurance LLC',          '202JCS00'),
  ('Shore Legacy Insurance, LLC',          '202NP400'),
  ('TG Squared Asset Consultants LLC',     '202KFE00'),
  ('The Possibilities Group, LLC',         '202BNR00'),
  ('Thirteen Five, LLC',                   '202JTX00'),
  ('UBG Insurance LLC',                    '202NML00'),
  ('Unified Growth Partners',              '202NPT00'),
  ('Valeir Insurance LLC',                 '202KNM00'),
  ('Vargas Investment Enterprises LLC',    '202NJE00'),
  ('Vivid Financial Services LLC',         '202JMJ00'),

  ('Yunicare Medical Solutions',           '202KPS00')
) AS m(agency_name, wn)
WHERE LOWER(public.agencies.name) = LOWER(m.agency_name)
  AND public.agencies.writing_number IS NULL;

-- Verify: count agencies with writing_numbers after migration
-- Expected: ~95+ (was 28 before)
SELECT
  COUNT(*) AS total_agencies,
  COUNT(writing_number) AS with_writing_number,
  COUNT(*) - COUNT(writing_number) AS without_writing_number
FROM public.agencies;
