/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { DEFAULT_LANGUAGE, normalizeLanguageCode, type SupportedLanguage } from '@/common/config/i18n';

interface InitialLanguageHints {
  backendStartupFailed: boolean;
  localStorageLanguage: string | null;
  injectedLanguage: string | null;
}

/** Resolve the synchronous first-paint language without consulting the host OS. */
export function resolveInitialLanguage({
  backendStartupFailed,
  localStorageLanguage,
  injectedLanguage,
}: InitialLanguageHints): SupportedLanguage {
  const hint = backendStartupFailed
    ? injectedLanguage || localStorageLanguage
    : localStorageLanguage || injectedLanguage;
  return normalizeLanguageCode(hint || DEFAULT_LANGUAGE);
}

/** Keep an explicit saved choice; otherwise use the product's Simplified Chinese default. */
export function resolveConfiguredLanguage(savedLanguage: string | null | undefined): SupportedLanguage {
  return normalizeLanguageCode(savedLanguage || DEFAULT_LANGUAGE);
}
