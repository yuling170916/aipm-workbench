import type { RequirementCapture, RequirementSource } from '../types';

export const REQUIREMENT_CAPTURE_KEY = 'requirements.capture';
/** A malformed or oversized capture must never silently become a different requirement. */
export function parseRequirementCapture(raw: string | null): RequirementCapture | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object') return null;
    const item = value as Record<string, unknown>;
    if (
      typeof item.text !== 'string' ||
      !item.text.trim() ||
      item.text.length > 100_000 ||
      typeof item.label !== 'string'
    )
      return null;
    if (
      ['projectId', 'conversationId', 'messageId'].some(
        (key) => item[key] !== undefined && typeof item[key] !== 'string'
      )
    )
      return null;
    if (item.sourceKind !== undefined && item.sourceKind !== 'user' && item.sourceKind !== 'ai') return null;
    return {
      text: item.text,
      label: item.label,
      ...(item.sourceKind ? { sourceKind: item.sourceKind as 'user' | 'ai' } : {}),
      ...(item.projectId ? { projectId: item.projectId as string } : {}),
      ...(item.conversationId ? { conversationId: item.conversationId as string } : {}),
      ...(item.messageId ? { messageId: item.messageId as string } : {}),
    };
  } catch {
    return null;
  }
}
export function captureSource(capture: RequirementCapture): RequirementSource {
  return {
    id: crypto.randomUUID(),
    kind: capture.sourceKind === 'ai' ? 'ai' : capture.conversationId ? 'conversation' : 'user',
    label: capture.label,
    excerpt: capture.text,
    ...(capture.conversationId ? { conversation_id: capture.conversationId } : {}),
    ...(capture.messageId ? { message_id: capture.messageId } : {}),
  };
}

/** Preserve long excerpts as ordered sources within the backend's per-source byte limit. */
export function captureSources(capture: RequirementCapture): RequirementSource[] {
  const chunks: string[] = [];
  let chunk = '';
  for (const character of capture.text) {
    if (chunk.length + character.length > 20000) {
      chunks.push(chunk);
      chunk = '';
    }
    chunk += character;
  }
  if (chunk) chunks.push(chunk);
  return chunks.map((excerpt) => {
    const source = captureSource(capture);
    source.excerpt = excerpt;
    return source;
  });
}
