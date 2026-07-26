begin;

alter table public.ai_providers
  drop constraint if exists ai_providers_base_url_https_check,
  drop constraint if exists ai_providers_chat_endpoint_relative_check,
  drop constraint if exists ai_providers_models_endpoint_relative_check;

alter table public.ai_providers
  add constraint ai_providers_base_url_https_check
    check (base_url is null or base_url ~ '^https://[^[:space:]]+$'),
  add constraint ai_providers_chat_endpoint_relative_check
    check (chat_endpoint ~ '^/[A-Za-z0-9._~!$&''()*+,;=:@%/-]*$' and chat_endpoint !~ '(^|/)\.\.?(/|$)'),
  add constraint ai_providers_models_endpoint_relative_check
    check (models_endpoint ~ '^/[A-Za-z0-9._~!$&''()*+,;=:@%/-]*$' and models_endpoint !~ '(^|/)\.\.?(/|$)');

drop index if exists public.ai_provider_credentials_default_idx;

create or replace function public.create_ai_provider_atomic(
  p_provider jsonb,
  p_credential jsonb,
  p_actor_id uuid
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_provider_id uuid := coalesce((p_provider->>'id')::uuid, gen_random_uuid());
  v_credential_id uuid;
begin
  insert into public.ai_providers (
    id, name, slug, provider_type, base_url, enabled, auth_type,
    chat_endpoint, models_endpoint, api_version, timeout_ms, retry_count,
    priority, configuration, created_by
  ) values (
    v_provider_id,
    p_provider->>'name',
    p_provider->>'slug',
    p_provider->>'provider_type',
    p_provider->>'base_url',
    coalesce((p_provider->>'enabled')::boolean, false),
    p_provider->>'auth_type',
    p_provider->>'chat_endpoint',
    p_provider->>'models_endpoint',
    nullif(p_provider->>'api_version', ''),
    coalesce((p_provider->>'timeout_ms')::integer, 30000),
    coalesce((p_provider->>'retry_count')::integer, 1),
    coalesce((p_provider->>'priority')::integer, 100),
    coalesce(p_provider->'configuration', '{}'::jsonb),
    p_actor_id
  );

  if p_credential is not null then
    v_credential_id := (p_credential->>'id')::uuid;
    insert into public.ai_provider_credentials (
      id, provider_id, encrypted_secret, key_hint, auth_metadata, status,
      priority, usage_limit, expires_at, is_default, created_by, updated_by
    ) values (
      v_credential_id,
      v_provider_id,
      p_credential->>'encrypted_secret',
      p_credential->>'key_hint',
      coalesce(p_credential->'auth_metadata', '{}'::jsonb),
      'active',
      coalesce((p_credential->>'priority')::integer, 100),
      (p_credential->>'usage_limit')::bigint,
      (p_credential->>'expires_at')::timestamptz,
      coalesce((p_credential->>'is_default')::boolean, true),
      p_actor_id,
      p_actor_id
    );
  end if;

  return v_provider_id;
end;
$$;

revoke all on function public.create_ai_provider_atomic(jsonb,jsonb,uuid)
  from public, anon, authenticated;
grant execute on function public.create_ai_provider_atomic(jsonb,jsonb,uuid)
  to service_role;

comment on function public.create_ai_provider_atomic(jsonb,jsonb,uuid) is
  'Creates a provider and its optional encrypted platform credential in one server-only transaction.';

commit;
