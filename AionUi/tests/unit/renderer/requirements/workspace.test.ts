import { describe, expect, it } from 'vitest';
import {
  compareRequirementVersions,
  confirmationBlockers,
  emptyRequirementDraft,
} from '@/renderer/pages/Requirements/utils/requirementUtils';
import { captureSources, parseRequirementCapture } from '@/renderer/pages/Requirements/utils/capture';
import type { RequirementDetail, RequirementVersion } from '@/renderer/pages/Requirements/types';

function detail(): RequirementDetail {
  const draft = emptyRequirementDraft();
  for (const key of Object.keys(draft.content) as (keyof typeof draft.content)[]) draft.content[key] = key;
  return {
    card: {
      ...draft,
      id: 'r1',
      project_id: 'p1',
      number: 'REQ-1',
      revision: 2,
      status: 'draft',
      created_at: 1,
      updated_at: 2,
    },
    checks: [{ id: 'new', kind: 'rules', based_on_revision: 2, summary: '', issues: [], created_at: 3 }],
    links: [],
    versions: [],
  };
}

describe('requirement confirmation boundaries', () => {
  it('does not let a stale passing check confirm changed content', () => {
    const value = detail();
    value.checks[0]!.based_on_revision = 1;
    expect(confirmationBlockers(value)).toContain('ruleCheck');
  });
  it('requires an actual answer even if a malformed question claims to be resolved', () => {
    const value = detail();
    value.card.questions = [{ id: 'q', text: 'Which users?', answer: ' ', resolved: true }];
    expect(confirmationBlockers(value)).toContain('questions');
  });
  it('uses only the latest check per kind instead of blocking forever on an old issue', () => {
    const value = detail();
    value.checks.unshift({
      id: 'old',
      kind: 'rules',
      based_on_revision: 2,
      created_at: 1,
      summary: '',
      issues: [
        {
          id: 'i',
          field: 'goal',
          severity: 'blocking',
          message: 'Old issue',
          suggestion: '',
          status: 'open',
          resolution: '',
        },
      ],
    });
    expect(confirmationBlockers(value)).toEqual([]);
  });
  it('uses append order when two checks share a timestamp', () => {
    const value = detail();
    const old = structuredClone(value.checks[0]!);
    old.id = 'old';
    old.issues = [
      {
        id: 'i',
        field: 'goal',
        severity: 'blocking',
        message: 'Old issue',
        suggestion: '',
        status: 'open',
        resolution: '',
      },
    ];
    value.checks.unshift(old);
    expect(confirmationBlockers(value)).toEqual([]);
  });
  it('keeps an open current AI blocking issue in the confirmation gate', () => {
    const value = detail();
    value.checks.push({
      id: 'ai',
      kind: 'ai',
      based_on_revision: 2,
      created_at: 4,
      summary: '',
      issues: [
        {
          id: 'i',
          field: 'goal',
          severity: 'blocking',
          message: 'Missing measure',
          suggestion: '',
          status: 'open',
          resolution: '',
        },
      ],
    });
    expect(confirmationBlockers(value)).toContain('blocking');
  });
  it('does not allow unsaved or archived content to be confirmed', () => {
    const value = detail();
    value.card.status = 'archived';
    expect(confirmationBlockers(value, true)).toEqual(['unsaved', 'archived']);
  });
});

describe('requirement version comparison', () => {
  it('shows content and provenance changes without modifying stored snapshots', () => {
    const value = detail();
    const left: RequirementVersion = { id: 'v1', revision: 1, created_at: 1, snapshot: structuredClone(value.card) };
    const right: RequirementVersion = { id: 'v2', revision: 2, created_at: 2, snapshot: structuredClone(value.card) };
    right.snapshot.content.goal = 'New goal';
    right.snapshot.sources = [{ id: 's', kind: 'user', label: 'Interview', excerpt: 'Original words' }];
    expect(compareRequirementVersions(left, right).map((change) => change.field)).toEqual(['goal', 'sources']);
    expect(left.snapshot.content.goal).toBe('goal');
  });
  it('treats missing optional priority and empty priority as the same value', () => {
    const value = detail();
    const left: RequirementVersion = { id: 'v1', revision: 1, created_at: 1, snapshot: structuredClone(value.card) };
    delete left.snapshot.content.priority;
    const right = structuredClone(left);
    right.snapshot.content.priority = '';
    expect(compareRequirementVersions(left, right)).toEqual([]);
  });
});

describe('requirement source handoff validation', () => {
  it('splits long Chinese and emoji excerpts without losing text or mislabeling AI provenance', () => {
    const text = '材料'.repeat(11000) + '🧠'.repeat(6000);
    const sources = captureSources({ text, label: 'AI', sourceKind: 'ai', conversationId: 'c', messageId: 'm' });
    expect(sources.map((source) => source.excerpt).join('')).toBe(text);
    expect(sources.every((source) => source.kind === 'ai' && source.message_id === 'm')).toBe(true);
    expect(sources.every((source) => new TextEncoder().encode(source.excerpt).length <= 60000)).toBe(true);
  });
  it('preserves original whitespace and message identity', () => {
    const source = { text: '  original\nwords  ', label: 'Original', conversationId: 'c', messageId: 'm' };
    expect(parseRequirementCapture(JSON.stringify(source))).toEqual(source);
  });
  it('rejects malformed identities, invalid JSON, and oversized excerpts', () => {
    expect(parseRequirementCapture('{broken')).toBeNull();
    expect(parseRequirementCapture(JSON.stringify({ text: 'valid', label: 'label', conversationId: 42 }))).toBeNull();
    expect(parseRequirementCapture(JSON.stringify({ text: 'x'.repeat(100001), label: 'label' }))).toBeNull();
  });
});
