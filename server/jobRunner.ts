import { automaticSpontaneous, materialsReady } from '../src/materialPolicy.js';
import { createIntegrationContext } from './integrations.js';
import { attestContact } from './emailVerification.js';
import { dataFs as fs, assertCurrentDataOperation, isCurrentDataOperation } from './dataLifecycle.js';
import path from 'path';
import { SessionState, CompanyItem, LogMessage, RecruitmentContact } from '../src/types/index.js';
import { crawlCompany } from './extractor.js';
import { generateMaterialsForContact } from './materialsGenerator.js';
import { unblockProviderCircuit, isProviderCircuitBlocked } from './credentials.js';
import { enhanceCompanySearchWithAI } from './aiSearchEnhancer.js';
import { reconcileCompanyVacancies, isVacancyEquivalent } from './vacancyManager.js';
import { clampInt, runPool, MAX_PARALLEL } from './concurrency.js';
import { fetchPublicJobBoard } from './jobBoardApis.js';
import { validateContactDeliverability } from './emailQuality.js';
import { resolveCompatibleAi } from './compatibleAi.js';

const SESSIONS_DIR = path.resolve(process.cwd(), 'data', 'sessions');

// In-memory sessions cache with disk persistence
const activeSessions = new Map<string, SessionState>();
const sseSubscribers = new Map<string, Set<(data: { type: string; payload: unknown }) => void>>();

// Active runners controllers
const activeRunners = new Map<
  string,
  {
    isPaused: boolean;
    isCancelled: boolean;
    abortController?: AbortController;
  }
>();
const runnerCompletions = new Map<string, Promise<void>>();
let configuredMaxConcurrentSessions = 1;
let lowResourceMode = false;
let maxConcurrentSessions = 1;
const waitingSessions: string[] = [];
const runningSessions = new Set<string>();
let schedulerShuttingDown = false;
let sharedWorkInUse = 0;
let sharedWorkLimit = MAX_PARALLEL;
const sharedWorkWaiters: Array<{ shouldStop: () => boolean; resolve: (acquired: boolean) => void }> = [];

function pumpSessionQueue() {
  if (schedulerShuttingDown) return;
  while (runningSessions.size < maxConcurrentSessions && waitingSessions.length) {
    const sessionId = waitingSessions.shift()!;
    const runner = activeRunners.get(sessionId);
    const session = activeSessions.get(sessionId);
    if (!runner || runner.isCancelled || runner.isPaused || !session) continue;
    runningSessions.add(sessionId);
    const completion = runSessionLoop(sessionId, runner).catch((err) => {
      console.error(`Runner loop error for session ${sessionId}:`, err);
    }).finally(() => {
      runningSessions.delete(sessionId);
      if (activeRunners.get(sessionId) === runner) activeRunners.delete(sessionId);
      if (runnerCompletions.get(sessionId) === completion) runnerCompletions.delete(sessionId);
      pumpSessionQueue();
    });
    runnerCompletions.set(sessionId, completion);
  }
}

export function setMaxConcurrentSessions(value: number) {
  configuredMaxConcurrentSessions = clampInt(value, 1, 5, 1);
  maxConcurrentSessions = lowResourceMode ? 1 : configuredMaxConcurrentSessions;
  pumpSessionQueue();
}

export function setLowResourceMode(enabled: boolean) {
  lowResourceMode = enabled === true;
  maxConcurrentSessions = lowResourceMode ? 1 : configuredMaxConcurrentSessions;
  sharedWorkLimit = lowResourceMode ? 2 : MAX_PARALLEL;
  pumpSessionQueue();
}

async function acquireSharedWorkSlot(shouldStop: () => boolean): Promise<boolean> {
  if (shouldStop()) return false;
  if (sharedWorkInUse < sharedWorkLimit && sharedWorkWaiters.length === 0) {
    sharedWorkInUse++;
    return true;
  }
  return await new Promise<boolean>((resolve) => sharedWorkWaiters.push({ shouldStop, resolve }));
}

function releaseSharedWorkSlot() {
  sharedWorkInUse = Math.max(0, sharedWorkInUse - 1);
  if (sharedWorkInUse >= sharedWorkLimit) return;
  while (sharedWorkWaiters.length) {
    const waiter = sharedWorkWaiters.shift()!;
    if (waiter.shouldStop()) { waiter.resolve(false); continue; }
    sharedWorkInUse++;
    waiter.resolve(true);
    break;
  }
}

export async function ensureSessionsDir() {
  try {
    await fs.mkdir(SESSIONS_DIR, { recursive: true });
  } catch {
    // Ignore if exists
  }
}

export async function saveSessionCheckpoint(session: SessionState) {
  if (!isCurrentDataOperation()) return;
  assertCurrentDataOperation();
  activeSessions.set(session.sessionId, session);
  await ensureSessionsDir();
  const filePath = path.join(SESSIONS_DIR, `session_${session.sessionId}.json`);
  await fs.writeFile(filePath, JSON.stringify(session, null, 2), 'utf-8');

  // Update last active session index pointer
  try {
    const lastActivePath = path.join(SESSIONS_DIR, 'last_active_session_id.txt');
    await fs.writeFile(lastActivePath, session.sessionId, 'utf-8');
  } catch (err) {
    console.warn('Failed to update last_active_session_id.txt:', err);
  }
}

