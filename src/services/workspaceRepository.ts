import type { SupabaseClient } from '@supabase/supabase-js';
import type { ActivityEvent, AgencyState, AgencyTask, Approval, Client, Handoff, Project, WorkflowRun } from '../types';

type DbRow = Record<string, unknown>;

function failIfError(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

function rowString(row: DbRow, key: string, fallback = ''): string {
  const value = row[key];
  return typeof value === 'string' ? value : fallback;
}

function rowNullableString(row: DbRow, key: string): string | null {
  const value = row[key];
  return typeof value === 'string' ? value : null;
}

function dbRow(value: unknown): DbRow {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Supabase returned an invalid record.');
  return value as DbRow;
}

function rowInput(row: DbRow): AgencyTask['input'] {
  const value = row.input;
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
  return {};
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string') ? value : [];
}

function outputText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return typeof value === 'string' ? value : JSON.stringify(value);
}

function mapClient(row: DbRow): Client {
  return {
    id: rowString(row, 'id'), name: rowString(row, 'name'), company: rowString(row, 'company'),
    email: rowString(row, 'email'), phone: rowString(row, 'phone'), website: rowString(row, 'website'),
    industry: rowString(row, 'industry'), country: rowString(row, 'country'), language: rowString(row, 'language'),
    notes: rowString(row, 'notes'), leadScore: typeof row.lead_score === 'number' ? row.lead_score : null,
    status: rowString(row, 'status').toUpperCase() as Client['status'], createdAt: rowString(row, 'created_at'),
  };
}

function mapProject(row: DbRow): Project {
  return {
    id: rowString(row, 'id'), name: rowString(row, 'name'), clientId: rowNullableString(row, 'client_id'),
    description: rowString(row, 'description'), status: rowString(row, 'status').toUpperCase() as Project['status'],
    deadline: rowString(row, 'deadline'), createdAt: rowString(row, 'created_at'),
  };
}

function mapTask(row: DbRow): AgencyTask {
  return {
    id: rowString(row, 'id'), title: rowString(row, 'title'), description: rowString(row, 'description'),
    employee: rowString(row, 'employee_key') as AgencyTask['employee'],
    status: rowString(row, 'status').toUpperCase() as AgencyTask['status'],
    priority: rowString(row, 'priority').toUpperCase() as AgencyTask['priority'],
    clientId: rowNullableString(row, 'client_id'), projectId: rowNullableString(row, 'project_id'),
    workflowId: rowNullableString(row, 'workflow_id'), input: rowInput(row), output: outputText(row.output),
    error: rowNullableString(row, 'error'), retryCount: typeof row.retry_count === 'number' ? row.retry_count : 0,
    createdAt: rowString(row, 'created_at'), updatedAt: rowString(row, 'updated_at'),
    completedAt: rowNullableString(row, 'completed_at'),
  };
}

function mapHandoff(row: DbRow): Handoff {
  const input = row.input && typeof row.input === 'object' && !Array.isArray(row.input) ? row.input as Record<string, unknown> : {};
  return {
    id: rowString(row, 'id'), fromEmployee: rowString(row, 'from_employee') as Handoff['fromEmployee'],
    toEmployee: rowString(row, 'to_employee') as Handoff['toEmployee'], taskId: rowString(row, 'to_task_id'),
    fromTaskId: rowString(row, 'from_task_id'), toTaskId: rowString(row, 'to_task_id'),
    projectId: rowNullableString(row, 'project_id'), clientId: rowNullableString(row, 'client_id'),
    summary: rowString(row, 'summary'), input, requiredOutput: stringArray(row.required_output),
    priority: rowString(row, 'priority', 'normal').toUpperCase() as Handoff['priority'],
    createdAt: rowString(row, 'created_at'), status: rowString(row, 'status') as Handoff['status'],
    workerOutput: outputText(row.worker_output),
  };
}

