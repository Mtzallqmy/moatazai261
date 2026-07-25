begin;

alter table public.ai_providers
  add column if not exists consecutive_failures integer not null default 0 check(consecutive_failures >= 0),
  add column if not exists circuit_state text not null default 'closed' check(circuit_state in ('closed','open','half_open')),
  add column if not exists circuit_opened_at timestamptz,
  add column if not exists circuit_failure_threshold integer not null default 5 check(circuit_failure_threshold between 1 and 100),
  add column if not exists circuit_reset_seconds integer not null default 60 check(circuit_reset_seconds between 10 and 3600);

create table if not exists public.provider_connection_tests (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.ai_providers(id) on delete cascade,
  model_id uuid references public.ai_models(id) on delete set null,
  tested_by uuid references auth.users(id) on delete set null,
  test_type text not null check(test_type in ('connection','model','discovery')),
  status text not null check(status in ('success','failure')),
  http_status integer,
  latency_ms integer not null check(latency_ms >= 0),
  error_code text,
  response_metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists provider_connection_tests_provider_created_idx
  on public.provider_connection_tests(provider_id,created_at desc);

alter table public.chat_runs
  add column if not exists idempotency_key uuid,
  add column if not exists fallback_from_provider_id uuid references public.ai_providers(id) on delete set null,
  add column if not exists first_token_ms integer,
  add column if not exists request_id uuid not null default gen_random_uuid();
create unique index if not exists chat_runs_idempotency_idx on public.chat_runs(idempotency_key)
  where idempotency_key is not null;

alter table public.provider_usage_records
  add column if not exists cached_tokens integer not null default 0 check(cached_tokens >= 0),
  add column if not exists status text not null default 'success' check(status in ('success','failure')),
  add column if not exists fallback_used boolean not null default false;
create unique index if not exists provider_usage_chat_run_once_idx
  on public.provider_usage_records(chat_run_id) where chat_run_id is not null;

create table if not exists public.usage_reservations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  model_id uuid references public.ai_models(id) on delete set null,
  provider_id uuid references public.ai_providers(id) on delete set null,
  idempotency_key uuid not null,
  status text not null default 'reserved' check(status in ('reserved','finalized','released','expired')),
  reserved_requests integer not null default 1 check(reserved_requests > 0),
  reserved_tokens bigint not null default 0 check(reserved_tokens >= 0),
  reserved_cost numeric(18,8) not null default 0 check(reserved_cost >= 0),
  actual_tokens bigint,
  actual_cost numeric(18,8),
  expires_at timestamptz not null default (now() + interval '15 minutes'),
  created_at timestamptz not null default now(),
  finalized_at timestamptz,
  unique(user_id,idempotency_key)
);
create index if not exists usage_reservations_active_idx
  on public.usage_reservations(user_id,status,created_at) where status='reserved';

create table if not exists public.message_versions (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages(id) on delete cascade,
  version integer not null check(version > 0),
  content text not null,
  content_parts jsonb not null default '[]',
  edited_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(message_id,version)
);

