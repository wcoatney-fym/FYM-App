import {
  TeamMember, Task, LeadGenAd, LeadGenFollowUp,
  RecruitingAd, RecruitingFollowUp, RetentionAgent,
  PersistencyRecord, Placement, Cancellation, RevenueRecord,
  Workflow, ActivityItem, ChatMessage
} from './types';

export const mockTeamMembers: TeamMember[] = [
  { id: 'tm1', name: 'Sarah Chen', avatar: 'SC', role: 'Marketing Director', skills: { marketing: 9, sales: 6, tech: 7, recruiting: 4, retention: 5, ghl: 6 }, workload: 7, performanceScore: 92 },
  { id: 'tm2', name: 'Marcus Johnson', avatar: 'MJ', role: 'Senior Recruiter', skills: { marketing: 4, sales: 7, tech: 3, recruiting: 9, retention: 6, ghl: 4 }, workload: 8, performanceScore: 88 },
  { id: 'tm3', name: 'Elena Rodriguez', avatar: 'ER', role: 'Retention Specialist', skills: { marketing: 5, sales: 8, tech: 4, recruiting: 3, retention: 9, ghl: 5 }, workload: 6, performanceScore: 95 },
  { id: 'tm4', name: 'David Park', avatar: 'DP', role: 'Tech Lead', skills: { marketing: 6, sales: 3, tech: 10, recruiting: 2, retention: 4, ghl: 8 }, workload: 9, performanceScore: 90 },
  { id: 'tm5', name: 'Jasmine Williams', avatar: 'JW', role: 'Sales Manager', skills: { marketing: 7, sales: 9, tech: 5, recruiting: 6, retention: 7, ghl: 5 }, workload: 5, performanceScore: 87 },
  { id: 'tm6', name: 'Ryan O\'Brien', avatar: 'RO', role: 'Account Manager', skills: { marketing: 5, sales: 7, tech: 4, recruiting: 5, retention: 8, ghl: 4 }, workload: 6, performanceScore: 84 },
];

const lowConf = (level: number): { level: number; confidence: 'low' } => ({ level, confidence: 'low' });

export const fymTeamSeed: TeamMember[] = [
  {
    id: 'chris', name: 'Chris', avatar: 'CH', role: 'GHL + Marketing Campaign Lead',
    skills: { marketing: 8, sales: 7, tech: 6, recruiting: 5, retention: 6, ghl: 9 },
    proficiency: {
      marketing: lowConf(80), sales: lowConf(65), tech: lowConf(55),
      recruiting: lowConf(45), retention: lowConf(60), ghl: lowConf(85),
    },
    workload: 0, performanceScore: 0,
  },
  {
    id: 'charlie', name: 'Charlie', avatar: 'CB', role: 'Builder / Internal Tools',
    skills: { marketing: 6, sales: 5, tech: 9, recruiting: 5, retention: 5, ghl: 8 },
    proficiency: {
      marketing: lowConf(55), sales: lowConf(50), tech: lowConf(85),
      recruiting: lowConf(45), retention: lowConf(50), ghl: lowConf(80),
    },
    workload: 0, performanceScore: 0,
  },
  {
    id: 'joe', name: 'Joe', avatar: 'JO', role: 'Meta Ads & Creative',
    skills: { marketing: 9, sales: 6, tech: 5, recruiting: 6, retention: 5, ghl: 4 },
    proficiency: {
      marketing: lowConf(85), sales: lowConf(55), tech: lowConf(50),
      recruiting: lowConf(55), retention: lowConf(45), ghl: lowConf(40),
    },
    workload: 0, performanceScore: 0,
  },
  {
    id: 'major', name: 'Major', avatar: 'MA', role: 'Technical Support (EnrollHere/Twilio)',
    skills: { marketing: 4, sales: 4, tech: 8, recruiting: 4, retention: 5, ghl: 7 },
    proficiency: {
      marketing: lowConf(40), sales: lowConf(40), tech: lowConf(80),
      recruiting: lowConf(40), retention: lowConf(45), ghl: lowConf(70),
    },
    workload: 0, performanceScore: 0,
  },
];

