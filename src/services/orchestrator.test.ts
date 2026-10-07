import { describe, expect, it } from 'vitest';
import { emptyAgencyState } from './storage';
import { completeTask, createCommandTask, createWorkflowRun, failTask, startTask } from './orchestrator';
import type { AgencyState } from '../types';

function beginWorkflow(): { state: AgencyState; taskIds: string[] } {
  const result = createWorkflowRun({ name: 'Test Novera workflow' });
  return {
    state: { ...emptyAgencyState, tasks: result.tasks, handoffs: result.handoffs, workflows: [result.workflow], activity: result.activity },
    taskIds: result.workflow.taskIds,
  };
}

function advanceThroughSeo(state: AgencyState, taskIds: string[]): AgencyState {
  let current = state;
  for (const taskId of taskIds.slice(0, 5)) {
    current = startTask(current, taskId);
    current = completeTask(current, taskId, `Recorded output for ${taskId}`);
  }
  return current;
}

describe('Orchestrator', () => {
  it('creates all workflow task and handoff records without claiming execution', () => {
    const { state, taskIds } = beginWorkflow();
    expect(taskIds).toHaveLength(7);
    expect(state.handoffs).toHaveLength(6);
    expect(state.workflows[0].status).toBe('QUEUED');
    expect(state.tasks.every((task) => task.status === 'QUEUED')).toBe(true);
    expect(state.handoffs.every((handoff) => state.tasks.some((task) => task.id === handoff.fromTaskId) && state.tasks.some((task) => task.id === handoff.toTaskId))).toBe(true);
  });

  it('blocks dependent tasks until a worker records source output', () => {
    const { state, taskIds } = beginWorkflow();
    expect(() => startTask(state, taskIds[1])).toThrow('blocked until its dependency records an output');
    const started = startTask(state, taskIds[0]);
    const completed = completeTask(started, taskIds[0], 'Verified research output');
    expect(completed.tasks.find((task) => task.id === taskIds[1])?.input).toMatchObject({ sourceTaskOutput: 'Verified research output' });
    expect(completed.handoffs[0].input.sourceOutput).toBe('Verified research output');
  });

  it('creates a human approval only after recorded QA output reaches the approval stage', () => {
    const { state, taskIds } = beginWorkflow();
    let current = advanceThroughSeo(state, taskIds);
    current = startTask(current, taskIds[5]);
    expect(current.approvals).toHaveLength(0);
    current = completeTask(current, taskIds[5], 'QA found no critical issues in the submitted work.');
    expect(current.tasks.find((task) => task.id === taskIds[6])?.status).toBe('WAITING_APPROVAL');
    expect(current.approvals[0]).toMatchObject({ status: 'PENDING', workflowId: current.workflows[0].id, taskId: taskIds[6] });
    expect(current.approvals[0].preview).toContain('QA found no critical issues');
  });

  it('routes QA failures through Website then QA and stops after two revision attempts', () => {
    const { state, taskIds } = beginWorkflow();
    let current = advanceThroughSeo(state, taskIds);
    current = startTask(current, taskIds[5]);
    current = failTask(current, taskIds[5], 'QA checks reported blocking issues.', 'HIGH: broken navigation');
    let website = current.tasks.find((task) => task.employee === 'website' && task.retryCount === 1);
    let qa = current.tasks.find((task) => task.employee === 'qa' && task.retryCount === 1);
    expect(website?.input).toMatchObject({ qaFindings: 'HIGH: broken navigation' });
    expect(qa).toBeDefined();

    for (const attempt of [1, 2]) {
      if (!website || !qa) throw new Error('Expected bounded Website and QA rework tasks.');
      current = startTask(current, website.id);
      current = completeTask(current, website.id, `Website revision ${attempt} recorded`);
      current = startTask(current, qa.id);
      current = failTask(current, qa.id, `QA attempt ${attempt} still has blocking issues.`, `Attempt ${attempt} findings`);
      website = current.tasks.find((task) => task.employee === 'website' && task.retryCount === attempt + 1);
      qa = current.tasks.find((task) => task.employee === 'qa' && task.retryCount === attempt + 1);
    }

    expect(current.workflows[0].status).toBe('FAILED');
    expect(website).toBeUndefined();
    expect(qa).toBeUndefined();
    expect(current.tasks.filter((task) => task.employee === 'website')).toHaveLength(3);
  });

  it('routes commands to the matching specialist without inventing output', () => {
    const { task } = createCommandTask('Create a website plan');
    expect(task.employee).toBe('website');
    expect(task.status).toBe('QUEUED');
    expect(task.output).toBeNull();
  });
});