create table if not exists public.message_branches (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  root_message_id uuid not null references public.messages(id) on delete cascade,
  parent_branch_id uuid references public.message_branches(id) on delete cascade,
  name text,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.conversations add column if not exists active_branch_id uuid
  references public.message_branches(id) on delete set null;
alter table public.messages add column if not exists branch_id uuid references public.message_branches(id) on delete set null;
alter table public.messages add column if not exists active_version integer not null default 1 check(active_version > 0);
create index if not exists message_branches_conversation_idx on public.message_branches(conversation_id,created_at);
create index if not exists messages_branch_sequence_idx on public.messages(branch_id,sequence_number);

alter table public.conversations add column if not exists search_vector tsvector
  generated always as (to_tsvector('simple',coalesce(title,'') || ' ' || coalesce(summary,''))) stored;
alter table public.messages add column if not exists search_vector tsvector
  generated always as (to_tsvector('simple',coalesce(content,''))) stored;
create index if not exists conversations_search_gin_idx on public.conversations using gin(search_vector);
create index if not exists messages_search_gin_idx on public.messages using gin(search_vector);

create table if not exists public.prompts (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid references auth.users(id) on delete cascade,
  slug text not null,
  name text not null check(char_length(name) between 2 and 160),
  description text,
  visibility text not null default 'private' check(visibility in ('private','role','platform')),
  current_version integer not null default 1 check(current_version > 0),
  category text,
  enabled boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(owner_user_id,slug)
);
create table if not exists public.prompt_versions (
  id uuid primary key default gen_random_uuid(),
  prompt_id uuid not null references public.prompts(id) on delete cascade,
  version integer not null check(version > 0),
  content text not null check(char_length(content) between 1 and 100000),
  variables jsonb not null default '[]',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(prompt_id,version)
);
create table if not exists public.presets (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check(char_length(name) between 2 and 160),
  description text,
  model_id uuid references public.ai_models(id) on delete set null,
  prompt_id uuid references public.prompts(id) on delete set null,
  parameters jsonb not null default '{}',
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tool_executions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tool_id uuid references public.tools(id) on delete set null,
  agent_run_id uuid references public.agent_runs(id) on delete set null,
  chat_run_id uuid references public.chat_runs(id) on delete set null,
  idempotency_key uuid not null,
  status text not null check(status in ('running','completed','failed','cancelled')),
  safe_input jsonb not null default '{}',
  safe_output jsonb not null default '{}',
  error_code text,
  duration_ms integer,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique(user_id,idempotency_key)
);
create index if not exists tool_executions_user_created_idx on public.tool_executions(user_id,created_at desc);

alter table public.provider_connection_tests enable row level security;
alter table public.usage_reservations enable row level security;
alter table public.message_versions enable row level security;
alter table public.message_branches enable row level security;
alter table public.prompts enable row level security;
alter table public.prompt_versions enable row level security;
alter table public.presets enable row level security;
alter table public.tool_executions enable row level security;

create policy provider_tests_admin_read on public.provider_connection_tests for select to authenticated
using(public.has_permission('providers.read'));
create policy message_versions_owner_read on public.message_versions for select to authenticated
using(exists(
  select 1 from public.messages m join public.conversations c on c.id=m.conversation_id
  where m.id=message_id and c.user_id=(select auth.uid())
));
create policy message_branches_owner_read on public.message_branches for select to authenticated
using(exists(select 1 from public.conversations c where c.id=conversation_id and c.user_id=(select auth.uid())));
create policy prompts_owner_read on public.prompts for select to authenticated
using(owner_user_id=(select auth.uid()) or (visibility='platform' and enabled) or public.has_permission('settings.manage'));
create policy prompts_owner_insert on public.prompts for insert to authenticated
with check(owner_user_id=(select auth.uid()));
create policy prompts_owner_update on public.prompts for update to authenticated
using(owner_user_id=(select auth.uid()) or public.has_permission('settings.manage'))
with check(owner_user_id=(select auth.uid()) or public.has_permission('settings.manage'));
create policy prompts_owner_delete on public.prompts for delete to authenticated
using(owner_user_id=(select auth.uid()) or public.has_permission('settings.manage'));
create policy prompt_versions_owner_read on public.prompt_versions for select to authenticated
using(exists(select 1 from public.prompts p where p.id=prompt_id and (p.owner_user_id=(select auth.uid()) or (p.visibility='platform' and p.enabled) or public.has_permission('settings.manage'))));
create policy presets_owner_all on public.presets for all to authenticated
using(owner_user_id=(select auth.uid())) with check(owner_user_id=(select auth.uid()));
create policy tool_executions_owner_read on public.tool_executions for select to authenticated
using(user_id=(select auth.uid()));

revoke all on public.provider_connection_tests,public.usage_reservations,public.message_versions,
  public.message_branches,public.tool_executions,public.prompts,public.prompt_versions,public.presets from anon,authenticated;
grant select on public.provider_connection_tests,public.message_versions,public.message_branches,
  public.tool_executions to authenticated;

create or replace function app_private.reserve_usage(
  p_user_id uuid,
  p_model_id uuid,
  p_provider_id uuid,
  p_idempotency_key uuid,
  p_reserved_tokens bigint default 0,
  p_reserved_cost numeric default 0
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_id uuid;
  v_day timestamptz := date_trunc('day',now() at time zone 'utc') at time zone 'utc';
  v_month timestamptz := date_trunc('month',now() at time zone 'utc') at time zone 'utc';
  v_daily_requests bigint;
  v_monthly_requests bigint;
  v_daily_tokens bigint;
  v_monthly_tokens bigint;
  v_daily_cost numeric;
  v_monthly_cost numeric;
  v_limit record;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,0));
  select id into v_id from public.usage_reservations
    where user_id=p_user_id and idempotency_key=p_idempotency_key;
  if v_id is not null then return v_id; end if;

  update public.usage_reservations set status='expired'
    where user_id=p_user_id and status='reserved' and expires_at<=now();

  select
    coalesce(sum(request_count),0),coalesce(sum(total_tokens),0),coalesce(sum(estimated_cost),0)
  into v_daily_requests,v_daily_tokens,v_daily_cost
  from public.provider_usage_records where user_id=p_user_id and created_at>=v_day;
  select
    coalesce(sum(request_count),0),coalesce(sum(total_tokens),0),coalesce(sum(estimated_cost),0)
  into v_monthly_requests,v_monthly_tokens,v_monthly_cost
  from public.provider_usage_records where user_id=p_user_id and created_at>=v_month;

  select
    v_daily_requests+coalesce(sum(reserved_requests),0),
    v_monthly_requests+coalesce(sum(reserved_requests),0),
    v_daily_tokens+coalesce(sum(reserved_tokens),0),
    v_monthly_tokens+coalesce(sum(reserved_tokens),0),
    v_daily_cost+coalesce(sum(reserved_cost),0),
    v_monthly_cost+coalesce(sum(reserved_cost),0)
  into v_daily_requests,v_monthly_requests,v_daily_tokens,v_monthly_tokens,v_daily_cost,v_monthly_cost
  from public.usage_reservations where user_id=p_user_id and status='reserved';

  for v_limit in
    select * from public.usage_limits
    where enabled and scope_type in ('platform','user')
      and (scope_id='platform' or scope_id=p_user_id::text)
      and (model_id is null or model_id=p_model_id)
  loop
    if (v_limit.daily_request_limit is not null and v_daily_requests+1>v_limit.daily_request_limit)
      or (v_limit.monthly_request_limit is not null and v_monthly_requests+1>v_limit.monthly_request_limit)
      or (v_limit.daily_token_limit is not null and v_daily_tokens+p_reserved_tokens>v_limit.daily_token_limit)
      or (v_limit.monthly_token_limit is not null and v_monthly_tokens+p_reserved_tokens>v_limit.monthly_token_limit)
      or (v_limit.daily_cost_limit is not null and v_daily_cost+p_reserved_cost>v_limit.daily_cost_limit)
      or (v_limit.monthly_cost_limit is not null and v_monthly_cost+p_reserved_cost>v_limit.monthly_cost_limit)
    then raise exception 'USAGE_LIMIT_REACHED' using errcode='P0001'; end if;
  end loop;

  insert into public.usage_reservations(user_id,model_id,provider_id,idempotency_key,reserved_tokens,reserved_cost)
  values(p_user_id,p_model_id,p_provider_id,p_idempotency_key,p_reserved_tokens,p_reserved_cost)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function app_private.finalize_usage_reservation(
  p_reservation_id uuid,
  p_actual_tokens bigint,
  p_actual_cost numeric,
  p_release boolean default false
)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
begin
  update public.usage_reservations
  set status=case when p_release then 'released' else 'finalized' end,
      actual_tokens=case when p_release then null else greatest(p_actual_tokens,0) end,
      actual_cost=case when p_release then null else greatest(p_actual_cost,0) end,
      finalized_at=now()
  where id=p_reservation_id and status='reserved';
  return found;
