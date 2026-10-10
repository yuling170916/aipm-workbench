import { CONTENT_FIELDS } from '../types';
import type { ContentField, RequirementDetail, RequirementDraft, RequirementVersion } from '../types';

export function emptyRequirementDraft(): RequirementDraft {
  return {
    content: {
      title: '',
      audience: '',
      scenario: '',
      problem: '',
      goal: '',
      scope: '',
      rules: '',
      exceptions: '',
      acceptance: '',
      priority: '',
    },
    sources: [],
    questions: [],
  };
}
export function draftFromDetail(detail: RequirementDetail): RequirementDraft {
  return structuredClone({
    content: detail.card.content,
    sources: detail.card.sources,
    questions: detail.card.questions,
  });
}
export function draftsEqual(a: RequirementDraft, b: RequirementDraft): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
export function confirmationBlockers(detail: RequirementDetail, dirty = false): string[] {
  const reasons: string[] = [];
  if (dirty) reasons.push('unsaved');
  if (detail.card.status === 'archived') reasons.push('archived');
  const required = CONTENT_FIELDS.filter((field) => field !== 'priority' && field !== 'exceptions');
  if (required.some((field) => !detail.card.content[field]?.trim())) reasons.push('required');
  if (detail.card.questions.some((question) => !question.resolved || !question.answer.trim()))
    reasons.push('questions');
  const latest = new Map<string, (typeof detail.checks)[number]>();
  for (const check of detail.checks.toReversed()) {
    if (check.based_on_revision === detail.card.revision && !latest.has(check.kind)) latest.set(check.kind, check);
  }
  const currentChecks = [...latest.values()];
  if (!currentChecks.some((check) => check.kind === 'rules')) reasons.push('ruleCheck');
  if (
    currentChecks.some((check) =>
      check.issues.some((issue) => issue.severity === 'blocking' && issue.status === 'open')
    )
  )
    reasons.push('blocking');
  return reasons;
}
export type RequirementDifference = { field: ContentField | 'sources' | 'questions'; before: string; after: string };
export function compareRequirementVersions(
  before: RequirementVersion,
  after: RequirementVersion
): RequirementDifference[] {
  const changes: RequirementDifference[] = CONTENT_FIELDS.flatMap((field) => {
    const left = before.snapshot.content[field] ?? '';
    const right = after.snapshot.content[field] ?? '';
    return left === right ? [] : [{ field, before: left, after: right }];
  });
  for (const field of ['sources', 'questions'] as const) {
    const left = JSON.stringify(before.snapshot[field], null, 2);
    const right = JSON.stringify(after.snapshot[field], null, 2);
    if (left !== right) changes.push({ field, before: left, after: right });
  }
  return changes;
}
export function downloadMarkdown(filename: string, markdown: string): void {
  const url = URL.createObjectURL(new Blob([markdown], { type: 'text/markdown;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename.replace(/[/\\]/g, '_');
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
