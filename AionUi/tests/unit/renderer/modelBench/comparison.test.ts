import { describe, expect, it, vi } from 'vitest';
import { runComparison } from '@/renderer/pages/ModelBench/client';
import type { BenchResult } from '@/renderer/pages/ModelBench/types';

describe('parallel model comparison', () => {
  const targets = [
    { provider_id: 'p1', provider_name: 'One', model: 'a' },
    { provider_id: 'p2', provider_name: 'Two', model: 'b' },
  ];
  it('starts both models with identical input before either finishes', async () => {
    const finish: (() => void)[] = [];
    const runner = vi.fn(() => new Promise<void>((resolve) => finish.push(resolve)));
    const work = runComparison(
      targets,
      'same material',
      targets.map(() => new AbortController().signal),
      () => undefined,
      runner
    );
    expect(runner.mock.calls).toHaveLength(2);
    expect(runner.mock.calls.every((call: unknown[]) => call[1] === 'same material')).toBe(true);
    finish.forEach((done) => done());
    await work;
  });
  it('keeps a successful answer when another provider rejects', async () => {
    const results: BenchResult[] = [];
    await runComparison(
      targets,
      'input',
      targets.map(() => new AbortController().signal),
      (index, value) => {
        results[index] = value;
      },
      async (target, _input, _signal, emit) => {
        if (target.model === 'a') throw new Error('BENCH_HTTP_429');
        emit('complete answer');
      }
    );
    expect(results.map((result) => result.status)).toEqual(['error', 'done']);
    expect(results[1].text).toBe('complete answer');
  });
  it('marks cancellation as stopped and ignores late tokens', async () => {
    const controls = targets.map(() => new AbortController());
    const results: BenchResult[] = [];
    await runComparison(
      targets,
      'input',
      controls.map((control) => control.signal),
      (index, value) => {
        results[index] = value;
      },
      async (target, _input, _signal, emit) => {
        emit('before');
        if (target.model === 'a') controls[0].abort();
        emit('after');
      }
    );
    expect(results[0].status).toBe('stopped');
    expect(results.map((result) => result.text)).toEqual(['before', 'beforeafter']);
  });
});
