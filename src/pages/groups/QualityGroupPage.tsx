import { SubTabLayout } from '@/components/layout/SubTabLayout';
import { useEffectiveAuth } from '@/hooks/useEffectiveAuth';

export function QualityGroupPage() {
  const { isOrgWide } = useEffectiveAuth();

  // FYM admins access Coaching inside Contracting tab now — hide it here.
  // Managers + agency admins still see it under Quality.
  const tabs = [
    { to: '/quality/retention', label: 'Retention' },
    { to: '/quality/at-risk', label: 'At-Risk' },
    ...(!isOrgWide ? [{ to: '/quality/coaching', label: 'Coaching' }] : []),
  ];

  return <SubTabLayout tabs={tabs} />;
}
