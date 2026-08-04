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
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { portalSupabase } from '@/lib/portal-supabase';
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
];

const AGENCIES: { label: string; value: AgencyName }[] = [
  { label: 'FYM', value: 'FYM' },
  { label: 'Wisechoice', value: 'Wisechoice' },
  { label: 'Aspire', value: 'Aspire' },
];

const PORTAL_BASE_URL = 'https://contracting.teamfym.com';

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

  useEffect(() => {
    loadNewHires();
    const interval = setInterval(loadNewHires, 60_000);
    return () => clearInterval(interval);
  }, [loadNewHires]);

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

  const handleSendForm = async () => {
    if (!portalSupabase) return;
    if (
      !formData.firstName.trim() ||
      !formData.lastName.trim() ||
      !formData.email.trim() ||
      !formData.phone.trim()
    ) {
      setSendResult({ success: false, message: 'All fields are required.' });
      return;
    }

    setSending(true);
    setSendResult(null);

    try {
      const securityCode = generateSecurityCode();
      const expiration = new Date();
      expiration.setHours(expiration.getHours() + 72);

      // Create agent record in portal DB
      const { data: agent, error: insertErr } = await portalSupabase
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
          form_url: `${PORTAL_BASE_URL}/intake/${formData.formType}`,
        })
        .select()
        .single();

      if (insertErr) throw insertErr;

      const generatedUrl = `${PORTAL_BASE_URL}/intake/${formData.formType}?id=${agent.id}`;

      // Update the agent record with the full URL
      await portalSupabase
        .from('agents')
        .update({ form_url: generatedUrl })
        .eq('id', agent.id);

      // Fire the populate webhook to trigger GHL/Zapier
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
        console.warn('[Contracting Intake] Webhook failed (form still created):', webhookErr);
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

  const handleProcessHire = async (hire: PortalNewHire) => {
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

    // Mark as processed
    if (portalSupabase) {
      await portalSupabase
        .from('new_hires')
        .update({ processed: true })
        .eq('id', hire.id);

      // Refresh the list
      loadNewHires();
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
              <span className="text-2xl font-bold text-amber-400">
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
              <span className="text-2xl font-bold text-emerald-400">
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
              <div>
                <label className="block text-sm font-medium text-foreground/80 mb-1">
                  First Name
                </label>
                <input
                  type="text"
                  value={formData.firstName}
                  onChange={(e) =>
                    setFormData({ ...formData, firstName: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                  placeholder="John"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground/80 mb-1">
                  Last Name
                </label>
                <input
                  type="text"
                  value={formData.lastName}
                  onChange={(e) =>
                    setFormData({ ...formData, lastName: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                  placeholder="Smith"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground/80 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) =>
                    setFormData({ ...formData, email: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                  placeholder="john@example.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground/80 mb-1">
                  Phone
                </label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) =>
                    setFormData({ ...formData, phone: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                  placeholder="(555) 123-4567"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground/80 mb-1">
                  Form Type
                </label>
                <select
                  value={formData.formType}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      formType: e.target.value as AgentFormType,
                    })
                  }
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                >
                  {FORM_TYPES.map((ft) => (
                    <option key={ft.value} value={ft.value}>
                      {ft.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground/80 mb-1">
                  Agency
                </label>
                <select
                  value={formData.agency}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      agency: e.target.value as AgencyName,
                    })
                  }
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                >
                  {AGENCIES.map((ag) => (
                    <option key={ag.value} value={ag.value}>
                      {ag.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <button
              onClick={handleSendForm}
              disabled={sending}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/80 disabled:opacity-50 transition-colors"
            >
              {sending ? (
                <RefreshCw size={14} className="animate-spin" />
              ) : (
                <Send size={14} />
              )}
              {sending ? 'Sending...' : 'Generate & Send Form'}
            </button>

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
          <button
            onClick={loadNewHires}
            className="p-1.5 rounded-lg hover:bg-secondary transition-colors"
            title="Refresh"
          >
            <RefreshCw size={14} className="text-muted-foreground" />
          </button>
        </div>

        {/* Search */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search by name, email, phone, agency..."
            value={hiresSearch}
            onChange={(e) => setHiresSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-card"
          />
        </div>

        {hiresLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-20 rounded-xl bg-secondary/30 animate-pulse"
              />
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
                      <button
                        onClick={() => handleProcessHire(hire)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary text-white text-xs font-medium rounded-lg hover:bg-primary/80 transition-colors"
                      >
                        <Send size={12} /> Send Form
                      </button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
