import { fetchVerifiedPage } from './pageAccess.js';
import { createIntegrationContext } from './integrations.js';
import type { IntegrationContext } from './integrations.js';
import type { JobSettings } from '../src/types/index.js';
import * as cheerio from 'cheerio';
import { extractEmailsFromHtml } from './extractor.js';
import type { SessionState } from '../src/types/index.js';
import { isEmailBlacklisted } from '../src/utils/emailBlacklist.js';

// Process-local proofs cannot be manufactured by JSON imports or model output.
const proofs = new WeakMap<object, string>();
const fingerprint = (c: any) => JSON.stringify([c.email, c.site, c.sourceUrl,
  c.evidenceSnippet, c.extractionMethod, c.collectedAt]);
export function attestContact(contact: object) { proofs.set(contact, fingerprint(contact)); }
function attested(contact: object) { return proofs.get(contact) === fingerprint(contact); }
function safeUrl(value: string, base?: string): string | undefined {
  try { const u = new URL(value, base); if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password) return;
    u.hash = ''; return u.href;
  } catch { return; }
}
function official(url: string, root: string) {
  const host = new URL(url).hostname.replace(/^www\./, '');
  const rootHost = new URL(root).hostname.replace(/^www\./, '');
  return host === rootHost || host.endsWith('.' + rootHost);
}
function links(html: string, base: string): string[] {
  const $ = cheerio.load(html); const found: string[] = [];
  $('a[href]').each((_, el) => { const u = safeUrl($(el).attr('href') || '', base); if (u) found.push(u); });
  return found;
}

export async function verifyEmailSources(companyUrl: string, pages: string[], timeoutMs = 10000, signal?: AbortSignal, settings?: Partial<JobSettings>, suppliedContext?: IntegrationContext) {
  const context = suppliedContext || createIntegrationContext(settings);
  const matches: ReturnType<typeof extractEmailsFromHtml> = [];
  const acceptedUrls: string[] = [];
  let failed = false;
  const root = safeUrl(companyUrl);
  if (!root) return { matches, acceptedUrls, failed: true };
  if (!pages.length) return { matches, acceptedUrls, failed };
  const accessed = new Map<string, Awaited<ReturnType<typeof fetchVerifiedPage>>>();
  const load = async (url: string) => {
    if (accessed.has(url)) return accessed.get(url)!;
    const r = await fetchVerifiedPage(url, timeoutMs, signal, settings, context);
    failed ||= !!r.verificationIncomplete;
    if (r.status < 200 || r.status >= 300) throw new Error(`HTTP ${r.status}`);
    accessed.set(url, r); return r;
  };
  try {
    const home = await load(root);
    // A redirect alone is not evidence of an official third-party relationship.
    if (!official(home.finalUrl, root)) return { matches, acceptedUrls, failed: true };
    const linked = new Set(links(home.html, home.finalUrl));
    // Inspect official contact/career pages for exact links to outside sources (ATS etc.).
    for (const u of [...linked].filter(u => official(u, root) && /career|job|contact|contato|trabalhe|vagas/i.test(u)).slice(0, 5)) {
      try { const r = await load(u); if (official(r.finalUrl, root)) links(r.html, r.finalUrl).forEach(l => linked.add(l)); }
      catch { failed = true; }
    }
    for (const value of [...new Set(pages)].slice(0, 8)) {
      const u = safeUrl(value, root);
      if (!u) continue;
      // Outside sources must be linked by an accessed official page, at this exact URL.
      if (!official(u, root) && !linked.has(u)) continue;
      try {
        const r = await load(u);
        const final = safeUrl(r.finalUrl)!;
        if (!official(final, root) && !linked.has(final)) { failed = true; continue; }
        acceptedUrls.push(u, final);
        matches.push(...extractEmailsFromHtml(r.html, final)
          .filter((match) => !isEmailBlacklisted(match.email, settings))
          .map(m => ({ ...m, retrievalProvider: r.retrievalProvider })));
      } catch (e) { if (signal?.aborted) throw e; failed = true; }
    }
  } catch (e) { if (signal?.aborted) throw e; failed = true; }
  return { matches, acceptedUrls: [...new Set(acceptedUrls)], failed };
}

export async function verifyStoredContact<T extends { email: string; site: string }>(contact: T, companyUrl = contact.site, settings?: Partial<JobSettings>): Promise<T | null> {
  if (attested(contact)) return contact;
  const c = contact as any;
  if (typeof c.sourceUrl !== 'string') return null;
  const checked = await verifyEmailSources(companyUrl, [c.sourceUrl], settings?.requestTimeoutMs, undefined, settings);
  const match = checked.matches.find(m => m.email === contact.email.trim().toLowerCase());
  if (!match) return null;
  const verified = { ...contact, email: match.email, site: companyUrl, sourceUrl: match.sourceUrl,
    evidenceSnippet: match.evidenceSnippet, originalText: match.originalText,
    extractionMethod: match.extractionMethod, retrievalProvider: match.retrievalProvider, isObfuscated: false, allSources: [match.sourceUrl],
    collectedAt: new Date().toISOString() };
  attestContact(verified);
  return verified;
}

export async function sanitizeSessionContacts(session: SessionState) {
  for (const company of session.companies) {
    const previous = company.contacts || [];
    const verified = [];
    for (const contact of previous) {
      const valid = await verifyStoredContact(contact, company.normalizedUrl, session.settings);
      if (valid) verified.push(valid);
    }
    company.contacts = verified;
    if (previous.length && !verified.length) {
      company.status = 'Não foi possível verificar a fonte';
      company.error = 'Contatos restaurados não confirmados em fonte oficial acessada. Execute a pesquisa novamente.';
    }
  }
}
