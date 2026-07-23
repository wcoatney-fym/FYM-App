export const mockAgencies = [
  { id: '1', name: 'Summit Insurance Group', principal_agent: 'Michael Torres', status: 'active', policies: 142, retention_90: 94.2 },
  { id: '2', name: 'Coastal Benefits LLC', principal_agent: 'Sarah Chen', status: 'active', policies: 98, retention_90: 91.7 },
  { id: '3', name: 'Heritage Financial Partners', principal_agent: 'David Williams', status: 'active', policies: 76, retention_90: 88.3 },
  { id: '4', name: 'Pacific Shield Insurance', principal_agent: 'Jennifer Park', status: 'pending', policies: 34, retention_90: 96.1 },
  { id: '5', name: 'Mountain West Agency', principal_agent: 'Robert Garcia', status: 'active', policies: 112, retention_90: 85.9 },
  { id: '6', name: 'Liberty Health Solutions', principal_agent: 'Amanda Foster', status: 'inactive', policies: 21, retention_90: 78.4 },
  { id: '7', name: 'Prestige Insurance Co.', principal_agent: 'James Mitchell', status: 'active', policies: 167, retention_90: 92.8 },
  { id: '8', name: 'Eagle Point Partners', principal_agent: 'Lisa Nakamura', status: 'active', policies: 89, retention_90: 90.1 },
];

export const mockAgents = [
  { id: '1', name: 'Michael Torres', npn: '18234567', agency: 'Summit Insurance Group', writing_number: 'W-10234', active_policies: 52 },
  { id: '2', name: 'Sarah Chen', npn: '19345678', agency: 'Coastal Benefits LLC', writing_number: 'W-10235', active_policies: 41 },
  { id: '3', name: 'David Williams', npn: '17456789', agency: 'Heritage Financial Partners', writing_number: 'W-10236', active_policies: 38 },
  { id: '4', name: 'Jennifer Park', npn: '20567890', agency: 'Pacific Shield Insurance', writing_number: 'W-10237', active_policies: 34 },
  { id: '5', name: 'Robert Garcia', npn: '16678901', agency: 'Mountain West Agency', writing_number: 'W-10238', active_policies: 47 },
  { id: '6', name: 'Amanda Foster', npn: '21789012', agency: 'Liberty Health Solutions', writing_number: 'W-10239', active_policies: 21 },
  { id: '7', name: 'James Mitchell', npn: '15890123', agency: 'Prestige Insurance Co.', writing_number: 'W-10240', active_policies: 63 },
  { id: '8', name: 'Lisa Nakamura', npn: '22901234', agency: 'Eagle Point Partners', writing_number: 'W-10241', active_policies: 37 },
  { id: '9', name: 'Carlos Rivera', npn: '14012345', agency: 'Summit Insurance Group', writing_number: 'W-10242', active_policies: 29 },
  { id: '10', name: 'Emily Watson', npn: '23123456', agency: 'Coastal Benefits LLC', writing_number: 'W-10243', active_policies: 33 },
];

export const mockContractingPipeline = {
  pending_review: [
    { id: '1', agency_name: 'Horizon Health Group', principal_agent: 'Kevin Moore', submission_date: '2026-07-10' },
    { id: '2', agency_name: 'Apex Insurance Solutions', principal_agent: 'Maria Rodriguez', submission_date: '2026-07-12' },
    { id: '3', agency_name: 'Pinecrest Financial', principal_agent: 'Anthony Lewis', submission_date: '2026-07-14' },
  ],
  approved: [
    { id: '4', agency_name: 'Blue Harbor Benefits', principal_agent: 'Rachel Kim', submission_date: '2026-07-05' },
    { id: '5', agency_name: 'Crestview Partners', principal_agent: 'Daniel Okafor', submission_date: '2026-07-07' },
  ],
  contracted: [
    { id: '6', agency_name: 'Silverline Agency', principal_agent: 'Thomas Nguyen', submission_date: '2026-06-28' },
    { id: '7', agency_name: 'Cornerstone Insurance', principal_agent: 'Patricia Howard', submission_date: '2026-06-30' },
    { id: '8', agency_name: 'Vanguard Health Corp', principal_agent: 'Steven Price', submission_date: '2026-07-01' },
  ],
};

// mockAtRiskPolicies removed — AtRiskPage now reads from manager_at_risk_board view (PR #16)

export const mockRetentionTrend = [
  { month: 'Jan', retention: 91.2 },
  { month: 'Feb', retention: 90.8 },
  { month: 'Mar', retention: 92.1 },
  { month: 'Apr', retention: 91.5 },
  { month: 'May', retention: 93.0 },
  { month: 'Jun', retention: 92.4 },
  { month: 'Jul', retention: 91.8 },
];

export const mockDashboardStats = {
  total_active_policies: 739,
  retention_90_day: 91.8,
  at_risk_count: 8,
  new_submissions_week: 3,
};
