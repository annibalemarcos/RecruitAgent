import OpenAI from 'openai';

let defaultOpenAiClient: OpenAI | null = null;

export function getOpenAIClient(customApiKey?: string): OpenAI {
  const apiKey = customApiKey || process.env.OPENAI_API_KEY || '';
  if (customApiKey) {
    return new OpenAI({ apiKey: customApiKey });
  }
  if (!defaultOpenAiClient) {
    defaultOpenAiClient = new OpenAI({ apiKey });
  }
  return defaultOpenAiClient;
}

export async function callOpenAIJson(
  systemInstruction: string,
  userPrompt: string,
  model: string = 'gpt-4o-mini',
  customApiKey?: string
): Promise<any> {
  const apiKey = customApiKey || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY não foi configurada nas variáveis de ambiente ou nas configurações.');
  }

  const client = getOpenAIClient(apiKey);
  const completion = await client.chat.completions.create({
    model: model || 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemInstruction },
      { role: 'user', content: userPrompt },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.3,
  });

  const rawContent = completion.choices[0]?.message?.content || '{}';
  return JSON.parse(rawContent);
}
