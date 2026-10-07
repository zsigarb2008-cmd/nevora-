create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'owner' check (role in ('owner', 'admin', 'member')),
  created_at timestamptz not null default now(),
  unique (workspace_id, user_id)
);

create index workspace_members_user_idx on public.workspace_members(user_id);

create or replace function public.is_workspace_member(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.workspace_members
    where workspace_id = target_workspace_id and user_id = auth.uid()
  );
$$;

create or replace function public.current_workspace_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select workspace_id
  from public.workspace_members
  where user_id = auth.uid()
  order by created_at, workspace_id
  limit 1;
$$;

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null default public.current_workspace_id() references public.workspaces(id) on delete cascade,
  name text not null,
  company text not null,
  email text not null default '',
  phone text not null default '',
  website text not null default '',
  industry text not null default '',
  country text not null default '',
  language text not null default '',
  notes text not null default '',
  lead_score integer check (lead_score between 0 and 100),
  status text not null default 'new' check (status in ('new','researching','qualified','contacted','meeting','proposal','won','lost')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, workspace_id)
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null default public.current_workspace_id() references public.workspaces(id) on delete cascade,
  client_id uuid,
  name text not null,
  description text not null default '',
  status text not null default 'planning' check (status in ('planning','research','design','development','qa','approval','live','completed')),
  deadline date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, workspace_id),
  foreign key (client_id, workspace_id) references public.clients(id, workspace_id) on delete restrict
);

create table public.workflows (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null default public.current_workspace_id() references public.workspaces(id) on delete cascade,
  client_id uuid,
  project_id uuid,
  name text not null,
  status text not null default 'queued' check (status in ('queued','running','waiting','waiting_approval','completed','failed','cancelled')),
  retry_limit smallint not null default 2 check (retry_limit between 0 and 2),
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, workspace_id),
  foreign key (client_id, workspace_id) references public.clients(id, workspace_id) on delete restrict,
  foreign key (project_id, workspace_id) references public.projects(id, workspace_id) on delete restrict
);

create table public.ai_employees (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null default public.current_workspace_id() references public.workspaces(id) on delete cascade,
  employee_key text not null check (employee_key in ('research','sales','website','copy','seo','qa','support')),
  name text not null,
  description text not null default '',
  system_instruction text not null default '',
  required_output jsonb not null default '[]'::jsonb,
  status text not null default 'offline' check (status in ('online','working','waiting','error','offline')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, workspace_id),
  unique (workspace_id, employee_key)
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null default public.current_workspace_id() references public.workspaces(id) on delete cascade,
  workflow_id uuid,
  client_id uuid,
  project_id uuid,
  depends_on_task_id uuid,
  employee_key text not null check (employee_key in ('research','sales','website','copy','seo','qa','support','human')),
  title text not null,
  description text not null default '',
  status text not null default 'queued' check (status in ('queued','running','waiting','waiting_for_configuration','waiting_approval','completed','failed','cancelled')),
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  input jsonb not null default '{}'::jsonb,
  output jsonb,
  error text,
  retry_count smallint not null default 0 check (retry_count between 0 and 2),
  created_by uuid default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (id, workspace_id),
  foreign key (workflow_id, workspace_id) references public.workflows(id, workspace_id) on delete restrict,
  foreign key (client_id, workspace_id) references public.clients(id, workspace_id) on delete restrict,
  foreign key (project_id, workspace_id) references public.projects(id, workspace_id) on delete restrict,
  foreign key (depends_on_task_id, workspace_id) references public.tasks(id, workspace_id) on delete restrict
);

create table public.workflow_steps (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null default public.current_workspace_id() references public.workspaces(id) on delete cascade,
  workflow_id uuid not null,
  task_id uuid not null,
  step_order integer not null check (step_order >= 0),
  employee_key text not null,
  required_output jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  unique (workflow_id, step_order),
  foreign key (workflow_id, workspace_id) references public.workflows(id, workspace_id) on delete cascade,
  foreign key (task_id, workspace_id) references public.tasks(id, workspace_id) on delete cascade
);