export const mockTasks: Task[] = [
  { id: 't1', title: 'Launch Q3 Facebook Lead Gen Campaign', description: 'Set up and launch the new lead generation campaign targeting homeowners 35-55', assigneeId: 'tm1', priority: 'P1', category: 'Lead Gen', status: 'in_progress', difficulty: 7, dueDate: '2026-06-20', pipelineId: 'lead-gen-ads', createdAt: '2026-06-10', aiGenerated: true },
  { id: 't2', title: 'Follow up with 12 unresponsive leads', description: 'Re-engage leads that haven\'t responded in 48+ hours', assigneeId: 'tm5', priority: 'P1', category: 'Lead Gen', status: 'todo', difficulty: 4, dueDate: '2026-06-17', pipelineId: 'lead-gen-followup', createdAt: '2026-06-14', aiGenerated: true },
  { id: 't3', title: 'Interview 5 recruiter candidates', description: 'Conduct second-round interviews with shortlisted candidates', assigneeId: 'tm2', priority: 'P2', category: 'Recruiting', status: 'in_progress', difficulty: 6, dueDate: '2026-06-19', pipelineId: 'recruiting-followup', createdAt: '2026-06-12' },
  { id: 't4', title: 'Build retention dashboard automation', description: 'Create GHL workflow for at-risk agent alerts', assigneeId: 'tm4', priority: 'P2', category: 'Retention', status: 'in_progress', difficulty: 8, dueDate: '2026-06-22', pipelineId: 'retention', createdAt: '2026-06-11', aiGenerated: true },
  { id: 't5', title: 'Onboard 3 new agents', description: 'Complete onboarding process for newly recruited agents', assigneeId: 'tm2', priority: 'P1', category: 'Recruiting', status: 'todo', difficulty: 5, dueDate: '2026-06-18', pipelineId: 'recruiting-followup', createdAt: '2026-06-13' },
  { id: 't6', title: 'Process pending placement approvals', description: 'Follow up on 8 placements awaiting carrier approval', assigneeId: 'tm6', priority: 'P2', category: 'Revenue', status: 'review', difficulty: 3, dueDate: '2026-06-17', pipelineId: 'placements', createdAt: '2026-06-12' },
  { id: 't7', title: 'Analyze cancellation patterns', description: 'Deep dive on month-over-month cancellation reasons', assigneeId: 'tm3', priority: 'P3', category: 'Retention', status: 'backlog', difficulty: 6, dueDate: '2026-06-25', pipelineId: 'cancellations', createdAt: '2026-06-10' },
  { id: 't8', title: 'Update recruiting ad creative', description: 'Refresh ad copy and visuals for LinkedIn recruiting campaign', assigneeId: 'tm1', priority: 'P3', category: 'Recruiting', status: 'todo', difficulty: 5, dueDate: '2026-06-21', pipelineId: 'recruiting-ads', createdAt: '2026-06-14', aiGenerated: true },
  { id: 't9', title: 'Save 3 at-risk cancellations', description: 'Contact clients flagged for cancellation and attempt retention', assigneeId: 'tm3', priority: 'P1', category: 'Retention', status: 'in_progress', difficulty: 7, dueDate: '2026-06-16', pipelineId: 'cancellations', createdAt: '2026-06-14' },
  { id: 't10', title: 'Optimize Google Ads CPC', description: 'Reduce cost per click on underperforming ad groups', assigneeId: 'tm1', priority: 'P2', category: 'Lead Gen', status: 'backlog', difficulty: 6, dueDate: '2026-06-23', pipelineId: 'lead-gen-ads', createdAt: '2026-06-13', aiGenerated: true },
  { id: 't11', title: 'Prepare monthly revenue report', description: 'Compile and present revenue metrics to leadership', assigneeId: 'tm5', priority: 'P2', category: 'Revenue', status: 'todo', difficulty: 4, dueDate: '2026-06-20', createdAt: '2026-06-14' },
  { id: 't12', title: 'Run persistency audit', description: 'Review all policies at 11-month mark for lapse prevention', assigneeId: 'tm6', priority: 'P1', category: 'Retention', status: 'todo', difficulty: 5, dueDate: '2026-06-18', pipelineId: 'persistency', createdAt: '2026-06-15', aiGenerated: true },
  { id: 't13', title: 'Deploy CRM integration update', description: 'Push latest API changes to GHL CRM connector', assigneeId: 'tm4', priority: 'P3', category: 'Admin', status: 'done', difficulty: 9, dueDate: '2026-06-15', createdAt: '2026-06-08' },
  { id: 't14', title: 'Schedule team performance reviews', description: 'Book 1:1 meetings with all team members for quarterly review', assigneeId: 'tm5', priority: 'P4', category: 'Admin', status: 'backlog', difficulty: 2, dueDate: '2026-06-28', createdAt: '2026-06-10' },
];

