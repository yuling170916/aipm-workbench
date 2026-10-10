import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Button, Empty, Input, Message, Modal, Select, Spin, Tabs, Tag } from '@arco-design/web-react';
import { CheckOne, Delete, Download, FolderOpen, Left, Refresh, Robot } from '@icon-park/react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { isBackendHttpError } from '@/common/adapter/httpBridge';
import { WorkspaceFolderSelect } from '@/renderer/components/workspace';
import { modelKey } from '../ModelBench/types';
import type { BenchModel } from '../ModelBench/types';
import * as api from './api';
import { generateRequirement, loadRequirementModels, reviewRequirement } from './ai';
import type {
  RequirementCapture,
  RequirementCard,
  RequirementDetail,
  RequirementDraft,
  RequirementProject,
} from './types';
import { captureSources, parseRequirementCapture, REQUIREMENT_CAPTURE_KEY } from './utils/capture';
import { downloadMarkdown, draftFromDetail, draftsEqual, emptyRequirementDraft } from './utils/requirementUtils';
import { useDraftProtection } from './utils/useDraftProtection';
import CardsPanel from './components/CardsPanel';
import RequirementEditor from './components/RequirementEditor';
import ReviewPanel from './components/ReviewPanel';
import HistoryPanel from './components/HistoryPanel';
import DocumentsPanel from './components/DocumentsPanel';
import styles from './Requirements.module.css';

export { parseRequirementCapture, REQUIREMENT_CAPTURE_KEY } from './utils/capture';

function readCapture(): RequirementCapture | null {
  try {
    return parseRequirementCapture(sessionStorage.getItem(REQUIREMENT_CAPTURE_KEY));
  } catch {
    return null;
  }
}

