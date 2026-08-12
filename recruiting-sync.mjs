import { createClient } from '@supabase/supabase-js';

const RECRUITING_LOCATION_ID = 'e7yV92T56bkUoGqsge8K';
const GHL_API_BASE = 'https://services.leadconnectorhq.com';

// Get GHL token from tracker DB
const trackerUrl = process.env.ACTIVITY_TRACKER_SUPABASE_URL;
const trackerKey = process.env.ACTIVITY_TRACKER_SUPABASE_PUBLISHABLE_KEY;
const tracker = createClient(trackerUrl, trackerKey);

const { data: tokenRow, error: tokenErr } = await tracker
  .from('ghl_location_tokens')
  .select('access_token, expires_at')
  .eq('location_id', RECRUITING_LOCATION_ID)
  .single();

if (tokenErr || !tokenRow) {
  console.error('Token fetch error:', tokenErr?.message || 'no data');
  process.exit(1);
}
console.log(`Token acquired, expires: ${tokenRow.expires_at}`);
const token = tokenRow.access_token;

const ATTENDEE_TAGS = [
  'opps call | attended',
  'hosp ind | opps call | attended',
  'hosp ind | opp call | attended',
  'opps call | attended | self reported',
];

const PIPELINE_STAGE_MAP = {
  'hip | career | hired': 'hired',
  'hip | broker | hired': 'hired',
  'hip | hired (auto send intake)': 'hired',
  'hired': 'hired',
  'not hired': 'lost',
  'not interested': 'lost',
};

const sleep = ms => new Promise(r => setTimeout(r, ms));

// Use POST /contacts/search for tag-filtered results
async function searchContacts(tag, pageLimit = 100) {
  const contacts = [];
  let page = 1;
  while (true) {
    const res = await fetch(`${GHL_API_BASE}/contacts/search`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Version: '2021-07-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        locationId: RECRUITING_LOCATION_ID,
        filters: [{ field: 'tags', operator: 'contains', value: tag }],
        page,
        pageLimit,
      }),
    });
    if (!res.ok) {
      console.error(`Search ${res.status}: ${(await res.text()).substring(0, 300)}`);
      break;
    }
    const data = await res.json();
    const batch = data.contacts || [];
    contacts.push(...batch);
    process.stdout.write(`\r  [${tag}] page ${page}: ${contacts.length}/${data.total || '?'}`);
    if (batch.length < pageLimit || contacts.length >= (data.total || Infinity)) break;
    page++;
    await sleep(100);
  }
  console.log('');
  return contacts;
}

// Fetch all contacts
async function fetchAllContacts(pageLimit = 100) {
  const contacts = [];
  let startAfterId;
  let page = 0;
  while (true) {
    page++;
    const url = new URL(`${GHL_API_BASE}/contacts/`);
    url.searchParams.set('locationId', RECRUITING_LOCATION_ID);
    url.searchParams.set('limit', String(pageLimit));
    if (startAfterId) url.searchParams.set('startAfterId', startAfterId);
    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}`, Version: '2021-07-28', Accept: 'application/json' },
    });
    if (!res.ok) break;
    const data = await res.json();
    if (!data.contacts?.length) break;
    contacts.push(...data.contacts);
    process.stdout.write(`\r  Page ${page}: ${contacts.length} contacts`);
    const nextId = data.meta?.startAfterId || data.contacts[data.contacts.length - 1]?.id;
    if (!nextId || data.contacts.length < pageLimit) break;
    startAfterId = nextId;
    await sleep(100);
  }
  console.log('');
  return contacts;
}

// Fetch pipelines and opportunities
async function fetchPipelinesAndOpps() {
  const pipRes = await fetch(`${GHL_API_BASE}/opportunities/pipelines?locationId=${RECRUITING_LOCATION_ID}`, {
    headers: { Authorization: `Bearer ${token}`, Version: '2021-07-28', Accept: 'application/json' },
  });
  if (!pipRes.ok) return { pipelines: [], opportunities: [] };
  const pipData = await pipRes.json();
  const recruitPipeline = (pipData.pipelines || []).find(p => p.name.toLowerCase().includes('agent recruiting'));
  if (!recruitPipeline) {
    console.log('No Agent Recruiting pipeline found');
    return { pipelines: pipData.pipelines || [], opportunities: [] };
  }
  console.log(`Pipeline: "${recruitPipeline.name}" — ${recruitPipeline.stages.length} stages`);

  // Fetch all opportunities from this pipeline
  const opportunities = [];
  let startAfterId;
  let page = 0;
  while (true) {
    page++;
    const url = new URL(`${GHL_API_BASE}/opportunities/search`);
    url.searchParams.set('location_id', RECRUITING_LOCATION_ID);
    url.searchParams.set('pipeline_id', recruitPipeline.id);
    url.searchParams.set('limit', '100');
    if (startAfterId) url.searchParams.set('startAfterId', startAfterId);
    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}`, Version: '2021-07-28', Accept: 'application/json' },
    });
    if (!res.ok) break;
    const data = await res.json();
    if (!data.opportunities?.length) break;
    opportunities.push(...data.opportunities);
    process.stdout.write(`\r  Opps page ${page}: ${opportunities.length}`);
    const nextId = data.meta?.startAfterId || data.opportunities[data.opportunities.length - 1]?.id;
    if (!nextId || data.opportunities.length < 100) break;
    startAfterId = nextId;
    await sleep(100);
  }
  console.log(`\n  Total opportunities: ${opportunities.length}`);

  return { pipelines: pipData.pipelines, opportunities, stageMap: Object.fromEntries(recruitPipeline.stages.map(s => [s.id, s.name])) };
}

