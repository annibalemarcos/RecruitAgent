import JSZip from 'jszip';
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from 'docx';
import { SessionState } from '../src/types/index.js';

// Sanitize filename for Windows & Unix
function sanitizeFilename(name: string): string {
  return name.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').trim().slice(0, 60);
}

function escapeCsvField(field: unknown): string {
  if (field === null || field === undefined) return '""';
  const str = String(field).replace(/"/g, '""');
  return `"${str}"`;
}

export function generateContactsCsv(session: SessionState): string {
  const headers = [
    'Empresa',
    'Site',
    'Email',
    'Classificação',
    'Justificativa',
    'URL da Fonte',
    'Todas as Fontes',
    'Trecho de Evidência',
    'Data/Hora da Coleta',
    'Método de Extração',
    'Vaga Identificada',
    'Restrições/Instruções',
  ];

  const rows: string[] = [];
  // UTF-8 BOM for Microsoft Excel
  rows.push('\uFEFF' + headers.map(escapeCsvField).join(';'));

  for (const company of session.companies) {
    if (company.contacts.length === 0) {
      rows.push(
        [
          company.name,
          company.normalizedUrl,
          'Nenhum e-mail de recrutamento encontrado',
          'N/A',
          company.error || 'Nenhum contato identificado no rastreamento de páginas.',
          company.careersUrl || company.applicationPortalUrl || company.normalizedUrl,
          (company.visitedPages || []).join(' | '),
          '',
          company.updatedAt,
          '',
          company.vacanciesFound.map((v) => v.title).join(', ') || 'Nenhuma vaga identificada',
          '',
        ]
          .map(escapeCsvField)
          .join(';')
      );
    } else {
      for (const contact of company.contacts) {
        rows.push(
          [
            contact.companyName,
            contact.site,
            contact.email,
            contact.classification,
            contact.justification,
            contact.sourceUrl,
            contact.allSources.join(' | '),
            contact.evidenceSnippet,
            contact.collectedAt,
            contact.extractionMethod || '',
            contact.associatedJob?.title || 'Candidatura Espontânea',
            contact.applicationRestrictions || '',
          ]
            .map(escapeCsvField)
            .join(';')
        );
      }
    }
  }

  return rows.join('\r\n');
}

export function generateApplicationsCsv(session: SessionState): string {
  const headers = [
    'Empresa',
    'Site',
    'Destinatário (Email)',
    'Classificação',
    'Vaga',
    'Assunto (PT)',
    'Cold Email PT (120-180 palavras)',
    'Mensagem Curta PT (50-80 palavras)',
    'Carta de Apresentação PT',
    'Assunto (EN)',
    'Cold Email EN (120-180 words)',
    'Short Message EN (50-80 words)',
    'Cover Letter EN',
    'Notas de Revisão',
    'Gerado Por',
    'Status da Candidatura',
  ];

  const rows: string[] = [];
  rows.push('\uFEFF' + headers.map(escapeCsvField).join(';'));

  for (const company of session.companies) {
    for (const contact of company.contacts) {
      if (contact.materials) {
        const mat = contact.materials;
        const pt = mat.pt || {
          subject: mat.subject,
          coldEmail: mat.coldEmail,
          shortMessage: mat.shortMessage,
          coverLetter: mat.coverLetter,
          reviewNotes: mat.reviewNotes,
        };
        const en = mat.en || {
          subject: mat.subject,
          coldEmail: mat.coldEmail,
          shortMessage: mat.shortMessage,
          coverLetter: mat.coverLetter,
          reviewNotes: mat.reviewNotes,
        };

        rows.push(
          [
            contact.companyName,
            contact.site,
            contact.email,
            contact.classification,
            mat.matchedJob?.title || 'Candidatura Espontânea',
            pt.subject,
            pt.coldEmail,
            pt.shortMessage,
            pt.coverLetter,
            en.subject,
            en.coldEmail,
            en.shortMessage,
            en.coverLetter,
            mat.reviewNotes,
            mat.generatedBy || 'IA',
            'Pronto para envio (rascunho revisado)',
          ]
            .map(escapeCsvField)
            .join(';')
        );
      }
    }
  }

  return rows.join('\r\n');
}

export function generateRemainingCompaniesCsv(session: SessionState): string {
  const headers = ['Empresa', 'URL', 'Status', 'Observacao'];
  const rows: string[] = [];
  rows.push('\uFEFF' + headers.map(escapeCsvField).join(';'));

  for (let i = 0; i < session.companies.length; i++) {
    const company = session.companies[i];
    const isCompleted =
      company.status === 'Concluído' ||
      company.status === 'Concluído parcialmente' ||
      company.status === 'Sem contato de recrutamento';

    // If company was not completed successfully (e.g. pending, error, blocked, or not yet reached)
    if (!isCompleted) {
      rows.push(
        [
          company.name,
          company.rawUrl || company.normalizedUrl,
          company.status,
          company.error || (i >= session.currentCompanyIndex ? 'Aguardando processamento' : ''),
        ]
          .map(escapeCsvField)
          .join(';')
      );
    }
  }

  return rows.join('\r\n');
}

export function generateRemainingUrlsTxt(session: SessionState): string {
  const urls: string[] = [];
  for (let i = 0; i < session.companies.length; i++) {
    const company = session.companies[i];
    const isCompleted =
      company.status === 'Concluído' ||
      company.status === 'Concluído parcialmente' ||
      company.status === 'Sem contato de recrutamento';

    if (!isCompleted) {
      const url = (company.rawUrl || company.normalizedUrl).trim();
      if (url && !urls.includes(url)) {
        urls.push(url);
      }
    }
  }
  return urls.join('\r\n');
}

export function generateResultsJson(session: SessionState): string {
  return JSON.stringify(session, null, 2);
}

export function generateLogsTxt(session: SessionState): string {
  const lines = session.logs.map(
    (log) => `[${log.timestamp}] [${log.level.toUpperCase()}] ${log.message}`
  );
  return lines.join('\r\n');
}

export async function createCoverLetterDocx(
  candidateName: string,
  companyName: string,
  subject: string,
  coverLetterText: string,
  reviewNotes: string
): Promise<Buffer> {
  const paragraphs = coverLetterText.split('\n\n').filter(Boolean);

  const doc = new Document({
    sections: [
      {
        properties: {},
        children: [
          new Paragraph({
            text: `Carta de Apresentação – ${candidateName}`,
            heading: HeadingLevel.HEADING_1,
            alignment: AlignmentType.LEFT,
          }),
          new Paragraph({
            children: [
              new TextRun({ text: `Empresa Destinatária: `, bold: true }),
              new TextRun({ text: companyName }),
            ],
          }),
          new Paragraph({
            children: [
              new TextRun({ text: `Assunto Proposto: `, bold: true }),
              new TextRun({ text: subject }),
            ],
          }),
          new Paragraph({ text: '' }),
          ...paragraphs.map(
            (p) =>
              new Paragraph({
                children: [new TextRun({ text: p, size: 24 })],
                spacing: { after: 200, line: 360 },
              })
          ),
          new Paragraph({ text: '' }),
          new Paragraph({
            text: 'Notas de Revisão e Rastreabilidade Factual:',
            heading: HeadingLevel.HEADING_2,
          }),
          new Paragraph({
            children: [new TextRun({ text: reviewNotes, italics: true, size: 20 })],
            spacing: { after: 120 },
          }),
        ],
      },
    ],
  });

  return await Packer.toBuffer(doc);
}

export async function generateZipArchive(session: SessionState): Promise<Buffer> {
  const zip = new JSZip();

  // Root summary files
  zip.file('contatos.csv', generateContactsCsv(session));
  zip.file('candidaturas.csv', generateApplicationsCsv(session));
  zip.file('resultados.json', generateResultsJson(session));
  zip.file('logs.txt', generateLogsTxt(session));

  const empresasFolder = zip.folder('Empresas');

  for (const company of session.companies) {
    const compName = sanitizeFilename(company.name || 'Empresa');
    const compFolder = empresasFolder?.folder(compName);

    for (const contact of company.contacts) {
      if (!contact.materials) continue;

      const emailName = sanitizeFilename(contact.email);
      const contactFolder = compFolder?.folder(emailName);

      if (!contactFolder) continue;

      // 1. cold_email.txt
      const coldEmailContent = [
        `DESTINATÁRIO: ${contact.email}`,
        `EMPRESA: ${contact.companyName}`,
        `CLASSIFICAÇÃO: ${contact.classification}`,
        `VAGA: ${contact.materials.matchedJob?.title || 'Candidatura Espontânea'}`,
        `ASSUNTO: ${contact.materials.subject}`,
        `CONTAGEM DE PALAVRAS: ${contact.materials.wordCounts.coldEmail}`,
        '',
        '--------------------------------------------------',
        contact.materials.coldEmail,
        '--------------------------------------------------',
        '',
        'NOTAS DE REVISÃO:',
        contact.materials.reviewNotes,
        contact.materials.similarityWarning ? `\nALERTA: ${contact.materials.similarityWarning}` : '',
      ].join('\r\n');

      contactFolder.file('cold_email.txt', coldEmailContent);

      // 2. mensagem_curta.txt
      const shortMsgContent = [
        `DESTINATÁRIO: ${contact.email}`,
        `EMPRESA: ${contact.companyName}`,
        `CONTAGEM DE PALAVRAS: ${contact.materials.wordCounts.shortMessage}`,
        '',
        '--------------------------------------------------',
        contact.materials.shortMessage,
        '--------------------------------------------------',
      ].join('\r\n');

      contactFolder.file('mensagem_curta.txt', shortMsgContent);

      // 3. cover_letter.docx
      try {
        const docxBuffer = await createCoverLetterDocx(
          session.profile.name || 'Candidato',
          contact.companyName,
          contact.materials.subject,
          contact.materials.coverLetter,
          contact.materials.reviewNotes
        );
        contactFolder.file('cover_letter.docx', docxBuffer);
      } catch (err) {
        console.error('Error creating docx:', err);
        contactFolder.file('cover_letter.txt', contact.materials.coverLetter);
      }

      // 4. resumo_candidatura.txt
      const resumoContent = [
        `EMPRESA: ${contact.companyName}`,
        `SITE: ${contact.site}`,
        `CONTATO: ${contact.email}`,
        `CLASSIFICAÇÃO: ${contact.classification}`,
        `JUSTIFICATIVA: ${contact.justification}`,
        `FONTE: ${contact.sourceUrl}`,
        `TODAS AS FONTES: ${contact.allSources.join(', ')}`,
        `EVIDÊNCIA COLETADA: "${contact.evidenceSnippet}"`,
        `RESTRIÇÕES NOTADAS: ${contact.applicationRestrictions || 'Nenhuma'}`,
        `DATA DE COLETA: ${contact.collectedAt}`,
      ].join('\r\n');

      contactFolder.file('resumo_candidatura.txt', resumoContent);
    }
  }

  return await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}
