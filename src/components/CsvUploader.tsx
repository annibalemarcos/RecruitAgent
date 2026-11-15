import React, { useState, useEffect } from 'react';
import { UploadCloud, FileSpreadsheet, Check, AlertCircle, Trash2, ArrowRight } from 'lucide-react';

export interface ParsedCompanyInput {
  name?: string;
  url: string;
}

interface CsvUploaderProps {
  onCompaniesLoaded: (companies: ParsedCompanyInput[]) => void;
  initialCompanies: ParsedCompanyInput[];
}

export const CsvUploader: React.FC<CsvUploaderProps> = ({
  onCompaniesLoaded,
  initialCompanies,
}) => {
  const [rawContent, setRawContent] = useState<string>('');
  const [fileName, setFileName] = useState<string>('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [delimiter, setDelimiter] = useState<string>(',');
  const [urlColumnIndex, setUrlColumnIndex] = useState<number>(-1);
  const [nameColumnIndex, setNameColumnIndex] = useState<number>(-1);
  const [parsedPreview, setParsedPreview] = useState<ParsedCompanyInput[]>(initialCompanies);
  const [isDragOver, setIsDragOver] = useState<boolean>(false);
  const [manualTextMode, setManualTextMode] = useState<boolean>(false);

  // Empresas trocadas por fora (perfil salvo, dados de exemplo) precisam aparecer na prévia.
  useEffect(() => {
    setParsedPreview(initialCompanies);
  }, [initialCompanies]);

  // Detect delimiter and parse CSV
  const parseCsvText = (text: string, suggestedFileName: string = 'empresas.csv') => {
    setRawContent(text);
    setFileName(suggestedFileName);

    const firstLine = text.split(/\r?\n/)[0] || '';
    const commaCount = (firstLine.match(/,/g) || []).length;
    const semiCount = (firstLine.match(/;/g) || []).length;
    const tabCount = (firstLine.match(/\t/g) || []).length;

    let detectedDelimiter = ',';
    if (semiCount > commaCount && semiCount >= tabCount) detectedDelimiter = ';';
    else if (tabCount > commaCount && tabCount > semiCount) detectedDelimiter = '\t';

    setDelimiter(detectedDelimiter);

    // Split lines
    const rawLines = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);

    if (rawLines.length === 0) {
      setHeaders([]);
      setRows([]);
      return;
    }

    const parseLine = (line: string) => {
      // Basic CSV splitter respecting quotes
      const pattern = new RegExp(
        `(?:^|${detectedDelimiter === '\t' ? '\\t' : detectedDelimiter})("(?:[^"]|"")*"|[^${detectedDelimiter === '\t' ? '\\t' : detectedDelimiter}]*)`,
        'g'
      );
      const matches: string[] = [];
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(line)) !== null) {
        let val = match[1] || '';
        if (val.startsWith('"') && val.endsWith('"')) {
          val = val.slice(1, -1).replace(/""/g, '"');
        }
        matches.push(val.trim());
      }
      return matches;
    };

    const parsedHeaders = parseLine(rawLines[0]);
    const parsedRows = rawLines.slice(1).map(parseLine);

    setHeaders(parsedHeaders);
    setRows(parsedRows);

    // Auto-detect URL column
    const urlMatches = ['url', 'website', 'site', 'domain', 'link', 'pagina', 'web', 'endereco'];
    let autoUrlIdx = parsedHeaders.findIndex((h) =>
      urlMatches.some((m) => h.toLowerCase().includes(m))
    );

    // If headers don't match, check if any column values look like URLs
    if (autoUrlIdx === -1 && parsedRows.length > 0) {
      const sampleRow = parsedRows[0];
      autoUrlIdx = sampleRow.findIndex(
        (cell) => cell.includes('.') && (cell.includes('http') || cell.includes('www.') || cell.includes('.com'))
      );
    }
    if (autoUrlIdx === -1) autoUrlIdx = 0; // Default to first column

    // Auto-detect Name column
    const nameMatches = ['name', 'empresa', 'company', 'nome', 'organizacao', 'razao'];
    let autoNameIdx = parsedHeaders.findIndex((h) =>
      nameMatches.some((m) => h.toLowerCase().includes(m))
    );

    setUrlColumnIndex(autoUrlIdx);
    setNameColumnIndex(autoNameIdx);

    // Assemble initial preview
    buildCompaniesList(parsedRows, autoUrlIdx, autoNameIdx);
  };

  const buildCompaniesList = (rowsList: string[][], urlIdx: number, nameIdx: number) => {
    if (urlIdx < 0) return;

    const list: ParsedCompanyInput[] = [];
    for (const r of rowsList) {
      const rawUrl = r[urlIdx]?.trim();
      if (!rawUrl) continue;

      let name = nameIdx >= 0 && r[nameIdx] ? r[nameIdx].trim() : undefined;
      list.push({
        url: rawUrl,
        name,
      });
    }

    setParsedPreview(list);
    onCompaniesLoaded(list);
  };

  const handleUrlColChange = (idx: number) => {
    setUrlColumnIndex(idx);
    buildCompaniesList(rows, idx, nameColumnIndex);
  };

  const handleNameColChange = (idx: number) => {
    setNameColumnIndex(idx);
    buildCompaniesList(rows, urlColumnIndex, idx);
  };

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      readFile(file);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      readFile(file);
    }
  };

  const readFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      parseCsvText(text, file.name);
    };
    reader.readAsText(file, 'UTF-8');
  };

  return (
    <div className="bg-slate-900/80 rounded-2xl border border-slate-800 p-5 sm:p-6 shadow-xl">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-blue-400" />
            1. Carregar Empresas (CSV ou URLs)
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Suporta delimitador por vírgula (,) ou ponto e vírgula (;). Detecta colunas como url, site, website ou domain.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setManualTextMode(!manualTextMode)}
          className="text-xs font-medium text-slate-400 hover:text-white underline"
        >
          {manualTextMode ? 'Modo Arquivo' : 'Colar Texto / URLs'}
        </button>
      </div>

      {!manualTextMode ? (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragOver(true);
          }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={handleFileDrop}
          className={`border-2 border-dashed rounded-xl p-6 text-center transition cursor-pointer ${
            isDragOver
              ? 'border-blue-500 bg-blue-500/10'
              : 'border-slate-700 bg-slate-950/40 hover:border-slate-600'
          }`}
          onClick={() => document.getElementById('csv-file-input')?.click()}
        >
          <input
            id="csv-file-input"
            type="file"
            accept=".csv,.txt"
            onChange={handleFileSelect}
            className="hidden"
          />
          <UploadCloud className="w-10 h-10 mx-auto text-slate-400 mb-2" />
          <p className="text-sm font-semibold text-slate-200">
            Arraste seu arquivo CSV aqui ou clique para selecionar
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Formatos aceitos: CSV (.csv), TXT (.txt) em UTF-8
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <textarea
            rows={5}
            value={rawContent}
            onChange={(e) => parseCsvText(e.target.value, 'manual_input.csv')}
            placeholder={`empresa;site\nStripe;https://stripe.com\nNubank;https://nubank.com.br\nVercel;https://vercel.com`}
            className="w-full bg-slate-950/80 border border-slate-700 rounded-xl p-3 text-xs sm:text-sm font-mono text-slate-200 focus:outline-none focus:border-blue-500"
          />
          <p className="text-[11px] text-slate-500">
            Dica: você pode colar linhas no formato CSV ou uma URL por linha.
          </p>
        </div>
      )}

      {/* Column mapping controls */}
      {headers.length > 0 && (
        <div className="mt-5 p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-300">
            <span className="font-semibold text-slate-200">
              Arquivo: <span className="text-blue-400 font-mono">{fileName}</span> ({rows.length} linhas, delimitador '{delimiter === '\t' ? 'TAB' : delimiter}')
            </span>
            <span className="text-emerald-400 font-medium flex items-center gap-1">
              <Check className="w-3.5 h-3.5" /> Mapeamento detectado
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Coluna da URL / Website (Obrigatória):
              </label>
              <select
                value={urlColumnIndex}
                onChange={(e) => handleUrlColChange(parseInt(e.target.value, 10))}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500 font-medium"
              >
                {headers.map((h, idx) => (
                  <option key={idx} value={idx}>
                    Coluna {idx + 1}: {h || `(sem título)`}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Coluna do Nome da Empresa (Opcional):
              </label>
              <select
                value={nameColumnIndex}
                onChange={(e) => handleNameColChange(parseInt(e.target.value, 10))}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500 font-medium"
              >
                <option value={-1}>-- Derivar automaticamente do domínio --</option>
                {headers.map((h, idx) => (
                  <option key={idx} value={idx}>
                    Coluna {idx + 1}: {h || `(sem título)`}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Companies preview list */}
      {parsedPreview.length > 0 && (
        <div className="mt-4">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
            <span className="font-semibold text-slate-300">
              Prévia das Empresas Carregadas ({parsedPreview.length}):
            </span>
            <button
              type="button"
              onClick={() => {
                setParsedPreview([]);
                setRawContent('');
                setHeaders([]);
                setRows([]);
                onCompaniesLoaded([]);
              }}
              className="text-rose-400 hover:text-rose-300 flex items-center gap-1 transition"
            >
              <Trash2 className="w-3.5 h-3.5" /> Limpar lista
            </button>
          </div>

          <div className="max-h-48 overflow-y-auto rounded-xl border border-slate-800 bg-slate-950/40 divide-y divide-slate-800/80 text-xs">
            {parsedPreview.slice(0, 10).map((comp, i) => (
              <div
                key={i}
                data-url={comp.url}
                title="Dica: Clique com o botão do meio para abrir este site em nova aba"
                className="px-3 py-2 flex items-center justify-between gap-2 hover:bg-slate-900/60 transition cursor-pointer"
              >
                <div className="flex items-center gap-2 truncate">
                  <span className="w-5 text-slate-500 font-mono text-[11px]">{i + 1}.</span>
                  <span className="font-semibold text-slate-200">{comp.name || 'Auto'}</span>
                  <span className="text-slate-400 truncate font-mono text-[11px]">{comp.url}</span>
                </div>
                <span className="shrink-0 text-[10px] px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
                  Pronto
                </span>
              </div>
            ))}
            {parsedPreview.length > 10 && (
              <div className="p-2 text-center text-slate-500 text-[11px]">
                + {parsedPreview.length - 10} outras empresas prontas para pesquisa...
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
