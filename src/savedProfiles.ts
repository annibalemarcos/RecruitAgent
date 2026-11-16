import type { CandidateProfile, JobSettings } from './types/index.js';
import { API_KEY_FIELDS, CONFIG_FORMAT, MODEL_FIELDS, SERVICE_CONFIG_FIELDS, exportConfig, importConfig } from './apiCredentialsJson.js';

// ---------------------------------------------------------------------------
// Perfis salvos: "pacotes" com até três blocos da tela de entrada.
//   1. Empresas (CSV ou URLs)
//   2. Perfil do Candidato & Fatos do Currículo
//   3. Configurações de Pesquisa & IA (com ou sem chaves de API)
// Este arquivo é usado pelo navegador e pelo servidor (mesma validação nos dois).
// ---------------------------------------------------------------------------

export const SAVED_PROFILE_FORMAT = 'recruitment-saved-profile';
export const SAVED_PROFILE_SLOTS = 2;
export const MAX_PROFILE_NAME = 60;
export const MAX_SAVED_PROFILE_BYTES = 25 * 1024 * 1024;
const MAX_COMPANIES = 5000;

export interface SavedCompany {
  name?: string;
  url: string;
}

export interface SavedProfileBlocks {
  companies: boolean;
  candidate: boolean;
  settings: boolean;
}

export interface SavedConfig {
  format: typeof CONFIG_FORMAT;
  version: 1;
  credentials: Record<string, string>;
  settings: Record<string, unknown>;
}

export interface SavedProfile {
  format: typeof SAVED_PROFILE_FORMAT;
  version: 1;
  name: string;
  savedAt: string;
  blocks: SavedProfileBlocks;
  includesApiKeys: boolean;
  companies?: SavedCompany[];
  candidate?: CandidateProfile;
  config?: SavedConfig;
}

const isObject = (value: unknown): value is Record<string, any> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const str = (value: unknown): string => (typeof value === 'string' ? value : '');
const strArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];

export function cleanProfileName(value: unknown, fallback: string): string {
  const name = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, MAX_PROFILE_NAME) : '';
  return name || fallback;
}

/** Mesma validação do "Importar JSON" do editor de perfil, com os campos extras. */
export function sanitizeCandidateProfile(parsed: unknown): CandidateProfile {
  if (!isObject(parsed)) throw new Error('O bloco do perfil do candidato é inválido.');
  const profile: CandidateProfile = {
    name: str(parsed.name),
    email: str(parsed.email),
    phone: str(parsed.phone),
    location: str(parsed.location),
    summary: str(parsed.summary),
    summaryEn: str(parsed.summaryEn),
    targetRoles: strArray(parsed.targetRoles),
    prioritySkills: strArray(parsed.prioritySkills),
    workPreference: ['remote', 'hybrid', 'onsite', 'any'].includes(parsed.workPreference) ? parsed.workPreference : 'any',
    professionalLinks: Array.isArray(parsed.professionalLinks)
      ? parsed.professionalLinks.filter(isObject).map((link) => ({ label: str(link.label) || 'Link', url: str(link.url) }))
      : [],
    experiences: Array.isArray(parsed.experiences)
      ? parsed.experiences.filter(isObject).map((exp) => ({
          role: str(exp.role) || 'Cargo',
          company: str(exp.company) || 'Empresa',
          period: str(exp.period),
          highlights: strArray(exp.highlights),
        }))
      : [],
    education: strArray(parsed.education),
    certifications: strArray(parsed.certifications),
    languages: strArray(parsed.languages),
    writingStyleSample: str(parsed.writingStyleSample),
    additionalNotes: str(parsed.additionalNotes),
    materialLanguage: ['pt', 'en', 'both', 'auto'].includes(parsed.materialLanguage) ? parsed.materialLanguage : 'both',
    parsedFromCv: typeof parsed.parsedFromCv === 'boolean' ? parsed.parsedFromCv : true,
  };
  if (parsed.defaultViewLanguage === 'pt' || parsed.defaultViewLanguage === 'en') profile.defaultViewLanguage = parsed.defaultViewLanguage;
  if (typeof parsed.cvPtFilename === 'string') profile.cvPtFilename = parsed.cvPtFilename;
  if (typeof parsed.cvPtRawText === 'string') profile.cvPtRawText = parsed.cvPtRawText;
  if (typeof parsed.cvEnFilename === 'string') profile.cvEnFilename = parsed.cvEnFilename;
  if (typeof parsed.cvEnRawText === 'string') profile.cvEnRawText = parsed.cvEnRawText;
  return profile;
}

