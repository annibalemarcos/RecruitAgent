import { isSpontaneousContact, hasBilingualMaterials } from '../src/materialPolicy.js';
import { callOpenRouterJson } from './integrations.js';
import { getGeminiClient } from './gemini.js';
import { callOpenAIJson } from './openai.js';
import { callPerplexityJson } from './perplexity.js';
import {
  resolveGeminiCredentials,
  resolveOpenRouterCredentials,
  resolveOpenAiCredentials,
  resolvePerplexityCredentials,
  isProviderCircuitBlocked,
  blockProviderCircuit,
  ProviderResolution,
} from './credentials.js';
import {
  CandidateProfile,
  GeneratedMaterials,
  SingleLanguageMaterial,
  RecruitmentContact,
  CompanyItem,
  JobSettings,
} from '../src/types/index.js';

function countWords(str: string): number {
  return str.trim().split(/\s+/).filter(Boolean).length;
}

export type LogCallback = (level: 'info' | 'warn' | 'error' | 'success', message: string) => void;

export function isInvalidApiKeyError(err: unknown): boolean {
  if (!err) return false;
  const msg = err instanceof Error ? err.message : String(err);
  const lower = msg.toLowerCase();

  try {
    const parsed = JSON.parse(msg);
    if (parsed?.error?.details) {
      for (const d of parsed.error.details) {
        if (d?.reason === 'API_KEY_INVALID') return true;
      }
    }
    if (parsed?.error?.message && parsed.error.message.toLowerCase().includes('api key')) return true;
    if (parsed?.error?.status === 'INVALID_ARGUMENT' && parsed.error.message.toLowerCase().includes('api key')) return true;
  } catch {}

  return (
    msg.includes('API_KEY_INVALID') ||
    lower.includes('api_key_invalid') ||
    lower.includes('invalid_api_key') ||
    lower.includes('incorrect api key') ||
    lower.includes('api key not valid') ||
    lower.includes('api key is invalid') ||
    lower.includes('chave de api inválida') ||
    (msg.includes('400') && (lower.includes('api key') || lower.includes('apikey') || lower.includes('api_key'))) ||
    (msg.includes('403') && (lower.includes('api key') || lower.includes('permission_denied') || lower.includes('forbidden')))
  );
}

export async function executeGemini(
  apiKey: string,
  model: string,
  systemInstruction: string,
  prompt: string
): Promise<any> {
  const gemini = getGeminiClient(apiKey);
  const response = await gemini.models.generateContent({
    model,
    contents: prompt,
    config: {
      systemInstruction,
      responseMimeType: 'application/json',
      temperature: 0.3,
    },
  });
  const text = response.text?.trim() || '{}';
  return JSON.parse(text);
}

function cleanError(err: unknown): string {
  if (!err) return 'Erro desconhecido';
  const msg = err instanceof Error ? err.message : String(err);
  try {
    const parsed = JSON.parse(msg);
    if (parsed?.error?.message) return parsed.error.message;
  } catch {}
  if (msg.includes('RESOURCE_EXHAUSTED') || msg.includes('429')) return 'Cota gratuita diária excedida (HTTP 429)';
  if (msg.includes('503')) return 'Serviço temporariamente sobrecarregado (HTTP 503)';
  if (isInvalidApiKeyError(err)) return 'Chave de API inválida ou sem permissões (API_KEY_INVALID)';
  if (msg.includes('insufficient_quota')) return 'Saldo de créditos insuficiente na OpenAI';
  return msg.slice(0, 120);
}

const spontaneousSubject = `Customer Support & Operations Opportunities — ${profile.name?.trim() || 'Candidate'}`;

const materialFlights = new WeakMap<RecruitmentContact, Promise<GeneratedMaterials>>();
export function generateMaterialsForContact(...args: Parameters<typeof generateMaterialsUncached>): Promise<GeneratedMaterials> {
  const contact = args[0];
  const existing = materialFlights.get(contact);
  if (existing) return existing;
  const flight = generateMaterialsUncached(...args).finally(() => materialFlights.delete(contact));
  materialFlights.set(contact, flight);
  return flight;
}

