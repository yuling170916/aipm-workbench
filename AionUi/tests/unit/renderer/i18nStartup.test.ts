/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { resolveConfiguredLanguage, resolveInitialLanguage } from '@/renderer/services/i18n/startupLanguage';

describe('i18n startup language', () => {
  it('defaults a fresh install to Simplified Chinese', () => {
    expect(
      resolveInitialLanguage({
        backendStartupFailed: false,
        localStorageLanguage: null,
        injectedLanguage: null,
      })
    ).toBe('zh-CN');
    expect(resolveConfiguredLanguage(undefined)).toBe('zh-CN');
  });

  it('keeps an explicit saved language choice', () => {
    expect(resolveConfiguredLanguage('en-US')).toBe('en-US');
    expect(
      resolveInitialLanguage({
        backendStartupFailed: false,
        localStorageLanguage: 'ja-JP',
        injectedLanguage: 'en-US',
      })
    ).toBe('ja-JP');
  });

  it('uses injected persisted config first during backend recovery', () => {
    expect(
      resolveInitialLanguage({
        backendStartupFailed: true,
        localStorageLanguage: 'ja-JP',
        injectedLanguage: 'en-US',
      })
    ).toBe('en-US');
  });

  it('falls back to Simplified Chinese for an unsupported saved language', () => {
    expect(resolveConfiguredLanguage('it-IT')).toBe('zh-CN');
  });
});
