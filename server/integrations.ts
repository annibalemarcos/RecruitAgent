import { createHash } from 'node:crypto';
import type { JobSettings } from '../src/types/index.js';

export const INTEGRATIONS = ['brave', 'firecrawl', 'you', 'exa', 'openrouter'] as const;
export type IntegrationProvider = typeof INTEGRATIONS[number];
export type SearchProvider = 'brave' | 'you' | 'exa';
export type IntegrationLog = (level: 'info' | 'warn' | 'error' | 'success', message: string) => void;
const envNames: Record<IntegrationProvider, string> = {
  brave: 'BRAVE_SEARCH_API_KEY', firecrawl: 'FIRECRAWL_API_KEY', you: 'YOU_API_KEY',
  exa: 'EXA_API_KEY', openrouter: 'OPENROUTER_API_KEY',
};
const fields = { brave: 'braveApiKey', firecrawl: 'firecrawlApiKey', you: 'youApiKey', exa: 'exaApiKey', openrouter: 'openrouterApiKey' } as const;
export function resolveIntegration(provider: IntegrationProvider, settings?: Partial<JobSettings>) {
  const valid = (value: unknown): value is string => typeof value === 'string' && !!value.trim()
    && !/^(SUA_CHAVE|YOUR_|INSERT_|\[CREDENCIAL)/i.test(value.trim());
  const supplied = settings?.[fields[provider]];
  const fromEnv = process.env[envNames[provider]] || (provider === 'you' ? process.env.YDC_API_KEY : '') || '';
  const key = valid(supplied) ? supplied.trim() : valid(fromEnv) ? fromEnv.trim() : '';
  return { provider, key, isConfigured: !!key, source: valid(supplied) ? 'interface' : key ? `.env (${envNames[provider]})` : 'não configurada',
    model: provider === 'openrouter' ? settings?.openrouterModel?.trim() || process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini' : undefined };
}
export interface RetrievedPage { html: string; status: number; finalUrl: string; retrievalProvider?: string; verificationIncomplete?: boolean }
export interface IntegrationContext { calls: number; limit: number; pages: Map<string, RetrievedPage>; onLog?: IntegrationLog }
export function createIntegrationContext(settings?: Partial<JobSettings>, onLog?: IntegrationLog): IntegrationContext {
  const value = Number(settings?.maxExternalCallsPerCompany ?? process.env.EXTERNAL_API_MAX_CALLS_PER_COMPANY ?? 12);
  return { calls: 0, limit: Number.isFinite(value) ? Math.min(100, Math.max(0, Math.floor(value))) : 12, pages: new Map(), onLog };
}
const blocked = new Map<string, number>();
const counters: Partial<Record<IntegrationProvider, { requests: number; successes: number; failures: number }>> = {};
function credentialId(provider: IntegrationProvider, key: string) { return provider + ':' + createHash('sha256').update(key).digest('hex'); }
export function resetIntegrationCircuit(provider: IntegrationProvider) { for (const k of blocked.keys()) if (k.startsWith(provider + ':')) blocked.delete(k); }
export function integrationStatus() {
  return Object.fromEntries(INTEGRATIONS.map(provider => {
    const r = resolveIntegration(provider);
    return [provider, { configured: r.isConfigured, source: r.source, model: r.model,
      blocked: (blocked.get(credentialId(provider, r.key)) || 0) > Date.now(), usage: counters[provider] || { requests: 0, successes: 0, failures: 0 } }];
  }));
}
export function integrationDefaults() {
  const numeric = (name: string, fallback: number, min: number, max: number) => {
    const value = Number(process.env[name] ?? fallback);
    return Number.isFinite(value) ? Math.max(min, Math.min(max, Math.floor(value))) : fallback;
  };
  return { searchProvider: ['brave','you','exa'].includes(process.env.WEB_SEARCH_PROVIDER || '') ? process.env.WEB_SEARCH_PROVIDER : 'auto',
    searchMaxResults: numeric('SEARCH_MAX_RESULTS', 5, 1, 8),
    maxExternalCallsPerCompany: numeric('EXTERNAL_API_MAX_CALLS_PER_COMPANY', 12, 0, 100),
    externalApiTimeoutMs: numeric('EXTERNAL_API_TIMEOUT_MS', 20000, 1000, 60000),
    renderPagesWithoutEmail: process.env.RENDER_PAGES_WITHOUT_EMAIL !== 'false' };
}
export class IntegrationError extends Error {
  constructor(public provider: IntegrationProvider, message: string, public status?: number) { super(`${provider}: ${message}`); }
}
export async function integrationRequest(provider: IntegrationProvider, settings: Partial<JobSettings> | undefined,
  url: string, init: RequestInit, context?: IntegrationContext, signal?: AbortSignal, bypassCircuit = false): Promise<any> {
  const r = resolveIntegration(provider, settings);
  if (!r.key) throw new IntegrationError(provider, 'chave não configurada');
  const id = credentialId(provider, r.key);
  if (!bypassCircuit && (blocked.get(id) || 0) > Date.now()) throw new IntegrationError(provider, 'temporariamente suspenso; próxima API será tentada');
  if (signal?.aborted) throw signal.reason || new Error('Pesquisa cancelada');
  if (context && context.calls >= context.limit) throw new IntegrationError(provider, 'limite de chamadas externas por empresa atingido');
  if (context) context.calls++;
  const stats = counters[provider] ||= { requests: 0, successes: 0, failures: 0 }; stats.requests++;
  const duration = Number(settings?.externalApiTimeoutMs ?? process.env.EXTERNAL_API_TIMEOUT_MS ?? 20000);
  const timeout = Number.isFinite(duration) ? Math.max(1000, Math.min(60000, duration)) : 20000;
  const controller = new AbortController();
  const cancel = () => controller.abort(signal?.reason);
  signal?.addEventListener('abort', cancel, { once: true });
  const timer = setTimeout(() => controller.abort('timeout'), timeout);
  try {
    const headers = new Headers(init.headers); headers.set('Accept', 'application/json');
    if (provider === 'brave') headers.set('X-Subscription-Token', r.key);
    else if (provider === 'you' || provider === 'exa') headers.set('X-API-Key', r.key);
    else headers.set('Authorization', `Bearer ${r.key}`);
    if (init.body) headers.set('Content-Type', 'application/json');
    const response = await fetch(url, { ...init, headers, signal: controller.signal });
    if (!response.ok) throw new IntegrationError(provider, `HTTP ${response.status} (credenciais, cota ou indisponibilidade)`, response.status);
    const data = await response.json();
    if (data?.error || data?.success === false) throw new IntegrationError(provider, 'API retornou erro');
    stats.successes++; blocked.delete(id); return data;
  } catch (e) {
    stats.failures++;
    if (signal?.aborted) throw e;
    const status = e instanceof IntegrationError ? e.status : undefined;
    blocked.set(id, Date.now() + ([401, 402, 403, 429].includes(status || 0) ? 300000 : 30000));
    // Do not propagate upstream response text, prompts, headers or API keys.
    throw e instanceof IntegrationError ? e : new IntegrationError(provider, controller.signal.aborted ? 'tempo limite excedido' : 'falha de rede ou resposta JSON inválida');
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', cancel); }
}
export function searchOrder(settings?: Partial<JobSettings>): SearchProvider[] {
  if (settings?.webSearchEnabled === false) return [];
  const order: SearchProvider[] = ['brave', 'you', 'exa'];
  const preferred = settings?.searchProvider || process.env.WEB_SEARCH_PROVIDER;
  if (order.includes(preferred as SearchProvider)) order.sort((a, b) => a === preferred ? -1 : b === preferred ? 1 : 0);
  return order.filter(p => resolveIntegration(p, settings).isConfigured);
}
export async function searchWithProvider(provider: SearchProvider, query: string, settings?: Partial<JobSettings>, context?: IntegrationContext, signal?: AbortSignal, test = false) {
  const number = Number(settings?.searchMaxResults ?? process.env.SEARCH_MAX_RESULTS ?? 5);
  const count = test ? 1 : Number.isFinite(number) ? Math.max(1, Math.min(8, Math.floor(number))) : 5;
  let data: any;
  if (provider === 'brave') data = await integrationRequest(provider, settings,
    `https://api.search.brave.com/res/v1/web/search?${new URLSearchParams({ q: query, count: String(count), country: 'BR', search_lang: 'en' })}`, {}, context, signal, test);
  else if (provider === 'you') data = await integrationRequest(provider, settings, 'https://ydc-index.io/v1/search',
    { method: 'POST', body: JSON.stringify({ query, count }) }, context, signal, test);
  else data = await integrationRequest(provider, settings, 'https://api.exa.ai/search',
    { method: 'POST', body: JSON.stringify({ query, type: 'auto', numResults: count }) }, context, signal, test);
  const rows = provider === 'brave' ? data?.web?.results : provider === 'you' ? data?.results?.web : data?.results;
  if (!Array.isArray(rows)) throw new IntegrationError(provider, 'formato de resultados inesperado');
  return [...new Set<string>(rows.map((r: any) => r?.url).filter((u: any) => {
    try { const v = new URL(u); return ['http:', 'https:'].includes(v.protocol) && !v.username && !v.password; } catch { return false; }
  }))].slice(0, count);
}
export async function retrieveWithProvider(provider: 'firecrawl' | 'you', url: string, settings?: Partial<JobSettings>, context?: IntegrationContext, signal?: AbortSignal, test = false): Promise<RetrievedPage> {
  if (provider === 'firecrawl') {
    const d = await integrationRequest(provider, settings, 'https://api.firecrawl.dev/v2/scrape', { method: 'POST',
      body: JSON.stringify({ url, formats: ['html', 'rawHtml'], onlyMainContent: false, maxAge: 0,
        timeout: Math.max(1000, Math.min(60000, settings?.externalApiTimeoutMs || 20000)) }) }, context, signal, test);
    const status = d?.data?.metadata?.statusCode;
    const html = d?.data?.html || d?.data?.rawHtml;
    const finalUrl = d?.data?.metadata?.url || d?.data?.metadata?.sourceURL;
    if (d?.data?.metadata?.error || !Number.isInteger(status) || status < 200 || status >= 300 || !html || typeof html !== 'string' || typeof finalUrl !== 'string')
      throw new IntegrationError(provider, 'página sem HTML, URL ou status HTTP verificável');
    return { html, status, finalUrl, retrievalProvider: provider };
  }
  const d = await integrationRequest(provider, settings, 'https://ydc-index.io/v1/contents', { method: 'POST',
    body: JSON.stringify({ urls: [url], formats: ['html', 'metadata'], max_age: 0,
      crawl_timeout: Math.max(1, Math.min(60, Math.ceil((settings?.externalApiTimeoutMs || 20000) / 1000))) }) }, context, signal, test);
  const row = Array.isArray(d) ? d.find((r: any) => typeof r?.url === 'string' && typeof r?.html === 'string' && r.html.trim()) : undefined;
  if (!row || row.error) throw new IntegrationError(provider, 'página sem HTML ou URL verificável');
  // Contents returns successful fetched pages, not a synthesized Answer response.
  return { html: row.html, finalUrl: row.url, status: 200, retrievalProvider: provider };
}
export async function callOpenRouterJson(system: string, prompt: string, settings?: Partial<JobSettings>, test = false) {
  const r = resolveIntegration('openrouter', settings);
  const data = await integrationRequest('openrouter', settings, 'https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST', body: JSON.stringify({ model: r.model,
      messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }],
      response_format: { type: 'json_object' }, temperature: 0.2, max_tokens: test ? 64 : 4096 }) }, undefined, undefined, test);
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') throw new IntegrationError('openrouter', 'resposta sem conteúdo');
  try { return JSON.parse(content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()); }
  catch { throw new IntegrationError('openrouter', 'modelo não retornou JSON válido'); }
}
export async function testIntegration(provider: IntegrationProvider, apiKey?: string, model?: string) {
  const settings = { [fields[provider]]: apiKey, openrouterModel: model, externalApiTimeoutMs: 20000 } as Partial<JobSettings>;
  const r = resolveIntegration(provider, settings); const started = Date.now();
  try {
    if (!r.isConfigured) throw new IntegrationError(provider, 'configure a chave no .env ou nas configurações');
    if (provider === 'openrouter') { const d = await callOpenRouterJson('Responda em JSON.', 'Retorne {"ok":true}.', settings, true); if (d?.ok !== true) throw new IntegrationError(provider, 'modelo não confirmou o teste'); }
    else if (provider === 'firecrawl') await retrieveWithProvider(provider, 'https://example.com', settings, undefined, undefined, true);
    else await searchWithProvider(provider, 'example.com', settings, undefined, undefined, true);
    resetIntegrationCircuit(provider);
    return { success: true, provider, keySource: r.source, model: r.model, latencyMs: Date.now() - started,
      message: 'Chamada real concluída. O teste pode consumir créditos da sua conta.' };
  } catch (e) { return { success: false, provider, keySource: r.source, latencyMs: Date.now() - started,
    error: e instanceof IntegrationError ? e.message : `${provider}: falha ao testar conexão` }; }
}
