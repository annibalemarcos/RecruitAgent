import type { RecruitmentContact, JobSettings } from './types/index.js';

export const isSpontaneousContact = (contact: RecruitmentContact): boolean =>
  !contact.associatedJob?.title;

export function hasBilingualMaterials(materials: unknown): boolean {
  const value = materials as Record<string, any> | undefined;
  return ['pt', 'en'].every(language =>
    ['subject', 'coldEmail', 'shortMessage', 'coverLetter'].every(field =>
      typeof value?.[language]?.[field] === 'string' && value[language][field].trim().length > 0
    )
  );
}

export const automaticSpontaneous = (contact: RecruitmentContact, settings: JobSettings): boolean =>
  settings.generateMaterialsForSpontaneous === true && isSpontaneousContact(contact);

export const materialsReady = (contact: RecruitmentContact, settings: JobSettings): boolean =>
  !!(contact.materialsGenerated && contact.materials &&
    (!automaticSpontaneous(contact, settings) || hasBilingualMaterials(contact.materials)));
