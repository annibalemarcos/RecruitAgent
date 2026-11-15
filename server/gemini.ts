import { GoogleGenAI } from '@google/genai';
import { resolveGeminiCredentials } from './credentials.js';

let cachedClient: GoogleGenAI | null = null;
let cachedKey: string = '';

export function getGeminiClient(customApiKey?: string): GoogleGenAI {
  const resolvedKey = customApiKey?.trim() || resolveGeminiCredentials().key;

  if (!resolvedKey) {
    throw new Error('Chave Google Gemini não configurada. Configure GEMINI_API_KEY no .env ou nas Configurações.');
  }

  if (cachedClient && cachedKey === resolvedKey) {
    return cachedClient;
  }

  cachedKey = resolvedKey;
  cachedClient = new GoogleGenAI({
    apiKey: resolvedKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-recruitagent',
      },
    },
  });

  return cachedClient;
}
