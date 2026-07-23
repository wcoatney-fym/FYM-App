import type {
  StateRecord,
  ProductMeta,
  RoadmapWeek,
  ScriptSection,
  TrainingSession,
  Contact,
} from './types';

export const STATES_DATA: Record<string, StateRecord> = {
  AL: { name: 'Alabama', products: { hip: 'yes', gihip: 'yes', hhc: 'yes', dental: 'yes', cancer: 'yes', felife: 'yes' } },
  AZ: { name: 'Arizona', products: { hip: 'yes', gihip: 'yes', hhc: 'yes', dental: 'yes', cancer: 'yes', felife: 'yes' } },
  AR: { name: 'Arkansas', products: { hip: 'yes', gihip: 'yes', hhc: 'yes', dental: 'yes', cancer: 'yes', felife: 'yes' } },
  CO: { name: 'Colorado', products: { hip: 'yes', gihip: 'yes', hhc: 'yes', dental: 'yes', cancer: 'yes', felife: 'yes' } },
  DE: { name: 'Delaware', products: { hip: 'yes', gihip: 'yes', hhc: 'yes', dental: 'yes', cancer: 'no', felife: 'yes' } },
  FL: { name: 'Florida', products: { hip: 'new', gihip: 'yes', hhc: 'yes', dental: 'no', cancer: 'no', felife: 'yes' } },
  GA: { name: 'Georgia', products: { hip: 'yes', gihip: 'yes', hhc: 'yes', dental: 'yes', cancer: 'yes', felife: 'yes' } },
  ID: { name: 'Idaho', products: { hip: 'yes', gihip: 'yes', hhc: 'yes', dental: 'yes', cancer: 'yes', felife: 'yes' } },
  IL: { name: 'Illinois', products: { hip: 'yes', gihip: 'yes', hhc: 'yes', dental: 'yes', cancer: 'yes', felife: 'yes' } },
  IN: { name: 'Indiana', products: { hip: 'yes', gihip: 'yes', hhc: 'yes', dental: 'yes', cancer: 'yes', felife: 'yes' } },
  IA: { name: 'Iowa', products: { hip: 'yes', gihip: 'yes', hhc: 'yes', dental: 'yes', cancer: 'yes', felife: 'yes' } },
  KS: { name: 'Kansas', products: { hip: 'yes', gihip: 'yes', hhc: 'yes', dental: 'yes', cancer: 'yes', felife: 'yes' } },
  KY: { name: 'Kentucky', products: { hip: 'yes', gihip: 'yes', hhc: 'yes', dental: 'yes', cancer: 'yes', felife: 'yes' } },
  LA: { name: 'Louisiana', products: { hip: 'yes', gihip: 'yes', hhc: 'yes', dental: 'yes', cancer: 'yes', felife: 'yes' } },
  MD: { name: 'Maryland', products: { hip: 'yes', gihip: 'yes', hhc: 'no', dental: 'yes', cancer: 'no', felife: 'yes' } },
  MI: { name: 'Michigan', products: { hip: 'yes', gihip: 'yes', hhc: 'yes', dental: 'yes', cancer: 'yes', felife: 'yes' } },
  MN: { name: 'Minnesota', products: { hip: 'yes', gihip: 'yes', hhc: 'no', dental: 'yes', cancer: 'yes', felife: 'yes' } },
  MS: { name: 'Mississippi', products: { hip: 'yes', gihip: 'yes', hhc: 'yes', dental: 'yes', cancer: 'yes', felife: 'yes' } },
  MO: { name: 'Missouri', products: { hip: 'yes', gihip: 'yes', hhc: 'yes', dental: 'yes', cancer: 'yes', felife: 'yes' } },
  MT: { name: 'Montana', products: { hip: 'no', gihip: 'no', hhc: 'no', dental: 'no', cancer: 'no', felife: 'yes' } },
  NE: { name: 'Nebraska', products: { hip: 'yes', gihip: 'yes', hhc: 'yes', dental: 'yes', cancer: 'yes', felife: 'yes' } },
  NV: { name: 'Nevada', products: { hip: 'yes', gihip: 'yes', hhc: 'yes', dental: 'no', cancer: 'no', felife: 'yes' } },
  NM: { name: 'New Mexico', products: { hip: 'no', gihip: 'no', hhc: 'no', dental: 'no', cancer: 'no', felife: 'yes' } },
  NC: { name: 'North Carolina', products: { hip: 'yes', gihip: 'yes', hhc: 'yes', dental: 'yes', cancer: 'yes', felife: 'yes' } },
  ND: { name: 'North Dakota', products: { hip: 'yes', gihip: 'yes', hhc: 'no', dental: 'yes', cancer: 'yes', felife: 'yes' } },
  OH: { name: 'Ohio', products: { hip: 'yes', gihip: 'yes', hhc: 'yes', dental: 'yes', cancer: 'yes', felife: 'yes' } },
  OK: { name: 'Oklahoma', products: { hip: 'yes', gihip: 'yes', hhc: 'yes', dental: 'yes', cancer: 'yes', felife: 'yes' } },
  PA: { name: 'Pennsylvania', products: { hip: 'yes', gihip: 'yes', hhc: 'yes', dental: 'yes', cancer: 'yes', felife: 'yes' } },
  SC: { name: 'South Carolina', products: { hip: 'yes', gihip: 'yes', hhc: 'yes', dental: 'yes', cancer: 'yes', felife: 'yes' } },
  SD: { name: 'South Dakota', products: { hip: 'yes', gihip: 'yes', hhc: 'yes', dental: 'yes', cancer: 'yes', felife: 'yes' } },
  TN: { name: 'Tennessee', products: { hip: 'yes', gihip: 'yes', hhc: 'yes', dental: 'yes', cancer: 'yes', felife: 'yes' } },
  TX: { name: 'Texas', products: { hip: 'yes', gihip: 'yes', hhc: 'yes', dental: 'yes', cancer: 'yes', felife: 'yes' } },
  UT: { name: 'Utah', products: { hip: 'yes', gihip: 'yes', hhc: 'no', dental: 'yes', cancer: 'yes', felife: 'yes' } },
  VA: { name: 'Virginia', products: { hip: 'yes', gihip: 'yes', hhc: 'no', dental: 'yes', cancer: 'no', felife: 'yes' } },
  WV: { name: 'West Virginia', products: { hip: 'yes', gihip: 'yes', hhc: 'yes', dental: 'yes', cancer: 'yes', felife: 'yes' } },
  WI: { name: 'Wisconsin', products: { hip: 'yes', gihip: 'yes', hhc: 'no', dental: 'yes', cancer: 'yes', felife: 'yes' } },
  WY: { name: 'Wyoming', products: { hip: 'yes', gihip: 'yes', hhc: 'yes', dental: 'yes', cancer: 'yes', felife: 'yes' } },
};

