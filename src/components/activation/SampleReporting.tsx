import type { VariantConfig } from '../../lib/onboarding/variants';
import { SectionLabel, Eyebrow, H2 } from './primitives';

interface Props {
  variant: VariantConfig;
  agencyName: string;
}

const TOP_TRANSACTIONS = [
  { agent: 'ISAIAH COLEMAN',     plans: 'UTHHC + UTCGB + UTASH +2 riders',        premium: '$1,108', advance: '$166' },
  { agent: 'AIDAN REYNAUD',      plans: 'UTHHC + UTCGB + UTASH + UTASB +3...',    premium: '$930',   advance: '$139' },
  { agent: 'ALEJANDRO ANGARITA', plans: 'UTCGB + UTHHC +1 rider',                 premium: '$876',   advance: '$131' },
  { agent: 'JEREMY ABRAHAM',     plans: 'UTCGB + UTHHC +1 rider',                 premium: '$862',   advance: '$129' },
  { agent: 'ALEJANDRO ANGARITA', plans: 'UFGHI + UAMBF +1 rider',                 premium: '$795',   advance: '$119' },
];

const FORECAST_WEEKS = [
  { label: 'Week +1', amount: '$5,675' },
  { label: 'Week +2', amount: '$6,374' },
  { label: 'Week +3', amount: '$7,071' },
  { label: 'Week +4', amount: '$7,770' },
];

