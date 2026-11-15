import dotenv from 'dotenv';
dotenv.config();

/**
 * Calls Perplexity AI Chat Completions API (OpenAI-compatible REST protocol).
 * Supports standard models:
 * - 'sonar': fast, online live search enabled model (default)
 * - 'sonar-pro': enhanced reasoning and deep search
 * - 'sonar-reasoning': reasoning model
 */
export async function callPerplexityJson(
  systemInstruction: string,
  userPrompt: string,
  model: string = 'sonar',
  customApiKey?: string
): Promise<any> {
  const apiKey = customApiKey || process.env.PERPLEXITY_API_KEY;
  if (!apiKey) {
    throw new Error('PERPLEXITY_API_KEY não foi configurada nas variáveis de ambiente ou nas configurações.');
  }

  const response = await fetch('https://api.perplexity.ai/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'User-Agent': 'aistudio-recruitagent',
    },
    body: JSON.stringify({
      model: model || 'sonar',
      messages: [
        {
          role: 'system',
          content: `${systemInstruction}\n\nIMPORTANTE: Responda EXCLUSIVAMENTE com o objeto JSON estruturado válido, sem qualquer texto introdutório, sem markdown ou explicações fora do JSON.`,
        },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.2,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Perplexity API HTTP ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  const rawContent = data.choices?.[0]?.message?.content || '{}';

  // Strip Markdown fences if present (e.g. ```json ... ```)
  const cleanJson = rawContent
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  try {
    return JSON.parse(cleanJson);
  } catch {
    // If wrapped in commentary, search for the outer JSON braces
    const firstBrace = cleanJson.indexOf('{');
    const lastBrace = cleanJson.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      return JSON.parse(cleanJson.slice(firstBrace, lastBrace + 1));
    }
    throw new Error('Falha ao decodificar JSON retornado pela Perplexity.');
  }
}
