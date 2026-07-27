export type Priority = 'P1' | 'P2' | 'P3' | 'P4';
export type TaskCategory = 'Lead Gen' | 'Recruiting' | 'Retention' | 'Revenue' | 'Admin';
export type TaskStatus = 'backlog' | 'todo' | 'in_progress' | 'review' | 'done';

/** The six competency categories tracked per team member. */
export type SkillCategoryKey =
  | 'marketing'
  | 'sales'
  | 'tech'
  | 'recruiting'
  | 'retention'
  | 'ghl';

/**
 * An evidence-backed proficiency score for a single skill category.
 * `level` is 0-100; `confidence` reflects how much real task evidence backs it.
 * Seeded members start 'low' confidence until tasks firm the number up.
 */
export interface SkillScore {
  level: number; // 0-100
  confidence: 'low' | 'medium' | 'high';
  lastEvidenceAt?: string;
  stale?: boolean;
}

export interface TeamMember {
  id: string;
  name: string;
  avatar: string;
  role: string;
  skills: {
    marketing: number;
    sales: number;
    tech: number;
    recruiting: number;
    retention: number;
    ghl: number;
  };
  /**
   * Evolving, evidence-weighted competency matrix. Optional so existing
   * mock/UI code that only reads `skills` keeps compiling. This is the
   * source of truth the growth model in src/lib/competency.ts adjusts.
   */
  proficiency?: {
    marketing: SkillScore;
    sales: SkillScore;
    tech: SkillScore;
    recruiting: SkillScore;
    retention: SkillScore;
    ghl: SkillScore;
  };
  workload: number;
  performanceScore: number;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  assigneeId: string;
  priority: Priority;
  category: TaskCategory;
  status: TaskStatus;
  difficulty: number; // 1-10
  dueDate: string;
  pipelineId?: string;
  createdAt: string;
  aiGenerated?: boolean;
  // --- Command Center task HQ additions (optional, non-breaking) ---
  /** Which competency this task exercises — drives skill growth on completion. */
  skillCategory?: SkillCategoryKey;
  /** Where the task originated. Reconciliation mismatches arrive as 'flag'. */
  source?: 'flag' | 'optimization' | 'manual';
  dueAt?: string;
  completedAt?: string;
  /** Whether it was completed on time — a multiplier in the growth model. */
  onTime?: boolean;
  /** Reopens/reworks dampen or dock skill gains. */
  reopenedCount?: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  taskSuggestion?: Task;
  workflowSuggestion?: string;
}

export interface PipelineMetric {
  label: string;
  value: string | number;
  change?: number;
  trend?: 'up' | 'down' | 'flat';
}

export interface LeadGenAd {
  id: string;
  campaign: string;
  source: string;
  spend: number;
  leads: number;
  cpl: number;
  status: 'active' | 'paused' | 'completed';
}

export interface LeadGenFollowUp {
  id: string;
  automation: string;
  responseRate: number;
  appointmentSets: number;
  showRate: number;
  conversionRate: number;
}

export interface RecruitingAd {
  id: string;
  campaign: string;
  spend: number;
  applications: number;
  costPerRecruit: number;
  status: 'active' | 'paused';
}

export interface RecruitingFollowUp {
  id: string;
  candidate: string;
  stage: 'applied' | 'screening' | 'interview' | 'offer' | 'onboarding' | 'productive';
  daysInStage: number;
}

export interface RetentionAgent {
  id: string;
  name: string;
  engagementScore: number;
  atRisk: boolean;
  lastContact: string;
  policiesActive: number;
}

export interface PersistencyRecord {
  id: string;
  policyId: string;
  month13: number;
  month25: number;
  lapseWarning: boolean;
  status: 'active' | 'lapsed' | 'warning';
}

export interface Placement {
  id: string;
  client: string;
  product: string;
  status: 'submitted' | 'approved' | 'placed' | 'pending';
  premium: number;
  submittedDate: string;
}

export interface Cancellation {
  id: string;
  client: string;
  reason: string;
  saveAttempt: boolean;
  saved: boolean;
  date: string;
  premium: number;
}

export interface RevenueRecord {
  id: string;
  source: string;
  projected: number;
  actual: number;
  commission: number;
  month: string;
}

export interface WorkflowNode {
  id: string;
  type: 'start' | 'action' | 'decision' | 'delay' | 'end' | 'integration';
  label: string;
  position: { x: number; y: number };
  data?: Record<string, string>;
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
}

export interface Workflow {
  id: string;
  name: string;
  description: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  createdAt: string;
}

export interface ActivityItem {
  id: string;
  type: 'task' | 'pipeline' | 'chat' | 'team' | 'workflow';
  message: string;
  timestamp: string;
  icon?: string;
}
