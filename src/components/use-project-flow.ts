'use client';

/**
 * useProjectFlow — single source of truth for a project's journey state.
 *
 * The flow bar and the journey menu both answer "where is the customer on
 * this project?" — this hook computes it once so they can never disagree:
 *   step 1 = building, 2 = needs keys, 3 = ready to deploy, 4 = live.
 */

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';

export interface RequiredApi {
  provider: string;
  envVars: string[];
  required: boolean;
}

interface SavedKey {
  provider: string;
  key_name: string;
}

export interface ProjectFlow {
  /** 1 build · 2 configure · 3 deploy · 4 live */
  step: 1 | 2 | 3 | 4;
  buildDone: boolean;
  keysDone: boolean;
  deployed: boolean;
  missingCount: number;
  deploymentUrl: string | null;
  loaded: boolean;
  goToKeys: () => void;
  goToDeploy: () => void;
  refresh: () => void;
}

export function useProjectFlow(
  projectId: string,
  status: string,
  requiredApis?: RequiredApi[],
  deploymentUrl?: string | null
): ProjectFlow {
  const router = useRouter();
  const [saved, setSaved] = useState<SavedKey[]>([]);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/setup-agent/keys?projectId=${projectId}`);
      if (res.ok) {
        const data = await res.json();
        setSaved(data.keys || []);
      }
    } catch { /* keep last known state */ }
    setLoaded(true);
  }, [projectId]);

  useEffect(() => {
    refresh();
    const onSaved = () => refresh();
    const onFocus = () => refresh();
    window.addEventListener('bodigi-keys-saved', onSaved);
    window.addEventListener('focus', onFocus);
    return () => {
      window.removeEventListener('bodigi-keys-saved', onSaved);
      window.removeEventListener('focus', onFocus);
    };
  }, [refresh]);

  const buildDone = status === 'done';
  const required = (requiredApis || []).filter(a => a.required !== false);
  const missing = required.flatMap(a =>
    a.envVars.filter(v => !saved.some(k => k.provider.toLowerCase() === a.provider.toLowerCase() && k.key_name === v))
  );
  const keysDone = loaded && missing.length === 0;
  const deployed = !!deploymentUrl;

  const step = (!buildDone ? 1 : !keysDone ? 2 : !deployed ? 3 : 4) as 1 | 2 | 3 | 4;

  const goToKeys = useCallback(() => {
    const el = document.getElementById('api-keys');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('ring-2', 'ring-fuchsia-400', 'rounded-xl');
      setTimeout(() => el.classList.remove('ring-2', 'ring-fuchsia-400'), 2500);
    }
  }, []);

  const goToDeploy = useCallback(() => {
    router.push(`/preview/${projectId}`);
  }, [router, projectId]);

  return {
    step,
    buildDone,
    keysDone,
    deployed,
    missingCount: missing.length,
    deploymentUrl: deploymentUrl || null,
    loaded,
    goToKeys,
    goToDeploy,
    refresh,
  };
}
