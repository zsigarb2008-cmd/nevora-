import type { ActivityEvent, AgencyState, AgencyTask, Approval, EmployeeKey, Handoff, TaskPriority, WorkflowRun } from '../types';

export const MAX_AUTOMATIC_RETRIES = 2;

const workflowStages: { employee: EmployeeKey; title: string; requiredOutput: string[] }[] = [
  { employee: 'research', title: 'Research business and market', requiredOutput: ['Executive summary', 'Business facts and sources', 'Audience analysis', 'Opportunities'] },
  { employee: 'sales', title: 'Prepare sales qualification', requiredOutput: ['Lead qualification', 'Outreach drafts', 'Follow-up recommendations'] },
  { employee: 'copy', title: 'Draft website copy', requiredOutput: ['Headlines', 'Page copy', 'Calls to action', 'SEO metadata'] },
  { employee: 'website', title: 'Create website implementation plan', requiredOutput: ['Sitemap', 'Page structure', 'Design system', 'Implementation instructions'] },
  { employee: 'seo', title: 'Prepare SEO recommendations', requiredOutput: ['Keyword strategy', 'Page metadata', 'Internal links', 'Local recommendations'] },
  { employee: 'qa', title: 'Review website plan', requiredOutput: ['Severity-rated issues', 'Locations', 'Reasons', 'Recommended fixes'] },
  { employee: 'human', title: 'Human review and approval', requiredOutput: ['Approval decision', 'Reviewer notes'] },
];

function id(): string {
  const cryptoApi = typeof globalThis !== 'undefined' ? globalThis.crypto : undefined;
  if (cryptoApi && typeof cryptoApi.randomUUID === 'function') {
    return cryptoApi.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    const random = Math.random() * 16 | 0;
    const value = character === 'x' ? random : (random & 0x3 | 0x8);
    return value.toString(16);
  });
}

function event(type: string, message: string, entityId: string | null, createdAt: string): ActivityEvent {
  return { id: id(), type, message, entityId, createdAt };
}

export function createCommandTask(command: string): { task: AgencyTask; activity: ActivityEvent } {
  const now = new Date().toISOString();
  const normalized = command.toLowerCase();
  const employee: EmployeeKey = /\b(outreach|email|sales|qualif|follow.?up|lead)\b/.test(normalized) ? 'sales'
    : /\b(copy|headline|cta|content|write)\b/.test(normalized) ? 'copy'
      : /\b(website|web site|site map|sitemap|design|frontend|front end)\b/.test(normalized) ? 'website'
        : /\b(seo|keyword|search intent|meta description)\b/.test(normalized) ? 'seo'
          : /\b(qa|quality|accessibility|audit|check)\b/.test(normalized) ? 'qa'
            : /\b(support|ticket|client question)\b/.test(normalized) ? 'support'
              : 'research';
  const task: AgencyTask = {
    id: id(), title: command.trim(), description: 'Command received and queued for server-side employee execution.',
    employee, status: 'QUEUED', priority: 'NORMAL', clientId: null, projectId: null,
    workflowId: null, input: { command: command.trim() }, output: null, error: null, retryCount: 0,
    createdAt: now, updatedAt: now, completedAt: null,
  };
  return { task, activity: event('task_queued', `Task queued: ${task.title}`, task.id, now) };
}

export function createWorkflowRun(options: {
  name: string;
  clientId?: string | null;
  projectId?: string | null;
  priority?: TaskPriority;
  context?: Record<string, unknown>;
}): { workflow: WorkflowRun; tasks: AgencyTask[]; handoffs: Handoff[]; activity: ActivityEvent[] } {
  const now = new Date().toISOString();
  const workflowId = id();
  const tasks = workflowStages.map((stage, index): AgencyTask => ({
    id: id(), title: stage.title, description: 'Queued by the Orchestrator; awaiting a configured worker.',
    employee: stage.employee, status: 'QUEUED', priority: options.priority ?? 'NORMAL',
    clientId: options.clientId ?? null, projectId: options.projectId ?? null, workflowId,
    input: index === 0 ? (options.context ?? {}) : { awaitingTaskId: '' }, output: null, error: null,
    retryCount: 0, createdAt: now, updatedAt: now, completedAt: null,
  }));

  for (let index = 1; index < tasks.length; index += 1) {
    tasks[index].input = { awaitingTaskId: tasks[index - 1].id };
  }

  const handoffs = workflowStages.slice(0, -1).map((stage, index): Handoff => ({
    id: id(), fromEmployee: stage.employee, toEmployee: workflowStages[index + 1].employee,
    taskId: tasks[index + 1].id, projectId: options.projectId ?? null, clientId: options.clientId ?? null,
    summary: `Dependency handoff from ${stage.employee} to ${workflowStages[index + 1].employee}; waiting for source task completion.`,
    input: { sourceTaskId: tasks[index].id, sourceOutput: null }, requiredOutput: workflowStages[index + 1].requiredOutput,
    priority: options.priority ?? 'NORMAL', createdAt: now, fromTaskId: tasks[index].id, toTaskId: tasks[index + 1].id,
  }));

  const workflow: WorkflowRun = {
    id: workflowId, name: options.name, status: 'QUEUED', taskIds: tasks.map((task) => task.id),
    handoffIds: handoffs.map((handoff) => handoff.id), clientId: options.clientId ?? null,
    projectId: options.projectId ?? null, createdAt: now, updatedAt: now,
  };
  const activity = [
    event('workflow_started', `Workflow queued: ${workflow.name}`, workflowId, now),
    ...tasks.map((task) => event('task_queued', `${task.employee} task queued: ${task.title}`, task.id, now)),
    ...handoffs.map((handoff) => event('handoff_created', `Handoff recorded: ${handoff.fromEmployee} to ${handoff.toEmployee}`, handoff.id, now)),
  ];
  return { workflow, tasks, handoffs, activity };
}

