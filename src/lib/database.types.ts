export type UserRole = 'agent' | 'manager' | 'admin';
export type AtRiskStatus = 'new' | 'assigned' | 'contacted' | 'saved' | 'lost';
export type FlagType = 'at_risk' | null;
export type AgencyVariant = 'brent_melanie' | 'fym_direct';
export type CompTier = '60' | '65' | '70' | '75';

// Coaching pipeline enums
export type CoachingFlagType = 'production' | 'quality' | 'rts_watch';
export type CoachingStage = 'flagged' | 'assigned' | 'action_plan' | 'in_progress' | 'review' | 'resolved' | 'escalated';
export type CoachingRequirementType = 'training' | 'coaching_meeting' | 'live_attendance' | 'custom_task';
export type BattleType = 'agent_vs_agent' | 'agency_vs_agency';
export type GamificationMetric = 'policies' | 'ap' | 'retention';
export type BattleStatus = 'upcoming' | 'active' | 'completed';
export type ChallengeType = 'org_wide' | 'agency';
export type ParticipantType = 'agent' | 'agency';

export interface Database {
  public: {
    Tables: {
      agencies: {
        Row: {
          id: string;
          tracker_id: string | null;
          writing_number: string | null;
          name: string;
          slug: string | null;
          is_active: boolean;
          crm_enabled: boolean;
          app_login_email: string | null;
          app_login_password: string | null;
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
      agency_writing_numbers: {
        Row: {
          id: string;
          agency_id: string;
          carrier: string;
          writing_number: string;
          is_primary: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['agency_writing_numbers']['Row'], 'id' | 'created_at' | 'updated_at' | 'is_primary'> & {
          id?: string;
          is_primary?: boolean;
        };
        Update: Partial<Database['public']['Tables']['agency_writing_numbers']['Insert']>;
        Relationships: [
          { foreignKeyName: 'agency_writing_numbers_agency_id_fkey'; columns: ['agency_id']; referencedRelation: 'agencies'; referencedColumns: ['id'] }
        ];
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
      // policy_cache: DROPPED in migration 20260731000001_drop_policy_cache_layer.sql
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
          stage: string;
          priority: string;
          notes: string | null;
          last_contact_date: string | null;
          resolution: string | null;
          escalated_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['atrisk_tasks']['Row'], 'id' | 'created_at' | 'updated_at'> & {
          stage?: string;
          assigned_to?: string | null;
          priority?: string;
          notes?: string | null;
          last_contact_date?: string | null;
          resolution?: string | null;
          escalated_at?: string | null;
        };
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
      battles: {
        Row: {
          id: string;
          title: string;
          description: string | null;
          battle_type: BattleType;
          metric: GamificationMetric;
          start_date: string;
          end_date: string;
          status: BattleStatus;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          title: string;
          description?: string | null;
          battle_type?: BattleType;
          metric?: GamificationMetric;
          start_date: string;
          end_date: string;
          status?: BattleStatus;
          created_by?: string | null;
        };
        Update: Partial<Database['public']['Tables']['battles']['Insert']>;
        Relationships: [];
      };
      battle_participants: {
        Row: {
          id: string;
          battle_id: string;
          participant_type: ParticipantType;
          agent_id: string | null;
          agency_id: string | null;
          display_name: string;
          starting_value: number;
          current_value: number;
          is_winner: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          battle_id: string;
          participant_type?: ParticipantType;
          agent_id?: string | null;
          agency_id?: string | null;
          display_name: string;
          starting_value?: number;
          current_value?: number;
          is_winner?: boolean;
        };
        Update: Partial<Database['public']['Tables']['battle_participants']['Insert']>;
        Relationships: [];
      };
      challenges: {
        Row: {
          id: string;
          title: string;
          description: string | null;
          challenge_type: ChallengeType;
          target_agency_id: string | null;
          metric: GamificationMetric;
          goal_value: number;
          current_value: number;
          start_date: string;
          end_date: string;
          status: BattleStatus;
          is_achieved: boolean;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          title: string;
          description?: string | null;
          challenge_type?: ChallengeType;
          target_agency_id?: string | null;
          metric?: GamificationMetric;
          goal_value: number;
          current_value?: number;
          start_date: string;
          end_date: string;
          status?: BattleStatus;
          is_achieved?: boolean;
          created_by?: string | null;
        };
        Update: Partial<Database['public']['Tables']['challenges']['Insert']>;
        Relationships: [];
      };
      challenge_participants: {
        Row: {
          id: string;
          challenge_id: string;
          agent_id: string | null;
          agency_id: string | null;
          display_name: string;
          contribution: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          challenge_id: string;
          agent_id?: string | null;
          agency_id?: string | null;
          display_name: string;
          contribution?: number;
        };
        Update: Partial<Database['public']['Tables']['challenge_participants']['Insert']>;
        Relationships: [];
      };
      agency_roster_uploads: {
        Row: {
          id: string;
          agency_id: string;
          file_name: string;
          row_count: number;
          uploaded_by: string | null;
          uploaded_at: string;
          status: string;
        };
        Insert: {
          agency_id: string;
          file_name: string;
          row_count?: number;
          uploaded_by?: string | null;
          status?: string;
        };
        Update: Partial<Database['public']['Tables']['agency_roster_uploads']['Insert']>;
        Relationships: [];
      };
      agency_rosters: {
        Row: {
          id: string;
          upload_id: string;
          agency_id: string;
          first_name: string;
          last_name: string;
          email: string;
          phone: string;
          agent_npn: string;
          gender: string;
          unl_writing_number: string | null;
          gtl_writing_number: string | null;
          ahl_writing_number: string | null;
          heartland_writing_number: string | null;
          manhattan_writing_number: string | null;
          is_manager: boolean;
          status: string;
          termination_date: string | null;
          termination_reason: string | null;
          status_changed_at: string | null;
          status_changed_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          upload_id: string;
          agency_id: string;
          first_name: string;
          last_name: string;
          email: string;
          phone: string;
          agent_npn: string;
          gender: string;
          unl_writing_number?: string | null;
          gtl_writing_number?: string | null;
          ahl_writing_number?: string | null;
          heartland_writing_number?: string | null;
          manhattan_writing_number?: string | null;
          is_manager?: boolean;
          status?: string;
          termination_date?: string | null;
          termination_reason?: string | null;
          status_changed_at?: string | null;
          status_changed_by?: string | null;
        };
        Update: Partial<Database['public']['Tables']['agency_rosters']['Insert']>;
        Relationships: [];
      };
      admin_calendars: {
        Row: {
          id: string;
          user_id: string;
          label: string;
          calendar_url: string;
          is_primary: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          label?: string;
          calendar_url: string;
          is_primary?: boolean;
        };
        Update: Partial<Database['public']['Tables']['admin_calendars']['Insert']>;
        Relationships: [];
      };
      fym_admins: {
        Row: {
          id: string;
          user_id: string;
          added_by: string | null;
          created_at: string | null;
        };
        Insert: {
          user_id: string;
          added_by?: string | null;
        };
        Update: Partial<Database['public']['Tables']['fym_admins']['Insert']>;
        Relationships: [];
      };
      manager_notes: {
        Row: {
          id: string;
          author_id: string;
          author_name: string | null;
          policy_number: string | null;
          agent_writing_number: string | null;
          agent_name: string | null;
          body: string;
          notify_agent: boolean;
          acknowledged_at: string | null;
          acknowledged_by: string | null;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          author_id: string;
          body: string;
          author_name?: string | null;
          policy_number?: string | null;
          agent_writing_number?: string | null;
          agent_name?: string | null;
          notify_agent?: boolean;
          acknowledged_at?: string | null;
          acknowledged_by?: string | null;
          deleted_at?: string | null;
        };
        Update: Partial<Database['public']['Tables']['manager_notes']['Insert']>;
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
      // manager_at_risk_board: DROPPED in migration 20260731000001_drop_policy_cache_layer.sql
      roster_agent_summary: {
        Row: {
          id: string;
          upload_id: string;
          agency_id: string;
          first_name: string;
          last_name: string;
          email: string;
          phone: string;
          agent_npn: string;
          gender: string;
          unl_writing_number: string | null;
          gtl_writing_number: string | null;
          ahl_writing_number: string | null;
          heartland_writing_number: string | null;
          manhattan_writing_number: string | null;
          is_manager: boolean;
          status: string;
          created_at: string;
          updated_at: string;
          total_policies: number;
          active_policies: number;
          at_risk_policies: number;
          total_annual_premium: number;
          active_annual_premium: number;
        };
        Relationships: [];
      };
      // coaching_pipeline: DROPPED in migration 20260731000001_drop_policy_cache_layer.sql

      // ── Coaching Pipeline (added 20260824300001) ──────────────────────
      coaching_plans: {
        Row: {
          id: string;
          agency_id: string;
          roster_agent_id: string;
          flag_type: CoachingFlagType;
          stage: CoachingStage;
          assigned_to: string | null;
          assigned_at: string | null;
          flagged_at: string;
          deadline: string;
          resolved_at: string | null;
          escalated_at: string | null;
          trigger_metric: Record<string, unknown> | null;
          target_metric: Record<string, unknown> | null;
          resolution_note: string | null;
          resolution_type: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['coaching_plans']['Row'],
          'id' | 'created_at' | 'updated_at' | 'flagged_at'> & {
          id?: string;
          flagged_at?: string;
          stage?: CoachingStage;
        };
        Update: Partial<Database['public']['Tables']['coaching_plans']['Insert']>;
        Relationships: [];
      };
      coaching_requirements: {
        Row: {
          id: string;
          plan_id: string;
          requirement_type: CoachingRequirementType;
          training_content_id: string | null;
          meeting_scheduled_at: string | null;
          meeting_attended: boolean;
          meeting_notes: string | null;
          required_count: number | null;
          completed_count: number;
          title: string;
          description: string | null;
          is_completed: boolean;
          completed_at: string | null;
          completed_by: string | null;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['coaching_requirements']['Row'],
          'id' | 'created_at' | 'updated_at'> & {
          id?: string;
          meeting_attended?: boolean;
          completed_count?: number;
          is_completed?: boolean;
          sort_order?: number;
        };
        Update: Partial<Database['public']['Tables']['coaching_requirements']['Insert']>;
        Relationships: [];
      };
      coaching_notes: {
        Row: {
          id: string;
          plan_id: string;
          author_id: string;
          body: string;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['coaching_notes']['Row'], 'id' | 'created_at'> & {
          id?: string;
        };
        Update: Partial<Database['public']['Tables']['coaching_notes']['Insert']>;
        Relationships: [];
      };
      coaching_stage_history: {
        Row: {
          id: string;
          plan_id: string;
          from_stage: CoachingStage | null;
          to_stage: CoachingStage;
          changed_by: string | null;
          note: string | null;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['coaching_stage_history']['Row'], 'id' | 'created_at'> & {
          id?: string;
        };
        Update: Partial<Database['public']['Tables']['coaching_stage_history']['Insert']>;
        Relationships: [];
      };
    };
    // Functions dropped in migration 20260731000001_drop_policy_cache_layer.sql:
    // filtered_agency_production, filtered_agent_production,
    // filtered_monthly_production, filtered_daily_production
    Functions: Record<string, never>;
    Enums: {
      user_role: UserRole;
      atrisk_status: AtRiskStatus;
    };
  };
}