export const PRODUCT_META: ProductMeta[] = [
  { key: 'hip',    name: 'HIP Shield',     ageBand: 'Ages 50-85', desc: 'Hospital Indemnity Protection - core HIP product.' },
  { key: 'gihip',  name: 'GI HIP Shield',  ageBand: 'Ages 50-85', desc: 'Guaranteed-issue HIP - last-resort for declined cases.' },
  { key: 'hhc',    name: 'HHC Shield',     ageBand: 'Ages 55-85', desc: 'Home Recovery Protection - pairs with HIP for full coverage.' },
  { key: 'dental', name: 'Dental 2.0',     ageBand: 'Ages 18-89', desc: 'Dental coverage with broad eligibility.' },
  { key: 'cancer', name: 'Cancer 2.0',     ageBand: 'Ages 18-85', desc: 'Cancer lump-sum benefit.' },
  { key: 'felife', name: 'FE Life (NEW)',  ageBand: 'Ages 18-84', desc: 'Final expense life insurance - newest addition.' },
];

export const ROADMAP_DATA: RoadmapWeek[] = [
  {
    week: 1,
    title: 'Kickoff & Tool Access',
    summary: "Get the launch scheduled, tools in your team's hands, and selling lanes confirmed.",
    tasks: [
      { id: 'w1-1', label: 'Schedule the kickoff call (60 min) with {primary} + FYM trainer', cta: { type: 'email', to: '{primaryEmail}', subject: 'Schedule FYM Kickoff Call' } },
      { id: 'w1-2', label: 'Send agent invites for kickoff with the Agency in a Box 1-pager attached' },
      { id: 'w1-3', label: 'Confirm UNL Quote Tool access for every agent', cta: { type: 'link', url: 'https://eapp.unlinsurance.com/', label: 'Open Quote Tool' } },
      { id: 'w1-4', label: 'Bookmark the Financial Modeler for agent income projections', cta: { type: 'link', url: '', label: 'Open Modeler' } },
      { id: 'w1-5', label: "Review state availability vs. your agency's licensure list", cta: { type: 'jump', to: 'states', label: 'Open State Lookup' } },
      { id: 'w1-6', label: "Add the 3x weekly FYM live training calls to every agent's calendar", cta: { type: 'jump', to: 'calendar', label: 'Add to Calendar' } },
      { id: 'w1-7', label: 'Send your distribution email list to {primary} for Friday reporting', cta: { type: 'email', to: '{primaryEmail}', subject: 'Friday Reporting Distribution List' } },
    ],
  },
  {
    week: 2,
    title: 'Training Begins',
    summary: 'Agents study real calls, get loaded into the simulator, and learn the scripts cold.',
    tasks: [
      { id: 'w2-1', label: 'Listen to 4 sample sales calls (provided by FYM at kickoff)' },
      { id: 'w2-2', label: 'Load agents into Simulated Training (SYMTRAIN) for live drills' },
      { id: 'w2-3', label: 'Join all 3 weekly FYM/UNL training calls for live Q&A', cta: { type: 'jump', to: 'calendar', label: 'See Schedule' } },
      { id: 'w2-4', label: 'Read the HIP Sales Script + UNL Call Checklist', cta: { type: 'jump', to: 'scripts', label: 'Open Scripts' } },
      { id: 'w2-5', label: 'FYMCRM: load Medicare clients and complete training' },
      { id: 'w2-6', label: 'For leaded agencies: load agents on Allcalls', cta: { type: 'email', to: '{secondaryEmail}', subject: 'Allcalls Onboarding' } },
      { id: 'w2-7', label: '15+ agents attending? Request a custom scaling track', cta: { type: 'email', to: '{primaryEmail}', subject: 'Custom Scaling Track Request' } },
    ],
  },
  {
    week: 3,
    title: 'Load Medicare Clients · Calls Begin',
    summary: 'Reps go live on real calls - cross-sell first, then transition to lead-mode in April.',
    tasks: [
      { id: 'w3-1', label: 'Reps begin on real calls, starting with the existing Medicare book' },
      { id: 'w3-2', label: 'Phase 1 (Oct-Mar): cross-sell after every Medicare enrollment' },
      { id: 'w3-3', label: 'Phase 2 (Apr-Sep): lead with HIP/HHC' },
      { id: 'w3-4', label: 'Daily or weekly huddle with the principal - what worked, what got pushback, who is stuck' },
      { id: 'w3-5', label: 'First applications submitted - weekly Friday reports begin' },
    ],
  },
  {
    week: 4,
    title: 'Refine & Coach',
    summary: "Top-performer share-outs, replicate what's working, and start the next wave.",
    tasks: [
      { id: 'w4-1', label: 'Top performer share-out - 5-min walkthrough of one win at the team huddle' },
      { id: 'w4-2', label: 'Join at least one weekly call with your team to share best practices' },
      { id: 'w4-3', label: 'Flag any agent needing extra coaching to {secondary}', cta: { type: 'email', to: '{secondaryEmail}', subject: 'Agent Coaching Request' } },
      { id: 'w4-4', label: 'Scale: bring more agents onto the model and run wave 2' },
    ],
  },
];

