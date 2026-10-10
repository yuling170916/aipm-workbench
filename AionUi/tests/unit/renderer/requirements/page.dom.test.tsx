import React from 'react';
import '@arco-design/web-react/lib/_util/react-19-adapter';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en-US' } }) }));
vi.mock('@/renderer/hooks/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'user-one' } }) }));
vi.mock('@/renderer/components/workspace', () => ({ WorkspaceFolderSelect: () => <div /> }));
vi.mock('@/renderer/pages/Requirements/ai', () => ({
  loadRequirementModels: vi.fn(),
  generateRequirement: vi.fn(),
  reviewRequirement: vi.fn(),
}));
vi.mock('@/renderer/pages/Requirements/api', () => ({
  loadRequirementProjects: vi.fn(),
  listRequirements: vi.fn(),
  getRequirement: vi.fn(),
  createRequirement: vi.fn(),
  createRequirementProject: vi.fn(),
  saveRequirement: vi.fn(),
  deleteRequirement: vi.fn(),
  runRuleCheck: vi.fn(),
  saveAiCheck: vi.fn(),
  resolveRequirementIssue: vi.fn(),
  confirmRequirement: vi.fn(),
  exportRequirement: vi.fn(),
  addRequirementLink: vi.fn(),
  removeRequirementLink: vi.fn(),
  acknowledgeRequirementLink: vi.fn(),
}));

import Requirements from '@/renderer/pages/Requirements';
import * as api from '@/renderer/pages/Requirements/api';
import { generateRequirement, loadRequirementModels } from '@/renderer/pages/Requirements/ai';
import { emptyRequirementDraft } from '@/renderer/pages/Requirements/utils/requirementUtils';
import type { RequirementDetail, RequirementDraft } from '@/renderer/pages/Requirements/types';

function value(): RequirementDetail {
  const draft = emptyRequirementDraft();
  draft.content.title = 'Checkout requirement';
  return {
    card: {
      ...draft,
      id: 'r1',
      project_id: 'p1',
      number: 'REQ-1',
      revision: 1,
      status: 'draft',
      created_at: 1,
      updated_at: 1,
    },
    checks: [],
    versions: [],
    links: [],
  };
}
function renderPage(path = '/projects/p1/requirements?requirementId=r1'): void {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path='/projects/:projectId/requirements' element={<Requirements />} />
        <Route path='/requirements' element={<Requirements />} />
      </Routes>
    </MemoryRouter>
  );
}
beforeEach(() => {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
  localStorage.clear();
  sessionStorage.clear();
  vi.mocked(api.loadRequirementProjects).mockResolvedValue([{ id: 'p1', name: 'Store project' }]);
  vi.mocked(api.listRequirements).mockResolvedValue([value().card]);
  vi.mocked(api.getRequirement).mockResolvedValue(value());
  vi.mocked(loadRequirementModels).mockResolvedValue([]);
});
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

