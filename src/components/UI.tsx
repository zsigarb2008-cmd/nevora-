import type { ReactNode } from 'react';
import type { TaskStatus } from '../types';

export function PageHeader({ eyebrow, title, description, action }: { eyebrow: string; title: string; description?: string; action?: ReactNode }) {
  return (
    <header className="page-header">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        {description && <p className="page-description">{description}</p>}
      </div>
      {action && <div className="page-action">{action}</div>}
    </header>
  );
}

export function EmptyState({ children = 'No data yet.' }: { children?: ReactNode }) {
  return <div className="empty-state">{children}</div>;
}

export function StatusBadge({ status }: { status: string }) {
  const tone = status.toLowerCase().replace(/_/g, '-');
  return <span className={`status-badge tone-${tone}`}>{status.replace(/_/g, ' ')}</span>;
}

export function Panel({ title, detail, action, children, className = '' }: { title: string; detail?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`panel ${className}`}>
      <div className="panel-heading">
        <div><h2>{title}</h2>{detail && <p>{detail}</p>}</div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function TaskStatusBadge({ status }: { status: TaskStatus }) {
  return <StatusBadge status={status} />;
}