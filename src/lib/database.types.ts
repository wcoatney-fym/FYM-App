export type UserRole = 'agent' | 'manager' | 'admin';
export type AtRiskStatus = 'new' | 'assigned' | 'contacted' | 'saved' | 'lost';
export type FlagType = 'payment_failed' | 'no_contact' | 'rate_action' | null;

export interface Database {
  public: {
    Tables: {
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
      };
    };
    Functions: Record<string, never>;
    Enums: {
      user_role: UserRole;
      atrisk_status: AtRiskStatus;
    };
  };
}
