import {
  reconcileVacancies,
  isVacancyEquivalent,
  detectVacancyModifications,
  normalizeJobTitle,
  normalizeJobUrl,
} from '../server/vacancyManager.js';
import { Vacancy } from '../src/types/index.js';

console.log('=== TESTE DE AUDITORIA, VERIFICAÇÃO E DEDUPLICAÇÃO DE VAGAS ===\n');

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

// 1. Normalização
assert(normalizeJobTitle('Desenvolvedor Full-Stack (Remoto)') === 'desenvolvedor full stack remoto', 'Normalização de título');
assert(normalizeJobUrl('https://site.com/vagas/123?utm_source=google&ref=123/') === 'https://site.com/vagas/123', 'Normalização de URL sem tracking');

// 2. Equivalência de vagas
const v1: Vacancy = { title: 'Engenheiro de Software', url: 'https://empresa.com/jobs/456' };
const v2: Vacancy = { title: 'engenheiro de software', url: 'https://empresa.com/jobs/456?utm_campaign=spring' };
assert(isVacancyEquivalent(v1, v2), 'isVacancyEquivalent detecta mesma vaga mesmo com variação de case e UTM');

// 3. Detecção de Modificação vs Repetição
const diffRepetition = detectVacancyModifications(v1, v2);
assert(!diffRepetition.isModified, 'Mesmo link e título = isModified false (repetição pura)');

const vModified: Vacancy = {
  title: 'Engenheiro de Software Sênior',
  url: 'https://empresa.com/jobs/456-senior',
  description: 'Requisitos atualizados com liderança técnica',
};
const diffMod = detectVacancyModifications(v1, vModified);
assert(diffMod.isModified, 'Mudança de URL, título ou descrição = isModified true');
assert(Boolean(diffMod.details && diffMod.details.length > 5), 'Detalhes da modificação documentados');

// 4. Reconciliação Geral (Regra: verificar se já existe; se sim, se foi modificada; se não, caso seja repetição ignorar e não listar)
const baseList: Vacancy[] = [
  {
    id: 'vac_1',
    title: 'Analista de Dados',
    url: 'https://empresa.com/vagas/dados',
    description: 'SQL e Python',
    isModified: false,
  },
];

// Lote: 1 repetição, 1 modificada, 1 nova
const incomingBatch: Vacancy[] = [
  // Repetição idêntica -> DEVE IGNORAR E NÃO LISTAR
  {
    title: 'Analista de Dados',
    url: 'https://empresa.com/vagas/dados',
    description: 'SQL e Python',
  },
  // Vaga existente modificada -> DEVE ATUALIZAR E MARCAR COMO MODIFICADA
  {
    title: 'Analista de Dados Pleno',
    url: 'https://empresa.com/vagas/dados-v2',
    description: 'SQL, Python e PowerBI com modelagem dimensional',
  },
  // Vaga nova inexistente -> DEVE INCLUIR
  {
    title: 'Gerente de Produto',
    url: 'https://empresa.com/vagas/pm',
    description: 'Gestão de roadmap de produto digital',
  },
];

const result = reconcileVacancies(baseList, incomingBatch);

assert(result.ignoredDuplicatesCount === 1, 'Exatamente 1 repetição idêntica ignorada');
assert(result.modifiedCount === 1, 'Exatamente 1 vaga modificada identificada e atualizada');
assert(result.addedCount === 1, 'Exatamente 1 nova vaga adicionada');
assert(result.vacancies.length === 2, 'Total final na lista é 2 (a modificada atualizada e a nova, sem a duplicata)');
assert(result.vacancies[0].isModified === true, 'Vaga modificada possui isModified=true');
assert(Boolean(result.vacancies[0].description?.includes('PowerBI')), 'Descrição da vaga modificada foi atualizada com sucesso');
assert(result.vacancies[1].title === 'Gerente de Produto', 'Nova vaga consta na lista');

console.log(`\n=== SUCESSO! ${passed}/${total} TESTES DE VAGAS APROVADOS! ===`);
