import { withDataOperation, isResettingData, resetDataDirectory } from './server/dataLifecycle.js';
import { clearSessionMemoryForReset } from './server/jobRunner.js';
import { clearTrackingMemoryForReset } from './server/trackingDb.js';
import { clearVacanciesMemoryForReset } from './server/vacancyManager.js';
import { INTEGRATIONS, testIntegration, integrationStatus, integrationDefaults, resetIntegrationCircuit } from './server/integrations.js';
import express, { Request, Response } from 'express';
import path from 'path';
import fsp from 'node:fs/promises';
import { parseSavedProfile, SAVED_PROFILE_SLOTS } from './src/savedProfiles.js';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';

// Ensure no global TLS verification bypass exists
if (process.env.NODE_TLS_REJECT_UNAUTHORIZED !== undefined) {
  delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
}

dotenv.config();

import { extractTextFromBuffer, parseResumeWithAI } from './server/documentParser.js';
import { getGeminiClient } from './server/gemini.js';
import { getOpenAIClient } from './server/openai.js';
import { normalizeUrl } from './server/extractor.js';
import {
  startOrResumeSession,
  pauseSession,
  cancelSession,
  retryFailedCompanies,
  loadSessionCheckpoint,
  saveSessionCheckpoint,
  getActiveOrLatestSession,
  listSessionCheckpoints,
  deleteSessionCheckpoint,
  pauseAllSessionsForShutdown,
  subscribeToSession,
  broadcastSessionEvent,
  generateSingleContactMaterials,
  generateAllPendingMaterials,
  queueSpontaneousMaterials,
  setMaxConcurrentSessions,
  setLowResourceMode,
} from './server/jobRunner.js';
import {
  resolveGeminiCredentials,
  resolveOpenAiCredentials,
  resolvePerplexityCredentials,
  testGeminiCall,
  testOpenAiCall,
  testPerplexityCall,
  unblockProviderCircuit,
  getProviderCircuitStates,
} from './server/credentials.js';
import {
  generateContactsCsv,
  generateApplicationsCsv,
  generateRemainingCompaniesCsv,
  generateRemainingUrlsTxt,
  generateResultsJson,
  generateLogsTxt,
  generateZipArchive,
} from './server/exporter.js';
import {
  getAllTrackedContacts,
  upsertTrackedContact,
  updateTrackedContactStatus,
  removeTrackedContact,
} from './server/trackingDb.js';
import {
  getAllTrackedVacancies,
  reconcileCompanyVacancies,
  reconcileVacancies,
} from './server/vacancyManager.js';
import { SessionState, CompanyItem, CandidateProfile, JobSettings, Vacancy } from './src/types/index.js';

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const isProd = process.env.NODE_ENV === 'production';

// Body parsers with generous limits for file uploads
app.use(express.json({ limit: '30mb' }));
app.use(express.urlencoded({ extended: true, limit: '30mb' }));

// Capture the data generation for requests and their background continuations.
app.use('/api', (_req, res, next) => {
  if (isResettingData()) return res.status(503).json({ error: 'Limpeza dos dados em andamento. Tente novamente em instantes.' });
  withDataOperation(() => next());
});

app.post('/api/data/reset', async (req: Request, res: Response) => {
  if (req.body?.confirmation !== 'APAGAR DADOS') {
    return res.status(400).json({ error: 'Confirmação de limpeza inválida.' });
  }
  try {
    await resetDataDirectory(() => {
      clearSessionMemoryForReset();
      clearTrackingMemoryForReset();
      clearVacanciesMemoryForReset();
    });
    return res.json({ success: true, message: 'Todo o conteúdo da pasta data foi apagado.' });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Não foi possível limpar os dados.' });
  }
});

