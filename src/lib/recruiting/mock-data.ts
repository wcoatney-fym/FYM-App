import type {
  Campaign, Lead, DailySpend, CampaignPerformance,
  AdSet, RoiByAgency, RoiByAgent, RecruitingKpis,
  RecruitingLead, RecruitingFunnel, StageTiming,
} from './types';

// ── Helper ─────────────────────────────────────────────────────────────────
function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

// ── Campaigns ──────────────────────────────────────────────────────────────
export const MOCK_CAMPAIGNS: Campaign[] = [
  {
    id: 'camp-1',
    name: 'HHC Summer Push',
    platform: 'facebook',
    status: 'active',
    startDate: daysAgo(45),
    endDate: null,
    totalSpend: 12_480,
    totalLeads: 312,
    cpl: 40.0,
    cpa: 178.29,
    contactRate: 0.68,
    closeRatio: 0.224,
    placedPolicies: 70,
  },
  {
    id: 'camp-2',
    name: 'HI Medicare Supp',
    platform: 'both',
    status: 'active',
    startDate: daysAgo(30),
    endDate: null,
    totalSpend: 8_750,
    totalLeads: 250,
    cpl: 35.0,
    cpa: 194.44,
    contactRate: 0.72,
    closeRatio: 0.18,
    placedPolicies: 45,
  },
  {
    id: 'camp-3',
    name: 'Spring Ancillary Blitz',
    platform: 'facebook',
    status: 'completed',
    startDate: daysAgo(90),
    endDate: daysAgo(46),
    totalSpend: 15_200,
    totalLeads: 420,
    cpl: 36.19,
    cpa: 152.0,
    contactRate: 0.74,
    closeRatio: 0.238,
    placedPolicies: 100,
  },
  {
    id: 'camp-4',
    name: 'Agent Recruiting — Q3',
    platform: 'instagram',
    status: 'paused',
    startDate: daysAgo(21),
    endDate: null,
    totalSpend: 3_200,
    totalLeads: 88,
    cpl: 36.36,
    cpa: 213.33,
    contactRate: 0.61,
    closeRatio: 0.17,
    placedPolicies: 15,
  },
];

// ── Leads ──────────────────────────────────────────────────────────────────
const FIRST_NAMES = ['James', 'Maria', 'Robert', 'Linda', 'David', 'Susan', 'Michael', 'Patricia', 'William', 'Barbara', 'Richard', 'Jennifer', 'Joseph', 'Elizabeth', 'Thomas', 'Margaret', 'Charles', 'Dorothy', 'Daniel', 'Nancy'];
const LAST_NAMES = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson', 'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin'];
const AGENCIES = ['Guide to Insure', 'Heritage Benefits Group', 'Patriot Senior Advisors', 'Liberty Medicare Solutions', 'Eagle Point Insurance', 'Summit Benefits', 'Pinnacle Senior Services', 'Horizon Medicare Group'];
const AGENTS = ['Tyler Cole', 'Sarah Bennett', 'Marcus Wright', 'Angela Torres', 'Derek Collins', 'Melissa Park', 'Jason Reed', 'Christina Lam'];
const LOST_REASONS = ['No answer after 5 attempts', 'Already has coverage', 'Not eligible', 'Price objection', 'Went with another carrier', 'Changed mind'];
const STATUSES: Lead['status'][] = ['new', 'contacted', 'quoted', 'placed', 'lost'];

