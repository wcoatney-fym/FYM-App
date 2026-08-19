import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from '@/contexts/AuthContext';
import { AppLayout } from '@/components/layout/AppLayout';
import { RoleGuard } from '@/components/auth/RoleGuard';
import { LoginPage } from '@/pages/LoginPage';
import { ForgotPasswordPage } from '@/pages/ForgotPasswordPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { AgenciesPage } from '@/pages/AgenciesPage';
import { AgentsPage } from '@/pages/AgentsPage';
import { ContractingPage } from '@/pages/contracting';
import { CrmOpsPage } from '@/pages/CrmOpsPage';
import { CrmCommandPage } from '@/pages/CrmCommandPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { LeaderboardPage } from '@/pages/LeaderboardPage';
import { AgentHealthPage } from '@/pages/AgentHealthPage';
import { AgentDashboardPage } from '@/pages/AgentDashboardPage';
import { AgentTrainingPage } from '@/pages/AgentTrainingPage';
import { GoalPage } from '@/pages/GoalPage';
import { ManagerTeamPage } from '@/pages/ManagerTeamPage';
import { ManagerDashboardPage } from '@/pages/ManagerDashboardPage';
// AdminFinancialsPage removed — content migrated to ProductionPage
import { ManagerWorkboardPage } from '@/pages/ManagerWorkboardPage';
// Onboarding pages moved into Contracting tab — see contracting/onboarding/
import { ActivationPage } from '@/pages/ActivationPage';
import { AgencyDetailPage } from '@/pages/AgencyDetailPage';
import { ProductionPage } from '@/pages/ProductionPage';
import { AgencyProductionPage } from '@/pages/AgencyProductionPage';
import { AgentDetailPage } from '@/pages/agent-detail';
import { MyProductionPage } from '@/pages/my-production';
import { BookOfBusinessPage } from '@/pages/BookOfBusinessPage';
import { RetentionPage } from '@/pages/RetentionPage';
import { CoachingPage } from '@/pages/CoachingPage';
import { AtRiskPage } from '@/pages/AtRiskPage';
// GamificationPage removed — Compete content merged into LeaderboardPage
import { AgencyRosterPage } from '@/pages/AgencyRosterPage';
import { PeopleGroupPage } from '@/pages/groups/PeopleGroupPage';
import { ProductionGroupPage } from '@/pages/groups/ProductionGroupPage';
import { QualityGroupPage } from '@/pages/groups/QualityGroupPage';
import { RecruitingGroupPage, RecruitingDashboardTab, RecruitingLeadsTab, RecruitingAnalyticsTab } from '@/pages/recruiting';
import { DailyPulsePage } from '@/pages/DailyPulsePage';
import { CheckinMorePage } from '@/pages/CheckinMorePage';
import { Toaster } from 'sonner';
import { LifeOnly } from '@/pages/forms/LifeOnly';
import { Field as FieldForm } from '@/pages/forms/Field';
import { DirectPay as DirectPayForm } from '@/pages/forms/DirectPay';
import { Telesales as TelesalesForm } from '@/pages/forms/Telesales';
import { HIP as HIPForm } from '@/pages/forms/HIP';
import { ThankYou } from '@/pages/forms/ThankYou';

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public — Intake Forms (ported from contracting-portal) */}
          <Route path="/life" element={<LifeOnly />} />
          <Route path="/field" element={<FieldForm />} />
          <Route path="/direct-pay" element={<DirectPayForm />} />
          <Route path="/telesales" element={<TelesalesForm />} />
          <Route path="/hip" element={<HIPForm />} />
          <Route path="/hip-career" element={<HIPForm />} />
          <Route path="/hip-broker" element={<HIPForm />} />
          <Route path="/field-hip" element={<HIPForm />} />
          <Route path="/direct-pay-hip" element={<HIPForm />} />
          <Route path="/telesales-hip" element={<HIPForm />} />
          <Route path="/thank-you" element={<ThankYou />} />

          {/* Public — Auth */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/activate/:slug" element={<ActivationPage />} />
          <Route path="/checkin/more" element={<CheckinMorePage />} />

          {/* Protected — AppLayout enforces auth */}
          <Route element={<AppLayout />}>
            {/* Accessible to all roles */}
            <Route path="/" element={<DashboardPage />} />
            <Route path="/leaderboard" element={<LeaderboardPage />} />
            <Route path="/compete" element={<Navigate to="/leaderboard" replace />} />
            <Route path="/agents/:agentId/health" element={<RoleGuard allow={['admin', 'manager']}><AgentHealthPage /></RoleGuard>} />
            <Route path="/my-health" element={<AgentHealthPage />} />
            <Route path="/my-dashboard" element={<AgentDashboardPage />} />
            <Route path="/manager-dashboard" element={<RoleGuard allow={['admin', 'manager']}><ManagerDashboardPage /></RoleGuard>} />
            <Route path="/my-production" element={<MyProductionPage />} />
            <Route path="/my-goal" element={<GoalPage />} />
            <Route path="/training" element={<AgentTrainingPage />} />
            <Route path="/my-team" element={<RoleGuard allow={['admin', 'manager']}><ManagerTeamPage /></RoleGuard>} />
            <Route path="/settings" element={<SettingsPage />} />

            {/* ── People group (Agencies, Agents & Rosters) ── */}
            <Route path="/people" element={<RoleGuard allow={['admin', 'manager']}><PeopleGroupPage /></RoleGuard>}>
              <Route index element={<Navigate to="/people/agencies" replace />} />
              <Route path="agencies" element={<AgenciesPage />} />
              <Route path="agents" element={<AgentsPage />} />
              <Route path="rosters" element={<AgencyRosterPage />} />
              <Route path="onboarding" element={<Navigate to="/contracting?tab=onboarding" replace />} />
              <Route path="onboarding/new" element={<Navigate to="/contracting?tab=onboarding" replace />} />
              <Route path="onboarding/:slug" element={<Navigate to="/contracting?tab=onboarding" replace />} />
            </Route>
            {/* Agency detail stays at /agencies/:id for existing links */}
            <Route path="/agencies/:agencyId" element={<RoleGuard allow={['admin', 'manager']}><AgencyDetailPage /></RoleGuard>} />

            {/* ── Production group ── */}
            <Route path="/production" element={<RoleGuard allow={['admin', 'manager']}><ProductionGroupPage /></RoleGuard>}>
              <Route index element={<ProductionPage />} />
              <Route path="book" element={<RoleGuard allow={['admin']}><BookOfBusinessPage /></RoleGuard>} />
              {/* Financials tab removed — content migrated to Production Overview */}
            </Route>
            {/* Production drill-downs stay at existing paths */}
            <Route path="/production/:agencyId" element={<RoleGuard allow={['admin', 'manager']}><AgencyProductionPage /></RoleGuard>} />
            <Route path="/production/:agencyId/agent/:agentId" element={<RoleGuard allow={['admin', 'manager']}><AgentDetailPage /></RoleGuard>} />

            {/* ── Quality group (Retention, At-Risk, Coaching) ── */}
            <Route path="/quality" element={<QualityGroupPage />}>
              <Route index element={<Navigate to="/quality/retention" replace />} />
              <Route path="retention" element={<RoleGuard allow={['admin', 'manager']}><RetentionPage /></RoleGuard>} />
              <Route path="at-risk" element={<AtRiskPage />} />
              <Route path="coaching" element={<CoachingPage />} />
            </Route>

            {/* Standalone pages */}
            <Route path="/workboard" element={<RoleGuard allow={['admin', 'manager']}><ManagerWorkboardPage /></RoleGuard>} />
            <Route path="/contracting" element={<RoleGuard allow={['admin']}><ContractingPage /></RoleGuard>} />
            <Route path="/crm-ops" element={<RoleGuard allow={['admin', 'manager']}><CrmOpsPage /></RoleGuard>} />
            <Route path="/crm-command" element={<RoleGuard allow={['admin']}><CrmCommandPage /></RoleGuard>} />

            {/* ── Recruiting (FYM admin only) ── */}
            <Route path="/recruiting" element={<RoleGuard allow={[]} allowFymAdmin={true}><RecruitingGroupPage /></RoleGuard>}>
              <Route index element={<RecruitingDashboardTab />} />
              <Route path="leads" element={<RecruitingLeadsTab />} />
              <Route path="analytics" element={<RecruitingAnalyticsTab />} />
            </Route>
            <Route path="/rosters" element={<Navigate to="/people/rosters" replace />} />
            <Route path="/daily-pulse" element={<RoleGuard allow={['admin', 'manager']}><DailyPulsePage /></RoleGuard>} />

            {/* ── Legacy redirects — preserve old bookmarks ── */}
            <Route path="/agencies" element={<Navigate to="/people/agencies" replace />} />
            <Route path="/agents" element={<Navigate to="/people/agents" replace />} />
            <Route path="/onboarding" element={<Navigate to="/contracting?tab=onboarding" replace />} />
            <Route path="/book" element={<Navigate to="/production/book" replace />} />
            <Route path="/financials" element={<Navigate to="/production" replace />} />
            <Route path="/at-risk" element={<Navigate to="/quality/at-risk" replace />} />
            <Route path="/coaching" element={<Navigate to="/quality/coaching" replace />} />
            <Route path="/retention" element={<Navigate to="/quality/retention" replace />} />
          </Route>
        </Routes>
        <Toaster position="top-right" theme="dark" richColors />
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