// 1. Resume extraction API
app.post('/api/extract-cv', async (req: Request, res: Response) => {
  try {
    const { fileBase64, fileName, mimeType, rawText, cvLang, settings } = req.body;
    let fullText = '';

    if (rawText && typeof rawText === 'string' && rawText.trim().length > 0) {
      fullText = rawText;
    } else if (fileBase64 && fileName) {
      const buffer = Buffer.from(fileBase64, 'base64');
      fullText = await extractTextFromBuffer(buffer, fileName, mimeType);
    } else {
      return res.status(400).json({ error: 'Nenhum arquivo ou texto de currículo foi enviado.' });
    }

    if (!fullText || fullText.trim().length < 20) {
      return res.status(400).json({
        error: 'Não foi possível extrair texto do documento fornecido. Certifique-se de que o arquivo contém texto selecionável ou cole o conteúdo diretamente.',
      });
    }

    const profile = await parseResumeWithAI(fullText, (cvLang as 'pt' | 'en') || 'pt', settings);
    return res.json({ profile, rawText: fullText });
  } catch (err: unknown) {
    console.error('Error in /api/extract-cv:', err);
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: `Falha ao processar currículo: ${msg}` });
  }
});

// 1.1 Test AI Connection API (Google Gemini & OpenAI ChatGPT)
// Strictly validates keys with documented precedence, never leaks keys in logs or responses.
app.post('/api/test-ai-connection', async (req: Request, res: Response) => {
  try {
    const { provider, apiKey, model } = req.body;

    if (INTEGRATIONS.includes(provider)) {
      const result = await testIntegration(provider, apiKey, model);
      if (result.success && provider === 'openrouter') unblockProviderCircuit('openrouter');
      return res.status(result.success ? 200 : 400).json(result);
    }
    if (provider === 'gemini') {
      const resolved = resolveGeminiCredentials({ geminiApiKey: apiKey, geminiModel: model } as any);
      if (!resolved.isConfigured) {
        return res.status(400).json({
          success: false,
          provider: 'gemini',
          keySource: resolved.source,
          error:
            'Chave do Google Gemini não configurada ou é um texto de exemplo. Configure GEMINI_API_KEY no arquivo .env ou informe uma chave válida no campo.',
        });
      }

      const result = await testGeminiCall(resolved.key, resolved.model);
      if (result.success) {
        unblockProviderCircuit('gemini');
      }
      return res.status(result.success ? 200 : 400).json({
        ...result,
        provider: 'gemini',
        keySource: resolved.source,
        model: resolved.model,
      });
    } else if (provider === 'openai') {
      const resolved = resolveOpenAiCredentials({ openaiApiKey: apiKey, openaiModel: model } as any);
      if (!resolved.isConfigured) {
        return res.status(400).json({
          success: false,
          provider: 'openai',
          keySource: resolved.source,
          error:
            'Chave da OpenAI não configurada ou é um texto de exemplo. Configure OPENAI_API_KEY no arquivo .env ou informe uma chave válida no campo.',
        });
      }

      const result = await testOpenAiCall(resolved.key, resolved.model);
      if (result.success) {
        unblockProviderCircuit('openai');
      }
      return res.status(result.success ? 200 : 400).json({
        ...result,
        provider: 'openai',
        keySource: resolved.source,
        model: resolved.model,
      });
    } else if (provider === 'perplexity') {
      const resolved = resolvePerplexityCredentials({ perplexityApiKey: apiKey, perplexityModel: model } as any);
      if (!resolved.isConfigured) {
        return res.status(400).json({
          success: false,
          provider: 'perplexity',
          keySource: resolved.source,
          error:
            'Chave da Perplexity AI não configurada ou é um texto de exemplo. Configure PERPLEXITY_API_KEY no arquivo .env ou informe uma chave válida no campo.',
        });
      }

      const result = await testPerplexityCall(resolved.key, resolved.model);
      if (result.success) {
        unblockProviderCircuit('perplexity');
      }
      return res.status(result.success ? 200 : 400).json({
        ...result,
        provider: 'perplexity',
        keySource: resolved.source,
        model: resolved.model,
      });
    } else {
      return res.status(400).json({ error: 'Provedor desconhecido. Use "gemini", "openai" ou "perplexity".' });
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ success: false, error: msg });
  }
});

app.get('/api/integrations/status', (_req: Request, res: Response) => res.json({ ...integrationStatus(), defaults: integrationDefaults() }));

