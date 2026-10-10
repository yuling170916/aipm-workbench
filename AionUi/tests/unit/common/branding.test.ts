/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  APP_DISPLAY_NAME,
  APP_MONOGRAM,
  BUTLER_DISPLAY_NAME,
  UPSTREAM_UPDATE_ENABLED,
  brandLocaleResource,
  replaceUpstreamBrand,
} from '@/common/branding';

describe('AIPM工作台 branding', () => {
  it('uses the AIPM monogram for compact brand surfaces', () => {
    expect(APP_MONOGRAM).toBe('AIPM');
  });

  it('does not let the custom build install upstream releases', () => {
    expect(UPSTREAM_UPDATE_ENABLED).toBe(false);
  });

  it('replaces supported upstream display-name variants', () => {
    expect(replaceUpstreamBrand('AionUi / AionUI / Aion UI')).toBe(
      `${APP_DISPLAY_NAME} / ${APP_DISPLAY_NAME} / ${APP_DISPLAY_NAME}`
    );
  });

  it('normalizes earlier branded copy while preserving the product manager role', () => {
    expect(replaceUpstreamBrand('产品经理工作台 / PM Workbench / Product Manager Workbench / 面向产品经理')).toBe(
      `${APP_DISPLAY_NAME} / ${APP_DISPLAY_NAME} / ${APP_DISPLAY_NAME} / 面向产品经理`
    );
  });

  it('uses the product-manager name for the built-in butler', () => {
    expect(replaceUpstreamBrand('AionUi管家 / AionUI Butler')).toBe(`${BUTLER_DISPLAY_NAME} / ${BUTLER_DISPLAY_NAME}`);
  });

  it('brands nested locale resources without changing their shape', () => {
    expect(
      brandLocaleResource({
        title: 'AionUi',
        notices: ['Restart AionUI', { description: 'About Aion UI' }],
      })
    ).toEqual({
      title: APP_DISPLAY_NAME,
      notices: [`Restart ${APP_DISPLAY_NAME}`, { description: `About ${APP_DISPLAY_NAME}` }],
    });
  });

  it('preserves upstream links and lowercase compatibility identifiers', () => {
    const source = 'See https://github.com/iOfficeAI/AionUi and restart aionui-browser.';
    expect(replaceUpstreamBrand(source)).toBe(source);
  });

  it('preserves upstream update and official-content attribution', () => {
    const resources = brandLocaleResource({
      'zh-CN': {
        update: { migration: { signature: 'AionUi 团队' } },
        settings: {
          officialAssistantsHint: '官方助手由 AionUi 持续维护',
          skillsHub: { officialHint: 'AionUi 官方内置的技能' },
        },
      },
    });

    expect(resources['zh-CN'].update.migration.signature).toBe('AionUi 团队');
    expect(resources['zh-CN'].settings.officialAssistantsHint).toContain('AionUi');
    expect(resources['zh-CN'].settings.skillsHub.officialHint).toContain('AionUi');
  });
});
