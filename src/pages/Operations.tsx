import { useState, type FormEvent } from 'react';
import { ArrowDown, ArrowRight, Check, Pencil, Plus, X } from 'lucide-react';
import { EmptyState, PageHeader, Panel, StatusBadge } from '../components/UI';
import { employees } from '../data/employees';
import { useAgency } from '../hooks/useAgency';

export function WorkflowsPage() {
  const { state, startWorkflow } = useAgency();
  const [formOpen, setFormOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [clientId, setClientId] = useState('');
  const [projectId, setProjectId] = useState('');
  const queueWorkflow = async (name: string) => {
    try {
      const id = await startWorkflow(name, clientId || null, projectId || null);
      setNotice(`Workflow ${id.slice(0, 8)} queued with seven task records and six handoffs. The Research stage follows worker configuration; downstream work waits for recorded output.`);
      setError(''); setFormOpen(false);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Workflow could not be queued.'); }
  };

  return <>
    <PageHeader eyebrow="ORCHESTRATION / 06" title="Workflows" description="Linked tasks, dependencies, and approvals. The Orchestrator tracks each transition." action={<button className="primary-button" onClick={() => setFormOpen((open) => !open)}><Plus size={16} /> Queue workflow</button>} />
    {formOpen && <Panel title="Queue website workflow" detail="Creates real queued tasks and dependency handoffs. Employee execution is not configured.">
      <div className="form-grid workflow-form"><label>Client<select value={clientId} onChange={(event) => setClientId(event.target.value)}><option value="">No client linked</option>{state.clients.map((client) => <option value={client.id} key={client.id}>{client.company || client.name}</option>)}</select></label><label>Project<select value={projectId} onChange={(event) => setProjectId(event.target.value)}><option value="">No project linked</option>{state.projects.map((project) => <option value={project.id} key={project.id}>{project.name}</option>)}</select></label><div className="form-actions field-wide"><button className="secondary-button" onClick={() => setFormOpen(false)}>Cancel</button><button className="primary-button" onClick={() => void queueWorkflow('Novera website workflow')}>Queue workflow</button></div></div>
      <button className="text-button" onClick={() => void queueWorkflow('Test Novera workflow')}>Queue test Novera workflow</button>
    </Panel>}
    {notice && <div className="inline-notice" role="status">{notice}</div>}{error && <div className="inline-error" role="alert">{error}</div>}
    <Panel title="Workflow runs" detail={`${state.workflows.length} recorded runs`}>
      {state.workflows.length === 0 ? <EmptyState /> : <div className="workflow-list">{state.workflows.map((workflow) => {
        const tasks = workflow.taskIds.map((id) => state.tasks.find((task) => task.id === id)).filter((task) => task !== undefined);
        const handoffs = workflow.handoffIds.map((id) => state.handoffs.find((item) => item.id === id)).filter((handoff) => handoff !== undefined);
        return <article className="workflow-run" key={workflow.id}>
          <div className="workflow-run-head"><div><h3>{workflow.name}</h3><p>{new Date(workflow.createdAt).toLocaleString()} · {tasks.length} tasks · {handoffs.length} handoffs</p></div><StatusBadge status={workflow.status} /></div>
          <div className="workflow-steps">{tasks.map((task, index) => {
            const nextTask = tasks[index + 1];
            const handoff = nextTask ? handoffs.find((item) => item.fromTaskId === task.id && item.toTaskId === nextTask.id) : undefined;
            const handoffState = handoff?.status === 'ready' && handoff.workerOutput ? 'source output recorded'
              : handoff?.status === 'failed' ? 'handoff failed' : 'waiting for source output';
            return <div className="workflow-step-wrap" key={task.id}><div className="workflow-step"><div className={`workflow-step-index ${task.status.toLowerCase()}`}>{String(index + 1).padStart(2, '0')}</div><div className="workflow-step-copy"><strong>{task.employee === 'human' ? 'Human approval' : employees.find((employee) => employee.key === task.employee)?.name}</strong><span>{task.title}</span></div><StatusBadge status={task.status} /></div>{index < tasks.length - 1 && <div className="workflow-connector"><ArrowDown size={14} /><span>{handoff ? `${handoff.fromEmployee} → ${handoff.toEmployee} · ${handoffState}` : 'Dependency pending'}</span></div>}</div>;
          })}</div>
          <details className="workflow-technical"><summary>Orchestration records</summary><div className="workflow-records"><div><span>Run ID</span><code>{workflow.id}</code></div><div><span>Task IDs</span><code>{workflow.taskIds.join(', ')}</code></div><div><span>Handoff IDs</span><code>{workflow.handoffIds.join(', ') || 'None'}</code></div></div></details>
        </article>;
      })}</div>}
    </Panel>
    <div className="integration-note"><ArrowRight size={16} /> Handoffs carry task, client, project, required output, and source references. They stay blocked until a worker records output.</div>
  </>;
}

export function ApprovalsPage() {
  const { state, addApproval, decideApproval } = useAgency();
  const [formOpen, setFormOpen] = useState(false);
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editedPreview, setEditedPreview] = useState('');
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      addApproval({ title: String(data.get('title') || ''), whatWillHappen: String(data.get('what') || ''), why: String(data.get('why') || ''), recommendation: String(data.get('recommendation') || ''), preview: String(data.get('preview') || '') });
      setError(''); setFormOpen(false); event.currentTarget.reset();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Approval request could not be saved.'); }
  };
  const pending = state.approvals.filter((item) => item.status === 'PENDING');
  const decided = state.approvals.filter((item) => item.status !== 'PENDING');

  return <>
    <PageHeader eyebrow="HUMAN CONTROL / 07" title="Approvals" description="External or consequential actions wait for a human decision." action={<button className="primary-button" onClick={() => setFormOpen((open) => !open)}><Plus size={16} /> Request approval</button>} />
    {formOpen && <Panel title="New approval request" detail="Describe the action and show the exact preview before a decision is made."><form className="form-grid" onSubmit={submit}>
      <label className="field-wide">Request title<input name="title" required placeholder="Publish homepage update" /></label>
      <label>What will happen<textarea name="what" required rows={2} /></label><label>Why<textarea name="why" required rows={2} /></label>
      <label>AI recommendation<textarea name="recommendation" required rows={2} /></label><label>Preview<textarea name="preview" required rows={2} /></label>
      <div className="form-actions field-wide"><span className="form-error" role="alert">{error}</span><button className="secondary-button" type="button" onClick={() => setFormOpen(false)}>Cancel</button><button className="primary-button" type="submit">Submit for review</button></div>
    </form></Panel>}
    <Panel title="Awaiting your decision" detail={`${pending.length} pending`}>
      {pending.length === 0 ? <EmptyState /> : <div className="approval-list">{pending.map((item) => <article className="approval-card" key={item.id}>
        <div className="approval-card-head"><div><span className="eyebrow">REVIEW REQUEST</span><h3>{item.title}</h3><time>{new Date(item.createdAt).toLocaleString()}</time></div><StatusBadge status={item.status} /></div>
        <div className="approval-grid"><div><span>WHAT WILL HAPPEN</span><p>{item.whatWillHappen}</p></div><div><span>WHY</span><p>{item.why}</p></div><div><span>AI RECOMMENDATION</span><p>{item.recommendation}</p></div><div><span>PREVIEW</span>{editingId === item.id ? <textarea className="approval-edit" value={editedPreview} onChange={(event) => setEditedPreview(event.target.value)} /> : <p className="preview-block">{item.preview}</p>}</div></div>
        <div className="approval-actions">{editingId === item.id ? <><button className="secondary-button" onClick={() => setEditingId(null)}>Cancel edit</button><button className="secondary-button" onClick={() => { decideApproval(item.id, 'REJECTED', editedPreview); setEditingId(null); }}>Save &amp; reject</button><button className="primary-button" onClick={() => { decideApproval(item.id, 'APPROVED', editedPreview); setEditingId(null); }}>Save &amp; approve</button></> : <><button className="secondary-button" onClick={() => { setEditingId(item.id); setEditedPreview(item.preview); }}><Pencil size={14} /> Edit</button><button className="secondary-button reject-button" onClick={() => decideApproval(item.id, 'REJECTED')}><X size={14} /> Reject</button><button className="primary-button" onClick={() => decideApproval(item.id, 'APPROVED')}><Check size={14} /> Approve</button></>}</div>
      </article>)}</div>}
    </Panel>
    {decided.length > 0 && <Panel title="Decision history" detail={`${decided.length} reviewed`}><div className="record-stack">{decided.map((item) => <div className="record-row" key={item.id}><div><strong>{item.title}</strong><span>{item.decidedAt ? new Date(item.decidedAt).toLocaleString() : ''}</span></div><StatusBadge status={item.status} /></div>)}</div></Panel>}
  </>;
}