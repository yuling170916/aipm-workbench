import { createServer, type Server } from 'node:http';
import { test, expect } from '../fixtures';
import { httpInvoke } from '../helpers/httpBridge';
import { navigateTo } from '../helpers/navigation';
import zh from '../../../packages/desktop/src/renderer/services/i18n/locales/zh-CN/common.json';
import en from '../../../packages/desktop/src/renderer/services/i18n/locales/en-US/common.json';
import type {
  RequirementDetail,
  RequirementSource,
} from '../../../packages/desktop/src/renderer/pages/Requirements/types';

const FIXTURE_MODEL = 'fixture-requirements-v1';
const FIXTURE_KEY = 'pm-e2e-fixture-not-a-real-key';
const GENERATED_TITLE = '订单导出需求（SSE 测试）';
const PERMISSION_QUESTION = '哪些角色允许导出完整订单？';
const BLOCKING_MESSAGE = '导出权限范围仍未由用户确认';
type FixtureInput = {
  sources: RequirementSource[];
  content?: { rules?: string };
  questions?: { resolved: boolean; answer: string }[];
};
type FixtureRequest = { phase: 'generate' | 'review'; model: string; stream: boolean };

/** An explicit deterministic model fixture. Renderer, HTTP bridge, backend and DB remain real. */
async function startModelFixture(): Promise<{
  server: Server;
  baseUrl: string;
  requests: FixtureRequest[];
  failures: string[];
}> {
  const requests: FixtureRequest[] = [];
  const failures: string[] = [];
  const server = createServer(async (request, response) => {
    try {
      if (
        request.method !== 'POST' ||
        request.url !== '/v1/chat/completions' ||
        request.headers.authorization !== `Bearer ${FIXTURE_KEY}`
      ) {
        failures.push(
          `Unexpected fixture request: ${request.method} ${request.url}; authorized=${request.headers.authorization === `Bearer ${FIXTURE_KEY}`}`
        );
        response.writeHead(401).end();
        return;
      }
      let body = '';
      for await (const chunk of request) {
        body += chunk.toString();
        if (body.length > 500_000) throw new Error('FIXTURE_BODY_LIMIT');
      }
      const wire = JSON.parse(body) as {
        model: string;
        stream: boolean;
        messages: { role: string; content: string }[];
      };
      if (wire.model !== FIXTURE_MODEL || !wire.stream || wire.messages[0]?.role !== 'user')
        throw new Error('FIXTURE_BAD_REQUEST');
      const prompt = wire.messages[0].content;
      const inputStart = prompt.indexOf('\nINPUT_DATA_JSON\n');
      const inputEnd = prompt.indexOf('\nEND_INPUT_DATA_JSON', inputStart);
      if (inputStart < 0 || inputEnd < 0) throw new Error('FIXTURE_MISSING_INPUT');
      const serialized = prompt.slice(inputStart + '\nINPUT_DATA_JSON\n'.length, inputEnd);
      const input = JSON.parse(serialized) as FixtureInput;
      const reviewing = prompt.includes('Task: review this requirement draft.');
      requests.push({ phase: reviewing ? 'review' : 'generate', model: wire.model, stream: wire.stream });
      const humanVerified =
        input.questions?.every((question) => question.resolved && Boolean(question.answer.trim())) &&
        input.content?.rules?.includes('仅运营负责人');
      const result = reviewing
        ? {
            summary: '本地 SSE 测试服务返回的结构化体检；不代表真实模型评估质量。',
            issues: humanVerified
              ? []
              : [
                  {
                    field: 'rules',
                    severity: 'blocking',
                    message: BLOCKING_MESSAGE,
                    suggestion: '请人工确认允许导出的角色和字段。',
                  },
                ],
          }
        : {
            content: {
              title: GENERATED_TITLE,
              audience: '运营同学',
              scenario: '每天整理订单清单时',
              problem: '订单清单需要人工复制，容易漏掉记录',
              goal: '减少人工复制步骤，并保留可核对的完整订单清单',
              scope: '提供订单清单 CSV 下载，不包含自动发送功能',
              rules: '用户选择日期范围后点击下载，导出符合条件的订单',
              exceptions: '没有订单时展示空结果提示；导出失败允许重试',
              acceptance: '选择日期范围并下载后，CSV 包含该范围内的订单，界面显示成功或失败结果',
            },
            evidence: [{ field: 'audience', source_id: input.sources[0]?.id, quote: '运营同学' }],
            questions: [{ text: PERMISSION_QUESTION }],
          };
      response.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });
      const output = JSON.stringify(result);
      for (let offset = 0; offset < output.length; offset += 23) {
        response.write(
          `data: ${JSON.stringify({ choices: [{ delta: { content: output.slice(offset, offset + 23) }, finish_reason: null }] })}\n\n`
        );
      }
      response.end(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }] })}\n\ndata: [DONE]\n\n`);
    } catch (error) {
      failures.push(error instanceof Error ? error.message : 'UNKNOWN_FIXTURE_ERROR');
      if (!response.headersSent) response.writeHead(400, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ error: 'LOCAL_MODEL_FIXTURE_REJECTED_REQUEST' }));
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('FIXTURE_LISTEN_FAILED');
  return { server, baseUrl: `http://127.0.0.1:${address.port}/v1`, requests, failures };
}

