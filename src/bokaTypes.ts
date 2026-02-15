import type { RegisterId } from './registers';

export type Variant = {
  id: string;
  register: RegisterId;
  text: string;
  note?: string;
  difficulty?: number;
};

export type StoryTranslation = {
  language: string;
  createdAt: number;
  job: TranslationJob | null;
  doc: InteractiveDoc | null;
  errorMessage?: string | null;
};

export type Story = {
  id: string;
  title: string;
  category: string | null;
  createdAt: number;
  updatedAt: number;
  sourceText: string;
  sourceLanguage: string;
  translations: Record<string, StoryTranslation>;
};

export type Span = {
  id: string;
  sourceText: string;
  variants: Variant[];
  activeVariantIndex: number;
};

export type DocToken =
  | { type: 'text'; value: string }
  | { type: 'span'; spanId: string };

export type InteractiveDoc = {
  tokens: DocToken[];
  spans: Record<string, Span>;
};

export type SegmentStage = 'pending' | 'ready' | 'error';

export type TranslationSegment = {
  id: string;
  source: string;
  baseText?: string;
  baseStage: SegmentStage;
  spanStage: SegmentStage;
  variantCount: number;
};

export type TranslationJob = {
  id: string;
  segments: TranslationSegment[];
  ready: boolean;
};

export type LlmProviderPreset = 'anthropic' | 'openai' | 'openrouter' | 'ollama' | 'lmstudio' | 'custom';

export type LlmProviderConfig = {
  preset: LlmProviderPreset;
  apiKey?: string;
  baseUrl?: string;
  model?: string;
};

export type Script = {
  id: string;
  title: string;
  category: string | null;
  createdAt: number;
  job: TranslationJob | null;
  doc: InteractiveDoc;
};

// ── Audio types ──

export type AudioStage = 'loading_model' | 'generating' | 'encoding' | 'cached';

export type AudioProgressEvent = {
  requestId: string;
  stage: AudioStage;
  message: string;
};

export type AudioReadyEvent = {
  requestId: string;
  audioBase64: string;
  durationMs: number;
  sampleRate: number;
};

export type AudioErrorEvent = {
  requestId: string;
  message: string;
};

export type AudioModelStatus = {
  downloaded: boolean;
  loading: boolean;
  ready: boolean;
  modelSizeBytes: number | null;
  error: string | null;
};

export type VoiceInfo = {
  id: string;
  name: string;
  language: string;
  sampleRate: number;
};

export type AudioRequest = {
  text: string;
  language: string;
  voiceId?: string;
  speed?: number;
};
