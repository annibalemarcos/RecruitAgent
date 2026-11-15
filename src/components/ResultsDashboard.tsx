import React, { useState, useMemo, useEffect } from 'react';
import { resolveDefaultViewLanguage } from '../utils/viewLanguage.js';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts';
import {
  SessionState,
  ContactClassification,
  RecruitmentContact,
  CompanyItem,
  SingleLanguageMaterial,
  Vacancy,
} from '../types/index.js';
import {
  PieChart as PieIcon,
  TrendingUp,
  BarChart3,
  CheckCircle2,
  FileText,
  Briefcase,
  Users,
  ShieldCheck,
  Building2,
  Mail,
  MessageSquare,
  Copy,
  Check,
  Download,
  ExternalLink,
  Sparkles,
  Search,
  Filter,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Bot,
  Zap,
  XCircle,
  X,
  Clock,
  Send,
  AlertCircle,
  Trash2,
  CheckSquare,
  Square,
  Archive,
  Loader2,
} from 'lucide-react';
import { OutreachStatus } from '../types/index.js';
import { onMiddleClickHandler } from '../utils/openLink.js';
import { exportMaterialsAsTxt, exportMaterialsAsZip } from '../utils/exportMaterials.js';

interface ResultsDashboardProps {
  session: SessionState;
  onOpenMaterialModal?: (contact: RecruitmentContact, company: CompanyItem) => void;
  onNavigateToTracking?: () => void;
  onNavigateToExport?: () => void;
}

// Se você usa várias contas Google no navegador, coloque aqui o e-mail que deve enviar
// (ex.: 'seuemail@gmail.com'). Vazio = conta padrão do navegador.
const GMAIL_ACCOUNT = '';

/**
 * Monta o link de composição do Gmail já preenchido (destinatário, assunto e corpo).
 * Não envia nada: abre o rascunho e você clica em "Enviar" manualmente.
 */
const buildGmailComposeUrl = (to: string, subject: string, body: string): string => {
  const params = new URLSearchParams({
    view: 'cm',
    fs: '1',
    to,
    su: subject,
    body,
  });
  if (GMAIL_ACCOUNT) params.set('authuser', GMAIL_ACCOUNT);
  // URLSearchParams usa "+" para espaço; o Gmail espera %20
  return `https://mail.google.com/mail/?${params.toString().replace(/\+/g, '%20')}`;
};

/**
 * Abre o rascunho do Gmail em nova aba. Retorna false se o navegador bloqueou o pop-up.
 * Obs.: não usa "noopener" de propósito, pois com ele window.open sempre retorna null
 * e não dá para saber se a aba abriu ou foi bloqueada.
 */
const openGmailCompose = (to: string, subject: string, body: string): boolean => {
  const w = window.open(buildGmailComposeUrl(to, subject, body), '_blank');
  if (!w) return false;
  try {
    w.opener = null;
  } catch {
    /* ignore */
  }
  return true;
};

type MaterialItem = { company: CompanyItem; contact: RecruitmentContact };

interface CompanyGroup {
  company: CompanyItem;
  contacts: MaterialItem[]; // visiveis (busca/filtros), ordenados por relevancia
  main: MaterialItem[]; // recrutamento confirmado / possivel (ou o melhor, se nao houver)
  low: MaterialItem[]; // contato geral / outra finalidade
  best: MaterialItem;
  stats: {
    total: number;
    pending: number;
    contacted: number;
    discarded: number;
    byClass: Record<ContactClassification, number>;
  };
}

// Menor numero = mais relevante
const CLASSIFICATION_RANK: Record<ContactClassification, number> = {
  'Recrutamento confirmado': 0,
  'Possível recrutamento': 1,
  'Contato geral': 2,
  'Outra finalidade': 3,
};

const CLASSIFICATION_SHORT: Record<ContactClassification, string> = {
  'Recrutamento confirmado': 'confirmado',
  'Possível recrutamento': 'possível',
  'Contato geral': 'geral',
  'Outra finalidade': 'outra finalidade',
};

const CLASSIFICATION_COLORS: Record<ContactClassification, string> = {
  'Recrutamento confirmado': '#10b981', // Emerald-500
  'Possível recrutamento': '#f59e0b', // Amber-500
  'Contato geral': '#3b82f6', // Blue-500
  'Outra finalidade': '#f43f5e', // Rose-500
};

