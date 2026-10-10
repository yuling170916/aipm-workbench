/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { localFileRef, projectFileRef, type ChatFileRef } from '@/common/types/chatFile';
import type { ProjectEntryDto } from '@/common/types/project';
import type { FileOrFolderItem } from '@/renderer/utils/file/fileTypes';

export type FileSelectionItem = string | FileOrFolderItem;

/**
 * Wrap backend-machine picker paths (native dialog in Electron / server-fs browse
 * in WebUI) as selection items tagged with a `local` chatRef, so the send path
 * emits them as `local` refs (absolute backend paths, sent as-is) rather than
 * `upload` refs — which the backend would reject as outside its managed upload
 * directory. Empty paths are dropped.
 */
export const localSelectionItems = (paths: string[]): FileOrFolderItem[] =>
  paths
    .filter((path) => Boolean(path))
    .map((path) => ({
      path,
      name: path.split(/[\\/]/).pop() || path,
      isFile: true,
      chatRef: localFileRef(path),
    }));

type FolderSelectionProjectClient = {
  resolveRef: (params: { project_id: string; file: ChatFileRef }) => Promise<{ file: ChatFileRef; upgraded: boolean }>;
  attachFolder: (params: { project_id: string; uri: string }) => Promise<ProjectEntryDto>;
};

/** Convert a native absolute path to the file URI accepted by the project API. */
export const folderPathToFileUri = (folderPath: string): string => {
  const normalized = folderPath.replace(/\\/g, '/');
  const withLeadingSlash = normalized.startsWith('/') ? normalized : `/${normalized}`;
  return `file://${encodeURI(withLeadingSlash)}`;
};

/**
 * Turn a host-picker directory into a sendable project-folder selection.
 *
 * A `local` chat ref deliberately accepts regular files only, so sending a raw
 * directory path would fail at the backend boundary. Resolve first in case the
 * folder already belongs to the current project; otherwise attach it as a new
 * project root and use that root's project ref. Project refs support folders.
 */
export const resolveFolderSelectionItem = async (
  projectId: string,
  folderPath: string,
  projectClient: FolderSelectionProjectClient
): Promise<FileOrFolderItem> => {
  const existing = await projectClient.resolveRef({
    project_id: projectId,
    file: localFileRef(folderPath),
  });

  const chatRef =
    existing.file.kind === 'project'
      ? existing.file
      : projectFileRef(
          (
            await projectClient.attachFolder({
              project_id: projectId,
              uri: folderPathToFileUri(folderPath),
            })
          ).pe_id,
          ''
        );
  const nameSource = folderPath.replace(/[\\/]+$/, '');

  return {
    path: folderPath,
    name: nameSource.split(/[\\/]/).pop() || folderPath,
    isFile: false,
    relativePath: chatRef.kind === 'project' ? chatRef.relative_path || undefined : undefined,
    chatRef,
  };
};

/**
 * 剥离 Windows 扩展长度路径前缀（`\\?\C:\DEV` → `C:\DEV`，`\\?\UNC\srv\share` → `\\srv\share`）
 * Strip the Windows extended-length (verbatim) prefix. Older backend builds
 * canonicalized picker paths into this form, which breaks agent spawning and
 * splits one directory into two project-list entries (issue #3191).
 */
export const stripWindowsVerbatimPrefix = (path: string): string => {
  if (path.startsWith('\\\\?\\UNC\\')) {
    return '\\\\' + path.slice('\\\\?\\UNC\\'.length);
  }
  if (path.startsWith('\\\\?\\')) {
    return path.slice('\\\\?\\'.length);
  }
  return path;
};

/**
 * Dedup key for a selection item. Project Explorer items are keyed by their pe
 * identity (`chatRef`) so the same `relative_path` under different pes stays
 * distinct and never collides with an upload sharing that path string; uploads
 * and `@` mentions key by their absolute path.
 */
const getItemPath = (item: FileSelectionItem): string | undefined => {
  if (typeof item === 'string') {
    return item;
  }
  if (item.chatRef?.kind === 'project') {
    return `project\0${item.chatRef.pe_id}\0${item.chatRef.relative_path}`;
  }
  return item.path;
};

/**
 * 合并工作空间文件/文件夹选择，去重并保留元数据
 * Merge workspace selections while deduplicating and keeping richer metadata when available
 */
export const mergeFileSelectionItems = (
  current: FileSelectionItem[],
  additions: FileSelectionItem[]
): FileSelectionItem[] => {
  if (!Array.isArray(additions) || additions.length === 0) {
    return current;
  }

  const result = [...current];
  const pathToIndex = new Map<string, number>();
  for (let i = 0; i < current.length; i += 1) {
    const path = getItemPath(current[i]);
    if (path) {
      pathToIndex.set(path, i);
    }
  }

  let changed = false;

  additions.forEach((item) => {
    if (!item) return;
    const path = getItemPath(item);
    if (!path) return;

    if (pathToIndex.has(path)) {
      const idx = pathToIndex.get(path)!;
      const existing = result[idx];
      if (typeof existing === 'string' && typeof item !== 'string') {
        result[idx] = item;
        changed = true;
      }
      return;
    }

    pathToIndex.set(path, result.length);
    result.push(item);
    changed = true;
  });

  return changed ? result : current;
};
