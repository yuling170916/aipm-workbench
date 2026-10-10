/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { isBackendHttpError } from '@/common/adapter/httpBridge';
import { PROJECT_ERROR_DUPLICATE, PROJECT_ERROR_OVERLAP } from '@/common/types/project';
import { getCurrentProject } from '@/renderer/pages/conversation/explorer/currentProjectStore';
import { resolveFolderSelectionItem } from '@/renderer/utils/file/fileSelection';
import type { FileOrFolderItem } from '@/renderer/utils/file/fileTypes';
import { Message } from '@arco-design/web-react';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { mutate as mutateSWR } from 'swr';

type UseAttachProjectFoldersOptions = {
  onFoldersAdded: (folders: FileOrFolderItem[]) => void;
};

/**
 * Attach host-picked directories to the active project, then expose sendable
 * project-folder refs to the calling send box.
 */
export const useAttachProjectFolders = ({
  onFoldersAdded,
}: UseAttachProjectFoldersOptions): ((folders: string[]) => Promise<void>) => {
  const { t } = useTranslation();

  return useCallback(
    async (folders: string[]) => {
      const projectId = getCurrentProject();
      if (!projectId) {
        Message.error(t('conversation.explorer.attachFailed'));
        return;
      }

      const additions: FileOrFolderItem[] = [];
      for (const folderPath of new Set(folders.filter(Boolean))) {
        try {
          additions.push(
            // Serialize project mutations so overlap checks see folders attached earlier in this selection.
            // eslint-disable-next-line no-await-in-loop
            await resolveFolderSelectionItem(projectId, folderPath, {
              resolveRef: (params) => ipcBridge.project.resolveRef.invoke(params),
              attachFolder: (params) => ipcBridge.project.attachFolder.invoke(params),
            })
          );
        } catch (error) {
          if (isBackendHttpError(error) && error.code === PROJECT_ERROR_DUPLICATE) {
            Message.info(t('conversation.explorer.attachDuplicate'));
          } else if (isBackendHttpError(error) && error.code === PROJECT_ERROR_OVERLAP) {
            Message.warning(t('conversation.explorer.attachOverlap'));
          } else {
            Message.error(t('conversation.explorer.attachFailed'));
          }
        }
      }

      if (additions.length === 0) return;
      onFoldersAdded(additions);
      void mutateSWR(`explorer-project/${projectId}`);
    },
    [onFoldersAdded, t]
  );
};