export async function loadSessionCheckpoint(sessionId: string): Promise<SessionState | null> {
  if (activeSessions.has(sessionId)) {
    const cached = activeSessions.get(sessionId)!;
    assertCurrentDataOperation();
    return cached;
  }
  try {
    const filePath = path.join(SESSIONS_DIR, `session_${sessionId}.json`);
    const data = await fs.readFile(filePath, 'utf-8');
    const parsed = JSON.parse(data) as SessionState;
    assertCurrentDataOperation();
    activeSessions.set(sessionId, parsed);
    return parsed;
  } catch {
    return null;
  }
}

export async function listSessionCheckpoints(): Promise<SessionState[]> {
  await ensureSessionsDir();
  const files = (await fs.readdir(SESSIONS_DIR)).filter((f) => f.startsWith('session_ses_') && f.endsWith('.json'));
  const sessions = await Promise.all(files.map(async (file) => {
    try { return JSON.parse(await fs.readFile(path.join(SESSIONS_DIR, file), 'utf-8')) as SessionState; }
    catch { return null; }
  }));
  return sessions.filter((s): s is SessionState => !!s).sort((a, b) => (b.startedAt || '').localeCompare(a.startedAt || ''));
}

export async function deleteSessionCheckpoint(sessionId: string): Promise<void> {
  const current = await loadSessionCheckpoint(sessionId);
  if (!current) return;
  for (let i = waitingSessions.length - 1; i >= 0; i--) if (waitingSessions[i] === sessionId) waitingSessions.splice(i, 1);
  const runner = activeRunners.get(sessionId);
  if (runner) {
    runner.isCancelled = true;
    runner.isPaused = false;
    runner.abortController?.abort('section_deleted');
    current.status = 'cancelled';
    const completion = runnerCompletions.get(sessionId);
    if (completion) await completion;
  }
  activeRunners.delete(sessionId);
  runnerCompletions.delete(sessionId);
  activeSessions.delete(sessionId);
  await fs.rm(path.join(SESSIONS_DIR, `session_${sessionId}.json`), { force: true });
}

/**
 * Returns the currently executing session, or the most recently active session checkpoint.
 * Ensures page reloads recover the existing running/paused session instead of returning null.
 */
export async function getActiveOrLatestSession(): Promise<SessionState | null> {
  // 1. Any currently running runner
  for (const [sessionId, runner] of activeRunners.entries()) {
    if (!runner.isCancelled) {
      const s = await loadSessionCheckpoint(sessionId);
      if (s) return s;
    }
  }

  // 2. Check in-memory sessions that are running or paused
  for (const s of activeSessions.values()) {
    if (s.status === 'running' || s.status === 'paused') {
      return s;
    }
  }

  // 3. Pointer in last_active_session_id.txt
  try {
    const lastActivePath = path.join(SESSIONS_DIR, 'last_active_session_id.txt');
    const lastId = (await fs.readFile(lastActivePath, 'utf-8')).trim();
    if (lastId) {
      const s = await loadSessionCheckpoint(lastId);
      if (s) return s;
    }
  } catch {}

  // 4. Most recently modified session file in SESSIONS_DIR
  try {
    await ensureSessionsDir();
    const files = await fs.readdir(SESSIONS_DIR);
    const sessionFiles = files.filter((f) => f.startsWith('session_') && f.endsWith('.json'));
    if (sessionFiles.length > 0) {
      const filesWithStats = await Promise.all(
        sessionFiles.map(async (f) => {
          const stat = await fs.stat(path.join(SESSIONS_DIR, f));
          return { file: f, mtime: stat.mtimeMs };
        })
      );
      filesWithStats.sort((a, b) => b.mtime - a.mtime);
      const latestFile = filesWithStats[0].file;
      const id = latestFile.replace(/^session_/, '').replace(/\.json$/, '');
      return await loadSessionCheckpoint(id);
    }
  } catch {}

  return null;
}

export function subscribeToSession(
  sessionId: string,
  listener: (data: { type: string; payload: unknown }) => void
) {
  if (!sseSubscribers.has(sessionId)) {
    sseSubscribers.set(sessionId, new Set());
  }
  sseSubscribers.get(sessionId)!.add(listener);

  return () => {
    const subs = sseSubscribers.get(sessionId);
    if (subs) {
      subs.delete(listener);
      if (subs.size === 0) {
        sseSubscribers.delete(sessionId);
      }
    }
  };
}

export function broadcastSessionEvent(sessionId: string, type: string, payload: unknown) {
  if (!isCurrentDataOperation()) return;
  const subs = sseSubscribers.get(sessionId);
  if (subs) {
    for (const listener of subs) {
      try {
        listener({ type, payload });
      } catch (err) {
        console.error('Error in SSE listener:', err);
      }
    }
  }
}

