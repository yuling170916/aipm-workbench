/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { webui } from '@/common/adapter/ipcBridge';
import { Comment, Earth, Star } from '@icon-park/react';
import { Button } from '@arco-design/web-react';
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import styles from '../index.module.css';

type QuickActionButtonsProps = {
  onOpenLink: (url: string) => void;
  onOpenBugReport: () => void;
  inactiveBorderColor: string;
  activeShadow: string;
};

type WebuiQuickStatus = 'checking' | 'running' | 'stopped' | 'error';

const WEBUI_STATUS_CACHE_TTL_MS = 3000;
let webuiStatusCache: {
  quickStatus: WebuiQuickStatus;
  at: number;
} | null = null;

const QuickActionButtons: React.FC<QuickActionButtonsProps> = ({
  onOpenLink,
  onOpenBugReport,
  inactiveBorderColor,
  activeShadow,
}) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [hoveredQuickAction, setHoveredQuickAction] = useState<'bugReport' | 'repo' | 'webui' | null>(null);
  const [webuiQuickStatus, setWebuiQuickStatus] = useState<WebuiQuickStatus>('checking');

  useEffect(() => {
    let alive = true;
    const loadStatus = async () => {
      const now = Date.now();
      if (webuiStatusCache && now - webuiStatusCache.at < WEBUI_STATUS_CACHE_TTL_MS) {
        setWebuiQuickStatus(webuiStatusCache.quickStatus);
        return;
      }

      try {
        const result = await webui.getStatus.invoke();
        if (!alive) return;
        if (result) {
          const quickStatus: WebuiQuickStatus = result.running ? 'running' : 'stopped';
          setWebuiQuickStatus(quickStatus);
          webuiStatusCache = { quickStatus, at: Date.now() };
          return;
        }
        setWebuiQuickStatus('error');
        webuiStatusCache = { quickStatus: 'error', at: Date.now() };
      } catch {
        if (!alive) return;
        setWebuiQuickStatus('error');
        webuiStatusCache = { quickStatus: 'error', at: Date.now() };
      }
    };

    void loadStatus();

    const unsubscribe = webui.statusChanged.on((payload) => {
      const nextQuickStatus: WebuiQuickStatus = payload.running ? 'running' : 'stopped';
      setWebuiQuickStatus(nextQuickStatus);
      webuiStatusCache = { quickStatus: nextQuickStatus, at: Date.now() };
    });

    return () => {
      alive = false;
      unsubscribe();
    };
  }, []);

  const quickActionStyle = useCallback(
    (isActive: boolean) => ({
      borderWidth: '1px',
      borderStyle: 'solid',
      borderColor: inactiveBorderColor,
      boxShadow: isActive ? activeShadow : 'none',
    }),
    [activeShadow, inactiveBorderColor]
  );

  const handleOpenWebUI = useCallback(() => {
    void navigate('/settings/webui');
  }, [navigate]);

  const webuiStatusLabel =
    webuiQuickStatus === 'running'
      ? t('settings.webui.running', { defaultValue: 'Running' })
      : webuiQuickStatus === 'checking'
        ? t('settings.webui.starting', { defaultValue: 'Checking' })
        : webuiQuickStatus === 'error'
          ? t('settings.webui.operationFailed', { defaultValue: 'Unavailable' })
          : t('settings.webui.enable', { defaultValue: 'Start' });
  return (
    <div className={styles.guidQuickActions}>
      <Button
        type='default'
        className={styles.controlButton}
        style={quickActionStyle(hoveredQuickAction === 'bugReport')}
        onMouseEnter={() => setHoveredQuickAction('bugReport')}
        onMouseLeave={() => setHoveredQuickAction(null)}
        icon={<Comment theme='outline' size='16' fill='currentColor' />}
        onClick={onOpenBugReport}
      >
        {t('conversation.welcome.quickActionFeedback')}
      </Button>
      <Button
        type='default'
        className={styles.controlButton}
        style={quickActionStyle(hoveredQuickAction === 'repo')}
        onMouseEnter={() => setHoveredQuickAction('repo')}
        onMouseLeave={() => setHoveredQuickAction(null)}
        icon={<Star theme='outline' size='16' fill='currentColor' />}
        onClick={() => onOpenLink('https://github.com/iOfficeAI/AionUi')}
      >
        {t('conversation.welcome.quickActionStar')}
      </Button>
      <Button
        type='default'
        className={styles.controlButton}
        style={quickActionStyle(hoveredQuickAction === 'webui')}
        onMouseEnter={() => setHoveredQuickAction('webui')}
        onMouseLeave={() => setHoveredQuickAction(null)}
        icon={<Earth theme='outline' size='16' fill='currentColor' />}
        onClick={handleOpenWebUI}
      >
        {t('settings.webui')} · {webuiStatusLabel}
      </Button>
    </div>
  );
};

export default QuickActionButtons;