export default function SampleReporting({ variant, agencyName }: Props) {
  return (
    <section id="reporting" className="py-24 md:py-32 px-6 bg-fym-cream2/40">
      <div className="max-w-7xl mx-auto">
        <SectionLabel n="07" label="Friday Reporting" />

        <div className="grid lg:grid-cols-12 gap-10 mb-12">
          <div className="lg:col-span-7">
            <Eyebrow>Weekly Email Format</Eyebrow>
            <H2 className="mt-3">What lands in your inbox every Friday.</H2>
            <p className="text-fym-muted mt-6 leading-[1.6] max-w-xl">
              A sample of the metrics and policy-level breakdown you&apos;ll receive each week from {variant.primaryFirstName}.
              Send your distribution list to lock in your team.
            </p>
          </div>
        </div>

        <div className="bg-white border border-fym-ink/10 rounded-xl overflow-hidden">
          {/* Email header */}
          <div className="px-8 md:px-12 py-8 border-b border-fym-ink/10">
            <Eyebrow>Email Subject</Eyebrow>
            <div className="text-xl md:text-2xl text-fym-ink tracking-tight mt-2 font-semibold">
              Weekly Production Summary &mdash; {agencyName}
            </div>
            <div className="text-[12px] text-fym-muted mt-2">
              Week ending Apr 29 &middot; Sample week &mdash; your real numbers each Friday
            </div>
          </div>

          {/* Top-line summary */}
          <div className="grid md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-fym-ink/10">
            <BigStat label="Delivered"   amount="$5,814"  sub="121 policies"     tone="positive" />
            <BigStat label="CB / NTO"    amount="-$272"   sub="6 policies"       tone="negative" />
            <BigStat label="Net to You"  amount="$5,542"  sub="4.7% loss"        tone="neutral" />
          </div>

          {/* Secondary row */}
          <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-fym-ink/10 border-t border-fym-ink/10">
            <SmallStat label="Avg Premium" amount="$429"   sub="per policy" />
            <SmallStat label="Avg Advance" amount="$48"    sub="per policy" />
            <SmallStat label="Week / Week" amount="+53%"   sub="+$1,913" tone="positive" />
          </div>

          {/* Book health strip */}
          <div className="px-8 md:px-12 py-5 border-t border-fym-ink/10 bg-fym-cream2/30">
            <p className="text-[13px] text-fym-muted">
              <span className="font-medium text-fym-ink/80">Year to date:</span> $20,266 &middot; 443 active
              policies &middot; $186k book AP &middot; 5.1% loss rate
            </p>
          </div>

          {/* Top transactions table */}
          <div className="px-8 md:px-12 py-8 border-t border-fym-ink/10">
            <Eyebrow>Top Transactions This Week</Eyebrow>
            <div className="mt-6 -mx-4 overflow-x-auto">
              <table className="w-full min-w-[640px]">
                <thead>
                  <tr className="border-b border-fym-ink/10">
                    <th className="text-left text-[10px] tracking-[0.18em] uppercase text-fym-muted px-4 py-3">
                      Agent
                    </th>
                    <th className="text-left text-[10px] tracking-[0.18em] uppercase text-fym-muted px-4 py-3">
                      Plan(s)
                    </th>
                    <th className="text-right text-[10px] tracking-[0.18em] uppercase text-fym-muted px-4 py-3">
                      Premium
                    </th>
                    <th className="text-right text-[10px] tracking-[0.18em] uppercase text-fym-muted px-4 py-3">
                      Advance
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {TOP_TRANSACTIONS.map((t, i) => (
                    <tr key={`${t.agent}-${i}`} className="border-b border-fym-ink/5 last:border-0">
                      <td className="px-4 py-4 text-[13px] text-fym-ink tracking-wide">{t.agent}</td>
                      <td className="px-4 py-4 font-mono text-[12px] text-fym-muted">{t.plans}</td>
                      <td className="px-4 py-4 text-[13px] text-fym-ink text-right tabular-nums">
                        {t.premium}
                      </td>
                      <td className="px-4 py-4 text-[13px] text-fym-brass text-right font-medium tabular-nums">
                        {t.advance}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="text-[12px] text-fym-muted mt-4">
              127 policy events rolled up this week.
            </div>
          </div>

          {/* 4-Week Cash Flow Forecast */}
          <div className="px-8 md:px-12 py-8 border-t border-fym-ink/10">
            <Eyebrow>Next 4 Weeks</Eyebrow>
            <div className="text-[12px] text-fym-muted mt-2">
              Based on 8-week linear trend &middot; advances growing 28%/wk
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
              {FORECAST_WEEKS.map((w) => (
                <div
                  key={w.label}
                  className="border border-fym-ink/10 rounded-lg px-4 py-4 bg-fym-cream2/20"
                >
                  <div className="text-[10px] tracking-[0.2em] uppercase text-fym-muted">
                    {w.label}
                  </div>
                  <div className="text-2xl text-fym-ink tracking-tight mt-2 tabular-nums font-bold">
                    {w.amount}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-6 pt-6 border-t border-fym-ink/10 flex items-baseline justify-between flex-wrap gap-3">
              <div className="text-[11px] tracking-[0.2em] uppercase text-fym-muted">
                Projected 4-Week Total
              </div>
              <div className="text-3xl md:text-4xl text-fym-brass tracking-tight tabular-nums font-bold">
                $26,890
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="px-8 md:px-12 py-5 border-t border-fym-ink/10 bg-fym-cream2/30">
            <p className="italic text-[12px] text-fym-muted">
              {variant.weeklyEmailFooter}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function BigStat({
  label,
  amount,
  sub,
  tone,
}: {
  label: string;
  amount: string;
  sub: string;
  tone: 'positive' | 'negative' | 'neutral';
}) {
  const amountColor =
    tone === 'negative' ? 'text-red-700' : 'text-fym-ink';
  return (
    <div className="p-8">
      <Eyebrow>{label}</Eyebrow>
      <div className={`text-4xl tracking-tight tabular-nums mt-3 font-bold ${amountColor}`}>
        {amount}
      </div>
      <div className="text-[12px] text-fym-muted mt-2 tracking-wide">{sub}</div>
    </div>
  );
}

function SmallStat({
  label,
  amount,
  sub,
  tone,
}: {
  label: string;
  amount: string;
  sub: string;
  tone?: 'positive' | 'negative';
}) {
  const amountColor =
    tone === 'positive' ? 'text-fym-brass' : tone === 'negative' ? 'text-red-700' : 'text-fym-ink';
  return (
    <div className="p-6 md:p-8">
      <Eyebrow>{label}</Eyebrow>
      <div className={`text-2xl tracking-tight tabular-nums mt-2 font-bold ${amountColor}`}>
        {amount}
      </div>
      <div className="text-[12px] text-fym-muted mt-1">{sub}</div>
    </div>
  );
}