export function logSession(
  session: SessionState,
  level: 'info' | 'warn' | 'error' | 'success',
  message: string,
  companyId?: string
) {
  const log: LogMessage = {
    id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    timestamp: new Date().toLocaleTimeString('pt-BR', { hour12: false }),
    level,
    message,
    companyId,
  };

  session.logs.push(log);
  if (session.logs.length > 1000) {
    session.logs.shift();
  }

  broadcastSessionEvent(session.sessionId, 'log', log);
}

export async function startOrResumeSession(sessionId: string): Promise<SessionState> {
  assertCurrentDataOperation();
  const session = await loadSessionCheckpoint(sessionId);
  assertCurrentDataOperation();
  if (!session) throw new Error('Sessão não encontrada');

  if (activeRunners.has(sessionId)) {
    const runner = activeRunners.get(sessionId)!;
    if (runner.isCancelled) {
      const completion = runnerCompletions.get(sessionId);
      if (completion) await completion;
      if (activeRunners.has(sessionId)) activeRunners.delete(sessionId);
      return await startOrResumeSession(sessionId);
    }
    if (runner.isPaused) {
      runner.isPaused = false;
      runner.isCancelled = false;
      session.status = 'running';
      logSession(session, 'info', 'Execução retomada pelo usuário.');
      broadcastSessionEvent(sessionId, 'status_change', { status: 'running' });
      await saveSessionCheckpoint(session);
      if (!runningSessions.has(sessionId) && !waitingSessions.includes(sessionId)) waitingSessions.push(sessionId);
      pumpSessionQueue();
      return session;
    }
    return session;
  }

  const abortController = new AbortController();
  const runnerState = { isPaused: false, isCancelled: false, abortController };
  activeRunners.set(sessionId, runnerState);
  session.status = 'running';
  if (!session.startedAt) session.startedAt = new Date().toISOString();

  const queued = runningSessions.size >= maxConcurrentSessions;
  logSession(session, 'info', queued
    ? `Seção aguardando vaga na fila (${runningSessions.size}/${maxConcurrentSessions} em execução).`
    : `Iniciando pesquisa para ${session.companies.length} empresa(s)...`);
  broadcastSessionEvent(sessionId, 'status_change', { status: 'running' });
  await saveSessionCheckpoint(session);
  waitingSessions.push(sessionId);
  pumpSessionQueue();

  return session;
}

export async function pauseSession(sessionId: string): Promise<SessionState> {
  assertCurrentDataOperation();
  const session = await loadSessionCheckpoint(sessionId);
  assertCurrentDataOperation();
  if (!session) throw new Error('Sessão não encontrada');

  const runner = activeRunners.get(sessionId);
  if (runner) {
    runner.isPaused = true;
    runner.isCancelled = true;
    runner.abortController?.abort('user_paused');
    for (let i = waitingSessions.length - 1; i >= 0; i--) if (waitingSessions[i] === sessionId) waitingSessions.splice(i, 1);
  }
  session.status = 'paused';
  logSession(session, 'warn', 'Pesquisa pausada. O progresso atual foi salvo.');
  broadcastSessionEvent(sessionId, 'status_change', { status: 'paused' });
  await saveSessionCheckpoint(session);
  return session;
}

export async function cancelSession(sessionId: string): Promise<SessionState> {
  assertCurrentDataOperation();
  const session = await loadSessionCheckpoint(sessionId);
  assertCurrentDataOperation();
  if (!session) throw new Error('Sessão não encontrada');

  const runner = activeRunners.get(sessionId);
  if (runner) {
    runner.isCancelled = true;
    runner.abortController?.abort('user_cancelled');
    for (let i = waitingSessions.length - 1; i >= 0; i--) if (waitingSessions[i] === sessionId) waitingSessions.splice(i, 1);
    if (!runnerCompletions.has(sessionId)) activeRunners.delete(sessionId);
  }
  session.status = 'cancelled';
  logSession(session, 'warn', 'Pesquisa cancelada pelo usuário.');
  broadcastSessionEvent(sessionId, 'status_change', { status: 'cancelled' });
  await saveSessionCheckpoint(session);
  return session;
}

export async function retryFailedCompanies(sessionId: string): Promise<SessionState> {
  assertCurrentDataOperation();
  const session = await loadSessionCheckpoint(sessionId);
  assertCurrentDataOperation();
  if (!session) throw new Error('Sessão não encontrada');

  let resetCount = 0;
  for (const comp of session.companies) {
    if (comp.status === 'Erro' || comp.status === 'Bloqueado' || comp.status === 'Não foi possível verificar a fonte') {
      comp.status = 'Pendente';
      comp.error = undefined;
      resetCount++;
    }
  }

  logSession(session, 'info', `${resetCount} empresa(s) com erro resetadas para "Pendente".`);
  await saveSessionCheckpoint(session);
  broadcastSessionEvent(sessionId, 'session_updated', session);

  if (session.status !== 'running') {
    return await startOrResumeSession(sessionId);
  }
  return session;
}

