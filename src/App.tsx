import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Header } from './components/Header.tsx';
import { StepNav, StepId } from './components/StepNav.tsx';
import { CsvUploader, ParsedCompanyInput } from './components/CsvUploader.tsx';
import { ProfileEditor } from './components/ProfileEditor.tsx';
import { SettingsModal } from './components/SettingsModal.tsx';
import { SavedProfilesModal } from './components/SavedProfilesModal.tsx';
import { configToSettings, type SavedProfile, type SavedProfileBlocks } from './savedProfiles.ts';
import { ExecutionPanel } from './components/ExecutionPanel.tsx';
import { ContactsTable } from './components/ContactsTable.tsx';
import { TrackingDashboard } from './components/TrackingDashboard.tsx';
import { MaterialModal } from './components/MaterialModal.tsx';
import { ExportPanel } from './components/ExportPanel.tsx';
import { WelcomeDashboard } from './components/WelcomeDashboard.tsx';
import { OverviewContactFilters } from './components/OverviewContactFilters.tsx';
import { EmailMaterialsPage } from './components/EmailMaterialsPage.tsx';
import { SAMPLE_PROFILE, SAMPLE_COMPANIES_CSV } from './utils/sampleData.ts';
import { initGlobalMiddleClick } from './utils/openLink.ts';
import {
  SessionState,
  CandidateProfile,
  JobSettings,
  RecruitmentContact,
  CompanyItem,
  GeneratedMaterials,
} from './types/index.ts';
import { resolveDefaultViewLanguage } from './utils/viewLanguage.ts';
import { getManualOutreachEntries, manualOutreachUpdatedEvent, type ManualOutreachEntry } from './utils/manualOutreach.ts';
import { Play, ArrowRight, ShieldCheck, Sparkles, AlertCircle, Loader2, RotateCcw, MailSearch, Copy, Check, ChevronDown } from 'lucide-react';

const DEFAULT_SETTINGS: JobSettings = {
  maxConcurrentSections: 1,
  lowResourceMode: false,
  maxPagesPerCompany: 5,
  requestTimeoutMs: 10000,
  delayBetweenRequestsMs: 600,
  maxConcurrency: 1,
  generateMaterialsForPossible: false,
  generateMaterialsForSpontaneous: false,
  aiProvider: 'auto',
  openaiModel: 'gpt-4o-mini',
  geminiModel: 'gemini-3.8-flash',
  generateDualLanguage: true,
  emailBlacklist: ['pr@', 'legal@', 'privacy@'],
};

const EMPTY_PROFILE: CandidateProfile = {
  name: '',
  email: '',
  phone: '',
  location: '',
  summary: '',
  summaryEn: '',
  targetRoles: [],
  prioritySkills: [],
  workPreference: 'any',
  professionalLinks: [],
  experiences: [],
  education: [],
  certifications: [],
  languages: [],
  writingStyleSample: '',
  additionalNotes: '',
  materialLanguage: 'both',
  parsedFromCv: false,
};

const getInitialStep = (): StepId => {
  try {
    const params = new URLSearchParams(window.location.search);
    const step = params.get('step') as StepId;
    if (step === '0') return 'home';
    if (step && ['home', 'input', 'execution', 'results', 'tracking', 'export', 'overview', 'email-materials'].includes(step)) {
      return step as StepId;
    }
  } catch {}
  return 'home';
};

