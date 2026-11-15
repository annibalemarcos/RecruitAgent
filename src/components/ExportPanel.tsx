import React, { useState, useMemo, useEffect } from 'react';
import { resolveDefaultViewLanguage } from '../utils/viewLanguage.js';
import {
  Download,
  FileSpreadsheet,
  FileCode,
  FileText,
  Archive,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Search,
  Filter,
  Loader2,
  Clock,
  XCircle,
} from 'lucide-react';
import { SessionState, CompanyItem, RecruitmentContact, OutreachStatus } from '../types/index.js';
import { exportMaterialsAsTxt, exportMaterialsAsZip } from '../utils/exportMaterials.js';

interface ExportPanelProps {
  session: SessionState;
}

export const ExportPanel: React.FC<ExportPanelProps> = ({ session }) => {
  const sessionId = session.sessionId;

  // Custom filter state
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'contacted' | 'discarded'>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const defaultViewLanguage = resolveDefaultViewLanguage(session.settings, session.profile);
  const [langPreference, setLangPreference] = useState<'pt' | 'en' | 'both'>(defaultViewLanguage);
  useEffect(() => {
    setLangPreference(defaultViewLanguage);
  }, [defaultViewLanguage]);
  const [isExportingZip, setIsExportingZip] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Flatten all contacts that have materials
  const allGeneratedItems = useMemo(() => {
    const list: { company: CompanyItem; contact: RecruitmentContact }[] = [];
    session.companies.forEach((company) => {
      company.contacts.forEach((contact) => {
        if (contact.materialsGenerated || contact.materials) {
          list.push({ company, contact });
        }
      });
    });
    return list;
  }, [session.companies]);

  // Filter items based on user choice
  const filteredItems = useMemo(() => {
    return allGeneratedItems.filter(({ company, contact }) => {
      // Status filter
      if (filterStatus !== 'all') {
        const status = contact.outreachStatus || 'pending';
        if (status !== filterStatus) return false;
      }

      // Search filter
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const compMatch = company.name.toLowerCase().includes(q);
        const emailMatch = contact.email.toLowerCase().includes(q);
        const jobMatch = (contact.associatedJob?.title || '').toLowerCase().includes(q);
        if (!compMatch && !emailMatch && !jobMatch) return false;
      }

      return true;
    });
  }, [allGeneratedItems, filterStatus, searchTerm]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleExportFilteredTxt = () => {
    if (filteredItems.length === 0) return;
    exportMaterialsAsTxt(filteredItems, {
      profileName: session.profile.name || 'Candidato',
      lang: langPreference,
      scopeLabel: `Filtro: ${filterStatus} (${filteredItems.length} itens)`,
      filenamePrefix: `candidaturas_filtradas_${filterStatus}`,
    });
    showToast(`✓ ${filteredItems.length} candidatura(s) exportada(s) em .TXT!`);
  };

  const handleExportFilteredZip = async () => {
    if (filteredItems.length === 0) return;
    setIsExportingZip(true);
    showToast(`Empacotando ${filteredItems.length} candidatura(s) em .ZIP...`);
    try {
      await exportMaterialsAsZip(filteredItems, {
        profileName: session.profile.name || 'Candidato',
        lang: langPreference,
        scopeLabel: `Filtro: ${filterStatus} (${filteredItems.length} itens)`,
        filenamePrefix: `candidaturas_filtradas_${filterStatus}`,
      });
      showToast(`✓ Pacote ZIP com ${filteredItems.length} candidatura(s) baixado com sucesso!`);
    } catch (err) {
      console.error('Error generating zip:', err);
      showToast('Erro ao gerar pacote ZIP.');
    } finally {
      setIsExportingZip(false);
    }
  };

  const totalContacts = session.companies.reduce((acc, c) => acc + c.contacts.length, 0);
  const totalMaterials = session.companies.reduce(
    (acc, c) => acc + c.contacts.filter((cnt) => cnt.materialsGenerated).length,
    0
  );
  const remainingCompanies = session.companies.filter(
    (c) =>
      c.status !== 'Concluído' &&
      c.status !== 'Concluído parcialmente' &&
      c.status !== 'Sem contato de recrutamento'
  ).length;

  const exportFiles = [
    {
      id: 'zip',
      name: 'candidaturas_completas.zip',
      type: 'candidaturas.zip',
      title: 'Pacote ZIP Completo de Candidaturas (Bilíngue PT/EN)',
      description:
        'Organizado por Empresa/Contato/ contendo cold_email.txt, mensagem_curta.txt e cover_letter.docx (Word) com versões em Português e Inglês. Compatível com Windows e macOS.',
      icon: Archive,
      badge: `${totalMaterials} pastas geradas`,
      buttonLabel: 'Baixar ZIP Completo',
      primary: true,
    },
    {
      id: 'remaining',
      name: 'empresas_restantes_de_onde_parou.csv',
      type: 'empresas_restantes.csv',
      altType: 'empresas_restantes.txt',
      altButtonLabel: 'Baixar URLs (.TXT)',
      title: 'Lista de Onde Parou (Empresas Restantes)',
      description:
        'Exporta a lista contendo apenas as empresas pendentes ou não concluídas a partir do ponto exato onde a pesquisa parou. Baixe em CSV (pronto para ser reimportado na Etapa 1) ou TXT simples (1 URL por linha).',
      icon: FileSpreadsheet,
      badge: `${remainingCompanies} empresas pendentes`,
      buttonLabel: 'Baixar Planilha (CSV)',
      primary: false,
    },
    {
      id: 'contatos',
      name: 'contatos.csv',
      type: 'contatos.csv',
      title: 'Tabela de Contatos & Fontes (CSV)',
      description:
        'Planilha com todos os e-mails, classificações, evidências textuais, URLs das fontes e histórico de deduplicação. Exportado em UTF-8 com BOM compatível com Excel.',
      icon: FileSpreadsheet,
      badge: `${totalContacts} contatos / empresas`,
      buttonLabel: 'Baixar contatos.csv',
      primary: false,
    },
    {
      id: 'candidaturas',
      name: 'candidaturas_bilingues.csv',
      type: 'candidaturas.csv',
      title: 'Tabela de Candidaturas Bilíngues (CSV)',
      description:
        'Planilha estruturada com colunas separadas para Assunto, Cold Email, Mensagem Curta e Carta de Apresentação tanto em Português (PT-BR) quanto em Inglês (EN).',
      icon: FileSpreadsheet,
      badge: `${totalMaterials} materiais prontos`,
      buttonLabel: 'Baixar candidaturas.csv',
      primary: false,
    },
    {
      id: 'json',
      name: 'resultados.json',
      type: 'resultados.json',
      title: 'Dados Completos da Sessão (JSON)',
      description:
        'Estrutura hierárquica completa em JSON com todos os dados brutos coletados, perfil do candidato, metadados de execução e checkpoints para integrações.',
      icon: FileCode,
      badge: 'Formato JSON nativo',
      buttonLabel: 'Baixar resultados.json',
      primary: false,
    },
    {
      id: 'logs',
      name: 'logs.txt',
      type: 'logs.txt',
      title: 'Registro de Execução (Logs TXT)',
      description:
        'Histórico cronológico completo de auditoria do rastreamento, status HTTP dos sites, chamadas à IA e eventuais avisos ou erros.',
      icon: FileText,
      badge: `${session.logs.length} registros`,
      buttonLabel: 'Baixar logs.txt',
      primary: false,
    },
  ];

  const handleDownload = (type: string) => {
    window.location.href = `/api/session/${sessionId}/export/${type}`;
  };

  return (
    <div className="space-y-6">
      <div className="bg-slate-900/90 rounded-2xl border border-slate-800 p-5 sm:p-6 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
              <Download className="w-5 h-5 text-blue-400" />
              Exportação de Resultados & Materiais
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Todos os arquivos são gerados a partir dos dados verificados e formatados para compatibilidade total com Excel e Word.
            </p>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <span className="px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 font-semibold flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              {totalMaterials} materiais prontos para envio
            </span>
          </div>
        </div>

        {totalMaterials === 0 && (
          <div className="mt-4 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>
              Ainda não há materiais gerados nesta sessão. Inicie a pesquisa na aba <strong>2. Execução & Logs</strong> ou gere sob demanda na aba <strong>3. Contatos & Materiais</strong>.
            </span>
          </div>
        )}
      </div>

      {/* Custom Filtered Export Card */}
      {allGeneratedItems.length > 0 && (
        <div className="bg-slate-900/90 rounded-2xl border border-indigo-500/30 p-5 shadow-xl space-y-4 bg-gradient-to-r from-slate-900 via-indigo-950/20 to-slate-900">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <Filter className="w-5 h-5 text-indigo-400" />
              <div>
                <h3 className="text-sm font-bold text-white">Exportação Filtrada & Sob Medida</h3>
                <p className="text-xs text-slate-400">
                  Exporte apenas o que você precisa: filtre por status (Pendentes, Contactados, Descartados) ou busque por termos específicos.
                </p>
              </div>
            </div>

            <span className="px-3 py-1 rounded-full text-xs font-mono font-bold bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 self-start sm:self-auto">
              {filteredItems.length} de {allGeneratedItems.length} selecionadas
            </span>
          </div>

          {/* Controls: Status filter, Search, Language */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Status Selector */}
            <div>
              <label className="text-[11px] font-semibold text-slate-400 block mb-1">Status:</label>
              <div className="flex rounded-lg bg-slate-950 p-0.5 border border-slate-800 text-xs">
                {(['all', 'pending', 'contacted', 'discarded'] as const).map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setFilterStatus(st)}
                    className={`flex-1 py-1.5 rounded-md text-[11px] font-semibold transition cursor-pointer ${
                      filterStatus === st
                        ? st === 'contacted'
                          ? 'bg-emerald-600 text-white shadow'
                          : st === 'discarded'
                          ? 'bg-rose-600 text-white shadow'
                          : 'bg-indigo-600 text-white shadow'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {st === 'all'
                      ? 'Todos'
                      : st === 'pending'
                      ? 'Pendentes'
                      : st === 'contacted'
                      ? 'Contactados'
                      : 'Descartados'}
                  </button>
                ))}
              </div>
            </div>

            {/* Search Input */}
            <div>
              <label className="text-[11px] font-semibold text-slate-400 block mb-1">Buscar Empresa / E-mail:</label>
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Ex: Google, rh@..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            {/* Language Preference */}
            <div>
              <label className="text-[11px] font-semibold text-slate-400 block mb-1">Idioma dos Textos:</label>
              <div className="flex rounded-lg bg-slate-950 p-0.5 border border-slate-800 text-xs">
                <button
                  type="button"
                  onClick={() => setLangPreference('pt')}
                  className={`flex-1 py-1.5 rounded-md text-[11px] font-semibold transition cursor-pointer ${
                    langPreference === 'pt' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  🇧🇷 PT-BR
                </button>
                <button
                  type="button"
                  onClick={() => setLangPreference('en')}
                  className={`flex-1 py-1.5 rounded-md text-[11px] font-semibold transition cursor-pointer ${
                    langPreference === 'en' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  🇺🇸 EN
                </button>
                <button
                  type="button"
                  onClick={() => setLangPreference('both')}
                  className={`flex-1 py-1.5 rounded-md text-[11px] font-semibold transition cursor-pointer ${
                    langPreference === 'both' ? 'bg-purple-600 text-white shadow' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  🌐 Ambos
                </button>
              </div>
            </div>
          </div>

          {/* Action Download Buttons for the Filtered Subset */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-800/80">
            <span className="text-xs text-slate-400">
              Pronto para download: <strong className="text-white font-mono">{filteredItems.length}</strong> candidatura(s) encontradas.
            </span>

            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={filteredItems.length === 0}
                onClick={handleExportFilteredTxt}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-50 transition shadow-md shadow-blue-500/20 cursor-pointer active:scale-95"
                title="Baixar apenas as candidaturas filtradas em arquivo consolidado .TXT"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Baixar Filtradas (.TXT) ({filteredItems.length})</span>
              </button>

              <button
                type="button"
                disabled={filteredItems.length === 0 || isExportingZip}
                onClick={handleExportFilteredZip}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 transition shadow-md shadow-indigo-500/20 cursor-pointer active:scale-95"
                title="Baixar apenas as candidaturas filtradas em arquivo compactado .ZIP com pastas"
              >
                {isExportingZip ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Archive className="w-3.5 h-3.5" />}
                <span>Baixar Filtradas (.ZIP) ({filteredItems.length})</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Grid of Download Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {exportFiles.map((file) => {
          const Icon = file.icon;

          return (
            <div
              key={file.id}
              className={`rounded-2xl border p-5 flex flex-col justify-between transition ${
                file.primary
                  ? 'bg-gradient-to-br from-blue-950/40 via-slate-900 to-slate-950 border-blue-500/40 shadow-xl shadow-blue-500/10 md:col-span-2'
                  : 'bg-slate-900/80 border-slate-800'
              }`}
            >
              <div>
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex items-center gap-2.5">
                    <div
                      className={`p-2 rounded-xl ${
                        file.primary ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-300'
                      }`}
                    >
                      <Icon className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-white">{file.title}</h3>
                      <div className="font-mono text-[11px] text-blue-400">{file.name}</div>
                    </div>
                  </div>

                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                    {file.badge}
                  </span>
                </div>

                <p className="text-xs text-slate-400 leading-relaxed mb-4">{file.description}</p>
              </div>

              <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between gap-2 flex-wrap">
                <span className="text-[11px] text-slate-500 font-mono">
                  Sessão: {sessionId.slice(0, 14)}...
                </span>

                <div className="flex items-center gap-2">
                  {file.altType && (
                    <button
                      type="button"
                      data-url={`/api/session/${sessionId}/export/${file.altType}`}
                      onClick={() => handleDownload(file.altType!)}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition"
                      title="Baixar lista simples (.txt) • Botão do meio: abrir em nova aba"
                    >
                      <Download className="w-3.5 h-3.5 text-blue-400" />
                      <span>{file.altButtonLabel || 'Baixar (.TXT)'}</span>
                    </button>
                  )}

                  <button
                    type="button"
                    data-url={`/api/session/${sessionId}/export/${file.type}`}
                    onClick={() => handleDownload(file.type)}
                    className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition shadow-md ${
                      file.primary
                        ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-500/20'
                        : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
                    }`}
                    title={`${file.buttonLabel} • Botão do meio: abrir em nova aba`}
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>{file.buttonLabel}</span>
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 text-xs font-bold px-4 py-3 rounded-xl shadow-2xl flex items-center gap-2.5 animate-in fade-in slide-in-from-bottom-5 border bg-emerald-950/95 border-emerald-500/50 text-emerald-200">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
};