async function runSessionLoop(
  sessionId: string,
  runnerState: { isPaused: boolean; isCancelled: boolean; abortController?: AbortController }
) {
  const session = activeSessions.get(sessionId);
  if (!session) return;

  try {
    if (session.settings.generateMaterialsForSpontaneous) await queueSpontaneousMaterials(sessionId);
    // Cada empresa é processada por processCompany; até `maxConcurrency` rodam ao mesmo tempo.
    const processCompany = async (i: number): Promise<void> => {
      while (runnerState.isPaused) {
        if (runnerState.isCancelled) break;
        await new Promise((r) => setTimeout(r, 600));
      }

      if (runnerState.isCancelled) return;

      const company = session.companies[i];
      session.currentCompanyIndex = i;

      // Skip already completed companies to avoid repeating work or duplicating contacts
      if (
        company.status === 'Concluído' ||
        company.status === 'Email não encontrado' ||
        company.status === 'Sem contato de recrutamento' ||
        company.status === 'Concluído parcialmente'
      ) {
        return;
      }

      company.status = 'Pesquisando';
      logSession(
        session,
        'info',
        `[${i + 1}/${session.companies.length}] Analisando site de ${company.name} (${company.normalizedUrl})...`,
        company.id
      );
      broadcastSessionEvent(sessionId, 'company_updated', company);

      // Preserve previously generated materials if this company is being re-visited
      const existingMaterialsMap = new Map(
        company.contacts
          .filter((c) => c.materialsGenerated && c.materials)
          .map((c) => [c.email.toLowerCase(), c.materials!])
      );

      const integrationContext = createIntegrationContext(session.settings, (lvl, msg) => logSession(session, lvl, msg, company.id));
      // 1. Crawl website with cancellation signal and logger
      const crawlResult = await crawlCompany(
        company.id,
        company.name,
        company.normalizedUrl,
        session.settings.maxPagesPerCompany,
        session.settings.requestTimeoutMs,
        session.settings.delayBetweenRequestsMs,
        (lvl, msg) => logSession(session, lvl, msg, company.id),
        runnerState.abortController?.signal,
        [], session.settings, integrationContext
      );

      const atsVacancies = await fetchPublicJobBoard([crawlResult.careersUrl, crawlResult.applicationPortalUrl], session.settings.externalApiTimeoutMs);

      company.visitedPages = crawlResult.visitedPages;
      company.companyAbout = crawlResult.companyAbout;
      company.careersUrl = crawlResult.careersUrl;
      company.applicationPortalUrl = crawlResult.applicationPortalUrl;

      // Reconcile vacancies: always check if exists, detect modifications, ignore and do not list repetitions
      const crawlVacReconciliation = await reconcileCompanyVacancies(
        company.id,
        company.name,
        company.vacanciesFound || [],
        [...(crawlResult.vacanciesFound || []), ...atsVacancies.map((vacancy) => ({ ...vacancy, companyId: company.id, companyName: company.name }))]
      );
      company.vacanciesFound = crawlVacReconciliation.vacancies;

      if (crawlVacReconciliation.modifiedCount > 0 || crawlVacReconciliation.ignoredDuplicatesCount > 0) {
        logSession(
          session,
          'info',
          `[Auditoria de Vagas - ${company.name}] ${crawlVacReconciliation.summary}.`,
          company.id
        );
      }

      // Merge contacts: preserve existing contacts and materials, integrate new contacts without duplicate emails
      const mergedContactsMap = new Map<string, RecruitmentContact>();

      for (const newContact of crawlResult.contacts) {
        const emailKey = newContact.email.toLowerCase();
        const existing = mergedContactsMap.get(emailKey);
        if (existing) {
          mergedContactsMap.set(emailKey, {
            ...newContact,
            materials: existing.materialsGenerated && existing.materials ? existing.materials : newContact.materials,
            materialsGenerated: existing.materialsGenerated || newContact.materialsGenerated,
          });
        } else {
          mergedContactsMap.set(emailKey, newContact);
        }
      }
      company.contacts = Array.from(mergedContactsMap.values());
      if (session.settings.emailValidationEnabled && (session.settings.abstractApiKey || process.env.ABSTRACT_API_KEY)) {
        company.contacts = await Promise.all(company.contacts.map(async (contact) => {
          const checked = await validateContactDeliverability(contact, session.settings, integrationContext);
          attestContact(checked);
          return checked;
        }));
      }

      // Synchronize associatedJob on contacts if vacancies were modified or new
      for (const contact of company.contacts) {
        if (contact.associatedJob) {
          const matchingVac = company.vacanciesFound.find((v) => isVacancyEquivalent(v, contact.associatedJob!));
          if (matchingVac) {
            contact.associatedJob = {
              title: matchingVac.title,
              url: matchingVac.url,
            };
          }
        } else if (company.vacanciesFound.length > 0) {
          contact.associatedJob = {
            title: company.vacanciesFound[0].title,
            url: company.vacanciesFound[0].url,
          };
        }
      }

      company.status = crawlResult.status;
      company.error = crawlResult.error;
      company.updatedAt = new Date().toISOString();

      // If direct crawling yielded 0 contacts or encountered access blocks, run AI Search fallback
      // Web search and configured LLMs are attempted in priority order.
      if (company.contacts.length === 0 || crawlResult.status === 'Não foi possível verificar a fonte') {
        logSession(
          session,
          'info',
          `Acionando Busca Inteligente por IA (busca web e contingência Gemini / ChatGPT / Perplexity / OpenRouter / DeepSeek / Groq) para localizar canais de recrutamento de ${company.name}...`,
          company.id
        );

        try {
          const aiResult = await enhanceCompanySearchWithAI(
            company.name,
            company.normalizedUrl,
            session.settings,
            (lvl, msg) => logSession(session, lvl, msg, company.id),
            runnerState.abortController?.signal, integrationContext
          );

          if (aiResult) {
            if (aiResult.verificationFailed && !company.contacts.length) company.status = 'Não foi possível verificar a fonte';
            if (!company.careersUrl && aiResult.careersUrl) {
              company.careersUrl = aiResult.careersUrl;
            }
            if (!company.applicationPortalUrl && aiResult.applicationPortalUrl) {
              company.applicationPortalUrl = aiResult.applicationPortalUrl;
            }
            if (!company.companyAbout && aiResult.about) {
              company.companyAbout = aiResult.about;
            }
            if (aiResult.vacancies.length > 0) {
              const aiVacRec = await reconcileCompanyVacancies(
                company.id,
                company.name,
                company.vacanciesFound || [],
                aiResult.vacancies
              );
              company.vacanciesFound = aiVacRec.vacancies;
              if (aiVacRec.modifiedCount > 0 || aiVacRec.ignoredDuplicatesCount > 0) {
                logSession(
                  session,
                  'info',
                  `[Auditoria de Vagas IA - ${company.name}] ${aiVacRec.summary}.`,
                  company.id
                );
              }
            }

            for (const aiCnt of aiResult.contacts) {
              const emailKey = aiCnt.email.toLowerCase();
              if (!mergedContactsMap.has(emailKey)) {
                const newCnt: RecruitmentContact = {
                  id: `cnt_${Math.random().toString(36).slice(2, 10)}`,
                  companyId: company.id,
                  companyName: company.name,
                  site: company.normalizedUrl,
                  email: aiCnt.email,
                  isObfuscated: false,
                  classification: aiCnt.classification,
                  justification: aiCnt.justification,
                  sourceUrl: aiCnt.sourceUrl,
                  extractionMethod: aiCnt.extractionMethod,
                  retrievalProvider: aiCnt.retrievalProvider,
                  allSources: [aiCnt.sourceUrl],
                  evidenceSnippet: aiCnt.evidenceSnippet,
                  collectedAt: aiCnt.collectedAt,
                  associatedJob: company.vacanciesFound.length > 0 ? company.vacanciesFound[0] : undefined,
                  materialsGenerated: false,
                };
                attestContact(newCnt);
                mergedContactsMap.set(emailKey, newCnt);
              }
            }

            company.contacts = Array.from(mergedContactsMap.values());
            if (company.contacts.length > 0) {
              company.status = 'Contato encontrado';
              company.error = undefined;
              logSession(
                session,
                'success',
                `Busca IA encontrou ${aiResult.contacts.length} canal(is) de contato e ${aiResult.vacancies.length} vaga(s) para ${company.name} via ${aiResult.providerName}!`,
                company.id
              );
            }
          }
        } catch (aiErr: unknown) {
          const errDetail = aiErr instanceof Error ? aiErr.message : String(aiErr);
          logSession(session, 'warn', `Busca IA não pôde ser concluída para ${company.name}: ${errDetail}`, company.id);
        }
      }

      logSession(session, 'info', `Busca/leitura externas: ${integrationContext.calls}/${integrationContext.limit} chamada(s) para ${company.name}.`, company.id);
      if (company.contacts.length === 0) {
        if (company.status !== 'Não foi possível verificar a fonte') {
          company.status = 'Email não encontrado';
        }
        logSession(
          session,
          'warn',
          `Nenhum canal de e-mail identificado para ${company.name}. Link de carreiras: ${company.careersUrl || company.applicationPortalUrl || 'Não encontrado'}.`,
          company.id
        );
      } else {
        company.status = 'Contato encontrado';
        const confirmed = company.contacts.filter((c) => c.classification === 'Recrutamento confirmado');
        const possible = company.contacts.filter((c) => c.classification === 'Possível recrutamento');
        logSession(
          session,
          'success',
          `${company.name}: ${company.contacts.length} contato(s) coletado(s) (${confirmed.length} confirmado(s), ${possible.length} possível(eis)).`,
          company.id
        );

        // 2. Automatically generate materials for confirmed contacts (and optionally possible recruitment)
        const contactsToGenerate = company.contacts.filter(
          (c) =>
            c.classification === 'Recrutamento confirmado' ||
            (session.settings.generateMaterialsForPossible && c.classification === 'Possível recrutamento') ||
            automaticSpontaneous(c, session.settings)
        );

        if (contactsToGenerate.length > 0) {
          company.status = 'Gerando materiais';
          broadcastSessionEvent(sessionId, 'company_updated', company);

          // Check if AI circuit is already blocked for all available fallback providers
          const geminiBlocked = isProviderCircuitBlocked('gemini').blocked;
          const openaiBlocked = isProviderCircuitBlocked('openai').blocked;
          const perplexityBlocked = isProviderCircuitBlocked('perplexity').blocked;
          const deepseekUnavailable = !resolveCompatibleAi('deepseek', session.settings).key || isProviderCircuitBlocked('deepseek').blocked;
          const groqUnavailable = !resolveCompatibleAi('groq', session.settings).key || isProviderCircuitBlocked('groq').blocked;
          const isGenerationBlocked = geminiBlocked && openaiBlocked && perplexityBlocked && isProviderCircuitBlocked('openrouter').blocked && deepseekUnavailable && groqUnavailable;

          if (isGenerationBlocked) {
            logSession(
              session,
              'warn',
              `[TODAS AS IAS BLOQUEADAS] Geração suspensa: as APIs de IA (Gemini, OpenAI, Perplexity, OpenRouter, DeepSeek e Groq) estão com credenciais inválidas ou bloqueadas. ${contactsToGenerate.length} contato(s) de ${company.name} foram salvos com materiais pendentes. A coleta continua normalmente.`,
              company.id
            );
          } else {
            for (const contact of contactsToGenerate) {
              if (runnerState.isCancelled) break;

              // If all providers are now blocked, stop calling
              const geminiNowBlocked = isProviderCircuitBlocked('gemini').blocked;
              const openaiNowBlocked = isProviderCircuitBlocked('openai').blocked;
              const perplexityNowBlocked = isProviderCircuitBlocked('perplexity').blocked;
              const deepseekNowUnavailable = !resolveCompatibleAi('deepseek', session.settings).key || isProviderCircuitBlocked('deepseek').blocked;
              const groqNowUnavailable = !resolveCompatibleAi('groq', session.settings).key || isProviderCircuitBlocked('groq').blocked;
              if (geminiNowBlocked && openaiNowBlocked && perplexityNowBlocked && isProviderCircuitBlocked('openrouter').blocked && deepseekNowUnavailable && groqNowUnavailable) {
                logSession(
                  session,
                  'warn',
                  `[TODAS AS IAS BLOQUEADAS] Todas as chaves configuradas falharam. Suspendendo chamadas para contatos restantes de ${company.name}. Materiais permanecem pendentes.`,
                  company.id
                );
                break;
              }

              // Skip if already generated to avoid duplicate work and API usage
              if (materialsReady(contact, session.settings)) {
                logSession(
                  session,
                  'info',
                  `Materiais para ${contact.email} já estavam gerados anteriormente. Preservando trabalho existente.`,
                  company.id
                );
                continue;
              }

              logSession(
                session,
                'info',
                `Gerando cold email, mensagem curta e cover letter para ${contact.email} (${company.name})...`,
                company.id
              );

              try {
                const materials = await generateMaterialsForContact(
                  contact,
                  company,
                  session.profile,
                  company.contacts,
                  session.settings,
                  (lvl, msg) => logSession(session, lvl, msg, company.id)
                );
                contact.materials = materials;
                contact.materialsGenerated = true;
                logSession(
                  session,
                  'success',
                  `Materiais concluídos para ${contact.email} [${materials.keyUsed || materials.generatedBy}]!`,
                  company.id
                );
              } catch (matErr: unknown) {
                // Crucial: DO NOT mark generation as complete when AI fails or key is invalid
                contact.materialsGenerated = false;
                contact.materials = undefined;
                const msg = matErr instanceof Error ? matErr.message : String(matErr);
                logSession(
                  session,
                  'warn',
                  `Geração suspensa para ${contact.email}: ${msg}. O contato foi salvo e os materiais permanecem pendentes.`,
                  company.id
                );
              }
            }
          }

          // Evaluate company completion
          const hasAnyGenerated = company.contacts.some((c) => c.materialsGenerated);
          const hasPending = company.contacts.some(
            (c) =>
              !materialsReady(c, session.settings) &&
              (c.classification === 'Recrutamento confirmado' || c.classification === 'Possível recrutamento' || automaticSpontaneous(c, session.settings))
          );

          if (hasAnyGenerated && !hasPending) {
            company.status = 'Concluído';
          } else if (company.contacts.length > 0) {
            company.status = 'Concluído parcialmente';
          } else {
            company.status = 'Sem contato de recrutamento';
          }
        } else {
          company.status = company.contacts.length > 0 ? 'Concluído parcialmente' : 'Sem contato de recrutamento';
        }
      }

      broadcastSessionEvent(sessionId, 'company_updated', company);
      await saveSessionCheckpoint(session);

      // Polite delay between companies
      if (session.settings.delayBetweenRequestsMs > 0 && i < session.companies.length - 1) {
        await new Promise((r) => setTimeout(r, session.settings.delayBetweenRequestsMs));
      }
    };

    const concurrency = lowResourceMode ? 1 : clampInt(session.settings.maxConcurrency, 1, MAX_PARALLEL, 1);
    if (concurrency > 1 && session.companies.length > 1) {
      logSession(session, 'info', `Pesquisando até ${concurrency} empresas ao mesmo tempo.`);
    }
    await runPool(session.companies.map((_, index) => index), concurrency, async (i) => {
      const acquired = await acquireSharedWorkSlot(() => runnerState.isCancelled);
      if (!acquired) return;
      try { await processCompany(i); } finally { releaseSharedWorkSlot(); }
    }, () => runnerState.isCancelled);

    if (!runnerState.isCancelled) {
      session.status = 'paused';
      session.completedAt = new Date().toISOString();
      logSession(session, 'success', 'Processamento de todas as empresas concluído. Sessão pausada automaticamente ao atingir 100%.');
      broadcastSessionEvent(sessionId, 'status_change', { status: 'paused' });
    }
  } catch (loopError) {
    if (runnerState.isCancelled || (loopError as { isCancelled?: boolean } | null)?.isCancelled) {
      // User cancellation/pause aborts active crawls with UserCancelledError.
      // runPool propagates that error after its workers settle; it is expected control flow.
      if (session.status !== 'cancelled') session.status = 'paused';
      broadcastSessionEvent(sessionId, 'status_change', { status: session.status });
      return;
    }
    console.error('Session execution loop encountered an error:', loopError);
    session.status = 'paused';
    logSession(session, 'error', `Execução do lote pausada: ${String(loopError)}`);
    broadcastSessionEvent(sessionId, 'status_change', { status: 'paused' });
  } finally {
    await saveSessionCheckpoint(session);
  }
}

