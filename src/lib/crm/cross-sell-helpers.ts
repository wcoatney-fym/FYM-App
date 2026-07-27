/**
 * Cross-sell helpers — ported from OpenClaw-Dashboard crossSellHelpers.ts
 */
import { supabase } from './portal-client';

export const PRODUCT_SLUGS: Record<number, [string, string]> = {
  1: ['final-expense', 'final-expense-book'],
  2: ['hospital-indemnity-team', 'hospital-indemnity-book'],
  3: ['cancer-stroke', 'cancer-stroke-book'],
  4: ['care-coverage', 'care-coverage-book'],
  5: ['smartsaver-rx', 'smartsaver-rx-book'],
};

export const PRODUCT_TITLES: Record<number, string> = {
  1: 'Final Expense Specialist',
  2: 'Hospital Indemnity Specialist',
  3: 'Cancer & Stroke Specialist',
  4: 'Long-Term Care Specialist',
  5: 'Prescription Savings Specialist',
};

export interface DynamicFieldInputs {
  csrFirstName?: string | null;
  csrLastName?: string | null;
  csrPhone?: string | null;
  csrEmail?: string | null;
  agencyPhone?: string | null;
  agencyUrlPrefix?: string | null;
}

export const buildDynamicFields = (
  productNumber: number,
  inputs: DynamicFieldInputs
): Record<string, string> => {
  const dynamic: Record<string, string> = {};
  const fullName = [inputs.csrFirstName, inputs.csrLastName]
    .filter(Boolean)
    .join(' ')
    .trim();
  const urlPrefix = inputs.agencyUrlPrefix?.trim() || '';

  if (PRODUCT_TITLES[productNumber])
    dynamic.specialist_title = PRODUCT_TITLES[productNumber];
  if (fullName) dynamic.specialist_full_name = fullName;
  if (inputs.csrPhone) dynamic.specialist_mobile = inputs.csrPhone;
  if (inputs.csrEmail) dynamic.specialist_email = inputs.csrEmail;
  if (inputs.agencyPhone)
    dynamic.system_crm_number = inputs.agencyPhone;
  if (urlPrefix && PRODUCT_SLUGS[productNumber]) {
    const [slug1, slug2] = PRODUCT_SLUGS[productNumber];
    dynamic.funnel_link_step_1 = `${urlPrefix}.my-agent-appt.com/${slug1}`;
    dynamic.funnel_link_step_2 = `${urlPrefix}.my-agent-appt.com/${slug2}`;
  }
  return dynamic;
};

interface AgencyCrossSellRow {
  id: string;
  agency_id: string;
  product_number: number;
  product_name: string;
  fields: Record<string, string>;
}

const ALWAYS_OVERWRITE = new Set(['specialist_title']);

export const backfillCrossSellDefaults = async (
  agencyId: string,
  inputs: DynamicFieldInputs
): Promise<void> => {
  const { data: defaults } = await supabase
    .from('cross_sell_defaults')
    .select('product_number, product_name, field_key, field_value')
    .order('product_number');

  const defaultsByProduct: Record<
    number,
    { name: string; fields: Record<string, string> }
  > = {};
  for (const d of defaults || []) {
    if (!defaultsByProduct[d.product_number]) {
      defaultsByProduct[d.product_number] = { name: d.product_name, fields: {} };
    }
    defaultsByProduct[d.product_number].fields[d.field_key] = d.field_value;
  }

  const { data: existing } = await supabase
    .from('crm_agency_cross_sell')
    .select('id, agency_id, product_number, product_name, fields')
    .eq('agency_id', agencyId)
    .order('product_number');

  const existingByProduct: Record<number, AgencyCrossSellRow> = {};
  for (const row of (existing || []) as AgencyCrossSellRow[]) {
    existingByProduct[row.product_number] = row;
  }

  const productNumbers = Array.from(
    new Set([
      ...Object.keys(defaultsByProduct).map(Number),
      ...Object.keys(existingByProduct).map(Number),
    ])
  ).sort((a, b) => a - b);

  for (const productNumber of productNumbers) {
    const defaultEntry = defaultsByProduct[productNumber];
    const existingEntry = existingByProduct[productNumber];
    const dynamic = buildDynamicFields(productNumber, inputs);

    if (existingEntry) {
      const merged = { ...existingEntry.fields };
      if (defaultEntry) {
        for (const [key, value] of Object.entries(defaultEntry.fields)) {
          if (!merged[key] || merged[key].trim() === '') {
            merged[key] = value;
          }
        }
      }
      for (const [key, value] of Object.entries(dynamic)) {
        if (
          ALWAYS_OVERWRITE.has(key) ||
          !merged[key] ||
          merged[key].trim() === ''
        ) {
          merged[key] = value;
        }
      }
      await supabase
        .from('crm_agency_cross_sell')
        .update({ fields: merged, updated_at: new Date().toISOString() })
        .eq('id', existingEntry.id);
    } else if (defaultEntry) {
      const fields = { ...defaultEntry.fields, ...dynamic };
      await supabase.from('crm_agency_cross_sell').insert({
        agency_id: agencyId,
        product_number: productNumber,
        product_name: defaultEntry.name,
        fields,
      });
    }
  }
};
