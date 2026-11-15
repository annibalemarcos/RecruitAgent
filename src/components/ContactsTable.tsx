import { automaticSpontaneous, materialsReady } from '../materialPolicy.js';
import React, { useState, useMemo } from 'react';
import { ResultsDashboard } from './ResultsDashboard.tsx';
import { resolveDefaultViewLanguage } from '../utils/viewLanguage.js';
import {
  Search,
  Filter,
  CheckCircle,
  AlertCircle,
  HelpCircle,
  FileText,
  ExternalLink,
  Sparkles,
  Briefcase,
  Layers,
  ChevronRight,
  ChevronDown,
  ShieldAlert,
  Loader2,
  Copy,
  Check,
  Download,
  Mail,
  MessageSquare,
  Languages,
  X,
  Clock,
} from 'lucide-react';
import {
  SessionState,
  CompanyItem,
  RecruitmentContact,
  ContactClassification,
  CompanyStatus,
} from '../types/index.js';

interface ContactsTableProps {
  session: SessionState;
  onOpenMaterialModal: (contact: RecruitmentContact, company: CompanyItem) => void;
  onGenerateContactMaterials: (contactId: string) => Promise<void>;
  onGenerateAllPending?: () => void;
  isGeneratingAllPending?: boolean;
  onNavigateToTracking?: () => void;
  onNavigateToExport?: () => void;
}

