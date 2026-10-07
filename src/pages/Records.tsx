import { useState, type FormEvent } from 'react';
import { Plus, RotateCcw } from 'lucide-react';
import { EmptyState, PageHeader, Panel, TaskStatusBadge } from '../components/UI';
import { useAgency } from '../hooks/useAgency';
import type { ClientStatus, ProjectStatus } from '../types';

const clientStatuses: ClientStatus[] = ['NEW', 'RESEARCHING', 'QUALIFIED', 'CONTACTED', 'MEETING', 'PROPOSAL', 'WON', 'LOST'];
const projectStatuses: ProjectStatus[] = ['PLANNING', 'RESEARCH', 'DESIGN', 'DEVELOPMENT', 'QA', 'APPROVAL', 'LIVE', 'COMPLETED'];

export function ClientsPage() {
  const { state, addClient, updateClientStatus } = useAgency();
  const [formOpen, setFormOpen] = useState(false);
  const [error, setError] = useState('');
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      addClient({
        name: String(data.get('name') || ''), company: String(data.get('company') || ''),
        email: String(data.get('email') || ''), phone: String(data.get('phone') || ''),
        website: String(data.get('website') || ''), industry: String(data.get('industry') || ''),
        country: String(data.get('country') || ''), language: String(data.get('language') || ''),
        notes: String(data.get('notes') || ''), leadScore: null, status: 'NEW',
      });
      setError(''); setFormOpen(false); event.currentTarget.reset();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Client could not be saved.'); }
  };

  return <>
    <PageHeader eyebrow="RELATIONSHIPS / 03" title="Clients" description="A clear record of every relationship and where it stands." action={<button className="primary-button" onClick={() => setFormOpen((open) => !open)}><Plus size={16} /> Add client</button>} />
    {formOpen && <Panel title="New client" detail="Start with the details you have; unknown fields can stay blank."><form className="form-grid" onSubmit={submit}>
      <label>Name<input name="name" required placeholder="Contact name" /></label><label>Company<input name="company" required placeholder="Business name" /></label>
      <label>Email<input name="email" type="email" placeholder="name@company.com" /></label><label>Phone<input name="phone" type="tel" placeholder="Phone number" /></label>
      <label>Website<input name="website" type="url" placeholder="https://example.com" /></label><label>Industry<input name="industry" placeholder="Industry" /></label>
      <label>Country<input name="country" placeholder="Country" /></label><label>Language<input name="language" placeholder="Preferred language" /></label>
      <label className="field-wide">Notes<textarea name="notes" rows={3} placeholder="Context and next steps" /></label>
      <div className="form-actions field-wide"><span className="form-error" role="alert">{error}</span><button type="button" className="secondary-button" onClick={() => setFormOpen(false)}>Cancel</button><button className="primary-button" type="submit">Save client</button></div>
    </form></Panel>}
    <Panel title="Client directory" detail={`${state.clients.length} recorded ${state.clients.length === 1 ? 'client' : 'clients'}`}>
      {state.clients.length === 0 ? <EmptyState /> : <div className="table-scroll"><table className="data-table"><thead><tr><th>Client</th><th>Company</th><th>Industry</th><th>Lead score</th><th>Status</th></tr></thead><tbody>{state.clients.map((client) => <tr key={client.id}>
        <td className="primary-cell">{client.name}<span className="table-subline">{client.email || 'No email recorded'}</span></td><td>{client.company}</td><td>{client.industry || '—'}</td><td>{client.leadScore ?? '—'}</td>
        <td><select className="table-select" aria-label={`Status for ${client.company}`} value={client.status} onChange={(event) => updateClientStatus(client.id, event.target.value as ClientStatus)}>{clientStatuses.map((status) => <option key={status}>{status}</option>)}</select></td>
      </tr>)}</tbody></table></div>}
    </Panel>
  </>;
}

