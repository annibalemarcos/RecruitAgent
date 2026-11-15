import { dataFs as fs, assertCurrentDataOperation, isCurrentDataOperation } from './dataLifecycle.js';
import path from 'path';
import { Vacancy, VacancyReconciliationResult, TrackedVacancyRecord } from '../src/types/index.js';

const DB_DIR = path.resolve(process.cwd(), 'data');
const VACANCIES_DB_FILE = path.join(DB_DIR, 'vacancies_tracking.json');

let memoryVacanciesCache: TrackedVacancyRecord[] | null = null;

async function ensureDir() {
  try {
    await fs.mkdir(DB_DIR, { recursive: true });
  } catch {
    // Already exists
  }
}

/**
 * Normalizes a job title for strict comparison:
 * - Lowercase
 * - Removes accents / diacritics
 * - Removes punctuation and non-alphanumeric separators
 * - Normalizes whitespaces
 */
export function normalizeJobTitle(title: string): string {
  if (!title) return '';
  return title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[-_./\\(),;:[\]{}|*+~!?#]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Normalizes a URL for comparison by stripping tracking query params and trailing slashes.
 */
export function normalizeJobUrl(rawUrl?: string): string {
  if (!rawUrl || typeof rawUrl !== 'string') return '';
  const trimmed = rawUrl.trim();
  if (!trimmed) return '';

  try {
    const parsed = new URL(trimmed);
    const trackingParams = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'ref', 'source', 'fbclid', 'gclid'];
    for (const p of trackingParams) {
      parsed.searchParams.delete(p);
    }
    // Remove trailing slash from pathname if length > 1
    if (parsed.pathname.length > 1 && parsed.pathname.endsWith('/')) {
      parsed.pathname = parsed.pathname.slice(0, -1);
    }
    return parsed.toString().toLowerCase();
  } catch {
    return trimmed.toLowerCase().replace(/\/+$/, '');
  }
}

/**
 * Normalizes text content (like description) for comparison.
 */
export function normalizeContent(text?: string): string {
  if (!text) return '';
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extracts a candidate job ID or slug from a job URL if present (e.g., /jobs/12345 or /vaga/engenheiro-frontend-987).
 */
export function extractJobIdFromUrl(url?: string): string | null {
  if (!url) return null;
  const match = url.match(/(?:jobs|job|vaga|vagas|position|positions|opening|openings)\/([a-zA-Z0-9_-]+)/i);
  return match ? match[1].toLowerCase() : null;
}

/**
 * Determines whether two vacancies represent the SAME job opportunity.
 */
export function isVacancyEquivalent(a: Vacancy, b: Vacancy): boolean {
  if (!a || !b) return false;

  // 1. Direct match by internal ID if both have one
  if (a.id && b.id && a.id === b.id) {
    return true;
  }

  const urlA = normalizeJobUrl(a.url);
  const urlB = normalizeJobUrl(b.url);

  // 2. Exact match by normalized URL
  if (urlA && urlB && urlA === urlB) {
    return true;
  }

  // 3. Match by extracted Job ID in URL
  const jobIdA = extractJobIdFromUrl(urlA);
  const jobIdB = extractJobIdFromUrl(urlB);
  if (jobIdA && jobIdB && jobIdA === jobIdB) {
    return true;
  }

  // 4. Match by normalized Job Title
  const titleA = normalizeJobTitle(a.title);
  const titleB = normalizeJobTitle(b.title);

  if (titleA && titleB) {
    if (titleA === titleB) {
      return true;
    }

    // High similarity threshold for titles that include seniority or department extensions
    // e.g. "Desenvolvedor Backend" and "Desenvolvedor Backend (Remoto)"
    if (titleA.length > 8 && titleB.length > 8) {
      if (titleA.startsWith(titleB) || titleB.startsWith(titleA)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Checks whether an existing vacancy has been MODIFIED compared to fresh incoming data.
 * If modified, returns isModified=true and a human-readable description of the changes.
 * If identical (pure repetition), returns isModified=false.
 */
export function detectVacancyModifications(
  existing: Vacancy,
  incoming: Vacancy
): {
  isModified: boolean;
  details?: string;
  updatedFields: Partial<Vacancy>;
} {
  const changes: string[] = [];
  const updatedFields: Partial<Vacancy> = {};

  const normUrlExisting = normalizeJobUrl(existing.url);
  const normUrlIncoming = normalizeJobUrl(incoming.url);

  // Check URL modification
  if (normUrlIncoming && normUrlIncoming !== normUrlExisting) {
    if (!normUrlExisting) {
      changes.push('Link oficial da vaga adicionado');
    } else {
      changes.push('Link de candidatura atualizado');
      updatedFields.previousUrl = existing.url;
    }
    updatedFields.url = incoming.url;
  }

  // Check Title modification
  const titleExisting = existing.title.trim();
  const titleIncoming = incoming.title.trim();
  if (titleIncoming && titleIncoming !== titleExisting && normalizeJobTitle(titleIncoming) !== normalizeJobTitle(titleExisting)) {
    changes.push(`Título ajustado de "${titleExisting}" para "${titleIncoming}"`);
    updatedFields.title = titleIncoming;
  }

  // Check Description modification
  const descExisting = normalizeContent(existing.description);
  const descIncoming = normalizeContent(incoming.description);
  if (descIncoming && descIncoming !== descExisting) {
    if (!descExisting) {
      changes.push('Descrição da oportunidade detalhada');
    } else {
      changes.push('Descrição ou requisitos da vaga atualizados');
      updatedFields.previousDescription = existing.description;
    }
    updatedFields.description = incoming.description;
  }

  // Check Department modification
  if (incoming.department && incoming.department.trim() !== (existing.department || '').trim()) {
    changes.push(`Departamento: ${incoming.department}`);
    updatedFields.department = incoming.department;
  }

  // Check Location modification
  if (incoming.location && incoming.location.trim() !== (existing.location || '').trim()) {
    changes.push(`Localização/Modalidade: ${incoming.location}`);
    updatedFields.location = incoming.location;
  }

  if (changes.length > 0) {
    return {
      isModified: true,
      details: changes.join('; '),
      updatedFields: {
        ...updatedFields,
        isModified: true,
        modificationDetails: changes.join('; '),
        updatedAt: new Date().toISOString(),
      },
    };
  }

  // No modification detected: pure repetition/duplicate
  return {
    isModified: false,
    updatedFields: {},
  };
}

/**
 * Core Reconciliation Algorithm:
 * "Ele deve verificar sempre antes de incluir novas vagas se a vaga já não existe,
 * se sim, se ela foi modificada, caso não, caso seja repetição ele deve ignorar e não listar."
 */
export function reconcileVacancies(
  existingVacancies: Vacancy[],
  incomingVacancies: Vacancy[],
  context?: { companyId?: string; companyName?: string }
): VacancyReconciliationResult {
  const resultList: Vacancy[] = [...existingVacancies];
  const addedVacancies: Vacancy[] = [];
  const modifiedVacancies: Vacancy[] = [];
  const ignoredVacancies: Vacancy[] = [];

  for (const incoming of incomingVacancies) {
    if (!incoming || !incoming.title || incoming.title.trim().length === 0) {
      continue;
    }

    // 1. Check if the vacancy already exists in the existing list
    const existingIndex = resultList.findIndex((item) => isVacancyEquivalent(item, incoming));

    if (existingIndex >= 0) {
      const existing = resultList[existingIndex];
      // 2. It exists: check if it was modified
      const diff = detectVacancyModifications(existing, incoming);

      if (diff.isModified) {
        // MODIFIED: update in-place with changes, mark as modified
        const updatedVacancy: Vacancy = {
          ...existing,
          ...diff.updatedFields,
          companyId: context?.companyId || existing.companyId || incoming.companyId,
          companyName: context?.companyName || existing.companyName || incoming.companyName,
          updatedAt: new Date().toISOString(),
        };

        resultList[existingIndex] = updatedVacancy;
        modifiedVacancies.push(updatedVacancy);
      } else {
        // REPETITION (NOT MODIFIED): IGNORE AND DO NOT LIST!
        ignoredVacancies.push(incoming);
      }
    } else {
      // 3. Does not exist: INCLUDE AS NEW VACANCY
      const now = new Date().toISOString();
      const newVacancy: Vacancy = {
        ...incoming,
        id: incoming.id || `vac_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        companyId: context?.companyId || incoming.companyId,
        companyName: context?.companyName || incoming.companyName,
        discoveredAt: incoming.discoveredAt || now,
        updatedAt: now,
        isModified: false,
      };

      resultList.push(newVacancy);
      addedVacancies.push(newVacancy);
    }
  }

  const summaryParts: string[] = [];
  if (addedVacancies.length > 0) {
    summaryParts.push(`${addedVacancies.length} nova(s) vaga(s) incluída(s)`);
  }
  if (modifiedVacancies.length > 0) {
    summaryParts.push(`${modifiedVacancies.length} vaga(s) atualizada(s)/modificada(s)`);
  }
  if (ignoredVacancies.length > 0) {
    summaryParts.push(`${ignoredVacancies.length} repetição(ões) idêntica(s) ignorada(s)`);
  }
  if (summaryParts.length === 0) {
    summaryParts.push('Nenhuma nova vaga encontrada');
  }

  return {
    vacancies: resultList,
    addedCount: addedVacancies.length,
    modifiedCount: modifiedVacancies.length,
    ignoredDuplicatesCount: ignoredVacancies.length,
    summary: summaryParts.join(', '),
    addedVacancies,
    modifiedVacancies,
    ignoredVacancies,
  };
}

// --------------------------------------------------------------------------
// PERSISTENT VACANCY TRACKING REPOSITORY (data/vacancies_tracking.json)
// --------------------------------------------------------------------------

export async function getAllTrackedVacancies(): Promise<TrackedVacancyRecord[]> {
  assertCurrentDataOperation();
  if (memoryVacanciesCache !== null) {
    return memoryVacanciesCache;
  }
  await ensureDir();
  assertCurrentDataOperation();
  try {
    const data = await fs.readFile(VACANCIES_DB_FILE, 'utf-8');
    memoryVacanciesCache = JSON.parse(data) as TrackedVacancyRecord[];
  } catch {
    assertCurrentDataOperation();
    memoryVacanciesCache = [];
  }
  return memoryVacanciesCache;
}

export async function saveAllTrackedVacancies(records: TrackedVacancyRecord[]): Promise<void> {
  await ensureDir();
  assertCurrentDataOperation();
  memoryVacanciesCache = records;
  await fs.writeFile(VACANCIES_DB_FILE, JSON.stringify(records, null, 2), 'utf-8');
}

/**
 * Reconciles newly crawled/extracted vacancies for a company against both the session's
 * current vacancies AND the persistent database history.
 * Guarantees that duplicates are ignored and modifications are documented.
 */
// Empresas processadas em paralelo compartilham o banco de vagas: uma reconciliação por vez.
let reconcileQueue: Promise<unknown> = Promise.resolve();
export function reconcileCompanyVacancies(
  companyId: string,
  companyName: string,
  existingInSession: Vacancy[],
  freshCrawlVacancies: Vacancy[]
): Promise<VacancyReconciliationResult> {
  const run = reconcileQueue
    .catch(() => undefined)
    .then(() => reconcileCompanyVacanciesUnlocked(companyId, companyName, existingInSession, freshCrawlVacancies));
  reconcileQueue = run;
  return run;
}

async function reconcileCompanyVacanciesUnlocked(
  companyId: string,
  companyName: string,
  existingInSession: Vacancy[],
  freshCrawlVacancies: Vacancy[]
): Promise<VacancyReconciliationResult> {
  const allDbVacancies = await getAllTrackedVacancies();
  const companyDbVacancies = allDbVacancies.filter(
    (v) => v.companyId === companyId || (v.companyName && v.companyName.toLowerCase() === companyName.toLowerCase())
  );

  // Combine session vacancies with DB history for thorough prior knowledge
  const baselineVacanciesMap = new Map<string, Vacancy>();
  for (const v of companyDbVacancies) {
    baselineVacanciesMap.set(v.id || normalizeJobTitle(v.title), v);
  }
  for (const v of existingInSession) {
    baselineVacanciesMap.set(v.id || normalizeJobTitle(v.title), v);
  }

  const baselineList = Array.from(baselineVacanciesMap.values());

  const reconciliation = reconcileVacancies(baselineList, freshCrawlVacancies, {
    companyId,
    companyName,
  });

  // Persist new and modified vacancies to database
  const now = new Date().toISOString();
  for (const vac of reconciliation.vacancies) {
    const dbIdx = allDbVacancies.findIndex(
      (dbV) =>
        (dbV.id && vac.id && dbV.id === vac.id) ||
        (dbV.companyId === companyId && isVacancyEquivalent(dbV, vac))
    );

    const record: TrackedVacancyRecord = {
      ...vac,
      companyId,
      companyName,
      firstSeenAt: dbIdx >= 0 ? allDbVacancies[dbIdx].firstSeenAt : vac.discoveredAt || now,
      lastCheckedAt: now,
    };

    if (dbIdx >= 0) {
      allDbVacancies[dbIdx] = record;
    } else {
      allDbVacancies.unshift(record);
    }
  }

  await saveAllTrackedVacancies(allDbVacancies);

  return reconciliation;
}

export function clearVacanciesMemoryForReset() { memoryVacanciesCache = []; }
