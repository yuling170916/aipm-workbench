import React, { useState } from 'react';
import { Empty, Select, Tag } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';
import type { RequirementVersion } from '../types';
import { compareRequirementVersions } from '../utils/requirementUtils';
import styles from '../Requirements.module.css';

export default function HistoryPanel({ versions }: { versions: RequirementVersion[] }): React.ReactElement {
  const { t, i18n } = useTranslation();
  const sorted = versions.toSorted((a, b) => b.revision - a.revision);
  const [leftId, setLeftId] = useState('');
  const [rightId, setRightId] = useState('');
  if (!sorted.length) return <Empty className={styles.panelEmpty} description={t('common.requirements.noHistory')} />;
  const right = sorted.find((version) => version.id === rightId) ?? sorted[0]!;
  const left = sorted.find((version) => version.id === leftId) ?? sorted[1] ?? right;
  const differences = compareRequirementVersions(left, right);
  const options = sorted.map((version) => ({
    value: version.id,
    label: t('common.requirements.currentRevision', { revision: version.revision }),
  }));
  return (
    <section className={styles.panel}>
      <div className={`${styles.row} ${styles.compareToolbar}`}>
        <Select aria-label={t('common.requirements.before')} value={left.id} options={options} onChange={setLeftId} />
        <span className={styles.help}>→</span>
        <Select aria-label={t('common.requirements.after')} value={right.id} options={options} onChange={setRightId} />
      </div>
      {differences.length === 0 ? (
        <Empty className={styles.panelEmpty} description={t('common.requirements.noDiff')} />
      ) : (
        differences.map((change) => (
          <article className={styles.diffCard} key={change.field}>
            <h3>
              {change.field === 'sources' || change.field === 'questions'
                ? t(`common.requirements.${change.field}`)
                : t(`common.requirements.fields.${change.field}`)}
            </h3>
            <div className={styles.diffColumns}>
              <div>
                <Tag>{t('common.requirements.currentRevision', { revision: left.revision })}</Tag>
                <pre>{change.before || t('common.requirements.missing')}</pre>
              </div>
              <div>
                <Tag color='green'>{t('common.requirements.currentRevision', { revision: right.revision })}</Tag>
                <pre>{change.after || t('common.requirements.missing')}</pre>
              </div>
            </div>
          </article>
        ))
      )}
      <div className={styles.versionTimeline}>
        {sorted.map((version) => (
          <div className={styles.row} key={version.id}>
            <Tag>{t('common.requirements.currentRevision', { revision: version.revision })}</Tag>
            <span className={styles.help}>
              {t('common.requirements.versionTime', {
                time: new Date(version.created_at).toLocaleString(i18n.language),
              })}
            </span>
            <span className={styles.truncate}>{version.snapshot.content.title}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
