import React, { useState, useEffect } from 'react';
import {
  Users,
  Building2,
  Mail,
  ExternalLink,
  Calendar,
  Clock,
  CheckCircle2,
  AlertCircle,
  FileText,
  Search,
  Filter,
  Download,
  Trash2,
  Edit3,
  Save,
  MessageSquare,
  Sparkles,
  ArrowRight,
  TrendingUp,
  Award,
  XCircle,
  ChevronDown,
  ChevronUp,
  X,
  Copy,
  Check,
} from 'lucide-react';
import { TrackedContactRecord, OutreachStatus, SessionState } from '../types/index.js';

interface TrackingDashboardProps {
  session: SessionState | null;
  onNavigateToResults?: () => void;
}

const STATUS_CONFIG: Record<
  OutreachStatus,
  { label: string; bg: string; text: string; border: string; icon: React.FC<{ className?: string }> }
> = {
  contacted: {
    label: 'Contactado / E-mail Enviado',
    bg: 'bg-emerald-500/10',
    text: 'text-emerald-400',
    border: 'border-emerald-500/30',
    icon: CheckCircle2,
  },
  interview: {
    label: 'Entrevista Agendada',
    bg: 'bg-blue-500/10',
    text: 'text-blue-400',
    border: 'border-blue-500/30',
    icon: Calendar,
  },
  offer: {
    label: 'Oferta Recebida',
    bg: 'bg-amber-500/10',
    text: 'text-amber-400',
    border: 'border-amber-500/30',
    icon: Award,
  },
  rejected: {
    label: 'Rejeitado / Sem Retorno',
    bg: 'bg-slate-500/10',
    text: 'text-slate-400',
    border: 'border-slate-500/30',
    icon: XCircle,
  },
  discarded: {
    label: 'Descartado',
    bg: 'bg-rose-500/10',
    text: 'text-rose-400',
    border: 'border-rose-500/30',
    icon: AlertCircle,
  },
  pending: {
    label: 'Pendente / Não Contactado',
    bg: 'bg-slate-800/40',
    text: 'text-slate-400',
    border: 'border-slate-700',
    icon: Clock,
  },
};