function mapApproval(row: DbRow): Approval {
  return {
    id: rowString(row, 'id'), title: rowString(row, 'title'), whatWillHappen: rowString(row, 'what_will_happen'),
    why: rowString(row, 'why'), recommendation: rowString(row, 'recommendation'), preview: rowString(row, 'preview'),
    status: rowString(row, 'status').toUpperCase() as Approval['status'],
    taskId: rowNullableString(row, 'task_id'), workflowId: rowNullableString(row, 'workflow_id'),
    createdAt: rowString(row, 'created_at'), decidedAt: rowNullableString(row, 'decided_at'),
  };
}

function mapActivity(row: DbRow): ActivityEvent {
  return {
    id: rowString(row, 'id'), type: rowString(row, 'type'), message: rowString(row, 'message'),
    entityId: rowNullableString(row, 'entity_id'), createdAt: rowString(row, 'created_at'),
  };
}

export async function loadWorkspaceState(client: SupabaseClient, workspaceId: string): Promise<AgencyState> {
  const [clients, projects, tasks, handoffs, workflows, approvals, activity, steps] = await Promise.all([
    client.from('clients').select('*').eq('workspace_id', workspaceId).order('created_at', { ascending: false }),
    client.from('projects').select('*').eq('workspace_id', workspaceId).order('created_at', { ascending: false }),
    client.from('tasks').select('*').eq('workspace_id', workspaceId).order('created_at', { ascending: false }),
    client.from('ai_handoffs').select('*').eq('workspace_id', workspaceId).order('created_at', { ascending: false }),
    client.from('workflows').select('*').eq('workspace_id', workspaceId).order('created_at', { ascending: false }),
    client.from('approvals').select('*').eq('workspace_id', workspaceId).order('created_at', { ascending: false }),
    client.from('activity_logs').select('*').eq('workspace_id', workspaceId).order('created_at', { ascending: false }),
    client.from('workflow_steps').select('*').eq('workspace_id', workspaceId).order('step_order', { ascending: true }),
  ]);
  [clients.error, projects.error, tasks.error, handoffs.error, workflows.error, approvals.error, activity.error, steps.error].forEach(failIfError);
  const taskRows = (tasks.data ?? []) as DbRow[];
  const handoffRows = (handoffs.data ?? []) as DbRow[];
  const workflowRows = (workflows.data ?? []) as DbRow[];
  const stepRows = (steps.data ?? []) as DbRow[];
  return {
    clients: ((clients.data ?? []) as DbRow[]).map(mapClient),
    projects: ((projects.data ?? []) as DbRow[]).map(mapProject),
    tasks: taskRows.map(mapTask),
    handoffs: handoffRows.map(mapHandoff),
    workflows: workflowRows.map((row): WorkflowRun => {
      const workflowId = rowString(row, 'id');
      const workflowSteps = stepRows.filter((step) => step.workflow_id === workflowId);
      const taskOrder = new Map(workflowSteps.map((step) => [
        rowString(step, 'task_id'), typeof step.step_order === 'number' ? step.step_order : Number.MAX_SAFE_INTEGER,
      ]));
      return {
        id: workflowId, name: rowString(row, 'name'), status: rowString(row, 'status').toUpperCase() as WorkflowRun['status'],
        taskIds: workflowSteps.map((step) => rowString(step, 'task_id')),
        handoffIds: handoffRows.filter((handoff) => handoff.workflow_id === workflowId)
          .sort((left, right) => (taskOrder.get(rowString(left, 'to_task_id')) ?? Number.MAX_SAFE_INTEGER)
            - (taskOrder.get(rowString(right, 'to_task_id')) ?? Number.MAX_SAFE_INTEGER))
          .map((handoff) => rowString(handoff, 'id')),
        clientId: rowNullableString(row, 'client_id'), projectId: rowNullableString(row, 'project_id'),
        createdAt: rowString(row, 'created_at'), updatedAt: rowString(row, 'updated_at'),
      };
    }),
    approvals: ((approvals.data ?? []) as DbRow[]).map(mapApproval),
    activity: ((activity.data ?? []) as DbRow[]).map(mapActivity),
  };
}

