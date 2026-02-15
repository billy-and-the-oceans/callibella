import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { AudioErrorEvent, AudioModelStatus, AudioProgressEvent, AudioReadyEvent } from './bokaTypes';

function isTauriRuntime(): boolean {
  return (
    typeof window !== 'undefined' &&
    (typeof (window as any).__TAURI_INTERNALS__ !== 'undefined' || '__TAURI__' in (window as any))
  );
}

export async function generate_speech(args: {
  text: string;
  language: string;
  voiceId?: string;
  speed?: number;
  onProgress: (event: AudioProgressEvent) => void;
  onReady: (event: AudioReadyEvent) => void;
  onError: (message: string) => void;
}): Promise<{ cancel: () => void; requestId: string }> {
  const { text, language, voiceId, speed, onProgress, onReady, onError } = args;

  if (!isTauriRuntime()) {
    throw new Error('Not running in Tauri runtime');
  }

  let requestId: string | null = null;

  const unlistenProgress = await listen<AudioProgressEvent>('boka:audio:progress', (ev) => {
    if (!ev.payload) return;
    if (requestId && ev.payload.requestId !== requestId) return;
    onProgress(ev.payload);
  });

  const unlistenReady = await listen<AudioReadyEvent>('boka:audio:ready', (ev) => {
    if (!ev.payload) return;
    if (requestId && ev.payload.requestId !== requestId) return;
    onReady(ev.payload);
  });

  const unlistenError = await listen<AudioErrorEvent>('boka:audio:error', (ev) => {
    if (!ev.payload) return;
    if (requestId && ev.payload.requestId !== requestId) return;
    onError(ev.payload.message);
  });

  let startedRequestId: string;
  try {
    startedRequestId = await invoke<string>('boka_generate_speech', {
      text,
      language,
      voiceId: voiceId ?? null,
      speed: speed ?? null,
    });
  } catch (e) {
    unlistenProgress();
    unlistenReady();
    unlistenError();
    throw e;
  }

  requestId = startedRequestId;

  return {
    requestId: startedRequestId,
    cancel: () => {
      if (requestId) {
        void invoke('boka_cancel_audio', { requestId });
      }
      unlistenProgress();
      unlistenReady();
      unlistenError();
    },
  };
}

export async function get_audio_status(): Promise<AudioModelStatus> {
  if (!isTauriRuntime()) {
    throw new Error('Not running in Tauri runtime');
  }
  return invoke<AudioModelStatus>('boka_get_audio_status');
}

export async function preload_model(): Promise<void> {
  if (!isTauriRuntime()) {
    throw new Error('Not running in Tauri runtime');
  }
  await invoke('boka_preload_model');
}
