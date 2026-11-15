import React, { useEffect, useState } from 'react';
import { Briefcase, Sparkles, RefreshCw, FileText, CheckCircle2, ShieldCheck, Save, FolderOpen, Pencil, Trash2, ChevronDown, Play, Pause, Square } from 'lucide-react';
import { SessionState } from '../types/index.js';
import { isCompanyFinished } from '../utils/companyProgress.js';

interface HeaderProps {
  session: SessionState | null;
  onLoadSampleData: () => void;
  onResetSession: () => void;
  onOpenSettings: () => void;
  onSaveProfile: () => void;
  onOpenProfiles: () => void;
  onSelectSession: (session: SessionState) => void;
  onRenameSession: (session: SessionState) => Promise<void>;
  onDeleteSession: (sessionId: string) => Promise<boolean>;
  onCreateSection: () => void;
  onUpdateSession: (session: SessionState) => void;
}

export const Header: React.FC<HeaderProps> = ({
  session,
  onLoadSampleData,
  onResetSession,
  onOpenSettings,
  onSaveProfile,
  onOpenProfiles,
  onSelectSession, onRenameSession, onDeleteSession, onCreateSection, onUpdateSession,
}) => {
  const [sessions, setSessions] = useState<SessionState[]>([]);
  const [open, setOpen] = useState(false);
  const refresh = () => fetch('/api/sessions').then(r => r.json()).then(d => setSessions(d.sessions || [])).catch(() => {});
  useEffect(() => { refresh(); }, [session?.sessionId, session?.status, session?.name]);
  const progress = (s: SessionState) => s.status === 'completed' ? 100 : s.companies.length ? Math.round(s.companies.filter(isCompanyFinished).length / s.companies.length * 100) : 0;
  const statusColor = (s: SessionState) => s.status === 'running' ? 'bg-rose-500' : progress(s) === 100 || s.status === 'completed' ? 'bg-emerald-500' : 'bg-amber-400';
  const controlSession = async (session: SessionState, action: 'start' | 'pause' | 'cancel') => {
    if (action === 'cancel' && !window.confirm(`Parar a seção “${session.name || 'sem nome'}”? O progresso salvo poderá ser retomado depois.`)) return;
    try {
      const res = await fetch(`/api/session/${session.sessionId}/${action}`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok || !data.session) throw new Error(data.error || 'Não foi possível controlar esta seção.');
      onUpdateSession(data.session);
      await refresh();
    } catch (err) { window.alert(err instanceof Error ? err.message : 'Não foi possível controlar esta seção.'); }
  };
  return (
    <header className="border-b border-slate-800 bg-slate-900/90 backdrop-blur sticky top-0 z-30">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 min-h-16 py-2 flex flex-wrap items-center justify-between gap-2">
        {/* Brand */}
        <div
          data-href="/"
          title="RecruitAgent Pro • Dica: Clique com o botão do meio para abrir nova aba"
          className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3 cursor-pointer"
        >
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-cyan-400 flex items-center justify-center shadow-lg shadow-blue-500/20 text-white">
            <Briefcase className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base sm:text-lg font-bold text-white tracking-tight flex items-center gap-1.5">
                RecruitAgent <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 font-medium">Pro</span>
              </h1>
              <span className="hidden md:inline-flex items-center gap-1 text-[11px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                <ShieldCheck className="w-3 h-3" /> Fatos Verificados
              </span>
              <span className="hidden lg:inline-flex items-center gap-1 text-[11px] text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded border border-purple-500/20">
                ChatGPT & Gemini (PT/EN)
              </span>
            </div>
            <p className="text-xs text-slate-400 hidden sm:block">
              Pesquisa de contatos de recrutamento & geração factual de candidaturas com IA
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex max-w-full flex-wrap items-center justify-end gap-1.5 sm:gap-2 sm:gap-3">
          <div className="relative">
            <button type="button" onClick={() => { setOpen(!open); refresh(); }} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-slate-800 border border-slate-600 hover:bg-slate-700 max-w-52" title="Gerenciar e trocar de seção">
              <span className={`w-2 h-2 rounded-full shrink-0 ${session ? statusColor(session) : 'bg-slate-500'}`} />
              <span className="truncate">{session?.name || 'Seções'}</span><ChevronDown className="w-3 h-3 shrink-0" />
            </button>
            {open && <div className="absolute right-0 mt-2 w-96 max-w-[calc(100vw-1.5rem)] max-h-[70vh] overflow-auto rounded-xl border border-slate-700 bg-slate-900 shadow-2xl z-50 p-2">
              <button type="button" onClick={() => { onCreateSection(); setOpen(false); }} className="w-full text-left px-2 py-2 mb-2 text-xs font-semibold text-blue-300 hover:bg-slate-800 rounded-lg">＋ Criar nova seção</button>
              <div className="px-2 py-1 text-[11px] uppercase tracking-wide text-slate-500">Seções salvas</div>
              {sessions.map(s => <div key={s.sessionId} className="flex items-center gap-1.5 px-2 py-2 rounded-lg hover:bg-slate-800">
                <button type="button" onClick={() => { onSelectSession(s); setOpen(false); }} className="flex-1 min-w-0 text-left text-xs text-slate-200">
                  <span className="flex items-center gap-2"><span className={`w-2 h-2 rounded-full ${statusColor(s)}`} /><span className="truncate">{s.name || 'Seção sem nome'}</span><span className="text-slate-400">{progress(s)}%</span></span>
                </button>
                {(s.status === 'running' || s.status === 'paused' || s.status === 'cancelled' || (s.status === 'idle' && s.companies.length > 0)) && <div className="flex shrink-0 items-center gap-0.5 border-r border-slate-700 pr-1.5 mr-0.5">
                  {s.status === 'running' ? <button type="button" aria-label={`Pausar ${s.name || 'seção'}`} title="Pausar seção" onClick={() => void controlSession(s, 'pause')} className="rounded p-1.5 text-amber-300 hover:bg-amber-500/15"><Pause className="h-3.5 w-3.5 fill-current" /></button> : <button type="button" aria-label={`Continuar ${s.name || 'seção'}`} title="Continuar seção" onClick={() => void controlSession(s, 'start')} className="rounded p-1.5 text-emerald-300 hover:bg-emerald-500/15"><Play className="h-3.5 w-3.5 fill-current" /></button>}
                  {s.status !== 'completed' && <button type="button" aria-label={`Parar ${s.name || 'seção'}`} title="Parar seção" onClick={() => void controlSession(s, 'cancel')} className="rounded p-1.5 text-rose-300 hover:bg-rose-500/15"><Square className="h-3 w-3 fill-current" /></button>}
                </div>}
                <button type="button" title="Editar nome" onClick={async () => { const name = window.prompt('Nome da seção:', s.name || ''); if (name?.trim()) { await onRenameSession({ ...s, name: name.trim() }); await refresh(); } }} className="p-1 text-slate-400 hover:text-white"><Pencil className="w-3.5 h-3.5" /></button>
                <button type="button" title="Excluir seção" onClick={async () => { if (!window.confirm(`Excluir a seção “${s.name || 'sem nome'}” permanentemente?`)) return; if (await onDeleteSession(s.sessionId)) { setSessions(v => v.filter(x => x.sessionId !== s.sessionId)); refresh(); } }} className="p-1 text-slate-400 hover:text-rose-400"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>)}
              {!sessions.length && <p className="px-2 py-3 text-xs text-slate-500">Ainda não há seções salvas.</p>}
            </div>}
          </div>
          <button
            type="button"
            onClick={onLoadSampleData}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-cyan-300 bg-cyan-950/60 border border-cyan-800/80 hover:bg-cyan-900/70 hover:border-cyan-700 transition"
            title="Carrega empresas e currículo de demonstração para testar"
          >
            <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
            <span className="hidden xs:inline">Carregar</span> Dados de Exemplo
          </button>

          <button
            type="button"
            onClick={onSaveProfile}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-blue-200 bg-blue-600/20 border border-blue-500/40 hover:bg-blue-600/30 hover:text-white transition"
            title="Salva empresas, perfil do candidato e configurações para carregar depois"
          >
            <Save className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Salvar</span> Perfil
          </button>

          <button
            type="button"
            onClick={onOpenProfiles}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-300 bg-slate-800/80 border border-slate-700 hover:bg-slate-700 hover:text-white transition"
            title="Carregar, exportar ou importar perfis salvos"
          >
            <FolderOpen className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Meus</span> Perfis
          </button>

          <button
            type="button"
            onClick={onOpenSettings}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-300 bg-slate-800/80 border border-slate-700 hover:bg-slate-700 hover:text-white transition"
          >
            Configurações
          </button>

          {session && (
            <button
              type="button"
              onClick={onCreateSection}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition"
              title="Criar uma seção nova com nome aleatório"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Nova Seção</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