export async function createClientRecord(client: SupabaseClient, workspaceId: string, values: Omit<Client, 'id' | 'createdAt'>): Promise<Client> {
  const { data, error } = await client.from('clients').insert({
    workspace_id: workspaceId, name: values.name, company: values.company, email: values.email, phone: values.phone,
    website: values.website, industry: values.industry, country: values.country, language: values.language,
    notes: values.notes, lead_score: values.leadScore, status: values.status.toLowerCase(),
  }).select('*').single();
  failIfError(error);
  return mapClient(dbRow(data));
}

export async function createProjectRecord(client: SupabaseClient, workspaceId: string, values: Omit<Project, 'id' | 'createdAt'>): Promise<Project> {
  const { data, error } = await client.from('projects').insert({
    workspace_id: workspaceId, name: values.name, client_id: values.clientId, description: values.description,
    status: values.status.toLowerCase(), deadline: values.deadline || null,
  }).select('*').single();
  failIfError(error);
  return mapProject(dbRow(data));
}

export async function createTaskRecord(
  client: SupabaseClient,
  workspaceId: string,
  values: Pick<AgencyTask, 'title' | 'description' | 'employee' | 'priority' | 'clientId' | 'projectId' | 'input'>,
): Promise<AgencyTask> {
  const { data, error } = await client.rpc('queue_task', {
    p_workspace_id: workspaceId,
    p_title: values.title,
    p_description: values.description,
    p_employee_key: values.employee,
    p_priority: values.priority.toLowerCase(),
    p_client_id: values.clientId,
    p_project_id: values.projectId,
    p_input: values.input,
  });
  failIfError(error);
  return mapTask(dbRow(data));
}

export async function createWorkflowRecords(
  client: SupabaseClient,
  workspaceId: string,
  values: ReturnType<typeof import('./orchestrator').createWorkflowRun>,
): Promise<string> {
  const { data, error } = await client.rpc('queue_workflow', {
    p_workspace_id: workspaceId,
    p_name: values.workflow.name,
    p_client_id: values.workflow.clientId,
    p_project_id: values.workflow.projectId,
    p_priority: values.tasks[0]?.priority.toLowerCase() ?? 'normal',
    p_context: values.tasks[0]?.input ?? {},
  });
  failIfError(error);
  if (typeof data !== 'string') throw new Error('Supabase did not return a workflow UUID.');
  return data;
}

export async function addActivity(client: SupabaseClient, workspaceId: string, entry: Pick<ActivityEvent, 'type' | 'message' | 'entityId'>): Promise<void> {
  const { error } = await client.from('activity_logs').insert({
    workspace_id: workspaceId, type: entry.type, message: entry.message, entity_id: entry.entityId,
  });
  failIfError(error);
}

export async function changeRecordStatus(
  client: SupabaseClient,
  table: 'clients' | 'projects',
  workspaceId: string,
  id: string,
  status: string,
): Promise<void> {
  const { error } = await client.from(table).update({ status: status.toLowerCase() }).eq('workspace_id', workspaceId).eq('id', id);
  failIfError(error);
}

export async function createApprovalRecord(client: SupabaseClient, workspaceId: string, values: Omit<Approval, 'id' | 'status' | 'createdAt' | 'decidedAt'>): Promise<Approval> {
  const { data, error } = await client.from('approvals').insert({
    workspace_id: workspaceId, title: values.title, what_will_happen: values.whatWillHappen, why: values.why,
    recommendation: values.recommendation, preview: values.preview, task_id: values.taskId ?? null,
    workflow_id: values.workflowId ?? null,
  }).select('*').single();
  failIfError(error);
  return mapApproval(dbRow(data));
}

export async function updateApprovalRecord(
  client: SupabaseClient,
  workspaceId: string,
  id: string,
  status: 'APPROVED' | 'REJECTED',
  preview: string | undefined,
  actorId: string,
): Promise<Approval> {
  const values: DbRow = { status: status.toLowerCase(), decided_at: new Date().toISOString(), decided_by: actorId };
  if (preview !== undefined) values.preview = preview;
  const { data, error } = await client.from('approvals').update(values).eq('workspace_id', workspaceId).eq('id', id).select('*').single();
  failIfError(error);
  return mapApproval(dbRow(data));
}