// 1.2 Get AI Provider Status API (circuits and configuration sources, no keys exposed)
app.get('/api/ai/status', (req: Request, res: Response) => {
  const gemini = resolveGeminiCredentials();
  const openai = resolveOpenAiCredentials();
  const perplexity = resolvePerplexityCredentials();
  const circuitStates = getProviderCircuitStates();

  return res.json({
    gemini: {
      configured: gemini.isConfigured,
      source: gemini.source,
      model: gemini.model,
      blocked: circuitStates.gemini.isBlocked,
      blockedReason: circuitStates.gemini.blockedReason,
    },
    openai: {
      configured: openai.isConfigured,
      source: openai.source,
      model: openai.model,
      blocked: circuitStates.openai.isBlocked,
      blockedReason: circuitStates.openai.blockedReason,
    },
    perplexity: {
      configured: perplexity.isConfigured,
      source: perplexity.source,
      model: perplexity.model,
      blocked: circuitStates.perplexity.isBlocked,
      blockedReason: circuitStates.perplexity.blockedReason,
    },
  });
});

// 2. Initialize new session
app.post('/api/session/init', async (req: Request, res: Response) => {
  try {
    const { rawCompanies, profile, settings } = req.body as {
      rawCompanies: { name?: string; url: string }[];
      profile: CandidateProfile;
      settings: JobSettings;
    };

    if (!rawCompanies || !Array.isArray(rawCompanies) || rawCompanies.length === 0) {
      return res.status(400).json({ error: 'Lista de empresas não pode ser vazia.' });
    }

    const sessionId = `ses_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const companies: CompanyItem[] = rawCompanies
      .filter((c) => c && c.url && c.url.trim().length > 0)
      .map((c, idx) => {
        const normalized = normalizeUrl(c.url);
        let derivedName = c.name?.trim();
        if (!derivedName) {
          try {
            const host = new URL(normalized).hostname;
            derivedName = host.replace(/^www\./, '').split('.')[0];
            derivedName = derivedName.charAt(0).toUpperCase() + derivedName.slice(1);
          } catch {
            derivedName = `Empresa ${idx + 1}`;
          }
        }

        return {
          id: `comp_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 6)}`,
          name: derivedName,
          rawUrl: c.url,
          normalizedUrl: normalized,
          status: 'Pendente',
          visitedPages: [],
          vacanciesFound: [],
          contacts: [],
          updatedAt: new Date().toISOString(),
        };
      });

    const newSession: SessionState = {
      sessionId,
      name: typeof req.body.name === 'string' && req.body.name.trim() ? req.body.name.trim() : `Seção ${new Date().toLocaleString('pt-BR')}`,
      companies,
      profile: profile || {
        name: '',
        email: '',
        location: '',
        summary: '',
        targetRoles: [],
        prioritySkills: [],
        workPreference: 'any',
        professionalLinks: [],
        experiences: [],
        education: [],
        certifications: [],
        languages: [],
        materialLanguage: 'pt',
        parsedFromCv: false,
      },
      settings: settings || {
        maxPagesPerCompany: 5,
        requestTimeoutMs: 10000,
        delayBetweenRequestsMs: 600,
        maxConcurrency: 1,
        generateMaterialsForPossible: false,
      },
      status: 'idle',
      currentCompanyIndex: 0,
      logs: [
        {
          id: `log_init`,
          timestamp: new Date().toLocaleTimeString('pt-BR', { hour12: false }),
          level: 'info',
          message: `Sessão criada com ${companies.length} empresa(s) carregada(s).`,
        },
      ],
    };

    await saveSessionCheckpoint(newSession);
    return res.json({ sessionId, session: newSession });
  } catch (err: unknown) {
    console.error('Error in /api/session/init:', err);
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: `Erro ao iniciar sessão: ${msg}` });
  }
});

app.post('/api/session/draft', async (req: Request, res: Response) => {
  try {
    const sessionId = `ses_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const draft: SessionState = {
      sessionId,
      name: typeof req.body.name === 'string' && req.body.name.trim() ? req.body.name.trim() : 'Nova seção',
      companies: [],
      profile: req.body.profile,
      settings: req.body.settings,
      status: 'idle',
      currentCompanyIndex: 0,
      logs: [{ id: `log_${Date.now()}`, timestamp: new Date().toLocaleTimeString('pt-BR', { hour12: false }), level: 'info', message: 'Seção criada. Aguardando empresas e perfil.' }],
    };
    await saveSessionCheckpoint(draft);
    return res.json({ session: draft });
  } catch (err) { return res.status(500).json({ error: err instanceof Error ? err.message : 'Não foi possível criar a seção.' }); }
});

