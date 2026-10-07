import { ArrowRight, CircleAlert, Clock3, ListChecks, UsersRound, Workflow } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Panel, PageHeader, StatusBadge } from '../components/UI';
import { useAgency } from '../hooks/useAgency';

export default function Dashboard() {
  const { state } = useAgency();
  const activeClients = state.clients.filter((client) => !['WON', 'LOST'].includes(client.status)).length;
  const activeProjects = state.projects.filter((project) => !['LIVE', 'COMPLETED'].includes(project.status)).length;
  const running = state.tasks.filter((task) => task.status === 'RUNNING').length;
  const waitingApproval = state.tasks.filter((task) => task.status === 'WAITING_APPROVAL').length + state.approvals.filter((approval) => approval.status === 'PENDING').length;
  const completed = state.tasks.filter((task) => task.status === 'COMPLETED').length;
  const failed = state.tasks.filter((task) => task.status === 'FAILED').length;
  const metrics = [
    { label: 'Active clients', value: activeClients, icon: UsersRound, color: 'mint' },
    { label: 'Active projects', value: activeProjects, icon: Workflow, color: 'blue' },
    { label: 'Running AI tasks', value: running, icon: Clock3, color: 'amber' },
    { label: 'Waiting for approval', value: waitingApproval, icon: ListChecks, color: 'coral' },
    { label: 'Completed tasks', value: completed, icon: ListChecks, color: 'green' },
    { label: 'Failed tasks', value: failed, icon: CircleAlert, color: 'red' },
  ];
  const pipeline = ['NEW', 'RESEARCHING', 'QUALIFIED', 'CONTACTED', 'MEETING', 'PROPOSAL', 'WON', 'LOST'] as const;

  return (
    <>
      <PageHeader eyebrow="AGENCY PULSE / 01" title="Good work starts with clarity." description="A live view of the work, people, and decisions moving through Novera." action={<span className="date-stamp">{new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}</span>} />
      <div className="metrics-grid">
        {metrics.map(({ label, value, icon: Icon, color }) => <article className="metric-card" key={label}><div className={`metric-icon metric-${color}`}><Icon size={17} /></div><div><div className="metric-number">{value}</div><p>{label}</p></div><span className="metric-live" aria-label="Current application state" /></article>)}
      </div>
      <div className="dashboard-grid">
        <Panel title="Recent activity" detail="Latest recorded events" action={<Link className="quiet-link" to="/activity">View log <ArrowRight size={14} /></Link>}>
          {state.activity.length === 0 ? <div className="panel-empty">No data yet.</div> : <div className="activity-list">{state.activity.slice(0, 6).map((item) => <div className="activity-row" key={item.id}><span className={`activity-dot activity-${item.type}`} /><div className="activity-copy"><strong>{item.message}</strong><time>{new Date(item.createdAt).toLocaleString()}</time></div></div>)}</div>}
        </Panel>
        <Panel title="Lead pipeline" detail="Clients by current status" action={<Link className="quiet-link" to="/clients">Open CRM <ArrowRight size={14} /></Link>}>
          {state.clients.length === 0 ? <div className="panel-empty">No data yet.</div> : <div className="pipeline-list">{pipeline.map((status) => {
            const count = state.clients.filter((client) => client.status === status).length;
            return <div className="pipeline-row" key={status}><span>{status}</span><div className="pipeline-track"><span style={{ width: `${Math.max(count / state.clients.length * 100, count ? 4 : 0)}%` }} /></div><strong>{count}</strong></div>;
          })}</div>}
        </Panel>
        <Panel title="Work in motion" detail="Tasks requiring attention" className="span-two" action={<Link className="quiet-link" to="/tasks">All tasks <ArrowRight size={14} /></Link>}>
          {state.tasks.length === 0 ? <div className="panel-empty">No data yet.</div> : <div className="compact-table-wrap"><table className="data-table"><thead><tr><th>Task</th><th>Employee</th><th>Status</th><th>Updated</th></tr></thead><tbody>{state.tasks.slice(0, 5).map((task) => <tr key={task.id}><td className="primary-cell">{task.title}</td><td>{task.employee}</td><td><StatusBadge status={task.status} /></td><td>{new Date(task.updatedAt).toLocaleDateString()}</td></tr>)}</tbody></table></div>}
        </Panel>
      </div>
    </>
  );
}