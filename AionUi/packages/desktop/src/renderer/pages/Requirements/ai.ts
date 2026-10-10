import { loadModels, runModel } from '../ModelBench/client';
import type { BenchModel } from '../ModelBench/types';
import {
  parseRequirementDraft,
  parseRequirementReview,
  REQUIREMENT_AI_LIMITS,
  validateContent,
  validateQuestions,
  validateSources,
} from './aiParsing';
import { generationPrompt, reviewPrompt } from './aiPrompts';
import type { RequirementCard, RequirementDraft, RequirementIssue, RequirementSource } from './types';

export { REQUIREMENT_AI_LIMITS } from './aiParsing';

type AiOptions = { model: BenchModel; signal: AbortSignal; onProgress?: (characterCount: number) => void };
export type GenerateRequirementOptions = AiOptions & { material: string; sources?: RequirementSource[] };
export type ReviewRequirementOptions = AiOptions & { card: RequirementCard };
export type RequirementAiReview = {
  kind: 'ai';
  based_on_revision: number;
  summary: string;
  issues: RequirementIssue[];
};

function isModel(value: unknown): value is BenchModel {
  if (!value || typeof value !== 'object') return false;
  const model = value as Partial<BenchModel>;
  return [model.provider_id, model.provider_name, model.model].every(
    (part) => typeof part === 'string' && Boolean(part.trim()) && part.length <= 500
  );
}

function aborted(): DOMException {
  return new DOMException('REQUIREMENT_AI_CANCELLED', 'AbortError');
}

function connectionError(error: unknown): Error {
  const code = error instanceof Error ? error.message : '';
  return new Error(code === 'BENCH_OUTPUT_LIMIT' ? 'REQUIREMENT_AI_OUTPUT_LIMIT' : 'REQUIREMENT_AI_CONNECTION');
}

function materialAlreadyCaptured(sources: RequirementSource[], material: string): boolean {
  if (sources.some((source) => source.excerpt.trim() === material)) return true;
  const groups = new Map<string, string>();
  for (const source of sources) {
    const key = JSON.stringify([source.kind, source.conversation_id, source.message_id, source.path]);
    groups.set(key, (groups.get(key) ?? '') + source.excerpt);
  }
  return [...groups.values()].some((excerpt) => excerpt.trim() === material);
}

/** Discover only usable configured targets, keeping credentials on the existing server path. */
export async function loadRequirementModels(): Promise<BenchModel[]> {
  try {
    const response: unknown = await loadModels();
    if (!Array.isArray(response)) throw new Error();
    const seen = new Set<string>();
    return response.filter(isModel).filter((model) => {
      const key = JSON.stringify([model.provider_id, model.model]);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  } catch (error) {
    throw connectionError(error);
  }
}

/** Abort settles immediately even if an upstream stream ignores cancellation or emits late data. */
function collectOutput(prompt: string, { model, signal, onProgress }: AiOptions): Promise<string> {
  if (!isModel(model)) return Promise.reject(new Error('REQUIREMENT_AI_NO_MODEL'));
  if (signal.aborted) return Promise.reject(aborted());
  if (prompt.length > REQUIREMENT_AI_LIMITS.input) return Promise.reject(new Error('REQUIREMENT_AI_INPUT_LIMIT'));
  const controller = new AbortController();
  return new Promise((resolve, reject) => {
    let output = '';
    let settled = false;
    const finish = (error?: Error): void => {
      if (settled) return;
      settled = true;
      signal.removeEventListener('abort', cancel);
      if (error) reject(error);
      else resolve(output);
    };
    const cancel = (): void => {
      finish(aborted());
      controller.abort();
    };
    signal.addEventListener('abort', cancel, { once: true });
    void runModel(model, prompt, controller.signal, (delta) => {
      if (settled || signal.aborted) return;
      if (output.length + delta.length > REQUIREMENT_AI_LIMITS.output) {
        finish(new Error('REQUIREMENT_AI_OUTPUT_LIMIT'));
        controller.abort();
        return;
      }
      output += delta;
      onProgress?.(output.length);
    }).then(
      () => finish(signal.aborted ? aborted() : undefined),
      (error: unknown) => finish(signal.aborted ? aborted() : connectionError(error))
    );
  });
}

/** Generate a reviewable draft. Unsupported generated fields are explicitly marked as AI sources. */
export async function generateRequirement(options: GenerateRequirementOptions): Promise<RequirementDraft> {
  if (options.signal.aborted) throw aborted();
  if (typeof options.material !== 'string' || !options.material.trim()) throw new Error('REQUIREMENT_AI_EMPTY_INPUT');
  if (options.material.length > REQUIREMENT_AI_LIMITS.material) throw new Error('REQUIREMENT_AI_INPUT_LIMIT');
  const sources = validateSources(options.sources ?? []);
  const material = options.material.trim();
  if (!materialAlreadyCaptured(sources, material)) {
    // Chunk rather than truncate, keeping UTF-8 source excerpts within the server limit.
    for (let offset = 0; offset < material.length; ) {
      let end = Math.min(offset + REQUIREMENT_AI_LIMITS.sourceExcerpt, material.length);
      if (end < material.length && /[\uD800-\uDBFF]/.test(material[end - 1])) end--;
      sources.push({
        id: crypto.randomUUID(),
        kind: 'user',
        label: [...material.split('\n')[0]].slice(0, 80).join(''),
        excerpt: material.slice(offset, end),
      });
      offset = end;
    }
  }
  // Reserve one source for generated suggestions so the resulting draft remains reviewable.
  if (sources.length >= REQUIREMENT_AI_LIMITS.sources) throw new Error('REQUIREMENT_AI_INPUT_LIMIT');
  const output = await collectOutput(generationPrompt({ sources }), options);
  if (options.signal.aborted) throw aborted();
  return parseRequirementDraft(output, sources, `${options.model.provider_name} / ${options.model.model}`);
}

/** Review an immutable snapshot and bind findings to its revision for conflict-safe persistence. */
export async function reviewRequirement(options: ReviewRequirementOptions): Promise<RequirementAiReview> {
  if (options.signal.aborted) throw aborted();
  const revision = options.card.revision;
  if (!Number.isSafeInteger(revision) || revision < 1) throw new Error('REQUIREMENT_AI_INVALID_SCHEMA');
  const content = validateContent(options.card.content);
  const sources = validateSources(options.card.sources);
  const questions = validateQuestions(options.card.questions).map(({ text, resolved, answer }) => ({
    text,
    resolved,
    answer,
  }));
  const output = await collectOutput(reviewPrompt({ content, sources, questions }), options);
  if (options.signal.aborted) throw aborted();
  return { kind: 'ai', based_on_revision: revision, ...parseRequirementReview(output) };
}
