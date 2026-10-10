import { CONTENT_FIELDS } from './types';
import type {
  ContentField,
  RequirementContent,
  RequirementDraft,
  RequirementIssue,
  RequirementQuestion,
  RequirementSource,
} from './types';

export const REQUIREMENT_AI_LIMITS = {
  material: 40_000,
  input: 80_000,
  output: 80_000,
  field: 8_000,
  title: 200,
  sources: 100,
  sourceExcerpt: 20_000,
  sourceBytes: 60_000,
  sourceLabelBytes: 1_000,
  idBytes: 100,
  pathBytes: 4_096,
  inputTitle: 300,
  inputField: 30_000,
  inputPriority: 100,
  inputQuestionBytes: 10_000,
  inputAnswerBytes: 30_000,
  inputQuestions: 100,
  questions: 30,
  issues: 30,
  shortText: 2_000,
} as const;

const GENERATED_FIELDS = CONTENT_FIELDS.filter((field) => field !== 'priority');
const REVIEW_FIELDS = new Set<string>([...CONTENT_FIELDS, 'sources', 'questions', 'general']);
const SOURCE_FIELDS = new Set<string>([...CONTENT_FIELDS, 'sources', 'questions']);

function invalid(code = 'REQUIREMENT_AI_INVALID_SCHEMA'): never {
  throw new Error(code);
}

function object(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid();
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some((key) => !keys.includes(key))) return invalid();
  return record;
}

function string(value: unknown, max: number = REQUIREMENT_AI_LIMITS.shortText, required = false): string {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) return invalid();
  return value.trim();
}

function inputString(value: unknown, maxCharacters: number, maxBytes?: number, required = false): string {
  if (typeof value !== 'string' || (required && !value.trim())) return invalid();
  if (
    [...value].length > maxCharacters ||
    (maxBytes !== undefined && new TextEncoder().encode(value).length > maxBytes)
  )
    return invalid('REQUIREMENT_AI_INPUT_LIMIT');
  return value;
}

function list(value: unknown, max: number): unknown[] {
  if (!Array.isArray(value) || value.length > max) return invalid();
  return value;
}

