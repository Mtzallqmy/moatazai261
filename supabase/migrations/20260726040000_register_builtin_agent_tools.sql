-- Register only server-implemented tools. This is configuration, not demo data.
insert into public.tools (
  slug, name, description, tool_type, input_schema, output_schema,
  risk_level, requires_confirmation, enabled
) values
(
  'knowledge.search',
  'البحث في المعرفة',
  'يبحث داخل الملفات وقواعد المعرفة المصرح بها ويعيد أدلة قابلة للاستشهاد.',
  'internal',
  '{"type":"object","properties":{"query":{"type":"string"},"knowledgeBaseId":{"type":"string"}},"required":["query"],"additionalProperties":false}'::jsonb,
  '{"type":"object"}'::jsonb,
  'low',
  false,
  true
),
(
  'data.profile',
  'تحليل البيانات الوصفي',
  'يحسب أنواع الأعمدة والقيم المفقودة والإحصاءات الوصفية دون تنفيذ كود مولد.',
  'internal',
  '{"type":"object","properties":{"columns":{"type":"array","items":{"type":"string"},"maxItems":500},"rows":{"type":"array","maxItems":50000}},"required":["columns","rows"],"additionalProperties":false}'::jsonb,
  '{"type":"object"}'::jsonb,
  'medium',
  true,
  true
)
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  input_schema = excluded.input_schema,
  output_schema = excluded.output_schema,
  risk_level = excluded.risk_level,
  requires_confirmation = excluded.requires_confirmation,
  updated_at = now();

insert into public.tool_permissions (tool_id, subject_type, subject_id, allowed)
select t.id, 'role', r.name, true
from public.tools t
cross join public.roles r
where t.slug in ('knowledge.search','data.profile')
  and r.name in ('owner','admin','editor','moderator','author','user')
on conflict (tool_id, subject_type, subject_id) do update set allowed = excluded.allowed;
