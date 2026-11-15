import React, { useEffect, useRef, useState } from 'react';
import type { JobSettings } from '../types/index.js';
const providers = [
  { id: 'brave', label: 'Brave Search', field: 'braveApiKey', url: 'https://api-dashboard.search.brave.com/app/keys', description: 'Busca principal de páginas oficiais.' },
  { id: 'firecrawl', label: 'Firecrawl', field: 'firecrawlApiKey', url: 'https://www.firecrawl.dev/', description: 'Leitura de HTML e páginas renderizadas.' },
  { id: 'you', label: 'You.com', field: 'youApiKey', url: 'https://you.com/platform/api-keys', description: 'Alternativa de busca e leitura de páginas.' },
  { id: 'exa', label: 'Exa', field: 'exaApiKey', url: 'https://dashboard.exa.ai/api-keys', description: 'Alternativa de busca semântica.' },
  { id: 'openrouter', label: 'OpenRouter', field: 'openrouterApiKey', url: 'https://openrouter.ai/settings/keys', description: 'Modelo adicional para análise e materiais.' },
] as const;
type Provider = typeof providers[number]['id'];
interface Result { status: 'testing' | 'success' | 'error'; message?: string; latencyMs?: number }
export function IntegrationSettings({ settings, onChange }: { settings: JobSettings; onChange: (settings: JobSettings) => void }) {
  const [status, setStatus] = useState<Record<string, any>>({});
  const [results, setResults] = useState<Partial<Record<Provider, Result>>>({});
  const busy = useRef(new Set<Provider>());
  useEffect(() => {
    let mounted = true;
    fetch('/api/integrations/status').then(r => r.ok ? r.json() : {}).then(d => { if (mounted) setStatus(d); }).catch(() => {});
    return () => { mounted = false; };
  }, []);
  const test = async (provider: typeof providers[number]) => {
    if (busy.current.has(provider.id)) return;
    busy.current.add(provider.id);
    setResults(r => ({ ...r, [provider.id]: { status: 'testing' } }));
    try {
      const response = await fetch('/api/test-ai-connection', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: provider.id, apiKey: settings[provider.field] || '', model: settings.openrouterModel || '' }) });
      const data = await response.json();
      setResults(r => ({ ...r, [provider.id]: { status: response.ok && data.success ? 'success' : 'error',
        message: data.message || data.error || 'Falha no teste.', latencyMs: data.latencyMs } }));
    } catch { setResults(r => ({ ...r, [provider.id]: { status: 'error', message: 'Falha de rede ou servidor.' } })); }
    finally {
      busy.current.delete(provider.id);
      fetch('/api/integrations/status').then(r => r.ok ? r.json() : {}).then(setStatus).catch(() => {});
    }
  };
  const update = (patch: Partial<JobSettings>) => { onChange({ ...settings, ...patch }); setResults({}); };
  return <section className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-4">
    <div className="flex justify-between items-center gap-3">
      <h4 className="font-bold text-cyan-300">Busca web, leitura e OpenRouter</h4>
      <button type="button" disabled={Object.values(results).some(r => r?.status === 'testing')} onClick={() => { void Promise.all(providers.map(test)); }}
        className="px-3 py-1 rounded-lg border border-cyan-800 text-cyan-300 disabled:opacity-50">Testar as 5 APIs</button>
    </div>
    <p className="text-slate-400">Busca: Brave → You.com → Exa. Leitura: acesso direto → Firecrawl → You.com. Emails só são salvos com evidência na página acessada.</p>
    <p className="text-amber-300">Os testes fazem chamadas reais e podem consumir créditos. Campo de chave vazio usa o .env; as chaves do .env não são exibidas aqui.</p>
    {providers.map(provider => <div key={provider.id} className="p-3 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
      <div className="flex justify-between gap-3"><label htmlFor={`${provider.id}-key`} className="font-semibold text-slate-200">{provider.label}</label>
        <a className="text-cyan-400 underline" href={provider.url} target="_blank" rel="noreferrer">Obter chave</a></div>
      <p className="text-slate-400">{provider.description} {status[provider.id]?.configured ? 'Chave configurada no servidor.' : 'Informe uma chave ou configure no .env.'}</p>
      {status[provider.id]?.usage && <p className="text-slate-500">Chamadas nesta execução do servidor: {status[provider.id].usage.requests} · Falhas: {status[provider.id].usage.failures}</p>}
      <input id={`${provider.id}-key`} type="password" autoComplete="off" value={settings[provider.field] || ''} placeholder="Deixe vazio para usar o .env"
        onChange={e => update({ [provider.field]: e.target.value })} className="w-full rounded-lg bg-slate-950 border border-slate-700 p-2 text-slate-200" />
      {provider.id === 'openrouter' && <label className="block text-slate-300">Modelo OpenRouter
        <input value={settings.openrouterModel || ''} placeholder="openai/gpt-4o-mini (ou OPENROUTER_MODEL no .env)" onChange={e => update({ openrouterModel: e.target.value })}
          className="w-full mt-1 rounded-lg bg-slate-950 border border-slate-700 p-2 text-slate-200" /></label>}
      <button type="button" disabled={results[provider.id]?.status === 'testing'} onClick={() => { void test(provider); }}
        className="rounded-lg border border-cyan-800 px-3 py-1.5 text-cyan-300 disabled:opacity-50">{results[provider.id]?.status === 'testing' ? 'Testando…' : 'Testar conexão'}</button>
      {results[provider.id] && <p role="status" className={results[provider.id]?.status === 'error' ? 'text-red-300' : 'text-emerald-300'}>
        {results[provider.id]?.message || 'Aguardando resposta…'} {results[provider.id]?.latencyMs != null && `(${results[provider.id]?.latencyMs} ms)`}</p>}
    </div>)}
    <label className="block text-slate-300">Prioridade de busca (demais APIs assumem em falhas ou ausência de email comprovado)
      <select value={settings.searchProvider || status.defaults?.searchProvider || 'auto'} onChange={e => update({ searchProvider: e.target.value as JobSettings['searchProvider'] })}
        className="w-full mt-1 rounded-lg bg-slate-900 border border-slate-700 p-2">
        <option value="auto">Automático: Brave → You.com → Exa</option><option value="brave">Brave primeiro</option><option value="you">You.com primeiro</option><option value="exa">Exa primeiro</option>
      </select>
    </label>
    <div className="space-y-2 text-slate-300">
      <label className="flex gap-2"><input type="checkbox" checked={settings.webSearchEnabled !== false} onChange={e => update({ webSearchEnabled: e.target.checked })} />Ativar busca web com APIs configuradas</label>
      <label className="flex gap-2"><input type="checkbox" checked={settings.pageRetrievalEnabled !== false} onChange={e => update({ pageRetrievalEnabled: e.target.checked })} />Ativar alternativas de leitura</label>
      <label className="flex gap-2"><input type="checkbox" checked={settings.renderPagesWithoutEmail ?? status.defaults?.renderPagesWithoutEmail ?? true} onChange={e => update({ renderPagesWithoutEmail: e.target.checked })} />Tentar leitura alternativa também quando o HTML direto não contém email</label>
    </div>
    <label className="block text-slate-300">Máximo de resultados por busca
      <input type="number" min="1" max="8" value={settings.searchMaxResults ?? status.defaults?.searchMaxResults ?? 5} onChange={e => update({ searchMaxResults: Number(e.target.value) })} className="w-full mt-1 rounded-lg bg-slate-900 border border-slate-700 p-2" /></label>
    <label className="block text-slate-300">Limite de chamadas externas de busca/leitura por empresa (0 a 100)
      <input type="number" min="0" max="100" value={settings.maxExternalCallsPerCompany ?? status.defaults?.maxExternalCallsPerCompany ?? 12} onChange={e => update({ maxExternalCallsPerCompany: Number(e.target.value) })} className="w-full mt-1 rounded-lg bg-slate-900 border border-slate-700 p-2" /></label>
    <label className="block text-slate-300">Tempo limite das novas APIs em segundos
      <input type="number" min="1" max="60" value={(settings.externalApiTimeoutMs ?? status.defaults?.externalApiTimeoutMs ?? 20000) / 1000} onChange={e => update({ externalApiTimeoutMs: Number(e.target.value) * 1000 })} className="w-full mt-1 rounded-lg bg-slate-900 border border-slate-700 p-2" /></label>
    <p className="text-slate-500">O limite inclui as novas buscas e leituras. Geração de materiais e testes manuais são separados. Falhas de acesso mantêm contatos vazios; o fallback não garante disponibilidade de todas as APIs.</p>
  </section>;
}
