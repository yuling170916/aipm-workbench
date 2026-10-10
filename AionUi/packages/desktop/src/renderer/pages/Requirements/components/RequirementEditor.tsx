import React from 'react';
import { Alert, Button, Checkbox, Form, Input, Select, Tag } from '@arco-design/web-react';
import { Add, Delete, LinkOne } from '@icon-park/react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { CONTENT_FIELDS } from '../types';
import type { RequirementDraft, RequirementSource } from '../types';
import styles from '../Requirements.module.css';

type Props = { value: RequirementDraft; onChange: (draft: RequirementDraft) => void; disabled: boolean };

export default function RequirementEditor({ value, onChange, disabled }: Props): React.ReactElement {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const updateSource = (id: string, updates: Partial<RequirementSource>): void =>
    onChange({
      ...value,
      sources: value.sources.map((source) => (source.id === id ? { ...source, ...updates } : source)),
    });
  return (
    <div className={styles.editor}>
      <p className={styles.help}>{t('common.requirements.fieldHint')}</p>
      <Form layout='vertical' className={styles.fields}>
        {CONTENT_FIELDS.map((field) => (
          <Form.Item
            key={field}
            label={t(`common.requirements.fields.${field}`)}
            required={field !== 'exceptions' && field !== 'priority'}
            className={field === 'title' || field === 'acceptance' || field === 'scope' ? styles.fullWidth : undefined}
          >
            {field === 'title' || field === 'priority' ? (
              <Input
                aria-label={t(`common.requirements.fields.${field}`)}
                disabled={disabled}
                value={value.content[field] ?? ''}
                maxLength={field === 'title' ? 200 : 100}
                onChange={(text) => onChange({ ...value, content: { ...value.content, [field]: text } })}
              />
            ) : (
              <Input.TextArea
                aria-label={t(`common.requirements.fields.${field}`)}
                disabled={disabled}
                value={value.content[field]}
                autoSize={{ minRows: 3, maxRows: 12 }}
                maxLength={20000}
                onChange={(text) => onChange({ ...value, content: { ...value.content, [field]: text } })}
              />
            )}
          </Form.Item>
        ))}
      </Form>
      <section className={styles.section} aria-label={t('common.requirements.sources')}>
        <div className={styles.sectionHeader}>
          <h3>{t('common.requirements.sources')}</h3>
          <Button
            size='small'
            type='text'
            icon={<Add />}
            disabled={disabled}
            onClick={() =>
              onChange({
                ...value,
                sources: [
                  ...value.sources,
                  {
                    id: crypto.randomUUID(),
                    kind: 'user',
                    label: t('common.requirements.sourceKinds.user'),
                    excerpt: '',
                    fields: [],
                  },
                ],
              })
            }
          >
            {t('common.requirements.addSource')}
          </Button>
        </div>
        {value.sources.some((source) => source.kind === 'ai') && (
          <Alert type='warning' content={t('common.requirements.sourceWarning')} />
        )}
        {value.sources.map((source) => (
          <div className={styles.sourceCard} key={source.id}>
            <div className={styles.row}>
              <Select
                aria-label={t('common.requirements.sources')}
                disabled={disabled}
                value={source.kind}
                options={(['conversation', 'file', 'user', 'ai'] as const)
                  .filter((kind) => kind !== 'conversation' || Boolean(source.conversation_id))
                  .map((kind) => ({ value: kind, label: t(`common.requirements.sourceKinds.${kind}`) }))}
                onChange={(kind: RequirementSource['kind']) => updateSource(source.id, { kind })}
                className={styles.sourceKind}
              />
              <Input
                aria-label={t('common.requirements.sourceLabel')}
                disabled={disabled}
                value={source.label}
                placeholder={t('common.requirements.sourceLabel')}
                onChange={(label) => updateSource(source.id, { label })}
                maxLength={500}
              />
              <Button
                size='small'
                type='text'
                aria-label={t('common.requirements.remove')}
                icon={<Delete />}
                disabled={disabled}
                onClick={() => onChange({ ...value, sources: value.sources.filter((item) => item.id !== source.id) })}
              />
            </div>
            <Input.TextArea
              aria-label={t('common.requirements.sourceExcerpt')}
              value={source.excerpt}
              disabled={disabled}
              autoSize={{ minRows: 2, maxRows: 6 }}
              placeholder={t('common.requirements.sourceExcerpt')}
              maxLength={20000}
              onChange={(excerpt) => updateSource(source.id, { excerpt })}
            />
            {source.kind === 'file' && (
              <Input
                aria-label={t('common.requirements.sourcePath')}
                disabled={disabled}
                value={source.path ?? ''}
                placeholder={t('common.requirements.sourcePath')}
                onChange={(path) => updateSource(source.id, { path })}
              />
            )}
            <Select
              mode='multiple'
              aria-label={t('common.requirements.relatedFields')}
              disabled={disabled}
              value={source.fields ?? []}
              placeholder={t('common.requirements.relatedFields')}
              options={CONTENT_FIELDS.map((field) => ({
                value: field,
                label: t(`common.requirements.fields.${field}`),
              }))}
              onChange={(fields: string[]) => updateSource(source.id, { fields })}
            />
            {source.conversation_id && (
              <Button
                size='mini'
                type='text'
                icon={<LinkOne />}
                onClick={() => void navigate(`/conversation/${encodeURIComponent(source.conversation_id!)}`)}
              >
                {t('common.requirements.viewConversation')}
              </Button>
            )}
          </div>
        ))}
      </section>
      <section className={styles.section} aria-label={t('common.requirements.questions')}>
        <div className={styles.sectionHeader}>
          <h3>{t('common.requirements.questions')}</h3>
          <Button
            size='small'
            type='text'
            icon={<Add />}
            disabled={disabled}
            onClick={() =>
              onChange({
                ...value,
                questions: [...value.questions, { id: crypto.randomUUID(), text: '', answer: '', resolved: false }],
              })
            }
          >
            {t('common.requirements.addQuestion')}
          </Button>
        </div>
        {value.questions.map((question) => (
          <div
            className={`${styles.sourceCard} ${styles.questionCard}`}
            key={question.id}
            data-resolved={question.resolved}
          >
            <div className={styles.row}>
              <Input
                aria-label={t('common.requirements.questionText')}
                disabled={disabled}
                value={question.text}
                placeholder={t('common.requirements.questionText')}
                onChange={(text) =>
                  onChange({
                    ...value,
                    questions: value.questions.map((item) => (item.id === question.id ? { ...item, text } : item)),
                  })
                }
              />
              <Tag color={question.resolved ? 'green' : 'orange'}>
                {question.resolved
                  ? t('common.requirements.answered')
                  : t('common.requirements.pendingCount', { count: 1 })}
              </Tag>
              <Button
                type='text'
                size='small'
                aria-label={t('common.requirements.remove')}
                icon={<Delete />}
                disabled={disabled}
                onClick={() =>
                  onChange({ ...value, questions: value.questions.filter((item) => item.id !== question.id) })
                }
              />
            </div>
            <Input.TextArea
              aria-label={t('common.requirements.questionAnswer')}
              disabled={disabled}
              value={question.answer}
              placeholder={t('common.requirements.questionAnswer')}
              autoSize={{ minRows: 2, maxRows: 6 }}
              onChange={(answer) =>
                onChange({
                  ...value,
                  questions: value.questions.map((item) =>
                    item.id === question.id
                      ? { ...item, answer, resolved: item.resolved && Boolean(answer.trim()) }
                      : item
                  ),
                })
              }
            />
            <Checkbox
              disabled={disabled || !question.answer.trim()}
              checked={question.resolved}
              onChange={(resolved) =>
                onChange({
                  ...value,
                  questions: value.questions.map((item) => (item.id === question.id ? { ...item, resolved } : item)),
                })
              }
            >
              {t('common.requirements.answered')}
            </Checkbox>
          </div>
        ))}
      </section>
    </div>
  );
}