app.post('/api/session/:id/prepare', async (req: Request, res: Response) => {
  try {
    const session = await loadSessionCheckpoint(req.params.id);
    if (!session) return res.status(404).json({ error: 'Seção não encontrada.' });
    if (session.status !== 'idle' || session.companies.length) return res.status(409).json({ error: 'Esta seção já foi preparada ou iniciada.' });
    const rawCompanies = Array.isArray(req.body.rawCompanies) ? req.body.rawCompanies : [];
    if (!rawCompanies.length) return res.status(400).json({ error: 'Carregue ao menos uma empresa.' });
    session.companies = rawCompanies.filter((c: any) => c?.url?.trim()).map((c: any, idx: number) => {
      const normalized = normalizeUrl(c.url);
      let name = c.name?.trim();
      if (!name) { try { name = new URL(normalized).hostname.replace(/^www\./, '').split('.')[0]; name = name.charAt(0).toUpperCase() + name.slice(1); } catch { name = `Empresa ${idx + 1}`; } }
      return { id: `comp_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 6)}`, name, rawUrl: c.url, normalizedUrl: normalized, status: 'Pendente', visitedPages: [], vacanciesFound: [], contacts: [], updatedAt: new Date().toISOString() };
    });
    session.profile = req.body.profile;
    session.settings = req.body.settings;
    await saveSessionCheckpoint(session);
    return res.json({ session });
  } catch (err) { return res.status(500).json({ error: err instanceof Error ? err.message : 'Não foi possível preparar a seção.' }); }
});

app.get('/api/sessions', async (_req: Request, res: Response) => {
  try { return res.json({ sessions: await listSessionCheckpoints() }); }
  catch { return res.status(500).json({ error: 'Não foi possível listar as seções.' }); }
});

const GLOBAL_SETTINGS_PATH = path.resolve(process.cwd(), 'data', 'global_settings.json');
app.get('/api/settings/global', async (_req: Request, res: Response) => {
  try {
    const raw = await fsp.readFile(GLOBAL_SETTINGS_PATH, 'utf-8').catch((err: NodeJS.ErrnoException) => err.code === 'ENOENT' ? '{}' : Promise.reject(err));
    return res.json({ settings: JSON.parse(raw) });
  } catch (err) { return res.status(500).json({ error: err instanceof Error ? err.message : 'Não foi possível carregar as configurações globais.' }); }
});

app.put('/api/settings/global', async (req: Request, res: Response) => {
  try {
    const incoming = req.body?.settings;
    if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) return res.status(400).json({ error: 'Configurações inválidas.' });
    const raw = await fsp.readFile(GLOBAL_SETTINGS_PATH, 'utf-8').catch((err: NodeJS.ErrnoException) => err.code === 'ENOENT' ? '{}' : Promise.reject(err));
    const settings = { ...JSON.parse(raw), ...incoming } as JobSettings;
    if (incoming.maxConcurrentSections !== undefined) setMaxConcurrentSessions(settings.maxConcurrentSections ?? 1);
    if (incoming.lowResourceMode !== undefined) setLowResourceMode(settings.lowResourceMode === true);
    await fsp.mkdir(path.dirname(GLOBAL_SETTINGS_PATH), { recursive: true });
    await fsp.writeFile(GLOBAL_SETTINGS_PATH, JSON.stringify(settings, null, 2), 'utf-8');
    const listedSections = await listSessionCheckpoints();
    const sections: SessionState[] = [];
    for (const listed of listedSections) {
      // Keep the live object used by a background runner instead of replacing it with a disk snapshot.
      const section = await loadSessionCheckpoint(listed.sessionId) || listed;
      section.settings = { ...settings };
      if (settings.defaultViewLanguage === 'pt' || settings.defaultViewLanguage === 'en') section.profile = { ...section.profile, defaultViewLanguage: settings.defaultViewLanguage };
      await saveSessionCheckpoint(section);
      sections.push(section);
    }
    return res.json({ settings, updatedSections: sections.length });
  } catch (err) { return res.status(500).json({ error: err instanceof Error ? err.message : 'Não foi possível salvar as configurações globais.' }); }
});

