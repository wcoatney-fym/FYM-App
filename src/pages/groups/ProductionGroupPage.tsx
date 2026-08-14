import { SubTabLayout } from '@/components/layout/SubTabLayout';
import { useEffectiveAuth } from '@/hooks/useEffectiveAuth';

export function ProductionGroupPage() {
  const { effectiveRole, isOrgWide } = useEffectiveAuth();

  // Book of Business is admin-only
  const isAdmin = effectiveRole === 'admin' || isOrgWide;

  const tabs = [
    { to: '/production', label: 'Overview' },
    ...(isAdmin ? [{ to: '/production/book', label: 'Book of Business' }] : []),
  ];

  return <SubTabLayout tabs={tabs} />;
}