export default function App() {
  const [currentStep, setCurrentStepState] = useState<StepId>(getInitialStep);

  const setCurrentStep = useCallback((step: StepId | ((prev: StepId) => StepId)) => {
    setCurrentStepState((prev) => {
      const next = typeof step === 'function' ? step(prev) : step;
      try {
        const url = new URL(window.location.href);
        url.searchParams.set('step', next === 'home' ? '0' : next);
        window.history.replaceState({}, '', url.toString());
      } catch {}
      return next;
    });
  }, []);

  // Listen to popstate for back/forward browser navigation
  useEffect(() => {
    const handlePopState = () => {
      try {
        const params = new URLSearchParams(window.location.search);
        const step = params.get('step') as StepId;
        if (step === '0') setCurrentStepState('home');
        else if (step && ['home', 'input', 'execution', 'results', 'tracking', 'export', 'overview', 'email-materials'].includes(step)) {
          setCurrentStepState(step as StepId);
        }
      } catch {}
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const [session, setSession] = useState<SessionState | null>(null);
  const [overviewSessions, setOverviewSessions] = useState<SessionState[]>([]);
  const [manualOutreachEntries, setManualOutreachEntries] = useState<ManualOutreachEntry[]>(() => getManualOutreachEntries());
  const [overviewSectionId, setOverviewSectionId] = useState('all');
  const [overviewTrackedCount, setOverviewTrackedCount] = useState(0);
  const [overviewSelectedContactIds, setOverviewSelectedContactIds] = useState<Set<string>>(new Set());
  const [overviewBulkBusy, setOverviewBulkBusy] = useState(false);
  const [overviewOnlyWithEmail, setOverviewOnlyWithEmail] = useState(false);
  const [overviewHideDuplicates, setOverviewHideDuplicates] = useState(false);
  const [overviewHideHandled, setOverviewHideHandled] = useState(false);
  const [overviewSearch, setOverviewSearch] = useState('');
  const [overviewEmailFilter, setOverviewEmailFilter] = useState('all');
  const [overviewUseEmailWhitelist, setOverviewUseEmailWhitelist] = useState(false);
  const [overviewContactStatusFilter, setOverviewContactStatusFilter] = useState('all');
  const [overviewCompanyStatusFilter, setOverviewCompanyStatusFilter] = useState('all');
  const [overviewClassificationFilter, setOverviewClassificationFilter] = useState('all');
  const [overviewOnlyWithVacancies, setOverviewOnlyWithVacancies] = useState(false);
  const [overviewCopiedEmail, setOverviewCopiedEmail] = useState<string | null>(null);
  const [overviewCopyMessage, setOverviewCopyMessage] = useState('');
  const [rawCompanies, setRawCompanies] = useState<ParsedCompanyInput[]>([]);
  const [profile, setProfile] = useState<CandidateProfile>(EMPTY_PROFILE);
  const [sectionName, setSectionName] = useState(() => localStorage.getItem('recruitagent_section_name') || `Seção ${new Date().toLocaleString('pt-BR')}`);
  const [editingSectionName, setEditingSectionName] = useState(false);
  const [settings, setSettings] = useState<JobSettings>(() => ({
    ...DEFAULT_SETTINGS,
    navigationLayout: localStorage.getItem('recruitagent_navigation_layout') === 'sidebar' ? 'sidebar' : 'top',
  }));
  const [globalSettings, setGlobalSettings] = useState<JobSettings>(DEFAULT_SETTINGS);
  const [settingsSections, setSettingsSections] = useState<SessionState[]>([]);

  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme === 'light' ? 'light' : 'dark';
  }, [settings.theme]);

  useEffect(() => {
    fetch('/api/settings/global').then((res) => res.ok ? res.json() : null).then((data) => {
      if (!data?.settings) return;
      const loaded = { ...DEFAULT_SETTINGS, ...data.settings } as JobSettings;
      const storedLayout = localStorage.getItem('recruitagent_navigation_layout');
      if (storedLayout === 'sidebar' || storedLayout === 'top') loaded.navigationLayout = storedLayout;
      setGlobalSettings(loaded);
      if (!localStorage.getItem('recruitagent_session_id')) setSettings(loaded);
    }).catch(() => {});
  }, []);

  const handleSaveSettingsScope = async (incoming: JobSettings, scopeId: string) => {
    const updated = { ...incoming };
    if (updated.navigationLayout === 'sidebar' || updated.navigationLayout === 'top') {
      localStorage.setItem('recruitagent_navigation_layout', updated.navigationLayout);
      setSettings((current) => ({ ...current, navigationLayout: updated.navigationLayout }));
    }
    try {
      if (scopeId === 'global') {
        const res = await fetch('/api/settings/global', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ settings: updated }) });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Não foi possível salvar a configuração global.');
        setGlobalSettings(data.settings);
        setSettings(data.settings);
        setSession((current) => current ? { ...current, settings: data.settings } : null);
        setSettingsSections((current) => current.map((section) => ({ ...section, settings: data.settings })));
      } else {
        const res = await fetch(`/api/session/${scopeId}/settings`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ settings: updated }) });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Não foi possível salvar as configurações da seção.');
        if (session?.sessionId === scopeId) { setSession(data.session); setSettings(data.session.settings); }
        setSettingsSections((current) => current.map((section) => section.sessionId === scopeId ? data.session : section));
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setToast(message);
    }
  };

  const openSettings = async () => {
    try {
      const res = await fetch('/api/sessions');
      if (res.ok) { const data = await res.json(); setSettingsSections(data.sessions || []); }
    } catch {}
    setIsSettingsOpen(true);
  };

  useEffect(() => {
    if (session) return;
    const timer = window.setTimeout(() => {
      try { localStorage.setItem('recruitagent_draft', JSON.stringify({ rawCompanies, profile, settings })); } catch {}
      localStorage.setItem('recruitagent_section_name', sectionName);
    }, 500);
    return () => window.clearTimeout(timer);
  }, [rawCompanies, profile, settings, sectionName, session]);
  useEffect(() => {
    try {
      const draft = JSON.parse(localStorage.getItem('recruitagent_draft') || 'null');
      if (draft) { setRawCompanies(draft.rawCompanies || []); setProfile(draft.profile || EMPTY_PROFILE); setSettings(draft.settings || DEFAULT_SETTINGS); }
    } catch {}
  }, []);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [profilesModal, setProfilesModal] = useState<{ open: boolean; tab: 'save' | 'manage' }>({ open: false, tab: 'save' });
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    const refreshManualEntries = () => setManualOutreachEntries(getManualOutreachEntries());
    window.addEventListener(manualOutreachUpdatedEvent(), refreshManualEntries);
    window.addEventListener('storage', refreshManualEntries);
    return () => {
      window.removeEventListener(manualOutreachUpdatedEvent(), refreshManualEntries);
      window.removeEventListener('storage', refreshManualEntries);
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(timer);
  }, [toast]);
  const [isInitializing, setIsInitializing] = useState<boolean>(false);
  const [initError, setInitError] = useState<string | null>(null);
  const [trackedCount, setTrackedCount] = useState<number>(0);
  const [isRecoveringSession, setIsRecoveringSession] = useState<boolean>(true);
  const [sessionRecoveryError, setSessionRecoveryError] = useState<string | null>(null);

  const refreshTrackedCount = useCallback(() => {
    fetch(`/api/tracking${session?.sessionId ? `?sessionId=${encodeURIComponent(session.sessionId)}` : ''}`)
      .then((res) => (res.ok ? res.json() : { contacts: [] }))
      .then((data) => setTrackedCount(data.contacts?.length || 0))
      .catch(() => {});
  }, [session?.sessionId]);

  useEffect(() => {
    refreshTrackedCount();
  }, [refreshTrackedCount, session?.sessionId]);

  useEffect(() => {
    if (currentStep !== 'overview' && currentStep !== 'home') return;
    let cancelled = false;
    const loadOverview = async () => {
      try {
        const [sectionsRes, trackingRes] = await Promise.all([fetch('/api/sessions'), fetch('/api/tracking')]);
        if (!sectionsRes.ok || !trackingRes.ok) return;
        const [sectionsData, trackingData] = await Promise.all([sectionsRes.json(), trackingRes.json()]);
        if (cancelled) return;
        const loaded = (sectionsData.sessions || []) as SessionState[];
        setOverviewSessions(loaded);
        setOverviewTrackedCount(trackingData.contacts?.length || 0);
      } catch { /* keep the last overview snapshot */ }
    };
    void loadOverview();
    const timer = window.setInterval(loadOverview, settings.lowResourceMode ? 15000 : 5000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [currentStep, settings.lowResourceMode]);

  const handleOverviewSectionChange = async (sectionId: string) => {
    setOverviewSectionId(sectionId);
    if (sectionId === 'all') return;
    try {
      const res = await fetch(`/api/session/${sectionId}`);
      const data = await res.json();
      if (!res.ok || !data.session) throw new Error(data.error || 'Não foi possível carregar a seção.');
      const selected = data.session as SessionState;
      setSession(selected);
      setProfile(selected.profile || EMPTY_PROFILE);
      setSettings(selected.settings || DEFAULT_SETTINGS);
      setRawCompanies(selected.companies.map((c: CompanyItem) => ({ name: c.name, url: c.rawUrl })));
      localStorage.setItem('recruitagent_session_id', sectionId);
    } catch (err) { setToast(err instanceof Error ? err.message : 'Não foi possível carregar a seção.'); }
  };

  // Activate global middle-click handler: opens any link, anchor, or data-url in a new tab
  useEffect(() => {
    const cleanup = initGlobalMiddleClick();
    return cleanup;
  }, []);

  // Material Modal state
  const [modalContact, setModalContact] = useState<RecruitmentContact | null>(null);
  const [modalCompany, setModalCompany] = useState<CompanyItem | null>(null);

  // SSE EventSource ref
  const eventSourceRef = useRef<EventSource | null>(null);

  // Robust session recovery: queries active running session from backend first,
  // preserves localStorage on network failure, displays retry state instead of empty state.
  const recoverSession = useCallback(async () => {
    setIsRecoveringSession(true);
    setSessionRecoveryError(null);

    try {
      // Prefer the section selected by the user, even when another runner remains active.
      const savedSessionId = localStorage.getItem('recruitagent_session_id');
      if (savedSessionId) {
        const savedRes = await fetch(`/api/session/${savedSessionId}`);
        if (savedRes.ok) {
          const savedData = await savedRes.json();
          if (savedData.session) {
            const s = savedData.session as SessionState;
            setSession(s);
            setProfile(s.profile || EMPTY_PROFILE);
            setSectionName(s.name || `Seção ${s.sessionId}`);
            localStorage.setItem('recruitagent_section_name', s.name || '');
            setSettings({ ...(s.settings || DEFAULT_SETTINGS), navigationLayout: localStorage.getItem('recruitagent_navigation_layout') === 'sidebar' ? 'sidebar' : (s.settings?.navigationLayout || 'top') });
            setIsRecoveringSession(false);
            return;
          }
        } else if (savedRes.status === 404) {
          localStorage.removeItem('recruitagent_session_id');
        }
      }
      // 1. Try to recover active running or paused session directly from backend
      const activeRes = await fetch('/api/session/active');
      if (activeRes.ok) {
        const activeData = await activeRes.json();
        if (activeData.session) {
          const s = activeData.session as SessionState;
          setSession(s);
          setProfile(s.profile || EMPTY_PROFILE);
          setSectionName(s.name || `Seção ${s.sessionId}`);
          localStorage.setItem('recruitagent_section_name', s.name || '');
          setSettings({ ...(s.settings || DEFAULT_SETTINGS), navigationLayout: localStorage.getItem('recruitagent_navigation_layout') === 'sidebar' ? 'sidebar' : (s.settings?.navigationLayout || 'top') });
          localStorage.setItem('recruitagent_session_id', s.sessionId);

          setIsRecoveringSession(false);
          return;
        }
      }

      // No selected or active session exists.
      setIsRecoveringSession(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setSessionRecoveryError(
        `Falha ao comunicar com o servidor: ${msg}. Verifique se o servidor está ativo.`
      );
      setIsRecoveringSession(false);
    }
  }, []);

  useEffect(() => {
    recoverSession();
  }, [recoverSession]);

  // Connect SSE whenever active session changes
  useEffect(() => {
    if (!session?.sessionId) {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      return;
    }

    const sse = new EventSource(`/api/session/${session.sessionId}/stream`);
    eventSourceRef.current = sse;

    sse.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === 'data_reset') {
          eventSourceRef.current?.close();
          eventSourceRef.current = null;
          localStorage.removeItem('recruitagent_session_id');
          setSession(null);
          setRawCompanies([]);
          setTrackedCount(0);
          setModalContact(null);
          setModalCompany(null);
          setCurrentStep('input');
        } else if (data.type === 'log') {
          setSession((prev) => {
            if (!prev) return null;
            return {
              ...prev,
              logs: [...prev.logs, data.payload],
            };
          });
        } else if (data.type === 'company_updated') {
          const updatedComp = data.payload as CompanyItem;
          setSession((prev) => {
            if (!prev) return null;
            const updatedList = prev.companies.map((c) =>
              c.id === updatedComp.id ? updatedComp : c
            );
            return {
              ...prev,
              companies: updatedList,
            };
          });
        } else if (data.type === 'status_change') {
          const { status } = data.payload;
          setSession((prev) => {
            if (!prev) return null;
            return {
              ...prev,
              status,
            };
          });
        } else if (data.type === 'session_updated') {
          setSession(data.payload as SessionState);
        }
      } catch (err) {
        console.error('Error parsing SSE data:', err);
      }
    };

    sse.onerror = () => {
      // EventSource reconnects automatically
    };

    return () => {
      sse.close();
      eventSourceRef.current = null;
    };
  }, [session?.sessionId]);

  // Load sample demonstration data
  const handleLoadSampleData = () => {
    // Parse sample CSV
    const lines = SAMPLE_COMPANIES_CSV.trim().split('\n').slice(1);
    const comps: ParsedCompanyInput[] = lines.map((l) => {
      const parts = l.split(';');
      return {
        name: parts[0]?.trim(),
        url: parts[1]?.trim(),
      };
    });

    setRawCompanies(comps);
    setProfile(SAMPLE_PROFILE);
    setInitError(null);
  };

  const handleCreateSection = async () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    const adjectives = ['Aurora', 'Serena', 'Ágil', 'Brilhante', 'Nova', 'Horizonte', 'Próspera', 'Estelar'];
    const nouns = ['Orquídea', 'Farol', 'Trilha', 'Ponte', 'Constelação', 'Jornada', 'Vértice', 'Semente'];
    const name = `${adjectives[Math.floor(Math.random() * adjectives.length)]} ${nouns[Math.floor(Math.random() * nouns.length)]}`;
    try {
      const sectionSettings = { ...globalSettings, navigationLayout: localStorage.getItem('recruitagent_navigation_layout') === 'sidebar' ? 'sidebar' as const : (globalSettings.navigationLayout || 'top') as 'top' | 'sidebar' };
      const response = await fetch('/api/session/draft', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, profile: EMPTY_PROFILE, settings: sectionSettings }) });
      const data = await response.json();
      if (!response.ok || !data.session) throw new Error(data.error || 'Não foi possível criar a seção.');
      localStorage.removeItem('recruitagent_draft');
      localStorage.setItem('recruitagent_session_id', data.session.sessionId);
      localStorage.setItem('recruitagent_section_name', name);
      setSession(data.session);
      setSectionName(name);
      setRawCompanies([]);
      setProfile(EMPTY_PROFILE);
      setSettings(sectionSettings);
      setInitError(null);
      setCurrentStep('input');
    } catch (err) { setInitError(err instanceof Error ? err.message : String(err)); }
  };

  const handleResetSession = () => { void handleCreateSection(); };

  const persistSectionName = async (sessionId: string, name: string) => {
    const cleanName = name.replace(/\s+/g, ' ').trim();
    if (!cleanName) return;
    try {
      const res = await fetch(`/api/session/${sessionId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: cleanName }) });
      const data = await res.json();
      if (!res.ok || !data.session) throw new Error(data.error || 'Não foi possível salvar o nome da seção.');
      setSession((current) => current?.sessionId === sessionId ? data.session : current);
      setOverviewSessions((current) => current.map((item) => item.sessionId === sessionId ? data.session : item));
      setSettingsSections((current) => current.map((item) => item.sessionId === sessionId ? data.session : item));
      if (session?.sessionId === sessionId) {
        setSectionName(cleanName);
        localStorage.setItem('recruitagent_section_name', cleanName);
      }
    } catch (err) { setToast(err instanceof Error ? err.message : 'Não foi possível salvar o nome da seção.'); }
  };

  // Start or Initialize Session
  const handleStartWorkflow = async () => {
    setInitError(null);

    // If session already exists, start it
    if (session) {
      try {
        if (session.status === 'idle' && session.companies.length === 0) {
          if (rawCompanies.length === 0) throw new Error('Carregue ao menos uma empresa via CSV ou insira URLs.');
          if (!profile.name || !profile.summary) throw new Error('Preencha os dados do candidato ou carregue seu currículo para extração.');
          const prepared = await fetch(`/api/session/${session.sessionId}/prepare`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rawCompanies, profile, settings }) });
          const preparedData = await prepared.json();
          if (!prepared.ok || !preparedData.session) throw new Error(preparedData.error || 'Não foi possível preparar a seção.');
          setSession(preparedData.session);
        }
        const res = await fetch(`/api/session/${session.sessionId}/start`, { method: 'POST' });
        const data = await res.json();
        if (data.session) {
          setSession(data.session);
          setCurrentStep('execution');
        }
      } catch (err) {
        setInitError(String(err));
      }
      return;
    }

    // Initialize new session
    if (rawCompanies.length === 0) {
      setInitError('Carregue ao menos uma empresa via CSV ou insira URLs.');
      return;
    }

    if (!profile.name || !profile.summary) {
      setInitError('Preencha os dados do candidato ou carregue seu currículo para extração.');
      return;
    }

    setIsInitializing(true);
    try {
      const res = await fetch('/api/session/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rawCompanies,
          profile,
          settings,
          name: sectionName,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Erro ao inicializar sessão');
      }

      const { sessionId, session: createdSession } = await res.json();
      localStorage.setItem('recruitagent_session_id', sessionId);
      setSession(createdSession);
      localStorage.removeItem('recruitagent_draft');

      // Start the created session
      const startRes = await fetch(`/api/session/${sessionId}/start`, { method: 'POST' });
      const startData = await startRes.json();
      if (startData.session) {
        setSession(startData.session);
      }

      setCurrentStep('execution');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setInitError(msg);
    } finally {
      setIsInitializing(false);
    }
  };

  // Session Control Handlers
  const handlePause = async () => {
    if (!session) return;
    const res = await fetch(`/api/session/${session.sessionId}/pause`, { method: 'POST' });
    const data = await res.json();
    if (data.session) setSession(data.session);
  };

  const handleResume = async () => {
    if (!session) return;
    const res = await fetch(`/api/session/${session.sessionId}/resume`, { method: 'POST' });
    const data = await res.json();
    if (data.session) setSession(data.session);
  };

  const handleCancel = async () => {
    if (!session) return;
    const res = await fetch(`/api/session/${session.sessionId}/cancel`, { method: 'POST' });
    const data = await res.json();
    if (data.session) setSession(data.session);
  };

  const handleRetryFailed = async () => {
    if (!session) return;
    const res = await fetch(`/api/session/${session.sessionId}/retry-failed`, { method: 'POST' });
    const data = await res.json();
    if (data.session) setSession(data.session);
  };

  // Generate Single Contact Materials on Demand
  const handleGenerateContactMaterials = async (contactId: string) => {
    if (!session) return;
    const res = await fetch(`/api/session/${session.sessionId}/generate-contact-materials`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contactId }),
    });

    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Falha ao gerar materiais');
    }

    const { contact: updatedContact } = await res.json();

    // Update in local state
    setSession((prev) => {
      if (!prev) return null;
      const updatedCompanies = prev.companies.map((comp) => {
        const contactIdx = comp.contacts.findIndex((c) => c.id === contactId);
        if (contactIdx >= 0) {
          const updatedContacts = [...comp.contacts];
          updatedContacts[contactIdx] = updatedContact;
          return { ...comp, contacts: updatedContacts };
        }
        return comp;
      });
      return { ...prev, companies: updatedCompanies };
    });
  };

  const [isGeneratingAllPending, setIsGeneratingAllPending] = useState<boolean>(false);
  const handleGenerateAllPending = async () => {
    if (!session) return;
    setIsGeneratingAllPending(true);
    try {
      const res = await fetch(`/api/session/${session.sessionId}/generate-all-pending-materials`, {
        method: 'POST',
      });
      const data = await res.json();
      if (data.session) {
        setSession(data.session);
      }
    } catch (err) {
      console.error('Falha ao gerar materiais em lote:', err);
    } finally {
      setIsGeneratingAllPending(false);
    }
  };

  // Save Modal Edits
  const handleSaveMaterialEdits = async (
    contactId: string,
    updatedMaterials: Partial<GeneratedMaterials>
  ) => {
    if (!session) return;
    const res = await fetch(`/api/session/${session.sessionId}/update-material`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contactId, materials: updatedMaterials }),
    });

    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Falha ao salvar edição');
    }

    // Update in local state
    setSession((prev) => {
      if (!prev) return null;
      const updatedCompanies = prev.companies.map((comp) => {
        const contactIdx = comp.contacts.findIndex((c) => c.id === contactId);
        if (contactIdx >= 0) {
          const updatedContacts = [...comp.contacts];
          updatedContacts[contactIdx] = {
            ...updatedContacts[contactIdx],
            materials: {
              ...updatedContacts[contactIdx].materials!,
              ...updatedMaterials,
              isEdited: true,
            },
          };
          return { ...comp, contacts: updatedContacts };
        }
        return comp;
      });
      return { ...prev, companies: updatedCompanies };
    });
  };

  // Counts for step badges
  // Aplica novas configurações (tela de Configurações ou perfil salvo): estado local + sessão no servidor.
  const applySettings = async (incoming: JobSettings) => {
    // Língua Padrão: salva nas configurações (config.json) e também no perfil.
    const viewLang = resolveDefaultViewLanguage(incoming);
    const newSettings: JobSettings = { ...incoming, defaultViewLanguage: viewLang };
    if (newSettings.navigationLayout === 'sidebar' || newSettings.navigationLayout === 'top') {
      localStorage.setItem('recruitagent_navigation_layout', newSettings.navigationLayout);
    }
    setSettings(newSettings);
    setProfile((current) => ({ ...current, defaultViewLanguage: viewLang }));
    if (session) {
      setSession({
        ...session,
        settings: newSettings,
        profile: { ...session.profile, defaultViewLanguage: viewLang },
      });
      try {
        await fetch(`/api/session/${session.sessionId}/settings`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ settings: newSettings }),
        });
      } catch (err) {
        console.error('Falha ao sincronizar configurações com o servidor:', err);
      }
    }
  };

  // Carrega os blocos escolhidos de um perfil salvo para a tela.
  const handleApplySavedProfile = async (saved: SavedProfile, blocks: SavedProfileBlocks) => {
    const applied: string[] = [];
    if (blocks.companies && saved.companies?.length) {
      setRawCompanies(saved.companies);
      applied.push(`${saved.companies.length} empresa(s)`);
    }
    if (blocks.candidate && saved.candidate) {
      setProfile(saved.candidate);
      applied.push('perfil do candidato');
    }
    if (blocks.settings && saved.config) {
      const imported = configToSettings(saved.config);
      await applySettings({
        ...settings,
        defaultViewLanguage: resolveDefaultViewLanguage(settings, profile),
        ...imported,
      });
      applied.push('configurações');
    }
    setInitError(null);
    setToast(`Perfil "${saved.name}" carregado: ${applied.join(', ') || 'nada novo para aplicar'}.`);
  };

  const companiesCount = session ? session.companies.length : rawCompanies.length;
  const contactsCount = session
    ? session.companies.reduce((acc, c) => acc + c.contacts.length, 0)
    : 0;
  const materialsCount = session
    ? session.companies.reduce(
        (acc, c) => acc + c.contacts.filter((cnt) => cnt.materialsGenerated).length,
        0
      )
    : 0;

  const overviewSelectedSession = overviewSectionId === 'all'
    ? null
    : session?.sessionId === overviewSectionId
      ? session
      : overviewSessions.find((item) => item.sessionId === overviewSectionId) || null;
  const overviewMetrics = overviewSectionId === 'all'
    ? {
        companies: overviewSessions.reduce((sum, item) => sum + item.companies.length, 0),
        contacts: overviewSessions.reduce((sum, item) => sum + item.companies.reduce((n, company) => n + company.contacts.length, 0), 0),
        materials: overviewSessions.reduce((sum, item) => sum + item.companies.reduce((n, company) => n + company.contacts.filter((contact) => contact.materialsGenerated).length, 0), 0),
        tracked: overviewTrackedCount,
      }
    : {
        companies: overviewSelectedSession?.companies.length || 0,
        contacts: overviewSelectedSession?.companies.reduce((sum, company) => sum + company.contacts.length, 0) || 0,
        materials: overviewSelectedSession?.companies.reduce((sum, company) => sum + company.contacts.filter((contact) => contact.materialsGenerated).length, 0) || 0,
        tracked: trackedCount,
      };
  const overviewScopedSessions = overviewSectionId === 'all' ? overviewSessions : overviewSelectedSession ? [overviewSelectedSession] : [];
  const overviewScopedContacts = overviewScopedSessions.flatMap((item) => item.companies.flatMap((company) => company.contacts.map((contact) => ({ session: item, company, contact }))));
  const overviewEmailOptions = (() => {
    const counts = new Map<string, number>();
    for (const { contact } of overviewScopedContacts) {
      const email = contact.email?.trim().toLocaleLowerCase('pt-BR');
      if (email) {
        const localPart = email.split('@', 1)[0];
        if (localPart) counts.set(localPart, (counts.get(localPart) || 0) + 1);
      }
    }
    return [...counts.entries()].sort(([emailA, countA], [emailB, countB]) => countB - countA || emailA.localeCompare(emailB, 'pt-BR'));
  })();
  const overviewAllowedEmailAliases = new Set([
    ...(globalSettings.emailAliasWhitelist || []),
    ...overviewScopedSessions.flatMap((item) => item.settings?.emailAliasWhitelist || []),
  ].map((item) => item.trim().toLocaleLowerCase('pt-BR').split('@', 1)[0]).filter(Boolean));
  const overviewSelectableEmailOptions = overviewUseEmailWhitelist
    ? overviewEmailOptions.filter(([alias]) => overviewAllowedEmailAliases.has(alias))
    : overviewEmailOptions;
  const overviewCompanyStatuses = [...new Set(overviewScopedContacts.map(({ company }) => company.status))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const overviewEffectiveEmailFilter = overviewEmailFilter !== 'all' && (!overviewEmailOptions.some(([alias]) => alias === overviewEmailFilter) || (overviewUseEmailWhitelist && !overviewAllowedEmailAliases.has(overviewEmailFilter))) ? 'all' : overviewEmailFilter;
  const overviewVisibleContacts = (() => {
    const seenEmails = new Set<string>();
    const query = overviewSearch.trim().toLocaleLowerCase('pt-BR');
    return overviewScopedContacts.filter(({ session: item, company, contact }) => {
      const email = contact.email?.trim().toLocaleLowerCase('pt-BR') || '';
      const outreachStatus = contact.outreachStatus || 'pending';
      if (overviewHideHandled && (contact.outreachStatus || 'pending') !== 'pending') return false;
      if (overviewOnlyWithEmail && !email) return false;
      if (overviewEffectiveEmailFilter !== 'all' && email.split('@', 1)[0] !== overviewEffectiveEmailFilter) return false;
      if (overviewContactStatusFilter !== 'all' && outreachStatus !== overviewContactStatusFilter) return false;
      if (overviewCompanyStatusFilter !== 'all' && company.status !== overviewCompanyStatusFilter) return false;
      if (overviewClassificationFilter !== 'all' && contact.classification !== overviewClassificationFilter) return false;
      if (overviewOnlyWithVacancies && company.vacanciesFound.length === 0 && !contact.associatedJob) return false;
      if (query && ![contact.name, contact.email, company.name, company.normalizedUrl, item.name, contact.associatedJob?.title].some((value) => value?.toLocaleLowerCase('pt-BR').includes(query))) return false;
      if (overviewHideDuplicates && email) {
        if (seenEmails.has(email)) return false;
        seenEmails.add(email);
      }
      return true;
    });
  })();
  const overviewSelectedContacts = overviewVisibleContacts.filter(({ contact }) => overviewSelectedContactIds.has(contact.id));
  const overviewSelectedEmails = [...new Set(overviewSelectedContacts.map(({ contact }) => contact.email?.trim()).filter((email): email is string => !!email))];
  const overviewVisibleIds = new Set(overviewVisibleContacts.map(({ contact }) => contact.id));
  const overviewCompanyGroups = overviewScopedSessions.flatMap((item) => item.companies.map((company) => ({ session: item, company, contacts: overviewVisibleContacts.filter((entry) => entry.session.sessionId === item.sessionId && entry.company.id === company.id).map((entry) => entry.contact) })).filter((group) => group.contacts.length > 0));
  const overviewFiltersActive = !!overviewSearch.trim() || overviewEmailFilter !== 'all' || overviewContactStatusFilter !== 'all' || overviewCompanyStatusFilter !== 'all' || overviewClassificationFilter !== 'all' || overviewOnlyWithEmail || overviewOnlyWithVacancies || overviewUseEmailWhitelist || overviewHideDuplicates || overviewHideHandled;
  const overviewFilteredCompanies = new Set(overviewVisibleContacts.map(({ session: item, company }) => `${item.sessionId}:${company.id}`));
  const overviewFilteredMetrics = {
    companies: overviewFiltersActive ? overviewFilteredCompanies.size : overviewScopedSessions.reduce((sum, item) => sum + item.companies.length, 0),
    contacts: overviewFiltersActive ? overviewVisibleContacts.length : overviewScopedContacts.length,
    materials: (overviewFiltersActive ? overviewVisibleContacts : overviewScopedContacts).filter(({ contact }) => contact.materialsGenerated).length,
    tracked: (overviewFiltersActive ? overviewVisibleContacts : overviewScopedContacts).filter(({ contact }) => (contact.outreachStatus || 'pending') !== 'pending').length,
  };
  const overviewVisibleSections = overviewFiltersActive
    ? overviewScopedSessions.filter((item) => item.companies.some((company) => overviewVisibleContacts.some((entry) => entry.session.sessionId === item.sessionId && entry.company.id === company.id)))
    : overviewScopedSessions;
  const overviewMatchedContactsByCompany = new Map<string, RecruitmentContact[]>();
  for (const entry of overviewVisibleContacts) {
    const matches = overviewMatchedContactsByCompany.get(entry.company.id) || [];
    matches.push(entry.contact);
    overviewMatchedContactsByCompany.set(entry.company.id, matches);
  }
  const overviewFilteredSession = overviewSelectedSession ? {
    ...overviewSelectedSession,
    companies: overviewSelectedSession.companies
      .filter((company) => !overviewFiltersActive || overviewMatchedContactsByCompany.has(company.id))
      .map((company) => ({ ...company, contacts: overviewMatchedContactsByCompany.get(company.id) || [] })),
  } : null;
  const toggleOverviewContact = (id: string) => setOverviewSelectedContactIds((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const copyOverviewEmails = async (emails: string[], copiedKey: string) => {
    if (!emails.length) return;
    try {
      await navigator.clipboard.writeText(emails.join('\n'));
      setOverviewCopiedEmail(copiedKey);
      setOverviewCopyMessage(`${emails.length} email(s) copiado(s).`);
      window.setTimeout(() => setOverviewCopiedEmail((current) => current === copiedKey ? null : current), 1800);
      window.setTimeout(() => setOverviewCopyMessage(''), 2500);
    } catch {
      setOverviewCopyMessage('Não foi possível copiar. Verifique a permissão da área de transferência.');
    }
  };
  const handleOverviewBulkContacted = async () => {
    if (!overviewSelectedContacts.length) return;
    setOverviewBulkBusy(true);
    const contactedAt = new Date().toISOString();
    try {
      const responses = await Promise.all(overviewSelectedContacts.map(({ session, contact }) => fetch('/api/tracking/update-status', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: contact.id, sessionId: session.sessionId, status: 'contacted', contactedAt }),
      })));
      if (responses.some((response) => !response.ok)) throw new Error('Falha ao atualizar um ou mais contatos.');
      setOverviewSessions((current) => current.map((item) => ({ ...item, companies: item.companies.map((company) => ({ ...company, contacts: company.contacts.map((contact) => overviewSelectedContactIds.has(contact.id) ? { ...contact, outreachStatus: 'contacted', contactedAt } : contact) })) })));
      setOverviewSelectedContactIds(new Set());
    } catch (error) { setToast(error instanceof Error ? error.message : 'Não foi possível atualizar os contatos.'); }
    finally { setOverviewBulkBusy(false); }
  };
  const handleOverviewBulkOpenEmails = () => {
    const ready = overviewSelectedContacts.filter(({ contact }) => contact.email && contact.materials && (contact.outreachStatus || 'pending') === 'pending');
    if (!ready.length) { setToast('Nenhum selecionado pendente tem email e materiais prontos.'); return; }
    if (ready.length > 5 && !window.confirm(`Abrir ${ready.length} rascunhos do Gmail em inglês?`)) return;
    let blocked = 0;
    ready.forEach(({ contact }) => {
      const material = contact.materials?.en || contact.materials;
      const url = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(contact.email!)}&su=${encodeURIComponent(material.subject || '')}&body=${encodeURIComponent(material.coldEmail || '')}`;
      if (!window.open(url, '_blank', 'noopener,noreferrer')) blocked++;
    });
    if (blocked) setToast(`${blocked} rascunho(s) foram bloqueados pelo navegador.`);
  };

  const handleOverviewBulkDiscard = async () => {
    if (!overviewSelectedContacts.length || !window.confirm(`Descartar ${overviewSelectedContacts.length} contato(s) selecionado(s)?`)) return;
    setOverviewBulkBusy(true);
    const discardedAt = new Date().toISOString();
    try {
      const responses = await Promise.all(overviewSelectedContacts.map(({ session, contact }) => fetch('/api/tracking/update-status', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: contact.id, sessionId: session.sessionId, status: 'discarded', discardedAt, discardReason: 'Descarte em lote pelo overview' }) })));
      if (responses.some((response) => !response.ok)) throw new Error('Falha ao atualizar um ou mais contatos.');
      const selectedIds = new Set(overviewSelectedContacts.map(({ contact }) => contact.id));
      setOverviewSessions((current) => current.map((item) => ({ ...item, companies: item.companies.map((company) => ({ ...company, contacts: company.contacts.map((contact) => selectedIds.has(contact.id) ? { ...contact, outreachStatus: 'discarded', discardedAt } : contact) })) })));
      setOverviewSelectedContactIds(new Set());
    } catch (error) { setToast(error instanceof Error ? error.message : 'Não foi possível descartar os contatos.'); }
    finally { setOverviewBulkBusy(false); }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      <Header
        session={session}
        onLoadSampleData={handleLoadSampleData}
        onResetSession={handleResetSession}
        onCreateSection={handleCreateSection}
        onUpdateSession={(updated) => {
          setOverviewSessions((current) => current.map((item) => item.sessionId === updated.sessionId ? updated : item));
          setSettingsSections((current) => current.map((item) => item.sessionId === updated.sessionId ? updated : item));
          setSession((current) => current?.sessionId === updated.sessionId ? updated : current);
        }}
        onOpenSettings={openSettings}
        onSaveProfile={() => setProfilesModal({ open: true, tab: 'save' })}
        onOpenProfiles={() => setProfilesModal({ open: true, tab: 'manage' })}
        onSelectSession={async (selected) => {
          const res = await fetch(`/api/session/${selected.sessionId}`);
          const data = await res.json();
          if (data.session) { setSession(data.session); setProfile(data.session.profile); setSettings({ ...data.session.settings, navigationLayout: localStorage.getItem('recruitagent_navigation_layout') === 'sidebar' ? 'sidebar' : (data.session.settings.navigationLayout || 'top') }); setRawCompanies(data.session.companies.map((c: CompanyItem) => ({ name: c.name, url: c.rawUrl }))); setSectionName(data.session.name || `Seção ${data.session.sessionId}`); localStorage.setItem('recruitagent_section_name', data.session.name || ''); setOverviewSectionId(selected.sessionId); localStorage.setItem('recruitagent_session_id', selected.sessionId); setCurrentStep(data.session.status === 'completed' ? 'results' : data.session.status === 'idle' ? 'input' : 'execution'); }
        }}
        onRenameSession={async (renamed) => { await persistSectionName(renamed.sessionId, renamed.name || ''); }}
        onDeleteSession={async (id) => {
          const res = await fetch(`/api/session/${id}`, { method: 'DELETE' });
          if (res.ok) {
            if (session?.sessionId === id) { setSession(null); localStorage.removeItem('recruitagent_session_id'); setCurrentStep('input'); }
            return true;
          }
          const d = await res.json();
          window.alert(d.error || 'Não foi possível excluir.');
          return false;
        }}
      />

      {settings.navigationLayout !== 'sidebar' && <StepNav
        currentStep={currentStep}
        onStepChange={setCurrentStep}
        companiesCount={companiesCount}
        contactsCount={contactsCount}
        materialsCount={materialsCount}
        trackedCount={trackedCount}
        isExecuting={session?.status === 'running'}
        onOverview={() => setCurrentStep('overview')}
      />}

      {/* Main Content Area */}
      <div className={`flex-1 w-full ${settings.navigationLayout === 'sidebar' ? 'flex min-h-0' : ''}`}>
      {settings.navigationLayout === 'sidebar' && <div className="shrink-0"><StepNav
        currentStep={currentStep}
        onStepChange={setCurrentStep}
        companiesCount={companiesCount}
        contactsCount={contactsCount}
        materialsCount={materialsCount}
        trackedCount={trackedCount}
        isExecuting={session?.status === 'running'}
        onOverview={() => setCurrentStep('overview')}
        layout="sidebar"
      /></div>}
      <main className={`flex-1 w-full min-w-0 py-4 sm:py-6 ${settings.navigationLayout === 'sidebar' ? 'max-w-none mx-0 px-2 sm:px-4' : 'max-w-7xl mx-auto px-4 sm:px-6 lg:px-8'}`}>
        {initError && (
          <div className="mb-6 p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{initError}</span>
            </div>
            <button
              type="button"
              onClick={() => setInitError(null)}
              className="text-rose-400 hover:text-white text-xs font-semibold"
            >
              Fechar
            </button>
          </div>
        )}

        {/* STEP 1: INPUT & PROFILE */}
        {currentStep === 'home' && (
          <WelcomeDashboard sessions={overviewSessions} trackedCount={overviewTrackedCount} manualEntries={manualOutreachEntries} onNavigate={setCurrentStep} />
        )}

        {currentStep === 'email-materials' && <EmailMaterialsPage />}

        {currentStep === 'input' && (
          <div className="space-y-6">
            <div className="flex items-center gap-2 text-sm text-slate-300">Seção: {editingSectionName ? <input autoFocus value={sectionName} onChange={e => setSectionName(e.target.value)} onBlur={() => { setEditingSectionName(false); if (session) void persistSectionName(session.sessionId, sectionName); else localStorage.setItem('recruitagent_section_name', sectionName); }} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }} className="bg-slate-800 border border-slate-600 rounded px-2 py-1" /> : <strong>{sectionName}</strong>} <button type="button" onClick={() => setEditingSectionName(true)} className="text-blue-400 hover:text-blue-300" title="Editar nome">✎</button><span className="text-[11px] text-slate-500">Salvamento automático</span></div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
              <CsvUploader
                onCompaniesLoaded={setRawCompanies}
                initialCompanies={rawCompanies}
              />

              <ProfileEditor profile={profile} onChange={setProfile} />
            </div>

            {/* Bottom confirmation and launch bar */}
            <div className="bg-slate-900/90 rounded-2xl border border-slate-800 p-5 shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="text-xs text-slate-400">
                <div className="font-bold text-slate-200 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  Pronto para iniciar a pesquisa factual
                </div>
                <div className="mt-0.5">
                  {rawCompanies.length > 0 ? (
                    <span className="text-emerald-400 font-semibold">
                      {rawCompanies.length} empresa(s) carregada(s)
                    </span>
                  ) : (
                    <span className="text-amber-400">Nenhuma empresa carregada ainda</span>
                  )}{' '}
                  •{' '}
                  {profile.name ? (
                    <span className="text-blue-400 font-semibold">
                      Perfil de {profile.name} verificado
                    </span>
                  ) : (
                    <span className="text-amber-400">Perfil pendente</span>
                  )}
                </div>
              </div>

              <button
                type="button"
                onClick={handleStartWorkflow}
                disabled={isInitializing || rawCompanies.length === 0 || !profile.name}
                className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-bold text-xs sm:text-sm text-white bg-blue-600 hover:bg-blue-500 shadow-lg shadow-blue-500/25 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Play className="w-4 h-4 fill-white" />
                <span>{isInitializing ? 'Inicializando...' : 'Iniciar Pesquisa & Geração'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: EXECUTION & LOGS */}
        {currentStep === 'execution' && (
          <>
            {isRecoveringSession ? (
              <div className="flex flex-col items-center justify-center p-12 bg-slate-900/60 rounded-2xl border border-slate-800 text-center space-y-3">
                <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
                <h3 className="text-base font-semibold text-white">Recuperando sessão...</h3>
                <p className="text-xs text-slate-400">
                  Consultando o servidor para restaurar contatos, materiais e progresso da pesquisa.
                </p>
              </div>
            ) : sessionRecoveryError ? (
              <div className="p-8 bg-rose-500/10 rounded-2xl border border-rose-500/30 text-center space-y-4">
                <AlertCircle className="w-8 h-8 text-rose-400 mx-auto" />
                <div>
                  <h3 className="text-base font-semibold text-rose-300">Falha ao recuperar a sessão</h3>
                  <p className="text-xs text-rose-300/80 mt-1">{sessionRecoveryError}</p>
                </div>
                <div className="flex items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={recoverSession}
                    className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition"
                  >
                    <RotateCcw className="w-3.5 h-3.5" /> Tentar novamente
                  </button>
                  <button
                    type="button"
                    onClick={handleResetSession}
                    className="px-4 py-2 text-xs font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition"
                  >
                    Iniciar nova pesquisa
                  </button>
                </div>
              </div>
            ) : session ? (
              <ExecutionPanel
                session={session}
                onStart={handleStartWorkflow}
                onPause={handlePause}
                onResume={handleResume}
                onCancel={handleCancel}
                onRetryFailed={handleRetryFailed}
                onViewResults={() => setCurrentStep('results')}
                onGenerateAllPending={handleGenerateAllPending}
                isGeneratingAllPending={isGeneratingAllPending}
                onOpenSettings={() => setIsSettingsOpen(true)}
              />
            ) : (
              <div className="p-12 text-center bg-slate-900/60 rounded-2xl border border-slate-800">
                <p className="text-sm text-slate-400">
                  Nenhuma sessão ativa iniciada. Carregue empresas na aba <strong>1. Entrada & Perfil</strong> e clique em "Iniciar Pesquisa".
                </p>
              </div>
            )}
          </>
        )}

        {/* STEP 3: RESULTS & CONTACTS TABLE */}
        {currentStep === 'results' && (
          <>
            {isRecoveringSession ? (
              <div className="flex flex-col items-center justify-center p-12 bg-slate-900/60 rounded-2xl border border-slate-800 text-center space-y-3">
                <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
                <h3 className="text-base font-semibold text-white">Recuperando sessão...</h3>
                <p className="text-xs text-slate-400">Restaurando tabela de contatos e materiais...</p>
              </div>
            ) : sessionRecoveryError ? (
              <div className="p-8 bg-rose-500/10 rounded-2xl border border-rose-500/30 text-center space-y-4">
                <AlertCircle className="w-8 h-8 text-rose-400 mx-auto" />
                <div>
                  <h3 className="text-base font-semibold text-rose-300">Falha ao recuperar os resultados</h3>
                  <p className="text-xs text-rose-300/80 mt-1">{sessionRecoveryError}</p>
                </div>
                <div className="flex items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={recoverSession}
                    className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition"
                  >
                    <RotateCcw className="w-3.5 h-3.5" /> Tentar novamente
                  </button>
                  <button
                    type="button"
                    onClick={handleResetSession}
                    className="px-4 py-2 text-xs font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition"
                  >
                    Iniciar nova pesquisa
                  </button>
                </div>
              </div>
            ) : session ? (
              <ContactsTable
                session={session}
                onOpenMaterialModal={(cnt, comp) => {
                  setModalContact(cnt);
                  setModalCompany(comp);
                }}
                onGenerateContactMaterials={handleGenerateContactMaterials}
                onGenerateAllPending={handleGenerateAllPending}
                isGeneratingAllPending={isGeneratingAllPending}
                onNavigateToTracking={() => {
                  setCurrentStep('tracking');
                  refreshTrackedCount();
                }}
                onNavigateToExport={() => {
                  setCurrentStep('export');
                }}
              />
            ) : (
              <div className="p-12 text-center bg-slate-900/60 rounded-2xl border border-slate-800">
                <p className="text-sm text-slate-400">
                  Nenhuma pesquisa executada ainda. Inicie um lote na aba <strong>1. Entrada & Perfil</strong>.
                </p>
              </div>
            )}
          </>
        )}

        {/* STEP 4: TRACKING & CRM DASHBOARD */}
        {currentStep === 'tracking' && (
          <TrackingDashboard
            session={session}
            onNavigateToResults={() => setCurrentStep('results')}
          />
        )}

        {currentStep === 'overview' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
              <label htmlFor="overview-section-filter" className="text-xs font-semibold text-slate-300">Filtrar por seção</label>
              <select id="overview-section-filter" value={overviewSectionId} onChange={(event) => void handleOverviewSectionChange(event.target.value)} className="w-full sm:w-80 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white focus:border-blue-500 focus:outline-none">
                <option value="all">Todas as seções</option>
                {overviewSessions.map((item) => <option key={item.sessionId} value={item.sessionId}>{item.name || 'Seção sem nome'}</option>)}
              </select>
            </div>
            <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {[['Empresas', overviewFilteredMetrics.companies], ['Contatos', overviewFilteredMetrics.contacts], ['Materiais gerados', overviewFilteredMetrics.materials], ['Acompanhamentos', overviewFilteredMetrics.tracked], ['Entradas manuais', manualOutreachEntries.length]].map(([label, value]) => <div key={label} className="rounded-xl border border-slate-800 bg-slate-900 p-5"><div className="text-xs text-slate-400">{label}</div><div className="mt-2 text-2xl font-bold text-white">{value}</div></div>)}
            </section>
            <details className="group rounded-xl border border-slate-800 bg-slate-900">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-5 [&::-webkit-details-marker]:hidden">
                <div><h2 className="text-sm font-semibold text-white">Entradas manuais do gerador</h2><p className="mt-1 text-[11px] text-slate-500">Registros criados manualmente, separados dos contatos encontrados nas pesquisas.</p></div>
                <div className="flex shrink-0 items-center gap-3"><span className="rounded-full border border-slate-700 bg-slate-950 px-2.5 py-1 text-xs text-slate-300">{manualOutreachEntries.length}</span><ChevronDown className="h-4 w-4 text-slate-400 transition-transform group-open:rotate-180" /></div>
              </summary>
              <div className="border-t border-slate-800 p-5 pt-4">
                <div className="mb-3 flex justify-end"><button type="button" onClick={() => setCurrentStep('email-materials')} className="text-xs font-semibold text-blue-300 hover:text-blue-200">Abrir gerador</button></div>
                {manualOutreachEntries.length ? <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{[...manualOutreachEntries].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((entry) => <div key={entry.email} className="rounded-lg border border-slate-800 bg-slate-950/60 p-3"><div className="flex items-center justify-between gap-2"><strong className="truncate text-xs text-slate-200">{entry.company}</strong><div className="flex shrink-0 items-center gap-1.5"><span className={`rounded-full px-2 py-1 text-[10px] ${entry.status === 'contacted' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-slate-800 text-slate-300'}`}>{entry.status === 'contacted' ? 'Contactado' : 'Pendente'}</span><span className="rounded-full bg-slate-800 px-2 py-1 text-[10px] text-slate-300">{entry.language === 'pt' ? 'PT-BR' : 'English'}</span></div></div><p className="mt-1 truncate text-[11px] text-slate-400">{entry.email}</p><p className="mt-1 text-[10px] text-slate-500">Gerado em {new Date(entry.createdAt).toLocaleString('pt-BR')}</p></div>)}</div> : <p className="rounded-lg border border-dashed border-slate-700 p-5 text-center text-xs text-slate-500">Nenhuma entrada manual gerada ainda.</p>}
              </div>
            </details>
            <OverviewContactFilters
              scopeDescription={overviewSectionId === 'all' ? 'Refine os resultados de todas as seções.' : `Refine os resultados da seção ${overviewSelectedSession?.name || 'selecionada'}.`}
              search={overviewSearch} emailFilter={overviewEffectiveEmailFilter} useEmailWhitelist={overviewUseEmailWhitelist}
              emailOptions={overviewSelectableEmailOptions.map(([alias, count]) => ({ alias, count }))} allowedAliasCount={overviewAllowedEmailAliases.size}
              contactStatus={overviewContactStatusFilter} companyStatus={overviewCompanyStatusFilter} classification={overviewClassificationFilter}
              companyStatuses={overviewCompanyStatuses} onlyWithEmail={overviewOnlyWithEmail} onlyWithVacancies={overviewOnlyWithVacancies}
              hideDuplicates={overviewHideDuplicates} hideHandled={overviewHideHandled} visibleCount={overviewVisibleContacts.length} totalCount={overviewScopedContacts.length}
              onSearchChange={setOverviewSearch} onEmailChange={setOverviewEmailFilter}
              onWhitelistChange={(enabled) => { setOverviewUseEmailWhitelist(enabled); if (enabled && overviewEmailFilter !== 'all' && !overviewAllowedEmailAliases.has(overviewEmailFilter)) setOverviewEmailFilter('all'); }}
              onContactStatusChange={setOverviewContactStatusFilter} onCompanyStatusChange={setOverviewCompanyStatusFilter}
              onClassificationChange={setOverviewClassificationFilter} onOnlyWithEmailChange={setOverviewOnlyWithEmail}
              onOnlyWithVacanciesChange={setOverviewOnlyWithVacancies} onHideDuplicatesChange={setOverviewHideDuplicates}
              onHideHandledChange={setOverviewHideHandled}
              onClear={() => { setOverviewSearch(''); setOverviewEmailFilter('all'); setOverviewUseEmailWhitelist(false); setOverviewContactStatusFilter('all'); setOverviewCompanyStatusFilter('all'); setOverviewClassificationFilter('all'); setOverviewOnlyWithEmail(false); setOverviewOnlyWithVacancies(false); setOverviewHideDuplicates(false); setOverviewHideHandled(false); }}
            />
            {overviewSectionId === 'all' ? <>
              <details className="group rounded-xl border border-slate-800 bg-slate-900">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-5 [&::-webkit-details-marker]:hidden"><div><h2 className="text-base font-semibold text-white">Seções incluídas</h2><p className="mt-1 text-[11px] text-slate-500">Abra uma seção para ver o progresso e os totais.</p></div><div className="flex shrink-0 items-center gap-3"><span className="rounded-full border border-slate-700 bg-slate-950 px-2.5 py-1 text-xs text-slate-300">{overviewVisibleSections.length}</span><ChevronDown className="h-4 w-4 text-slate-400 transition-transform group-open:rotate-180" /></div></summary>
                <div className="grid gap-3 border-t border-slate-800 p-5 pt-4 sm:grid-cols-2 lg:grid-cols-3">{overviewVisibleSections.map((item) => { const visibleGroups = overviewCompanyGroups.filter((group) => group.session.sessionId === item.sessionId); const visibleCompanies = overviewFiltersActive ? visibleGroups.length : item.companies.length; const visibleContacts = overviewFiltersActive ? visibleGroups.reduce((sum, group) => sum + group.contacts.length, 0) : item.companies.reduce((sum, company) => sum + company.contacts.length, 0); const done = item.status === 'completed' ? 100 : visibleCompanies ? Math.round(item.companies.filter((company) => company.status !== 'Pendente' && (!overviewFiltersActive || visibleGroups.some((group) => group.company.id === company.id))).length / visibleCompanies * 100) : 0; return <button key={item.sessionId} type="button" onClick={() => void handleOverviewSectionChange(item.sessionId)} className="text-left rounded-lg border border-slate-700 bg-slate-950/60 p-4 hover:border-blue-500/60"><div className="flex justify-between gap-3"><strong className="text-sm text-slate-100 truncate">{item.name || 'Seção sem nome'}</strong><span className="text-xs text-slate-400">{done}%</span></div><div className="mt-2 text-xs text-slate-400">{visibleCompanies} empresas · {visibleContacts} contatos</div></button>; })}{!overviewVisibleSections.length && <p className="text-xs text-slate-400">Nenhuma seção corresponde aos filtros.</p>}</div>
              </details>
              <section className="rounded-xl border border-slate-800 bg-slate-900 p-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-950/70 p-3 rounded-xl border border-slate-800 mb-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <button type="button" onClick={() => setOverviewSelectedContactIds(overviewVisibleContacts.every(({ contact }) => overviewSelectedContactIds.has(contact.id)) ? new Set([...overviewSelectedContactIds].filter((id) => !overviewVisibleIds.has(id))) : new Set([...overviewSelectedContactIds, ...overviewVisibleContacts.map(({ contact }) => contact.id)]))} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-900 text-slate-200 border border-slate-700">{overviewVisibleContacts.length > 0 && overviewVisibleContacts.every(({ contact }) => overviewSelectedContactIds.has(contact.id)) ? '☑ Desmarcar Todos' : `☐ Selecionar Todos (${overviewVisibleContacts.length})`}</button>
                    {overviewSelectedContacts.length > 0 ? <span className="px-2.5 py-1 rounded-full text-xs font-bold text-rose-300 bg-rose-500/15 border border-rose-500/30">● {overviewSelectedContacts.length} selecionado(s)</span> : <span className="text-[11px] text-slate-400">Selecione contatos ou empresas para ações em lote.</span>}
                  {overviewCopyMessage && <span role="status" className="text-xs text-emerald-300">{overviewCopyMessage}</span>}
                  </div>
                  {overviewSelectedContacts.length > 0 && <div className="flex flex-wrap gap-2">
                    <button type="button" disabled={!overviewSelectedEmails.length} onClick={() => void copyOverviewEmails(overviewSelectedEmails, 'bulk')} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-cyan-200 bg-cyan-950/70 border border-cyan-700/70 disabled:opacity-50">{overviewCopiedEmail === 'bulk' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}{overviewCopiedEmail === 'bulk' ? 'Copiado' : `Copiar emails (${overviewSelectedEmails.length})`}</button>
                    <button type="button" disabled={overviewBulkBusy} onClick={() => void handleOverviewBulkDiscard()} className="px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-rose-600 disabled:opacity-50">Descartar ({overviewSelectedContacts.length})</button>
                    <button type="button" disabled={overviewBulkBusy} onClick={() => void handleOverviewBulkContacted()} className="px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-emerald-600 disabled:opacity-50">Contactados ({overviewSelectedContacts.length})</button>
                    <button type="button" onClick={handleOverviewBulkOpenEmails} className="px-3 py-1.5 rounded-lg text-xs font-bold text-red-200 bg-red-950/70 border border-red-700/70">Gmail EN ({overviewSelectedContacts.length})</button>
                  </div>}
                </div>
                <div className="max-h-[38rem] overflow-auto space-y-2">
                  {overviewCompanyGroups.map(({ session: item, company, contacts }) => {
                    const selected = contacts.length > 0 && contacts.every((contact) => overviewSelectedContactIds.has(contact.id));
                    return <div key={`${item.sessionId}:${company.id}`} className={`rounded-xl border ${selected ? 'border-emerald-500/70 bg-emerald-950/10' : 'border-slate-800 bg-slate-950/50'} p-3`}>
                      <div className="flex items-center gap-2 text-xs"><input type="checkbox" aria-label={`Selecionar todos de ${company.name}`} checked={selected} onChange={(event) => setOverviewSelectedContactIds((current) => { const next = new Set(current); contacts.forEach((contact) => event.target.checked ? next.add(contact.id) : next.delete(contact.id)); return next; })} /><strong className="text-slate-100">{company.name}</strong><span className="text-slate-500">· {item.name || 'Seção sem nome'} · {contacts.length} contato(s)</span></div>
                      {contacts.length > 0 && <div className="mt-2 ml-6 space-y-1">{contacts.map((contact) => <div key={contact.id} className="flex min-w-0 items-center gap-2 text-[11px] text-slate-300"><input aria-label={`Selecionar ${contact.email || contact.name || 'contato'}`} type="checkbox" checked={overviewSelectedContactIds.has(contact.id)} onChange={() => toggleOverviewContact(contact.id)} /><span className="min-w-0 truncate">{contact.email || contact.name || 'Sem email'}</span>{contact.email && <button type="button" aria-label={`Copiar ${contact.email}`} title="Copiar email" onClick={() => void copyOverviewEmails([contact.email], contact.id)} className="inline-flex shrink-0 items-center rounded px-1.5 py-1 text-cyan-300 hover:bg-slate-800">{overviewCopiedEmail === contact.id ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}</button>}<span className="shrink-0 text-slate-500">{contact.outreachStatus === 'contacted' ? 'Enviado' : contact.outreachStatus === 'discarded' ? 'Removido' : contact.outreachStatus === 'interview' ? 'Entrevista' : contact.outreachStatus === 'offer' ? 'Oferta' : contact.outreachStatus === 'rejected' ? 'Rejeitado' : 'Pendente'}</span></div>)}</div>}
                    </div>;
                  })}
                  {overviewVisibleContacts.length === 0 && <div className="flex min-h-36 flex-col items-center justify-center rounded-xl border border-dashed border-slate-700 bg-slate-950/40 px-4 py-7 text-center"><MailSearch className="mb-2 h-7 w-7 text-slate-500" /><p className="text-sm font-medium text-slate-300">{overviewScopedContacts.length === 0 ? 'Nenhum contato nesta seção' : 'Nenhum contato corresponde aos filtros'}</p><p className="mt-1 text-xs text-slate-500">{overviewScopedContacts.length === 0 ? 'Escolha outra seção ou inicie uma pesquisa.' : 'Limpe ou ajuste os filtros para ver mais resultados.'}</p></div>}
                </div>
              </section>
            </> : <div className="rounded-xl border border-slate-800 bg-slate-900 p-5"><h2 className="text-base font-semibold text-white mb-3">Contatos e materiais da seção</h2>{overviewFilteredSession ? <ContactsTable session={overviewFilteredSession} hideFilters visibleContactIds={new Set(overviewVisibleContacts.map(({ contact }) => contact.id))} onOpenMaterialModal={(cnt, comp) => { setModalContact(cnt); setModalCompany(comp); }} onGenerateContactMaterials={handleGenerateContactMaterials} onGenerateAllPending={handleGenerateAllPending} isGeneratingAllPending={isGeneratingAllPending} onNavigateToTracking={() => setCurrentStep('tracking')} onNavigateToExport={() => setCurrentStep('export')} /> : <p className="text-xs text-slate-400">Carregando seção...</p>}</div>}
            <TrackingDashboard session={overviewSectionId === 'all' ? null : overviewSelectedSession} onNavigateToResults={() => setCurrentStep('results')} />
          </div>
        )}

        {/* STEP 5: EXPORT PANEL */}
        {currentStep === 'export' && (
          <>
            {isRecoveringSession ? (
              <div className="flex flex-col items-center justify-center p-12 bg-slate-900/60 rounded-2xl border border-slate-800 text-center space-y-3">
                <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
                <h3 className="text-base font-semibold text-white">Recuperando sessão...</h3>
                <p className="text-xs text-slate-400">Carregando dados para exportação...</p>
              </div>
            ) : session ? (
              <ExportPanel session={session} />
            ) : (
              <div className="p-12 text-center bg-slate-900/60 rounded-2xl border border-slate-800">
                <p className="text-sm text-slate-400">
                  Execute a pesquisa primeiro para habilitar o download das planilhas e do arquivo ZIP.
                </p>
              </div>
            )}
          </>
        )}
      </main>
      </div>

      {/* Settings Modal */}
      <SettingsModal
        onResetData={async () => {
          const response = await fetch('/api/data/reset', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ confirmation: 'APAGAR DADOS' }),
          });
          const result = await response.json();
          if (!response.ok || !result.success) throw new Error(result.error || 'Não foi possível limpar os dados.');
          eventSourceRef.current?.close();
          eventSourceRef.current = null;
          localStorage.removeItem('recruitagent_session_id');
          const url = new URL(window.location.href);
          url.searchParams.set('step', 'input');
          // Reload also drops stale fetch callbacks, filters and cached modal state.
          window.location.replace(url.toString());
        }}
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={{ ...globalSettings, defaultViewLanguage: resolveDefaultViewLanguage(globalSettings) }}
        sections={settingsSections.map(({ sessionId, name }) => ({ sessionId, name }))}
        settingsByScope={{ global: globalSettings, ...Object.fromEntries(settingsSections.map((section) => [section.sessionId, section.settings])) }}
        onSave={handleSaveSettingsScope}
      />

      {/* Perfis salvos (empresas + perfil do candidato + configurações) */}
      <SavedProfilesModal
        isOpen={profilesModal.open}
        initialTab={profilesModal.tab}
        onClose={() => setProfilesModal((current) => ({ ...current, open: false }))}
        rawCompanies={rawCompanies}
        profile={profile}
        settings={{ ...settings, defaultViewLanguage: resolveDefaultViewLanguage(settings, profile) }}
        onApply={handleApplySavedProfile}
      />

      {toast && (
        <div
          role="status"
          className="fixed bottom-4 right-4 z-[60] max-w-sm rounded-xl border border-emerald-500/40 bg-slate-900/95 px-4 py-3 text-xs text-emerald-300 shadow-2xl"
        >
          {toast}
        </div>
      )}

      {/* Material View/Edit Modal */}
      <MaterialModal
        contact={modalContact}
        company={modalCompany}
        isOpen={!!modalContact}
        defaultLanguage={resolveDefaultViewLanguage(settings, profile)}
        onClose={() => {
          setModalContact(null);
          setModalCompany(null);
        }}
        onSaveEdits={handleSaveMaterialEdits}
      />
    </div>
  );
}
