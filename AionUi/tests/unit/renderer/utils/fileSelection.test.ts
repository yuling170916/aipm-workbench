/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';

import {
  folderPathToFileUri,
  resolveFolderSelectionItem,
  stripWindowsVerbatimPrefix,
} from '@/renderer/utils/file/fileSelection';

describe('resolveFolderSelectionItem', () => {
  it('reuses a project ref when the selected folder already belongs to the project', async () => {
    const attachFolder = vi.fn();
    const item = await resolveFolderSelectionItem('project-1', '/work/docs', {
      resolveRef: vi.fn().mockResolvedValue({
        file: { kind: 'project', pe_id: 'pe-existing', relative_path: 'docs' },
        upgraded: true,
      }),
      attachFolder,
    });

    expect(item).toMatchObject({
      path: '/work/docs',
      name: 'docs',
      isFile: false,
      relativePath: 'docs',
      chatRef: { kind: 'project', pe_id: 'pe-existing', relative_path: 'docs' },
    });
    expect(attachFolder).not.toHaveBeenCalled();
  });

  it('attaches an external folder and returns a sendable project-root ref', async () => {
    const attachFolder = vi.fn().mockResolvedValue({
      pe_id: 'pe-new',
      role: 'attached',
      display_path: '/Users/me/My Folder',
      order_index: 1,
      runtime_status: 'available',
    });

    const item = await resolveFolderSelectionItem('project-1', '/Users/me/My Folder', {
      resolveRef: vi.fn().mockResolvedValue({
        file: { kind: 'local', path: '/Users/me/My Folder' },
        upgraded: false,
      }),
      attachFolder,
    });

    expect(attachFolder).toHaveBeenCalledWith({
      project_id: 'project-1',
      uri: 'file:///Users/me/My%20Folder',
    });
    expect(item.chatRef).toEqual({ kind: 'project', pe_id: 'pe-new', relative_path: '' });
    expect(item.isFile).toBe(false);
  });

  it('propagates resolver failures without attempting a folder attach', async () => {
    const attachFolder = vi.fn();
    const failure = new Error('project unavailable');

    await expect(
      resolveFolderSelectionItem('project-1', '/work/docs', {
        resolveRef: vi.fn().mockRejectedValue(failure),
        attachFolder,
      })
    ).rejects.toBe(failure);
    expect(attachFolder).not.toHaveBeenCalled();
  });

  it('creates file URIs for Windows paths without duplicating separators', () => {
    expect(folderPathToFileUri('C:\\Users\\me\\Specs')).toBe('file:///C:/Users/me/Specs');
  });
});

// Regression for issue #3191: the WebUI directory picker backend used to
// return Windows extended-length (verbatim) paths like `\\?\C:\DEV`, which
// broke Claude Code spawning and duplicated project-list entries.
describe('stripWindowsVerbatimPrefix', () => {
  it('strips the verbatim disk prefix', () => {
    expect(stripWindowsVerbatimPrefix('\\\\?\\C:\\DEV\\project')).toBe('C:\\DEV\\project');
    expect(stripWindowsVerbatimPrefix('\\\\?\\C:\\')).toBe('C:\\');
  });

  it('rewrites the verbatim UNC prefix to a regular UNC path', () => {
    expect(stripWindowsVerbatimPrefix('\\\\?\\UNC\\server\\share\\dir')).toBe('\\\\server\\share\\dir');
  });

  it('leaves non-verbatim paths untouched', () => {
    expect(stripWindowsVerbatimPrefix('C:\\DEV\\project')).toBe('C:\\DEV\\project');
    expect(stripWindowsVerbatimPrefix('\\\\server\\share')).toBe('\\\\server\\share');
    expect(stripWindowsVerbatimPrefix('/home/user/project')).toBe('/home/user/project');
    expect(stripWindowsVerbatimPrefix('')).toBe('');
  });
});
