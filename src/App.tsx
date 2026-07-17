import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from '@/contexts/AuthContext';
import { AppLayout } from '@/components/layout/AppLayout';
import { LoginPage } from '@/pages/LoginPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { AgenciesPage } from '@/pages/AgenciesPage';
import { AgentsPage } from '@/pages/AgentsPage';
import { ContractingPage } from '@/pages/ContractingPage';
import { AtRiskPage } from '@/pages/AtRiskPage';
import { CrmOpsPage } from '@/pages/CrmOpsPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { LeaderboardPage } from '@/pages/LeaderboardPage';
import { AgentHealthPage } from '@/pages/AgentHealthPage';
import { AdminFinancialsPage } from '@/pages/AdminFinancialsPage';

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public */}
          <Route path="/login" element={<LoginPage />} />

          {/* Protected — AppLayout enforces auth */}
          <Route element={<AppLayout />}>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/agencies" element={<AgenciesPage />} />
            <Route path="/agents" element={<AgentsPage />} />
            <Route path="/contracting" element={<ContractingPage />} />
            <Route path="/at-risk" element={<AtRiskPage />} />
            <Route path="/crm-ops" element={<CrmOpsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/leaderboard" element={<LeaderboardPage />} />
            <Route path="/agents/:agentId/health" element={<AgentHealthPage />} />
            <Route path="/my-health" element={<AgentHealthPage />} />
            <Route path="/financials" element={<AdminFinancialsPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
