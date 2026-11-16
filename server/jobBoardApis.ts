import type { Vacancy } from '../src/types/index.js';

function boardSlug(value: string, provider: 'greenhouse' | 'ashby'): string | null {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    const matches = provider === 'greenhouse'
      ? ['boards.greenhouse.io', 'job-boards.greenhouse.io'].includes(host)
      : host === 'jobs.ashbyhq.com';
    const slug = url.pathname.split('/').filter(Boolean)[0];
    return matches && slug && /^[a-z0-9_-]{1,100}$/i.test(slug) ? slug : null;
  } catch { return null; }
}

async function getJson(url: string, timeoutMs: number): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(1000, Math.min(60000, timeoutMs)));
  try {
    const response = await fetch(url, { headers: { Accept: 'application/json' }, signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const finalUrl = new URL(response.url || url);
    if (finalUrl.hostname !== new URL(url).hostname) throw new Error('redirected to an untrusted host');
    return await response.json();
  } finally { clearTimeout(timer); }
}

export async function fetchPublicJobBoard(urls: Array<string | undefined>, timeoutMs = 20000): Promise<Vacancy[]> {
  const candidates = [...new Set(urls.filter((url): url is string => typeof url === 'string'))];
  for (const url of candidates) {
    const greenhouse = boardSlug(url, 'greenhouse');
    const ashby = boardSlug(url, 'ashby');
    try {
      if (greenhouse) {
        const data = await getJson(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(greenhouse)}/jobs?content=true`, timeoutMs);
        if (!Array.isArray(data?.jobs)) continue;
        return data.jobs.filter((job: any) => typeof job?.title === 'string' && typeof job?.absolute_url === 'string')
          .slice(0, 100).map((job: any) => ({ title: job.title.slice(0, 300), url: job.absolute_url,
            description: typeof job.content === 'string' ? job.content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').slice(0, 5000) : undefined,
            location: typeof job.location?.name === 'string' ? job.location.name.slice(0, 300) : undefined,
            department: Array.isArray(job.departments) ? job.departments.map((d: any) => d?.name).filter(Boolean).join(', ').slice(0, 300) : undefined,
            discoveredAt: new Date().toISOString() }));
      }
      if (ashby) {
        const data = await getJson(`https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(ashby)}`, timeoutMs);
        if (!Array.isArray(data?.jobs)) continue;
        return data.jobs.filter((job: any) => job?.isListed !== false && typeof job?.title === 'string' && typeof job?.jobUrl === 'string')
          .slice(0, 100).map((job: any) => ({ title: job.title.slice(0, 300), url: job.jobUrl,
            description: typeof job.descriptionPlain === 'string' ? job.descriptionPlain.slice(0, 5000) : undefined,
            location: typeof job.location === 'string' ? job.location.slice(0, 300) : undefined,
            department: typeof job.department === 'string' ? job.department.slice(0, 300) : undefined,
            discoveredAt: typeof job.publishedAt === 'string' ? job.publishedAt : new Date().toISOString() }));
      }
    } catch { /* An inaccessible board is skipped; the existing crawler remains the fallback. */ }
  }
  return [];
}
