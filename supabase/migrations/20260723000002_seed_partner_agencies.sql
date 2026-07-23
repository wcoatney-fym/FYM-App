/*
  # Seed onboarding_agencies from lpmyzp partner_agencies

  One-time data migration: copies all 20 existing partner agencies from
  the activation tool (lpmyzp) into FYM App (rcbzag).

  Preserves: slug, names, emails, variant, comp_tier, roadmap_progress,
  all timestamps (created_at, updated_at, last_visited_at).

  ON CONFLICT (slug) DO NOTHING — safe to re-run.
  agency_id left NULL — to be linked manually or via future matching logic.
*/

INSERT INTO onboarding_agencies (slug, agency_name, principal_name, principal_email, active, variant, comp_tier, roadmap_progress, created_at, updated_at, last_visited_at) VALUES
  ('h7k-mw9-tep-3qr-launch', 'Demo Agency', 'Sample Principal', NULL, true, 'brent_melanie', '70', '{}'::jsonb, '2026-05-13 20:43:15.96564+00'::timestamptz, '2026-05-23 13:57:07.200029+00'::timestamptz, '2026-05-23 13:57:06.949+00'::timestamptz),
  ('test-agency-inc-m1xu', 'Test Agency Inc', 'Jane Doe', 'jane@test.com', true, 'brent_melanie', '70', '{}'::jsonb, '2026-05-13 23:29:07.026203+00'::timestamptz, '2026-05-15 22:00:13.218464+00'::timestamptz, '2026-05-15 22:00:13.131+00'::timestamptz),
  ('tpa', 'TPA', 'Brent Crawley', 'brentc@tpaconnect.net', true, 'brent_melanie', '70', '{"w1-1": false}'::jsonb, '2026-05-14 19:46:04.306965+00'::timestamptz, '2026-05-16 00:01:24.267123+00'::timestamptz, '2026-05-16 00:01:24.175+00'::timestamptz),
  ('test-agency-75-luab', 'Test Agency 75', 'John Doe', 'jdoe@test.com', true, 'brent_melanie', '75', '{}'::jsonb, '2026-05-15 15:01:33.652194+00'::timestamptz, '2026-05-15 15:01:35.752454+00'::timestamptz, '2026-05-15 15:01:35.573+00'::timestamptz),
  ('texas-medical-care-plans', 'Texas Medical Care Plans', 'Andres Vargas', 'andres@texasmedicalcareplans.com', true, 'brent_melanie', '70', '{"w1-1": true, "w1-2": true, "w1-3": true, "w1-5": true}'::jsonb, '2026-05-15 17:14:02.325741+00'::timestamptz, '2026-05-20 19:35:10.487259+00'::timestamptz, '2026-05-20 19:34:34.621+00'::timestamptz),
  ('jar-insurance', 'JAR Insurance', 'Jim Roe', NULL, true, 'brent_melanie', '70', '{}'::jsonb, '2026-05-15 17:15:00.844816+00'::timestamptz, '2026-05-15 17:15:00.844816+00'::timestamptz, NULL),
  ('the-premier-agency', 'The Premier Agency', 'Brent Crawley', 'brentc@tpaconnect.net', true, 'brent_melanie', '70', '{"w1-1": true, "w1-2": true, "w1-3": true, "w1-4": true, "w1-5": true, "w2-1": true, "w2-2": true, "w2-3": true}'::jsonb, '2026-05-15 17:15:27.124621+00'::timestamptz, '2026-07-02 20:34:00.391769+00'::timestamptz, '2026-07-02 20:33:25.397+00'::timestamptz),
  ('president-s-club', 'President''s Club', NULL, NULL, true, 'fym_direct', '75', '{}'::jsonb, '2026-05-19 20:14:37.424102+00'::timestamptz, '2026-05-19 20:14:37.424102+00'::timestamptz, NULL),
  ('united-insurance-professionals', 'United Insurance Professionals', 'Waylon Artrip', 'Waylon@unitedinspros.com', true, 'fym_direct', '75', '{"w1-1": true, "w1-2": true, "w1-3": true, "w1-4": true, "w1-5": true, "w2-1": true, "w2-2": true, "w2-3": true, "w2-4": true}'::jsonb, '2026-05-19 20:23:11.960012+00'::timestamptz, '2026-07-06 12:54:54.434426+00'::timestamptz, '2026-07-06 12:54:53.864+00'::timestamptz),
  ('residual-brothers', 'Residual Brothers', 'Andy Caldwell', 'andy@residualbrothersllc.com', true, 'fym_direct', '75', '{"w1-1": true, "w1-2": true}'::jsonb, '2026-05-21 17:20:42.094046+00'::timestamptz, '2026-05-29 04:25:10.520927+00'::timestamptz, '2026-05-29 04:25:09.86+00'::timestamptz),
  ('highland-health-direct', 'Highland Health Direct', NULL, NULL, true, 'fym_direct', '75', '{}'::jsonb, '2026-05-21 19:46:55.200671+00'::timestamptz, '2026-05-21 19:46:55.200671+00'::timestamptz, NULL),
  ('american-senior-health', 'American Senior Health', NULL, NULL, true, 'fym_direct', '75', '{}'::jsonb, '2026-05-21 19:47:25.488693+00'::timestamptz, '2026-05-21 19:47:25.488693+00'::timestamptz, NULL),
  ('guide-to-insure', 'Guide to Insure', 'Logan Stizer', NULL, true, 'fym_direct', '70', '{"w1-1": true, "w1-2": true, "w1-3": true}'::jsonb, '2026-05-22 18:16:34.741329+00'::timestamptz, '2026-05-29 20:04:59.947218+00'::timestamptz, '2026-05-29 20:05:35.762+00'::timestamptz),
  ('cresso-health', 'Cresso Health', NULL, NULL, true, 'fym_direct', '75', '{}'::jsonb, '2026-05-28 17:32:10.755259+00'::timestamptz, '2026-05-28 17:32:10.755259+00'::timestamptz, NULL),
  ('everything-medicare', 'Everything Medicare', NULL, NULL, true, 'fym_direct', '75', '{}'::jsonb, '2026-05-28 19:53:03.165411+00'::timestamptz, '2026-05-28 19:53:03.165411+00'::timestamptz, NULL),
  ('asurepoint', 'Asurepoint', NULL, NULL, true, 'fym_direct', '75', '{}'::jsonb, '2026-05-28 21:41:16.037625+00'::timestamptz, '2026-05-28 21:41:16.037625+00'::timestamptz, NULL),
  ('partners-in-care', 'Partners in Care', 'Max Zemanick', 'max@picinsurancegroup.com', true, 'brent_melanie', '65', '{"w1-1": true, "w1-2": true, "w1-3": true, "w1-4": true, "w1-5": true}'::jsonb, '2026-06-11 18:35:29.973046+00'::timestamptz, '2026-06-11 22:10:30.017554+00'::timestamptz, '2026-06-11 22:10:29.294+00'::timestamptz),
  ('healthcare-123', 'Healthcare 123', NULL, NULL, true, 'fym_direct', '75', '{}'::jsonb, '2026-06-17 17:18:55.72429+00'::timestamptz, '2026-06-17 17:18:55.72429+00'::timestamptz, NULL),
  ('your-advantage-group', 'Your Advantage Group', NULL, NULL, true, 'fym_direct', '75', '{}'::jsonb, '2026-06-30 19:27:39.97818+00'::timestamptz, '2026-06-30 19:27:39.97818+00'::timestamptz, NULL),
  ('360-financial', '360 Financial', NULL, NULL, true, 'fym_direct', '75', '{}'::jsonb, '2026-07-08 21:22:06.655048+00'::timestamptz, '2026-07-08 21:22:06.655048+00'::timestamptz, NULL)
ON CONFLICT (slug) DO NOTHING;
