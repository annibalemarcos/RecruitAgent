import { fetchVerifiedPage } from './pageAccess.js';
import type { IntegrationContext } from './integrations.js';
import { createIntegrationContext } from './integrations.js';
import type { JobSettings } from '../src/types/index.js';
import { verifyEmailSources, attestContact } from './emailVerification.js';
import * as cheerio from 'cheerio';
import { RecruitmentContact, ContactClassification, Vacancy } from '../src/types/index.js';
import { reconcileVacancies } from './vacancyManager.js';

export interface CrawlResult {
  normalizedUrl: string;
  companyName: string;
  companyAbout: string;
  visitedPages: string[];
  careersUrl?: string;
  applicationPortalUrl?: string;
  vacanciesFound: Vacancy[];
  contacts: RecruitmentContact[];
  status: 'Contato encontrado' | 'Sem contato de recrutamento' | 'Bloqueado' | 'Erro' | 'Email não encontrado' | 'Não foi possível verificar a fonte';
  error?: string;
}

const RECRUITMENT_PREFIXES = new Set([
  'jobs',
  'careers',
  'career',
  'recruitment',
  'recruiting',
  'talent',
  'talento',
  'talentos',
  'hr',
  'hiring',
  'apply',
  'people',
  'rh',
  'vagas',
  'curriculos',
  'curriculo',
  'trabalheconosco',
  'trabalhe-conosco',
  'trabalhe',
  'oportunidades',
  'recrutamento',
]);

const GENERAL_PREFIXES = new Set([
  'contact',
  'contato',
  'info',
  'hello',
  'ola',
  'oi',
  'faleconosco',
  'general',
  'office',
  'mail',
  'comunicacao',
  'atendimento',
]);

const OTHER_PREFIXES = new Set([
  'support',
  'suporte',
  'help',
  'ajuda',
  'sales',
  'vendas',
  'comercial',
  'billing',
  'finance',
  'financeiro',
  'press',
  'imprensa',
  'media',
  'legal',
  'juridico',
  'privacy',
  'privacidade',
  'dpo',
  'security',
  'seguranca',
  'abuse',
  'marketing',
]);

const ATS_DOMAINS = [
  'greenhouse.io',
  'lever.co',
  'gupy.io',
  'workable.com',
  'bamboohr.com',
  'ashbyhq.com',
  'smartrecruiters.com',
  'applytojob.com',
  'recruitee.com',
  'breezy.hr',
  'personio.de',
  'personio.com',
  'jobs.jobvite.com',
  'rippling-ats.com',
  'kenoby.com',
  'solides.com.br',
  'pandape.infojobs.com.br',
];

// Differentiated scraping errors
export class RequestTimeoutError extends Error {
  readonly isTimeout = true;
  constructor(message: string) {
    super(message);
    this.name = 'RequestTimeoutError';
  }
}

export class UserCancelledError extends Error {
  readonly isCancelled = true;
  constructor(message: string = 'Operação cancelada pelo usuário.') {
    super(message);
    this.name = 'UserCancelledError';
  }
}

export class SslCertificateError extends Error {
  readonly isCertError = true;
  readonly code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.name = 'SslCertificateError';
    this.code = code;
  }
}

function extractCertErrorCode(err: unknown): string | null {
  if (!err) return null;
  const anyErr = err as any;
  const code = anyErr?.cause?.code || anyErr?.code || '';
  if (
    code === 'CERT_HAS_EXPIRED' ||
    code === 'DEPTH_ZERO_SELF_SIGNED_CERT' ||
    code === 'SELF_SIGNED_CERT_IN_CHAIN' ||
    code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' ||
    code === 'ERR_TLS_CERT_ALTNAME_INVALID'
  ) {
    return code;
  }
  const msg = String(err);
  if (msg.includes('unable to verify the first certificate')) return 'UNABLE_TO_VERIFY_LEAF_SIGNATURE';
  if (msg.includes('certificate has expired')) return 'CERT_HAS_EXPIRED';
  if (msg.includes('self-signed certificate')) return 'DEPTH_ZERO_SELF_SIGNED_CERT';
  return null;
}

export function normalizeUrl(rawUrl: string): string {
  let url = rawUrl.trim();
  if (!url) return '';
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = `https://${url}`;
  }
  try {
    const parsed = new URL(url);
    // Remove query params & hash for root URL
    return `${parsed.protocol}//${parsed.hostname}${parsed.pathname === '/' ? '' : parsed.pathname}`.replace(/\/+$/, '');
  } catch {
    return url;
  }
}