export const SCRIPT_SECTIONS: ScriptSection[] = [
  {
    n: 1, title: 'Opening Frame', subtitle: 'Inbound, confident',
    body: [
      { type: 'dialogue', text: '"Hi [Name], this is [Agent] with [Company]. How can I help you today?"' },
      { type: 'stage', text: 'Pause for the transfer agent to introduce the client.' },
      { type: 'dialogue', text: '"Thank you and it\'s a pleasure to talk with you today, [Client]. My role today is simple - we\'ll walk through solutions designed to help manage out-of-pocket hospital costs. We\'ll go over how people typically handle these expenses and see which level, if any, fits how you prefer to manage your savings."' },
      { type: 'dialogue', text: '"Before we get started, I do have to let you know this call is recorded for quality and training purposes."' },
      { type: 'coaching', text: 'Recording disclosure is non-negotiable. Always at the top of the call. No exceptions.' },
    ],
  },
  {
    n: 2, title: 'Retirement Problem Frame', subtitle: 'Savings, not income',
    body: [
      { type: 'dialogue', text: '"Once on Medicare, the biggest financial risk usually isn\'t income loss - it\'s unplanned expenses."' },
      { type: 'stage', text: 'Pause.' },
      { type: 'dialogue', text: '"When unexpected healthcare expenses come up, do you have a plan in place to cover them?"' },
      { type: 'stage', text: 'Pause. If they confirm an account, ask:' },
      { type: 'dialogue', text: '"Ok great, is that with Chase, Wells Fargo, Bank of America, or who are you with? And is that a checking or savings account?"' },
      { type: 'coaching', text: 'UNL requires a bank account - you cannot use a card. Verify a checking or savings account on the call before proceeding.' },
      { type: 'dialogue', text: 'If no plan: "If God forbid something happened and you had to pay for a hospital stay, where would those funds come from?"' },
      { type: 'coaching', text: 'Keep pressing until you verify an account. Do NOT pass this step without account verification.' },
    ],
  },
  {
    n: 3, title: 'Awareness', subtitle: 'Copays & disruption',
    body: [
      { type: 'dialogue', text: '"Medicare does an excellent job covering care, but hospital stays are still the largest gap in your coverage. The average stay in a hospital for a Medicare recipient is 7 days. Depending on your plan coverage, that can easily be a $1,000+ bill."' },
      { type: 'dialogue', text: '"How do you feel about spending several thousand dollars from [the account they named] for something you didn\'t plan for?"' },
      { type: 'coaching', text: "Let them label the discomfort. Don't step on the silence - that pause is the sale." },
    ],
  },
  {
    n: 4, title: 'Reframe', subtitle: 'Known vs. unknown',
    body: [
      { type: 'dialogue', text: '"Hospital indemnity doesn\'t replace Medicare. What it does is turn an unpredictable expense into a predictable one."' },
      { type: 'dialogue', text: '"Instead of wondering if you\'ll need to pull from savings later, you decide ahead of time how much protection you want."' },
      { type: 'dialogue', text: '"When you are hospitalized, UNL (or GTL) will mail you a check directly to pay the hospital bill. You can use this money however you\'d like - at the end of the day, it is just cash."' },
      { type: 'coaching', text: 'Never say "replaces Medicare" or "long-term care." Compliance violations both. The product works alongside Medicare; the cash is theirs to use however.' },
    ],
  },
  {
    n: 5, title: 'Bronze / Silver / Gold Introduction', subtitle: 'Tier the choice',
    body: [
      { type: 'dialogue', text: '"Most people choose one of three approaches depending on how much they need and can afford. My job is to help you pick affordable coverage that will stay in place so it is ready when you need it. Make sense?"' },
      { type: 'dialogue', text: '"We\'ll go over three options today and I\'ll explain how each one functions. Your job is to let me know which one fits your needs and budget best. Remember, I can always adjust if you want more or less coverage."' },
      { type: 'tier', label: 'BRONZE', text: '"The first option here is our Bronze option. It will cover [X] if you are hospitalized and costs [X] per month."' },
      { type: 'tier', label: 'SILVER', text: '"The second option here is our Silver option. It will cover [X] if you are hospitalized and costs [X] per month."' },
      { type: 'tier', label: 'GOLD', text: '"The last option here is our Gold option. It will cover [X] if you are hospitalized and costs [X] per month."' },
      { type: 'stage', text: 'Explain any riders if you added them at each tier.' },
    ],
  },
  {
    n: 6, title: 'Self-Selection', subtitle: 'Critical - let them choose',
    body: [
      { type: 'dialogue', text: '"Between Bronze, Silver, and Gold - which meets your needs and budget best?"' },
      { type: 'coaching', text: 'Stop talking. Let them choose. The agent who fills the silence loses the sale.' },
    ],
  },
  {
    n: 7, title: 'Start the Application Process', subtitle: 'Get the paperwork moving',
    body: [
      { type: 'dialogue', text: '"Great, let me pull up the paperwork to get this taken care of for you. Could you grab a pen and paper to write down my information and your policy information while I work on this?"' },
    ],
  },
  {
    n: 8, title: 'Post-Decision Wrap-Up', subtitle: 'Pending, approved, or follow-up',
    body: [
      { type: 'stage', text: 'IF THE APPLICATION IS PENDING (NOT APPROVED ON THE SPOT)' },
      { type: 'dialogue', text: '"Alright, I have gotten the application submitted for you! The carrier will review and let me know in a few days if you have been approved. I will give you a call then, and they will send your policy information to you in the mail. Is the number we are talking on a cell phone I can text? Great - let me text you my information. My office will also be texting you later, but I want you to have my personal line in case you need anything urgent. I will give you a call here in a few days letting you know when you have been approved and we are all done. Any final questions for me before we hop off the phone today?"' },
      { type: 'dialogue', text: '"Ok, perfect! Also, if you ever have any questions about your Medicare benefits, we are happy to help do a review and make sure your benefits are meeting your needs."' },
      { type: 'coaching', text: 'Only offer the Medicare review if they purchased a plan. Do NOT refer unless they enroll.' },
      { type: 'stage', text: 'SECOND CALL - APPROVAL CONFIRMED' },
      { type: 'dialogue', text: '"Hi [Client], it\'s [Agent] - I helped you with your hospital indemnity plan a few days ago. How are you? Great, well I just wanted to call to let you know that they approved your application! You will get your policy in the mail here in about a week. Make sure you keep that in a safe place with my number attached to it. This is my direct line I am calling you from, so you can call or text me anytime. As a reminder, if God forbid you are hospitalized or take an ambulance, please call me so I can help you file the claim. Do you have any questions about anything we went over? Ok perfect - well, you have a blessed day and let me know if you need anything! And if you have any family or friends that could use my help covering the gaps in their plans, please send them my way. Thank you and talk soon!"' },
      { type: 'stage', text: 'IF APPROVED ON THE SPOT' },
      { type: 'dialogue', text: '"Congratulations, your policy has been approved! You will get your policy in the mail here in about a week. Make sure you keep that in a safe place with my number attached to it. This is my direct line I am calling you from, so you can call or text me anytime. As a reminder, if God forbid you are hospitalized or take an ambulance, please call me so I can help you file a claim. Do you have any questions about anything we went over? Ok perfect - well, you have a blessed day and let me know if you need anything! And if you have any family or friends that could use my help covering the gaps in their plans, please send them my way. Thank you and talk soon!"' },
    ],
  },
];

