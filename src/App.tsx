import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from '@/contexts/AuthContext';
import { AppLayout } from '@/components/layout/AppLayout';
import { LoginPage } from '@/pages/LoginPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { AgenciesPage } from '@/pages/AgenciesPage';
import { AgentsPage } from '@/pages/AgentsPage';
import { ContractingPage } from '@/pages/contracting';
import { AtRiskPage } from '@/pages/AtRiskPage';
import { CrmOpsPage } from '@/pages/CrmOpsPage';
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
            <Route path="/at-risk" element={<AtRiskPage />} />
            <Route path="/crm-ops" element={<CrmOpsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/leaderboard" element={<LeaderboardPage />} />
            <Route path="/agents/:agentId/health" element={<AgentHealthPage />} />
            <Route path="/my-health" element={<AgentHealthPage />} />
            <Route path="/provision" element={<AgentProvisioningPage />} />
            <Route path="/financials" element={<AdminFinancialsPage />} />
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
