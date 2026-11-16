export type CompanyStatus =
  | 'Email não encontrado'
  | 'Não foi possível verificar a fonte'
  | 'Pendente'
  | 'Pesquisando'
  | 'Contato encontrado'
  | 'Sem contato de recrutamento'
  | 'Gerando materiais'
  | 'Concluído'
  | 'Concluído parcialmente'
  | 'Bloqueado'
  | 'Erro'
  | 'Cancelado';

export type ContactClassification =
  | 'Recrutamento confirmado'
  | 'Possível recrutamento'
  | 'Contato geral'
  | 'Outra finalidade';

export interface ProfessionalLink {
  label: string;
  url: string;
}

export interface WorkExperience {
  role: string;
  company: string;
  period: string;
  highlights: string[];
}

export interface CandidateProfile {
  name: string;
  email: string;
  phone?: string;
  location: string;
  summary: string;
  summaryEn?: string;
  targetRoles: string[];
  prioritySkills: string[];
  workPreference: 'remote' | 'hybrid' | 'onsite' | 'any';
  professionalLinks: ProfessionalLink[];
  experiences: WorkExperience[];
  education: string[];
  certifications: string[];
  languages: string[];
  writingStyleSample?: string;
  additionalNotes?: string;
  materialLanguage: 'pt' | 'en' | 'both' | 'auto';
  // Idioma que o seletor "Visualizar" (contatos, materiais, exportação) usa ao abrir.
  defaultViewLanguage?: 'pt' | 'en';
  parsedFromCv: boolean;

  // Bilingual CVs & raw contents
  cvPtFilename?: string;
  cvPtRawText?: string;
  cvEnFilename?: string;
  cvEnRawText?: string;
}

export interface Vacancy {
  id?: string;
  title: string;
  url?: string;
  description?: string;
  department?: string;
  location?: string;
  discoveredAt?: string;
  updatedAt?: string;
  isModified?: boolean;
  modificationDetails?: string;
  previousUrl?: string;
  previousDescription?: string;
  companyId?: string;
  companyName?: string;
}

export interface VacancyReconciliationResult {
  vacancies: Vacancy[];
  addedCount: number;
  modifiedCount: number;
  ignoredDuplicatesCount: number;
  summary: string;
  addedVacancies: Vacancy[];
  modifiedVacancies: Vacancy[];
  ignoredVacancies: Vacancy[];
}

export interface TrackedVacancyRecord extends Vacancy {
  companyId: string;
  companyName: string;
  site?: string;
  sourceUrl?: string;
  checksum?: string;
  firstSeenAt: string;
  lastCheckedAt: string;
}

export interface SingleLanguageMaterial {
  subject: string;
  coldEmail: string;
  shortMessage: string;
  coverLetter: string;
  reviewNotes: string;
  wordCounts: {
    coldEmail: number;
    shortMessage: number;
    coverLetter: number;
  };
}

export interface GeneratedMaterials {
  // Primary / fallback fields
  subject: string;
  coldEmail: string;
  shortMessage: string;
  coverLetter: string;
  reviewNotes: string;
  wordCounts: {
    coldEmail: number;
    shortMessage: number;
    coverLetter: number;
  };

  // Dedicated Dual Language Content (PT-BR and EN)
  pt?: SingleLanguageMaterial;
  en?: SingleLanguageMaterial;

  matchedJob?: {
    title: string;
    url?: string;
  };
  generatedAt: string;
  isEdited?: boolean;
  similarityWarning?: string;
  generatedBy?: 'gemini' | 'openai' | 'perplexity' | 'openrouter' | 'deepseek' | 'groq' | 'fallback';
  keyUsed?: string;
}

export type OutreachStatus =
  | 'pending'
  | 'contacted'
  | 'interview'
  | 'offer'
  | 'rejected'
  | 'discarded';

export interface TrackedContactRecord {
  sourceUrl?: string;
  evidenceSnippet?: string;
  retrievalProvider?: string;
  extractionMethod?: 'mailto' | 'page-text';
  collectedAt?: string;
  id: string; // contact.id
  sessionId?: string;
  companyId: string;
  companyName: string;
  site: string;
  email: string;
  classification: ContactClassification;
  associatedJobTitle?: string;
  associatedJobUrl?: string;
  status: OutreachStatus;
  contactedAt?: string;
  discardedAt?: string;
  interviewAt?: string;
  notes?: string;
  discardReason?: string;
  materials?: GeneratedMaterials;
  updatedAt: string;
}