export async function generateSingleContactMaterials(
  sessionId: string,
  contactId: string
): Promise<RecruitmentContact> {
  assertCurrentDataOperation();
  const session = await loadSessionCheckpoint(sessionId);
  assertCurrentDataOperation();
  if (!session) throw new Error('Sessão não encontrada');

  let targetContact: RecruitmentContact | null = null;
  let targetCompany: CompanyItem | null = null;

  for (const comp of session.companies) {
    assertCurrentDataOperation();
    for (const cont of comp.contacts) {
      assertCurrentDataOperation();
      if (cont.id === contactId) {
        targetContact = cont;
        targetCompany = comp;
        break;
      }
    }
    if (targetContact) break;
  }

  if (!targetContact || !targetCompany) {
    throw new Error('Contato não encontrado');
  }

  logSession(
    session,
    'info',
    `Gerando materiais sob demanda para ${targetContact.email} (${targetCompany.name})...`,
    targetCompany.id
  );

  try {
    const acquired = await acquireSharedWorkSlot(() => false);
    if (!acquired) throw new Error('Não foi possível reservar capacidade para gerar os materiais.');
    try {
    const materials = await generateMaterialsForContact(
      targetContact,
      targetCompany,
      session.profile,
      targetCompany.contacts,
      session.settings,
      (lvl, msg) => logSession(session, lvl, msg, targetCompany.id)
    );

    targetContact.materials = materials;
    targetContact.materialsGenerated = true;

    logSession(
      session,
      'success',
      `Materiais gerados sob demanda com sucesso para ${targetContact.email} [${materials.keyUsed || materials.generatedBy}]!`,
      targetCompany.id
    );

    broadcastSessionEvent(sessionId, 'company_updated', targetCompany);
    await saveSessionCheckpoint(session);

    return targetContact;
    } finally {
      releaseSharedWorkSlot();
    }
  } catch (err: unknown) {
    targetContact.materialsGenerated = false;
    targetContact.materials = undefined;
    const msg = err instanceof Error ? err.message : String(err);
    logSession(
      session,
      'error',
      `Falha ao gerar materiais para ${targetContact.email}: ${msg}`,
      targetCompany.id
    );
    await saveSessionCheckpoint(session);
    broadcastSessionEvent(sessionId, 'company_updated', targetCompany);
    throw err;
  }
}

