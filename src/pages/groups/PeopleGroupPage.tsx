import { SubTabLayout } from '@/components/layout/SubTabLayout';

export function PeopleGroupPage() {
  const tabs = [
    { to: '/people/agencies', label: 'Agencies' },
    { to: '/people/agents', label: 'Agents' },
    { to: '/people/rosters', label: 'Rosters' },
  ];

  return <SubTabLayout tabs={tabs} />;
}
