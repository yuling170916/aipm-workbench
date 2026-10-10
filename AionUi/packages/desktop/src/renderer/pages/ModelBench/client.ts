import { getBaseUrl, resolveCoreCsrfToken } from '@/common/adapter/httpBridge';
import { refreshSession } from '@/common/adapter/sessionRefresh';
import { readModelStream } from './stream';
import type { BenchModel, BenchRecord, BenchResult } from './types';

/** Keep prompts and answers out of the generic HTTP bridge's debug payload logs. */
async function request(path: string, init: RequestInit = {}): Promise<Response> {
  const csrf =
    resolveCoreCsrfToken() ||
    document.cookie
      .split('; ')
      .find((cookie) => cookie.startsWith('aionui-csrf-token='))
      ?.split('=')
      .slice(1)
      .join('=');
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (csrf) headers['x-csrf-token'] = csrf;
  const options = { ...init, headers, credentials: 'same-origin' as const };
  let response = await fetch(`${getBaseUrl()}${path}`, options);
  if (response.status === 401) {
    await refreshSession();
    response = await fetch(`${getBaseUrl()}${path}`, options);
  }
  if (!response.ok) {
    const body: unknown = await response.json().catch((): null => null);
    const message =
      body && typeof body === 'object' && 'error' in body && typeof body.error === 'string' ? body.error : '';
    // Only expose fixed error codes; upstream bodies may contain secrets.
    throw new Error(message.match(/BENCH_[A-Z_0-9]+/)?.[0] ?? `BENCH_HTTP_${response.status}`);
  }
  return response;
}

export async function loadModels(): Promise<BenchModel[]> {
  const data = (await (await request('/api/model-bench/models')).json()) as { data: BenchModel[] };
  return data.data;
}

export async function runModel(
  target: BenchModel,
  prompt: string,
  signal: AbortSignal,
  onText: (text: string) => void
): Promise<void> {
  const response = await request(`/api/providers/${encodeURIComponent(target.provider_id)}/model-bench`, {
    method: 'POST',
    body: JSON.stringify({ model: target.model, prompt }),
    signal,
  });
  await readModelStream(response, onText);
}

type Runner = typeof runModel;
/** Start all targets immediately. A failed or cancelled target never interrupts its peers. */
export async function runComparison(
  targets: BenchModel[],
  prompt: string,
  signals: AbortSignal[],
  update: (index: number, result: BenchResult) => void,
  runner: Runner = runModel
): Promise<void> {
  await Promise.all(
    targets.map(async (target, index) => {
      const start = Date.now();
      let text = '';
      const emit = (status: BenchResult['status'], error?: string): void =>
        update(index, {
          target,
          text,
          status,
          elapsed: Date.now() - start,
          startedAt: start,
          ...(error ? { error } : {}),
        });
      emit('running');
      try {
        await runner(target, prompt, signals[index], (delta) => {
          if (!signals[index].aborted) {
            text += delta;
            emit('running');
          }
        });
        emit(signals[index].aborted ? 'stopped' : 'done');
      } catch (error) {
        emit(signals[index].aborted ? 'stopped' : 'error', error instanceof Error ? error.message : 'BENCH_CONNECTION');
      }
    })
  );
}

const HISTORY_KEY = 'modelBench.history';
export async function loadHistory(): Promise<BenchRecord[]> {
  const envelope = (await (await request(`/api/settings/client?keys=${HISTORY_KEY}`)).json()) as {
    data: Record<string, unknown>;
  };
  const records = envelope.data[HISTORY_KEY];
  return Array.isArray(records)
    ? records
        .filter((record): record is BenchRecord =>
          Boolean(
            record &&
            typeof record.id === 'string' &&
            typeof record.prompt === 'string' &&
            Array.isArray(record.results)
          )
        )
        .slice(0, 5)
    : [];
}

export async function saveRecord(record: BenchRecord): Promise<BenchRecord[]> {
  const history = [record, ...(await loadHistory()).filter((item) => item.id !== record.id)].slice(0, 5);
  while (history.length > 1 && new Blob([JSON.stringify(history)]).size > 3_000_000) history.pop();
  await request('/api/settings/client', { method: 'PUT', body: JSON.stringify({ [HISTORY_KEY]: history }) });
  return history;
}