// ── Main ──────────────────────────────────────────────────────────────────

console.log('\n1. Fetching recruiting leads by tag...');
const taggedContacts = await searchContacts('hosp ind | agent lead');
console.log(`   Tagged contacts (agent lead): ${taggedContacts.length}`);

// Dedup by contact ID
const contactMap = new Map();
for (const c of taggedContacts) contactMap.set(c.id, c);
console.log(`   Unique contacts: ${contactMap.size}`);

console.log('\n2. Fetching pipeline data...');
const { opportunities, stageMap } = await fetchPipelinesAndOpps();

// Build contact → opp mapping
const contactOpp = new Map();
for (const opp of opportunities) {
  const contactId = opp.contactId || opp.contact?.id;
  if (!contactId) continue;
  const stageName = (stageMap || {})[opp.pipelineStageId] || '';
  const mapped = PIPELINE_STAGE_MAP[stageName.toLowerCase()];
  if (mapped) {
    contactOpp.set(contactId, { stage: mapped, stageName, lastStageChangeAt: opp.lastStageChangeAt, createdAt: opp.createdAt });
  }
  // Also add any opp contacts that weren't in the tag search
  if (!contactMap.has(contactId) && opp.contact) {
    // Fetch the contact details if we don't have them
    contactMap.set(contactId, {
      id: contactId,
      name: opp.name?.split(' | ')[0] || 'Unknown',
      email: null, phone: null, tags: [], dateAdded: opp.createdAt
    });
  }
}

console.log(`\n3. Building upsert rows...`);
const now = new Date().toISOString();
let attendeeCount = 0, hiredCount = 0, lostCount = 0;

const rows = [];
for (const [, c] of contactMap) {
  const name = c.contactName || c.name || [c.firstName, c.lastName].filter(Boolean).join(' ') || 'Unknown';
  const tags = (c.tags || []).map(t => t.toLowerCase());
  const isAttendee = tags.some(t => ATTENDEE_TAGS.includes(t));
  const oppData = contactOpp.get(c.id);

  let stage = 'lead';
  if (oppData && oppData.stage === 'lost') {
    stage = 'lost';
    lostCount++;
  } else if (oppData) {
    stage = oppData.stage;
  } else if (isAttendee) {
    stage = 'attendee';
  }

  if (isAttendee) attendeeCount++;
  if (oppData && ['hired','contracting','rts','producing'].includes(oppData.stage)) hiredCount++;

  const leadAt = c.dateAdded || now;
  const stageOrder = ['lead','attendee','hired','contracting','rts','producing'];
  const idx = stageOrder.indexOf(stage);

  rows.push({
    ghl_contact_id: c.id,
    name,
    email: c.email || null,
    phone: c.phone || null,
    stage: stage === 'lost' ? 'lost' : stage,
    lead_at: leadAt,
    attendee_at: idx >= 1 ? (oppData?.lastStageChangeAt || leadAt) : null,
    hired_at: idx >= 2 ? (oppData?.lastStageChangeAt || leadAt) : null,
    contracting_at: idx >= 3 ? (oppData?.lastStageChangeAt || leadAt) : null,
    rts_at: idx >= 4 ? (oppData?.lastStageChangeAt || leadAt) : null,
    producing_at: idx >= 5 ? (oppData?.lastStageChangeAt || leadAt) : null,
    lost_at: stage === 'lost' ? (oppData?.lastStageChangeAt || now) : null,
    lost_stage: stage === 'lost' ? (oppData?.stageName || null) : null,
    updated_at: now,
  });
}

