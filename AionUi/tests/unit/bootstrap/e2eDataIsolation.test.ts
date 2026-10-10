import { afterEach, expect, it, vi } from 'vitest';
import { existsSync, mkdtempSync, rmSync, symlinkSync, readlinkSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const paths = vi.hoisted(() => ({ root: '', home: '' }));
vi.mock('@/common/platform', () => ({
  getPlatformServices: () => ({
    paths: {
      getDataDir: () => paths.root,
      getHomeDir: () => paths.home,
      getTempDir: () => paths.root,
      needsCliSafeSymlinks: () => true,
    },
  }),
}));
vi.mock('@/common/config/appEnv', () => ({ getEnvAwareName: (name: string) => `${name}-dev` }));
import { getConfigPath, getDataPath } from '@/process/utils/utils';

afterEach(() => {
  vi.unstubAllEnvs();
  if (paths.root) rmSync(path.dirname(paths.root), { recursive: true, force: true });
});

it('keeps backend data/config in the E2E sandbox without repointing home aliases', () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'pm-e2e-isolation-'));
  paths.root = path.join(directory, 'sandbox');
  paths.home = directory;
  const existing = path.join(directory, 'original-data');
  const alias = path.join(directory, '.aionui-dev');
  symlinkSync(existing, alias);
  vi.stubEnv('AIONUI_E2E_TEST', '1');
  vi.stubEnv('AIONUI_E2E_USER_DATA_DIR', paths.root);
  expect(getDataPath()).toBe(path.join(paths.root, 'aionui'));
  expect(getConfigPath()).toBe(path.join(paths.root, 'config'));
  expect(readlinkSync(alias)).toBe(existing);
  expect(existsSync(path.join(paths.root, 'aionui'))).toBe(true);
  expect(existsSync(path.join(directory, '.aionui-config-dev'))).toBe(false);
});