export const ResultsDashboard: React.FC<ResultsDashboardProps> = ({
  session,
  onOpenMaterialModal,
  onNavigateToTracking,
  onNavigateToExport,
}) => {
  const companies = session.companies;

  // UI state for generated content section
  const [searchQuery, setSearchQuery] = useState<string>('');
  // Língua Padrão (Configurações → Língua Padrão) define o "Visualizar" inicial.
  const defaultViewLanguage = resolveDefaultViewLanguage(session.settings, session.profile);
  const [langPreference, setLangPreference] = useState<'pt' | 'en' | 'both'>(defaultViewLanguage);
  useEffect(() => {
    setLangPreference(defaultViewLanguage);
  }, [defaultViewLanguage]);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [showCharts, setShowCharts] = useState<boolean>(true);
  const [activeTabPerCard, setActiveTabPerCard] = useState<Record<string, 'cold' | 'short' | 'cover' | 'all'>>({});
  const [filterCompany, setFilterCompany] = useState<string>('all');
  // Filtro por prefixo do e-mail (parte antes do @) e por vaga
  const [filterEmailPrefix, setFilterEmailPrefix] = useState<string>('all');
  const [filterJob, setFilterJob] = useState<string>('all'); // 'all' | 'spontaneous' | `${companyId}::${titulo}`
  const [profilesMenuOpen, setProfilesMenuOpen] = useState<boolean>(false);
  const [filterOutreachStatus, setFilterOutreachStatus] = useState<
    'all' | 'pending' | 'contacted' | 'discarded'
  >('all');

  // Vacancy management modal state
  const [isVacanciesModalOpen, setIsVacanciesModalOpen] = useState<boolean>(false);
  const [vacancyFilterType, setVacancyFilterType] = useState<'all' | 'modified' | 'original'>('all');
  const [vacancySearch, setVacancySearch] = useState<string>('');

  // Multi-selection state for bulk actions
  const [selectedContactIds, setSelectedContactIds] = useState<Set<string>>(new Set());
  const [isBulkOperating, setIsBulkOperating] = useState<boolean>(false);

  // CRM tracking overrides: contact.id -> status & details
  const [statusOverrides, setStatusOverrides] = useState<
    Record<string, { status: OutreachStatus; contactedAt?: string; discardedAt?: string; discardReason?: string }>
  >({});
  const [notificationToast, setNotificationToast] = useState<{
    type: 'success' | 'info' | 'warn';
    message: string;
  } | null>(null);

  // Accordion state: map of contact.id -> boolean (open/closed)
  const [openCardIds, setOpenCardIds] = useState<Record<string, boolean>>({});

  // Agrupamento por empresa
  const [openCompanyIds, setOpenCompanyIds] = useState<Record<string, boolean>>({});
  // Mostrar contatos de baixa relevancia (geral / outra finalidade) sem precisar clicar em "+N outros"
  const [showLowRelevance, setShowLowRelevance] = useState<boolean>(false);
  const [lowOpenByCompany, setLowOpenByCompany] = useState<Record<string, boolean>>({});
  // Contatos de baixa relevancia que o usuario abriu como card completo (em vez da linha compacta)
  const [fullCardIds, setFullCardIds] = useState<Record<string, boolean>>({});

  const isCardOpen = (id: string, index: number) => {
    if (openCardIds[id] !== undefined) {
      return openCardIds[id];
    }
    // Padrao: cartoes de contato recolhidos (a lista agora e agrupada por empresa)
    void index;
    return false;
  };

  const toggleCard = (id: string, index: number) => {
    const current = isCardOpen(id, index);
    setOpenCardIds((prev) => ({
      ...prev,
      [id]: !current,
    }));
  };

  // Expandir/Recolher Todos agora abrem e fecham EMPRESAS (padrao: recolhido)
  const expandAllCards = () => {
    const updated: Record<string, boolean> = {};
    companyGroups.forEach((g) => {
      updated[g.company.id] = true;
    });
    setOpenCompanyIds(updated);
  };

  const collapseAllCards = () => {
    setOpenCompanyIds({});
    setOpenCardIds({});
    setFullCardIds({});
  };

  const handleMarkContacted = async (c: RecruitmentContact, comp: CompanyItem) => {
    const now = new Date().toISOString();
    setStatusOverrides((prev) => ({
      ...prev,
      [c.id]: { status: 'contacted', contactedAt: now },
    }));

    try {
      await fetch('/api/tracking/upsert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: session.sessionId,
          contactRecord: {
            id: c.id,
            sessionId: session.sessionId,
            companyId: comp.id,
            companyName: comp.name,
            site: comp.normalizedUrl,
            email: c.email,
            sourceUrl: c.sourceUrl,
            evidenceSnippet: c.evidenceSnippet,
            extractionMethod: c.extractionMethod,
            collectedAt: c.collectedAt,
            classification: c.classification,
            associatedJobTitle: c.associatedJob?.title,
            associatedJobUrl: c.associatedJob?.url,
            status: 'contacted',
            contactedAt: now,
            materials: c.materials,
            updatedAt: now,
          },
        }),
      });
    } catch (err) {
      console.error('Error tracking contact:', err);
    }

    // Discreet in-place toast feedback - stays on the page so user can send other emails!
    setNotificationToast({
      type: 'success',
      message: `✓ Contato com ${c.email} marcado como Contactado. Você continua nesta página para enviar os demais!`,
    });
    setTimeout(() => {
      setNotificationToast(null);
    }, 2800);
  };

  // Toggle selection for bulk actions
  const toggleSelectContact = (id: string) => {
    setSelectedContactIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Select or Deselect all currently filtered contacts
  const handleSelectAllFiltered = () => {
    if (filteredMaterials.length === 0) return;
    const allFilteredSelected = filteredMaterials.every(({ contact }) => selectedContactIds.has(contact.id));
    if (allFilteredSelected) {
      // Uncheck all filtered
      setSelectedContactIds((prev) => {
        const next = new Set(prev);
        filteredMaterials.forEach(({ contact }) => next.delete(contact.id));
        return next;
      });
    } else {
      // Check all filtered
      setSelectedContactIds((prev) => {
        const next = new Set(prev);
        filteredMaterials.forEach(({ contact }) => next.add(contact.id));
        return next;
      });
    }
  };

  // Direct 1-click discard - NO modal popup, immediate feedback!
  const handleDirectDiscard = async (c: RecruitmentContact, comp: CompanyItem) => {
    const now = new Date().toISOString();
    const reason = 'Descartado pelo usuário';

    setStatusOverrides((prev) => ({
      ...prev,
      [c.id]: { status: 'discarded', discardedAt: now, discardReason: reason },
    }));

    try {
      await fetch('/api/tracking/upsert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: session.sessionId,
          contactRecord: {
            id: c.id,
            sessionId: session.sessionId,
            companyId: comp.id,
            companyName: comp.name,
            site: comp.normalizedUrl,
            email: c.email,
            sourceUrl: c.sourceUrl,
            evidenceSnippet: c.evidenceSnippet,
            extractionMethod: c.extractionMethod,
            collectedAt: c.collectedAt,
            classification: c.classification,
            associatedJobTitle: c.associatedJob?.title,
            associatedJobUrl: c.associatedJob?.url,
            status: 'discarded',
            discardedAt: now,
            discardReason: reason,
            notes: reason,
            materials: c.materials,
            updatedAt: now,
          },
        }),
      });
    } catch (err) {
      console.error('Error discarding contact:', err);
    }

    setNotificationToast({
      type: 'info',
      message: `✕ Contato com ${c.email} descartado.`,
    });
    setTimeout(() => {
      setNotificationToast(null);
    }, 2500);
  };

  // Abre um rascunho do Gmail para cada contato selecionado (você revisa e envia manualmente)
  const BULK_GMAIL_CONFIRM_THRESHOLD = 8;
  const handleBulkOpenGmail = () => {
    if (langPreference === 'both') {
      alert('Escolha PT ou EN no seletor de idioma antes de abrir em massa (o modo "Ambos" não define qual idioma usar).');
      return;
    }
    const lang = langPreference;
    const ready: typeof generatedItems = [];
    let skipped = 0;
    for (const item of generatedItems) {
      const { contact } = item;
      if (!selectedContactIds.has(contact.id)) continue;
      const status = statusOverrides[contact.id]?.status ?? contact.outreachStatus ?? 'pending';
      // Ignora quem já foi contactado/descartado etc. para não mandar e-mail duplicado
      if (!contact.materials || !contact.email || status !== 'pending') {
        skipped++;
      } else {
        ready.push(item);
      }
    }
    if (ready.length === 0) {
      alert('Nenhum dos selecionados está pendente com e-mail válido (já contactados/descartados são ignorados).');
      return;
    }
    if (skipped > 0 || ready.length > BULK_GMAIL_CONFIRM_THRESHOLD) {
      const note = skipped > 0 ? `\n(${skipped} ignorado(s): já contactados/descartados ou sem e-mail)` : '';
      if (!window.confirm(`Abrir ${ready.length} abas do Gmail (${lang.toUpperCase()})?${note}`)) return;
    }
    let opened = 0;
    let blocked = 0;
    for (const { contact } of ready) {
      const m = getMaterialForLang(contact, lang);
      if (openGmailCompose(contact.email, m.subject, m.coldEmail)) opened++;
      else blocked++;
    }
    if (blocked > 0) {
      alert(
        `${opened} aba(s) abriram e ${blocked} foram bloqueadas pelo navegador.\n` +
          'Permita pop-ups para este site (ícone na barra de endereço) e clique de novo. ' +
          'Feche antes os rascunhos que já abriram para não duplicar.'
      );
    }
  };

  // Bulk Discard all selected contacts with 1 click
  const handleBulkDiscard = async () => {
    if (selectedContactIds.size === 0) return;
    setIsBulkOperating(true);

    const now = new Date().toISOString();
    const idsToDiscard = Array.from(selectedContactIds);
    const reason = 'Descarte em lote pelo usuário';

    const itemsToUpdate = generatedItems.filter(({ contact }) => selectedContactIds.has(contact.id));

    setStatusOverrides((prev) => {
      const next = { ...prev };
      for (const id of idsToDiscard) {
        next[id] = { status: 'discarded', discardedAt: now, discardReason: reason };
      }
      return next;
    });

    try {
      await Promise.all(
        itemsToUpdate.map(({ contact: c, company: comp }) =>
          fetch('/api/tracking/upsert', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sessionId: session.sessionId,
              contactRecord: {
                id: c.id,
                sessionId: session.sessionId,
                companyId: comp.id,
                companyName: comp.name,
                site: comp.normalizedUrl,
                email: c.email,
            sourceUrl: c.sourceUrl,
            evidenceSnippet: c.evidenceSnippet,
            extractionMethod: c.extractionMethod,
            collectedAt: c.collectedAt,
                classification: c.classification,
                associatedJobTitle: c.associatedJob?.title,
                associatedJobUrl: c.associatedJob?.url,
                status: 'discarded',
                discardedAt: now,
                discardReason: reason,
                notes: reason,
                materials: c.materials,
                updatedAt: now,
              },
            }),
          })
        )
      );
    } catch (err) {
      console.error('Error during bulk discard:', err);
    } finally {
      setIsBulkOperating(false);
      setSelectedContactIds(new Set());
      setNotificationToast({
        type: 'info',
        message: `✕ ${idsToDiscard.length} contato(s) descartado(s) com sucesso!`,
      });
      setTimeout(() => {
        setNotificationToast(null);
      }, 2800);
    }
  };

  // Bulk Mark as Contacted for all selected contacts
  const handleBulkMarkContacted = async () => {
    if (selectedContactIds.size === 0) return;
    setIsBulkOperating(true);

    const now = new Date().toISOString();
    const idsToMark = Array.from(selectedContactIds);
    const itemsToUpdate = generatedItems.filter(({ contact }) => selectedContactIds.has(contact.id));

    setStatusOverrides((prev) => {
      const next = { ...prev };
      for (const id of idsToMark) {
        next[id] = { status: 'contacted', contactedAt: now };
      }
      return next;
    });

    try {
      await Promise.all(
        itemsToUpdate.map(({ contact: c, company: comp }) =>
          fetch('/api/tracking/upsert', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sessionId: session.sessionId,
              contactRecord: {
                id: c.id,
                sessionId: session.sessionId,
                companyId: comp.id,
                companyName: comp.name,
                site: comp.normalizedUrl,
                email: c.email,
            sourceUrl: c.sourceUrl,
            evidenceSnippet: c.evidenceSnippet,
            extractionMethod: c.extractionMethod,
            collectedAt: c.collectedAt,
                classification: c.classification,
                associatedJobTitle: c.associatedJob?.title,
                associatedJobUrl: c.associatedJob?.url,
                status: 'contacted',
                contactedAt: now,
                materials: c.materials,
                updatedAt: now,
              },
            }),
          })
        )
      );
    } catch (err) {
      console.error('Error during bulk mark contacted:', err);
    } finally {
      setIsBulkOperating(false);
      setSelectedContactIds(new Set());
      setNotificationToast({
        type: 'success',
        message: `✓ ${idsToMark.length} contato(s) marcado(s) como Contactados!`,
      });
      setTimeout(() => {
        setNotificationToast(null);
      }, 2800);
    }
  };

  const handleRevertStatus = async (c: RecruitmentContact, comp: CompanyItem) => {
    setStatusOverrides((prev) => ({
      ...prev,
      [c.id]: { status: 'pending' },
    }));

    try {
      await fetch('/api/tracking/update-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: c.id,
          status: 'pending',
          sessionId: session.sessionId,
        }),
      });
    } catch (err) {
      console.error('Error reverting status:', err);
    }

    setNotificationToast({
      type: 'info',
      message: `Status de ${c.email} revertido para Pendente.`,
    });
    setTimeout(() => {
      setNotificationToast(null);
    }, 2200);
  };

  // Copy helper
  const handleCopy = (key: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  // Download .txt helper
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

  // Collect all generated materials across all companies
  const generatedItems = useMemo(() => {
    const list: { company: CompanyItem; contact: RecruitmentContact }[] = [];
    for (const comp of companies) {
      for (const cnt of comp.contacts) {
        if (cnt.materialsGenerated && cnt.materials) {
          list.push({ company: comp, contact: cnt });
        }
      }
    }
    return list;
  }, [companies]);

  // Count items by outreach status
  const pendingCount = useMemo(() => {
    return generatedItems.filter(({ contact }) => {
      const override = statusOverrides[contact.id];
      const status = override ? override.status : contact.outreachStatus || 'pending';
      return status === 'pending';
    }).length;
  }, [generatedItems, statusOverrides]);

  const contactedCount = useMemo(() => {
    return generatedItems.filter(({ contact }) => {
      const override = statusOverrides[contact.id];
      const status = override ? override.status : contact.outreachStatus || 'pending';
      return status === 'contacted';
    }).length;
  }, [generatedItems, statusOverrides]);

  const discardedCount = useMemo(() => {
    return generatedItems.filter(({ contact }) => {
      const override = statusOverrides[contact.id];
      const status = override ? override.status : contact.outreachStatus || 'pending';
      return status === 'discarded';
    }).length;
  }, [generatedItems, statusOverrides]);

  // Filtered materials
  const filteredMaterials = useMemo(() => {
    return generatedItems.filter(({ company, contact }) => {
      const q = searchQuery.toLowerCase().trim();
      const compName = company.name.toLowerCase();
      const email = contact.email.toLowerCase();
      const job = (contact.associatedJob?.title || '').toLowerCase();
      const matchesSearch = !q || compName.includes(q) || email.includes(q) || job.includes(q);

      const matchesCompany = filterCompany === 'all' || company.name === filterCompany;

      const matchesEmailPrefix =
        filterEmailPrefix === 'all' || contact.email.split('@')[0].toLowerCase() === filterEmailPrefix;

      const matchesJob =
        filterJob === 'all' ||
        (filterJob === 'spontaneous'
          ? !contact.associatedJob?.title
          : `${company.id}::${contact.associatedJob?.title || ''}` === filterJob);

      const override = statusOverrides[contact.id];
      const currentStatus = override ? override.status : contact.outreachStatus || 'pending';
      const matchesStatus =
        filterOutreachStatus === 'all' ||
        currentStatus === filterOutreachStatus;

      return matchesSearch && matchesCompany && matchesEmailPrefix && matchesJob && matchesStatus;
    });
  }, [generatedItems, searchQuery, filterCompany, filterEmailPrefix, filterJob, filterOutreachStatus, statusOverrides]);

  // Opcoes dos dropdowns (contagens sobre todos os contatos com material)
  const emailPrefixOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const { contact } of generatedItems) {
      const p = contact.email.split('@')[0].toLowerCase();
      counts.set(p, (counts.get(p) || 0) + 1);
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([prefix, count]) => ({ prefix, count }));
  }, [generatedItems]);

  const jobFilterOptions = useMemo(() => {
    let spontaneous = 0;
    const byCompany = new Map<string, { companyName: string; jobs: Map<string, { title: string; count: number }> }>();
    for (const { company, contact } of generatedItems) {
      const title = contact.associatedJob?.title;
      if (!title) {
        spontaneous++;
        continue;
      }
      let g = byCompany.get(company.id);
      if (!g) {
        g = { companyName: company.name, jobs: new Map() };
        byCompany.set(company.id, g);
      }
      const j = g.jobs.get(title) || { title, count: 0 };
      j.count++;
      g.jobs.set(title, j);
    }
    const groups = Array.from(byCompany.entries())
      .map(([companyId, g]) => ({
        companyId,
        companyName: g.companyName,
        jobs: Array.from(g.jobs.values()).sort((a, b) => a.title.localeCompare(b.title)),
      }))
      .sort((a, b) => a.companyName.localeCompare(b.companyName));
    return { spontaneous, groups };
  }, [generatedItems]);

  const hasActiveFilters = filterEmailPrefix !== 'all' || filterJob !== 'all';

  // ----- Agrupamento por empresa -------------------------------------------------
  const getStatusOf = (c: RecruitmentContact): OutreachStatus =>
    (statusOverrides[c.id]?.status ?? c.outreachStatus ?? 'pending') as OutreachStatus;

  // E-mails da mesma empresa que ja foram contactados (aviso anti-duplicidade)
  const getContactedSiblings = (companyId: string, exceptContactId: string): string[] =>
    generatedItems
      .filter(({ company, contact }) => {
        if (company.id !== companyId || contact.id === exceptContactId) return false;
        const st = getStatusOf(contact);
        return st === 'contacted' || st === 'interview' || st === 'offer';
      })
      .map(({ contact }) => contact.email);

  const companyGroups: CompanyGroup[] = useMemo(() => {
    // estatisticas da empresa consideram TODOS os contatos com material (nao so os filtrados)
    const statsByCompany = new Map<string, CompanyGroup['stats']>();
    for (const { company, contact } of generatedItems) {
      let st = statsByCompany.get(company.id);
      if (!st) {
        st = {
          total: 0,
          pending: 0,
          contacted: 0,
          discarded: 0,
          byClass: {
            'Recrutamento confirmado': 0,
            'Possível recrutamento': 0,
            'Contato geral': 0,
            'Outra finalidade': 0,
          },
        };
        statsByCompany.set(company.id, st);
      }
      st.total++;
      if (st.byClass[contact.classification] !== undefined) st.byClass[contact.classification]++;
      const status = (statusOverrides[contact.id]?.status ?? contact.outreachStatus ?? 'pending') as OutreachStatus;
      if (status === 'discarded') st.discarded++;
      else if (status === 'pending') st.pending++;
      else st.contacted++; // contacted / interview / offer / rejected
    }

    const order: string[] = [];
    const byCompany = new Map<string, MaterialItem[]>();
    for (const item of filteredMaterials) {
      const id = item.company.id;
      if (!byCompany.has(id)) {
        byCompany.set(id, []);
        order.push(id);
      }
      byCompany.get(id)!.push(item);
    }

    return order.map((id) => {
      const sorted = [...byCompany.get(id)!].sort(
        (a, b) =>
          (CLASSIFICATION_RANK[a.contact.classification] ?? 9) -
          (CLASSIFICATION_RANK[b.contact.classification] ?? 9)
      );
      let main = sorted.filter((i) => (CLASSIFICATION_RANK[i.contact.classification] ?? 9) <= 1);
      let low = sorted.filter((i) => (CLASSIFICATION_RANK[i.contact.classification] ?? 9) > 1);
      if (main.length === 0) {
        // Sem recrutamento: o melhor contato disponivel vira o principal
        main = [sorted[0]];
        low = sorted.slice(1);
      }
      // Melhor contato: o primeiro ainda pendente (se houver), senao o primeiro da lista
      const best =
        sorted.find((i) => (statusOverrides[i.contact.id]?.status ?? i.contact.outreachStatus ?? 'pending') === 'pending') ||
        sorted[0];
      return {
        company: sorted[0].company,
        contacts: sorted,
        main,
        low,
        best,
        stats: statsByCompany.get(id)!,
      };
    });
  }, [generatedItems, filteredMaterials, statusOverrides]);

  const toggleCompany = (id: string) =>
    setOpenCompanyIds((prev) => ({ ...prev, [id]: !prev[id] }));

  const toggleSelectCompany = (group: CompanyGroup) => {
    const allSelected = group.contacts.every(({ contact }) => selectedContactIds.has(contact.id));
    setSelectedContactIds((prev) => {
      const next = new Set(prev);
      group.contacts.forEach(({ contact }) => (allSelected ? next.delete(contact.id) : next.add(contact.id)));
      return next;
    });
  };

  // Descarte em massa generico (usado pelos botoes "Descartar todos de 'Outra finalidade'")
  const discardMany = async (items: MaterialItem[], reason: string) => {
    if (items.length === 0) return;
    setIsBulkOperating(true);
    const now = new Date().toISOString();

    setStatusOverrides((prev) => {
      const next = { ...prev };
      for (const { contact } of items) {
        next[contact.id] = { status: 'discarded', discardedAt: now, discardReason: reason };
      }
      return next;
    });

    try {
      await Promise.all(
        items.map(({ contact: c, company: comp }) =>
          fetch('/api/tracking/upsert', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sessionId: session.sessionId,
              contactRecord: {
                id: c.id,
                sessionId: session.sessionId,
                companyId: comp.id,
                companyName: comp.name,
                site: comp.normalizedUrl,
                email: c.email,
                sourceUrl: c.sourceUrl,
                evidenceSnippet: c.evidenceSnippet,
                extractionMethod: c.extractionMethod,
                collectedAt: c.collectedAt,
                classification: c.classification,
                associatedJobTitle: c.associatedJob?.title,
                associatedJobUrl: c.associatedJob?.url,
                status: 'discarded',
                discardedAt: now,
                discardReason: reason,
                notes: reason,
                materials: c.materials,
                updatedAt: now,
              },
            }),
          })
        )
      );
    } catch (err) {
      console.error('Error during bulk discard:', err);
    } finally {
      setIsBulkOperating(false);
      setSelectedContactIds((prev) => {
        const next = new Set(prev);
        items.forEach(({ contact }) => next.delete(contact.id));
        return next;
      });
      setNotificationToast({
        type: 'info',
        message: `✕ ${items.length} contato(s) descartado(s).`,
      });
      setTimeout(() => setNotificationToast(null), 2800);
    }
  };

  const pendingOutraFinalidade = filteredMaterials.filter(
    ({ contact }) => contact.classification === 'Outra finalidade' && getStatusOf(contact) === 'pending'
  );

  const handleDiscardAllOutraFinalidade = () => {
    if (pendingOutraFinalidade.length === 0) return;
    const ok = window.confirm(
      `Descartar ${pendingOutraFinalidade.length} contato(s) pendente(s) de "Outra finalidade" (legal@, abuse@, bugs@...)?\n\nDá pra reativar depois, um por um.`
    );
    if (!ok) return;
    discardMany(pendingOutraFinalidade, 'Descartado em massa: Outra finalidade');
  };

  // 1. Contatos por Classificação
  const classificationCounts: Record<ContactClassification, number> = {
    'Recrutamento confirmado': 0,
    'Possível recrutamento': 0,
    'Contato geral': 0,
    'Outra finalidade': 0,
  };

  let totalContacts = 0;
  let totalMaterialsGenerated = 0;
  let confirmedOrPossibleContacts = 0;
  let totalVacanciesFound = 0;
  let modifiedVacanciesCount = 0;
  const allVacanciesList: { vacancy: Vacancy; company: CompanyItem }[] = [];

  for (const comp of companies) {
    if (comp.vacanciesFound) {
      totalVacanciesFound += comp.vacanciesFound.length;
      for (const v of comp.vacanciesFound) {
        if (v.isModified) {
          modifiedVacanciesCount++;
        }
        allVacanciesList.push({ vacancy: v, company: comp });
      }
    }
    for (const cnt of comp.contacts) {
      totalContacts++;
      if (classificationCounts[cnt.classification] !== undefined) {
        classificationCounts[cnt.classification]++;
      }
      if (
        cnt.classification === 'Recrutamento confirmado' ||
        cnt.classification === 'Possível recrutamento'
      ) {
        confirmedOrPossibleContacts++;
      }
      if (cnt.materialsGenerated && cnt.materials) {
        totalMaterialsGenerated++;
      }
    }
  }

  const classificationData = Object.entries(classificationCounts)
    .filter(([_, value]) => value > 0)
    .map(([name, value]) => ({
      name,
      value,
      color: CLASSIFICATION_COLORS[name as ContactClassification] || '#64748b',
    }));

  // 2. Empresas Processadas vs. Pendentes
  const processedCompleted = companies.filter(
    (c) => c.status === 'Concluído' || c.status === 'Concluído parcialmente'
  ).length;
  const processedNoContact = companies.filter(
    (c) => (c.status === 'Sem contato de recrutamento' || c.status === 'Email não encontrado')
  ).length;
  const processedFailed = companies.filter(
    (c) => c.status === 'Erro' || c.status === 'Bloqueado' || c.status === 'Não foi possível verificar a fonte'
  ).length;
  const inProgress = companies.filter(
    (c) => c.status === 'Pesquisando' || c.status === 'Gerando materiais'
  ).length;
  const pending = companies.filter(
    (c) => c.status === 'Pendente' || c.status === 'Cancelado'
  ).length;

  const totalProcessed = processedCompleted + processedNoContact + processedFailed;
  const totalCompanies = companies.length;

  const companyStatusData = [
    {
      categoria: 'Concluídas',
      quantidade: processedCompleted,
      fill: '#10b981',
    },
    {
      categoria: 'Sem Contato Direto',
      quantidade: processedNoContact,
      fill: '#f59e0b',
    },
    {
      categoria: 'Erros/Bloqueios',
      quantidade: processedFailed,
      fill: '#f43f5e',
    },
    {
      categoria: 'Em Andamento',
      quantidade: inProgress,
      fill: '#8b5cf6',
    },
    {
      categoria: 'Pendentes',
      quantidade: pending,
      fill: '#475569',
    },
  ].filter((item) => item.quantidade > 0);

  // 3. Taxa de Sucesso na Geração de Materiais
  const eligibleTarget = Math.max(
    confirmedOrPossibleContacts,
    totalMaterialsGenerated,
    1
  );
  const successRate = Math.min(
    100,
    Math.round((totalMaterialsGenerated / eligibleTarget) * 100)
  );

  // Helper to extract language material cleanly
  const getMaterialForLang = (cnt: RecruitmentContact, lang: 'pt' | 'en'): SingleLanguageMaterial => {
    const mat = cnt.materials!;
    if (lang === 'pt') {
      if (mat.pt) return mat.pt;
      return {
        subject: mat.subject,
        coldEmail: mat.coldEmail,
        shortMessage: mat.shortMessage,
        coverLetter: mat.coverLetter,
        reviewNotes: mat.reviewNotes,
        wordCounts: mat.wordCounts,
      };
    } else {
      if (mat.en) return mat.en;
      return {
        subject: mat.subject,
        coldEmail: mat.coldEmail,
        shortMessage: mat.shortMessage,
        coverLetter: mat.coverLetter,
        reviewNotes: mat.reviewNotes,
        wordCounts: mat.wordCounts,
      };
    }
  };

  const [isExporting, setIsExporting] = useState<boolean>(false);

  // Helper to resolve which items to export:
  // - If scope is 'selected', exports selected items (or falls back to filtered if 0 selected)
  // - If scope is 'filtered', exports all currently filtered items
  // - If scope is 'all', exports all generated items
  const getExportItems = (scope: 'selected' | 'filtered' | 'all' = 'selected') => {
    if (scope === 'all') {
      return {
        items: generatedItems,
        label: `Todas as ${generatedItems.length} candidaturas`,
        prefix: 'candidaturas_todas',
      };
    }
    if (scope === 'selected' && selectedContactIds.size > 0) {
      const selected = generatedItems.filter(({ contact }) => selectedContactIds.has(contact.id));
      return {
        items: selected,
        label: `${selected.length} candidatura(s) selecionada(s)`,
        prefix: `candidaturas_selecionadas_${selected.length}`,
      };
    }
    // Default or 'filtered'
    return {
      items: filteredMaterials,
      label: `${filteredMaterials.length} candidatura(s) filtrada(s)`,
      prefix: `candidaturas_filtradas_${filteredMaterials.length}`,
    };
  };

  const handleExportTxt = (scope: 'selected' | 'filtered' | 'all' = 'selected') => {
    const { items, label, prefix } = getExportItems(scope);
    if (items.length === 0) {
      setNotificationToast({
        type: 'warn',
        message: 'Nenhuma candidatura encontrada para exportar.',
      });
      setTimeout(() => setNotificationToast(null), 2500);
      return;
    }

    try {
      exportMaterialsAsTxt(items, {
        profileName: session.profile.name || 'Candidato',
        lang: langPreference,
        scopeLabel: label,
        filenamePrefix: prefix,
      });

      setNotificationToast({
        type: 'success',
        message: `✓ ${items.length} candidatura(s) exportada(s) em .TXT com sucesso!`,
      });
      setTimeout(() => setNotificationToast(null), 2800);
    } catch (err) {
      console.error('Error exporting TXT:', err);
      setNotificationToast({
        type: 'warn',
        message: 'Erro ao gerar arquivo TXT.',
      });
      setTimeout(() => setNotificationToast(null), 2500);
    }
  };

  const handleExportZip = async (scope: 'selected' | 'filtered' | 'all' = 'selected') => {
    const { items, label, prefix } = getExportItems(scope);
    if (items.length === 0) {
      setNotificationToast({
        type: 'warn',
        message: 'Nenhuma candidatura encontrada para exportar.',
      });
      setTimeout(() => setNotificationToast(null), 2500);
      return;
    }

    setIsExporting(true);
    setNotificationToast({
      type: 'info',
      message: `Empacotando ${items.length} candidatura(s) em .ZIP...`,
    });

    try {
      await exportMaterialsAsZip(items, {
        profileName: session.profile.name || 'Candidato',
        lang: langPreference,
        scopeLabel: label,
        filenamePrefix: prefix,
      });

      setNotificationToast({
        type: 'success',
        message: `✓ Pacote ZIP com ${items.length} candidatura(s) baixado com sucesso!`,
      });
      setTimeout(() => setNotificationToast(null), 3000);
    } catch (err) {
      console.error('Error exporting ZIP:', err);
      setNotificationToast({
        type: 'warn',
        message: 'Erro ao gerar arquivo ZIP.',
      });
      setTimeout(() => setNotificationToast(null), 2500);
    } finally {
      setIsExporting(false);
    }
  };

  // Texto completo do pacote (Assunto + Cold Email + Mensagem + Carta) para copiar/exportar
  const makeBundleTextFor = (company: CompanyItem, contact: RecruitmentContact, lang: 'pt' | 'en') => {
    const m = getMaterialForLang(contact, lang);
    return [
      `==================================================`,
      `CANDIDATURA PARA: ${company.name}`,
      `SITE: ${company.normalizedUrl}`,
      `DESTINATÁRIO: ${contact.email}`,
      `IDIOMA: ${lang === 'pt' ? 'PORTUGUÊS (PT-BR)' : 'INGLÊS (EN)'}`,
      `VAGA: ${contact.associatedJob?.title || 'Candidatura Espontânea'}`,
      `ASSUNTO: ${m.subject}`,
      `==================================================`,
      '',
      `---------------- COLD EMAIL (${m.wordCounts.coldEmail} palavras) ----------------`,
      m.coldEmail,
      '',
      `-------------- MENSAGEM CURTA (${m.wordCounts.shortMessage} palavras) --------------`,
      m.shortMessage,
      '',
      `---------- CARTA DE APRESENTAÇÃO (${m.wordCounts.coverLetter} palavras) ----------`,
      m.coverLetter,
      '',
      `NOTAS DE REVISÃO FACTUAL:`,
      m.reviewNotes,
    ].join('\r\n');
  };

  const handleOpenGmail = (c: RecruitmentContact, lang: 'pt' | 'en') => {
    const m = getMaterialForLang(c, lang);
    if (!openGmailCompose(c.email, m.subject, m.coldEmail)) {
      alert('O navegador bloqueou a nova aba. Permita pop-ups para este site e tente de novo.');
    }
  };

  const renderContactCard = ({ company, contact }: MaterialItem, index: number) => {
            const cardId = contact.id;
            const currentTab = activeTabPerCard[cardId] || 'cold';

            const matPt = getMaterialForLang(contact, 'pt');
            const matEn = getMaterialForLang(contact, 'en');

            const isBoth = langPreference === 'both';
            const activeLang = isBoth ? 'pt' : langPreference;
            const activeMat = activeLang === 'pt' ? matPt : matEn;

            const providerBadge =
              contact.materials?.generatedBy === 'openai'
                ? {
                    label: contact.materials.keyUsed || 'ChatGPT (OpenAI)',
                    bg: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25',
                    icon: Bot,
                  }
                : contact.materials?.generatedBy === 'gemini'
                ? {
                    label: contact.materials.keyUsed || 'Gemini AI',
                    bg: 'bg-blue-500/10 text-blue-400 border-blue-500/25',
                    icon: Sparkles,
                  }
                : {
                    label: contact.materials?.keyUsed || 'Motor Factual Determinístico',
                    bg: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/25',
                    icon: ShieldCheck,
                  };

            const ProviderIcon = providerBadge.icon;

            // Full bundle text for copy / export
            const makeBundleText = (lang: 'pt' | 'en') => makeBundleTextFor(company, contact, lang);

            const isOpen = isCardOpen(cardId, index);

            const statusInfo = statusOverrides[contact.id] || {
              status: contact.outreachStatus || 'pending',
              contactedAt: contact.contactedAt,
              discardedAt: contact.discardedAt,
              discardReason: contact.discardReason,
            };
            const currentStatus = statusInfo.status;

            return (
              <div
                key={cardId}
                className={`bg-slate-950/80 rounded-2xl border transition-all duration-200 shadow-md ${
                  currentStatus === 'contacted'
                    ? 'border-emerald-500/80 bg-emerald-950/20 shadow-emerald-950/30'
                    : currentStatus === 'discarded'
                    ? 'border-rose-500/80 bg-rose-950/20 shadow-rose-950/30'
                    : currentStatus === 'interview'
                    ? 'border-blue-500/80 bg-blue-950/20 shadow-blue-950/30'
                    : isOpen
                    ? 'border-slate-700 shadow-blue-950/20'
                    : 'border-slate-800 hover:border-slate-700/80 hover:bg-slate-900/40'
                } ${isOpen ? 'p-5 space-y-4' : 'p-4'}`}
              >
                {/* Card Header (Accordion Clickable Area) */}
                <div
                  onClick={() => toggleCard(cardId, index)}
                  data-url={company.normalizedUrl || company.rawUrl}
                  {...onMiddleClickHandler(company.normalizedUrl || company.rawUrl)}
                  className="cursor-pointer select-none flex flex-col lg:flex-row lg:items-center justify-between gap-3 group"
                >
                  <div className="space-y-1.5 flex-1 pr-2">
                    <div className="flex flex-wrap items-center gap-2">
                      {/* Batch selection checkbox */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleSelectContact(contact.id);
                        }}
                        className={`p-1 rounded-md border transition cursor-pointer flex items-center justify-center shrink-0 ${
                          selectedContactIds.has(contact.id)
                            ? 'bg-rose-500/20 text-rose-300 border-rose-500/60 shadow-sm'
                            : 'bg-slate-900/90 text-slate-500 hover:text-slate-200 border-slate-700/60 hover:border-slate-500'
                        }`}
                        title={
                          selectedContactIds.has(contact.id)
                            ? 'Desmarcar este contato da seleção'
                            : 'Selecionar este contato para descarte em lote'
                        }
                      >
                        {selectedContactIds.has(contact.id) ? (
                          <CheckSquare className="w-4 h-4 text-rose-400" />
                        ) : (
                          <Square className="w-4 h-4" />
                        )}
                      </button>

                      <span
                        className="text-sm font-bold text-white flex items-center gap-1.5 group-hover:text-blue-300 transition"
                        data-url={company.normalizedUrl || company.rawUrl}
                        {...onMiddleClickHandler(company.normalizedUrl || company.rawUrl)}
                        title="Botão do meio: abrir página em nova aba"
                      >
                        <Building2 className="w-4 h-4 text-blue-400 shrink-0" />
                        {company.name}
                      </span>

                      {company.normalizedUrl && (
                        <a
                          href={company.normalizedUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          data-url={company.normalizedUrl}
                          {...onMiddleClickHandler(company.normalizedUrl)}
                          className="text-[11px] text-slate-400 hover:text-blue-400 flex items-center gap-0.5 truncate max-w-xs"
                          title="Clique normal ou com botão do meio para abrir em nova aba"
                        >
                          <ExternalLink className="w-3 h-3" />
                          {company.normalizedUrl.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                        </a>
                      )}

                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold border ${providerBadge.bg}`}
                      >
                        <ProviderIcon className="w-3 h-3" />
                        {providerBadge.label}
                      </span>

                      {/* Outreach Status Badges */}
                      {currentStatus === 'contacted' && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                          <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                          Contactado {statusInfo.contactedAt ? `(${new Date(statusInfo.contactedAt).toLocaleDateString('pt-BR')})` : ''}
                        </span>
                      )}

                      {currentStatus === 'discarded' && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/15 text-rose-400 border border-rose-500/30">
                          <XCircle className="w-3 h-3 text-rose-400" />
                          Descartado: {statusInfo.discardReason || 'Sem motivo'}
                        </span>
                      )}

                      {currentStatus === 'interview' && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/15 text-blue-400 border border-blue-500/30">
                          ★ Entrevista Agendada
                        </span>
                      )}

                      {currentStatus === 'pending' && (() => {
                        const siblings = getContactedSiblings(company.id, contact.id);
                        if (siblings.length === 0) return null;
                        return (
                          <span
                            className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30"
                            title={`Já contactado nesta empresa: ${siblings.join(', ')}`}
                          >
                            <AlertCircle className="w-3 h-3 text-amber-400" />
                            Você já contatou essa empresa ({siblings[0]})
                          </span>
                        );
                      })()}
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-300">
                      <a
                        href={`mailto:${contact.email}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        data-url={`mailto:${contact.email}`}
                        {...onMiddleClickHandler(`mailto:${contact.email}`)}
                        className="font-mono text-cyan-300 hover:text-cyan-200 flex items-center gap-1 font-semibold"
                        title="Clique ou botão do meio para abrir e-mail"
                      >
                        <Mail className="w-3.5 h-3.5 text-cyan-400" />
                        {contact.email}
                      </a>
                      <button type="button"
                        onClick={(event) => { event.stopPropagation(); handleCopy(`recipient_${cardId}`, contact.email); }}
                        title="Copiar endereço de email" aria-label={`Copiar endereço de email ${contact.email}`}
                        className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-cyan-300 bg-slate-800 hover:bg-slate-700">
                        {copiedKey === `recipient_${cardId}` ? <><Check className="w-3 h-3" /> Copiado!</> : <><Copy className="w-3 h-3" /> Copiar email</>}
                      </button>
                      <span>•</span>
                      <span className="text-slate-400">
                        {contact.associatedJob?.title ? (
                          contact.associatedJob.url ? (
                            <a
                              href={contact.associatedJob.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              data-url={contact.associatedJob.url}
                              {...onMiddleClickHandler(contact.associatedJob.url)}
                              className="text-emerald-400 hover:text-emerald-300 font-semibold underline decoration-emerald-500/40 hover:decoration-emerald-400 inline-flex items-center gap-1"
                              title="Clique normal ou botão do meio para abrir vaga em nova aba"
                            >
                              <span>Vaga: {contact.associatedJob.title}</span>
                              <ExternalLink className="w-3 h-3 text-emerald-400" />
                            </a>
                          ) : (
                            <span className="text-emerald-400 font-semibold">
                              Vaga: {contact.associatedJob.title}
                            </span>
                          )
                        ) : (
                          <span className="text-slate-400 italic">Candidatura Espontânea</span>
                        )}
                      </span>
                      <span>•</span>
                      <span className="text-[11px] text-slate-500">
                        {contact.classification}
                      </span>
                    </div>

                    {/* Collapsed Preview Hint */}
                    {!isOpen && (
                      <div className="pt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
                        <span className="font-bold text-slate-300 shrink-0">Assunto:</span>
                        <span className="truncate max-w-md text-slate-300 italic font-mono text-[11px]">
                          {activeMat.subject}
                        </span>
                        <span className="text-slate-600 hidden sm:inline">•</span>
                        <span className="text-blue-400 font-mono text-[10px] bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800">
                          {activeMat.wordCounts.coldEmail + activeMat.wordCounts.shortMessage + activeMat.wordCounts.coverLetter} palavras
                        </span>
                        <span className="text-emerald-400 text-[10px] bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                          PT-BR & EN
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Top card actions & Accordion Button */}
                  <div
                    className="flex flex-wrap items-center gap-2 self-start lg:self-auto shrink-0"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {/* Outreach Status Actions (Contactado / Descartar) */}
                    {currentStatus === 'pending' && (
                      <div className="flex items-center gap-1.5 mr-1 border-r border-slate-800 pr-2">
                        <button
                          type="button"
                          onClick={() => handleMarkContacted(contact, company)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 shadow-md shadow-emerald-500/25 transition cursor-pointer"
                          title="Marcar como contactado/enviado (permanecer nesta página para enviar os demais)"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Contactado</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDirectDiscard(contact, company)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-rose-300 bg-rose-950/60 hover:bg-rose-900/90 border border-rose-800/70 hover:border-rose-600 shadow-md shadow-rose-950/40 transition cursor-pointer active:scale-95"
                          title="Descartar imediatamente em 1 clique (sem nenhum modal ou confirmação)"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                          <span>Descartar</span>
                        </button>
                      </div>
                    )}

                    {currentStatus === 'contacted' && (
                      <div className="flex items-center gap-2 mr-1 border-r border-slate-800 pr-2.5">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold text-emerald-300 bg-emerald-950/80 border border-emerald-700/60 shadow-sm">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Contactado</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => handleRevertStatus(contact, company)}
                          className="text-xs text-slate-400 hover:text-slate-200 hover:underline px-1 py-1 cursor-pointer"
                          title="Desmarcar status e voltar para pendente"
                        >
                          Desfazer
                        </button>
                      </div>
                    )}

                    {currentStatus === 'discarded' && (
                      <div className="flex items-center gap-2 mr-1 border-r border-slate-800 pr-2.5">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold text-rose-300 bg-rose-950/80 border border-rose-800/60 shadow-sm">
                          <XCircle className="w-3.5 h-3.5 text-rose-400" />
                          <span>Descartado</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => handleRevertStatus(contact, company)}
                          className="text-xs text-slate-400 hover:text-slate-200 hover:underline px-1 py-1 cursor-pointer"
                          title="Reativar contato para a lista de pendentes"
                        >
                          Reativar
                        </button>
                      </div>
                    )}

                    {/* Abrir rascunho no Gmail (você revisa e envia manualmente) */}
                    {(isBoth ? (['pt', 'en'] as const) : ([activeLang] as const)).map((lang) => {
                      const m = lang === 'pt' ? matPt : matEn;
                      return (
                        <button
                          key={`gmail_${cardId}_${lang}`}
                          type="button"
                          onClick={() => {
                            if (!openGmailCompose(contact.email, m.subject, m.coldEmail)) {
                              alert('O navegador bloqueou a nova aba. Permita pop-ups para este site e tente de novo.');
                            }
                          }}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-600/20 text-red-300 border border-red-500/30 hover:bg-red-600/30 transition cursor-pointer"
                          title={`Abrir rascunho no Gmail com destinatário, assunto e Cold Email (${lang.toUpperCase()}) preenchidos. Você revisa e clica em Enviar.`}
                        >
                          <Send className="w-3.5 h-3.5 text-red-400" />
                          <span className="hidden sm:inline">Gmail{isBoth ? ` (${lang.toUpperCase()})` : ''}</span>
                        </button>
                      );
                    })}

                    {/* Copy full bundle */}
                    <button
                      type="button"
                      onClick={() =>
                        handleCopy(`bundle_${cardId}_${activeLang}`, makeBundleText(activeLang))
                      }
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 transition"
                      title="Copiar pacote completo (Assunto + Cold Email + Mensagem + Carta)"
                    >
                      {copiedKey === `bundle_${cardId}_${activeLang}` ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          <span className="text-emerald-400">Copiado!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5 text-blue-400" />
                          <span className="hidden sm:inline">Copiar Pacote</span>
                        </>
                      )}
                    </button>

                    {/* Download .txt */}
                    <button
                      type="button"
                      onClick={() =>
                        handleDownloadTxt(
                          `candidatura_${company.name.toLowerCase().replace(/\s+/g, '_')}_${activeLang}.txt`,
                          makeBundleText(activeLang)
                        )
                      }
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-600/20 text-blue-300 border border-blue-500/30 hover:bg-blue-600/30 transition"
                      title="Baixar pacote completo em formato .txt"
                    >
                      <Download className="w-3.5 h-3.5 text-blue-400" />
                      <span>Baixar (.TXT)</span>
                    </button>

                    {/* Edit modal */}
                    {onOpenMaterialModal && (
                      <button
                        type="button"
                        onClick={() => onOpenMaterialModal(contact, company)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700 transition"
                        title="Abrir editor completo com notas e personalizações"
                      >
                        <span>Editar</span>
                      </button>
                    )}

                    {/* Accordion Toggle Action Button */}
                    <button
                      type="button"
                      onClick={() => toggleCard(cardId, index)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition shadow-sm ${
                        isOpen
                          ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
                          : 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-500/20'
                      }`}
                      title={isOpen ? 'Recolher detalhes' : 'Expandir e visualizar todo o conteúdo gerado'}
                    >
                      <span>{isOpen ? 'Recolher' : 'Ver Conteúdo'}</span>
                      {isOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                {/* Accordion Expandable Content Body */}
                {isOpen && (
                  <div className="pt-3 border-t border-slate-800/80 space-y-4 animate-in fade-in-50 duration-200">
                    {/* Subject Line Bar with Copy Button */}
                <div className="bg-slate-900 p-2.5 rounded-xl border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2 overflow-hidden">
                    <span className="font-bold text-slate-400 text-xs whitespace-nowrap">
                      Assunto {isBoth ? '(PT)' : `(${activeLang.toUpperCase()})`}:
                    </span>
                    <span className="text-slate-200 text-xs font-semibold truncate font-mono">
                      {activeMat.subject}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleCopy(`sub_${cardId}_${activeLang}`, activeMat.subject)}
                      className="text-xs font-semibold text-blue-400 hover:text-blue-300 flex items-center gap-1 bg-slate-950 px-2.5 py-1 rounded-md border border-slate-800"
                    >
                      {copiedKey === `sub_${cardId}_${activeLang}` ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-400" />
                          <span className="text-emerald-400">Copiado</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          <span>Copiar Assunto</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        handleDownloadTxt(
                          `assunto_${company.name.toLowerCase().replace(/\s+/g, '_')}.txt`,
                          activeMat.subject
                        )
                      }
                      className="text-xs text-slate-400 hover:text-white bg-slate-950 px-2 py-1 rounded-md border border-slate-800"
                      title="Exportar assunto em .txt"
                    >
                      <Download className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                {/* Subtabs for content types: Cold Email, Mensagem Curta, Carta de Apresentação */}
                <div className="flex rounded-lg bg-slate-900 p-1 border border-slate-800 w-fit text-xs">
                  <button
                    type="button"
                    onClick={() => setActiveTabPerCard({ ...activeTabPerCard, [cardId]: 'cold' })}
                    className={`px-3 py-1 rounded-md font-semibold transition ${
                      currentTab === 'cold'
                        ? 'bg-blue-600 text-white'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    ✉️ Cold Email
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTabPerCard({ ...activeTabPerCard, [cardId]: 'short' })}
                    className={`px-3 py-1 rounded-md font-semibold transition ${
                      currentTab === 'short'
                        ? 'bg-blue-600 text-white'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    💬 Mensagem Curta
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTabPerCard({ ...activeTabPerCard, [cardId]: 'cover' })}
                    className={`px-3 py-1 rounded-md font-semibold transition ${
                      currentTab === 'cover'
                        ? 'bg-blue-600 text-white'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    📄 Carta (Cover Letter)
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTabPerCard({ ...activeTabPerCard, [cardId]: 'all' })}
                    className={`px-3 py-1 rounded-md font-semibold transition ${
                      currentTab === 'all'
                        ? 'bg-indigo-600 text-white'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    📑 Todos Lado a Lado
                  </button>
                </div>

                {/* 3 Content Blocks Grid (Organized and Separated) */}
                {currentTab === 'all' ? (
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                    {/* 1. Cold Email Box */}
                    <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 flex flex-col justify-between space-y-3">
                      <div>
                        <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-2">
                          <span className="font-bold text-slate-200 text-xs flex items-center gap-1.5">
                            <Mail className="w-3.5 h-3.5 text-blue-400" /> Cold Email
                          </span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-950 border border-slate-800 text-slate-400 font-mono">
                            {activeMat.wordCounts.coldEmail} palavras
                          </span>
                        </div>
                        <div className="text-xs text-slate-300 whitespace-pre-wrap leading-relaxed max-h-60 overflow-y-auto pr-1">
                          {activeMat.coldEmail}
                        </div>
                      </div>

                      <div className="pt-2 border-t border-slate-800 flex items-center justify-between gap-1">
                        <button
                          type="button"
                          onClick={() => handleCopy(`cold_${cardId}_${activeLang}`, activeMat.coldEmail)}
                          className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 font-semibold"
                        >
                          {copiedKey === `cold_${cardId}_${activeLang}` ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-emerald-400" /> Copiado!
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5" /> Copiar
                            </>
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            handleDownloadTxt(
                              `cold_email_${company.name.toLowerCase().replace(/\s+/g, '_')}_${activeLang}.txt`,
                              `ASSUNTO: ${activeMat.subject}\n\n${activeMat.coldEmail}`
                            )
                          }
                          className="text-[11px] text-slate-400 hover:text-white flex items-center gap-1"
                        >
                          <Download className="w-3 h-3" /> .TXT
                        </button>
                      </div>
                    </div>

                    {/* 2. Mensagem Curta Box */}
                    <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 flex flex-col justify-between space-y-3">
                      <div>
                        <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-2">
                          <span className="font-bold text-slate-200 text-xs flex items-center gap-1.5">
                            <MessageSquare className="w-3.5 h-3.5 text-cyan-400" /> Mensagem Curta / LinkedIn
                          </span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-950 border border-slate-800 text-slate-400 font-mono">
                            {activeMat.wordCounts.shortMessage} palavras
                          </span>
                        </div>
                        <div className="text-xs text-slate-300 whitespace-pre-wrap leading-relaxed max-h-60 overflow-y-auto pr-1">
                          {activeMat.shortMessage}
                        </div>
                      </div>

                      <div className="pt-2 border-t border-slate-800 flex items-center justify-between gap-1">
                        <button
                          type="button"
                          onClick={() => handleCopy(`short_${cardId}_${activeLang}`, activeMat.shortMessage)}
                          className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 font-semibold"
                        >
                          {copiedKey === `short_${cardId}_${activeLang}` ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-emerald-400" /> Copiado!
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5" /> Copiar
                            </>
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            handleDownloadTxt(
                              `mensagem_curta_${company.name.toLowerCase().replace(/\s+/g, '_')}_${activeLang}.txt`,
                              activeMat.shortMessage
                            )
                          }
                          className="text-[11px] text-slate-400 hover:text-white flex items-center gap-1"
                        >
                          <Download className="w-3 h-3" /> .TXT
                        </button>
                      </div>
                    </div>

                    {/* 3. Cover Letter Box */}
                    <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 flex flex-col justify-between space-y-3">
                      <div>
                        <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-2">
                          <span className="font-bold text-slate-200 text-xs flex items-center gap-1.5">
                            <FileText className="w-3.5 h-3.5 text-indigo-400" /> Carta de Apresentação
                          </span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-950 border border-slate-800 text-slate-400 font-mono">
                            {activeMat.wordCounts.coverLetter} palavras
                          </span>
                        </div>
                        <div className="text-xs text-slate-300 whitespace-pre-wrap leading-relaxed max-h-60 overflow-y-auto pr-1">
                          {activeMat.coverLetter}
                        </div>
                      </div>

                      <div className="pt-2 border-t border-slate-800 flex items-center justify-between gap-1">
                        <button
                          type="button"
                          onClick={() => handleCopy(`cover_${cardId}_${activeLang}`, activeMat.coverLetter)}
                          className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 font-semibold"
                        >
                          {copiedKey === `cover_${cardId}_${activeLang}` ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-emerald-400" /> Copiado!
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5" /> Copiar
                            </>
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            handleDownloadTxt(
                              `cover_letter_${company.name.toLowerCase().replace(/\s+/g, '_')}_${activeLang}.txt`,
                              `CARTA DE APRESENTAÇÃO - ${company.name}\n\n${activeMat.coverLetter}`
                            )
                          }
                          className="text-[11px] text-slate-400 hover:text-white flex items-center gap-1"
                        >
                          <Download className="w-3 h-3" /> .TXT
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  /* Focused Single Content View (with side-by-side PT/EN if 'both' is selected) */
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Portuguese Column */}
                    {(isBoth || activeLang === 'pt') && (
                      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 flex flex-col justify-between space-y-3">
                        <div>
                          <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-2">
                            <span className="font-bold text-slate-200 text-xs flex items-center gap-1.5">
                              <span>🇧🇷</span>
                              {currentTab === 'cold' && 'Cold Email (Português)'}
                              {currentTab === 'short' && 'Mensagem Curta (Português)'}
                              {currentTab === 'cover' && 'Carta de Apresentação (Português)'}
                            </span>
                            <span className="text-[10px] px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-slate-400 font-mono">
                              {currentTab === 'cold' && `${matPt.wordCounts.coldEmail} palavras`}
                              {currentTab === 'short' && `${matPt.wordCounts.shortMessage} palavras`}
                              {currentTab === 'cover' && `${matPt.wordCounts.coverLetter} palavras`}
                            </span>
                          </div>

                          <div className="text-xs text-slate-300 whitespace-pre-wrap leading-relaxed max-h-72 overflow-y-auto pr-1">
                            {currentTab === 'cold' && matPt.coldEmail}
                            {currentTab === 'short' && matPt.shortMessage}
                            {currentTab === 'cover' && matPt.coverLetter}
                          </div>
                        </div>

                        <div className="pt-2 border-t border-slate-800 flex items-center justify-between">
                          <button
                            type="button"
                            onClick={() => {
                              const txt =
                                currentTab === 'cold'
                                  ? matPt.coldEmail
                                  : currentTab === 'short'
                                  ? matPt.shortMessage
                                  : matPt.coverLetter;
                              handleCopy(`pt_${currentTab}_${cardId}`, txt);
                            }}
                            className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1.5 font-semibold"
                          >
                            {copiedKey === `pt_${currentTab}_${cardId}` ? (
                              <>
                                <Check className="w-3.5 h-3.5 text-emerald-400" /> Copiado!
                              </>
                            ) : (
                              <>
                                <Copy className="w-3.5 h-3.5" /> Copiar em Português
                              </>
                            )}
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              const txt =
                                currentTab === 'cold'
                                  ? `ASSUNTO: ${matPt.subject}\n\n${matPt.coldEmail}`
                                  : currentTab === 'short'
                                  ? matPt.shortMessage
                                  : matPt.coverLetter;
                              handleDownloadTxt(
                                `${currentTab}_${company.name.toLowerCase().replace(/\s+/g, '_')}_pt.txt`,
                                txt
                              );
                            }}
                            className="text-xs text-slate-400 hover:text-white flex items-center gap-1"
                          >
                            <Download className="w-3.5 h-3.5" /> Exportar .TXT
                          </button>
                        </div>
                      </div>
                    )}

                    {/* English Column */}
                    {(isBoth || activeLang === 'en') && (
                      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 flex flex-col justify-between space-y-3">
                        <div>
                          <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-2">
                            <span className="font-bold text-slate-200 text-xs flex items-center gap-1.5">
                              <span>🇺🇸</span>
                              {currentTab === 'cold' && 'Cold Email (English)'}
                              {currentTab === 'short' && 'Short Message (English)'}
                              {currentTab === 'cover' && 'Cover Letter (English)'}
                            </span>
                            <span className="text-[10px] px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-slate-400 font-mono">
                              {currentTab === 'cold' && `${matEn.wordCounts.coldEmail} words`}
                              {currentTab === 'short' && `${matEn.wordCounts.shortMessage} words`}
                              {currentTab === 'cover' && `${matEn.wordCounts.coverLetter} words`}
                            </span>
                          </div>

                          <div className="text-xs text-slate-300 whitespace-pre-wrap leading-relaxed max-h-72 overflow-y-auto pr-1">
                            {currentTab === 'cold' && matEn.coldEmail}
                            {currentTab === 'short' && matEn.shortMessage}
                            {currentTab === 'cover' && matEn.coverLetter}
                          </div>
                        </div>

                        <div className="pt-2 border-t border-slate-800 flex items-center justify-between">
                          <button
                            type="button"
                            onClick={() => {
                              const txt =
                                currentTab === 'cold'
                                  ? matEn.coldEmail
                                  : currentTab === 'short'
                                  ? matEn.shortMessage
                                  : matEn.coverLetter;
                              handleCopy(`en_${currentTab}_${cardId}`, txt);
                            }}
                            className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1.5 font-semibold"
                          >
                            {copiedKey === `en_${currentTab}_${cardId}` ? (
                              <>
                                <Check className="w-3.5 h-3.5 text-emerald-400" /> Copied!
                              </>
                            ) : (
                              <>
                                <Copy className="w-3.5 h-3.5" /> Copy in English
                              </>
                            )}
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              const txt =
                                currentTab === 'cold'
                                  ? `SUBJECT: ${matEn.subject}\n\n${matEn.coldEmail}`
                                  : currentTab === 'short'
                                  ? matEn.shortMessage
                                  : matEn.coverLetter;
                              handleDownloadTxt(
                                `${currentTab}_${company.name.toLowerCase().replace(/\s+/g, '_')}_en.txt`,
                                txt
                              );
                            }}
                            className="text-xs text-slate-400 hover:text-white flex items-center gap-1"
                          >
                            <Download className="w-3.5 h-3.5" /> Export .TXT
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Review Notes Snippet */}
                {activeMat.reviewNotes && (
                  <div className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800 text-[11px] text-slate-400 flex items-start gap-2">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                    <span>
                      <strong className="text-slate-300">Auditoria Factual:</strong> {activeMat.reviewNotes}
                    </span>
                  </div>
                )}
                  </div>
                )}
              </div>
            );  };

  // Linha compacta (1 linha) para contatos de baixa relevancia
  const renderCompactRow = ({ company, contact }: MaterialItem) => {
    const status = getStatusOf(contact);
    const isBoth = langPreference === 'both';
    const langs = (isBoth ? ['pt', 'en'] : [langPreference]) as ('pt' | 'en')[];
    const color = CLASSIFICATION_COLORS[contact.classification] || '#64748b';
    return (
      <div
        key={contact.id}
        className={`flex flex-wrap items-center gap-2 px-3 py-1.5 rounded-lg border text-xs ${
          status === 'contacted'
            ? 'border-emerald-700/50 bg-emerald-950/20'
            : status === 'discarded'
            ? 'border-rose-800/40 bg-rose-950/10 opacity-70'
            : 'border-slate-800 bg-slate-950/60'
        }`}
      >
        <button
          type="button"
          onClick={() => toggleSelectContact(contact.id)}
          className="p-0.5 rounded border border-slate-700/60 bg-slate-900/90 text-slate-500 hover:text-slate-200 cursor-pointer shrink-0"
          title="Selecionar este contato"
        >
          {selectedContactIds.has(contact.id) ? (
            <CheckSquare className="w-3.5 h-3.5 text-rose-400" />
          ) : (
            <Square className="w-3.5 h-3.5" />
          )}
        </button>

        <a
          href={`mailto:${contact.email}`}
          target="_blank"
          rel="noopener noreferrer"
          data-url={`mailto:${contact.email}`}
          {...onMiddleClickHandler(`mailto:${contact.email}`)}
          className="font-mono font-semibold text-cyan-300 hover:text-cyan-200 truncate max-w-[18rem]"
          title={contact.email}
        >
          {contact.email}
        </a>

        <span
          className="inline-flex items-center gap-1 text-[10px] text-slate-400 shrink-0"
          title={contact.classification}
        >
          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
          {contact.classification}
        </span>

        {status === 'contacted' && <span className="text-[10px] font-bold text-emerald-400">Contactado</span>}
        {status === 'discarded' && <span className="text-[10px] font-bold text-rose-400">Descartado</span>}

        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => handleCopy(`recipient_${contact.id}`, contact.email)}
            className="px-2 py-1 rounded text-[11px] text-cyan-300 bg-slate-800 hover:bg-slate-700 cursor-pointer"
            title="Copiar endereço de email"
          >
            {copiedKey === `recipient_${contact.id}` ? 'Copiado!' : 'Copiar email'}
          </button>

          {langs.map((lang) => (
            <button
              key={`${contact.id}_gm_${lang}`}
              type="button"
              onClick={() => handleOpenGmail(contact, lang)}
              className="px-2 py-1 rounded text-[11px] font-semibold text-red-300 bg-red-600/20 border border-red-500/30 hover:bg-red-600/30 cursor-pointer"
              title={`Abrir rascunho no Gmail (${lang.toUpperCase()})`}
            >
              Gmail{isBoth ? ` ${lang.toUpperCase()}` : ''}
            </button>
          ))}

          {status === 'pending' && (
            <>
              <button
                type="button"
                onClick={() => handleMarkContacted(contact, company)}
                className="px-2 py-1 rounded text-[11px] font-bold text-white bg-emerald-600 hover:bg-emerald-500 cursor-pointer"
              >
                Contactado
              </button>
              <button
                type="button"
                onClick={() => handleDirectDiscard(contact, company)}
                className="px-2 py-1 rounded text-[11px] font-bold text-rose-300 bg-rose-950/60 hover:bg-rose-900/90 border border-rose-800/70 cursor-pointer"
              >
                Descartar
              </button>
            </>
          )}
          {status !== 'pending' && (
            <button
              type="button"
              onClick={() => handleRevertStatus(contact, company)}
              className="px-2 py-1 text-[11px] text-slate-400 hover:text-slate-200 hover:underline cursor-pointer"
            >
              {status === 'discarded' ? 'Reativar' : 'Desfazer'}
            </button>
          )}

          <button
            type="button"
            onClick={() => setFullCardIds((prev) => ({ ...prev, [contact.id]: true }))}
            className="px-2 py-1 rounded text-[11px] text-slate-300 bg-slate-900 border border-slate-700 hover:bg-slate-800 cursor-pointer"
            title="Abrir o card completo deste contato (materiais, edição, exportação)"
          >
            Detalhes
          </button>
        </div>
      </div>
    );
  };

  // Card de empresa: cabecalho com resumo + melhor contato; corpo com contatos
  const renderCompanyGroup = (group: CompanyGroup) => {
    const { company, main, low, best, stats } = group;
    const isOpen = !!openCompanyIds[company.id];
    const isBoth = langPreference === 'both';
    const activeLang: 'pt' | 'en' = isBoth ? 'pt' : (langPreference as 'pt' | 'en');
    const bestStatus = getStatusOf(best.contact);
    const allSelected = group.contacts.every(({ contact }) => selectedContactIds.has(contact.id));
    const someSelected = group.contacts.some(({ contact }) => selectedContactIds.has(contact.id));
    const lowOpen = showLowRelevance || !!lowOpenByCompany[company.id];
    const contactedEmails = generatedItems
      .filter(({ company: c, contact }) => c.id === company.id && ['contacted', 'interview', 'offer'].includes(getStatusOf(contact)))
      .map(({ contact }) => contact.email);
    const lowPendingOutra = low.filter(
      ({ contact }) => contact.classification === 'Outra finalidade' && getStatusOf(contact) === 'pending'
    );
    const lowPreview = low
      .slice(0, 3)
      .map(({ contact }) => contact.email.split('@')[0] + '@')
      .join(', ');

    const classChips = (Object.keys(CLASSIFICATION_RANK) as ContactClassification[])
      .filter((k) => stats.byClass[k] > 0)
      .map((k) => (
        <span key={k} className="inline-flex items-center gap-1 text-[11px] text-slate-400">
          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: CLASSIFICATION_COLORS[k] }} />
          {stats.byClass[k]} {CLASSIFICATION_SHORT[k]}
        </span>
      ));

    return (
      <div
        key={company.id}
        className={`rounded-2xl border bg-slate-950/80 shadow-md transition-all ${
          stats.pending === 0 && stats.contacted > 0
            ? 'border-emerald-500/60 bg-emerald-950/10'
            : contactedEmails.length > 0
            ? 'border-amber-500/40'
            : isOpen
            ? 'border-slate-700'
            : 'border-slate-800 hover:border-slate-700/80'
        }`}
      >
        {/* Cabecalho da empresa */}
        <div
          onClick={() => toggleCompany(company.id)}
          data-url={company.normalizedUrl || company.rawUrl}
          {...onMiddleClickHandler(company.normalizedUrl || company.rawUrl)}
          className="cursor-pointer select-none p-4 space-y-2.5"
        >
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                toggleSelectCompany(group);
              }}
              className={`p-1 rounded-md border transition cursor-pointer shrink-0 ${
                allSelected
                  ? 'bg-rose-500/20 text-rose-300 border-rose-500/60'
                  : someSelected
                  ? 'bg-rose-500/10 text-rose-300 border-rose-500/30'
                  : 'bg-slate-900/90 text-slate-500 hover:text-slate-200 border-slate-700/60 hover:border-slate-500'
              }`}
              title={allSelected ? 'Desmarcar todos os contatos desta empresa' : 'Selecionar todos os contatos desta empresa'}
            >
              {allSelected ? <CheckSquare className="w-4 h-4 text-rose-400" /> : <Square className="w-4 h-4" />}
            </button>

            {isOpen ? (
              <ChevronDown className="w-4 h-4 text-blue-400 shrink-0" />
            ) : (
              <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
            )}

            <span className="text-sm font-bold text-white flex items-center gap-1.5">
              <Building2 className="w-4 h-4 text-blue-400 shrink-0" />
              {company.name}
            </span>

            {company.normalizedUrl && (
              <a
                href={company.normalizedUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                data-url={company.normalizedUrl}
                {...onMiddleClickHandler(company.normalizedUrl)}
                className="text-[11px] text-slate-400 hover:text-blue-400 flex items-center gap-0.5 truncate max-w-xs"
              >
                <ExternalLink className="w-3 h-3" />
                {company.normalizedUrl.replace(/^https?:\/\//, '').replace(/\/$/, '')}
              </a>
            )}

            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-slate-200 border border-slate-700">
              {stats.total} contato{stats.total === 1 ? '' : 's'}
            </span>

            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">{classChips}</div>
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-400">
            <span>
              Pendentes <strong className="text-slate-200 font-mono">{stats.pending}</strong>
            </span>
            <span>
              Contactados <strong className="text-emerald-300 font-mono">{stats.contacted}</strong>
            </span>
            <span>
              Descartados <strong className="text-rose-300 font-mono">{stats.discarded}</strong>
            </span>
            {contactedEmails.length > 0 && stats.pending > 0 && (
              <span className="inline-flex items-center gap-1 text-amber-300 font-semibold">
                <AlertCircle className="w-3 h-3" />
                Você já contatou essa empresa ({contactedEmails[0]})
              </span>
            )}
          </div>

          {/* Melhor contato + acoes principais */}
          <div
            className="flex flex-col lg:flex-row lg:items-center justify-between gap-2 pt-1"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-wrap items-center gap-2 text-xs min-w-0">
              <span className="text-slate-500 shrink-0">Melhor contato:</span>
              <a
                href={`mailto:${best.contact.email}`}
                target="_blank"
                rel="noopener noreferrer"
                data-url={`mailto:${best.contact.email}`}
                {...onMiddleClickHandler(`mailto:${best.contact.email}`)}
                className="font-mono font-semibold text-cyan-300 hover:text-cyan-200 flex items-center gap-1 truncate"
              >
                <Mail className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                {best.contact.email}
              </a>
              <button
                type="button"
                onClick={() => handleCopy(`recipient_${best.contact.id}`, best.contact.email)}
                className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] text-cyan-300 bg-slate-800 hover:bg-slate-700 cursor-pointer"
                title="Copiar endereço de email"
              >
                {copiedKey === `recipient_${best.contact.id}` ? (
                  <>
                    <Check className="w-3 h-3" /> Copiado!
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3" /> Copiar email
                  </>
                )}
              </button>
              <span className="text-[11px] text-slate-500 italic">
                {best.contact.classification}
                {best.contact.associatedJob?.title ? ` · Vaga: ${best.contact.associatedJob.title}` : ' · Candidatura Espontânea'}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 shrink-0">
              {(isBoth ? (['pt', 'en'] as const) : ([activeLang] as const)).map((lang) => (
                <button
                  key={`${company.id}_gm_${lang}`}
                  type="button"
                  onClick={() => handleOpenGmail(best.contact, lang)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-600/20 text-red-300 border border-red-500/30 hover:bg-red-600/30 transition cursor-pointer"
                  title={`Abrir rascunho no Gmail para ${best.contact.email} (${lang.toUpperCase()}). Você revisa e clica em Enviar.`}
                >
                  <Send className="w-3.5 h-3.5 text-red-400" />
                  <span>Gmail{isBoth ? ` (${lang.toUpperCase()})` : ''}</span>
                </button>
              ))}

              <button
                type="button"
                onClick={() =>
                  handleCopy(`bundle_${best.contact.id}_${activeLang}`, makeBundleTextFor(company, best.contact, activeLang))
                }
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 transition cursor-pointer"
                title="Copiar pacote completo do melhor contato"
              >
                {copiedKey === `bundle_${best.contact.id}_${activeLang}` ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-emerald-400">Copiado!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-blue-400" />
                    <span>Copiar Pacote</span>
                  </>
                )}
              </button>

              {bestStatus === 'pending' && (
                <button
                  type="button"
                  onClick={() => handleMarkContacted(best.contact, company)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 shadow-md shadow-emerald-500/25 transition cursor-pointer"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Contactado</span>
                </button>
              )}
              {bestStatus === 'contacted' && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold text-emerald-300 bg-emerald-950/80 border border-emerald-700/60">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  Contactado
                </span>
              )}
              {bestStatus === 'discarded' && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold text-rose-300 bg-rose-950/80 border border-rose-800/60">
                  <XCircle className="w-3.5 h-3.5 text-rose-400" />
                  Descartado
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Corpo expandido */}
        {isOpen && (
          <div className="px-4 pb-4 pt-1 space-y-3 border-t border-slate-800/70">
            <div className="space-y-3 pt-3">{main.map((item, i) => renderContactCard(item, i))}</div>

            {low.length > 0 && (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setLowOpenByCompany((prev) => ({ ...prev, [company.id]: !prev[company.id] }))}
                    className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-400 hover:text-slate-200 cursor-pointer"
                  >
                    {lowOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                    <span>
                      +{low.length} contato{low.length === 1 ? '' : 's'} de baixa relevância ({lowPreview}
                      {low.length > 3 ? '...' : ''})
                    </span>
                  </button>

                  {lowPendingOutra.length > 0 && (
                    <button
                      type="button"
                      disabled={isBulkOperating}
                      onClick={() => discardMany(lowPendingOutra, 'Descartado em massa: Outra finalidade')}
                      className="px-2 py-1 rounded text-[11px] font-semibold text-rose-300 bg-rose-950/50 hover:bg-rose-900/80 border border-rose-800/60 disabled:opacity-50 cursor-pointer"
                      title="Descartar de uma vez os contatos pendentes desta empresa classificados como Outra finalidade"
                    >
                      Descartar "Outra finalidade" ({lowPendingOutra.length})
                    </button>
                  )}
                </div>

                {lowOpen && (
                  <div className="space-y-1.5">
                    {low.map((item) =>
                      fullCardIds[item.contact.id] ? (
                        <div key={item.contact.id} className="space-y-1">
                          <button
                            type="button"
                            onClick={() => setFullCardIds((prev) => ({ ...prev, [item.contact.id]: false }))}
                            className="text-[11px] text-slate-400 hover:text-slate-200 hover:underline cursor-pointer"
                          >
                            ← voltar para a linha compacta
                          </button>
                          {renderContactCard(item, 1)}
                        </div>
                      ) : (
                        renderCompactRow(item)
                      )
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* 1. Analytics & KPIs Top Card */}
      <div className="bg-slate-900/90 rounded-2xl border border-slate-800 p-5 sm:p-6 shadow-xl space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800/80 pb-4">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-blue-400" />
              Dashboard Analítico & Materiais de Candidatura
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Métricas em tempo real, visualização organizada dos materiais em <strong>Português (PT-BR)</strong> e <strong>Inglês (EN)</strong> com exportação imediata.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
            <button
              type="button"
              onClick={() => setShowCharts(!showCharts)}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700 transition flex items-center gap-1.5"
            >
              <PieIcon className="w-3.5 h-3.5 text-blue-400" />
              {showCharts ? 'Ocultar Gráficos' : 'Exibir Gráficos'}
              {showCharts ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>

            <span className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-blue-500/10 text-blue-300 border border-blue-500/25 flex items-center gap-1.5">
              <Building2 className="w-4 h-4 text-blue-400" />
              {totalProcessed} de {totalCompanies} Empresas ({totalCompanies > 0 ? Math.round((totalProcessed / totalCompanies) * 100) : 0}%)
            </span>
          </div>
        </div>

        {/* KPI Highlights Bar */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800">
            <div className="flex items-center justify-between text-slate-400 text-xs font-semibold">
              <span>Contatos Coletados</span>
              <Users className="w-4 h-4 text-blue-400" />
            </div>
            <div className="text-2xl font-bold font-mono text-white mt-1">
              {totalContacts}
            </div>
            <div className="text-[11px] text-emerald-400 font-medium mt-0.5 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" />
              {classificationCounts['Recrutamento confirmado']} confirmados
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800">
            <div className="flex items-center justify-between text-slate-400 text-xs font-semibold">
              <span>Taxa de Geração</span>
              <TrendingUp className="w-4 h-4 text-indigo-400" />
            </div>
            <div className="text-2xl font-bold font-mono text-indigo-300 mt-1">
              {successRate}%
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              {totalMaterialsGenerated} de {confirmedOrPossibleContacts} contatos prioritários
            </div>
          </div>

          <div
            onClick={() => setIsVacanciesModalOpen(true)}
            className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 hover:border-cyan-500/50 transition cursor-pointer group"
            title="Clique para abrir a Central de Monitoramento e Auditoria de Vagas"
          >
            <div className="flex items-center justify-between text-slate-400 text-xs font-semibold">
              <span className="group-hover:text-cyan-300 transition">Vagas Mapeadas</span>
              <Briefcase className="w-4 h-4 text-cyan-400" />
            </div>
            <div className="text-2xl font-bold font-mono text-cyan-300 mt-1 flex items-baseline gap-2">
              {totalVacanciesFound}
              {modifiedVacanciesCount > 0 && (
                <span className="text-xs font-bold text-amber-400 font-sans px-1.5 py-0.5 rounded bg-amber-500/20 border border-amber-500/40">
                  {modifiedVacanciesCount} modif.
                </span>
              )}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5 flex items-center justify-between">
              <span>{modifiedVacanciesCount > 0 ? `${modifiedVacanciesCount} atualizada(s)` : 'Sem duplicatas'}</span>
              <span className="text-cyan-400 group-hover:underline text-[10px] font-semibold">Ver detalhes →</span>
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800">
            <div className="flex items-center justify-between text-slate-400 text-xs font-semibold">
              <span>Materiais Fatuais Prontos</span>
              <FileText className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-2xl font-bold font-mono text-emerald-300 mt-1">
              {totalMaterialsGenerated}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-1">
              <ShieldCheck className="w-3 h-3 text-emerald-400" />
              Bilíngues (PT-BR + EN)
            </div>
          </div>
        </div>

        {/* Charts Grid (Collapsible) */}
        {showCharts && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 pt-2">
            {/* Chart 1: Contatos por Classificação (Pie) */}
            <div className="p-4 rounded-xl bg-slate-950/50 border border-slate-800 flex flex-col justify-between">
              <div className="mb-2">
                <h3 className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                  <PieIcon className="w-4 h-4 text-emerald-400" />
                  1. Contatos por Classificação
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Recrutamento vs. departamentos gerais.
                </p>
              </div>

              <div className="h-48 w-full flex items-center justify-center">
                {totalContacts === 0 ? (
                  <div className="text-slate-500 text-xs italic text-center py-10">
                    Nenhum contato coletado ainda.
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={classificationData}
                        cx="50%"
                        cy="50%"
                        innerRadius={45}
                        outerRadius={70}
                        paddingAngle={3}
                        dataKey="value"
                      >
                        {classificationData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            const data = payload[0];
                            const count = Number(data.value);
                            const pct = totalContacts > 0 ? Math.round((count / totalContacts) * 100) : 0;
                            return (
                              <div className="bg-slate-900 border border-slate-700 p-2 rounded-lg text-xs shadow-xl">
                                <div className="font-bold text-white">{data.name}</div>
                                <div className="text-slate-300 font-mono mt-0.5">
                                  {count} contato(s) ({pct}%)
                                </div>
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>

              <div className="grid grid-cols-2 gap-1.5 pt-2 border-t border-slate-800/80 text-[11px]">
                {Object.entries(classificationCounts).map(([name, count]) => (
                  <div key={name} className="flex items-center justify-between text-slate-300">
                    <div className="flex items-center gap-1.5 truncate">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: CLASSIFICATION_COLORS[name as ContactClassification] }}
                      />
                      <span className="truncate">{name.split(' ')[0]}</span>
                    </div>
                    <span className="font-mono text-slate-400 font-bold ml-1">{count}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Chart 2: Taxa de Sucesso na Geração de Materiais */}
            <div className="p-4 rounded-xl bg-slate-950/50 border border-slate-800 flex flex-col justify-between">
              <div className="mb-2">
                <h3 className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                  <TrendingUp className="w-4 h-4 text-indigo-400" />
                  2. Eficácia de Geração
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Candidaturas produzidas vs. contatos elegíveis.
                </p>
              </div>

              <div className="h-48 w-full flex flex-col justify-center items-center px-2">
                <div className="w-full space-y-3">
                  <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-900 border border-slate-800">
                    <div>
                      <span className="text-[10px] text-slate-400 font-semibold block">
                        Cobertura
                      </span>
                      <span className="text-xl font-bold font-mono text-indigo-400">
                        {successRate}%
                      </span>
                    </div>
                    <div className="text-right text-[11px] text-slate-400">
                      <span className="text-emerald-400 font-bold block">{totalMaterialsGenerated} Gerados</span>
                      <span>{confirmedOrPossibleContacts} Elegíveis</span>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="w-full bg-slate-900 h-2.5 rounded-full overflow-hidden border border-slate-800 p-0.5">
                      <div
                        className="bg-gradient-to-r from-indigo-500 to-emerald-400 h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${Math.min(100, (totalMaterialsGenerated / Math.max(1, confirmedOrPossibleContacts)) * 100)}%`,
                        }}
                      />
                    </div>
                  </div>

                  <div className="p-2 rounded-lg bg-slate-900/60 border border-slate-800 text-[10px] text-slate-400 space-y-0.5">
                    <div className="flex justify-between">
                      <span>Cold Email:</span>
                      <span className="font-mono text-slate-200">120 - 180 palavras</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Mensagem Curta:</span>
                      <span className="font-mono text-slate-200">50 - 80 palavras</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Carta (Cover Letter):</span>
                      <span className="font-mono text-slate-200">250 - 400 palavras</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-800/80 text-[11px] text-slate-400 flex items-center justify-between">
                <span>Anti-Alucinação:</span>
                <span className="text-emerald-400 font-semibold">100% Factual Ativo</span>
              </div>
            </div>

            {/* Chart 3: Empresas Processadas vs. Pendentes */}
            <div className="p-4 rounded-xl bg-slate-950/50 border border-slate-800 flex flex-col justify-between">
              <div className="mb-2">
                <h3 className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                  <BarChart3 className="w-4 h-4 text-blue-400" />
                  3. Status do Lote de Empresas
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Progresso geral ({totalCompanies} total).
                </p>
              </div>

              <div className="h-48 w-full">
                {totalCompanies === 0 ? (
                  <div className="text-slate-500 text-xs italic text-center py-10">
                    Nenhuma empresa cadastrada.
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={companyStatusData}
                      layout="vertical"
                      margin={{ top: 5, right: 15, left: 5, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#1e293b" />
                      <XAxis type="number" stroke="#64748b" fontSize={10} allowDecimals={false} />
                      <YAxis
                        dataKey="categoria"
                        type="category"
                        stroke="#94a3b8"
                        fontSize={10}
                        width={90}
                        tickLine={false}
                      />
                      <Tooltip
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            const item = payload[0].payload;
                            return (
                              <div className="bg-slate-900 border border-slate-700 p-2 rounded-lg text-xs shadow-xl">
                                <span className="font-bold text-white block">{item.categoria}</span>
                                <span className="text-blue-400 font-mono font-semibold">
                                  {item.quantidade} empresa(s)
                                </span>
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                      <Bar dataKey="quantidade" radius={[0, 4, 4, 0]}>
                        {companyStatusData.map((entry, index) => (
                          <Cell key={`bar-cell-${index}`} fill={entry.fill} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>

              <div className="pt-2 border-t border-slate-800/80 text-[11px] text-slate-400 flex items-center justify-between">
                <span>Concluídas:</span>
                <span className="text-blue-400 font-mono font-bold">
                  {totalCompanies > 0 ? Math.round((totalProcessed / totalCompanies) * 100) : 0}%
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 2. DEDICATED ORGANIZED GENERATED CONTENT SECTION */}
      <div className="bg-slate-900/90 rounded-2xl border border-slate-800 p-5 sm:p-6 shadow-xl space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-amber-400" />
              <h3 className="text-base sm:text-lg font-bold text-white">
                Materiais Gerados no Dashboard
              </h3>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                {generatedItems.length} prontas
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Cold Emails, Mensagens Curtas e Cartas de Apresentação organizados individualmente por empresa/contato com cópia rápida e exportação em <strong>.TXT</strong>.
            </p>
          </div>

          {/* Global Quick Action Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            {generatedItems.length > 0 && (
              <>
                <button
                  type="button"
                  disabled={isExporting}
                  onClick={() => handleExportTxt(selectedContactIds.size > 0 ? 'selected' : 'filtered')}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white shadow-md shadow-blue-500/20 transition cursor-pointer active:scale-95"
                  title={
                    selectedContactIds.size > 0
                      ? `Exportar apenas as ${selectedContactIds.size} candidaturas selecionadas em .TXT`
                      : `Exportar as ${filteredMaterials.length} candidaturas visíveis na busca/filtros em .TXT`
                  }
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>
                    {selectedContactIds.size > 0
                      ? `Exportar Selecionados (.TXT) (${selectedContactIds.size})`
                      : `Exportar Filtrados (.TXT) (${filteredMaterials.length})`}
                  </span>
                </button>

                <button
                  type="button"
                  disabled={isExporting}
                  onClick={() => handleExportZip(selectedContactIds.size > 0 ? 'selected' : 'filtered')}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-500/20 transition cursor-pointer active:scale-95"
                  title={
                    selectedContactIds.size > 0
                      ? `Exportar apenas as ${selectedContactIds.size} candidaturas selecionadas em .ZIP organizado`
                      : `Exportar as ${filteredMaterials.length} candidaturas visíveis na busca/filtros em .ZIP organizado`
                  }
                >
                  {isExporting ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Archive className="w-3.5 h-3.5 text-indigo-200" />
                  )}
                  <span>
                    {selectedContactIds.size > 0
                      ? `Exportar Selecionados (.ZIP) (${selectedContactIds.size})`
                      : `Exportar Filtrados (.ZIP) (${filteredMaterials.length})`}
                  </span>
                </button>

                {filteredMaterials.length < generatedItems.length && (
                  <button
                    type="button"
                    disabled={isExporting}
                    onClick={() => handleExportTxt('all')}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition cursor-pointer"
                    title={`Exportar todas as ${generatedItems.length} candidaturas geradas sem considerar filtros`}
                  >
                    <Download className="w-3.5 h-3.5 text-slate-400" />
                    <span>Todas ({generatedItems.length})</span>
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {/* Quick Outreach Status Filter Bar */}
        {generatedItems.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-950/80 p-2.5 rounded-xl border border-slate-800">
            <div className="flex flex-wrap items-center gap-1.5 py-0.5">
              <span className="text-[11px] font-semibold text-slate-400 mr-1 hidden sm:inline">Status:</span>

              <button
                type="button"
                onClick={() => setFilterOutreachStatus('all')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer ${
                  filterOutreachStatus === 'all'
                    ? 'bg-blue-600 text-white shadow'
                    : 'text-slate-400 hover:text-slate-200 bg-slate-900 hover:bg-slate-800'
                }`}
              >
                <span>Todos</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-950/60 font-mono">
                  {generatedItems.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setFilterOutreachStatus('pending')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer ${
                  filterOutreachStatus === 'pending'
                    ? 'bg-amber-600 text-white shadow'
                    : 'text-slate-400 hover:text-slate-200 bg-slate-900 hover:bg-slate-800'
                }`}
                title="Mostrar apenas contatos que ainda não foram enviados"
              >
                <Clock className="w-3.5 h-3.5" />
                <span>A Enviar (Pendentes)</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-950/60 font-mono">
                  {pendingCount}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setFilterOutreachStatus('contacted')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer ${
                  filterOutreachStatus === 'contacted'
                    ? 'bg-emerald-600 text-white shadow'
                    : 'text-slate-400 hover:text-slate-200 bg-slate-900 hover:bg-slate-800'
                }`}
                title="Mostrar contatos já marcados como contactados"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Contactados</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-950/60 font-mono">
                  {contactedCount}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setFilterOutreachStatus('discarded')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer ${
                  filterOutreachStatus === 'discarded'
                    ? 'bg-rose-600 text-white shadow'
                    : 'text-slate-400 hover:text-slate-200 bg-slate-900 hover:bg-slate-800'
                }`}
                title="Mostrar oportunidades descartadas"
              >
                <XCircle className="w-3.5 h-3.5" />
                <span>Descartados</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-950/60 font-mono">
                  {discardedCount}
                </span>
              </button>
            </div>

            <div className="text-[11px] text-slate-400">
              Exibindo <strong className="text-slate-200 font-mono">{filteredMaterials.length}</strong> de{' '}
              <strong className="text-slate-200 font-mono">{generatedItems.length}</strong> candidaturas
            </div>
          </div>
        )}

        {/* Filter & Language Selector Bar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-slate-950/70 p-3 rounded-xl border border-slate-800">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar por empresa, e-mail ou vaga..."
              className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Language Toggle */}
          <div className="flex items-center gap-1.5 self-start sm:self-auto">
            <span className="text-[11px] text-slate-400 font-semibold mr-1">Visualizar:</span>
            <div className="flex rounded-lg bg-slate-900 p-0.5 border border-slate-800">
              <button
                type="button"
                onClick={() => setLangPreference('pt')}
                className={`px-3 py-1 rounded-md text-xs font-semibold transition ${
                  langPreference === 'pt'
                    ? 'bg-blue-600 text-white shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                🇧🇷 Português
              </button>
              <button
                type="button"
                onClick={() => setLangPreference('en')}
                className={`px-3 py-1 rounded-md text-xs font-semibold transition ${
                  langPreference === 'en'
                    ? 'bg-indigo-600 text-white shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                🇺🇸 English
              </button>
              <button
                type="button"
                onClick={() => setLangPreference('both')}
                className={`px-3 py-1 rounded-md text-xs font-semibold transition ${
                  langPreference === 'both'
                    ? 'bg-purple-600 text-white shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                🌐 Ambos
              </button>
            </div>
          </div>

          {/* Perfis: abre menu com Expandir/Recolher Empresas */}
          {filteredMaterials.length > 0 && (
            <div className="relative flex items-center gap-1.5 self-start sm:self-auto border-t sm:border-t-0 sm:border-l border-slate-800 pt-2 sm:pt-0 sm:pl-3">
              <button
                type="button"
                onClick={() => setProfilesMenuOpen((v) => !v)}
                className="px-2.5 py-1 rounded-lg text-xs font-semibold text-slate-300 hover:text-white bg-slate-900 hover:bg-slate-800 border border-slate-800 transition flex items-center gap-1 cursor-pointer"
                title="Abrir menu de expandir/recolher"
              >
                <ChevronDown className="w-3.5 h-3.5 text-blue-400" />
                <span>Expandir Perfis</span>
              </button>

              <button
                type="button"
                onClick={() => setProfilesMenuOpen((v) => !v)}
                className="px-2.5 py-1 rounded-lg text-xs font-semibold text-slate-300 hover:text-white bg-slate-900 hover:bg-slate-800 border border-slate-800 transition flex items-center gap-1 cursor-pointer"
                title="Abrir menu de expandir/recolher"
              >
                <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
                <span>Recolher Perfis</span>
              </button>

              {profilesMenuOpen && (
                <>
                  <div className="fixed inset-0 z-20" onClick={() => setProfilesMenuOpen(false)} />
                  <div className="absolute left-0 sm:left-3 top-full mt-1.5 z-30 min-w-[11rem] rounded-lg border border-slate-700 bg-slate-900 shadow-xl p-1 flex flex-col">
                    <button
                      type="button"
                      onClick={() => {
                        expandAllCards();
                        setProfilesMenuOpen(false);
                      }}
                      className="px-3 py-1.5 rounded-md text-xs font-semibold text-left text-slate-200 hover:bg-slate-800 flex items-center gap-2 cursor-pointer"
                    >
                      <ChevronDown className="w-3.5 h-3.5 text-blue-400" />
                      Expandir Empresas
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        collapseAllCards();
                        setProfilesMenuOpen(false);
                      }}
                      className="px-3 py-1.5 rounded-md text-xs font-semibold text-left text-slate-200 hover:bg-slate-800 flex items-center gap-2 cursor-pointer"
                    >
                      <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
                      Recolher Empresas
                    </button>
                  </div>
                </>
              )}

              <button
                type="button"
                onClick={() => setShowLowRelevance((v) => !v)}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition flex items-center gap-1 cursor-pointer ${
                  showLowRelevance
                    ? 'text-amber-200 bg-amber-950/50 border-amber-700/60'
                    : 'text-slate-300 hover:text-white bg-slate-900 hover:bg-slate-800 border-slate-800'
                }`}
                title="Mostrar (ou esconder) os contatos de baixa relevância (geral / outra finalidade) já abertos dentro de cada empresa"
              >
                {showLowRelevance ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
                <span>Baixa relevância</span>
              </button>
            </div>
          )}
        </div>

        {/* Dropdowns: e-mail (antes do @) e vagas */}
        {generatedItems.length > 0 && (
          <div className="flex flex-wrap items-center gap-3 bg-slate-950/70 p-3 rounded-xl border border-slate-800">
            <label className="flex items-center gap-2 text-[11px] text-slate-400 font-semibold">
              E-mail:
              <select
                value={filterEmailPrefix}
                onChange={(e) => setFilterEmailPrefix(e.target.value)}
                className="bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500 max-w-[16rem] cursor-pointer"
              >
                <option value="all">Todos</option>
                {emailPrefixOptions.map(({ prefix, count }) => (
                  <option key={prefix} value={prefix}>
                    {prefix}@ - ({count})
                  </option>
                ))}
              </select>
            </label>

            <label className="flex items-center gap-2 text-[11px] text-slate-400 font-semibold">
              Vaga:
              <select
                value={filterJob}
                onChange={(e) => setFilterJob(e.target.value)}
                className="bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500 max-w-[16rem] cursor-pointer"
              >
                <option value="all">Todas</option>
                {jobFilterOptions.spontaneous > 0 && (
                  <option value="spontaneous">Candidatura Espontânea - ({jobFilterOptions.spontaneous})</option>
                )}
                {jobFilterOptions.groups.map((g) => (
                  <optgroup key={g.companyId} label={g.companyName}>
                    {g.jobs.map((j) => (
                      <option key={`${g.companyId}::${j.title}`} value={`${g.companyId}::${j.title}`}>
                        {j.title} - ({j.count})
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>

            {hasActiveFilters && (
              <button
                type="button"
                onClick={() => {
                  setFilterEmailPrefix('all');
                  setFilterJob('all');
                }}
                className="px-2.5 py-1 rounded-lg text-xs font-semibold text-slate-300 hover:text-white bg-slate-900 hover:bg-slate-800 border border-slate-800 cursor-pointer"
              >
                Limpar filtros
              </button>
            )}
          </div>
        )}

        {/* Bulk Selection & Multi-Discard Bar */}
        {filteredMaterials.length > 0 && (
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-slate-900/90 p-3 rounded-xl border border-slate-800 shadow-md">
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={handleSelectAllFiltered}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-950 hover:bg-slate-800 text-slate-200 border border-slate-700/80 hover:border-slate-600 transition flex items-center gap-2 cursor-pointer shadow-sm active:scale-95"
                title={
                  filteredMaterials.every(({ contact }) => selectedContactIds.has(contact.id))
                    ? 'Desmarcar todas as candidaturas visíveis'
                    : 'Selecionar todas as candidaturas visíveis'
                }
              >
                {filteredMaterials.length > 0 &&
                filteredMaterials.every(({ contact }) => selectedContactIds.has(contact.id)) ? (
                  <CheckSquare className="w-4 h-4 text-rose-400" />
                ) : (
                  <Square className="w-4 h-4 text-slate-400" />
                )}
                <span>
                  {filteredMaterials.length > 0 &&
                  filteredMaterials.every(({ contact }) => selectedContactIds.has(contact.id))
                    ? 'Desmarcar Todos'
                    : `Selecionar Todos (${filteredMaterials.length})`}
                </span>
              </button>

              {selectedContactIds.size > 0 ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono font-bold bg-rose-500/15 text-rose-300 border border-rose-500/30">
                  <span className="w-2 h-2 rounded-full bg-rose-400 animate-pulse" />
                  {selectedContactIds.size} selecionado(s)
                </span>
              ) : (
                <span className="text-[11px] text-slate-400 hidden sm:inline">
                  Marque as caixas (por contato ou por empresa) para descartar ou marcar vários contatos ao mesmo tempo.
                </span>
              )}
            </div>

            {/* Actions for Selected or Filtered Items */}
            <div className="flex flex-wrap items-center gap-2 self-end lg:self-auto">
              {selectedContactIds.size > 0 ? (
                <>
                  <button
                    type="button"
                    disabled={isBulkOperating}
                    onClick={handleBulkDiscard}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-rose-600 hover:bg-rose-500 disabled:opacity-50 transition flex items-center gap-1.5 shadow-md shadow-rose-600/25 cursor-pointer active:scale-95"
                    title="Descartar todos os contatos selecionados de uma só vez (1 clique direto, sem modal)"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Descartar ({selectedContactIds.size})</span>
                  </button>

                  <button
                    type="button"
                    disabled={isBulkOperating}
                    onClick={handleBulkMarkContacted}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 transition flex items-center gap-1.5 shadow-md shadow-emerald-600/25 cursor-pointer active:scale-95"
                    title="Marcar todos os selecionados como Contactados sem sair desta página"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Contactados ({selectedContactIds.size})</span>
                  </button>

                  <button
                    type="button"
                    disabled={isBulkOperating}
                    onClick={handleBulkOpenGmail}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold text-red-200 bg-red-950/70 hover:bg-red-900 border border-red-700/70 disabled:opacity-50 transition flex items-center gap-1.5 shadow-sm cursor-pointer active:scale-95"
                    title="Abre uma aba do Gmail já preenchida para cada selecionado pendente (no idioma escolhido). Você revisa e envia manualmente."
                  >
                    <Send className="w-3.5 h-3.5 text-red-400" />
                    <span>Gmail{langPreference === 'both' ? '' : ` ${langPreference.toUpperCase()}`} ({selectedContactIds.size})</span>
                  </button>

                  <div className="h-5 w-[1px] bg-slate-800 mx-1 hidden sm:block" />

                  <button
                    type="button"
                    disabled={isExporting}
                    onClick={() => handleExportTxt('selected')}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold text-blue-300 bg-blue-950/70 hover:bg-blue-900 border border-blue-800/80 transition flex items-center gap-1.5 shadow-sm cursor-pointer active:scale-95"
                    title={`Exportar apenas as ${selectedContactIds.size} candidaturas selecionadas em arquivo .TXT`}
                  >
                    <FileText className="w-3.5 h-3.5 text-blue-400" />
                    <span>Exportar TXT ({selectedContactIds.size})</span>
                  </button>

                  <button
                    type="button"
                    disabled={isExporting}
                    onClick={() => handleExportZip('selected')}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold text-indigo-200 bg-indigo-950/80 hover:bg-indigo-900 border border-indigo-700/80 transition flex items-center gap-1.5 shadow-sm cursor-pointer active:scale-95"
                    title={`Exportar apenas as ${selectedContactIds.size} candidaturas selecionadas em arquivo .ZIP organizado`}
                  >
                    {isExporting ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-400" />
                    ) : (
                      <Archive className="w-3.5 h-3.5 text-indigo-400" />
                    )}
                    <span>Exportar ZIP ({selectedContactIds.size})</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSelectedContactIds(new Set())}
                    className="px-2.5 py-1.5 text-xs text-slate-400 hover:text-white hover:underline cursor-pointer"
                  >
                    Limpar
                  </button>
                </>
              ) : (
                <>
                  {pendingOutraFinalidade.length > 0 && (
                    <button
                      type="button"
                      disabled={isBulkOperating}
                      onClick={handleDiscardAllOutraFinalidade}
                      className="px-3 py-1.5 rounded-lg text-xs font-bold text-rose-300 bg-rose-950/50 hover:bg-rose-900/80 border border-rose-800/60 disabled:opacity-50 transition flex items-center gap-1.5 shadow-sm cursor-pointer active:scale-95"
                      title="Descartar de uma vez todos os contatos pendentes classificados como Outra finalidade (legal@, abuse@, bugs@...)"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                      <span>Descartar todos de "Outra finalidade" ({pendingOutraFinalidade.length})</span>
                    </button>
                  )}

                  <button
                    type="button"
                    disabled={isExporting}
                    onClick={() => handleExportTxt('filtered')}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold text-blue-300 bg-blue-950/50 hover:bg-blue-900/80 border border-blue-800/60 transition flex items-center gap-1.5 shadow-sm cursor-pointer active:scale-95"
                    title={`Exportar todas as ${filteredMaterials.length} candidaturas visíveis na busca/filtros em arquivo .TXT`}
                  >
                    <FileText className="w-3.5 h-3.5 text-blue-400" />
                    <span>Exportar Filtrados (.TXT) ({filteredMaterials.length})</span>
                  </button>

                  <button
                    type="button"
                    disabled={isExporting}
                    onClick={() => handleExportZip('filtered')}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold text-indigo-300 bg-indigo-950/60 hover:bg-indigo-900/80 border border-indigo-800/60 transition flex items-center gap-1.5 shadow-sm cursor-pointer active:scale-95"
                    title={`Exportar todas as ${filteredMaterials.length} candidaturas visíveis na busca/filtros em arquivo .ZIP organizado`}
                  >
                    {isExporting ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-400" />
                    ) : (
                      <Archive className="w-3.5 h-3.5 text-indigo-400" />
                    )}
                    <span>Exportar Filtrados (.ZIP) ({filteredMaterials.length})</span>
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {/* Empty State */}
        {generatedItems.length === 0 && (
          <div className="p-10 text-center rounded-2xl bg-slate-950/40 border border-dashed border-slate-800 space-y-3">
            <FileText className="w-10 h-10 text-slate-600 mx-auto" />
            <div className="text-sm font-bold text-slate-300">
              Nenhum material de candidatura gerado ainda
            </div>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              Inicie a pesquisa na aba <strong>2. Execução & Logs</strong> ou use a opção <strong>"Gerar Materiais Pendentes"</strong> para produzir Cold Emails e Cartas em Português e Inglês automaticamente.
            </p>
          </div>
        )}

        {/* Search returned 0 */}
        {generatedItems.length > 0 && filteredMaterials.length === 0 && (
          <div className="p-8 text-center rounded-xl bg-slate-950/40 border border-slate-800 text-xs text-slate-400">
            Nenhum material corresponde à busca/filtros atuais.
          </div>
        )}

        {/* Lista de candidaturas agrupada por empresa */}
        <div className="space-y-4">
          {companyGroups.map((group) => renderCompanyGroup(group))}
        </div>

        {/* Navigation Footer: Explicit Next Steps (never automatic!) */}
        {generatedItems.length > 0 && (
          <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs shadow-lg">
            <div className="text-slate-300 flex items-center gap-2">
              <span className="font-semibold text-white">Progresso dos Envios:</span>
              <span className="text-emerald-400 font-bold font-mono">{contactedCount}</span> contactado(s),
              <span className="text-amber-400 font-bold font-mono">{pendingCount}</span> pendente(s).
              <span className="text-slate-400 hidden md:inline">Você continua nesta tela para enviar os demais contatos com calma.</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {onNavigateToTracking && (
                <button
                  type="button"
                  onClick={onNavigateToTracking}
                  className="px-3.5 py-2 rounded-lg text-xs font-semibold text-slate-200 bg-slate-800 hover:bg-slate-700 hover:text-white border border-slate-700 transition flex items-center gap-1.5 cursor-pointer"
                  title="Acessar o CRM para acompanhar respostas e entrevistas"
                >
                  <TrendingUp className="w-3.5 h-3.5 text-blue-400" />
                  <span>Acessar CRM (Etapa 4)</span>
                </button>
              )}
              {onNavigateToExport && (
                <button
                  type="button"
                  onClick={onNavigateToExport}
                  className="px-3.5 py-2 rounded-lg text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 shadow-md shadow-blue-500/20 transition flex items-center gap-1.5 cursor-pointer"
                  title="Ir para a tela de exportação de planilhas e ZIP"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Ir para Exportação (Etapa 5)</span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Non-intrusive Toast Notification (stays on screen without changing page) */}
      {notificationToast && (
        <div
          className={`fixed bottom-6 right-6 z-50 text-xs font-bold px-4 py-3 rounded-xl shadow-2xl flex items-center gap-2.5 animate-in fade-in slide-in-from-bottom-5 border ${
            notificationToast.type === 'success'
              ? 'bg-emerald-950/95 border-emerald-500/50 text-emerald-200'
              : notificationToast.type === 'warn'
              ? 'bg-amber-950/95 border-amber-500/50 text-amber-200'
              : 'bg-slate-900/95 border-slate-700 text-slate-200'
          }`}
        >
          {notificationToast.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
          )}
          <span>{notificationToast.message}</span>
        </div>
      )}

      {/* Central de Monitoramento e Auditoria de Vagas Modal */}
      {isVacanciesModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in"
          onClick={() => setIsVacanciesModalOpen(false)}
        >
          <div
            className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-900/70">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
                  <Briefcase className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                    Central de Monitoramento & Auditoria de Vagas
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                      {allVacanciesList.length} vagas
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Verificação automática de duplicidade e controle de versões das oportunidades encontradas.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsVacanciesModalOpen(false)}
                className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Audit Policy Notice Banner */}
            <div className="px-5 py-3 bg-cyan-950/30 border-b border-cyan-900/40 flex items-start gap-2.5 text-xs text-cyan-200">
              <ShieldCheck className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
              <div>
                <strong>Regra de Auditoria Automática:</strong> Antes de incluir novas vagas, o agente verifica se a vaga já existe. Se for repetição idêntica, ela é <strong>automaticamente ignorada e não listada</strong>. Se tiver sido modificada (link atualizado, requisitos ou descrição alterada), ela é <strong>atualizada e marcada com histórico de modificação</strong>.
              </div>
            </div>

            {/* Filter and Search Bar */}
            <div className="p-4 border-b border-slate-800/80 bg-slate-950/40 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="relative w-full sm:w-72">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={vacancySearch}
                  onChange={(e) => setVacancySearch(e.target.value)}
                  placeholder="Buscar por vaga ou empresa..."
                  className="w-full bg-slate-900 border border-slate-700/80 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div className="flex items-center gap-1.5 self-start sm:self-auto">
                <button
                  type="button"
                  onClick={() => setVacancyFilterType('all')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                    vacancyFilterType === 'all'
                      ? 'bg-cyan-600 text-white shadow-sm'
                      : 'bg-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  Todas ({allVacanciesList.length})
                </button>
                <button
                  type="button"
                  onClick={() => setVacancyFilterType('modified')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1 ${
                    vacancyFilterType === 'modified'
                      ? 'bg-amber-600 text-white shadow-sm'
                      : 'bg-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  <Sparkles className="w-3 h-3 text-amber-300" />
                  Modificadas ({modifiedVacanciesCount})
                </button>
                <button
                  type="button"
                  onClick={() => setVacancyFilterType('original')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                    vacancyFilterType === 'original'
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'bg-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  Originais ({allVacanciesList.length - modifiedVacanciesCount})
                </button>
              </div>
            </div>

            {/* Vacancies List */}
            <div className="p-5 overflow-y-auto space-y-3 flex-1">
              {(() => {
                const q = vacancySearch.toLowerCase().trim();
                const filtered = allVacanciesList.filter(({ vacancy, company }) => {
                  const matchSearch =
                    !q ||
                    vacancy.title.toLowerCase().includes(q) ||
                    company.name.toLowerCase().includes(q) ||
                    (vacancy.description && vacancy.description.toLowerCase().includes(q));

                  const matchType =
                    vacancyFilterType === 'all' ||
                    (vacancyFilterType === 'modified' && vacancy.isModified) ||
                    (vacancyFilterType === 'original' && !vacancy.isModified);

                  return matchSearch && matchType;
                });

                if (filtered.length === 0) {
                  return (
                    <div className="text-center py-12 text-slate-500 text-sm">
                      Nenhuma vaga encontrada para os filtros aplicados.
                    </div>
                  );
                }

                return filtered.map(({ vacancy, company }, idx) => (
                  <div
                    key={vacancy.id || idx}
                    className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-2 hover:border-slate-700 transition"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                      <div className="space-y-1 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-bold text-slate-400 flex items-center gap-1">
                            <Building2 className="w-3.5 h-3.5 text-blue-400" />
                            {company.name}
                          </span>
                          <span className="text-slate-600">•</span>
                          <h4 className="font-bold text-white text-sm">
                            {vacancy.title}
                          </h4>
                          {vacancy.isModified ? (
                            <span
                              className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-1"
                              title="Esta vaga foi modificada desde a primeira detecção e devidamente atualizada"
                            >
                              <Sparkles className="w-3 h-3 text-amber-400" />
                              Modificada / Atualizada
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                              Ativa
                            </span>
                          )}
                        </div>

                        {vacancy.modificationDetails && (
                          <div className="text-[11px] text-amber-400/90 font-medium bg-amber-950/20 px-2 py-1 rounded border border-amber-900/30">
                            Histórico de alteração: {vacancy.modificationDetails}
                          </div>
                        )}

                        {vacancy.description && (
                          <p className="text-xs text-slate-400 line-clamp-2 mt-1">
                            {vacancy.description}
                          </p>
                        )}
                      </div>

                      {vacancy.url && (
                        <a
                          href={vacancy.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          data-url={vacancy.url}
                          title="Abrir página oficial da vaga"
                          className="shrink-0 p-2 rounded-lg bg-blue-600/15 border border-blue-500/30 text-blue-400 hover:bg-blue-600 hover:text-white transition flex items-center gap-1 text-xs font-semibold self-start"
                        >
                          Acessar Vaga <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center justify-between text-[10px] text-slate-500 font-mono pt-2 border-t border-slate-900 gap-2">
                      <div className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        <span>Disponível em {company.normalizedUrl}</span>
                      </div>
                      {vacancy.updatedAt && (
                        <span>Última checagem: {new Date(vacancy.updatedAt).toLocaleString('pt-BR')}</span>
                      )}
                    </div>
                  </div>
                ));
              })()}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-800 flex items-center justify-between bg-slate-900/70">
              <span className="text-xs text-slate-400 font-medium">
                {allVacanciesList.length} vagas mapeadas no total ({modifiedVacanciesCount} modificadas e atualizadas)
              </span>
              <button
                type="button"
                onClick={() => setIsVacanciesModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold transition cursor-pointer"
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
