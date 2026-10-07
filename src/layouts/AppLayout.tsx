import { useState } from 'react';
import { Activity, Bot, BriefcaseBusiness, CheckCheck, ChevronDown, Command, FolderKanban, LayoutDashboard, ListTodo, Menu, Settings, Workflow, X } from 'lucide-react';
import { NavLink, Outlet } from 'react-router-dom';
import { CommandCenter } from '../components/CommandCenter';
import { useAgency } from '../hooks/useAgency';
import { useAuth } from '../hooks/useAuth';

const mainLinks = [
  { label: 'Overview', to: '/dashboard', icon: LayoutDashboard },
  { label: 'AI employees', to: '/ai-employees', icon: Bot },
  { label: 'Clients', to: '/clients', icon: BriefcaseBusiness },
  { label: 'Projects', to: '/projects', icon: FolderKanban },
  { label: 'Tasks', to: '/tasks', icon: ListTodo },
];

const opsLinks = [
  { label: 'Workflows', to: '/workflows', icon: Workflow },
  { label: 'Approvals', to: '/approvals', icon: CheckCheck },
  { label: 'Activity', to: '/activity', icon: Activity },
  { label: 'Settings', to: '/settings', icon: Settings },
];

export default function AppLayout() {
  const [open, setOpen] = useState(false);
  const { dataError } = useAgency();
  const { user } = useAuth();
  const close = () => setOpen(false);
  return (
    <div className="app-shell">
      {open && <button className="sidebar-scrim" onClick={close} aria-label="Close navigation" />}
      <aside className={`sidebar ${open ? 'sidebar-open' : ''}`}>
        <div className="brand-row"><div className="brand-mark">N</div><div className="brand-copy"><strong>novera</strong><span>DIGITAL OPERATIONS</span></div><button className="icon-button sidebar-close" onClick={close} aria-label="Close navigation"><X size={18} /></button></div>
        <div className="workspace-switcher"><span className="workspace-dot" /><span>Supabase workspace</span><ChevronDown size={14} /></div>
        <nav aria-label="Main navigation">
          <p className="nav-section-label">WORKSPACE</p>
          {mainLinks.map(({ label, to, icon: Icon }) => <NavLink key={to} to={to} onClick={close} className={({ isActive }) => `nav-link ${isActive ? 'nav-active' : ''}`}><Icon size={17} /><span>{label}</span></NavLink>)}
          <p className="nav-section-label nav-section-spaced">OPERATIONS</p>
          {opsLinks.map(({ label, to, icon: Icon }) => <NavLink key={to} to={to} onClick={close} className={({ isActive }) => `nav-link ${isActive ? 'nav-active' : ''}`}><Icon size={17} /><span>{label}</span></NavLink>)}
        </nav>
        <div className="sidebar-footer"><span className="connection-indicator" /><span>Authenticated workspace</span><span className="local-pill">CLOUD</span></div>
      </aside>
      <div className="main-column">
        <header className="topbar"><button className="icon-button mobile-menu" onClick={() => setOpen(true)} aria-label="Open navigation"><Menu size={20} /></button><div className="breadcrumb"><span>NO VERA</span><span className="breadcrumb-slash">/</span><span>AGENCY OS</span></div><div className="topbar-right"><span className="topbar-caption"><Command size={14} /> {user?.email ?? 'Command-led operations'}</span><div className="avatar">{user?.email?.slice(0, 2).toUpperCase() ?? 'ND'}</div></div></header>
        <main className="main-content"><CommandCenter />{dataError && <div className="inline-error" role="alert">{dataError}</div>}<Outlet /></main>
      </div>
    </div>
  );
}