app.patch('/api/session/:id', async (req: Request, res: Response) => {
  try {
    const session = await loadSessionCheckpoint(req.params.id);
    if (!session) return res.status(404).json({ error: 'Seção não encontrada.' });
    if (typeof req.body.name === 'string') session.name = req.body.name.trim() || session.name;
    await saveSessionCheckpoint(session);
    return res.json({ session });
  } catch (err) { return res.status(400).json({ error: err instanceof Error ? err.message : 'Não foi possível atualizar a seção.' }); }
});

app.delete('/api/session/:id', async (req: Request, res: Response) => {
  try { await deleteSessionCheckpoint(req.params.id); return res.json({ success: true }); }
  catch (err) { return res.status(409).json({ error: err instanceof Error ? err.message : 'Não foi possível excluir a seção.' }); }
});

// 2.5 Get active or most recent session
app.get('/api/session/active', async (req: Request, res: Response) => {
  try {
    const session = await getActiveOrLatestSession();
    return res.json({ session });
  } catch (err: unknown) {
    console.error('Error fetching active session:', err);
    return res.status(500).json({ error: 'Erro ao verificar sessão ativa' });
  }
});

// 3. Get session
app.get('/api/session/:id', async (req: Request, res: Response) => {
  try {
    const session = await loadSessionCheckpoint(req.params.id);
    if (!session) {
      return res.status(404).json({ error: 'Sessão não encontrada' });
    }
    return res.json({ session });
  } catch (err: unknown) {
    console.error('Error fetching session:', err);
    return res.status(500).json({ error: 'Erro ao carregar sessão' });
  }
});

// 4. Session Controls (Start / Resume / Pause / Cancel / Retry)
app.post('/api/session/:id/start', async (req: Request, res: Response) => {
  try {
    const session = await startOrResumeSession(req.params.id);
    return res.json({ session });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: msg });
  }
});

app.post('/api/session/:id/pause', async (req: Request, res: Response) => {
  try {
    const session = await pauseSession(req.params.id);
    return res.json({ session });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: msg });
  }
});

app.post('/api/session/:id/resume', async (req: Request, res: Response) => {
  try {
    const session = await startOrResumeSession(req.params.id);
    return res.json({ session });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: msg });
  }
});

app.post('/api/session/:id/cancel', async (req: Request, res: Response) => {
  try {
    const session = await cancelSession(req.params.id);
    return res.json({ session });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: msg });
  }
});

app.post('/api/session/:id/retry-failed', async (req: Request, res: Response) => {
  try {
    const session = await retryFailedCompanies(req.params.id);
    return res.json({ session });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: msg });
  }
});

// 5. Generate materials for a single contact on demand
app.post('/api/session/:id/generate-contact-materials', async (req: Request, res: Response) => {
  try {
    const { contactId } = req.body;
    if (!contactId) return res.status(400).json({ error: 'contactId é obrigatório' });

    const updatedContact = await generateSingleContactMaterials(req.params.id, contactId);
    return res.json({ contact: updatedContact });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: msg });
  }
});

// 5.1 Generate all pending materials in bulk
app.post('/api/session/:id/generate-all-pending-materials', async (req: Request, res: Response) => {
  try {
    const session = await generateAllPendingMaterials(req.params.id);
    return res.json({ session });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: msg });
  }
});

// 5.2 Update session settings
app.post('/api/session/:id/settings', async (req: Request, res: Response) => {
  try {
    const { settings } = req.body;
    if (!settings) return res.status(400).json({ error: 'Configurações não enviadas' });

    const session = await loadSessionCheckpoint(req.params.id);
    if (!session) return res.status(404).json({ error: 'Sessão não encontrada' });

    session.settings = {
      ...session.settings,
      ...settings,
    };

    // Língua Padrão do "Visualizar": mantém o perfil da sessão em sincronia com as configurações.
    if (settings.defaultViewLanguage === 'pt' || settings.defaultViewLanguage === 'en') {
      session.profile = { ...session.profile, defaultViewLanguage: settings.defaultViewLanguage };
    }

    for (const provider of INTEGRATIONS) resetIntegrationCircuit(provider);
    unblockProviderCircuit('openrouter');
    // If new credentials were provided, proactively unblock provider circuits
    if (settings.geminiApiKey && settings.geminiApiKey.trim().length > 10) {
      unblockProviderCircuit('gemini');
    }
    if (settings.openaiApiKey && settings.openaiApiKey.trim().length > 10) {
      unblockProviderCircuit('openai');
    }
    if (settings.perplexityApiKey && settings.perplexityApiKey.trim().length > 10) {
      unblockProviderCircuit('perplexity');
    }

    await saveSessionCheckpoint(session);
    broadcastSessionEvent(session.sessionId, 'session_updated', session);

    res.json({ success: true, session });
    if (session.settings.generateMaterialsForSpontaneous) {
      void queueSpontaneousMaterials(session.sessionId).catch(err => console.error('Falha na fila de materiais espontâneos:', err));
    }
    return;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: msg });
  }
});