export async function fetchWithTimeout(
  url: string,
  timeoutMs: number = 10000,
  cancelSignal?: AbortSignal
): Promise<{ html: string; status: number; finalUrl: string }> {
  if (cancelSignal?.aborted) {
    throw new UserCancelledError();
  }

  const headers = {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    'Accept':
      'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
    'Cache-Control': 'no-cache',
  };

  const attemptFetch = async (targetUrl: string) => {
    let timedOut = false;
    const controller = new AbortController();

    const onCancel = () => {
      controller.abort('user_cancelled');
    };
    if (cancelSignal) {
      cancelSignal.addEventListener('abort', onCancel, { once: true });
    }

    const timer = setTimeout(() => {
      timedOut = true;
      try {
        controller.abort('timeout');
      } catch {}
    }, timeoutMs);

    try {
      const response = await fetch(targetUrl, {
        signal: controller.signal,
        headers,
        redirect: 'follow',
      });
      const html = await response.text();
      clearTimeout(timer);
      if (cancelSignal) {
        cancelSignal.removeEventListener('abort', onCancel);
      }
      return {
        html,
        status: response.status,
        finalUrl: response.url || targetUrl,
      };
    } catch (err: unknown) {
      clearTimeout(timer);
      if (cancelSignal) {
        cancelSignal.removeEventListener('abort', onCancel);
      }

      // 1. User cancellation
      if (
        cancelSignal?.aborted ||
        controller.signal.reason === 'user_cancelled' ||
        (err as any)?.name === 'UserCancelledError'
      ) {
        throw new UserCancelledError();
      }

      // 2. Timeout (including AbortError caused by timeout or Node's internal timeout)
      const errName = (err as any)?.name || '';
      const errMsg = String(err).toLowerCase();
      if (
        timedOut ||
        controller.signal.reason === 'timeout' ||
        controller.signal.aborted ||
        errName === 'TimeoutError' ||
        errName === 'AbortError' ||
        errMsg.includes('timeout') ||
        errMsg.includes('abort')
      ) {
        throw new RequestTimeoutError(`Tempo limite de ${timeoutMs}ms esgotado ao acessar ${targetUrl}`);
      }

      const certCode = extractCertErrorCode(err);
      if (certCode) {
        throw new SslCertificateError(
          `Falha de verificação SSL/TLS no servidor remoto (${certCode}).`,
          certCode
        );
      }

      throw err;
    }
  };

  try {
    return await attemptFetch(url);
  } catch (err: unknown) {
    if (err instanceof UserCancelledError || err instanceof RequestTimeoutError) {
      throw err;
    }

    // If HTTPS failed due to SSL or connection refused, retry with HTTP as fallback
    if (url.startsWith('https://')) {
      const httpUrl = `http://${url.slice(8)}`;
      try {
        return await attemptFetch(httpUrl);
      } catch {
        // rethrow original specific error
        throw err;
      }
    }
    throw err;
  }
}

interface RawEmailMatch {
  email: string;
  retrievalProvider?: string;
  extractionMethod: 'mailto' | 'page-text';
  sourceUrl: string;
  evidenceSnippet: string;
  isObfuscated: boolean;
  originalText?: string;
  pageContext: string;
}

