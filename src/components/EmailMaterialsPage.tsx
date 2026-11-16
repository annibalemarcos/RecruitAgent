import React, { useMemo, useState } from 'react';
import { Check, ChevronDown, ChevronRight, Copy, Mail, Sparkles, Users } from 'lucide-react';
import { getManualOutreachEntries, saveManualOutreachEntries } from '../utils/manualOutreach.ts';

const SUBJECTS = {
  en: 'Application for Customer Support & Operations Roles — Marcos Annibale',
  pt: 'Candidatura para Vagas em Suporte ao Cliente e Operações — Marcos Annibale',
};

function companyFromEmail(value: string): string {
  const domain = value.trim().toLowerCase().split('@')[1]?.replace(/\.$/, '');
  if (!domain) return '';
  const labels = domain.split('.').filter(Boolean);
  // For country domains such as exchange.co.uk, use the company label before co.uk.
  const label = labels.length >= 3 && ['co', 'com', 'org', 'net', 'gov', 'edu'].includes(labels.at(-2) || '')
    ? labels.at(-3) || labels[0]
    : labels.length >= 2 ? labels.at(-2)! : labels[0];
  return label.split(/[-_]+/).filter(Boolean).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
}

function makeBodies(company: string) {
  return {
    en: `Hi ${company} team,\n\nI’m Marcos Paulo de Oliveira Annibale, a customer support and operations professional with over 10 years of experience in technology and cryptocurrency companies. My background includes leading remote teams, building multichannel support, and resolving high-value P2P disputes, with a strong focus on regional growth across Latin America.\n\n${company}'s innovative approach to digital assets and fixed APY offerings caught my attention. I believe my expertise in knowledge management and self-service resources can enhance customer experience at ${company}, helping to resolve issues and optimize processes.\n\nI look forward to discussing how I can add value to your team.\n\nBest regards,\nMarcos Annibale\nhttps://annibale.com.br/`,
    pt: `Olá equipe ${company},\n\nSou Marcos Paulo de Oliveira Annibale, um profissional de suporte ao cliente e operações com mais de 10 anos de experiência em empresas de tecnologia e criptomoedas. Minha trajetória inclui a liderança de equipes remotas e a estruturação de suporte multicanal, além de experiência em resolução de disputas P2P e crescimento regional na América Latina.\n\nO foco da ${company} em ativos digitais e a possibilidade de oferecer um APY fixo me chamaram a atenção. Acredito que minha experiência em gestão do conhecimento e criação de bases de autoatendimento pode contribuir para aprimorar a experiência do cliente na ${company}, ajudando a resolver questões e a otimizar processos.\n\nEstou ansioso para discutir como posso agregar valor à sua equipe.\n\nAtenciosamente,\nMarcos Annibale\nhttps://annibale.com.br/`,
  };
}

