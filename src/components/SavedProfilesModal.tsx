import React, { useEffect, useRef, useState } from 'react';
import {
  X,
  Save,
  FolderOpen,
  Download,
  Upload,
  Trash2,
  Pencil,
  Check,
  AlertCircle,
  Loader2,
  Building2,
  UserRound,
  Sliders,
  KeyRound,
} from 'lucide-react';
import type { CandidateProfile, JobSettings } from '../types/index.js';
import { API_KEY_FIELDS } from '../apiCredentialsJson.js';
import {
  SAVED_PROFILE_SLOTS,
  MAX_PROFILE_NAME,
  MAX_SAVED_PROFILE_BYTES,
  buildSavedProfile,
  cleanProfileName,
  countApiKeys,
  parseSavedProfile,
  savedProfileFileName,
  type SavedCompany,
  type SavedProfile,
  type SavedProfileBlocks,
} from '../savedProfiles.js';

type Tab = 'save' | 'manage';

interface SlotState {
  slot: number;
  profile: SavedProfile | null;
  error?: string;
}

interface SavedProfilesModalProps {
  isOpen: boolean;
  initialTab: Tab;
  onClose: () => void;
  rawCompanies: SavedCompany[];
  profile: CandidateProfile;
  settings: JobSettings;
  onApply: (saved: SavedProfile, blocks: SavedProfileBlocks) => Promise<void>;
}

const BLOCK_LABELS = {
  companies: '1. Carregar Empresas (CSV ou URLs)',
  candidate: '2. Perfil do Candidato & Fatos do Currículo',
  settings: '3. Configurações de Pesquisa & IA',
} as const;

const defaultName = (slot: number) => `Perfil ${slot}`;

const formatDate = (iso: string) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
};

async function readError(res: Response, fallback: string): Promise<string> {
  try {
    const data = await res.json();
    return data?.error || fallback;
  } catch {
    return fallback;
  }
}