export async function generateAllPendingMaterials(sessionId: string, spontaneousOnly = false): Promise<SessionState> {
  assertCurrentDataOperation();
  const session = await loadSessionCheckpoint(sessionId);
  assertCurrentDataOperation();
  if (!session) throw new Error('Sessão não encontrada');

  let generatedCount = 0;
  const candidates: Array<{ comp: CompanyItem; cont: RecruitmentContact }> = [];
  for (const comp of session.companies) {
    for (const cont of comp.contacts) candidates.push({ comp, cont });
  }
  // Gerações de IA simultâneas (materialsConcurrency); 1 mantém o comportamento sequencial anterior.
  const limit = lowResourceMode ? 1 : clampInt(session.settings.materialsConcurrency, 1, MAX_PARALLEL, 1);
  if (limit > 1) logSession(session, 'info', `Gerando materiais com até ${limit} chamadas de IA ao mesmo tempo.`);
  await runPool(candidates, limit, async ({ comp, cont }) => {
    assertCurrentDataOperation();
    const acquired = await acquireSharedWorkSlot(() => false);
    if (!acquired) return;
    try {
    // As configurações são conferidas de novo imediatamente antes de cada contato.
    const needsMaterials =
      !materialsReady(cont, session.settings) &&
      (spontaneousOnly ? automaticSpontaneous(cont, session.settings) :
        (cont.classification === 'Recrutamento confirmado' ||
        cont.classification === 'Possível recrutamento' || automaticSpontaneous(cont, session.settings)));
    if (!needsMaterials) return;
    try {
      const materials = await generateMaterialsForContact(
        cont,
        comp,
        session.profile,
        comp.contacts,
        session.settings,
        (lvl, msg) => logSession(session, lvl, msg, comp.id)
      );
      cont.materials = materials;
      cont.materialsGenerated = true;
      generatedCount++;
      await saveSessionCheckpoint(session);
      broadcastSessionEvent(sessionId, 'company_updated', comp);
    } catch (err: unknown) {
      cont.materialsGenerated = false;
      cont.materials = undefined;
      const msg = err instanceof Error ? err.message : String(err);
      logSession(
        session,
        'warn',
        `Não foi possível gerar materiais para ${cont.email}: ${msg}. Mantido como pendente.`,
        comp.id
      );
    }
    } finally {
      releaseSharedWorkSlot();
    }
  });

  logSession(
    session,
    generatedCount > 0 ? 'success' : 'warn',
    `Geração em lote concluída: ${generatedCount} novo(s) material(is) gerado(s).`
  );
  await saveSessionCheckpoint(session);
  broadcastSessionEvent(sessionId, 'session_updated', session);
  return session;
}

