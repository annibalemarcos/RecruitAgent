import { resolveIntegration } from './integrations.js';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import { getOpenAIClient } from './openai.js';
import { JobSettings } from '../src/types/index.js';

// Ensure environment variables are loaded
dotenv.config();

const PLACEHOLDER_KEYS = new Set([
  '[CREDENCIAL_REMOVIDA]',
  'SUA_CHAVE_AQUI',
  'YOUR_GEMINI_API_KEY',
  'YOUR_API_KEY',
  'SUA_CHAVE_OPENAI_AQUI',
  'YOUR_OPENAI_API_KEY',
  'sk-your-openai-api-key-here',
  'SUA_CHAVE_PERPLEXITY_AQUI',
  'YOUR_PERPLEXITY_API_KEY',
  'pplx-your-perplexity-api-key-here',
  'INSERT_KEY_HERE',
]);

function isPlaceholderOrInvalid(key?: string): boolean {
  if (!key) return true;
  const trimmed = key.trim();
  if (trimmed.length < 8) return true;
  if (PLACEHOLDER_KEYS.has(trimmed)) return true;
  if (/^SUA_CHAVE/i.test(trimmed) || /^YOUR_.*_KEY/i.test(trimmed)) return true;
  return false;
}

export type KeySource =
  | '.env (OPENROUTER_API_KEY)'
  | 'interface'
  | 'env (GEMINI_API_KEY)'
  | 'env (GOOGLE_API_KEY)'
  | 'env (OPENAI_API_KEY)'
  | 'env (PERPLEXITY_API_KEY)'
  | 'não configurada';

export interface ProviderResolution {
  provider: 'gemini' | 'openai' | 'perplexity' | 'openrouter';
  key: string;
  source: KeySource;
  isConfigured: boolean;
  model: string;
}

/**
 * Resolves Google Gemini credentials following strict documented precedence:
 * 1. Interface / Session settings (settings.geminiApiKey)
 * 2. Environment variable GEMINI_API_KEY
 * 3. Environment variable GOOGLE_API_KEY
 */
export function resolveGeminiCredentials(settings?: JobSettings): ProviderResolution {
  const model = settings?.geminiModel || 'gemini-3.8-flash';

  // 1. Interface
  if (settings?.geminiApiKey && !isPlaceholderOrInvalid(settings.geminiApiKey)) {
    return {
      provider: 'gemini',
      key: settings.geminiApiKey.trim(),
      source: 'interface',
      isConfigured: true,
      model,
    };
  }

  // 2. GEMINI_API_KEY in process.env
  const envGemini = process.env.GEMINI_API_KEY?.trim();
  if (envGemini && !isPlaceholderOrInvalid(envGemini)) {
    return {
      provider: 'gemini',
      key: envGemini,
      source: 'env (GEMINI_API_KEY)',
      isConfigured: true,
      model,
    };
  }

  // 3. GOOGLE_API_KEY in process.env
  const envGoogle = process.env.GOOGLE_API_KEY?.trim();
  if (envGoogle && !isPlaceholderOrInvalid(envGoogle)) {
    return {
      provider: 'gemini',
      key: envGoogle,
      source: 'env (GOOGLE_API_KEY)',
      isConfigured: true,
      model,
    };
  }

  return {
    provider: 'gemini',
    key: '',
    source: 'não configurada',
    isConfigured: false,
    model,
  };
}

/**
 * Resolves OpenAI credentials following strict documented precedence:
 * 1. Interface / Session settings (settings.openaiApiKey)
 * 2. Environment variable OPENAI_API_KEY
 */
export function resolveOpenAiCredentials(settings?: JobSettings): ProviderResolution {
  const model = settings?.openaiModel || 'gpt-4o-mini';

  // 1. Interface
  if (settings?.openaiApiKey && !isPlaceholderOrInvalid(settings.openaiApiKey)) {
    return {
      provider: 'openai',
      key: settings.openaiApiKey.trim(),
      source: 'interface',
      isConfigured: true,
      model,
    };
  }

  // 2. OPENAI_API_KEY in process.env
  const envOpenAi = process.env.OPENAI_API_KEY?.trim();
  if (envOpenAi && !isPlaceholderOrInvalid(envOpenAi)) {
    return {
      provider: 'openai',
      key: envOpenAi,
      source: 'env (OPENAI_API_KEY)',
      isConfigured: true,
      model,
    };
  }

  return {
    provider: 'openai',
    key: '',
    source: 'não configurada',
    isConfigured: false,
    model,
  };
}

