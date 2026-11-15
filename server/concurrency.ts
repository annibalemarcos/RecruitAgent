// Utilitários de concorrência usados pelo executor de pesquisas.

/** Converte para inteiro dentro de [min, max]; valores inválidos usam o fallback. */
export function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

/** Limite máximo de itens em paralelo (empresas ou gerações de IA). Igual ao slider da tela. */
export const MAX_PARALLEL = 6;

/**
 * Processa `items` com no máximo `limit` tarefas simultâneas.
 * - `shouldStop` é consultado antes de cada novo item (cancelamento).
 * - Se uma tarefa lançar erro, nenhuma nova é iniciada; as já em andamento terminam
 *   e só então o primeiro erro é relançado (o chamador nunca fica com tarefas "soltas").
 */
export async function runPool<T>(
  items: readonly T[],
  limit: number,
  task: (item: T, index: number) => Promise<void>,
  shouldStop: () => boolean = () => false
): Promise<void> {
  let next = 0;
  let failed = false;
  let firstError: unknown;
  const worker = async () => {
    while (!failed && !shouldStop()) {
      const index = next++;
      if (index >= items.length) return;
      try {
        await task(items[index], index);
      } catch (error) {
        if (!failed) { failed = true; firstError = error; }
        return;
      }
    }
  };
  const workers = Math.max(1, Math.min(Math.floor(limit) || 1, items.length || 1));
  await Promise.all(Array.from({ length: workers }, worker));
  if (failed) throw firstError;
}