function sanitizeCompanies(value: unknown): SavedCompany[] {
  if (!Array.isArray(value)) throw new Error('O bloco de empresas deve ser uma lista.');
  const list: SavedCompany[] = [];
  for (const item of value.slice(0, MAX_COMPANIES)) {
    if (!isObject(item)) continue;
    const url = str(item.url).trim();
    if (!url || url.length > 2048) continue;
    const name = str(item.name).trim().slice(0, 200);
    list.push(name ? { name, url } : { url });
  }
  return list;
}

/** Valida o bloco de configurações com as mesmas regras do config.json e separa chaves/modelos dos ajustes. */
function normalizeConfig(raw: unknown): SavedConfig {
  const imported = importConfig(JSON.stringify(raw)) as Record<string, unknown>;
  const credentials: Record<string, string> = {};
  const settings: Record<string, unknown> = {};
  const credentialFields = [...API_KEY_FIELDS, ...MODEL_FIELDS, ...SERVICE_CONFIG_FIELDS] as readonly string[];
  for (const [field, value] of Object.entries(imported)) {
    if (credentialFields.includes(field)) credentials[field] = value as string;
    else settings[field] = value;
  }
  return { format: CONFIG_FORMAT, version: 1, credentials, settings };
}

export function countApiKeys(config?: SavedConfig): number {
  if (!config) return 0;
  return (API_KEY_FIELDS as readonly string[]).filter((field) => !!config.credentials[field]).length;
}

/** Configurações salvas → campos de JobSettings prontos para mesclar nas configurações atuais. */
export function configToSettings(config: SavedConfig): Partial<JobSettings> {
  return importConfig(JSON.stringify(config));
}

export function buildSavedProfile(options: {
  name: string;
  blocks: SavedProfileBlocks;
  includeApiKeys: boolean;
  companies: SavedCompany[];
  candidate: CandidateProfile;
  settings: JobSettings;
}): SavedProfile {
  const { blocks } = options;
  const saved: SavedProfile = {
    format: SAVED_PROFILE_FORMAT,
    version: 1,
    name: cleanProfileName(options.name, 'Perfil'),
    savedAt: new Date().toISOString(),
    blocks: { companies: false, candidate: false, settings: false },
    includesApiKeys: false,
  };
  if (blocks.companies) {
    const companies = sanitizeCompanies(options.companies);
    if (companies.length) {
      saved.companies = companies;
      saved.blocks.companies = true;
    }
  }
  if (blocks.candidate) {
    saved.candidate = sanitizeCandidateProfile(options.candidate);
    saved.blocks.candidate = true;
  }
  if (blocks.settings) {
    const config = JSON.parse(exportConfig(options.settings)) as SavedConfig;
    if (!options.includeApiKeys) {
      for (const field of API_KEY_FIELDS) delete config.credentials[field];
    }
    saved.config = normalizeConfig(config);
    saved.blocks.settings = true;
    saved.includesApiKeys = countApiKeys(saved.config) > 0;
  }
  if (!saved.blocks.companies && !saved.blocks.candidate && !saved.blocks.settings) {
    throw new Error('Escolha pelo menos um bloco com conteúdo para salvar.');
  }
  return saved;
}

