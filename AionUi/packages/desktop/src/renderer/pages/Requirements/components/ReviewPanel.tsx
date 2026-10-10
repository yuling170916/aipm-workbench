import React, { useState } from 'react';
import { Alert, Button, Empty, Input, Message, Modal, Tag } from '@arco-design/web-react';
import { CheckOne, Inspection, Refresh, Robot } from '@icon-park/react';
import { useTranslation } from 'react-i18next';
import type { RequirementCheck, RequirementDetail, RequirementIssue } from '../types';
import { confirmationBlockers } from '../utils/requirementUtils';
import styles from '../Requirements.module.css';

type Resolution = { check: RequirementCheck; issue: RequirementIssue; status: 'resolved' | 'accepted' };
type Props = {
  detail: RequirementDetail;
  dirty: boolean;
  busy: boolean;
  aiAvailable: boolean;
  modelPicker: React.ReactNode;
  onRules: () => void;
  onAi: () => void;
  onConfirm: () => void;
  onIssue: (
    check: RequirementCheck,
    issue: RequirementIssue,
    status: RequirementIssue['status'],
    reason: string
  ) => Promise<boolean>;
};

export default function ReviewPanel({
  detail,
  dirty,
  busy,
  aiAvailable,
  modelPicker,
  onRules,
  onAi,
  onConfirm,
  onIssue,
}: Props): React.ReactElement {
  const { t } = useTranslation();
  const [resolution, setResolution] = useState<Resolution | null>(null);
  const [reason, setReason] = useState('');
  const blockers = confirmationBlockers(detail, dirty);
  const checks = detail.checks.toReversed();
  const resolve = async (): Promise<void> => {
    if (!resolution || !reason.trim()) {
      Message.warning(t('common.requirements.resolutionRequired'));
      return;
    }
    if (await onIssue(resolution.check, resolution.issue, resolution.status, reason.trim())) {
      setResolution(null);
      setReason('');
    }
  };
  return (
    <section className={styles.panel}>
      <div className={styles.reviewActions}>
        <Button icon={<Inspection />} disabled={busy || dirty || detail.card.status === 'archived'} onClick={onRules}>
          {t('common.requirements.reviewRules')}
        </Button>
        {modelPicker}
        <Button
          icon={<Robot />}
          disabled={busy || dirty || !aiAvailable || detail.card.status === 'archived'}
          onClick={onAi}
        >
          {t('common.requirements.reviewAi')}
        </Button>
      </div>
      <p className={styles.help}>{t('common.requirements.resolveHint')}</p>
      {dirty && <Alert type='warning' content={t('common.requirements.blockers.unsaved')} />}
      {!checks.length && <Empty className={styles.panelEmpty} description={t('common.requirements.checkEmpty')} />}
      {checks.map((check) => {
        const stale =
          check.based_on_revision !== detail.card.revision ||
          checks.find((item) => item.kind === check.kind)?.id !== check.id;
        return (
          <article className={styles.checkCard} key={check.id} data-stale={stale}>
            <div className={styles.sectionHeader}>
              <h3>
                {check.kind === 'rules' ? t('common.requirements.reviewRules') : t('common.requirements.reviewAi')}
              </h3>
              <Tag color={stale ? 'gray' : 'blue'}>
                {stale
                  ? t('common.requirements.staleCheck')
                  : t('common.requirements.currentRevision', { revision: check.based_on_revision })}
              </Tag>
            </div>
            {check.summary && <p className={styles.help}>{check.summary}</p>}
            {!check.issues.length && <p>{t('common.requirements.noIssues')}</p>}
            {check.issues.map((issue) => (
              <div className={styles.issue} key={issue.id}>
                <div className={styles.row}>
                  <Tag color={issue.severity === 'blocking' ? 'red' : issue.severity === 'warning' ? 'orange' : 'blue'}>
                    {t(`common.requirements.severity.${issue.severity}`)}
                  </Tag>
                  <Tag>{t(`common.requirements.issueStatus.${issue.status}`)}</Tag>
                  {issue.field && (
                    <span className={styles.help}>
                      {issue.field in detail.card.content
                        ? t(`common.requirements.fields.${issue.field}` as 'common.requirements.fields.title')
                        : issue.field === 'sources'
                          ? t('common.requirements.sources')
                          : issue.field === 'questions'
                            ? t('common.requirements.questions')
                            : t('common.requirements.review')}
                    </span>
                  )}
                </div>
                <p>{issue.message}</p>
                {issue.suggestion && <p className={styles.suggestion}>{issue.suggestion}</p>}
                {issue.resolution && <blockquote className={styles.resolution}>{issue.resolution}</blockquote>}
                <div className={styles.row}>
                  {issue.status === 'open' ? (
                    <>
                      <Button
                        size='small'
                        icon={<CheckOne />}
                        disabled={busy || dirty || stale}
                        onClick={() => {
                          setResolution({ check, issue, status: 'resolved' });
                          setReason('');
                        }}
                      >
                        {t('common.requirements.resolve')}
                      </Button>
                      <Button
                        size='small'
                        type='text'
                        disabled={busy || dirty || stale}
                        onClick={() => {
                          setResolution({ check, issue, status: 'accepted' });
                          setReason('');
                        }}
                      >
                        {t('common.requirements.accept')}
                      </Button>
                    </>
                  ) : (
                    <Button
                      size='small'
                      type='text'
                      icon={<Refresh />}
                      disabled={busy || dirty || stale}
                      onClick={() => void onIssue(check, issue, 'open', '')}
                    >
                      {t('common.requirements.reopen')}
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </article>
        );
      })}
      <div className={styles.confirmCard}>
        {blockers.length > 0 && (
          <>
            <h3>{t('common.requirements.confirmBlocked')}</h3>
            <ul>
              {blockers.map((blocker) => (
                <li key={blocker}>
                  {t(`common.requirements.blockers.${blocker}` as 'common.requirements.blockers.unsaved')}
                </li>
              ))}
            </ul>
          </>
        )}
        <p className={styles.help}>{t('common.requirements.statusNote')}</p>
        <Button
          type='primary'
          icon={<CheckOne />}
          disabled={busy || blockers.length > 0 || detail.card.status === 'confirmed'}
          onClick={onConfirm}
        >
          {detail.card.status === 'confirmed' ? t('common.requirements.confirmed') : t('common.requirements.confirm')}
        </Button>
      </div>
      <Modal
        title={resolution?.status === 'accepted' ? t('common.requirements.accept') : t('common.requirements.resolve')}
        visible={Boolean(resolution)}
        onCancel={() => {
          if (!busy) setResolution(null);
        }}
        onOk={() => void resolve()}
        confirmLoading={busy}
        okButtonProps={{ disabled: !reason.trim() }}
        okText={t('common.save')}
        cancelText={t('common.cancel')}
      >
        <Input.TextArea
          aria-label={t('common.requirements.resolution')}
          value={reason}
          onChange={setReason}
          autoSize={{ minRows: 4, maxRows: 10 }}
          placeholder={t('common.requirements.resolution')}
          disabled={busy}
          maxLength={10000}
        />
      </Modal>
    </section>
  );
}
