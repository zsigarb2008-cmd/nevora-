// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(resolve(process.cwd(), 'supabase/migrations/20261007000000_initial_workspace.sql'), 'utf8');
const authProvider = readFileSync(resolve(process.cwd(), 'src/hooks/useAuth.tsx'), 'utf8');
const agencyProvider = readFileSync(resolve(process.cwd(), 'src/hooks/useAgency.tsx'), 'utf8');
const supabaseClient = readFileSync(resolve(process.cwd(), 'src/services/supabase.ts'), 'utf8');
const workspaceRepository = readFileSync(resolve(process.cwd(), 'src/services/workspaceRepository.ts'), 'utf8');
const researchWorker = readFileSync(resolve(process.cwd(), 'supabase/functions/process-research-task/index.ts'), 'utf8');
const aiProvider = readFileSync(resolve(process.cwd(), 'supabase/functions/_shared/aiProvider.ts'), 'utf8');
const publicConfig = readFileSync(resolve(process.cwd(), 'src/lib/config.ts'), 'utf8');

describe('Supabase backend contract', () => {
  it('defines every requested UUID-backed workspace table with RLS enabled', () => {
    const tables = [
      'workspaces', 'workspace_members', 'clients', 'projects', 'tasks', 'ai_employees', 'ai_messages',
      'ai_handoffs', 'workflows', 'workflow_steps', 'approvals', 'activity_logs', 'research_reports',
    ];
    for (const table of tables) {
      expect(migration).toMatch(new RegExp(`create table public\\.${table} \\([\\s\\S]*?id uuid primary key default gen_random_uuid\\(\\)`, 'i'));
      expect(migration).toMatch(new RegExp(`alter table public\\.${table} enable row level security`, 'i'));
    }
    expect(migration).toMatch(/foreign key \(client_id, workspace_id\) references public\.clients\(id, workspace_id\)/i);
    expect(migration).toMatch(/create index tasks_workspace_status_idx/i);
  });

  it('bootstraps membership on authentication and scopes authenticated access to workspace members', () => {
    expect(migration).toMatch(/create trigger auth_user_create_workspace[\s\S]*?after insert on auth\.users/i);
    expect(migration).toMatch(/insert into public\.workspace_members\(workspace_id, user_id, role\)/i);
    expect(migration).toMatch(/create or replace function public\.is_workspace_member[\s\S]*?user_id = auth\.uid\(\)/i);
    expect(migration).toMatch(/for all to authenticated using \(public\.is_workspace_member\(workspace_id\)\)/i);
    expect(migration).not.toMatch(/for all to anon/i);
    for (const table of ['clients', 'projects', 'tasks', 'research_reports']) {
      expect(migration).toMatch(new RegExp(`create policy "[^"]+" on public\\.${table}[\\s\\S]*?public\\.is_workspace_member\\(workspace_id\\)`, 'i'));
    }
  });

  it('wires persistent Supabase authentication and database-backed workspace state', () => {
    expect(authProvider).toMatch(/signUpWithPassword|auth\.signUp/);
    expect(authProvider).toMatch(/signInWithPassword/);
    expect(authProvider).toMatch(/auth\.signOut/);
    expect(authProvider).toMatch(/onAuthStateChange/);
    expect(supabaseClient).toMatch(/persistSession:\s*true/);
    expect(supabaseClient).toMatch(/autoRefreshToken:\s*true/);
    expect(agencyProvider).toMatch(/loadWorkspaceState/);
    expect(workspaceRepository).toMatch(/rpc\('queue_task'/);
    expect(agencyProvider).toMatch(/functions\.invoke\('process-research-task'/);
    expect(agencyProvider).not.toMatch(/readAgencyState|writeAgencyState/);
  });

  it('keeps AI credentials server-side and returns no synthetic worker result', () => {
    expect(aiProvider).toMatch(/Deno\.env\.get\('OPENAI_API_KEY'\)/);
    expect(aiProvider).toMatch(/Deno\.env\.get\('AI_PROVIDER'\)/);
    expect(aiProvider).toMatch(/Deno\.env\.get\('OPENAI_MODEL'\)/);
    expect(researchWorker).toMatch(/requestStructuredOutput/);
    expect(researchWorker).toMatch(/Deno\.env\.get\('SUPABASE_URL'\)/);
    expect(researchWorker).toMatch(/Deno\.env\.get\('SUPABASE_ANON_KEY'\)/);
    expect(researchWorker).toMatch(/'failed'/);
    expect(researchWorker).toMatch(/'failure_persistence_error'/);
    expect(researchWorker).toMatch(/AI provider is not configured\./);
    expect(researchWorker).toMatch(/complete_research_task/);
    expect(researchWorker).toMatch(/Research task cannot run from status/);
    expect(migration).toMatch(/task_row\.status = 'waiting_for_configuration'[\s\S]*?then\s+return;/i);
    expect(publicConfig).not.toMatch(/OPENAI_API_KEY|service.role/i);
  });

  it('stores returned task UUIDs, handoff outputs, dependency gates, approvals, and bounded QA retries', () => {
    expect(migration).toMatch(/create or replace function public\.queue_task\([\s\S]*?returns public\.tasks/i);
    expect(migration).toMatch(/create or replace function public\.queue_workflow\([\s\S]*?insert into public\.workflow_steps/i);
    expect(migration).toMatch(/create table public\.ai_handoffs[\s\S]*?worker_output jsonb/i);
    expect(migration).toMatch(/create or replace function public\.complete_research_task[\s\S]*?worker_output = p_output/i);
    expect(migration).toMatch(/insert into public\.research_reports[\s\S]*?p_output/i);
    expect(migration).toMatch(/insert into public\.activity_logs[\s\S]*?'task_completed'/i);
    expect(migration).toMatch(/create or replace function public\.is_task_dependency_satisfied[\s\S]*?dependency\.status = 'completed'[\s\S]*?dependency\.output is not null/i);
    expect(migration).toMatch(/create or replace function public\.complete_task[\s\S]*?insert into public\.approvals/i);
    expect(migration).toMatch(/create or replace function public\.retry_task[\s\S]*?retry limit reached \(2\)/i);
    expect(migration).toMatch(/task_row\.retry_count < 2/i);
    expect(migration).toMatch(/set status = 'waiting_for_configuration', error = 'AI provider is not configured\.'/i);
  });
});
