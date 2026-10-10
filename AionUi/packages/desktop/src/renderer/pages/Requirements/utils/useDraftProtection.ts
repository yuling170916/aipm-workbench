import { useEffect, useState } from 'react';
import { Modal } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/renderer/hooks/context/AuthContext';
import type { RequirementDraft } from '../types';

/** Keep a per-account local recovery copy and guard in-page card switches. */
export function useDraftProtection(
  projectId: string | undefined,
  cardId: string | undefined,
  draft: RequirementDraft | null,
  dirty: boolean,
  material?: string
) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const key = user?.id && projectId && cardId ? `requirements.draft:${user.id}:${projectId}:${cardId}` : null;
  const [recovery, setRecovery] = useState<RequirementDraft | null>(null);
  const [recoveryMaterial, setRecoveryMaterial] = useState<string | undefined>();
  useEffect(() => {
    setRecovery(null);
    setRecoveryMaterial(undefined);
    if (!key) return;
    try {
      const raw = localStorage.getItem(key);
      const stored = raw ? (JSON.parse(raw) as { draft?: RequirementDraft; material?: string }) : null;
      if (stored?.draft?.content && Array.isArray(stored.draft.sources) && Array.isArray(stored.draft.questions)) {
        setRecovery(stored.draft);
        setRecoveryMaterial(stored.material);
      }
    } catch {
      // Recovery is optional; storage restrictions must not break editing.
    }
  }, [key]);
  useEffect(() => {
    if (!key || !dirty || !draft || recovery) return;
    try {
      localStorage.setItem(key, JSON.stringify({ draft, material, savedAt: Date.now() }));
    } catch {
      /* The unload warning still protects restricted storage environments. */
    }
  }, [key, draft, dirty, material, recovery]);
  useEffect(() => {
    if (!dirty) return;
    const guard = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, [dirty]);
  const clearRecovery = (): void => {
    if (key) {
      try {
        localStorage.removeItem(key);
      } catch {
        /* Storage may be unavailable. */
      }
    }
    setRecovery(null);
    setRecoveryMaterial(undefined);
  };
  const guardAction = (action: () => void): void => {
    if (!dirty) {
      action();
      return;
    }
    Modal.confirm({
      title: t('common.requirements.unsavedTitle'),
      content: t('common.requirements.unsavedBody'),
      okText: t('common.requirements.leave'),
      cancelText: t('common.cancel'),
      onOk: action,
    });
  };
  return { recovery, recoveryMaterial, clearRecovery, guardAction };
}