export const mockLeadGenAds: LeadGenAd[] = [
  { id: 'la1', campaign: 'Q3 Homeowners 35-55', source: 'Facebook', spend: 4250, leads: 142, cpl: 29.93, status: 'active' },
  { id: 'la2', campaign: 'Life Insurance Awareness', source: 'Google', spend: 3100, leads: 89, cpl: 34.83, status: 'active' },
  { id: 'la3', campaign: 'Retirement Planning', source: 'Facebook', spend: 2800, leads: 76, cpl: 36.84, status: 'active' },
  { id: 'la4', campaign: 'Final Expense Direct', source: 'Google', spend: 1900, leads: 95, cpl: 20.00, status: 'active' },
  { id: 'la5', campaign: 'Medicare Supplement', source: 'Facebook', spend: 3500, leads: 110, cpl: 31.82, status: 'paused' },
  { id: 'la6', campaign: 'Young Families Protection', source: 'Instagram', spend: 1200, leads: 45, cpl: 26.67, status: 'completed' },
];

export const mockLeadGenFollowUp: LeadGenFollowUp[] = [
  { id: 'lf1', automation: 'New Lead - 5 Touch Sequence', responseRate: 34, appointmentSets: 48, showRate: 72, conversionRate: 28 },
  { id: 'lf2', automation: 'Re-engagement - Dormant Leads', responseRate: 12, appointmentSets: 15, showRate: 60, conversionRate: 18 },
  { id: 'lf3', automation: 'Hot Lead - Immediate Follow-up', responseRate: 62, appointmentSets: 89, showRate: 85, conversionRate: 42 },
  { id: 'lf4', automation: 'Referral Welcome Sequence', responseRate: 48, appointmentSets: 32, showRate: 78, conversionRate: 35 },
];

export const mockRecruitingAds: RecruitingAd[] = [
  { id: 'ra1', campaign: 'Insurance Career Change', spend: 2200, applications: 45, costPerRecruit: 48.89, status: 'active' },
  { id: 'ra2', campaign: 'Side Income Opportunity', spend: 1800, applications: 62, costPerRecruit: 29.03, status: 'active' },
  { id: 'ra3', campaign: 'Licensed Agent Upgrade', spend: 3100, applications: 28, costPerRecruit: 110.71, status: 'paused' },
];

export const mockRecruitingFollowUp: RecruitingFollowUp[] = [
  { id: 'rf1', candidate: 'Alex Thompson', stage: 'interview', daysInStage: 3 },
  { id: 'rf2', candidate: 'Maria Santos', stage: 'offer', daysInStage: 1 },
  { id: 'rf3', candidate: 'James Wilson', stage: 'onboarding', daysInStage: 7 },
  { id: 'rf4', candidate: 'Lisa Chen', stage: 'screening', daysInStage: 2 },
  { id: 'rf5', candidate: 'Kevin Brown', stage: 'productive', daysInStage: 14 },
  { id: 'rf6', candidate: 'Nina Patel', stage: 'applied', daysInStage: 1 },
  { id: 'rf7', candidate: 'Chris Morgan', stage: 'interview', daysInStage: 5 },
];

