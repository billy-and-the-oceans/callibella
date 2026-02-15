import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { InteractiveDoc, LlmProviderConfig, TranslationJob } from './bokaTypes';

function isTauriRuntime(): boolean {
  return (
    typeof window !== 'undefined' &&
    (typeof (window as any).__TAURI_INTERNALS__ !== 'undefined' || '__TAURI__' in (window as any))
  );
}

type DocEvent = {
  jobId: string;
  doc: InteractiveDoc;
};

type ErrorEvent = {
  jobId: string;
  message: string;
};

export async function start_tauri_translation(args: {
  storyText: string;
  targetLanguage?: string;
  sourceLanguage?: string;
  adultMode: boolean;
  denseSpans: boolean;
  provider: LlmProviderConfig;
  onJob: (job: TranslationJob) => void;
  onDoc: (doc: InteractiveDoc) => void;
  onError: (message: string) => void;
}): Promise<{ cancel: () => void; jobId: string }> {
  const { storyText, targetLanguage, sourceLanguage, adultMode, denseSpans, provider, onJob, onDoc, onError } = args;

  if (!isTauriRuntime()) {
    throw new Error('Not running in Tauri runtime');
  }

  let jobId: string | null = null;

  const unlistenJob = await listen<TranslationJob>('boka:translation:job', (ev) => {
    if (!ev.payload) return;
    if (jobId && ev.payload.id !== jobId) return;
    onJob(ev.payload);
  });

  const unlistenDoc = await listen<DocEvent>('boka:translation:doc', (ev) => {
    if (!ev.payload) return;
    if (jobId && ev.payload.jobId !== jobId) return;
    onDoc(ev.payload.doc);
  });

  const unlistenErr = await listen<ErrorEvent>('boka:translation:error', (ev) => {
    if (!ev.payload) return;
    if (jobId && ev.payload.jobId !== jobId) return;
    onError(ev.payload.message);
  });

  let startedJobId: string;
  try {
    startedJobId = await invoke<string>('boka_start_translation', {
      storyText,
      targetLanguage: targetLanguage ?? null,
      sourceLanguage: sourceLanguage ?? null,
      adultMode,
      denseSpans,
      provider,
    });
  } catch (e) {
    unlistenJob();
    unlistenDoc();
    unlistenErr();
    throw e;
  }

  jobId = startedJobId;

  return {
    jobId: startedJobId,
    cancel: () => {
      if (jobId) {
        void invoke('boka_cancel_translation', { jobId });
      }
      unlistenJob();
      unlistenDoc();
      unlistenErr();
    },
  };
}

export async function test_tauri_provider(args: { provider: LlmProviderConfig }): Promise<string> {
  const { provider } = args;

  if (!isTauriRuntime()) {
    throw new Error('Not running in Tauri runtime');
  }

  return invoke<string>('boka_test_provider', {
    provider,
  });
}