end;
$$;

revoke all on function app_private.reserve_usage(uuid,uuid,uuid,uuid,bigint,numeric) from public,anon,authenticated;
revoke all on function app_private.finalize_usage_reservation(uuid,bigint,numeric,boolean) from public,anon,authenticated;
grant execute on function app_private.reserve_usage(uuid,uuid,uuid,uuid,bigint,numeric) to service_role;
grant execute on function app_private.finalize_usage_reservation(uuid,bigint,numeric,boolean) to service_role;

create or replace function public.reserve_usage(
  p_user_id uuid,p_model_id uuid,p_provider_id uuid,p_idempotency_key uuid,
  p_reserved_tokens bigint default 0,p_reserved_cost numeric default 0
) returns uuid language sql security invoker set search_path=''
as $$ select app_private.reserve_usage(p_user_id,p_model_id,p_provider_id,p_idempotency_key,p_reserved_tokens,p_reserved_cost); $$;
create or replace function public.finalize_usage_reservation(
  p_reservation_id uuid,p_actual_tokens bigint,p_actual_cost numeric,p_release boolean default false
) returns boolean language sql security invoker set search_path=''
as $$ select app_private.finalize_usage_reservation(p_reservation_id,p_actual_tokens,p_actual_cost,p_release); $$;
revoke all on function public.reserve_usage(uuid,uuid,uuid,uuid,bigint,numeric) from public,anon,authenticated;
revoke all on function public.finalize_usage_reservation(uuid,bigint,numeric,boolean) from public,anon,authenticated;
grant execute on function public.reserve_usage(uuid,uuid,uuid,uuid,bigint,numeric) to service_role;
grant execute on function public.finalize_usage_reservation(uuid,bigint,numeric,boolean) to service_role;