async function generateMaterialsUncached(
  contact: RecruitmentContact,
  company: CompanyItem,
  profile: CandidateProfile,
  siblingContacts: RecruitmentContact[] = [],
  settings?: JobSettings,
  onLog?: LogCallback
): Promise<GeneratedMaterials> {
  const providerMode = settings?.aiProvider || 'auto';

  // 1. Resolve credentials following strict precedence:
  // Gemini: settings.geminiApiKey -> process.env.GEMINI_API_KEY -> process.env.GOOGLE_API_KEY
  // OpenAI: settings.openaiApiKey -> process.env.OPENAI_API_KEY
  // Perplexity: settings.perplexityApiKey -> process.env.PERPLEXITY_API_KEY
  const openrouterRes = resolveOpenRouterCredentials(settings);
  const geminiRes = resolveGeminiCredentials(settings);
  const openaiRes = resolveOpenAiCredentials(settings);
  const perplexityRes = resolvePerplexityCredentials(settings);

  // 2. Check circuit breakers
  const geminiCircuit = isProviderCircuitBlocked('gemini');
  const openaiCircuit = isProviderCircuitBlocked('openai');
  const perplexityCircuit = isProviderCircuitBlocked('perplexity');

  const isSpontaneous = isSpontaneousContact(contact);

  const systemInstruction = `
Você é um estrategista sênior de recrutamento e carreira para candidaturas executivas e de tecnologia.
Sua missão é produzir materiais de candidatura altamente personalizados, 100% factuais e autênticos.

REQUISITO BILINGUE OBRIGATÓRIO:
Você DEVE gerar o pacote completo em DOIS IDIOMAS:
1. Versão em PORTUGUÊS (pt) - Português brasileiro fluente e profissional.
2. Versão em INGLÊS (en) - Inglês corporativo e autêntico para empresas globais.

REGRAS RÍGIDAS CONTRA ALUCINAÇÃO:
1. Baseie-se ESTRITAMENTE nos fatos fornecidos no perfil do candidato (experiências, cargos, competências, números, projetos).
2. NUNCA invente ferramentas, cargos, resultados ou realizações que não estejam no perfil.
3. NUNCA afirme residência, cidade, país ou vistos não declarados.
4. NUNCA mencione que "anexou o currículo".
5. ${isSpontaneous
    ? 'Como NÃO HÁ vaga aberta específica cadastrada, redija como CANDIDATURA ESPONTÂNEA. NUNCA invente vaga inexistente.'
    : `Personalize para a vaga real encontrada: "${contact.associatedJob?.title}". Conecte as qualificações comprovadas do perfil a essa posição.`}

6. Para contatos gerais ou sem comprovação de recrutamento, NÃO afirme que recebem candidaturas: peça encaminhamento ao responsável e mantenha essa ressalva nas notas de revisão.

${isSpontaneous ? `ESTILO PARA CONTATO SEM VAGA:
- Assunto obrigatório em ambas as versões: ${spontaneousSubject}
- Não use "Spontaneous Application", "Candidatura Espontânea" ou um cargo anunciado no assunto ou na abertura do email.
- Use uma estrutura profissional: saudação à equipe, apresentação baseada no perfil, interesse concreto pela atividade da empresa, experiência relevante e contribuição em suporte e operações.
- Escreva com naturalidade e foco em oportunidades, sem presumir vaga aberta ou interesse prévio da empresa.
- Preserve o foco em Customer Support & Operations, sem reduzir a abordagem a uma vaga de Customer Support Leader.
- Personalize apenas com informações verificáveis fornecidas sobre a empresa. Se não houver informação suficiente, omita esse parágrafo específico.
- Use somente fatos profissionais presentes no perfil atual do candidato.
- Gere uma versão equivalente em português e outra em inglês; não copie o corpo inglês para PT.
Não inclua fatos que não constem no perfil do candidato ou nas informações verificáveis sobre a empresa.` : ''}

EXTENSÕES REQUERIDAS (MUITO IMPORTANTE):
- Cold Email: entre 120 e 180 palavras.
- Mensagem Curta: entre 50 e 80 palavras.
- Cover Letter (Carta de Apresentação): entre 250 e 400 palavras.
`;

  const prompt = `
DADOS DO CANDIDATO:
- Nome: ${profile.name || 'Candidato'}
- Resumo Profissional: ${profile.summary || 'Não informado'}
${profile.summaryEn ? `- English Summary: ${profile.summaryEn}` : ''}
- Cargos Almejados: ${profile.targetRoles.join(', ') || 'Área de atuação'}
- Competências Prioritárias: ${profile.prioritySkills.join(', ') || 'Competências chave'}
- Experiências Comprovadas:
${profile.experiences
  .map((e) => `  * ${e.role} em ${e.company} (${e.period}): ${e.highlights.join('; ')}`)
  .join('\n')}
- Formação: ${profile.education.join(', ')}
- Certificações: ${profile.certifications.join(', ')}
- Idiomas: ${profile.languages.join(', ')}
- Links Profissionais: ${profile.professionalLinks.map((l) => `${l.label}: ${l.url}`).join(' | ')}
- Amostra do Estilo de Escrita / Instruções Adicionais: ${profile.writingStyleSample || 'Direto, focado em impacto mensurável'}
- Notas Adicionais: ${profile.additionalNotes || 'Nenhuma'}
${profile.cvEnRawText ? `\nTRECHO DO CURRÍCULO ORIGINAL EM INGLÊS:\n${profile.cvEnRawText.slice(0, 3000)}\n` : ''}
${profile.cvPtRawText ? `\nTRECHO DO CURRÍCULO ORIGINAL EM PORTUGUÊS:\n${profile.cvPtRawText.slice(0, 3000)}\n` : ''}

DADOS DA EMPRESA E CONTATO:
- Empresa: ${company.name || contact.companyName}
- Site: ${company.normalizedUrl}
- Atividade / Sobre a Empresa: ${company.companyAbout || 'Empresa atuante no mercado'}
- E-mail do Contato: ${contact.email}
- Classificação: ${contact.classification}
- Justificativa da Descoberta: ${contact.justification}
- Evidência na Página: "${contact.evidenceSnippet}"
- Vaga Associada: ${contact.associatedJob?.title ? `${contact.associatedJob.title} (${contact.associatedJob.url || ''})` : 'Candidatura Espontânea'}

Gere a resposta estritamente no seguinte formato JSON contendo as duas chaves "pt" e "en":
{
  "pt": {
    "subject": "Assunto conciso e atraente em português",
    "coldEmail": "Cold email em português (120 a 180 palavras)",
    "shortMessage": "Mensagem curta em português para LinkedIn ou contato rápido (50 a 80 palavras)",
    "coverLetter": "Carta de apresentação completa em português (250 a 400 palavras)",
    "reviewNotes": "Nota de revisão detalhando os fatos aproveitados do perfil"
  },
  "en": {
    "subject": "Concise and compelling subject line in English",
    "coldEmail": "Cold email in English (120 to 180 words)",
    "shortMessage": "Short outreach message in English for LinkedIn or quick contact (50 to 80 words)",
    "coverLetter": "Full structured cover letter in English (250 to 400 words)",
    "reviewNotes": "Review notes highlighting verified candidate achievements"
  }
}
`;

  let similarityWarning: string | undefined;
  if (siblingContacts.length > 1) {
    similarityWarning = `Atenção: Há ${siblingContacts.length} contatos cadastrados para esta mesma empresa (${company.name}). Os materiais foram adaptados para este destinatário (${contact.email}), mas certifique-se de não enviar abordagens concorrentes ao mesmo tempo.`;
  }

  // Determine provider candidates based on user preference and circuit state
  interface CandidateProvider {
    type: 'gemini' | 'openai' | 'perplexity' | 'openrouter';
    name: string;
    model: string;
    key: string;
    source: string;
    isBlocked: boolean;
    blockReason?: string;
  }

  const geminiCandidate: CandidateProvider = {
    type: 'gemini',
    name: 'Google Gemini',
    model: geminiRes.model,
    key: geminiRes.key,
    source: geminiRes.source,
    isBlocked: geminiCircuit.blocked,
    blockReason: geminiCircuit.reason,
  };

  const openaiCandidate: CandidateProvider = {
    type: 'openai',
    name: 'OpenAI ChatGPT',
    model: openaiRes.model,
    key: openaiRes.key,
    source: openaiRes.source,
    isBlocked: openaiCircuit.blocked,
    blockReason: openaiCircuit.reason,
  };

  const perplexityCandidate: CandidateProvider = {
    type: 'perplexity',
    name: 'Perplexity AI',
    model: perplexityRes.model,
    key: perplexityRes.key,
    source: perplexityRes.source,
    isBlocked: perplexityCircuit.blocked,
    blockReason: perplexityCircuit.reason,
  };

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

  // Filter out completely unconfigured providers
  const configuredProviders = providersToTry.filter((p) => Boolean(p.key));

  if (configuredProviders.length === 0) {
    const errorMsg =
      'Nenhuma chave de IA configurada. Configure GEMINI_API_KEY, OPENAI_API_KEY PERPLEXITY_API_KEY ou OPENROUTER_API_KEY no .env ou nas Configurações da aplicação.';
    onLog?.('error', `[IA BLOQUEADA] ${errorMsg}`);
    throw new Error(errorMsg);
  }

  // Iterate providers in fallback priority order
  for (let idx = 0; idx < configuredProviders.length; idx++) {
    const prov = configuredProviders[idx];
    const isFallback = idx > 0;

    // If provider is already blocked by circuit breaker, do NOT repeat requests!
    if (prov.isBlocked) {
      onLog?.(
        'warn',
        `[IA: ${prov.name}] Provedor bloqueado anteriormente (${prov.blockReason || 'chave inválida'}). Alternando para o próximo provedor para ${contact.email}.`
      );
      continue;
    }

    try {
      onLog?.(
        'info',
        `[IA: ${prov.name}${isFallback ? ' (Contingência)' : ''}] Gerando materiais para ${contact.email} (Modelo: ${prov.model}, Origem da credencial: ${prov.source})...`
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

      if (settings?.generateMaterialsForSpontaneous && isSpontaneous && !hasBilingualMaterials(parsed)) {
        throw new Error('Resposta incompleta: materiais PT e EN obrigatórios para candidatura espontânea.');
      }
      if (parsed && (parsed.pt || parsed.coldEmail)) {
        onLog?.(
          'success',
          `[IA: ${prov.name}] Materiais gerados com sucesso para ${contact.email}${isFallback ? ' via contingência' : ''}!`
        );
        return buildDualLanguageMaterial(
          parsed,
          contact,
          similarityWarning,
          prov.type,
          `${prov.name} (origem: ${prov.source}${isFallback ? ' - contingência' : ''})`
        );
      }
    } catch (err: unknown) {
      const errorDesc = cleanError(err);

      if (isInvalidApiKeyError(err)) {
        // Mark circuit breaker as blocked immediately so subsequent contacts skip this provider
        blockProviderCircuit(prov.type, `Chave ${prov.name} inválida (API_KEY_INVALID).`);
        prov.isBlocked = true;
        onLog?.(
          'error',
          `[BLOQUEIO IA: ${prov.name}] Chave de API inválida detectada (API_KEY_INVALID, origem: ${prov.source}). Chamadas subsequentes a este provedor foram suspensas. Ativando próximo provedor na fila de contingência...`
        );
      } else {
        onLog?.(
          'warn',
          `[FALHA IA: ${prov.name}] Falha na chamada: ${errorDesc}. Acionando próximo provedor de contingência...`
        );
      }
    }
  }

  // If all attempts failed or were blocked:
  // DO NOT mark generation as complete!
  // DO NOT return generic fake deterministic text!
  // Throw so contact remains pending (materialsGenerated: false) and crawling can continue!
  const blockMsg =
    'Geração de materiais suspensa: todas as credenciais de IA configuradas falharam ou estão indisponíveis. Configure uma chave válida (Gemini, OpenAI, Perplexity ou OpenRouter) nas Configurações para processar os materiais pendentes.';
  onLog?.('warn', `[MATERIAIS PENDENTES] ${blockMsg}`);
  throw new Error(blockMsg);
}

function buildDualLanguageMaterial(
  parsed: any,
  contact: RecruitmentContact,
  similarityWarning: string | undefined,
  generatedBy: 'gemini' | 'openai' | 'perplexity' | 'openrouter',
  keyUsed?: string
): GeneratedMaterials {
  const ptParsed = parsed.pt || (parsed.coldEmail ? parsed : {});
  const enParsed = parsed.en || {};

  const pt: SingleLanguageMaterial = {
    subject: ptParsed.subject || 'Apresentação Profissional',
    coldEmail: ptParsed.coldEmail || '',
    shortMessage: ptParsed.shortMessage || '',
    coverLetter: ptParsed.coverLetter || '',
    reviewNotes: ptParsed.reviewNotes || 'Fatos verificados a partir do histórico profissional do candidato.',
    wordCounts: {
      coldEmail: countWords(ptParsed.coldEmail || ''),
      shortMessage: countWords(ptParsed.shortMessage || ''),
      coverLetter: countWords(ptParsed.coverLetter || ''),
    },
  };

  const en: SingleLanguageMaterial = {
    subject: enParsed.subject || ptParsed.subject || 'Candidate Introduction',
    coldEmail: enParsed.coldEmail || ptParsed.coldEmail || '',
    shortMessage: enParsed.shortMessage || ptParsed.shortMessage || '',
    coverLetter: enParsed.coverLetter || ptParsed.coverLetter || '',
    reviewNotes: enParsed.reviewNotes || ptParsed.reviewNotes || 'Verified factual background representation.',
    wordCounts: {
      coldEmail: countWords(enParsed.coldEmail || ptParsed.coldEmail || ''),
      shortMessage: countWords(enParsed.shortMessage || ptParsed.shortMessage || ''),
      coverLetter: countWords(enParsed.coverLetter || ptParsed.coverLetter || ''),
    },
  };

  if (isSpontaneousContact(contact)) {
    // Enforce a subject based on the active candidate profile for every provider.
    pt.subject = spontaneousSubject;
    en.subject = spontaneousSubject;
  }
  if (!contact.associatedJob?.title && contact.classification !== 'Recrutamento confirmado') {
    pt.reviewNotes += ' Candidatura espontânea: não há comprovação de que este endereço receba candidaturas; confirme o canal antes de enviar.';
    en.reviewNotes += ' Unsolicited application: this address is not confirmed as an application channel; verify before sending.';
  }
  return {
    subject: pt.subject,
    coldEmail: pt.coldEmail,
    shortMessage: pt.shortMessage,
    coverLetter: pt.coverLetter,
    reviewNotes: pt.reviewNotes,
    wordCounts: pt.wordCounts,
    pt,
    en,
    matchedJob: contact.associatedJob,
    generatedAt: new Date().toISOString(),
    similarityWarning,
    generatedBy,
    keyUsed,
  };
}