export const TRAINING_SESSIONS: TrainingSession[] = [
  { title: 'FYM Live - Product & Script', desc: 'Agent-facing - UNL HIP & HHC product depth, current scripts, Q&A.', day: 'Tuesdays', dayOfWeek: 'TU', time: '12-1 PM CST', audience: 'All agents', meetingUrl: 'https://meet.google.com/apn-ucug-zrc' },
  { title: 'FYM Live - Sales Coaching', desc: 'Role play, objection handling, top-performer walkthroughs.', day: 'Wednesdays', dayOfWeek: 'WE', time: '12-1 PM CST', audience: 'All agents', meetingUrl: 'https://meet.google.com/apn-ucug-zrc' },
  { title: 'FYM Live - Compliance & Routing', desc: 'Prohibited language, GI suppression, recording protocol.', day: 'Fridays', dayOfWeek: 'FR', time: '12-1 PM CST', audience: 'All agents', meetingUrl: 'https://meet.google.com/apn-ucug-zrc' },
  { title: 'Principal Check-In with {primary}', desc: 'Strategy, escalation, planning. 30 min weekly cadence - flexible.', day: 'Flexible', time: '30 min', audience: 'Principal only', cta: { type: 'email', to: '{primaryEmail}', subject: 'Schedule Principal Check-In' } },
];