export default function Requirements(): React.ReactElement {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { projectId } = useParams<{ projectId: string }>();
  const [searchParams] = useSearchParams();
  const selectedId = searchParams.get('requirementId') || undefined;
  const [projects, setProjects] = useState<RequirementProject[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [projectsError, setProjectsError] = useState(false);
  const [createProjectVisible, setCreateProjectVisible] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [projectFolder, setProjectFolder] = useState('');
  const [projectCreating, setProjectCreating] = useState(false);
  const [cards, setCards] = useState<RequirementCard[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState(false);
  const [detail, setDetail] = useState<RequirementDetail | null>(null);
  const [draft, setDraft] = useState<RequirementDraft | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState(false);
  const [capture, setCapture] = useState(readCapture);
  const [creating, setCreating] = useState(() => Boolean(readCapture()));
  const [material, setMaterial] = useState(() => readCapture()?.text ?? '');
  const [models, setModels] = useState<BenchModel[]>([]);
  const [modelLoading, setModelLoading] = useState(true);
  const [modelError, setModelError] = useState(false);
  const [selectedModel, setSelectedModel] = useState('');
  const [busy, setBusy] = useState(false);
  const [aiActive, setAiActive] = useState<'generate' | 'review' | null>(null);
  const [progress, setProgress] = useState(0);
  const [operationError, setOperationError] = useState<
    'actionError' | 'saveError' | 'conflict' | 'aiError' | 'aiInvalid' | 'aiLimit' | null
  >(null);
  const [tab, setTab] = useState('editor');
  const busyRef = useRef(false);
  const mounted = useRef(true);
  const requestToken = useRef(0);
  const aiController = useRef<AbortController | null>(null);
  const lastRetry = useRef<(() => void) | null>(null);
  const lastAiKind = useRef<'generate' | 'review'>('generate');
  const currentProjectId = useRef(projectId);
  currentProjectId.current = projectId;
  const dirty =
    draft !== null &&
    (detail
      ? !draftsEqual(draft, draftFromDetail(detail))
      : !draftsEqual(draft, emptyRequirementDraft()) || Boolean(material.trim()));
  const protection = useDraftProtection(
    projectId,
    selectedId ?? (creating ? 'new' : undefined),
    draft,
    dirty,
    creating ? material : undefined
  );

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      requestToken.current++;
      aiController.current?.abort();
    };
  }, []);

  const loadProjects = useCallback(async (): Promise<void> => {
    setProjectsLoading(true);
    setProjectsError(false);
    try {
      const result = await api.loadRequirementProjects();
      if (mounted.current) setProjects(result);
    } catch {
      if (mounted.current) setProjectsError(true);
    } finally {
      if (mounted.current) setProjectsLoading(false);
    }
  }, []);
  const loadModels = useCallback(async (): Promise<void> => {
    setModelLoading(true);
    setModelError(false);
    try {
      const result = await loadRequirementModels();
      if (mounted.current) {
        setModels(result);
        setSelectedModel((previous) =>
          result.some((model) => modelKey(model) === previous) ? previous : result[0] ? modelKey(result[0]) : ''
        );
      }
    } catch {
      if (mounted.current) setModelError(true);
    } finally {
      if (mounted.current) setModelLoading(false);
    }
  }, []);
  useEffect(() => {
    void loadProjects();
    void loadModels();
  }, [loadProjects, loadModels]);

  const reloadList = useCallback(async (): Promise<void> => {
    if (!projectId) return;
    setListLoading(true);
    setListError(false);
    try {
      const result = await api.listRequirements(projectId);
      if (mounted.current && currentProjectId.current === projectId) setCards(result);
    } catch {
      if (mounted.current && currentProjectId.current === projectId) setListError(true);
    } finally {
      if (mounted.current && currentProjectId.current === projectId) setListLoading(false);
    }
  }, [projectId]);
  useEffect(() => {
    let alive = true;
    setCards([]);
    setListError(false);
    if (!projectId) {
      setListLoading(false);
      return;
    }
    setListLoading(true);
    api
      .listRequirements(projectId)
      .then((result) => {
        if (alive) setCards(result);
      })
      .catch(() => {
        if (alive) setListError(true);
      })
      .finally(() => {
        if (alive) setListLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [projectId]);

  const applyDetail = (result: RequirementDetail): void => {
    setDetail(result);
    setDraft(draftFromDetail(result));
    setCards((previous) => [result.card, ...previous.filter((card) => card.id !== result.card.id)]);
  };
  const reloadDetail = async (): Promise<void> => {
    if (!selectedId) return;
    setDetailLoading(true);
    setDetailError(false);
    const token = requestToken.current;
    try {
      const result = await api.getRequirement(selectedId);
      if (mounted.current && token === requestToken.current && result.card.project_id === projectId) {
        applyDetail(result);
        setOperationError(null);
      }
    } catch {
      if (mounted.current && token === requestToken.current) setDetailError(true);
    } finally {
      if (mounted.current && token === requestToken.current) setDetailLoading(false);
    }
  };
  useEffect(() => {
    let alive = true;
    requestToken.current++;
    aiController.current?.abort();
    setAiActive(null);
    setBusy(false);
    busyRef.current = false;
    setDetail(null);
    setDraft(null);
    setDetailError(false);
    setOperationError(null);
    setTab('editor');
    if (selectedId) {
      setCreating(false);
      setDetailLoading(true);
      api
        .getRequirement(selectedId)
        .then((result) => {
          if (alive && result.card.project_id === projectId) {
            setDetail(result);
            setDraft(draftFromDetail(result));
          } else if (alive) setDetailError(true);
        })
        .catch(() => {
          if (alive) setDetailError(true);
        })
        .finally(() => {
          if (alive) setDetailLoading(false);
        });
    } else {
      setDetailLoading(false);
      const pending = readCapture();
      const suitable = pending && (!pending.projectId || pending.projectId === projectId);
      setCapture(suitable ? pending : null);
      if (suitable || creating) {
        setCreating(true);
        const initial = emptyRequirementDraft();
        if (suitable) initial.sources = captureSources(pending);
        setDraft(initial);
        if (suitable) setMaterial(pending.text);
      }
    }
    return () => {
      alive = false;
      requestToken.current++;
      aiController.current?.abort();
    };
    // Creation state is intentionally preserved on project selection, not a fetch dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, selectedId]);

  const goTo = (targetProject: string, id?: string): void => {
    const proceed = (): void => {
      setCreating(false);
      void navigate(
        `/projects/${encodeURIComponent(targetProject)}/requirements${id ? `?requirementId=${encodeURIComponent(id)}` : ''}`
      );
    };
    if (!projectId) proceed();
    else protection.guardAction(proceed);
  };
  const startNew = (): void =>
    protection.guardAction(() => {
      try {
        sessionStorage.removeItem(REQUIREMENT_CAPTURE_KEY);
      } catch {
        /* Starting manually does not require browser storage. */
      }
      setCreating(true);
      setDetail(null);
      const fresh = emptyRequirementDraft();
      setDraft(fresh);
      setMaterial('');
      setCapture(null);
      setTab('editor');
      setOperationError(null);
      if (selectedId && projectId) void navigate(`/projects/${encodeURIComponent(projectId)}/requirements`);
    });
  const createProject = async (): Promise<void> => {
    if (!projectName.trim() || projectCreating) return;
    setProjectCreating(true);
    try {
      const normalized = projectFolder.replace(/\\/g, '/');
      const uri = normalized
        ? `file://${normalized.startsWith('/') ? '' : '/'}${normalized
            .split('/')
            .map((part) => encodeURIComponent(part))
            .join('/')}`
        : undefined;
      const result = await api.createRequirementProject(projectName.trim(), uri);
      setProjects((previous) => [
        { id: result.project_id, name: result.name },
        ...previous.filter((project) => project.id !== result.project_id),
      ]);
      setCreateProjectVisible(false);
      setProjectName('');
      setProjectFolder('');
      setCreating(true);
      void navigate(`/projects/${encodeURIComponent(result.project_id)}/requirements`);
    } catch {
      Message.error(t('common.requirements.projectCreateError'));
    } finally {
      setProjectCreating(false);
    }
  };
  const operationMessage = (
    error: unknown,
    fallback: 'actionError' | 'saveError' | 'aiError' = 'actionError'
  ): typeof operationError => {
    if (
      isBackendHttpError(error) &&
      (error.code === 'REQUIREMENT_CONFLICT' || (error.status === 409 && error.code !== 'REQUIREMENT_CONFIRM_BLOCKED'))
    )
      return 'conflict';
    if (error instanceof Error && /REQUIREMENT_AI_(INVALID|OUTPUT_LIMIT)/.test(error.message)) return 'aiInvalid';
    if (error instanceof Error && /REQUIREMENT_AI_INPUT_LIMIT/.test(error.message)) return 'aiLimit';
    return fallback;
  };
  const mutate = async (
    action: () => Promise<RequirementDetail>,
    fallback: 'actionError' | 'saveError' = 'actionError'
  ): Promise<boolean> => {
    if (busyRef.current) return false;
    busyRef.current = true;
    setBusy(true);
    setOperationError(null);
    const token = requestToken.current;
    lastRetry.current = () => {
      void mutate(action, fallback);
    };
    try {
      const result = await action();
      if (!mounted.current || token !== requestToken.current) return false;
      applyDetail(result);
      return true;
    } catch (error) {
      if (mounted.current && token === requestToken.current) setOperationError(operationMessage(error, fallback));
      return false;
    } finally {
      if (mounted.current && token === requestToken.current) {
        busyRef.current = false;
        setBusy(false);
      }
    }
  };
  const save = async (): Promise<void> => {
    if (!draft || !projectId) return;
    if (!draft.content.title.trim()) {
      Message.warning(t('common.requirements.requiredTitle'));
      return;
    }
    if (
      draft.questions.some((question) => !question.text.trim()) ||
      draft.sources.some((source) => !source.label.trim() || (source.kind === 'file' && !source.path?.trim()))
    ) {
      Message.warning(t('common.requirements.completeNotes'));
      return;
    }
    if (detail) {
      if (await mutate(() => api.saveRequirement(detail.card.id, detail.card.revision, draft), 'saveError')) {
        protection.clearRecovery();
        Message.success(t('common.requirements.saved'));
      }
    } else {
      if (busyRef.current) return;
      const fullDraft = structuredClone(draft);
      if (
        material.trim() &&
        !fullDraft.sources.some((source) => source.excerpt === material) &&
        fullDraft.sources.map((source) => source.excerpt).join('') !== material
      ) {
        fullDraft.sources.push(
          ...captureSources({ text: material, label: t('common.requirements.sourceKinds.user'), sourceKind: 'user' })
        );
      }
      busyRef.current = true;
      setBusy(true);
      setOperationError(null);
      const token = requestToken.current;
      lastRetry.current = () => {
        void save();
      };
      try {
        const result = await api.createRequirement(projectId, fullDraft);
        if (mounted.current && token === requestToken.current) {
          protection.clearRecovery();
          if (capture) {
            try {
              sessionStorage.removeItem(REQUIREMENT_CAPTURE_KEY);
            } catch {
              /* Captures also survive in the saved card. */
            }
          }
          setCapture(null);
          setCreating(false);
          applyDetail(result);
          Message.success(t('common.requirements.saved'));
          void navigate(
            `/projects/${encodeURIComponent(projectId)}/requirements?requirementId=${encodeURIComponent(result.card.id)}`,
            { replace: true }
          );
        }
      } catch (error) {
        if (mounted.current && token === requestToken.current) setOperationError(operationMessage(error, 'saveError'));
      } finally {
        if (mounted.current && token === requestToken.current) {
          busyRef.current = false;
          setBusy(false);
        }
      }
    }
  };
  const runAi = async (kind: 'generate' | 'review'): Promise<void> => {
    lastAiKind.current = kind;
    const model = models.find((item) => modelKey(item) === selectedModel);
    if (busyRef.current || !model || (kind === 'review' && (!detail || dirty))) return;
    if (kind === 'generate' && !material.trim()) return;
    busyRef.current = true;
    setBusy(true);
    setAiActive(kind);
    setProgress(0);
    setOperationError(null);
    const token = ++requestToken.current;
    const controller = new AbortController();
    aiController.current = controller;
    lastRetry.current = () => {
      void runAi(kind);
    };
    try {
      const onProgress = (count: number): void => {
        if (token === requestToken.current && !controller.signal.aborted && mounted.current) setProgress(count);
      };
      if (kind === 'generate') {
        const result = await generateRequirement({
          model,
          material,
          sources: draft?.sources ?? [],
          signal: controller.signal,
          onProgress,
        });
        if (token === requestToken.current && !controller.signal.aborted && mounted.current) setDraft(result);
      } else if (detail) {
        const result = await reviewRequirement({ model, card: detail.card, signal: controller.signal, onProgress });
        if (token === requestToken.current && !controller.signal.aborted && mounted.current) {
          const updated = await api.saveAiCheck(
            detail.card.id,
            result.based_on_revision,
            result.summary,
            result.issues
          );
          if (token === requestToken.current && !controller.signal.aborted && mounted.current) applyDetail(updated);
        }
      }
    } catch (error) {
      if (token === requestToken.current && !controller.signal.aborted && mounted.current)
        setOperationError(operationMessage(error, 'aiError'));
    } finally {
      if (token === requestToken.current && mounted.current) {
        busyRef.current = false;
        setBusy(false);
        setAiActive(null);
        aiController.current = null;
      }
    }
  };
  const cancelAi = (): void => {
    aiController.current?.abort();
    requestToken.current++;
    busyRef.current = false;
    setBusy(false);
    setAiActive(null);
    setOperationError(null);
    Message.info(t('common.requirements.aiCancelled'));
  };
  const exportReview = async (): Promise<void> => {
    if (!detail || dirty || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setOperationError(null);
    lastRetry.current = () => {
      void exportReview();
    };
    try {
      const result = await api.exportRequirement(detail.card.id);
      downloadMarkdown(result.filename, result.markdown);
      Message.success(t('common.requirements.exported'));
    } catch (error) {
      setOperationError(operationMessage(error));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };
  const remove = (): void => {
    if (!detail || busy) return;
    Modal.confirm({
      title: t('common.requirements.deleteTitle'),
      content: t('common.requirements.deleteBody'),
      okText: t('common.requirements.delete'),
      cancelText: t('common.cancel'),
      okButtonProps: { status: 'danger' },
      onOk: async () => {
        busyRef.current = true;
        setBusy(true);
        try {
          await api.deleteRequirement(detail.card.id, detail.card.revision);
          protection.clearRecovery();
          setCards((previous) => previous.filter((card) => card.id !== detail.card.id));
          setDetail(null);
          setDraft(null);
          setCreating(false);
          void navigate(`/projects/${encodeURIComponent(projectId!)}/requirements`, { replace: true });
          Message.success(t('common.requirements.deleted'));
        } catch (error) {
          setOperationError(operationMessage(error));
          throw error;
        } finally {
          busyRef.current = false;
          setBusy(false);
        }
      },
    });
  };

  const currentProject = projects.find((project) => project.id === projectId);
  const projectOptions = projects.map((project) => ({ value: project.id, label: project.name }));
  if (projectId && !currentProject) projectOptions.push({ value: projectId, label: projectId });
  const modelPicker = (
    <Select
      aria-label={t('common.requirements.model')}
      className={styles.modelSelect}
      value={selectedModel || undefined}
      placeholder={t('common.requirements.model')}
      loading={modelLoading}
      disabled={busy || !models.length}
      options={models.map((model) => ({ value: modelKey(model), label: `${model.model} · ${model.provider_name}` }))}
      onChange={setSelectedModel}
      showSearch
    />
  );
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <div className={styles.eyebrow}>
            <FolderOpen /> {currentProject?.name ?? t('common.requirements.project')}
          </div>
          <h1>{t('common.requirements.title')}</h1>
          <p>{t('common.requirements.subtitle')}</p>
        </div>
        <div className={styles.headerActions}>
          <Select
            aria-label={t('common.requirements.project')}
            placeholder={t('common.requirements.chooseProject')}
            value={projectId}
            options={projectOptions}
            loading={projectsLoading}
            disabled={busy}
            onChange={(id: string) => goTo(id)}
            className={styles.projectSelect}
            showSearch
          />
          <Button
            icon={<FolderOpen />}
            disabled={busy}
            onClick={() => {
              if (!projectId) setCreateProjectVisible(true);
              else protection.guardAction(() => setCreateProjectVisible(true));
            }}
          >
            {t('common.requirements.createProject')}
          </Button>
          <Button
            icon={<Refresh />}
            aria-label={t('common.requirements.refresh')}
            disabled={busy}
            onClick={() => {
              void loadProjects();
              if (projectId) void reloadList();
            }}
          />
        </div>
      </header>
      {!projectId ? (
        <section className={styles.projectGate}>
          <FolderOpen className={styles.gateIcon} />
          <h2>{t('common.requirements.chooseProject')}</h2>
          <p>{t('common.requirements.subtitle')}</p>
          {capture && <Alert type='info' content={t('common.requirements.captured')} />}
          {projectsError ? (
            <Alert
              type='error'
              content={t('common.requirements.loadError')}
              action={<Button onClick={() => void loadProjects()}>{t('common.requirements.retry')}</Button>}
            />
          ) : !projectsLoading && !projects.length ? (
            <>
              <Empty description={t('common.requirements.noProjects')} />
              <Button type='primary' onClick={() => setCreateProjectVisible(true)}>
                {t('common.requirements.createProject')}
              </Button>
            </>
          ) : (
            <Select
              aria-label={t('common.requirements.chooseProject')}
              options={projectOptions}
              placeholder={t('common.requirements.chooseProject')}
              loading={projectsLoading}
              onChange={(id: string) => goTo(id)}
            />
          )}
        </section>
      ) : (
        <div className={`${styles.workspace} ${selectedId || creating ? styles.hasSelection : ''}`}>
          <div className={styles.listColumn}>
            {listError && (
              <Alert
                type='error'
                content={t('common.requirements.loadError')}
                action={
                  <Button size='mini' onClick={() => void reloadList()}>
                    {t('common.requirements.retry')}
                  </Button>
                }
              />
            )}
            <CardsPanel
              cards={cards}
              selectedId={selectedId}
              loading={listLoading}
              disabled={busy}
              onSelect={(id) => goTo(projectId, id)}
              onNew={startNew}
            />
          </div>
          <section className={styles.detailColumn}>
            {detailLoading ? (
              <div className={styles.empty}>
                <Spin />
              </div>
            ) : detailError ? (
              <div className={styles.empty}>
                <Alert
                  type='error'
                  content={t('common.requirements.loadError')}
                  action={<Button onClick={() => void reloadDetail()}>{t('common.requirements.retry')}</Button>}
                />
              </div>
            ) : !draft ? (
              <div className={styles.welcome}>
                <InspectionIllustration />
                <h2>{t('common.requirements.selectCard')}</h2>
                <p>{t('common.requirements.emptyDescription')}</p>
                <Button type='primary' onClick={startNew}>
                  {t('common.requirements.new')}
                </Button>
              </div>
            ) : (
              <>
                <div className={styles.detailHeader}>
                  <div className={styles.row}>
                    <Button
                      className={styles.mobileBack}
                      type='text'
                      icon={<Left />}
                      aria-label={t('common.requirements.backToList')}
                      disabled={busy}
                      onClick={() =>
                        protection.guardAction(() => {
                          setCreating(false);
                          setDraft(null);
                          setDetail(null);
                          void navigate(`/projects/${encodeURIComponent(projectId)}/requirements`);
                        })
                      }
                    />
                    <div>
                      <div className={styles.cardMeta}>
                        {detail ? (
                          <>
                            <span>{detail.card.number}</span>
                            <Tag>{t(`common.requirements.statuses.${detail.card.status}`)}</Tag>
                            <span>{t('common.requirements.currentRevision', { revision: detail.card.revision })}</span>
                          </>
                        ) : (
                          <Tag color='blue'>{t('common.requirements.new')}</Tag>
                        )}
                        {dirty && <Tag color='orange'>{t('common.requirements.unsaved')}</Tag>}
                      </div>
                      <h2>{draft.content.title || t('common.requirements.newCardTitle')}</h2>
                    </div>
                  </div>
                  <div className={styles.detailActions}>
                    {detail && (
                      <>
                        <Button icon={<Download />} disabled={busy || dirty} onClick={() => void exportReview()}>
                          {t('common.requirements.export')}
                        </Button>
                        <Button
                          type='text'
                          aria-label={t('common.requirements.delete')}
                          icon={<Delete />}
                          disabled={busy}
                          onClick={remove}
                        />
                      </>
                    )}
                    <Button
                      type='primary'
                      icon={<CheckOne />}
                      loading={busy && !aiActive}
                      disabled={busy || Boolean(detail && !dirty)}
                      onClick={() => void save()}
                    >
                      {detail ? t('common.requirements.save') : t('common.requirements.createManual')}
                    </Button>
                  </div>
                </div>
                <div className={styles.feedback}>
                  {operationError && (
                    <Alert
                      type='error'
                      content={t(`common.requirements.${operationError}`)}
                      action={
                        <Button
                          size='small'
                          disabled={busy}
                          onClick={() => {
                            if (operationError === 'conflict') protection.guardAction(() => void reloadDetail());
                            else if (operationError === 'saveError') void save();
                            else if (
                              operationError === 'aiError' ||
                              operationError === 'aiInvalid' ||
                              operationError === 'aiLimit'
                            )
                              void runAi(lastAiKind.current);
                            else lastRetry.current?.();
                          }}
                        >
                          {t(
                            operationError === 'conflict' ? 'common.requirements.refresh' : 'common.requirements.retry'
                          )}
                        </Button>
                      }
                    />
                  )}
                  {protection.recovery && (
                    <Alert
                      type='warning'
                      content={t('common.requirements.recovery')}
                      action={
                        <div className={styles.row}>
                          <Button
                            size='mini'
                            disabled={busy}
                            onClick={() => {
                              setDraft(protection.recovery);
                              if (protection.recoveryMaterial !== undefined) setMaterial(protection.recoveryMaterial);
                              protection.clearRecovery();
                            }}
                          >
                            {t('common.requirements.recover')}
                          </Button>
                          <Button size='mini' disabled={busy} onClick={protection.clearRecovery}>
                            {t('common.requirements.discard')}
                          </Button>
                        </div>
                      }
                    />
                  )}
                  {aiActive && (
                    <Alert
                      type='info'
                      content={`${t('common.requirements.generating')} ${t('common.requirements.generationProgress', { count: progress })}`}
                      action={
                        <Button size='small' onClick={cancelAi}>
                          {t('common.requirements.cancelGeneration')}
                        </Button>
                      }
                    />
                  )}
                </div>
                <div className={styles.detailScroll}>
                  {creating && !detail && (
                    <section className={styles.createIntro}>
                      <h3>{t('common.requirements.material')}</h3>
                      <Input.TextArea
                        aria-label={t('common.requirements.material')}
                        value={material}
                        onChange={setMaterial}
                        placeholder={t('common.requirements.materialHint')}
                        disabled={busy}
                        maxLength={100000}
                        autoSize={{ minRows: 4, maxRows: 10 }}
                      />
                      {capture && <p className={styles.help}>{t('common.requirements.captured')}</p>}
                      <div className={styles.reviewActions}>
                        {modelPicker}
                        <Button
                          icon={<Robot />}
                          disabled={busy || !selectedModel || !material.trim()}
                          loading={aiActive === 'generate'}
                          onClick={() => {
                            if (Object.values(draft.content).some((value) => value?.trim()) || draft.questions.length)
                              Modal.confirm({
                                title: t('common.requirements.replaceDraftTitle'),
                                content: t('common.requirements.replaceDraftBody'),
                                okText: t('common.requirements.aiGenerate'),
                                cancelText: t('common.cancel'),
                                onOk: () => {
                                  void runAi('generate');
                                },
                              });
                            else void runAi('generate');
                          }}
                        >
                          {t('common.requirements.aiGenerate')}
                        </Button>
                      </div>
                      {modelError ? (
                        <Alert
                          type='warning'
                          content={t('common.requirements.modelLoadError')}
                          action={
                            <Button size='small' onClick={() => void loadModels()} disabled={busy}>
                              {t('common.requirements.retry')}
                            </Button>
                          }
                        />
                      ) : (
                        !modelLoading &&
                        !models.length && <Alert type='info' content={t('common.requirements.noModels')} />
                      )}
                    </section>
                  )}
                  {detail ? (
                    <Tabs activeTab={tab} onChange={setTab} type='line' className={styles.tabs}>
                      <Tabs.TabPane key='editor' title={t('common.requirements.editor')}>
                        <RequirementEditor value={draft} onChange={setDraft} disabled={busy} />
                        <div className={styles.archiveRow}>
                          <Button
                            disabled={busy || dirty}
                            type='text'
                            onClick={() =>
                              void mutate(() =>
                                api.saveRequirement(
                                  detail.card.id,
                                  detail.card.revision,
                                  draft,
                                  detail.card.status === 'archived' ? 'draft' : 'archived'
                                )
                              )
                            }
                          >
                            {detail.card.status === 'archived'
                              ? t('common.requirements.restore')
                              : t('common.requirements.archive')}
                          </Button>
                        </div>
                      </Tabs.TabPane>
                      <Tabs.TabPane key='review' title={t('common.requirements.review')}>
                        <ReviewPanel
                          detail={detail}
                          dirty={dirty}
                          busy={busy}
                          aiAvailable={Boolean(selectedModel)}
                          modelPicker={modelPicker}
                          onRules={() => void mutate(() => api.runRuleCheck(detail.card.id, detail.card.revision))}
                          onAi={() => void runAi('review')}
                          onIssue={(check, issue, status, reason) =>
                            mutate(() =>
                              api.resolveRequirementIssue(
                                detail.card.id,
                                detail.card.revision,
                                check.id,
                                issue.id,
                                status,
                                reason
                              )
                            )
                          }
                          onConfirm={() =>
                            Modal.confirm({
                              title: t('common.requirements.confirmTitle'),
                              content: t('common.requirements.statusNote'),
                              okText: t('common.requirements.confirm'),
                              cancelText: t('common.cancel'),
                              onOk: async () => {
                                if (!(await mutate(() => api.confirmRequirement(detail.card.id, detail.card.revision))))
                                  throw new Error('REQUIREMENT_ACTION_FAILED');
                                Message.success(t('common.requirements.confirmed'));
                              },
                            })
                          }
                        />
                        {modelError && (
                          <Alert
                            type='warning'
                            content={t('common.requirements.modelLoadError')}
                            action={
                              <Button size='small' onClick={() => void loadModels()}>
                                {t('common.requirements.retry')}
                              </Button>
                            }
                          />
                        )}
                        {!modelLoading && !models.length && (
                          <Alert type='info' content={t('common.requirements.noModels')} />
                        )}
                      </Tabs.TabPane>
                      <Tabs.TabPane key='history' title={t('common.requirements.history')}>
                        <HistoryPanel versions={detail.versions} />
                      </Tabs.TabPane>
                      <Tabs.TabPane
                        key='documents'
                        title={
                          <span>
                            {t('common.requirements.documents')}
                            {detail.links.some((link) => link.needs_review) && <span className={styles.noticeDot} />}
                          </span>
                        }
                      >
                        <DocumentsPanel
                          links={detail.links}
                          disabled={busy || dirty}
                          onAdd={(link) =>
                            mutate(() => api.addRequirementLink(detail.card.id, detail.card.revision, link))
                          }
                          onRemove={(link) =>
                            mutate(() => api.removeRequirementLink(detail.card.id, detail.card.revision, link.id))
                          }
                          onSync={(link) =>
                            mutate(() => api.acknowledgeRequirementLink(detail.card.id, detail.card.revision, link.id))
                          }
                        />
                      </Tabs.TabPane>
                    </Tabs>
                  ) : (
                    <RequirementEditor value={draft} onChange={setDraft} disabled={busy} />
                  )}
                </div>
              </>
            )}
          </section>
        </div>
      )}
      <Modal
        title={t('common.requirements.createProject')}
        visible={createProjectVisible}
        onCancel={() => {
          if (!projectCreating) setCreateProjectVisible(false);
        }}
        onOk={() => void createProject()}
        confirmLoading={projectCreating}
        okButtonProps={{ disabled: !projectName.trim() }}
        okText={t('common.requirements.createProject')}
        cancelText={t('common.cancel')}
      >
        <div className={styles.linkForm}>
          <Input
            aria-label={t('common.requirements.projectName')}
            value={projectName}
            onChange={setProjectName}
            placeholder={t('common.requirements.projectName')}
            maxLength={80}
            disabled={projectCreating}
          />
          <WorkspaceFolderSelect
            value={projectFolder}
            onChange={setProjectFolder}
            onClear={() => setProjectFolder('')}
            placeholder={t('common.requirements.projectFolder')}
            recentLabel={t('common.requirements.recentFolders')}
            chooseDifferentLabel={t('common.requirements.chooseFolder')}
          />
          <p className={styles.help}>{t('common.requirements.projectFolderHint')}</p>
        </div>
      </Modal>
    </main>
  );
}

function InspectionIllustration(): React.ReactElement {
  return (
    <div className={styles.illustration} aria-hidden='true'>
      <div className={styles.illustrationPage}>
        <span />
        <span />
        <span />
        <span />
      </div>
      <CheckOne />
    </div>
  );
}
