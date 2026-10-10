import { httpDelete, httpGet, httpPatch, httpPost, httpPut } from '@/common/adapter/httpBridge';
import type { SidebarResponse } from '@/common/types/sidebar';
import type { ProjectDetailDto } from '@/common/types/project';
import type {
  RequirementCard,
  RequirementDetail,
  RequirementDraft,
  RequirementIssue,
  RequirementLink,
  RequirementProject,
} from './types';

const resource = (id: string): string => `/api/requirements/${encodeURIComponent(id)}`;
const projectResource = (id: string): string => `/api/projects/${encodeURIComponent(id)}/requirements`;

/** Read project identities from the existing sidebar, without creating a global requirement collection. */
export async function loadRequirementProjects(): Promise<RequirementProject[]> {
  const sidebar = await httpGet<SidebarResponse>('/api/sidebar?limit=1').invoke();
  return sidebar.groups.flatMap((group) =>
    group.scope.type === 'project' ? [{ id: group.scope.project_id, name: group.scope.name }] : []
  );
}
export const createRequirementProject = (name: string, uri?: string): Promise<ProjectDetailDto> =>
  httpPost<ProjectDetailDto, { name: string; uri?: string }>('/api/projects').invoke({ name, ...(uri ? { uri } : {}) });
export const listRequirements = (projectId: string): Promise<RequirementCard[]> =>
  httpGet<RequirementCard[]>(projectResource(projectId)).invoke();
export const getRequirement = (id: string): Promise<RequirementDetail> =>
  httpGet<RequirementDetail>(resource(id)).invoke();
export const createRequirement = (projectId: string, draft: RequirementDraft): Promise<RequirementDetail> =>
  httpPost<RequirementDetail, RequirementDraft>(projectResource(projectId)).invoke(draft);
export const saveRequirement = (
  id: string,
  revision: number,
  draft: RequirementDraft,
  status?: 'draft' | 'review' | 'archived'
): Promise<RequirementDetail> =>
  httpPut<
    RequirementDetail,
    RequirementDraft & { expected_revision: number; status?: 'draft' | 'review' | 'archived' }
  >(resource(id)).invoke({ ...draft, expected_revision: revision, ...(status ? { status } : {}) });
export const deleteRequirement = (id: string, revision: number): Promise<{ deleted: boolean }> =>
  httpDelete<{ deleted: boolean }>(`${resource(id)}?expected_revision=${revision}`).invoke();
export const runRuleCheck = (id: string, revision: number): Promise<RequirementDetail> =>
  httpPost<RequirementDetail, { expected_revision: number; kind: 'rules' }>(`${resource(id)}/checks`).invoke({
    expected_revision: revision,
    kind: 'rules',
  });
export const saveAiCheck = (
  id: string,
  revision: number,
  summary: string,
  issues: RequirementIssue[]
): Promise<RequirementDetail> =>
  httpPost<
    RequirementDetail,
    { expected_revision: number; based_on_revision: number; kind: 'ai'; summary: string; issues: RequirementIssue[] }
  >(`${resource(id)}/checks`).invoke({
    expected_revision: revision,
    based_on_revision: revision,
    kind: 'ai',
    summary,
    issues,
  });
export const resolveRequirementIssue = (
  id: string,
  revision: number,
  checkId: string,
  issueId: string,
  status: RequirementIssue['status'],
  resolution: string
): Promise<RequirementDetail> =>
  httpPatch<RequirementDetail, { expected_revision: number; status: RequirementIssue['status']; resolution: string }>(
    `${resource(id)}/checks/${encodeURIComponent(checkId)}/issues/${encodeURIComponent(issueId)}`
  ).invoke({ expected_revision: revision, status, resolution });
export const confirmRequirement = (id: string, revision: number): Promise<RequirementDetail> =>
  httpPost<RequirementDetail, { expected_revision: number }>(`${resource(id)}/confirm`).invoke({
    expected_revision: revision,
  });
export const exportRequirement = (id: string): Promise<{ filename: string; markdown: string }> =>
  httpGet<{ filename: string; markdown: string }>(`${resource(id)}/export`).invoke();
export const addRequirementLink = (
  id: string,
  revision: number,
  link: Pick<RequirementLink, 'kind' | 'label' | 'path'>
): Promise<RequirementDetail> =>
  httpPost<RequirementDetail, Pick<RequirementLink, 'kind' | 'label' | 'path'> & { expected_revision: number }>(
    `${resource(id)}/links`
  ).invoke({ ...link, expected_revision: revision });
export const removeRequirementLink = (id: string, revision: number, linkId: string): Promise<RequirementDetail> =>
  httpDelete<RequirementDetail>(
    `${resource(id)}/links/${encodeURIComponent(linkId)}?expected_revision=${revision}`
  ).invoke();
export const acknowledgeRequirementLink = (id: string, revision: number, linkId: string): Promise<RequirementDetail> =>
  httpPost<RequirementDetail, { expected_revision: number }>(
    `${resource(id)}/links/${encodeURIComponent(linkId)}/acknowledge`
  ).invoke({ expected_revision: revision });
