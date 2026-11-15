import JSZip from 'jszip';
import { CompanyItem, RecruitmentContact, SingleLanguageMaterial } from '../types/index.js';

function sanitizeFilename(name: string): string {
  return (name || 'item')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .trim()
    .replace(/\.+$/, '')
    .slice(0, 60);
}

function getMaterialForLang(contact: RecruitmentContact, lang: 'pt' | 'en'): SingleLanguageMaterial {
  const materials = contact.materials;
  const empty: SingleLanguageMaterial = {
    subject: `Candidatura espontânea - ${contact.companyName}`,
    coldEmail: `Prezada equipe da ${contact.companyName},\n\nTenho interesse nas oportunidades da empresa. Segue meu perfil para consideração.\n\nAtenciosamente.`,
    shortMessage: `Olá, tenho interesse nas oportunidades da ${contact.companyName}. Podemos conversar?`,
    coverLetter: `À equipe da ${contact.companyName},\n\nApresento meu perfil profissional para futuras oportunidades.\n\nAtenciosamente.`,
    wordCounts: { coldEmail: 25, shortMessage: 12, coverLetter: 20 },
    reviewNotes: 'Material padrão de contingência.',
  };

  if (!materials) return empty;

  if (lang === 'pt') {
    if (materials.pt) return materials.pt;
    return {
      subject: materials.subject,
      coldEmail: materials.coldEmail,
      shortMessage: materials.shortMessage,
      coverLetter: materials.coverLetter,
      wordCounts: materials.wordCounts,
      reviewNotes: materials.reviewNotes,
    };
  }

  if (lang === 'en') {
    if (materials.en) return materials.en;
    if (materials.pt) return materials.pt;
    return {
      subject: materials.subject,
      coldEmail: materials.coldEmail,
      shortMessage: materials.shortMessage,
      coverLetter: materials.coverLetter,
      wordCounts: materials.wordCounts,
      reviewNotes: materials.reviewNotes,
    };
  }

  return empty;
}

export interface ExportItemsOptions {
  profileName?: string;
  lang?: 'pt' | 'en' | 'both';
  scopeLabel?: string; // e.g. "28 selecionados" or "Filtro: Vagas de TI"
  filenamePrefix?: string;
}

/**
 * Generates a clean, comprehensive text document of materials
 */
export function generateConsolidatedText(
  items: { company: CompanyItem; contact: RecruitmentContact }[],
  options: ExportItemsOptions = {}
): string {
  const { profileName = 'Candidato', lang = 'pt', scopeLabel = 'Candidaturas' } = options;

  const header = [
    '================================================================================',
    `RELATÓRIO DE CANDIDATURAS & MATERIAIS DE OUTREACH`,
    `ESCOPO: ${scopeLabel.toUpperCase()} (${items.length} ITENS)`,
    `CANDIDATO: ${profileName}`,
    `DATA DE EXPORTAÇÃO: ${new Date().toLocaleString('pt-BR')}`,
    '================================================================================',
    '',
  ].join('\r\n');

  const bodies = items.map(({ company, contact }, idx) => {
    const matPt = getMaterialForLang(contact, 'pt');
    const matEn = getMaterialForLang(contact, 'en');

    const lines: string[] = [
      `################################################################################`,
      `[ITEM ${idx + 1} DE ${items.length}] - ${company.name.toUpperCase()}`,
      `################################################################################`,
      `EMPRESA: ${company.name}`,
      `SITE: ${company.normalizedUrl || company.rawUrl}`,
      `DESTINATÁRIO: ${contact.email}`,
      `CLASSIFICAÇÃO: ${contact.classification}`,
      `VAGA: ${contact.associatedJob?.title || 'Candidatura Espontânea'}`,
    ];

    if (contact.associatedJob?.url) {
      lines.push(`URL DA VAGA: ${contact.associatedJob.url}`);
    }
    if (contact.outreachStatus) {
      lines.push(`STATUS ATUAL: ${contact.outreachStatus.toUpperCase()}`);
    }
    if (contact.evidenceSnippet) {
      lines.push(`EVIDÊNCIA COLETADA: "${contact.evidenceSnippet}"`);
    }

    lines.push('');

    if (lang === 'pt' || lang === 'both') {
      lines.push(
        `-------------------- [PORTUGUÊS (PT-BR)] --------------------`,
        `ASSUNTO: ${matPt.subject}`,
        '',
        `--- COLD EMAIL (${matPt.wordCounts.coldEmail} palavras) ---`,
        matPt.coldEmail,
        '',
        `--- MENSAGEM CURTA (${matPt.wordCounts.shortMessage} palavras) ---`,
        matPt.shortMessage,
        '',
        `--- CARTA DE APRESENTAÇÃO (${matPt.wordCounts.coverLetter} palavras) ---`,
        matPt.coverLetter,
        '',
        `NOTAS DE REVISÃO:`,
        matPt.reviewNotes,
        ''
      );
    }

    if (lang === 'en' || lang === 'both') {
      lines.push(
        `---------------------- [INGLÊS (EN)] ----------------------`,
        `SUBJECT: ${matEn.subject}`,
        '',
        `--- COLD EMAIL (${matEn.wordCounts.coldEmail} words) ---`,
        matEn.coldEmail,
        '',
        `--- SHORT MESSAGE (${matEn.wordCounts.shortMessage} words) ---`,
        matEn.shortMessage,
        '',
        `--- COVER LETTER (${matEn.wordCounts.coverLetter} words) ---`,
        matEn.coverLetter,
        '',
        `REVIEW NOTES:`,
        matEn.reviewNotes,
        ''
      );
    }

    return lines.join('\r\n');
  });

  return header + bodies.join('\r\n\r\n');
}

