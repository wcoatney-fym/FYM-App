/**
 * Contracting Intake Tab — Stage 4 (live)
 *
 * New hires queue + form generator/sender.
 * Reads from portal DB (akhojh…) via portal-supabase.ts:
 *   - `new_hires` — unprocessed queue
 *   - `agents` — to generate + send intake forms
 *   - `activity_log` — to log form sends
 *
 * Ported from contracting-portal admin pages, adapted to FYM App
 * design language (slate/[#1e3a5f] palette).
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Users,
  UserPlus,
  Search,
  Send,
  CheckCircle,
  RefreshCw,
  AlertCircle,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  Mail,
  Phone,
  Building2,
  Eye,
  EyeOff,
  Undo2,
} from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { portalSupabase } from '@/lib/portal-supabase';
import { supabase as portalClient, ensurePortalAuth } from '@/lib/crm/portal-client';
import { timeAgo, formatPhoneDisplay } from '@/lib/contracting/helpers';
import { firePopulateWebhook } from '@/lib/contracting/portal-webhooks';
import type {
  PortalNewHire,
  AgentFormType,
  AgencyName,
} from '@/lib/contracting/types';

// ─── Constants ───────────────────────────────────────────────────────────────

const FORM_TYPES: { label: string; value: AgentFormType }[] = [
  { label: 'Life Only', value: 'life-only' },
  { label: 'Field', value: 'field' },
  { label: 'Direct Pay', value: 'direct-pay' },
  { label: 'Telesales', value: 'telesales' },
  { label: 'HIP (Legacy)', value: 'hip' },
  { label: 'HIP Broker', value: 'hip-broker' },
  { label: 'HIP Career', value: 'hip-career' },
  { label: 'Field HIP', value: 'field-hip' },
  { label: 'Direct Pay HIP', value: 'direct-pay-hip' },
  { label: 'Telesales HIP', value: 'telesales-hip' },
  { label: 'Life Only HIP', value: 'life-only-hip' },
];

const AGENCIES: { label: string; value: AgencyName }[] = [
  { label: 'FYM', value: 'FYM' },
  { label: 'Wisechoice', value: 'Wisechoice' },
  { label: 'Aspire', value: 'Aspire' },
];

// Use the current origin so links work from both agency.teamfym.com and crm.teamfym.com
const PORTAL_BASE_URL = typeof window !== 'undefined' ? window.location.origin : 'https://crm.teamfym.com';

// ─── Component ───────────────────────────────────────────────────────────────

export function ContractingIntakeTab() {
  // New hires queue state
  const [newHires, setNewHires] = useState<PortalNewHire[]>([]);
  const [hiresLoading, setHiresLoading] = useState(true);
  const [hiresSearch, setHiresSearch] = useState('');

  // Form generator state
  const [showFormGen, setShowFormGen] = useState(false);
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    formType: 'field' as AgentFormType,
    agency: 'FYM' as AgencyName,
  });
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<{
    success: boolean;
    url?: string;
    code?: string;
    message?: string;
  } | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [processingHireId, setProcessingHireId] = useState<string | null>(null);

  // Confirmation dialog state
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingHire, setPendingHire] = useState<PortalNewHire | null>(null);
  const [confirmSource, setConfirmSource] = useState<'manual' | 'queue'>('manual');

  // Form field errors
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Show processed toggle
  const [showProcessed, setShowProcessed] = useState(false);
  const [processedHires, setProcessedHires] = useState<PortalNewHire[]>([]);
  const [processedLoading, setProcessedLoading] = useState(false);
  const [requeueingId, setRequeueingId] = useState<string | null>(null);

  // Stats
  const [processedCount, setProcessedCount] = useState(0);

  // ── Data loading ─────────────────────────────────────────────────────────

  const loadNewHires = useCallback(async () => {
    if (!portalSupabase) return;

    try {
      const [unprocessedRes, processedRes] = await Promise.all([
        portalSupabase
          .from('new_hires')
          .select('*')
          .eq('processed', false)
          .order('created_at', { ascending: false }),
        portalSupabase
          .from('new_hires')
          .select('id', { count: 'exact', head: true })
          .eq('processed', true),
      ]);

      setNewHires((unprocessedRes.data as PortalNewHire[]) ?? []);
      setProcessedCount(processedRes.count ?? 0);
    } catch (err) {
      console.error('[Contracting Intake] Load error:', err);
    } finally {
      setHiresLoading(false);
    }
  }, []);

  const loadProcessedHires = useCallback(async () => {
    if (!portalSupabase) return;
    setProcessedLoading(true);
    try {
      const { data } = await portalSupabase
        .from('new_hires')
        .select('*')
        .eq('processed', true)
        .order('created_at', { ascending: false })
        .limit(50);
      setProcessedHires((data as PortalNewHire[]) ?? []);
    } catch (err) {
      console.error('[Contracting Intake] Load processed error:', err);
    } finally {
      setProcessedLoading(false);
    }
  }, []);

  useEffect(() => {
    loadNewHires();
    const interval = setInterval(loadNewHires, 60_000);
    return () => clearInterval(interval);
  }, [loadNewHires]);

  // Load processed hires when toggle is turned on
  useEffect(() => {
    if (showProcessed) loadProcessedHires();
  }, [showProcessed, loadProcessedHires]);

  // ── Filtered hires ──────────────────────────────────────────────────────

  const filteredHires = useMemo(() => {
    if (!hiresSearch) return newHires;
    const q = hiresSearch.toLowerCase();
    return newHires.filter(
      (h) =>
        h.first_name.toLowerCase().includes(q) ||
        h.last_name.toLowerCase().includes(q) ||
        h.email.toLowerCase().includes(q) ||
        (h.phone && h.phone.includes(q)) ||
        (h.agency && h.agency.toLowerCase().includes(q))
    );
  }, [newHires, hiresSearch]);

  // ── Form generation ─────────────────────────────────────────────────────

  const generateSecurityCode = () =>
    Math.floor(100000 + Math.random() * 900000).toString();

  // ── Validation ──────────────────────────────────────────────────────────

  const validateEmail = (email: string): boolean =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  const validatePhone = (phone: string): boolean => {
    const digits = phone.replace(/\D/g, '');
    return digits.length === 10 || (digits.length === 11 && digits.startsWith('1'));
  };

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    if (!formData.firstName.trim()) errors.firstName = 'First name is required';
    if (!formData.lastName.trim()) errors.lastName = 'Last name is required';

    if (!formData.email.trim()) {
      errors.email = 'Email is required';
    } else if (!validateEmail(formData.email.trim())) {
      errors.email = 'Enter a valid email address';
    }

    if (!formData.phone.trim()) {
      errors.phone = 'Phone is required';
    } else if (!validatePhone(formData.phone.trim())) {
      errors.phone = 'Enter a valid 10-digit phone number';
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Clear field error on change
  const updateField = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (fieldErrors[field]) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  // ── Confirmation flow ───────────────────────────────────────────────────

  const requestManualSendConfirm = () => {
    if (!validateForm()) return;
    setConfirmSource('manual');
    setPendingHire(null);
    setConfirmOpen(true);
  };

  const requestQueueSendConfirm = (hire: PortalNewHire) => {
    setConfirmSource('queue');
    setPendingHire(hire);
    setConfirmOpen(true);
  };

  const handleConfirmedSend = () => {
    setConfirmOpen(false);
    if (confirmSource === 'queue' && pendingHire) {
      executeProcessHire(pendingHire);
    } else {
      executeSendForm();
    }
  };

  const confirmName = confirmSource === 'queue' && pendingHire
    ? `${pendingHire.first_name} ${pendingHire.last_name}`
    : `${formData.firstName} ${formData.lastName}`.trim();

  const confirmAgency = confirmSource === 'queue' && pendingHire
    ? pendingHire.agency || 'FYM'
    : formData.agency;

  const confirmFormType = confirmSource === 'queue'
    ? 'Field'
    : FORM_TYPES.find((ft) => ft.value === formData.formType)?.label || formData.formType;

  const executeSendForm = async () => {
    if (!portalSupabase) return;

    setSending(true);
    setSendResult(null);

    try {
      await ensurePortalAuth();
      const securityCode = generateSecurityCode();
      const expiration = new Date();
      expiration.setHours(expiration.getHours() + 72);

      // Create agent record in portal DB (authenticated — anon INSERT removed)
      const { data: agent, error: insertErr } = await portalClient
        .from('agents')
        .insert({
          first_name: formData.firstName.trim(),
          last_name: formData.lastName.trim(),
          email: formData.email.trim(),
          phone: formData.phone.trim(),
          form_type: formData.formType,
          agency: formData.agency,
          security_code: securityCode,
          status: 'pending',
          date_sent: new Date().toISOString(),
          expiration_date: expiration.toISOString(),
          form_url: `${PORTAL_BASE_URL}/${formData.formType}`,
        })
        .select()
        .single();

      if (insertErr) throw insertErr;

      // Write security code to barrier table (anon-unreadable)
      await portalSupabase!.from('agent_security_codes').insert({
        agent_id: agent.id,
        security_code: securityCode,
      });

      const generatedUrl = `${PORTAL_BASE_URL}/${formData.formType}?id=${agent.id}`;

      // Update the agent record with the full URL (authenticated)
      await portalClient
        .from('agents')
        .update({ form_url: generatedUrl })
        .eq('id', agent.id);

      // Fire the populate webhook to trigger GHL/Zapier
      let webhookFailed = false;
      try {
        await firePopulateWebhook({
          firstName: formData.firstName.trim(),
          lastName: formData.lastName.trim(),
          email: formData.email.trim(),
          phone: formData.phone.trim(),
          formType: formData.formType,
          agency: formData.agency,
          generatedUrl,
          securityCode,
          expirationDate: expiration.toISOString(),
        });
      } catch (webhookErr) {
        webhookFailed = true;
        console.warn('[Contracting Intake] Webhook failed (form still created):', webhookErr);
        toast.warning('Form created, but automation trigger failed. The agent won\'t receive an automatic notification — send the link manually or contact support.', {
          duration: 8000,
        });
      }

      // Log activity
      await portalSupabase.from('activity_log').insert({
        agent_id: agent.id,
        action: 'form_sent',
        details: `Intake form sent to ${formData.firstName} ${formData.lastName} (${formData.agency})`,
      });

      setSendResult({
        success: true,
        url: generatedUrl,
        code: securityCode,
        message: webhookFailed
          ? 'Form created but automation failed — send the link manually.'
          : undefined,
      });

      // Reset form
      setFormData({
        firstName: '',
        lastName: '',
        email: '',
        phone: '',
        formType: 'field',
        agency: 'FYM',
      });
      setFieldErrors({});
    } catch (err) {
      console.error('[Contracting Intake] Send error:', err);
      setSendResult({
        success: false,
        message: err instanceof Error ? err.message : 'Failed to send form',
      });
    } finally {
      setSending(false);
    }
  };

  const handleProcessHire = (hire: PortalNewHire) => {
    requestQueueSendConfirm(hire);
  };

  const executeProcessHire = async (hire: PortalNewHire) => {
    if (!portalSupabase) return;
    setProcessingHireId(hire.id);

    // Pre-fill the form generator with this hire's data
    setFormData({
      firstName: hire.first_name,
      lastName: hire.last_name,
      email: hire.email,
      phone: hire.phone || '',
      formType: 'field',
      agency: (hire.agency as AgencyName) || 'FYM',
    });
    setShowFormGen(true);
    setSendResult(null);
    setFieldErrors({});

    try {
      // Generate and send the form first
      const securityCode = generateSecurityCode();
      const expiration = new Date();
      expiration.setHours(expiration.getHours() + 72);

      await ensurePortalAuth();
      const { data: agent, error: insertErr } = await portalClient
        .from('agents')
        .insert({
          first_name: hire.first_name.trim(),
          last_name: hire.last_name.trim(),
          email: hire.email.trim(),
          phone: (hire.phone || '').trim(),
          form_type: 'field' as AgentFormType,
          agency: ((hire.agency as AgencyName) || 'FYM'),
          security_code: securityCode,
          status: 'pending',
          date_sent: new Date().toISOString(),
          expiration_date: expiration.toISOString(),
          form_url: `${PORTAL_BASE_URL}/field`,
        })
        .select()
        .single();

      if (insertErr) throw insertErr;

      // Write security code to barrier table (anon-unreadable)
      await portalClient
        .from('agent_security_codes')
        .insert({ agent_id: agent.id, security_code: securityCode });

      const generatedUrl = `${PORTAL_BASE_URL}/field?id=${agent.id}`;

      await portalClient
        .from('agents')
        .update({ form_url: generatedUrl })
        .eq('id', agent.id);

      // Fire webhook
      let webhookFailed = false;
      try {
        await firePopulateWebhook({
          firstName: hire.first_name.trim(),
          lastName: hire.last_name.trim(),
          email: hire.email.trim(),
          phone: (hire.phone || '').trim(),
          formType: 'field',
          agency: (hire.agency as AgencyName) || 'FYM',
          generatedUrl,
          securityCode,
          expirationDate: expiration.toISOString(),
        });
      } catch (webhookErr) {
        webhookFailed = true;
        console.warn('[Contracting Intake] Webhook failed:', webhookErr);
        toast.warning('Form created, but automation trigger failed. Send the link manually or contact support.', {
          duration: 8000,
        });
      }

      // Log activity
      await portalSupabase.from('activity_log').insert({
        agent_id: agent.id,
        action: 'form_sent',
        details: `Intake form sent to ${hire.first_name} ${hire.last_name} (${hire.agency || 'FYM'}) — via queue`,
      });

      // Only NOW mark as processed — form was successfully created
      await portalSupabase
        .from('new_hires')
        .update({ processed: true })
        .eq('id', hire.id);

      setSendResult({
        success: true,
        url: generatedUrl,
        code: securityCode,
        message: webhookFailed
          ? 'Form created but automation failed — send the link manually.'
          : undefined,
      });

      toast.success(`Form sent to ${hire.first_name} ${hire.last_name}`);
      loadNewHires();
    } catch (err) {
      console.error('[Contracting Intake] Process hire error:', err);
      toast.error(`Failed to send form: ${err instanceof Error ? err.message : 'Unknown error'}`);
      setSendResult({
        success: false,
        message: err instanceof Error ? err.message : 'Failed to process hire',
      });
    } finally {
      setProcessingHireId(null);
    }
  };

  const handleRequeue = async (hire: PortalNewHire) => {
    if (!portalSupabase) return;
    setRequeueingId(hire.id);
    try {
      await portalSupabase
        .from('new_hires')
        .update({ processed: false })
        .eq('id', hire.id);

      toast.success(`${hire.first_name} ${hire.last_name} moved back to queue`);
      loadNewHires();
      loadProcessedHires();
    } catch (err) {
      console.error('[Contracting Intake] Requeue error:', err);
      toast.error('Failed to requeue hire');
    } finally {
      setRequeueingId(null);
    }
  };

  const copyToClipboard = async (text: string, field: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  // ── Render ───────────────────────────────────────────────────────────────

  if (!portalSupabase) {
    return (
      <Card className="border-border">
        <CardContent className="p-8 text-center space-y-3">
          <AlertCircle size={28} className="text-amber-500 mx-auto" />
          <h3 className="text-lg font-semibold text-foreground">
            Portal Connection Required
          </h3>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Set{' '}
            <code className="bg-secondary/40 px-1 py-0.5 rounded text-xs">
              VITE_PORTAL_SUPABASE_URL
            </code>{' '}
            and{' '}
            <code className="bg-secondary/40 px-1 py-0.5 rounded text-xs">
              VITE_PORTAL_SUPABASE_KEY
            </code>{' '}
            to connect.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Stats Row ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-amber-500/20">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-2">
              <div className="p-2 bg-amber-500/10 rounded-lg">
                <Users size={18} className="text-amber-400" />
              </div>
              <span className="text-3xl font-bold text-amber-400 tabular-nums">
                {newHires.length}
              </span>
            </div>
            <h3 className="text-muted-foreground text-sm font-medium">
              Awaiting Form
            </h3>
          </CardContent>
        </Card>
        <Card className="border-emerald-500/20">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-2">
              <div className="p-2 bg-emerald-500/10 rounded-lg">
                <CheckCircle size={18} className="text-emerald-400" />
              </div>
              <span className="text-3xl font-bold text-emerald-400 tabular-nums">
                {processedCount}
              </span>
            </div>
            <h3 className="text-muted-foreground text-sm font-medium">Processed</h3>
          </CardContent>
        </Card>
        <Card className="border-blue-500/20 cursor-pointer hover:glow-primary transition-shadow"
          onClick={() => { setShowFormGen(!showFormGen); setSendResult(null); }}>
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-2">
              <div className="p-2 bg-cyan-500/10 rounded-lg">
                <UserPlus size={18} className="text-cyan-400" />
              </div>
              {showFormGen ? (
                <ChevronUp size={18} className="text-blue-400" />
              ) : (
                <ChevronDown size={18} className="text-blue-400" />
              )}
            </div>
            <h3 className="text-muted-foreground text-sm font-medium">
              Send New Form
            </h3>
          </CardContent>
        </Card>
      </div>

      {/* ── Form Generator ─────────────────────────────────────────────── */}
      {showFormGen && (
        <Card className="border-blue-500/20">
          <CardContent className="p-6">
            <h3 className="text-base font-bold text-foreground mb-4 flex items-center gap-2">
              <Send size={16} className="text-cyan-400" />
              Generate & Send Intake Form
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div className="space-y-1.5">
                <Label htmlFor="intake-first-name">First Name</Label>
                <Input
                  id="intake-first-name"
                  value={formData.firstName}
                  onChange={(e) => updateField('firstName', e.target.value)}
                  className={fieldErrors.firstName ? 'border-red-500/50 ring-1 ring-red-500/30' : ''}
                  placeholder="John"
                />
                {fieldErrors.firstName && (
                  <p className="text-xs text-red-400">{fieldErrors.firstName}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="intake-last-name">Last Name</Label>
                <Input
                  id="intake-last-name"
                  value={formData.lastName}
                  onChange={(e) => updateField('lastName', e.target.value)}
                  className={fieldErrors.lastName ? 'border-red-500/50 ring-1 ring-red-500/30' : ''}
                  placeholder="Smith"
                />
                {fieldErrors.lastName && (
                  <p className="text-xs text-red-400">{fieldErrors.lastName}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="intake-email">Email</Label>
                <Input
                  id="intake-email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => updateField('email', e.target.value)}
                  className={fieldErrors.email ? 'border-red-500/50 ring-1 ring-red-500/30' : ''}
                  placeholder="john@example.com"
                />
                {fieldErrors.email && (
                  <p className="text-xs text-red-400">{fieldErrors.email}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="intake-phone">Phone</Label>
                <Input
                  id="intake-phone"
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => updateField('phone', e.target.value)}
                  className={fieldErrors.phone ? 'border-red-500/50 ring-1 ring-red-500/30' : ''}
                  placeholder="(555) 123-4567"
                />
                {fieldErrors.phone && (
                  <p className="text-xs text-red-400">{fieldErrors.phone}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>Form Type</Label>
                <Select
                  value={formData.formType}
                  onValueChange={(v) =>
                    setFormData({ ...formData, formType: v as AgentFormType })
                  }
                >
                  <SelectTrigger className="bg-secondary/50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FORM_TYPES.map((ft) => (
                      <SelectItem key={ft.value} value={ft.value}>
                        {ft.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Agency</Label>
                <Select
                  value={formData.agency}
                  onValueChange={(v) =>
                    setFormData({ ...formData, agency: v as AgencyName })
                  }
                >
                  <SelectTrigger className="bg-secondary/50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {AGENCIES.map((ag) => (
                      <SelectItem key={ag.value} value={ag.value}>
                        {ag.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Button
              onClick={requestManualSendConfirm}
              disabled={sending}
              className="gap-2"
            >
              {sending ? (
                <RefreshCw size={14} className="animate-spin" />
              ) : (
                <Send size={14} />
              )}
              {sending ? 'Sending...' : 'Generate & Send Form'}
            </Button>

            {/* Send result */}
            {sendResult && (
              <div
                className={`mt-4 p-4 rounded-lg border ${
                  sendResult.success
                    ? 'bg-emerald-500/10 border-emerald-500/20'
                    : 'bg-red-500/10 border-red-500/20'
                }`}
              >
                {sendResult.success ? (
                  <div className="space-y-3">
                    <p className="text-sm font-medium text-emerald-300 flex items-center gap-1.5">
                      <CheckCircle size={14} /> Form sent successfully
                    </p>
                    {sendResult.message && (
                      <p className="text-xs text-amber-400 flex items-center gap-1.5">
                        <AlertCircle size={12} /> {sendResult.message}
                      </p>
                    )}
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-emerald-400 font-medium w-20">
                          URL:
                        </span>
                        <code className="text-xs bg-card px-2 py-1 rounded border border-emerald-500/20 flex-1 truncate">
                          {sendResult.url}
                        </code>
                        <button
                          onClick={() =>
                            copyToClipboard(sendResult.url!, 'url')
                          }
                          className="p-1 hover:bg-emerald-500/10 rounded transition-colors"
                          title="Copy URL"
                        >
                          {copiedField === 'url' ? (
                            <Check size={14} className="text-emerald-400" />
                          ) : (
                            <Copy size={14} className="text-emerald-400" />
                          )}
                        </button>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-emerald-400 font-medium w-20">
                          Code:
                        </span>
                        <code className="text-xs bg-card px-2 py-1 rounded border border-emerald-500/20 font-mono font-bold tracking-wider">
                          {sendResult.code}
                        </code>
                        <button
                          onClick={() =>
                            copyToClipboard(sendResult.code!, 'code')
                          }
                          className="p-1 hover:bg-emerald-500/10 rounded transition-colors"
                          title="Copy code"
                        >
                          {copiedField === 'code' ? (
                            <Check size={14} className="text-emerald-400" />
                          ) : (
                            <Copy size={14} className="text-emerald-400" />
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-red-400 flex items-center gap-1.5">
                    <AlertCircle size={14} /> {sendResult.message}
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── New Hires Queue ────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-bold text-foreground">
            New Hires Queue
          </h3>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowProcessed(!showProcessed)}
              className="gap-1.5 text-xs text-muted-foreground"
            >
              {showProcessed ? <EyeOff size={14} /> : <Eye size={14} />}
              {showProcessed ? 'Hide' : 'Show'} Processed
            </Button>
            <button
              onClick={loadNewHires}
              className="p-1.5 rounded-lg hover:bg-secondary transition-colors"
              title="Refresh"
            >
              <RefreshCw size={14} className="text-muted-foreground" />
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, email, phone, agency..."
            value={hiresSearch}
            onChange={(e) => setHiresSearch(e.target.value)}
            className="pl-9 rounded-xl bg-card"
          />
        </div>

        {hiresLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="border-border">
                <CardContent className="p-4">
                  <div className="flex items-center gap-4">
                    <Skeleton className="w-10 h-10 rounded-full" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-36" />
                      <div className="flex gap-3">
                        <Skeleton className="h-3 w-40" />
                        <Skeleton className="h-3 w-28" />
                        <Skeleton className="h-3 w-16" />
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Skeleton className="h-3 w-12" />
                      <Skeleton className="h-7 w-24 rounded-lg" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : filteredHires.length === 0 ? (
          <Card className="border-border">
            <CardContent className="p-8 text-center">
              <CheckCircle
                size={28}
                className="text-emerald-400 mx-auto mb-2"
              />
              <p className="text-sm text-muted-foreground">
                {newHires.length === 0
                  ? 'No new hires awaiting forms. Queue is clear!'
                  : 'No hires match your search.'}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {filteredHires.map((hire) => (
              <Card
                key={hire.id}
                className="border-border hover:border-blue-500/30 hover:glow-sm transition-all"
              >
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4 min-w-0">
                      <div className="w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center shrink-0">
                        <span className="text-sm font-bold text-amber-400">
                          {(hire.first_name[0] ?? '').toUpperCase()}
                          {(hire.last_name[0] ?? '').toUpperCase()}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate">
                          {hire.first_name} {hire.last_name}
                        </p>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                          <span className="flex items-center gap-1 truncate">
                            <Mail size={10} /> {hire.email}
                          </span>
                          {hire.phone && (
                            <span className="flex items-center gap-1">
                              <Phone size={10} />{' '}
                              {formatPhoneDisplay(hire.phone)}
                            </span>
                          )}
                          {hire.agency && (
                            <span className="flex items-center gap-1">
                              <Building2 size={10} /> {hire.agency}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0 ml-4">
                      <span className="text-xs text-muted-foreground">
                        {timeAgo(hire.created_at)}
                      </span>
                      <Button
                        size="sm"
                        onClick={() => handleProcessHire(hire)}
                        disabled={processingHireId === hire.id}
                        className="gap-1.5"
                      >
                        {processingHireId === hire.id ? (
                          <>
                            <RefreshCw size={12} className="animate-spin" />
                            Sending...
                          </>
                        ) : (
                          <>
                            <Send size={12} /> Send Form
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
      {/* ── Processed Hires ───────────────────────────────────────── */}
      {showProcessed && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-bold text-foreground">
              Recently Processed
              <span className="text-xs font-normal text-muted-foreground ml-2">
                (last 50)
              </span>
            </h3>
          </div>

          {processedLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Card key={i} className="border-border">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-4">
                      <Skeleton className="w-10 h-10 rounded-full" />
                      <div className="flex-1 space-y-2">
                        <Skeleton className="h-4 w-36" />
                        <div className="flex gap-3">
                          <Skeleton className="h-3 w-40" />
                          <Skeleton className="h-3 w-28" />
                        </div>
                      </div>
                      <Skeleton className="h-7 w-20 rounded-lg" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : processedHires.length === 0 ? (
            <Card className="border-border">
              <CardContent className="p-6 text-center">
                <p className="text-sm text-muted-foreground">No processed hires found.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {processedHires.map((hire) => (
                <Card
                  key={hire.id}
                  className="border-border opacity-75 hover:opacity-100 transition-all"
                >
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4 min-w-0">
                        <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center shrink-0">
                          <span className="text-sm font-bold text-emerald-400">
                            {(hire.first_name[0] ?? '').toUpperCase()}
                            {(hire.last_name[0] ?? '').toUpperCase()}
                          </span>
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-foreground truncate">
                            {hire.first_name} {hire.last_name}
                            <span className="ml-2 text-xs font-normal text-emerald-400">
                              ✓ Processed
                            </span>
                          </p>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                            <span className="flex items-center gap-1 truncate">
                              <Mail size={10} /> {hire.email}
                            </span>
                            {hire.phone && (
                              <span className="flex items-center gap-1">
                                <Phone size={10} />{' '}
                                {formatPhoneDisplay(hire.phone)}
                              </span>
                            )}
                            {hire.agency && (
                              <span className="flex items-center gap-1">
                                <Building2 size={10} /> {hire.agency}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0 ml-4">
                        <span className="text-xs text-muted-foreground">
                          {timeAgo(hire.created_at)}
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleRequeue(hire)}
                          disabled={requeueingId === hire.id}
                          className="gap-1.5"
                        >
                          {requeueingId === hire.id ? (
                            <>
                              <RefreshCw size={12} className="animate-spin" />
                              Moving...
                            </>
                          ) : (
                            <>
                              <Undo2 size={12} /> Requeue
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Confirmation Dialog ──────────────────────────────────────── */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Send Intake Form?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  This will create an agent record in the portal and trigger GHL
                  to deliver the intake form.
                </p>
                <div className="rounded-lg border border-border bg-secondary/30 p-3 space-y-1">
                  <p className="text-sm font-medium text-foreground">
                    {confirmName}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {confirmFormType} form · {confirmAgency}
                  </p>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmedSend}>
              <Send size={14} className="mr-1.5" />
              Send Form
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
