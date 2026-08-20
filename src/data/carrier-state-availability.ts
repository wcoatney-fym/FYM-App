/**
 * Carrier availability by US state.
 * Source: FYM master state list (2026-08-20).
 *
 * Carriers: UNL, GTL, AHL, Ameritas, Manhattan
 * Manhattan notes: "select" = select zip codes only, "legacy" = legacy only
 */

export type CarrierKey = 'UNL' | 'GTL' | 'AHL' | 'Ameritas' | 'Manhattan';

export type CarrierAvailability = {
  available: boolean;
  note?: string; // e.g. "select zips", "legacy", "HI only" (Hospital Indemnity only)
};

export type StateCarriers = Record<CarrierKey, CarrierAvailability>;

export const CARRIER_DISPLAY: Record<CarrierKey, { name: string; color: string }> = {
  UNL: { name: 'United National Life', color: '#3B82F6' },       // blue
  GTL: { name: 'Guarantee Trust Life', color: '#10B981' },       // emerald
  AHL: { name: 'American Home Life', color: '#F59E0B' },         // amber
  Ameritas: { name: 'Ameritas', color: '#8B5CF6' },              // purple
  Manhattan: { name: 'Manhattan Life', color: '#EF4444' },       // red
};

export const CARRIER_KEYS: CarrierKey[] = ['UNL', 'GTL', 'AHL', 'Ameritas', 'Manhattan'];

const y = (note?: string): CarrierAvailability => ({ available: true, note });
const n: CarrierAvailability = { available: false };