export const mockRetentionAgents: RetentionAgent[] = [
  { id: 'ret1', name: 'Agent Mike Torres', engagementScore: 92, atRisk: false, lastContact: '2026-06-14', policiesActive: 45 },
  { id: 'ret2', name: 'Agent Patricia Lee', engagementScore: 45, atRisk: true, lastContact: '2026-05-28', policiesActive: 23 },
  { id: 'ret3', name: 'Agent Robert Kim', engagementScore: 78, atRisk: false, lastContact: '2026-06-12', policiesActive: 38 },
  { id: 'ret4', name: 'Agent Angela Davis', engagementScore: 34, atRisk: true, lastContact: '2026-05-20', policiesActive: 12 },
  { id: 'ret5', name: 'Agent Thomas Wright', engagementScore: 88, atRisk: false, lastContact: '2026-06-15', policiesActive: 52 },
];

export const mockPersistency: PersistencyRecord[] = [
  { id: 'p1', policyId: 'POL-2025-001', month13: 94, month25: 88, lapseWarning: false, status: 'active' },
  { id: 'p2', policyId: 'POL-2025-002', month13: 72, month25: 0, lapseWarning: true, status: 'warning' },
  { id: 'p3', policyId: 'POL-2025-003', month13: 100, month25: 96, lapseWarning: false, status: 'active' },
  { id: 'p4', policyId: 'POL-2024-045', month13: 0, month25: 0, lapseWarning: false, status: 'lapsed' },
  { id: 'p5', policyId: 'POL-2025-004', month13: 85, month25: 0, lapseWarning: true, status: 'warning' },
];

export const mockPlacements: Placement[] = [
  { id: 'pl1', client: 'Johnson Family', product: 'Whole Life $500K', status: 'placed', premium: 4200, submittedDate: '2026-06-01' },
  { id: 'pl2', client: 'Williams Corp', product: 'Group Term Life', status: 'approved', premium: 12500, submittedDate: '2026-06-05' },
  { id: 'pl3', client: 'Chen Household', product: 'IUL $250K', status: 'pending', premium: 3100, submittedDate: '2026-06-10' },
  { id: 'pl4', client: 'Davis Trust', product: 'Annuity', status: 'submitted', premium: 50000, submittedDate: '2026-06-12' },
  { id: 'pl5', client: 'Martinez Family', product: 'Term 20 $1M', status: 'placed', premium: 1800, submittedDate: '2026-05-28' },
  { id: 'pl6', client: 'Park Estate', product: 'Final Expense', status: 'approved', premium: 850, submittedDate: '2026-06-08' },
];

export const mockCancellations: Cancellation[] = [
  { id: 'c1', client: 'Robert Smith', reason: 'Financial hardship', saveAttempt: true, saved: true, date: '2026-06-10', premium: 2400 },
  { id: 'c2', client: 'Jennifer Adams', reason: 'Found cheaper elsewhere', saveAttempt: true, saved: false, date: '2026-06-08', premium: 1800 },
  { id: 'c3', client: 'Tom Garcia', reason: 'No longer needed', saveAttempt: false, saved: false, date: '2026-06-12', premium: 950 },
  { id: 'c4', client: 'Linda Brown', reason: 'Agent non-responsive', saveAttempt: true, saved: true, date: '2026-06-14', premium: 3200 },
  { id: 'c5', client: 'Michael Taylor', reason: 'Policy restructure', saveAttempt: true, saved: true, date: '2026-06-11', premium: 5500 },
];

