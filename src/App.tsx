import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from '@/contexts/AuthContext';
import { AppLayout } from '@/components/layout/AppLayout';
import { RoleGuard } from '@/components/auth/RoleGuard';
import { LoginPage } from '@/pages/LoginPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { AgenciesPage } from '@/pages/AgenciesPage';
import { AgentsPage } from '@/pages/AgentsPage';
import { ContractingPage } from '@/pages/contracting';
import { CrmOpsPage } from '@/pages/CrmOpsPage';
import { CrmCommandPage } from '@/pages/CrmCommandPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { LeaderboardPage } from '@/pages/LeaderboardPage';
import { AgentHealthPage } from '@/pages/AgentHealthPage';
import { AgentProvisioningPage } from '@/pages/AgentProvisioningPage';
import { AdminFinancialsPage } from '@/pages/AdminFinancialsPage';
import { ManagerWorkboardPage } from '@/pages/ManagerWorkboardPage';
import { OnboardingListPage } from '@/pages/OnboardingListPage';
import { OnboardingDetailPage } from '@/pages/OnboardingDetailPage';
import { OnboardingNewPage } from '@/pages/OnboardingNewPage';
import { ActivationPage } from '@/pages/ActivationPage';
import { AgencyDetailPage } from '@/pages/AgencyDetailPage';
import { ProductionPage } from '@/pages/ProductionPage';
import { AgencyProductionPage } from '@/pages/AgencyProductionPage';
import { AgentProductionPage } from '@/pages/AgentProductionPage';
import { BookOfBusinessPage } from '@/pages/BookOfBusinessPage';
import { RetentionPage } from '@/pages/RetentionPage';
import { CoachingPage } from '@/pages/CoachingPage';
import { AtRiskPage } from '@/pages/AtRiskPage';
import { GamificationPage } from '@/pages/GamificationPage';

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/activate/:slug" element={<ActivationPage />} />

          {/* Protected — AppLayout enforces auth */}
          <Route element={<AppLayout />}>
            {/* Accessible to all roles (agent, manager, admin, fym_admin) */}
            <Route path="/" element={<DashboardPage />} />
            <Route path="/at-risk" element={<AtRiskPage />} />
            <Route path="/coaching" element={<CoachingPage />} />
            <Route path="/leaderboard" element={<LeaderboardPage />} />
            <Route path="/compete" element={<GamificationPage />} />
            <Route path="/agents/:agentId/health" element={<AgentHealthPage />} />
            <Route path="/my-health" element={<AgentHealthPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/crm-ops" element={<CrmOpsPage />} />

            {/* Admin + manager routes (not agent) */}
            <Route path="/agencies" element={<RoleGuard allow={['admin', 'manager']}><AgenciesPage /></RoleGuard>} />
            <Route path="/agencies/:agencyId" element={<RoleGuard allow={['admin', 'manager']}><AgencyDetailPage /></RoleGuard>} />
            <Route path="/agents" element={<RoleGuard allow={['admin', 'manager']}><AgentsPage /></RoleGuard>} />
            <Route path="/workboard" element={<RoleGuard allow={['admin', 'manager']}><ManagerWorkboardPage /></RoleGuard>} />
            <Route path="/production" element={<RoleGuard allow={['admin', 'manager']}><ProductionPage /></RoleGuard>} />
            <Route path="/production/:agencyId" element={<RoleGuard allow={['admin', 'manager']}><AgencyProductionPage /></RoleGuard>} />
            <Route path="/production/:agencyId/agent/:agentId" element={<RoleGuard allow={['admin', 'manager']}><AgentProductionPage /></RoleGuard>} />
            <Route path="/retention" element={<RoleGuard allow={['admin', 'manager']}><RetentionPage /></RoleGuard>} />

            {/* Admin-only routes */}
            <Route path="/book" element={<RoleGuard allow={['admin']}><BookOfBusinessPage /></RoleGuard>} />
            <Route path="/financials" element={<RoleGuard allow={['admin']}><AdminFinancialsPage /></RoleGuard>} />
            <Route path="/contracting" element={<RoleGuard allow={['admin']}><ContractingPage /></RoleGuard>} />
            <Route path="/crm-command" element={<RoleGuard allow={['admin']}><CrmCommandPage /></RoleGuard>} />

            {/* FYM admin only routes */}
            <Route path="/onboarding" element={<RoleGuard allow={[]} allowFymAdmin={true}><OnboardingListPage /></RoleGuard>} />
            <Route path="/onboarding/new" element={<RoleGuard allow={[]} allowFymAdmin={true}><OnboardingNewPage /></RoleGuard>} />
            <Route path="/onboarding/:slug" element={<RoleGuard allow={[]} allowFymAdmin={true}><OnboardingDetailPage /></RoleGuard>} />
            <Route path="/provision" element={<RoleGuard allow={[]} allowFymAdmin={true}><AgentProvisioningPage /></RoleGuard>} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
