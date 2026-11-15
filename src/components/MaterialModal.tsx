import React, { useState, useEffect } from 'react';
import {
  X,
  Copy,
  Check,
  FileText,
  Mail,
  MessageSquare,
  BookmarkCheck,
  AlertTriangle,
  Save,
  Briefcase,
  ExternalLink,
  Download,
  Languages,
} from 'lucide-react';
import {
  RecruitmentContact,
  CompanyItem,
  GeneratedMaterials,
  SingleLanguageMaterial,
} from '../types/index.js';

interface MaterialModalProps {
  contact: RecruitmentContact | null;
  company: CompanyItem | null;
  isOpen: boolean;
  onClose: () => void;
  onSaveEdits: (contactId: string, updatedMaterials: Partial<GeneratedMaterials>) => Promise<void>;
  // Língua Padrão: aba de idioma que abre selecionada.
  defaultLanguage?: 'pt' | 'en';
}

export const MaterialModal: React.FC<MaterialModalProps> = ({
  contact,
  company,
  isOpen,
  onClose,
  onSaveEdits,
  defaultLanguage = 'pt',
}) => {
  const [langTab, setLangTab] = useState<'pt' | 'en'>(defaultLanguage);

  // Sempre que o modal abre (ou troca de contato), volta para a Língua Padrão.
  useEffect(() => {
    if (isOpen) setLangTab(defaultLanguage);
  }, [isOpen, contact?.id, defaultLanguage]);
  const [activeTab, setActiveTab] = useState<'cold' | 'short' | 'cover' | 'notes'>('cold');

  // PT state
  const [subjectPt, setSubjectPt] = useState<string>('');
  const [coldEmailPt, setColdEmailPt] = useState<string>('');
  const [shortMessagePt, setShortMessagePt] = useState<string>('');
  const [coverLetterPt, setCoverLetterPt] = useState<string>('');

  // EN state
  const [subjectEn, setSubjectEn] = useState<string>('');
  const [coldEmailEn, setColdEmailEn] = useState<string>('');
  const [shortMessageEn, setShortMessageEn] = useState<string>('');
  const [coverLetterEn, setCoverLetterEn] = useState<string>('');

  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [savedSuccess, setSavedSuccess] = useState<boolean>(false);

  useEffect(() => {
    if (contact?.materials) {
      const mat = contact.materials;
      const pt = mat.pt || mat;
      const en = mat.en || mat;

      setSubjectPt(pt.subject || mat.subject || '');
      setColdEmailPt(pt.coldEmail || mat.coldEmail || '');
      setShortMessagePt(pt.shortMessage || mat.shortMessage || '');
      setCoverLetterPt(pt.coverLetter || mat.coverLetter || '');

      setSubjectEn(en.subject || mat.subject || '');
      setColdEmailEn(en.coldEmail || mat.coldEmail || '');
      setShortMessageEn(en.shortMessage || mat.shortMessage || '');
      setCoverLetterEn(en.coverLetter || mat.coverLetter || '');

      setSavedSuccess(false);
    }
  }, [contact]);

  if (!isOpen || !contact || !company || !contact.materials) return null;

  const countWords = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;

  const currentSubject = langTab === 'pt' ? subjectPt : subjectEn;
  const currentColdEmail = langTab === 'pt' ? coldEmailPt : coldEmailEn;
  const currentShortMessage = langTab === 'pt' ? shortMessagePt : shortMessageEn;
  const currentCoverLetter = langTab === 'pt' ? coverLetterPt : coverLetterEn;

  const coldWords = countWords(currentColdEmail);
  const shortWords = countWords(currentShortMessage);
  const coverWords = countWords(currentCoverLetter);

  const handleCopy = (text: string, fieldName: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldName);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleDownloadTxt = (filename: string, content: string) => {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleCopyFullBundle = () => {
    const bundleText = [
      `=== CANDIDATURA PARA: ${company.name} (${contact.email}) ===`,
      `IDIOMA: ${langTab === 'pt' ? 'Português (pt-BR)' : 'Inglês (en-US)'}`,
      `VAGA: ${contact.associatedJob?.title || 'Candidatura Espontânea'}`,
      '',
      `--- ASSUNTO DO E-MAIL ---`,
      currentSubject,
      '',
      `--- COLD EMAIL (${coldWords} palavras) ---`,
      currentColdEmail,
      '',
      `--- MENSAGEM CURTA (${shortWords} palavras) ---`,
      currentShortMessage,
      '',
      `--- CARTA DE APRESENTAÇÃO / COVER LETTER (${coverWords} palavras) ---`,
      currentCoverLetter,
      '',
      `--- NOTAS DE REVISÃO FACTUAL ---`,
      contact.materials?.reviewNotes || '',
    ].join('\r\n');

    handleCopy(bundleText, 'full_bundle');
  };

  const handleDownloadFullBundle = () => {
    const bundleText = [
      `=== PACOTE DE CANDIDATURA FACTUAL ===`,
      `EMPRESA: ${company.name}`,
      `SITE: ${company.normalizedUrl}`,
      `DESTINATÁRIO: ${contact.email}`,
      `IDIOMA: ${langTab === 'pt' ? 'Português (pt-BR)' : 'Inglês (en-US)'}`,
      `VAGA: ${contact.associatedJob?.title || 'Candidatura Espontânea'}`,
      `DATA: ${new Date().toLocaleString('pt-BR')}`,
      '',
      `==================================================`,
      `1. ASSUNTO DO E-MAIL:`,
      currentSubject,
      `==================================================`,
      '',
      `==================================================`,
      `2. COLD EMAIL (${coldWords} palavras):`,
      `==================================================`,
      currentColdEmail,
      '',
      `==================================================`,
      `3. MENSAGEM CURTA LINKEDIN/WHATSAPP (${shortWords} palavras):`,
      `==================================================`,
      currentShortMessage,
      '',
      `==================================================`,
      `4. CARTA DE APRESENTAÇÃO / COVER LETTER (${coverWords} palavras):`,
      `==================================================`,
      currentCoverLetter,
      '',
      `==================================================`,
      `5. NOTAS DE REVISÃO E FATOS VERIFICADOS:`,
      `==================================================`,
      contact.materials?.reviewNotes || '',
    ].join('\r\n');

    const cleanComp = company.name.toLowerCase().replace(/[^a-z0-9]/gi, '_');
    handleDownloadTxt(`candidatura_${cleanComp}_${langTab}.txt`, bundleText);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const updatedPt: SingleLanguageMaterial = {
        subject: subjectPt,
        coldEmail: coldEmailPt,
        shortMessage: shortMessagePt,
        coverLetter: coverLetterPt,
        reviewNotes: contact.materials?.pt?.reviewNotes || contact.materials?.reviewNotes || '',
        wordCounts: {
          coldEmail: countWords(coldEmailPt),
          shortMessage: countWords(shortMessagePt),
          coverLetter: countWords(coverLetterPt),
        },
      };

      const updatedEn: SingleLanguageMaterial = {
        subject: subjectEn,
        coldEmail: coldEmailEn,
        shortMessage: shortMessageEn,
        coverLetter: coverLetterEn,
        reviewNotes: contact.materials?.en?.reviewNotes || contact.materials?.reviewNotes || '',
        wordCounts: {
          coldEmail: countWords(coldEmailEn),
          shortMessage: countWords(shortMessageEn),
          coverLetter: countWords(coverLetterEn),
        },
      };

      await onSaveEdits(contact.id, {
        subject: langTab === 'pt' ? subjectPt : subjectEn,
        coldEmail: langTab === 'pt' ? coldEmailPt : coldEmailEn,
        shortMessage: langTab === 'pt' ? shortMessagePt : shortMessageEn,
        coverLetter: langTab === 'pt' ? coverLetterPt : coverLetterEn,
        pt: updatedPt,
        en: updatedEn,
        wordCounts: {
          coldEmail: countWords(langTab === 'pt' ? coldEmailPt : coldEmailEn),
          shortMessage: countWords(langTab === 'pt' ? shortMessagePt : shortMessageEn),
          coverLetter: countWords(langTab === 'pt' ? coverLetterPt : coverLetterEn),
        },
      });
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 2500);
    } catch (err) {
      console.error('Error saving edits:', err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/85 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl max-h-[94vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 bg-slate-950/80 flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                <FileText className="w-5 h-5 text-blue-400" />
                Materiais de Candidatura Personalizados
              </h3>
              <a
                href={company.normalizedUrl}
                target="_blank"
                rel="noopener noreferrer"
                data-url={company.normalizedUrl}
                title="Abrir site da empresa (ou clique com botão do meio)"
                className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-blue-500/15 text-blue-300 border border-blue-500/30 hover:bg-blue-500/25 transition inline-flex items-center gap-1"
              >
                <span>{company.name}</span>
                <ExternalLink className="w-3 h-3" />
              </a>
              {contact.associatedJob?.title && (
                contact.associatedJob.url ? (
                  <a
                    href={contact.associatedJob.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    data-url={contact.associatedJob.url}
                    title="Abrir vaga (ou clique com botão do meio)"
                    className="text-xs px-2.5 py-0.5 rounded-full font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/25 transition flex items-center gap-1"
                  >
                    <Briefcase className="w-3 h-3" />
                    <span>{contact.associatedJob.title}</span>
                    <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                ) : (
                  <span className="text-xs px-2.5 py-0.5 rounded-full font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                    <Briefcase className="w-3 h-3" />
                    {contact.associatedJob.title}
                  </span>
                )
              )}
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Destinatário:{' '}
              <a
                href={`mailto:${contact.email}`}
                target="_blank"
                rel="noopener noreferrer"
                data-url={`mailto:${contact.email}`}
                title="Clique ou botão do meio para abrir cliente de e-mail"
                className="font-mono text-cyan-300 hover:underline"
              >
                {contact.email}
              </a>{' '}
              ({contact.classification})
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* Language Switcher Tabs */}
            <div className="flex rounded-lg bg-slate-900 p-1 border border-slate-800">
              <button
                type="button"
                onClick={() => setLangTab('pt')}
                className={`px-3 py-1 text-xs font-semibold rounded-md transition flex items-center gap-1 ${
                  langTab === 'pt' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                <span>🇧🇷</span> Português
              </button>
              <button
                type="button"
                onClick={() => setLangTab('en')}
                className={`px-3 py-1 text-xs font-semibold rounded-md transition flex items-center gap-1 ${
                  langTab === 'en' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                <span>🇺🇸</span> English
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition ml-1"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Global Bundle Quick Action Bar */}
        <div className="bg-slate-950 px-4 py-2.5 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="text-slate-400 flex items-center gap-2">
            <span className="text-slate-300 font-semibold">Pacote Completo:</span>
            <span>Assunto + Cold Email + Mensagem Curta + Carta de Apresentação</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopyFullBundle}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
              title="Copiar todos os materiais deste idioma de uma só vez"
            >
              {copiedField === 'full_bundle' ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" /> Copiado!
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-blue-400" /> Copiar Pacote Completo
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleDownloadFullBundle}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg font-semibold bg-blue-600/20 text-blue-300 border border-blue-500/30 hover:bg-blue-600/30 transition"
              title="Baixar arquivo .txt com todos os materiais estruturados"
            >
              <Download className="w-3.5 h-3.5 text-blue-400" /> Baixar Pacote em .TXT
            </button>
          </div>
        </div>

        {/* Subtabs for individual material */}
        <div className="flex border-b border-slate-800 bg-slate-900/60 px-4 py-2 gap-2 overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab('cold')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
              activeTab === 'cold'
                ? 'bg-blue-600/20 text-blue-400 border border-blue-500/40'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Mail className="w-3.5 h-3.5" />
            <span>Cold Email</span>
            <span className="font-mono text-[10px] px-1.5 py-0.2 rounded bg-slate-950 text-slate-300">
              {coldWords} pal.
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('short')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
              activeTab === 'short'
                ? 'bg-blue-600/20 text-blue-400 border border-blue-500/40'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>Mensagem Curta</span>
            <span className="font-mono text-[10px] px-1.5 py-0.2 rounded bg-slate-950 text-slate-300">
              {shortWords} pal.
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('cover')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
              activeTab === 'cover'
                ? 'bg-blue-600/20 text-blue-400 border border-blue-500/40'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Carta de Apresentação</span>
            <span className="font-mono text-[10px] px-1.5 py-0.2 rounded bg-slate-950 text-slate-300">
              {coverWords} pal.
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('notes')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
              activeTab === 'notes'
                ? 'bg-blue-600/20 text-blue-400 border border-blue-500/40'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <BookmarkCheck className="w-3.5 h-3.5" />
            <span>Notas de Revisão</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-4 text-xs">
          {/* Similarity Warning */}
          {contact.materials.similarityWarning && (
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-2.5 text-amber-300">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <span>{contact.materials.similarityWarning}</span>
            </div>
          )}

          {/* 1. Cold Email View */}
          {activeTab === 'cold' && (
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="font-semibold text-slate-300">
                    Assunto do E-mail ({langTab.toUpperCase()}):
                  </label>
                  <button
                    type="button"
                    onClick={() => handleCopy(currentSubject, 'subject')}
                    className="inline-flex items-center gap-1 text-[11px] text-blue-400 hover:text-blue-300"
                  >
                    {copiedField === 'subject' ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" /> Copiado
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" /> Copiar Assunto
                      </>
                    )}
                  </button>
                </div>
                <input
                  type="text"
                  value={currentSubject}
                  onChange={(e) =>
                    langTab === 'pt' ? setSubjectPt(e.target.value) : setSubjectEn(e.target.value)
                  }
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <label className="font-semibold text-slate-300">
                      Corpo do Cold Email ({langTab.toUpperCase()}):
                    </label>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full font-mono font-bold ${
                        coldWords >= 110 && coldWords <= 190
                          ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                          : 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                      }`}
                    >
                      {coldWords} palavras (meta: 120-180)
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        handleDownloadTxt(
                          `cold_email_${company.name.toLowerCase().replace(/\s+/g, '_')}_${langTab}.txt`,
                          `ASSUNTO: ${currentSubject}\r\n\r\n${currentColdEmail}`
                        )
                      }
                      className="inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-200"
                    >
                      <Download className="w-3.5 h-3.5" /> Exportar .TXT
                    </button>
                    <button
                      type="button"
                      onClick={() => handleCopy(currentColdEmail, 'cold')}
                      className="inline-flex items-center gap-1 text-[11px] text-blue-400 hover:text-blue-300 font-semibold"
                    >
                      {copiedField === 'cold' ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-400" /> Copiado
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" /> Copiar Texto
                        </>
                      )}
                    </button>
                  </div>
                </div>

                <textarea
                  rows={10}
                  value={currentColdEmail}
                  onChange={(e) =>
                    langTab === 'pt' ? setColdEmailPt(e.target.value) : setColdEmailEn(e.target.value)
                  }
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs leading-relaxed text-slate-200 font-sans focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>
          )}

          {/* 2. Short Message View */}
          {activeTab === 'short' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <label className="font-semibold text-slate-300">
                    Mensagem Curta ({langTab.toUpperCase()}):
                  </label>
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-full font-mono font-bold ${
                      shortWords >= 45 && shortWords <= 85
                        ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                        : 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                    }`}
                  >
                    {shortWords} palavras (meta: 50-80)
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      handleDownloadTxt(
                        `mensagem_curta_${company.name.toLowerCase().replace(/\s+/g, '_')}_${langTab}.txt`,
                        currentShortMessage
                      )
                    }
                    className="inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-200"
                  >
                    <Download className="w-3.5 h-3.5" /> Exportar .TXT
                  </button>
                  <button
                    type="button"
                    onClick={() => handleCopy(currentShortMessage, 'short')}
                    className="inline-flex items-center gap-1 text-[11px] text-blue-400 hover:text-blue-300 font-semibold"
                  >
                    {copiedField === 'short' ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" /> Copiado
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" /> Copiar Texto
                      </>
                    )}
                  </button>
                </div>
              </div>

              <textarea
                rows={6}
                value={currentShortMessage}
                onChange={(e) =>
                  langTab === 'pt'
                    ? setShortMessagePt(e.target.value)
                    : setShortMessageEn(e.target.value)
                }
                className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs leading-relaxed text-slate-200 font-sans focus:outline-none focus:border-blue-500"
              />
            </div>
          )}

          {/* 3. Cover Letter View */}
          {activeTab === 'cover' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <label className="font-semibold text-slate-300">
                    Carta de Apresentação / Cover Letter ({langTab.toUpperCase()}):
                  </label>
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-full font-mono font-bold ${
                      coverWords >= 230 && coverWords <= 420
                        ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                        : 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                    }`}
                  >
                    {coverWords} palavras (meta: 250-400)
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      handleDownloadTxt(
                        `carta_apresentacao_${company.name.toLowerCase().replace(/\s+/g, '_')}_${langTab}.txt`,
                        currentCoverLetter
                      )
                    }
                    className="inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-200"
                  >
                    <Download className="w-3.5 h-3.5" /> Exportar .TXT
                  </button>
                  <button
                    type="button"
                    onClick={() => handleCopy(currentCoverLetter, 'cover')}
                    className="inline-flex items-center gap-1 text-[11px] text-blue-400 hover:text-blue-300 font-semibold"
                  >
                    {copiedField === 'cover' ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" /> Copiado
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" /> Copiar Texto
                      </>
                    )}
                  </button>
                </div>
              </div>

              <textarea
                rows={12}
                value={currentCoverLetter}
                onChange={(e) =>
                  langTab === 'pt'
                    ? setCoverLetterPt(e.target.value)
                    : setCoverLetterEn(e.target.value)
                }
                className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs leading-relaxed text-slate-200 font-sans focus:outline-none focus:border-blue-500"
              />
            </div>
          )}

          {/* 4. Review Notes View */}
          {activeTab === 'notes' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                <span className="font-bold text-slate-300 block">
                  Auditoria Factual & Decisões de Redação:
                </span>
                <p className="text-slate-300 leading-relaxed">
                  {contact.materials.reviewNotes ||
                    'Nenhuma observação especial registrada na geração.'}
                </p>
              </div>

              <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2 text-[11px] text-slate-400">
                <span className="font-semibold text-slate-300 block">Dados da Descoberta:</span>
                <div>
                  <strong>URL Fonte:</strong> {contact.sourceUrl}
                </div>
                <div>
                  <strong>Evidência na Página:</strong> "{contact.evidenceSnippet}"
                </div>
                <div>
                  <strong>Justificativa da Classificação:</strong> {contact.justification}
                </div>
                {contact.materials.generatedBy && (
                  <div>
                    <strong>Motor de IA Utilizado:</strong> {contact.materials.generatedBy.toUpperCase()}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/80 flex items-center justify-between">
          <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
            {savedSuccess ? (
              <span className="text-emerald-400 font-semibold flex items-center gap-1">
                <Check className="w-3.5 h-3.5" /> Alterações salvas com sucesso!
              </span>
            ) : (
              <span>Você pode editar os textos livremente e salvá-los no rascunho oficial.</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white transition"
            >
              Fechar
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-50 transition shadow-md shadow-blue-500/25"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{isSaving ? 'Salvando...' : 'Salvar Alterações'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
