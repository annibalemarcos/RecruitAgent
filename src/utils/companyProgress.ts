import type { CompanyItem } from '../types/index.js';

const FINISHED_COMPANY_STATUSES = new Set([
  'Concluído',
  'Concluído parcialmente',
  'Sem contato de recrutamento',
  'Email não encontrado',
  'Não foi possível verificar a fonte',
  'Erro',
  'Bloqueado',
]);

export function isCompanyFinished(company: CompanyItem): boolean {
  return FINISHED_COMPANY_STATUSES.has(company.status);
}
