/* eslint-disable no-await-in-loop -- Form fields share one Electron page and are filled in order. */
import { expect } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { _electron as electron } from 'playwright';
import { test } from '../fixtures';
import { httpInvoke } from '../helpers/httpBridge';
import zh from '../../../packages/desktop/src/renderer/services/i18n/locales/zh-CN/common.json';
import en from '../../../packages/desktop/src/renderer/services/i18n/locales/en-US/common.json';
import type { RequirementDetail } from '../../../packages/desktop/src/renderer/pages/Requirements/types';

test('requirements: create project, review, confirm, revise, compare and export through real backend', async ({
  page,
  electronApp,
}, info) => {
  test.setTimeout(120_000);
  await page.getByTestId('requirements-nav-entry').click();
  await expect(page.getByRole('heading', { name: /需求工作区|Requirements workspace/, exact: true })).toBeVisible();
  const q = (await page.getByRole('heading', { name: zh.requirements.title, exact: true }).count())
    ? zh.requirements
    : en.requirements;
  const projectName = `PM-acceptance-${Date.now()}`;
  await page.getByRole('button', { name: q.createProject, exact: true }).first().click();
  await page.getByLabel(q.projectName, { exact: true }).fill(projectName);
  const projectCreated = page.waitForResponse(
    (response) => response.url().endsWith('/api/projects') && response.request().method() === 'POST'
  );
  await page.getByRole('dialog').getByRole('button', { name: q.createProject, exact: true }).click();
  const projectResponse = await projectCreated;
  expect(projectResponse.status()).toBe(201);
  const { data: project } = await projectResponse.json();
  await expect(page).toHaveURL(new RegExp(`/projects/${project.project_id}/requirements`));

  const content = {
    title: '用户导出需求评审稿',
    audience: '',
    scenario: '产品评审会议前整理当前需求',
    problem: '需求散落在聊天中，难以追溯和评审',
    goal: '让团队能核对需求与原始依据',
    scope: '提供 Markdown 评审稿导出，包含需求字段与来源',
    rules: '保存需求后才允许导出，有未保存修改时先保存',
    exceptions: '保存失败保留本地修改并允许重试',
    acceptance: '点击导出后下载 Markdown 文件，包含需求编号、当前版本、字段和来源',
    priority: 'P1',
  };
  for (const [field, value] of Object.entries(content)) {
    await page.getByLabel(q.fields[field as keyof typeof q.fields], { exact: true }).fill(value);
  }
  await page.getByRole('button', { name: q.addSource, exact: true }).click();
  await page.getByLabel(q.sourceLabel, { exact: true }).fill('评审会议记录');
  await page.getByLabel(q.sourceExcerpt, { exact: true }).fill('需要把需求导出为可讨论的评审稿。');
  const saved = page.waitForResponse(
    (response) => new URL(response.url()).pathname.endsWith('/requirements') && response.request().method() === 'POST'
  );
  await page.getByRole('button', { name: q.createManual, exact: true }).click();
  const savedResponse = await saved;
  expect(savedResponse.status()).toBe(201);
  const first: RequirementDetail = (await savedResponse.json()).data;
  await expect(page.getByRole('tab', { name: q.review, exact: true })).toBeVisible();
  await page.getByRole('tab', { name: q.review, exact: true }).click();
  await page.getByRole('button', { name: q.reviewRules, exact: true }).click();
  await expect(page.getByRole('button', { name: q.confirm, exact: true })).toBeDisabled();
  await expect(page.getByText('必填信息尚未补充', { exact: true })).toBeVisible();

  await page.getByRole('tab', { name: q.editor, exact: true }).click();
  await page.getByLabel(q.fields.audience, { exact: true }).fill('负责需求评审的产品经理');
  await page.getByRole('button', { name: q.save, exact: true }).click();
  await expect(page.getByRole('button', { name: q.save, exact: true })).toBeDisabled();
  await page.getByRole('tab', { name: q.review, exact: true }).click();
  await page.getByRole('button', { name: q.reviewRules, exact: true }).click();
  await expect(page.getByRole('button', { name: q.confirm, exact: true })).toBeEnabled();
  await page.getByRole('button', { name: q.confirm, exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: q.confirm, exact: true }).click();
  await expect(page.getByRole('button', { name: q.confirmed, exact: true })).toBeDisabled();

  const documentPath = path.join(project.explorer.entries[0].display_path, 'acceptance-prd.md');
  const originalDocument = '# 手工维护的 PRD\n';
  await fs.writeFile(documentPath, originalDocument);
  await page.getByRole('tab', { name: q.documents, exact: true }).click();
  await page.getByLabel(q.linkName, { exact: true }).fill('项目 PRD');
  await page.getByLabel(q.linkPath, { exact: true }).fill(documentPath);
  await page.getByRole('button', { name: q.addLink, exact: true }).click();
  await expect(page.getByText(q.needsReview, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: q.markSynced, exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: q.markSynced, exact: true }).click();
  await expect(page.getByText(q.needsReview, { exact: true })).toHaveCount(0);
  await page.getByRole('tab', { name: q.editor, exact: true }).click();
  const revisedGoal = '让团队核对需求、来源和变更影响，减少评审遗漏';
  await page.getByLabel(q.fields.goal, { exact: true }).fill(revisedGoal);
  await page.getByRole('button', { name: q.save, exact: true }).click();
  await expect(page.getByRole('button', { name: q.save, exact: true })).toBeDisabled();
  const latest = await httpInvoke<RequirementDetail>(page, 'GET', `/api/requirements/${first.card.id}`);
  expect(latest.card.revision).toBe(3);
  expect(latest.card.status).toBe('review');
  expect(latest.links[0].needs_review).toBe(true);
  expect(latest.versions).toHaveLength(3);
  expect(latest.versions[0].snapshot.content.goal).toBe(content.goal);
  expect(await fs.readFile(documentPath, 'utf8')).toBe(originalDocument);

  await page.getByRole('tab', { name: q.history, exact: true }).click();
  await expect(page.getByLabel(q.history, { exact: true }).getByText(revisedGoal, { exact: true })).toBeVisible();
  await page.getByRole('tab', { name: q.documents, exact: true }).click();
  await expect(page.getByText(q.needsReview, { exact: true })).toBeVisible();
  const exportResponse = page.waitForResponse((response) =>
    response.url().endsWith(`/api/requirements/${first.card.id}/export`)
  );
  const downloadedPath = info.outputPath('review-export.md');
  await electronApp.evaluate(({ session }, destination) => {
    session.defaultSession.once('will-download', (_event, item) => item.setSavePath(destination));
  }, downloadedPath);
  await page.getByRole('button', { name: q.export, exact: true }).click();
  const exported = (await (await exportResponse).json()).data;
  expect(exported.markdown).toContain(revisedGoal);
  expect(exported.markdown).toContain('评审会议记录');
  expect(exported.filename).toContain('-v3.md');
  await expect.poll(() => fs.readFile(downloadedPath, 'utf8').catch(() => '')).toContain(revisedGoal);
  await page.reload();
  await expect(page.getByRole('heading', { name: content.title, exact: true })).toBeVisible();
  await expect(page.getByLabel(q.fields.goal, { exact: true })).toHaveValue(revisedGoal);
  await page.screenshot({ path: info.outputPath('requirements-workspace.png') });
  // A new backend process must read the SQLite state, rather than an in-memory copy.
  const launchState = await electronApp.evaluate(({ app }) => ({
    userData: app.getPath('userData'),
    executablePath: app.getPath('exe'),
    packaged: app.isPackaged,
  }));
  await electronApp.close();
  const restarted = await electron.launch({
    executablePath: launchState.executablePath,
    args: launchState.packaged ? [] : ['.'],
    cwd: path.resolve(__dirname, '../../..'),
    env: {
      ...process.env,
      AIONUI_E2E_TEST: '1',
      AIONUI_E2E_USER_DATA_DIR: launchState.userData,
      AIONUI_DISABLE_AUTO_UPDATE: '1',
      AIONUI_DISABLE_DEVTOOLS: '1',
      AIONUI_CDP_PORT: '0',
      NODE_ENV: launchState.packaged ? 'production' : 'development',
    },
  });
  try {
    const reopened = await restarted.firstWindow();
    await reopened.getByTestId('requirements-nav-entry').waitFor({ state: 'visible', timeout: 60_000 });
    const persisted = await httpInvoke<RequirementDetail>(reopened, 'GET', `/api/requirements/${first.card.id}`);
    expect(persisted.card.content.goal).toBe(revisedGoal);
    expect(persisted.versions).toHaveLength(3);
    expect(persisted.links[0].needs_review).toBe(true);
  } finally {
    await restarted.close();
  }
});
