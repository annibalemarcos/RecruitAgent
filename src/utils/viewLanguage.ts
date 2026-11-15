import type { CandidateProfile, JobSettings } from '../types/index.js';

export type ViewLanguage = 'pt' | 'en';

const isViewLanguage = (value: unknown): value is ViewLanguage => value === 'pt' || value === 'en';

/**
 * Língua Padrão do seletor "Visualizar".
 * Prioridade: Configurações → Perfil → PT-BR.
 */
export function resolveDefaultViewLanguage(
  settings?: Partial<Pick<JobSettings, 'defaultViewLanguage'>> | null,
  profile?: Partial<Pick<CandidateProfile, 'defaultViewLanguage'>> | null
): ViewLanguage {
  if (isViewLanguage(settings?.defaultViewLanguage)) return settings!.defaultViewLanguage as ViewLanguage;
  if (isViewLanguage(profile?.defaultViewLanguage)) return profile!.defaultViewLanguage as ViewLanguage;
  return 'pt';
}
