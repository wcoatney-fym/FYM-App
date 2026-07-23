export type CompTier = '60' | '65' | '70' | '75';

export interface CompTierConfig {
  key: CompTier;
  label: string;
  financialModelerUrl?: string;
}

export const COMP_TIER_CONFIGS: Record<CompTier, CompTierConfig> = {
  '60': {
    key: '60',
    label: '60 Comp',
  },
  '65': {
    key: '65',
    label: '65 Comp',
  },
  '70': {
    key: '70',
    label: '70 Comp',
    financialModelerUrl: 'https://fymhi70.netlify.app/',
  },
  '75': {
    key: '75',
    label: '75 Comp',
    financialModelerUrl: 'https://hip75.netlify.app/',
  },
};

export function resolveCompTier(key: string | null | undefined): CompTierConfig {
  if (key === '60') return COMP_TIER_CONFIGS['60'];
  if (key === '65') return COMP_TIER_CONFIGS['65'];
  if (key === '75') return COMP_TIER_CONFIGS['75'];
  return COMP_TIER_CONFIGS['70'];
}
