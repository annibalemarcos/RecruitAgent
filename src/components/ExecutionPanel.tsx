import React, { useRef, useEffect, useState } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  Square,
  Terminal,
  CheckCircle2,
  AlertCircle,
  Clock,
  Sparkles,
  ExternalLink,
  Layers,
  Copy,
  Check,
  Download,
  Loader2,
} from 'lucide-react';
import { SessionState, CompanyItem, LogMessage } from '../types/index.js';
import { isCompanyFinished } from '../utils/companyProgress.js';

interface ExecutionPanelProps {
  session: SessionState;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onCancel: () => void;
  onRetryFailed: () => void;
  onViewResults: () => void;
  onGenerateAllPending?: () => void;
  isGeneratingAllPending?: boolean;
  onOpenSettings?: () => void;
}

export const ExecutionPanel: React.FC<ExecutionPanelProps> = ({
  session,
  onStart,
  onPause,
  onResume,
  onCancel,
  onRetryFailed,
  onViewResults,
  onGenerateAllPending,
  isGeneratingAllPending,
  onOpenSettings,
}) => {
  const logContainerRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState<boolean>(true);
  const [logFilter, setLogFilter] = useState<'all' | 'error' | 'success' | 'warn'>('all');
  const [copiedLogs, setCopiedLogs] = useState<boolean>(false);

  // Auto-scroll logs
  useEffect(() => {
    if (autoScroll && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [session.logs, autoScroll]);

  // Metrics
  const total = session.companies.length;
  const completed = session.companies.filter(isCompanyFinished).length;
  const failed = session.companies.filter((c) => c.status === 'Erro' || c.status === 'Bloqueado').length;
  const inProgress = session.companies.filter(
    (c) => c.status === 'Pesquisando' || c.status === 'Gerando materiais'
  ).length;

  const totalContacts = session.companies.reduce((acc, c) => acc + c.contacts.length, 0);
  const confirmedContacts = session.companies.reduce(
    (acc, c) => acc + c.contacts.filter((cnt) => cnt.classification === 'Recrutamento confirmado').length,
    0
  );
  const materialsGenerated = session.companies.reduce(
    (acc, c) => acc + c.contacts.filter((cnt) => cnt.materialsGenerated).length,
    0
  );

  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
  const isRunning = session.status === 'running';
  const isPaused = session.status === 'paused';
  const isIdle = session.status === 'idle';

  const currentCompany = session.companies.find(
    (c) => c.status === 'Pesquisando' || c.status === 'Gerando materiais'
  );

  const filteredLogs = session.logs.filter((log) => {
    if (logFilter === 'all') return true;
    return log.level === logFilter;
  });

  const handleCopyLogs = () => {
    const text = session.logs.map((l) => `[${l.timestamp}] [${l.level}] ${l.message}`).join('\n');
    navigator.clipboard.writeText(text);
    setCopiedLogs(true);
    setTimeout(() => setCopiedLogs(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Execution Controls */}
      <div className="bg-slate-900/90 rounded-2xl border border-slate-800 p-5 sm:p-6 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span
                className={`w-3 h-3 rounded-full ${
                  isRunning
                    ? 'bg-emerald-400 animate-ping'
                    : isPaused
                    ? 'bg-amber-400'
                    : session.status === 'completed'
                    ? 'bg-blue-400'
                    : 'bg-slate-500'
                }`}
              />
              <h2 className="text-base sm:text-lg font-bold text-white">
                Status:{' '}
                <span
                  className={
                    isRunning
                      ? 'text-emerald-400'
                      : isPaused
                      ? 'text-amber-400'
                      : session.status === 'completed'
                      ? 'text-blue-400'
                      : 'text-slate-400'
                  }
                >
                  {isRunning
                    ? 'Executando Pesquisa'
                    : isPaused
                    ? 'Pausado'
                    : session.status === 'completed'
                    ? 'Concluído'
                    : session.status === 'cancelled'
                    ? 'Cancelado'
                    : 'Aguardando Início'}
                </span>
              </h2>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              {currentCompany
                ? `Processando agora: ${currentCompany.name} (${currentCompany.normalizedUrl})`
                : `${completed} de ${total} empresas finalizadas.`}
            </p>
            <div className="flex items-center gap-1.5 mt-2">
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-950/80 border border-cyan-800/60 text-cyan-300 font-medium flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                Redundância Tripla Ativa: Gemini ➔ ChatGPT ➔ Perplexity
              </span>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap items-center gap-2">
            {isIdle && (
              <button
                type="button"
                onClick={onStart}
                disabled={total === 0}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-xs sm:text-sm text-white bg-blue-600 hover:bg-blue-500 shadow-lg shadow-blue-500/25 transition disabled:opacity-50"
              >
                <Play className="w-4 h-4 fill-white" /> Iniciar Pesquisa
              </button>
            )}

            {isRunning && (
              <button
                type="button"
                onClick={onPause}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm text-amber-300 bg-amber-950/80 border border-amber-700 hover:bg-amber-900 transition"
              >
                <Pause className="w-4 h-4" /> Pausar
              </button>
            )}

            {isPaused && (
              <button
                type="button"
                onClick={onResume}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-xs sm:text-sm text-white bg-emerald-600 hover:bg-emerald-500 shadow-lg shadow-emerald-500/25 transition"
              >
                <Play className="w-4 h-4 fill-white" /> Continuar
              </button>
            )}

            {(isRunning || isPaused) && (
              <button
                type="button"
                onClick={onCancel}
                className="inline-flex items-center gap-2 px-3 py-2.5 rounded-xl font-semibold text-xs sm:text-sm text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition"
              >
                <Square className="w-3.5 h-3.5" /> Cancelar
              </button>
            )}

            {failed > 0 && !isRunning && (
              <button
                type="button"
                onClick={onRetryFailed}
                className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl font-semibold text-xs text-rose-300 bg-rose-950/60 border border-rose-800 hover:bg-rose-900 transition"
              >
                <RotateCcw className="w-3.5 h-3.5" /> Repetir {failed} Falha(s)
              </button>
            )}

            {/* Quick bulk generate pending materials button */}
            {confirmedContacts > materialsGenerated && onGenerateAllPending && (
              <button
                type="button"
                onClick={onGenerateAllPending}
                disabled={isGeneratingAllPending}
                className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl font-bold text-xs text-white bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 shadow-md shadow-indigo-500/25 transition disabled:opacity-50"
                title="Gera materiais para todos os contatos confirmados pendentes"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                <span>
                  {isGeneratingAllPending
                    ? 'Gerando Materiais...'
                    : `Gerar ${confirmedContacts - materialsGenerated} Materiais Pendentes`}
                </span>
              </button>
            )}

            {/* Export remaining companies where paused */}
            {total > completed && (
              <button
                type="button"
                onClick={() =>
                  (window.location.href = `/api/session/${session.sessionId}/export/empresas_restantes.csv`)
                }
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl font-semibold text-xs text-slate-300 bg-slate-800 hover:bg-slate-700 border border-slate-700 transition"
                title="Exportar CSV com as empresas restantes a partir de onde a execução parou"
              >
                <Download className="w-3.5 h-3.5 text-blue-400" />
                <span>Exportar Onde Parou ({total - completed})</span>
              </button>
            )}

            {/* Always accessible button to view collected contacts */}
            {totalContacts > 0 && (
              <button
                type="button"
                onClick={onViewResults}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm text-white bg-indigo-600 hover:bg-indigo-500 shadow-lg shadow-indigo-500/25 transition"
              >
                <CheckCircle2 className="w-4 h-4 text-emerald-300" />
                <span>Ver Contatos & Materiais ({totalContacts})</span>
              </button>
            )}
          </div>
        </div>

        {/* Overall Progress Bar */}
        <div className="mt-5 space-y-2">
          <div className="flex justify-between text-xs font-semibold text-slate-300">
            <span>Progresso Geral</span>
            <span className="font-mono text-blue-400">{percent}% ({completed}/{total})</span>
          </div>
          <div className="w-full bg-slate-950 h-3 rounded-full overflow-hidden p-0.5 border border-slate-800">
            <div
              className="bg-gradient-to-r from-blue-600 via-indigo-500 to-cyan-400 h-full rounded-full transition-all duration-300 shadow-sm"
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>

        {/* Metrics Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-6">
          <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3">
            <div className="text-[11px] font-semibold text-slate-400">Total Empresas</div>
            <div className="text-xl font-bold text-white font-mono mt-0.5">{total}</div>
          </div>

          <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3">
            <div className="text-[11px] font-semibold text-slate-400">Finalizadas</div>
            <div className="text-xl font-bold text-emerald-400 font-mono mt-0.5">{completed}</div>
          </div>

          <div
            onClick={onViewResults}
            className="bg-slate-950/60 border border-slate-800/80 hover:border-blue-500/50 rounded-xl p-3 cursor-pointer transition group"
            title="Clique para abrir tabela de contatos"
          >
            <div className="text-[11px] font-semibold text-slate-400 flex items-center justify-between">
              <span>Contatos Coletados</span>
              <ExternalLink className="w-3 h-3 text-slate-500 group-hover:text-blue-400 transition" />
            </div>
            <div className="text-xl font-bold text-blue-400 font-mono mt-0.5">
              {totalContacts} <span className="text-xs text-emerald-400 font-normal">({confirmedContacts} conf.)</span>
            </div>
          </div>

          <div
            onClick={onViewResults}
            className="bg-slate-950/60 border border-slate-800/80 hover:border-indigo-500/50 rounded-xl p-3 cursor-pointer transition group"
            title="Clique para ver materiais"
          >
            <div className="text-[11px] font-semibold text-slate-400 flex items-center justify-between">
              <span>Materiais Gerados</span>
              <ExternalLink className="w-3 h-3 text-slate-500 group-hover:text-indigo-400 transition" />
            </div>
            <div className="text-xl font-bold text-indigo-400 font-mono mt-0.5">{materialsGenerated}</div>
          </div>

          <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3 col-span-2 sm:col-span-1">
            <div className="text-[11px] font-semibold text-slate-400">Erros / Bloqueios</div>
            <div className="text-xl font-bold text-rose-400 font-mono mt-0.5">{failed}</div>
          </div>
        </div>
      </div>

      {/* Notice when materials are pending due to blocked or unconfigured AI */}
      {confirmedContacts > materialsGenerated && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-lg">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <h4 className="text-xs sm:text-sm font-bold text-amber-300">
                {confirmedContacts - materialsGenerated} material(is) de candidatura pendente(s)
              </h4>
              <p className="text-[11px] text-amber-300/80 mt-0.5">
                Os contatos foram coletados com segurança. Com o sistema de contingência tripla (Gemini, ChatGPT e Perplexity), você pode processar todos os pendentes com alternância automática entre as APIs para nunca parar.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {onOpenSettings && (
              <button
                type="button"
                onClick={onOpenSettings}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-200 bg-slate-800 hover:bg-slate-700 transition"
              >
                Configurar Chaves
              </button>
            )}
            {onGenerateAllPending && (
              <button
                type="button"
                onClick={onGenerateAllPending}
                disabled={isGeneratingAllPending}
                className="px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-amber-600 hover:bg-amber-500 disabled:opacity-50 transition flex items-center gap-1.5"
              >
                {isGeneratingAllPending ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Processando Materiais...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Processar Pendentes (3 APIs)</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Live Terminal & Logs */}
      <div className="bg-slate-900/90 rounded-2xl border border-slate-800 overflow-hidden shadow-xl">
        <div className="bg-slate-950 px-4 py-3 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-cyan-400" />
            <h3 className="text-xs sm:text-sm font-bold text-slate-200">
              Console de Logs em Tempo Real ({session.logs.length})
            </h3>
          </div>

          <div className="flex items-center gap-2">
            {/* Filter buttons */}
            <div className="flex rounded-lg bg-slate-900 p-0.5 border border-slate-800 text-[10px]">
              <button
                type="button"
                onClick={() => setLogFilter('all')}
                className={`px-2 py-0.5 rounded font-semibold ${
                  logFilter === 'all' ? 'bg-slate-700 text-white' : 'text-slate-400'
                }`}
              >
                Todos
              </button>
              <button
                type="button"
                onClick={() => setLogFilter('success')}
                className={`px-2 py-0.5 rounded font-semibold ${
                  logFilter === 'success' ? 'bg-emerald-600 text-white' : 'text-emerald-400'
                }`}
              >
                Sucesso
              </button>
              <button
                type="button"
                onClick={() => setLogFilter('warn')}
                className={`px-2 py-0.5 rounded font-semibold ${
                  logFilter === 'warn' ? 'bg-amber-600 text-white' : 'text-amber-400'
                }`}
              >
                Avisos
              </button>
              <button
                type="button"
                onClick={() => setLogFilter('error')}
                className={`px-2 py-0.5 rounded font-semibold ${
                  logFilter === 'error' ? 'bg-rose-600 text-white' : 'text-rose-400'
                }`}
              >
                Erros
              </button>
            </div>

            <button
              type="button"
              onClick={handleCopyLogs}
              className="inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-white px-2 py-1 rounded bg-slate-900 border border-slate-800 transition"
              title="Copiar todos os logs"
            >
              {copiedLogs ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
              <span>{copiedLogs ? 'Copiado!' : 'Copiar'}</span>
            </button>

            <button
              type="button"
              onClick={() => setAutoScroll(!autoScroll)}
              className={`text-[11px] px-2 py-1 rounded border transition ${
                autoScroll
                  ? 'bg-blue-600/20 text-blue-400 border-blue-500/30'
                  : 'bg-slate-900 text-slate-400 border-slate-800'
              }`}
            >
              Auto-scroll: {autoScroll ? 'Ligado' : 'Desligado'}
            </button>
          </div>
        </div>

        <div
          ref={logContainerRef}
          className="p-4 bg-slate-950/95 font-mono text-xs max-h-80 overflow-y-auto space-y-1.5"
        >
          {filteredLogs.length === 0 ? (
            <div className="text-slate-600 italic py-6 text-center">
              Nenhum log registrado para este filtro.
            </div>
          ) : (
            filteredLogs.map((log) => {
              const levelColor =
                log.level === 'success'
                  ? 'text-emerald-400'
                  : log.level === 'error'
                  ? 'text-rose-400 font-semibold'
                  : log.level === 'warn'
                  ? 'text-amber-400'
                  : 'text-slate-300';

              return (
                <div key={log.id} className="flex items-start gap-2.5 leading-relaxed">
                  <span className="text-slate-500 text-[10px] shrink-0 font-sans select-none">
                    [{log.timestamp}]
                  </span>
                  <span
                    className={`text-[10px] uppercase font-bold shrink-0 px-1 rounded ${
                      log.level === 'success'
                        ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/60'
                        : log.level === 'error'
                        ? 'bg-rose-950 text-rose-400 border border-rose-800/60'
                        : log.level === 'warn'
                        ? 'bg-amber-950 text-amber-400 border border-amber-800/60'
                        : 'bg-slate-900 text-blue-400 border border-slate-800'
                    }`}
                  >
                    {log.level}
                  </span>
                  <span className={`break-words ${levelColor}`}>{log.message}</span>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