/**
 * Lê um perfil salvo. Aceita:
 *  - o formato próprio (recruitment-saved-profile);
 *  - um config.json / chaves-apis.json antigo (vira um perfil só com configurações);
 *  - um perfil_candidato.json (vira um perfil só com o candidato).
 */
export function parseSavedProfile(input: unknown, fallbackName = 'Perfil importado'): SavedProfile {
  let parsed: unknown = input;
  if (typeof input === 'string') {
    if (new TextEncoder().encode(input).length > MAX_SAVED_PROFILE_BYTES) throw new Error('O arquivo é grande demais (máximo 25 MB).');
    try {
      parsed = JSON.parse(input.replace(/^\uFEFF/, ''));
    } catch {
      throw new Error('Arquivo JSON inválido.');
    }
  }
  if (!isObject(parsed)) throw new Error('O arquivo deve conter um objeto JSON.');

  const savedAtOf = (value: unknown) =>
    typeof value === 'string' && !Number.isNaN(Date.parse(value)) ? new Date(value).toISOString() : new Date().toISOString();

  const finish = (
    name: string,
    savedAt: string,
    parts: { companies?: SavedCompany[]; candidate?: CandidateProfile; config?: SavedConfig }
  ): SavedProfile => {
    const saved: SavedProfile = {
      format: SAVED_PROFILE_FORMAT,
      version: 1,
      name,
      savedAt,
      blocks: {
        companies: !!parts.companies?.length,
        candidate: !!parts.candidate,
        settings: !!parts.config,
      },
      includesApiKeys: countApiKeys(parts.config) > 0,
    };
    if (parts.companies?.length) saved.companies = parts.companies;
    if (parts.candidate) saved.candidate = parts.candidate;
    if (parts.config) saved.config = parts.config;
    if (!saved.blocks.companies && !saved.blocks.candidate && !saved.blocks.settings) {
      throw new Error('O perfil não contém nenhum bloco com conteúdo.');
    }
    return saved;
  };

  // 1) Formato próprio
  if (parsed.format === SAVED_PROFILE_FORMAT) {
    if (parsed.version !== 1) throw new Error('Versão de perfil não suportada.');
    return finish(cleanProfileName(parsed.name, fallbackName), savedAtOf(parsed.savedAt), {
      companies: parsed.companies !== undefined ? sanitizeCompanies(parsed.companies) : undefined,
      candidate: parsed.candidate !== undefined ? sanitizeCandidateProfile(parsed.candidate) : undefined,
      config: parsed.config !== undefined ? normalizeConfig(parsed.config) : undefined,
    });
  }

  // 2) config.json / chaves-apis.json
  const looksLikeConfig =
    parsed.format === CONFIG_FORMAT ||
    parsed.format === 'recruitment-api-credentials' ||
    'credentials' in parsed ||
    'settings' in parsed;
  if (looksLikeConfig) {
    return finish(cleanProfileName(fallbackName, 'Perfil importado'), savedAtOf(undefined), { config: normalizeConfig(parsed) });
  }

  // 3) perfil_candidato.json
  if (typeof parsed.name === 'string' && ('summary' in parsed || 'experiences' in parsed || 'targetRoles' in parsed)) {
    return finish(cleanProfileName(fallbackName, 'Perfil importado'), savedAtOf(undefined), {
      candidate: sanitizeCandidateProfile(parsed),
    });
  }

  // 4) Objeto plano antigo de chaves/ajustes (ex.: { "GEMINI_API_KEY": "..." })
  let flatConfig: SavedConfig | null = null;
  try {
    flatConfig = normalizeConfig(parsed);
  } catch {
    flatConfig = null;
  }
  if (flatConfig) return finish(cleanProfileName(fallbackName, 'Perfil importado'), savedAtOf(undefined), { config: flatConfig });

  throw new Error('Formato não reconhecido. Use um perfil salvo, um config.json ou um perfil_candidato.json.');
}

export function savedProfileFileName(saved: SavedProfile): string {
  const slug = saved.name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `perfil-${slug || 'salvo'}.json`;
}