export const CONTACTS: Contact[] = [
  { role: 'FYM Onboarding & Contracting', name: 'Nell', email: 'nell@teamfym.com' },
  { role: 'FYM Lead Trainer', name: 'Tyler', email: 'tcole@teamfym.com' },
  { role: 'FYM Compliance', name: 'Zach', email: 'zach@teamfym.com' },
  { role: 'FYM CRM / Quote Tool Tech Support', name: 'Will', email: 'will@teamfym.com' },
  { role: 'FYM Agency Services (Advance & Comp)', name: 'Annmarie', email: 'annmarie@teamfym.com' },
  { role: 'UNL & GTL Carrier Support', name: 'UNL Agent Support', email: 'agentsupport@unlinsurance.com', phone: '(833) 735-5865' },
];

export const CHECKLIST_PRECALL = [
  'Verify the client has Medicare. Ask if they also have Medicaid.',
  "Confirm they're in a state you're licensed in.",
  'Ask whether they have Medicare Advantage or a Medicare Supplement.',
];

export const CHECKLIST_QUESTIONS = [
  { letter: 'a', label: 'Hospital cost framing', text: '"Most people don\'t know they\'ll have to pay $2,000-$3,000 per hospitalization. Would a $3,000 hospital bill be difficult for you to pay?"' },
  { letter: 'b', label: 'Care-setting preference', text: '"If something serious happened - a stroke or car accident - and you needed daily help, would you want that at home or in a nursing home?"' },
  { letter: 'c', label: 'Home healthcare cost framing', text: '"Most people don\'t know they\'ll pay $5,000 per month for home healthcare. Would you be able to pay $5,000 per month if something happened?"' },
  { letter: 'd', label: 'Prescription discovery', text: '"Do you take any prescription medications?" - Surfaces basic health issues and helps frame TPRX.' },
  { letter: 'e', label: 'Home healthcare qualification', text: '"Do you have Alzheimer\'s or dementia? Can you do all of your daily living activities?" - Required qualification questions for HHC.' },
];

