export const CONTENT_FIELDS = [
  'title',
  'audience',
  'scenario',
  'problem',
  'goal',
  'scope',
  'rules',
  'exceptions',
  'acceptance',
  'priority',
] as const;
export type ContentField = (typeof CONTENT_FIELDS)[number];
export type RequirementContent = Record<Exclude<ContentField, 'priority'>, string> & { priority?: string };
export type RequirementSource = {
  id: string;
  kind: 'conversation' | 'file' | 'user' | 'ai';
  label: string;
  excerpt: string;
  conversation_id?: string;
  message_id?: string;
  path?: string;
  fields?: string[];
};
export type RequirementQuestion = { id: string; text: string; resolved: boolean; answer: string };
export type RequirementStatus = 'draft' | 'review' | 'confirmed' | 'archived';
export type RequirementCard = {
  id: string;
  project_id: string;
  number: string;
  revision: number;
  status: RequirementStatus;
  content: RequirementContent;
  sources: RequirementSource[];
  questions: RequirementQuestion[];
  created_at: number;
  updated_at: number;
};
export type RequirementIssue = {
  id: string;
  field: string;
  severity: 'blocking' | 'warning' | 'info';
  message: string;
  suggestion: string;
  status: 'open' | 'resolved' | 'accepted';
  resolution: string;
};
export type RequirementCheck = {
  id: string;
  kind: 'rules' | 'ai';
  based_on_revision: number;
  summary: string;
  issues: RequirementIssue[];
  created_at: number;
};
export type RequirementVersion = { id: string; revision: number; created_at: number; snapshot: RequirementCard };
export type RequirementLink = {
  id: string;
  kind: 'file' | 'document';
  label: string;
  path: string;
  needs_review: boolean;
  synced_revision: number;
  created_at: number;
  updated_at: number;
};
export type RequirementDetail = {
  card: RequirementCard;
  checks: RequirementCheck[];
  versions: RequirementVersion[];
  links: RequirementLink[];
};
export type RequirementDraft = {
  content: RequirementContent;
  sources: RequirementSource[];
  questions: RequirementQuestion[];
};
export type RequirementCapture = {
  projectId?: string;
  conversationId?: string;
  messageId?: string;
  sourceKind?: 'user' | 'ai';
  text: string;
  label: string;
};
export type RequirementProject = { id: string; name: string };
