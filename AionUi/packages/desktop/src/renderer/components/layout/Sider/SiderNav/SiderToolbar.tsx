/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Tooltip } from '@arco-design/web-react';
import { ListCheckbox, Plus } from '@icon-park/react';
import classNames from 'classnames';
import type { SiderTooltipProps } from '@renderer/utils/ui/siderTooltip';
import styles from '../Sider.module.css';

interface SiderToolbarProps {
  isMobile: boolean;
  isBatchMode: boolean;
  collapsed: boolean;
  siderTooltipProps: SiderTooltipProps;
  onNewChat: () => void;
  onToggleBatchMode: () => void;
}

const SiderToolbar: React.FC<SiderToolbarProps> = ({
  isMobile,
  isBatchMode,
  collapsed,
  siderTooltipProps,
  onNewChat,
  onToggleBatchMode,
}) => {
  const { t } = useTranslation();

  if (collapsed) {
    return (
      <div className='shrink-0 flex flex-col items-center gap-2px w-full'>
        <Tooltip {...siderTooltipProps} content={t('conversation.welcome.newConversation')} position='right'>
          <Button
            type='default'
            aria-label={t('conversation.welcome.newConversation')}
            className={classNames(styles.navEntry, styles.collapsedNav, styles.newChatTrigger)}
            onClick={onNewChat}
          >
            <span className={styles.navIcon}>
              <Plus
                theme='outline'
                size='16'
                fill='currentColor'
                className={classNames('block leading-none', styles.newChatIcon)}
                style={{ lineHeight: 0 }}
              />
            </span>
          </Button>
        </Tooltip>
      </div>
    );
  }

  return (
    <div className='shrink-0 flex items-center gap-8px'>
      <Tooltip {...siderTooltipProps} content={t('conversation.welcome.newConversation')} position='right'>
        <Button
          type='default'
          aria-label={t('conversation.welcome.newConversation')}
          className={classNames(
            styles.newChatTrigger,
            styles.navEntry,
            'flex-1 min-w-0',
            isMobile && 'sider-action-btn-mobile'
          )}
          onClick={onNewChat}
        >
          <span className={styles.navIcon}>
            <Plus
              theme='outline'
              size='16'
              fill='currentColor'
              className={classNames('block leading-none', styles.newChatIcon)}
              style={{ lineHeight: 0 }}
            />
          </span>
          <span className={classNames(styles.navLabel, 'collapsed-hidden')}>
            {t('conversation.welcome.newConversation')}
          </span>
        </Button>
      </Tooltip>
      <Tooltip
        {...siderTooltipProps}
        content={isBatchMode ? t('conversation.history.batchModeExit') : t('conversation.history.batchManage')}
        position='right'
      >
        <Button
          type='default'
          aria-label={isBatchMode ? t('conversation.history.batchModeExit') : t('conversation.history.batchManage')}
          aria-pressed={isBatchMode}
          className={classNames(styles.navEntry, styles.iconButton, isMobile && 'sider-action-icon-btn-mobile', {
            [styles.activeNav]: isBatchMode,
          })}
          onClick={onToggleBatchMode}
        >
          <span className={styles.navIcon}>
            <ListCheckbox theme='outline' size='16' fill='currentColor' className='block leading-none' />
          </span>
        </Button>
      </Tooltip>
    </div>
  );
};

export default SiderToolbar;
