import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { AgencyState, Approval, Client, ClientStatus, Project, ProjectStatus } from '../types';
import {
  completeTask as completeTaskTransition,
  createActivity,
  createCommandTask,
  createWorkflowRun,
  failTask as failTaskTransition,
  retryTask,
  startTask as startTaskTransition,
} from '../services/orchestrator';
import { supabase } from '../services/supabase';
import {
  addActivity,
  changeRecordStatus,
  createApprovalRecord,
  createClientRecord,
  createProjectRecord,
  createTaskRecord,
  createWorkflowRecords,
  loadWorkspaceState,
  updateApprovalRecord,
} from '../services/workspaceRepository';
import { useAuth } from './useAuth';

interface AgencyContextValue {
  state: AgencyState;
  dataError: string;
  loading: boolean;
  addClient: (values: Omit<Client, 'id' | 'createdAt'>) => void;
  updateClientStatus: (id: string, status: ClientStatus) => void;
  addProject: (values: Omit<Project, 'id' | 'createdAt'>) => void;
  updateProjectStatus: (id: string, status: ProjectStatus) => void;
  runCommand: (command: string, clientId?: string | null) => Promise<string>;
  startWorkflow: (name: string, clientId?: string | null, projectId?: string | null) => Promise<string>;
  startTask: (taskId: string) => void;
  completeTask: (taskId: string, output: string) => void;
  failTask: (taskId: string, error: string, output?: string | null) => void;
  retry: (taskId: string) => void;
  addApproval: (values: Omit<Approval, 'id' | 'status' | 'createdAt' | 'decidedAt'>) => void;
  decideApproval: (id: string, status: 'APPROVED' | 'REJECTED', preview?: string) => void;
}

const emptyAgencyState: AgencyState = {
  clients: [], projects: [], tasks: [], handoffs: [], workflows: [], approvals: [], activity: [],
};

const AgencyContext = createContext<AgencyContextValue | null>(null);
const testMemoryMode = import.meta.env.MODE === 'test' && !supabase;

