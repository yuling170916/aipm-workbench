import fs from 'node:fs';
import path from 'node:path';
import postcss from 'postcss';
import { describe, expect, it } from 'vitest';

const arcoOverridePath = path.resolve(process.cwd(), 'packages/desktop/src/renderer/styles/arco-override.css');

describe('arco tooltip and popover overlay styles', () => {
  it('keeps overlay colors attached to the active theme in both appearances', () => {
    const css = fs.readFileSync(arcoOverridePath, 'utf8');
    const references = new Map<string, Set<string>>();

    // A fixed light/dark color here would prevent custom themes from reaching overlays.
    postcss.parse(css).walkDecls(/^--aion-overlay-/, (declaration) => {
      const values = references.get(declaration.prop) ?? new Set<string>();
      values.add(declaration.value);
      references.set(declaration.prop, values);
    });

    expect(Object.fromEntries([...references].map(([token, values]) => [token, [...values]]))).toEqual({
      '--aion-overlay-bg': ['var(--surface-elevated)'],
      '--aion-overlay-text': ['var(--text-primary)'],
      '--aion-overlay-border': ['var(--border-base)'],
      '--aion-overlay-shadow': ['var(--shadow-popover)'],
    });
  });

  it('applies the shared overlay tokens to tooltip, popover, and popconfirm surfaces', () => {
    const css = fs.readFileSync(arcoOverridePath, 'utf8');

    expect(css).toContain('.arco-tooltip-content,');
    expect(css).toContain('.arco-popover-content,');
    expect(css).toContain('.arco-popconfirm-content {');
    expect(css).toContain('background: var(--aion-overlay-bg) !important;');
    expect(css).toContain('color: var(--aion-overlay-text) !important;');
    expect(css).toContain('border: 1px solid var(--aion-overlay-border) !important;');
    expect(css).toContain('.arco-trigger-arrow.arco-tooltip-arrow,');
    expect(css).toContain('.arco-popover-arrow.arco-trigger-arrow,');
    expect(css).toContain('.arco-popconfirm-arrow.arco-trigger-arrow {');
  });

  it('defines a dark-mode override selector that can beat preset-specific tooltip rules', () => {
    const css = fs.readFileSync(arcoOverridePath, 'utf8');

    expect(css).toContain("html[data-theme='dark'] body .arco-tooltip-content,");
    expect(css).toContain("html[data-theme='dark'] body .arco-popover-content,");
    expect(css).toContain("html[data-theme='dark'] body .arco-popconfirm-content,");
    expect(css).toContain("body[arco-theme='dark'] .arco-popconfirm-content {");
  });

  it('does not skin nested popover wrappers as a second surface', () => {
    const css = fs.readFileSync(arcoOverridePath, 'utf8');

    expect(css).not.toContain('.arco-popover-inner,');
    expect(css).not.toContain('.arco-tooltip-inner,');
  });
});
