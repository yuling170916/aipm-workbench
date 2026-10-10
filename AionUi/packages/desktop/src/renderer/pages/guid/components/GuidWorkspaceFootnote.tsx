/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { addRecentWorkspace, getRecentWorkspaces } from '@/renderer/components/workspace';
import { AionInlineSearchInput } from '@/renderer/components/base';
import { Button, Tooltip } from '@arco-design/web-react';
import { CheckCorrect, Close, Down, FolderClose, FolderOpen, Plus } from '@icon-park/react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import styles from '../index.module.css';

type GuidWorkspaceFootnoteProps = {
  workspaceDir: string;
  onSelectWorkspace: (dir: string) => void;
  onClearWorkspace: () => void;
};

const GuidWorkspaceFootnote: React.FC<GuidWorkspaceFootnoteProps> = ({
  workspaceDir,
  onSelectWorkspace,
  onClearWorkspace,
}) => {
  const { t } = useTranslation();
  const recentWorkspaces = getRecentWorkspaces();
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const handleBrowseWorkspace = useCallback(() => {
    setOpen(false);
    ipcBridge.dialog.showOpen
      .invoke({ properties: ['openDirectory', 'createDirectory'] })
      .then((dirs) => {
        if (dirs && dirs[0]) {
          addRecentWorkspace(dirs[0]);
          onSelectWorkspace(dirs[0]);
        }
      })
      .catch((error) => {
        console.error('Failed to open directory dialog:', error);
      });
  }, [onSelectWorkspace]);

  const handleSelectPath = useCallback(
    (path: string) => {
      addRecentWorkspace(path);
      onSelectWorkspace(path);
      setOpen(false);
      setSearchQuery('');
    },
    [onSelectWorkspace]
  );

  const openDropdown = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    // position above the trigger, aligned to left edge
    setDropdownStyle({
      position: 'fixed',
      left: rect.left,
      bottom: window.innerHeight - rect.top + 6,
      minWidth: 230,
      zIndex: 9999,
    });
    setOpen(true);
    setTimeout(() => searchRef.current?.focus(), 50);
  }, []);

  const closeDropdown = useCallback(() => {
    setOpen(false);
    setSearchQuery('');
  }, []);

  const toggleOpen = useCallback(() => {
    if (open) closeDropdown();
    else openDropdown();
  }, [open, openDropdown, closeDropdown]);

  // close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        triggerRef.current &&
        !triggerRef.current.contains(target) &&
        dropdownRef.current &&
        !dropdownRef.current.contains(target)
      ) {
        closeDropdown();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, closeDropdown]);

  const filteredRecent = recentWorkspaces.filter((p) => {
    if (!searchQuery) return true;
    const name = p.split(/[\\/]/).pop() || p;
    return (
      name.toLowerCase().includes(searchQuery.toLowerCase()) || p.toLowerCase().includes(searchQuery.toLowerCase())
    );
  });

  const workspaceName = workspaceDir ? workspaceDir.split(/[\\/]/).pop() || workspaceDir : '';

  const dropdownEl = open
    ? createPortal(
        <div ref={dropdownRef} className={styles.wsDropdown} style={dropdownStyle}>
          <div className='mb-8px'>
            <AionInlineSearchInput
              className='w-full'
              ref={searchRef}
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder={t('guid.workspace.searchPlaceholder')}
            />
          </div>

          {filteredRecent.map((path) => {
            const name = path.split(/[\\/]/).pop() || path;
            const isActive = path === workspaceDir;
            return (
              <Button
                type={isActive ? 'primary' : 'default'}
                aria-pressed={isActive}
                key={path}
                className={`${styles.wsDropdownItem} ${isActive ? styles.wsDropdownItemActive : ''}`}
                onClick={() => handleSelectPath(path)}
              >
                <FolderOpen theme='outline' size='16' fill='currentColor' className={styles.controlIcon} />
                <span className={styles.wsDropdownItemName}>{name}</span>
                {isActive && (
                  <CheckCorrect theme='outline' size='16' fill='currentColor' className={styles.controlIcon} />
                )}
              </Button>
            );
          })}

          {filteredRecent.length > 0 && <div className={styles.wsDropdownSep} />}

          <Button type='default' className={styles.wsDropdownItem} onClick={handleBrowseWorkspace}>
            <Plus theme='outline' size='16' fill='currentColor' className={styles.controlIcon} />
            <span>{t('team.create.chooseDifferentFolder')}</span>
          </Button>

          <>
            <div className={styles.wsDropdownSep} />
            <Button
              type='default'
              className={styles.wsDropdownItem}
              disabled={!workspaceDir}
              onClick={() => {
                if (workspaceDir) onClearWorkspace();
                closeDropdown();
              }}
            >
              <FolderClose theme='outline' size='16' fill='currentColor' className={styles.controlIcon} />
              <span>{t('guid.workspace.noProject')}</span>
            </Button>
          </>
        </div>,
        document.body
      )
    : null;

  return (
    <div className={styles.workspaceFootnote}>
      {workspaceDir ? (
        <>
          <Tooltip content={workspaceDir} position='top'>
            <div className={styles.workspacePill}>
              <Button
                type='primary'
                ref={triggerRef}
                className={styles.workspacePillMain}
                onClick={toggleOpen}
                aria-expanded={open}
              >
                <FolderOpen theme='outline' size='16' fill='currentColor' className={styles.controlIcon} />
                <span className={styles.workspacePillName}>{workspaceName}</span>
                <Down theme='outline' size='16' fill='currentColor' className={styles.controlIcon} />
              </Button>
              <Button
                type='default'
                aria-label={t('guid.workspace.clearWorkspace')}
                className={styles.workspacePillClose}
                onClick={(e) => {
                  e.stopPropagation();
                  onClearWorkspace();
                }}
              >
                <Close theme='outline' size='16' fill='currentColor' />
              </Button>
            </div>
          </Tooltip>
          {dropdownEl}
        </>
      ) : (
        <>
          <Button
            type='default'
            ref={triggerRef}
            className={styles.workspaceEmptyBtn}
            data-testid='workspace-selector-btn'
            onClick={recentWorkspaces.length > 0 ? toggleOpen : handleBrowseWorkspace}
            aria-expanded={open}
          >
            <FolderOpen theme='outline' size='16' fill='currentColor' className={styles.controlIcon} />
            <span>{t('guid.workspace.workInProject')}</span>
            {recentWorkspaces.length > 0 && (
              <Down theme='outline' size='16' fill='currentColor' className={styles.controlIcon} />
            )}
          </Button>
          {dropdownEl}
        </>
      )}
    </div>
  );
};

export default GuidWorkspaceFootnote;
