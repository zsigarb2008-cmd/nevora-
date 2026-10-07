import { useState } from 'react';
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { isSupabaseConfigured } from './lib/config';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { AgencyProvider } from './hooks/useAgency';
import AppLayout from './layouts/AppLayout';
import Dashboard from './pages/Dashboard';
import Employees from './pages/Employees';
import { ActivityPage, LoginPage, SettingsPage } from './pages/ActivitySettings';
import { ClientsPage, ProjectsPage, TasksPage } from './pages/Records';
import { ApprovalsPage, WorkflowsPage } from './pages/Operations';

function AuthGate() {
  const { user, workspaceId, loading, error, signOut } = useAuth();
  const location = useLocation();
  const [signoutError, setSignoutError] = useState('');
  if (!isSupabaseConfigured && import.meta.env.MODE !== 'test') return <Navigate to="/login" replace />;
  if (loading) return <main className="login-screen"><p role="status">Restoring Supabase session…</p></main>;
  if (isSupabaseConfigured && !user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (isSupabaseConfigured && user && !workspaceId) return <main className="login-screen"><section className="login-panel"><div className="inline-error" role="alert">{error || 'This account has no workspace membership.'}</div>{signoutError && <div className="inline-error" role="alert">{signoutError}</div>}<button className="secondary-button" onClick={() => { void signOut().then(() => setSignoutError('')).catch((reason: unknown) => setSignoutError(reason instanceof Error ? reason.message : 'Could not sign out.')); }}>Sign out</button></section></main>;
  return <Outlet />;
}

export default function App() {
  return <AuthProvider><AgencyProvider><Routes>
    <Route path="/login" element={<LoginPage />} />
    <Route element={<AuthGate />}>
      <Route element={<AppLayout />}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/ai-employees" element={<Employees />} />
        <Route path="/ai-employees/:employeeKey" element={<Employees />} />
        <Route path="/clients" element={<ClientsPage />} />
        <Route path="/projects" element={<ProjectsPage />} />
        <Route path="/tasks" element={<TasksPage />} />
        <Route path="/workflows" element={<WorkflowsPage />} />
        <Route path="/approvals" element={<ApprovalsPage />} />
        <Route path="/activity" element={<ActivityPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
    </Route>
    <Route path="*" element={<Navigate to="/dashboard" replace />} />
  </Routes></AgencyProvider></AuthProvider>;
}