describe('requirements workspace', () => {
  it('preserves user edits after a failed save and offers retry', async () => {
    vi.mocked(api.saveRequirement).mockRejectedValue(new Error('offline'));
    renderPage();
    const title = await screen.findByLabelText('common.requirements.fields.title');
    fireEvent.change(title, { target: { value: 'Changed locally' } });
    fireEvent.click(screen.getByText('common.requirements.save'));
    expect(await screen.findByText('common.requirements.saveError')).toBeTruthy();
    expect((title as HTMLInputElement).value).toBe('Changed locally');
    expect(JSON.parse(localStorage.getItem('requirements.draft:user-one:p1:r1')!).draft.content.title).toBe(
      'Changed locally'
    );
  });
  it('can recover from a failed requirement fetch', async () => {
    vi.mocked(api.getRequirement).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(value());
    renderPage();
    fireEvent.click(await screen.findByText('common.requirements.retry'));
    expect(await screen.findByLabelText('common.requirements.fields.title')).toBeTruthy();
    expect(api.getRequirement).toHaveBeenCalledTimes(2);
  });
  it('retries saving the latest edits instead of overwriting them with the earlier failed payload', async () => {
    vi.mocked(api.saveRequirement)
      .mockRejectedValueOnce(new Error('offline'))
      .mockImplementationOnce(async (_id, _revision, draft) => ({
        ...value(),
        card: { ...value().card, ...draft, revision: 2 },
      }));
    renderPage();
    const title = await screen.findByLabelText('common.requirements.fields.title');
    fireEvent.change(title, { target: { value: 'First edit' } });
    fireEvent.click(screen.getByText('common.requirements.save'));
    await screen.findByText('common.requirements.saveError');
    fireEvent.change(title, { target: { value: 'Latest edit' } });
    fireEvent.click(screen.getByText('common.requirements.retry'));
    await waitFor(() =>
      expect(api.saveRequirement).toHaveBeenLastCalledWith(
        'r1',
        1,
        expect.objectContaining({ content: expect.objectContaining({ title: 'Latest edit' }) })
      )
    );
  });
  it('offers project creation when a new installation has no project', async () => {
    vi.mocked(api.loadRequirementProjects).mockResolvedValue([]);
    renderPage('/requirements');
    expect(await screen.findByText('common.requirements.noProjects')).toBeTruthy();
    fireEvent.click(screen.getAllByText('common.requirements.createProject')[0]!);
    expect(await screen.findByLabelText('common.requirements.projectName')).toBeTruthy();
  });
  it('creates a project directly from unassigned chat capture and preserves its original AI provenance for saving', async () => {
    const capture = {
      text: 'AI suggestion from an unassigned chat\nStill awaiting human verification',
      label: 'AI answer',
      sourceKind: 'ai',
      conversationId: 'conversation-real',
      messageId: 'message-real',
    };
    sessionStorage.setItem('requirements.capture', JSON.stringify(capture));
    vi.mocked(api.createRequirementProject).mockResolvedValue({
      project_id: 'p2',
      name: 'New project',
      explorer: { workspace_pe_id: 'pe2', entries: [] },
    });
    vi.mocked(api.createRequirement).mockImplementation(async (project, draft) => ({
      ...value(),
      card: { ...value().card, ...draft, id: 'r2', project_id: project },
    }));
    renderPage('/requirements');
    await screen.findByRole('heading', { name: 'common.requirements.chooseProject' });
    fireEvent.click(screen.getByRole('button', { name: 'common.requirements.createProject' }));
    const name = await screen.findByLabelText('common.requirements.projectName');
    expect(screen.queryByText('common.requirements.unsavedTitle')).toBeNull();
    fireEvent.change(name, { target: { value: 'New project' } });
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'common.requirements.createProject' })
    );
    const material = await screen.findByLabelText('common.requirements.material');
    expect((material as HTMLTextAreaElement).value).toBe(capture.text);
    expect((screen.getByLabelText('common.requirements.sourceExcerpt') as HTMLTextAreaElement).value).toBe(
      capture.text
    );
    fireEvent.change(screen.getByLabelText('common.requirements.fields.title'), {
      target: { value: 'Captured draft' },
    });
    fireEvent.click(screen.getByText('common.requirements.createManual'));
    await waitFor(() =>
      expect(api.createRequirement).toHaveBeenCalledWith(
        'p2',
        expect.objectContaining({
          sources: [
            expect.objectContaining({
              kind: 'ai',
              excerpt: capture.text,
              conversation_id: capture.conversationId,
              message_id: capture.messageId,
            }),
          ],
        })
      )
    );
  });
  it('ignores a late AI result after the user cancels generation', async () => {
    sessionStorage.setItem(
      'requirements.capture',
      JSON.stringify({ text: 'Build a clearer checkout', label: 'Original request', projectId: 'p1' })
    );
    vi.mocked(loadRequirementModels).mockResolvedValue([
      { provider_id: 'p', provider_name: 'Provider', model: 'Model' },
    ]);
    let finish!: (draft: RequirementDraft) => void;
    vi.mocked(generateRequirement).mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    renderPage('/projects/p1/requirements');
    await waitFor(() =>
      expect((screen.getByText('common.requirements.aiGenerate').closest('button') as HTMLButtonElement).disabled).toBe(
        false
      )
    );
    fireEvent.click(screen.getByText('common.requirements.aiGenerate'));
    fireEvent.click(await screen.findByText('common.requirements.cancelGeneration'));
    const generated = emptyRequirementDraft();
    generated.content.title = 'Late result';
    await act(async () => {
      finish(generated);
    });
    expect((screen.getByLabelText('common.requirements.fields.title') as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText('common.requirements.material') as HTMLTextAreaElement).value).toBe(
      'Build a clearer checkout'
    );
  });
  it('preserves manually entered material as a source when creating without AI', async () => {
    sessionStorage.setItem(
      'requirements.capture',
      JSON.stringify({ text: 'Initial context', label: 'Original', projectId: 'p1' })
    );
    vi.mocked(api.createRequirement).mockImplementation(async (_project, draft) => ({
      ...value(),
      card: { ...value().card, ...draft },
    }));
    renderPage('/projects/p1/requirements');
    fireEvent.change(await screen.findByLabelText('common.requirements.material'), {
      target: { value: 'Manually added interview evidence' },
    });
    fireEvent.change(screen.getByLabelText('common.requirements.fields.title'), { target: { value: 'Manual card' } });
    fireEvent.click(screen.getByText('common.requirements.createManual'));
    await waitFor(() =>
      expect(api.createRequirement).toHaveBeenCalledWith(
        'p1',
        expect.objectContaining({
          sources: expect.arrayContaining([
            expect.objectContaining({ kind: 'user', excerpt: 'Manually added interview evidence' }),
          ]),
        })
      )
    );
  });
});
