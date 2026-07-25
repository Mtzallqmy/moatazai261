begin;

create policy usage_reservations_explicit_deny on public.usage_reservations
  for all to anon,authenticated using(false) with check(false);
create policy rate_limit_counters_explicit_deny on public.rate_limit_counters
  for all to anon,authenticated using(false) with check(false);

drop policy if exists knowledge_bases_owner_write on public.knowledge_bases;
create policy knowledge_bases_owner_insert on public.knowledge_bases for insert to authenticated
  with check(owner_user_id=(select auth.uid()) or public.has_permission('knowledge.manage'));
create policy knowledge_bases_owner_update on public.knowledge_bases for update to authenticated
  using(owner_user_id=(select auth.uid()) or public.has_permission('knowledge.manage'))
  with check(owner_user_id=(select auth.uid()) or public.has_permission('knowledge.manage'));
create policy knowledge_bases_owner_delete on public.knowledge_bases for delete to authenticated
  using(owner_user_id=(select auth.uid()) or public.has_permission('knowledge.manage'));

drop policy if exists knowledge_files_owner_write on public.knowledge_base_files;
create policy knowledge_files_owner_insert on public.knowledge_base_files for insert to authenticated
  with check(exists(select 1 from public.knowledge_bases kb where kb.id=knowledge_base_id and
    (kb.owner_user_id=(select auth.uid()) or public.has_permission('knowledge.manage'))));
create policy knowledge_files_owner_update on public.knowledge_base_files for update to authenticated
  using(exists(select 1 from public.knowledge_bases kb where kb.id=knowledge_base_id and
    (kb.owner_user_id=(select auth.uid()) or public.has_permission('knowledge.manage'))))
  with check(exists(select 1 from public.knowledge_bases kb where kb.id=knowledge_base_id and
    (kb.owner_user_id=(select auth.uid()) or public.has_permission('knowledge.manage'))));
create policy knowledge_files_owner_delete on public.knowledge_base_files for delete to authenticated
  using(exists(select 1 from public.knowledge_bases kb where kb.id=knowledge_base_id and
    (kb.owner_user_id=(select auth.uid()) or public.has_permission('knowledge.manage'))));

drop policy if exists agents_admin_write on public.agents;
create policy agents_admin_insert on public.agents for insert to authenticated
  with check(public.has_permission('agents.manage'));
create policy agents_admin_update on public.agents for update to authenticated
  using(public.has_permission('agents.manage')) with check(public.has_permission('agents.manage'));
create policy agents_admin_delete on public.agents for delete to authenticated
  using(public.has_permission('agents.manage'));

drop policy if exists agent_versions_admin_write on public.agent_versions;
create policy agent_versions_admin_insert on public.agent_versions for insert to authenticated
  with check(public.has_permission('agents.manage'));
create policy agent_versions_admin_update on public.agent_versions for update to authenticated
  using(public.has_permission('agents.manage')) with check(public.has_permission('agents.manage'));
create policy agent_versions_admin_delete on public.agent_versions for delete to authenticated
  using(public.has_permission('agents.manage'));

drop policy if exists tools_admin_write on public.tools;
create policy tools_admin_insert on public.tools for insert to authenticated
  with check(public.has_permission('tools.manage'));
create policy tools_admin_update on public.tools for update to authenticated
  using(public.has_permission('tools.manage')) with check(public.has_permission('tools.manage'));
create policy tools_admin_delete on public.tools for delete to authenticated
  using(public.has_permission('tools.manage'));

drop policy if exists agent_tools_admin_write on public.agent_tools;
create policy agent_tools_admin_insert on public.agent_tools for insert to authenticated
  with check(public.has_permission('agents.manage'));
create policy agent_tools_admin_update on public.agent_tools for update to authenticated
  using(public.has_permission('agents.manage')) with check(public.has_permission('agents.manage'));
create policy agent_tools_admin_delete on public.agent_tools for delete to authenticated
  using(public.has_permission('agents.manage'));

