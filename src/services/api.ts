import { missingSupabaseVariables } from '../lib/config';

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  void path;
  void init;
  void (null as T | null);
  throw new Error(missingSupabaseVariables.length
    ? `Supabase is not configured. Set ${missingSupabaseVariables.join(' and ')} in .env.local.`
    : 'This legacy API adapter has been replaced by Supabase Auth and Edge Functions.');
}