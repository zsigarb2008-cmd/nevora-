import { useState, type FormEvent } from 'react';
import { AlertTriangle, ArrowUpRight, LogOut } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { isSupabaseConfigured, missingSupabaseVariables } from '../lib/config';
import { EmptyState, PageHeader, Panel, StatusBadge } from '../components/UI';
import { useAgency } from '../hooks/useAgency';
import { useAuth } from '../hooks/useAuth';

export function ActivityPage() {
  const { state } = useAgency();
  return <>
    <PageHeader eyebrow="AUDIT TRAIL / 08" title="Activity" description="A timestamped record of task, workflow, handoff, and approval events." />
    <Panel title="Event log" detail={`${state.activity.length} recorded events`}>
      {state.activity.length === 0 ? <EmptyState /> : <div className="event-log">{state.activity.map((event) => <article className="event-row" key={event.id}><div className="event-marker" /><div className="event-content"><div className="event-title"><strong>{event.message}</strong><StatusBadge status={event.type} /></div><div className="event-meta"><time>{new Date(event.createdAt).toLocaleString()}</time>{event.entityId && <code>{event.entityId}</code>}</div></div></article>)}</div>}
    </Panel>
  </>;
}

export function SettingsPage() {
  const { state, dataError } = useAgency();
  const { user, signOut } = useAuth();
  const apiConfigured = isSupabaseConfigured;
  const [error, setError] = useState('');
  return <>
    <PageHeader eyebrow="WORKSPACE / 09" title="Settings" description="Authenticated Supabase workspace and server-side worker connections." />
    <div className="settings-grid">
      <Panel title="AI and API connection" detail="AI providers and credentials belong on the server, never in this browser.">
        <div className="setting-row"><div><strong>Supabase project</strong><span>{apiConfigured ? 'Public Supabase URL and anon key are configured.' : `Missing ${missingSupabaseVariables.join(' and ')}.`}</span></div><StatusBadge status={apiConfigured ? 'CONFIGURED' : 'OFFLINE'} /></div>
        <div className="setting-row"><div><strong>Research AI worker</strong><span>Runs only through the authenticated Supabase Edge Function.</span></div><StatusBadge status={state.tasks.some((task) => task.status === 'WAITING_FOR_CONFIGURATION') ? 'CONFIGURATION_REQUIRED' : 'SERVER-SIDE'} /></div>
        <div className="config-note"><AlertTriangle size={16} /><span>Configure <code>OPENAI_API_KEY</code> as a Supabase Edge Function secret. Never add it to a <code>VITE_*</code> variable.</span></div>
      </Panel>
      <Panel title="Workspace data" detail="Records shown here are loaded from the authenticated workspace database.">
        <div className="storage-counts"><div><strong>{state.clients.length}</strong><span>Clients</span></div><div><strong>{state.projects.length}</strong><span>Projects</span></div><div><strong>{state.tasks.length}</strong><span>Tasks</span></div><div><strong>{state.workflows.length}</strong><span>Workflows</span></div></div>
        {user && <p className="setting-description">Signed in as <strong>{user.email}</strong></p>}
        {error && <div className="inline-error" role="alert">{error}</div>}
        {dataError && <div className="inline-error" role="alert">{dataError}</div>}
        <button className="secondary-button" onClick={() => { void signOut().catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Could not sign out.')); }}><LogOut size={15} /> Sign out</button>
      </Panel>
    </div>
  </>;
}

export function LoginPage() {
  const { signIn, signUp, user } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [workspaceName, setWorkspaceName] = useState('');
  const [creatingAccount, setCreatingAccount] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const destination = (location.state as { from?: string } | null)?.from ?? '/dashboard';

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy(true); setError('');
    try {
      if (creatingAccount) {
        const sessionCreated = await signUp({ email, password, fullName, workspaceName });
        if (sessionCreated) navigate(destination, { replace: true });
        else setNotice('Account created. Confirm your email, then sign in. Your workspace will be created automatically.');
      } else {
        await signIn(email, password);
        navigate(destination, { replace: true });
      }
      setError('');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Sign in failed.'); }
    finally { setBusy(false); }
  };
  if (user) return <main className="login-screen"><section className="login-panel"><h1>You’re signed in.</h1><Link className="quiet-link" to="/dashboard">Continue to workspace <ArrowUpRight size={14} /></Link></section></main>;
  return <main className="login-screen"><section className="login-panel"><Link to="/dashboard" className="brand-row login-brand"><div className="brand-mark">N</div><div className="brand-copy"><strong>novera</strong><span>DIGITAL OPERATIONS</span></div></Link><p className="eyebrow">SECURE ACCESS</p><h1>{creatingAccount ? 'Create your workspace.' : 'Welcome back.'}</h1><p className="page-description">{creatingAccount ? 'Create an account and your private workspace.' : 'Sign in to your agency workspace.'}</p><form className="login-form" onSubmit={submit}>
    {creatingAccount && <><label>Full name<input autoComplete="name" required value={fullName} onChange={(event) => setFullName(event.target.value)} /></label><label>Workspace name<input required value={workspaceName} onChange={(event) => setWorkspaceName(event.target.value)} placeholder="Your agency" /></label></>}
    <label>Email<input type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} /></label><label>Password<input type="password" autoComplete={creatingAccount ? 'new-password' : 'current-password'} minLength={8} required value={password} onChange={(event) => setPassword(event.target.value)} /></label>
    {error && <div role="alert" className="inline-error">{error}</div>}{notice && <div role="status" className="inline-notice">{notice}</div>}
    <button className="primary-button login-submit" disabled={busy || !isSupabaseConfigured}>{busy ? 'Connecting…' : creatingAccount ? 'Create account' : 'Sign in'}</button>
  </form>
  {!isSupabaseConfigured && <div role="alert" className="inline-error">Supabase is not configured. Set {missingSupabaseVariables.join(' and ')} in .env.local.</div>}
  <button className="text-button" onClick={() => { setCreatingAccount((value) => !value); setError(''); setNotice(''); }}>{creatingAccount ? 'Already have an account? Sign in' : 'Create an account'}</button>
  <p className="login-footnote">Authentication and session persistence are provided by Supabase Auth. Account creation provisions a workspace and membership.</p></section></main>;
}