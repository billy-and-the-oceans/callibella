import type { AudioModelStatus, AudioProgressEvent, AudioReadyEvent } from './bokaTypes';

let requestCounter = 0;

export function generate_mock_speech(args: {
  text: string;
  language: string;
  speed?: number;
  onProgress: (event: AudioProgressEvent) => void;
  onReady: (event: AudioReadyEvent) => void;
  onError: (message: string) => void;
}): { cancel: () => void; requestId: string } {
  const { text, language, speed, onProgress, onReady, onError } = args;

  requestCounter++;
  const requestId = `mock-audio-${requestCounter}`;
  let cancelled = false;
  const timers: number[] = [];

  timers.push(
    window.setTimeout(() => {
      if (cancelled) return;
      onProgress({ requestId, stage: 'generating', message: 'Generating speech (mock)...' });
    }, 100),
  );

  timers.push(
    window.setTimeout(() => {
      if (cancelled) return;

      if (!('speechSynthesis' in window)) {
        onError('SpeechSynthesis not available in this browser');
        return;
      }

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = language;
      utterance.rate = speed ?? 1.0;

      utterance.onend = () => {
        if (cancelled) return;
        onReady({
          requestId,
          audioBase64: '',
          durationMs: 0,
          sampleRate: 0,
        });
      };

      utterance.onerror = (ev) => {
        if (cancelled) return;
        onError(`SpeechSynthesis error: ${ev.error}`);
      };

      speechSynthesis.speak(utterance);
    }, 200),
  );

  return {
    requestId,
    cancel: () => {
      cancelled = true;
      timers.forEach((t) => window.clearTimeout(t));
      speechSynthesis.cancel();
    },
  };
}

export function get_mock_audio_status(): AudioModelStatus {
  return {
    downloaded: true,
    loading: false,
    ready: true,
    modelSizeBytes: null,
    error: null,
  };
}
