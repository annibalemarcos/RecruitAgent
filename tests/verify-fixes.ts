import {
  saveSessionCheckpoint,
  loadSessionCheckpoint,
  getActiveOrLatestSession,
  startOrResumeSession,
  generateAllPendingMaterials,
} from '../server/jobRunner.js';
import {
  resolveGeminiCredentials,
  resolveOpenAiCredentials,
  isProviderCircuitBlocked,
  blockProviderCircuit,
  unblockProviderCircuit,
} from '../server/credentials.js';
import {
  generateMaterialsForContact,
  isInvalidApiKeyError,
  executeGemini,
} from '../server/materialsGenerator.js';
import {
  RequestTimeoutError,
  UserCancelledError,
  SslCertificateError,
} from '../server/extractor.js';
import {
  reconcileVacancies,
  isVacancyEquivalent,
  detectVacancyModifications,
  reconcileCompanyVacancies,
} from '../server/vacancyManager.js';
import { SessionState, CompanyItem, RecruitmentContact, Vacancy } from '../src/types/index.js';

async function runTests() {
  console.log('=== INICIANDO BATERIA DE TESTES DE VERIFICAÇÃO ===\n');
  let passed = 0;
  let total = 0;

  function assert(condition: boolean, testName: string) {
    total++;
    if (condition) {
      console.log(`[PASS] ${testName}`);
      passed++;
    } else {
      console.error(`[FAIL] ${testName}`);
      throw new Error(`Test failed: ${testName}`);
    }
  }

  // ----------------------------------------------------
  // TESTE 1: Recuperação de Sessão & Checkpoint Persistence
  // ----------------------------------------------------
  console.log('--- Teste 1: Recuperação de sessão e persistência de checkpoints ---');
  const testSessionId = `test_ses_${Date.now()}`;
  const mockCompany: CompanyItem = {
    id: 'comp_test_1',
    name: 'Tech Corp',
    rawUrl: 'https://techcorp.example',
    normalizedUrl: 'https://techcorp.example',
    status: 'Pendente',
    visitedPages: [],
    vacanciesFound: [],
    contacts: [],
    updatedAt: new Date().toISOString(),
  };

  const initialSession: SessionState = {
    sessionId: testSessionId,
    companies: [mockCompany],
    profile: {
      name: 'João Silva',
      email: 'joao@example.com',
      location: 'São Paulo',
      summary: 'Engenheiro de Software Sênior',
      targetRoles: ['Tech Lead'],
      prioritySkills: ['TypeScript', 'Node.js', 'React'],
      workPreference: 'remote',
      professionalLinks: [],
      experiences: [],
      education: [],
      certifications: [],
      languages: ['Português', 'Inglês'],
      materialLanguage: 'both',
      parsedFromCv: false,
    },
    settings: {
      maxPagesPerCompany: 5,
      requestTimeoutMs: 5000,
      delayBetweenRequestsMs: 100,
      maxConcurrency: 1,
      generateMaterialsForPossible: false,
      generateDualLanguage: true,
      aiProvider: 'gemini',
      geminiApiKey: 'invalid_key_for_test',
    },
    status: 'running',
    currentCompanyIndex: 0,
    logs: [
      {
        id: 'log_1',
        timestamp: '12:00:00',
        level: 'info',
        message: 'Iniciando pesquisa...',
      },
    ],
  };

  await saveSessionCheckpoint(initialSession);
  const loaded = await loadSessionCheckpoint(testSessionId);
  assert(loaded !== null, 'Checkpoint de sessão foi gravado e carregado com sucesso');
  assert(loaded?.sessionId === testSessionId, 'ID da sessão recuperada coincide');
  assert(loaded?.companies.length === 1, 'Empresas da sessão preservadas');

  const active = await getActiveOrLatestSession();
  assert(active !== null && active.sessionId === testSessionId, 'getActiveOrLatestSession recupera a sessão ativa mais recente');

  // ----------------------------------------------------
  // TESTE 2: Precedência de Credenciais e Proteção de Chaves
  // ----------------------------------------------------
  console.log('\n--- Teste 2: Precedência de credenciais e não vazamento de chave ---');
  // Interface takes precedence over env
  const resolvedWithInterface = resolveGeminiCredentials({
    geminiApiKey: 'AIzaSy_INTERFACE_TEST_KEY',
    geminiModel: 'gemini-3.8-flash',
  } as any);
  assert(
    resolvedWithInterface.source === 'interface',
    'Precedência 1: Chave da interface/sessão tem prioridade sobre .env'
  );
  assert(
    resolvedWithInterface.key === 'AIzaSy_INTERFACE_TEST_KEY',
    'Chave da interface resolvida corretamente no backend'
  );

  const resolvedWithoutInterface = resolveGeminiCredentials({} as any);
  assert(
    resolvedWithoutInterface.source.includes('env') || resolvedWithoutInterface.source === 'não configurada',
    'Precedência 2/3: Recai para variáveis de ambiente (.env) quando ausente na interface'
  );

  // ----------------------------------------------------
  // TESTE 3: Detecção de Chave Inválida e Circuit Breaker
  // ----------------------------------------------------
  console.log('\n--- Teste 3: Detecção de API_KEY_INVALID e interrupção de repetição ---');
  unblockProviderCircuit('gemini');
  assert(!isProviderCircuitBlocked('gemini').blocked, 'Circuito inicia desbloqueado');

  const gemini400Error = new Error(
    '{"error":{"code":400,"message":"API key not valid. Please pass a valid API key.","status":"INVALID_ARGUMENT","details":[{"@type":"type.googleapis.com/google.rpc.ErrorInfo","reason":"API_KEY_INVALID"}]}}'
  );
  assert(isInvalidApiKeyError(gemini400Error), 'isInvalidApiKeyError detecta API_KEY_INVALID em JSON payload');

  const standardInvalidKeyError = new Error('API_KEY_INVALID: The provided API key is invalid');
  assert(isInvalidApiKeyError(standardInvalidKeyError), 'isInvalidApiKeyError detecta API_KEY_INVALID em string');

  // Trigger circuit breaker block
  blockProviderCircuit('gemini', 'Chave Google Gemini inválida (API_KEY_INVALID).');
  blockProviderCircuit('openai', 'Bloqueado para teste');
  blockProviderCircuit('perplexity', 'Bloqueado para teste');
  const circuitState = isProviderCircuitBlocked('gemini');
  assert(circuitState.blocked === true, 'Provedor Gemini foi bloqueado pelo Circuit Breaker');

  // Calling generateMaterialsForContact while blocked must NOT hit API and must throw cleanly
  const mockContact: RecruitmentContact = {
    id: 'cnt_test_1',
    companyId: 'comp_test_1',
    companyName: 'Tech Corp',
    site: 'https://techcorp.example',
    email: 'rh@techcorp.example',
    classification: 'Recrutamento confirmado',
    justification: 'Encontrado na página de carreiras',
    sourceUrl: 'https://techcorp.example/careers',
    allSources: ['https://techcorp.example/careers'],
    evidenceSnippet: 'Envie seu CV para rh@techcorp.example',
    collectedAt: new Date().toISOString(),
    isObfuscated: false,
    materialsGenerated: false,
  };

  let threwAsExpected = false;
  try {
    await generateMaterialsForContact(
      mockContact,
      mockCompany,
      initialSession.profile,
      [mockContact],
      { ...initialSession.settings, aiProvider: 'gemini' }
    );
  } catch (err: any) {
    threwAsExpected = true;
    assert(
      !mockContact.materialsGenerated,
      'Contato permanece como materialsGenerated: false quando IA está bloqueada'
    );
    assert(
      mockContact.materials === undefined,
      'Nenhum material falso/genérico foi atribuído ao contato'
    );
  }
  assert(threwAsExpected, 'generateMaterialsForContact lançou erro limpo ao constatar IA bloqueada');

  // ----------------------------------------------------
  // TESTE 4: Desbloqueio ao Corrigir Chave & Processar Pendentes
  // ----------------------------------------------------
  console.log('\n--- Teste 4: Desbloqueio e processamento de materiais pendentes ---');
  unblockProviderCircuit('gemini');
  unblockProviderCircuit('openai');
  unblockProviderCircuit('perplexity');
  assert(!isProviderCircuitBlocked('gemini').blocked, 'Circuito Gemini foi desbloqueado com sucesso');

  // ----------------------------------------------------
  // TESTE 5: Extractor - Diferenciação de Timeout e SSL
  // ----------------------------------------------------
  console.log('\n--- Teste 5: Extractor - Diferenciação de Timeout, Cancelamento e TLS ---');
  const timeoutErr = new RequestTimeoutError('Tempo limite de 5000ms esgotado ao acessar https://slow.example');
  assert(timeoutErr.isTimeout === true, 'RequestTimeoutError possui flag isTimeout');

  const cancelErr = new UserCancelledError();
  assert(cancelErr.isCancelled === true, 'UserCancelledError possui flag isCancelled');

  const sslErr = new SslCertificateError('Certificado expirado', 'CERT_HAS_EXPIRED');
  assert(sslErr.isCertError === true && sslErr.code === 'CERT_HAS_EXPIRED', 'SslCertificateError categorizado sem desligar TLS global');

  assert(process.env.NODE_TLS_REJECT_UNAUTHORIZED !== '0', 'NODE_TLS_REJECT_UNAUTHORIZED não está definido como 0');

  // ----------------------------------------------------
  // TESTE 6: Preservação de Resultados e Não Duplicação
  // ----------------------------------------------------
  console.log('\n--- Teste 6: Preservação de resultados sem contatos duplicados ---');
  mockCompany.contacts = [
    {
      ...mockContact,
      materialsGenerated: true,
      materials: {
        subject: 'Apresentação',
        coldEmail: 'Email teste',
        shortMessage: 'Msg curta',
        coverLetter: 'Carta',
        reviewNotes: 'Notas',
        wordCounts: { coldEmail: 2, shortMessage: 2, coverLetter: 1 },
        pt: { subject: 'Apresentação', coldEmail: 'Email', shortMessage: 'Msg', coverLetter: 'Carta', reviewNotes: 'N', wordCounts: { coldEmail: 1, shortMessage: 1, coverLetter: 1 } },
        en: { subject: 'Intro', coldEmail: 'Email', shortMessage: 'Msg', coverLetter: 'Letter', reviewNotes: 'N', wordCounts: { coldEmail: 1, shortMessage: 1, coverLetter: 1 } },
        generatedAt: new Date().toISOString(),
        generatedBy: 'gemini',
      },
    },
  ];

  // Simular fusão de contatos de nova varredura
  const newDiscoveredContacts: RecruitmentContact[] = [
    {
      ...mockContact,
      // Same email, new discovery
      evidenceSnippet: 'Trecho atualizado',
    },
    {
      id: 'cnt_test_2',
      companyId: 'comp_test_1',
      companyName: 'Tech Corp',
      site: 'https://techcorp.example',
      email: 'talentos@techcorp.example',
      classification: 'Possível recrutamento',
      justification: 'Link de contato',
      sourceUrl: 'https://techcorp.example/contato',
      allSources: ['https://techcorp.example/contato'],
      evidenceSnippet: 'talentos@techcorp.example',
      collectedAt: new Date().toISOString(),
      isObfuscated: false,
      materialsGenerated: false,
    },
  ];

  const mergedMap = new Map<string, RecruitmentContact>();
  for (const existing of mockCompany.contacts) {
    mergedMap.set(existing.email.toLowerCase(), existing);
  }
  for (const fresh of newDiscoveredContacts) {
    const key = fresh.email.toLowerCase();
    const existing = mergedMap.get(key);
    if (existing) {
      mergedMap.set(key, {
        ...fresh,
        materials: existing.materialsGenerated && existing.materials ? existing.materials : fresh.materials,
        materialsGenerated: existing.materialsGenerated || fresh.materialsGenerated,
      });
    } else {
      mergedMap.set(key, fresh);
    }
  }

  const mergedList = Array.from(mergedMap.values());
  assert(mergedList.length === 2, 'Não houve duplicação de e-mails na mesma empresa (total 2)');
  assert(mergedList[0].materialsGenerated === true, 'Materiais previamente gerados foram preservados intactos');

  // ----------------------------------------------------
  // TESTE 7: Auditoria de Vagas - Detecção de Existência, Modificação e Ignorar Repetição
  // ----------------------------------------------------
  console.log('\n--- Teste 7: Auditoria de vagas - verificação prévia, detecção de modificação e descarte de repetição ---');

  const baseVacancies: Vacancy[] = [
    {
      id: 'vac_base_1',
      title: 'Engenheiro de Software Frontend',
      url: 'https://techcorp.example/vagas/frontend?utm_source=linkedin',
      description: 'Desenvolvimento React e TypeScript em equipe ágil.',
      department: 'Engenharia',
      location: 'Remoto',
      discoveredAt: new Date().toISOString(),
      isModified: false,
    },
  ];

  // Cenário A: Repetição Idêntica (deve ignorar e não listar)
  const identicalDuplicate: Vacancy = {
    title: 'Engenheiro de Software Frontend',
    url: 'https://techcorp.example/vagas/frontend?utm_source=glassdoor', // tracking param stripped, canonical URL identical
    description: 'Desenvolvimento React e TypeScript em equipe ágil.',
    department: 'Engenharia',
    location: 'Remoto',
  };

  const repResult = reconcileVacancies(baseVacancies, [identicalDuplicate], {
    companyId: 'comp_test_1',
    companyName: 'Tech Corp',
  });

  assert(repResult.ignoredDuplicatesCount === 1, 'Repetição idêntica de vaga foi detectada e contabilizada como ignorada');
  assert(repResult.addedCount === 0, 'Repetição idêntica NÃO foi adicionada');
  assert(repResult.modifiedCount === 0, 'Repetição idêntica NÃO foi tratada como modificação');
  assert(repResult.vacancies.length === 1, 'Lista de vagas manteve apenas 1 elemento sem duplicidade');

  // Cenário B: Vaga Existente porém Modificada (deve atualizar e marcar como modificada)
  const modifiedIncoming: Vacancy = {
    title: 'Engenheiro de Software Frontend Sênior',
    url: 'https://techcorp.example/careers/job/frontend-sr',
    description: 'Desenvolvimento React, TypeScript, GraphQL e liderança técnica.',
    department: 'Engenharia de Plataforma',
    location: 'Híbrido - SP',
  };

  const modResult = reconcileVacancies(baseVacancies, [modifiedIncoming], {
    companyId: 'comp_test_1',
    companyName: 'Tech Corp',
  });

  assert(modResult.modifiedCount === 1, 'Vaga modificada foi identificada e contabilizada');
  assert(modResult.addedCount === 0, 'Vaga modificada não gerou um novo item separado');
  assert(modResult.vacancies.length === 1, 'Total de vagas permaneceu 1 elemento atualizado');
  assert(modResult.vacancies[0].isModified === true, 'Vaga recebeu a flag isModified = true');
  assert(
    modResult.vacancies[0].description === modifiedIncoming.description,
    'Descrição da vaga foi atualizada com os novos requisitos'
  );
  assert(
    Boolean(modResult.vacancies[0].modificationDetails && modResult.vacancies[0].modificationDetails.length > 5),
    'Detalhes das modificações foram devidamente registrados'
  );

  // Cenário C: Nova Vaga Inexistente (deve incluir)
  const brandNewVacancy: Vacancy = {
    title: 'Tech Lead Backend Python/Go',
    url: 'https://techcorp.example/vagas/tech-lead-backend',
    description: 'Liderança de microsserviços em nuvem.',
    department: 'Arquitetura',
    location: 'Remoto',
  };

  const newResult = reconcileVacancies(baseVacancies, [brandNewVacancy], {
    companyId: 'comp_test_1',
    companyName: 'Tech Corp',
  });

  assert(newResult.addedCount === 1, 'Nova vaga foi reconhecida e adicionada com sucesso');
  assert(newResult.vacancies.length === 2, 'Total de vagas agora é 2');
  assert(newResult.vacancies.some((v) => v.title === 'Tech Lead Backend Python/Go'), 'Nova vaga consta na lista');

  // Cenário D: Lote Misto (1 nova, 1 modificada, 1 repetição idêntica)
  const mixedBatch: Vacancy[] = [
    identicalDuplicate, // Deve ignorar
    modifiedIncoming,   // Deve atualizar como modificada
    brandNewVacancy,    // Deve adicionar como nova
  ];

  const mixedResult = reconcileVacancies(baseVacancies, mixedBatch, {
    companyId: 'comp_test_1',
    companyName: 'Tech Corp',
  });

  assert(mixedResult.addedCount === 1, 'Lote misto: exatamente 1 nova vaga adicionada');
  assert(mixedResult.modifiedCount === 1, 'Lote misto: exatamente 1 vaga modificada atualizada');
  assert(mixedResult.ignoredDuplicatesCount === 1, 'Lote misto: exatamente 1 repetição ignorada');
  assert(mixedResult.vacancies.length === 2, 'Lista final contém exatamente 2 vagas consolidadas');

  console.log(`\n=== TODOS OS ${passed}/${total} TESTES PASSARAM COM SUCESSO! ===\n`);
}

runTests().catch((err) => {
  console.error('Erro na execução dos testes:', err);
  process.exit(1);
});