create table public.ai_handoffs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null default public.current_workspace_id() references public.workspaces(id) on delete cascade,
  workflow_id uuid,
  task_id uuid not null,
  from_task_id uuid not null,
  to_task_id uuid not null,
  from_employee text not null,
  to_employee text not null,
  summary text not null default '',
  client_id uuid,
  project_id uuid,
  input jsonb not null default '{}'::jsonb,
  worker_output jsonb,
  required_output jsonb not null default '[]'::jsonb,
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  status text not null default 'blocked' check (status in ('blocked','ready','completed','failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (workflow_id, workspace_id) references public.workflows(id, workspace_id) on delete restrict,
  foreign key (task_id, workspace_id) references public.tasks(id, workspace_id) on delete restrict,
  foreign key (from_task_id, workspace_id) references public.tasks(id, workspace_id) on delete restrict,
  foreign key (to_task_id, workspace_id) references public.tasks(id, workspace_id) on delete restrict,
  foreign key (client_id, workspace_id) references public.clients(id, workspace_id) on delete restrict,
  foreign key (project_id, workspace_id) references public.projects(id, workspace_id) on delete restrict
);

create table public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null default public.current_workspace_id() references public.workspaces(id) on delete cascade,
  task_id uuid not null,
  employee_id uuid,
  role text not null check (role in ('system','user','assistant','tool')),
  content jsonb not null,
  provider text,
  model text,
  created_at timestamptz not null default now(),
  foreign key (task_id, workspace_id) references public.tasks(id, workspace_id) on delete cascade,
  foreign key (employee_id, workspace_id) references public.ai_employees(id, workspace_id) on delete restrict
);

create table public.approvals (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null default public.current_workspace_id() references public.workspaces(id) on delete cascade,
  workflow_id uuid,
  task_id uuid,
  title text not null,
  what_will_happen text not null,
  why text not null,
  recommendation text not null,
  preview text not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  decided_by uuid default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  foreign key (workflow_id, workspace_id) references public.workflows(id, workspace_id) on delete restrict,
  foreign key (task_id, workspace_id) references public.tasks(id, workspace_id) on delete restrict
);

create table public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null default public.current_workspace_id() references public.workspaces(id) on delete cascade,
  actor_id uuid default auth.uid() references auth.users(id),
  type text not null,
  message text not null,
  entity_id uuid,
  created_at timestamptz not null default now()
);

create table public.research_reports (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null default public.current_workspace_id() references public.workspaces(id) on delete cascade,
  task_id uuid not null,
  client_id uuid,
  provider text not null,
  model text not null,
  report jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (task_id, workspace_id) references public.tasks(id, workspace_id) on delete cascade,
  foreign key (client_id, workspace_id) references public.clients(id, workspace_id) on delete restrict
);

create index clients_workspace_status_idx on public.clients(workspace_id, status, created_at desc);
create index projects_workspace_client_idx on public.projects(workspace_id, client_id, created_at desc);
create index workflows_workspace_created_idx on public.workflows(workspace_id, created_at desc);
create index tasks_workspace_status_idx on public.tasks(workspace_id, status, created_at desc);
create index tasks_workspace_employee_idx on public.tasks(workspace_id, employee_key, status);
create index tasks_dependency_idx on public.tasks(workspace_id, depends_on_task_id) where depends_on_task_id is not null;
create index workflow_steps_task_idx on public.workflow_steps(workspace_id, task_id);
create index handoffs_workspace_status_idx on public.ai_handoffs(workspace_id, status, created_at desc);
create index handoffs_source_task_idx on public.ai_handoffs(workspace_id, from_task_id);
create index ai_messages_task_idx on public.ai_messages(workspace_id, task_id, created_at);
create index approvals_workspace_status_idx on public.approvals(workspace_id, status, created_at desc);
create index activity_logs_workspace_created_idx on public.activity_logs(workspace_id, created_at desc);
create index research_reports_workspace_client_idx on public.research_reports(workspace_id, client_id, created_at desc);

create or replace function public.create_workspace_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  new_workspace_id uuid;
  workspace_name text;
begin
  workspace_name := coalesce(
    nullif(new.raw_user_meta_data ->> 'workspace_name', ''),
    nullif(new.raw_user_meta_data ->> 'full_name', '') || '''s workspace',
    split_part(new.email, '@', 1) || '''s workspace',
    'My workspace'
  );

  insert into public.workspaces(name) values (workspace_name) returning id into new_workspace_id;
  insert into public.workspace_members(workspace_id, user_id, role) values (new_workspace_id, new.id, 'owner');

  insert into public.ai_employees(workspace_id, employee_key, name, description, system_instruction, required_output)
  values
    (new_workspace_id, 'research', 'Research AI', 'Business research, website analysis, and structured lead reports.', 'Produce evidence-based business research. Distinguish verified facts from assumptions, cite source URLs, and never invent client facts or sources.', '["executive_summary","business_facts_and_sources","audience_analysis","opportunities"]'::jsonb),
    (new_workspace_id, 'sales', 'Sales AI', 'Lead qualification and outreach planning.', 'Use supplied client context only. Clearly label assumptions and never send communications.', '["lead_qualification","outreach_drafts","follow_up_recommendations"]'::jsonb),
    (new_workspace_id, 'website', 'Website AI', 'Sitemaps, page structures, and implementation plans.', 'Create implementation plans grounded in supplied requirements.', '["sitemap","page_structure","design_system","implementation_instructions"]'::jsonb),
    (new_workspace_id, 'copy', 'Copy AI', 'Website messaging and content drafts.', 'Draft accurate copy using supplied business facts; do not invent claims.', '["headlines","page_copy","calls_to_action","seo_metadata"]'::jsonb),
    (new_workspace_id, 'seo', 'SEO AI', 'Keyword strategy and on-page recommendations.', 'Separate research evidence from recommendations and do not fabricate search metrics.', '["keyword_strategy","page_metadata","internal_links","local_recommendations"]'::jsonb),
    (new_workspace_id, 'qa', 'QA AI', 'Structured checks for accessibility, content, links, and responsive behavior.', 'Report actionable findings with severity, location, evidence, and recommended fixes.', '["severity_rated_issues","locations","reasons","recommended_fixes"]'::jsonb),
    (new_workspace_id, 'support', 'Support AI', 'Grounded client and project support.', 'Answer only from supplied workspace records and escalate unknowns to a human.', '["answer","evidence","escalation_needed"]'::jsonb);

  return new;
