# Novera Digital

Novera Digital is a React and TypeScript agency workspace backed by Supabase PostgreSQL, Supabase Auth, and Supabase Edge Functions. Workspace records are read and written with the signed-in user's Supabase session and are protected by database Row Level Security.

## Setup

1. **Create a Supabase project.** In [Supabase Dashboard](https://supabase.com/dashboard), choose **New project**, select an organization, provide a project name, database password, and region, then wait for the project to finish provisioning. Retain the database password securely; it is not an application environment variable.
2. **Obtain the Supabase project URL.** In the project dashboard, open **Project Settings → API** (or **Project Settings → API Keys**, depending on the dashboard view). Copy the **Project URL**. The project reference is the leading project ID in that URL, e.g. `https://PROJECT_REF.supabase.co`.
3. **Obtain the public key required by this app.** On the same settings page, copy the **publishable** key or legacy **anon/public** key. This application currently reads it from the exact variable `VITE_SUPABASE_ANON_KEY`; paste either supported public key format there. Never use the `service_role` or secret API key in the browser.
4. **Install/use the Supabase CLI and link this project.** From the repository root, authenticate the CLI and link the project:

   ```sh
   npx supabase@latest login
   npx supabase@latest link --project-ref PROJECT_REF
   ```

   Replace `PROJECT_REF` with the project reference from step 2. When asked, provide the database password through the CLI prompt; do not put it in a command or commit it.
5. **Apply the database migration.** This is for a fresh project with no conflicting Novera tables. Preview then apply:

   ```sh
   npx supabase@latest db push --dry-run
   npx supabase@latest db push
   ```

   Verify that `20261007000000_initial_workspace.sql` is applied in the CLI output and that the listed tables appear in **Database → Tables**. The migration creates all Novera tables, signup provisioning, indexes, constraints, functions, and RLS policies.
6. **Configure Supabase Authentication.** In **Authentication → Providers → Email**, enable Email/password sign-in. In **Authentication → URL Configuration**, set **Site URL** to `http://localhost:5173` for local development and add `http://localhost:5173/**` to **Redirect URLs**. Add the deployed application URL and its callback/redirect URL before production use. If **Confirm email** is enabled, use the confirmation link sent to the signup address before attempting password login.
7. **Configure the public frontend variables.** In the repository root, run:

   ```sh
   cp .env.example .env.local
   ```

   Edit `.env.local` and replace the placeholders with the copied values:

   ```dotenv
   VITE_SUPABASE_URL=https://PROJECT_REF.supabase.co
   VITE_SUPABASE_ANON_KEY=YOUR_PUBLIC_ANON_OR_PUBLISHABLE_KEY
   ```

   Both values are public configuration. `.env.local` is ignored by Git. Do not add `OPENAI_API_KEY` or any service-role/secret key to this file.
8. **Deploy the Research Edge Function.** From the repository root:

   ```sh
   npx supabase@latest functions deploy process-research-task --project-ref PROJECT_REF
   ```

   JWT verification is enabled in `supabase/config.toml`. The function uses the caller's Supabase JWT plus the public anon key, so database access remains protected by RLS.
9. **Set the OpenAI secret server-side.** In Supabase Dashboard, open **Edge Functions → Secrets** (or **Project Settings → Edge Functions → Secrets**), create `OPENAI_API_KEY`, and paste the OpenAI API key as its value. Optionally create `OPENAI_MODEL` (default `gpt-4o-mini`) and `AI_PROVIDER` (default `openai`). Do not add these to Vite variables or source control. The worker has no web-browsing tool; it must report that external facts were not independently verified rather than fabricate citations.
10. **Install dependencies and run Novera locally.**

    ```sh
    npm install
    npm run dev
    ```

    Open the local URL printed by Vite (normally `http://localhost:5173`).
11. **Create the first account.** On `/login`, select **Create an account**, enter full name, workspace name, email, and a password with at least eight characters. If email confirmation is enabled, confirm the email, then sign in. The `auth_user_create_workspace` trigger inserts the workspace, owner membership, and seven employee records. If the workspace lookup fails, stop and inspect the migration/trigger rather than creating rows manually.
12. **Verify workspace provisioning.** In the signed-in app, open **Settings** and confirm records are loaded for the authenticated workspace. To audit the user/workspace/membership relationship in the Supabase SQL Editor, run:

    ```sql
    select u.email, w.id as workspace_id, w.name, m.role
    from auth.users u
    join public.workspace_members m on m.user_id = u.id
    join public.workspaces w on w.id = m.workspace_id
    where u.email = 'YOUR_SIGNUP_EMAIL';
    ```

13. **Create and verify a client.** Open **Clients → Add client**, enter a contact name and company, and save. Refresh the page; the client should still appear. In SQL Editor, verify that it exists in `public.clients` and has the workspace ID from step 12:

    ```sql
    select id, workspace_id, name, company, created_at
    from public.clients
    where company = 'YOUR_TEST_COMPANY';
    ```

14. **Create a Research task.** In the Command Center, enter a request that routes to Research (e.g. `Research this client's business`) and select the client under **Client context**. Submit it. Novera stores the task in `public.tasks` first, then calls `process-research-task` with its database UUID.
15. **Run/verify Research AI.** With `OPENAI_API_KEY` set as in step 9, the Edge Function sends the task and selected client details to the provider. Wait for the task to leave `RUNNING`; open **Tasks**, expand the task, and inspect **Recorded output**. The generated structured result is also stored in `public.research_reports` and the assistant message in `public.ai_messages`. Query by the task UUID shown in the task details:

    ```sql
    select t.id, t.status, t.output, r.provider, r.model, r.report, r.created_at
    from public.tasks t
    left join public.research_reports r on r.task_id = t.id
    where t.id = 'YOUR_TASK_UUID';
    ```

16. **Verify the handoff and activity log.** Research completion creates a Sales handoff/task with actual worker output (or updates a workflow's existing next-stage handoff); downstream work must not start until the dependency has completed with output. Check:

    ```sql
    select id, from_employee, to_employee, task_id, workflow_id, status, worker_output, input
    from public.ai_handoffs
    where from_task_id = 'YOUR_TASK_UUID';

    select type, message, entity_id, created_at
    from public.activity_logs
    where entity_id = 'YOUR_TASK_UUID'
       or message like 'Research AI output handed to Sales AI%'
    order by created_at;
    ```

    For a standard research command, expect a Research → Sales handoff with `status = 'ready'` and non-null `worker_output`, plus task-started/completed activity records. For a workflow, the dashboard workflow view shows the ordered handoffs and their output state.

17. **Verify repeat execution does not corrupt a completed task.** With the Research task UUID from step 14 and its signed-in user's access token, repeat the authenticated Edge Function request:

    ```sh
    export SUPABASE_ANON_KEY='YOUR_PUBLIC_ANON_OR_PUBLISHABLE_KEY'
    read -rsp 'Signed-in user access token: ' USER_ACCESS_TOKEN; export USER_ACCESS_TOKEN; echo
    curl --include --request POST \
      "https://PROJECT_REF.supabase.co/functions/v1/process-research-task" \
      --header "apikey: $SUPABASE_ANON_KEY" \
      --header "Authorization: Bearer $USER_ACCESS_TOKEN" \
      --header "Content-Type: application/json" \
      --data '{"taskId":"YOUR_TASK_UUID"}'
    unset USER_ACCESS_TOKEN SUPABASE_ANON_KEY
    ```

    A completed task should return HTTP `409` and remain completed; its report and handoff should not be duplicated.
18. **Verify the missing-secret state (optional but recommended).** Temporarily remove `OPENAI_API_KEY` from Edge Function secrets, create a fresh Research task, and verify the task status is `waiting_for_configuration` and its error says **“AI provider is not configured.”** Re-add the secret, use **Retry task**, then verify that the real report and handoff are recorded. Repeated missing-secret invocation remains in the same configuration state. The worker does not create fallback/mock output.

## Environment variables

### Public environment variables

These are included in the frontend bundle by Vite and are not secrets:

| Variable | Purpose |
| --- | --- |
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Public anon/publishable key; database RLS must remain enabled |

### Secret environment variables

These are configured only in Supabase Edge Function/server environments and must not be exposed to the browser:

| Variable | Purpose |
| --- | --- |
| `OPENAI_API_KEY` | AI provider credential used by the Research Edge Function |
| `AI_PROVIDER` | Optional provider selector; currently supports `openai` |
| `OPENAI_MODEL` | Optional server-side model selection |
| Supabase service-role key | Supabase-managed server-only administrative credential; **not used by this frontend or Research Function** |

Never prefix a secret with `VITE_`. Do not commit real credentials.

## Backend behavior and boundaries

- User and workspace data is persisted in Supabase; browser local storage is not used as the primary database.
- `workspace_members` membership policies isolate rows by workspace. Do not disable RLS or add public read/write policies.
- Research AI uses the authenticated user's JWT and public anon key in the Edge Function, so database access remains subject to the same RLS policies. Provider calls and credentials remain server-side.
- A task starts only after its dependency is completed with recorded output. Handoffs store the actual worker output. Research reports retain structured provider responses and model metadata.
- Automatic QA → Website → QA revisions are capped at two attempts. Approval is created only after recorded QA output reaches the human-approval step.
- If an Edge Function or provider is unavailable, errors remain visible and tasks are not marked completed with invented output.
- The current full workflow describes all employee roles, but only Research AI has a connected worker. Other tasks remain queued until their server-side employees are implemented.

## Validation

Run the frontend/unit suite and production build:

```sh
npm test -- --run
npm run build
npm audit
```

The repository tests cover the Orchestrator and validate the migration's schema, RLS, and worker contracts. Live authentication and database integration require a configured Supabase project and are not simulated by unit tests.

### Workspace isolation check

1. Create a second test account in a private browser window so it receives a separate workspace; create a unique client, project, task, and Research report in each workspace.
2. Sign in as each account in turn. **Clients**, **Projects**, and **Tasks** must show only that account's records. The report generated for each test task should appear in its task output and workspace-filtered report query.
3. For a direct API RLS check, copy each account's short-lived `access_token` from that account's Supabase session in the browser developer tools. Do not share or commit these tokens. Use account A's token and account B's known workspace UUID:

   ```sh
   export SUPABASE_URL='https://PROJECT_REF.supabase.co'
   export SUPABASE_ANON_KEY='YOUR_PUBLIC_ANON_OR_PUBLISHABLE_KEY'
   read -rsp 'Account A access token: ' USER_A_ACCESS_TOKEN; export USER_A_ACCESS_TOKEN; echo
   export WORKSPACE_B_ID='WORKSPACE_B_UUID'

   for table in clients projects tasks research_reports; do
     curl --fail-with-body --silent --show-error \
       "$SUPABASE_URL/rest/v1/$table?select=id,workspace_id&workspace_id=eq.$WORKSPACE_B_ID" \
       --header "apikey: $SUPABASE_ANON_KEY" \
       --header "Authorization: Bearer $USER_A_ACCESS_TOKEN"
     echo
   done
   unset USER_A_ACCESS_TOKEN SUPABASE_ANON_KEY WORKSPACE_B_ID
   ```

   Each query must return `[]`. Repeat with account B's token against workspace A. Do not use the Supabase SQL Editor for this isolation check: it runs with administrative database privileges and bypasses user-facing RLS. All workspace-scoped tables have RLS enabled and use `is_workspace_member(workspace_id)` policies.
