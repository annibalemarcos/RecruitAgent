import type { IntegrationContext } from './integrations.js';
import type { JobSettings, RecruitmentContact } from '../src/types/index.js';

let lastRequestAt = 0;
async function reserveRequestSlot() {
  const wait = Math.max(0, lastRequestAt + 350 - Date.now());
  if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
  lastRequestAt = Date.now();
}

function resolveKey(settings?: Partial<JobSettings>) {
  const input = settings?.abstractApiKey?.trim();
  const env = process.env.ABSTRACT_API_KEY?.trim();
  const valid = (value?: string) => !!value && value.length >= 8 && !/^YOUR_|^SUA_CHAVE/i.test(value);
  return valid(input) ? input! : valid(env) ? env! : '';
}

export function abstractEmailStatus() {
  const env = !!resolveKey();
  return { abstract: { configured: env, source: env ? 'env' : 'não configurada' } };
}

async function query(email: string, apiKey: string, timeoutMs: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(1000, Math.min(60000, timeoutMs)));
  try {
    const url = new URL('https://emailvalidation.abstractapi.com/v1/');
    url.searchParams.set('api_key', apiKey);
    url.searchParams.set('email', email);
    const response = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data: any = await response.json();
    if (data?.error) throw new Error('API retornou erro');
    return data;
  } catch (error) {
    if (controller.signal.aborted) throw new Error('tempo limite excedido');
    throw error;
  } finally { clearTimeout(timer); }
}

export async function validateContactDeliverability<T extends RecruitmentContact>(contact: T, settings?: Partial<JobSettings>, context?: IntegrationContext): Promise<T> {
  if (settings?.emailValidationEnabled !== true) return contact;
  const apiKey = resolveKey(settings);
  if (!apiKey || (context && context.calls >= context.limit)) return { ...contact, emailDeliverability: 'UNKNOWN' };
  if (context) context.calls++;
  try {
    await reserveRequestSlot();
    const data = await query(contact.email, apiKey, settings?.externalApiTimeoutMs || 20000);
    const deliverability = String(data?.deliverability || '').toUpperCase();
    const score = Number(data?.quality_score);
    return { ...contact,
      emailDeliverability: deliverability === 'DELIVERABLE' ? 'DELIVERABLE' : deliverability === 'UNDELIVERABLE' ? 'UNDELIVERABLE' : deliverability ? 'RISKY' : 'UNKNOWN',
      emailQualityScore: Number.isFinite(score) ? score : undefined };
  } catch {
    return { ...contact, emailDeliverability: 'UNKNOWN' };
  }
}

export async function testAbstractEmailValidation(apiKey?: string) {
  const key = apiKey?.trim() || process.env.ABSTRACT_API_KEY?.trim() || '';
  if (!key || key.length < 8 || /^YOUR_|^SUA_CHAVE/i.test(key)) return { success: false, error: 'Configure uma chave Abstract válida.' };
  const started = Date.now();
  try {
    await query('test@example.com', key, 15000);
    return { success: true, latencyMs: Date.now() - started, message: 'Chamada real à validação de email concluída.' };
  } catch (error) {
    return { success: false, latencyMs: Date.now() - started, error: `Abstract: ${error instanceof Error ? error.message : 'falha de conexão'}` };
  }
}
