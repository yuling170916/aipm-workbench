import React, { useEffect, useRef, useState } from 'react';
import { Alert, Button, Drawer, Empty, Input, Message, Select, Tag, Upload } from '@arco-design/web-react';
import { ChartHistogram, Copy, History, PlayOne, Refresh, SettingConfig, UploadOne } from '@icon-park/react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import Markdown from '@renderer/components/Markdown';
import { loadHistory, loadModels, runComparison, saveRecord } from './client';
import type { BenchModel, BenchRecord, BenchResult } from './types';
import { modelKey } from './types';
import styles from './ModelBench.module.css';

const ModelBench: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [models, setModels] = useState<BenchModel[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [prompt, setPrompt] = useState('');
  const [material, setMaterial] = useState<{ name: string; text: string }>();
  const [results, setResults] = useState<BenchResult[]>([]);
  const [active, setActive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [history, setHistory] = useState<BenchRecord[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reading, setReading] = useState(false);
  const [now, setNow] = useState(Date.now);
  const controls = useRef<AbortController[]>([]);
  const generation = useRef(0);
  const snapshot = useRef({ id: '', created: 0, prompt: '' });
  const activeRef = useRef(false);

  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, [active]);

  const reload = async (): Promise<void> => {
    setLoading(true);
    setError('');
    try {
      setModels(await loadModels());
    } catch {
      setError(t('common.modelBench.loadError'));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void reload();
    return () => {
      generation.current++;
      controls.current.forEach((control) => control.abort());
    };
  }, []);

  const execute = async (targets: BenchModel[], input: string, retryIndex?: number): Promise<void> => {
    if (activeRef.current) return;
    activeRef.current = true;
    setActive(true);
    const current = ++generation.current;
    controls.current = targets.map(() => new AbortController());
    const pending: BenchResult[] = targets.map((target) => ({ target, text: '', status: 'waiting', elapsed: 0 }));
    if (retryIndex === undefined) {
      setResults(pending);
      snapshot.current = { id: crypto.randomUUID(), created: Date.now(), prompt: input };
    }
    await runComparison(
      targets,
      input,
      controls.current.map((control) => control.signal),
      (index, result) => {
        if (generation.current !== current) return;
        setResults((previous) => previous.map((item, i) => (i === (retryIndex ?? index) ? result : item)));
      }
    );
    if (generation.current === current) {
      activeRef.current = false;
      setActive(false);
    }
  };

  const start = (): void => {
    const targets = selected
      .map((key) => models.find((model) => modelKey(model) === key))
      .filter((model): model is BenchModel => Boolean(model));
    const input = material ? `${prompt}\n\n--- ${material.name} ---\n${material.text}` : prompt;
    if (targets.length < 2 || targets.length > 4 || !input.trim() || new Blob([input]).size > 400_000) {
      setError(t('common.modelBench.validation'));
      return;
    }
    setError('');
    void execute(targets, input);
  };

  const upload = async (file: File): Promise<boolean> => {
    if (activeRef.current) return false;
    if (!/\.(txt|md|csv|json)$/i.test(file.name) || file.size > 300_000) {
      Message.error(t('common.modelBench.fileError'));
      return false;
    }
    setReading(true);
    try {
      const text = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer());
      if (text.includes('\u0000')) throw new Error('binary');
      setMaterial({ name: file.name, text });
    } catch {
      Message.error(t('common.modelBench.fileError'));
    } finally {
      setReading(false);
    }
    return false;
  };

  const save = async (): Promise<void> => {
    setSaving(true);
    try {
      setHistory(await saveRecord({ ...snapshot.current, results }));
      Message.success(t('common.modelBench.saved'));
    } catch {
      Message.error(t('common.modelBench.saveError'));
    } finally {
      setSaving(false);
    }
  };

  const showHistory = async (): Promise<void> => {
    try {
      setHistory(await loadHistory());
      setHistoryOpen(true);
    } catch {
      Message.error(t('common.modelBench.loadError'));
    }
  };

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1>{t('common.modelBench.title')}</h1>
          <p>{t('common.modelBench.subtitle')}</p>
        </div>
        <div className={styles.actions}>
          <Button icon={<History />} disabled={active} onClick={() => void showHistory()}>
            {t('common.modelBench.history')}
          </Button>
          <Button icon={<SettingConfig />} disabled={active} onClick={() => void navigate('/settings/model')}>
            {t('common.modelBench.providers')}
          </Button>
        </div>
      </header>
      <section className={styles.selection}>
        <label htmlFor='bench-models'>{t('common.modelBench.choose')}</label>
        <div className={styles.actions}>
          <Select
            id='bench-models'
            aria-label={t('common.modelBench.choose')}
            mode='multiple'
            maxTagCount={4}
            allowClear
            showSearch
            loading={loading}
            disabled={active}
            value={selected}
            onChange={(value: string[]) => setSelected(value.slice(0, 4))}
            className={styles.modelSelect}
            placeholder={t('common.modelBench.selectPlaceholder')}
            options={models.map((model) => ({
              value: modelKey(model),
              label: `${model.model} · ${model.provider_name}`,
            }))}
          />
          <Button icon={<Refresh />} disabled={active} loading={loading} onClick={() => void reload()}>
            {t('common.modelBench.refresh')}
          </Button>
        </div>
      </section>
      {error && <Alert type='error' content={error} closable onClose={() => setError('')} />}
      <div className={styles.columns} style={{ '--bench-columns': Math.max(results.length, 2) } as React.CSSProperties}>
        {results.length === 0 ? (
          <div className={styles.empty}>
            <Empty
              icon={<ChartHistogram className={styles.emptyIcon} />}
              description={t(models.length ? 'common.modelBench.ready' : 'common.modelBench.noModels')}
            />
          </div>
        ) : (
          results.map((result, index) => (
            <section
              className={styles.column}
              key={`${modelKey(result.target)}-${index}`}
              aria-label={`${result.target.model} · ${result.target.provider_name}`}
              data-status={result.status}
            >
              <div className={styles.columnHeader}>
                <strong>{result.target.model}</strong>
                <span>{result.target.provider_name}</span>
              </div>
              <div className={styles.status} role='status'>
                <Tag>{t(`common.modelBench.status.${result.status}`)}</Tag>
                <span>
                  {(
                    (result.status === 'running' ? Math.max(0, now - (result.startedAt ?? now)) : result.elapsed) / 1000
                  ).toFixed(1)}{' '}
                  s
                </span>
              </div>
              <div className={styles.answer}>
                {result.text ? (
                  <Markdown>{result.text}</Markdown>
                ) : (
                  <p className={styles.hint}>
                    {t(result.status === 'running' ? 'common.modelBench.waiting' : 'common.modelBench.noOutput')}
                  </p>
                )}
              </div>
              {result.status === 'error' && (
                <Alert
                  type='error'
                  content={`${t('common.modelBench.runError')} (${result.error?.match(/BENCH_[A-Z_0-9]+/)?.[0] ?? 'BENCH_CONNECTION'})`}
                />
              )}
              <div className={styles.columnActions}>
                <Button
                  icon={<Copy />}
                  disabled={!result.text}
                  onClick={() =>
                    void navigator.clipboard
                      .writeText(result.text)
                      .then(() => Message.success(t('common.copySuccess')))
                      .catch(() => Message.error(t('common.copyFailed')))
                  }
                >
                  {t('common.copy')}
                </Button>
                <Button
                  icon={<Refresh />}
                  disabled={active}
                  onClick={() => void execute([result.target], snapshot.current.prompt, index)}
                >
                  {t('common.modelBench.retry')}
                </Button>
              </div>
            </section>
          ))
        )}
      </div>
      <section className={styles.composer}>
        <label htmlFor='bench-prompt'>{t('common.modelBench.prompt')}</label>
        <Input.TextArea
          id='bench-prompt'
          disabled={active}
          value={prompt}
          onChange={setPrompt}
          placeholder={t('common.modelBench.promptPlaceholder')}
          autoSize={{ minRows: 3, maxRows: 7 }}
        />
        <div className={styles.composerFooter}>
          <div className={`${styles.actions} ${styles.materialActions}`}>
            <Upload
              accept='.txt,.md,.csv,.json'
              disabled={active || reading}
              showUploadList={false}
              beforeUpload={upload}
            >
              <Button icon={<UploadOne />} disabled={active} loading={reading}>
                {t('common.modelBench.material')}
              </Button>
            </Upload>
            {material && (
              <Tag className={styles.materialTag} closable={!active} onClose={() => setMaterial(undefined)}>
                {material.name}
              </Tag>
            )}
            <span className={`${styles.hint} ${styles.materialHint}`}>{t('common.modelBench.fileHint')}</span>
          </div>
          <div className={styles.actions}>
            <Button disabled={active || !results.length} loading={saving} onClick={() => void save()}>
              {t('common.modelBench.save')}
            </Button>
            {active ? (
              <Button status='danger' onClick={() => controls.current.forEach((control) => control.abort())}>
                {t('common.modelBench.stop')}
              </Button>
            ) : (
              <Button
                type='primary'
                icon={<PlayOne />}
                disabled={loading || reading || selected.length < 2 || (!prompt.trim() && !material)}
                onClick={start}
              >
                {t('common.modelBench.run')}
              </Button>
            )}
          </div>
        </div>
      </section>
      <Drawer
        width='min(440px, 100vw)'
        visible={historyOpen}
        title={t('common.modelBench.history')}
        className={styles.historyDrawer}
        footer={null}
        onCancel={() => setHistoryOpen(false)}
      >
        <p className={styles.historyHint}>{t('common.modelBench.historyHint')}</p>
        {!history.length && <Empty className={styles.historyEmpty} icon={<History className={styles.emptyIcon} />} />}
        {history.map((record) => (
          <Button
            long
            className={styles.historyItem}
            key={record.id}
            onClick={() => {
              snapshot.current = { id: record.id, created: record.created, prompt: record.prompt };
              setResults(record.results);
              setPrompt(record.prompt);
              setMaterial(undefined);
              setSelected(record.results.map((result) => modelKey(result.target)));
              setHistoryOpen(false);
            }}
          >
            <span className={styles.historyDate}>{new Date(record.created).toLocaleString()}</span>
            <span className={styles.historyPrompt}>{record.prompt.slice(0, 75)}</span>
          </Button>
        ))}
      </Drawer>
    </main>
  );
};

export default ModelBench;