export const COMPLIANCE_CHECKS = [
  'Recording disclosed up top',
  'Bank account verified before quoting',
  'No "replaces Medicare" / "long-term care" / "guaranteed approval"',
  'UW HIP first then HHC + rider then GI as last resort',
];

export const DOWNLOAD_FILES = [
  { name: 'HIP Sales Script (with coaching notes)',  desc: 'One-call close · Bronze/Silver/Gold framework',          icon: 'FileText',       href: '/activation/files/hip-sales-script.pdf' },
  { name: 'UNL Ancillary Call Checklist',            desc: 'Pre-call setup · routing · discovery prompts',           icon: 'ClipboardCheck', href: '/activation/files/unl-call-checklist.pdf' },
  { name: 'UNL Shield Series State Availability',    desc: 'State-by-state matrix · all 6 products · age bands',     icon: 'MapPin',         href: '/activation/files/shield-state-availability.pdf' },
  { name: 'FYM Tear Sheet — Agency in a Box',        desc: 'Partnership overview · tools · costs · transparency',    icon: 'Shield',         href: '/activation/files/fym-tear-sheet.docx' },
  { name: 'FYM Agency Recruitment Deck',             desc: 'For sharing with other agencies considering FYM',        icon: 'Users',          href: '/activation/files/fym-recruitment-deck.pptx' },
];

export interface SampleCall {
  id: string;
  title: string;
  subtitle: string;
  filename: string;
  takeaway: string;
}

export const SAMPLE_CALLS: SampleCall[] = [
  {
    id: 'hi-sale',
    title: 'Hospital Indemnity Sale',
    subtitle: 'Single-product close',
    filename: 'HI_SALE.mp3',
    takeaway: 'Clean tier presentation and a confident first-ask close on the HI standalone product.',
  },
  {
    id: 'hhc-sale',
    title: 'Home Health Care Sale',
    subtitle: 'Single-product close',
    filename: 'HHC_SALE.mp3',
    takeaway: 'How to frame Home Health Care as the "stay home" benefit and close without comparison shopping.',
  },
  {
    id: 'hhc-hi-combo',
    title: 'HHC + HI Combo Sale',
    subtitle: 'Two-product close',
    filename: 'HHC_AND_HI_COMBO_SALE.mp3',
    takeaway: 'Layering HI on top of an HHC sale — natural escalation, no pressure.',
  },
  {
    id: 'hhc-hi-combo-2',
    title: 'HHC + HI Combo Sale · Take Two',
    subtitle: 'Two-product close',
    filename: 'HHC_AND_HI_COMBO__2.mp3',
    takeaway: 'Another combo close, different objection pattern — useful contrast with the first combo example.',
  },
];
