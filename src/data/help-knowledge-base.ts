/**
 * Help Chatbot — Knowledge Base
 *
 * Static FAQ entries for keyword-matching help bot.
 * No DB dependency — edit this file to add/update entries.
 *
 * Guidelines for adding entries:
 * - keywords: lowercase, include synonyms and common misspellings
 * - Multi-word keywords match when ALL words appear in user input
 * - answer: supports basic formatting (\n for line breaks)
 * - weight: default 1.0; bump to 1.5+ for high-priority / common questions
 * - links: optional deep links within the app (relative paths)
 */

export interface HelpEntry {
  id: string;
  category: 'carriers' | 'contracting' | 'app' | 'production' | 'training' | 'general';
  question: string;
  keywords: string[];
  answer: string;
  weight?: number;
  links?: { label: string; href: string }[];
}

export const HELP_ENTRIES: HelpEntry[] = [
  // ─── CARRIERS ──────────────────────────────────────────────
  {
    id: 'unl-contracting',
    category: 'carriers',
    question: 'How do I get contracted with UNL?',
    keywords: ['contracted', 'unl', 'contracting', 'united', 'national', 'life', 'appointment', 'unl appointment'],
    answer: 'To get contracted with UNL, your agency admin submits your info through the Contracting tab. You\'ll need your NPN, SSN, and state licenses on file. Once submitted, UNL typically processes appointments within 5-7 business days.',
    weight: 1.2,
    links: [{ label: 'Go to Contracting', href: '/contracting' }],
  },
  {
    id: 'gtl-contracting',
    category: 'carriers',
    question: 'How do I get contracted with GTL?',
    keywords: ['contracted', 'gtl', 'contracting', 'guaranteed', 'national', 'appointment', 'gtl appointment'],
    answer: 'GTL contracting follows the same flow — your agency admin submits through the Contracting tab. GTL appointments typically process within 3-5 business days. Make sure your NPN and state licenses are current.',
    weight: 1.0,
    links: [{ label: 'Go to Contracting', href: '/contracting' }],
  },
  {
    id: 'hi-vs-hhc',
    category: 'carriers',
    question: 'What\'s the difference between Hospital Indemnity and Home Health Care?',
    keywords: ['difference', 'hospital', 'indemnity', 'home', 'health', 'care', 'hi', 'hhc', 'vs', 'compare'],
    answer: 'Hospital Indemnity (HI) pays a daily cash benefit when the policyholder is admitted to the hospital. Home Health Care (HHC) covers in-home care services — nursing, therapy, aide visits — after a hospital stay or when medically necessary. HHC has a higher average annual premium (~$940 vs ~$530 for HI). Most agents sell both together as a package.',
    weight: 1.5,
  },
  {
    id: 'unl-commission-levels',
    category: 'carriers',
    question: 'What are UNL commission levels?',
    keywords: ['commission', 'commissions', 'unl', 'comp', 'pay', 'compensation', 'level', 'levels', 'rate', 'rates'],
    answer: 'Commission levels vary by product, hierarchy level, and contract. Your specific commission schedule is in your contracting paperwork. For questions about commission rates or adjustments, reach out to your upline or contact Zach on the compliance team.',
    weight: 1.0,
  },
  {
    id: 'unl-appointment-timeline',
    category: 'carriers',
    question: 'How long does a UNL appointment take?',
    keywords: ['long', 'appointment', 'unl', 'time', 'timeline', 'days', 'wait', 'processing', 'how long'],
    answer: 'UNL appointments typically take 5-7 business days once all paperwork is submitted and clean. If it\'s been longer than 10 business days, check your contracting status in the app or flag it to your admin — there may be a missing document or state license issue.',
    weight: 1.0,
    links: [{ label: 'Check Contracting Status', href: '/contracting' }],
  },
  {
    id: 'writing-states',
    category: 'carriers',
    question: 'What states can I write in?',
    keywords: ['states', 'state', 'write', 'licensed', 'license', 'where', 'territory', 'available'],
    answer: 'You can write in any state where you hold an active insurance license AND have an active carrier appointment. Your available states show up in your contracting profile. If you need to add a state, submit your license info through the Contracting tab and request the appointment.',
    weight: 1.0,
    links: [{ label: 'View Contracting Profile', href: '/contracting' }],
  },

  // ─── CONTRACTING ───────────────────────────────────────────
  {
    id: 'submit-new-agent',
    category: 'contracting',
    question: 'How do I submit a new agent for contracting?',
    keywords: ['submit', 'new', 'agent', 'contracting', 'add', 'hire', 'recruit', 'onboard'],
    answer: 'Go to the Contracting tab → Intake section. Click "New Agent" and fill out the intake form with the agent\'s NPN, SSN (last 4), name, email, phone, and state licenses. Once submitted, the agent enters the contracting pipeline and you can track their progress in the Tracking tab.',
    weight: 1.3,
    links: [{ label: 'Go to Intake', href: '/contracting' }],
  },
  {
    id: 'contracting-documents',
    category: 'contracting',
    question: 'What documents do I need for contracting?',
    keywords: ['documents', 'docs', 'paperwork', 'need', 'required', 'contracting', 'requirements'],
    answer: 'For contracting you\'ll need:\n• NPN (National Producer Number)\n• SSN (or last 4)\n• Active state insurance license(s)\n• E&O insurance (some carriers require it)\n• Voided check or direct deposit form for commissions\n\nYour agency admin handles the submission — make sure all docs are current before they submit.',
    weight: 1.2,
  },
  {
    id: 'check-contracting-status',
    category: 'contracting',
    question: 'How do I check my contracting status?',
    keywords: ['check', 'status', 'contracting', 'where', 'progress', 'tracking', 'pipeline', 'stage'],
    answer: 'Go to the Contracting tab → Tracking section. You\'ll see your agent\'s current pipeline stage, what steps are complete, and what\'s still pending. The Pipeline tab shows a Kanban-style view of all agents in the contracting flow.',
    weight: 1.1,
    links: [{ label: 'View Pipeline', href: '/contracting' }],
  },
  {
    id: 'appointment-stuck',
    category: 'contracting',
    question: 'My appointment is stuck — what do I do?',
    keywords: ['stuck', 'appointment', 'delayed', 'pending', 'waiting', 'hold', 'stalled', 'problem'],
    answer: 'If an appointment has been pending for more than 10 business days:\n1. Check the Tracking tab for any flagged issues (missing docs, license problems)\n2. Verify the agent\'s state licenses are active on NIPR\n3. If everything looks clean, flag it to your upline — they can escalate with the carrier directly.\n\nMost delays are caused by missing or expired licenses.',
    weight: 1.0,
    links: [{ label: 'Check Tracking', href: '/contracting' }],
  },
  {
    id: 'update-agent-info',
    category: 'contracting',
    question: 'How do I update my agent information?',
    keywords: ['update', 'change', 'edit', 'agent', 'information', 'info', 'profile', 'name', 'email', 'phone'],
    answer: 'Agent information can be updated in the Contracting tab → Database section. Find the agent, click their row to open the detail view, and edit the fields that need updating. Changes sync to the pipeline automatically.',
    weight: 1.0,
    links: [{ label: 'Agent Database', href: '/contracting' }],
  },

  // ─── APP USAGE ─────────────────────────────────────────────
  {
    id: 'read-leaderboard',
    category: 'app',
    question: 'How do I read the leaderboard?',
    keywords: ['leaderboard', 'read', 'understand', 'ranking', 'rank', 'score', 'standings'],
    answer: 'The Leaderboard ranks agencies and agents by key production metrics. Click any KPI card at the top to re-sort by that metric. The Executive Summary card shows your entity\'s performance at a glance. The Ramp Up board at the bottom highlights agents in their first 90 days.',
    weight: 1.0,
    links: [{ label: 'View Leaderboard', href: '/leaderboard' }],
  },
  {
    id: 'check-production',
    category: 'app',
    question: 'How do I check my production numbers?',
    keywords: ['production', 'numbers', 'check', 'my', 'policies', 'count', 'written', 'volume'],
    answer: 'Your production numbers are on the Dashboard — look for the production cards showing placed policies, premium volume, and retention rate. For detailed per-policy data, use the Book of Business view. Managers can see per-agent breakdowns in the Workboard.',
    weight: 1.2,
    links: [{ label: 'Go to Dashboard', href: '/dashboard' }],
  },
  {
    id: 'at-risk-meaning',
    category: 'app',
    question: 'What does "at risk" mean on a policy?',
    keywords: ['at', 'risk', 'meaning', 'mean', 'policy', 'flag', 'flagged', 'attention', 'warning'],
    answer: 'An "at risk" policy has signals that suggest it may lapse — for example, a failed premium draft, approaching term date, or billing mode change. These policies show up in the Needs Attention section and on the manager Workboard so your team can intervene before the policy lapses.',
    weight: 1.3,
    links: [{ label: 'View Needs Attention', href: '/needs-attention' }],
  },
  {
    id: 'use-workboard',
    category: 'app',
    question: 'How do I use the workboard?',
    keywords: ['workboard', 'work', 'board', 'use', 'tasks', 'assignments', 'manage'],
    answer: 'The Workboard is your manager command center for at-risk policies. It shows policies that need attention, sorted by urgency. You can assign actions, track follow-ups, and mark policies as resolved. Each card shows the policy details, risk flags, and a timeline of actions taken.',
    weight: 1.0,
    links: [{ label: 'Go to Workboard', href: '/workboard' }],
  },
  {
    id: 'export-data',
    category: 'app',
    question: 'How do I export data from the app?',
    keywords: ['export', 'download', 'csv', 'data', 'report', 'spreadsheet', 'excel'],
    answer: 'Look for the export/download icon (usually a down-arrow or "Export CSV" button) on tables and data views throughout the app. The Agent Database, Book of Business, and Tracking tabs all support CSV export. Click the button and your browser will download the file.',
    weight: 1.0,
  },
  {
    id: 'change-password',
    category: 'app',
    question: 'How do I change my password?',
    keywords: ['change', 'password', 'reset', 'forgot', 'login', 'credentials', 'sign', 'access'],
    answer: 'Go to Settings (gear icon in the sidebar). You can update your password there. If you\'re locked out, use the "Forgot Password" link on the login page — a reset link will be sent to your email on file.',
    weight: 1.0,
    links: [{ label: 'Go to Settings', href: '/settings' }],
  },

  // ─── PRODUCTION ────────────────────────────────────────────
  {
    id: 'data-update-timing',
    category: 'production',
    question: 'When does production data update?',
    keywords: ['when', 'update', 'data', 'refresh', 'sync', 'timing', 'frequency', 'daily', 'nightly'],
    answer: 'Production data syncs nightly from the carrier\'s daily production file. The sync typically completes by early morning CT. If you wrote a policy today, it should appear in the app by tomorrow morning. The exact timing depends on when the carrier publishes their file.',
    weight: 1.2,
  },
  {
    id: 'missing-policies',
    category: 'production',
    question: 'Why don\'t I see my latest policies?',
    keywords: ['missing', 'don\'t', 'see', 'latest', 'recent', 'policies', 'policy', 'showing', 'appear', 'not'],
    answer: 'If you don\'t see a recently written policy:\n1. Data syncs nightly — give it 24-48 hours after writing\n2. Check that the policy was submitted under the correct writing number\n3. UNL has a processing backlog — new policies may take 2-3+ weeks to appear in their system\n4. If it\'s been more than a week and the policy still doesn\'t show, flag it to your admin to verify with the carrier.',
    weight: 1.1,
  },
  {
    id: 'placed-definition',
    category: 'production',
    question: 'What counts as a "placed" policy?',
    keywords: ['placed', 'definition', 'counts', 'what', 'policy', 'count', 'qualify', 'criteria'],
    answer: 'A "placed" policy is one that has successfully drafted its first premium payment. The policy exists in the carrier\'s system and the first premium has been collected. This is distinct from "submitted" (paperwork sent) or "issued" (policy number assigned but not yet paid).',
    weight: 1.3,
  },
  {
    id: 'retention-calculation',
    category: 'production',
    question: 'How is 90-day retention calculated?',
    keywords: ['retention', '90', 'day', 'calculated', 'calculation', 'persistency', 'formula', 'metric'],
    answer: '90-day retention measures the percentage of policies that drafted a first premium AND also successfully drafted a third premium (for monthly billing). It tells us how many policies are sticking past the initial period. Target is ≥90% — this is the single most important metric we track.',
    weight: 1.5,
  },

  // ─── TRAINING ──────────────────────────────────────────────
  {
    id: 'training-videos',
    category: 'training',
    question: 'Where do I find training videos?',
    keywords: ['training', 'videos', 'video', 'watch', 'learn', 'tutorial', 'content'],
    answer: 'Training videos are in the Training tab (look for the graduation cap icon in the sidebar). Videos are organized by carrier and topic. You can track your progress and completion status there.',
    weight: 1.0,
    links: [{ label: 'Go to Training', href: '/training' }],
  },
  {
    id: 'carrier-training-materials',
    category: 'training',
    question: 'How do I access carrier training materials?',
    keywords: ['carrier', 'training', 'materials', 'brochure', 'guide', 'document', 'resource', 'unl', 'gtl'],
    answer: 'Carrier-specific training materials (brochures, state guides, product specs) are in the Training tab, organized by carrier. UNL and GTL each have their own section. If you need something that\'s not listed, ask your agency admin to request it.',
    weight: 1.0,
    links: [{ label: 'Go to Training', href: '/training' }],
  },
  {
    id: 'new-agent-orientation',
    category: 'training',
    question: 'Is there a new agent orientation?',
    keywords: ['new', 'agent', 'orientation', 'onboarding', 'getting', 'started', 'beginner', 'first'],
    answer: 'Yes! New agents go through an onboarding flow when they first join. Check the Training tab for orientation content and the Activation section for your onboarding roadmap. Your agency admin and upline manager can also walk you through the basics. If you\'re in your first 90 days, you\'ll show up on the Ramp Up board so your manager can track your progress.',
    weight: 1.0,
    links: [
      { label: 'Go to Training', href: '/training' },
      { label: 'View Onboarding', href: '/activation' },
    ],
  },

  // ─── GENERAL ───────────────────────────────────────────────
  {
    id: 'contact-support',
    category: 'general',
    question: 'Who do I contact for support?',
    keywords: ['contact', 'support', 'help', 'issue', 'problem', 'reach', 'phone', 'email', 'who'],
    answer: 'For app issues or technical support, flag it through this help chat — click "Yes" when I offer to escalate and the team will follow up. For carrier or contracting questions, reach out to your agency admin or upline manager. For compliance or commission questions, those go to Zach.',
    weight: 1.1,
  },
  {
    id: 'what-is-fym',
    category: 'general',
    question: 'What is FYM Financial?',
    keywords: ['fym', 'financial', 'what', 'about', 'company', 'who'],
    answer: 'FYM Financial is a Field Marketing Organization (FMO) focused on ancillary insurance products — Hospital Indemnity and Home Health Care — for the Medicare market. We distribute through 100+ sub-agencies nationwide and provide the tools, training, and support to help agents write quality business that sticks.',
    weight: 0.8,
  },
  {
    id: 'reach-upline',
    category: 'general',
    question: 'How do I reach my upline manager?',
    keywords: ['upline', 'manager', 'reach', 'contact', 'supervisor', 'boss', 'above'],
    answer: 'Your upline manager is listed in your agent profile. If you don\'t see their contact info, check the Agency Directory in the app or ask your agency admin. For FYM direct agents, your manager assignments are visible in the Coaching section.',
    weight: 1.0,
  },
];