test('requirements AI: real UI → backend model bridge → local SSE fixture → persisted draft and human confirmation', async ({
  page,
  electronApp,
}, info) => {
  test.setTimeout(120_000);
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  const userData = await electronApp.evaluate(({ app }) => app.getPath('userData'));
  // Refuse a run against an ordinary user's application data or provider keys.
  expect(userData).toMatch(/aionui-e2e-userdata-|desktop-ai-acceptance(?:[\\/]|$)/);
  await page.waitForFunction(() => ((window as unknown as { __backendPort?: number }).__backendPort ?? 0) > 0);
  const fixture = await startModelFixture();
  let providerId: string | undefined;
  let requirementId: string | undefined;
  try {
    const provider = await httpInvoke<{ id: string }>(page, 'POST', '/api/providers', {
      platform: 'openai',
      name: `Local SSE fixture ${Date.now()}`,
      base_url: fixture.baseUrl,
      api_key: FIXTURE_KEY,
      models: [FIXTURE_MODEL],
      enabled: true,
      model_settings: { [FIXTURE_MODEL]: { openai_api_mode: 'chat_completions' } },
    });
    providerId = provider.id;
    const project = await httpInvoke<{ project_id: string }>(page, 'POST', '/api/projects', {
      name: `AI-E2E-${Date.now()}`,
    });
    await navigateTo(page, `#/projects/${project.project_id}/requirements`);
    await expect(
      page.getByRole('heading', { name: new RegExp(`${zh.requirements.title}|${en.requirements.title}`), exact: true })
    ).toBeVisible();
    const q = (await page.getByRole('heading', { name: zh.requirements.title, exact: true }).count())
      ? zh.requirements
      : en.requirements;
    await page.getByRole('button', { name: q.new, exact: true }).first().click();
    const material = '运营同学每天导出订单清单，需要 CSV 下载。';
    await page.getByLabel(q.material, { exact: true }).fill(material);
    await expect(page.getByRole('button', { name: q.aiGenerate, exact: true })).toBeEnabled();
    const generatedResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith(`/api/providers/${provider.id}/model-bench`) && response.request().method() === 'POST'
    );
    await page.getByRole('button', { name: q.aiGenerate, exact: true }).click();
    const generationHttp = await generatedResponse;
    expect(
      generationHttp.status(),
      generationHttp.ok()
        ? undefined
        : `${await generationHttp.text()}; fixture failures=${JSON.stringify(fixture.failures)}`
    ).toBe(200);
    await expect(page.getByLabel(q.fields.title, { exact: true })).toHaveValue(GENERATED_TITLE);
    await expect(page.getByText(q.sourceWarning, { exact: true })).toBeVisible();
    await expect(page.getByLabel(q.questionText, { exact: true })).toHaveValue(PERMISSION_QUESTION);
    expect(await httpInvoke<unknown[]>(page, 'GET', `/api/projects/${project.project_id}/requirements`)).toHaveLength(
      0
    );
    const savedResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith(`/api/projects/${project.project_id}/requirements`) &&
        response.request().method() === 'POST'
    );
    await page.getByRole('button', { name: q.createManual, exact: true }).click();
    const first: RequirementDetail = (await (await savedResponse).json()).data;
    requirementId = first.card.id;
    expect(first.card.status).toBe('draft');
    expect(first.card.questions[0]).toMatchObject({ text: PERMISSION_QUESTION, resolved: false, answer: '' });
    expect(
      first.card.sources.some(
        (source) => source.kind === 'user' && source.excerpt === material && source.fields?.includes('audience')
      )
    ).toBe(true);
    expect(first.card.sources.some((source) => source.kind === 'ai' && source.fields?.includes('goal'))).toBe(true);
    await page.getByRole('tab', { name: q.review, exact: true }).click();
    await page.getByRole('button', { name: q.reviewRules, exact: true }).click();
    const reviewedResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith(`/api/requirements/${first.card.id}/checks`) &&
        response.request().method() === 'POST' &&
        response.request().postDataJSON()?.kind === 'ai'
    );
    await page.getByRole('button', { name: q.reviewAi, exact: true }).click();
    expect((await reviewedResponse).status()).toBe(200);
    await expect(page.getByText(BLOCKING_MESSAGE, { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: q.confirm, exact: true })).toBeDisabled();
    const reviewed = await httpInvoke<RequirementDetail>(page, 'GET', `/api/requirements/${first.card.id}`);
    expect(reviewed.card.status).toBe('review');
    expect(reviewed.checks.find((check) => check.kind === 'ai')).toMatchObject({
      based_on_revision: 1,
      issues: [expect.objectContaining({ severity: 'blocking', status: 'open', resolution: '' })],
    });

    // A model finding cannot answer or confirm on the user's behalf.
    await page.getByRole('tab', { name: q.editor, exact: true }).click();
    await page.getByLabel(q.questionAnswer, { exact: true }).fill('业务负责人确认：仅运营负责人允许导出订单清单。');
    await page.locator('label.arco-checkbox').filter({ hasText: q.answered }).click();
    await expect(page.getByRole('checkbox', { name: q.answered, exact: true })).toBeChecked();
    await page
      .getByLabel(q.fields.rules, { exact: true })
      .fill('仅运营负责人允许导出订单清单；选择日期范围后点击下载。');
    await page.getByRole('button', { name: q.save, exact: true }).click();
    await expect(page.getByRole('button', { name: q.save, exact: true })).toBeDisabled();
    await page.getByRole('tab', { name: q.review, exact: true }).click();
    await expect(page.getByRole('button', { name: q.confirm, exact: true })).toBeDisabled();
    await page.getByRole('button', { name: q.reviewRules, exact: true }).click();
    const checkedAgain = page.waitForResponse(
      (response) =>
        response.url().endsWith(`/api/requirements/${first.card.id}/checks`) &&
        response.request().method() === 'POST' &&
        response.request().postDataJSON()?.kind === 'ai'
    );
    await page.getByRole('button', { name: q.reviewAi, exact: true }).click();
    await checkedAgain;
    await expect(page.getByRole('button', { name: q.confirm, exact: true })).toBeEnabled();
    await page.getByRole('button', { name: q.confirm, exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: q.confirm, exact: true }).click();
    await expect(page.getByRole('button', { name: q.confirmed, exact: true })).toBeDisabled();
    await expect(page.getByRole('dialog')).toBeHidden();
    const confirmed = await httpInvoke<RequirementDetail>(page, 'GET', `/api/requirements/${first.card.id}`);
    expect(confirmed.card.status).toBe('confirmed');
    expect(confirmed.card.questions[0].resolved).toBe(true);
    expect(confirmed.card.sources.some((source) => source.kind === 'ai' && source.fields?.includes('goal'))).toBe(true);
    expect(fixture.requests.map((request) => request.phase)).toEqual(['generate', 'review', 'review']);
    expect(fixture.failures).toEqual([]);
    expect(pageErrors).toEqual([]);
    await info.attach('local-model-fixture-requests', {
      body: JSON.stringify(fixture.requests),
      contentType: 'application/json',
    });
    await expect(page.locator('.arco-message')).toHaveCount(0);
    await page.getByRole('button', { name: q.reviewAi, exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath('requirements-ai-confirmed.png') });
  } finally {
    if (requirementId) {
      const latest = await httpInvoke<RequirementDetail>(page, 'GET', `/api/requirements/${requirementId}`).catch(
        () => null
      );
      if (latest)
        await httpInvoke(
          page,
          'DELETE',
          `/api/requirements/${requirementId}?expected_revision=${latest.card.revision}`
        ).catch(() => {});
    }
    if (providerId) await httpInvoke(page, 'DELETE', `/api/providers/${providerId}`).catch(() => {});
    fixture.server.closeAllConnections();
    await new Promise<void>((resolve, reject) => fixture.server.close((error) => (error ? reject(error) : resolve())));
  }
});
