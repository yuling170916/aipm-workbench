import type { Request } from '@playwright/test';
import type { ProjectDetailDto } from '../../../packages/desktop/src/common/types/project';
import type { SidebarResponse } from '../../../packages/desktop/src/common/types/sidebar';
import zhGuid from '../../../packages/desktop/src/renderer/services/i18n/locales/zh-CN/guid.json';
import enGuid from '../../../packages/desktop/src/renderer/services/i18n/locales/en-US/guid.json';
import zhCommon from '../../../packages/desktop/src/renderer/services/i18n/locales/zh-CN/common.json';
import enCommon from '../../../packages/desktop/src/renderer/services/i18n/locales/en-US/common.json';
import { test, expect } from '../fixtures';
import { goToGuid } from '../helpers/navigation';
import { httpInvoke } from '../helpers/httpBridge';

// The shared fixture creates a disposable profile. These checks keep this
// delivery acceptance spec from accidentally exercising a personal or dev app.
test.beforeEach(async ({ electronApp }) => {
  const appState = await electronApp.evaluate(({ app }) => ({
    packaged: app.isPackaged,
    userData: app.getPath('userData'),
  }));
  expect(appState.packaged).toBe(true);
  expect(appState.userData).toMatch(/aionui-e2e-userdata-/);
});

test('home workflow appends PRD guidance to the existing draft and focuses it without sending', async ({
  page,
}, info) => {
  await goToGuid(page);
  await expect(page.getByTestId('guid-input')).toBeVisible();
  const q = (await page.getByRole('heading', { name: zhGuid.home.title, exact: true }).count())
    ? zhGuid.home
    : enGuid.home;
  const input = page.getByTestId('guid-input');
  const note = '已有笔记：客户管理系统需要支持按筛选条件导出 CSV。';
  const sends: string[] = [];
  const captureSend = (request: Request): void => {
    if (request.method() !== 'POST') return;
    const pathname = new URL(request.url()).pathname;
    if (
      pathname === '/api/conversations' ||
      /^\/api\/(?:providers\/[^/]+\/model-bench|conversations\/[^/]+\/messages|runtime\/session-messages\/send)$/.test(
        pathname
      )
    )
      sends.push(pathname);
  };
  page.on('request', captureSend);
  try {
    await input.fill(note);
    await page.getByRole('button', { name: `${q.prdTitle} ${q.prdDescription}`, exact: true }).click();
    await expect(input).toHaveValue(`${note}\n${q.prompts.prd}`);
    await expect(input).toBeFocused();
    await expect(page).toHaveURL(/#\/guid$/);
    // Cross one rendered frame so React's click effects and pending microtasks
    // have completed before checking that the shortcut did not initiate a turn.
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
    expect(sends).toEqual([]);
    await page.screenshot({ path: info.outputPath('home-prd-prefilled-draft.png') });
  } finally {
    page.removeListener('request', captureSend);
    if (await input.isVisible()) await input.fill('');
  }
});

test('home refreshes a newly created real project and opens its requirement workspace', async ({ page }, info) => {
  test.setTimeout(90_000);
  await goToGuid(page);
  await page.getByTestId('requirements-nav-entry').click();
  await expect(page.getByRole('heading', { name: /需求工作区|Requirements workspace/, exact: true })).toBeVisible();
  const q = (await page.getByRole('heading', { name: zhCommon.requirements.title, exact: true }).count())
    ? zhCommon.requirements
    : enCommon.requirements;
  const projectName = `Home-workspace-${Date.now()}`;
  await page.getByRole('button', { name: q.createProject, exact: true }).first().click();
  await page.getByLabel(q.projectName, { exact: true }).fill(projectName);
  const created = page.waitForResponse(
    (response) => response.url().endsWith('/api/projects') && response.request().method() === 'POST'
  );
  await page.getByRole('dialog').getByRole('button', { name: q.createProject, exact: true }).click();
  const createdResponse = await created;
  expect(createdResponse.status()).toBe(201);
  const project: ProjectDetailDto = (await createdResponse.json()).data;
  await expect(page).toHaveURL(new RegExp(`/projects/${project.project_id}/requirements`));

  // A real empty conversation records project activity without sending a model
  // request. This also keeps the project recent when other suite cases have
  // already populated more than three project groups in the shared fixture.
  const conversation = await httpInvoke<{ id: string; project_id?: string | null }>(
    page,
    'POST',
    '/api/conversations',
    {
      type: 'aionrs',
      name: `${projectName}-draft`,
      extra: { workspace: project.explorer.entries[0].display_path },
    }
  );
  // Creation responds with the pre-bind row snapshot. Check the persisted
  // owner through GET and the sidebar rather than trusting that stale payload.
  await expect
    .poll(async () => {
      const persisted = await httpInvoke<{ project_id?: string | null }>(
        page,
        'GET',
        `/api/conversations/${conversation.id}`
      );
      return persisted.project_id;
    })
    .toBe(project.project_id);
  await expect
    .poll(async () => {
      const sidebar = await httpInvoke<SidebarResponse>(page, 'GET', '/api/sidebar?limit=1');
      return sidebar.groups.some(
        (group) =>
          group.scope.type === 'project' &&
          group.scope.project_id === project.project_id &&
          group.items.some((item) => item.type === 'conversation' && item.conversation.id === conversation.id)
      );
    })
    .toBe(true);
  await page.getByTestId('home-nav-entry').click();
  await expect(page).toHaveURL(/#\/guid$/);
  const g = (await page.getByRole('heading', { name: zhGuid.home.title, exact: true }).count())
    ? zhGuid.home
    : enGuid.home;
  const recent = page.getByRole('region', { name: g.recentTitle, exact: true });
  const projectCard = recent.getByRole('button').filter({ has: page.getByText(project.name, { exact: true }) });
  await expect(projectCard).toBeVisible();
  await expect(projectCard).toContainText(project.explorer.entries[0].display_path);
  await page.screenshot({ path: info.outputPath('home-real-recent-project.png') });
  await projectCard.click();
  await expect(page).toHaveURL(new RegExp(`/projects/${project.project_id}/requirements$`));
  await expect(page.getByRole('heading', { name: q.title, exact: true })).toBeVisible();
});
