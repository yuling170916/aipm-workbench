import React from 'react';
import '@arco-design/web-react/lib/_util/react-19-adapter';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { Button } from '@arco-design/web-react';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SidebarGroup, SidebarResponse } from '@/common/types/sidebar';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => `${key}${options?.path ? ` ${options.path}` : ''}`,
    i18n: { language: 'en-US' },
  }),
}));
vi.mock('@/common/adapter/ipcBridge', () => ({ sidebar: { get: { invoke: vi.fn() } } }));

import HomeWorkspace from '@/renderer/pages/guid/components/HomeWorkspace';
import * as ipcBridge from '@/common/adapter/ipcBridge';

const loadSidebar = vi.mocked(ipcBridge.sidebar.get.invoke);
const EMPTY: SidebarResponse = { groups: [], has_more_groups: false };
function project(id: string, name: string, updatedAt = 0, workspace?: string): SidebarGroup {
  return {
    scope: { type: 'project', project_id: id, name, workspace },
    items: updatedAt
      ? [
          {
            type: 'team',
            team_id: `${id}-team`,
            name: 'Team',
            updated_at: updatedAt,
            pinned: false,
            member_conversation_ids: [],
          },
        ]
      : [],
    has_more: false,
  };
}
function response(...groups: SidebarGroup[]): SidebarResponse {
  return { groups, has_more_groups: false };
}
function LocationMarker(): React.ReactElement {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <>
      <output data-testid='location'>{location.pathname}</output>
      {location.pathname !== '/guid' && <Button onClick={() => void navigate('/guid')}>Return home</Button>}
    </>
  );
}
function renderHome(onStartWorkflow = vi.fn()): ReturnType<typeof render> {
  return render(
    <MemoryRouter initialEntries={['/guid']}>
      <Routes>
        <Route path='/guid' element={<HomeWorkspace onStartWorkflow={onStartWorkflow} />} />
        <Route path='*' element={<div />} />
      </Routes>
      <LocationMarker />
    </MemoryRouter>
  );
}

beforeEach(() => {
  loadSidebar.mockResolvedValue(EMPTY);
});
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

describe('home workflows and recent projects', () => {
  it('lets all three workflow cards prepare the selected task without navigating', async () => {
    const start = vi.fn();
    renderHome(start);
    await screen.findByText('guid.home.projectsEmpty');
    for (const title of ['organizeTitle', 'prdTitle', 'reviewTitle'])
      fireEvent.click(screen.getByText(`guid.home.${title}`));
    expect(start.mock.calls).toEqual([['organize'], ['prd'], ['review']]);
    expect(screen.getByTestId('location').textContent).toBe('/guid');
  });

  it('shows at most three real projects ordered by their available latest activity', async () => {
    loadSidebar.mockResolvedValue(
      response(
        project('alpha', 'Alpha', 100),
        {
          scope: { type: 'dir', key: 'directory', name: 'Not a project', path: '/tmp/example' },
          items: [],
          has_more: false,
        },
        project('beta', 'Beta', 400),
        project('gamma', 'Gamma', 300),
        project('delta', 'Delta', 200)
      )
    );
    renderHome();
    const recent = screen.getByRole('region', { name: 'guid.home.recentTitle' });
    await screen.findByRole('button', { name: 'Beta' });
    expect(
      within(recent)
        .getAllByRole('button')
        .filter((button) => button.hasAttribute('aria-label'))
        .map((button) => button.getAttribute('aria-label'))
    ).toEqual(['Beta', 'Gamma', 'Delta']);
    expect(screen.queryByText('Not a project')).toBeNull();
    expect(loadSidebar).toHaveBeenCalledWith({ limit: 1 });
  });

  it('preserves backend ordering for projects with no activity and shows their actual directory', async () => {
    loadSidebar.mockResolvedValue(
      response(project('first', 'First', 0, '/actual/workspace'), project('second', 'Second'))
    );
    renderHome();
    await screen.findByRole('button', { name: 'First' });
    const recent = screen.getByRole('region', { name: 'guid.home.recentTitle' });
    expect(
      within(recent)
        .getAllByRole('button')
        .filter((button) => button.hasAttribute('aria-label'))
        .map((button) => button.getAttribute('aria-label'))
    ).toEqual(['First', 'Second']);
    expect(screen.getByText('guid.home.projectWorkspace /actual/workspace')).toBeTruthy();
    expect(screen.queryByText('guid.home.updatedAt')).toBeNull();
  });

  it('opens the clicked project requirement workspace with a safely encoded project id', async () => {
    loadSidebar.mockResolvedValue(response(project('a/b project', 'Encoded project')));
    renderHome();
    fireEvent.click(await screen.findByRole('button', { name: 'Encoded project' }));
    expect(screen.getByTestId('location').textContent).toBe('/projects/a%2Fb%20project/requirements');
  });

  it('offers project creation when the backend has no projects', async () => {
    renderHome();
    fireEvent.click(await screen.findByRole('button', { name: 'guid.home.createProject' }));
    expect(screen.getByTestId('location').textContent).toBe('/requirements');
  });

  it('recovers from a failed project request through the visible retry action', async () => {
    loadSidebar
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(response(project('restored', 'Restored project')));
    renderHome();
    await screen.findByText('guid.home.projectsError');
    fireEvent.click(screen.getByRole('button', { name: 'guid.home.retry' }));
    expect(await screen.findByRole('button', { name: 'Restored project' })).toBeTruthy();
    expect(screen.queryByText('guid.home.projectsError')).toBeNull();
  });

  it('reloads real projects when returning home after project changes', async () => {
    loadSidebar
      .mockResolvedValueOnce(response(project('old', 'Old name')))
      .mockResolvedValueOnce(response(project('old', 'Updated name')));
    renderHome();
    fireEvent.click(await screen.findByRole('button', { name: 'Old name' }));
    fireEvent.click(screen.getByRole('button', { name: 'Return home' }));
    expect(await screen.findByRole('button', { name: 'Updated name' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Old name' })).toBeNull();
  });

  it('refreshes recent projects when the app regains focus', async () => {
    loadSidebar
      .mockResolvedValueOnce(response(project('old', 'Old project')))
      .mockResolvedValueOnce(response(project('new', 'New project')));
    renderHome();
    await screen.findByRole('button', { name: 'Old project' });
    fireEvent(window, new Event('focus'));
    expect(await screen.findByRole('button', { name: 'New project' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Old project' })).toBeNull();
  });

  it('shows loading state until the first real response arrives', async () => {
    let finish: ((value: SidebarResponse) => void) | undefined;
    loadSidebar.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      })
    );
    renderHome();
    expect(
      within(screen.getByRole('region', { name: 'guid.home.recentTitle' })).getByRole('status').textContent
    ).toContain('guid.home.projectsLoading');
    await act(async () => {
      finish?.(EMPTY);
    });
    await waitFor(() => expect(screen.queryByText('guid.home.projectsLoading')).toBeNull());
    expect(screen.getByText('guid.home.projectsEmpty')).toBeTruthy();
  });
});