// 6. Update edited material
app.put('/api/session/:id/update-material', async (req: Request, res: Response) => {
  try {
    const { contactId, materials } = req.body;
    const session = await loadSessionCheckpoint(req.params.id);
    if (!session) return res.status(404).json({ error: 'Sessão não encontrada' });

    let updated = false;
    for (const comp of session.companies) {
      for (const cont of comp.contacts) {
        if (cont.id === contactId) {
          cont.materials = {
            ...cont.materials,
            ...materials,
            isEdited: true,
          };
          updated = true;
          break;
        }
      }
      if (updated) break;
    }

    if (!updated) return res.status(404).json({ error: 'Contato não encontrado' });

    await saveSessionCheckpoint(session);
    return res.json({ success: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: msg });
  }
});

// 6.0 Perfis salvos (até SAVED_PROFILE_SLOTS). Ficam em saved-profiles/, FORA de data/,
// para que o "Apagar dados" não leve os perfis junto.
const SAVED_PROFILES_DIR = path.resolve(process.cwd(), 'saved-profiles');
const savedProfileFile = (slot: number) => path.join(SAVED_PROFILES_DIR, `perfil-${slot}.json`);
const parseProfileSlot = (value: string): number | null => {
  const slot = Number(value);
  return Number.isInteger(slot) && slot >= 1 && slot <= SAVED_PROFILE_SLOTS ? slot : null;
};

app.get('/api/saved-profiles', async (_req: Request, res: Response) => {
  const profiles: { slot: number; profile: unknown; error?: string }[] = [];
  for (let slot = 1; slot <= SAVED_PROFILE_SLOTS; slot++) {
    try {
      const text = await fsp.readFile(savedProfileFile(slot), 'utf-8');
      profiles.push({ slot, profile: parseSavedProfile(text, `Perfil ${slot}`) });
    } catch (err: any) {
      profiles.push({
        slot,
        profile: null,
        ...(err?.code === 'ENOENT' ? {} : { error: 'O arquivo deste perfil está ilegível ou inválido.' }),
      });
    }
  }
  return res.json({ profiles });
});

app.put('/api/saved-profiles/:slot', async (req: Request, res: Response) => {
  const slot = parseProfileSlot(req.params.slot);
  if (!slot) return res.status(400).json({ error: `Use um slot de 1 a ${SAVED_PROFILE_SLOTS}.` });
  let saved;
  try {
    saved = { ...parseSavedProfile(req.body, `Perfil ${slot}`), savedAt: new Date().toISOString() };
  } catch (err: unknown) {
    return res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
  try {
    await fsp.mkdir(SAVED_PROFILES_DIR, { recursive: true });
    const target = savedProfileFile(slot);
    const temp = `${target}.tmp`;
    await fsp.writeFile(temp, JSON.stringify(saved, null, 2) + '\n', 'utf-8');
    await fsp.rename(temp, target);
    return res.json({ success: true, slot, profile: saved });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: `Não foi possível gravar o perfil: ${msg}` });
  }
});

app.delete('/api/saved-profiles/:slot', async (req: Request, res: Response) => {
  const slot = parseProfileSlot(req.params.slot);
  if (!slot) return res.status(400).json({ error: `Use um slot de 1 a ${SAVED_PROFILE_SLOTS}.` });
  try {
    await fsp.unlink(savedProfileFile(slot));
  } catch (err: any) {
    if (err?.code !== 'ENOENT') {
      return res.status(500).json({ error: `Não foi possível excluir o perfil: ${err?.message || err}` });
    }
  }
  return res.json({ success: true, slot });
});

