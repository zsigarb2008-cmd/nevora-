import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { missingSupabaseVariables } from '../lib/config';
import { supabase } from '../services/supabase';

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  workspaceId: string | null;
  loading: boolean;
  error: string;
  signUp: (values: { email: string; password: string; fullName: string; workspaceName: string }) => Promise<boolean>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(supabase));
  const [error, setError] = useState('');

  useEffect(() => {
    const client = supabase;
    if (!client) return;
    let active = true;

    const applySession = async (nextSession: Session | null) => {
      if (!active) return;
      setSession(nextSession);
      if (!nextSession) {
        setWorkspaceId(null);
        setLoading(false);
        return;
      }
      setLoading(true);
      const { data, error: membershipError } = await client
        .from('workspace_members')
        .select('workspace_id')
        .eq('user_id', nextSession.user.id)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();
      if (!active) return;
      setWorkspaceId(data?.workspace_id ?? null);
      setError(membershipError?.message ?? (!data ? 'This account has no workspace membership.' : ''));
      setLoading(false);
    };

    void client.auth.getSession().then(({ data, error: sessionError }) => {
      if (sessionError) setError(sessionError.message);
      return applySession(data.session);
    }).catch((reason: unknown) => {
      if (active) {
        setError(reason instanceof Error ? reason.message : 'Unable to restore your Supabase session.');
        setLoading(false);
      }
    });

    const { data: { subscription } } = client.auth.onAuthStateChange((_event, nextSession) => {
      setTimeout(() => { void applySession(nextSession); }, 0);
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const signUp: AuthContextValue['signUp'] = async ({ email, password, fullName, workspaceName }) => {
    if (!supabase) throw new Error(`Supabase is not configured. Set ${missingSupabaseVariables.join(' and ')} in .env.local.`);
    setLoading(true);
    setError('');
    try {
      const { data, error: signupError } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName, workspace_name: workspaceName } },
      });
      if (signupError) throw signupError;
      if (data.session) {
        if (!data.user) throw new Error('Supabase returned a session without its user record.');
        setSession(data.session);
        const { data: membership, error: membershipError } = await supabase.from('workspace_members')
          .select('workspace_id').eq('user_id', data.user.id).order('created_at', { ascending: true }).limit(1).maybeSingle();
        if (membershipError) throw membershipError;
        setWorkspaceId(membership?.workspace_id ?? null);
        if (!membership) setError('Account created, but the workspace membership was not provisioned.');
      }
      return Boolean(data.session);
    } finally {
      setLoading(false);
    }
  };

  const signIn: AuthContextValue['signIn'] = async (email, password) => {
    if (!supabase) throw new Error(`Supabase is not configured. Set ${missingSupabaseVariables.join(' and ')} in .env.local.`);
    setLoading(true);
    setError('');
    try {
      const { data, error: signinError } = await supabase.auth.signInWithPassword({ email, password });
      if (signinError) throw signinError;
      setSession(data.session);
      const { data: membership, error: membershipError } = await supabase.from('workspace_members')
        .select('workspace_id').eq('user_id', data.user.id).order('created_at', { ascending: true }).limit(1).maybeSingle();
      if (membershipError) throw membershipError;
      setWorkspaceId(membership?.workspace_id ?? null);
      setError(membership ? '' : 'This account has no workspace membership.');
    } finally {
      setLoading(false);
    }
  };

  const signOut: AuthContextValue['signOut'] = async () => {
    if (!supabase) return;
    const { error: signoutError } = await supabase.auth.signOut();
    if (signoutError) throw signoutError;
  };

  return <AuthContext.Provider value={{ session, user: session?.user ?? null, workspaceId, loading, error, signUp, signIn, signOut }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider.');
  return context;
}