function randomFrom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateLeads(count: number): Lead[] {
  const leads: Lead[] = [];
  for (let i = 0; i < count; i++) {
    const status = STATUSES[Math.floor(Math.random() * STATUSES.length)];
    const campaign = MOCK_CAMPAIGNS[Math.floor(Math.random() * MOCK_CAMPAIGNS.length)];
    const createdDaysAgo = Math.floor(Math.random() * 60) + 1;
    const firstName = randomFrom(FIRST_NAMES);
    const lastName = randomFrom(LAST_NAMES);

    leads.push({
      id: `lead-${i + 1}`,
      firstName,
      lastName,
      phone: `(${Math.floor(Math.random() * 900) + 100}) ${Math.floor(Math.random() * 900) + 100}-${Math.floor(Math.random() * 9000) + 1000}`,
      email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}${i}@email.com`,
      status,
      campaignId: campaign.id,
      campaignName: campaign.name,
      assignedAgency: status !== 'new' ? randomFrom(AGENCIES) : null,
      assignedAgent: status === 'quoted' || status === 'placed' || status === 'lost' ? randomFrom(AGENTS) : null,
      createdAt: daysAgo(createdDaysAgo),
      contactedAt: status !== 'new' ? daysAgo(createdDaysAgo - 1) : null,
      quotedAt: status === 'quoted' || status === 'placed' ? daysAgo(createdDaysAgo - 3) : null,
      placedAt: status === 'placed' ? daysAgo(createdDaysAgo - 7) : null,
      lostAt: status === 'lost' ? daysAgo(createdDaysAgo - 4) : null,
      lostReason: status === 'lost' ? randomFrom(LOST_REASONS) : null,
      notes: '',
    });
  }
  return leads.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export const MOCK_LEADS: Lead[] = generateLeads(150);

// ── Daily Spend (last 30 days, all campaigns combined) ─────────────────────
export const MOCK_DAILY_SPEND: DailySpend[] = Array.from({ length: 30 }, (_, i) => {
  const spend = Math.round((400 + Math.random() * 300) * 100) / 100;
  const leads = Math.floor(8 + Math.random() * 12);
  return {
    date: daysAgo(29 - i),
    spend,
    leads,
    cpl: Math.round((spend / leads) * 100) / 100,
  };
});

// ── Campaign Performance ───────────────────────────────────────────────────
function generateCampaignPerf(campaign: Campaign): CampaignPerformance {
  const days = Math.min(30, Math.floor((Date.now() - new Date(campaign.startDate).getTime()) / 86_400_000));
  const dailyData: DailySpend[] = Array.from({ length: days }, (_, i) => {
    const spend = Math.round((campaign.totalSpend / days + (Math.random() - 0.5) * 80) * 100) / 100;
    const leads = Math.max(1, Math.floor(campaign.totalLeads / days + (Math.random() - 0.5) * 5));
    return {
      date: daysAgo(days - 1 - i),
      spend: Math.max(0, spend),
      leads,
      cpl: Math.round((Math.max(1, spend) / leads) * 100) / 100,
    };
  });

  const totalLeads = campaign.totalLeads;
  const attendees = Math.floor(totalLeads * campaign.contactRate);
  const hired = Math.floor(attendees * 0.55);
  const contracting = Math.floor(hired * 0.8);
  const rts = Math.floor(contracting * 0.7);
  const producing = campaign.placedPolicies;
  const lost = Math.floor(totalLeads * 0.3);

  const adSets: AdSet[] = [
    { id: `${campaign.id}-as1`, name: 'Broad — 65+ Medicare', spend: campaign.totalSpend * 0.4, impressions: Math.floor(campaign.totalLeads * 120), clicks: Math.floor(campaign.totalLeads * 8), leads: Math.floor(campaign.totalLeads * 0.4), cpl: campaign.cpl * 0.95, ctr: 0.067 },
    { id: `${campaign.id}-as2`, name: 'Lookalike — Past Clients', spend: campaign.totalSpend * 0.35, impressions: Math.floor(campaign.totalLeads * 90), clicks: Math.floor(campaign.totalLeads * 7), leads: Math.floor(campaign.totalLeads * 0.35), cpl: campaign.cpl * 0.88, ctr: 0.078 },
    { id: `${campaign.id}-as3`, name: 'Interest — Health Insurance', spend: campaign.totalSpend * 0.25, impressions: Math.floor(campaign.totalLeads * 150), clicks: Math.floor(campaign.totalLeads * 5), leads: Math.floor(campaign.totalLeads * 0.25), cpl: campaign.cpl * 1.22, ctr: 0.033 },
  ];

  return { campaignId: campaign.id, campaignName: campaign.name, dailyData, funnel: { leads: totalLeads, attendees, hired, contracting, rts, producing, lost }, adSets };
}

export const MOCK_CAMPAIGN_PERFORMANCE: CampaignPerformance[] = MOCK_CAMPAIGNS.map(generateCampaignPerf);

// ── ROI by Agency ──────────────────────────────────────────────────────────
export const MOCK_ROI_BY_AGENCY: RoiByAgency[] = AGENCIES.map((name, i) => {
  const spend = Math.round(2000 + Math.random() * 8000);
  const leads = Math.floor(20 + Math.random() * 80);
  const placed = Math.floor(leads * (0.15 + Math.random() * 0.15));
  return {
    agencyId: `ag-${i + 1}`,
    agencyName: name,
    spend,
    leads,
    placed,
    cpa: placed > 0 ? Math.round((spend / placed) * 100) / 100 : 0,
    conversionRate: leads > 0 ? Math.round((placed / leads) * 1000) / 10 : 0,
  };
}).sort((a, b) => a.cpa - b.cpa);

// ── ROI by Agent ───────────────────────────────────────────────────────────
export const MOCK_ROI_BY_AGENT: RoiByAgent[] = AGENTS.map((name, i) => {
  const leads = Math.floor(10 + Math.random() * 40);
  const placed = Math.floor(leads * (0.15 + Math.random() * 0.2));
  return {
    agentId: `agt-${i + 1}`,
    agentName: name,
    agencyName: AGENCIES[i % AGENCIES.length],
    leads,
    placed,
    cpa: placed > 0 ? Math.round((MOCK_CAMPAIGNS[0].totalSpend / MOCK_CAMPAIGNS.length / placed) * 100) / 100 : 0,
    conversionRate: leads > 0 ? Math.round((placed / leads) * 1000) / 10 : 0,
  };
}).sort((a, b) => b.conversionRate - a.conversionRate);

// ── Aggregate KPIs ─────────────────────────────────────────────────────────
export const MOCK_KPIS: RecruitingKpis = {
  totalSpend: MOCK_CAMPAIGNS.reduce((s, c) => s + c.totalSpend, 0),
  totalLeads: MOCK_CAMPAIGNS.reduce((s, c) => s + c.totalLeads, 0),
  cpl: Math.round(MOCK_CAMPAIGNS.reduce((s, c) => s + c.totalSpend, 0) / MOCK_CAMPAIGNS.reduce((s, c) => s + c.totalLeads, 0) * 100) / 100,
  cpa: Math.round(MOCK_CAMPAIGNS.reduce((s, c) => s + c.totalSpend, 0) / MOCK_CAMPAIGNS.reduce((s, c) => s + c.placedPolicies, 0) * 100) / 100,
  contactRate: 0.69,
  closeRatio: 0.215,
  placedPolicies: MOCK_CAMPAIGNS.reduce((s, c) => s + c.placedPolicies, 0),
  activeAdSets: 6,
  spendDelta: 8.3,
  leadsDelta: 12.1,
  cplDelta: -3.5,
  cpaDelta: -5.2,
  // Pipeline KPIs
  totalRecruits: 88,
  attendeeRate: 0.614,
  hireRate: 0.537,
  rtsRate: 0.793,
  avgDaysToRts: 18.5,
  avgDaysToFirstSale: 32.0,
};

// ── Mock Recruiting Pipeline Leads ─────────────────────────────────────────
const RECRUIT_NAMES = [
  'Marcus Allen', 'Lisa Chen', 'Derek Johnson', 'Angela Torres', 'Brandon Smith',
  'Rachel Kim', 'Tyler Davis', 'Monica Patel', 'Jason Wright', 'Stephanie Hall',
  'Kevin Brooks', 'Diana Cruz', 'Ryan Mitchell', 'Samantha Lee', 'Nathan Cole',
  'Priya Sharma', 'Chris Wallace', 'Tiffany Moore', 'Brian Lopez', 'Jessica Nguyen',
  'Andrew Clark', 'Maria Gonzalez', 'Justin Reed', 'Lauren Taylor', 'Sean Murphy',
  'Ashley Park', 'Eric Foster', 'Vanessa Hill', 'Matthew Scott', 'Amber Young',
  'Daniel Ortiz', 'Brittany Ward', 'Alex Rivera', 'Courtney Barnes', 'Steven Bell',
  'Heather Cook', 'Gregory Turner', 'Megan Howard', 'Patrick Sullivan', 'Kayla Morgan',
];

const RECRUIT_LOST_REASONS = [
  'No-show to onboarding call', 'Changed career direction', 'Licensing issue',
  'Failed background check', 'Accepted other offer', 'Unresponsive after initial contact',
  'Not a good fit', 'Relocated out of state',
];

type MockStage = 'lead' | 'attendee' | 'hired' | 'contracting' | 'rts' | 'producing' | 'lost';

function generateRecruitingLeads(): RecruitingLead[] {
  const leads: RecruitingLead[] = [];
  // Distribution: 20 leads, 12 attendees, 8 hired, 6 contracting, 5 rts, 3 producing, 6 lost
  const stageDistribution: { stage: MockStage; count: number; lostStage?: MockStage }[] = [
    { stage: 'lead', count: 20 },
    { stage: 'attendee', count: 12 },
    { stage: 'hired', count: 8 },
    { stage: 'contracting', count: 6 },
    { stage: 'rts', count: 5 },
    { stage: 'producing', count: 3 },
    { stage: 'lost', count: 6 },
  ];

  let idx = 0;
  for (const { stage, count } of stageDistribution) {
    for (let i = 0; i < count && idx < RECRUIT_NAMES.length; i++, idx++) {
      const name = RECRUIT_NAMES[idx];
      const campaign = MOCK_CAMPAIGNS[Math.floor(Math.random() * MOCK_CAMPAIGNS.length)];
      const daysBack = Math.floor(Math.random() * 60) + 5;
      const leadDate = daysAgo(daysBack);

      const lead: RecruitingLead = {
        id: `rl-${idx + 1}`,
        name,
        email: `${name.split(' ')[0].toLowerCase()}.${name.split(' ')[1].toLowerCase()}@email.com`,
        phone: `(${Math.floor(Math.random() * 900) + 100}) ${Math.floor(Math.random() * 900) + 100}-${Math.floor(Math.random() * 9000) + 1000}`,
        stage,
        campaignId: campaign.id,
        campaignName: campaign.name,
        adSetId: `${campaign.id}-as${Math.floor(Math.random() * 3) + 1}`,
        adSetName: ['Broad — 65+ Medicare', 'Lookalike — Past Clients', 'Interest — Health Insurance'][Math.floor(Math.random() * 3)],
        npn: stage === 'rts' || stage === 'producing' ? `${10000000 + Math.floor(Math.random() * 89999999)}` : null,
        writingNumber: stage === 'rts' || stage === 'producing' ? `WN${1000 + idx}` : null,
        leadAt: leadDate,
        attendeeAt: ['attendee','hired','contracting','rts','producing'].includes(stage) ? daysAgo(daysBack - 3) : null,
        hiredAt: ['hired','contracting','rts','producing'].includes(stage) ? daysAgo(daysBack - 7) : null,
        contractingAt: ['contracting','rts','producing'].includes(stage) ? daysAgo(daysBack - 10) : null,
        rtsAt: ['rts','producing'].includes(stage) ? daysAgo(daysBack - 18) : null,
        producingAt: stage === 'producing' ? daysAgo(daysBack - 30) : null,
        lostAt: stage === 'lost' ? daysAgo(daysBack - Math.floor(Math.random() * 10)) : null,
        lostStage: stage === 'lost' ? (['lead', 'attendee', 'hired'] as MockStage[])[Math.floor(Math.random() * 3)] : null,
        lostReason: stage === 'lost' ? RECRUIT_LOST_REASONS[Math.floor(Math.random() * RECRUIT_LOST_REASONS.length)] : null,
        notes: null,
      };
      leads.push(lead);
    }
  }
  return leads;
}

export const MOCK_RECRUITING_LEADS: RecruitingLead[] = generateRecruitingLeads();

export const MOCK_RECRUITING_FUNNEL: RecruitingFunnel = {
  leads: 60,
  attendees: 37,
  hired: 22,
  contracting: 14,
  rts: 8,
  producing: 3,
  lost: 6,
};

export const MOCK_STAGE_TIMINGS: StageTiming[] = [
  { stage: 'lead', label: 'Lead → Attendee', avgDays: 3.2, medianDays: 2, count: 37 },
  { stage: 'attendee', label: 'Attendee → Hired', avgDays: 4.1, medianDays: 3, count: 22 },
  { stage: 'hired', label: 'Hired → Contracting', avgDays: 2.8, medianDays: 2, count: 14 },
  { stage: 'contracting', label: 'Contracting → RTS', avgDays: 8.4, medianDays: 7, count: 8 },
  { stage: 'rts', label: 'RTS → First Sale', avgDays: 14.0, medianDays: 11, count: 3 },
];
