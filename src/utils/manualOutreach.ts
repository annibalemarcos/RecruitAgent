export interface ManualOutreachEntry {
  email: string;
  company: string;
  language: 'en' | 'pt';
  createdAt: string;
  status?: 'pending' | 'contacted';
  contactedAt?: string;
}

const STORAGE_KEY = 'recruitagent_manual_outreach';
const EVENT_NAME = 'recruitagent:manual-outreach-updated';

export function getManualOutreachEntries(): ManualOutreachEntry[] {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(value) ? value : [];
  } catch { return []; }
}

export function saveManualOutreachEntries(entries: ManualOutreachEntry[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    window.dispatchEvent(new Event(EVENT_NAME));
  } catch { /* Keep the generator usable when local storage is unavailable. */ }
}

export function manualOutreachUpdatedEvent(): string { return EVENT_NAME; }
