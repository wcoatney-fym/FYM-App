/**
 * Mock carrier upload — dry run against portal DB.
 * Parses the XLSX, runs the 3-tier match engine, produces a full report.
 * NO writes to the database.
 *
 * Usage: npx tsx scripts/mock-upload.ts <file-path> <carrier>
 */
import { readFileSync } from 'fs';
import { read as xlsxRead, utils as xlsxUtils } from 'xlsx';
import { createClient } from '@supabase/supabase-js';
import { parseManhattanReport } from '../src/lib/carrier-upload/parsers/manhattan';
import { parseGtlReport } from '../src/lib/carrier-upload/parsers/gtl';
import { matchAgents, matchAgencies } from '../src/lib/carrier-upload/match-engine';
import type { SupportedCarrier, CarrierParseResult } from '../src/lib/carrier-upload/types';

const PORTAL_URL = process.env.CONTRACTING_SUPABASE_URL;
const PORTAL_KEY = process.env.CONTRACTING_SUPABASE_ANON_KEY || process.env.CONTRACTING_SUPABASE_PUBLISHABLE_KEY;

if (!PORTAL_URL || !PORTAL_KEY) {
  console.error('Missing CONTRACTING_SUPABASE_URL or CONTRACTING_SUPABASE_ANON_KEY');
  process.exit(1);
}

const filePath = process.argv[2];
const carrier = (process.argv[3] || 'Manhattan') as SupportedCarrier;

if (!filePath) {
  console.error('Usage: npx tsx scripts/mock-upload.ts <file-path> <carrier>');
  process.exit(1);
}