export function retryTask(task: AgencyTask): AgencyTask {
  if (task.retryCount >= MAX_AUTOMATIC_RETRIES) {
    throw new Error(`Retry limit reached (${MAX_AUTOMATIC_RETRIES}). Create a new task or review the error details.`);
  }
  const now = new Date().toISOString();
  return { ...task, status: 'QUEUED', error: null, retryCount: task.retryCount + 1, updatedAt: now, completedAt: null };
}

export function startTask(state: AgencyState, taskId: string): AgencyState {
  const task = state.tasks.find((item) => item.id === taskId);
  if (!task) throw new Error('Task not found.');
  if (task.status !== 'QUEUED') throw new Error(`Only queued tasks can start. Current status: ${task.status}.`);
  if (task.workflowId) {
    const dependency = state.handoffs.filter((item) => item.toTaskId === taskId).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    if (dependency) {
      const source = state.tasks.find((item) => item.id === dependency.fromTaskId);
      if (!dependency.input.sourceOutput || !source || !['COMPLETED', 'FAILED'].includes(source.status)) {
        throw new Error('This task is blocked until its dependency records an output.');
      }
    }
  }
  const now = new Date().toISOString();
  return {
    ...state,
    tasks: state.tasks.map((item) => item.id === taskId ? { ...item, status: 'RUNNING', updatedAt: now } : item),
    workflows: state.workflows.map((workflow) => workflow.id === task.workflowId ? { ...workflow, status: 'RUNNING', updatedAt: now } : workflow),
    activity: [event('task_started', `Task started: ${task.title}`, task.id, now), ...state.activity],
  };
}

export function completeTask(state: AgencyState, taskId: string, output: string): AgencyState {
  const task = state.tasks.find((item) => item.id === taskId);
  if (!task) throw new Error('Task not found.');
  if (task.status !== 'RUNNING') throw new Error(`Only running tasks can complete. Current status: ${task.status}.`);
  if (!output.trim()) throw new Error('A worker must provide output before the task can complete.');
  const now = new Date().toISOString();
  let next: AgencyState = {
    ...state,
    tasks: state.tasks.map((item) => item.id === taskId ? { ...item, status: 'COMPLETED', output, updatedAt: now, completedAt: now } : item),
    activity: [event('task_completed', `Task completed: ${task.title}`, task.id, now), ...state.activity],
  };

  const outgoing = state.handoffs.filter((item) => item.fromTaskId === taskId);
  if (outgoing.length > 0) {
    const handoffs = next.handoffs.map((handoff) => outgoing.some((item) => item.id === handoff.id)
      ? { ...handoff, input: { ...handoff.input, sourceTaskId: taskId, sourceOutput: output } }
      : handoff);
    const nextTaskIds = [...new Set(outgoing.map((handoff) => handoff.toTaskId))];
    const tasks = next.tasks.map((item) => nextTaskIds.includes(item.id) ? {
      ...item,
      input: { ...(typeof item.input === 'object' && item.input ? item.input : {}), sourceTaskId: taskId, sourceTaskOutput: output, handoffIds: outgoing.filter((handoff) => handoff.toTaskId === item.id).map((handoff) => handoff.id) },
      status: item.employee === 'human' ? 'WAITING_APPROVAL' : item.status,
      updatedAt: now,
    } : item);
    next = { ...next, handoffs, tasks };
    if (nextTaskIds.some((nextTaskId) => next.tasks.find((item) => item.id === nextTaskId)?.employee === 'human')) {
      const humanTask = next.tasks.find((item) => nextTaskIds.includes(item.id) && item.employee === 'human');
      if (humanTask) {
        const approval: Approval = {
          id: id(), title: 'Review workflow output', whatWillHappen: 'A human reviewer will decide whether this workflow output can proceed.',
          why: 'The workflow requires human approval before external action.', recommendation: 'Review the actual output and approve, reject, or edit the preview.',
          preview: output, status: 'PENDING', taskId: humanTask.id, workflowId: task.workflowId,
          createdAt: now, decidedAt: null,
        };
        next = { ...next, approvals: [approval, ...next.approvals], activity: [event('approval_requested', `Approval requested: ${approval.title}`, approval.id, now), ...next.activity] };
      }
    }
  }

  return {
    ...next,
    workflows: next.workflows.map((workflow) => workflow.id === task.workflowId ? { ...workflow, status: 'RUNNING', updatedAt: now } : workflow),
  };
}

