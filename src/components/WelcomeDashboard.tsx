import React, { useMemo, useState } from 'react';
import { Activity, ArrowRight, BriefcaseBusiness, Building2, CheckCircle2, CircleAlert, FileText, Layers3, Mail, Play, Sparkles, Users } from 'lucide-react';
import { Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { SessionState } from '../types/index.ts';
import type { ManualOutreachEntry } from '../utils/manualOutreach.ts';

interface Props {
  sessions: SessionState[];
  trackedCount: number;
  manualEntries: ManualOutreachEntry[];
  onNavigate: (step: 'input' | 'execution' | 'results' | 'tracking' | 'export' | 'overview' | 'email-materials') => void;
}

const companyStatusLabel = (status: string) => status || 'Sem status';
const contactStatusLabels: Record<string, string> = { pending: 'Pendente', contacted: 'Contactado', interview: 'Entrevista', offer: 'Oferta', rejected: 'Rejeitado', discarded: 'Descartado' };
const sessionStatusLabels: Record<string, string> = { running: 'Em andamento', paused: 'Pausada', completed: 'Concluída', idle: 'Não iniciada', cancelled: 'Cancelada', error: 'Com erro' };
const contactStatusLabel = (status?: string) => contactStatusLabels[status || 'pending'] || 'Pendente';
const sessionStatusLabel = (status: string) => sessionStatusLabels[status] || status || 'Sem status';
const pct = (value: number, total: number) => total ? Math.round(value / total * 100) : 0;

const StatCard: React.FC<{ label: string; value: number | string; detail: string; icon: React.FC<{ className?: string }>; tone: string }> = ({ label, value, detail, icon: Icon, tone }) => (
  <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 sm:p-5">
    <div className="flex items-start justify-between gap-3"><div className="text-xs font-medium text-slate-400">{label}</div><span className={`rounded-lg p-2 ${tone}`}><Icon className="h-4 w-4" /></span></div>
    <div className="mt-3 text-2xl font-bold tracking-tight text-white sm:text-3xl">{value}</div>
    <div className="mt-1 text-[11px] text-slate-500">{detail}</div>
  </div>
);

const Distribution: React.FC<{ title: string; rows: [string, number][]; total: number; color: string }> = ({ title, rows, total, color }) => (
  <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5">
    <div className="mb-4 flex items-center justify-between"><h2 className="text-sm font-semibold text-white">{title}</h2><span className="text-[11px] text-slate-500">{total.toLocaleString('pt-BR')} no total</span></div>
    <div className="space-y-3">{rows.length ? rows.map(([label, value]) => <div key={label}>
      <div className="mb-1 flex justify-between gap-3 text-[11px]"><span className="truncate text-slate-300">{label}</span><span className="shrink-0 text-slate-400">{value.toLocaleString('pt-BR')} · {pct(value, total)}%</span></div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-800"><div className={`h-full rounded-full ${color}`} style={{ width: `${pct(value, total)}%` }} /></div>
    </div>) : <p className="text-xs text-slate-500">Ainda sem dados para mostrar.</p>}</div>
  </section>
);

export const WelcomeDashboard: React.FC<Props> = ({ sessions, trackedCount, manualEntries, onNavigate }) => {
  const [trendRange, setTrendRange] = useState<7 | 30 | 90 | 365>(30);
  const companies = sessions.flatMap((item) => item.companies);
  const contacts = companies.flatMap((company) => company.contacts);
  const vacancies = companies.flatMap((company) => company.vacanciesFound || []);
  const generated = contacts.filter((contact) => contact.materialsGenerated || !!contact.materials).length;
  const emails = contacts.filter((contact) => !!contact.email).length;
  const manualEmails = manualEntries.map((entry) => entry.email?.trim().toLowerCase()).filter(Boolean) as string[];
  const uniqueEmails = new Set([...contacts.map((contact) => contact.email?.trim().toLowerCase()).filter(Boolean), ...manualEmails]).size;
  const totalPreparedMaterials = generated + manualEntries.length;
  const totalOutreachItems = contacts.length + manualEntries.length;
  const confirmedRecruitment = contacts.filter((contact) => contact.classification === 'Recrutamento confirmado').length;
  const jobLinkedContacts = contacts.filter((contact) => !!contact.associatedJob).length;
  const evidencedContacts = contacts.filter((contact) => !!contact.sourceUrl && !!contact.evidenceSnippet).length;
  const completedCompanies = companies.filter((company) => ['Concluído', 'Concluído parcialmente', 'Contato encontrado', 'Sem contato de recrutamento', 'Email não encontrado'].includes(company.status)).length;
  const runningCompanies = companies.filter((company) => company.status === 'Pesquisando' || company.status === 'Gerando materiais').length;
  const failedCompanies = companies.filter((company) => ['Erro', 'Bloqueado', 'Não foi possível verificar a fonte'].includes(company.status)).length;
  const modifiedVacancies = vacancies.filter((vacancy) => vacancy.isModified).length;
  const bilingualMaterials = contacts.filter((contact) => !!contact.materials?.pt && !!contact.materials?.en).length;
  const companyStatuses = Object.entries(companies.reduce<Record<string, number>>((acc, company) => { const key = companyStatusLabel(company.status); acc[key] = (acc[key] || 0) + 1; return acc; }, {})).sort((a, b) => b[1] - a[1]);
  const classifications = ['Recrutamento confirmado', 'Possível recrutamento', 'Contato geral', 'Outra finalidade'].map((label) => [label, contacts.filter((contact) => contact.classification === label).length] as [string, number]).filter(([, count]) => count > 0);
  const outreachStatuses = ['pending', 'contacted', 'interview', 'offer', 'rejected', 'discarded'].map((status) => [contactStatusLabel(status), contacts.filter((contact) => (contact.outreachStatus || 'pending') === status).length] as [string, number]).filter(([, count]) => count > 0);
  const sessionStatuses = Object.entries(sessions.reduce<Record<string, number>>((acc, item) => { const key = sessionStatusLabel(item.status); acc[key] = (acc[key] || 0) + 1; return acc; }, {})).sort((a, b) => b[1] - a[1]);
  const recentSessions = [...sessions].sort((a, b) => (b.startedAt || '').localeCompare(a.startedAt || '')).slice(0, 5);
  const currentSession = sessions.find((item) => item.status === 'running' || item.status === 'paused');
  const trend = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const monthly = trendRange === 365;
    const first = new Date(today);
    if (monthly) { first.setDate(1); first.setMonth(first.getMonth() - 11); }
    else first.setDate(first.getDate() - (trendRange - 1));
    const bucketKey = (date: Date) => monthly
      ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
      : `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const rows: Record<string, any>[] = [];
    const index = new Map<string, Record<string, any>>();
    const cursor = new Date(first);
    while (cursor <= today) {
      const date = new Date(cursor);
      const label = monthly ? date.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }) : date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
      const row = { key: bucketKey(date), label, contacts: 0, materials: 0, manual: 0, contacted: 0 };
      rows.push(row); index.set(row.key, row);
      if (monthly) cursor.setMonth(cursor.getMonth() + 1); else cursor.setDate(cursor.getDate() + 1);
    }
    const add = (value: string | undefined, metric: 'contacts' | 'materials' | 'manual' | 'contacted') => {
      if (!value) return;
      const date = new Date(value);
      if (Number.isNaN(date.getTime()) || date < first || date > new Date()) return;
      const row = index.get(bucketKey(date));
      if (row) row[metric]++;
    };
    for (const contact of contacts) {
      add(contact.collectedAt, 'contacts');
      if (contact.materials || contact.materialsGenerated) add(contact.materials?.generatedAt, 'materials');
      if (contact.outreachStatus === 'contacted') add(contact.contactedAt, 'contacted');
    }
    for (const entry of manualEntries) {
      add(entry.createdAt, 'manual');
      if (entry.status === 'contacted') add(entry.contactedAt, 'contacted');
    }
    return rows;
  }, [contacts, manualEntries, trendRange]);
  const trendTotals = trend.reduce((totals, row) => ({ contacts: totals.contacts + row.contacts, materials: totals.materials + row.materials, manual: totals.manual + row.manual, contacted: totals.contacted + row.contacted }), { contacts: 0, materials: 0, manual: 0, contacted: 0 });

  return <div className="space-y-6">
    <section className="relative overflow-hidden rounded-3xl border border-blue-500/20 bg-gradient-to-br from-blue-950/80 via-slate-900 to-slate-900 p-6 sm:p-8">
      <div className="pointer-events-none absolute -right-12 -top-20 h-64 w-64 rounded-full bg-blue-500/10 blur-3xl" />
      <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-2xl"><div className="mb-3 inline-flex items-center gap-2 rounded-full border border-blue-400/20 bg-blue-400/10 px-3 py-1 text-[11px] font-semibold text-blue-300"><Sparkles className="h-3.5 w-3.5" /> Seu espaço de recrutamento</div>
          <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">Bem-vindo ao RecruitAgent</h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-300">Acompanhe pesquisas, contatos, vagas e candidaturas em um só lugar. Seus números são consolidados a partir de todas as seções salvas.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => onNavigate('input')} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-bold text-white shadow-lg shadow-blue-950/40 transition hover:bg-blue-500"><Play className="h-4 w-4" /> Nova pesquisa <ArrowRight className="h-3.5 w-3.5" /></button>
          {currentSession && <button onClick={() => onNavigate('execution')} className="inline-flex items-center gap-2 rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-2.5 text-xs font-semibold text-amber-200 hover:bg-amber-400/20"><Activity className="h-4 w-4" /> Continuar pesquisa</button>}
          <button onClick={() => onNavigate('results')} className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-2.5 text-xs font-semibold text-slate-200 hover:border-slate-500"><Users className="h-4 w-4" /> Ver contatos</button>
        </div>
      </div>
    </section>

    <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      <StatCard label="Pesquisas salvas" value={sessions.length} detail={`${sessionStatuses.map(([label, n]) => `${n} ${label.toLowerCase()}`).join(' · ') || 'Nenhuma pesquisa ainda'}`} icon={Layers3} tone="bg-violet-500/10 text-violet-300" />
      <StatCard label="Empresas nos lotes" value={companies.length} detail={`${completedCompanies} concluídas · ${runningCompanies} em andamento · ${failedCompanies} com falha`} icon={Building2} tone="bg-blue-500/10 text-blue-300" />
      <StatCard label="Contatos encontrados" value={contacts.length} detail={`${emails} com email publicado · ${pct(emails, contacts.length)}% com email`} icon={Mail} tone="bg-cyan-500/10 text-cyan-300" />
      <StatCard label="Entradas manuais" value={manualEntries.length} detail="Geradas no gerador de emails" icon={Mail} tone="bg-fuchsia-500/10 text-fuchsia-300" />
      <StatCard label="Materiais preparados" value={totalPreparedMaterials} detail={`${generated} de pesquisas · ${manualEntries.length} entradas manuais`} icon={FileText} tone="bg-emerald-500/10 text-emerald-300" />
      <StatCard label="Emails únicos" value={uniqueEmails} detail={`${manualEntries.length} entradas manuais incluídas · ${Math.max(0, emails + manualEmails.length - uniqueEmails)} repetidos`} icon={Mail} tone="bg-sky-500/10 text-sky-300" />
      <StatCard label="Recrutamento confirmado" value={confirmedRecruitment} detail={`${pct(confirmedRecruitment, contacts.length)}% dos contatos coletados`} icon={CheckCircle2} tone="bg-green-500/10 text-green-300" />
      <StatCard label="Vagas identificadas" value={vacancies.length} detail={`${modifiedVacancies} com alteração detectada`} icon={BriefcaseBusiness} tone="bg-amber-500/10 text-amber-300" />
      <StatCard label="Contatos ligados a vagas" value={jobLinkedContacts} detail={`${pct(jobLinkedContacts, contacts.length)}% associados a uma oportunidade`} icon={BriefcaseBusiness} tone="bg-orange-500/10 text-orange-300" />
      <StatCard label="Contatos no CRM" value={trackedCount} detail={`${pct(trackedCount, contacts.length)}% dos contatos acompanhados`} icon={Users} tone="bg-indigo-500/10 text-indigo-300" />
      <StatCard label="Fontes com evidência" value={evidencedContacts} detail={`${pct(evidencedContacts, contacts.length)}% com página e trecho registrados`} icon={CheckCircle2} tone="bg-teal-500/10 text-teal-300" />
      <StatCard label="Progresso das empresas" value={`${pct(completedCompanies, companies.length)}%`} detail={`${completedCompanies} de ${companies.length} empresas finalizadas`} icon={CheckCircle2} tone="bg-teal-500/10 text-teal-300" />
      <StatCard label="Pendências de pesquisa" value={companies.filter((company) => company.status === 'Pendente').length} detail={`${runningCompanies} em processamento · ${failedCompanies} para revisar`} icon={CircleAlert} tone="bg-rose-500/10 text-rose-300" />
    </section>

    <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 sm:p-6">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div><h2 className="text-base font-semibold text-white">Atividade ao longo do tempo</h2><p className="mt-1 text-xs text-slate-400">Contatos e atividades agrupados pela data registrada no app.</p></div>
        <div className="flex flex-wrap gap-1 rounded-lg border border-slate-800 bg-slate-950 p-1" role="group" aria-label="Período do gráfico">
          {([[7, '7 dias'], [30, '30 dias'], [90, '90 dias'], [365, '12 meses']] as const).map(([days, label]) => <button key={days} type="button" aria-pressed={trendRange === days} onClick={() => setTrendRange(days)} className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${trendRange === days ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'}`}>{label}</button>)}
        </div>
      </div>
      <div className="mb-4 grid grid-cols-2 gap-2 xl:grid-cols-4">
        {[['Contatos encontrados', trendTotals.contacts, 'text-cyan-300'], ['Materiais gerados', trendTotals.materials, 'text-emerald-300'], ['Entradas manuais', trendTotals.manual, 'text-fuchsia-300'], ['Emails contactados', trendTotals.contacted, 'text-amber-300']].map(([label, value, tone]) => <div key={String(label)} className="rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2"><div className="text-[11px] text-slate-500">{label}</div><div className={`mt-1 text-lg font-bold ${tone}`}>{Number(value).toLocaleString('pt-BR')}</div></div>)}
      </div>
      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={trend} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
            <defs>
              <linearGradient id="welcomeContacts" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#22d3ee" stopOpacity={0.28} /><stop offset="95%" stopColor="#22d3ee" stopOpacity={0} /></linearGradient>
              <linearGradient id="welcomeMaterials" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#34d399" stopOpacity={0.25} /><stop offset="95%" stopColor="#34d399" stopOpacity={0} /></linearGradient>
            </defs>
            <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: '#94a3b8', fontSize: 10 }} tickLine={false} axisLine={false} minTickGap={24} />
            <YAxis allowDecimals={false} tick={{ fill: '#64748b', fontSize: 10 }} tickLine={false} axisLine={false} />
            <Tooltip contentStyle={{ background: '#020617', border: '1px solid #334155', borderRadius: 12, color: '#e2e8f0', fontSize: 12 }} labelStyle={{ color: '#cbd5e1' }} formatter={(value: any, name: any) => [Number(value || 0), ({ contacts: 'Contatos', materials: 'Materiais', manual: 'Entradas manuais', contacted: 'Contactados' } as Record<string, string>)[String(name)] || String(name)]} />
            <Legend wrapperStyle={{ fontSize: 11, color: '#cbd5e1' }} formatter={(value) => ({ contacts: 'Contatos', materials: 'Materiais', manual: 'Entradas manuais', contacted: 'Contactados' } as Record<string, string>)[value] || value} />
            <Area type="monotone" dataKey="contacts" name="contacts" stroke="#22d3ee" strokeWidth={2} fill="url(#welcomeContacts)" activeDot={{ r: 4 }} />
            <Area type="monotone" dataKey="materials" name="materials" stroke="#34d399" strokeWidth={2} fill="url(#welcomeMaterials)" activeDot={{ r: 4 }} />
            <Area type="monotone" dataKey="manual" name="manual" stroke="#e879f9" strokeWidth={2} fill="transparent" activeDot={{ r: 4 }} />
            <Area type="monotone" dataKey="contacted" name="contacted" stroke="#fbbf24" strokeWidth={2} fill="transparent" activeDot={{ r: 4 }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-2 text-[10px] text-slate-500">Períodos diários usam o fuso local; 12 meses são agrupados por mês. Itens sem data registrada não entram no gráfico.</p>
    </section>

    <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2"><div><h2 className="text-sm font-semibold text-white">Entradas manuais</h2><p className="mt-1 text-[11px] text-slate-500">Emails preparados no gerador, separados dos contatos encontrados nas pesquisas.</p></div><button onClick={() => onNavigate('email-materials')} className="text-[11px] font-semibold text-blue-300 hover:text-blue-200">Abrir gerador <ArrowRight className="ml-1 inline h-3 w-3" /></button></div>
      {manualEntries.length ? <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{[...manualEntries].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 9).map((entry) => <div key={entry.email} className="rounded-xl border border-slate-800 bg-slate-950/50 px-3 py-3"><div className="flex items-center justify-between gap-2"><strong className="truncate text-xs text-slate-200">{entry.company}</strong><span className="shrink-0 rounded-full bg-slate-800 px-2 py-1 text-[10px] text-slate-300">{entry.language === 'pt' ? 'PT-BR' : 'English'}</span></div><p className="mt-1 truncate text-[11px] text-slate-400">{entry.email}</p><p className="mt-1 text-[10px] text-slate-500">Gerado em {new Date(entry.createdAt).toLocaleDateString('pt-BR')}</p></div>)}</div> : <p className="rounded-xl border border-dashed border-slate-700 px-4 py-6 text-center text-xs text-slate-500">Nenhuma entrada manual gerada ainda.</p>}
    </section>

    <section className="grid gap-4 xl:grid-cols-3">
      <Distribution title="Empresas por situação" rows={companyStatuses} total={companies.length} color="bg-blue-500" />
      <Distribution title="Contatos por classificação" rows={classifications} total={contacts.length} color="bg-cyan-500" />
      <Distribution title="Acompanhamento de contatos" rows={outreachStatuses} total={contacts.length} color="bg-violet-500" />
    </section>

    <section className="grid gap-4 lg:grid-cols-2">
      <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5">
        <div className="mb-4 flex items-center justify-between"><h2 className="text-sm font-semibold text-white">Pesquisas recentes</h2><button onClick={() => onNavigate('overview')} className="text-[11px] font-semibold text-blue-300 hover:text-blue-200">Ver todas <ArrowRight className="ml-1 inline h-3 w-3" /></button></div>
        {recentSessions.length ? <div className="space-y-2">{recentSessions.map((item) => <div key={item.sessionId} className="flex items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950/50 px-3 py-3"><span className="min-w-0"><span className="block truncate text-xs font-semibold text-slate-200">{item.name || 'Pesquisa sem nome'}</span><span className="mt-1 block text-[10px] text-slate-500">{item.companies.length} empresas · {item.companies.reduce((sum, company) => sum + company.contacts.length, 0)} contatos</span></span><span className="shrink-0 rounded-full bg-slate-800 px-2.5 py-1 text-[10px] text-slate-300">{sessionStatusLabel(item.status)}</span></div>)}</div> : <div className="rounded-xl border border-dashed border-slate-700 px-4 py-8 text-center"><p className="text-xs text-slate-400">Nenhuma pesquisa salva ainda.</p><button onClick={() => onNavigate('input')} className="mt-3 text-xs font-semibold text-blue-300">Começar agora <ArrowRight className="ml-1 inline h-3 w-3" /></button></div>}
      </div>
      <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5">
        <div className="mb-4 flex items-center justify-between"><h2 className="text-sm font-semibold text-white">Resumo do funil</h2><span className="text-[10px] text-slate-500">Todas as seções</span></div>
        <div className="space-y-4">
          {[['Empresas concluídas', completedCompanies, companies.length, 'bg-blue-500'], ['Emails disponíveis', emails + manualEmails.length, totalOutreachItems, 'bg-cyan-500'], ['Materiais prontos (incl. manuais)', totalPreparedMaterials, totalOutreachItems, 'bg-emerald-500'], ['Contatos acompanhados', trackedCount, contacts.length, 'bg-violet-500']].map(([label, value, total, color]) => <div key={String(label)}><div className="mb-1.5 flex justify-between text-[11px]"><span className="text-slate-300">{label}</span><span className="text-slate-400">{Number(value).toLocaleString('pt-BR')} / {Number(total).toLocaleString('pt-BR')}</span></div><div className="h-2 overflow-hidden rounded-full bg-slate-800"><div className={`h-full rounded-full ${color}`} style={{ width: `${pct(Number(value), Number(total))}%` }} /></div></div>)}
        </div>
        <p className="mt-5 border-t border-slate-800 pt-4 text-[10px] leading-relaxed text-slate-500">As métricas refletem os registros salvos nas seções. Um contato pode aparecer mais de uma vez quando foi encontrado em pesquisas diferentes.</p>
      </div>
    </section>
  </div>;
};