export const STATE_CARRIER_MAP: Record<string, StateCarriers> = {
  AL: { UNL: y(), GTL: y(), AHL: y(), Ameritas: y(), Manhattan: y() },
  AK: { UNL: n, GTL: n, AHL: n, Ameritas: y(), Manhattan: y() },
  AZ: { UNL: y(), GTL: y(), AHL: n, Ameritas: y(), Manhattan: y() },
  AR: { UNL: y(), GTL: y(), AHL: y(), Ameritas: y(), Manhattan: y() },
  CA: { UNL: n, GTL: n, AHL: n, Ameritas: y(), Manhattan: n },
  CO: { UNL: y(), GTL: y(), AHL: y(), Ameritas: y(), Manhattan: y() },
  CT: { UNL: n, GTL: y(), AHL: n, Ameritas: y(), Manhattan: n },
  DE: { UNL: y(), GTL: y(), AHL: n, Ameritas: y(), Manhattan: y() },
  FL: { UNL: y('HI only'), GTL: y(), AHL: y(), Ameritas: y(), Manhattan: n },
  GA: { UNL: y(), GTL: y(), AHL: y(), Ameritas: y(), Manhattan: y() },
  HI: { UNL: n, GTL: y(), AHL: n, Ameritas: y(), Manhattan: y() },
  ID: { UNL: y(), GTL: y(), AHL: n, Ameritas: y(), Manhattan: y('select zips') },
  IL: { UNL: y(), GTL: y(), AHL: y(), Ameritas: y(), Manhattan: y() },
  IN: { UNL: y(), GTL: y(), AHL: n, Ameritas: y(), Manhattan: y('select zips') },
  IA: { UNL: y(), GTL: y(), AHL: y(), Ameritas: y(), Manhattan: y() },
  KS: { UNL: y(), GTL: y(), AHL: y(), Ameritas: y(), Manhattan: y('legacy') },
  KY: { UNL: y(), GTL: y(), AHL: y(), Ameritas: y(), Manhattan: y('legacy') },
  LA: { UNL: y(), GTL: y(), AHL: y(), Ameritas: y(), Manhattan: y() },
  ME: { UNL: n, GTL: y(), AHL: n, Ameritas: y(), Manhattan: y() },
  MD: { UNL: y('HI only'), GTL: y(), AHL: y(), Ameritas: y(), Manhattan: y('select zips') },
  MA: { UNL: n, GTL: y(), AHL: n, Ameritas: n, Manhattan: n },
  MI: { UNL: y(), GTL: y(), AHL: y(), Ameritas: y(), Manhattan: y() },
  MN: { UNL: y('HI only'), GTL: y(), AHL: n, Ameritas: y(), Manhattan: n },
  MS: { UNL: y(), GTL: y(), AHL: y(), Ameritas: y(), Manhattan: y() },
  MO: { UNL: y(), GTL: y(), AHL: y(), Ameritas: y(), Manhattan: y() },
  MT: { UNL: n, GTL: y(), AHL: n, Ameritas: y(), Manhattan: y('select zips') },
  NE: { UNL: y(), GTL: y(), AHL: n, Ameritas: y(), Manhattan: y() },
  NV: { UNL: y(), GTL: y(), AHL: y(), Ameritas: y(), Manhattan: y('select zips') },
  NH: { UNL: n, GTL: n, AHL: n, Ameritas: y(), Manhattan: y() },
  NJ: { UNL: n, GTL: y(), AHL: n, Ameritas: y(), Manhattan: n },
  NM: { UNL: n, GTL: n, AHL: n, Ameritas: y(), Manhattan: n },
  NY: { UNL: n, GTL: n, AHL: n, Ameritas: y(), Manhattan: n },
  NC: { UNL: y(), GTL: y(), AHL: y(), Ameritas: y(), Manhattan: y() },
  ND: { UNL: y('HI only'), GTL: y(), AHL: y(), Ameritas: y(), Manhattan: y() },
  OH: { UNL: y(), GTL: y(), AHL: y(), Ameritas: y(), Manhattan: y() },
  OK: { UNL: y(), GTL: y(), AHL: y(), Ameritas: y(), Manhattan: y() },
  OR: { UNL: n, GTL: y(), AHL: n, Ameritas: y(), Manhattan: y() },
  PA: { UNL: y(), GTL: y(), AHL: y(), Ameritas: y(), Manhattan: y('select zips') },
  RI: { UNL: n, GTL: y(), AHL: n, Ameritas: y(), Manhattan: y('select zips') },
  SC: { UNL: y(), GTL: y(), AHL: y(), Ameritas: y(), Manhattan: y() },
  SD: { UNL: y(), GTL: y(), AHL: n, Ameritas: y(), Manhattan: y() },
  TN: { UNL: y(), GTL: y(), AHL: y(), Ameritas: y(), Manhattan: y() },
  TX: { UNL: y(), GTL: y(), AHL: y(), Ameritas: y(), Manhattan: y() },
  UT: { UNL: y('HI only'), GTL: y(), AHL: y(), Ameritas: y(), Manhattan: n },
  VT: { UNL: n, GTL: n, AHL: n, Ameritas: y(), Manhattan: n },
  VA: { UNL: y('HI only'), GTL: y(), AHL: y(), Ameritas: y(), Manhattan: y('select zips') },
  WA: { UNL: n, GTL: y(), AHL: n, Ameritas: y(), Manhattan: n },
  WV: { UNL: y(), GTL: y(), AHL: y(), Ameritas: y(), Manhattan: y() },
  WI: { UNL: y('HI only'), GTL: y(), AHL: y(), Ameritas: y(), Manhattan: y() },
  WY: { UNL: y(), GTL: y(), AHL: y(), Ameritas: y(), Manhattan: y() },
  DC: { UNL: n, GTL: n, AHL: n, Ameritas: n, Manhattan: n }, // Not in source doc
};

export const STATE_NAMES: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
  CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', FL: 'Florida', GA: 'Georgia',
  HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa',
  KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
  MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri',
  MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey',
  NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio',
  OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina',
  SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont',
  VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
  DC: 'District of Columbia',
};

/** Get the count of available carriers for a state */
export function getCarrierCount(stateCode: string): number {
  const carriers = STATE_CARRIER_MAP[stateCode];
  if (!carriers) return 0;
  return CARRIER_KEYS.filter((k) => carriers[k].available).length;
}
