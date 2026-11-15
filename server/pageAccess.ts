import { fetchWithTimeout, extractEmailsFromHtml } from './extractor.js';
import { createIntegrationContext, retrieveWithProvider, resolveIntegration } from './integrations.js';
import type { IntegrationContext, RetrievedPage } from './integrations.js';
import type { JobSettings } from '../src/types/index.js';

export async function fetchVerifiedPage(url: string, timeoutMs = 10000, signal?: AbortSignal,
  settings?: Partial<JobSettings>, suppliedContext?: IntegrationContext): Promise<RetrievedPage> {
  const context = suppliedContext || createIntegrationContext(settings);
  const cacheKey = new URL(url).href;
  const cached = context.pages.get(cacheKey);
  if (cached) return cached;
  let direct: RetrievedPage | undefined;
  let originalError: unknown;
  let externalFailed = false;
  try {
    direct = await fetchWithTimeout(url, timeoutMs, signal);
    if (direct.status < 200 || direct.status >= 300) { originalError = new Error(`HTTP ${direct.status}`); direct = undefined; }
    else direct.retrievalProvider = 'direct';
  } catch (e) { if (signal?.aborted) throw e; originalError = e; }
  const renderEmpty = settings?.renderPagesWithoutEmail ?? process.env.RENDER_PAGES_WITHOUT_EMAIL !== 'false';
  if (!direct || (renderEmpty && !extractEmailsFromHtml(direct.html, direct.finalUrl).length)) {
    const providers = settings?.pageRetrievalEnabled === false ? [] : ['firecrawl', 'you'] as const;
    for (const provider of providers) {
      if (!resolveIntegration(provider, settings).isConfigured) continue;
      try {
        context.onLog?.('info', `[Leitura: ${provider}] Acessando ${url}`);
        const page = await retrieveWithProvider(provider, url, settings, context, signal);
        externalFailed = false;
        // A successful page without an email may still carry useful official links.
        if (!direct || extractEmailsFromHtml(page.html, page.finalUrl).length) {
          context.pages.set(cacheKey, page); return page;
        }
        direct = page;
      } catch (e) {
        if (signal?.aborted) throw e;
        context.onLog?.('warn', `[Leitura: ${provider}] Fonte não confirmada; tentando próxima opção.`);
        originalError = e;
        externalFailed = true;
      }
    }
  }
  if (!direct) throw originalError || new Error('Não foi possível verificar a fonte');
  direct.verificationIncomplete = externalFailed;
  context.pages.set(cacheKey, direct); return direct;
}
