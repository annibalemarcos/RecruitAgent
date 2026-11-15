import React, { useState } from 'react';
import {
  UserCheck,
  FileText,
  Sparkles,
  Upload,
  Plus,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  Globe,
  Loader2,
  FileCode,
  Download,
  Check,
  Languages,
} from 'lucide-react';
import { CandidateProfile, WorkExperience, ProfessionalLink } from '../types/index.js';
import { SAMPLE_PROFILE } from '../utils/sampleData.js';

interface ProfileEditorProps {
  profile: CandidateProfile;
  onChange: (profile: CandidateProfile) => void;
}

export const ProfileEditor: React.FC<ProfileEditorProps> = ({ profile, onChange }) => {
  const [activeTab, setActiveTab] = useState<'upload' | 'text' | 'json' | 'form'>('form');
  const [textLang, setTextLang] = useState<'pt' | 'en'>('pt');
  const [rawTextPt, setRawTextPt] = useState<string>(profile.cvPtRawText || '');
  const [rawTextEn, setRawTextEn] = useState<string>(profile.cvEnRawText || '');
  const [jsonText, setJsonText] = useState<string>('');
  const [isExtracting, setIsExtracting] = useState<boolean>(false);
  const [extractingTarget, setExtractingTarget] = useState<'pt' | 'en' | null>(null);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [jsonSuccessMsg, setJsonSuccessMsg] = useState<string | null>(null);
  const [newSkill, setNewSkill] = useState<string>('');
  const [newRole, setNewRole] = useState<string>('');

  const handleImportJson = (jsonString: string) => {
    try {
      setExtractError(null);
      const parsed = JSON.parse(jsonString);
      if (!parsed || typeof parsed !== 'object') {
        throw new Error('O conteúdo fornecido não é um objeto JSON válido.');
      }

      const validatedProfile: CandidateProfile = {
        name: typeof parsed.name === 'string' ? parsed.name : '',
        email: typeof parsed.email === 'string' ? parsed.email : '',
        phone: typeof parsed.phone === 'string' ? parsed.phone : '',
        location: typeof parsed.location === 'string' ? parsed.location : '',
        summary: typeof parsed.summary === 'string' ? parsed.summary : '',
        summaryEn: typeof parsed.summaryEn === 'string' ? parsed.summaryEn : '',
        targetRoles: Array.isArray(parsed.targetRoles) ? parsed.targetRoles : [],
        prioritySkills: Array.isArray(parsed.prioritySkills) ? parsed.prioritySkills : [],
        workPreference: ['remote', 'hybrid', 'onsite', 'any'].includes(parsed.workPreference)
          ? parsed.workPreference
          : 'any',
        professionalLinks: Array.isArray(parsed.professionalLinks)
          ? parsed.professionalLinks.map((l: any) => ({
              label: l.label || 'Link',
              url: l.url || '',
            }))
          : [],
        experiences: Array.isArray(parsed.experiences)
          ? parsed.experiences.map((exp: any) => ({
              role: exp.role || 'Cargo',
              company: exp.company || 'Empresa',
              period: exp.period || '',
              highlights: Array.isArray(exp.highlights) ? exp.highlights : [],
            }))
          : [],
        education: Array.isArray(parsed.education) ? parsed.education : [],
        certifications: Array.isArray(parsed.certifications) ? parsed.certifications : [],
        languages: Array.isArray(parsed.languages) ? parsed.languages : [],
        writingStyleSample:
          typeof parsed.writingStyleSample === 'string' ? parsed.writingStyleSample : '',
        additionalNotes:
          typeof parsed.additionalNotes === 'string' ? parsed.additionalNotes : '',
        materialLanguage: ['pt', 'en', 'both', 'auto'].includes(parsed.materialLanguage)
          ? parsed.materialLanguage
          : 'both',
        defaultViewLanguage:
          parsed.defaultViewLanguage === 'en' || parsed.defaultViewLanguage === 'pt'
            ? parsed.defaultViewLanguage
            : undefined,
        parsedFromCv: true,
        cvPtFilename: parsed.cvPtFilename,
        cvPtRawText: parsed.cvPtRawText,
        cvEnFilename: parsed.cvEnFilename,
        cvEnRawText: parsed.cvEnRawText,
      };

      onChange(validatedProfile);
      setJsonSuccessMsg('Perfil importado com sucesso a partir do arquivo JSON!');
      setTimeout(() => {
        setJsonSuccessMsg(null);
        setActiveTab('form');
      }, 1200);
    } catch (err: any) {
      setExtractError(`Erro no formato JSON: ${err.message}`);
    }
  };

  const handleJsonFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const content = reader.result as string;
      setJsonText(content);
      handleImportJson(content);
    };
    reader.readAsText(file, 'UTF-8');
  };

  const downloadProfileJson = (data: CandidateProfile, filename: string = 'perfil_candidato.json') => {
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: 'application/json;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, lang: 'pt' | 'en') => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.name.toLowerCase().endsWith('.json')) {
      const reader = new FileReader();
      reader.onload = () => {
        const content = reader.result as string;
        setJsonText(content);
        handleImportJson(content);
      };
      reader.readAsText(file, 'UTF-8');
      return;
    }

    setIsExtracting(true);
    setExtractingTarget(lang);
    setExtractError(null);

    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = (reader.result as string).split(',')[1];
        const res = await fetch('/api/extract-cv', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fileBase64: base64,
            fileName: file.name,
            mimeType: file.type,
            cvLang: lang,
          }),
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || 'Falha ao extrair currículo');
        }

        const data = await res.json();
        const extracted = data.profile as CandidateProfile;

        if (lang === 'pt') {
          onChange({
            ...profile,
            ...extracted,
            name: extracted.name || profile.name,
            email: extracted.email || profile.email,
            location: extracted.location || profile.location,
            summary: extracted.summary || profile.summary,
            cvPtFilename: file.name,
            cvPtRawText: data.rawText || '',
            materialLanguage: profile.materialLanguage || 'both',
            parsedFromCv: true,
          });
          setRawTextPt(data.rawText || '');
        } else {
          // English CV
          onChange({
            ...profile,
            name: profile.name || extracted.name,
            email: profile.email || extracted.email,
            location: profile.location || extracted.location,
            summaryEn: extracted.summaryEn || extracted.summary || profile.summaryEn,
            targetRoles: profile.targetRoles.length > 0 ? profile.targetRoles : extracted.targetRoles,
            prioritySkills: profile.prioritySkills.length > 0 ? profile.prioritySkills : extracted.prioritySkills,
            experiences: profile.experiences.length > 0 ? profile.experiences : extracted.experiences,
            education: profile.education.length > 0 ? profile.education : extracted.education,
            certifications: profile.certifications.length > 0 ? profile.certifications : extracted.certifications,
            languages: profile.languages.length > 0 ? profile.languages : extracted.languages,
            cvEnFilename: file.name,
            cvEnRawText: data.rawText || '',
            materialLanguage: 'both',
            parsedFromCv: true,
          });
          setRawTextEn(data.rawText || '');
        }

        setActiveTab('form');
      };

      reader.readAsDataURL(file);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setExtractError(msg);
    } finally {
      setIsExtracting(false);
      setExtractingTarget(null);
    }
  };

  const handleExtractFromText = async (lang: 'pt' | 'en') => {
    const textToProcess = lang === 'pt' ? rawTextPt : rawTextEn;
    if (!textToProcess.trim()) return;

    setIsExtracting(true);
    setExtractingTarget(lang);
    setExtractError(null);

    try {
      const res = await fetch('/api/extract-cv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawText: textToProcess, cvLang: lang }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Falha ao processar texto do currículo');
      }

      const data = await res.json();
      const extracted = data.profile as CandidateProfile;

      if (lang === 'pt') {
        onChange({
          ...profile,
          ...extracted,
          name: extracted.name || profile.name,
          email: extracted.email || profile.email,
          location: extracted.location || profile.location,
          summary: extracted.summary || profile.summary,
          cvPtRawText: textToProcess,
          materialLanguage: profile.materialLanguage || 'both',
          parsedFromCv: true,
        });
      } else {
        onChange({
          ...profile,
          name: profile.name || extracted.name,
          email: profile.email || extracted.email,
          location: profile.location || extracted.location,
          summaryEn: extracted.summaryEn || extracted.summary || profile.summaryEn,
          targetRoles: profile.targetRoles.length > 0 ? profile.targetRoles : extracted.targetRoles,
          prioritySkills: profile.prioritySkills.length > 0 ? profile.prioritySkills : extracted.prioritySkills,
          experiences: profile.experiences.length > 0 ? profile.experiences : extracted.experiences,
          education: profile.education.length > 0 ? profile.education : extracted.education,
          certifications: profile.certifications.length > 0 ? profile.certifications : extracted.certifications,
          languages: profile.languages.length > 0 ? profile.languages : extracted.languages,
          cvEnRawText: textToProcess,
          materialLanguage: 'both',
          parsedFromCv: true,
        });
      }

      setActiveTab('form');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setExtractError(msg);
    } finally {
      setIsExtracting(false);
      setExtractingTarget(null);
    }
  };

  const addSkill = () => {
    if (newSkill.trim() && !profile.prioritySkills.includes(newSkill.trim())) {
      onChange({
        ...profile,
        prioritySkills: [...profile.prioritySkills, newSkill.trim()],
      });
      setNewSkill('');
    }
  };

  const removeSkill = (skill: string) => {
    onChange({
      ...profile,
      prioritySkills: profile.prioritySkills.filter((s) => s !== skill),
    });
  };

  const addRole = () => {
    if (newRole.trim() && !profile.targetRoles.includes(newRole.trim())) {
      onChange({
        ...profile,
        targetRoles: [...profile.targetRoles, newRole.trim()],
      });
      setNewRole('');
    }
  };

  const removeRole = (role: string) => {
    onChange({
      ...profile,
      targetRoles: profile.targetRoles.filter((r) => r !== role),
    });
  };

  const addLink = () => {
    onChange({
      ...profile,
      professionalLinks: [...profile.professionalLinks, { label: 'LinkedIn', url: 'https://' }],
    });
  };

  const updateLink = (index: number, field: 'label' | 'url', val: string) => {
    const updated = [...profile.professionalLinks];
    updated[index] = { ...updated[index], [field]: val };
    onChange({ ...profile, professionalLinks: updated });
  };

  const removeLink = (index: number) => {
    onChange({
      ...profile,
      professionalLinks: profile.professionalLinks.filter((_, i) => i !== index),
    });
  };

  const addExperience = () => {
    onChange({
      ...profile,
      experiences: [
        {
          role: 'Cargo',
          company: 'Empresa',
          period: '2023 - Presente',
          highlights: ['Realização comprovada'],
        },
        ...profile.experiences,
      ],
    });
  };

  const removeExperience = (index: number) => {
    onChange({
      ...profile,
      experiences: profile.experiences.filter((_, i) => i !== index),
    });
  };

  const updateExperience = (index: number, exp: Partial<WorkExperience>) => {
    const updated = [...profile.experiences];
    updated[index] = { ...updated[index], ...exp };
    onChange({ ...profile, experiences: updated });
  };

  return (
    <div className="bg-slate-900/80 rounded-2xl border border-slate-800 p-5 sm:p-6 shadow-xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
            <UserCheck className="w-5 h-5 text-indigo-400" />
            2. Perfil do Candidato & Fatos do Currículo
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Carregue seus currículos em <strong>Português</strong> e em <strong>Inglês</strong> para geração bilingue automática.
          </p>
        </div>

        {/* Tab switcher */}
        <div className="flex rounded-lg bg-slate-950 p-1 border border-slate-800 self-start sm:self-auto overflow-x-auto max-w-full">
          <button
            type="button"
            onClick={() => setActiveTab('upload')}
            className={`px-2.5 py-1 text-xs font-semibold rounded-md transition whitespace-nowrap ${
              activeTab === 'upload' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            Upload CVs (PT / EN)
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('text')}
            className={`px-2.5 py-1 text-xs font-semibold rounded-md transition whitespace-nowrap ${
              activeTab === 'text' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            Colar Texto
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('json')}
            className={`px-2.5 py-1 text-xs font-semibold rounded-md transition whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === 'json' ? 'bg-blue-600 text-white' : 'text-cyan-400 hover:text-white'
            }`}
          >
            <FileCode className="w-3.5 h-3.5" />
            Importar JSON
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('form')}
            className={`px-2.5 py-1 text-xs font-semibold rounded-md transition whitespace-nowrap ${
              activeTab === 'form' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            Revisar Perfil
          </button>
        </div>
      </div>

      {/* Strict Anti-Hallucination Notice */}
      <div className="mb-5 p-3 rounded-xl bg-amber-500/10 border border-amber-500/25 flex items-start gap-2.5 text-xs text-amber-300">
        <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
        <div>
          <span className="font-bold">Política Factual Estrita & Suporte Bilíngue:</span> A IA extrai e utiliza apenas as experiências e realizações comprovadas dos seus currículos em PT-BR e EN, gerando simultaneamente Cold Emails e Cartas em ambos os idiomas.
        </div>
      </div>

      {extractError && (
        <div className="mb-4 p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
          {extractError}
        </div>
      )}

      {jsonSuccessMsg && (
        <div className="mb-4 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{jsonSuccessMsg}</span>
        </div>
      )}

      {/* 1. Upload Subtab: Bilingual CVs */}
      {activeTab === 'upload' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* PT-BR CV Upload */}
            <div className="border-2 border-dashed border-slate-700 hover:border-blue-500 bg-slate-950/50 rounded-xl p-5 text-center flex flex-col justify-between transition">
              <div>
                <input
                  id="cv-pt-file-input"
                  type="file"
                  accept=".pdf,.docx,.txt,.json"
                  onChange={(e) => handleFileUpload(e, 'pt')}
                  disabled={isExtracting}
                  className="hidden"
                />
                <div className="flex items-center justify-center gap-2 mb-2">
                  <span className="text-xl">🇧🇷</span>
                  <span className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                    Currículo em Português (PT-BR)
                  </span>
                </div>

                {isExtracting && extractingTarget === 'pt' ? (
                  <div className="py-4">
                    <Loader2 className="w-6 h-6 text-blue-400 animate-spin mx-auto mb-2" />
                    <p className="text-xs font-semibold text-slate-300">
                      Processando currículo em português...
                    </p>
                  </div>
                ) : profile.cvPtFilename ? (
                  <div className="py-3 px-2 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-300 text-xs my-2">
                    <div className="flex items-center justify-center gap-1.5 font-bold">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      <span>{profile.cvPtFilename}</span>
                    </div>
                    <p className="text-[10px] text-slate-400 mt-1">Carregado e estruturado ✓</p>
                  </div>
                ) : (
                  <div className="py-3">
                    <Upload className="w-8 h-8 mx-auto text-slate-500 mb-2" />
                    <p className="text-xs font-semibold text-slate-300">
                      Selecione seu currículo em Português
                    </p>
                    <p className="text-[11px] text-slate-500 mt-1">Suporta PDF, DOCX, TXT ou JSON</p>
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={() => document.getElementById('cv-pt-file-input')?.click()}
                disabled={isExtracting}
                className="mt-3 w-full py-2 px-3 rounded-lg text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-50 transition"
              >
                {profile.cvPtFilename ? 'Substituir Currículo (PT)' : 'Carregar Currículo em Português'}
              </button>
            </div>

            {/* EN CV Upload */}
            <div className="border-2 border-dashed border-slate-700 hover:border-indigo-500 bg-slate-950/50 rounded-xl p-5 text-center flex flex-col justify-between transition">
              <div>
                <input
                  id="cv-en-file-input"
                  type="file"
                  accept=".pdf,.docx,.txt,.json"
                  onChange={(e) => handleFileUpload(e, 'en')}
                  disabled={isExtracting}
                  className="hidden"
                />
                <div className="flex items-center justify-center gap-2 mb-2">
                  <span className="text-xl">🇺🇸</span>
                  <span className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                    Resume in English (EN)
                  </span>
                </div>

                {isExtracting && extractingTarget === 'en' ? (
                  <div className="py-4">
                    <Loader2 className="w-6 h-6 text-indigo-400 animate-spin mx-auto mb-2" />
                    <p className="text-xs font-semibold text-slate-300">
                      Processing English resume...
                    </p>
                  </div>
                ) : profile.cvEnFilename ? (
                  <div className="py-3 px-2 bg-indigo-500/10 border border-indigo-500/30 rounded-lg text-indigo-300 text-xs my-2">
                    <div className="flex items-center justify-center gap-1.5 font-bold">
                      <CheckCircle2 className="w-4 h-4 text-indigo-400" />
                      <span>{profile.cvEnFilename}</span>
                    </div>
                    <p className="text-[10px] text-slate-400 mt-1">Loaded and structured ✓</p>
                  </div>
                ) : (
                  <div className="py-3">
                    <Upload className="w-8 h-8 mx-auto text-slate-500 mb-2" />
                    <p className="text-xs font-semibold text-slate-300">
                      Select your English CV / Resume
                    </p>
                    <p className="text-[11px] text-slate-500 mt-1">Supports PDF, DOCX, TXT or JSON</p>
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={() => document.getElementById('cv-en-file-input')?.click()}
                disabled={isExtracting}
                className="mt-3 w-full py-2 px-3 rounded-lg text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 transition"
              >
                {profile.cvEnFilename ? 'Replace English Resume' : 'Upload Resume in English'}
              </button>
            </div>
          </div>

          <p className="text-center text-[11px] text-slate-400">
            Dica: Você pode subir ambos os currículos ou apenas um deles. Se subir os dois, a IA usará a versão exata para o Cold Email e Cover Letter de cada idioma.
          </p>
        </div>
      )}

      {/* 2. Text Subtab: Bilingual Text Paste */}
      {activeTab === 'text' && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
            <button
              type="button"
              onClick={() => setTextLang('pt')}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition ${
                textLang === 'pt' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              🇧🇷 Texto em Português (PT-BR)
            </button>
            <button
              type="button"
              onClick={() => setTextLang('en')}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition ${
                textLang === 'en' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              🇺🇸 English Text (EN)
            </button>
          </div>

          {textLang === 'pt' ? (
            <textarea
              rows={7}
              value={rawTextPt}
              onChange={(e) => setRawTextPt(e.target.value)}
              placeholder="Cole o conteúdo completo do seu currículo em Português aqui..."
              className="w-full bg-slate-950/80 border border-slate-700 rounded-xl p-3 text-xs sm:text-sm font-sans text-slate-200 focus:outline-none focus:border-blue-500"
            />
          ) : (
            <textarea
              rows={7}
              value={rawTextEn}
              onChange={(e) => setRawTextEn(e.target.value)}
              placeholder="Paste your full English resume text here..."
              className="w-full bg-slate-950/80 border border-slate-700 rounded-xl p-3 text-xs sm:text-sm font-sans text-slate-200 focus:outline-none focus:border-indigo-500"
            />
          )}

          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => handleExtractFromText(textLang)}
              disabled={isExtracting || !(textLang === 'pt' ? rawTextPt : rawTextEn).trim()}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-50 transition"
            >
              {isExtracting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Processando Currículo ({textLang.toUpperCase()})...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 text-cyan-300" /> Extrair Fatos ({textLang.toUpperCase()})
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* 3. JSON Import Subtab */}
      {activeTab === 'json' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-slate-300 font-semibold flex items-center gap-1.5">
              <FileCode className="w-4 h-4 text-cyan-400" />
              Importe ou cole um arquivo JSON com todos os dados:
            </span>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  const exampleJson = JSON.stringify(SAMPLE_PROFILE, null, 2);
                  setJsonText(exampleJson);
                  handleImportJson(exampleJson);
                }}
                className="inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-lg bg-cyan-950/60 border border-cyan-800 text-cyan-300 hover:bg-cyan-900 transition font-medium"
              >
                <Sparkles className="w-3 h-3 text-cyan-400" />
                Carregar Exemplo
              </button>

              <button
                type="button"
                onClick={() =>
                  downloadProfileJson(SAMPLE_PROFILE, 'perfil_candidato_exemplo.json')
                }
                className="inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition font-medium"
              >
                <Download className="w-3 h-3" />
                Baixar Modelo JSON
              </button>
            </div>
          </div>

          <div
            className="border-2 border-dashed border-slate-700 bg-slate-950/40 rounded-xl p-4 text-center cursor-pointer hover:border-slate-600 transition"
            onClick={() => document.getElementById('json-file-input')?.click()}
          >
            <input
              id="json-file-input"
              type="file"
              accept=".json,application/json"
              onChange={handleJsonFileUpload}
              className="hidden"
            />
            <FileCode className="w-6 h-6 mx-auto text-cyan-400 mb-1" />
            <p className="text-xs font-semibold text-slate-200">
              Clique aqui para selecionar um arquivo .json ou arraste para esta área
            </p>
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-semibold text-slate-400">
              Ou cole a estrutura JSON do candidato diretamente:
            </label>
            <textarea
              rows={8}
              value={jsonText}
              onChange={(e) => setJsonText(e.target.value)}
              placeholder={`{\n  "name": "Nome Completo",\n  "email": "email@exemplo.com",\n  "summary": "Resumo...",\n  "targetRoles": ["Senior Engineer"],\n  "prioritySkills": ["TypeScript", "Node.js"],\n  "workPreference": "remote",\n  "experiences": [...]\n}`}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs font-mono text-slate-200 focus:outline-none focus:border-blue-500 shadow-inner"
            />
          </div>

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => handleImportJson(jsonText)}
              disabled={!jsonText.trim()}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-50 transition shadow-md shadow-blue-500/25"
            >
              <Check className="w-3.5 h-3.5" />
              Validar e Importar Perfil JSON
            </button>
          </div>
        </div>
      )}

      {/* 4. Form Review Subtab */}
      {activeTab === 'form' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-slate-800">
            <span className="text-xs text-slate-400 font-semibold">
              Campos editáveis do perfil (sincronizados com o currículo/JSON):
            </span>

            <button
              type="button"
              onClick={() =>
                downloadProfileJson(
                  profile,
                  `perfil_${profile.name ? profile.name.toLowerCase().replace(/\s+/g, '_') : 'candidato'}.json`
                )
              }
              className="inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition font-medium"
              title="Salvar perfil atual em arquivo JSON"
            >
              <Download className="w-3 h-3 text-blue-400" />
              Exportar Perfil em JSON
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Nome Completo:
              </label>
              <input
                type="text"
                value={profile.name}
                onChange={(e) => onChange({ ...profile, name: e.target.value })}
                placeholder="Ex: Maria Exemplo"
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                E-mail Pessoal:
              </label>
              <input
                type="email"
                value={profile.email}
                onChange={(e) => onChange({ ...profile, email: e.target.value })}
                placeholder="Ex: maria@example.com"
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Localização Declarada:
              </label>
              <input
                type="text"
                value={profile.location}
                onChange={(e) => onChange({ ...profile, location: e.target.value })}
                placeholder="Ex: São Paulo, Brasil"
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          {/* Work Preference & Language Selection */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Preferência de Trabalho:
              </label>
              <select
                value={profile.workPreference}
                onChange={(e) =>
                  onChange({
                    ...profile,
                    workPreference: e.target.value as CandidateProfile['workPreference'],
                  })
                }
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
              >
                <option value="remote">Remoto (prioritário)</option>
                <option value="hybrid">Híbrido</option>
                <option value="onsite">Presencial</option>
                <option value="any">Indiferente / Aberto a negociação</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center gap-1.5">
                <Languages className="w-3.5 h-3.5 text-blue-400" />
                <span>Geração de Idiomas nos Materiais:</span>
              </label>
              <select
                value={profile.materialLanguage || 'both'}
                onChange={(e) =>
                  onChange({
                    ...profile,
                    materialLanguage: e.target.value as CandidateProfile['materialLanguage'],
                  })
                }
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500 font-medium"
              >
                <option value="both">🇧🇷 🇺🇸 Bilíngue (Gerar em Português e em Inglês)</option>
                <option value="pt">🇧🇷 Apenas Português (pt-BR)</option>
                <option value="en">🇺🇸 Apenas Inglês (en-US)</option>
                <option value="auto">🌐 Automático (conforme o domínio/país da empresa)</option>
              </select>
            </div>
          </div>

          {/* Bilingual Professional Summaries */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center gap-1">
                <span>🇧🇷</span> Resumo Profissional (Português):
              </label>
              <textarea
                rows={3}
                value={profile.summary}
                onChange={(e) => onChange({ ...profile, summary: e.target.value })}
                placeholder="Síntese da trajetória comprovada no currículo em português..."
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center gap-1">
                <span>🇺🇸</span> English Professional Summary (Inglês):
              </label>
              <textarea
                rows={3}
                value={profile.summaryEn || ''}
                onChange={(e) => onChange({ ...profile, summaryEn: e.target.value })}
                placeholder="Proven track record and summary in English..."
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          {/* Target Roles */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Cargos Almejados (Funções):
            </label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {profile.targetRoles.map((role) => (
                <span
                  key={role}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs bg-indigo-500/15 text-indigo-300 border border-indigo-500/30"
                >
                  {role}
                  <button
                    type="button"
                    onClick={() => removeRole(role)}
                    className="hover:text-rose-400 ml-0.5"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={newRole}
                onChange={(e) => setNewRole(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addRole())}
                placeholder="Adicionar cargo (ex: Senior Software Engineer)..."
                className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
              />
              <button
                type="button"
                onClick={addRole}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 rounded-lg border border-slate-700 transition"
              >
                + Adicionar
              </button>
            </div>
          </div>

          {/* Priority Skills */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Competências Prioritárias Comprovadas:
            </label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {profile.prioritySkills.map((skill) => (
                <span
                  key={skill}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs bg-blue-500/15 text-blue-300 border border-blue-500/30"
                >
                  {skill}
                  <button
                    type="button"
                    onClick={() => removeSkill(skill)}
                    className="hover:text-rose-400 ml-0.5"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={newSkill}
                onChange={(e) => setNewSkill(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addSkill())}
                placeholder="Adicionar competência (ex: TypeScript, Docker, Liderança Técnica)..."
                className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
              />
              <button
                type="button"
                onClick={addSkill}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 rounded-lg border border-slate-700 transition"
              >
                + Adicionar
              </button>
            </div>
          </div>

          {/* Professional Links */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-slate-300">
                Links Profissionais (LinkedIn, GitHub, Portfólio):
              </label>
              <button
                type="button"
                onClick={addLink}
                className="text-[11px] text-blue-400 hover:text-blue-300 font-semibold"
              >
                + Adicionar Link
              </button>
            </div>
            <div className="space-y-2">
              {profile.professionalLinks.map((link, idx) => (
                <div key={idx} className="flex gap-2 items-center">
                  <input
                    type="text"
                    value={link.label}
                    onChange={(e) => updateLink(idx, 'label', e.target.value)}
                    placeholder="Rótulo (ex: LinkedIn)"
                    className="w-28 bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
                  />
                  <input
                    type="url"
                    value={link.url}
                    onChange={(e) => updateLink(idx, 'url', e.target.value)}
                    placeholder="https://..."
                    className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
                  />
                  <button
                    type="button"
                    onClick={() => removeLink(idx)}
                    className="p-1.5 text-slate-500 hover:text-rose-400 transition"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Writing Style Sample & Notes */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-800/80">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Amostra de Estilo de Escrita Pessoal (Opcional):
              </label>
              <textarea
                rows={3}
                value={profile.writingStyleSample || ''}
                onChange={(e) => onChange({ ...profile, writingStyleSample: e.target.value })}
                placeholder="Ex: Direto, conciso, focado em impacto de métricas e soluções de engenharia..."
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Informações Adicionais / Restrições (Opcional):
              </label>
              <textarea
                rows={3}
                value={profile.additionalNotes || ''}
                onChange={(e) => onChange({ ...profile, additionalNotes: e.target.value })}
                placeholder="Ex: Disponibilidade para início imediato, sem necessidade de patrocínio..."
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