end;
$$;

create trigger auth_user_create_workspace
after insert on auth.users
for each row execute function public.create_workspace_for_new_user();

create or replace function public.complete_research_task(
  p_task_id uuid,
  p_output jsonb,
  p_provider text,
  p_model text
)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  task_row public.tasks%rowtype;
  next_task_id uuid;
begin
  select * into task_row from public.tasks where id = p_task_id for update;
  if not found then
    raise exception 'Task not found or not accessible.';
  end if;
  if task_row.employee_key <> 'research' or task_row.status <> 'running' then
    raise exception 'Only a running Research AI task can be completed.';
  end if;
  if p_output is null or p_output = 'null'::jsonb then
    raise exception 'Actual worker output is required.';
  end if;

  update public.tasks
  set status = 'completed', output = p_output, error = null, updated_at = now(), completed_at = now()
  where id = p_task_id;

  insert into public.research_reports(workspace_id, task_id, client_id, provider, model, report)
  values (task_row.workspace_id, task_row.id, task_row.client_id, p_provider, p_model, p_output);

  update public.ai_handoffs
  set status = 'ready', worker_output = p_output,
      input = input || jsonb_build_object('source_task_id', task_row.id, 'source_output', p_output),
      updated_at = now()
  where from_task_id = task_row.id and workspace_id = task_row.workspace_id;

  update public.tasks dependent
  set input = dependent.input || jsonb_build_object('source_task_id', task_row.id, 'source_task_output', p_output),
      updated_at = now()
  from public.ai_handoffs handoff
  where handoff.from_task_id = task_row.id
    and handoff.to_task_id = dependent.id
    and handoff.workspace_id = task_row.workspace_id
    and dependent.workspace_id = task_row.workspace_id;

  if not exists (
    select 1 from public.ai_handoffs
    where from_task_id = task_row.id and workspace_id = task_row.workspace_id
  ) then
    insert into public.tasks(
      workspace_id, client_id, project_id, depends_on_task_id, employee_key, title, description,
      status, priority, input, created_by
    )
    values (
      task_row.workspace_id, task_row.client_id, task_row.project_id, task_row.id, 'sales',
      'Qualify lead using completed research', 'Queued with actual Research AI output; awaiting Sales AI worker.',
      'queued', task_row.priority,
      jsonb_build_object('source_task_id', task_row.id, 'source_task_output', p_output), auth.uid()
    )
    returning id into next_task_id;

    insert into public.ai_handoffs(
      workspace_id, task_id, from_task_id, to_task_id, from_employee, to_employee, summary,
      client_id, project_id, input, worker_output, required_output, priority, status
    )
    values (
      task_row.workspace_id, next_task_id, task_row.id, next_task_id, 'research', 'sales',
      'Research AI output handed to Sales AI for lead qualification.',
      task_row.client_id, task_row.project_id,
      jsonb_build_object('source_task_id', task_row.id, 'source_output', p_output), p_output,
      '["lead_qualification","outreach_drafts","follow_up_recommendations"]'::jsonb, task_row.priority, 'ready'
    );
    insert into public.activity_logs(workspace_id, type, message, entity_id)
    values (task_row.workspace_id, 'task_queued', 'Sales AI follow-up queued from actual Research AI output.', next_task_id),
      (task_row.workspace_id, 'handoff_created', 'Research AI output handed to Sales AI.', next_task_id);
  end if;

  if task_row.workflow_id is not null then
    update public.workflows set status = 'running', updated_at = now()
    where id = task_row.workflow_id and workspace_id = task_row.workspace_id;
  end if;

  insert into public.activity_logs(workspace_id, type, message, entity_id)
  values (task_row.workspace_id, 'task_completed', 'Research AI task completed with recorded provider output.', task_row.id);
end;
$$;