// 6.1 CRM Tracking & Follow-up routes
app.get('/api/tracking', async (req: Request, res: Response) => {
  try {
    const allContacts = await getAllTrackedContacts();
    const contacts = req.query.sessionId ? allContacts.filter((c) => c.sessionId === String(req.query.sessionId)) : allContacts;
    return res.json({ contacts });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: msg });
  }
});

app.post('/api/tracking/upsert', async (req: Request, res: Response) => {
  try {
    const { contactRecord, sessionId } = req.body;
    if (!contactRecord || !contactRecord.id) {
      return res.status(400).json({ error: 'Dados do contato inválidos.' });
    }

    const saved = await upsertTrackedContact(contactRecord);

    // If sessionId provided, also update session checkpoint in memory & disk
    if (sessionId) {
      const session = await loadSessionCheckpoint(sessionId);
      if (session) {
        for (const comp of session.companies) {
          for (const c of comp.contacts) {
            if (c.id === contactRecord.id || (c.email === contactRecord.email && comp.name === contactRecord.companyName)) {
              c.outreachStatus = contactRecord.status;
              c.contactedAt = contactRecord.contactedAt;
              c.discardedAt = contactRecord.discardedAt;
              c.notes = contactRecord.notes;
              c.discardReason = contactRecord.discardReason;
            }
          }
        }
        await saveSessionCheckpoint(session);
      }
    }

    return res.json({ success: true, contact: saved });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: msg });
  }
});

app.post('/api/tracking/update-status', async (req: Request, res: Response) => {
  try {
    const { id, status, contactedAt, discardedAt, interviewAt, notes, discardReason, sessionId } = req.body;
    if (!id) return res.status(400).json({ error: 'ID obrigatório.' });

    const updated = await updateTrackedContactStatus(id, {
      status,
      contactedAt,
      discardedAt,
      interviewAt,
      notes,
      discardReason,
    });

    if (sessionId) {
      const session = await loadSessionCheckpoint(sessionId);
      if (session) {
        for (const comp of session.companies) {
          for (const c of comp.contacts) {
            if (c.id === id) {
              if (status !== undefined) c.outreachStatus = status;
              if (contactedAt !== undefined) c.contactedAt = contactedAt;
              if (discardedAt !== undefined) c.discardedAt = discardedAt;
              if (interviewAt !== undefined) c.interviewAt = interviewAt;
              if (notes !== undefined) c.notes = notes;
              if (discardReason !== undefined) c.discardReason = discardReason;
            }
          }
        }
        await saveSessionCheckpoint(session);
      }
    }

    return res.json({ success: true, contact: updated });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: msg });
  }
});

app.delete('/api/tracking/:id', async (req: Request, res: Response) => {
  try {
    await removeTrackedContact(req.params.id);
    return res.json({ success: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: msg });
  }
});

// 6.2 Vacancy Tracking & Deduplication verification routes
app.get('/api/vacancies', async (req: Request, res: Response) => {
  try {
    const all = await getAllTrackedVacancies();
    const { companyId, isModified } = req.query;

    let filtered = all;
    if (companyId && typeof companyId === 'string') {
      filtered = filtered.filter((v) => v.companyId === companyId);
    }
    if (isModified === 'true') {
      filtered = filtered.filter((v) => v.isModified === true);
    }

    const modifiedCount = all.filter((v) => v.isModified === true).length;
    const newCount = all.filter((v) => !v.isModified).length;

    return res.json({
      vacancies: filtered,
      totalCount: all.length,
      modifiedCount,
      newCount,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: msg });
  }
});

app.post('/api/vacancies/verify', async (req: Request, res: Response) => {
  try {
    const { existingVacancies, incomingVacancies, companyId, companyName } = req.body as {
      existingVacancies?: Vacancy[];
      incomingVacancies: Vacancy[];
      companyId?: string;
      companyName?: string;
    };

    if (!incomingVacancies || !Array.isArray(incomingVacancies)) {
      return res.status(400).json({ error: 'incomingVacancies deve ser uma lista de vagas.' });
    }

    const baseline = existingVacancies && Array.isArray(existingVacancies) ? existingVacancies : [];
    const result = reconcileVacancies(baseline, incomingVacancies, { companyId, companyName });

    return res.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: msg });
  }
});

