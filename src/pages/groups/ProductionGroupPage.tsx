import { SubTabLayout } from '@/components/layout/SubTabLayout';
import { useEffectiveAuth } from '@/hooks/useEffectiveAuth';

export function ProductionGroupPage() {
  const { effectiveRole, isOrgWide } = useEffectiveAuth();

  // Financials and Book of Business are admin-only
  const isAdmin = effectiveRole === 'admin' || isOrgWide;

  const tabs = [
    { to: '/production', label: 'Overview' },
    ...(isAdmin ? [{ to: '/production/book', label: 'Book of Business' }] : []),
    ...(isAdmin ? [{ to: '/production/financials', label: 'Financials' }] : []),
  ];

  return <SubTabLayout tabs={tabs} />;
}
