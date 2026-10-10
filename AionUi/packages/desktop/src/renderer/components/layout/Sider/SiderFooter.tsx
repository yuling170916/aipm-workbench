/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Tooltip } from '@arco-design/web-react';
import { ArrowCircleLeft, CloseOne, Moon, SettingTwo, SunOne } from '@icon-park/react';
import classNames from 'classnames';
import type { SiderTooltipProps } from '@renderer/utils/ui/siderTooltip';
import styles from './Sider.module.css';

interface SiderFooterProps {
  isMobile: boolean;
  isSettings: boolean;
  collapsed?: boolean;
  theme: string;
  siderTooltipProps: SiderTooltipProps;
  onSettingsClick: () => void;
  onThemeToggle: () => void;
  showLogout?: boolean;
  onLogoutClick?: () => void;
}

const SiderFooter: React.FC<SiderFooterProps> = ({
  isMobile,
  isSettings,
  collapsed = false,
  theme,
  siderTooltipProps,
  onSettingsClick,
  onThemeToggle,
  showLogout = false,
  onLogoutClick,
}) => {
  const { t } = useTranslation();

  const settingsIcon = isSettings ? (
    <ArrowCircleLeft
      theme='outline'
      size='16'
      fill='currentColor'
      className='block leading-none'
      style={{ lineHeight: 0 }}
    />
  ) : (
    <SettingTwo
      theme='outline'
      size='16'
      fill='currentColor'
      className='block leading-none'
      style={{ lineHeight: 0 }}
    />
  );
  const showThemeToggle = isSettings && !collapsed;
  const themeTooltip = theme === 'dark' ? t('settings.lightMode') : t('settings.darkMode');

  return (
    <div className='shrink-0 sider-footer mt-auto pt-8px pb-8px border-t border-solid border-[var(--color-border-2)] border-s-0 border-e-0 border-b-0'>
      <div className={classNames('flex gap-8px', collapsed ? 'flex-col' : 'items-center')}>
        <Tooltip {...siderTooltipProps} content={isSettings ? t('common.back') : t('common.settings')} position='right'>
          <Button
            type='default'
            aria-label={isSettings ? t('common.back') : t('common.settings')}
            onClick={onSettingsClick}
            className={classNames(styles.navEntry, 'flex-1 min-w-0', isMobile && 'sider-footer-btn-mobile', {
              [styles.collapsedNav]: collapsed,
            })}
          >
            <span className={styles.navIcon}>{settingsIcon}</span>
            <span className={classNames('collapsed-hidden', styles.navLabel)}>
              {isSettings ? t('common.back') : t('common.settings')}
            </span>
          </Button>
        </Tooltip>
        {showLogout && onLogoutClick && (
          <Tooltip {...siderTooltipProps} content={t('settings.googleLogout')} position='right'>
            <Button
              type='default'
              aria-label={t('settings.googleLogout')}
              onClick={onLogoutClick}
              className={classNames(
                styles.navEntry,
                'flex-1 min-w-0',
                { [styles.collapsedNav]: collapsed },
                isMobile && 'sider-footer-btn-mobile'
              )}
            >
              <span className={styles.navIcon}>
                <CloseOne
                  theme='outline'
                  size='16'
                  fill='currentColor'
                  className='block leading-none'
                  style={{ lineHeight: 0 }}
                />
              </span>
              <span className={classNames('collapsed-hidden', styles.navLabel)}>{t('settings.googleLogout')}</span>
            </Button>
          </Tooltip>
        )}
        {/* Theme toggle — lightweight icon button, only while inside Settings page (not in collapsed mode) */}
        {showThemeToggle && (
          <Tooltip {...siderTooltipProps} content={themeTooltip} position='right'>
            <Button
              type='default'
              onClick={onThemeToggle}
              data-testid='theme-toggle'
              className={classNames(styles.navEntry, styles.iconButton, isMobile && 'sider-footer-btn-mobile')}
              aria-label={themeTooltip}
            >
              <span className={styles.navIcon}>
                {theme === 'dark' ? (
                  <SunOne theme='outline' size='16' fill='currentColor' className='block leading-none' />
                ) : (
                  <Moon theme='outline' size='16' fill='currentColor' className='block leading-none' />
                )}
              </span>
            </Button>
          </Tooltip>
        )}
      </div>
    </div>
  );
};

export default SiderFooter;
