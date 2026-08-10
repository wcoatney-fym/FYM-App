import { SubTabLayout } from '@/components/layout/SubTabLayout';

export function PeopleGroupPage() {
  const tabs = [
    { to: '/people/agencies', label: 'Agencies' },
    { to: '/people/agents', label: 'Agents' },
  ];

  return <SubTabLayout tabs={tabs} />;
}