export const TrackingDashboard: React.FC<TrackingDashboardProps> = ({
  session,
  onNavigateToResults,
}) => {
  const [contacts, setContacts] = useState<TrackedContactRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [filterStatus, setFilterStatus] = useState<OutreachStatus | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [editingNotesId, setEditingNotesId] = useState<string | null>(null);
  const [notesDraft, setNotesDraft] = useState<string>('');
  const [interviewDateDraft, setInterviewDateDraft] = useState<string>('');
  const [viewingMaterialsContact, setViewingMaterialsContact] = useState<TrackedContactRecord | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Fetch all tracked contacts from database
  const loadTrackedContacts = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/tracking${session?.sessionId ? `?sessionId=${encodeURIComponent(session.sessionId)}` : ''}`);
      if (res.ok) {
        const data = await res.json();
        setContacts(data.contacts || []);
      }
    } catch (err) {
      console.error('Error loading tracked contacts:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTrackedContacts();
  }, [session?.sessionId]);

  const handleUpdateStatus = async (id: string, newStatus: OutreachStatus) => {
    try {
      const updates: any = {
        id,
        status: newStatus,
        sessionId: session?.sessionId,
      };

      if (newStatus === 'contacted') {
        updates.contactedAt = new Date().toISOString();
      } else if (newStatus === 'discarded') {
        updates.discardedAt = new Date().toISOString();
      }

      const res = await fetch('/api/tracking/update-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });

      if (res.ok) {
        const data = await res.json();
        setContacts((prev) =>
          prev.map((c) => (c.id === id ? { ...c, ...data.contact } : c))
        );
      }
    } catch (err) {
      console.error('Error updating status:', err);
    }
  };

  const handleSaveNotes = async (id: string) => {
    try {
      const res = await fetch('/api/tracking/update-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id,
          notes: notesDraft,
          interviewAt: interviewDateDraft || undefined,
          sessionId: session?.sessionId,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setContacts((prev) =>
          prev.map((c) => (c.id === id ? { ...c, ...data.contact } : c))
        );
        setEditingNotesId(null);
      }
    } catch (err) {
      console.error('Error saving notes:', err);
    }
  };

  const handleDeleteContact = async (id: string) => {
    if (!window.confirm('Deseja remover este contato do histórico de acompanhamento?')) return;
    try {
      const res = await fetch(`/api/tracking/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setContacts((prev) => prev.filter((c) => c.id !== id));
      }
    } catch (err) {
      console.error('Error deleting contact:', err);
    }
  };

  const handleCopy = (key: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  // Metrics calculation
  const totalTracked = contacts.length;
  const contactedCount = contacts.filter((c) => c.status === 'contacted').length;
  const interviewCount = contacts.filter((c) => c.status === 'interview').length;
  const offerCount = contacts.filter((c) => c.status === 'offer').length;
  const rejectedCount = contacts.filter((c) => c.status === 'rejected').length;
  const discardedCount = contacts.filter((c) => c.status === 'discarded').length;

  // Filtered contacts
  const filteredContacts = contacts.filter((contact) => {
    if (filterStatus !== 'all' && contact.status !== filterStatus) {
      return false;
    }
    if (searchQuery.trim().length > 0) {
      const q = searchQuery.toLowerCase();
      const matchComp = contact.companyName.toLowerCase().includes(q);
      const matchEmail = contact.email.toLowerCase().includes(q);
      const matchJob = (contact.associatedJobTitle || '').toLowerCase().includes(q);
      const matchNotes = (contact.notes || '').toLowerCase().includes(q);
      const matchReason = (contact.discardReason || '').toLowerCase().includes(q);
      return matchComp || matchEmail || matchJob || matchNotes || matchReason;
    }
    return true;
  });

  // Export to CSV
  const handleExportCsv = () => {
    const headers = [
      'Empresa',
      'Site',
      'E-mail',
      'Status',
      'Vaga',
      'Data Contactado',
      'Data Descarte',
      'Data Entrevista',
      'Motivo Descarte',
      'Anotações / Feedback',
    ];

    const rows = filteredContacts.map((c) => [
      `"${c.companyName}"`,
      `"${c.site}"`,
      `"${c.email}"`,
      `"${c.status}"`,
      `"${c.associatedJobTitle || ''}"`,
      `"${c.contactedAt ? new Date(c.contactedAt).toLocaleString('pt-BR') : ''}"`,
      `"${c.discardedAt ? new Date(c.discardedAt).toLocaleString('pt-BR') : ''}"`,
      `"${c.interviewAt ? new Date(c.interviewAt).toLocaleString('pt-BR') : ''}"`,
      `"${(c.discardReason || '').replace(/"/g, '""')}"`,
      `"${(c.notes || '').replace(/"/g, '""')}"`,
    ]);

    const csvContent = '\uFEFF' + [headers.join(';'), ...rows.map((r) => r.join(';'))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `crm_acompanhamento_candidaturas_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const formatDate = (isoDate?: string) => {
    if (!isoDate) return 'Não registrada';
    try {
      const d = new Date(isoDate);
      return d.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return isoDate;
    }
  };

  const getDaysAgo = (isoDate?: string) => {
    if (!isoDate) return '';
    const diff = Date.now() - new Date(isoDate).getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    if (days === 0) return 'Hoje';
    if (days === 1) return 'Ontem';
    return `Há ${days} dias`;
  };

  return (
    <div className="w-full min-w-0 space-y-6">
      {/* Top Banner & Title */}
      <div className="flex min-w-0 flex-col xl:flex-row xl:items-center justify-between gap-4 bg-slate-900/60 p-3 sm:p-5 rounded-2xl border border-slate-800">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
            <h2 className="min-w-0 flex flex-wrap items-center gap-2 text-base sm:text-lg font-bold leading-tight text-white">
              <TrendingUp className="w-5 h-5 text-emerald-400" />
              CRM & Acompanhamento de Candidaturas
            </h2>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Gerenciamento persistente de todos os contatos realizados, entrevistas agendadas, retornos e motivos de descarte.
          </p>
        </div>

        <div className="flex max-w-full flex-wrap items-center gap-2 xl:shrink-0">
          {onNavigateToResults && (
            <button
              type="button"
              onClick={onNavigateToResults}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 transition flex items-center gap-1.5"
            >
              <FileText className="w-3.5 h-3.5 text-blue-400" />
              <span>Ver Materiais Gerados</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleExportCsv}
            disabled={filteredContacts.length === 0}
            className="px-3.5 py-1.5 rounded-lg text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 transition flex items-center gap-1.5 shadow-md shadow-emerald-500/20"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Exportar CRM (.CSV)</span>
          </button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-2 sm:gap-3">
        <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800">
          <span className="text-[11px] font-semibold text-slate-400 block">Total Rastreado</span>
          <span className="text-2xl font-bold font-mono text-white mt-1 block">{totalTracked}</span>
          <span className="text-[10px] text-slate-500 mt-0.5 block">No banco de dados</span>
        </div>

        <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25">
          <span className="text-[11px] font-semibold text-emerald-400 block flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" /> Contactados
          </span>
          <span className="text-2xl font-bold font-mono text-emerald-300 mt-1 block">{contactedCount}</span>
          <span className="text-[10px] text-emerald-400/80 mt-0.5 block">E-mails enviados</span>
        </div>

        <div className="p-3.5 rounded-xl bg-blue-500/10 border border-blue-500/25">
          <span className="text-[11px] font-semibold text-blue-400 block flex items-center gap-1">
            <Calendar className="w-3 h-3" /> Entrevistas
          </span>
          <span className="text-2xl font-bold font-mono text-blue-300 mt-1 block">{interviewCount}</span>
          <span className="text-[10px] text-blue-400/80 mt-0.5 block">Em processo</span>
        </div>

        <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/25">
          <span className="text-[11px] font-semibold text-amber-400 block flex items-center gap-1">
            <Award className="w-3 h-3" /> Ofertas
          </span>
          <span className="text-2xl font-bold font-mono text-amber-300 mt-1 block">{offerCount}</span>
          <span className="text-[10px] text-amber-400/80 mt-0.5 block">Propostas</span>
        </div>

        <div className="p-3.5 rounded-xl bg-slate-500/10 border border-slate-500/25">
          <span className="text-[11px] font-semibold text-slate-400 block flex items-center gap-1">
            <XCircle className="w-3 h-3" /> Rejeitados
          </span>
          <span className="text-2xl font-bold font-mono text-slate-300 mt-1 block">{rejectedCount}</span>
          <span className="text-[10px] text-slate-500 mt-0.5 block">Sem avanço</span>
        </div>

        <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/25">
          <span className="text-[11px] font-semibold text-rose-400 block flex items-center gap-1">
            <AlertCircle className="w-3 h-3" /> Descartados
          </span>
          <span className="text-2xl font-bold font-mono text-rose-300 mt-1 block">{discardedCount}</span>
          <span className="text-[10px] text-rose-400/80 mt-0.5 block">Com justificativa</span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 bg-slate-950/70 p-3 rounded-xl border border-slate-800">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar por empresa, e-mail, vaga, anotações ou motivo..."
            className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1">
          {(
            [
              { id: 'all', label: 'Todos' },
              { id: 'contacted', label: 'Contactados' },
              { id: 'interview', label: 'Entrevistas' },
              { id: 'offer', label: 'Ofertas' },
              { id: 'rejected', label: 'Rejeitados' },
              { id: 'discarded', label: 'Descartados' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilterStatus(tab.id)}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${
                filterStatus === tab.id
                  ? 'bg-blue-600 text-white shadow'
                  : 'text-slate-400 hover:text-white bg-slate-900 border border-slate-800'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Contacts List */}
      {loading ? (
        <div className="p-12 text-center text-slate-400 text-xs">Carregando contatos salvos...</div>
      ) : filteredContacts.length === 0 ? (
        <div className="p-10 text-center rounded-2xl bg-slate-950/40 border border-dashed border-slate-800 space-y-3">
          <Users className="w-10 h-10 text-slate-600 mx-auto" />
          <div className="text-sm font-bold text-slate-300">
            Nenhum contato encontrado no acompanhamento
          </div>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Vá até a aba <strong>3. Contatos & Materiais</strong> e clique em <strong>"✓ Marcar como Contactado"</strong> ou <strong>"✕ Descartar"</strong> para registrar o envio e acompanhar os processos aqui.
          </p>
          {onNavigateToResults && (
            <button
              type="button"
              onClick={onNavigateToResults}
              className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 transition shadow-md shadow-blue-500/25"
            >
              <span>Ir para Contatos & Materiais</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {filteredContacts.map((contact) => {
            const config = STATUS_CONFIG[contact.status] || STATUS_CONFIG.pending;
            const StatusIcon = config.icon;
            const isEditing = editingNotesId === contact.id;

            return (
              <div
                key={contact.id}
                data-company-url={contact.site}
                data-company-name={contact.companyName}
                title="Dica: Clique com o botão do meio para abrir o site da empresa em nova aba"
                className={`bg-slate-950/80 rounded-2xl border p-4 sm:p-5 transition shadow-lg space-y-4 ${
                  contact.status === 'contacted'
                    ? 'border-emerald-500/40 hover:border-emerald-500/60'
                    : contact.status === 'discarded'
                    ? 'border-rose-500/40 hover:border-rose-500/60'
                    : contact.status === 'interview'
                    ? 'border-blue-500/40 hover:border-blue-500/60'
                    : contact.status === 'offer'
                    ? 'border-amber-500/40 hover:border-amber-500/60'
                    : 'border-slate-800 hover:border-slate-700'
                }`}
              >
                {/* Header Row */}
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className="text-sm font-bold text-white flex items-center gap-1.5 hover:text-blue-300 transition cursor-pointer"
                        data-url={contact.site}
                        title="Clique com o botão do meio para abrir o site da empresa em nova aba"
                      >
                        <Building2 className="w-4 h-4 text-blue-400 shrink-0" />
                        {contact.companyName}
                      </span>

                      {contact.site && (
                        <a
                          href={contact.site}
                          target="_blank"
                          rel="noreferrer"
                          data-url={contact.site}
                          title="Abrir site (ou botão do meio)"
                          className="text-[11px] text-slate-400 hover:text-blue-400 flex items-center gap-0.5 truncate max-w-xs"
                        >
                          <ExternalLink className="w-3 h-3" />
                          {contact.site.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                        </a>
                      )}

                      {/* Current Status Pill */}
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${config.bg} ${config.text} ${config.border}`}
                      >
                        <StatusIcon className="w-3.5 h-3.5" />
                        {config.label}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-300">
                      <span
                        className="font-mono text-cyan-300 flex items-center gap-1 font-semibold hover:text-cyan-200 cursor-pointer"
                        data-url={`mailto:${contact.email}`}
                        data-email={contact.email}
                        title="E-mail de contato • Clique com o botão do meio para abrir novo e-mail"
                      >
                        <Mail className="w-3.5 h-3.5 text-cyan-400" />
                        {contact.email}
                      </span>
                      <span>•</span>
                      <span className="text-slate-400">
                        {contact.associatedJobTitle ? (
                          contact.associatedJobUrl ? (
                            <a
                              href={contact.associatedJobUrl}
                              target="_blank"
                              rel="noreferrer"
                              data-url={contact.associatedJobUrl}
                              title="Abrir link da vaga (ou botão do meio)"
                              className="text-emerald-400 hover:underline flex items-center gap-1 font-semibold"
                            >
                              <span>Vaga: {contact.associatedJobTitle}</span>
                              <ExternalLink className="w-2.5 h-2.5" />
                            </a>
                          ) : (
                            <span className="text-emerald-400 font-semibold">
                              Vaga: {contact.associatedJobTitle}
                            </span>
                          )
                        ) : (
                          <span className="text-slate-400 italic">Candidatura Espontânea</span>
                        )}
                      </span>
                    </div>
                  </div>

                  {/* Actions & Dates */}
                  <div className="flex flex-wrap items-center gap-2 self-start lg:self-auto">
                    {/* View Sent Material */}
                    {contact.materials && (
                      <button
                        type="button"
                        onClick={() => setViewingMaterialsContact(contact)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-blue-300 border border-slate-700 transition"
                        title="Ver o Cold Email e Carta enviados para esta empresa"
                      >
                        <FileText className="w-3.5 h-3.5 text-blue-400" />
                        <span>Ver Material Enviado</span>
                      </button>
                    )}

                    {/* Delete Contact */}
                    <button
                      type="button"
                      onClick={() => handleDeleteContact(contact.id)}
                      className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-slate-900 border border-slate-800 transition"
                      title="Excluir do acompanhamento"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Status Bar & Timestamp Summary */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 bg-slate-900/60 p-3 rounded-xl border border-slate-800/80 text-xs">
                  <div>
                    <span className="text-[10px] text-slate-400 block font-semibold">Contactado em:</span>
                    <span className="font-mono text-emerald-300 block font-semibold mt-0.5">
                      {contact.contactedAt ? (
                        <>
                          {formatDate(contact.contactedAt)}{' '}
                          <span className="text-[10px] text-slate-500 font-sans">({getDaysAgo(contact.contactedAt)})</span>
                        </>
                      ) : (
                        <span className="text-slate-500 italic">Ainda não contactado</span>
                      )}
                    </span>
                  </div>

                  <div>
                    <span className="text-[10px] text-slate-400 block font-semibold">Entrevista Agendada:</span>
                    <span className="font-mono text-blue-300 block font-semibold mt-0.5">
                      {contact.interviewAt ? (
                        formatDate(contact.interviewAt)
                      ) : (
                        <span className="text-slate-500 italic">Nenhuma marcada</span>
                      )}
                    </span>
                  </div>

                  <div>
                    <span className="text-[10px] text-slate-400 block font-semibold">Data de Descarte:</span>
                    <span className="font-mono text-rose-300 block font-semibold mt-0.5">
                      {contact.discardedAt ? (
                        formatDate(contact.discardedAt)
                      ) : (
                        <span className="text-slate-500 italic">Não descartado</span>
                      )}
                    </span>
                  </div>

                  {/* Quick Status Changer Dropdown */}
                  <div>
                    <span className="text-[10px] text-slate-400 block font-semibold mb-1">Mudar Status do Processo:</span>
                    <select
                      value={contact.status}
                      onChange={(e) => handleUpdateStatus(contact.id, e.target.value as OutreachStatus)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-slate-200 font-semibold focus:outline-none focus:border-blue-500"
                    >
                      <option value="contacted">✓ Contactado (E-mail enviado)</option>
                      <option value="interview">★ Entrevista Agendada</option>
                      <option value="offer">🏆 Oferta Recebida</option>
                      <option value="rejected">✕ Rejeitado / Sem Retorno</option>
                      <option value="discarded">🚫 Descartado</option>
                      <option value="pending">⏳ Pendente</option>
                    </select>
                  </div>
                </div>

                {/* Discard Reason Alert (if discarded) */}
                {contact.discardReason && (
                  <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/25 text-rose-300 text-xs flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                    <div>
                      <strong className="block font-semibold">Motivo do Descarte:</strong>
                      <p className="text-rose-200 mt-0.5">{contact.discardReason}</p>
                    </div>
                  </div>
                )}

                {/* Notes and Comments Section */}
                <div className="bg-slate-900/40 p-3.5 rounded-xl border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                      <MessageSquare className="w-3.5 h-3.5 text-blue-400" />
                      Anotações, Entrevistas & Próximos Passos
                    </span>

                    {!isEditing && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingNotesId(contact.id);
                          setNotesDraft(contact.notes || '');
                          setInterviewDateDraft(contact.interviewAt || '');
                        }}
                        className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"
                      >
                        <Edit3 className="w-3 h-3" />
                        <span>{contact.notes ? 'Editar Anotação' : '+ Adicionar Anotação'}</span>
                      </button>
                    )}
                  </div>

                  {isEditing ? (
                    <div className="space-y-2 pt-1">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div>
                          <label className="text-[11px] text-slate-400 block mb-1">
                            Data/Hora da Entrevista (Opcional):
                          </label>
                          <input
                            type="datetime-local"
                            value={interviewDateDraft}
                            onChange={(e) => setInterviewDateDraft(e.target.value)}
                            className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500 font-mono"
                          />
                        </div>
                      </div>

                      <textarea
                        value={notesDraft}
                        onChange={(e) => setNotesDraft(e.target.value)}
                        placeholder="Ex: Entrevista com RH marcada para quinta às 14h. Falar sobre projetos com Web3 e liderança LATAM..."
                        rows={3}
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500 leading-relaxed placeholder-slate-600"
                      />

                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setEditingNotesId(null)}
                          className="px-3 py-1 rounded-lg text-xs font-semibold text-slate-400 hover:text-white"
                        >
                          Cancelar
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSaveNotes(contact.id)}
                          className="px-3 py-1 rounded-lg text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 flex items-center gap-1"
                        >
                          <Save className="w-3.5 h-3.5" />
                          <span>Salvar Anotação</span>
                        </button>
                      </div>
                    </div>
                  ) : contact.notes ? (
                    <p className="text-xs text-slate-300 whitespace-pre-wrap leading-relaxed bg-slate-950/60 p-2.5 rounded-lg border border-slate-800/80">
                      {contact.notes}
                    </p>
                  ) : (
                    <p className="text-xs text-slate-500 italic">
                      Nenhuma anotação registrada ainda. Clique em "+ Adicionar Anotação" para anotar feedbacks de entrevistas, pretensão salarial e prazos.
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal: View Sent Material */}
      {viewingMaterialsContact && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto p-5 sm:p-6 shadow-2xl relative space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 sticky top-0 bg-slate-900 z-10">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <FileText className="w-5 h-5 text-blue-400" />
                  Materiais Enviados para {viewingMaterialsContact.companyName}
                </h3>
                <span className="text-xs font-mono text-cyan-300">{viewingMaterialsContact.email}</span>
              </div>
              <button
                type="button"
                onClick={() => setViewingMaterialsContact(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {viewingMaterialsContact.materials?.pt ? (
              <div className="space-y-4 text-xs">
                {/* Subject */}
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] text-slate-400 block font-semibold">Assunto:</span>
                    <span className="font-bold text-slate-200">{viewingMaterialsContact.materials.pt.subject}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopy('sub', viewingMaterialsContact.materials?.pt?.subject || '')}
                    className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"
                  >
                    {copiedKey === 'sub' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedKey === 'sub' ? 'Copiado' : 'Copiar'}</span>
                  </button>
                </div>

                {/* Cold Email */}
                <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between border-b border-slate-800/80 pb-1.5">
                    <span className="font-bold text-slate-200">Cold Email</span>
                    <button
                      type="button"
                      onClick={() => handleCopy('cold', viewingMaterialsContact.materials?.pt?.coldEmail || '')}
                      className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"
                    >
                      {copiedKey === 'cold' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedKey === 'cold' ? 'Copiado' : 'Copiar'}</span>
                    </button>
                  </div>
                  <p className="text-slate-300 whitespace-pre-wrap leading-relaxed font-sans">
                    {viewingMaterialsContact.materials.pt.coldEmail}
                  </p>
                </div>

                {/* Cover letter */}
                {viewingMaterialsContact.materials.pt.coverLetter && (
                  <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                    <div className="flex items-center justify-between border-b border-slate-800/80 pb-1.5">
                      <span className="font-bold text-slate-200">Carta de Apresentação (Cover Letter)</span>
                      <button
                        type="button"
                        onClick={() => handleCopy('cover', viewingMaterialsContact.materials?.pt?.coverLetter || '')}
                        className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"
                      >
                        {copiedKey === 'cover' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copiedKey === 'cover' ? 'Copiado' : 'Copiar'}</span>
                      </button>
                    </div>
                    <p className="text-slate-300 whitespace-pre-wrap leading-relaxed font-sans">
                      {viewingMaterialsContact.materials.pt.coverLetter}
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-slate-500 text-xs italic py-4 text-center">
                Materiais detalhados não encontrados para este contato.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
