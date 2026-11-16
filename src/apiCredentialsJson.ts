import type { JobSettings } from './types/index.js';

export const API_KEY_FIELDS = ['geminiApiKey', 'openaiApiKey', 'perplexityApiKey', 'openrouterApiKey', 'braveApiKey', 'firecrawlApiKey', 'youApiKey', 'exaApiKey', 'tavilyApiKey', 'deepseekApiKey', 'groqApiKey', 'abstractApiKey', 'apifyApiToken', 'hunterApiKey', 'apolloApiKey', 'peopleDataLabsApiKey', 'adzunaApiKey', 'googleCloudApiKey', 'n8nApiKey', 'firebaseApiKey', 'convexDeployKey'] as const;
export const MODEL_FIELDS = ['geminiModel', 'openaiModel', 'perplexityModel', 'openrouterModel', 'deepseekModel', 'groqModel'] as const;
export const SERVICE_CONFIG_FIELDS = ['apifyActorId', 'adzunaAppId', 'n8nWebhookUrl', 'firebaseProjectId', 'convexUrl'] as const;
const FIELDS = [...API_KEY_FIELDS, ...MODEL_FIELDS, ...SERVICE_CONFIG_FIELDS];
const CREDENTIAL_FIELDS = [...API_KEY_FIELDS, ...MODEL_FIELDS] as const;
const ALIASES: Record<string, string> = {
  GEMINI_API_KEY:'geminiApiKey', GOOGLE_API_KEY:'geminiApiKey', OPENAI_API_KEY:'openaiApiKey',
  PERPLEXITY_API_KEY:'perplexityApiKey', OPENROUTER_API_KEY:'openrouterApiKey',
  BRAVE_SEARCH_API_KEY:'braveApiKey', FIRECRAWL_API_KEY:'firecrawlApiKey',
  YOU_API_KEY:'youApiKey', YDC_API_KEY:'youApiKey', EXA_API_KEY:'exaApiKey',
  TAVILY_API_KEY:'tavilyApiKey',
  DEEPSEEK_API_KEY:'deepseekApiKey', GROQ_API_KEY:'groqApiKey', ABSTRACT_API_KEY:'abstractApiKey',
  APIFY_API_TOKEN:'apifyApiToken', APIFY_TOKEN:'apifyApiToken', HUNTER_API_KEY:'hunterApiKey',
  APOLLO_API_KEY:'apolloApiKey', PEOPLE_DATA_LABS_API_KEY:'peopleDataLabsApiKey', PDL_API_KEY:'peopleDataLabsApiKey',
  ADZUNA_APP_ID:'adzunaAppId', ADZUNA_API_KEY:'adzunaApiKey', GOOGLE_CLOUD_API_KEY:'googleCloudApiKey',
  N8N_WEBHOOK_URL:'n8nWebhookUrl', N8N_API_KEY:'n8nApiKey', FIREBASE_PROJECT_ID:'firebaseProjectId',
  FIREBASE_API_KEY:'firebaseApiKey', CONVEX_URL:'convexUrl', CONVEX_DEPLOY_KEY:'convexDeployKey', APIFY_ACTOR_ID:'apifyActorId',
};
export function exportApiCredentials(settings: JobSettings): string {
  const credentials = Object.fromEntries(CREDENTIAL_FIELDS.filter(field => typeof settings[field] === 'string' && settings[field]!.trim()).map(field => [field, settings[field]!.trim()]));
  return JSON.stringify({format:'recruitment-api-credentials', version:1, credentials}, null, 2) + '\n';
}
export function importApiCredentials(text: string): Partial<JobSettings> {
  if (new TextEncoder().encode(text).length > 65536) throw new Error('O JSON deve ter no máximo 64 KB.');
  let parsed: any;
  try { parsed = JSON.parse(text.replace(/^\uFEFF/, '')); } catch { throw new Error('Arquivo JSON inválido.'); }
  const isObject = (value:any) => value !== null && typeof value === 'object' && !Array.isArray(value);
  if (!isObject(parsed)) throw new Error('O JSON deve conter um objeto de chaves.');
  if ('format' in parsed && parsed.format !== 'recruitment-api-credentials') throw new Error('Formato de arquivo não reconhecido.');
  if ('version' in parsed && parsed.version !== 1) throw new Error('Versão de arquivo não suportada.');
  const source = 'credentials' in parsed ? parsed.credentials : parsed;
  if (!isObject(source)) throw new Error('O campo credentials deve ser um objeto.');
  const result: Record<string,string> = {};
  for (const [input, value] of Object.entries(source)) {
    const field = FIELDS.includes(input as any) ? input : (Object.hasOwn(ALIASES, input) ? ALIASES[input] : undefined);
    if (!field) continue;
    if (typeof value !== 'string' || value.length > 4096 || /[\r\n\u0000]/.test(value)) throw new Error(`Valor inválido para ${field}. Use uma string de uma linha.`);
    // Blank entries do not erase credentials already entered by the user.
    if (value.trim()) {
      if (result[field] !== undefined && result[field] !== value.trim()) throw new Error(`Valores conflitantes para ${field}.`);
      result[field] = value.trim();
    }
  }
  if (!API_KEY_FIELDS.some(field => result[field])) throw new Error('Nenhuma chave de API reconhecida foi encontrada no JSON.');
  return result;
}

