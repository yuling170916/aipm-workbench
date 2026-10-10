import { describe, expect, it, vi } from 'vitest';
import {
  MAX_CAPTURE_LENGTH,
  REQUIREMENT_CAPTURE_KEY,
  stageRequirementCapture,
} from '@/renderer/utils/chat/requirementCapture';

describe('chat requirement handoff', () => {
  it('preserves the original text and message reference before entering a project', () => {
    const setItem = vi.fn();
    const capture = {
      projectId: 'project/one',
      conversationId: 'chat-1',
      messageId: 'message-2',
      text: '  原话\n第二行  ',
      label: '用户消息',
    };
    const route = stageRequirementCapture(capture, { setItem });
    expect(route).toBe('/projects/project%2Fone/requirements');
    expect(JSON.parse(setItem.mock.calls[0][1])).toEqual(capture);
    expect(setItem.mock.calls[0][0]).toBe(REQUIREMENT_CAPTURE_KEY);
  });

  it('sends a conversation without a project to project selection', () => {
    expect(stageRequirementCapture({ text: '需求内容', label: '原话' }, { setItem: vi.fn() })).toBe('/requirements');
  });

  it('rejects oversized source material without storing a truncated copy', () => {
    const setItem = vi.fn();
    expect(() =>
      stageRequirementCapture({ text: 'x'.repeat(MAX_CAPTURE_LENGTH + 1), label: '原话' }, { setItem })
    ).toThrow('REQUIREMENT_CAPTURE_TOO_LARGE');
    expect(setItem).not.toHaveBeenCalled();
  });

  it('does not navigate if browser storage is full', () => {
    expect(() =>
      stageRequirementCapture(
        { text: '需求', label: '原话' },
        {
          setItem: () => {
            throw new Error('quota');
          },
        }
      )
    ).toThrow('REQUIREMENT_CAPTURE_FAILED');
  });

  it('rejects blank sources', () => {
    expect(() => stageRequirementCapture({ text: ' \n ', label: '原话' }, { setItem: vi.fn() })).toThrow(
      'REQUIREMENT_CAPTURE_EMPTY'
    );
  });
});