// A single background batch per session; settings are checked again before each contact.
const spontaneousBatches = new Map<string, Promise<SessionState>>();
export function queueSpontaneousMaterials(sessionId: string): Promise<SessionState> {
  assertCurrentDataOperation();
  const existing = spontaneousBatches.get(sessionId);
  if (existing) return existing;
  const batch = generateAllPendingMaterials(sessionId, true).finally(() => spontaneousBatches.delete(sessionId));
  spontaneousBatches.set(sessionId, batch);
  return batch;
}

// Invalidate all old tasks before deleting their checkpoints.
export function clearSessionMemoryForReset() {
  waitingSessions.length = 0;
  runningSessions.clear();
  schedulerShuttingDown = false;
  for (const runner of activeRunners.values()) {
    runner.isCancelled = true;
    runner.isPaused = false;
    runner.abortController?.abort('data_reset');
  }
  activeRunners.clear();
  for (const listeners of sseSubscribers.values()) {
    for (const listener of listeners) {
      try { listener({ type: 'data_reset', payload: {} }); } catch {}
    }
  }
  sseSubscribers.clear();
  activeSessions.clear();
  spontaneousBatches.clear();
}

/** Pause and persist every session before the server exits on Ctrl+C. */
export async function pauseAllSessionsForShutdown(waitMs = 8000): Promise<void> {
  schedulerShuttingDown = true;
  waitingSessions.length = 0;
  const listed = await listSessionCheckpoints();
  const sessionIds = new Set([...listed.map((session) => session.sessionId), ...activeRunners.keys()]);
  const completions: Promise<void>[] = [];

  for (const sessionId of sessionIds) {
    const session = await loadSessionCheckpoint(sessionId);
    const runner = activeRunners.get(sessionId);
    if (runner) {
      runner.isPaused = false;
      runner.isCancelled = true;
      runner.abortController?.abort('server_shutdown_pause');
      const completion = runnerCompletions.get(sessionId);
      if (completion) completions.push(completion);
    }
    if (!session || (session.status !== 'running' && !runner)) continue;
    session.status = 'paused';
    logSession(session, 'warn', 'Servidor encerrado pelo usuário. Progresso salvo para retomar depois.');
    broadcastSessionEvent(sessionId, 'status_change', { status: 'paused' });
    await saveSessionCheckpoint(session);
  }

  if (completions.length) {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([
      Promise.allSettled(completions),
      new Promise<void>((resolve) => { timeout = setTimeout(resolve, waitMs); }),
    ]);
    if (timeout) clearTimeout(timeout);
  }

  // A runner may have written its last checkpoint while aborting. Make paused status the final write.
  for (const sessionId of sessionIds) {
    const session = await loadSessionCheckpoint(sessionId);
    if (!session || session.status === 'completed') continue;
    if (session.status !== 'paused') {
      session.status = 'paused';
      logSession(session, 'warn', 'Servidor encerrado pelo usuário. Progresso salvo para retomar depois.');
    }
    await saveSessionCheckpoint(session);
  }
}
