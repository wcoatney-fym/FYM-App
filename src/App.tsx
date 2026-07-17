import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { DashboardPage } from '@/pages/DashboardPage';
import { AgenciesPage } from '@/pages/AgenciesPage';
import { AgentsPage } from '@/pages/AgentsPage';
import { ContractingPage } from '@/pages/ContractingPage';
import { AtRiskPage } from '@/pages/AtRiskPage';
import { CrmOpsPage } from '@/pages/CrmOpsPage';
import { SettingsPage } from '@/pages/SettingsPage';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/agencies" element={<AgenciesPage />} />
          <Route path="/agents" element={<AgentsPage />} />
          <Route path="/contracting" element={<ContractingPage />} />
          <Route path="/at-risk" element={<AtRiskPage />} />
          <Route path="/crm-ops" element={<CrmOpsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
