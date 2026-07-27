/**
 * @crm-protected
 * DO NOT MODIFY without Charlie's explicit approval.
 * This file is part of CRM Ops (OpenClaw Dashboard).
 * Table references use hierarchy_agencies (NOT crm_agencies).
 * Any rename or schema change to hierarchy_agencies requires updating this file.
 * See: docs/CRM_OPS_FILES.md for the full protected file list.
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Upload,
  Download,
  Save,
  Copy,
  Check,
  Sparkles,
  Package,
  Loader2,
  X,
  FileSpreadsheet,
} from 'lucide-react';
import { supabase } from '@/lib/crm/portal-client';
import { buildDynamicFields } from '@/lib/crm/cross-sell-helpers';

const FIELD_KEYS = [
  'headline',
  'subheadline',
  'meta_title',
  'meta_description',
  'meta_image_url',
  'cta_text',
  'button_cta_text',
  'bullet_1',
  'bullet_1_description',
  'bullet_2',
  'bullet_2_description',
  'bullet_3',
  'bullet_3_description',
  'bullet_4',
  'bullet_4_description',
  'bullet_5',
  'bullet_5_description',
  'specialist_full_name',
  'specialist_title',
  'specialist_email',
  'specialist_mobile',
  'funnel_link_step_1',
  'funnel_link_step_2',
  'calendar_embed_code',
  'appointment_disclaimer',
  'confirmation_headline',
  'confirmation_subheadline',
  'confirmation_next_steps',
  'system_crm_number',
  'qualification_age_requirement',
  'qualification_doctor_participation',
  'qualification_enrollment_fee',
  'qualification_income_guidelines',
] as const;

const FIELD_LABELS: Record<string, string> = {
  headline: 'Headline',
  subheadline: 'Subheadline',
  meta_title: 'Meta Title',
  meta_description: 'Meta Description',
  meta_image_url: 'Meta Image URL',
  cta_text: 'CTA Text',
  button_cta_text: 'Button CTA Text',
  bullet_1: 'Bullet 1',
  bullet_1_description: 'Bullet 1 Description',
  bullet_2: 'Bullet 2',
  bullet_2_description: 'Bullet 2 Description',
  bullet_3: 'Bullet 3',
  bullet_3_description: 'Bullet 3 Description',
  bullet_4: 'Bullet 4',
  bullet_4_description: 'Bullet 4 Description',
  bullet_5: 'Bullet 5',
  bullet_5_description: 'Bullet 5 Description',
  specialist_full_name: 'Specialist Full Name',
  specialist_title: 'Specialist Title',
  specialist_email: 'Specialist Email',
  specialist_mobile: 'Specialist Mobile #',
  funnel_link_step_1: 'Funnel Link | Step 1 - Home & Awareness',
  funnel_link_step_2: 'Funnel Link | Step 2 - Appointment Booking',
  calendar_embed_code: 'Calendar Embed Code',
  appointment_disclaimer: 'Appointment Disclaimer',
  confirmation_headline: 'Confirmation Headline',
  confirmation_subheadline: 'Confirmation Subheadline',
  confirmation_next_steps: 'Confirmation Next Steps',
  system_crm_number: 'System CRM #',
  qualification_age_requirement: 'Qualification | Age Requirement',
  qualification_doctor_participation: 'Qualification | Doctor Participation',
  qualification_enrollment_fee: 'Qualification | Enrollment Fee',
  qualification_income_guidelines: 'Qualification | Income Guidelines',
};

const FIELD_GROUPS = [
  { label: 'Meta / SEO', keys: ['meta_title', 'meta_description', 'meta_image_url'] },
  { label: 'Headlines & Copy', keys: ['headline', 'subheadline', 'cta_text', 'button_cta_text'] },
  { label: 'Bullets', keys: ['bullet_1', 'bullet_1_description', 'bullet_2', 'bullet_2_description', 'bullet_3', 'bullet_3_description', 'bullet_4', 'bullet_4_description', 'bullet_5', 'bullet_5_description'] },
  { label: 'Specialist Info', keys: ['specialist_full_name', 'specialist_title', 'specialist_email', 'specialist_mobile'] },
  { label: 'Funnel Links', keys: ['funnel_link_step_1', 'funnel_link_step_2'] },
  { label: 'Calendar & Booking', keys: ['calendar_embed_code', 'appointment_disclaimer'] },
  { label: 'Confirmation', keys: ['confirmation_headline', 'confirmation_subheadline', 'confirmation_next_steps'] },
  { label: 'Qualification (Product 5)', keys: ['qualification_age_requirement', 'qualification_doctor_participation', 'qualification_enrollment_fee', 'qualification_income_guidelines'], productOnly: 5 },
  { label: 'System', keys: ['system_crm_number'] },
];

type AgencyCrossSell = {
  id: string;
  agency_id: string;
  product_number: number;
  product_name: string;
  fields: Record<string, string>;
  ai_prompt: string | null;
  created_at: string;
  updated_at: string;
};

interface CrossSellSectionProps {
  agencyId: string;
  agencyName: string;
  csrFirstName?: string | null;
  csrLastName?: string | null;
  csrPhone?: string | null;
  csrEmail?: string | null;
  agencyPhone?: string | null;
  agencyUrlPrefix?: string | null;
}

function generateAiPrompt(productName: string): string {
  return `You are a marketing content specialist for insurance products. Generate professional marketing content for a cross-sell insurance product called "${productName}".

This product is offered as a cross-sell to existing Medicare/health insurance clients (primarily seniors aged 65+). The content must be compliant with insurance marketing regulations, professional in tone, and persuasive.

Please generate values for each of the following 28 fields. Provide clear, concise, and compelling content for each:

1. Appointment Disclaimer - Legal disclaimer for appointment booking
2. Bullet 1 - Key benefit headline (short)
3. Bullet 1 Description - Expanded description of benefit 1
4. Bullet 2 - Key benefit headline (short)
5. Bullet 2 Description - Expanded description of benefit 2
6. Bullet 3 - Key benefit headline (short)
7. Bullet 3 Description - Expanded description of benefit 3
8. Bullet 4 - Key benefit headline (short)
9. Bullet 4 Description - Expanded description of benefit 4
10. Bullet 5 - Key benefit headline (short)
11. Bullet 5 Description - Expanded description of benefit 5
12. Button CTA Text - Call-to-action button text (2-4 words)
13. CTA Text - Supporting call-to-action text (one sentence)
14. Calendar Embed Code - Leave blank (to be configured)
15. Confirmation Headline - Thank you page headline
16. Confirmation Next Steps - What happens after booking (2-3 sentences)
17. Confirmation Subheadline - Thank you page supporting text
18. Funnel Link | Step 1 - Home & Awareness - Leave blank (URL to be configured)
19. Funnel Link | Step 2 - Appointment Booking - Leave blank (URL to be configured)
20. Headline - Main page headline (attention-grabbing, benefit-focused)
21. Meta Description - SEO meta description (155 chars max)
22. Meta Image URL - Leave blank (image to be uploaded)
23. Meta Title - SEO page title (60 chars max)
24. Specialist Email - Leave blank (to be assigned)
25. Specialist Full Name - Leave blank (to be assigned)
26. Specialist Mobile # - Leave blank (to be assigned)
27. Specialist Title - Suggested title for the specialist role
28. System CRM # - Leave blank (to be configured)

Format your response as a numbered list matching the fields above. Each field value should be on its own line.`;
}

export const CrossSellSection: React.FC<CrossSellSectionProps> = ({ agencyId, agencyName, csrFirstName, csrLastName, csrPhone, csrEmail, agencyPhone, agencyUrlPrefix }) => {
  const [products, setProducts] = useState<AgencyCrossSell[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedProduct, setExpandedProduct] = useState<number | null>(null);
  const [editStates, setEditStates] = useState<Record<number, { name: string; fields: Record<string, string> }>>({});
  const [saving, setSaving] = useState<number | null>(null);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [copiedPrompt, setCopiedPrompt] = useState<number | null>(null);

  const getDynamicFields = useCallback(
    (productNumber: number) =>
      buildDynamicFields(productNumber, {
        csrFirstName,
        csrLastName,
        csrPhone,
        csrEmail,
        agencyPhone,
        agencyUrlPrefix,
      }),
    [csrFirstName, csrLastName, csrPhone, csrEmail, agencyPhone, agencyUrlPrefix],
  );

  const syncDynamicFields = useCallback(async (existingProducts: AgencyCrossSell[]) => {
    const updates: { product_number: number; fields: Record<string, string> }[] = [];

    const ALWAYS_OVERWRITE = new Set(['specialist_title']);

    for (const product of existingProducts) {
      const dynamic = getDynamicFields(product.product_number);
      const currentFields = { ...product.fields };
      let changed = false;

      for (const [key, value] of Object.entries(dynamic)) {
        if (ALWAYS_OVERWRITE.has(key) || !currentFields[key] || currentFields[key].trim() === '') {
          if (currentFields[key] !== value) {
            currentFields[key] = value;
            changed = true;
          }
        }
      }

      if (changed) {
        updates.push({ product_number: product.product_number, fields: currentFields });
      }
    }

    if (updates.length === 0) return existingProducts;

    const updatedProducts = [...existingProducts];
    for (const update of updates) {
      await supabase
        .from('crm_agency_cross_sell')
        .update({ fields: update.fields })
        .eq('agency_id', agencyId)
        .eq('product_number', update.product_number);

      const idx = updatedProducts.findIndex(p => p.product_number === update.product_number);
      if (idx !== -1) {
        updatedProducts[idx] = { ...updatedProducts[idx], fields: update.fields };
      }
    }

    return updatedProducts;
  }, [agencyId, getDynamicFields]);

  const loadProducts = useCallback(async () => {
    const { data } = await supabase
      .from('crm_agency_cross_sell')
      .select('*')
      .eq('agency_id', agencyId)
      .order('product_number');

    if (data && data.length > 0) {
      const synced = await syncDynamicFields(data);
      setProducts(synced);
      const states: Record<number, { name: string; fields: Record<string, string> }> = {};
      for (const p of synced) {
        states[p.product_number] = { name: p.product_name, fields: { ...p.fields } };
      }
      setEditStates(states);
    } else {
      await initializeProducts();
    }
    setLoading(false);
  }, [agencyId, syncDynamicFields]);

  const initializeProducts = async () => {
    const { data: defaults } = await supabase
      .from('cross_sell_defaults')
      .select('*')
      .order('product_number');

    if (!defaults || defaults.length === 0) return;

    const productMap: Record<number, { name: string; fields: Record<string, string> }> = {};
    for (const d of defaults) {
      if (!productMap[d.product_number]) {
        productMap[d.product_number] = { name: d.product_name, fields: {} };
      }
      productMap[d.product_number].fields[d.field_key] = d.field_value;
    }

    for (const num of Object.keys(productMap)) {
      const productNum = Number(num);
      const dynamic = getDynamicFields(productNum);
      Object.assign(productMap[productNum].fields, dynamic);
    }

    const rows = Object.entries(productMap).map(([num, val]) => ({
      agency_id: agencyId,
      product_number: Number(num),
      product_name: val.name,
      fields: val.fields,
    }));

    const { data: inserted } = await supabase
      .from('crm_agency_cross_sell')
      .insert(rows)
      .select('*');

    if (inserted) {
      setProducts(inserted);
      const states: Record<number, { name: string; fields: Record<string, string> }> = {};
      for (const p of inserted) {
        states[p.product_number] = { name: p.product_name, fields: { ...p.fields } };
      }
      setEditStates(states);
    }
  };

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  const handleSaveProduct = async (productNumber: number) => {
    const state = editStates[productNumber];
    if (!state) return;

    setSaving(productNumber);
    const existing = products.find((p) => p.product_number === productNumber);
    const nameChanged = existing && existing.product_name !== state.name && state.name.trim() !== '';

    const updates: Record<string, unknown> = {
      product_name: state.name,
      fields: state.fields,
      updated_at: new Date().toISOString(),
    };

    if (nameChanged) {
      updates.ai_prompt = generateAiPrompt(state.name);
    }

    await supabase
      .from('crm_agency_cross_sell')
      .update(updates)
      .eq('agency_id', agencyId)
      .eq('product_number', productNumber);

    setProducts((prev) =>
      prev.map((p) =>
        p.product_number === productNumber
          ? { ...p, product_name: state.name, fields: state.fields, ai_prompt: nameChanged ? (updates.ai_prompt as string) : p.ai_prompt }
          : p
      )
    );
    setSaving(null);
  };

  const updateField = (productNumber: number, fieldKey: string, value: string) => {
    setEditStates((prev) => ({
      ...prev,
      [productNumber]: {
        ...prev[productNumber],
        fields: { ...prev[productNumber].fields, [fieldKey]: value },
      },
    }));
  };

  const updateProductName = (productNumber: number, name: string) => {
    setEditStates((prev) => ({
      ...prev,
      [productNumber]: { ...prev[productNumber], name },
    }));
  };

  const copyPrompt = (productNumber: number) => {
    const product = products.find((p) => p.product_number === productNumber);
    if (product?.ai_prompt) {
      navigator.clipboard.writeText(product.ai_prompt);
      setCopiedPrompt(productNumber);
      setTimeout(() => setCopiedPrompt(null), 2000);
    }
  };

  if (loading) {
    return (
      <div className="glass rounded-xl p-5">
        <div className="flex items-center gap-2 text-muted-foreground/70">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm">Loading cross-sell products...</span>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="glass rounded-xl p-5">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-emerald-500/10 flex items-center justify-center">
              <Package className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">Cross-Sell Products</h3>
              <p className="text-xs text-muted-foreground">Configure 5 cross-sell product funnels for {agencyName}</p>
            </div>
          </div>
          <button
            onClick={() => setShowUploadModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-primary bg-cyan-500/10 border border-primary/20 rounded-lg hover:bg-blue-100 transition-colors"
          >
            <Upload className="w-3.5 h-3.5" />
            Upload Defaults
          </button>
        </div>

        <div className="space-y-3">
          {products.map((product) => {
            const isExpanded = expandedProduct === product.product_number;
            const state = editStates[product.product_number];
            const isSaving = saving === product.product_number;

            return (
              <div key={product.product_number} className="border border-border rounded-xl overflow-hidden">
                <button
                  onClick={() => setExpandedProduct(isExpanded ? null : product.product_number)}
                  className="w-full flex items-center gap-3 px-4 py-3 bg-muted hover:bg-secondary transition-colors text-left"
                >
                  {isExpanded ? (
                    <ChevronDown className="w-4 h-4 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  )}
                  <span className="w-6 h-6 rounded-full bg-emerald-500/100/10 text-emerald-400 text-xs font-bold flex items-center justify-center">
                    {product.product_number}
                  </span>
                  <span className="font-medium text-foreground text-sm flex-1">
                    {state?.name || product.product_name}
                  </span>
                  {product.ai_prompt && (
                    <span className="flex items-center gap-1 text-[10px] font-medium text-amber-600 bg-amber-500/10 px-2 py-0.5 rounded-full">
                      <Sparkles className="w-3 h-3" />
                      AI Prompt
                    </span>
                  )}
                </button>

                {isExpanded && state && (
                  <div className="p-4 space-y-5">
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5">
                        Product Name
                      </label>
                      <input
                        type="text"
                        value={state.name}
                        onChange={(e) => updateProductName(product.product_number, e.target.value)}
                        className="w-full max-w-md px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring text-sm"
                      />
                      <p className="text-[11px] text-muted-foreground/70 mt-1">Changing this generates an AI prompt for content</p>
                    </div>

                    {FIELD_GROUPS.filter((group) => !group.productOnly || group.productOnly === product.product_number).map((group) => (
                      <div key={group.label}>
                        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 border-b border-border/50 pb-1">
                          {group.label}
                        </h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {group.keys.map((key) => (
                            <div key={key}>
                              <label className="block text-[11px] font-medium text-muted-foreground mb-1">
                                {FIELD_LABELS[key]}
                              </label>
                              {key === 'calendar_embed_code' || key === 'appointment_disclaimer' || key === 'confirmation_next_steps' ? (
                                <textarea
                                  value={state.fields[key] || ''}
                                  onChange={(e) => updateField(product.product_number, key, e.target.value)}
                                  rows={3}
                                  className="w-full px-2.5 py-1.5 border border-border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring text-xs resize-none"
                                />
                              ) : (
                                <input
                                  type="text"
                                  value={state.fields[key] || ''}
                                  onChange={(e) => updateField(product.product_number, key, e.target.value)}
                                  className="w-full px-2.5 py-1.5 border border-border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring text-xs"
                                />
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}

                    {product.ai_prompt && (
                      <div className="border border-amber-500/20 rounded-lg bg-amber-500/10/50 p-4">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <Sparkles className="w-4 h-4 text-amber-600" />
                            <span className="text-xs font-semibold text-amber-400">AI Prompt (Copy and use with AI)</span>
                          </div>
                          <button
                            onClick={() => copyPrompt(product.product_number)}
                            className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-amber-400 bg-amber-500/100/10 rounded-md hover:bg-amber-200 transition-colors"
                          >
                            {copiedPrompt === product.product_number ? (
                              <>
                                <Check className="w-3 h-3" />
                                Copied
                              </>
                            ) : (
                              <>
                                <Copy className="w-3 h-3" />
                                Copy
                              </>
                            )}
                          </button>
                        </div>
                        <pre className="text-[11px] text-amber-900/80 whitespace-pre-wrap font-mono bg-card/60 rounded p-3 max-h-40 overflow-y-auto border border-amber-100">
                          {product.ai_prompt}
                        </pre>
                      </div>
                    )}

                    <div className="flex justify-end pt-2 border-t border-border/50">
                      <button
                        onClick={() => handleSaveProduct(product.product_number)}
                        disabled={isSaving}
                        className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-primary rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
                      >
                        {isSaving ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Save className="w-3.5 h-3.5" />
                        )}
                        {isSaving ? 'Saving...' : 'Save Product'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {showUploadModal && (
        <UploadDefaultsModal
          onClose={() => setShowUploadModal(false)}
          onUploaded={loadProducts}
        />
      )}
    </>
  );
};

const UploadDefaultsModal: React.FC<{ onClose: () => void; onUploaded: () => void }> = ({ onClose, onUploaded }) => {
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const downloadTemplate = () => {
    const productNames = ['Final Expense Life Insurance', 'Hospital Indemnity', 'Cancer/Stroke Coverage', 'LTC/STC', 'SmartSaveMeds'];
    let csv = 'Product Number,Product Name,Field Key,Field Value\n';
    for (let p = 1; p <= 5; p++) {
      for (const key of FIELD_KEYS) {
        csv += `${p},${productNames[p - 1]},${key},\n`;
      }
    }
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'cross_sell_defaults_template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError('');
    setResult(null);

    try {
      const text = await file.text();
      const lines = text.split('\n').filter((l) => l.trim());
      if (lines.length < 2) {
        setError('File appears empty or has no data rows.');
        setUploading(false);
        return;
      }

      const rows: { product_number: number; product_name: string; field_key: string; field_value: string }[] = [];

      for (let i = 1; i < lines.length; i++) {
        const parts = lines[i].split(',');
        if (parts.length < 3) continue;
        const productNumber = parseInt(parts[0].trim(), 10);
        const productName = parts[1].trim();
        const fieldKey = parts[2].trim();
        const fieldValue = parts.slice(3).join(',').trim();

        if (productNumber >= 1 && productNumber <= 5 && FIELD_KEYS.includes(fieldKey as typeof FIELD_KEYS[number])) {
          rows.push({ product_number: productNumber, product_name: productName || '', field_key: fieldKey, field_value: fieldValue });
        }
      }

      if (rows.length === 0) {
        setError('No valid rows found. Check the CSV format: Product Number, Product Name, Field Key, Field Value');
        setUploading(false);
        return;
      }

      let upserted = 0;
      for (const row of rows) {
        const { error: upsertError } = await supabase
          .from('cross_sell_defaults')
          .upsert(
            { product_number: row.product_number, product_name: row.product_name, field_key: row.field_key, field_value: row.field_value, updated_at: new Date().toISOString() },
            { onConflict: 'product_number,field_key' }
          );
        if (!upsertError) upserted++;
      }

      setResult(`Updated ${upserted} of ${rows.length} field defaults.`);
      onUploaded();
    } catch {
      setError('Failed to parse file. Ensure it is a valid CSV.');
    }
    setUploading(false);
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-card rounded-2xl shadow-none max-w-lg w-full border border-border">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-lg font-bold text-foreground">Upload Cross-Sell Defaults</h2>
          <button onClick={onClose} className="p-1 hover:bg-secondary rounded transition-colors">
            <X className="w-5 h-5 text-muted-foreground/70" />
          </button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <p className="text-sm text-muted-foreground">
            Upload a CSV file with 140 rows (5 products x 28 fields) to set organization-wide default values.
            These defaults will be used to pre-fill fields when agencies are initialized.
          </p>

          <div className="flex items-center gap-3">
            <button
              onClick={downloadTemplate}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-foreground/80 bg-secondary border border-border rounded-lg hover:bg-secondary/80 transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              Download Template
            </button>
          </div>

          <div className="border-2 border-dashed border-border rounded-xl p-6 text-center hover:border-primary transition-colors">
            <FileSpreadsheet className="w-8 h-8 text-muted-foreground/60 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground mb-3">Upload CSV file</p>
            <input
              ref={fileRef}
              type="file"
              accept=".csv"
              onChange={handleUpload}
              className="hidden"
            />
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {uploading ? 'Uploading...' : 'Choose File'}
            </button>
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}
          {result && <p className="text-sm text-emerald-600 font-medium">{result}</p>}
        </div>
        <div className="px-6 py-4 bg-muted rounded-b-2xl flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-foreground/80 bg-card border border-border rounded-lg hover:bg-muted transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
