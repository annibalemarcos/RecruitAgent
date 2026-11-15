import { sanitizeMaterialText } from '../server/materialsGenerator.js';
import { CandidateProfile, CompanyItem, RecruitmentContact } from '../src/types/index.js';

console.log('=== TESTE DE SANITIZAÇÃO E ELIMINAÇÃO DE PLACEHOLDERS EM MATERIAIS ===\n');

let passed = 0;
let total = 0;

function assert(condition: boolean, msg: string) {
  total++;
  if (condition) {
    console.log(`[PASS] ${msg}`);
    passed++;
  } else {
    console.error(`[FAIL] ${msg}`);
    process.exit(1);
  }
}

const mockCompany: CompanyItem = {
  id: 'comp_aqua_1',
  name: 'Aqua',
  rawUrl: 'https://aqua.example',
  normalizedUrl: 'https://aqua.example',
  status: 'Pendente',
  visitedPages: [],
  vacanciesFound: [],
  contacts: [],
  updatedAt: new Date().toISOString(),
};

const mockContact: RecruitmentContact = {
  id: 'cnt_1',
  companyId: 'comp_aqua_1',
  companyName: 'Aqua',
  site: 'https://aqua.example',
  email: 'careers@aqua.example',
  classification: 'Recrutamento confirmado',
  justification: 'Careers page email',
  sourceUrl: 'https://aqua.example/careers',
  allSources: ['https://aqua.example/careers'],
  evidenceSnippet: 'Contact careers@aqua.example',
  collectedAt: new Date().toISOString(),
  isObfuscated: false,
  materialsGenerated: false,
};

// --------------------------------------------------------------------------
// TESTE 1: Perfil SEM telefone/email/linkedin -> NADA abaixo do nome
// --------------------------------------------------------------------------
const profileWithoutContacts: CandidateProfile = {
  name: 'Pessoa Exemplo',
  email: '',
  phone: '',
  location: '',
  summary: 'Customer Support and Operations Specialist',
  targetRoles: ['Customer Support Representative'],
  prioritySkills: ['Customer Support', 'P2P dispute resolution'],
  workPreference: 'remote',
  professionalLinks: [],
  experiences: [],
  education: [],
  certifications: [],
  languages: ['English', 'Portuguese'],
  materialLanguage: 'both',
  parsedFromCv: false,
};

const badCoverLetterEn = `Dear [Recruiter's Name],

My name is Pessoa Exemplo, and I am a professional with over 10 years of experience in Customer Support and Operations.

I am particularly excited about the possibility of working at [Company Name].

Sincerely,
Pessoa Exemplo
[Your Phone] | [Your Email] | [Your LinkedIn]`;

const sanitized1 = sanitizeMaterialText(badCoverLetterEn, profileWithoutContacts, mockCompany, mockContact, 'en');

assert(!sanitized1.includes("[Recruiter's Name]"), 'Saudação não contém [Recruiter\'s Name]');
assert(sanitized1.includes('Dear Recruiter,') || sanitized1.includes('Dear Aqua Team,'), 'Saudação foi convertida para Dear Recruiter ou Dear Aqua Team');
assert(!sanitized1.includes('[Company Name]'), 'Nome da empresa foi resolvido');
assert(sanitized1.includes('Aqua'), 'Texto contém o nome real da empresa (Aqua)');
assert(!sanitized1.includes('[Your Phone]'), 'Não contém [Your Phone]');
assert(!sanitized1.includes('[Your Email]'), 'Não contém [Your Email]');
assert(!sanitized1.includes('[Your LinkedIn]'), 'Não contém [Your LinkedIn]');
assert(!sanitized1.includes('['), 'Nenhum colchete sobrou no texto');

// Deve terminar apenas com "Sincerely,\nPessoa Exemplo"
assert(sanitized1.trim().endsWith('Sincerely,\nPessoa Exemplo'), 'Termina estritamente com Sincerely,\\nPessoa Exemplo sem placeholders abaixo');

// --------------------------------------------------------------------------
// TESTE 2: Perfil COM dados reais de contato -> Substituição pelos dados do perfil
// --------------------------------------------------------------------------
const profileWithContacts: CandidateProfile = {
  name: 'Pessoa Exemplo',
  email: 'pessoa@example.com',
  phone: '+1 202-555-0100',
  location: 'São Paulo, Brasil',
  summary: 'Customer Support and Operations Specialist',
  targetRoles: ['Customer Support Representative'],
  prioritySkills: ['Customer Support'],
  workPreference: 'remote',
  professionalLinks: [
    { label: 'LinkedIn', url: 'https://linkedin.com/in/example' },
  ],
  experiences: [],
  education: [],
  certifications: [],
  languages: ['English', 'Portuguese'],
  materialLanguage: 'both',
  parsedFromCv: false,
};

const sanitized2 = sanitizeMaterialText(badCoverLetterEn, profileWithContacts, mockCompany, mockContact, 'en');

assert(sanitized2.includes('+1 202-555-0100'), 'Contém telefone do perfil');
assert(sanitized2.includes('pessoa@example.com'), 'Contém e-mail do perfil');
assert(sanitized2.includes('https://linkedin.com/in/example'), 'Contém LinkedIn do perfil');
assert(!sanitized2.includes('[Your Phone]'), 'Placeholder [Your Phone] foi removido');
assert(!sanitized2.includes('['), 'Nenhum colchete no resultado');

// --------------------------------------------------------------------------
// TESTE 3: Versão em Português
// --------------------------------------------------------------------------
const badCoverLetterPt = `Prezado(a) [Nome do Recrutador],

Meu nome é Pessoa Exemplo, e venho apresentar meu perfil para a [Nome da Empresa].

Atenciosamente,
Pessoa Exemplo
[Seu Telefone] | [Seu Email] | [Seu LinkedIn]`;

const sanitizedPt = sanitizeMaterialText(badCoverLetterPt, profileWithoutContacts, mockCompany, mockContact, 'pt');

assert(!sanitizedPt.includes('[Nome do Recrutador]'), 'Saudação PT não contém [Nome do Recrutador]');
assert(sanitizedPt.includes('Prezada equipe da Aqua,') || sanitizedPt.includes('Prezada equipe de recrutamento,'), 'Saudação PT convertida corretamente');
assert(!sanitizedPt.includes('[Nome da Empresa]'), 'Nome da empresa resolvido em PT');
assert(sanitizedPt.includes('Aqua'), 'Contém Aqua em PT');
assert(!sanitizedPt.includes('[Seu Telefone]'), 'Não contém [Seu Telefone]');
assert(!sanitizedPt.includes('['), 'Nenhum colchete no resultado em PT');
assert(sanitizedPt.trim().endsWith('Atenciosamente,\nPessoa Exemplo'), 'Termina estritamente com Atenciosamente,\\nPessoa Exemplo');

console.log(`\n=== SUCESSO! ${passed}/${total} TESTES DE SANITIZAÇÃO APROVADOS! ===`);
