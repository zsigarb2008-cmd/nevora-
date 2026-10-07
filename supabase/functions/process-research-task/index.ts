import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { requestStructuredOutput } from '../_shared/aiProvider.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const researchInstruction = `You are Novera Research AI. You have no web-browsing or external-source tool. Use only the supplied task and client context. Never invent client facts, source names, URLs, market statistics, or search metrics, and do not claim that you independently verified external facts. Label inferences as assumptions. Return only a JSON object with these keys: executive_summary (string), business_facts_and_sources (array of objects with fact, source_url, and verification_note), audience_analysis (array), opportunities (array), limitations (array). When supplied context contains no sources, return an empty business_facts_and_sources array and state that external facts were not independently verified.`;

function response(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function parseResearchReport(content: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(content);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Research AI output must be a JSON object.');
  }
  const report = parsed as Record<string, unknown>;
  const arrayFields = ['business_facts_and_sources', 'audience_analysis', 'opportunities', 'limitations'];
  if (typeof report.executive_summary !== 'string' || arrayFields.some((field) => !Array.isArray(report[field]))) {
    throw new Error('Research AI output did not match the required structured report schema.');
  }
  const facts = report.business_facts_and_sources as unknown[];
  if (facts.some((fact) => !fact || typeof fact !== 'object'
    || typeof (fact as Record<string, unknown>).fact !== 'string'
    || typeof (fact as Record<string, unknown>).source_url !== 'string'
    || typeof (fact as Record<string, unknown>).verification_note !== 'string')) {
    throw new Error('Research AI business facts must include fact, source_url, and verification_note fields.');
  }
  return report;
}

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return response(405, { error: 'POST is required.' });

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!supabaseUrl || !anonKey) return response(500, { error: 'Supabase Edge Function environment is incomplete.' });
  const authorization = request.headers.get('Authorization');
  if (!authorization) return response(401, { error: 'Authentication is required.' });

  const token = authorization.replace(/^Bearer\s+/i, '');
  const client = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authError } = await client.auth.getUser(token);
  if (authError || !authData.user) return response(401, { error: 'The Supabase session is invalid or expired.' });

  let taskId: string;
  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== 'object' || !('taskId' in body) || typeof body.taskId !== 'string') {
      return response(400, { error: 'taskId is required.' });
    }
    taskId = body.taskId;
  } catch {
    return response(400, { error: 'A valid JSON request body is required.' });
  }

  const { data: task, error: taskError } = await client
    .from('tasks')
    .select('id, workspace_id, workflow_id, client_id, project_id, employee_key, title, description, input, status')
    .eq('id', taskId)
    .maybeSingle();
  if (taskError) return response(400, { error: taskError.message });
  if (!task) return response(404, { error: 'Task not found in the authenticated workspace.' });
  if (task.employee_key !== 'research') return response(400, { error: 'Only Research AI tasks can use this function.' });
  if (!['queued', 'waiting_for_configuration'].includes(task.status)) {
    return response(409, { error: `Research task cannot run from status ${task.status}.` });
  }

  const providerKey = Deno.env.get('OPENAI_API_KEY');
  if (!providerKey) {
    const { error } = await client.rpc('set_research_task_waiting_configuration', { p_task_id: task.id });
    if (error) return response(500, { error: error.message });
    return response(200, { taskId: task.id, status: 'waiting_for_configuration', message: 'AI provider is not configured.' });
  }

  const { error: startError } = await client.rpc('start_research_task', { p_task_id: task.id });
  if (startError) return response(409, { error: startError.message });

  try {
    let clientContext: Record<string, unknown> | null = null;
    if (task.client_id) {
      const { data, error } = await client.from('clients')
        .select('name, company, website, industry, country, language, notes')
        .eq('id', task.client_id)
        .maybeSingle();
      if (error) throw new Error(`Could not load Research client context: ${error.message}`);
      clientContext = data;
    }

    const userContent = JSON.stringify({
      task: { title: task.title, description: task.description, input: task.input },
      client: clientContext,
      instruction: 'Return the requested structured research report. Do not infer missing business facts.',
    });
    const aiResponse = await requestStructuredOutput({ systemInstruction: researchInstruction, userContent });
    let report: Record<string, unknown>;
    try {
      report = parseResearchReport(aiResponse.content);
    } catch (error) {
      throw new Error(`Research AI output was not valid structured JSON: ${error instanceof Error ? error.message : 'invalid JSON'}`);
    }

    const { data: employee, error: employeeError } = await client.from('ai_employees').select('id')
      .eq('workspace_id', task.workspace_id).eq('employee_key', 'research').maybeSingle();
    if (employeeError) throw new Error(`Could not load Research AI definition: ${employeeError.message}`);
    if (!employee) throw new Error('Research AI is not provisioned in this workspace.');
    const { error: messageError } = await client.from('ai_messages').insert([
      { workspace_id: task.workspace_id, task_id: task.id, employee_id: employee.id, role: 'system', content: researchInstruction, provider: aiResponse.provider, model: aiResponse.model },
      { workspace_id: task.workspace_id, task_id: task.id, employee_id: employee.id, role: 'user', content: userContent, provider: aiResponse.provider, model: aiResponse.model },
      { workspace_id: task.workspace_id, task_id: task.id, employee_id: employee.id, role: 'assistant', content: report, provider: aiResponse.provider, model: aiResponse.model },
    ]);
    if (messageError) throw new Error(`Could not record AI messages: ${messageError.message}`);

    const { error: completeError } = await client.rpc('complete_research_task', {
      p_task_id: task.id,
      p_output: report,
      p_provider: aiResponse.provider,
      p_model: aiResponse.model,
    });
    if (completeError) throw new Error(`Could not persist Research AI output: ${completeError.message}`);

    return response(200, { taskId: task.id, status: 'completed', output: report });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Research AI worker failed.';
    const { error: failureError } = await client.rpc('fail_task', {
      p_task_id: task.id,
      p_error: message,
      p_output: null,
    });
    if (failureError) console.error('Could not persist Research task failure:', failureError.message);
    console.error('Research AI worker failed:', message);
    return response(502, {
      taskId: task.id,
      status: failureError ? 'failure_persistence_error' : 'failed',
      error: failureError ? `${message}; task failure could not be persisted: ${failureError.message}` : message,
    });
  }
});