export function extractEmailsFromHtml(html: string, pageUrl: string): RawEmailMatch[] {
  const $ = cheerio.load(html);
  const results: RawEmailMatch[] = [];

  // Remove scripts, styles, svg
  $('script, style, noscript, svg').remove();

  // The original href is evidence, including when link text hides the address.
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href') || '';
    if (!/^mailto:/i.test(href)) return;
    let recipients: string;
    try { recipients = decodeURIComponent(href.slice(7).split('?')[0]); } catch { return; }
    for (const address of recipients.split(/[,;]/)) {
      const email = address.trim();
      if (!/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email)) continue;
      results.push({ email: email.toLowerCase(), sourceUrl: pageUrl,
        evidenceSnippet: href, originalText: href, extractionMethod: 'mailto',
        isObfuscated: false, pageContext: $('title').text() + ' ' + $(el).parent().text() });
    }
  });

  // Separate DOM text nodes to avoid constructing addresses across unrelated elements.
  const textParts: string[] = [];
  const collectText = (node: any) => {
    if (node.type === 'text') textParts.push(node.data || '');
    else for (const child of node.children || []) collectText(child);
  };
  $('body').each((_, node) => collectText(node));
  const fullText = textParts.join('\n');

  // 2. Standard regex emails
  const emailRegex = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi;
  let match: RegExpExecArray | null;
  while ((match = emailRegex.exec(fullText)) !== null) {
    const email = match[1].toLowerCase();
    // Exclude invalid asset names or dummy domains
    if (
      email.endsWith('.png') ||
      email.endsWith('.jpg') ||
      email.endsWith('.svg') ||
      email.endsWith('.webp') ||
      email.includes('example.com') ||
      email.includes('sentry.io') ||
      email.includes('wixpress.com')
    ) {
      continue;
    }

    const start = Math.max(0, match.index - 70);
    const end = Math.min(fullText.length, match.index + email.length + 70);
    const snippet = fullText.slice(start, end).trim();

    results.push({
      email,
      extractionMethod: 'page-text',
      originalText: snippet,
      sourceUrl: pageUrl,
      evidenceSnippet: snippet,
      isObfuscated: false,
      pageContext: $('title').text() + ' ' + snippet,
    });
  }

  return results;
}

export function classifyEmail(
  email: string,
  evidenceSnippet: string,
  pageUrl: string,
  pageContext: string
): { classification: ContactClassification; justification: string } {
  const prefix = email.split('@')[0]?.toLowerCase() || '';
  const context = (evidenceSnippet + ' ' + pageUrl + ' ' + pageContext).toLowerCase();

  // Explicit hiring phrases
  const explicitRecruitmentPhrases = [
    'envie seu currículo',
    'envie seu curriculo',
    'mande seu currículo',
    'mande seu cv',
    'send your resume',
    'send your cv',
    'apply at',
    'careers email',
    'recruitment email',
    'candidaturas',
    'candidatura espontânea',
    'trabalhe com a gente',
    'faça parte da nossa equipe',
    'join our team',
    'talent acquisition',
    'vagas abertas',
    'processo seletivo',
    'interessados devem enviar',
  ];

  const hasExplicitPhrase = explicitRecruitmentPhrases.some((phrase) => context.includes(phrase));

  // Check prefix
  if (RECRUITMENT_PREFIXES.has(prefix)) {
    if (hasExplicitPhrase || context.includes('career') || context.includes('vaga') || context.includes('job')) {
      return {
        classification: 'Recrutamento confirmado',
        justification: `Endereço dedicado (${prefix}@) com menção explícita a candidaturas ou vagas no contexto da página.`,
      };
    }
    return {
      classification: 'Recrutamento confirmado',
      justification: `Prefixo institucional expressamente reservado para atração e contratação (${prefix}@).`,
    };
  }

  if (hasExplicitPhrase) {
    return {
      classification: 'Recrutamento confirmado',
      justification: `Página instrui explicitamente o envio de currículos ou candidaturas para este endereço (${email}).`,
    };
  }

  // Check possible recruitment
  const isCareersOrAboutPage =
    pageUrl.includes('career') ||
    pageUrl.includes('vaga') ||
    pageUrl.includes('job') ||
    pageUrl.includes('trabalhe') ||
    pageUrl.includes('recrutamento') ||
    pageUrl.includes('about') ||
    pageUrl.includes('sobre') ||
    pageUrl.includes('equipe') ||
    pageUrl.includes('team');

  if (prefix === 'people' || prefix === 'team' || prefix === 'contato' || prefix === 'info' || prefix === 'contact') {
    if (isCareersOrAboutPage && (context.includes('oportunidade') || context.includes('talento') || context.includes('equipe'))) {
      return {
        classification: 'Possível recrutamento',
        justification: `E-mail identificado em seção de carreiras/equipe com contexto relacionado a oportunidades, necessitando validação.`,
      };
    }
  }

  // Check other departments
  if (OTHER_PREFIXES.has(prefix) || context.includes('suporte técnico') || context.includes('sac') || context.includes('assessoria de imprensa')) {
    return {
      classification: 'Outra finalidade',
      justification: `Endereço claramente destinado a departamento operacional, suporte, vendas ou imprensa (${prefix}@).`,
    };
  }

  if (GENERAL_PREFIXES.has(prefix)) {
    return {
      classification: 'Contato geral',
      justification: `Endereço institucional geral (${prefix}@) sem evidência conclusiva de recepção de candidaturas.`,
    };
  }

  return {
    classification: 'Contato geral',
    justification: `Endereço institucional localizado sem menção direta a processos seletivos.`,
  };
}