/**
 * Resolves Perplexity AI credentials following strict documented precedence:
 * 1. Interface / Session settings (settings.perplexityApiKey)
 * 2. Environment variable PERPLEXITY_API_KEY
 */
export function resolvePerplexityCredentials(settings?: JobSettings): ProviderResolution {
  const model = settings?.perplexityModel || 'sonar';

  // 1. Interface
  if (settings?.perplexityApiKey && !isPlaceholderOrInvalid(settings.perplexityApiKey)) {
    return {
      provider: 'perplexity',
      key: settings.perplexityApiKey.trim(),
      source: 'interface',
      isConfigured: true,
      model,
    };
  }

  // 2. PERPLEXITY_API_KEY in process.env
  const envPerplexity = process.env.PERPLEXITY_API_KEY?.trim();
  if (envPerplexity && !isPlaceholderOrInvalid(envPerplexity)) {
    return {
      provider: 'perplexity',
      key: envPerplexity,
      source: 'env (PERPLEXITY_API_KEY)',
      isConfigured: true,
      model,
    };
  }

  return {
    provider: 'perplexity',
    key: '',
    source: 'não configurada',
    isConfigured: false,
    model,
  };
}

export function resolveOpenRouterCredentials(settings?: JobSettings): ProviderResolution {
  const r = resolveIntegration('openrouter', settings);
  return { provider: 'openrouter', key: r.key, isConfigured: r.isConfigured, model: r.model!,
    source: r.source === 'interface' ? 'interface' : r.key ? '.env (OPENROUTER_API_KEY)' : 'não configurada' };
}

// Circuit breaker state to avoid repeated requests after API_KEY_INVALID
interface ProviderCircuitState {
  isBlocked: boolean;
  blockedReason?: string;
  blockedAt?: string;
}

type AiCircuitProvider = 'gemini' | 'openai' | 'perplexity' | 'openrouter' | 'deepseek' | 'groq';
const circuitStates: Record<AiCircuitProvider, ProviderCircuitState> = {
  gemini: { isBlocked: false },
  openai: { isBlocked: false },
  perplexity: { isBlocked: false },
  openrouter: { isBlocked: false },
  deepseek: { isBlocked: false },
  groq: { isBlocked: false },
};

export function isProviderCircuitBlocked(provider: AiCircuitProvider): {
  blocked: boolean;
  reason?: string;
} {
  return {
    blocked: circuitStates[provider].isBlocked,
    reason: circuitStates[provider].blockedReason,
  };
}

export function blockProviderCircuit(provider: AiCircuitProvider, reason: string): void {
  circuitStates[provider] = {
    isBlocked: true,
    blockedReason: reason,
    blockedAt: new Date().toISOString(),
  };
}

export function unblockProviderCircuit(provider: AiCircuitProvider): void {
  circuitStates[provider] = {
    isBlocked: false,
    blockedReason: undefined,
    blockedAt: undefined,
  };
}

export function getProviderCircuitStates(): Record<AiCircuitProvider, ProviderCircuitState> {
  return { ...circuitStates };
}

/**
 * Performs a minimal test call to verify Google Gemini credentials.
 * NEVER leaks or logs the raw API key.
 */