export interface RecruitmentContact {
  id: string;
  companyId: string;
  companyName: string;
  site: string;
  email: string;
  isObfuscated: boolean;
  originalText?: string;
  classification: ContactClassification;
  justification: string;
  sourceUrl: string;
  allSources: string[];
  evidenceSnippet: string;
  retrievalProvider?: string;
  extractionMethod?: 'mailto' | 'page-text';
  collectedAt: string;
  associatedJob?: {
    title: string;
    url?: string;
  };
  applicationRestrictions?: string;
  materialsGenerated: boolean;
  materials?: GeneratedMaterials;
  emailDeliverability?: 'DELIVERABLE' | 'UNDELIVERABLE' | 'RISKY' | 'UNKNOWN';
  emailQualityScore?: number;

  // Outreach & Follow-up tracking
  outreachStatus?: OutreachStatus;
  contactedAt?: string;
  discardedAt?: string;
  interviewAt?: string;
  notes?: string;
  discardReason?: string;
}

export interface CompanyItem {
  id: string;
  name: string;
  rawUrl: string;
  normalizedUrl: string;
  status: CompanyStatus;
  error?: string;
  visitedPages: string[];
  careersUrl?: string;
  applicationPortalUrl?: string;
  companyAbout?: string;
  vacanciesFound: Vacancy[];
  contacts: RecruitmentContact[];
  updatedAt: string;
}

export interface JobSettings {
  /** Global limit for independent section runners; applies from Global settings. */
  maxConcurrentSections?: number;
  lowResourceMode?: boolean;
  emailBlacklist?: string[];
  emailAliasWhitelist?: string[];
  navigationLayout?: 'top' | 'sidebar';
  theme?: 'dark' | 'light';
  maxPagesPerCompany: number;
  requestTimeoutMs: number;
  delayBetweenRequestsMs: number;
  maxConcurrency: number;
  generateMaterialsForPossible: boolean;
  generateMaterialsForSpontaneous?: boolean;
  externalBrowserEndpoint?: string;

  // AI Model Configuration
  aiProvider: 'gemini' | 'openai' | 'perplexity' | 'openrouter' | 'deepseek' | 'groq' | 'auto';
  tavilyApiKey?: string;
  deepseekApiKey?: string;
  deepseekModel?: string;
  groqApiKey?: string;
  groqModel?: string;
  abstractApiKey?: string;
  apifyApiToken?: string;
  apifyActorId?: string;
  hunterApiKey?: string;
  apolloApiKey?: string;
  peopleDataLabsApiKey?: string;
  adzunaAppId?: string;
  adzunaApiKey?: string;
  googleCloudApiKey?: string;
  n8nWebhookUrl?: string;
  n8nApiKey?: string;
  firebaseProjectId?: string;
  firebaseApiKey?: string;
  convexUrl?: string;
  convexDeployKey?: string;
  emailValidationEnabled?: boolean;
  braveApiKey?: string;
  firecrawlApiKey?: string;
  youApiKey?: string;
  exaApiKey?: string;
  openrouterApiKey?: string;
  openrouterModel?: string;
  searchProvider?: 'auto' | 'brave' | 'you' | 'exa' | 'tavily';
  webSearchEnabled?: boolean;
  pageRetrievalEnabled?: boolean;
  renderPagesWithoutEmail?: boolean;
  searchMaxResults?: number;
  maxExternalCallsPerCompany?: number;
  externalApiTimeoutMs?: number;
  openaiApiKey?: string;
  openaiModel?: 'gpt-4o' | 'gpt-4o-mini' | string;
  geminiApiKey?: string;
  geminiModel?: string;
  perplexityApiKey?: string;
  perplexityModel?: 'sonar' | 'sonar-pro' | 'sonar-reasoning' | string;
  generateDualLanguage: boolean; // Generate both PT and EN
  // Língua Padrão: idioma inicial do seletor "Visualizar" (PT-BR ou Inglês). Padrão: 'pt'.
  defaultViewLanguage?: 'pt' | 'en';
  // Gerações de IA simultâneas ao gerar materiais pendentes em lote (1 a 6; padrão 1).
  // maxConcurrency (acima) controla quantas empresas são pesquisadas ao mesmo tempo.
  materialsConcurrency?: number;
}

export type RunnerStatus = 'idle' | 'running' | 'paused' | 'cancelled' | 'completed';

export interface LogMessage {
  id: string;
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'success';
  message: string;
  companyId?: string;
}

export interface SessionState {
  sessionId: string;
  name?: string;
  companies: CompanyItem[];
  profile: CandidateProfile;
  settings: JobSettings;
  status: RunnerStatus;
  currentCompanyIndex: number;
  startedAt?: string;
  completedAt?: string;
  logs: LogMessage[];
}