export function extractVacanciesAndAbout($: cheerio.CheerioAPI, baseUrl: string): {
  about: string;
  vacancies: Vacancy[];
  portalUrl?: string;
  restrictions?: string;
} {
  // Extract About snippet
  let about = $('meta[name="description"]').attr('content') || '';
  if (!about) {
    about = $('meta[property="og:description"]').attr('content') || '';
  }
  if (!about) {
    const firstP = $('main p, article p, #about p, .about p, body p').first().text().trim();
    if (firstP.length > 30) {
      about = firstP.slice(0, 300);
    }
  }

  // Find external ATS portal link
  let portalUrl: string | undefined;
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href') || '';
    for (const ats of ATS_DOMAINS) {
      if (href.includes(ats)) {
        portalUrl = href;
        return false;
      }
    }
  });

  // Extract open job titles listed in the page
  const vacancies: Vacancy[] = [];
  const vacancyKeywords = ['desenvolvedor', 'developer', 'engineer', 'engenheiro', 'designer', 'product', 'analista', 'gerente', 'coordenador', 'estágio', 'intern', 'consultor', 'especialista'];

  $('h2, h3, h4, .job-title, .job-listing, .vaga, .position-title, [class*="job"], [class*="vaga"]').each((_, el) => {
    const text = $(el).text().replace(/\s+/g, ' ').trim();
    if (text.length >= 4 && text.length <= 80) {
      const lower = text.toLowerCase();
      const isJobTitle = vacancyKeywords.some((k) => lower.includes(k)) || lower.includes('vaga') || lower.includes('analista') || lower.includes('lead');
      if (isJobTitle) {
        const linkEl = $(el).closest('a').length ? $(el).closest('a') : $(el).find('a');
        let jobUrl: string | undefined;
        if (linkEl.length) {
          const rawLink = linkEl.attr('href');
          if (rawLink) {
            try {
              jobUrl = new URL(rawLink, baseUrl).toString();
            } catch {
              jobUrl = rawLink;
            }
          }
        }

        // Try extracting nearby description or location snippet
        const nextDesc = $(el).next('p, .job-desc, .description, span').text().replace(/\s+/g, ' ').trim().slice(0, 300);
        const desc = nextDesc.length > 15 ? nextDesc : undefined;

        const candidateVacancy: Vacancy = {
          title: text,
          url: jobUrl,
          description: desc,
        };

        const rec = reconcileVacancies(vacancies, [candidateVacancy]);
        if (rec.addedCount > 0 || rec.modifiedCount > 0) {
          vacancies.length = 0;
          vacancies.push(...rec.vacancies);
        }
      }
    }
  });

  // Check restrictions or application instructions
  let restrictions: string | undefined;
  const pageText = $('body').text().toLowerCase();
  if (pageText.includes('não aceitamos candidaturas por e-mail') || pageText.includes('não envie currículos por e-mail')) {
    restrictions = 'Aviso explícito: não aceita candidaturas por e-mail. Utilize o portal oficial.';
  } else if (pageText.includes('candidaturas exclusivamente através') || pageText.includes('apenas através da plataforma')) {
    restrictions = 'Candidaturas solicitadas exclusivamente através da plataforma de vagas.';
  }

  return {
    about: about.slice(0, 400),
    vacancies: vacancies.slice(0, 8),
    portalUrl,
    restrictions,
  };
}

const LEGAL_LINK = /privacy|privacidade|pol[ií]tica.*dados|data.protection|terms|termos|condi[çc][oõ]es|legal|jur[ií]dico/i;

function discoverLegalLinks($: cheerio.CheerioAPI, baseUrl: string, officialUrl: string): string[] {
  const rootHost = new URL(officialUrl).hostname.replace(/^www\./, '');
  const found = new Set<string>();
  $('a[href]').each((_, el) => {
    try {
      const raw = $(el).attr('href') || '';
      if (!raw || raw.startsWith('#')) return;
      const url = new URL(raw, baseUrl);
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return;
      const host = url.hostname.replace(/^www\./, '');
      if (host !== rootHost && !host.endsWith('.' + rootHost)) return;
      if (!LEGAL_LINK.test(decodeURI(url.pathname) + ' ' + $(el).text())) return;
      url.hash = '';
      found.add(url.href);
    } catch { /* Ignore invalid links. */ }
  });
  return [...found];
}