export const ContactsTable: React.FC<ContactsTableProps> = ({
  session,
  onOpenMaterialModal,
  onGenerateContactMaterials,
  onGenerateAllPending,
  isGeneratingAllPending,
  onNavigateToTracking,
  onNavigateToExport,
}) => {
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedClassification, setSelectedClassification] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [filterWithVacancies, setFilterWithVacancies] = useState<boolean>(false);
  const [generatingContactId, setGeneratingContactId] = useState<string | null>(null);
  const [vacanciesModalCompany, setVacanciesModalCompany] = useState<CompanyItem | null>(null);

  // Expandable inline drawer state
  const [expandedContactIds, setExpandedContactIds] = useState<Set<string>>(new Set());
  const [inlineLangMap, setInlineLangMap] = useState<Record<string, 'pt' | 'en'>>({});
  const defaultViewLanguage = resolveDefaultViewLanguage(session.settings, session.profile);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const toggleExpand = (id: string) => {
    setExpandedContactIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const setContactLang = (id: string, lang: 'pt' | 'en') => {
    setInlineLangMap((prev) => ({ ...prev, [id]: lang }));
  };

  const handleCopyText = (key: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
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

  // Flatten contacts with company references
  const flattenedItems = useMemo(() => {
    const list: {
      type: 'contact' | 'no_contact_company';
      company: CompanyItem;
      contact?: RecruitmentContact;
    }[] = [];

    for (const comp of session.companies) {
      if (comp.contacts.length === 0) {
        list.push({
          type: 'no_contact_company',
          company: comp,
        });
      } else {
        for (const cnt of comp.contacts) {
          list.push({
            type: 'contact',
            company: comp,
            contact: cnt,
          });
        }
      }
    }

    return list;
  }, [session.companies]);

  const pendingMaterialsCount = useMemo(() => {
    let count = 0;
    for (const comp of session.companies) {
      for (const cnt of comp.contacts) {
        if (
          !materialsReady(cnt, session.settings) &&
          (cnt.classification === 'Recrutamento confirmado' ||
            cnt.classification === 'Possível recrutamento' || automaticSpontaneous(cnt, session.settings))
        ) {
          count++;
        }
      }
    }
    return count;
  }, [session.companies, session.settings]);

  // Apply filters
  const filteredItems = useMemo(() => {
    return flattenedItems.filter((item) => {
      const compName = item.company.name.toLowerCase();
      const site = item.company.normalizedUrl.toLowerCase();
      const email = item.contact?.email.toLowerCase() || '';
      const q = searchTerm.toLowerCase().trim();

      const matchSearch = !q || compName.includes(q) || site.includes(q) || email.includes(q);

      const matchClassification =
        selectedClassification === 'all' ||
        (item.contact && item.contact.classification === selectedClassification);

      const matchStatus =
        selectedStatus === 'all' || item.company.status === selectedStatus;

      const matchVacancies =
        !filterWithVacancies ||
        item.company.vacanciesFound.length > 0 ||
        Boolean(item.contact?.associatedJob);

      return matchSearch && matchClassification && matchStatus && matchVacancies;
    });
  }, [flattenedItems, searchTerm, selectedClassification, selectedStatus, filterWithVacancies]);

  const handleGenerateClick = async (contactId: string) => {
    setGeneratingContactId(contactId);
    try {
      await onGenerateContactMaterials(contactId);
      // Auto expand to show newly created materials
      setExpandedContactIds((prev) => new Set(prev).add(contactId));
    } catch (err) {
      console.error('Failed to generate materials:', err);
    } finally {
      setGeneratingContactId(null);
    }
  };

  const getClassificationBadge = (classification: ContactClassification) => {
    switch (classification) {
      case 'Recrutamento confirmado':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
            <CheckCircle className="w-3 h-3 text-emerald-400" />
            Recrutamento Confirmado
          </span>
        );
      case 'Possível recrutamento':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-500/15 text-blue-400 border border-blue-500/30">
            <HelpCircle className="w-3 h-3 text-blue-400" />
            Possível Recrutamento
          </span>
        );
      case 'Contato geral':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-800 text-slate-300 border border-slate-700">
            Contato Geral
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-800 text-slate-400 border border-slate-700">
            Outra Finalidade
          </span>
        );
    }
  };

  const getStatusBadge = (status: CompanyStatus) => {
    const config: Record<CompanyStatus, { bg: string; text: string; border: string }> = {
      'Email não encontrado': { bg: 'bg-slate-800/80', text: 'text-slate-400', border: 'border-slate-700' },
      'Não foi possível verificar a fonte': { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/20' },
      Concluído: {
        bg: 'bg-emerald-500/10',
        text: 'text-emerald-400',
        border: 'border-emerald-500/20',
      },
      'Concluído parcialmente': {
        bg: 'bg-blue-500/10',
        text: 'text-blue-400',
        border: 'border-blue-500/20',
      },
      'Contato encontrado': {
        bg: 'bg-indigo-500/10',
        text: 'text-indigo-400',
        border: 'border-indigo-500/20',
      },
      'Sem contato de recrutamento': {
        bg: 'bg-slate-800/80',
        text: 'text-slate-400',
        border: 'border-slate-700',
      },
      Pesquisando: {
        bg: 'bg-amber-500/10',
        text: 'text-amber-400',
        border: 'border-amber-500/20',
      },
      'Gerando materiais': {
        bg: 'bg-purple-500/10',
        text: 'text-purple-400',
        border: 'border-purple-500/20',
      },
      Bloqueado: { bg: 'bg-rose-500/10', text: 'text-rose-400', border: 'border-rose-500/20' },
      Erro: { bg: 'bg-rose-500/10', text: 'text-rose-400', border: 'border-rose-500/20' },
      Pendente: { bg: 'bg-slate-800', text: 'text-slate-400', border: 'border-slate-700' },
      Cancelado: { bg: 'bg-slate-800', text: 'text-slate-500', border: 'border-slate-700' },
    };

    const cfg = config[status] || {
      bg: 'bg-slate-800',
      text: 'text-slate-300',
      border: 'border-slate-700',
    };

    return (
      <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-semibold border ${cfg.bg} ${cfg.text} ${cfg.border}`}>
        {status}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Analytics Dashboard with Charts and Organized Generated Materials */}
      <ResultsDashboard
        session={session}
        onOpenMaterialModal={onOpenMaterialModal}
        onNavigateToTracking={onNavigateToTracking}
        onNavigateToExport={onNavigateToExport}
      />

      {/* Pending Materials Bulk Action Banner */}
      {pendingMaterialsCount > 0 && onGenerateAllPending && (
        <div className="p-4 rounded-xl bg-gradient-to-r from-indigo-950/80 via-slate-900 to-purple-950/80 border border-indigo-700/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs shadow-lg">
          <div className="flex items-center gap-2.5">
            <Sparkles className="w-5 h-5 text-amber-400 shrink-0" />
            <div>
              <span className="font-bold text-white">
                Há {pendingMaterialsCount} contato(s) de recrutamento aguardando materiais personalizados.
              </span>
              <p className="text-slate-300 text-[11px] mt-0.5">
                Gere Cold Email, Mensagem Curta e Carta de Apresentação em lote com 1 clique (com suporte bilíngue PT-BR e EN).
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onGenerateAllPending}
            disabled={isGeneratingAllPending}
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg font-bold text-xs text-white bg-indigo-600 hover:bg-indigo-500 shadow-md shadow-indigo-500/25 transition disabled:opacity-50 shrink-0"
          >
            {isGeneratingAllPending ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Gerando Materiais em Lote...
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5 text-cyan-300" /> Gerar {pendingMaterialsCount} Materiais Pendentes
              </>
            )}
          </button>
        </div>
      )}

      {/* Filters Bar */}
      <div className="bg-slate-900/90 rounded-2xl border border-slate-800 p-4 shadow-xl flex flex-wrap items-center justify-between gap-3 text-xs">
        {/* Search */}
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Filtrar por empresa, e-mail ou domínio..."
            className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
          />
        </div>

        {/* Classification filter */}
        <div className="flex items-center gap-1.5">
          <span className="text-slate-400 font-semibold">Classificação:</span>
          <select
            value={selectedClassification}
            onChange={(e) => setSelectedClassification(e.target.value)}
            className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
          >
            <option value="all">Todas ({flattenedItems.length})</option>
            <option value="Recrutamento confirmado">Confirmado</option>
            <option value="Possível recrutamento">Possível</option>
            <option value="Contato geral">Contato Geral</option>
          </select>
        </div>

        {/* Status filter */}
        <div className="flex items-center gap-1.5">
          <span className="text-slate-400 font-semibold">Status:</span>
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
          >
            <option value="all">Todos</option>
            <option value="Concluído">Concluído</option>
            <option value="Concluído parcialmente">Parcial</option>
            <option value="Sem contato de recrutamento">Sem contato</option>
            <option value="Erro">Erro</option>
            <option value="Bloqueado">Bloqueado</option>
          </select>
        </div>

        {/* Vacancies Only Toggle */}
        <label className="flex items-center gap-2 cursor-pointer font-medium text-slate-300">
          <input
            type="checkbox"
            checked={filterWithVacancies}
            onChange={(e) => setFilterWithVacancies(e.target.checked)}
            className="w-3.5 h-3.5 rounded bg-slate-950 border-slate-700 text-blue-600 focus:ring-blue-500"
          />
          <span>Apenas com vagas</span>
        </label>
      </div>

      {/* Main Table */}
      <div className="bg-slate-900/90 rounded-2xl border border-slate-800 shadow-xl overflow-hidden">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-bold text-white text-xs sm:text-sm">
              Lista Detalhada de Contatos & Candidaturas
            </span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-blue-400 font-mono">
              {filteredItems.length} resultado(s)
            </span>
          </div>
          <p className="text-[11px] text-slate-400 hidden sm:block">
            Clique em "Expandir" para ler, copiar e exportar os textos em Português e Inglês.
          </p>
        </div>

        <div className="grid gap-3 p-3 sm:p-4 xl:hidden">
          {filteredItems.length === 0 ? (
            <p className="py-8 text-center text-xs text-slate-500">Nenhum contato encontrado com os filtros selecionados.</p>
          ) : filteredItems.map((item, idx) => {
            const comp = item.company;
            const cnt = item.contact;
            if (item.type === 'no_contact_company') return (
              <article key={`mobile_comp_${comp.id}_${idx}`} className="min-w-0 rounded-xl border border-slate-800 bg-slate-950/60 p-3 sm:p-4 space-y-2">
                <div className="flex min-w-0 items-start justify-between gap-3"><div className="min-w-0"><a href={comp.normalizedUrl} target="_blank" rel="noopener noreferrer" className="font-bold text-sm text-slate-100 break-words">{comp.name}</a><a href={comp.normalizedUrl} target="_blank" rel="noopener noreferrer" className="mt-1 block break-all text-[11px] text-blue-300">{comp.normalizedUrl}</a></div><div className="shrink-0">{getStatusBadge(comp.status)}</div></div>
                <p className="text-xs text-amber-300">Nenhum e-mail público de recrutamento encontrado · {comp.visitedPages.length} página(s) rastreada(s)</p>
                {comp.careersUrl || comp.applicationPortalUrl ? <a href={comp.careersUrl || comp.applicationPortalUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-blue-300">Portal de carreiras <ExternalLink className="w-3 h-3" /></a> : null}
              </article>
            );
            if (!cnt) return null;
            const isExpanded = expandedContactIds.has(cnt.id);
            const activeLang = inlineLangMap[cnt.id] || defaultViewLanguage;
            const mat = cnt.materials;
            const langMat = mat && activeLang === 'pt' ? mat.pt || mat : mat?.en || mat;
            const hasMaterials = materialsReady(cnt, session.settings);
            return <article key={`mobile_${cnt.id}`} className="min-w-0 rounded-xl border border-slate-800 bg-slate-950/60 p-3 sm:p-4 space-y-3">
              <div className="flex min-w-0 items-start justify-between gap-3">
                <div className="min-w-0"><div className="font-bold text-sm text-slate-100 break-words">{cnt.companyName}</div><a href={cnt.site || comp.normalizedUrl} target="_blank" rel="noopener noreferrer" className="mt-1 block break-all text-[11px] text-blue-300">{cnt.site || comp.normalizedUrl}</a></div>
                <div className="shrink-0">{getStatusBadge(comp.status)}</div>
              </div>
              <div className="rounded-lg bg-slate-900/80 border border-slate-800 p-2.5 min-w-0">
                <div className="break-all font-mono text-xs font-semibold text-cyan-200">{cnt.email}</div>
                <button type="button" onClick={() => handleCopyText(`recipient_${cnt.id}`, cnt.email)} className="mt-1 inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] text-cyan-300 bg-slate-800 hover:bg-slate-700">{copiedKey === `recipient_${cnt.id}` ? <><Check className="w-3 h-3" /> Copiado</> : <><Copy className="w-3 h-3" /> Copiar email</>}</button>
              </div>
              <div className="min-w-0"><div className="mb-1">{getClassificationBadge(cnt.classification)}</div><p className="break-words text-[11px] leading-relaxed text-slate-300">{cnt.justification}</p>{cnt.evidenceSnippet && <p className="mt-2 break-words rounded bg-slate-900 p-2 text-[10px] italic text-slate-400 line-clamp-3">{cnt.evidenceSnippet}</p>}<a href={cnt.sourceUrl} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 text-[11px] text-blue-300">Ver fonte <ExternalLink className="w-3 h-3" /></a></div>
              <div className="flex flex-wrap items-center gap-2 border-t border-slate-800 pt-2">
                {cnt.associatedJob?.title ? <span className="max-w-full break-words rounded border border-cyan-800 bg-cyan-950/60 px-2 py-1 text-[11px] text-cyan-200">{cnt.associatedJob.title}</span> : <span className="text-[11px] italic text-slate-400">Candidatura Espontânea</span>}
                {cnt.associatedJob?.url && <a href={cnt.associatedJob.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[11px] text-blue-300">Abrir vaga <ExternalLink className="w-3 h-3" /></a>}
              </div>
              <div className="flex flex-wrap gap-2">
                {hasMaterials ? <>
                  <button type="button" onClick={() => toggleExpand(cnt.id)} className="inline-flex items-center gap-1 rounded-lg border border-indigo-700/60 bg-indigo-950/70 px-3 py-2 text-xs font-semibold text-indigo-200">{isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}{isExpanded ? 'Recolher materiais' : 'Expandir materiais'}</button>
                  <button type="button" onClick={() => onOpenMaterialModal(cnt, comp)} className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white"><FileText className="w-3 h-3" /> Editar</button>
                </> : automaticSpontaneous(cnt, session.settings) ? <span className="self-center text-[11px] text-indigo-300">Geração automática pendente</span> : <button type="button" onClick={() => handleGenerateClick(cnt.id)} disabled={generatingContactId === cnt.id} className="inline-flex items-center gap-1 rounded-lg border border-indigo-700 bg-indigo-950/70 px-3 py-2 text-xs font-bold text-indigo-200 disabled:opacity-50">{generatingContactId === cnt.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}{generatingContactId === cnt.id ? 'Gerando...' : 'Gerar materiais'}</button>}
              </div>
              {isExpanded && langMat && <div className="space-y-2 border-t border-indigo-500/20 pt-3">
                <div className="flex flex-wrap items-center justify-between gap-2"><strong className="text-xs text-white">Materiais · {activeLang === 'pt' ? 'Português' : 'Inglês'}</strong><button type="button" onClick={() => onOpenMaterialModal(cnt, comp)} className="text-[11px] text-blue-300 underline">Abrir editor completo</button></div>
                <div className="rounded-lg border border-slate-800 bg-slate-900 p-2.5"><div className="text-[10px] font-semibold uppercase text-slate-500">Assunto</div><p className="mt-1 break-words text-xs text-slate-200">{langMat.subject}</p></div>
                <div className="rounded-lg border border-slate-800 bg-slate-900 p-2.5"><div className="text-[10px] font-semibold uppercase text-slate-500">Cold email</div><p className="mt-1 whitespace-pre-wrap break-words text-xs text-slate-300 line-clamp-6">{langMat.coldEmail}</p></div>
                <div className="rounded-lg border border-slate-800 bg-slate-900 p-2.5"><div className="text-[10px] font-semibold uppercase text-slate-500">Mensagem curta</div><p className="mt-1 whitespace-pre-wrap break-words text-xs text-slate-300 line-clamp-4">{langMat.shortMessage}</p></div>
              </div>}
            </article>;
          })}
        </div>
        <div className="hidden overflow-x-auto xl:block">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-950/70 border-b border-slate-800 text-slate-400 font-semibold uppercase text-[10px] tracking-wider">
                <th className="py-3 px-4">Empresa / Site</th>
                <th className="py-3 px-4">E-mail Coletado</th>
                <th className="py-3 px-4">Classificação & Evidência</th>
                <th className="py-3 px-4">Vagas / Portal</th>
                <th className="py-3 px-4 text-right">Materiais & Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-slate-500">
                    Nenhum contato encontrado com os filtros selecionados.
                  </td>
                </tr>
              ) : (
                filteredItems.map((item, idx) => {
                  const comp = item.company;
                  const cnt = item.contact;

                  if (item.type === 'no_contact_company') {
                    return (
                      <tr
                        key={`comp_${comp.id}_${idx}`}
                        data-company-url={comp.normalizedUrl}
                        data-company-name={comp.name}
                        title="Dica: Clique com o botão do meio para abrir o site da empresa em nova aba"
                        className="hover:bg-slate-800/20 transition"
                      >
                        <td className="py-3.5 px-4" data-url={comp.normalizedUrl}>
                          <div
                            className="font-bold text-slate-200 hover:text-blue-300 transition cursor-pointer"
                            data-url={comp.normalizedUrl}
                            title="Clique com o botão do meio para abrir o site em nova aba"
                          >
                            {comp.name}
                          </div>
                          <a
                            href={comp.normalizedUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            data-url={comp.normalizedUrl}
                            title="Abrir site (ou clique com o botão do meio)"
                            className="text-slate-400 hover:text-blue-400 font-mono text-[11px] flex items-center gap-1 mt-0.5"
                          >
                            {comp.normalizedUrl} <ExternalLink className="w-3 h-3" />
                          </a>
                        </td>
                        <td className="py-3.5 px-4" colSpan={2}>
                          <div className="text-amber-400/90 flex items-center gap-1.5 font-medium">
                            <AlertCircle className="w-3.5 h-3.5" /> Nenhum e-mail público de recrutamento encontrado
                          </div>
                          <div className="text-slate-500 text-[11px] mt-0.5">
                            {comp.visitedPages.length} página(s) rastreada(s) sem expor caixa postal direta.
                          </div>
                        </td>
                        <td className="py-3.5 px-4">
                          {comp.vacanciesFound && comp.vacanciesFound.length > 0 ? (
                            <div className="space-y-1.5">
                              <div className="flex flex-wrap items-center gap-1.5">
                                {comp.vacanciesFound.slice(0, 2).map((vac, vIdx) => (
                                  <div key={vIdx} className="flex items-center gap-1">
                                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-cyan-300 bg-cyan-950/60 px-2 py-0.5 rounded border border-cyan-800/80">
                                      <Briefcase className="w-3 h-3 text-cyan-400" />
                                      {vac.title}
                                    </span>
                                    {vac.isModified && (
                                      <span
                                        className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40"
                                        title={vac.modificationDetails || 'Vaga modificada/atualizada'}
                                      >
                                        Modificada
                                      </span>
                                    )}
                                  </div>
                                ))}
                              </div>
                              {comp.vacanciesFound.length > 2 && (
                                <button
                                  type="button"
                                  onClick={() => setVacanciesModalCompany(comp)}
                                  className="text-[11px] text-blue-400 hover:text-blue-300 font-semibold underline flex items-center gap-1"
                                >
                                  + {comp.vacanciesFound.length - 2} outra(s) vaga(s) mapeada(s)
                                </button>
                              )}
                              {comp.careersUrl || comp.applicationPortalUrl ? (
                                <div className="pt-0.5">
                                  <a
                                    href={comp.careersUrl || comp.applicationPortalUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    data-url={comp.careersUrl || comp.applicationPortalUrl}
                                    title="Abrir portal oficial de carreiras"
                                    className="text-blue-400 hover:underline text-[11px] flex items-center gap-1 font-semibold"
                                  >
                                    Portal Oficial <ExternalLink className="w-2.5 h-2.5" />
                                  </a>
                                </div>
                              ) : null}
                            </div>
                          ) : comp.careersUrl || comp.applicationPortalUrl ? (
                            <a
                              href={comp.careersUrl || comp.applicationPortalUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              data-url={comp.careersUrl || comp.applicationPortalUrl}
                              title="Abrir portal de carreiras (ou botão do meio)"
                              className="text-blue-400 hover:underline flex items-center gap-1 font-semibold text-xs"
                            >
                              Portal de Carreiras / Vagas <ExternalLink className="w-3 h-3" />
                            </a>
                          ) : (
                            <span className="text-slate-500 italic text-xs">Nenhum portal identificado</span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          {getStatusBadge(comp.status)}
                        </td>
                      </tr>
                    );
                  }

                  if (!cnt) return null;

                  const isExpanded = expandedContactIds.has(cnt.id);
                  const activeLang = inlineLangMap[cnt.id] || defaultViewLanguage;

                  const mat = cnt.materials;
                  const langMat =
                    mat && activeLang === 'pt'
                      ? mat.pt || mat
                      : mat?.en || mat;

                  return (
                    <React.Fragment key={cnt.id}>
                      <tr
                        className="hover:bg-slate-800/30 transition"
                        data-company-url={cnt.site || comp.normalizedUrl}
                        data-company-name={cnt.companyName}
                        title="Dica: Clique com o botão do meio para abrir o site da empresa em nova aba"
                      >
                        {/* Empresa & Site */}
                        <td className="py-3.5 px-4 align-top" data-url={cnt.site || comp.normalizedUrl}>
                          <div
                            className="font-bold text-slate-200 hover:text-blue-300 transition cursor-pointer"
                            data-url={cnt.site || comp.normalizedUrl}
                            title="Clique com o botão do meio para abrir o site em nova aba"
                          >
                            {cnt.companyName}
                          </div>
                          <a
                            href={cnt.site}
                            target="_blank"
                            rel="noopener noreferrer"
                            data-url={cnt.site}
                            title="Abrir site (ou botão do meio)"
                            className="text-slate-400 hover:text-blue-400 font-mono text-[11px] flex items-center gap-1 mt-0.5"
                          >
                            {cnt.site} <ExternalLink className="w-3 h-3" />
                          </a>
                          <div className="mt-1">{getStatusBadge(comp.status)}</div>
                        </td>

                        {/* E-mail Coletado */}
                        <td className="py-3.5 px-4 align-top" data-email={cnt.email} data-url={`mailto:${cnt.email}`}>
                          <div
                            className="font-mono font-semibold text-slate-200 select-all hover:text-cyan-300 transition cursor-pointer"
                            data-url={`mailto:${cnt.email}`}
                            title="E-mail de contato • Clique com o botão do meio para abrir novo e-mail"
                          >
                            {cnt.email}
                          </div>
                          <button type="button"
                            onClick={() => handleCopyText(`recipient_${cnt.id}`, cnt.email)}
                            title="Copiar endereço de email" aria-label={`Copiar endereço de email ${cnt.email}`}
                            className="mt-1 inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-cyan-300 bg-slate-800 hover:bg-slate-700">
                            {copiedKey === `recipient_${cnt.id}` ? <><Check className="w-3 h-3" /> Copiado!</> : <><Copy className="w-3 h-3" /> Copiar email</>}
                          </button>
                          {cnt.isObfuscated && (
                            <span className="inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 font-mono">
                              Ofuscado: {cnt.originalText}
                            </span>
                          )}
                          <div className="text-[10px] text-slate-500 mt-1">
                            {cnt.allSources.length > 1
                              ? `Presente em ${cnt.allSources.length} páginas`
                              : 'Fonte direta'}
                          </div>
                        </td>

                        {/* Classificação & Evidência */}
                        <td className="py-3.5 px-4 align-top max-w-xs">
                          <div className="mb-1">{getClassificationBadge(cnt.classification)}</div>
                          <p className="text-[11px] text-slate-300 font-medium">
                            {cnt.justification}
                          </p>
                          {cnt.evidenceSnippet && (
                            <div className="mt-1 p-1.5 rounded bg-slate-950/60 border border-slate-800 text-[10px] text-slate-400 font-mono italic line-clamp-2">
                              "{cnt.evidenceSnippet}"
                            </div>
                          )}
                          <a
                            href={cnt.sourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            data-url={cnt.sourceUrl}
                            title="Abrir página fonte (ou botão do meio)"
                            className="inline-flex items-center gap-1 text-[10px] text-blue-400 hover:underline mt-1 font-mono"
                          >
                            Ver página fonte <ExternalLink className="w-2.5 h-2.5" />
                          </a>
                        </td>

                        {/* Vagas / Carreiras */}
                        <td className="py-3.5 px-4 align-top">
                          {(() => {
                            const matchingVac = comp.vacanciesFound?.find(
                              (v) => cnt.associatedJob?.title && v.title.toLowerCase() === cnt.associatedJob.title.toLowerCase()
                            );
                            const isJobModified = matchingVac?.isModified || false;
                            const modDetails = matchingVac?.modificationDetails;

                            return (
                              <>
                                {cnt.associatedJob?.title ? (
                                  <div className="space-y-1">
                                    <div className="flex flex-wrap items-center gap-1">
                                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-cyan-300 bg-cyan-950/60 px-2 py-0.5 rounded border border-cyan-800/80">
                                        <Briefcase className="w-3 h-3 text-cyan-400" />
                                        {cnt.associatedJob.title}
                                      </span>
                                      {isJobModified && (
                                        <span
                                          className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40"
                                          title={modDetails || 'Vaga modificada/atualizada'}
                                        >
                                          Modificada
                                        </span>
                                      )}
                                    </div>
                                    {cnt.associatedJob.url && (
                                      <div>
                                        <a
                                          href={cnt.associatedJob.url}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          data-url={cnt.associatedJob.url}
                                          title="Abrir link da vaga (ou botão do meio)"
                                          className="text-[10px] text-slate-400 hover:text-white underline flex items-center gap-1"
                                        >
                                          Link da vaga <ExternalLink className="w-2.5 h-2.5" />
                                        </a>
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-[11px] text-slate-400 italic">
                                    Candidatura Espontânea
                                  </span>
                                )}

                                {comp.vacanciesFound && comp.vacanciesFound.length > 1 && (
                                  <div className="mt-1">
                                    <button
                                      type="button"
                                      onClick={() => setVacanciesModalCompany(comp)}
                                      className="text-[10px] text-blue-400 hover:text-blue-300 font-semibold underline flex items-center gap-1"
                                    >
                                      + {comp.vacanciesFound.length - 1} outra(s) vaga(s) mapeada(s)
                                    </button>
                                  </div>
                                )}
                              </>
                            );
                          })()}

                          {cnt.applicationRestrictions && (
                            <div className="mt-1 text-[10px] text-rose-300 font-medium flex items-center gap-1">
                              <ShieldAlert className="w-3 h-3 text-rose-400 shrink-0" />
                              {cnt.applicationRestrictions}
                            </div>
                          )}
                        </td>

                        {/* Ação / Materiais */}
                        <td className="py-3.5 px-4 align-top text-right whitespace-nowrap">
                          {materialsReady(cnt, session.settings) ? (
                            <div className="space-y-1.5 inline-flex flex-col items-end">
                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => toggleExpand(cnt.id)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-indigo-950/70 text-indigo-300 border border-indigo-700/60 hover:bg-indigo-900 transition"
                                >
                                  {isExpanded ? (
                                    <>
                                      <ChevronDown className="w-3.5 h-3.5" /> Recolher
                                    </>
                                  ) : (
                                    <>
                                      <ChevronRight className="w-3.5 h-3.5" /> Expandir Materiais
                                    </>
                                  )}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => onOpenMaterialModal(cnt, comp)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 shadow-sm transition"
                                  title="Abrir no editor modal"
                                >
                                  <FileText className="w-3 h-3" /> Editar
                                </button>
                              </div>
                              <span className="text-[10px] text-emerald-400 flex items-center gap-1 font-medium">
                                <CheckCircle className="w-3 h-3" /> Bilíngue PT / EN
                              </span>
                            </div>
                          ) : (
                            <div className="space-y-1.5 inline-flex flex-col items-end">
                              {automaticSpontaneous(cnt, session.settings) ? (
                                <span className="text-xs text-indigo-300">Geração automática PT / EN — pendente</span>
                              ) : <button
                                type="button"
                                onClick={() => handleGenerateClick(cnt.id)}
                                disabled={generatingContactId === cnt.id}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-indigo-300 bg-indigo-950/70 border border-indigo-700 hover:bg-indigo-900 transition disabled:opacity-50"
                              >
                                {generatingContactId === cnt.id ? (
                                  <>
                                    <Loader2 className="w-3 h-3 animate-spin" /> Gerando...
                                  </>
                                ) : (
                                  <>
                                    <Sparkles className="w-3 h-3 text-cyan-300" /> Gerar Materiais
                                  </>
                                )}
                              </button>}
                              <span className="text-[10px] text-slate-500 block">
                                {cnt.classification === 'Recrutamento confirmado'
                                  ? 'Fila prioritária'
                                  : 'Sob demanda'}
                              </span>
                            </div>
                          )}
                        </td>
                      </tr>

                      {/* INLINE EXPANDED DASHBOARD FOR GENERATED MATERIALS */}
                      {isExpanded && cnt.materials && langMat && (
                        <tr className="bg-slate-950/80 border-b border-indigo-500/20">
                          <td colSpan={5} className="p-4 sm:p-5">
                            <div className="bg-slate-900/95 border border-slate-800 rounded-xl p-4 space-y-4 shadow-2xl">
                              {/* Top drawer controls */}
                              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-bold text-white flex items-center gap-1.5">
                                    <Sparkles className="w-4 h-4 text-cyan-400" />
                                    Materiais Gerados para {cnt.companyName} ({cnt.email}):
                                  </span>

                                  {/* Language switch pills */}
                                  <div className="flex rounded-lg bg-slate-950 p-0.5 border border-slate-800">
                                    <button
                                      type="button"
                                      onClick={() => setContactLang(cnt.id, 'pt')}
                                      className={`px-2.5 py-0.5 rounded text-[11px] font-semibold transition ${
                                        activeLang === 'pt'
                                          ? 'bg-blue-600 text-white shadow'
                                          : 'text-slate-400 hover:text-white'
                                      }`}
                                    >
                                      🇧🇷 Português
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setContactLang(cnt.id, 'en')}
                                      className={`px-2.5 py-0.5 rounded text-[11px] font-semibold transition ${
                                        activeLang === 'en'
                                          ? 'bg-indigo-600 text-white shadow'
                                          : 'text-slate-400 hover:text-white'
                                      }`}
                                    >
                                      🇺🇸 English
                                    </button>
                                  </div>
                                </div>

                                <div className="flex flex-wrap items-center gap-2">
                                  {/* Copy Full Bundle */}
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const fullText = [
                                        `DESTINATÁRIO: ${cnt.email} (${cnt.companyName})`,
                                        `IDIOMA: ${activeLang.toUpperCase()}`,
                                        `ASSUNTO: ${langMat.subject}`,
                                        '',
                                        `--- COLD EMAIL ---`,
                                        langMat.coldEmail,
                                        '',
                                        `--- MENSAGEM CURTA ---`,
                                        langMat.shortMessage,
                                        '',
                                        `--- CARTA DE APRESENTAÇÃO ---`,
                                        langMat.coverLetter,
                                      ].join('\r\n');
                                      handleCopyText(`bundle_${cnt.id}_${activeLang}`, fullText);
                                    }}
                                    className="inline-flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
                                  >
                                    {copiedKey === `bundle_${cnt.id}_${activeLang}` ? (
                                      <>
                                        <Check className="w-3.5 h-3.5 text-emerald-400" /> Copiado!
                                      </>
                                    ) : (
                                      <>
                                        <Copy className="w-3.5 h-3.5 text-blue-400" /> Copiar Pacote Completo
                                      </>
                                    )}
                                  </button>

                                  {/* Download Full Bundle TXT */}
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const fullText = [
                                        `EMPRESA: ${cnt.companyName}`,
                                        `SITE: ${cnt.site}`,
                                        `DESTINATÁRIO: ${cnt.email}`,
                                        `IDIOMA: ${activeLang.toUpperCase()}`,
                                        `ASSUNTO: ${langMat.subject}`,
                                        '',
                                        `==================== COLD EMAIL ====================`,
                                        langMat.coldEmail,
                                        '',
                                        `================== MENSAGEM CURTA ==================`,
                                        langMat.shortMessage,
                                        '',
                                        `============== CARTA DE APRESENTAÇÃO ================`,
                                        langMat.coverLetter,
                                      ].join('\r\n');
                                      handleDownloadTxt(
                                        `candidatura_${cnt.companyName.toLowerCase().replace(/\s+/g, '_')}_${activeLang}.txt`,
                                        fullText
                                      );
                                    }}
                                    className="inline-flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-semibold bg-blue-600/20 text-blue-300 border border-blue-500/30 hover:bg-blue-600/30 transition"
                                  >
                                    <Download className="w-3.5 h-3.5 text-blue-400" /> Baixar Pacote (.TXT)
                                  </button>
                                </div>
                              </div>

                              {/* Subject Line Bar */}
                              <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2 overflow-hidden">
                                  <span className="font-bold text-slate-400 text-[11px] whitespace-nowrap">
                                    Assunto:
                                  </span>
                                  <span className="text-slate-200 font-semibold truncate">
                                    {langMat.subject}
                                  </span>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleCopyText(`sub_${cnt.id}_${activeLang}`, langMat.subject)}
                                  className="text-[11px] text-blue-400 hover:text-blue-300 flex items-center gap-1 shrink-0 font-medium"
                                >
                                  {copiedKey === `sub_${cnt.id}_${activeLang}` ? (
                                    <>
                                      <Check className="w-3 h-3 text-emerald-400" /> Copiado
                                    </>
                                  ) : (
                                    <>
                                      <Copy className="w-3 h-3" /> Copiar Assunto
                                    </>
                                  )}
                                </button>
                              </div>

                              {/* 3 Organized Content Cards Grid */}
                              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                                {/* 1. Cold Email Card */}
                                <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3.5 flex flex-col justify-between space-y-2.5">
                                  <div>
                                    <div className="flex items-center justify-between border-b border-slate-800/80 pb-2 mb-2">
                                      <span className="font-bold text-slate-200 flex items-center gap-1.5">
                                        <Mail className="w-3.5 h-3.5 text-blue-400" /> Cold Email
                                      </span>
                                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-900 border border-slate-700 text-slate-400 font-mono">
                                        {langMat.wordCounts.coldEmail} palavras
                                      </span>
                                    </div>
                                    <div className="text-[11px] text-slate-300 whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto pr-1">
                                      {langMat.coldEmail}
                                    </div>
                                  </div>

                                  <div className="pt-2 border-t border-slate-800 flex items-center justify-between gap-1">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleDownloadTxt(
                                          `cold_email_${cnt.companyName.toLowerCase().replace(/\s+/g, '_')}_${activeLang}.txt`,
                                          `ASSUNTO: ${langMat.subject}\r\n\r\n${langMat.coldEmail}`
                                        )
                                      }
                                      className="inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-200"
                                    >
                                      <Download className="w-3 h-3" /> .TXT
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleCopyText(`cold_${cnt.id}_${activeLang}`, langMat.coldEmail)
                                      }
                                      className="inline-flex items-center gap-1 text-[11px] text-blue-400 hover:text-blue-300 font-semibold"
                                    >
                                      {copiedKey === `cold_${cnt.id}_${activeLang}` ? (
                                        <>
                                          <Check className="w-3 h-3 text-emerald-400" /> Copiado
                                        </>
                                      ) : (
                                        <>
                                          <Copy className="w-3 h-3" /> Copiar
                                        </>
                                      )}
                                    </button>
                                  </div>
                                </div>

                                {/* 2. Short Message Card */}
                                <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3.5 flex flex-col justify-between space-y-2.5">
                                  <div>
                                    <div className="flex items-center justify-between border-b border-slate-800/80 pb-2 mb-2">
                                      <span className="font-bold text-slate-200 flex items-center gap-1.5">
                                        <MessageSquare className="w-3.5 h-3.5 text-cyan-400" /> Mensagem Curta
                                      </span>
                                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-900 border border-slate-700 text-slate-400 font-mono">
                                        {langMat.wordCounts.shortMessage} palavras
                                      </span>
                                    </div>
                                    <div className="text-[11px] text-slate-300 whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto pr-1">
                                      {langMat.shortMessage}
                                    </div>
                                  </div>

                                  <div className="pt-2 border-t border-slate-800 flex items-center justify-between gap-1">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleDownloadTxt(
                                          `mensagem_curta_${cnt.companyName.toLowerCase().replace(/\s+/g, '_')}_${activeLang}.txt`,
                                          langMat.shortMessage
                                        )
                                      }
                                      className="inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-200"
                                    >
                                      <Download className="w-3 h-3" /> .TXT
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleCopyText(`short_${cnt.id}_${activeLang}`, langMat.shortMessage)
                                      }
                                      className="inline-flex items-center gap-1 text-[11px] text-blue-400 hover:text-blue-300 font-semibold"
                                    >
                                      {copiedKey === `short_${cnt.id}_${activeLang}` ? (
                                        <>
                                          <Check className="w-3 h-3 text-emerald-400" /> Copiado
                                        </>
                                      ) : (
                                        <>
                                          <Copy className="w-3 h-3" /> Copiar
                                        </>
                                      )}
                                    </button>
                                  </div>
                                </div>

                                {/* 3. Cover Letter Card */}
                                <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3.5 flex flex-col justify-between space-y-2.5">
                                  <div>
                                    <div className="flex items-center justify-between border-b border-slate-800/80 pb-2 mb-2">
                                      <span className="font-bold text-slate-200 flex items-center gap-1.5">
                                        <FileText className="w-3.5 h-3.5 text-indigo-400" /> Carta de Apresentação
                                      </span>
                                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-900 border border-slate-700 text-slate-400 font-mono">
                                        {langMat.wordCounts.coverLetter} palavras
                                      </span>
                                    </div>
                                    <div className="text-[11px] text-slate-300 whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto pr-1">
                                      {langMat.coverLetter}
                                    </div>
                                  </div>

                                  <div className="pt-2 border-t border-slate-800 flex items-center justify-between gap-1">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleDownloadTxt(
                                          `carta_${cnt.companyName.toLowerCase().replace(/\s+/g, '_')}_${activeLang}.txt`,
                                          langMat.coverLetter
                                        )
                                      }
                                      className="inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-200"
                                    >
                                      <Download className="w-3 h-3" /> .TXT
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleCopyText(`cover_${cnt.id}_${activeLang}`, langMat.coverLetter)
                                      }
                                      className="inline-flex items-center gap-1 text-[11px] text-blue-400 hover:text-blue-300 font-semibold"
                                    >
                                      {copiedKey === `cover_${cnt.id}_${activeLang}` ? (
                                        <>
                                          <Check className="w-3 h-3 text-emerald-400" /> Copiado
                                        </>
                                      ) : (
                                        <>
                                          <Copy className="w-3 h-3" /> Copiar
                                        </>
                                      )}
                                    </button>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Detalhes das Vagas Mapeadas da Empresa */}
      {vacanciesModalCompany && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in"
          onClick={() => setVacanciesModalCompany(null)}
        >
          <div
            className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-900/60">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
                  <Briefcase className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">
                    Vagas Mapeadas - {vacanciesModalCompany.name}
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {vacanciesModalCompany.vacanciesFound?.length || 0} vaga(s) identificada(s) • Repetições idênticas são ignoradas e vagas alteradas são atualizadas.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setVacanciesModalCompany(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 overflow-y-auto space-y-3 flex-1">
              {!vacanciesModalCompany.vacanciesFound || vacanciesModalCompany.vacanciesFound.length === 0 ? (
                <div className="text-center py-8 text-slate-500 text-sm">
                  Nenhuma vaga estruturada encontrada nesta empresa.
                </div>
              ) : (
                vacanciesModalCompany.vacanciesFound.map((vac, idx) => (
                  <div
                    key={vac.id || idx}
                    className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-2 hover:border-slate-700 transition"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="font-bold text-white text-sm">
                            {vac.title}
                          </h4>
                          {vac.isModified ? (
                            <span
                              className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-1"
                              title="Esta vaga foi modificada desde a primeira coleta e atualizada"
                            >
                              <Sparkles className="w-3 h-3 text-amber-400" />
                              Modificada / Atualizada
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                              Ativa / Original
                            </span>
                          )}
                        </div>
                        {vac.modificationDetails && (
                          <div className="text-[11px] text-amber-400/90 font-medium">
                            Alterações: {vac.modificationDetails}
                          </div>
                        )}
                        {vac.description && (
                          <p className="text-xs text-slate-400 line-clamp-2 mt-1">
                            {vac.description}
                          </p>
                        )}
                      </div>

                      {vac.url && (
                        <a
                          href={vac.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          data-url={vac.url}
                          title="Abrir link direto da vaga"
                          className="shrink-0 p-2 rounded-lg bg-blue-600/15 border border-blue-500/30 text-blue-400 hover:bg-blue-600 hover:text-white transition flex items-center gap-1 text-xs font-semibold"
                        >
                          Acessar Vaga <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>

                    {vac.updatedAt && (
                      <div className="flex items-center gap-2 text-[10px] text-slate-500 font-mono pt-1 border-t border-slate-900">
                        <Clock className="w-3 h-3" />
                        <span>Última verificação: {new Date(vac.updatedAt).toLocaleString('pt-BR')}</span>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-800 flex items-center justify-between bg-slate-900/60">
              <span className="text-[11px] text-slate-400">
                Total de vagas mapeadas: {vacanciesModalCompany.vacanciesFound?.length || 0}
              </span>
              <button
                type="button"
                onClick={() => setVacanciesModalCompany(null)}
                className="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold transition"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