// 7. SSE Real-Time Stream
app.get('/api/session/:id/stream', (req: Request, res: Response) => {
  const sessionId = req.params.id;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  // Send initial ping
  res.write(`data: ${JSON.stringify({ type: 'connected', payload: { sessionId } })}\n\n`);

  const unsubscribe = subscribeToSession(sessionId, (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  });

  req.on('close', () => {
    unsubscribe();
  });
});

// 8. Exports
app.get('/api/session/:id/export/:type', async (req: Request, res: Response) => {
  try {
    const { id, type } = req.params;
    let session = await loadSessionCheckpoint(id);
    if (!session) return res.status(404).json({ error: 'Sessão não encontrada' });

    // Optional query filtering for targeted exports (e.g. ?ids=id1,id2 or ?status=pending)
    const idsQuery = (req.query.ids || req.query.contactIds) as string | undefined;
    const statusQuery = req.query.status as string | undefined;

    if (idsQuery || statusQuery) {
      const allowedIds = idsQuery ? new Set(idsQuery.split(',').map((s) => s.trim())) : null;
      session = {
        ...session,
        companies: session.companies
          .map((c) => ({
            ...c,
            contacts: c.contacts.filter((cnt) => {
              if (allowedIds && !allowedIds.has(cnt.id)) return false;
              if (statusQuery && statusQuery !== 'all' && (cnt.outreachStatus || 'pending') !== statusQuery) {
                return false;
              }
              return true;
            }),
          }))
          .filter((c) => c.contacts.length > 0),
      };
    }

    if (type === 'contatos.csv') {
      const csv = generateContactsCsv(session);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="contatos.csv"');
      return res.send(csv);
    }

    if (type === 'candidaturas.csv') {
      const csv = generateApplicationsCsv(session);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="candidaturas.csv"');
      return res.send(csv);
    }

    if (type === 'empresas_restantes.csv' || type === 'onde_parou.csv') {
      const csv = generateRemainingCompaniesCsv(session);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="empresas_restantes_de_onde_parou.csv"');
      return res.send(csv);
    }

    if (type === 'empresas_restantes.txt' || type === 'onde_parou.txt') {
      const txt = generateRemainingUrlsTxt(session);
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="urls_restantes_de_onde_parou.txt"');
      return res.send(txt);
    }

    if (type === 'resultados.json') {
      const json = generateResultsJson(session);
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="resultados.json"');
      return res.send(json);
    }

    if (type === 'logs.txt') {
      const txt = generateLogsTxt(session);
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="logs.txt"');
      return res.send(txt);
    }

    if (type === 'candidaturas.zip') {
      const zipBuffer = await generateZipArchive(session);
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', 'attachment; filename="candidaturas_completas.zip"');
      return res.send(zipBuffer);
    }

    return res.status(400).json({ error: 'Tipo de exportação desconhecido.' });
  } catch (err: unknown) {
    console.error('Export error:', err);
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: `Erro na exportação: ${msg}` });
  }
});

// Vite middleware in dev or static files in production
async function startServer() {
  try {
    const rawSettings = await fsp.readFile(GLOBAL_SETTINGS_PATH, 'utf-8');
    const globalSettings = JSON.parse(rawSettings) as JobSettings;
    setMaxConcurrentSessions(globalSettings.maxConcurrentSections ?? 1);
    setLowResourceMode(globalSettings.lowResourceMode === true);
  } catch (err) {
    if (!(err instanceof Error && 'code' in err && err.code === 'ENOENT')) console.warn('Não foi possível ler o limite global de seções:', err);
    setMaxConcurrentSessions(1);
    setLowResourceMode(false);
  }
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(process.cwd(), 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(process.cwd(), 'dist', 'index.html'));
    });
  }

  const httpServer = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });

  let shutdownStarted = false;
  process.on('SIGINT', () => {
    if (shutdownStarted) {
      console.warn('Encerramento forçado solicitado.');
      process.exit(1);
    }
    shutdownStarted = true;
    console.log('\nCtrl+C recebido. Pausando e salvando as seções em andamento...');
    void (async () => {
      try {
        await pauseAllSessionsForShutdown();
        console.log('Progresso salvo. Encerrando o servidor.');
      } catch (err) {
        console.error('Falha ao salvar uma seção durante o encerramento:', err);
      } finally {
        httpServer.close();
        httpServer.closeAllConnections?.();
        process.exit(0);
      }
    })();
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
});