export async function testGeminiCall(
  apiKey: string,
  model: string = 'gemini-3.8-flash'
): Promise<{ success: boolean; latencyMs: number; message: string; error?: string }> {
  const start = Date.now();
  try {
    const client = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-recruitagent',
        },
      },
    });

    const response = await client.models.generateContent({
      model,
      contents: 'Ping',
      config: {
        temperature: 0,
        maxOutputTokens: 5,
      },
    });

    const latencyMs = Date.now() - start;
    unblockProviderCircuit('gemini');

    return {
      success: true,
      latencyMs,
      message: `Conexão com Google Gemini (${model}) validada com sucesso! Resposta em ${latencyMs}ms.`,
    };
  } catch (err: unknown) {
    const latencyMs = Date.now() - start;
    const rawError = err instanceof Error ? err.message : String(err);
    let userMsg = rawError;

    if (rawError.includes('API_KEY_INVALID') || rawError.includes('400') || rawError.includes('403')) {
      userMsg = 'A chave da API do Google Gemini é inválida ou não possui permissões.';
      blockProviderCircuit('gemini', userMsg);
    } else if (rawError.includes('RESOURCE_EXHAUSTED') || rawError.includes('429')) {
      userMsg = 'Cota do Google Gemini excedida (HTTP 429).';
    }

    return {
      success: false,
      latencyMs,
      message: 'Falha na validação do Google Gemini.',
      error: userMsg,
    };
  }
}

/**
 * Performs a minimal test call to verify OpenAI credentials.
 * NEVER leaks or logs the raw API key.
 */
export async function testOpenAiCall(
  apiKey: string,
  model: string = 'gpt-4o-mini'
): Promise<{ success: boolean; latencyMs: number; message: string; error?: string }> {
  const start = Date.now();
  try {
    const client = getOpenAIClient(apiKey);
    await client.chat.completions.create({
      model,
      messages: [{ role: 'user', content: 'Ping' }],
      max_tokens: 5,
      temperature: 0,
    });

    const latencyMs = Date.now() - start;
    unblockProviderCircuit('openai');

    return {
      success: true,
      latencyMs,
      message: `Conexão com OpenAI (${model}) validada com sucesso! Resposta em ${latencyMs}ms.`,
    };
  } catch (err: unknown) {
    const latencyMs = Date.now() - start;
    const rawError = err instanceof Error ? err.message : String(err);
    let userMsg = rawError;

    if (rawError.includes('Incorrect API key') || rawError.includes('invalid_api_key')) {
      userMsg = 'A chave da OpenAI é inválida.';
      blockProviderCircuit('openai', userMsg);
    } else if (rawError.includes('insufficient_quota') || rawError.includes('quota')) {
      userMsg = 'Cota insuficiente ou sem créditos ativos na OpenAI.';
    }

    return {
      success: false,
      latencyMs,
      message: 'Falha na validação da OpenAI.',
      error: userMsg,
    };
  }
}

/**
 * Performs a minimal test call to verify Perplexity AI credentials.
 * NEVER leaks or logs the raw API key.
 */
export async function testPerplexityCall(
  apiKey: string,
  model: string = 'sonar'
): Promise<{ success: boolean; latencyMs: number; message: string; error?: string }> {
  const start = Date.now();
  try {
    const response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey.trim()}`,
        'Content-Type': 'application/json',
        'User-Agent': 'aistudio-recruitagent',
      },
      body: JSON.stringify({
        model: model || 'sonar',
        messages: [{ role: 'user', content: 'Ping' }],
        max_tokens: 5,
        temperature: 0,
      }),
    });

    const latencyMs = Date.now() - start;

    if (!response.ok) {
      const errText = await response.text();
      let userMsg = errText;
      if (
        response.status === 401 ||
        errText.includes('invalid_api_key') ||
        errText.includes('Unauthorized') ||
        errText.includes('Authentication')
      ) {
        userMsg = 'A chave da API da Perplexity é inválida ou expirou.';
        blockProviderCircuit('perplexity', userMsg);
      } else if (response.status === 429) {
        userMsg = 'Cota ou limite de requisições excedido na Perplexity (HTTP 429).';
      }

      return {
        success: false,
        latencyMs,
        message: 'Falha na validação da Perplexity AI.',
        error: userMsg,
      };
    }

    unblockProviderCircuit('perplexity');

    return {
      success: true,
      latencyMs,
      message: `Conexão com Perplexity AI (${model}) validada com sucesso! Resposta em ${latencyMs}ms.`,
    };
  } catch (err: unknown) {
    const latencyMs = Date.now() - start;
    const rawError = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      latencyMs,
      message: 'Falha ao conectar com os servidores da Perplexity.',
      error: rawError,
    };
  }
}
