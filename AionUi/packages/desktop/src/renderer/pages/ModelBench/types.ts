export type BenchModel = { provider_id: string; provider_name: string; model: string };
export type BenchStatus = 'waiting' | 'running' | 'done' | 'error' | 'stopped';
export type BenchResult = {
  target: BenchModel;
  text: string;
  status: BenchStatus;
  elapsed: number;
  startedAt?: number;
  error?: string;
};
export type BenchRecord = { id: string; created: number; prompt: string; results: BenchResult[] };
export const modelKey = (model: BenchModel): string => JSON.stringify([model.provider_id, model.model]);
