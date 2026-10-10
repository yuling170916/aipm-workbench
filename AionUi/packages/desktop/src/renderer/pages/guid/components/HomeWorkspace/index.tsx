import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Button, Spin } from '@arco-design/web-react';
import { CheckCorrect, DocDetail, EditTwo, FolderOpen, Refresh, Right } from '@icon-park/react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import * as ipcBridge from '@/common/adapter/ipcBridge';
import type { SidebarResponse } from '@/common/types/sidebar';
import styles from './HomeWorkspace.module.css';

export type HomeWorkflow = 'organize' | 'prd' | 'review';

type Props = { onStartWorkflow: (kind: HomeWorkflow) => void };
type RecentProject = { id: string; name: string; workspace?: string; updatedAt?: number };

const WORKFLOWS = [
  { kind: 'organize', title: 'guid.home.organizeTitle', description: 'guid.home.organizeDescription', icon: DocDetail },
  { kind: 'prd', title: 'guid.home.prdTitle', description: 'guid.home.prdDescription', icon: EditTwo },
  { kind: 'review', title: 'guid.home.reviewTitle', description: 'guid.home.reviewDescription', icon: CheckCorrect },
] as const;

function recentProjects(response: SidebarResponse): RecentProject[] {
  return response.groups
    .flatMap((group) => {
      if (group.scope.type !== 'project') return [];
      const updatedAt = Math.max(
        0,
        ...group.items
          .map((item) => (item.type === 'conversation' ? item.conversation.modified_at : item.updated_at))
          .filter((time) => Number.isFinite(time) && time > 0 && time <= 8_640_000_000_000_000)
      );
      return [
        {
          id: group.scope.project_id,
          name: group.scope.name,
          workspace: group.scope.workspace ?? undefined,
          ...(updatedAt ? { updatedAt } : {}),
        },
      ];
    })
    .toSorted((left, right) => (right.updatedAt ?? 0) - (left.updatedAt ?? 0))
    .slice(0, 3);
}

/** Home shortcuts and recent projects from the existing sidebar read model. */
export default function HomeWorkspace({ onStartWorkflow }: Props): React.ReactElement {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const [projects, setProjects] = useState<RecentProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const request = useRef(0);
  const load = useCallback(async (): Promise<void> => {
    const current = ++request.current;
    setLoading(true);
    setFailed(false);
    try {
      const response = await ipcBridge.sidebar.get.invoke({ limit: 1 });
      if (current === request.current) setProjects(recentProjects(response));
    } catch {
      if (current === request.current) setFailed(true);
    } finally {
      if (current === request.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    return () => {
      request.current++;
    };
  }, [load, location.key]);

  useEffect(() => {
    const onFocus = (): void => {
      void load();
    };
    const onVisible = (): void => {
      if (document.visibilityState === 'visible') void load();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [load]);

  return (
    <div className={styles.workspace}>
      <section className={styles.workflows}>
        {WORKFLOWS.map(({ kind, title, description, icon: Icon }) => (
          <Button key={kind} type='default' className={styles.workflowCard} onClick={() => onStartWorkflow(kind)}>
            <span className={styles.workflowIcon} aria-hidden='true'>
              <Icon theme='outline' size={16} fill='currentColor' strokeWidth={2} />
            </span>
            <span className={styles.workflowText}>
              <strong>{t(title)}</strong>
              <span>{t(description)}</span>
            </span>
            <Right className={styles.arrow} aria-hidden='true' />
          </Button>
        ))}
      </section>
      <section className={styles.recent} aria-labelledby='home-recent-projects-title'>
        <div className={styles.recentHeader}>
          <h2 id='home-recent-projects-title'>{t('guid.home.recentTitle')}</h2>
          <Button type='default' size='small' icon={<Refresh />} loading={loading} onClick={() => void load()}>
            {t('guid.home.refreshProjects')}
          </Button>
        </div>
        {loading && projects.length === 0 ? (
          <div className={styles.projectState} role='status'>
            <Spin size={18} />
            <span>{t('guid.home.projectsLoading')}</span>
          </div>
        ) : failed ? (
          <Alert
            className={styles.projectError}
            type='error'
            content={t('guid.home.projectsError')}
            action={
              <Button size='small' onClick={() => void load()}>
                {t('guid.home.retry')}
              </Button>
            }
          />
        ) : projects.length === 0 ? (
          <div className={styles.projectState}>
            <FolderOpen className={styles.emptyIcon} aria-hidden='true' />
            <p>{t('guid.home.projectsEmpty')}</p>
            <Button type='outline' onClick={() => void navigate('/requirements')}>
              {t('guid.home.createProject')}
            </Button>
          </div>
        ) : (
          <div className={styles.projects} aria-busy={loading}>
            {projects.map((project) => (
              <Button
                key={project.id}
                type='default'
                className={styles.projectCard}
                aria-label={project.name}
                onClick={() => void navigate(`/projects/${encodeURIComponent(project.id)}/requirements`)}
              >
                <FolderOpen
                  className={styles.projectIcon}
                  theme='outline'
                  size={16}
                  fill='currentColor'
                  aria-hidden='true'
                />
                <span className={styles.projectText}>
                  <strong>{project.name}</strong>
                  <span className={styles.projectDescription} title={project.workspace}>
                    {project.workspace
                      ? t('guid.home.projectWorkspace', { path: project.workspace })
                      : !project.updatedAt && t('guid.home.projectNoActivity')}
                  </span>
                  {project.updatedAt && (
                    <span className={styles.projectTime}>
                      {t('guid.home.updatedAt', {
                        time: new Intl.DateTimeFormat(i18n.language, {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        }).format(project.updatedAt),
                      })}
                    </span>
                  )}
                </span>
                <Right className={styles.arrow} aria-hidden='true' />
              </Button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
