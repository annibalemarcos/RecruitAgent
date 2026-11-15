import { enhanceCompanySearchWithWeb } from './webSearchEnhancer.js';
import { createIntegrationContext } from './integrations.js';
import type { IntegrationContext } from './integrations.js';
import { callOpenRouterJson } from './integrations.js';
import { verifyEmailSources } from './emailVerification.js';
import { executeGemini } from './materialsGenerator.js';
import { callOpenAIJson } from './openai.js';
import { callPerplexityJson } from './perplexity.js';
import {
  resolveGeminiCredentials,
  resolveOpenRouterCredentials,
  resolveOpenAiCredentials,
  resolvePerplexityCredentials,
  isProviderCircuitBlocked,
  blockProviderCircuit,
} from './credentials.js';
import { JobSettings, Vacancy } from '../src/types/index.js';

export interface AISearchResult {
  verificationFailed: boolean;
  careersUrl?: string;
  applicationPortalUrl?: string;
  about?: string;
  vacancies: Vacancy[];
  contacts: {
    retrievalProvider?: string;
    sourceUrl: string;
    extractionMethod: 'mailto' | 'page-text';
    collectedAt: string;
    email: string;
    classification: 'Recrutamento confirmado' | 'Possível recrutamento' | 'Contato geral' | 'Outra finalidade';
    justification: string;
    evidenceSnippet: string;
  }[];
  sourceProvider: 'gemini' | 'openai' | 'perplexity' | 'openrouter' | 'brave' | 'you' | 'exa';
  providerName: string;
}

type LogCallback = (level: 'info' | 'warn' | 'error' | 'success', message: string) => void;

/**
 * Searches the web and enterprise directories using the 3 AI APIs in cascade:
 * Gemini -> OpenAI (ChatGPT) -> Perplexity AI.
 * If one fails or key is invalid, automatically transitions to the next without stopping!
 */