export function failTask(state: AgencyState, taskId: string, error: string, output: string | null = null): AgencyState {
  const task = state.tasks.find((item) => item.id === taskId);
  if (!task) throw new Error('Task not found.');
  if (task.status !== 'RUNNING') throw new Error(`Only running tasks can fail. Current status: ${task.status}.`);
  if (!error.trim()) throw new Error('A technical error description is required.');
  const now = new Date().toISOString();
  let next: AgencyState = {
    ...state,
    tasks: state.tasks.map((item) => item.id === taskId ? { ...item, status: 'FAILED', error, output, updatedAt: now } : item),
    activity: [event('task_failed', `Task failed: ${task.title}`, task.id, now), ...state.activity],
  };
  const workflow = state.workflows.find((item) => item.id === task.workflowId);
  if (task.employee === 'qa' && workflow && task.retryCount < MAX_AUTOMATIC_RETRIES) {
    const attempt = task.retryCount + 1;
    const websiteTask: AgencyTask = {
      ...task, id: id(), title: `Revise website from QA findings (attempt ${attempt})`, employee: 'website', status: 'QUEUED',
      description: 'Queued from recorded QA findings. Awaiting the Website AI worker.', input: { sourceTaskId: task.id, qaFindings: output, qaError: error },
      output: null, error: null, retryCount: attempt, createdAt: now, updatedAt: now, completedAt: null,
    };
    const qaTask: AgencyTask = {
      ...task, id: id(), title: `Recheck website changes (attempt ${attempt})`, status: 'QUEUED',
      description: 'Queued after Website AI revision. Awaiting revised implementation output.', input: { awaitingTaskId: websiteTask.id },
      output: null, error: null, retryCount: attempt, createdAt: now, updatedAt: now, completedAt: null,
    };
    const approvalTask = next.tasks.find((item) => item.workflowId === task.workflowId && item.employee === 'human');
    const handoffs: Handoff[] = [
      { id: id(), fromEmployee: 'qa', toEmployee: 'website', taskId: websiteTask.id, projectId: task.projectId, clientId: task.clientId, summary: `QA revision ${attempt}: route recorded findings to Website AI.`, input: { sourceTaskId: task.id, sourceOutput: output, error }, requiredOutput: ['Address QA findings', 'Revised implementation instructions'], priority: task.priority, createdAt: now, fromTaskId: task.id, toTaskId: websiteTask.id },
      { id: id(), fromEmployee: 'website', toEmployee: 'qa', taskId: qaTask.id, projectId: task.projectId, clientId: task.clientId, summary: `Website revision ${attempt}: return changes to QA.`, input: { sourceTaskId: websiteTask.id, sourceOutput: null }, requiredOutput: ['Updated severity-rated QA findings'], priority: task.priority, createdAt: now, fromTaskId: websiteTask.id, toTaskId: qaTask.id },
    ];
    if (approvalTask) handoffs.push({ id: id(), fromEmployee: 'qa', toEmployee: 'human', taskId: approvalTask.id, projectId: task.projectId, clientId: task.clientId, summary: 'Approval remains blocked until the latest QA task completes.', input: { sourceTaskId: qaTask.id, sourceOutput: null }, requiredOutput: ['Approval decision', 'Reviewer notes'], priority: task.priority, createdAt: now, fromTaskId: qaTask.id, toTaskId: approvalTask.id });
    next = {
      ...next,
      tasks: [...next.tasks, websiteTask, qaTask],
      handoffs: [...next.handoffs, ...handoffs],
      workflows: next.workflows.map((item) => item.id === task.workflowId ? { ...item, status: 'RUNNING', taskIds: [...item.taskIds, websiteTask.id, qaTask.id], handoffIds: [...item.handoffIds, ...handoffs.map((handoff) => handoff.id)], updatedAt: now } : item),
      activity: [...handoffs.map((handoff) => event('handoff_created', `Handoff recorded: ${handoff.fromEmployee} to ${handoff.toEmployee}`, handoff.id, now)), ...next.activity],
    };
  } else if (task.workflowId) {
    next = { ...next, workflows: next.workflows.map((item) => item.id === task.workflowId ? { ...item, status: 'FAILED', updatedAt: now } : item) };
  }
  return next;
}

export function createActivity(type: string, message: string, entityId: string | null = null): ActivityEvent {
  return event(type, message, entityId, new Date().toISOString());
}