-- Forge schema (NEW Supabase project — do NOT reuse the legacy Forge project).
-- Idempotent: safe to re-run top to bottom. Every table is locked to its owner via RLS.
-- Rule: no policy may ever use `using (true)`. Test with two users (see docs/SECURITY.md).

create table if not exists public.scenarios (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade default auth.uid(),
  name        text not null,
  data        jsonb not null,               -- the scenario schema from docs/SPEC.md
  is_active   boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.snapshots (   -- actual pot values, one per check-in
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade default auth.uid(),
  on_date     date not null,
  pots        jsonb not null,               -- [{id, currency, balance}]
  note        text,
  created_at  timestamptz not null default now(),
  unique (user_id, on_date)
);

create table if not exists public.budget_categories (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade default auth.uid(),
  grp         text not null,
  name        text not null,
  icon        text,
  position    int not null default 0
);

create table if not exists public.transactions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade default auth.uid(),
  on_date     date not null,
  amount      numeric(14,2) not null,       -- negative = spend
  currency    text not null default 'GBP',
  category_id uuid references public.budget_categories(id) on delete set null,
  note        text,
  created_at  timestamptz not null default now()
);

-- What the app actually syncs (D25): one JSON document per user per key — 'onboarding', 'settings' (life events, what-ifs,
-- assumptions), 'budget', 'snapshots', 'scenarios' — mirroring the on-device store exactly. Last write wins per document.
create table if not exists public.user_docs (
  user_id     uuid not null references auth.users(id) on delete cascade default auth.uid(),
  key         text not null check (key in ('onboarding','settings','budget','snapshots','scenarios')),
  data        jsonb not null,
  updated_at  timestamptz not null default now(),
  primary key (user_id, key)
);

create table if not exists public.onboarding_answers (  -- one row per user: the boot-up questionnaire
  user_id     uuid primary key references auth.users(id) on delete cascade default auth.uid(),
  data        jsonb not null,               -- the state object from src/onboarding/state.js (v, mode, answers…)
  updated_at  timestamptz not null default now()
);

create table if not exists public.ai_usage (     -- enforces per-user daily caps in the edge function
  user_id     uuid not null references auth.users(id) on delete cascade,
  day         date not null default current_date,
  calls       int not null default 0,
  primary key (user_id, day)
);

-- Row Level Security: owner-only, every table, every command.
do $$
declare t text;
begin
  foreach t in array array['user_docs','scenarios','snapshots','budget_categories','transactions','onboarding_answers','ai_usage'] loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "owner all" on public.%I', t);
    execute format(
      'create policy "owner all" on public.%I for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

-- ai_usage is written only by the edge function (service role); users may read their own row.
drop policy if exists "owner all" on public.ai_usage;
drop policy if exists "owner read" on public.ai_usage;
create policy "owner read" on public.ai_usage for select to authenticated using (user_id = auth.uid());

-- updated_at trigger for scenarios
create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists scenarios_touch on public.scenarios;
create trigger scenarios_touch before update on public.scenarios
  for each row execute function public.touch_updated_at();

-- Atomic daily-cap counter used by the edge function (service role only).
create or replace function public.bump_ai_usage(p_user uuid, p_cap int) returns boolean
language plpgsql security definer set search_path = public as $$
declare c int;
begin
  insert into public.ai_usage(user_id, day, calls) values (p_user, current_date, 1)
  on conflict (user_id, day) do update set calls = public.ai_usage.calls + 1
  returning calls into c;
  return c <= p_cap;
end $$;
revoke all on function public.bump_ai_usage(uuid, int) from public, anon, authenticated;

-- "Delete my account" (Settings): removes the signed-in user; their user_docs rows go with them (on delete cascade).
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  delete from auth.users where id = auth.uid();
end $$;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
