-- Phase 1: health score + leaderboard views
-- Health score is computed 0–100 from four weighted components.
-- All raw policy data is expected to be materialized into the `policy_cache` table
-- by a scheduled edge function that reads from the tracker DB (lryxx).
-- This keeps RLS/auth clean and the frontend fast.

-- ─── Policy cache (populated by edge function, read-only in app) ────────────
create table public.policy_cache (
  policy_number       text primary key,
  agent_id            uuid references public.profiles(id) on delete set null,
  agency_id           text not null,
  product_type        text,         -- 'HI' | 'HHC'
  status              text,         -- 'active' | 'lapsed' | 'pending' etc.
  plan_premium        numeric(10,2),
  billing_mode        text,         -- 'monthly' | 'quarterly' | 'annual'
  policy_effective_date date,
  paid_to_date        date,
  draft_count         int default 0,  -- number of successful drafts
  last_contact_date   date,
  flag_type           text,         -- null | 'payment_failed' | 'no_contact' | 'rate_action'
  is_at_risk          boolean not null default false,
  synced_at           timestamptz not null default now()
);

create index on public.policy_cache(agent_id);
create index on public.policy_cache(agency_id);
create index on public.policy_cache(is_at_risk);
create index on public.policy_cache(product_type);

alter table public.policy_cache enable row level security;

-- Agents see only their own policies
create policy "policy_cache: agent own"
  on public.policy_cache for select
  using (agent_id = auth.uid());

-- Managers see their agency
create policy "policy_cache: manager agency"
  on public.policy_cache for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('manager', 'admin')
        and p.agency_id = policy_cache.agency_id
    )
  );

-- Admins see all
create policy "policy_cache: admin all"
  on public.policy_cache for select
  using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );


-- ─── Health score computation ────────────────────────────────────────────────
-- Formula (weights sum to 100):
--   persistency_score   40pts  → % of agent's policies that reached draft 3+ (90-day retained)
--   payment_method_mix  20pts  → % on monthly EFT/ACH (most stable billing mode)
--   contact_recency     25pts  → recency of last contact across active policies (decay curve)
--   product_diversity   15pts  → mix of HI vs HHC (0 = mono-line, 15 = balanced)
--
-- Weights documented here; update the view + MEMORY.md if formula changes.

create or replace view public.agent_health_scores as
with agent_policies as (
  select
    pc.agent_id,
    count(*) filter (where pc.status = 'active')                          as active_count,
    count(*) filter (where pc.draft_count >= 3)                           as retained_count,
    count(*) filter (where pc.draft_count >= 1)                           as ever_drafted_count,
    count(*) filter (where pc.billing_mode = 'monthly' and pc.status = 'active') as monthly_eft_count,
    count(*) filter (where pc.product_type = 'HI' and pc.status = 'active')  as hi_count,
    count(*) filter (where pc.product_type = 'HHC' and pc.status = 'active') as hhc_count,
    -- contact recency: avg days since last contact, capped at 180
    avg(
      least(180, extract(day from now() - pc.last_contact_date)::numeric)
    ) filter (where pc.status = 'active' and pc.last_contact_date is not null) as avg_days_since_contact
  from public.policy_cache pc
  group by pc.agent_id
),
scores as (
  select
    ap.agent_id,
    ap.active_count,
    ap.retained_count,
    ap.ever_drafted_count,

    -- Persistency (40pts): retained / ever_drafted, 0 if no drafted policies
    case
      when ap.ever_drafted_count = 0 then 0
      else round((ap.retained_count::numeric / ap.ever_drafted_count) * 40, 1)
    end as persistency_score,

    -- Payment method mix (20pts): monthly EFT / active policies
    case
      when ap.active_count = 0 then 0
      else round((ap.monthly_eft_count::numeric / ap.active_count) * 20, 1)
    end as payment_method_score,

    -- Contact recency (25pts): 0 days = 25, 180 days = 0, linear decay
    case
      when ap.avg_days_since_contact is null then 0
      else round(greatest(0, 25 - (ap.avg_days_since_contact / 180) * 25), 1)
    end as contact_recency_score,

    -- Product diversity (15pts): 0 = all one product, 15 = 50/50 split
    case
      when ap.active_count = 0 then 0
      else round(
        (1 - abs(ap.hi_count::numeric - ap.hhc_count::numeric) / ap.active_count) * 15,
        1
      )
    end as product_diversity_score

  from agent_policies ap
)
select
  s.agent_id,
  s.active_count,
  s.retained_count,
  s.ever_drafted_count,
  s.persistency_score,
  s.payment_method_score,
  s.contact_recency_score,
  s.product_diversity_score,
  round(
    s.persistency_score + s.payment_method_score + s.contact_recency_score + s.product_diversity_score,
    1
  ) as total_score
from scores s;


-- ─── Agency leaderboard view ─────────────────────────────────────────────────
create or replace view public.agency_leaderboard as
select
  hs.agent_id,
  p.full_name,
  p.agency_id,
  p.writing_number,
  hs.active_count,
  hs.total_score,
  hs.persistency_score,
  hs.payment_method_score,
  hs.contact_recency_score,
  hs.product_diversity_score,
  rank() over (partition by p.agency_id order by hs.total_score desc) as agency_rank,
  rank() over (order by hs.total_score desc)                           as fym_rank
from public.agent_health_scores hs
join public.profiles p on p.id = hs.agent_id
where p.role = 'agent';


-- ─── At-risk dollar exposure view ───────────────────────────────────────────
create or replace view public.atrisk_exposure as
select
  pc.agency_id,
  pc.agent_id,
  p.full_name as agent_name,
  count(*)                                              as at_risk_count,
  sum(pc.plan_premium)                                  as at_risk_monthly_premium,
  -- "recoverable" = payment_failed flags (most recoverable within 48hrs)
  sum(pc.plan_premium) filter (where pc.flag_type = 'payment_failed') as recoverable_premium,
  sum(pc.plan_premium) filter (where pc.flag_type = 'no_contact')     as no_contact_premium,
  sum(pc.plan_premium) filter (where pc.flag_type = 'rate_action')    as rate_action_premium
from public.policy_cache pc
left join public.profiles p on p.id = pc.agent_id
where pc.is_at_risk = true
group by pc.agency_id, pc.agent_id, p.full_name;
