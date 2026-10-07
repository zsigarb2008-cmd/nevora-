import { ArrowUpRight, Bot, Check, CircleAlert, Clock3, Radio } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { EmptyState, PageHeader, Panel, StatusBadge } from '../components/UI';
import { employees } from '../data/employees';
import { useAgency } from '../hooks/useAgency';

function employeeStatus(tasks: ReturnType<typeof useAgency>['state']['tasks'], key: string) {
  const latest = tasks.filter((task) => task.employee === key).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  if (latest?.status === 'RUNNING') return 'WORKING';
  if (latest?.status === 'WAITING' || latest?.status === 'WAITING_FOR_CONFIGURATION' || latest?.status === 'WAITING_APPROVAL') return 'WAITING';
  if (latest?.status === 'FAILED') return 'ERROR';
  return 'OFFLINE';
}

export default function Employees() {
  const { employeeKey } = useParams();
  const { state } = useAgency();
  const selected = employees.find((employee) => employee.key === employeeKey);

  if (employeeKey && selected) {
    const tasks = state.tasks.filter((task) => task.employee === selected.key).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const latest = tasks[0];
    return <>
      <PageHeader eyebrow="AI EMPLOYEES / PROFILE" title={selected.name} description={selected.description} action={<StatusBadge status={employeeStatus(state.tasks, selected.key)} />} />
      <div className="employee-detail-grid">
        <Panel title="Employee status" detail="Reflects recorded task state, not assumed availability.">
          <div className="employee-status-panel"><div className="employee-orb"><Bot size={26} /></div><div><StatusBadge status={employeeStatus(state.tasks, selected.key)} /><p>{latest ? `Latest task: ${latest.title}` : 'No assigned tasks.'}</p></div></div>
          <div className="employee-stat-row"><span><Check size={15} /> Completed</span><strong>{tasks.filter((task) => task.status === 'COMPLETED').length}</strong></div>
          <div className="employee-stat-row"><span><CircleAlert size={15} /> Failed</span><strong>{tasks.filter((task) => task.status === 'FAILED').length}</strong></div>
          <div className="employee-stat-row"><span><Clock3 size={15} /> Last activity</span><strong>{latest ? new Date(latest.updatedAt).toLocaleString() : 'No data yet.'}</strong></div>
        </Panel>
        <Panel title="Assigned work" detail="This employee is not connected to an execution service.">
          {tasks.length === 0 ? <EmptyState /> : <div className="record-stack">{tasks.map((task) => <div className="record-row" key={task.id}><div><strong>{task.title}</strong><span>{new Date(task.createdAt).toLocaleString()}</span></div><StatusBadge status={task.status} /></div>)}</div>}
        </Panel>
      </div>
      <p className="integration-note"><Radio size={16} /> Employee execution is offline. Tasks remain queued until a server-side worker is configured.</p>
    </>;
  }

  return <>
    <PageHeader eyebrow="CAPABILITY ROSTER / 02" title="AI employees" description="Specialized roles, connected by the Orchestrator. No employee runs until a worker service is configured." />
    <div className="employee-grid">{employees.map((employee) => {
      const assigned = state.tasks.filter((task) => task.employee === employee.key);
      const status = employeeStatus(state.tasks, employee.key);
      const current = assigned.find((task) => ['RUNNING', 'WAITING', 'WAITING_APPROVAL', 'QUEUED'].includes(task.status));
      return <article className="employee-card" key={employee.key}>
        <div className="employee-card-head"><div className="employee-symbol"><Bot size={19} /></div><StatusBadge status={status} /></div>
        <h2>{employee.name}</h2><p className="employee-description">{employee.description}</p>
        <div className="employee-task"><span>CURRENT TASK</span><strong>{current?.title ?? 'No active task'}</strong></div>
        <div className="employee-card-stats"><span><Check size={14} /> {assigned.filter((task) => task.status === 'COMPLETED').length} completed</span><span><CircleAlert size={14} /> {assigned.filter((task) => task.status === 'FAILED').length} failed</span></div>
        <Link className="employee-open" to={employee.path}>Open employee <ArrowUpRight size={15} /></Link>
      </article>;
    })}</div>
  </>;
}