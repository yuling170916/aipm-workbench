/* eslint-disable no-await-in-loop -- Each capture drives the same Electron page and must finish before the next navigation. */
import { realpathSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { test, expect } from '../fixtures';
import { httpInvoke } from '../helpers/httpBridge';
import { navigateTo } from '../helpers/navigation';
import zh from '../../../packages/desktop/src/renderer/services/i18n/locales/zh-CN/common.json';
import en from '../../../packages/desktop/src/renderer/services/i18n/locales/en-US/common.json';
import type { RequirementDetail } from '../../../packages/desktop/src/renderer/pages/Requirements/types';

const USER_TEXT = '运营同学提出：订单列表需要支持按日期导出。\n保留 CSV 表头，失败后能重试。';
const AI_TEXT = '建议先增加 CSV 导出，并评估权限范围。\n这是一条测试 AI 回复，尚未得到业务确认。';
type Conversation = { id: string; project_id?: string | null };
type SeedMessage = { id: string; msgId: string; position: 'left' | 'right'; text: string };
type Project = { project_id: string; name: string };

/**
 * Prepare a historical, unassigned chat in an explicitly disposable database.
 * The public messages POST starts an agent turn and cannot import AI replies.
 * Only this fixture setup writes SQL; all reads, capture and saves use the app.
 */
function seedHistoricalMessages(userData: string, conversationId: string): SeedMessage[] {
  const profile = realpathSync(userData);
  const databasePath = realpathSync(path.join(userData, 'aionui', 'aionui-backend.db'));
  if (!databasePath.startsWith(`${profile}${path.sep}`)) throw new Error('FIXTURE_DATABASE_OUTSIDE_PROFILE');
  const database = new DatabaseSync(databasePath);
  try {
    database.exec('PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;');
    const row = database.prepare('SELECT extra FROM conversations WHERE id = ?').get(conversationId) as
      | { extra: string }
      | undefined;
    if (!row) throw new Error('FIXTURE_API_CONVERSATION_MISSING');
    const extra = JSON.parse(row.extra) as Record<string, unknown>;
    // Avoid lazy workspace → project backfill: this fixture represents old,
    // unassigned history, which is still supported by the conversation reader.
    delete extra.workspace;
    database
      .prepare('UPDATE conversations SET project_id = NULL, folder_id = NULL, extra = ? WHERE id = ?')
      .run(JSON.stringify(extra), conversationId);
    const insert = database.prepare(
      `INSERT INTO messages
        (id, conversation_id, msg_id, type, content, position, status, hidden, created_at, backend_turn_id)
       VALUES (?, ?, ?, 'text', ?, ?, 'finish', 0, ?, NULL)`
    );
    const messages: SeedMessage[] = [
      { id: randomUUID(), msgId: randomUUID(), position: 'right', text: USER_TEXT },
      { id: randomUUID(), msgId: randomUUID(), position: 'left', text: AI_TEXT },
    ];
    messages.forEach((message, index) =>
      insert.run(
        message.id,
        conversationId,
        message.msgId,
        JSON.stringify({ content: message.text }),
        message.position,
        Date.now() + index
      )
    );
    return messages;
  } finally {
    database.close();
  }
}

test('chat capture preserves user/AI origins and real references when moving unassigned history into a project', async ({
  page,
  electronApp,
}, info) => {
  test.setTimeout(120_000);
  const userData = await electronApp.evaluate(({ app }) => app.getPath('userData'));
  expect(userData).toMatch(/aionui-e2e-userdata-|desktop-capture-acceptance(?:[\\/]|$)/);
  const pageErrors: string[] = [];
  const modelRequests: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('request', (request) => {
    if (
      request.method() === 'POST' &&
      /\/api\/(?:providers\/[^/]+\/model-bench|conversations\/[^/]+\/messages|runtime\/session-messages\/send)(?:\?|$)/.test(
        new URL(request.url()).pathname
      )
    )
      modelRequests.push(request.url());
  });
  await page.waitForFunction(() => ((window as unknown as { __backendPort?: number }).__backendPort ?? 0) > 0);
  const conversation = await httpInvoke<Conversation>(page, 'POST', '/api/conversations', {
    type: 'aionrs',
    name: `Capture-history-fixture-${Date.now()}`,
    extra: {},
  });
  const savedIds: string[] = [];
  try {
    const messages = seedHistoricalMessages(userData, conversation.id);
    const unassigned = await httpInvoke<Conversation>(page, 'GET', `/api/conversations/${conversation.id}`);
    expect(unassigned.project_id ?? null).toBeNull();
    const history = await httpInvoke<{
      items: { id: string; msg_id: string; content: { content: string }; position: string }[];
    }>(page, 'GET', `/api/conversations/${conversation.id}/messages`);
    expect(history.items).toEqual(
      expect.arrayContaining(
        messages.map((message) =>
          expect.objectContaining({
            id: message.id,
            msg_id: message.msgId,
            content: { content: message.text },
            position: message.position,
          })
        )
      )
    );
    let project: Project | undefined;
    const savedCards: RequirementDetail[] = [];
    for (const message of messages) {
      await navigateTo(page, `#/conversation/${conversation.id}`);
      const bubble = page.locator(`[id="message-${message.id}"]`);
      await expect(bubble).toBeVisible();
      await bubble.getByTestId('message-requirement-button').click();
      await expect(page).toHaveURL(/#\/requirements$/);
      await expect(page.getByRole('heading', { name: /需求工作区|Requirements workspace/, exact: true })).toBeVisible();
      const q = (await page.getByRole('heading', { name: zh.requirements.title, exact: true }).count())
        ? zh.requirements
        : en.requirements;
      await expect(page.getByRole('heading', { name: q.chooseProject, exact: true })).toBeVisible();
      const staged = await page.evaluate(() => JSON.parse(sessionStorage.getItem('requirements.capture') || 'null'));
      expect(staged).toMatchObject({
        text: message.text,
        conversationId: conversation.id,
        messageId: message.msgId,
        sourceKind: message.position === 'right' ? 'user' : 'ai',
      });
      expect(staged.projectId).toBeUndefined();
      if (!project) {
        await page.getByRole('button', { name: q.createProject, exact: true }).first().click();
        await page.getByLabel(q.projectName, { exact: true }).fill(`Capture-project-${Date.now()}`);
        const created = page.waitForResponse(
          (response) => response.url().endsWith('/api/projects') && response.request().method() === 'POST'
        );
        await page.getByRole('dialog').getByRole('button', { name: q.createProject, exact: true }).click();
        const response = await created;
        expect(response.status()).toBe(201);
        project = (await response.json()).data as Project;
        await expect(page.getByRole('dialog')).toBeHidden();
      } else {
        await page.getByLabel(q.chooseProject, { exact: true }).click();
        await page.getByRole('option', { name: project.name, exact: true }).click();
      }
      await expect(page).toHaveURL(new RegExp(`/projects/${project.project_id}/requirements$`));
      await expect(page.getByLabel(q.material, { exact: true })).toHaveValue(message.text);
      await expect(page.getByLabel(q.sourceExcerpt, { exact: true })).toHaveValue(message.text);
      await expect(page.getByLabel(q.sourceLabel, { exact: true })).toHaveValue(
        message.position === 'right' ? q.chatUserSource : q.chatAiSource
      );
      if (message.position === 'left') await expect(page.getByText(q.sourceWarning, { exact: true })).toBeVisible();
      const title = message.position === 'right' ? '用户聊天原文整理' : 'AI 回答整理（待核实）';
      await page.getByLabel(q.fields.title, { exact: true }).fill(title);
      const saved = page.waitForResponse(
        (response) =>
          response.url().endsWith(`/api/projects/${project!.project_id}/requirements`) &&
          response.request().method() === 'POST'
      );
      await page.getByRole('button', { name: q.createManual, exact: true }).click();
      const response = await saved;
      expect(response.status()).toBe(201);
      const result: RequirementDetail = (await response.json()).data;
      savedIds.push(result.card.id);
      const persisted = await httpInvoke<RequirementDetail>(page, 'GET', `/api/requirements/${result.card.id}`);
      expect(persisted.card.status).toBe('draft');
      expect(persisted.card.project_id).toBe(project.project_id);
      expect(persisted.card.sources).toHaveLength(1);
      expect(persisted.card.sources[0]).toMatchObject({
        kind: message.position === 'right' ? 'conversation' : 'ai',
        label: message.position === 'right' ? q.chatUserSource : q.chatAiSource,
        excerpt: message.text,
        conversation_id: conversation.id,
        message_id: message.msgId,
      });
      expect(persisted.checks).toHaveLength(0);
      await expect.poll(() => page.evaluate(() => sessionStorage.getItem('requirements.capture'))).toBeNull();
      savedCards.push(persisted);
      if (message.position === 'left') {
        await expect(page.locator('.arco-message')).toHaveCount(0);
        await page.getByText(q.sourceWarning, { exact: true }).scrollIntoViewIfNeeded();
        await page.screenshot({ path: info.outputPath('requirements-ai-chat-capture.png') });
      }
    }
    expect(pageErrors).toEqual([]);
    expect(modelRequests).toEqual([]);
    await info.attach('historical-chat-fixture-and-persisted-origins', {
      body: JSON.stringify({
        conversationId: conversation.id,
        sources: savedCards.map((detail) => detail.card.sources),
      }),
      contentType: 'application/json',
    });
  } finally {
    for (const id of savedIds) {
      const latest = await httpInvoke<RequirementDetail>(page, 'GET', `/api/requirements/${id}`).catch(() => null);
      if (latest)
        await httpInvoke(page, 'DELETE', `/api/requirements/${id}?expected_revision=${latest.card.revision}`).catch(
          () => {}
        );
    }
    await httpInvoke(page, 'DELETE', `/api/conversations/${conversation.id}`).catch(() => {});
  }
});
