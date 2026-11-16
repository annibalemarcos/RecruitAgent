import type { JobSettings } from '../src/types/index.js';

export type CompatibleAiProvider = 'deepseek' | 'groq';
const defaults = {
  deepseek: { env: 'DEEPSEEK_API_KEY', field: 'deepseekApiKey', modelEnv: 'DEEPSEEK_MODEL', modelField: 'deepseekModel', model: 'deepseek-flash', url: 'https://api.deepseek.com/chat/completions' },
  groq: { env: 'GROQ_API_KEY', field: 'groqApiKey', modelEnv: 'GROQ_MODEL', modelField: 'groqModel', model: 'llama-3.3-70b-versatile', url: 'https://api.groq.com/openai/v1/chat/completions' },
} as const;

export function resolveCompatibleAi(provider: CompatibleAiProvider, settings?: Partial<JobSettings>) {
  const config = defaults[provider];
  const supplied = settings?.[config.field];
  const envKey = process.env[config.env];
  const key = (typeof supplied === 'string' && supplied.trim() && !/^YOUR_|^SUA_CHAVE/i.test(supplied.trim()) ? supplied.trim() : '') ||
    (envKey && !/^YOUR_|^SUA_CHAVE/i.test(envKey.trim()) ? envKey.trim() : '');
  const model = settings?.[config.modelField]?.trim() || process.env[config.modelEnv] || config.model;
  return { key, model, source: supplied?.trim() && key === supplied.trim() ? 'interface' : key ? `.env (${config.env})` : 'não configurada', url: config.url };
}

export function compatibleAiStatus() {
  return Object.fromEntries((['deepseek', 'groq'] as const).map((provider) => {
    const { key, model, source } = resolveCompatibleAi(provider);
    return [provider, { configured: Boolean(key), model, source }];
  }));
}

export async function callCompatibleAiJson(provider: CompatibleAiProvider, system: string, prompt: string, model: string, apiKey: string, timeoutMs = 20000) {
  if (!apiKey) throw new Error(`${provider}: chave não configurada`);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(1000, Math.min(60000, timeoutMs)));
  try {
    const config = defaults[provider];
    const response = await fetch(config.url, { method: 'POST', signal: controller.signal,
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ model, messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }],
        response_format: { type: 'json_object' }, temperature: 0.2, max_tokens: 4096 }) });
    if (!response.ok) throw new Error(`${provider}: HTTP ${response.status}`);
    const data: any = await response.json();
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== 'string') throw new Error(`${provider}: resposta sem conteúdo`);
    try { return JSON.parse(content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()); }
    catch { throw new Error(`${provider}: resposta JSON inválida`); }
  } catch (error) {
    if (controller.signal.aborted) throw new Error(`${provider}: tempo limite excedido`);
    throw error;
  } finally { clearTimeout(timer); }
}

export async function testCompatibleAi(provider: CompatibleAiProvider, apiKey?: string, model?: string) {
  const resolved = resolveCompatibleAi(provider, { [`${provider}ApiKey`]: apiKey, [`${provider}Model`]: model } as Partial<JobSettings>);
  if (!resolved.key) return { success: false, provider, error: 'Configure uma chave válida nas Configurações ou no .env.' };
  const started = Date.now();
  try {
    const result = await callCompatibleAiJson(provider, 'Responda somente JSON.', 'Retorne {"ok":true}.', model || resolved.model, resolved.key, 15000);
    if (result?.ok !== true) throw new Error('Resposta de teste inesperada.');
    return { success: true, provider, model: model || resolved.model, latencyMs: Date.now() - started, message: 'Chamada real concluída.' };
  } catch (error) {
    return { success: false, provider, latencyMs: Date.now() - started, error: error instanceof Error ? error.message : 'Falha ao testar conexão.' };
  }
}