export const mockRevenue: RevenueRecord[] = [
  { id: 'r1', source: 'New Placements', projected: 45000, actual: 42300, commission: 12690, month: '2026-06' },
  { id: 'r2', source: 'Renewals', projected: 28000, actual: 29500, commission: 5900, month: '2026-06' },
  { id: 'r3', source: 'Recruiting Overrides', projected: 12000, actual: 10800, commission: 10800, month: '2026-06' },
  { id: 'r4', source: 'Bonuses & Incentives', projected: 8000, actual: 9200, commission: 9200, month: '2026-06' },
];

export const mockRevenueHistory = [
  { month: 'Jan', projected: 72000, actual: 68500 },
  { month: 'Feb', projected: 75000, actual: 74200 },
  { month: 'Mar', projected: 80000, actual: 82100 },
  { month: 'Apr', projected: 78000, actual: 76800 },
  { month: 'May', projected: 85000, actual: 88400 },
  { month: 'Jun', projected: 93000, actual: 91800 },
];

export const mockWorkflows: Workflow[] = [
  {
    id: 'wf1',
    name: 'New Lead Follow-up Sequence',
    description: 'Automated 5-touch follow-up for new leads from ads',
    nodes: [
      { id: 'n1', type: 'start', label: 'New Lead Received', position: { x: 250, y: 0 } },
      { id: 'n2', type: 'action', label: 'Send Welcome SMS', position: { x: 250, y: 100 } },
      { id: 'n3', type: 'delay', label: 'Wait 2 Hours', position: { x: 250, y: 200 } },
      { id: 'n4', type: 'action', label: 'Send Email #1', position: { x: 250, y: 300 } },
      { id: 'n5', type: 'decision', label: 'Responded?', position: { x: 250, y: 400 } },
      { id: 'n6', type: 'action', label: 'Book Appointment', position: { x: 100, y: 500 } },
      { id: 'n7', type: 'delay', label: 'Wait 24 Hours', position: { x: 400, y: 500 } },
      { id: 'n8', type: 'action', label: 'Phone Call', position: { x: 400, y: 600 } },
      { id: 'n9', type: 'end', label: 'Complete', position: { x: 250, y: 700 } },
    ],
    edges: [
      { id: 'e1', source: 'n1', target: 'n2' },
      { id: 'e2', source: 'n2', target: 'n3' },
      { id: 'e3', source: 'n3', target: 'n4' },
      { id: 'e4', source: 'n4', target: 'n5' },
      { id: 'e5', source: 'n5', target: 'n6', label: 'Yes' },
      { id: 'e6', source: 'n5', target: 'n7', label: 'No' },
      { id: 'e7', source: 'n7', target: 'n8' },
      { id: 'e8', source: 'n6', target: 'n9' },
      { id: 'e9', source: 'n8', target: 'n9' },
    ],
    createdAt: '2026-06-10',
  },
  {
    id: 'wf2',
    name: 'Agent Onboarding Process',
    description: 'Step-by-step onboarding for newly recruited agents',
    nodes: [
      { id: 'n1', type: 'start', label: 'Agent Signed', position: { x: 250, y: 0 } },
      { id: 'n2', type: 'action', label: 'Send Welcome Kit', position: { x: 250, y: 100 } },
      { id: 'n3', type: 'integration', label: 'Add to CRM', position: { x: 250, y: 200 } },
      { id: 'n4', type: 'action', label: 'Schedule Training', position: { x: 250, y: 300 } },
      { id: 'n5', type: 'delay', label: 'Training Period (7d)', position: { x: 250, y: 400 } },
      { id: 'n6', type: 'decision', label: 'Passed Exam?', position: { x: 250, y: 500 } },
      { id: 'n7', type: 'action', label: 'Assign Mentor', position: { x: 100, y: 600 } },
      { id: 'n8', type: 'action', label: 'Additional Training', position: { x: 400, y: 600 } },
      { id: 'n9', type: 'end', label: 'Productive Agent', position: { x: 250, y: 700 } },
    ],
    edges: [
      { id: 'e1', source: 'n1', target: 'n2' },
      { id: 'e2', source: 'n2', target: 'n3' },
      { id: 'e3', source: 'n3', target: 'n4' },
      { id: 'e4', source: 'n4', target: 'n5' },
      { id: 'e5', source: 'n5', target: 'n6' },
      { id: 'e6', source: 'n6', target: 'n7', label: 'Yes' },
      { id: 'e7', source: 'n6', target: 'n8', label: 'No' },
      { id: 'e8', source: 'n7', target: 'n9' },
      { id: 'e9', source: 'n8', target: 'n5' },
    ],
    createdAt: '2026-06-05',
  },
];

