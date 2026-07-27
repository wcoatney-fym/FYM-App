import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Header } from '@/components/layout/Header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import type { Database } from '@/lib/database.types';
import {
  ArrowLeft,
  ShieldCheck,
  CreditCard,
  Phone,
  LayoutGrid,
  AlertTriangle,
  CheckCircle2,
  Clock,
} from 'lucide-react';

type HealthRow = Database['public']['Views']['agent_health_scores']['Row'];
type PolicyRow = Database['public']['Tables']['policy_cache']['Row'];
type ProfileRow = Database['public']['Tables']['profiles']['Row'];

const MOCK_HEALTH: HealthRow = {
  agent_id: 'mock',
  active_count: 52,
  retained_count: 48,
  ever_drafted_count: 51,
  persistency_score: 37.6,
  payment_method_score: 18.2,
  contact_recency_score: 22.4,
  product_diversity_score: 13.5,
  total_score: 91.7,
};

const MOCK_POLICIES: PolicyRow[] = [
  { policy_number: 'POL-2024-1001', agent_id: 'mock', agency_id: 'fym', product_type: 'HI',  status: 'active', plan_premium: 87.40,  billing_mode: 'monthly',   policy_effective_date: '2024-01-15', paid_to_date: '2026-07-01', draft_count: 7, last_contact_date: '2026-07-10', flag_type: null,             is_at_risk: false, synced_at: '' },
  { policy_number: 'POL-2024-1002', agent_id: 'mock', agency_id: 'fym', product_type: 'HHC', status: 'active', plan_premium: 124.60, billing_mode: 'monthly',   policy_effective_date: '2024-02-01', paid_to_date: '2026-07-01', draft_count: 6, last_contact_date: '2026-06-28', flag_type: null,             is_at_risk: false, synced_at: '' },
  { policy_number: 'POL-2024-1003', agent_id: 'mock', agency_id: 'fym', product_type: 'HI',  status: 'active', plan_premium: 56.20,  billing_mode: 'quarterly', policy_effective_date: '2024-03-10', paid_to_date: '2026-06-15', draft_count: 5, last_contact_date: '2026-05-20', flag_type: 'no_contact',     is_at_risk: true,  synced_at: '' },
  { policy_number: 'POL-2024-1004', agent_id: 'mock', agency_id: 'fym', product_type: 'HHC', status: 'active', plan_premium: 198.00, billing_mode: 'monthly',   policy_effective_date: '2024-04-01', paid_to_date: '2026-07-01', draft_count: 4, last_contact_date: '2026-07-15', flag_type: null,             is_at_risk: false, synced_at: '' },
  { policy_number: 'POL-2024-1005', agent_id: 'mock', agency_id: 'fym', product_type: 'HI',  status: 'active', plan_premium: 72.80,  billing_mode: 'monthly',   policy_effective_date: '2024-05-15', paid_to_date: '2026-06-01', draft_count: 2, last_contact_date: '2026-06-10', flag_type: 'payment_failed', is_at_risk: true,  synced_at: '' },
  { policy_number: 'POL-2024-1006', agent_id: 'mock', agency_id: 'fym', product_type: 'HI',  status: 'lapsed', plan_premium: 91.50,  billing_mode: 'monthly',   policy_effective_date: '2024-06-01', paid_to_date: '2026-04-01', draft_count: 1, last_contact_date: '2026-04-05', flag_type: null,             is_at_risk: false, synced_at: '' },
];

function scoreColor(score: number, max: number) {
  const pct = (score / max) * 100;
  if (pct >= 90) return { bar: 'bg-emerald-500/100', text: 'text-emerald-400' };
  if (pct >= 75) return { bar: 'bg-cyan-500/100',    text: 'text-cyan-400' };
  if (pct >= 60) return { bar: 'bg-amber-400',   text: 'text-amber-400' };
  return { bar: 'bg-red-400', text: 'text-red-400' };
}

function totalScoreColor(score: number) {
  if (score >= 90) return 'text-emerald-400';
  if (score >= 80) return 'text-cyan-400';
  if (score >= 70) return 'text-amber-400';
  return 'text-red-400';
}

function totalScoreBg(score: number) {
  if (score >= 90) return 'bg-emerald-500/10 border-emerald-500/20';
  if (score >= 80) return 'bg-cyan-500/10 border-blue-200';
  if (score >= 70) return 'bg-amber-500/10 border-amber-500/20';
  return 'bg-red-500/10 border-red-500/20';
}

