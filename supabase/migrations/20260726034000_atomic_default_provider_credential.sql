begin;

create or replace function public.set_default_provider_credential(
  p_provider_id uuid,
  p_credential_id uuid,
  p_actor_id uuid
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.ai_provider_credentials
    where id = p_credential_id
      and provider_id = p_provider_id
      and status = 'active'
  ) then
    return false;
  end if;

  update public.ai_provider_credentials
  set is_default = (id = p_credential_id),
      updated_by = case when id = p_credential_id then p_actor_id else updated_by end,
      updated_at = now()
  where provider_id = p_provider_id
    and (is_default or id = p_credential_id);

  return true;
end;
$$;

revoke all on function public.set_default_provider_credential(uuid,uuid,uuid) from public, anon, authenticated;
grant execute on function public.set_default_provider_credential(uuid,uuid,uuid) to service_role;

comment on function public.set_default_provider_credential(uuid,uuid,uuid) is
  'Atomically selects one active platform credential as the provider default. Server-only.';

commit;
