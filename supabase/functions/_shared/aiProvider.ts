export interface StructuredAiRequest {
  systemInstruction: string;
  userContent: string;
}

export interface StructuredAiResponse {
  provider: 'openai';
  model: string;
  content: string;
}

export async function requestStructuredOutput(request: StructuredAiRequest): Promise<StructuredAiResponse> {
  const provider = Deno.env.get('AI_PROVIDER') ?? 'openai';
  if (provider !== 'openai') throw new Error(`Unsupported AI_PROVIDER "${provider}".`);

  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) throw new Error('AI provider is not configured.');
  const model = Deno.env.get('OPENAI_MODEL') ?? 'gpt-4o-mini';
  const providerResponse = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: request.systemInstruction },
        { role: 'user', content: request.userContent },
      ],
    }),
  });
  if (!providerResponse.ok) {
    const detail = await providerResponse.text();
    throw new Error(`AI provider returned HTTP ${providerResponse.status}: ${detail.slice(0, 1200)}`);
  }
  const result: unknown = await providerResponse.json();
  if (!result || typeof result !== 'object' || !('choices' in result) || !Array.isArray(result.choices)) {
    throw new Error('AI provider returned an unexpected response shape.');
  }
  const content = result.choices[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) throw new Error('AI provider returned no output.');
  return { provider, model, content };
}
