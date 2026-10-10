import React, { useState } from 'react';
import { Alert, Button, Empty, Input, Message, Modal, Select, Tag } from '@arco-design/web-react';
import { Add, Delete, LinkOne } from '@icon-park/react';
import { useTranslation } from 'react-i18next';
import type { RequirementLink } from '../types';
import styles from '../Requirements.module.css';

type Props = {
  links: RequirementLink[];
  disabled: boolean;
  onAdd: (link: Pick<RequirementLink, 'kind' | 'label' | 'path'>) => Promise<boolean>;
  onRemove: (link: RequirementLink) => Promise<boolean>;
  onSync: (link: RequirementLink) => Promise<boolean>;
};
export default function DocumentsPanel({ links, disabled, onAdd, onRemove, onSync }: Props): React.ReactElement {
  const { t } = useTranslation();
  const [label, setLabel] = useState('');
  const [path, setPath] = useState('');
  const [kind, setKind] = useState<RequirementLink['kind']>('file');
  const add = async (): Promise<void> => {
    if (!label.trim() || !path.trim()) {
      Message.warning(t('common.requirements.linkRequired'));
      return;
    }
    if (await onAdd({ kind, label: label.trim(), path: path.trim() })) {
      setLabel('');
      setPath('');
    }
  };
  return (
    <section className={styles.panel}>
      <Alert type='info' content={t('common.requirements.linkHint')} />
      <div className={styles.linkForm}>
        <div className={styles.row}>
          <Select
            aria-label={t('common.requirements.documents')}
            value={kind}
            onChange={setKind}
            disabled={disabled}
            options={[
              { value: 'file', label: t('common.requirements.sourceKinds.file') },
              { value: 'document', label: t('common.requirements.documents') },
            ]}
            className={styles.sourceKind}
          />
          <Input
            aria-label={t('common.requirements.linkName')}
            value={label}
            onChange={setLabel}
            placeholder={t('common.requirements.linkName')}
            disabled={disabled}
            maxLength={500}
          />
        </div>
        <Input
          aria-label={t('common.requirements.linkPath')}
          value={path}
          onChange={setPath}
          placeholder={t('common.requirements.linkPath')}
          disabled={disabled}
          maxLength={4000}
        />
        <Button
          icon={<Add />}
          type='outline'
          disabled={disabled || !label.trim() || !path.trim()}
          onClick={() => void add()}
        >
          {t('common.requirements.addLink')}
        </Button>
      </div>
      {!links.length && <Empty className={styles.panelEmpty} description={t('common.requirements.linksEmpty')} />}
      {links.map((link) => (
        <article className={`${styles.sourceCard} ${styles.documentCard}`} key={link.id}>
          <div className={styles.sectionHeader}>
            <h3>
              <LinkOne /> {link.label}
            </h3>
            <Button
              type='text'
              size='small'
              icon={<Delete />}
              aria-label={t('common.requirements.remove')}
              disabled={disabled}
              onClick={() => void onRemove(link)}
            />
          </div>
          <p className={styles.path}>{link.path}</p>
          <div className={styles.sectionHeader}>
            <Tag color={link.needs_review ? 'orange' : 'green'}>
              {link.needs_review
                ? t('common.requirements.needsReview')
                : t('common.requirements.inSync', { revision: link.synced_revision })}
            </Tag>
            <Button
              size='small'
              disabled={disabled || !link.needs_review}
              onClick={() =>
                Modal.confirm({
                  title: t('common.requirements.syncTitle'),
                  content: t('common.requirements.syncBody'),
                  okText: t('common.requirements.markSynced'),
                  cancelText: t('common.cancel'),
                  onOk: async () => {
                    if (!(await onSync(link))) throw new Error('REQUIREMENT_ACTION_FAILED');
                  },
                })
              }
            >
              {t('common.requirements.markSynced')}
            </Button>
          </div>
        </article>
      ))}
    </section>
  );
}
