/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Tooltip } from '@arco-design/web-react';
import { AlarmClock } from '@icon-park/react';
import classNames from 'classnames';
import type { SiderTooltipProps } from '@renderer/utils/ui/siderTooltip';
import styles from '../Sider.module.css';

interface SiderScheduledEntryProps {
  isMobile: boolean;
  isActive: boolean;
  collapsed: boolean;
  siderTooltipProps: SiderTooltipProps;
  onClick: () => void;
}

const SiderScheduledEntry: React.FC<SiderScheduledEntryProps> = ({
  isMobile,
  isActive,
  collapsed,
  siderTooltipProps,
  onClick,
}) => {
  const { t } = useTranslation();

  return (
    <Tooltip {...siderTooltipProps} content={t('cron.scheduledTasks')} position='right'>
      <Button
        type='default'
        aria-label={t('cron.scheduledTasks')}
        aria-current={isActive ? 'page' : undefined}
        className={classNames(styles.navEntry, isMobile && 'sider-action-btn-mobile', {
          [styles.activeNav]: isActive,
          [styles.collapsedNav]: collapsed,
        })}
        onClick={onClick}
      >
        <span className={styles.navIcon}>
          <AlarmClock
            theme='outline'
            size='16'
            fill='currentColor'
            className='block leading-none'
            style={{ lineHeight: 0 }}
          />
        </span>
        {!collapsed && (
          <span className={classNames(styles.navLabel, 'collapsed-hidden')}>{t('cron.scheduledTasks')}</span>
        )}
      </Button>
    </Tooltip>
  );
};

export default SiderScheduledEntry;