/**
 * Triggers a browser download of a text file
 */
export function downloadTextBlob(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Exports chosen items as a single consolidated .TXT file
 */
export function exportMaterialsAsTxt(
  items: { company: CompanyItem; contact: RecruitmentContact }[],
  options: ExportItemsOptions = {}
): void {
  if (items.length === 0) return;

  const content = generateConsolidatedText(items, options);
  const timestamp = new Date().toISOString().slice(0, 10);
  const prefix = options.filenamePrefix || 'candidaturas';
  const filename = `${prefix}_${items.length}_itens_${timestamp}.txt`;

  downloadTextBlob(filename, content);
}

/**
 * Exports chosen items as an organized .ZIP archive with folders per company and CSV summary
 */
export async function exportMaterialsAsZip(
  items: { company: CompanyItem; contact: RecruitmentContact }[],
  options: ExportItemsOptions = {}
): Promise<void> {
  if (items.length === 0) return;

  const zip = new JSZip();
  const { profileName = 'Candidato', scopeLabel = 'Candidaturas' } = options;

  // 1. Consolidated master text file
  const consolidatedText = generateConsolidatedText(items, options);
  zip.file('candidaturas_consolidadas.txt', consolidatedText);

  // 2. Readme / Manifest
  const manifest = [
    `PACOTE DE EXPORTAÇÃO PERSONALIZADA`,
    `==================================================`,
    `Escopo: ${scopeLabel}`,
    `Total de Itens: ${items.length}`,
    `Candidato: ${profileName}`,
    `Data de Exportação: ${new Date().toLocaleString('pt-BR')}`,
    ``,
    `Estrutura de Pastas:`,
    `- candidaturas_consolidadas.txt: Todos os textos em arquivo único.`,
    `- candidaturas_tabela.csv: Tabela em formato CSV para Excel/Google Sheets.`,
    `- Empresas/: Pastas individuais por empresa e e-mail com os arquivos separados.`,
  ].join('\r\n');
  zip.file('LEIA-ME_EXPORTACAO.txt', manifest);

  // 3. CSV spreadsheet (UTF-8 with BOM for Excel)
  const escapeCsv = (val: string) => `"${(val || '').replace(/"/g, '""').replace(/\r?\n/g, ' ')}"`;

  const csvRows: string[] = [
    [
      'Empresa',
      'Site',
      'Email',
      'Classificacao',
      'Vaga',
      'Url_Vaga',
      'Status_Outreach',
      'Assunto_PT',
      'Cold_Email_PT',
      'Mensagem_Curta_PT',
      'Carta_PT',
      'Assunto_EN',
      'Cold_Email_EN',
      'Mensagem_Curta_EN',
      'Carta_EN',
    ].join(';'),
  ];

  const empresasFolder = zip.folder('Empresas');

  // 4. Populate folders for each company/contact
  for (let i = 0; i < items.length; i++) {
    const { company, contact } = items[i];
    const compNameClean = sanitizeFilename(company.name || 'Empresa');
    const emailClean = sanitizeFilename(contact.email || `contato_${i + 1}`);

    const matPt = getMaterialForLang(contact, 'pt');
    const matEn = getMaterialForLang(contact, 'en');

    // Add row to CSV
    csvRows.push(
      [
        escapeCsv(company.name),
        escapeCsv(company.normalizedUrl || company.rawUrl),
        escapeCsv(contact.email),
        escapeCsv(contact.classification),
        escapeCsv(contact.associatedJob?.title || 'Candidatura Espontânea'),
        escapeCsv(contact.associatedJob?.url || ''),
        escapeCsv(contact.outreachStatus || 'Pendente'),
        escapeCsv(matPt.subject),
        escapeCsv(matPt.coldEmail),
        escapeCsv(matPt.shortMessage),
        escapeCsv(matPt.coverLetter),
        escapeCsv(matEn.subject),
        escapeCsv(matEn.coldEmail),
        escapeCsv(matEn.shortMessage),
        escapeCsv(matEn.coverLetter),
      ].join(';')
    );

    const contactFolder = empresasFolder?.folder(`${compNameClean}/${emailClean}`);
    if (contactFolder) {
      // Português
      contactFolder.file(
        'cold_email_pt.txt',
        [
          `EMPRESA: ${company.name}`,
          `DESTINATÁRIO: ${contact.email}`,
          `VAGA: ${contact.associatedJob?.title || 'Candidatura Espontânea'}`,
          `ASSUNTO: ${matPt.subject}`,
          `PALAVRAS: ${matPt.wordCounts.coldEmail}`,
          '',
          '==================================================',
          matPt.coldEmail,
          '==================================================',
          '',
          `NOTAS DE REVISÃO FACTUAL:`,
          matPt.reviewNotes,
        ].join('\r\n')
      );

      contactFolder.file('mensagem_curta_pt.txt', matPt.shortMessage);
      contactFolder.file('carta_apresentacao_pt.txt', matPt.coverLetter);

      // Inglês
      contactFolder.file(
        'cold_email_en.txt',
        [
          `COMPANY: ${company.name}`,
          `RECIPIENT: ${contact.email}`,
          `POSITION: ${contact.associatedJob?.title || 'Spontaneous Application'}`,
          `SUBJECT: ${matEn.subject}`,
          `WORDS: ${matEn.wordCounts.coldEmail}`,
          '',
          '==================================================',
          matEn.coldEmail,
          '==================================================',
          '',
          `REVIEW NOTES:`,
          matEn.reviewNotes,
        ].join('\r\n')
      );

      contactFolder.file('short_message_en.txt', matEn.shortMessage);
      contactFolder.file('cover_letter_en.txt', matEn.coverLetter);

      // Resumo do Contato e Vaga
      contactFolder.file(
        'resumo_candidatura.txt',
        [
          `EMPRESA: ${company.name}`,
          `SITE: ${company.normalizedUrl || company.rawUrl}`,
          `E-MAIL: ${contact.email}`,
          `CLASSIFICAÇÃO: ${contact.classification}`,
          `VAGA: ${contact.associatedJob?.title || 'Candidatura Espontânea'}`,
          `LINK DA VAGA: ${contact.associatedJob?.url || 'Não informado'}`,
          `EVIDÊNCIA: ${contact.evidenceSnippet || 'E-mail público identificado'}`,
          `STATUS ATUAL: ${contact.outreachStatus || 'Pendente'}`,
        ].join('\r\n')
      );
    }
  }

  // Save CSV with BOM
  const csvContent = '\uFEFF' + csvRows.join('\r\n');
  zip.file('candidaturas_tabela.csv', csvContent);

  // Generate ZIP blob and download
  const blob = await zip.generateAsync({ type: 'blob' });
  const timestamp = new Date().toISOString().slice(0, 10);
  const prefix = options.filenamePrefix || 'candidaturas';
  const filename = `${prefix}_${items.length}_itens_${timestamp}.zip`;

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
