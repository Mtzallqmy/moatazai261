begin;

create extension if not exists vector with schema extensions;

insert into public.permissions(code,name,description) values
  ('agents.use','Use AI agents','Run enabled agents'),
  ('agents.manage','Manage AI agents','Create, version and disable agents'),
  ('tools.manage','Manage tools','Manage local and MCP tools'),
  ('mcp.manage','Manage MCP servers','Manage MCP connections and permissions'),
  ('knowledge.use','Use knowledge bases','Query permitted knowledge bases'),
  ('knowledge.manage','Manage knowledge bases','Create and manage knowledge bases'),
  ('research.use','Run deep research','Create bounded research sessions'),
  ('memory.manage','Manage own memory','Review, edit and delete personal memories'),
  ('agent_runs.read','Read agent run diagnostics','Review agent execution diagnostics')
on conflict(code) do update set name=excluded.name, description=excluded.description;

insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r cross join public.permissions p
where (r.name='owner')
   or (r.name='admin' and p.code in ('agents.use','agents.manage','tools.manage','mcp.manage','knowledge.use','knowledge.manage','research.use','memory.manage','agent_runs.read'))
   or (r.name in ('editor','moderator','author','user') and p.code in ('agents.use','knowledge.use','research.use','memory.manage'))
on conflict do nothing;

