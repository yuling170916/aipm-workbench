import React, { useState } from 'react';
import { Button, Empty, Input, Select, Spin, Tag } from '@arco-design/web-react';
import { Add, Search } from '@icon-park/react';
import { useTranslation } from 'react-i18next';
import type { RequirementCard, RequirementStatus } from '../types';
import styles from '../Requirements.module.css';

type Props = {
  cards: RequirementCard[];
  selectedId?: string;
  loading: boolean;
  disabled: boolean;
  onSelect: (id: string) => void;
  onNew: () => void;
};
export default function CardsPanel({
  cards,
  selectedId,
  loading,
  disabled,
  onSelect,
  onNew,
}: Props): React.ReactElement {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<RequirementStatus | 'all'>('all');
  const filtered = cards.filter(
    (card) =>
      (status === 'all' || card.status === status) &&
      `${card.content.title} ${card.number}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())
  );
  return (
    <aside className={styles.cardsPanel}>
      <div className={styles.listToolbar}>
        <Button type='primary' long icon={<Add />} onClick={onNew} disabled={disabled}>
          {t('common.requirements.new')}
        </Button>
        <Input
          aria-label={t('common.requirements.search')}
          prefix={<Search />}
          placeholder={t('common.requirements.search')}
          value={query}
          onChange={setQuery}
          allowClear
        />
        <Select
          aria-label={t('common.requirements.allStatuses')}
          value={status}
          onChange={setStatus}
          options={[
            { value: 'all', label: t('common.requirements.allStatuses') },
            ...(['draft', 'review', 'confirmed', 'archived'] as const).map((value) => ({
              value,
              label: t(`common.requirements.statuses.${value}`),
            })),
          ]}
        />
      </div>
      <div className={styles.cardList}>
        {loading ? (
          <div className={styles.empty}>
            <Spin />
          </div>
        ) : filtered.length === 0 ? (
          <div className={styles.empty}>
            <Empty description={t(cards.length ? 'common.requirements.noResults' : 'common.requirements.empty')} />
            {!cards.length && <p className={styles.help}>{t('common.requirements.emptyDescription')}</p>}
          </div>
        ) : (
          filtered.map((card) => (
            <Button
              className={`${styles.cardEntry} ${selectedId === card.id ? styles.cardEntryActive : ''}`}
              key={card.id}
              type='text'
              long
              onClick={() => onSelect(card.id)}
              disabled={disabled}
            >
              <div className={styles.cardMeta}>
                <span>{card.number}</span>
                <Tag
                  size='small'
                  color={card.status === 'confirmed' ? 'green' : card.status === 'review' ? 'orange' : 'gray'}
                >
                  {t(`common.requirements.statuses.${card.status}`)}
                </Tag>
              </div>
              <strong>{card.content.title}</strong>
              <div className={styles.cardMeta}>
                <span>{t('common.requirements.currentRevision', { revision: card.revision })}</span>
                {card.questions.some((question) => !question.resolved) && (
                  <span>
                    {t('common.requirements.pendingCount', {
                      count: card.questions.filter((question) => !question.resolved).length,
                    })}
                  </span>
                )}
              </div>
            </Button>
          ))
        )}
      </div>
    </aside>
  );
}
