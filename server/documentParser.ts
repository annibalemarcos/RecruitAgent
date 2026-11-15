import { callOpenRouterJson, resolveIntegration } from './integrations.js';
import { callPerplexityJson } from './perplexity.js';
import { resolveGeminiCredentials, resolveOpenAiCredentials, resolvePerplexityCredentials, isProviderCircuitBlocked, blockProviderCircuit } from './credentials.js';
import { createRequire } from 'module';
import mammoth from 'mammoth';
import { getGeminiClient } from './gemini.js';
import { callOpenAIJson } from './openai.js';
import { CandidateProfile, JobSettings } from '../src/types/index.js';

const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');

export async function extractTextFromBuffer(
  buffer: Buffer,
  filename: string,
  mimeType?: string
): Promise<string> {
  const lowerName = filename.toLowerCase();

  if (lowerName.endsWith('.pdf') || mimeType === 'application/pdf') {
    const data = await pdfParse(buffer);
    return data.text || '';
  }

  if (
    lowerName.endsWith('.docx') ||
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    const result = await mammoth.extractRawText({ buffer });
    return result.value || '';
  }

  // Plain text / markdown fallback
  return buffer.toString('utf-8');
}

export async function parseResumeWithAI(
  resumeText: string,
  cvLang: 'pt' | 'en' = 'pt',
  settings?: JobSettings
): Promise<CandidateProfile> {
  const provider = settings?.aiProvider || 'auto';

  const isEnglish = cvLang === 'en';

  const systemInstruction = `
Você é um especialista executivo sênior em recrutamento e análise de currículos (Tech & Executive Talent Recruiter).
Sua missão é extrair as informações do currículo com RIGOR FACTUAL ABSOLUTO.

DIRETRIZES CRÍTICAS:
1. NUNCA invente nenhuma experiência, cargo, empresa, métrica, ferramenta, certificação, idioma ou qualificação que NÃO esteja explicitamente mencionada no texto.
2. Se uma informação não estiver presente no texto (ex: telefone, links, certificações), deixe vazia ou com array vazio.
3. Se a localização não estiver explícita, registre apenas o que foi citado (ou deixe vazio se não houver).
4. Forneça o resumo profissional factual TANTO em Português ("summary") QUANTO em Inglês ("summaryEn").
5. O currículo fornecido está principalmente em idioma: ${isEnglish ? 'INGLÊS' : 'PORTUGUÊS'}.
6. Retorne a resposta estritamente no formato JSON solicitado.
`;

  const prompt = `
Aqui está o texto bruto do currículo (${isEnglish ? 'Versão em Inglês' : 'Versão em Português'}):

---
${resumeText.slice(0, 16000)}
---

Extraia o perfil do candidato no formato JSON com os seguintes campos:
- name: Nome completo do candidato
- email: E-mail de contato
- phone: Telefone
- location: Cidade / Estado / País mencionados
- summary: Resumo profissional factual em português (2 a 4 frases)
- summaryEn: Resumo profissional factual em inglês corporativo (2 to 4 sentences)
- targetRoles: Lista de 1 a 4 cargos/funções almejados ou correspondentes à trajetória
- prioritySkills: Lista das 5 a 12 competências técnicas e metodológicas prioritárias citadas
- workPreference: "remote", "hybrid", "onsite" ou "any"
- professionalLinks: Array de objetos { "label": "LinkedIn"|"GitHub"|"Portfolio"|"Outro", "url": "..." }
- experiences: Array de objetos { "role": "Cargo", "company": "Empresa", "period": "Período", "highlights": ["conquista ou responsabilidade 1", "conquista 2"] }
- education: Array de formações acadêmicas citadas
- certifications: Array de certificações citadas
- languages: Array de idiomas explicitamente citados no currículo
- materialLanguage: "both"
`;

  const credentials = {
    gemini: resolveGeminiCredentials(settings), openai: resolveOpenAiCredentials(settings),
    perplexity: resolvePerplexityCredentials(settings), openrouter: resolveIntegration('openrouter', settings),
  };
  const defaultOrder = ['gemini', 'openai', 'perplexity', 'openrouter'] as const;
  const order = [...defaultOrder].sort((a, b) => a === provider ? -1 : b === provider ? 1 : 0);
  for (const current of order) {
    const credential = credentials[current];
    if (!credential.isConfigured || isProviderCircuitBlocked(current).blocked) continue;
    try {
      let parsed: any;
      if (current === 'openrouter') parsed = await callOpenRouterJson(systemInstruction, prompt, settings);
      else if (current === 'openai') parsed = await callOpenAIJson(systemInstruction, prompt, credential.model!, credential.key);
      else if (current === 'perplexity') parsed = await callPerplexityJson(systemInstruction, prompt, credential.model!, credential.key);
      else {
        const gemini = getGeminiClient(credential.key);
        const response = await gemini.models.generateContent({ model: credential.model!, contents: prompt,
          config: { systemInstruction, responseMimeType: 'application/json', temperature: 0.1 } });
        parsed = JSON.parse(response.text || '{}');
      }
      if (parsed && (parsed.name || parsed.summary || parsed.experiences)) return normalizeParsedProfile(parsed, resumeText, isEnglish);
    } catch (e) {
      const message = e instanceof Error ? e.message : '';
      if (/401|403|API_KEY_INVALID|invalid_api_key/.test(message)) blockProviderCircuit(current, 'Credencial não autorizada');
      console.warn(`Falha ao analisar currículo com ${current}; tentando próximo provedor.`);
    }
  }
  return { name: '', email: '', location: '', summary: resumeText.slice(0, 300),
    summaryEn: isEnglish ? resumeText.slice(0, 300) : '', targetRoles: [], prioritySkills: [],
    workPreference: 'any', professionalLinks: [], experiences: [], education: [], certifications: [],
    languages: [], writingStyleSample: '', additionalNotes: '', materialLanguage: 'both', parsedFromCv: false };
}

function normalizeParsedProfile(parsed: any, resumeText: string, isEnglish: boolean): CandidateProfile {
  return {
    name: parsed.name || '',
    email: parsed.email || '',
    phone: parsed.phone || '',
    location: parsed.location || '',
    summary: parsed.summary || (isEnglish ? '' : resumeText.slice(0, 300)),
    summaryEn: parsed.summaryEn || (isEnglish ? resumeText.slice(0, 300) : ''),
    targetRoles: Array.isArray(parsed.targetRoles) ? parsed.targetRoles : [],
    prioritySkills: Array.isArray(parsed.prioritySkills) ? parsed.prioritySkills : [],
    workPreference: ['remote', 'hybrid', 'onsite', 'any'].includes(parsed.workPreference)
      ? parsed.workPreference
      : 'any',
    professionalLinks: Array.isArray(parsed.professionalLinks) ? parsed.professionalLinks : [],
    experiences: Array.isArray(parsed.experiences) ? parsed.experiences : [],
    education: Array.isArray(parsed.education) ? parsed.education : [],
    certifications: Array.isArray(parsed.certifications) ? parsed.certifications : [],
    languages: Array.isArray(parsed.languages) ? parsed.languages : [],
    writingStyleSample: '',
    additionalNotes: '',
    materialLanguage: 'both',
    parsedFromCv: true,
  };
}

export const parseResumeWithGemini = parseResumeWithAI;