export function discoverRelevantLinks($: cheerio.CheerioAPI, baseUrl: string): { careersLinks: string[]; otherLinks: string[] } {
  const careersKeywords = [
    'career',
    'careers',
    'jobs',
    'vagas',
    'carreiras',
    'carreira',
    'trabalhe',
    'trabalhe-conosco',
    'trabalheconosco',
    'join',
    'join-us',
    'work-with-us',
    'work',
    'recrutamento',
    'talent',
    'oportunidades',
    'oportunidade',
    'people',
    'rh',
  ];

  const infoKeywords = ['support', 'help', 'suporte', 'ajuda', 'about', 'sobre', 'quem-somos', 'contact', 'contato', 'fale-conosco', 'empresa', 'team', 'equipe'];

  const careersSet = new Set<string>();
  const otherSet = new Set<string>();

  let baseOrigin = '';
  try {
    baseOrigin = new URL(baseUrl).origin;
  } catch {
    baseOrigin = baseUrl;
  }

  $('a[href]').each((_, el) => {
    const rawHref = $(el).attr('href')?.trim();
    if (!rawHref || rawHref.startsWith('#') || rawHref.startsWith('javascript:') || rawHref.startsWith('tel:')) {
      return;
    }

    try {
      const resolved = new URL(rawHref, baseUrl);
      const urlStr = resolved.toString();
      const pathAndText = (resolved.pathname + ' ' + $(el).text()).toLowerCase();

      // Check external ATS link
      const isAts = ATS_DOMAINS.some((domain) => resolved.hostname.includes(domain));
      if (isAts) {
        careersSet.add(urlStr);
        return;
      }

      // Check same domain
      if (resolved.origin === baseOrigin) {
        if (LEGAL_LINK.test(pathAndText)) return;
        const isCareer = careersKeywords.some((k) => pathAndText.includes(k));
        if (isCareer) {
          careersSet.add(urlStr);
          return;
        }

        const isInfo = infoKeywords.some((k) => pathAndText.includes(k));
        if (isInfo) {
          otherSet.add(urlStr);
        }
      }
    } catch {
      // Ignore malformed hrefs
    }
  });

  return {
    careersLinks: Array.from(careersSet),
    otherLinks: Array.from(otherSet),
  };
}

