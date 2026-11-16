import React from 'react';
import { Search } from 'lucide-react';

export interface OverviewEmailOption { alias: string; count: number }

interface Props {
  scopeDescription: string;
  search: string;
  emailFilter: string;
  useEmailWhitelist: boolean;
  emailOptions: OverviewEmailOption[];
  allowedAliasCount: number;
  contactStatus: string;
  companyStatus: string;
  classification: string;
  companyStatuses: string[];
  onlyWithEmail: boolean;
  onlyWithVacancies: boolean;
  hideDuplicates: boolean;
  hideHandled: boolean;
  visibleCount: number;
  totalCount: number;
  onSearchChange: (value: string) => void;
  onEmailChange: (value: string) => void;
  onWhitelistChange: (value: boolean) => void;
  onContactStatusChange: (value: string) => void;
  onCompanyStatusChange: (value: string) => void;
  onClassificationChange: (value: string) => void;
  onOnlyWithEmailChange: (value: boolean) => void;
  onOnlyWithVacanciesChange: (value: boolean) => void;
  onHideDuplicatesChange: (value: boolean) => void;
  onHideHandledChange: (value: boolean) => void;
  onClear: () => void;
}

export const OverviewContactFilters: React.FC<Props> = (props) => <div className="bg-slate-950/70 p-4 sm:p-5 rounded-xl border border-slate-800 mb-3 space-y-4">
  <div className="flex flex-wrap items-center justify-between gap-2">
    <div><h3 className="text-sm font-semibold text-slate-100">Filtros de contatos</h3><p className="mt-0.5 text-xs text-slate-500">{props.scopeDescription}</p></div>
    <button type="button" onClick={props.onClear} className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-300 hover:border-slate-500 hover:bg-slate-800">Limpar filtros</button>
  </div>
  <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-6">
    <label className="block min-w-0 text-xs font-medium text-slate-300">Busca geral
      <span className="relative mt-1.5 block"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" /><input type="search" value={props.search} onChange={(event) => props.onSearchChange(event.target.value)} placeholder="Contato, empresa ou seção" className="h-10 w-full rounded-lg border border-slate-700 bg-slate-900 pl-9 pr-3 text-sm text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20" /></span>
    </label>
    <label className="block min-w-0 text-xs font-medium text-slate-300 xl:col-span-2">E-mail
      <select aria-label="Filtrar por e-mail" value={props.emailFilter} onChange={(event) => props.onEmailChange(event.target.value)} className="mt-1.5 h-10 w-full min-w-0 rounded-lg border border-slate-700 bg-slate-900 px-3 text-sm text-slate-100 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20">
        <option value="all">Todos</option>{props.emailOptions.map(({ alias, count }) => <option key={alias} value={alias}>{alias}@ - ({count})</option>)}
      </select>
    </label>
    <label className="block min-w-0 text-xs font-medium text-slate-300">Status
      <select aria-label="Filtrar por status" value={props.contactStatus} onChange={(event) => props.onContactStatusChange(event.target.value)} className="mt-1.5 h-10 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 text-sm text-slate-100 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20">
        <option value="all">Todos os status</option><option value="pending">Pendente</option><option value="contacted">Contactado</option><option value="interview">Entrevista</option><option value="offer">Oferta</option><option value="rejected">Rejeitado</option><option value="discarded">Descartado</option>
      </select>
    </label>
    <label className="block min-w-0 text-xs font-medium text-slate-300">Status da empresa
      <select aria-label="Filtrar por status da empresa" value={props.companyStatus} onChange={(event) => props.onCompanyStatusChange(event.target.value)} className="mt-1.5 h-10 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 text-sm text-slate-100 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20">
        <option value="all">Todos</option>{props.companyStatuses.map((status) => <option key={status} value={status}>{status}</option>)}
      </select>
    </label>
    <label className="block min-w-0 text-xs font-medium text-slate-300">Classificação
      <select aria-label="Filtrar por classificação" value={props.classification} onChange={(event) => props.onClassificationChange(event.target.value)} className="mt-1.5 h-10 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 text-sm text-slate-100 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20">
        <option value="all">Todas as classificações</option><option value="Recrutamento confirmado">Recrutamento confirmado</option><option value="Possível recrutamento">Possível recrutamento</option><option value="Contato geral">Contato geral</option><option value="Outra finalidade">Outra finalidade</option>
      </select>
    </label>
  </div>
  <div className="flex flex-wrap items-center gap-x-5 gap-y-3 border-t border-slate-800 pt-3">
    <label className="flex items-center gap-2 text-xs text-slate-300"><input className="h-4 w-4 accent-blue-500" type="checkbox" checked={props.onlyWithEmail} onChange={(event) => props.onOnlyWithEmailChange(event.target.checked)} />Só contatos com e-mail</label>
    <label className="flex items-center gap-2 text-xs text-slate-300"><input className="h-4 w-4 accent-blue-500" type="checkbox" checked={props.onlyWithVacancies} onChange={(event) => props.onOnlyWithVacanciesChange(event.target.checked)} />Apenas com vagas</label>
    <label className="flex items-center gap-2 text-xs text-slate-300" title={props.allowedAliasCount ? undefined : 'Cadastre aliases na Whitelist nas Configurações de Pesquisa & IA'}><input className="h-4 w-4 accent-blue-500" type="checkbox" checked={props.useEmailWhitelist} onChange={(event) => props.onWhitelistChange(event.target.checked)} />Só aliases da whitelist no dropdown</label>
    <label className="flex items-center gap-2 text-xs text-slate-300"><input className="h-4 w-4 accent-blue-500" type="checkbox" checked={props.hideDuplicates} onChange={(event) => props.onHideDuplicatesChange(event.target.checked)} />Remover duplicatas</label>
    <label className="flex items-center gap-2 text-xs text-slate-300"><input className="h-4 w-4 accent-blue-500" type="checkbox" checked={props.hideHandled} onChange={(event) => props.onHideHandledChange(event.target.checked)} />Ocultar já tratados</label>
    <span className="ml-auto rounded-full border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-300">{props.visibleCount.toLocaleString('pt-BR')} de {props.totalCount.toLocaleString('pt-BR')} contatos</span>
  </div>
</div>;
