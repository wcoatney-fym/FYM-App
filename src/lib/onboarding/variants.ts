export type AgencyVariant = 'brent_melanie' | 'fym_direct';

export interface ContactCard {
  name: string;
  title: string;
  email: string;
  phone?: string;
  description: string;
}

export interface RoadmapTaskAction {
  type: 'mailto';
  to: 'primary' | 'secondary';
  subjectTemplate: string;
}

export interface RoadmapTaskOverride {
  title?: string;
  action?: RoadmapTaskAction;
  hidden?: boolean;
}

export interface WeekOverride {
  hidden?: boolean;
}

export interface VariantConfig {
  key: AgencyVariant;
  label: string;
  primaryFirstName: string;
  secondaryFirstName: string;
  contacts: [ContactCard, ContactCard];
  weeklyEmailFooter: string;
  roadmapOverrides?: Record<string, RoadmapTaskOverride>;
  weekOverrides?: Record<string, WeekOverride>;
}

export const VARIANT_CONFIGS: Record<AgencyVariant, VariantConfig> = {
  brent_melanie: {
    key: 'brent_melanie',
    label: 'Brent & Melanie',
    primaryFirstName: 'Melanie',
    secondaryFirstName: 'Brent',
    contacts: [
      {
        name: 'Melanie Fox',
        title: 'Your Partnership Contact',
        email: 'melanie@foxhealthadvisors.com',
        description: 'Onboarding, escalation, growth planning',
      },
      {
        name: 'Brent Depeppe',
        title: 'Your Partnership Contact',
        email: 'brentdepeppe@yahoo.com',
        description: 'Agent coaching, leaded-agency setup, Allcalls',
      },
    ],
    weeklyEmailFooter: 'Melanie sends this every Friday at 4pm CT. Reply to discuss.',
    roadmapOverrides: {
      'w2-2': {
        title: 'Request SYM Train seats',
        action: {
          type: 'mailto',
          to: 'primary',
          subjectTemplate: 'Requesting SYMTRAIN Seats - {agency_name}',
        },
      },
    },
  },
  fym_direct: {
    key: 'fym_direct',
    label: 'FYM Direct',
    primaryFirstName: 'Will',
    secondaryFirstName: 'Jon',
    contacts: [
      {
        name: 'Will Coatney',
        title: 'Chief Growth Officer',
        email: 'will@teamfym.com',
        phone: '(816) 384-6282',
        description: 'Onboarding, escalation, growth planning',
      },
      {
        name: 'Jon Cole',
        title: 'President of Sales',
        email: 'jcole@teamfym.com',
        phone: '(336) 302-4992',
        description: 'Sales coaching, agent escalations, top-performer playback',
      },
    ],
    weeklyEmailFooter: 'FYM sends this every Friday at 4pm CT. Reply to discuss.',
    roadmapOverrides: {
      'w2-2': {
        title: 'Request SYM Train seats',
        action: {
          type: 'mailto',
          to: 'secondary',
          subjectTemplate: 'Requesting SYMTRAIN Seats - {agency_name}',
        },
      },
      'w2-5': { hidden: true },
      'w2-6': { hidden: true },
    },
    weekOverrides: {
      w3: { hidden: true },
    },
  },
};

export function applyVariant(text: string, variant: VariantConfig): string {
  return text
    .replace(/\{primaryEmail\}/g, variant.contacts[0].email)
    .replace(/\{secondaryEmail\}/g, variant.contacts[1].email)
    .replace(/\{primary\}/g, variant.primaryFirstName)
    .replace(/\{secondary\}/g, variant.secondaryFirstName);
}

export function resolveVariant(key: string | null | undefined): VariantConfig {
  if (key === 'fym_direct') return VARIANT_CONFIGS.fym_direct;
  return VARIANT_CONFIGS.brent_melanie;
}
