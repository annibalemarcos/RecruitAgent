import { API_KEY_FIELDS, exportConfig, importConfig } from '../apiCredentialsJson.js';
import { IntegrationSettings } from './IntegrationSettings.js';
import React, { useState } from 'react';
import {
  X,
  Sliders,
  Shield,
  Globe,
  Info,
  Zap,
  Sparkles,
  Key,
  Bot,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Activity,
  Play,
  Upload,
  Download,
  Trash2,
} from 'lucide-react';
import { JobSettings } from '../types/index.js';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: JobSettings;
  sections: { sessionId: string; name?: string }[];
  settingsByScope: Record<string, JobSettings>;
  onSave: (settings: JobSettings, scopeId: string) => Promise<void>;
  onResetData: () => Promise<void>;
}

interface TestResult {
  status: 'idle' | 'testing' | 'success' | 'error';
  message?: string;
  latencyMs?: number;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  sections,
  settingsByScope,
  onSave,
  onResetData,
}) => {
  const [localSettings, setLocalSettings] = useState<JobSettings>(settings);
  const [scopeId, setScopeId] = useState('global');
  const [exportScope, setExportScope] = useState('global');
  const [importScope, setImportScope] = useState('global');
  const [isResetting, setIsResetting] = useState(false);
  const [resetError, setResetError] = useState('');
  const [transferMessage, setTransferMessage] = useState('');
  const fileInput = React.useRef<HTMLInputElement>(null);
  const [geminiTest, setGeminiTest] = useState<TestResult>({ status: 'idle' });
  const [openaiTest, setOpenaiTest] = useState<TestResult>({ status: 'idle' });
  const [perplexityTest, setPerplexityTest] = useState<TestResult>({ status: 'idle' });

  React.useEffect(() => {
    if (isOpen) {
      setScopeId('global');
      setExportScope('global');
      setImportScope('global');
      setLocalSettings(settingsByScope.global || settings);
    }
    setTransferMessage('');
    setGeminiTest({ status: 'idle' });
    setOpenaiTest({ status: 'idle' });
    setPerplexityTest({ status: 'idle' });
  }, [isOpen]);

  if (!isOpen) return null;

  const handleResetData = async () => {
    if (isResetting || !window.confirm('Apagar permanentemente TODO o conteúdo de data/? Isso remove sessões, empresas pesquisadas, contatos, materiais, vagas e histórico do CRM, e interrompe as pesquisas em andamento.')) return;
    setIsResetting(true);
    setResetError('');
    try {
      await onResetData();
    } catch (error) {
      setResetError(error instanceof Error ? error.message : 'Não foi possível limpar os dados.');
    } finally {
      setIsResetting(false);
    }
  };

  const handleImportConfig = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      if (file.size > 10 * 1024 * 1024) throw new Error('O JSON deve ter no máximo 10 MB.');
      const parsed = JSON.parse(await file.text());
      const isBundle = parsed?.format === 'recruitment-config-bundle' && parsed?.version === 1;
      const parseConfig = (value: unknown) => importConfig(typeof value === 'string' ? value : JSON.stringify(value));
      const apply = async (target: string, value: unknown) => {
        const imported = parseConfig(value);
        const merged = { ...(settingsByScope[target] || settingsByScope.global || settings), ...imported } as JobSettings;
        await onSave(merged, target);
        if (target === scopeId) setLocalSettings(merged);
        return imported;
      };
      let imported: Partial<JobSettings>;
      if (importScope === 'all') {
        if (isBundle) {
          imported = await apply('global', parsed.global);
          let appliedSections = 0;
          for (const section of sections) {
            const entry = (parsed.sections || []).find((item: any) => item.sessionId === section.sessionId || (item.name || '').trim().toLowerCase() === (section.name || '').trim().toLowerCase());
            if (entry) { await apply(section.sessionId, entry.config); appliedSections++; }
          }
          setTransferMessage(`Configuração global e ${appliedSections} seção(ões) correspondente(s) importadas.`);
          return;
        }
        imported = await apply('global', parsed);
        for (const section of sections) await apply(section.sessionId, parsed);
      } else {
        const source = isBundle
          ? importScope === 'global'
            ? parsed.global
            : (parsed.sections || []).find((item: any) => item.sessionId === importScope || (item.name || '').trim().toLowerCase() === sections.find((section) => section.sessionId === importScope)?.name?.trim().toLowerCase())?.config || parsed.global
          : parsed;
        imported = await apply(importScope, source);
        if (scopeId !== importScope) { setScopeId(importScope); setLocalSettings({ ...(settingsByScope[importScope] || settingsByScope.global || settings), ...imported }); }
      }
      setGeminiTest({ status:'idle' }); setOpenaiTest({ status:'idle' }); setPerplexityTest({ status:'idle' });
      const keyCount = API_KEY_FIELDS.filter(field => imported[field]).length;
      const settingCount = Object.keys(imported).length - keyCount;
      setTransferMessage(`${keyCount} chave(s) e ${settingCount} ajuste(s) aplicados ao destino escolhido.`);
    } catch (error) {
      setTransferMessage(error instanceof Error ? error.message : 'Não foi possível importar o JSON.');
    }
  };

  const handleExportConfig = () => {
    const configFor = (id: string) => settingsByScope[id] || (id === scopeId ? localSettings : settingsByScope.global) || settings;
    const content = exportScope === 'all'
      ? JSON.stringify({ format: 'recruitment-config-bundle', version: 1, global: JSON.parse(exportConfig(configFor('global'))), sections: sections.map((section) => ({ sessionId: section.sessionId, name: section.name || 'Seção sem nome', config: JSON.parse(exportConfig(configFor(section.sessionId))) })) }, null, 2) + '\n'
      : exportConfig(configFor(exportScope));
    const url = URL.createObjectURL(new Blob([content], { type:'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = exportScope === 'all' ? 'configuracoes-todas-as-secoes.json' : exportScope === 'global' ? 'config-global.json' : `config-${(sections.find((section) => section.sessionId === exportScope)?.name || 'secao').replace(/[^a-z0-9-_]+/gi, '-')}.json`;
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setTransferMessage(`Configuração de ${exportScope === 'all' ? 'todas as seções' : exportScope === 'global' ? 'Global' : sections.find((section) => section.sessionId === exportScope)?.name || 'seção'} exportada.`);
  };

  const handleTestConnection = async (provider: 'gemini' | 'openai' | 'perplexity') => {
    const setStatus =
      provider === 'gemini'
        ? setGeminiTest
        : provider === 'openai'
        ? setOpenaiTest
        : setPerplexityTest;
    setStatus({ status: 'testing' });

    let apiKey = '';
    let model = '';
    if (provider === 'gemini') {
      apiKey = localSettings.geminiApiKey || '';
      model = localSettings.geminiModel || '';
    } else if (provider === 'openai') {
      apiKey = localSettings.openaiApiKey || '';
      model = localSettings.openaiModel || '';
    } else {
      apiKey = localSettings.perplexityApiKey || '';
      model = localSettings.perplexityModel || '';
    }

    try {
      const res = await fetch('/api/test-ai-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider,
          apiKey,
          model,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setStatus({
          status: 'success',
          message: data.message || 'Conexão validada com sucesso!',
          latencyMs: data.latencyMs,
        });
      } else {
        setStatus({
          status: 'error',
          message: data.error || 'Falha ao testar conexão.',
        });
      }
    } catch (err: any) {
      setStatus({
        status: 'error',
        message: `Falha de rede ou servidor: ${err.message || String(err)}`,
      });
    }
  };

  const handleTestAll = async () => {
    handleTestConnection('gemini');
    handleTestConnection('openai');
    handleTestConnection('perplexity');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto p-5 sm:p-6 shadow-2xl relative">
        <div className="flex items-center justify-between pb-4 border-b border-slate-800 sticky top-0 bg-slate-900 z-10">
          <div className="flex items-center gap-2">
            <Sliders className="w-5 h-5 text-blue-400" />
            <h3 className="text-base font-bold text-white">Configurações de Pesquisa & IA</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="py-4 space-y-5 text-xs">
          <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2">
            <label htmlFor="settings-scope" className="block font-bold text-slate-200">Configuração que você está editando</label>
            <select id="settings-scope" value={scopeId} onChange={(event) => { const next = event.target.value; setScopeId(next); setLocalSettings(settingsByScope[next] || settingsByScope.global || settings); setTransferMessage(''); }} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500">
              <option value="global">Global · compartilhada por todas as seções</option>
              {sections.map((section) => <option key={section.sessionId} value={section.sessionId}>{section.name || 'Seção sem nome'} · configuração própria</option>)}
            </select>
            <p className="text-[11px] text-slate-400">Salvar a configuração Global aplica seus ajustes a todas as seções. Escolha uma seção para alterar somente ela.</p>
          </div>
          <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-3">
            <div className="font-bold text-slate-200">Importar / exportar configurações</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <label className="text-[11px] text-slate-400">Exportar
                <select value={exportScope} onChange={(event) => setExportScope(event.target.value)} className="mt-1 w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-2 text-xs text-slate-200">
                  <option value="global">Somente Global</option><option value="all">Global + todas as seções</option>
                  {sections.map((section) => <option key={section.sessionId} value={section.sessionId}>{section.name || 'Seção sem nome'}</option>)}
                </select>
              </label>
              <label className="text-[11px] text-slate-400">Importar para
                <select value={importScope} onChange={(event) => setImportScope(event.target.value)} className="mt-1 w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-2 text-xs text-slate-200">
                  <option value="global">Somente Global</option><option value="all">Global + todas as seções</option>
                  {sections.map((section) => <option key={section.sessionId} value={section.sessionId}>{section.name || 'Seção sem nome'}</option>)}
                </select>
              </label>
            </div>
            <div className="flex flex-wrap gap-2">
              <input ref={fileInput} type="file" accept=".json,application/json" onChange={handleImportConfig} className="hidden" aria-label="Importar configurações em JSON" />
              <button type="button" onClick={() => fileInput.current?.click()} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 font-semibold text-white hover:bg-blue-500"><Upload className="w-4 h-4" /> Importar JSON</button>
              <button type="button" onClick={handleExportConfig} className="inline-flex items-center gap-2 rounded-lg bg-slate-800 px-3 py-2 font-semibold text-white hover:bg-slate-700"><Download className="w-4 h-4" /> Exportar JSON</button>
            </div>
            <p className="text-slate-400">Inclui as chaves de API, os modelos e todos os ajustes desta tela (provedores, busca web, limites e opções de geração). A importação preserva campos ausentes ou vazios e só vale depois de Salvar. Também aceita o antigo chaves-apis.json. Chaves do .env não são incluídas no download.</p>
            <p className="text-amber-300">O JSON contém suas chaves em texto aberto. Guarde em local seguro e não compartilhe.</p>
            {transferMessage && <p role="status" className="text-blue-300">{transferMessage}</p>}
          </div>
          {/* AI Providers Section */}
          <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-bold text-slate-200">
                <Bot className="w-4 h-4 text-cyan-400" />
                <span>Motores de Inteligência Artificial</span>
              </div>

              <button
                type="button"
                onClick={handleTestAll}
                className="text-[11px] font-semibold text-cyan-300 bg-cyan-950/70 border border-cyan-800/80 hover:bg-cyan-900 px-2.5 py-1 rounded-lg transition flex items-center gap-1.5"
                title="Executa ping simultâneo nas 3 APIs para verificar credenciais e latência"
              >
                <Activity className="w-3.5 h-3.5 text-cyan-400" />
                Testar as 3 APIs
              </button>
            </div>

            {/* Triple API Failover Banner */}
            <div className="p-3 rounded-xl bg-gradient-to-r from-blue-950/50 via-purple-950/40 to-cyan-950/50 border border-cyan-800/40 flex items-start gap-2.5">
              <Shield className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
              <div className="text-[11px] text-slate-300 leading-relaxed">
                <strong className="text-white">Fallback entre provedores:</strong> O sistema integra <strong>Google Gemini</strong>, <strong>OpenAI ChatGPT</strong> , <strong>Perplexity AI</strong> e <strong>OpenRouter</strong>. Em falhas, tenta a próxima API configurada. Se todas falharem, os materiais ficam pendentes.
              </div>
            </div>

            <div>
              <label className="block text-slate-300 font-semibold mb-1">
                Modo de Operação e Contingência da IA:
              </label>
              <select
                value={localSettings.aiProvider || 'auto'}
                onChange={(e) =>
                  setLocalSettings({
                    ...localSettings,
                    aiProvider: e.target.value as JobSettings['aiProvider'],
                  })
                }
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500 font-medium"
              >
                <option value="auto">Automático: Gemini → ChatGPT → Perplexity → OpenRouter</option>
                <option value="openrouter">Prioridade OpenRouter (Gemini → ChatGPT → Perplexity)</option>
                <option value="gemini">Prioridade Google Gemini (Contingência: ChatGPT → Perplexity)</option>
                <option value="openai">Prioridade OpenAI ChatGPT (Contingência: Gemini → Perplexity)</option>
                <option value="perplexity">Prioridade Perplexity AI com Busca Web (Contingência: Gemini → ChatGPT)</option>
              </select>
              <p className="text-[11px] text-slate-400 mt-1">
                O provedor escolhido tem prioridade. Em falhas, os demais configurados são tentados; OpenRouter integra a mesma fila.
              </p>
            </div>

            {/* 1. Google Gemini Config & Test Card */}
            <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-bold text-blue-300">
                  <Sparkles className="w-4 h-4 text-blue-400" />
                  <span>Google Gemini API</span>
                </div>
                <a
                  href="https://aistudio.google.com/app/apikey"
                  target="_blank"
                  rel="noreferrer"
                  className="text-[10px] text-blue-400 hover:underline"
                >
                  Obter chave Gemini (Gratuita) →
                </a>
              </div>

              <div>
                <label className="text-[11px] text-slate-400 block mb-1">
                  Chave Gemini API (deixe em branco para usar a variável do <code>.env</code>):
                </label>
                <input
                  type="password"
                  value={localSettings.geminiApiKey || ''}
                  onChange={(e) =>
                    setLocalSettings({ ...localSettings, geminiApiKey: e.target.value })
                  }
                  placeholder="Configurada via GEMINI_API_KEY no .env (ou cole uma chave aqui)"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 font-mono focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                <div>
                  <label className="text-[11px] text-slate-400 block mb-0.5">Modelo Gemini:</label>
                  <select
                    value={localSettings.geminiModel || 'gemini-3.8-flash'}
                    onChange={(e) =>
                      setLocalSettings({ ...localSettings, geminiModel: e.target.value })
                    }
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
                  >
                    <option value="gemini-3.8-flash">gemini-3.8-flash (Recomendado)</option>
                    <option value="gemini-flash-latest">gemini-flash-latest</option>
                  </select>
                </div>

                <div className="flex items-end">
                  <button
                    type="button"
                    onClick={() => handleTestConnection('gemini')}
                    disabled={geminiTest.status === 'testing'}
                    className="w-full inline-flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white transition shadow-sm"
                  >
                    {geminiTest.status === 'testing' ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Testando Gemini...</span>
                      </>
                    ) : (
                      <>
                        <Zap className="w-3.5 h-3.5" />
                        <span>Testar Conexão Google</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Gemini Test Feedback Banner */}
              {geminiTest.status === 'success' && (
                <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-[11px] flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">Google Gemini Conectado com Sucesso!</span>
                    <p className="text-emerald-400/90 mt-0.5">
                      Tempo de resposta: <span className="font-mono font-bold">{geminiTest.latencyMs}ms</span>. A API está pronta para analisar currículos e produzir materiais.
                    </p>
                  </div>
                </div>
              )}

              {geminiTest.status === 'error' && (
                <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-[11px] flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">Falha no Teste do Google Gemini:</span>
                    <p className="text-rose-300/90 mt-0.5 leading-relaxed">{geminiTest.message}</p>
                    <p className="text-slate-400 text-[10px] mt-1">
                      Dica: Verifique se a chave no <code>.env</code> ou campo acima está correta em <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="underline text-blue-400">Google AI Studio</a>.
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* 2. OpenAI ChatGPT Config & Test Card */}
            <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-bold text-emerald-300">
                  <Bot className="w-4 h-4 text-emerald-400" />
                  <span>OpenAI ChatGPT API</span>
                </div>
                <a
                  href="https://platform.openai.com/api-keys"
                  target="_blank"
                  rel="noreferrer"
                  className="text-[10px] text-blue-400 hover:underline"
                >
                  Obter chave OpenAI →
                </a>
              </div>

              <div>
                <label className="text-[11px] text-slate-400 block mb-1">
                  Chave OpenAI API (deixe em branco para usar a variável do <code>.env</code>):
                </label>
                <input
                  type="password"
                  value={localSettings.openaiApiKey || ''}
                  onChange={(e) =>
                    setLocalSettings({ ...localSettings, openaiApiKey: e.target.value })
                  }
                  placeholder="sk-proj-... (ou configurada via OPENAI_API_KEY no .env)"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 font-mono focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                <div>
                  <label className="text-[11px] text-slate-400 block mb-0.5">Modelo ChatGPT:</label>
                  <select
                    value={localSettings.openaiModel || 'gpt-4o-mini'}
                    onChange={(e) =>
                      setLocalSettings({ ...localSettings, openaiModel: e.target.value })
                    }
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
                  >
                    <option value="gpt-4o-mini">gpt-4o-mini (Rápido e econômico)</option>
                    <option value="gpt-4o">gpt-4o (Máxima capacidade analítica)</option>
                  </select>
                </div>

                <div className="flex items-end">
                  <button
                    type="button"
                    onClick={() => handleTestConnection('openai')}
                    disabled={openaiTest.status === 'testing'}
                    className="w-full inline-flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white transition shadow-sm"
                  >
                    {openaiTest.status === 'testing' ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Testando ChatGPT...</span>
                      </>
                    ) : (
                      <>
                        <Zap className="w-3.5 h-3.5" />
                        <span>Testar Conexão ChatGPT</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* OpenAI Test Feedback Banner */}
              {openaiTest.status === 'success' && (
                <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-[11px] flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">OpenAI ChatGPT Conectado com Sucesso!</span>
                    <p className="text-emerald-400/90 mt-0.5">
                      Tempo de resposta: <span className="font-mono font-bold">{openaiTest.latencyMs}ms</span>. A API está pronta para uso híbrido ou exclusivo.
                    </p>
                  </div>
                </div>
              )}

              {openaiTest.status === 'error' && (
                <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-[11px] flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">Falha no Teste da OpenAI (ChatGPT):</span>
                    <p className="text-rose-300/90 mt-0.5 leading-relaxed">{openaiTest.message}</p>
                    <p className="text-slate-400 text-[10px] mt-1">
                      Dica: Verifique se sua conta OpenAI possui créditos ativos e se a chave começa com <code>sk-</code>.
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* 3. Perplexity AI Config & Test Card */}
            <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-bold text-purple-300">
                  <Globe className="w-4 h-4 text-purple-400" />
                  <span>Perplexity AI (Busca Web ao Vivo)</span>
                </div>
                <a
                  href="https://www.perplexity.ai/settings/api"
                  target="_blank"
                  rel="noreferrer"
                  className="text-[10px] text-blue-400 hover:underline"
                >
                  Obter chave Perplexity →
                </a>
              </div>

              <div>
                <label className="text-[11px] text-slate-400 block mb-1">
                  Chave Perplexity API (deixe em branco para usar a variável do <code>.env</code>):
                </label>
                <input
                  type="password"
                  value={localSettings.perplexityApiKey || ''}
                  onChange={(e) =>
                    setLocalSettings({ ...localSettings, perplexityApiKey: e.target.value })
                  }
                  placeholder="pplx-... (ou configurada via PERPLEXITY_API_KEY no .env)"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 font-mono focus:outline-none focus:border-purple-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                <div>
                  <label className="text-[11px] text-slate-400 block mb-0.5">Modelo Perplexity:</label>
                  <select
                    value={localSettings.perplexityModel || 'sonar'}
                    onChange={(e) =>
                      setLocalSettings({ ...localSettings, perplexityModel: e.target.value })
                    }
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-purple-500"
                  >
                    <option value="sonar">sonar (Busca Web em Tempo Real - Rápido)</option>
                    <option value="sonar-pro">sonar-pro (Raciocínio Profundo & Busca Completa)</option>
                    <option value="sonar-reasoning">sonar-reasoning (Raciocínio)</option>
                  </select>
                </div>

                <div className="flex items-end">
                  <button
                    type="button"
                    onClick={() => handleTestConnection('perplexity')}
                    disabled={perplexityTest.status === 'testing'}
                    className="w-full inline-flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-semibold bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white transition shadow-sm"
                  >
                    {perplexityTest.status === 'testing' ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Testando Perplexity...</span>
                      </>
                    ) : (
                      <>
                        <Zap className="w-3.5 h-3.5" />
                        <span>Testar Conexão Perplexity</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Perplexity Test Feedback Banner */}
              {perplexityTest.status === 'success' && (
                <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-[11px] flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">Perplexity AI Conectada com Sucesso!</span>
                    <p className="text-emerald-400/90 mt-0.5">
                      Tempo de resposta: <span className="font-mono font-bold">{perplexityTest.latencyMs}ms</span>. Busca web ao vivo e geração ativadas na contingência.
                    </p>
                  </div>
                </div>
              )}

              {perplexityTest.status === 'error' && (
                <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-[11px] flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">Falha no Teste da Perplexity AI:</span>
                    <p className="text-rose-300/90 mt-0.5 leading-relaxed">{perplexityTest.message}</p>
                    <p className="text-slate-400 text-[10px] mt-1">
                      Dica: Verifique se sua chave começa com <code>pplx-</code> e tem créditos em <a href="https://www.perplexity.ai/settings/api" target="_blank" rel="noreferrer" className="underline text-purple-400">Perplexity Settings</a>.
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Bilingual toggle */}
            <div className="pt-2 border-t border-slate-800 flex items-start gap-2.5">
              <input
                id="dual-lang-toggle"
                type="checkbox"
                checked={localSettings.generateDualLanguage !== false}
                onChange={(e) =>
                  setLocalSettings({
                    ...localSettings,
                    generateDualLanguage: e.target.checked,
                  })
                }
                className="mt-0.5 w-4 h-4 rounded bg-slate-900 border-slate-700 text-blue-600 focus:ring-blue-500"
              />
              <label htmlFor="dual-lang-toggle" className="cursor-pointer">
                <span className="font-semibold text-slate-200 block">
                  Gerar materiais bilíngues automaticamente (Português PT-BR e Inglês EN)
                </span>
                <span className="text-slate-400 text-[11px] block mt-0.5">
                  Produz Cold Email, Mensagem Curta e Carta de Apresentação nos dois idiomas para cada contato.
                </span>
              </label>
            </div>
          </div>

          {/* Língua Padrão do seletor "Visualizar" */}
          <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2">
            <label htmlFor="default-view-language" className="block font-bold text-slate-200">
              Língua Padrão
            </label>
            <select
              id="default-view-language"
              value={localSettings.defaultViewLanguage === 'en' ? 'en' : 'pt'}
              onChange={(e) =>
                setLocalSettings({
                  ...localSettings,
                  defaultViewLanguage: e.target.value === 'en' ? 'en' : 'pt',
                })
              }
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500 font-medium"
            >
              <option value="pt">🇧🇷 PT-BR</option>
              <option value="en">🇺🇸 Inglês</option>
            </select>
            <p className="text-[11px] text-slate-400">
              Define qual idioma vem selecionado por padrão em <strong>Visualizar</strong> (Contatos e Materiais,
              exportação e janela de materiais). Não traduz o app; você ainda pode trocar o idioma na hora. Vale
              depois de Salvar e também vai no JSON de configurações e no perfil.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2">
            <label htmlFor="app-theme" className="block font-bold text-slate-200">Tema do aplicativo</label>
            <select id="app-theme" value={localSettings.theme === 'light' ? 'light' : 'dark'} onChange={(event) => setLocalSettings({ ...localSettings, theme: event.target.value === 'light' ? 'light' : 'dark' })} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500 font-medium">
              <option value="dark">Escuro</option>
              <option value="light">Claro</option>
            </select>
            <p className="text-[11px] text-slate-400">A escolha é salva nas configurações e incluída nos JSONs de exportação e nos perfis salvos.</p>
          </div>

          <IntegrationSettings settings={localSettings} onChange={setLocalSettings} />

          <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2">
            <label htmlFor="navigation-layout" className="block font-bold text-slate-200">Navegação do app</label>
            <select id="navigation-layout" value={localSettings.navigationLayout === 'sidebar' ? 'sidebar' : 'top'} onChange={(event) => {
              const navigationLayout: JobSettings['navigationLayout'] = event.target.value === 'sidebar' ? 'sidebar' : 'top';
              const updatedSettings = { ...localSettings, navigationLayout };
              setLocalSettings(updatedSettings);
            }} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500 font-medium">
              <option value="top">Barra superior</option>
              <option value="sidebar">Barra lateral</option>
            </select>
            <button type="button" disabled={(settingsByScope[scopeId]?.navigationLayout || 'top') === (localSettings.navigationLayout || 'top')} onClick={async () => {
              const baseSettings = settingsByScope[scopeId] || settingsByScope.global || settings;
              const updatedSettings = { ...baseSettings, navigationLayout: localSettings.navigationLayout || 'top' };
              await onSave(updatedSettings, scopeId);
              setLocalSettings((current) => ({ ...current, navigationLayout: updatedSettings.navigationLayout }));
              setTransferMessage(`Menu aplicado na ${updatedSettings.navigationLayout === 'sidebar' ? 'barra lateral' : 'barra superior'}.`);
            }} className="inline-flex items-center gap-1.5 rounded-lg border border-blue-500/40 bg-blue-600/20 px-3 py-2 text-xs font-bold text-blue-200 hover:bg-blue-600/30 disabled:cursor-not-allowed disabled:opacity-40"><CheckCircle2 className="w-3.5 h-3.5" /> Aplicar agora</button>
            <p className="text-[11px] text-slate-400">Escolha onde aparecem as etapas Entrada, Execução, Contatos, CRM, Exportação e Visão Geral. A barra lateral aparece em telas largas e vira barra superior em telas pequenas.</p>
          </div>

          <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2">
            <label htmlFor="email-blacklist" className="block font-bold text-slate-200">Blacklist de e-mails</label>
            <p className="text-[11px] text-slate-400">Um endereço ou palavra-chave por linha. Esses contatos serão ignorados na coleta. Com @ no final, bloqueia o alias exato (ex.: <code>pr@</code>, <code>legal@</code>, <code>privacy@</code>); sem @, a palavra é procurada no nome antes do @.</p>
            <textarea id="email-blacklist" rows={5} maxLength={20000} value={(localSettings.emailBlacklist || []).join('\n')} onChange={(event) => setLocalSettings({ ...localSettings, emailBlacklist: [...new Set(event.target.value.split(/[\r\n,;]+/).map((item) => item.trim().toLowerCase()).filter(Boolean))] })} placeholder={'pr@\nlegal@\nprivacy@'} className="w-full resize-y rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-200 placeholder:text-slate-600 focus:border-blue-500 focus:outline-none" />
            <p className="text-[11px] text-slate-500">A lista será incluída no JSON de configurações e nos perfis salvos que incluem configurações.</p>
          </div>

          {/* Crawler Settings */}
          {/* Max Pages */}
          <div>
            <div className="flex justify-between font-semibold text-slate-300 mb-1">
              <span>Limite de páginas rastreadas por empresa:</span>
              <span className="text-blue-400 font-mono">{localSettings.maxPagesPerCompany} páginas</span>
            </div>
            <input
              type="range"
              min={1}
              max={12}
              value={localSettings.maxPagesPerCompany}
              onChange={(e) =>
                setLocalSettings({ ...localSettings, maxPagesPerCompany: parseInt(e.target.value, 10) })
              }
              className="w-full accent-blue-500 bg-slate-800 rounded-lg cursor-pointer"
            />
            <p className="text-[11px] text-slate-500 mt-0.5">
              Prioriza página inicial, carreiras, vagas, sobre e contato.
            </p>
          </div>

          {/* Request Delay */}
          <div>
            <div className="flex justify-between font-semibold text-slate-300 mb-1">
              <span>Intervalo de cortesia entre requisições:</span>
              <span className="text-blue-400 font-mono">{localSettings.delayBetweenRequestsMs} ms</span>
            </div>
            <input
              type="range"
              min={100}
              max={2500}
              step={100}
              value={localSettings.delayBetweenRequestsMs}
              onChange={(e) =>
                setLocalSettings({
                  ...localSettings,
                  delayBetweenRequestsMs: parseInt(e.target.value, 10),
                })
              }
              className="w-full accent-blue-500 bg-slate-800 rounded-lg cursor-pointer"
            />
            <p className="text-[11px] text-slate-500 mt-0.5">
              Evita sobrecarga e previne bloqueios de IP pelos servidores das empresas.
            </p>
          </div>

          {/* Request Timeout */}
          <div>
            <div className="flex justify-between font-semibold text-slate-300 mb-1">
              <span>Tempo limite por requisição (Timeout):</span>
              <span className="text-blue-400 font-mono">
                {localSettings.requestTimeoutMs / 1000} segundos
              </span>
            </div>
            <input
              type="range"
              min={4000}
              max={25000}
              step={1000}
              value={localSettings.requestTimeoutMs}
              onChange={(e) =>
                setLocalSettings({
                  ...localSettings,
                  requestTimeoutMs: parseInt(e.target.value, 10),
                })
              }
              className="w-full accent-blue-500 bg-slate-800 rounded-lg cursor-pointer"
            />
          </div>

          {/* Parallelism: the main speed controls */}
          <div className="pt-2 border-t border-slate-800 space-y-4">
            <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-3 flex items-start gap-3">
              <input
                id="low-resource-mode"
                type="checkbox"
                checked={scopeId === 'global' ? localSettings.lowResourceMode === true : settingsByScope.global?.lowResourceMode === true}
                disabled={scopeId !== 'global'}
                onChange={(e) => setLocalSettings({ ...localSettings, lowResourceMode: e.target.checked })}
                className="mt-0.5 w-4 h-4 rounded accent-emerald-500 disabled:opacity-40"
              />
              <label htmlFor="low-resource-mode" className={`cursor-pointer ${scopeId !== 'global' ? 'opacity-60' : ''}`}>
                <span className="font-semibold text-slate-200 block">Modo econômico</span>
                <span className="text-slate-400 text-[11px] block mt-0.5">Reduz para uma seção ativa, duas tarefas de pesquisa/IA no total e uma tarefa por seção. Atualiza o overview com menos frequência. As seções continuam salvando o progresso normalmente e retomam do ponto salvo.</span>
                {scopeId !== 'global' && <span className="text-amber-300 text-[11px] block mt-1">Selecione Global para alterar esta opção.</span>}
              </label>
            </div>
            <div className="rounded-xl border border-blue-500/25 bg-blue-500/5 p-3">
              <div className="flex justify-between gap-3 font-semibold text-slate-200 mb-1">
                <span>Seções executando em paralelo:</span>
                <span className="shrink-0 font-mono text-blue-300">{scopeId === 'global' ? (localSettings.maxConcurrentSections ?? 1) : (settingsByScope.global?.maxConcurrentSections ?? 1)} / 5</span>
              </div>
              <input
                type="range"
                min={1}
                max={5}
                step={1}
                disabled={scopeId !== 'global'}
                value={scopeId === 'global' ? (localSettings.maxConcurrentSections ?? 1) : (settingsByScope.global?.maxConcurrentSections ?? 1)}
                onChange={(e) => setLocalSettings({ ...localSettings, maxConcurrentSections: Number(e.target.value) })}
                className="w-full accent-blue-500 bg-slate-800 rounded-lg cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
              />
              <p className="text-[11px] text-slate-400 mt-1">Configuração Global. Cada seção mantém os próprios dados; o processamento total é compartilhado entre as seções ativas. Para evitar sobrecarga, o servidor limita a seis tarefas de pesquisa/geração simultâneas no total.</p>
              {scopeId !== 'global' && <p className="mt-1 text-[11px] text-amber-300">Selecione Global no início das Configurações para alterar este limite.</p>}
            </div>
            <div>
              <div className="flex justify-between font-semibold text-slate-300 mb-1">
                <span>Empresas pesquisadas ao mesmo tempo:</span>
                <span className="text-blue-400 font-mono">{localSettings.maxConcurrency ?? 1}</span>
              </div>
              <input
                type="range"
                min={1}
                max={6}
                value={localSettings.maxConcurrency ?? 1}
                onChange={(e) =>
                  setLocalSettings({ ...localSettings, maxConcurrency: parseInt(e.target.value, 10) })
                }
                className="w-full accent-blue-500 bg-slate-800 rounded-lg cursor-pointer"
              />
              <p className="text-[11px] text-slate-500 mt-0.5">
                Principal ajuste de velocidade: cada empresa em paralelo faz a própria pesquisa e gera os próprios materiais enquanto as outras andam.
                Diminuir páginas, timeout ou intervalo ajuda pouco, porque a maior parte do tempo é espera das APIs de IA. Sugestão: 3.
                Valores altos podem estourar o limite de requisições das APIs (erro 429). Vale ao iniciar ou retomar a pesquisa.
              </p>
            </div>
            <div>
              <div className="flex justify-between font-semibold text-slate-300 mb-1">
                <span>Gerações de IA ao mesmo tempo (em lote):</span>
                <span className="text-blue-400 font-mono">{localSettings.materialsConcurrency ?? 1}</span>
              </div>
              <input
                type="range"
                min={1}
                max={6}
                value={localSettings.materialsConcurrency ?? 1}
                onChange={(e) =>
                  setLocalSettings({ ...localSettings, materialsConcurrency: parseInt(e.target.value, 10) })
                }
                className="w-full accent-blue-500 bg-slate-800 rounded-lg cursor-pointer"
              />
              <p className="text-[11px] text-slate-500 mt-0.5">
                Vale para a geração em lote de materiais pendentes e para a fila de Candidatura Espontânea, que roda antes da pesquisa começar. Sugestão: 3.
              </p>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-800 flex items-start gap-3">
            <input id="spontaneous-toggle" type="checkbox"
              checked={localSettings.generateMaterialsForSpontaneous === true}
              onChange={(e) => setLocalSettings({ ...localSettings, generateMaterialsForSpontaneous: e.target.checked })}
              className="mt-0.5 w-4 h-4 rounded accent-blue-500" />
            <label htmlFor="spontaneous-toggle" className="cursor-pointer">
              <span className="font-semibold text-slate-200 block">Gerar automaticamente materiais PT / EN para Candidatura Espontânea</span>
              <span className="text-slate-400 text-[11px] block mt-0.5">
                Inclui todos os contatos verificados sem vaga associada, inclusive Contato Geral.
                Ao salvar, processa os pendentes desta sessão; novos contatos entram automaticamente.
                Gera email, mensagem curta e carta nos dois idiomas, usando as APIs configuradas. Não envia candidaturas.
                Em caso de falha, confira as APIs e salve novamente para tentar os pendentes.
              </span>
            </label>
          </div>
          {/* Auto-generate for possible recruitment */}
          <div className="pt-2 border-t border-slate-800 flex items-start gap-3">
            <input
              id="possible-toggle"
              type="checkbox"
              checked={localSettings.generateMaterialsForPossible}
              onChange={(e) =>
                setLocalSettings({
                  ...localSettings,
                  generateMaterialsForPossible: e.target.checked,
                })
              }
              className="mt-0.5 w-4 h-4 rounded bg-slate-950 border-slate-700 text-blue-600 focus:ring-blue-500"
            />
            <label htmlFor="possible-toggle" className="cursor-pointer">
              <span className="font-semibold text-slate-200 block">
                Gerar materiais automaticamente também para contatos "Possível recrutamento"
              </span>
              <span className="text-slate-400 text-[11px] block mt-0.5">
                Por padrão, o agente gera automaticamente para "Recrutamento confirmado" e permite gerar sob demanda para os demais.
              </span>
            </label>
          </div>
        </div>

        <section className="my-5 p-4 rounded-xl border border-rose-500/40 bg-rose-500/5 space-y-3">
          <h3 className="text-sm font-bold text-rose-300">Zerar dados do aplicativo</h3>
          <p className="text-xs text-slate-300">Apaga permanentemente todo o conteúdo de data/, incluindo sessões, contatos, materiais gerados, vagas e histórico do CRM. Pesquisas em andamento serão interrompidas. Arquivos fora dessa pasta serão preservados.</p>
          <button type="button" disabled={isResetting} onClick={handleResetData}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-xs font-bold text-white disabled:opacity-50">
            {isResetting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            {isResetting ? 'Limpando dados...' : 'Apagar todos os dados (reset)'}
          </button>
          {resetError && <p role="alert" className="text-xs text-rose-300">{resetError}</p>}
        </section>

        <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-800 sticky bottom-0 bg-slate-900">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white transition"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => {
              void onSave(localSettings, scopeId);
              onClose();
            }}
            className="px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition shadow-md shadow-blue-500/25"
          >
            Salvar Configurações
          </button>
        </div>
      </div>
    </div>
  );
};