export async function enhanceCompanySearchWithAI(
  companyName: string,
  companyUrl: string,
  settings?: JobSettings,
  onLog?: LogCallback,
  signal?: AbortSignal,
  suppliedContext?: IntegrationContext
): Promise<AISearchResult | null> {
  const context = suppliedContext || createIntegrationContext(settings, onLog);
  const webResult = await enhanceCompanySearchWithWeb(companyName, companyUrl, settings, onLog, signal, context);
  if (webResult?.contacts.length) return webResult;
  const openrouterRes = resolveOpenRouterCredentials(settings);
  const geminiRes = resolveGeminiCredentials(settings);
  const openaiRes = resolveOpenAiCredentials(settings);
  const perplexityRes = resolvePerplexityCredentials(settings);

  const geminiCircuit = isProviderCircuitBlocked('gemini');
  const openaiCircuit = isProviderCircuitBlocked('openai');
  const perplexityCircuit = isProviderCircuitBlocked('perplexity');

  interface CandidateProvider {
    type: 'gemini' | 'openai' | 'perplexity' | 'openrouter';
    name: string;
    model: string;
    key: string;
    source: string;
    isBlocked: boolean;
  }

  const geminiCandidate: CandidateProvider = {
    type: 'gemini',
    name: 'Google Gemini',
    model: geminiRes.model,
    key: geminiRes.key,
    source: geminiRes.source,
    isBlocked: geminiCircuit.blocked,
  };

  const openaiCandidate: CandidateProvider = {
    type: 'openai',
    name: 'OpenAI ChatGPT',
    model: openaiRes.model,
    key: openaiRes.key,
    source: openaiRes.source,
    isBlocked: openaiCircuit.blocked,
  };

  const perplexityCandidate: CandidateProvider = {
    type: 'perplexity',
    name: 'Perplexity AI (Busca Web ao Vivo)',
    model: perplexityRes.model,
    key: perplexityRes.key,
    source: perplexityRes.source,
    isBlocked: perplexityCircuit.blocked,
  };

  const providerMode = settings?.aiProvider || 'auto';
  const openrouterCandidate: CandidateProvider = {
    type: 'openrouter', name: 'OpenRouter', model: openrouterRes.model,
    key: openrouterRes.key, source: openrouterRes.source,
    isBlocked: isProviderCircuitBlocked('openrouter').blocked,
  };
  const providersToTry: CandidateProvider[] = [];

  const allCandidates = [geminiCandidate, openaiCandidate, perplexityCandidate, openrouterCandidate];
  if (providerMode !== 'auto') {
    const preferred = allCandidates.find(c => c.type === providerMode);
    if (preferred) providersToTry.push(preferred);
  }
  providersToTry.push(...allCandidates.filter(c => !providersToTry.includes(c)));

  const configured = providersToTry.filter((p) => Boolean(p.key));
  if (configured.length === 0) {
    onLog?.(
      'info',
      `[Busca IA ignorada] Nenhuma API de IA (Gemini, ChatGPT, Perplexity, OpenRouter) está configurada com chave válida.`
    );
    return webResult;
  }

  const systemInstruction = `
Você é um especialista em recrutamento corporativo, hunting e inteligência de mercado.
Sua missão é localizar canais de contato, página de carreiras, portais de vagas e e-mails reais de contratação/RH da empresa solicitada.
Seja 100% rigoroso: sugira apenas URLs para o código acessar. Retorne contacts vazio; não forneça emails. Não invente e-mails fictícios ou genéricos falsos.
Responda EXCLUSIVAMENTE em JSON válido, sem texto fora do JSON.
`;

  const prompt = `
EMPRESA A PESQUISAR:
- Nome: "${companyName}"
- Site oficial: "${companyUrl}"

TAREFA:
1. Encontre a URL da página de Carreiras / Trabalhe Conosco / Jobs desta empresa.
2. Identifique portais de vagas oficiais (ex: Greenhouse, Lever, Gupy, Ashby, Workable, etc.).
3. Sugira sourceUrls para pesquisa. Retorne contacts: []. Não deduza endereços.
4. Identifique até 5 vagas abertas ou posições frequentes nessa empresa.
5. Resumo conciso de até 3 frases sobre a atuação da empresa.

Formato JSON esperado:
{
  "careersUrl": "https://... ou null",
  "applicationPortalUrl": "https://... ou null",
  "about": "Descrição da empresa",
  "vacancies": [
    { "title": "Nome do Cargo", "url": "link da vaga se houver" }
  ],
  "sourceUrls": ["https://..."],
  "contacts": []
}
`;

  for (let idx = 0; idx < configured.length; idx++) {
    const prov = configured[idx];
    if (prov.isBlocked) {
      onLog?.(
        'info',
        `[Busca IA: ${prov.name}] Provedor suspenso por chave anterior. Pulando para próxima contingência...`
      );
      continue;
    }

    try {
      onLog?.(
        'info',
        `[Busca Inteligente por IA: ${prov.name}] Aprofundando pesquisa de canais de recrutamento para ${companyName}...`
      );

      let parsed: any = null;

      if (prov.type === 'gemini') {
        parsed = await executeGemini(prov.key, prov.model, systemInstruction, prompt);
      } else if (prov.type === 'openai') {
        parsed = await callOpenAIJson(systemInstruction, prompt, prov.model, prov.key);
      } else if (prov.type === 'openrouter') {
        parsed = await callOpenRouterJson(systemInstruction, prompt, settings);
      } else if (prov.type === 'perplexity') {
        parsed = await callPerplexityJson(systemInstruction, prompt, prov.model, prov.key);
      }

      if (parsed && typeof parsed === 'object') {
        // Provider output is only a page suggestion. Never accept its addresses or evidence.
        const pages = [parsed.careersUrl, parsed.applicationPortalUrl,
          ...(Array.isArray(parsed.sourceUrls) ? parsed.sourceUrls : []),
          ...(Array.isArray(parsed.contacts) ? parsed.contacts.map((c: any) => c?.sourceUrl) : [])]
          .filter((u): u is string => typeof u === 'string').slice(0, 8);
        const checked = await verifyEmailSources(companyUrl, pages, settings?.requestTimeoutMs, signal, settings, context);
        const validContacts = checked.matches.map(m => ({ ...m,
          collectedAt: new Date().toISOString(),
          classification: 'Possível recrutamento' as const,
          justification: 'Endereço explicitamente publicado em fonte acessada pelo código.' }));

        const vacancies: Vacancy[] = Array.isArray(parsed.vacancies)
          ? parsed.vacancies
              .filter((v: any) => v && v.title && typeof v.title === 'string' && v.title.length > 2)
              .map((v: any) => ({
                title: v.title.trim(),
                url: typeof v.url === 'string' && v.url.startsWith('http') ? v.url.trim() : undefined,
              }))
          : [];

        const hasUsefulData =
          checked.failed || pages.length > 0 || validContacts.length > 0 ||
          Boolean(parsed.careersUrl) ||
          Boolean(parsed.applicationPortalUrl) ||
          vacancies.length > 0;

        if (hasUsefulData) {
          onLog?.(
            'success',
            `[Busca Inteligente por IA: ${prov.name}] Pesquisa bem-sucedida para ${companyName}: ${validContacts.length} contato(s) e ${vacancies.length} vaga(s) identificada(s)!`
          );

          return {
            verificationFailed: checked.failed || !!webResult?.verificationFailed,
            careersUrl: checked.acceptedUrls.includes(parsed.careersUrl) ? parsed.careersUrl : webResult?.careersUrl,
            applicationPortalUrl:
              checked.acceptedUrls.includes(parsed.applicationPortalUrl)
                ? parsed.applicationPortalUrl
                : webResult?.applicationPortalUrl,
            about: typeof parsed.about === 'string' ? parsed.about.slice(0, 500) : undefined,
            vacancies,
            contacts: validContacts,
            sourceProvider: prov.type,
            providerName: prov.name,
          };
        }
      }
    } catch (err: unknown) {
      if (signal?.aborted) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      const isKeyInvalid =
        msg.includes('API_KEY_INVALID') ||
        msg.includes('invalid_api_key') ||
        msg.includes('Incorrect API key') ||
        msg.includes('401') ||
        msg.includes('403');

      if (isKeyInvalid) {
        blockProviderCircuit(prov.type, `Chave ${prov.name} inválida`);
        prov.isBlocked = true;
        onLog?.(
          'warn',
          `[Busca IA: ${prov.name}] Chave inválida ou cota esgotada. Alternando automaticamente para o próximo provedor...`
        );
      } else {
        onLog?.(
          'warn',
          `[Busca IA: ${prov.name}] Erro na pesquisa (${msg.slice(0, 100)}). Alternando para contingência...`
        );
      }
    }
  }

  return webResult;
}
