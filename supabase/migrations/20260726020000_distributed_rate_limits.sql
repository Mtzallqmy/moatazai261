begin;

create table if not exists public.rate_limit_counters (
  key_hash text not null check(char_length(key_hash)=64),
  window_started_at timestamptz not null,
  window_seconds integer not null check(window_seconds between 1 and 86400),
  request_count integer not null default 0 check(request_count >= 0),
  expires_at timestamptz not null,
  primary key(key_hash,window_started_at,window_seconds)
);
create index if not exists rate_limit_counters_expiry_idx on public.rate_limit_counters(expires_at);
alter table public.rate_limit_counters enable row level security;
revoke all on public.rate_limit_counters from public,anon,authenticated;

create or replace function app_private.consume_rate_limit(
  p_key_hash text,
  p_limit integer,
  p_window_seconds integer
)
returns table(allowed boolean,limit_value integer,remaining integer,reset_at timestamptz)
language plpgsql
security definer
set search_path=''
as $$
declare
  v_started timestamptz;
  v_count integer;
begin
  if p_key_hash !~ '^[a-f0-9]{64}$' or p_limit<1 or p_limit>1000000
    or p_window_seconds<1 or p_window_seconds>86400 then
    raise exception 'INVALID_RATE_LIMIT_ARGUMENTS' using errcode='22023';
  end if;
  v_started:=to_timestamp(floor(extract(epoch from now())/p_window_seconds)*p_window_seconds);
  insert into public.rate_limit_counters(key_hash,window_started_at,window_seconds,request_count,expires_at)
  values(p_key_hash,v_started,p_window_seconds,1,v_started+make_interval(secs=>p_window_seconds))
  on conflict(key_hash,window_started_at,window_seconds)
  do update set request_count=public.rate_limit_counters.request_count+1
  returning request_count into v_count;
  return query select v_count<=p_limit,p_limit,greatest(p_limit-v_count,0),
    v_started+make_interval(secs=>p_window_seconds);
end;
$$;

create or replace function public.consume_rate_limit(
  p_key_hash text,
  p_limit integer,
  p_window_seconds integer
)
returns table(allowed boolean,limit_value integer,remaining integer,reset_at timestamptz)
language sql
security invoker
set search_path=''
as $$ select * from app_private.consume_rate_limit(p_key_hash,p_limit,p_window_seconds); $$;

revoke all on function app_private.consume_rate_limit(text,integer,integer) from public,anon,authenticated;
revoke all on function public.consume_rate_limit(text,integer,integer) from public,anon,authenticated;
grant execute on function app_private.consume_rate_limit(text,integer,integer) to service_role;
grant execute on function public.consume_rate_limit(text,integer,integer) to service_role;

comment on table public.rate_limit_counters is
  'Server-only fixed-window counters. Keys are SHA-256 digests and never contain raw user IDs, IPs or tokens.';

commit;
