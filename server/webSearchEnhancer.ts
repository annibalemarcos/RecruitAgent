import { verifyEmailSources } from './emailVerification.js';
import { classifyEmail } from './extractor.js';
import { searchOrder, searchWithProvider, createIntegrationContext } from './integrations.js';
import type { IntegrationContext, IntegrationLog } from './integrations.js';
import type { AISearchResult } from './aiSearchEnhancer.js';
import type { JobSettings } from '../src/types/index.js';

export async function enhanceCompanySearchWithWeb(companyName: string, companyUrl: string, settings?: JobSettings,
  onLog?: IntegrationLog, signal?: AbortSignal, suppliedContext?: IntegrationContext): Promise<AISearchResult | null> {
  const context = suppliedContext || createIntegrationContext(settings, onLog);
  const root = new URL(companyUrl);
  const query = `site:${root.hostname} careers jobs contact recrutamento contato "${companyName}"`;
  let best: AISearchResult | null = null;
  let verificationFailed = false;
  for (const provider of searchOrder(settings)) {
    if (signal?.aborted) throw signal.reason || new Error('Pesquisa cancelada');
    try {
      onLog?.('info', `[Busca web: ${provider}] Pesquisando páginas de ${companyName}...`);
      const urls = await searchWithProvider(provider, query, settings, context, signal);
      if (!urls.length) { onLog?.('info', `[Busca web: ${provider}] Sem URLs; tentando próximo provedor.`); continue; }
      // Snippets, answers and extracted search metadata never become email evidence.
      const checked = await verifyEmailSources(companyUrl, urls, settings?.requestTimeoutMs, signal, settings, context);
      verificationFailed ||= checked.failed;
      const contacts = [...new Map(checked.matches.map(m => [m.email, {
        ...m, ...classifyEmail(m.email, m.evidenceSnippet, m.sourceUrl, m.pageContext), collectedAt: new Date().toISOString(),
      }])).values()];
      const alternatives = checked.acceptedUrls.filter(url => /career|jobs?|vagas|trabalhe|apply|application|greenhouse|lever|ashby|gupy/i.test(url));
      const result: AISearchResult = { contacts, careersUrl: alternatives[0] || best?.careersUrl,
        applicationPortalUrl: alternatives.find(url => new URL(url).hostname !== root.hostname) || best?.applicationPortalUrl,
        vacancies: [], sourceProvider: provider, providerName: provider, verificationFailed };
      best = result;
      if (contacts.length) { onLog?.('success', `[Busca web: ${provider}] ${contacts.length} email(s) comprovado(s).`); return result; }
      onLog?.('info', `[Busca web: ${provider}] Nenhum email comprovado; tentando próxima busca.`);
    } catch (e) {
      if (signal?.aborted) throw e;
      // Error bodies from providers may contain credentials; log only controlled descriptions.
      onLog?.('warn', `[Busca web: ${provider}] Indisponível ou sem cota; próxima API assumirá.`);
    }
  }
  return best;
}