// ---------------------------------------------------------------------------
// Configurações completas (config.json): chaves + modelos + todos os ajustes da
// tela "Configurações de Pesquisa & IA". As funções acima continuam valendo para
// arquivos antigos (chaves-apis.json), que a importação nova também aceita.
// ---------------------------------------------------------------------------
export const CONFIG_FORMAT = 'recruitment-config';

type SettingSpec =
  | { kind: 'enum'; values: readonly string[] }
  | { kind: 'boolean' }
  | { kind: 'int'; min: number; max: number }
  | { kind: 'stringArray'; maxItems: number; maxLength: number };

// Faixas iguais às dos controles da tela.
const SETTING_SPECS: Record<string, SettingSpec> = {
  aiProvider: { kind: 'enum', values: ['auto', 'gemini', 'openai', 'perplexity', 'openrouter', 'deepseek', 'groq'] },
  searchProvider: { kind: 'enum', values: ['auto', 'brave', 'you', 'exa', 'tavily'] },
  defaultViewLanguage: { kind: 'enum', values: ['pt', 'en'] },
  navigationLayout: { kind: 'enum', values: ['top', 'sidebar'] },
  theme: { kind: 'enum', values: ['dark', 'light'] },
  webSearchEnabled: { kind: 'boolean' },
  emailValidationEnabled: { kind: 'boolean' },
  pageRetrievalEnabled: { kind: 'boolean' },
  renderPagesWithoutEmail: { kind: 'boolean' },
  generateDualLanguage: { kind: 'boolean' },
  generateMaterialsForPossible: { kind: 'boolean' },
  generateMaterialsForSpontaneous: { kind: 'boolean' },
  maxConcurrency: { kind: 'int', min: 1, max: 6 },
  maxConcurrentSections: { kind: 'int', min: 1, max: 5 },
  lowResourceMode: { kind: 'boolean' },
  materialsConcurrency: { kind: 'int', min: 1, max: 6 },
  maxPagesPerCompany: { kind: 'int', min: 1, max: 12 },
  delayBetweenRequestsMs: { kind: 'int', min: 100, max: 2500 },
  requestTimeoutMs: { kind: 'int', min: 4000, max: 25000 },
  searchMaxResults: { kind: 'int', min: 1, max: 8 },
  maxExternalCallsPerCompany: { kind: 'int', min: 0, max: 100 },
  externalApiTimeoutMs: { kind: 'int', min: 1000, max: 60000 },
  emailBlacklist: { kind: 'stringArray', maxItems: 200, maxLength: 100 },
  emailAliasWhitelist: { kind: 'stringArray', maxItems: 500, maxLength: 100 },
};
export const CONFIG_SETTING_FIELDS = Object.keys(SETTING_SPECS) as (keyof JobSettings)[];