export function AgencyProvider({ children }: { children: ReactNode }) {
  const { workspaceId, user } = useAuth();
  const [state, setState] = useState<AgencyState>(emptyAgencyState);
  const [dataError, setDataError] = useState('');
  const [loading, setLoading] = useState(Boolean(supabase));

  const refresh = async () => {
    if (!supabase || !workspaceId) return;
    const next = await loadWorkspaceState(supabase, workspaceId);
    setState(next);
  };

  useEffect(() => {
    let active = true;
    if (!supabase) {
      setLoading(false);
      if (!testMemoryMode) setDataError('Supabase is not configured. Workspace records are unavailable.');
      return () => { active = false; };
    }
    if (!user || !workspaceId) {
      setState(emptyAgencyState);
      setLoading(false);
      return () => { active = false; };
    }
    setLoading(true);
    setDataError('');
    void loadWorkspaceState(supabase, workspaceId).then((next) => {
      if (active) setState(next);
    }).catch((reason: unknown) => {
      if (active) setDataError(reason instanceof Error ? reason.message : 'Unable to load workspace records.');
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [user?.id, workspaceId]);

  const reportFailure = (reason: unknown, fallback: string) => {
    setDataError(reason instanceof Error ? reason.message : fallback);
  };

  const addClient: AgencyContextValue['addClient'] = (values) => {
    if (testMemoryMode) {
      const client = { ...values, id: crypto.randomUUID(), createdAt: new Date().toISOString() };
      setState((current) => ({ ...current, clients: [...current.clients, client], activity: [createActivity('client_created', `Client added: ${client.company || client.name}`, client.id), ...current.activity] }));
      return;
    }
    if (!supabase || !workspaceId) return reportFailure(new Error('Sign in to a Supabase workspace before creating clients.'), 'Client could not be saved.');
    void (async () => {
      const client = await createClientRecord(supabase, workspaceId, values);
      await addActivity(supabase, workspaceId, { type: 'client_created', message: `Client added: ${client.company || client.name}`, entityId: client.id });
      await refresh();
      setDataError('');
    })().catch((reason: unknown) => reportFailure(reason, 'Client could not be saved.'));
  };

  const updateClientStatus: AgencyContextValue['updateClientStatus'] = (id, status) => {
    if (testMemoryMode) {
      setState((current) => {
        const client = current.clients.find((item) => item.id === id);
        if (!client) return current;
        return {
          ...current,
          clients: current.clients.map((item) => item.id === id ? { ...item, status } : item),
          activity: [createActivity('client_updated', `${client.company || client.name} moved to ${status}`, id), ...current.activity],
        };
      });
      return;
    }
    if (!supabase || !workspaceId) return reportFailure(new Error('Sign in to update clients.'), 'Client could not be updated.');
    void (async () => {
      await changeRecordStatus(supabase, 'clients', workspaceId, id, status);
      await addActivity(supabase, workspaceId, { type: 'client_updated', message: `Client moved to ${status}`, entityId: id });
      await refresh();
      setDataError('');
    })().catch((reason: unknown) => reportFailure(reason, 'Client could not be updated.'));
  };

  const addProject: AgencyContextValue['addProject'] = (values) => {
    if (testMemoryMode) {
      const project = { ...values, id: crypto.randomUUID(), createdAt: new Date().toISOString() };
      setState((current) => ({ ...current, projects: [...current.projects, project], activity: [createActivity('project_created', `Project created: ${project.name}`, project.id), ...current.activity] }));
      return;
    }
    if (!supabase || !workspaceId) return reportFailure(new Error('Sign in to a Supabase workspace before creating projects.'), 'Project could not be saved.');
    void (async () => {
      const project = await createProjectRecord(supabase, workspaceId, values);
      await addActivity(supabase, workspaceId, { type: 'project_created', message: `Project created: ${project.name}`, entityId: project.id });
      await refresh();
      setDataError('');
    })().catch((reason: unknown) => reportFailure(reason, 'Project could not be saved.'));
  };

  const updateProjectStatus: AgencyContextValue['updateProjectStatus'] = (id, status) => {
    if (testMemoryMode) {
      setState((current) => {
        const project = current.projects.find((item) => item.id === id);
        if (!project) return current;
        return {
          ...current,
          projects: current.projects.map((item) => item.id === id ? { ...item, status } : item),
          activity: [createActivity('project_updated', `${project.name} moved to ${status}`, id), ...current.activity],
        };
      });
      return;
    }
    if (!supabase || !workspaceId) return reportFailure(new Error('Sign in to update projects.'), 'Project could not be updated.');
    void (async () => {
      await changeRecordStatus(supabase, 'projects', workspaceId, id, status);
      await addActivity(supabase, workspaceId, { type: 'project_updated', message: `Project moved to ${status}`, entityId: id });
      await refresh();
      setDataError('');
    })().catch((reason: unknown) => reportFailure(reason, 'Project could not be updated.'));
  };

  const runCommand: AgencyContextValue['runCommand'] = async (command, clientId = null) => {
    const normalized = command.toLowerCase();
    if ((normalized.includes('full') && normalized.includes('workflow')) || normalized.includes('test novera workflow')) {
      return startWorkflow('Novera website workflow', clientId, null);
    }
    if (testMemoryMode) {
      const result = createCommandTask(command);
      result.task.clientId = clientId;
      setState((current) => ({ ...current, tasks: [result.task, ...current.tasks], activity: [result.activity, ...current.activity] }));
      return result.task.id;
    }
    if (!supabase || !workspaceId) throw new Error('Sign in to a Supabase workspace before queuing tasks.');
    const result = createCommandTask(command);
    result.task.clientId = clientId;
    result.task.input = { command: command.trim(), clientId };
    const task = await createTaskRecord(supabase, workspaceId, result.task);
    await refresh();
    setDataError('');
    if (task.employee === 'research') {
      const { error } = await supabase.functions.invoke('process-research-task', { body: { taskId: task.id } });
      await refresh();
      if (error) setDataError(`Research task is stored, but its Edge Function did not run: ${error.message}`);
    }
    return task.id;
  };

  const startWorkflow: AgencyContextValue['startWorkflow'] = async (name, clientId = null, projectId = null) => {
    if (testMemoryMode) {
      const result = createWorkflowRun({ name, clientId, projectId, context: { clientId, projectId } });
      setState((current) => ({
        ...current, tasks: [...result.tasks, ...current.tasks], handoffs: [...result.handoffs, ...current.handoffs],
        workflows: [result.workflow, ...current.workflows], activity: [...result.activity, ...current.activity],
      }));
      return result.workflow.id;
    }
    if (!supabase || !workspaceId) throw new Error('Sign in to a Supabase workspace before queuing workflows.');
    const result = createWorkflowRun({ name, clientId, projectId, context: { clientId, projectId } });
    const workflowId = await createWorkflowRecords(supabase, workspaceId, result);
    await refresh();
    setDataError('');
    const { data: firstTask, error: firstTaskError } = await supabase.from('tasks')
      .select('id').eq('workspace_id', workspaceId).eq('workflow_id', workflowId)
      .eq('employee_key', 'research').single();
    if (firstTaskError) throw firstTaskError;
    const { error: invokeError } = await supabase.functions.invoke('process-research-task', { body: { taskId: firstTask.id } });
    await refresh();
    if (invokeError) setDataError(`Workflow is stored, but its Research AI task did not run: ${invokeError.message}`);
    return workflowId;
  };

  const startTask: AgencyContextValue['startTask'] = (taskId) => {
    if (testMemoryMode) {
      setState((current) => startTaskTransition(current, taskId));
      return;
    }
    if (!supabase || !workspaceId) return reportFailure(new Error('Sign in to start tasks.'), 'Task could not be started.');
    void (async () => {
      const { error } = await supabase.rpc('start_task', { p_task_id: taskId });
      if (error) throw error;
      await refresh();
      setDataError('');
    })().catch((reason: unknown) => reportFailure(reason, 'Task could not be started.'));
  };

  const completeTask: AgencyContextValue['completeTask'] = (taskId, output) => {
    if (testMemoryMode) {
      setState((current) => completeTaskTransition(current, taskId, output));
      return;
    }
    if (!supabase || !workspaceId) return reportFailure(new Error('Sign in to complete tasks.'), 'Task could not be completed.');
    void (async () => {
      const { error } = await supabase.rpc('complete_task', { p_task_id: taskId, p_output: output });
      if (error) throw error;
      await refresh();
      setDataError('');
    })().catch((reason: unknown) => reportFailure(reason, 'Task could not be completed.'));
  };

  const failTask: AgencyContextValue['failTask'] = (taskId, errorText, output = null) => {
    if (testMemoryMode) {
      setState((current) => failTaskTransition(current, taskId, errorText, output));
      return;
    }
    if (!supabase || !workspaceId) return reportFailure(new Error('Sign in to report task failures.'), 'Task failure could not be recorded.');
    void (async () => {
      const { error } = await supabase.rpc('fail_task', { p_task_id: taskId, p_error: errorText, p_output: output });
      if (error) throw error;
      await refresh();
      setDataError('');
    })().catch((reason: unknown) => reportFailure(reason, 'Task failure could not be recorded.'));
  };

  const retry: AgencyContextValue['retry'] = (taskId) => {
    if (testMemoryMode) {
      setState((current) => {
        const task = current.tasks.find((item) => item.id === taskId);
        if (!task) return current;
        const retried = retryTask(task);
        return { ...current, tasks: current.tasks.map((item) => item.id === taskId ? retried : item), activity: [createActivity('task_retried', `Task re-queued: ${task.title}`, taskId), ...current.activity] };
      });
      return;
    }
    if (!supabase || !workspaceId) return reportFailure(new Error('Sign in to retry tasks.'), 'Task could not be retried.');
    const task = state.tasks.find((item) => item.id === taskId);
    if (!task) return reportFailure(new Error('Task not found.'), 'Task could not be retried.');
    try { retryTask(task); }
    catch (reason) { return reportFailure(reason, 'Task could not be retried.'); }
    void (async () => {
      const { error } = await supabase.rpc('retry_task', { p_task_id: taskId });
      if (error) throw error;
      await refresh();
      setDataError('');
      if (task.employee === 'research') {
        const { error: invokeError } = await supabase.functions.invoke('process-research-task', { body: { taskId } });
        await refresh();
        if (invokeError) setDataError(`Research task is stored, but its Edge Function did not run: ${invokeError.message}`);
      }
    })().catch((reason: unknown) => reportFailure(reason, 'Task could not be retried.'));
  };

  const addApproval: AgencyContextValue['addApproval'] = (values) => {
    if (testMemoryMode) {
      const approval = { ...values, id: crypto.randomUUID(), status: 'PENDING' as const, createdAt: new Date().toISOString(), decidedAt: null };
      setState((current) => ({ ...current, approvals: [approval, ...current.approvals], activity: [createActivity('approval_requested', `Approval requested: ${approval.title}`, approval.id), ...current.activity] }));
      return;
    }
    if (!supabase || !workspaceId) return reportFailure(new Error('Sign in to request approval.'), 'Approval could not be saved.');
    void (async () => {
      const approval = await createApprovalRecord(supabase, workspaceId, values);
      await addActivity(supabase, workspaceId, { type: 'approval_requested', message: `Approval requested: ${approval.title}`, entityId: approval.id });
      await refresh();
      setDataError('');
    })().catch((reason: unknown) => reportFailure(reason, 'Approval could not be saved.'));
  };

  const decideApproval: AgencyContextValue['decideApproval'] = (id, status, preview) => {
    if (testMemoryMode) {
      setState((current) => {
        const approval = current.approvals.find((item) => item.id === id);
        if (!approval || approval.status !== 'PENDING') return current;
        const message = status === 'APPROVED' ? 'Approval granted' : 'Approval rejected';
        return {
          ...current,
          approvals: current.approvals.map((item) => item.id === id ? { ...item, status, preview: preview ?? item.preview, decidedAt: new Date().toISOString() } : item),
          tasks: approval.taskId ? current.tasks.map((task) => task.id === approval.taskId ? {
            ...task, status: status === 'APPROVED' ? 'COMPLETED' : 'CANCELLED',
            output: status === 'APPROVED' ? 'Human approval granted.' : 'Human approval rejected.',
            updatedAt: new Date().toISOString(), completedAt: status === 'APPROVED' ? new Date().toISOString() : null,
          } : task) : current.tasks,
          workflows: approval.workflowId ? current.workflows.map((workflow) => workflow.id === approval.workflowId ? {
            ...workflow, status: status === 'APPROVED' ? 'COMPLETED' : 'CANCELLED', updatedAt: new Date().toISOString(),
          } : workflow) : current.workflows,
          activity: [createActivity(status === 'APPROVED' ? 'approval_granted' : 'approval_rejected', `${message}: ${approval.title}`, id), ...current.activity],
        };
      });
      return;
    }
    if (!supabase || !workspaceId) return reportFailure(new Error('Sign in to decide approvals.'), 'Approval decision could not be saved.');
    void (async () => {
      if (!user) throw new Error('A signed-in reviewer is required to decide approvals.');
      const approval = await updateApprovalRecord(supabase, workspaceId, id, status, preview, user.id);
      if (approval.taskId) {
        const { error } = await supabase.from('tasks').update({
          status: status === 'APPROVED' ? 'completed' : 'cancelled',
          output: status === 'APPROVED' ? { decision: 'approved' } : { decision: 'rejected' },
          completed_at: status === 'APPROVED' ? new Date().toISOString() : null,
        }).eq('workspace_id', workspaceId).eq('id', approval.taskId);
        if (error) throw error;
      }
      if (approval.workflowId) {
        const { error } = await supabase.from('workflows').update({
          status: status === 'APPROVED' ? 'completed' : 'cancelled',
        }).eq('workspace_id', workspaceId).eq('id', approval.workflowId);
        if (error) throw error;
      }
      await addActivity(supabase, workspaceId, {
        type: status === 'APPROVED' ? 'approval_granted' : 'approval_rejected',
        message: `${status === 'APPROVED' ? 'Approval granted' : 'Approval rejected'}: ${approval.title}`,
        entityId: approval.id,
      });
      await refresh();
      setDataError('');
    })().catch((reason: unknown) => reportFailure(reason, 'Approval decision could not be saved.'));
  };

  return <AgencyContext.Provider value={{
    state, dataError, loading, addClient, updateClientStatus, addProject, updateProjectStatus, runCommand, startWorkflow,
    startTask, completeTask, failTask, retry, addApproval, decideApproval,
  }}>{children}</AgencyContext.Provider>;
}

export function useAgency(): AgencyContextValue {
  const context = useContext(AgencyContext);
  if (!context) throw new Error('useAgency must be used inside AgencyProvider.');
  return context;
}