create or replace function public.set_research_task_waiting_configuration(p_task_id uuid)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  task_row public.tasks%rowtype;
begin
  select * into task_row from public.tasks where id = p_task_id for update;
  if not found or task_row.employee_key <> 'research' or task_row.status not in ('queued','waiting_for_configuration') then
    raise exception 'Research task not found or cannot wait for configuration.';
  end if;
  if task_row.status = 'waiting_for_configuration'
    and task_row.error = 'AI provider is not configured.' then
    return;
  end if;

  update public.tasks
  set status = 'waiting_for_configuration', error = 'AI provider is not configured.', updated_at = now()
  where id = p_task_id;

  insert into public.activity_logs(workspace_id, type, message, entity_id)
  values (task_row.workspace_id, 'task_waiting_for_configuration', 'AI provider is not configured.', task_row.id);
  if task_row.workflow_id is not null then
    update public.workflows set status = 'waiting', updated_at = now()
    where id = task_row.workflow_id and workspace_id = task_row.workspace_id;
  end if;
end;
$$;

create or replace function public.is_task_dependency_satisfied(target_task_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select not exists (
    select 1 from public.tasks task
    where task.id = target_task_id
      and task.depends_on_task_id is not null
      and not exists (
        select 1 from public.tasks dependency
        where dependency.id = task.depends_on_task_id
          and dependency.status = 'completed'
          and dependency.output is not null
      )
  );
$$;

create or replace function public.start_research_task(p_task_id uuid)
returns public.tasks
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  task_row public.tasks%rowtype;
begin
  select * into task_row from public.tasks where id = p_task_id for update;
  if not found or task_row.employee_key <> 'research' or task_row.status not in ('queued','waiting_for_configuration') then
    raise exception 'Queued or configuration-blocked Research AI task not found or accessible.';
  end if;
  if not public.is_task_dependency_satisfied(task_row.id) then
    raise exception 'This task is blocked until its dependency records an output.';
  end if;

  update public.tasks set status = 'running', error = null, updated_at = now()
  where id = p_task_id returning * into task_row;

  insert into public.activity_logs(workspace_id, type, message, entity_id)
  values (task_row.workspace_id, 'task_started', 'Research AI task started.', task_row.id);
  if task_row.workflow_id is not null then
    update public.workflows set status = 'running', updated_at = now()
    where id = task_row.workflow_id and workspace_id = task_row.workspace_id;
  end if;

  return task_row;
end;
$$;

create or replace function public.start_task(p_task_id uuid)
returns public.tasks
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  task_row public.tasks%rowtype;
begin
  select * into task_row from public.tasks where id = p_task_id for update;
  if not found or task_row.status <> 'queued' then
    raise exception 'Queued task not found or accessible.';
  end if;
  if not public.is_task_dependency_satisfied(task_row.id) then
    raise exception 'This task is blocked until its dependency records an output.';
  end if;

  update public.tasks set status = 'running', updated_at = now()
  where id = p_task_id returning * into task_row;
  insert into public.activity_logs(workspace_id, type, message, entity_id)
  values (task_row.workspace_id, 'task_started', 'Task started.', task_row.id);
  if task_row.workflow_id is not null then
    update public.workflows set status = 'running', updated_at = now()
    where id = task_row.workflow_id and workspace_id = task_row.workspace_id;
  end if;
  return task_row;
end;
$$;

create or replace function public.retry_task(p_task_id uuid)
returns public.tasks
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  task_row public.tasks%rowtype;
begin
  select * into task_row from public.tasks where id = p_task_id for update;
  if not found or task_row.status not in ('failed','waiting_for_configuration') then
    raise exception 'Only failed or configuration-blocked tasks can be retried.';
  end if;
  if task_row.retry_count >= 2 then
    raise exception 'Retry limit reached (2). Create a new task or review the error details.';
  end if;

  update public.tasks
  set status = 'queued', error = null, retry_count = retry_count + 1,
    completed_at = null, updated_at = now()
  where id = p_task_id returning * into task_row;
  insert into public.activity_logs(workspace_id, type, message, entity_id)
  values (task_row.workspace_id, 'task_retried', 'Task re-queued: ' || task_row.title, task_row.id);
  if task_row.workflow_id is not null then
    update public.workflows set status = 'running', updated_at = now()
    where id = task_row.workflow_id and workspace_id = task_row.workspace_id;
  end if;
  return task_row;
end;
$$;

create or replace function public.queue_task(
  p_workspace_id uuid,
  p_title text,
  p_description text,
  p_employee_key text,
  p_priority text,
  p_client_id uuid,
  p_project_id uuid,
  p_input jsonb
)
returns public.tasks
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  task_row public.tasks%rowtype;
begin
  if nullif(btrim(p_title), '') is null then
    raise exception 'A task title is required.';
  end if;
  insert into public.tasks(workspace_id, title, description, employee_key, priority, client_id, project_id, input, created_by)
  values (p_workspace_id, p_title, coalesce(p_description, ''), p_employee_key, p_priority,
    p_client_id, p_project_id, coalesce(p_input, '{}'::jsonb), auth.uid())
  returning * into task_row;

  insert into public.activity_logs(workspace_id, type, message, entity_id)
  values (task_row.workspace_id, 'task_queued', 'Task queued: ' || task_row.title, task_row.id);
  return task_row;
end;
$$;

create or replace function public.queue_workflow(
  p_workspace_id uuid,
  p_name text,
  p_client_id uuid,
  p_project_id uuid,
  p_priority text,
  p_context jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  workflow_id uuid;
  task_ids uuid[] := array[]::uuid[];
  employee_keys text[] := array[]::text[];
  stage record;
  task_id uuid;
  source_task_id uuid;
begin
  if nullif(btrim(p_name), '') is null then
    raise exception 'A workflow name is required.';
  end if;

  insert into public.workflows(workspace_id, name, client_id, project_id, retry_limit, created_by)
  values (p_workspace_id, p_name, p_client_id, p_project_id, 2, auth.uid())
  returning id into workflow_id;

  for stage in
    select *
    from (values
      (0, 'research'::text, 'Research business and market'::text, '["executive_summary","business_facts_and_sources","audience_analysis","opportunities"]'::jsonb),
      (1, 'sales'::text, 'Prepare sales qualification'::text, '["lead_qualification","outreach_drafts","follow_up_recommendations"]'::jsonb),
      (2, 'copy'::text, 'Draft website copy'::text, '["headlines","page_copy","calls_to_action","seo_metadata"]'::jsonb),
      (3, 'website'::text, 'Create website implementation plan'::text, '["sitemap","page_structure","design_system","implementation_instructions"]'::jsonb),
      (4, 'seo'::text, 'Prepare SEO recommendations'::text, '["keyword_strategy","page_metadata","internal_links","local_recommendations"]'::jsonb),
      (5, 'qa'::text, 'Review website plan'::text, '["severity_rated_issues","locations","reasons","recommended_fixes"]'::jsonb),
      (6, 'human'::text, 'Human review and approval'::text, '["approval_decision","reviewer_notes"]'::jsonb)
    ) as stages(step_order, employee_key, title, required_output)
    order by step_order
  loop
    source_task_id := case when stage.step_order = 0 then null else task_ids[stage.step_order] end;
    insert into public.tasks(
      workspace_id, workflow_id, client_id, project_id, depends_on_task_id, employee_key,
      title, description, status, priority, input, created_by
    )
    values (
      p_workspace_id, workflow_id, p_client_id, p_project_id, source_task_id, stage.employee_key,
      stage.title, 'Queued by the Orchestrator; awaiting a configured worker.', 'queued', p_priority,
      case when stage.step_order = 0 then coalesce(p_context, '{}'::jsonb)
        else jsonb_build_object('awaitingTaskId', source_task_id) end,
      auth.uid()
    )
    returning id into task_id;

    task_ids := array_append(task_ids, task_id);
    employee_keys := array_append(employee_keys, stage.employee_key);
    insert into public.workflow_steps(workspace_id, workflow_id, task_id, step_order, employee_key, required_output)
    values (p_workspace_id, workflow_id, task_id, stage.step_order, stage.employee_key, stage.required_output);
    insert into public.activity_logs(workspace_id, type, message, entity_id)
    values (p_workspace_id, 'task_queued', stage.employee_key || ' task queued: ' || stage.title, task_id);

    if stage.step_order > 0 then
      insert into public.ai_handoffs(
        workspace_id, workflow_id, task_id, from_task_id, to_task_id, from_employee, to_employee,
        summary, client_id, project_id, input, required_output, priority, status
      )
      values (
        p_workspace_id, workflow_id, task_id, source_task_id, task_id,
        employee_keys[stage.step_order], stage.employee_key,
        'Dependency handoff from ' || employee_keys[stage.step_order] || ' to ' || stage.employee_key || '; waiting for source task completion.',
        p_client_id, p_project_id, jsonb_build_object('source_task_id', source_task_id),
        stage.required_output, p_priority, 'blocked'
      );
      insert into public.activity_logs(workspace_id, type, message, entity_id)
      values (p_workspace_id, 'handoff_created', 'Handoff recorded: ' || employee_keys[stage.step_order] || ' to ' || stage.employee_key, task_id);
    end if;
  end loop;

  insert into public.activity_logs(workspace_id, type, message, entity_id)
  values (p_workspace_id, 'workflow_started', 'Workflow queued: ' || p_name, workflow_id);
  return workflow_id;
end;
$$;

create or replace function public.complete_task(p_task_id uuid, p_output text)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  task_row public.tasks%rowtype;
  output_json jsonb;
  approval_row_id uuid;
begin
  if nullif(btrim(p_output), '') is null then
    raise exception 'A worker must provide output before the task can complete.';
  end if;
  select * into task_row from public.tasks where id = p_task_id for update;
  if not found or task_row.status <> 'running' then
    raise exception 'Only a running task can complete.';
  end if;
  output_json := to_jsonb(p_output);

  update public.tasks set status = 'completed', output = output_json, error = null,
    updated_at = now(), completed_at = now()
  where id = p_task_id;

  update public.ai_handoffs set status = 'ready', worker_output = output_json,
    input = input || jsonb_build_object('source_task_id', task_row.id, 'source_output', output_json),
    updated_at = now()
  where from_task_id = task_row.id and workspace_id = task_row.workspace_id;

  update public.tasks dependent set
    input = dependent.input || jsonb_build_object('source_task_id', task_row.id, 'source_task_output', output_json),
    updated_at = now()
  from public.ai_handoffs handoff
  where handoff.from_task_id = task_row.id and handoff.to_task_id = dependent.id
    and dependent.workspace_id = task_row.workspace_id;

  if exists (
    select 1 from public.ai_handoffs
    where from_task_id = task_row.id and to_employee = 'human' and workspace_id = task_row.workspace_id
  ) then
    update public.tasks set status = 'waiting_approval', updated_at = now()
    where id in (
      select to_task_id from public.ai_handoffs
      where from_task_id = task_row.id and to_employee = 'human' and workspace_id = task_row.workspace_id
    );
    insert into public.approvals(workspace_id, workflow_id, task_id, title, what_will_happen, why, recommendation, preview)
    select task_row.workspace_id, task_row.workflow_id, handoff.to_task_id, 'Review workflow output',
      'A human reviewer will decide whether this workflow output can proceed.',
      'The workflow requires human approval before external action.',
      'Review the actual output and approve, reject, or edit the preview.', p_output
    from public.ai_handoffs handoff
    where handoff.from_task_id = task_row.id and handoff.to_employee = 'human'
      and handoff.workspace_id = task_row.workspace_id
    returning id into approval_row_id;
    update public.workflows set status = 'waiting', updated_at = now()
    where id = task_row.workflow_id and workspace_id = task_row.workspace_id;
    insert into public.activity_logs(workspace_id, type, message, entity_id)
    values (task_row.workspace_id, 'approval_requested', 'Approval requested: Review workflow output.', approval_row_id);
  elsif task_row.workflow_id is not null then
    update public.workflows set status = 'running', updated_at = now()
    where id = task_row.workflow_id and workspace_id = task_row.workspace_id;
  end if;

  insert into public.activity_logs(workspace_id, type, message, entity_id)
  values (task_row.workspace_id, 'task_completed', 'Task completed with recorded worker output.', task_row.id);
end;
$$;

create or replace function public.fail_task(p_task_id uuid, p_error text, p_output text default null)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  task_row public.tasks%rowtype;
  website_task_id uuid;
  qa_task_id uuid;
  attempt integer;
  next_order integer;
  source_order integer;
  approval_handoff public.ai_handoffs%rowtype;
begin
  if nullif(btrim(p_error), '') is null then
    raise exception 'A technical error description is required.';
  end if;
  select * into task_row from public.tasks where id = p_task_id for update;
  if not found or task_row.status <> 'running' then
    raise exception 'Only a running task can fail.';
  end if;

  update public.tasks set status = 'failed', error = p_error,
    output = case when p_output is null then null else to_jsonb(p_output) end, updated_at = now()
  where id = p_task_id;
  insert into public.activity_logs(workspace_id, type, message, entity_id)
  values (task_row.workspace_id, 'task_failed', 'Task failed: ' || p_error, task_row.id);

  if task_row.employee_key = 'qa' and task_row.workflow_id is not null
    and task_row.retry_count < 2 and nullif(btrim(p_output), '') is not null then
    attempt := task_row.retry_count + 1;
    insert into public.tasks(workspace_id, workflow_id, client_id, project_id, employee_key, title, description, status, priority, input, retry_count, created_by)
    values (task_row.workspace_id, task_row.workflow_id, task_row.client_id, task_row.project_id, 'website',
      'Revise website from QA findings (attempt ' || attempt || ')',
      'Queued from recorded QA findings. Awaiting the Website AI worker.', 'queued', task_row.priority,
      jsonb_build_object('source_task_id', task_row.id, 'qa_findings', p_output, 'qa_error', p_error),
      attempt, auth.uid())
    returning id into website_task_id;

    insert into public.tasks(workspace_id, workflow_id, client_id, project_id, depends_on_task_id, employee_key, title, description, status, priority, input, retry_count, created_by)
    values (task_row.workspace_id, task_row.workflow_id, task_row.client_id, task_row.project_id, website_task_id, 'qa',
      'Recheck website changes (attempt ' || attempt || ')',
      'Queued after Website AI revision. Awaiting revised implementation output.', 'queued', task_row.priority,
      jsonb_build_object('awaiting_task_id', website_task_id), attempt, auth.uid())
    returning id into qa_task_id;

    insert into public.ai_handoffs(workspace_id, workflow_id, task_id, from_task_id, to_task_id, from_employee, to_employee,
      summary, client_id, project_id, input, worker_output, required_output, priority, status)
    values
      (task_row.workspace_id, task_row.workflow_id, website_task_id, task_row.id, website_task_id, 'qa', 'website',
       'QA findings routed to Website AI.',
       task_row.client_id, task_row.project_id, jsonb_build_object('source_task_id', task_row.id, 'error', p_error),
       case when p_output is null then null else to_jsonb(p_output) end,
       '["address_qa_findings","revised_implementation_instructions"]'::jsonb, task_row.priority, 'ready'),
      (task_row.workspace_id, task_row.workflow_id, qa_task_id, website_task_id, qa_task_id, 'website', 'qa',
       'Website revision routed to QA.',
       task_row.client_id, task_row.project_id, jsonb_build_object('source_task_id', website_task_id), null,
       '["updated_severity_rated_qa_findings"]'::jsonb, task_row.priority, 'blocked');

    select * into approval_handoff from public.ai_handoffs
    where workflow_id = task_row.workflow_id and to_employee = 'human'
      and workspace_id = task_row.workspace_id
    order by created_at desc limit 1 for update;
    if found then
      update public.ai_handoffs set from_task_id = qa_task_id, input = jsonb_build_object('source_task_id', qa_task_id),
        worker_output = null, status = 'blocked', updated_at = now()
      where id = approval_handoff.id;
    end if;

    select step_order into source_order
    from public.workflow_steps
    where workflow_id = task_row.workflow_id and task_id = task_row.id and workspace_id = task_row.workspace_id
    for update;
    if source_order is null then
      select coalesce(max(step_order), -1) into source_order
      from public.workflow_steps where workflow_id = task_row.workflow_id and workspace_id = task_row.workspace_id;
    end if;
    update public.workflow_steps set step_order = step_order + 100000
    where workflow_id = task_row.workflow_id and workspace_id = task_row.workspace_id
      and step_order > source_order;
    update public.workflow_steps set step_order = step_order - 99998
    where workflow_id = task_row.workflow_id and workspace_id = task_row.workspace_id
      and step_order >= source_order + 100001;
    next_order := source_order + 1;
    insert into public.workflow_steps(workspace_id, workflow_id, task_id, step_order, employee_key, required_output)
    values
      (task_row.workspace_id, task_row.workflow_id, website_task_id, next_order, 'website', '["address_qa_findings","revised_implementation_instructions"]'::jsonb),
      (task_row.workspace_id, task_row.workflow_id, qa_task_id, next_order + 1, 'qa', '["updated_severity_rated_qa_findings"]'::jsonb);

    update public.workflows set status = 'running', updated_at = now()
    where id = task_row.workflow_id and workspace_id = task_row.workspace_id;
    insert into public.activity_logs(workspace_id, type, message, entity_id)
    values (task_row.workspace_id, 'handoff_created', 'QA findings handed to Website AI for bounded revision.', website_task_id),
      (task_row.workspace_id, 'handoff_created', 'Website revision queued for QA recheck.', qa_task_id);
  elsif task_row.workflow_id is not null then
    update public.workflows set status = 'failed', updated_at = now()
    where id = task_row.workflow_id and workspace_id = task_row.workspace_id;
  end if;
end;
$$;

create trigger workspaces_set_updated_at before update on public.workspaces for each row execute function public.set_updated_at();
create trigger clients_set_updated_at before update on public.clients for each row execute function public.set_updated_at();
create trigger projects_set_updated_at before update on public.projects for each row execute function public.set_updated_at();
create trigger workflows_set_updated_at before update on public.workflows for each row execute function public.set_updated_at();
create trigger ai_employees_set_updated_at before update on public.ai_employees for each row execute function public.set_updated_at();
create trigger tasks_set_updated_at before update on public.tasks for each row execute function public.set_updated_at();
create trigger ai_handoffs_set_updated_at before update on public.ai_handoffs for each row execute function public.set_updated_at();
create trigger research_reports_set_updated_at before update on public.research_reports for each row execute function public.set_updated_at();

alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.clients enable row level security;
alter table public.projects enable row level security;
alter table public.tasks enable row level security;
alter table public.ai_employees enable row level security;
alter table public.ai_messages enable row level security;
alter table public.ai_handoffs enable row level security;
alter table public.workflows enable row level security;
alter table public.workflow_steps enable row level security;
alter table public.approvals enable row level security;
alter table public.activity_logs enable row level security;
alter table public.research_reports enable row level security;

create policy "Workspace members can view their workspaces" on public.workspaces
for select to authenticated using (public.is_workspace_member(id));
create policy "Workspace owners can update their workspaces" on public.workspaces
for update to authenticated using (
  exists (select 1 from public.workspace_members m where m.workspace_id = workspaces.id and m.user_id = auth.uid() and m.role in ('owner','admin'))
) with check (public.is_workspace_member(id));

create policy "Users can view their own memberships" on public.workspace_members
for select to authenticated using (user_id = auth.uid());

create policy "Workspace members can access clients" on public.clients
for all to authenticated using (public.is_workspace_member(workspace_id))
with check (public.is_workspace_member(workspace_id));
create policy "Workspace members can access projects" on public.projects
for all to authenticated using (public.is_workspace_member(workspace_id))
with check (public.is_workspace_member(workspace_id));
create policy "Workspace members can access tasks" on public.tasks
for all to authenticated using (public.is_workspace_member(workspace_id))
with check (public.is_workspace_member(workspace_id));
create policy "Workspace members can access AI employees" on public.ai_employees
for all to authenticated using (public.is_workspace_member(workspace_id))
with check (public.is_workspace_member(workspace_id));
create policy "Workspace members can access AI messages" on public.ai_messages
for all to authenticated using (public.is_workspace_member(workspace_id))
with check (public.is_workspace_member(workspace_id));
create policy "Workspace members can access handoffs" on public.ai_handoffs
for all to authenticated using (public.is_workspace_member(workspace_id))
with check (public.is_workspace_member(workspace_id));
create policy "Workspace members can access workflows" on public.workflows
for all to authenticated using (public.is_workspace_member(workspace_id))
with check (public.is_workspace_member(workspace_id));
create policy "Workspace members can access workflow steps" on public.workflow_steps
for all to authenticated using (public.is_workspace_member(workspace_id))
with check (public.is_workspace_member(workspace_id));
create policy "Workspace members can access approvals" on public.approvals
for all to authenticated using (public.is_workspace_member(workspace_id))
with check (public.is_workspace_member(workspace_id));
create policy "Workspace members can access activity logs" on public.activity_logs
for all to authenticated using (public.is_workspace_member(workspace_id))
with check (public.is_workspace_member(workspace_id));
create policy "Workspace members can access research reports" on public.research_reports
for all to authenticated using (public.is_workspace_member(workspace_id))
with check (public.is_workspace_member(workspace_id));

revoke all on table
  public.workspaces, public.workspace_members, public.clients, public.projects, public.tasks,
  public.ai_employees, public.ai_messages, public.ai_handoffs, public.workflows, public.workflow_steps,
  public.approvals, public.activity_logs, public.research_reports
from public, anon;
grant select, update on public.workspaces to authenticated;
grant select on public.workspace_members to authenticated;
grant select, insert, update, delete on table
  public.clients, public.projects, public.tasks, public.ai_employees, public.ai_messages,
  public.ai_handoffs, public.workflows, public.workflow_steps, public.approvals,
  public.activity_logs, public.research_reports
to authenticated;

revoke execute on function public.is_workspace_member(uuid) from public, anon;
revoke execute on function public.current_workspace_id() from public, anon;
revoke execute on function public.complete_research_task(uuid, jsonb, text, text) from public, anon;
revoke execute on function public.set_research_task_waiting_configuration(uuid) from public, anon;
revoke execute on function public.is_task_dependency_satisfied(uuid) from public, anon;
revoke execute on function public.start_research_task(uuid) from public, anon;
revoke execute on function public.start_task(uuid) from public, anon;
revoke execute on function public.retry_task(uuid) from public, anon;
revoke execute on function public.queue_task(uuid, text, text, text, text, uuid, uuid, jsonb) from public, anon;
revoke execute on function public.queue_workflow(uuid, text, uuid, uuid, text, jsonb) from public, anon;
revoke execute on function public.complete_task(uuid, text) from public, anon;
revoke execute on function public.fail_task(uuid, text, text) from public, anon;
grant execute on function public.is_workspace_member(uuid) to authenticated;
grant execute on function public.current_workspace_id() to authenticated;
grant execute on function public.complete_research_task(uuid, jsonb, text, text) to authenticated;
grant execute on function public.set_research_task_waiting_configuration(uuid) to authenticated;
grant execute on function public.is_task_dependency_satisfied(uuid) to authenticated;
grant execute on function public.start_research_task(uuid) to authenticated;
grant execute on function public.start_task(uuid) to authenticated;
grant execute on function public.retry_task(uuid) to authenticated;
grant execute on function public.queue_task(uuid, text, text, text, text, uuid, uuid, jsonb) to authenticated;
grant execute on function public.queue_workflow(uuid, text, uuid, uuid, text, jsonb) to authenticated;
grant execute on function public.complete_task(uuid, text) to authenticated;
grant execute on function public.fail_task(uuid, text, text) to authenticated;
