import { SubTabLayout } from '@/components/layout/SubTabLayout';

export function RecruitingGroupPage() {
  const tabs = [
    { to: '/recruiting', label: 'Dashboard' },
    { to: '/recruiting/leads', label: 'Leads' },
    { to: '/recruiting/analytics', label: 'Analytics' },
  ];

  return <SubTabLayout tabs={tabs} />;
}