async function main() {
  const supabase = createClient(PORTAL_URL!, PORTAL_KEY!);

  // 1. Read + parse
  console.log(`\n📄 Reading: ${filePath}`);
  console.log(`🏷️  Carrier: ${carrier}\n`);

  const buffer = readFileSync(filePath);
  const workbook = xlsxRead(buffer, { type: 'buffer' });

  console.log(`📊 Sheets: ${workbook.SheetNames.join(', ')}`);

  let parseResult: CarrierParseResult;

  if (carrier === 'Manhattan') {
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows = xlsxUtils.sheet_to_json<(string | number | null)[]>(sheet, {
      header: 1,
      raw: false,
      defval: null,
    });
    console.log(`📋 Rows (incl header): ${rows.length}`);
    parseResult = parseManhattanReport(rows);
  } else if (carrier === 'GTL') {
    const sheets: Record<string, (string | number | null)[][]> = {};
    for (const sheetName of workbook.SheetNames) {
      sheets[sheetName] = xlsxUtils.sheet_to_json<(string | number | null)[]>(
        workbook.Sheets[sheetName],
        { header: 1, raw: false, defval: null },
      );
    }
    parseResult = parseGtlReport(sheets);
  } else {
    console.error(`Unsupported carrier: ${carrier}`);
    process.exit(1);
  }

  console.log(`\n═══════════════════════════════════════════════════`);
  console.log(`  PARSE RESULTS`);
  console.log(`═══════════════════════════════════════════════════`);
  console.log(`  Agents parsed:   ${parseResult.agents.length}`);
  console.log(`  Agencies parsed: ${parseResult.agencies.length}`);
  console.log(`  Parse errors:    ${parseResult.parse_errors.length}`);

  if (parseResult.parse_errors.length > 0) {
    console.log(`\n  ⚠️  Parse Errors:`);
    for (const e of parseResult.parse_errors.slice(0, 10)) {
      console.log(`    Row ${e.row}: ${e.reason}`);
    }
    if (parseResult.parse_errors.length > 10) {
      console.log(`    ... and ${parseResult.parse_errors.length - 10} more`);
    }
  }

  // Show status breakdown
  const statusCounts = { active: 0, pending: 0, terminated: 0 };
  for (const a of parseResult.agents) {
    statusCounts[a.status]++;
  }
  console.log(`\n  Status breakdown:`);
  console.log(`    Active:     ${statusCounts.active}`);
  console.log(`    Pending:    ${statusCounts.pending}`);
  console.log(`    Terminated: ${statusCounts.terminated}`);

  // 2. Match against portal DB (read-only)
  console.log(`\n═══════════════════════════════════════════════════`);
  console.log(`  MATCHING AGAINST PORTAL DB (dry run — no writes)`);
  console.log(`═══════════════════════════════════════════════════\n`);

  const agentResults = await matchAgents(supabase, carrier, parseResult.agents);
  const agencyResults = await matchAgencies(supabase, carrier, parseResult.agencies);

  // 3. Build summary
  const exact = agentResults.filter((r) => r.match_tier === 'exact');
  const fuzzy = agentResults.filter((r) => r.match_tier === 'fuzzy');
  const none = agentResults.filter((r) => r.match_tier === 'none');
  const aliasResolved = agentResults.filter((r) => r.alias_resolved);
  const wnConflicts = agentResults.filter((r) => r.writing_number_conflict);

  const agencyExact = agencyResults.filter((r) => r.match_tier === 'exact');
  const agencyFuzzy = agencyResults.filter((r) => r.match_tier === 'fuzzy');
  const agencyNone = agencyResults.filter((r) => r.match_tier === 'none');
  const agencyAliasResolved = agencyResults.filter((r) => r.alias_resolved);

  console.log(`═══════════════════════════════════════════════════`);
  console.log(`  MATCH REPORT — ${carrier} Hierarchy Upload (DRY RUN)`);
  console.log(`═══════════════════════════════════════════════════`);
  console.log(`  📅 ${new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', dateStyle: 'medium', timeStyle: 'short' }).format(new Date())} CT`);
  console.log(``);
  console.log(`  ┌─────────────────────────────────────────────┐`);
  console.log(`  │  AGENT MATCHING                             │`);
  console.log(`  ├─────────────────────────────────────────────┤`);
  console.log(`  │  Total agents:        ${String(agentResults.length).padStart(6)}              │`);
  console.log(`  │  ✅ Exact matches:     ${String(exact.length).padStart(6)}              │`);
  console.log(`  │  🔗 Alias resolved:    ${String(aliasResolved.length).padStart(6)}              │`);
  console.log(`  │  🟡 Fuzzy matches:     ${String(fuzzy.length).padStart(6)}              │`);
  console.log(`  │  ❌ No matches:        ${String(none.length).padStart(6)}              │`);
  console.log(`  │  ⚠️  WN conflicts:      ${String(wnConflicts.length).padStart(6)}              │`);
  console.log(`  └─────────────────────────────────────────────┘`);
  console.log(``);
  console.log(`  ┌─────────────────────────────────────────────┐`);
  console.log(`  │  AGENCY MATCHING                            │`);
  console.log(`  ├─────────────────────────────────────────────┤`);
  console.log(`  │  Total agencies:      ${String(agencyResults.length).padStart(6)}              │`);
  console.log(`  │  ✅ Exact matches:     ${String(agencyExact.length).padStart(6)}              │`);
  console.log(`  │  🔗 Alias resolved:    ${String(agencyAliasResolved.length).padStart(6)}              │`);
  console.log(`  │  🟡 Fuzzy matches:     ${String(agencyFuzzy.length).padStart(6)}              │`);
  console.log(`  │  ❌ No matches:        ${String(agencyNone.length).padStart(6)}              │`);
  console.log(`  └─────────────────────────────────────────────┘`);

  // 4. Exact matches detail
  if (exact.length > 0) {
    console.log(`\n═══════════════════════════════════════════════════`);
    console.log(`  ✅ EXACT MATCHES (${exact.length}) — would auto-apply`);
    console.log(`═══════════════════════════════════════════════════`);
    for (const m of exact) {
      const via = m.alias_resolved ? '🔗 Alias' : '📛 Name';
      const wn = m.writing_number_conflict
        ? ` ⚠️ WN conflict: has ${m.existing_writing_number}, report says ${m.carrier_agent.carrier_writing_number}`
        : '';
      console.log(`  ${via} ${m.carrier_agent.raw_name} → ${m.matched_agent_name} [WN: ${m.carrier_agent.carrier_writing_number}] [${m.carrier_agent.status}]${wn}`);
    }
  }

  // 5. Fuzzy matches detail
  if (fuzzy.length > 0) {
    console.log(`\n═══════════════════════════════════════════════════`);
    console.log(`  🟡 FUZZY MATCHES (${fuzzy.length}) — need review`);
    console.log(`═══════════════════════════════════════════════════`);
    for (const m of fuzzy) {
      const wn = m.writing_number_conflict
        ? ` ⚠️ WN conflict`
        : '';
      console.log(`  ${m.carrier_agent.raw_name} → ${m.matched_agent_name} [${m.confidence}% confidence] [WN: ${m.carrier_agent.carrier_writing_number}] [${m.carrier_agent.status}]${wn}`);
    }
  }

  // 6. No matches detail
  if (none.length > 0) {
    console.log(`\n═══════════════════════════════════════════════════`);
    console.log(`  ❌ NO MATCHES (${none.length}) — need manual tie or add-new`);
    console.log(`═══════════════════════════════════════════════════`);
    for (const m of none) {
      const conf = m.confidence !== null ? ` [best ${m.confidence}%]` : '';
      const agency = m.carrier_agent.agency_name ? ` [Agency: ${m.carrier_agent.agency_name}]` : '';
      console.log(`  ${m.carrier_agent.raw_name} [WN: ${m.carrier_agent.carrier_writing_number}] [${m.carrier_agent.status}]${agency}${conf}`);
    }
  }

  // 7. Agency matches detail
  if (agencyResults.length > 0) {
    console.log(`\n═══════════════════════════════════════════════════`);
    console.log(`  🏢 AGENCY MATCHES (${agencyResults.length})`);
    console.log(`═══════════════════════════════════════════════════`);
    for (const a of agencyResults) {
      const tier = a.match_tier === 'exact' ? '✅' : a.match_tier === 'fuzzy' ? '🟡' : '❌';
      const via = a.alias_resolved ? ' 🔗 Alias' : '';
      const conf = a.confidence !== null && a.match_tier !== 'exact' ? ` [${a.confidence}%]` : '';
      const matched = a.matched_agency_name ? ` → ${a.matched_agency_name}` : '';
      console.log(`  ${tier} ${a.carrier_agency.raw_name} [${a.carrier_agency.carrier_number}]${matched}${conf}${via}`);
    }
  }

  // 8. WN Conflicts detail
  if (wnConflicts.length > 0) {
    console.log(`\n═══════════════════════════════════════════════════`);
    console.log(`  ⚠️  WRITING NUMBER CONFLICTS (${wnConflicts.length})`);
    console.log(`═══════════════════════════════════════════════════`);
    for (const m of wnConflicts) {
      console.log(`  ${m.carrier_agent.raw_name} → ${m.matched_agent_name}`);
      console.log(`    Existing WN: ${m.existing_writing_number}`);
      console.log(`    Report WN:   ${m.carrier_agent.carrier_writing_number}`);
    }
  }

  // 9. Parse errors detail
  if (parseResult.parse_errors.length > 0) {
    console.log(`\n═══════════════════════════════════════════════════`);
    console.log(`  🔴 PARSE ERRORS (${parseResult.parse_errors.length})`);
    console.log(`═══════════════════════════════════════════════════`);
    for (const e of parseResult.parse_errors) {
      console.log(`  Row ${e.row}: ${e.reason}`);
      console.log(`    Data: ${JSON.stringify(e.raw_data).slice(0, 120)}`);
    }
  }

  console.log(`\n═══════════════════════════════════════════════════`);
  console.log(`  🏁 DRY RUN COMPLETE — no data was written`);
  console.log(`═══════════════════════════════════════════════════\n`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