console.log(`   Total rows: ${rows.length}`);
console.log(`   Attendees: ${attendeeCount}, Hired+: ${hiredCount}, Lost: ${lostCount}`);

// Upsert via Management API
console.log('\n4. Upserting to rcbzag...');
const BATCH_SIZE = 100;
let upserted = 0, errors = 0;

for (let i = 0; i < rows.length; i += BATCH_SIZE) {
  const batch = rows.slice(i, i + BATCH_SIZE);
  const values = batch.map(r => {
    const esc = s => s === null ? 'NULL' : `'${String(s).replace(/'/g, "''")}'`;
    const ts = s => s === null ? 'NULL' : `'${String(s).replace(/'/g, "''")}'::timestamptz`;
    return `(${esc(r.ghl_contact_id)}, ${esc(r.name)}, ${esc(r.email)}, ${esc(r.phone)}, ${esc(r.stage)}, ${ts(r.lead_at)}, ${ts(r.attendee_at)}, ${ts(r.hired_at)}, ${ts(r.contracting_at)}, ${ts(r.rts_at)}, ${ts(r.producing_at)}, ${ts(r.lost_at)}, ${esc(r.lost_stage)}, ${ts(r.updated_at)})`;
  }).join(',\n');

  const sql = `INSERT INTO recruiting_leads (ghl_contact_id, name, email, phone, stage, lead_at, attendee_at, hired_at, contracting_at, rts_at, producing_at, lost_at, lost_stage, updated_at)
VALUES ${values}
ON CONFLICT (ghl_contact_id) DO UPDATE SET
  name = EXCLUDED.name, email = EXCLUDED.email, phone = EXCLUDED.phone, stage = EXCLUDED.stage,
  lead_at = EXCLUDED.lead_at,
  attendee_at = COALESCE(EXCLUDED.attendee_at, recruiting_leads.attendee_at),
  hired_at = COALESCE(EXCLUDED.hired_at, recruiting_leads.hired_at),
  contracting_at = COALESCE(EXCLUDED.contracting_at, recruiting_leads.contracting_at),
  rts_at = COALESCE(EXCLUDED.rts_at, recruiting_leads.rts_at),
  producing_at = COALESCE(EXCLUDED.producing_at, recruiting_leads.producing_at),
  lost_at = COALESCE(EXCLUDED.lost_at, recruiting_leads.lost_at),
  lost_stage = COALESCE(EXCLUDED.lost_stage, recruiting_leads.lost_stage),
  updated_at = EXCLUDED.updated_at`;

  const res = await fetch('https://api.supabase.com/v1/projects/rcbzagjyhyrkuwvlrlnf/database/query', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });

  if (res.ok) {
    upserted += batch.length;
    process.stdout.write(`\r   Upserted: ${upserted}/${rows.length}`);
  } else {
    const err = await res.text();
    console.error(`\n   Batch error: ${err.substring(0, 500)}`);
    errors++;
  }
}

console.log(`\n\n✅ Sync complete!`);
console.log(`   Contacts: ${contactMap.size}, Upserted: ${upserted}, Errors: ${errors}`);
console.log(`   Attendees: ${attendeeCount}, Hired+: ${hiredCount}, Lost: ${lostCount}`);

// Cleanup
process.exit(0);