create index if not exists agent_run_events_step_idx on public.agent_run_events(step_id);
create index if not exists agent_runs_agent_idx on public.agent_runs(agent_id);
create index if not exists agent_runs_version_idx on public.agent_runs(agent_version_id);
create index if not exists agent_runs_conversation_idx on public.agent_runs(conversation_id);
create index if not exists agent_tools_tool_idx on public.agent_tools(tool_id);
create index if not exists agent_versions_creator_idx on public.agent_versions(created_by);
create index if not exists agents_creator_idx on public.agents(created_by);
create index if not exists agents_default_model_idx on public.agents(default_model_id);
create index if not exists agents_knowledge_base_idx on public.agents(knowledge_base_id);
create index if not exists agents_updater_idx on public.agents(updated_by);
create index if not exists background_jobs_owner_idx on public.background_jobs(owner_user_id);
create index if not exists chat_runs_fallback_provider_idx on public.chat_runs(fallback_from_provider_id);
create index if not exists citations_agent_run_idx on public.citations(agent_run_id);
create index if not exists citations_chunk_idx on public.citations(chunk_id);
create index if not exists citations_file_idx on public.citations(file_id);
create index if not exists citations_message_idx on public.citations(message_id);
create index if not exists citations_retrieval_result_idx on public.citations(retrieval_result_id);
create index if not exists conversations_active_branch_idx on public.conversations(active_branch_id);
create index if not exists file_chunks_embedding_model_idx on public.file_chunks(embedding_model_id);
create index if not exists generated_ui_agent_run_idx on public.generated_ui_blocks(agent_run_id);
create index if not exists generated_ui_conversation_idx on public.generated_ui_blocks(conversation_id);
create index if not exists generated_ui_message_idx on public.generated_ui_blocks(message_id);
create index if not exists generated_ui_user_idx on public.generated_ui_blocks(user_id);
create index if not exists knowledge_base_files_added_by_idx on public.knowledge_base_files(added_by);
create index if not exists knowledge_base_files_file_idx on public.knowledge_base_files(file_id);
create index if not exists knowledge_bases_creator_idx on public.knowledge_bases(created_by);
create index if not exists knowledge_bases_embedding_model_idx on public.knowledge_bases(embedding_model_id);
create index if not exists knowledge_bases_embedding_provider_idx on public.knowledge_bases(embedding_provider_id);
create index if not exists mcp_servers_creator_idx on public.mcp_servers(created_by);
create index if not exists mcp_servers_updater_idx on public.mcp_servers(updated_by);
create index if not exists mcp_tools_tool_idx on public.mcp_tools(tool_id);
create index if not exists message_branches_creator_idx on public.message_branches(created_by);
create index if not exists message_branches_parent_idx on public.message_branches(parent_branch_id);
create index if not exists message_branches_root_idx on public.message_branches(root_message_id);
create index if not exists message_versions_editor_idx on public.message_versions(edited_by);
create index if not exists presets_model_idx on public.presets(model_id);
create index if not exists presets_owner_idx on public.presets(owner_user_id);
create index if not exists presets_prompt_idx on public.presets(prompt_id);
create index if not exists prompt_versions_creator_idx on public.prompt_versions(created_by);
create index if not exists prompts_creator_idx on public.prompts(created_by);
create index if not exists prompts_updater_idx on public.prompts(updated_by);
create index if not exists provider_tests_model_idx on public.provider_connection_tests(model_id);
create index if not exists provider_tests_tester_idx on public.provider_connection_tests(tested_by);
create index if not exists research_sessions_agent_run_idx on public.research_sessions(agent_run_id);
create index if not exists retrieval_results_chunk_idx on public.retrieval_results(chunk_id);
create index if not exists retrieval_runs_conversation_idx on public.retrieval_runs(conversation_id);
create index if not exists retrieval_runs_knowledge_base_idx on public.retrieval_runs(knowledge_base_id);
create index if not exists tool_executions_agent_run_idx on public.tool_executions(agent_run_id);
create index if not exists tool_executions_chat_run_idx on public.tool_executions(chat_run_id);
create index if not exists tool_executions_tool_idx on public.tool_executions(tool_id);
create index if not exists tools_creator_idx on public.tools(created_by);
create index if not exists usage_reservations_model_idx on public.usage_reservations(model_id);
create index if not exists usage_reservations_provider_idx on public.usage_reservations(provider_id);

commit;