export async function crawlCompany(
  companyId: string,
  companyName: string,
  rawUrl: string,
  maxPages: number = 5,
  timeoutMs: number = 10000,
  delayMs: number = 400,
  onLog?: (level: 'info' | 'warn' | 'error' | 'success', message: string) => void,
  cancelSignal?: AbortSignal,
  suggestedPages: string[] = [],
  settings?: Partial<JobSettings>,
  suppliedContext?: IntegrationContext
): Promise<CrawlResult> {
  const context = suppliedContext || createIntegrationContext(settings, onLog);
  const normalized = normalizeUrl(rawUrl);
  const visitedPages: string[] = [];
  const rawEmails: RawEmailMatch[] = [];
  let verificationFailed = false;
  let companyAbout = '';
  let careersUrl: string | undefined;
  let applicationPortalUrl: string | undefined;
  let vacanciesFound: Vacancy[] = [];
  let restrictions: string | undefined;

  try {
    if (cancelSignal?.aborted) {
      throw new UserCancelledError();
    }

    // 1. Visit homepage
    const homeRes = await fetchVerifiedPage(normalized, timeoutMs, cancelSignal, settings, context);
    visitedPages.push(normalized);

    if (homeRes.status < 200 || homeRes.status >= 300) {
      return {
        normalizedUrl: normalized,
        companyName,
        companyAbout: '',
        visitedPages,
        vacanciesFound: [],
        contacts: [],
        status: 'Não foi possível verificar a fonte',
        error: `Servidor retornou status HTTP ${homeRes.status} (bloqueio de acesso ou firewall).`,
      };
    }

    const homeCheck = await verifyEmailSources(normalized, [homeRes.finalUrl], timeoutMs, cancelSignal, settings, context);
    verificationFailed ||= homeCheck.failed;
    const $home = cheerio.load(homeRes.html);
    const homeInfo = extractVacanciesAndAbout($home, normalized);
    companyAbout = homeInfo.about;
    if (homeInfo.portalUrl) applicationPortalUrl = homeInfo.portalUrl;
    if (homeInfo.restrictions) restrictions = homeInfo.restrictions;
    const homeRec = reconcileVacancies(vacanciesFound, homeInfo.vacancies, { companyId, companyName });
    vacanciesFound = homeRec.vacancies;

    // Extract emails from homepage
    rawEmails.push(...homeCheck.matches);

    // Discover internal links
    const { careersLinks, otherLinks } = discoverRelevantLinks($home, normalized);

    if (careersLinks.length > 0) {
      careersUrl = careersLinks[0];
    }

    // Queue priority links
    const queue = [...new Set([...careersLinks, ...otherLinks, ...suggestedPages])].slice(0, Math.max(0, maxPages - 1));
    const legalCandidates = new Set(discoverLegalLinks($home, homeRes.finalUrl, normalized));
    let legalFallback = false;
    let legalVisited = 0;
    // Legal pages have a separate small budget so an exhausted initial queue does not omit them.
    for (let index = 0; ; index++) {
      if (index >= queue.length) {
        if (!legalFallback && rawEmails.length === 0) {
          legalFallback = true;
          onLog?.('info', 'Nenhum email encontrado nas páginas iniciais. Buscando termos de uso e política de privacidade (até 4 páginas adicionais).');
        }
        if (!legalFallback || legalVisited >= 4) break;
        const next = [...legalCandidates].find(url => !visitedPages.includes(url) && !queue.includes(url));
        if (!next) break;
        queue.push(next);
      }
      const pageUrl = queue[index];
      if (cancelSignal?.aborted) {
        throw new UserCancelledError();
      }
      if (visitedPages.includes(pageUrl)) continue;
      if (legalFallback) legalVisited++;

      if (delayMs > 0) {
        await new Promise((r) => setTimeout(r, delayMs));
      }

      try {
        const pageRes = await fetchVerifiedPage(pageUrl, timeoutMs, cancelSignal, settings, context);
        visitedPages.push(pageUrl);

        if (pageRes.status >= 200 && pageRes.status < 400) {
          const $page = cheerio.load(pageRes.html);
          const checked = await verifyEmailSources(normalized, [pageUrl], timeoutMs, cancelSignal, settings, context);
          // Follow only links from sources actually accepted by the verifier.
          if (checked.acceptedUrls.includes(pageRes.finalUrl)) {
            discoverLegalLinks($page, pageRes.finalUrl, normalized).forEach(url => legalCandidates.add(url));
          }
          const pageInfo = extractVacanciesAndAbout($page, pageUrl);
          if (!applicationPortalUrl && pageInfo.portalUrl) {
            applicationPortalUrl = pageInfo.portalUrl;
          }
          if (!restrictions && pageInfo.restrictions) {
            restrictions = pageInfo.restrictions;
          }
          if (pageInfo.vacancies.length > 0) {
            const pageRec = reconcileVacancies(vacanciesFound, pageInfo.vacancies, { companyId, companyName });
            vacanciesFound = pageRec.vacancies;
            if (pageRec.modifiedCount > 0 || pageRec.ignoredDuplicatesCount > 0) {
              onLog?.('info', `Subpágina ${pageUrl}: ${pageRec.summary}`);
            }
          }

          rawEmails.push(...checked.matches);
          verificationFailed ||= checked.failed;
          if (checked.acceptedUrls.includes(pageRes.finalUrl)) {
            if (careersUrl === pageUrl) careersUrl = pageRes.finalUrl;
          } else if (careersUrl === pageUrl) careersUrl = undefined;
        } else {
          verificationFailed = true;
          if (careersUrl === pageUrl) careersUrl = undefined;
          onLog?.('warn', `Subpágina ${pageUrl} retornou status HTTP ${pageRes.status}.`);
        }
      } catch (pageErr: unknown) {
        verificationFailed = true;
        if (careersUrl === pageUrl) careersUrl = undefined;
        visitedPages.push(pageUrl);
        if (pageErr instanceof UserCancelledError) {
          throw pageErr;
        } else if (pageErr instanceof RequestTimeoutError) {
          onLog?.(
            'warn',
            `Subpágina ${pageUrl} excedeu o tempo limite de ${timeoutMs}ms (timeout). Continuando pesquisa...`
          );
        } else if (pageErr instanceof SslCertificateError) {
          onLog?.(
            'warn',
            `Subpágina ${pageUrl} ignorada por erro de certificado SSL (${pageErr.code || 'TLS'}). Continuando pesquisa...`
          );
        } else {
          const msg = pageErr instanceof Error ? pageErr.message : String(pageErr);
          onLog?.('warn', `Subpágina ${pageUrl} não acessada (${msg.slice(0, 100)}). Continuando...`);
        }
      }
    }

    const alternatives = await verifyEmailSources(normalized, [careersUrl, applicationPortalUrl].filter((u): u is string => !!u), timeoutMs, cancelSignal, settings, context);
    verificationFailed ||= alternatives.failed;
    if (careersUrl && !alternatives.acceptedUrls.includes(careersUrl)) careersUrl = undefined;
    if (applicationPortalUrl && !alternatives.acceptedUrls.includes(applicationPortalUrl)) applicationPortalUrl = undefined;
    // Deduplicate and classify contacts
    const contactMap = new Map<string, RecruitmentContact>();

    for (const match of rawEmails) {
      const email = match.email;
      const existing = contactMap.get(email);

      const { classification, justification } = classifyEmail(
        email,
        match.evidenceSnippet,
        match.sourceUrl,
        match.pageContext
      );

      if (existing) {
        if (!existing.allSources.includes(match.sourceUrl)) {
          existing.allSources.push(match.sourceUrl);
        }
        // Upgrade classification if more authoritative
        if (classification === 'Recrutamento confirmado' && existing.classification !== 'Recrutamento confirmado') {
          existing.classification = classification;
          existing.justification = justification;
          existing.evidenceSnippet = match.evidenceSnippet;
          existing.sourceUrl = match.sourceUrl;
          existing.extractionMethod = match.extractionMethod;
          existing.retrievalProvider = match.retrievalProvider;
          existing.originalText = match.originalText;
        }
      } else {
        contactMap.set(email, {
          id: `cnt_${Math.random().toString(36).slice(2, 10)}`,
          companyId,
          companyName,
          site: normalized,
          email,
          isObfuscated: match.isObfuscated,
          originalText: match.originalText,
          classification,
          justification,
          sourceUrl: match.sourceUrl,
          allSources: [match.sourceUrl],
          evidenceSnippet: match.evidenceSnippet,
          extractionMethod: match.extractionMethod,
          retrievalProvider: match.retrievalProvider,
          collectedAt: new Date().toISOString(),
          associatedJob: vacanciesFound.length > 0 ? vacanciesFound[0] : undefined,
          applicationRestrictions: restrictions,
          materialsGenerated: false,
        });
      }
    }

    const contacts = Array.from(contactMap.values());
    contacts.forEach(attestContact);

    const hasConfirmedRecruitment = contacts.some(
      (c) => c.classification === 'Recrutamento confirmado' || c.classification === 'Possível recrutamento'
    );

    return {
      normalizedUrl: normalized,
      companyName,
      companyAbout,
      visitedPages,
      careersUrl,
      applicationPortalUrl,
      vacanciesFound,
      contacts,
      status: hasConfirmedRecruitment || contacts.length > 0 ? 'Contato encontrado' : verificationFailed ? 'Não foi possível verificar a fonte' : 'Email não encontrado',
    };
  } catch (err: unknown) {
    if (err instanceof UserCancelledError) {
      throw err;
    }
    let errorDetail = err instanceof Error ? err.message : String(err);
    if (err instanceof RequestTimeoutError) {
      errorDetail = `Tempo limite esgotado (${timeoutMs}ms) ao acessar a página inicial do site.`;
    } else if (err instanceof SslCertificateError) {
      errorDetail = `Erro de certificado SSL/TLS no servidor remoto (${err.code || 'não foi possível validar o certificado'}).`;
    }
    return {
      normalizedUrl: normalized,
      companyName,
      companyAbout: '',
      visitedPages,
      vacanciesFound: [],
      contacts: [],
      status: 'Não foi possível verificar a fonte',
      error: `Falha ao conectar ao site: ${errorDetail}`,
    };
  }
}
