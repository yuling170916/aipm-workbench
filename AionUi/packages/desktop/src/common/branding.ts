/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/** The customer-facing name shown throughout the desktop app and WebUI. */
export const APP_DISPLAY_NAME = 'AIPM工作台';

/** Author of this product's original additions and modifications. */
export const APP_AUTHOR = 'yuling';

/** Copyright year for this product's original additions and modifications. */
export const APP_COPYRIGHT_YEAR = 2026;

/** Compact mark used where the full product name does not fit. */
export const APP_MONOGRAM = 'AIPM';

/** Display name for the built-in assistant while retaining its compatibility id. */
export const BUTLER_DISPLAY_NAME = '工作台管家';

/** Custom builds must not replace themselves with an upstream release. */
export const UPSTREAM_UPDATE_ENABLED = false;

const DISPLAY_BRAND_PATTERN =
  /https?:\/\/[^\s"'<>]+|产品经理工作台|產品經理工作[台臺]|Product Manager Workbench|PM Workbench|Aion UI|AionUI|AionUi/g;
const UPSTREAM_BUTLER_PATTERN = /(?:Aion UI|AionUI|AionUi)\s*(?:管家|Butler)/g;

/**
 * Normalize upstream and earlier product display names while preserving URLs.
 * Lowercase technical identifiers such as `aionui-browser` are intentionally
 * left alone because they are compatibility contracts, not display branding.
 */
export function replaceUpstreamBrand(text: string): string {
  return text
    .replace(UPSTREAM_BUTLER_PATTERN, BUTLER_DISPLAY_NAME)
    .replace(DISPLAY_BRAND_PATTERN, (match) =>
      match.startsWith('http://') || match.startsWith('https://') ? match : APP_DISPLAY_NAME
    );
}

/** Apply the display brand to an imported i18n resource tree. */
const UPSTREAM_ATTRIBUTION_PATHS = new Set([
  'settings.officialAssistantsHint',
  'settings.officialAssistantsHintShort',
  'settings.skillsHub.officialHint',
]);

const shouldPreserveUpstreamAttribution = (path: readonly string[]): boolean => {
  const resourcePath = path.slice(1).join('.');
  return (
    resourcePath === 'update' || resourcePath.startsWith('update.') || UPSTREAM_ATTRIBUTION_PATHS.has(resourcePath)
  );
};

const brandLocaleValue = <T>(value: T, path: readonly string[]): T => {
  if (typeof value === 'string') {
    return (shouldPreserveUpstreamAttribution(path) ? value : replaceUpstreamBrand(value)) as T;
  }

  if (Array.isArray(value)) {
    return value.map((item) => brandLocaleValue(item, path)) as T;
  }

  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, brandLocaleValue(item, [...path, key])])
    ) as T;
  }

  return value;
};

export function brandLocaleResource<T>(value: T): T {
  return brandLocaleValue(value, []);
}