create or replace function app_private.record_provider_outcome(
  p_provider_id uuid,p_ok boolean,p_latency_ms integer,p_error_code text default null
) returns table(circuit_state text,consecutive_failures integer)
language plpgsql security definer set search_path=''
as $$
begin
  if p_ok then
    update public.ai_providers set
      health_status='healthy',last_health_check_at=now(),last_success_at=now(),
      last_latency_ms=greatest(p_latency_ms,0),last_error_code=null,
      consecutive_failures=0,circuit_state='closed',circuit_opened_at=null
    where id=p_provider_id;
  else
    update public.ai_providers set
      health_status=case when consecutive_failures+1>=circuit_failure_threshold then 'unavailable' else 'degraded' end,
      last_health_check_at=now(),last_latency_ms=greatest(p_latency_ms,0),last_error_code=p_error_code,
      consecutive_failures=consecutive_failures+1,
      circuit_state=case when consecutive_failures+1>=circuit_failure_threshold then 'open' else circuit_state end,
      circuit_opened_at=case when consecutive_failures+1>=circuit_failure_threshold then now() else circuit_opened_at end
    where id=p_provider_id;
  end if;
  return query select p.circuit_state,p.consecutive_failures from public.ai_providers p where p.id=p_provider_id;
end;
$$;
create or replace function public.record_provider_outcome(
  p_provider_id uuid,p_ok boolean,p_latency_ms integer,p_error_code text default null
) returns table(circuit_state text,consecutive_failures integer)
language sql security invoker set search_path=''
as $$ select * from app_private.record_provider_outcome(p_provider_id,p_ok,p_latency_ms,p_error_code); $$;
revoke all on function app_private.record_provider_outcome(uuid,boolean,integer,text) from public,anon,authenticated;
revoke all on function public.record_provider_outcome(uuid,boolean,integer,text) from public,anon,authenticated;
grant execute on function app_private.record_provider_outcome(uuid,boolean,integer,text) to service_role;
grant execute on function public.record_provider_outcome(uuid,boolean,integer,text) to service_role;

commit;
