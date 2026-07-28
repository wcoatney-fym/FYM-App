import { SubTabLayout } from '@/components/layout/SubTabLayout';
import { useEffectiveAuth } from '@/hooks/useEffectiveAuth';

export function PeopleGroupPage() {
  const { isOrgWide } = useEffectiveAuth();

  const tabs = [
    { to: '/people/agencies', label: 'Agencies' },
    { to: '/people/agents', label: 'Agents' },
    // FYM admin only subtabs
    ...(isOrgWide
      ? [
          { to: '/people/provision', label: 'Provision Agents' },
          { to: '/people/onboarding', label: 'Onboarding' },
        ]
      : []),
  ];

  return <SubTabLayout tabs={tabs} />;
}
