import type { JobSettings } from '../types/index.js';

/** Matches blocked aliases/keywords against the address local part, case-insensitively. */
export function isEmailBlacklisted(email: string, settings?: Pick<JobSettings, 'emailBlacklist'>): boolean {
  const normalized = email.trim().toLowerCase();
  const localPart = normalized.split('@', 1)[0] || '';
  return (settings?.emailBlacklist || []).some((entry) => {
    const rule = entry.trim().toLowerCase();
    if (!rule) return false;
    if (rule.includes('@') && !rule.endsWith('@')) return normalized === rule;
    if (rule.endsWith('@')) {
      const alias = rule.slice(0, -1);
      const suffix = localPart.slice(alias.length);
      return localPart === alias || (localPart.startsWith(alias) && /^[._+-]/.test(suffix));
    }
    return localPart.includes(rule);
  });
}