export const mockActivities: ActivityItem[] = [
  { id: 'a1', type: 'task', message: 'Sarah completed "Deploy CRM integration update"', timestamp: '2026-06-15T14:30:00Z' },
  { id: 'a2', type: 'pipeline', message: 'New placement approved: Williams Corp - Group Term Life ($12,500)', timestamp: '2026-06-15T13:15:00Z' },
  { id: 'a3', type: 'team', message: 'Marcus moved candidate Maria Santos to "Offer" stage', timestamp: '2026-06-15T11:45:00Z' },
  { id: 'a4', type: 'chat', message: 'ClawdBot generated 3 new priority tasks based on pipeline analysis', timestamp: '2026-06-15T10:00:00Z' },
  { id: 'a5', type: 'pipeline', message: 'Cancellation saved: Linda Brown retained ($3,200 premium preserved)', timestamp: '2026-06-14T16:20:00Z' },
  { id: 'a6', type: 'workflow', message: 'New workflow created: "New Lead Follow-up Sequence"', timestamp: '2026-06-14T15:00:00Z' },
  { id: 'a7', type: 'task', message: 'Elena started working on "Save 3 at-risk cancellations"', timestamp: '2026-06-14T14:00:00Z' },
  { id: 'a8', type: 'pipeline', message: 'Lead Gen campaign "Q3 Homeowners" hit 142 leads milestone', timestamp: '2026-06-14T12:30:00Z' },
];

export const mockChatHistory: ChatMessage[] = [
  {
    id: 'ch1',
    role: 'assistant',
    content: 'Good morning. I\'ve analyzed your pipeline data overnight. Three priorities demand immediate attention:\n\n1. **12 leads unresponsive for 48+ hours** - Every hour costs you conversion probability. Jasmine should hit these NOW.\n2. **Patricia Lee\'s engagement score dropped to 45** - She\'s your third-highest producer. If she lapses, that\'s $23K in annual override revenue gone.\n3. **Cancellation rate trending up 8% MoM** - The "found cheaper" reasons suggest your value proposition needs sharpening in the initial pitch.\n\nWhich fire do you want to tackle first?',
    timestamp: '2026-06-15T08:00:00Z',
  },
];

export const mockConversionFunnel = [
  { stage: 'Leads', count: 557 },
  { stage: 'Contacted', count: 389 },
  { stage: 'Appointments', count: 184 },
  { stage: 'Presentations', count: 142 },
  { stage: 'Applications', count: 89 },
  { stage: 'Placed', count: 62 },
];

export const mockTaskCompletionByMember = [
  { name: 'Sarah', completed: 14, inProgress: 3 },
  { name: 'Marcus', completed: 11, inProgress: 4 },
  { name: 'Elena', completed: 16, inProgress: 2 },
  { name: 'David', completed: 9, inProgress: 5 },
  { name: 'Jasmine', completed: 12, inProgress: 3 },
  { name: 'Ryan', completed: 10, inProgress: 2 },
];

export const mockCancellationTrend = [
  { month: 'Jan', rate: 3.2, count: 8 },
  { month: 'Feb', rate: 2.8, count: 6 },
  { month: 'Mar', rate: 3.5, count: 9 },
  { month: 'Apr', rate: 4.1, count: 11 },
  { month: 'May', rate: 3.8, count: 10 },
  { month: 'Jun', rate: 4.2, count: 12 },
];
