import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from '@/contexts/AuthContext';
import { AppLayout } from '@/components/layout/AppLayout';
import { LoginPage } from '@/pages/LoginPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { AgenciesPage } from '@/pages/AgenciesPage';
import { AgentsPage } from '@/pages/AgentsPage';
import { ContractingPage } from '@/pages/contracting';
import { Navigate } from 'react-router-dom';
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
            <Route path="/" element={<DashboardPage />} />
            <Route path="/agencies" element={<AgenciesPage />} />
            <Route path="/agencies/:agencyId" element={<AgencyDetailPage />} />
            <Route path="/agents" element={<AgentsPage />} />
            <Route path="/contracting" element={<ContractingPage />} />
            <Route path="/at-risk" element={<Navigate to="/coaching" replace />} />
            <Route path="/crm-ops" element={<CrmOpsPage />} />
            <Route path="/crm-command" element={<CrmCommandPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/leaderboard" element={<LeaderboardPage />} />
            <Route path="/agents/:agentId/health" element={<AgentHealthPage />} />
            <Route path="/my-health" element={<AgentHealthPage />} />
            <Route path="/provision" element={<AgentProvisioningPage />} />
            <Route path="/financials" element={<AdminFinancialsPage />} />
            <Route path="/retention" element={<RetentionPage />} />
            <Route path="/coaching" element={<CoachingPage />} />
            <Route path="/compete" element={<GamificationPage />} />
            <Route path="/production" element={<ProductionPage />} />
            <Route path="/production/:agencyId" element={<AgencyProductionPage />} />
            <Route path="/production/:agencyId/agent/:agentId" element={<AgentProductionPage />} />
            <Route path="/book" element={<BookOfBusinessPage />} />
            <Route path="/workboard" element={<ManagerWorkboardPage />} />
            <Route path="/onboarding" element={<OnboardingListPage />} />
            <Route path="/onboarding/new" element={<OnboardingNewPage />} />
            <Route path="/onboarding/:slug" element={<OnboardingDetailPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