create table if not exists public.knowledge_bases (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid references auth.users(id) on delete cascade,
  name text not null check(char_length(name) between 2 and 160),
  description text,
  visibility text not null default 'private' check(visibility in ('private','role','platform')),
  embedding_provider_id uuid references public.ai_providers(id) on delete set null,
  embedding_model_id uuid references public.ai_models(id) on delete set null,
  embedding_dimensions integer not null default 1536 check(embedding_dimensions between 64 and 4096),
  retrieval_configuration jsonb not null default '{"mode":"hybrid","limit":12,"minimumConfidence":0.55}',
  enabled boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.knowledge_base_files (
  knowledge_base_id uuid not null references public.knowledge_bases(id) on delete cascade,
  file_id uuid not null references public.files(id) on delete cascade,
  added_by uuid references auth.users(id) on delete set null,
  status text not null default 'pending' check(status in ('pending','processing','ready','failed')),
  added_at timestamptz not null default now(),
  primary key(knowledge_base_id,file_id)
);

alter table public.file_chunks add column if not exists search_vector tsvector
  generated always as (to_tsvector('simple',coalesce(content,''))) stored;
alter table public.file_chunks add column if not exists embedding_model_id uuid references public.ai_models(id) on delete set null;
alter table public.file_chunks add column if not exists embedding_version integer not null default 1;
create index if not exists file_chunks_search_gin_idx on public.file_chunks using gin(search_vector);

create table if not exists public.agents (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check(slug ~ '^[a-z0-9][a-z0-9-]{1,79}$'),
  name text not null check(char_length(name) between 2 and 120),
  description text,
  status text not null default 'draft' check(status in ('draft','active','disabled','archived')),
  current_version integer not null default 1 check(current_version > 0),
  default_model_id uuid references public.ai_models(id) on delete set null,
  knowledge_base_id uuid references public.knowledge_bases(id) on delete set null,
  allowed_roles text[] not null default array['user'],
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.agent_versions (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.agents(id) on delete cascade,
  version integer not null check(version > 0),
  system_prompt text not null check(char_length(system_prompt) between 1 and 100000),
  temperature numeric(3,2) not null default 0.2 check(temperature between 0 and 2),
  max_tokens integer not null default 4096 check(max_tokens between 1 and 128000),
  memory_enabled boolean not null default false,
  policy jsonb not null default '{"maxSteps":8,"timeoutMs":120000,"maxCostUsd":1,"requireEvidence":false,"minimumConfidence":0.55}',
  fallback_policy jsonb not null default '{}',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(agent_id,version)
);

create table if not exists public.tools (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check(slug ~ '^[a-z0-9][a-z0-9._-]{1,119}$'),
  name text not null,
  description text,
  tool_type text not null check(tool_type in ('internal','mcp','http')),
  input_schema jsonb not null default '{}',
  output_schema jsonb not null default '{}',
  risk_level text not null default 'low' check(risk_level in ('low','medium','high')),
  requires_confirmation boolean not null default false,
  enabled boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.agent_tools (
  agent_id uuid not null references public.agents(id) on delete cascade,
  tool_id uuid not null references public.tools(id) on delete cascade,
  enabled boolean not null default true,
  configuration jsonb not null default '{}',
  primary key(agent_id,tool_id)
);

create table if not exists public.tool_permissions (
  id uuid primary key default gen_random_uuid(),
  tool_id uuid not null references public.tools(id) on delete cascade,
  subject_type text not null check(subject_type in ('user','role','model')),
  subject_id text not null,
  allowed boolean not null default true,
  constraints jsonb not null default '{}',
  created_at timestamptz not null default now(),
  unique(tool_id,subject_type,subject_id)
);

create table if not exists public.mcp_servers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  transport text not null check(transport in ('http','sse','stdio')),
  endpoint text,
  auth_type text not null default 'none' check(auth_type in ('none','bearer','api_key_header','custom_headers')),
  encrypted_secret text,
  key_hint text,
  header_name text,
  enabled boolean not null default true,
  timeout_ms integer not null default 15000 check(timeout_ms between 1000 and 120000),
  status text not null default 'unchecked' check(status in ('unchecked','healthy','degraded','unavailable','disabled')),
  last_checked_at timestamptz,
  last_latency_ms integer,
  last_error_code text,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check((transport='stdio' and endpoint is null) or (transport in ('http','sse') and endpoint is not null))
);

create table if not exists public.mcp_tools (
  id uuid primary key default gen_random_uuid(),
  server_id uuid not null references public.mcp_servers(id) on delete cascade,
  tool_id uuid references public.tools(id) on delete set null,
  remote_name text not null,
  description text,
  input_schema jsonb not null default '{}',
  enabled boolean not null default false,
  discovered_at timestamptz not null default now(),
  unique(server_id,remote_name)
);

create table if not exists public.mcp_resources (
  id uuid primary key default gen_random_uuid(),
  server_id uuid not null references public.mcp_servers(id) on delete cascade,
  uri text not null,
  name text not null,
  description text,
  mime_type text,
  enabled boolean not null default false,
  discovered_at timestamptz not null default now(),
  unique(server_id,uri)
);

create table if not exists public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  agent_id uuid not null references public.agents(id) on delete restrict,
  agent_version_id uuid references public.agent_versions(id) on delete set null,
  conversation_id uuid references public.conversations(id) on delete set null,
  status text not null default 'queued' check(status in ('queued','running','waiting','completed','failed','cancelled')),
  input jsonb not null default '{}',
  safe_output jsonb not null default '{}',
  current_step integer not null default 0,
  error_code text,
  correlation_id uuid not null default gen_random_uuid(),
  idempotency_key uuid,
  usage_metadata jsonb not null default '{}',
  estimated_cost numeric(18,8) not null default 0,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique(user_id,idempotency_key)
);

create table if not exists public.agent_run_steps (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.agent_runs(id) on delete cascade,
  sequence integer not null check(sequence > 0),
  step_type text not null check(step_type in ('route','retrieve','tool','model','handoff','finalize')),
  status text not null default 'pending' check(status in ('pending','running','completed','failed','cancelled')),
  safe_input jsonb not null default '{}',
  safe_output jsonb not null default '{}',
  error_code text,
  started_at timestamptz,
  completed_at timestamptz,
  unique(run_id,sequence)
);

create table if not exists public.agent_run_events (
  id bigint generated always as identity primary key,
  run_id uuid not null references public.agent_runs(id) on delete cascade,
  step_id uuid references public.agent_run_steps(id) on delete cascade,
  event_type text not null,
  payload jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists public.user_memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  memory_type text not null default 'preference' check(memory_type in ('preference','fact','instruction')),
  key text not null check(char_length(key) between 1 and 160),
  value text not null check(char_length(value) between 1 and 4000),
  confidence numeric(4,3) not null default 1 check(confidence between 0 and 1),
  source text not null default 'user' check(source in ('user','conversation','import')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id,memory_type,key)
);

create table if not exists public.conversation_memories (
  conversation_id uuid primary key references public.conversations(id) on delete cascade,
  memory_enabled boolean not null default true,
  summary text,
  facts jsonb not null default '[]',
  updated_at timestamptz not null default now()
);

create table if not exists public.retrieval_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  knowledge_base_id uuid references public.knowledge_bases(id) on delete set null,
  conversation_id uuid references public.conversations(id) on delete set null,
  query text not null,
  strategy text not null default 'hybrid' check(strategy in ('keyword','semantic','hybrid','corrective','agentic')),
  status text not null default 'running' check(status in ('running','completed','failed')),
  confidence numeric(4,3),
  diagnostics jsonb not null default '{}',
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.retrieval_results (
  id uuid primary key default gen_random_uuid(),
  retrieval_run_id uuid not null references public.retrieval_runs(id) on delete cascade,
  chunk_id uuid not null references public.file_chunks(id) on delete cascade,
  rank integer not null check(rank > 0),
  keyword_score numeric,
  semantic_score numeric,
  rerank_score numeric,
  combined_score numeric not null,
  selected boolean not null default false,
  unique(retrieval_run_id,chunk_id)
);

create table if not exists public.citations (
  id uuid primary key default gen_random_uuid(),
  message_id uuid references public.messages(id) on delete cascade,
  agent_run_id uuid references public.agent_runs(id) on delete cascade,
  retrieval_result_id uuid references public.retrieval_results(id) on delete set null,
  file_id uuid not null references public.files(id) on delete cascade,
  chunk_id uuid references public.file_chunks(id) on delete set null,
  label text not null,
  excerpt text,
  page_number integer,
  section text,
  created_at timestamptz not null default now(),
  check(message_id is not null or agent_run_id is not null)
);

create table if not exists public.research_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  agent_run_id uuid references public.agent_runs(id) on delete set null,
  query text not null,
  plan jsonb not null default '[]',
  status text not null default 'planning' check(status in ('planning','running','paused','completed','failed','cancelled')),
  limits jsonb not null default '{"maxTasks":12,"maxSources":40,"timeoutMs":600000,"maxCostUsd":3}',
  report text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.research_tasks (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.research_sessions(id) on delete cascade,
  sequence integer not null,
  title text not null,
  query text not null,
  status text not null default 'pending' check(status in ('pending','running','completed','failed','cancelled')),
  result jsonb not null default '{}',
  source_count integer not null default 0,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique(session_id,sequence)
);

create table if not exists public.generated_ui_blocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete cascade,
  message_id uuid references public.messages(id) on delete cascade,
  agent_run_id uuid references public.agent_runs(id) on delete cascade,
  block_type text not null check(block_type in ('table','metrics','chart','actions')),
  content jsonb not null,
  schema_version integer not null default 1,
  created_at timestamptz not null default now()
);

