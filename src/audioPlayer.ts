let audioContext: AudioContext | null = null;
let currentSource: AudioBufferSourceNode | null = null;

function getContext(): AudioContext {
  if (!audioContext) {
    audioContext = new AudioContext();
  }
  return audioContext;
}

export function ensureAudioContext(): void {
  getContext();
}

export async function playBase64Wav(base64: string, sampleRate?: number): Promise<void> {
  stop();

  const ctx = getContext();

  if (ctx.state === 'suspended') {
    await ctx.resume();
  }

  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  const audioBuffer = await ctx.decodeAudioData(bytes.buffer);

  const source = ctx.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(ctx.destination);

  currentSource = source;

  return new Promise<void>((resolve) => {
    source.onended = () => {
      if (currentSource === source) {
        currentSource = null;
      }
      resolve();
    };
    source.start(0);
  });
}

export function stop(): void {
  if (currentSource) {
    try {
      currentSource.stop();
    } catch {}
    currentSource = null;
  }
}

export function isPlaying(): boolean {
  return currentSource !== null;
}
