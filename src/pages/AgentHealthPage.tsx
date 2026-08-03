import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Header } from '@/components/layout/Header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useEffectiveAuth } from '@/hooks/useEffectiveAuth';
import { supabase } from '@/lib/supabase';
import { fetchBookOfBusiness } from '@/lib/prod-api';
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

interface HealthRow {
  agent_id: string;
  active_count: number;
  retained_count: number;
  ever_drafted_count: number;
  persistency_score: number;
  payment_method_score: number;
  contact_recency_score: number;
  product_diversity_score: number;
  total_score: number;
}

interface PolicyRow {
  policy_number: string;
  agent_id: string | null;
  agency_id: string;
  product_type: string | null;
  status: string | null;
  plan_premium: number | null;
  billing_mode: string | null;
  policy_effective_date: string | null;
  paid_to_date: string | null;
  draft_count: number | null;
  last_contact_date: string | null;
  flag_type: string | null;
  is_at_risk: boolean;
  synced_at: string;
}

type ProfileRow = { id: string; full_name: string | null; writing_number: string | null };

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
  { policy_number: 'POL-2024-1003', agent_id: 'mock', agency_id: 'fym', product_type: 'HI',  status: 'active', plan_premium: 56.20,  billing_mode: 'quarterly', policy_effective_date: '2024-03-10', paid_to_date: '2026-06-15', draft_count: 5, last_contact_date: '2026-05-20', flag_type: 'at_risk',       is_at_risk: true,  synced_at: '' },
  { policy_number: 'POL-2024-1004', agent_id: 'mock', agency_id: 'fym', product_type: 'HHC', status: 'active', plan_premium: 198.00, billing_mode: 'monthly',   policy_effective_date: '2024-04-01', paid_to_date: '2026-07-01', draft_count: 4, last_contact_date: '2026-07-15', flag_type: null,             is_at_risk: false, synced_at: '' },
  { policy_number: 'POL-2024-1005', agent_id: 'mock', agency_id: 'fym', product_type: 'HI',  status: 'active', plan_premium: 72.80,  billing_mode: 'monthly',   policy_effective_date: '2024-05-15', paid_to_date: '2026-06-01', draft_count: 2, last_contact_date: '2026-06-10', flag_type: 'at_risk',       is_at_risk: true,  synced_at: '' },
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
  if (score >= 80) return 'bg-cyan-500/10 border-blue-500/20';
  if (score >= 70) return 'bg-amber-500/10 border-amber-500/20';
  return 'bg-red-500/10 border-red-500/20';
}

function flagLabel(flag: string | null) {
  if (!flag) return null;
  if (flag === 'at_risk') return 'At Risk';
  return flag;
}

function flagColor(flag: string | null) {
  if (!flag) return '';
  if (flag === 'at_risk') return 'bg-red-500/10 text-red-400 border-red-500/20';
  return 'bg-orange-500/10 text-amber-400 border-orange-500/20';
}

export function AgentHealthPage() {
  const { agentId } = useParams<{ agentId: string }>();
  const navigate = useNavigate();
  const { effectiveRole, effectiveWritingNumber } = useEffectiveAuth();

  // For agents viewing their own health: use writing_number (matches policy_cache.agent_id)
  // For managers/admins viewing an agent: agentId param is already the writing_number
  const targetId = effectiveRole === 'agent' ? effectiveWritingNumber : agentId;

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
      // Fetch policies from prod DB via edge function
      const [bobRes, profileRes] = await Promise.all([
        fetchBookOfBusiness({ agent_wn: targetId as string, sort: 'issue_date', order: 'desc', page_size: 500 }),
        supabase.from('profiles').select('id, full_name, writing_number').eq('id', targetId as string).maybeSingle(),
      ]);

      const prodPolicies = bobRes.data;
      if (prodPolicies && prodPolicies.length > 0) {
        // Convert prod API shape to local PolicyRow shape
        const localPolicies: PolicyRow[] = prodPolicies.map((p) => ({
          policy_number: p.policy_number,
          agent_id: p.agent_writing_number,
          agency_id: p.agency_id,
          product_type: p.product_type,
          status: p.status,
          plan_premium: p.plan_premium,
          billing_mode: p.billing_mode ? String(p.billing_mode) : 'monthly',
          policy_effective_date: p.policy_effective_date,
          paid_to_date: p.paid_to_date,
          draft_count: p.draft_count,
          last_contact_date: null,
          flag_type: p.flag_type,
          is_at_risk: p.is_at_risk,
          synced_at: '',
        }));
        setPolicies(localPolicies);

        // Compute health scores from policy data
        const active = localPolicies.filter((p) => p.status === 'active');
        const everDrafted = localPolicies.filter((p) => (p.draft_count ?? 0) >= 1).length;
        const retained = localPolicies.filter((p) => (p.draft_count ?? 0) >= 3).length;
        const persistencyPct = everDrafted > 0 ? retained / everDrafted : 0;
        const persistencyScore = Math.round(persistencyPct * 40 * 10) / 10;

        // Product diversity: balance of HI vs HHC
        const hiCount = active.filter((p) => p.product_type === 'HI').length;
        const hhcCount = active.filter((p) => p.product_type === 'HHC').length;
        const total = hiCount + hhcCount;
        const diversityPct = total > 0 ? 1 - Math.abs(hiCount - hhcCount) / total : 0;
        const diversityScore = Math.round(diversityPct * 15 * 10) / 10;

        // Payment method and contact recency not available from prod DB — use baseline
        const paymentScore = 15.0;
        const contactScore = 18.0;
        const totalScore = Math.round((persistencyScore + paymentScore + contactScore + diversityScore) * 10) / 10;

        setHealthData({
          agent_id: targetId as string,
          active_count: active.length,
          retained_count: retained,
          ever_drafted_count: everDrafted,
          persistency_score: persistencyScore,
          payment_method_score: paymentScore,
          contact_recency_score: contactScore,
          product_diversity_score: diversityScore,
          total_score: totalScore,
        });
      } else {
        setHealthData(MOCK_HEALTH);
        setPolicies(MOCK_POLICIES);
        setUsingMock(true);
      }
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
          {[1, 2, 3].map((i) => <div key={i} className="h-24 rounded-lg shimmer " />)}
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
        {effectiveRole !== 'agent' && (
          <button onClick={() => navigate(-1)} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft size={15} /> Back
          </button>
        )}

        {usingMock && effectiveRole !== 'agent' && (
          <div className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded px-3 py-2">
            ⚠ Policy cache not yet populated — showing demo data. Run the sync edge function to populate live data.
          </div>
        )}

        {usingMock && effectiveRole === 'agent' && (
          <div className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded px-3 py-2">
            ⚠ Your book data isn't available yet. Your writing number may not be linked to your account — contact your manager or admin.
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
                  <div className="h-2 w-full rounded-full shimmer overflow-hidden">
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
              <div className="divide-y divide-border/30">
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
              <Badge className="shimmer text-muted-foreground border-border hover:bg-secondary">{policies.length} policies</Badge>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-border/30">
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