create table if not exists public.background_jobs (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid references auth.users(id) on delete cascade,
  job_type text not null,
  resource_type text not null,
  resource_id uuid,
  status text not null default 'queued' check(status in ('queued','running','completed','failed','cancelled')),
  priority integer not null default 100,
  progress integer not null default 0 check(progress between 0 and 100),
  attempts integer not null default 0,
  max_attempts integer not null default 3 check(max_attempts between 1 and 20),
  payload jsonb not null default '{}',
  result jsonb not null default '{}',
  error_code text,
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists knowledge_bases_owner_idx on public.knowledge_bases(owner_user_id,updated_at desc);
create index if not exists agents_status_idx on public.agents(status,updated_at desc);
create index if not exists tools_type_enabled_idx on public.tools(tool_type,enabled);
create index if not exists mcp_servers_status_idx on public.mcp_servers(enabled,status);
create index if not exists agent_runs_user_created_idx on public.agent_runs(user_id,created_at desc);
create index if not exists agent_runs_status_idx on public.agent_runs(status,created_at);
create index if not exists agent_run_events_run_idx on public.agent_run_events(run_id,id);
create index if not exists user_memories_user_idx on public.user_memories(user_id,updated_at desc);
create index if not exists retrieval_runs_user_idx on public.retrieval_runs(user_id,created_at desc);
create index if not exists retrieval_results_run_rank_idx on public.retrieval_results(retrieval_run_id,rank);
create index if not exists research_sessions_user_idx on public.research_sessions(user_id,created_at desc);
create index if not exists background_jobs_queue_idx on public.background_jobs(status,priority,available_at);

alter table public.knowledge_bases enable row level security;
alter table public.knowledge_base_files enable row level security;
alter table public.agents enable row level security;
alter table public.agent_versions enable row level security;
alter table public.tools enable row level security;
alter table public.agent_tools enable row level security;
alter table public.tool_permissions enable row level security;
alter table public.mcp_servers enable row level security;
alter table public.mcp_tools enable row level security;
alter table public.mcp_resources enable row level security;
alter table public.agent_runs enable row level security;
alter table public.agent_run_steps enable row level security;
alter table public.agent_run_events enable row level security;
alter table public.user_memories enable row level security;
alter table public.conversation_memories enable row level security;
alter table public.retrieval_runs enable row level security;
alter table public.retrieval_results enable row level security;
alter table public.citations enable row level security;
alter table public.research_sessions enable row level security;
alter table public.research_tasks enable row level security;
alter table public.generated_ui_blocks enable row level security;
alter table public.background_jobs enable row level security;

create policy knowledge_bases_owner_read on public.knowledge_bases for select to authenticated
using(owner_user_id=(select auth.uid()) or (visibility='platform' and enabled) or public.has_permission('knowledge.manage'));
create policy knowledge_bases_owner_write on public.knowledge_bases for all to authenticated
using(owner_user_id=(select auth.uid()) or public.has_permission('knowledge.manage'))
with check(owner_user_id=(select auth.uid()) or public.has_permission('knowledge.manage'));
create policy knowledge_files_owner_read on public.knowledge_base_files for select to authenticated
using(exists(select 1 from public.knowledge_bases kb where kb.id=knowledge_base_id and (kb.owner_user_id=(select auth.uid()) or public.has_permission('knowledge.manage'))));
create policy knowledge_files_owner_write on public.knowledge_base_files for all to authenticated
using(exists(select 1 from public.knowledge_bases kb where kb.id=knowledge_base_id and (kb.owner_user_id=(select auth.uid()) or public.has_permission('knowledge.manage'))))
with check(exists(select 1 from public.knowledge_bases kb where kb.id=knowledge_base_id and (kb.owner_user_id=(select auth.uid()) or public.has_permission('knowledge.manage'))));

create policy agents_available_read on public.agents for select to authenticated
using(status='active' or public.has_permission('agents.manage'));
create policy agents_admin_write on public.agents for all to authenticated
using(public.has_permission('agents.manage')) with check(public.has_permission('agents.manage'));
create policy agent_versions_admin_read on public.agent_versions for select to authenticated
using(public.has_permission('agents.manage'));
create policy agent_versions_admin_write on public.agent_versions for all to authenticated
using(public.has_permission('agents.manage')) with check(public.has_permission('agents.manage'));
create policy tools_available_read on public.tools for select to authenticated
using(enabled or public.has_permission('tools.manage'));
create policy tools_admin_write on public.tools for all to authenticated
using(public.has_permission('tools.manage')) with check(public.has_permission('tools.manage'));
create policy agent_tools_available_read on public.agent_tools for select to authenticated
using(exists(select 1 from public.agents a where a.id=agent_id and (a.status='active' or public.has_permission('agents.manage'))));
create policy agent_tools_admin_write on public.agent_tools for all to authenticated
using(public.has_permission('agents.manage')) with check(public.has_permission('agents.manage'));
create policy tool_permissions_admin_only on public.tool_permissions for all to authenticated
using(public.has_permission('tools.manage')) with check(public.has_permission('tools.manage'));

create policy mcp_servers_admin_only on public.mcp_servers for all to authenticated
using(public.has_permission('mcp.manage')) with check(public.has_permission('mcp.manage'));
create policy mcp_tools_admin_only on public.mcp_tools for all to authenticated
using(public.has_permission('mcp.manage')) with check(public.has_permission('mcp.manage'));
create policy mcp_resources_admin_only on public.mcp_resources for all to authenticated
using(public.has_permission('mcp.manage')) with check(public.has_permission('mcp.manage'));

create policy agent_runs_owner_read on public.agent_runs for select to authenticated using(user_id=(select auth.uid()));
create policy agent_steps_owner_read on public.agent_run_steps for select to authenticated
using(exists(select 1 from public.agent_runs r where r.id=run_id and r.user_id=(select auth.uid())));
create policy agent_events_owner_read on public.agent_run_events for select to authenticated
using(exists(select 1 from public.agent_runs r where r.id=run_id and r.user_id=(select auth.uid())));
create policy user_memories_owner_all on public.user_memories for all to authenticated
using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
create policy conversation_memories_owner_all on public.conversation_memories for all to authenticated
using(exists(select 1 from public.conversations c where c.id=conversation_id and c.user_id=(select auth.uid())))
with check(exists(select 1 from public.conversations c where c.id=conversation_id and c.user_id=(select auth.uid())));
create policy retrieval_runs_owner_read on public.retrieval_runs for select to authenticated using(user_id=(select auth.uid()));
create policy retrieval_results_owner_read on public.retrieval_results for select to authenticated
using(exists(select 1 from public.retrieval_runs r where r.id=retrieval_run_id and r.user_id=(select auth.uid())));
create policy citations_owner_read on public.citations for select to authenticated
using(
  exists(select 1 from public.messages m join public.conversations c on c.id=m.conversation_id where m.id=message_id and c.user_id=(select auth.uid()))
  or exists(select 1 from public.agent_runs r where r.id=agent_run_id and r.user_id=(select auth.uid()))
);
create policy research_sessions_owner_read on public.research_sessions for select to authenticated using(user_id=(select auth.uid()));
create policy research_tasks_owner_read on public.research_tasks for select to authenticated
using(exists(select 1 from public.research_sessions s where s.id=session_id and s.user_id=(select auth.uid())));
create policy ui_blocks_owner_read on public.generated_ui_blocks for select to authenticated using(user_id=(select auth.uid()));
create policy jobs_owner_read on public.background_jobs for select to authenticated
using(owner_user_id=(select auth.uid()) or public.has_permission('agent_runs.read'));

revoke all on public.mcp_servers, public.mcp_tools, public.mcp_resources, public.tool_permissions,
  public.agent_runs, public.agent_run_steps, public.agent_run_events, public.retrieval_runs,
  public.retrieval_results, public.citations, public.research_sessions, public.research_tasks,
  public.generated_ui_blocks, public.background_jobs from anon, authenticated;
grant select on public.agent_runs, public.agent_run_steps, public.agent_run_events, public.retrieval_runs,
  public.retrieval_results, public.citations, public.research_sessions, public.research_tasks,
  public.generated_ui_blocks, public.background_jobs to authenticated;
revoke all on public.user_memories, public.conversation_memories,
  public.knowledge_bases, public.knowledge_base_files from anon,authenticated;
grant select on public.agents, public.tools, public.agent_tools to authenticated;
grant select,insert,update,delete on public.agents, public.agent_versions, public.tools,
  public.agent_tools, public.tool_permissions, public.mcp_servers, public.mcp_tools, public.mcp_resources
  to authenticated;

create or replace function public.hybrid_search_file_chunks(
  p_user_id uuid,
  p_query_text text,
  p_query_embedding extensions.vector(1536),
  p_match_count integer default 12,
  p_full_text_weight double precision default 1,
  p_semantic_weight double precision default 1,
  p_rrf_k integer default 50,
  p_knowledge_base_id uuid default null
)
returns table(
  chunk_id uuid,
  file_id uuid,
  content text,
  metadata jsonb,
  keyword_rank bigint,
  semantic_rank bigint,
  combined_score double precision
)
language sql
stable
security invoker
set search_path=''
as $$
  with allowed_chunks as (
    select fc.*
    from public.file_chunks fc
    join public.files f on f.id=fc.file_id
    where f.owner_user_id=p_user_id
      and f.status='ready'
      and (
        p_knowledge_base_id is null
        or exists(
          select 1 from public.knowledge_base_files kbf
          where kbf.knowledge_base_id=p_knowledge_base_id and kbf.file_id=fc.file_id and kbf.status='ready'
        )
      )
  ), keyword as (
    select id,row_number() over(order by ts_rank_cd(search_vector,websearch_to_tsquery('simple',p_query_text)) desc) rank_ix
    from allowed_chunks
    where search_vector @@ websearch_to_tsquery('simple',p_query_text)
    limit least(p_match_count,30)*2
  ), semantic as (
    select id,row_number() over(order by embedding OPERATOR(extensions.<=>) p_query_embedding) rank_ix
    from allowed_chunks where embedding is not null
    order by embedding OPERATOR(extensions.<=>) p_query_embedding
    limit least(p_match_count,30)*2
  )
  select ac.id,ac.file_id,ac.content,ac.metadata,k.rank_ix,s.rank_ix,
    coalesce(1.0/(p_rrf_k+k.rank_ix),0.0)*p_full_text_weight+
    coalesce(1.0/(p_rrf_k+s.rank_ix),0.0)*p_semantic_weight score
  from keyword k full outer join semantic s on k.id=s.id
  join allowed_chunks ac on ac.id=coalesce(k.id,s.id)
  order by score desc
  limit least(p_match_count,30);
$$;
revoke all on function public.hybrid_search_file_chunks(uuid,text,extensions.vector,integer,double precision,double precision,integer,uuid) from public,anon;
grant execute on function public.hybrid_search_file_chunks(uuid,text,extensions.vector,integer,double precision,double precision,integer,uuid) to authenticated,service_role;

comment on table public.mcp_servers is 'MCP endpoints and encrypted credentials. Secret columns are server-only.';
comment on table public.agent_run_events is 'Append-only safe execution events; raw provider responses and secrets are prohibited.';
comment on table public.user_memories is 'User-reviewable long-term memory. Server sanitization prevents automatic secret retention.';

commit;