export const SavedProfilesModal: React.FC<SavedProfilesModalProps> = ({
  isOpen,
  initialTab,
  onClose,
  rawCompanies,
  profile,
  settings,
  onApply,
}) => {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [slots, setSlots] = useState<SlotState[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  // Formulário de "Salvar perfil"
  const [targetSlot, setTargetSlot] = useState(1);
  const [name, setName] = useState(defaultName(1));
  const [nameTouched, setNameTouched] = useState(false);
  const [blocks, setBlocks] = useState<SavedProfileBlocks>({ companies: false, candidate: false, settings: true });
  const [includeApiKeys, setIncludeApiKeys] = useState(true);

  // "Meus perfis"
  const [applyingSlot, setApplyingSlot] = useState<number | null>(null);
  const [applyBlocks, setApplyBlocks] = useState<SavedProfileBlocks>({ companies: false, candidate: false, settings: false });
  const [renamingSlot, setRenamingSlot] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const importInput = useRef<HTMLInputElement>(null);
  const importSlot = useRef<number>(1);

  const companyCount = rawCompanies.length;
  const hasCandidate = !!(
    profile.name ||
    profile.summary ||
    profile.experiences.length ||
    profile.cvPtRawText ||
    profile.cvEnRawText
  );
  const currentKeyCount = API_KEY_FIELDS.filter((field) => !!settings[field]?.trim()).length;

  const slotOf = (slot: number) => slots.find((item) => item.slot === slot);

  const loadSlots = async (): Promise<SlotState[]> => {
    const res = await fetch('/api/saved-profiles');
    if (!res.ok) throw new Error(await readError(res, 'Não foi possível ler os perfis salvos.'));
    const data = await res.json();
    const list = (data.profiles || []) as SlotState[];
    setSlots(list);
    return list;
  };

  const putSlot = async (slot: number, saved: SavedProfile): Promise<SavedProfile> => {
    const res = await fetch(`/api/saved-profiles/${slot}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(saved),
    });
    if (!res.ok) throw new Error(await readError(res, 'Não foi possível salvar o perfil.'));
    const data = await res.json();
    return data.profile as SavedProfile;
  };

  // Ao abrir: carrega os slots e prepara o formulário com os padrões.
  useEffect(() => {
    if (!isOpen) return;
    setTab(initialTab);
    setError('');
    setMessage('');
    setApplyingSlot(null);
    setRenamingSlot(null);
    setNameTouched(false);
    setBlocks({ companies: companyCount > 0, candidate: hasCandidate, settings: true });
    setIncludeApiKeys(true);
    setLoading(true);
    loadSlots()
      .then((list) => {
        const firstEmpty = list.find((item) => !item.profile)?.slot ?? 1;
        setTargetSlot(firstEmpty);
        setName(list.find((item) => item.slot === firstEmpty)?.profile?.name || defaultName(firstEmpty));
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, initialTab]);

  if (!isOpen) return null;

  const chooseSlot = (slot: number) => {
    setTargetSlot(slot);
    if (!nameTouched) setName(slotOf(slot)?.profile?.name || defaultName(slot));
  };

  const hasAnyBlock =
    (blocks.companies && companyCount > 0) || (blocks.candidate && hasCandidate) || blocks.settings;

  const handleSave = async () => {
    setError('');
    setMessage('');
    setBusy(true);
    try {
      const saved = buildSavedProfile({
        name: cleanProfileName(name, defaultName(targetSlot)),
        blocks: {
          companies: blocks.companies && companyCount > 0,
          candidate: blocks.candidate && hasCandidate,
          settings: blocks.settings,
        },
        includeApiKeys,
        companies: rawCompanies,
        candidate: profile,
        settings,
      });
      await putSlot(targetSlot, saved);
      await loadSlots();
      setMessage(`Perfil "${saved.name}" salvo no slot ${targetSlot}.`);
      setTab('manage');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const startApply = (saved: SavedProfile, slot: number) => {
    setError('');
    setMessage('');
    setRenamingSlot(null);
    setApplyingSlot(slot);
    setApplyBlocks({ ...saved.blocks });
  };

  const handleApply = async (saved: SavedProfile) => {
    if (!applyBlocks.companies && !applyBlocks.candidate && !applyBlocks.settings) {
      setError('Marque pelo menos um bloco para carregar.');
      return;
    }
    setError('');
    setBusy(true);
    try {
      await onApply(saved, applyBlocks);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleExport = (saved: SavedProfile) => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(saved, null, 2) + '\n'], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = savedProfileFileName(saved);
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setError('');
    setMessage(
      saved.includesApiKeys
        ? `"${saved.name}" exportado. O arquivo contém suas chaves de API em texto aberto: guarde em local seguro.`
        : `"${saved.name}" exportado.`
    );
  };

  const handleDelete = async (slot: number, saved: SavedProfile) => {
    if (!window.confirm(`Excluir o perfil "${saved.name}"? Isso não pode ser desfeito (exporte antes se quiser guardar uma cópia).`)) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const res = await fetch(`/api/saved-profiles/${slot}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(await readError(res, 'Não foi possível excluir o perfil.'));
      await loadSlots();
      setApplyingSlot(null);
      setMessage(`Perfil "${saved.name}" excluído.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleRename = async (slot: number, saved: SavedProfile) => {
    const newName = cleanProfileName(renameValue, saved.name);
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await putSlot(slot, { ...saved, name: newName });
      await loadSlots();
      setRenamingSlot(null);
      setMessage(`Perfil renomeado para "${newName}".`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const openImport = (slot: number) => {
    importSlot.current = slot;
    importInput.current?.click();
  };

  const handleImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const slot = importSlot.current;
    setError('');
    setMessage('');
    try {
      if (file.size > MAX_SAVED_PROFILE_BYTES) throw new Error('O arquivo é grande demais (máximo 25 MB).');
      const fallbackName = file.name.replace(/\.json$/i, '').replace(/[_-]+/g, ' ').trim() || defaultName(slot);
      const imported = parseSavedProfile(await file.text(), fallbackName);
      const existing = slotOf(slot)?.profile;
      if (existing && !window.confirm(`O slot ${slot} já tem o perfil "${existing.name}". Substituir pelo arquivo importado?`)) return;
      setBusy(true);
      await putSlot(slot, imported);
      await loadSlots();
      setMessage(`"${imported.name}" importado no slot ${slot}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const blockCheckbox = (
    id: keyof SavedProfileBlocks,
    checked: boolean,
    onChange: (value: boolean) => void,
    icon: React.ReactNode,
    detail: string,
    disabled = false
  ) => (
    <label
      className={`flex items-start gap-3 p-3 rounded-xl border transition ${
        disabled
          ? 'border-slate-800 bg-slate-900/40 opacity-60 cursor-not-allowed'
          : checked
          ? 'border-blue-500/50 bg-blue-500/10 cursor-pointer'
          : 'border-slate-800 bg-slate-900/60 hover:border-slate-700 cursor-pointer'
      }`}
    >
      <input
        type="checkbox"
        checked={checked && !disabled}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 w-4 h-4 rounded bg-slate-900 border-slate-700 text-blue-600 focus:ring-blue-500"
      />
      <span className="flex-1">
        <span className="flex items-center gap-2 font-semibold text-slate-100">
          {icon}
          {BLOCK_LABELS[id]}
        </span>
        <span className="block text-[11px] text-slate-400 mt-0.5">{detail}</span>
      </span>
    </label>
  );

  const targetExisting = slotOf(targetSlot)?.profile;
  const slotNumbers = Array.from({ length: SAVED_PROFILE_SLOTS }, (_, index) => index + 1);
  const savedCount = slots.filter((item) => item.profile).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-5 sm:p-6 shadow-2xl relative">
        <div className="flex items-center justify-between pb-4 border-b border-slate-800 sticky top-0 bg-slate-900 z-10">
          <div className="flex items-center gap-2">
            <Save className="w-5 h-5 text-blue-400" />
            <h3 className="text-base font-bold text-white">Perfis salvos</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
            aria-label="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <input
          ref={importInput}
          type="file"
          accept=".json,application/json"
          onChange={handleImportFile}
          className="hidden"
          aria-label="Importar perfil em JSON"
        />

        {/* Abas */}
        <div className="flex gap-1 mt-4 p-0.5 rounded-lg bg-slate-950 border border-slate-800 text-xs font-semibold w-fit">
          <button
            type="button"
            onClick={() => setTab('save')}
            className={`px-3 py-1.5 rounded-md transition ${tab === 'save' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
          >
            Salvar perfil
          </button>
          <button
            type="button"
            onClick={() => setTab('manage')}
            className={`px-3 py-1.5 rounded-md transition ${tab === 'manage' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
          >
            Meus perfis ({savedCount}/{SAVED_PROFILE_SLOTS})
          </button>
        </div>

        <div className="py-4 space-y-4 text-xs">
          {error && (
            <div role="alert" className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
          {message && (
            <div role="status" className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 flex items-start gap-2">
              <Check className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{message}</span>
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-slate-400">
              <Loader2 className="w-4 h-4 animate-spin" /> Carregando perfis...
            </div>
          ) : tab === 'save' ? (
            <>
              {/* Slot de destino */}
              <div className="space-y-2">
                <div className="font-bold text-slate-200">Salvar em</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {slotNumbers.map((slot) => {
                    const existing = slotOf(slot)?.profile;
                    const active = targetSlot === slot;
                    return (
                      <button
                        key={slot}
                        type="button"
                        onClick={() => chooseSlot(slot)}
                        className={`text-left p-3 rounded-xl border transition ${
                          active ? 'border-blue-500/60 bg-blue-500/10' : 'border-slate-800 bg-slate-900/60 hover:border-slate-700'
                        }`}
                      >
                        <span className="block font-semibold text-slate-100">Slot {slot}</span>
                        <span className="block text-[11px] text-slate-400 truncate">
                          {existing ? `Ocupado: ${existing.name}` : 'Vazio'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label htmlFor="saved-profile-name" className="block font-bold text-slate-200 mb-1">
                  Nome do perfil
                </label>
                <input
                  id="saved-profile-name"
                  type="text"
                  value={name}
                  maxLength={MAX_PROFILE_NAME}
                  onChange={(e) => {
                    setName(e.target.value);
                    setNameTouched(true);
                  }}
                  placeholder="Ex.: Customer Support – Web3"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
                />
              </div>

              {/* Blocos */}
              <div className="space-y-2">
                <div className="font-bold text-slate-200">O que salvar neste perfil</div>
                {blockCheckbox(
                  'companies',
                  blocks.companies,
                  (value) => setBlocks({ ...blocks, companies: value }),
                  <Building2 className="w-4 h-4 text-cyan-400" />,
                  companyCount > 0 ? `${companyCount} empresa(s) carregada(s) agora.` : 'Nenhuma empresa carregada no momento.',
                  companyCount === 0
                )}
                {blockCheckbox(
                  'candidate',
                  blocks.candidate,
                  (value) => setBlocks({ ...blocks, candidate: value }),
                  <UserRound className="w-4 h-4 text-purple-400" />,
                  hasCandidate
                    ? `${profile.name || 'Perfil sem nome'} · inclui currículos (PT/EN), experiências, links e textos de estilo.`
                    : 'O perfil do candidato ainda está vazio.',
                  !hasCandidate
                )}
                {blockCheckbox(
                  'settings',
                  blocks.settings,
                  (value) => setBlocks({ ...blocks, settings: value }),
                  <Sliders className="w-4 h-4 text-emerald-400" />,
                  'Provedores de IA, busca web, limites, idioma padrão e todas as opções da tela de configurações.'
                )}
                {blocks.settings && (
                  <label className="flex items-start gap-3 ml-7 p-3 rounded-xl border border-slate-800 bg-slate-950/60 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={includeApiKeys}
                      onChange={(e) => setIncludeApiKeys(e.target.checked)}
                      className="mt-0.5 w-4 h-4 rounded bg-slate-900 border-slate-700 text-blue-600 focus:ring-blue-500"
                    />
                    <span>
                      <span className="flex items-center gap-2 font-semibold text-slate-100">
                        <KeyRound className="w-4 h-4 text-amber-400" />
                        Incluir chaves de API ({currentKeyCount} preenchida(s))
                      </span>
                      <span className="block text-[11px] text-slate-400 mt-0.5">
                        Desmarque para salvar só modelos e ajustes. Chaves ficam gravadas em texto aberto no seu computador.
                      </span>
                    </span>
                  </label>
                )}
              </div>

              {targetExisting && (
                <p className="text-amber-300">
                  O slot {targetSlot} já tem o perfil "{targetExisting.name}". Salvar vai substituí-lo.
                </p>
              )}

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={busy || !hasAnyBlock}
                  className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  {targetExisting ? 'Salvar e substituir' : 'Salvar perfil'}
                </button>
              </div>
            </>
          ) : (
            <div className="space-y-3">
              {slotNumbers.map((slot) => {
                const state = slotOf(slot);
                const saved = state?.profile;
                if (!saved) {
                  return (
                    <div key={slot} className="p-4 rounded-xl border border-dashed border-slate-700 bg-slate-950/60 flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="font-semibold text-slate-300">Slot {slot} · vazio</div>
                        {state?.error && <div className="text-rose-300 text-[11px] mt-0.5">{state.error}</div>}
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            chooseSlot(slot);
                            setTab('save');
                          }}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 font-semibold text-white hover:bg-blue-500"
                        >
                          <Save className="w-3.5 h-3.5" /> Salvar aqui
                        </button>
                        <button
                          type="button"
                          onClick={() => openImport(slot)}
                          disabled={busy}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-1.5 font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
                        >
                          <Upload className="w-3.5 h-3.5" /> Importar .json
                        </button>
                      </div>
                    </div>
                  );
                }

                const isRenaming = renamingSlot === slot;
                const isApplying = applyingSlot === slot;
                return (
                  <div key={slot} className="p-4 rounded-xl border border-slate-800 bg-slate-950/80 space-y-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="text-[11px] text-slate-500">Slot {slot}</div>
                        {isRenaming ? (
                          <div className="flex items-center gap-2 mt-1">
                            <input
                              autoFocus
                              type="text"
                              value={renameValue}
                              maxLength={MAX_PROFILE_NAME}
                              onChange={(e) => setRenameValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') void handleRename(slot, saved);
                                if (e.key === 'Escape') setRenamingSlot(null);
                              }}
                              className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
                              aria-label="Novo nome do perfil"
                            />
                            <button type="button" onClick={() => handleRename(slot, saved)} disabled={busy} className="p-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50" aria-label="Confirmar nome">
                              <Check className="w-4 h-4" />
                            </button>
                            <button type="button" onClick={() => setRenamingSlot(null)} className="p-1.5 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700" aria-label="Cancelar">
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <div className="text-sm font-bold text-white truncate">{saved.name}</div>
                            <button
                              type="button"
                              onClick={() => {
                                setRenamingSlot(slot);
                                setRenameValue(saved.name);
                                setApplyingSlot(null);
                              }}
                              className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800"
                              title="Renomear"
                              aria-label="Renomear perfil"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                        <div className="text-[11px] text-slate-500 mt-0.5">Salvo em {formatDate(saved.savedAt)}</div>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-1.5 text-[11px]">
                      {saved.blocks.companies && (
                        <span className="px-2 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-300">
                          {saved.companies?.length ?? 0} empresa(s)
                        </span>
                      )}
                      {saved.blocks.candidate && (
                        <span className="px-2 py-0.5 rounded-full bg-purple-500/10 border border-purple-500/30 text-purple-300">
                          Candidato{saved.candidate?.name ? `: ${saved.candidate.name}` : ''}
                        </span>
                      )}
                      {saved.blocks.settings && (
                        <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-300">
                          Configurações
                        </span>
                      )}
                      {saved.blocks.settings && (
                        <span
                          className={`px-2 py-0.5 rounded-full border ${
                            saved.includesApiKeys
                              ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                              : 'bg-slate-800 border-slate-700 text-slate-400'
                          }`}
                        >
                          {saved.includesApiKeys ? `${countApiKeys(saved.config)} chave(s) de API` : 'sem chaves de API'}
                        </span>
                      )}
                    </div>

                    {isApplying ? (
                      <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 space-y-2">
                        <div className="font-semibold text-slate-200">Carregar quais blocos?</div>
                        {(['companies', 'candidate', 'settings'] as const)
                          .filter((id) => saved.blocks[id])
                          .map((id) => (
                            <label key={id} className="flex items-center gap-2 text-slate-300 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={applyBlocks[id]}
                                onChange={(e) => setApplyBlocks({ ...applyBlocks, [id]: e.target.checked })}
                                className="w-4 h-4 rounded bg-slate-900 border-slate-700 text-blue-600 focus:ring-blue-500"
                              />
                              {BLOCK_LABELS[id]}
                            </label>
                          ))}
                        <p className="text-[11px] text-slate-400">
                          Os blocos marcados substituem o que está na tela agora. Chaves de API só mudam se o perfil as tiver.
                        </p>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => handleApply(saved)}
                            disabled={busy}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
                          >
                            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Aplicar
                          </button>
                          <button
                            type="button"
                            onClick={() => setApplyingSlot(null)}
                            className="rounded-lg bg-slate-800 px-3 py-1.5 font-semibold text-slate-200 hover:bg-slate-700"
                          >
                            Cancelar
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => startApply(saved, slot)}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 font-semibold text-white hover:bg-blue-500"
                        >
                          <FolderOpen className="w-3.5 h-3.5" /> Carregar
                        </button>
                        <button
                          type="button"
                          onClick={() => handleExport(saved)}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-1.5 font-semibold text-white hover:bg-slate-700"
                        >
                          <Download className="w-3.5 h-3.5" /> Exportar .json
                        </button>
                        <button
                          type="button"
                          onClick={() => openImport(slot)}
                          disabled={busy}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-1.5 font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
                        >
                          <Upload className="w-3.5 h-3.5" /> Importar .json
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(slot, saved)}
                          disabled={busy}
                          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-semibold text-rose-300 hover:bg-rose-500/10 disabled:opacity-50"
                        >
                          <Trash2 className="w-3.5 h-3.5" /> Excluir
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
              <p className="text-slate-500 text-[11px]">
                Os perfis ficam na pasta <code>saved-profiles/</code> do app (fora de <code>data/</code>, então o "Apagar dados" não mexe neles).
                Importar também aceita um <code>config.json</code> ou um <code>perfil_candidato.json</code> antigos.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