function flagLabel(flag: string | null) {
  if (!flag) return null;
  const map: Record<string, string> = { payment_failed: 'Payment Failed', no_contact: 'No Contact', rate_action: 'Rate Action' };
  return map[flag] ?? flag;
}

function flagColor(flag: string | null) {
  if (!flag) return '';
  if (flag === 'payment_failed') return 'bg-red-100 text-red-400 border-red-500/20';
  if (flag === 'no_contact') return 'bg-amber-500/100/10 text-amber-400 border-amber-500/20';
  return 'bg-orange-100 text-amber-400 border-orange-200';
}

export function AgentHealthPage() {
  const { agentId } = useParams<{ agentId: string }>();
  const navigate = useNavigate();
  const { profile, role } = useAuth();

  const targetId = role === 'agent' ? profile?.id : agentId;

  const [healthData, setHealthData] = useState<HealthRow | null>(null);
  const [policies, setPolicies] = useState<PolicyRow[]>([]);
  const [agentProfile, setAgentProfile] = useState<ProfileRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [usingMock, setUsingMock] = useState(false);

  useEffect(() => {
    if (!targetId) return;
    async function load() {
      setLoading(true);
      if (!supabase) {
        setHealthData(MOCK_HEALTH);
        setPolicies(MOCK_POLICIES);
        setUsingMock(true);
        setLoading(false);
        return;
      }
      const [healthRes, policiesRes, profileRes] = await Promise.all([
        supabase.from('agent_health_scores').select('*').eq('agent_id', targetId as string).maybeSingle(),
        supabase.from('policy_cache').select('*').eq('agent_id', targetId as string).order('policy_effective_date', { ascending: false }),
        supabase.from('profiles').select('*').eq('id', targetId as string).maybeSingle(),
      ]);
      if (healthRes.data) {
        setHealthData(healthRes.data as typeof MOCK_HEALTH);
      } else {
        setHealthData(MOCK_HEALTH);
        setUsingMock(true);
      }
      setPolicies((policiesRes.data && policiesRes.data.length > 0 ? policiesRes.data : MOCK_POLICIES) as typeof MOCK_POLICIES);
      setAgentProfile((profileRes.data ?? null) as typeof agentProfile);
      setLoading(false);
    }
    load();
  }, [targetId]);

  if (loading) {
    return (
      <div>
        <Header title="Agent Book Health" />
        <div className="p-6 space-y-4">
          {[1, 2, 3].map((i) => <div key={i} className="h-24 rounded-lg bg-slate-100 animate-pulse" />)}
        </div>
      </div>
    );
  }

  const h = healthData ?? MOCK_HEALTH;
  const agentName = agentProfile?.full_name ?? 'Agent';
  const atRiskPolicies = policies.filter((p) => p.is_at_risk);
  const activePolicies = policies.filter((p) => p.status === 'active');
  const monthlyPremium = activePolicies.reduce((sum, p) => sum + (p.plan_premium ?? 0), 0);

  const scoreComponents = [
    { label: 'Persistency',         icon: <ShieldCheck size={16} />, score: h.persistency_score,      max: 40, detail: `${h.retained_count} of ${h.ever_drafted_count} policies reached draft 3+ (90-day retained)` },
    { label: 'Payment Method Mix',  icon: <CreditCard size={16} />,  score: h.payment_method_score,   max: 20, detail: 'Monthly EFT/ACH as % of active policies' },
    { label: 'Contact Recency',     icon: <Phone size={16} />,       score: h.contact_recency_score,  max: 25, detail: 'Avg days since last client contact (lower = better)' },
    { label: 'Product Diversity',   icon: <LayoutGrid size={16} />,  score: h.product_diversity_score, max: 15, detail: 'Balance of HI vs HHC in active book' },
  ];

  return (
    <div>
      <Header title="Agent Book Health" />
      <div className="p-6 space-y-5">
        {role !== 'agent' && (
          <button onClick={() => navigate(-1)} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft size={15} /> Back
          </button>
        )}

        {usingMock && (
          <div className="text-xs text-amber-600 bg-amber-500/10 border border-amber-500/20 rounded px-3 py-2">
            ⚠ Policy cache not yet populated — showing demo data. Run the sync edge function to populate live data.
          </div>
        )}

        {/* Total score card */}
        <Card className={`border ${totalScoreBg(h.total_score)}`}>
          <CardContent className="p-5 flex items-center justify-between gap-4">
            <div>
              <p className="text-lg font-semibold text-foreground">{agentName}</p>
              {agentProfile?.writing_number && (
                <p className="text-xs text-muted-foreground mt-0.5">Writing # {agentProfile.writing_number}</p>
              )}
              <div className="flex gap-3 mt-3 text-sm flex-wrap">
                <span className="text-muted-foreground"><span className="font-semibold text-foreground">{h.active_count}</span> active policies</span>
                <span className="text-muted-foreground/70">·</span>
                <span className="text-muted-foreground"><span className="font-semibold text-foreground">${monthlyPremium.toFixed(0)}</span>/mo premium</span>
                {atRiskPolicies.length > 0 && (
                  <>
                    <span className="text-muted-foreground/70">·</span>
                    <span className="text-red-400 font-medium flex items-center gap-1"><AlertTriangle size={13} /> {atRiskPolicies.length} at risk</span>
                  </>
                )}
              </div>
            </div>
            <div className="text-right flex-shrink-0">
              <p className={`text-5xl font-bold ${totalScoreColor(h.total_score)}`}>{h.total_score}</p>
              <p className="text-xs text-muted-foreground/70 mt-1">Book Health Score</p>
            </div>
          </CardContent>
        </Card>

        {/* Score breakdown */}
        <Card className="border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold text-foreground">Score Breakdown</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5 pt-1">
            {scoreComponents.map(({ label, icon, score, max, detail }) => {
              const colors = scoreColor(score, max);
              return (
                <div key={label}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className={`flex items-center gap-1.5 text-sm font-medium ${colors.text}`}>{icon} {label}</span>
                    <span className={`text-sm font-bold ${colors.text}`}>{score} <span className="text-muted-foreground/70 font-normal">/ {max}</span></span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${colors.bar}`} style={{ width: `${(score / max) * 100}%` }} />
                  </div>
                  <p className="text-xs text-muted-foreground/70 mt-1">{detail}</p>
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* At-risk policies */}
        {atRiskPolicies.length > 0 && (
          <Card className="border-red-500/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold text-red-400 flex items-center gap-2">
                <AlertTriangle size={16} /> At-Risk Policies
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-slate-100">
                {atRiskPolicies.map((p) => (
                  <div key={p.policy_number} className="flex items-center gap-3 px-4 py-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground">{p.policy_number}</p>
                      <p className="text-xs text-muted-foreground/70">{p.product_type} · ${p.plan_premium}/mo · {p.billing_mode}</p>
                    </div>
                    {p.flag_type && <Badge className={`text-xs border ${flagColor(p.flag_type)}`}>{flagLabel(p.flag_type)}</Badge>}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Full policy book */}
        <Card className="border-border">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold text-foreground">Policy Book</CardTitle>
              <Badge className="bg-slate-100 text-muted-foreground border-border hover:bg-secondary">{policies.length} policies</Badge>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-slate-100">
              {policies.map((p) => (
                <div key={p.policy_number} className="flex items-center gap-3 px-4 py-3 hover:bg-background transition-colors">
                  <div className="flex-shrink-0">
                    {p.status === 'active' && !p.is_at_risk
                      ? <CheckCircle2 size={15} className="text-emerald-500" />
                      : p.is_at_risk
                      ? <AlertTriangle size={15} className="text-red-500" />
                      : <Clock size={15} className="text-muted-foreground/70" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">{p.policy_number}</p>
                    <p className="text-xs text-muted-foreground/70">
                      {p.product_type} · {p.billing_mode} · {p.draft_count} draft{p.draft_count !== 1 ? 's' : ''}
                      {p.last_contact_date && ` · last contact ${p.last_contact_date}`}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0 flex items-center gap-2">
                    {p.flag_type && <Badge className={`text-xs border hidden sm:inline-flex ${flagColor(p.flag_type)}`}>{flagLabel(p.flag_type)}</Badge>}
                    <div>
                      <p className="text-sm font-semibold text-foreground">${p.plan_premium?.toFixed(2)}</p>
                      <p className="text-xs text-muted-foreground/70">/mo</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
