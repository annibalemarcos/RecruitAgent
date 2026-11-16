import assert from 'node:assert/strict';
import { API_KEY_FIELDS, SERVICE_CONFIG_FIELDS, exportConfig } from '../src/apiCredentialsJson.js';
import {
  buildSavedProfile,
  configToSettings,
  countApiKeys,
  parseSavedProfile,
  sanitizeCandidateProfile,
  savedProfileFileName,
} from '../src/savedProfiles.js';

let count = 0;
const test = (name: string, fn: () => void) => { fn(); console.log('PASS ' + name); count++; };

const settings = (): any => {
  const data: any = {
    aiProvider: 'openrouter', maxConcurrency: 3, maxPagesPerCompany: 7, requestTimeoutMs: 15000, delayBetweenRequestsMs: 900,
    generateMaterialsForPossible: true, generateDualLanguage: true, defaultViewLanguage: 'en',
    geminiModel: 'gemini-test', openrouterModel: 'model/test',
  };
  for (const field of API_KEY_FIELDS) data[field] = 'FAKE_TEST_' + field;
  for (const field of SERVICE_CONFIG_FIELDS) data[field] = 'FAKE_TEST_' + field;
  return data;
};
const candidate = (): any => ({
  name: 'Fulano de Tal', email: 'f@example.com', location: 'Campinas', summary: 'Resumo', summaryEn: 'Summary',
  targetRoles: ['Customer Support'], prioritySkills: ['CX'], workPreference: 'remote',
  professionalLinks: [{ label: 'LinkedIn', url: 'https://example.com/in/x' }],
  experiences: [{ role: 'Support', company: 'Acme', period: '2020-2022', highlights: ['a', 'b'] }],
  education: [], certifications: [], languages: ['PT', 'EN'], materialLanguage: 'both', parsedFromCv: true,
  cvPtFilename: 'cv.pdf', cvPtRawText: 'texto do cv', cvEnRawText: 'cv text', defaultViewLanguage: 'en',
});
const companies = [{ name: 'Acme', url: 'https://acme.example' }, { url: 'https://beta.example' }];
const all = { companies: true, candidate: true, settings: true };

test('Roundtrip completo: empresas, candidato e configurações com chaves', () => {
  const saved = buildSavedProfile({ name: '  Meu   perfil  ', blocks: all, includeApiKeys: true, companies, candidate: candidate(), settings: settings() });
  assert.equal(saved.name, 'Meu perfil');
  assert.deepEqual(saved.blocks, all);
  assert.equal(saved.includesApiKeys, true);
  assert.equal(countApiKeys(saved.config), API_KEY_FIELDS.length);
  const back = parseSavedProfile(JSON.stringify(saved));
  assert.deepEqual(back.companies, companies);
  assert.deepEqual(back.candidate, saved.candidate);
  assert.equal(back.candidate?.cvPtRawText, 'texto do cv');
  const restored: any = configToSettings(back.config!);
  assert.equal(restored.geminiApiKey, 'FAKE_TEST_geminiApiKey');
  assert.equal(restored.geminiModel, 'gemini-test');
  assert.equal(restored.aiProvider, 'openrouter');
  assert.equal(restored.maxConcurrency, 3);
  assert.equal(restored.defaultViewLanguage, 'en');
  for (const field of SERVICE_CONFIG_FIELDS) assert.equal(restored[field], 'FAKE_TEST_' + field);
});

test('Sem chaves: modelos e ajustes ficam, chaves não entram no arquivo', () => {
  const saved = buildSavedProfile({ name: 'Sem chaves', blocks: { companies: false, candidate: false, settings: true }, includeApiKeys: false, companies: [], candidate: candidate(), settings: settings() });
  assert.equal(saved.includesApiKeys, false);
  assert.equal(countApiKeys(saved.config), 0);
  for (const field of API_KEY_FIELDS) assert.ok(!(field in saved.config!.credentials), `${field} deve ser removida sem a opção de incluir chaves`);
  const restored: any = configToSettings(saved.config!);
  assert.equal(restored.geminiModel, 'gemini-test');
  assert.equal(restored.geminiApiKey, undefined);
  for (const field of SERVICE_CONFIG_FIELDS) assert.equal(restored[field], 'FAKE_TEST_' + field);
  assert.ok(!saved.companies && !saved.candidate);
});