export function ProjectsPage() {
  const { state, addProject, updateProjectStatus } = useAgency();
  const [formOpen, setFormOpen] = useState(false);
  const [error, setError] = useState('');
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      addProject({ name: String(data.get('name') || ''), clientId: String(data.get('clientId') || '') || null,
        description: String(data.get('description') || ''), status: 'PLANNING', deadline: String(data.get('deadline') || '') });
      setError(''); setFormOpen(false); event.currentTarget.reset();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Project could not be saved.'); }
  };

  return <>
    <PageHeader eyebrow="DELIVERY / 04" title="Projects" description="Plans, timelines, and client work in one place." action={<button className="primary-button" onClick={() => setFormOpen((open) => !open)}><Plus size={16} /> New project</button>} />
    {formOpen && <Panel title="New project"><form className="form-grid" onSubmit={submit}>
      <label>Project name<input name="name" required placeholder="Website redesign" /></label>
      <label>Client<select name="clientId"><option value="">No client linked</option>{state.clients.map((client) => <option value={client.id} key={client.id}>{client.company || client.name}</option>)}</select></label>
      <label>Deadline<input name="deadline" type="date" /></label><label className="field-wide">Description<textarea name="description" rows={3} placeholder="Scope and intended outcome" /></label>
      <div className="form-actions field-wide"><span className="form-error" role="alert">{error}</span><button type="button" className="secondary-button" onClick={() => setFormOpen(false)}>Cancel</button><button className="primary-button" type="submit">Create project</button></div>
    </form></Panel>}
    <Panel title="Project register" detail={`${state.projects.length} recorded ${state.projects.length === 1 ? 'project' : 'projects'}`}>
      {state.projects.length === 0 ? <EmptyState /> : <div className="table-scroll"><table className="data-table"><thead><tr><th>Project</th><th>Client</th><th>Deadline</th><th>Tasks</th><th>Status</th></tr></thead><tbody>{state.projects.map((project) => <tr key={project.id}><td className="primary-cell">{project.name}<span className="table-subline">{project.description || 'No description'}</span></td><td>{state.clients.find((client) => client.id === project.clientId)?.company || '—'}</td><td>{project.deadline || '—'}</td><td>{state.tasks.filter((task) => task.projectId === project.id).length}</td><td><select className="table-select" aria-label={`Status for ${project.name}`} value={project.status} onChange={(event) => updateProjectStatus(project.id, event.target.value as ProjectStatus)}>{projectStatuses.map((status) => <option key={status}>{status}</option>)}</select></td></tr>)}</tbody></table></div>}
    </Panel>
  </>;
}

export function TasksPage() {
  const { state, retry } = useAgency();
  const [error, setError] = useState('');
  const tasks = [...state.tasks].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const onRetry = (taskId: string) => {
    try { retry(taskId); setError(''); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Task could not be retried.'); }
  };
  return <>
    <PageHeader eyebrow="EXECUTION QUEUE / 05" title="Tasks" description="Tasks are stored in the workspace database. Research runs through the configured server-side employee." />
    {error && <div className="inline-error" role="alert">{error}</div>}
    <Panel title="Task queue" detail={`${tasks.length} total task records`}>
      {tasks.length === 0 ? <EmptyState /> : <div className="task-list">{tasks.map((task) => {
        const client = state.clients.find((item) => item.id === task.clientId);
        const project = state.projects.find((item) => item.id === task.projectId);
        return <details className="task-item" key={task.id}>
          <summary><div className="task-summary-main"><strong>{task.title}</strong><span>{task.employee} {client ? `· ${client.company || client.name}` : ''}{project ? ` · ${project.name}` : ''}</span></div><div className="task-summary-meta"><span className={`priority priority-${task.priority.toLowerCase()}`}>{task.priority}</span><TaskStatusBadge status={task.status} /></div></summary>
          <div className="task-details"><p>{task.description}</p><div className="task-context-grid"><div><span>Task ID</span><code>{task.id}</code></div><div><span>Created</span><time>{new Date(task.createdAt).toLocaleString()}</time></div><div><span>Retries</span><strong>{task.retryCount}</strong></div></div>
            {task.error && <div className="task-error"><strong>Error</strong><p>{task.error}</p><button className="secondary-button" onClick={() => onRetry(task.id)}><RotateCcw size={14} /> Retry task</button></div>}
            {task.output && <div className="task-output"><strong>Recorded output</strong><p>{task.output}</p></div>}
            <details className="raw-details"><summary>View input</summary><pre>{JSON.stringify(task.input, null, 2)}</pre></details>
          </div>
        </details>;
      })}</div>}
    </Panel>
    <p className="integration-note">A task marked WAITING FOR CONFIGURATION requires the server-side AI provider secret. No output is created until a worker returns it.</p>
  </>;
}