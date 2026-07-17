import { useState, useEffect } from 'react';
import { Header } from '@/components/layout/Header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/lib/supabase';
import { UserPlus, CheckCircle2, AlertCircle, Users, Copy } from 'lucide-react';

interface ProvisionedAgent {
  user_id: string;
  email: string;
  full_name: string;
  writing_number: string;
  role: string;
  temp_password: string;
  policies_will_link: number;
}

interface ExistingAgent {
  id: string;
  full_name: string | null;
  writing_number: string | null;
  npn: string | null;
  agency_id: string | null;
  role: string;
  created_at: string;
}

export function AgentProvisioningPage() {
  // Form state
  const [email, setEmail]               = useState('');
  const [fullName, setFullName]         = useState('');
  const [writingNumber, setWritingNumber] = useState('');
  const [npn, setNpn]                   = useState('');
  const [agencyId, setAgencyId]         = useState('');
  const [role, setRole]                 = useState<'agent' | 'manager'>('agent');

  // UI state
  const [submitting, setSubmitting]     = useState(false);
  const [result, setResult]             = useState<ProvisionedAgent | null>(null);
  const [error, setError]               = useState<string | null>(null);
  const [copied, setCopied]             = useState(false);

  // Existing agents list
  const [agents, setAgents]             = useState<ExistingAgent[]>([]);
  const [loadingAgents, setLoadingAgents] = useState(true);

  useEffect(() => {
    if (!supabase) { setLoadingAgents(false); return; }
    supabase
      .from('profiles')
      .select('id, full_name, writing_number, npn, agency_id, role, created_at')
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (data) setAgents(data as ExistingAgent[]);
        setLoadingAgents(false);
      });
  }, [result]); // refresh after each provision

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    setSubmitting(true);

    try {
      const { data: { session } } = await supabase!.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/provision-agent`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            email: email.trim().toLowerCase(),
            full_name: fullName.trim(),
            writing_number: writingNumber.trim().toUpperCase(),
            npn: npn.trim() || undefined,
            agency_id: agencyId.trim() || undefined,
            role,
          }),
        }
      );

      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);

      setResult(json as ProvisionedAgent);
      // Clear form
      setEmail(''); setFullName(''); setWritingNumber(''); setNpn(''); setAgencyId('');
    } catch (err: any) {
      setError(err.message ?? 'Unknown error');
    } finally {
      setSubmitting(false);
    }
  }

  function copyCredentials() {
    if (!result) return;
    navigator.clipboard.writeText(`Email: ${result.email}\nTemp password: ${result.temp_password}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const provisionedCount = agents.filter(a => a.writing_number).length;

  return (
    <div>
      <Header title="Agent Provisioning" />
      <div className="p-6 space-y-6">

        {/* ── Stats strip ── */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'Total Profiles', value: agents.length, sub: 'in Supabase auth' },
            { label: 'With Writing #', value: provisionedCount, sub: 'will link on next sync' },
            { label: 'Without Writing #', value: agents.length - provisionedCount, sub: 'health view unavailable' },
          ].map(c => (
            <Card key={c.label} className="border-slate-200">
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-500">{c.label}</p>
                    <p className="text-2xl font-bold text-slate-900 mt-1">{c.value}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{c.sub}</p>
                  </div>
                  <div className="p-2.5 rounded-lg bg-blue-50"><Users size={20} className="text-[#1e3a5f]" /></div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* ── Provision form ── */}
          <Card className="border-slate-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold text-slate-900 flex items-center gap-2">
                <UserPlus size={18} className="text-[#1e3a5f]" />
                Provision New Agent
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <label className="text-xs font-medium text-slate-500 mb-1 block">Full Name *</label>
                    <Input
                      required
                      placeholder="Jane Smith"
                      value={fullName}
                      onChange={e => setFullName(e.target.value)}
                      className="bg-white"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="text-xs font-medium text-slate-500 mb-1 block">Email *</label>
                    <Input
                      required
                      type="email"
                      placeholder="jane@agency.com"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      className="bg-white"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-500 mb-1 block">Writing Number *</label>
                    <Input
                      required
                      placeholder="e.g. WA12345"
                      value={writingNumber}
                      onChange={e => setWritingNumber(e.target.value)}
                      className="bg-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-500 mb-1 block">NPN</label>
                    <Input
                      placeholder="12345678"
                      value={npn}
                      onChange={e => setNpn(e.target.value)}
                      className="bg-white font-mono"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="text-xs font-medium text-slate-500 mb-1 block">Agency ID</label>
                    <Input
                      placeholder="Agency UUID or slug"
                      value={agencyId}
                      onChange={e => setAgencyId(e.target.value)}
                      className="bg-white font-mono text-sm"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="text-xs font-medium text-slate-500 mb-1 block">Role</label>
                    <div className="flex gap-2">
                      {(['agent', 'manager'] as const).map(r => (
                        <button
                          key={r}
                          type="button"
                          onClick={() => setRole(r)}
                          className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                            role === r
                              ? 'bg-[#1e3a5f] text-white border-[#1e3a5f]'
                              : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'
                          }`}
                        >
                          {r.charAt(0).toUpperCase() + r.slice(1)}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <p className="text-xs text-slate-400">
                  A temporary password will be auto-generated. The account is pre-confirmed — they can log in immediately.
                </p>

                <Button
                  type="submit"
                  disabled={submitting}
                  className="w-full bg-[#1e3a5f] hover:bg-[#162d4a] text-white"
                >
                  {submitting ? 'Provisioning…' : 'Provision Agent Account'}
                </Button>
              </form>

              {/* Success */}
              {result && (
                <div className="mt-4 p-4 rounded-lg bg-emerald-50 border border-emerald-200">
                  <div className="flex items-start gap-2">
                    <CheckCircle2 size={18} className="text-emerald-600 mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-emerald-800">{result.full_name} provisioned!</p>
                      <p className="text-xs text-emerald-700 mt-1">Writing # {result.writing_number} · {result.role}</p>
                      <div className="mt-2 p-2.5 rounded bg-white border border-emerald-200 font-mono text-xs text-slate-700 space-y-0.5">
                        <div>Email: {result.email}</div>
                        <div>Temp PW: {result.temp_password}</div>
                      </div>
                      {result.policies_will_link > 0 ? (
                        <p className="text-xs text-emerald-700 mt-2">
                          🔗 {result.policies_will_link} policies will link on next sync.
                        </p>
                      ) : (
                        <p className="text-xs text-emerald-700 mt-2">
                          Policies link automatically on next nightly sync (4 AM CT) once writing number matches.
                        </p>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={copyCredentials}
                        className="mt-2 h-7 text-xs border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                      >
                        <Copy size={12} className="mr-1.5" />
                        {copied ? 'Copied!' : 'Copy credentials'}
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* Error */}
              {error && (
                <div className="mt-4 p-3 rounded-lg bg-red-50 border border-red-200 flex items-start gap-2">
                  <AlertCircle size={16} className="text-red-600 mt-0.5 shrink-0" />
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* ── Existing agents ── */}
          <Card className="border-slate-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold text-slate-900">Current Profiles</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {loadingAgents ? (
                <div className="p-4 space-y-2">
                  {[1,2,3].map(i => <div key={i} className="h-10 rounded bg-slate-100 animate-pulse" />)}
                </div>
              ) : (
                <div className="divide-y divide-slate-100 max-h-[480px] overflow-y-auto">
                  <div className="grid grid-cols-12 gap-2 px-4 py-2 bg-slate-50 text-xs font-semibold text-slate-500">
                    <span className="col-span-4">Name</span>
                    <span className="col-span-3">Writing #</span>
                    <span className="col-span-3">NPN</span>
                    <span className="col-span-2 text-right">Role</span>
                  </div>
                  {agents.map(a => (
                    <div key={a.id} className="grid grid-cols-12 gap-2 px-4 py-2.5 text-sm items-center">
                      <span className="col-span-4 font-medium text-slate-800 truncate">{a.full_name ?? '—'}</span>
                      <span className={`col-span-3 font-mono text-xs ${a.writing_number ? 'text-slate-700' : 'text-slate-300'}`}>
                        {a.writing_number ?? 'not set'}
                      </span>
                      <span className={`col-span-3 font-mono text-xs ${a.npn ? 'text-slate-700' : 'text-slate-300'}`}>
                        {a.npn ?? '—'}
                      </span>
                      <span className="col-span-2 text-right">
                        <Badge className={`text-[10px] px-1.5 py-0 border ${
                          a.role === 'admin'   ? 'bg-violet-50 text-violet-700 border-violet-200' :
                          a.role === 'manager' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                                                 'bg-slate-50 text-slate-600 border-slate-200'
                        }`}>
                          {a.role}
                        </Badge>
                      </span>
                    </div>
                  ))}
                  {agents.length === 0 && (
                    <p className="text-center py-8 text-slate-400 text-sm">No profiles yet.</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

      </div>
    </div>
  );
}
