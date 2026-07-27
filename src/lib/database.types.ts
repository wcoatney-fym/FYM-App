export type UserRole = 'agent' | 'manager' | 'admin';
export type AtRiskStatus = 'new' | 'assigned' | 'contacted' | 'saved' | 'lost';
export type FlagType = 'payment_failed' | 'no_contact' | 'rate_action' | null;
export type AgencyVariant = 'brent_melanie' | 'fym_direct';
export type CompTier = '60' | '65' | '70' | '75';

export interface Database {
  public: {
    Tables: {
      agencies: {
        Row: {
          id: string;
          tracker_id: string | null;
          name: string;
          slug: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['agencies']['Row'], 'id' | 'created_at' | 'updated_at' | 'is_active'> & {
          id?: string;
          is_active?: boolean;
        };
        Update: Partial<Database['public']['Tables']['agencies']['Insert']>;
        Relationships: [];
      };
      profiles: {
        Row: {
          id: string;
          role: UserRole;
          agency_id: string | null;
          full_name: string | null;
          npn: string | null;
          writing_number: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['profiles']['Row'], 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['profiles']['Insert']>;
        Relationships: [];
      };
      policy_cache: {
        Row: {
          policy_number: string;
          agent_id: string | null;
          agency_id: string;
          product_type: 'HI' | 'HHC' | null;
          status: string | null;
          plan_premium: number | null;
          billing_mode: string | null;
          policy_effective_date: string | null;
          paid_to_date: string | null;
          draft_count: number;
          last_contact_date: string | null;
          flag_type: FlagType;
          is_at_risk: boolean;
          synced_at: string;
        };
        Insert: Omit<Database['public']['Tables']['policy_cache']['Row'], 'synced_at'>;
        Update: Partial<Database['public']['Tables']['policy_cache']['Insert']>;
        Relationships: [];
      };
      atrisk_tasks: {
        Row: {
          id: string;
          policy_number: string;
          agency_id: string;
          assigned_to: string | null;
          assigned_by: string | null;
          status: AtRiskStatus;
          flag_type: string | null;
          due_date: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['atrisk_tasks']['Row'], 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['atrisk_tasks']['Insert']>;
        Relationships: [];
      };
      atrisk_notes: {
        Row: {
          id: string;
          task_id: string;
          author_id: string;
          body: string;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['atrisk_notes']['Row'], 'id' | 'created_at'>;
        Update: never;
        Relationships: [];
      };
      onboarding_agencies: {
        Row: {
          id: string;
          agency_id: string | null;
          slug: string;
          agency_name: string;
          principal_name: string | null;
          principal_email: string | null;
          roadmap_progress: Record<string, boolean>;
          active: boolean;
          variant: AgencyVariant;
          comp_tier: CompTier;
          created_at: string;
          updated_at: string;
          last_visited_at: string | null;
        };
        Insert: {
          slug: string;
          agency_name: string;
          agency_id?: string | null;
          principal_name?: string | null;
          principal_email?: string | null;
          roadmap_progress?: Record<string, boolean>;
          active?: boolean;
          variant?: AgencyVariant;
          comp_tier?: CompTier;
          last_visited_at?: string | null;
        };
        Update: Partial<Database['public']['Tables']['onboarding_agencies']['Insert']>;
        Relationships: [];
      };
    };
    Views: {
      agent_health_scores: {
        Row: {
          agent_id: string;
          active_count: number;
          retained_count: number;
          ever_drafted_count: number;
          persistency_score: number;
          payment_method_score: number;
          contact_recency_score: number;
          product_diversity_score: number;
          total_score: number;
        };
        Relationships: [];
      };
      agency_leaderboard: {
        Row: {
          agent_id: string;
          full_name: string | null;
          agency_id: string | null;
          writing_number: string | null;
          active_count: number;
          total_score: number;
          persistency_score: number;
          payment_method_score: number;
          contact_recency_score: number;
          product_diversity_score: number;
          agency_rank: number;
          fym_rank: number;
        };
        Relationships: [];
      };
      atrisk_exposure: {
        Row: {
          agency_id: string;
          agent_id: string | null;
          agent_name: string | null;
          at_risk_count: number;
          at_risk_monthly_premium: number | null;
          recoverable_premium: number | null;
          no_contact_premium: number | null;
          rate_action_premium: number | null;
        };
        Relationships: [];
      };
      agency_concentration: {
        Row: {
          agency_id: string | null;
          active_count: number | null;
          active_premium: number | null;
          at_risk_count: number | null;
          at_risk_premium: number | null;
          at_risk_pct: number | null;
          premium_concentration_pct: number | null;
        };
        Relationships: [];
      };
      agency_cohort_retention: {
        Row: {
          agency_id: string | null;
          agency_name: string | null;
          product_type: string | null;
          cohort_month: string | null;
          cohort_size: number | null;
          drafted_first: number | null;
          retained: number | null;
          retention_pct: number | null;
          active_premium: number | null;
          active_annual_premium: number | null;
        };
        Relationships: [];
      };
      agency_retention_overview: {
        Row: {
          agency_id: string | null;
          agency_name: string | null;
          total_eligible: number | null;
          ever_drafted: number | null;
          retained: number | null;
          retention_pct: number | null;
          active_policies: number | null;
          active_annual_premium: number | null;
          at_risk_count: number | null;
          prior_3mo_retention_pct: number | null;
          recent_3mo_retention_pct: number | null;
        };
        Relationships: [];
      };
      agency_retention_summary: {
        Row: {
          agency_id: string | null;
          active_policies: number | null;
          active_premium: number | null;
          at_risk_count: number | null;
          retained_90d: number | null;
          eligible_90d: number | null;
          retention_pct: number | null;
        };
        Relationships: [];
      };
      cohort_retention: {
        Row: {
          product_type: string | null;
          cohort_month: string | null;
          cohort_size: number | null;
          drafted_first: number | null;
          retained: number | null;
          retention_pct: number | null;
          active_premium: number | null;
        };
        Relationships: [];
      };
      monthly_production: {
        Row: {
          month: string;
          agency_id: string;
          product_type: string;
          policies: number;
          monthly_premium: number;
          annual_premium: number;
          active_count: number;
          terminated_count: number;
          pending_count: number;
        };
        Relationships: [];
      };
      agency_production: {
        Row: {
          agency_id: string;
          agency_name: string | null;
          total_policies: number;
          active_policies: number;
          terminated_policies: number;
          pending_policies: number;
          at_risk_policies: number;
          active_monthly_premium: number;
          active_annual_premium: number;
          avg_annual_premium: number;
          policies_this_month: number;
          ap_this_month: number;
          policies_last_month: number;
          ap_last_month: number;
        };
        Relationships: [];
      };
      agent_production: {
        Row: {
          agent_id: string | null;
          agent_name: string | null;
          writing_number: string | null;
          agency_id: string;
          agency_name: string | null;
          total_policies: number;
          active_policies: number;
          terminated_policies: number;
          pending_policies: number;
          at_risk_policies: number;
          active_monthly_premium: number;
          active_annual_premium: number;
          avg_annual_premium: number;
          policies_this_month: number;
          ap_this_month: number;
          retained_policies: number;
          ever_drafted: number;
          retention_pct: number | null;
        };
        Relationships: [];
      };
      book_of_business: {
        Row: {
          policy_number: string;
          agent_id: string | null;
          agent_name: string | null;
          writing_number: string | null;
          agency_id: string;
          agency_name: string | null;
          product_type: string;
          status: string;
          monthly_premium: number;
          annual_premium: number;
          billing_mode: string | null;
          policy_effective_date: string | null;
          paid_to_date: string | null;
          draft_count: number | null;
          is_at_risk: boolean;
          flag_type: string | null;
          last_contact_date: string | null;
          synced_at: string | null;
          days_since_paid: number | null;
        };
        Relationships: [];
      };
      manager_at_risk_board: {
        Row: {
          policy_number: string | null;
          agency_id: string | null;
          agent_id: string | null;
          product_type: string | null;
          plan_premium: number | null;
          flag_type: string | null;
          paid_to_date: string | null;
          policy_effective_date: string | null;
          draft_count: number | null;
          is_at_risk: boolean | null;
          synced_at: string | null;
          days_since_draft: number | null;
          task_id: string | null;
          task_status: AtRiskStatus | null;
          task_assigned_to: string | null;
          task_due_date: string | null;
          task_created_at: string | null;
        };
        Relationships: [];
      };
    };
    Functions: Record<string, never>;
    Enums: {
      user_role: UserRole;
      atrisk_status: AtRiskStatus;
    };
  };
}