/** Accept a plain object, a fenced object, or one object surrounded by explanation. */
export function parseSingleJson(text: string): unknown {
  if (text.length > REQUIREMENT_AI_LIMITS.output) return invalid('REQUIREMENT_AI_OUTPUT_LIMIT');
  const source = text
    .trim()
    .replace(/^```(?:json)?\s*([\s\S]*?)\s*```$/i, '$1')
    .trim();
  const start = source.indexOf('{');
  if (start < 0) return invalid('REQUIREMENT_AI_INVALID_JSON');
  let depth = 0;
  let quoted = false;
  let escaped = false;
  let end = -1;
  for (let index = start; index < source.length; index++) {
    const char = source[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') quoted = false;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === '{') depth++;
    else if (char === '}' && --depth === 0) {
      end = index + 1;
      break;
    }
  }
  if (end < 0 || /[{}[\]]/.test(source.slice(0, start) + source.slice(end)))
    return invalid('REQUIREMENT_AI_INVALID_JSON');
  try {
    return JSON.parse(source.slice(start, end)) as unknown;
  } catch {
    return invalid('REQUIREMENT_AI_INVALID_JSON');
  }
}

/** Validate content without converting arbitrary objects to strings. */
export function validateContent(value: unknown, generated = false): RequirementContent {
  const record = object(value, generated ? GENERATED_FIELDS : CONTENT_FIELDS);
  const content = Object.fromEntries(
    GENERATED_FIELDS.map((field) => [
      field,
      generated
        ? string(
            record[field],
            field === 'title' ? REQUIREMENT_AI_LIMITS.title : REQUIREMENT_AI_LIMITS.field,
            field === 'title'
          )
        : inputString(
            record[field],
            field === 'title' ? REQUIREMENT_AI_LIMITS.inputTitle : REQUIREMENT_AI_LIMITS.inputField,
            undefined,
            field === 'title'
          ),
    ])
  ) as RequirementContent;
  if (!generated && record.priority !== undefined && record.priority !== null)
    content.priority = inputString(record.priority, REQUIREMENT_AI_LIMITS.inputPriority);
  return content;
}

/** Preserve source identity and references; model output cannot create file or message access. */
export function validateSources(sources: RequirementSource[]): RequirementSource[] {
  if (!Array.isArray(sources) || sources.length > REQUIREMENT_AI_LIMITS.sources)
    return invalid('REQUIREMENT_AI_INPUT_LIMIT');
  const ids = new Set<string>();
  return sources.map((input) => {
    const source = object(input, ['id', 'kind', 'label', 'excerpt', 'conversation_id', 'message_id', 'path', 'fields']);
    const id = inputString(source.id, REQUIREMENT_AI_LIMITS.idBytes, REQUIREMENT_AI_LIMITS.idBytes, true);
    if (ids.has(id) || typeof source.kind !== 'string' || !['conversation', 'file', 'user', 'ai'].includes(source.kind))
      return invalid('REQUIREMENT_AI_INVALID_SOURCE');
    ids.add(id);
    const result: RequirementSource = {
      id,
      kind: source.kind as RequirementSource['kind'],
      label: inputString(
        source.label,
        REQUIREMENT_AI_LIMITS.sourceLabelBytes,
        REQUIREMENT_AI_LIMITS.sourceLabelBytes,
        true
      ),
      excerpt: inputString(source.excerpt, REQUIREMENT_AI_LIMITS.sourceBytes, REQUIREMENT_AI_LIMITS.sourceBytes),
    };
    for (const field of ['conversation_id', 'message_id', 'path'] as const)
      if (source[field] !== undefined && source[field] !== null) {
        const maxBytes = field === 'path' ? REQUIREMENT_AI_LIMITS.pathBytes : REQUIREMENT_AI_LIMITS.idBytes;
        result[field] = inputString(source[field], maxBytes, maxBytes, true);
      }
    if (
      result.path?.includes('\0') ||
      (result.kind === 'file' && !result.path) ||
      (result.kind === 'conversation' && !result.conversation_id) ||
      (result.message_id && !result.conversation_id)
    )
      return invalid('REQUIREMENT_AI_INVALID_SOURCE');
    if (Array.isArray(source.fields) && source.fields.length > CONTENT_FIELDS.length)
      return invalid('REQUIREMENT_AI_INPUT_LIMIT');
    if (source.fields !== undefined && source.fields !== null)
      result.fields = list(source.fields, CONTENT_FIELDS.length).map((field) => {
        if (typeof field !== 'string' || !SOURCE_FIELDS.has(field)) return invalid();
        return field;
      });
    return result;
  });
}

/** Match the server's question bounds while preserving unanswered state and exact supplied text. */
export function validateQuestions(value: unknown): RequirementQuestion[] {
  if (!Array.isArray(value) || value.length > REQUIREMENT_AI_LIMITS.inputQuestions)
    return invalid('REQUIREMENT_AI_INPUT_LIMIT');
  const ids = new Set<string>();
  return value.map((entry) => {
    const question = object(entry, ['id', 'text', 'resolved', 'answer']);
    const id = inputString(question.id, REQUIREMENT_AI_LIMITS.idBytes, REQUIREMENT_AI_LIMITS.idBytes, true);
    const text = inputString(
      question.text,
      REQUIREMENT_AI_LIMITS.inputQuestionBytes,
      REQUIREMENT_AI_LIMITS.inputQuestionBytes,
      true
    );
    const answer = inputString(
      question.answer,
      REQUIREMENT_AI_LIMITS.inputAnswerBytes,
      REQUIREMENT_AI_LIMITS.inputAnswerBytes
    );
    if (ids.has(id) || typeof question.resolved !== 'boolean' || (question.resolved && !answer.trim()))
      return invalid();
    ids.add(id);
    return { id, text, resolved: question.resolved, answer };
  });
}

/** Turn model citations into links only when their ID and verbatim quote match supplied data. */
export function parseRequirementDraft(
  text: string,
  suppliedSources: RequirementSource[],
  modelLabel: string
): RequirementDraft {
  const result = object(parseSingleJson(text), ['content', 'evidence', 'questions']);
  const content = validateContent(result.content, true);
  const sources = suppliedSources.map((source) => ({ ...source, fields: [] as string[] }));
  const supported = new Set<string>();
  for (const value of list(result.evidence, 100)) {
    const evidence = object(value, ['field', 'source_id', 'quote']);
    const field = string(evidence.field, 30, true);
    const sourceId = string(evidence.source_id, 200, true);
    const quote = string(evidence.quote, REQUIREMENT_AI_LIMITS.field, true);
    const source = sources.find((entry) => entry.id === sourceId);
    // Conservative provenance: synthesized or paraphrased fields remain AI suggestions.
    if (
      !GENERATED_FIELDS.includes(field as Exclude<ContentField, 'priority'>) ||
      !source ||
      !source.excerpt.includes(quote)
    )
      return invalid('REQUIREMENT_AI_INVALID_SOURCE');
    if (source.kind !== 'ai' && content[field as Exclude<ContentField, 'priority'>] === quote) {
      if (!source.fields.includes(field)) source.fields.push(field);
      supported.add(field);
    }
  }
  const suggestions = GENERATED_FIELDS.filter((field) => content[field] && !supported.has(field));
  let pendingFields: string[] = [];
  let pendingExcerpt = '';
  const saveSuggestions = (): void => {
    if (!pendingFields.length) return;
    sources.push({
      id: crypto.randomUUID(),
      kind: 'ai',
      label: [...modelLabel].slice(0, 200).join(''),
      excerpt: pendingExcerpt,
      fields: pendingFields,
    });
    pendingFields = [];
    pendingExcerpt = '';
  };
  for (const field of suggestions) {
    const separator = pendingExcerpt ? '\n\n' : '';
    if (pendingExcerpt.length + separator.length + content[field].length > REQUIREMENT_AI_LIMITS.sourceExcerpt)
      saveSuggestions();
    pendingExcerpt += `${pendingExcerpt ? '\n\n' : ''}${content[field]}`;
    pendingFields.push(field);
  }
  saveSuggestions();
  if (sources.length > REQUIREMENT_AI_LIMITS.sources) return invalid('REQUIREMENT_AI_INPUT_LIMIT');
  const questions = list(result.questions, REQUIREMENT_AI_LIMITS.questions).map((value) => {
    const question = object(value, ['text']);
    return {
      id: crypto.randomUUID(),
      text: string(question.text, REQUIREMENT_AI_LIMITS.shortText, true),
      resolved: false,
      answer: '',
    };
  });
  if (GENERATED_FIELDS.some((field) => field !== 'exceptions' && !content[field]) && !questions.length)
    return invalid();
  return { content, sources, questions };
}

/** Return open findings only; reviewed revision and state are owned by application code. */
export function parseRequirementReview(text: string): { summary: string; issues: RequirementIssue[] } {
  const result = object(parseSingleJson(text), ['summary', 'issues']);
  const summary = string(result.summary, REQUIREMENT_AI_LIMITS.shortText, true);
  const issues = list(result.issues, REQUIREMENT_AI_LIMITS.issues).map((value) => {
    const issue = object(value, ['field', 'severity', 'message', 'suggestion']);
    const field = string(issue.field, 30, true);
    const severity = string(issue.severity, 20, true);
    if (!REVIEW_FIELDS.has(field) || !['blocking', 'warning', 'info'].includes(severity)) return invalid();
    return {
      id: crypto.randomUUID(),
      field,
      severity: severity as RequirementIssue['severity'],
      message: string(issue.message, REQUIREMENT_AI_LIMITS.shortText, true),
      suggestion: string(issue.suggestion, REQUIREMENT_AI_LIMITS.shortText),
      status: 'open' as const,
      resolution: '',
    };
  });
  return { summary, issues };
}
