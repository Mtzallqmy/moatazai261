begin;

alter table public.ai_provider_credentials
  add column if not exists is_default boolean not null default false;

with ranked as (
  select id,
    row_number() over (
      partition by provider_id
      order by is_default desc, priority asc, created_at asc, id asc
    ) as position
  from public.ai_provider_credentials
  where is_default
)
update public.ai_provider_credentials credential
set is_default = false,
    updated_at = now()
from ranked
where credential.id = ranked.id
  and ranked.position > 1;

create unique index if not exists ai_provider_credentials_one_default_per_provider_idx
  on public.ai_provider_credentials(provider_id)
  where is_default;

create index if not exists ai_provider_credentials_resolution_idx
  on public.ai_provider_credentials(provider_id,is_default desc,priority,status)
  where status = 'active';

comment on column public.ai_provider_credentials.is_default is
  'Preferred platform credential for this provider. The runtime falls back to active credentials by priority.';

commit;
