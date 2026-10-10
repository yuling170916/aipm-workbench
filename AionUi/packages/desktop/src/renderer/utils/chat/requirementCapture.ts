/** A source-preserving handoff from chat to the project requirement editor. */
export type RequirementCapture = {
  projectId?: string;
  conversationId?: string;
  messageId?: string;
  sourceKind?: 'user' | 'ai';
  text: string;
  label: string;
};

export const REQUIREMENT_CAPTURE_KEY = 'requirements.capture';
export const MAX_CAPTURE_LENGTH = 100_000;

/** Stage the complete source before navigation; never silently truncate it. */
export function stageRequirementCapture(
  capture: RequirementCapture,
  storage: Pick<Storage, 'setItem'> = sessionStorage
): string {
  if (!capture.text.trim()) throw new Error('REQUIREMENT_CAPTURE_EMPTY');
  if (capture.text.length > MAX_CAPTURE_LENGTH) throw new Error('REQUIREMENT_CAPTURE_TOO_LARGE');
  try {
    storage.setItem(REQUIREMENT_CAPTURE_KEY, JSON.stringify(capture));
  } catch {
    throw new Error('REQUIREMENT_CAPTURE_FAILED');
  }
  return capture.projectId ? `/projects/${encodeURIComponent(capture.projectId)}/requirements` : '/requirements';
}
