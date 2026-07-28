import { SubTabLayout } from '@/components/layout/SubTabLayout';

export function QualityGroupPage() {
  const tabs = [
    { to: '/quality/retention', label: 'Retention' },
    { to: '/quality/at-risk', label: 'At-Risk' },
    { to: '/quality/coaching', label: 'Coaching' },
  ];

  return <SubTabLayout tabs={tabs} />;
}