test('Blocos desmarcados ou vazios não são gravados; nenhum bloco é erro', () => {
  const only = buildSavedProfile({ name: 'x', blocks: { companies: true, candidate: false, settings: false }, includeApiKeys: true, companies, candidate: candidate(), settings: settings() });
  assert.deepEqual(only.blocks, { companies: true, candidate: false, settings: false });
  assert.ok(!only.candidate && !only.config);
  assert.throws(() => buildSavedProfile({ name: 'x', blocks: { companies: true, candidate: false, settings: false }, includeApiKeys: true, companies: [], candidate: candidate(), settings: settings() }));
});

test('Importa config.json (novo e antigo) como perfil só de configurações', () => {
  const fromNew = parseSavedProfile(exportConfig(settings()), 'config');
  assert.deepEqual(fromNew.blocks, { companies: false, candidate: false, settings: true });
  assert.equal(fromNew.name, 'config');
  assert.equal(fromNew.includesApiKeys, true);
  const legacy = parseSavedProfile(JSON.stringify({ GEMINI_API_KEY: 'FAKE_TEST_x', openaiModel: 'm' }), 'chaves');
  assert.equal((configToSettings(legacy.config!) as any).geminiApiKey, 'FAKE_TEST_x');
});

test('Importa perfil_candidato.json como perfil só de candidato', () => {
  const imported = parseSavedProfile(JSON.stringify(candidate()), 'perfil candidato');
  assert.deepEqual(imported.blocks, { companies: false, candidate: true, settings: false });
  assert.equal(imported.candidate?.name, 'Fulano de Tal');
});

test('Arquivos inválidos são rejeitados com mensagem clara', () => {
  for (const text of ['', '{', '[]', 'null', '{"foo":1}', '{"format":"recruitment-saved-profile","version":2,"candidate":{}}',
    '{"format":"recruitment-saved-profile","version":1}', '{"format":"recruitment-saved-profile","version":1,"config":{"settings":{"aiProvider":"evil"}}}',
    '{"format":"recruitment-saved-profile","version":1,"companies":"x"}', '{"format":"recruitment-saved-profile","version":1,"companies":[{"name":"sem url"}]}'])
    assert.throws(() => parseSavedProfile(text), text);
});

test('Dados mal formados são saneados (tipos errados descartados, limites aplicados)', () => {
  const dirty: any = { name: 5, summary: 'ok', targetRoles: ['a', 3, null], workPreference: 'evil', experiences: [{ role: 'r', highlights: 'x' }, 'lixo'], professionalLinks: [null, { url: 'u' }], materialLanguage: 'zz', defaultViewLanguage: 'fr' };
  const clean = sanitizeCandidateProfile(dirty);
  assert.equal(clean.name, ''); assert.deepEqual(clean.targetRoles, ['a']); assert.equal(clean.workPreference, 'any');
  assert.equal(clean.materialLanguage, 'both'); assert.equal(clean.defaultViewLanguage, undefined);
  assert.deepEqual(clean.experiences, [{ role: 'r', company: 'Empresa', period: '', highlights: [] }]);
  assert.deepEqual(clean.professionalLinks, [{ label: 'Link', url: 'u' }]);
  const long = parseSavedProfile(JSON.stringify({ format: 'recruitment-saved-profile', version: 1, name: 'n'.repeat(200), companies: [{ url: 'https://a.example' }] }));
  assert.equal(long.name.length, 60);
});

test('Nome do arquivo exportado é seguro', () => {
  const saved = buildSavedProfile({ name: 'Suporte – Web3 / "CX"', blocks: { companies: false, candidate: false, settings: true }, includeApiKeys: false, companies: [], candidate: candidate(), settings: settings() });
  assert.equal(savedProfileFileName(saved), 'perfil-suporte-web3-cx.json');
});

console.log(`${count} testes de perfis salvos passaram; somente chaves fictícias.`);