export function exportConfig(settings: JobSettings): string {
  const credentials = Object.fromEntries(
    FIELDS.filter(field => typeof settings[field] === 'string' && settings[field]!.trim()).map(field => [field, settings[field]!.trim()])
  );
  const adjustments: Record<string, unknown> = {
    ...Object.fromEntries(CONFIG_SETTING_FIELDS.filter(field => settings[field] !== undefined).map(field => [field, settings[field]])),
    // A tela trata estes campos ausentes como "padrão"; exporta o valor que ela realmente mostra.
    webSearchEnabled: settings.webSearchEnabled !== false,
    pageRetrievalEnabled: settings.pageRetrievalEnabled !== false,
    generateDualLanguage: settings.generateDualLanguage !== false,
    defaultViewLanguage: settings.defaultViewLanguage === 'en' ? 'en' : 'pt',
    generateMaterialsForSpontaneous: settings.generateMaterialsForSpontaneous === true,
    maxConcurrency: settings.maxConcurrency ?? 1,
    materialsConcurrency: settings.materialsConcurrency ?? 1,
  };
  return JSON.stringify({ format: CONFIG_FORMAT, version: 1, credentials, settings: adjustments }, null, 2) + '\n';
}

export function importConfig(text: string): Partial<JobSettings> {
  if (new TextEncoder().encode(text).length > 65536) throw new Error('O JSON deve ter no máximo 64 KB.');
  let parsed: any;
  try { parsed = JSON.parse(text.replace(/^\uFEFF/, '')); } catch { throw new Error('Arquivo JSON inválido.'); }
  const isObject = (value: any) => value !== null && typeof value === 'object' && !Array.isArray(value);
  if (!isObject(parsed)) throw new Error('O JSON deve conter um objeto de configurações.');
  if ('format' in parsed && parsed.format !== CONFIG_FORMAT && parsed.format !== 'recruitment-api-credentials') throw new Error('Formato de arquivo não reconhecido.');
  if ('version' in parsed && parsed.version !== 1) throw new Error('Versão de arquivo não suportada.');

  // Novo formato: { credentials, settings }. Antigo/simples: objeto plano com chaves e/ou ajustes.
  const sources: any[] = [];
  if ('credentials' in parsed || 'settings' in parsed) {
    for (const name of ['credentials', 'settings']) {
      if (!(name in parsed)) continue;
      if (!isObject(parsed[name])) throw new Error(`O campo ${name} deve ser um objeto.`);
      sources.push(parsed[name]);
    }
  } else {
    sources.push(parsed);
  }

  const result: Record<string, unknown> = {};
  const put = (field: string, value: unknown) => {
    if (field in result && result[field] !== value) throw new Error(`Valores conflitantes para ${field}.`);
    result[field] = value;
  };
  for (const source of sources) {
    for (const [input, value] of Object.entries(source)) {
      const credentialField = FIELDS.includes(input as any) ? input : (Object.hasOwn(ALIASES, input) ? ALIASES[input] : undefined);
      if (credentialField) {
        if (typeof value !== 'string' || value.length > 4096 || /[\r\n\u0000]/.test(value)) throw new Error(`Valor inválido para ${credentialField}. Use uma string de uma linha.`);
        // Entradas em branco não apagam o que o usuário já preencheu.
        if (value.trim()) put(credentialField, value.trim());
        continue;
      }
      if (!Object.hasOwn(SETTING_SPECS, input)) continue; // campos desconhecidos são ignorados
      const spec = SETTING_SPECS[input];
      if (spec.kind === 'boolean') {
        if (typeof value !== 'boolean') throw new Error(`Valor inválido para ${input}. Use true ou false.`);
        put(input, value);
      } else if (spec.kind === 'enum') {
        if (typeof value !== 'string' || !spec.values.includes(value)) throw new Error(`Valor inválido para ${input}. Opções: ${spec.values.join(', ')}.`);
        put(input, value);
      } else if (spec.kind === 'stringArray') {
        if (!Array.isArray(value) || value.length > spec.maxItems || value.some((item) => typeof item !== 'string' || item.length > spec.maxLength || /[\r\n\u0000]/.test(item))) {
          throw new Error(`Valor inválido para ${input}. Use uma lista de até ${spec.maxItems} palavras-chave.`);
        }
        put(input, [...new Set(value.map((item: string) => item.trim().toLowerCase()).filter(Boolean))]);
      } else {
        if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`Valor inválido para ${input}. Use um número.`);
        put(input, Math.min(spec.max, Math.max(spec.min, Math.round(value)))); // fora da faixa: ajusta ao limite da tela
      }
    }
  }
  if (Object.keys(result).length === 0) throw new Error('Nenhuma configuração reconhecida foi encontrada no JSON.');
  return result as Partial<JobSettings>;
}