export const EmailMaterialsPage: React.FC = () => {
  const [emails, setEmails] = useState('');
  const [generated, setGenerated] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [languages, setLanguages] = useState<Record<string, 'en' | 'pt'>>({});
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState<string | null>(null);
  const [contactedEmails, setContactedEmails] = useState<Set<string>>(() => new Set(getManualOutreachEntries().filter((entry) => entry.status === 'contacted').map((entry) => entry.email.toLowerCase())));
  const parsedEmails = useMemo(() => [...new Set(emails.split(/[\s,;]+/).map((entry) => entry.trim()).filter((entry) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(entry)))], [emails]);

  const copy = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      window.setTimeout(() => setCopied((current) => current === key ? null : current), 1800);
    } catch {
      setCopied(null);
    }
  };

  const openSelectedInGmail = (language: 'en' | 'pt' | 'both' | 'selection') => {
    const recipients = generated.filter((email) => selected.has(email));
    recipients.forEach((email) => {
      const company = companyFromEmail(email);
      const bodies = makeBodies(company);
      const languagesToOpen: ('en' | 'pt')[] = language === 'both' ? ['en', 'pt'] : [language === 'selection' ? languages[email] || 'en' : language];
      languagesToOpen.forEach((lang) => {
        const body = bodies[lang];
        const url = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(email)}&su=${encodeURIComponent(SUBJECTS[lang])}&body=${encodeURIComponent(body)}`;
        window.open(url, '_blank', 'noopener,noreferrer');
      });
    });
  };

  const markSelectedContacted = () => {
    if (!selected.size) return;
    const selectedLower = new Set([...selected].map((email) => email.toLowerCase()));
    const contactedAt = new Date().toISOString();
    const updatedEntries = getManualOutreachEntries().map((entry) => selectedLower.has(entry.email.toLowerCase())
      ? { ...entry, status: 'contacted' as const, contactedAt }
      : entry);
    saveManualOutreachEntries(updatedEntries);
    setContactedEmails(new Set(updatedEntries.filter((entry) => entry.status === 'contacted').map((entry) => entry.email.toLowerCase())));
  };

  const generateMaterials = () => {
    const nextLanguages = Object.fromEntries(parsedEmails.map((email) => [email, languages[email] || 'en'])) as Record<string, 'en' | 'pt'>;
    const previous = getManualOutreachEntries();
    const previousByEmail = new Map(previous.map((entry) => [entry.email.toLowerCase(), entry]));
    const now = new Date().toISOString();
    const next = parsedEmails.map((email) => ({
      email,
      company: companyFromEmail(email),
      language: nextLanguages[email],
      createdAt: previousByEmail.get(email.toLowerCase())?.createdAt || now,
      status: previousByEmail.get(email.toLowerCase())?.status || 'pending' as const,
      contactedAt: previousByEmail.get(email.toLowerCase())?.contactedAt,
    }));
    setGenerated(parsedEmails);
    setSelected(new Set(parsedEmails));
    setLanguages(nextLanguages);
    setContactedEmails(new Set(next.filter((entry) => entry.status === 'contacted').map((entry) => entry.email.toLowerCase())));
    saveManualOutreachEntries([...previous.filter((entry) => !parsedEmails.some((email) => email.toLowerCase() === entry.email.toLowerCase())), ...next]);
  };

  return <div className="space-y-5">
    <header className="rounded-2xl border border-slate-800 bg-slate-900 p-5 sm:p-6">
      <div className="flex items-center gap-2 text-blue-300"><Sparkles className="h-5 w-5" /><h1 className="text-lg font-bold text-white">Gerador de emails de candidatura</h1></div>
      <p className="mt-2 max-w-3xl text-sm text-slate-400">Cole uma lista de endereços. O nome da empresa será identificado pelo domínio e os textos serão preenchidos automaticamente, sem uso de IA.</p>
      <label htmlFor="outreach-emails" className="mt-5 block text-xs font-semibold text-slate-300">Emails (um por linha)</label>
      <textarea id="outreach-emails" value={emails} onChange={(event) => setEmails(event.target.value)} placeholder={'support@exchange1.com\nsupport@exchange2.com'} rows={5} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 font-mono text-sm text-slate-100 placeholder:text-slate-600 focus:border-blue-500 focus:outline-none" />
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button type="button" disabled={!parsedEmails.length} onClick={generateMaterials} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"><Sparkles className="h-4 w-4" />Gerar Material</button>
        <span className="text-xs text-slate-500">{parsedEmails.length} email(s) válido(s)</span>
        {emails.trim() && parsedEmails.length === 0 && <span className="text-xs text-amber-400">Confira o formato dos endereços.</span>}
      </div>
    </header>

    {generated.length > 0 && <section className="flex flex-col gap-3 rounded-xl border border-slate-800 bg-slate-900 p-4 sm:flex-row sm:items-center sm:justify-between">
      <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-slate-200"><input type="checkbox" checked={generated.length > 0 && generated.every((email) => selected.has(email))} onChange={(event) => setSelected(event.target.checked ? new Set(generated) : new Set())} className="h-4 w-4 accent-blue-500" />Selecionar todos <span className="text-xs font-normal text-slate-400">({selected.size} selecionado(s))</span></label>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => setCollapsed(collapsed.size === generated.length ? new Set() : new Set(generated))} className="rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800">{collapsed.size === generated.length ? 'Expandir todos' : 'Recolher todos'}</button>
        <button type="button" disabled={!selected.size} onClick={markSelectedContacted} className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-200 hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-50"><Check className="h-3.5 w-3.5" />Marcar contactados ({selected.size})</button>
        <button type="button" disabled={!selected.size} onClick={() => openSelectedInGmail('en')} className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-200 hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-50"><Users className="h-3.5 w-3.5" />Gmail inglês ({selected.size})</button>
        <button type="button" disabled={!selected.size} onClick={() => openSelectedInGmail('pt')} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"><Users className="h-3.5 w-3.5" />Gmail português ({selected.size})</button>
        <button type="button" disabled={!selected.size} onClick={() => openSelectedInGmail('both')} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"><Users className="h-3.5 w-3.5" />Gmail ambos ({selected.size})</button>
        <button type="button" disabled={!selected.size} onClick={() => openSelectedInGmail('selection')} className="inline-flex items-center gap-1.5 rounded-lg border border-violet-500/40 bg-violet-500/10 px-3 py-2 text-xs font-semibold text-violet-200 hover:bg-violet-500/20 disabled:cursor-not-allowed disabled:opacity-50"><Users className="h-3.5 w-3.5" />Gmail seleção ({selected.size})</button>
      </div>
    </section>}

    {generated.map((email) => {
      const company = companyFromEmail(email);
      const bodies = makeBodies(company);
      const subject = SUBJECTS[languages[email] || 'en'];
      const key = email;
      return <article key={email} className="rounded-2xl border border-slate-800 bg-slate-900 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3"><input type="checkbox" aria-label={`Selecionar ${email}`} checked={selected.has(email)} onChange={(event) => setSelected((current) => { const next = new Set(current); if (event.target.checked) next.add(email); else next.delete(email); return next; })} className="h-4 w-4 accent-blue-500" /><div><div className="flex flex-wrap items-center gap-2"><h2 className="text-base font-bold text-white">{company}</h2><span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${contactedEmails.has(email.toLowerCase()) ? 'bg-emerald-500/15 text-emerald-300' : 'bg-slate-800 text-slate-400'}`}>{contactedEmails.has(email.toLowerCase()) ? 'Contactado' : 'Pendente'}</span></div><p className="mt-1 text-xs text-slate-400">{email}</p></div></div>
          <div className="flex flex-wrap gap-2">
            <button type="button" aria-expanded={!collapsed.has(email)} onClick={() => setCollapsed((current) => { const next = new Set(current); if (next.has(email)) next.delete(email); else next.add(email); return next; })} className="inline-flex items-center gap-1 rounded-lg border border-slate-700 px-2.5 py-1.5 text-xs text-slate-300 hover:bg-slate-800">{collapsed.has(email) ? <><ChevronRight className="h-3.5 w-3.5" />Expandir</> : <><ChevronDown className="h-3.5 w-3.5" />Recolher</>}</button>
            <label className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-slate-300">Idioma<select aria-label={`Idioma do email para ${email}`} value={languages[email] || 'en'} onChange={(event) => { const language = event.target.value as 'en' | 'pt'; setLanguages((current) => ({ ...current, [email]: language })); const entries = getManualOutreachEntries(); saveManualOutreachEntries(entries.map((entry) => entry.email.toLowerCase() === email.toLowerCase() ? { ...entry, language } : entry)); }} className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-100"><option value="en">English</option><option value="pt">PT-BR</option></select></label>
            <button type="button" onClick={() => { const lang = languages[email] || 'en'; const body = bodies[lang]; const url = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(email)}&su=${encodeURIComponent(SUBJECTS[lang])}&body=${encodeURIComponent(body)}`; window.open(url, '_blank', 'noopener,noreferrer'); }} className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-200 hover:bg-red-500/20"><Mail className="h-3.5 w-3.5" />Abrir no Gmail</button>
            <button type="button" onClick={() => void copy(`${key}:subject`, subject)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800">{copied === `${key}:subject` ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}Copiar assunto</button>
          </div>
        </div>
        {!collapsed.has(email) && <>
        <div className="mt-4 rounded-lg border border-slate-800 bg-slate-950/70 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-xs font-bold text-slate-300">Assunto</h3><button type="button" onClick={() => void copy(`${key}:subject2`, subject)} className="text-xs text-blue-300 hover:text-blue-200">{copied === `${key}:subject2` ? 'Copiado' : 'Copiar'}</button></div>
          <p className="mt-2 text-sm text-slate-100">{subject}</p>
        </div>
        {(['en', 'pt'] as const).map((lang) => <section key={lang} className="mt-4 rounded-lg border border-slate-800 bg-slate-950/70 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-xs font-bold text-slate-300">{lang === 'en' ? 'Email (English)' : 'Email (Português)'}</h3><button type="button" onClick={() => void copy(`${key}:${lang}`, bodies[lang])} className="inline-flex items-center gap-1 text-xs text-blue-300 hover:text-blue-200">{copied === `${key}:${lang}` ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}{copied === `${key}:${lang}` ? 'Copiado' : 'Copiar body'}</button></div>
          <pre className="mt-3 whitespace-pre-wrap font-sans text-sm leading-6 text-slate-200">{bodies[lang]}</pre>
        </section>)}
        </>}
      </article>;
    })}
  </div>;
};
